/**
 * V2 privacy packaging contracts replace the old identity-bearing DM format.
 * Public names authenticate a channel-scoped signer. Private signer details
 * stay encrypted; private/direct signatures bind the fresh outer proof key.
 *
 * All upstream dependencies are mocked so we test only the packaging logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies BEFORE importing the module under test
vi.mock('../static/js/crypto.js', () => ({
  deriveChannelSigner: vi.fn(async (_identity, scope) => ({ pubKey: `scoped-public:${scope}`, privKey: `scoped-secret:${scope}` })),
  generateKeypair: vi.fn(() => ({ pubKey: 'one-message-proof-key', privKey: 'one-message-secret' })),
  verifySignature: vi.fn(() => true),
  signMessage: vi.fn(() => 'mock-signature-base64'),
  encryptChannelMessage: vi.fn(() => ['encrypted-channel-content', 'channel-nonce']),
  encryptDirectMessage: vi.fn(() => ['encrypted-dm-content', 'dm-nonce', 'ephemeral-pub']),
}));

vi.mock('../static/js/ttl.js', () => ({
  stampTTL: vi.fn((pkg, type) => {
    const ttls = { direct: 300, private: 3600, public: 86400 };
    pkg.ttl = ttls[type] || 86400;
    return pkg;
  }),
}));

vi.mock('../static/js/padding.js', () => ({
  padMessage: vi.fn((bytes) => bytes), // pass-through for inspection
}));

vi.mock('../static/js/network.js', () => ({
  broadcastMessage: vi.fn(),
}));

import { packageMessage } from '../static/js/messages.js';
import { deriveChannelSigner, generateKeypair, signMessage, encryptChannelMessage, encryptDirectMessage } from '../static/js/crypto.js';
import { stampTTL } from '../static/js/ttl.js';
import { padMessage } from '../static/js/padding.js';

/** Helper: extract the JSON package from padMessage's first call argument. */
function extractPackage() {
  const bytes = padMessage.mock.calls[0][0];
  return JSON.parse(new TextDecoder().decode(bytes));
}

const baseConfig = {
  user: {
    name: 'TestUser',
    pubKey: 'test-pub-key-base64',
    privKey: 'test-priv-key-base64-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
  channels: [
    { name: 'General' },
    { name: 'SecretRoom', key: 'channel-secret-key' },
  ],
  friends: [
    { name: 'Alice', pubKey: 'alice-pub-key' },
  ],
};

// ─── No identity keys in outer envelopes ────────────────────────────

describe('packageMessage — v2 outer-envelope privacy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes from.pubKey for private channel messages', async () => {
    await packageMessage('hello', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).not.toHaveProperty('pubKey');
  });

  it('removes from.pubKey for public channel messages', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).not.toHaveProperty('pubKey');
  });

  it('uses an ephemeral proof key instead of from.pubKey for direct messages', async () => {
    await packageMessage('hello', 'direct', 'Alice', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).toEqual({ name: 'Anonymous', proofKey: 'one-message-proof-key' });
    expect(JSON.stringify(pkg)).not.toContain(baseConfig.user.pubKey);
    expect(JSON.stringify(pkg)).not.toContain(baseConfig.user.name);
    expect(JSON.stringify(pkg)).not.toContain(baseConfig.friends[0].pubKey);
  });

  it('pubKey field is completely absent, not null or undefined', async () => {
    await packageMessage('test', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(Object.keys(pkg.from)).not.toContain('pubKey');
  });

  it('fails closed when pseudonym generation fails', async () => {
    deriveChannelSigner.mockRejectedValueOnce(new Error('Web Crypto unavailable'));
    await expect(packageMessage('test', 'public', 'General', baseConfig)).rejects.toThrow('Web Crypto unavailable');
    expect(signMessage).not.toHaveBeenCalled();
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('pubKey removal applies to public channels without encryption keys', async () => {
    await packageMessage('open msg', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).not.toHaveProperty('pubKey');
    expect(pkg.message).toBe('open msg'); // plaintext, not encrypted
  });

  it('pubKey removal applies to private channels with encryption keys', async () => {
    await packageMessage('secret msg', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).not.toHaveProperty('pubKey');
    // Message should be encrypted
    const msgContent = JSON.parse(pkg.message);
    expect(msgContent).toHaveProperty('encrypted');
    expect(msgContent).toHaveProperty('nonce');
  });
});

// ─── Authenticated channel pseudonyms ──────────────────────────────

describe('packageMessage — authenticated scoped signers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates pseudonym for private channel messages', async () => {
    await packageMessage('hello', 'private', 'SecretRoom', baseConfig);
    expect(deriveChannelSigner).toHaveBeenCalledWith(baseConfig.user.privKey, 'channel-secret-key', 'private');
  });

  it('generates pseudonym for public channel messages', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    expect(deriveChannelSigner).toHaveBeenCalledWith(baseConfig.user.privKey, 'General', 'public');
  });

  it('does NOT generate pseudonym for direct messages', async () => {
    await packageMessage('hello', 'direct', 'Alice', baseConfig);
    expect(deriveChannelSigner).not.toHaveBeenCalled();
  });

  it('conceals the private scoped signer inside the encrypted inner message', async () => {
    await packageMessage('hello', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).toEqual({ name: 'Anonymous', proofKey: 'one-message-proof-key' });
    const inner = JSON.parse(encryptChannelMessage.mock.calls[0][0]);
    expect(inner.sender).toBe('scoped-public:channel-secret-key');
    expect(JSON.stringify(pkg)).not.toContain(inner.sender);
  });

  it('uses pseudonym as from.name for public channels', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).toEqual({ name: 'scoped-public:General', proofKey: 'scoped-public:General' });
  });

  it('conceals the real username and recipient label in the DM envelope', async () => {
    await packageMessage('hello', 'direct', 'Alice', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from.name).toBe('Anonymous');
    expect(pkg.to).toBe('sealed');
    expect(JSON.stringify(pkg)).not.toContain('Alice');
  });

  it('does not reveal the real name on pseudonym failure', async () => {
    deriveChannelSigner.mockRejectedValueOnce(new Error('HKDF failed'));
    await expect(packageMessage('test', 'private', 'SecretRoom', baseConfig)).rejects.toThrow('HKDF failed');
    expect(encryptChannelMessage).not.toHaveBeenCalled();
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('passes channel name as channelId to deriveChannelSigner', async () => {
    const config = {
      ...baseConfig,
      channels: [{ name: 'TechTalk' }],
    };
    await packageMessage('test', 'public', 'TechTalk', config);
    expect(deriveChannelSigner).toHaveBeenCalledWith(baseConfig.user.privKey, 'TechTalk', 'public');
  });

  it('preserves the full scoped public key as the authenticated public name', async () => {
    const fullKey = 'scoped-public-key-more-than-sixteen-characters';
    deriveChannelSigner.mockResolvedValueOnce({ pubKey: fullKey, privKey: 'scoped-secret' });
    await packageMessage('test', 'public', 'General', baseConfig);
    expect(extractPackage().from).toEqual({ name: fullKey, proofKey: fullKey });
    expect(signMessage.mock.calls.at(-1)[1]).toBe('scoped-secret');
  });

  it('different channels get different pseudonyms via channelId argument', async () => {
    await packageMessage('a', 'public', 'ChannelA', {
      ...baseConfig,
      channels: [{ name: 'ChannelA' }, { name: 'ChannelB' }],
    });
    const firstCall = deriveChannelSigner.mock.calls[0];

    vi.clearAllMocks();

    await packageMessage('b', 'public', 'ChannelB', {
      ...baseConfig,
      channels: [{ name: 'ChannelA' }, { name: 'ChannelB' }],
    });
    const secondCall = deriveChannelSigner.mock.calls[0];

    expect(firstCall[1]).toBe('ChannelA');
    expect(secondCall[1]).toBe('ChannelB');
  });

  it('uses the same private pseudonym scope for a shared key under different local names', async () => {
    const config = { ...baseConfig, channels: [
      { name: 'LocalName', key: 'shared-key' }, { name: 'AnotherName', key: 'shared-key' },
    ] };
    await packageMessage('one', 'private', 'LocalName', config);
    await packageMessage('two', 'private', 'AnotherName', config);
    expect(deriveChannelSigner.mock.calls).toEqual([
      [baseConfig.user.privKey, 'shared-key', 'private'], [baseConfig.user.privKey, 'shared-key', 'private'],
    ]);
    const packages = padMessage.mock.calls.map(([bytes]) => JSON.parse(new TextDecoder().decode(bytes)));
    const senders = encryptChannelMessage.mock.calls.map(([plaintext]) => JSON.parse(plaintext).sender);
    expect(senders).toEqual(['scoped-public:shared-key', 'scoped-public:shared-key']);
    expect(packages.every(pkg => pkg.from.name === 'Anonymous')).toBe(true);
    expect(packages.every(pkg => pkg.to === 'sealed')).toBe(true);
  });

  it('changes private pseudonym scope when the key changes under the same local name', async () => {
    await packageMessage('one', 'private', 'SecretRoom', baseConfig);
    await packageMessage('two', 'private', 'SecretRoom', { ...baseConfig,
      channels: [{ name: 'SecretRoom', key: 'rotated-secret-key' }] });
    expect(deriveChannelSigner.mock.calls.map(call => call[1])).toEqual([
      'channel-secret-key', 'rotated-secret-key',
    ]);
  });
});

// ─── Message structure integrity ────────────────────────────────────

describe('packageMessage — message structure integrity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes all required fields for public channel message', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg).toHaveProperty('id');
    expect(pkg).toHaveProperty('version', 2);
    expect(pkg).toHaveProperty('type', 'public');
    expect(pkg).toHaveProperty('timestamp');
    expect(typeof pkg.timestamp).toBe('number');
    expect(pkg).toHaveProperty('to', 'General');
    expect(pkg).toHaveProperty('from');
    expect(pkg.from).toHaveProperty('name');
    expect(pkg).toHaveProperty('message', 'hello');
    expect(pkg).toHaveProperty('signature', 'mock-signature-base64');
    expect(pkg).toHaveProperty('ttl', 86400);
  });

  it('includes all required fields for private channel message', async () => {
    await packageMessage('secret', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(pkg).toHaveProperty('id');
    expect(pkg).toHaveProperty('type', 'private');
    expect(pkg).toHaveProperty('to', 'sealed');
    expect(JSON.stringify(pkg)).not.toContain('SecretRoom');
    expect(JSON.stringify(pkg)).not.toContain('channel-secret-key');
    expect(pkg).toHaveProperty('ttl', 3600);
    expect(pkg).toHaveProperty('signature');
    expect(pkg.from).toHaveProperty('name');
    expect(pkg.from).not.toHaveProperty('pubKey');
  });

  it('includes all required fields for DM', async () => {
    await packageMessage('hey', 'direct', 'Alice', baseConfig);
    const pkg = extractPackage();
    expect(pkg).toHaveProperty('id');
    expect(pkg).toHaveProperty('type', 'direct');
    expect(pkg).toHaveProperty('to', 'sealed');
    expect(pkg.from).toEqual({ name: 'Anonymous', proofKey: 'one-message-proof-key' });
    expect(pkg).toHaveProperty('signature');
    expect(pkg).toHaveProperty('ttl', 300);
  });

  it('still signs channel messages even without pubKey', async () => {
    await packageMessage('signed', 'public', 'General', baseConfig);
    const [payload, key] = signMessage.mock.calls[0];
    expect(JSON.parse(payload)[0]).toBe('hp2p:message:v2');
    expect(JSON.parse(payload).at(-1)).toBe('signed');
    expect(key).toBe('scoped-secret:General');
  });

  it.each(['public', 'private', 'direct'])('binds the whole %s envelope with the matching signing secret', async type => {
    const to = { public: 'General', private: 'SecretRoom', direct: 'Alice' }[type];
    await packageMessage('bound content', type, to, baseConfig);
    const pkg = extractPackage();
    const [payload, secret] = signMessage.mock.calls.at(-1);
    expect(JSON.parse(payload)).toEqual(['hp2p:message:v2', pkg.id, type,
      pkg.timestamp, pkg.ttl, pkg.to, pkg.from.name, null,
      type === 'public' ? 'scoped-public:General' : 'one-message-proof-key', pkg.message]);
    expect(secret).toBe(type === 'public' ? 'scoped-secret:General' : 'one-message-secret');
    expect(pkg.from).not.toHaveProperty('pubKey');
    if (type !== 'public') expect(generateKeypair).toHaveBeenCalledOnce();
  });

  it('uses fresh proof pairs for encrypted envelopes and binds them inside the signed plaintext', async () => {
    for (const index of [0, 1]) {
      generateKeypair.mockReturnValueOnce({ pubKey: `proof-${index}`, privKey: `proof-secret-${index}` });
    }
    await packageMessage('one', 'private', 'SecretRoom', baseConfig);
    await packageMessage('two', 'direct', 'Alice', baseConfig);
    const packages = padMessage.mock.calls.map(([bytes]) => JSON.parse(new TextDecoder().decode(bytes)));
    expect(packages.map(pkg => pkg.from.proofKey)).toEqual(['proof-0', 'proof-1']);
    expect(generateKeypair).toHaveBeenCalledTimes(2);
    expect(JSON.parse(encryptChannelMessage.mock.calls[0][0]).proofKey).toBe('proof-0');
    expect(JSON.parse(encryptDirectMessage.mock.calls[0][0]).proofKey).toBe('proof-1');
    for (const index of [0, 1]) {
      expect(signMessage.mock.calls.some(([payload, key]) =>
        JSON.parse(payload)[0] === 'hp2p:message:v2' && key === `proof-secret-${index}`)).toBe(true);
    }
  });

  it('signs private channel messages after encryption', async () => {
    await packageMessage('secret', 'private', 'SecretRoom', baseConfig);
    // signMessage should be called with the encrypted JSON string
    const signArg = signMessage.mock.calls.at(-1)[0];
    const parsed = JSON.parse(JSON.parse(signArg).at(-1));
    expect(parsed).toHaveProperty('encrypted');
    expect(parsed).toHaveProperty('nonce');
  });

  it('encrypts private channel messages with channel key', async () => {
    await packageMessage('secret', 'private', 'SecretRoom', baseConfig);
    const [sealed, key] = encryptChannelMessage.mock.calls[0];
    expect(JSON.parse(sealed).text).toBe('secret');
    expect(key).toBe('channel-secret-key');
  });

  it('signs private sender, outer proof key, ID, expiry and text inside encryption', async () => {
    await packageMessage('private content', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    const [plaintext, channelKey] = encryptChannelMessage.mock.calls[0];
    const inner = JSON.parse(plaintext);
    expect(inner).toEqual({ id: pkg.id, timestamp: pkg.timestamp, ttl: pkg.ttl,
      proofKey: pkg.from.proofKey, sender: 'scoped-public:channel-secret-key',
      text: 'private content', signature: 'mock-signature-base64' });
    expect(channelKey).toBe('channel-secret-key');
    expect(signMessage).toHaveBeenNthCalledWith(1,
      JSON.stringify(['hp2p:private:v2', pkg.id, pkg.timestamp, pkg.ttl,
        'scoped-public:channel-secret-key', pkg.from.proofKey, 'private content']),
      'scoped-secret:channel-secret-key');
    expect(signMessage.mock.invocationCallOrder[0]).toBeLessThan(encryptChannelMessage.mock.invocationCallOrder[0]);
    expect(encryptChannelMessage.mock.invocationCallOrder[0]).toBeLessThan(signMessage.mock.invocationCallOrder[1]);
    expect(pkg.from).toEqual({ name: 'Anonymous', proofKey: 'one-message-proof-key' });
    for (const hidden of ['scoped-public:channel-secret-key', 'private content',
      baseConfig.user.pubKey, baseConfig.user.name, 'SecretRoom']) {
      expect(JSON.stringify(pkg)).not.toContain(hidden);
    }
  });

  it('does not encrypt public channel messages', async () => {
    await packageMessage('open', 'public', 'General', baseConfig);
    expect(encryptChannelMessage).not.toHaveBeenCalled();
    expect(encryptDirectMessage).not.toHaveBeenCalled();
    const pkg = extractPackage();
    expect(pkg.message).toBe('open'); // plaintext
  });

  it('encrypts the signed sender/recipient-bound inner DM with the friend public key', async () => {
    await packageMessage('dm', 'direct', 'Alice', baseConfig);
    const pkg = extractPackage();
    const [plaintext, recipientKey] = encryptDirectMessage.mock.calls[0];
    const inner = JSON.parse(plaintext);
    expect(recipientKey).toBe('alice-pub-key');
    expect(inner).toEqual({ id: pkg.id, timestamp: pkg.timestamp, ttl: pkg.ttl,
      sender: baseConfig.user.pubKey, recipient: 'alice-pub-key', proofKey: 'one-message-proof-key', text: 'dm',
      signature: 'mock-signature-base64' });
    expect(signMessage).toHaveBeenNthCalledWith(1,
      JSON.stringify(['hp2p:direct:v2', pkg.id, pkg.timestamp, pkg.ttl,
        baseConfig.user.pubKey, 'alice-pub-key', 'one-message-proof-key', 'dm']), baseConfig.user.privKey);
    expect(signMessage.mock.invocationCallOrder[0]).toBeLessThan(encryptDirectMessage.mock.invocationCallOrder[0]);
    expect(encryptDirectMessage.mock.invocationCallOrder[0]).toBeLessThan(signMessage.mock.invocationCallOrder[1]);
    expect(JSON.parse(pkg.message)).toEqual({ encrypted: 'encrypted-dm-content',
      nonce: 'dm-nonce', ephemeralPubKey: 'ephemeral-pub' });
  });

  it('stamps TTL based on message type', async () => {
    await packageMessage('a', 'direct', 'Alice', baseConfig);
    expect(stampTTL).toHaveBeenCalledWith(expect.any(Object), 'direct');

    vi.clearAllMocks();
    await packageMessage('b', 'private', 'SecretRoom', baseConfig);
    expect(stampTTL).toHaveBeenCalledWith(expect.any(Object), 'private');

    vi.clearAllMocks();
    await packageMessage('c', 'public', 'General', baseConfig);
    expect(stampTTL).toHaveBeenCalledWith(expect.any(Object), 'public');
  });

  it('generates unique message IDs', async () => {
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      vi.clearAllMocks();
      await packageMessage('test', 'public', 'General', baseConfig);
      const pkg = extractPackage();
      ids.add(pkg.id);
    }
    expect(ids.size).toBe(20);
  });

  it('message IDs start with msg_ prefix', async () => {
    await packageMessage('test', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.id).toMatch(/^msg_/);
  });

  it('throws for null configuration', async () => {
    await expect(packageMessage('test', 'public', 'General', null)).rejects.toThrow();
  });

  it('throws for configuration without user', async () => {
    await expect(packageMessage('test', 'public', 'General', {})).rejects.toThrow();
  });

  it('pads serialized JSON via padMessage', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    expect(padMessage).toHaveBeenCalledTimes(1);
    const arg = padMessage.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Uint8Array);
    // Should be valid JSON
    const json = new TextDecoder().decode(arg);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('timestamp is close to Date.now()', async () => {
    const before = Date.now();
    await packageMessage('test', 'public', 'General', baseConfig);
    const after = Date.now();
    const pkg = extractPackage();
    expect(pkg.timestamp).toBeGreaterThanOrEqual(before);
    expect(pkg.timestamp).toBeLessThanOrEqual(after);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('packageMessage — edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a private channel without its key', async () => {
    const config = { ...baseConfig, channels: [{ name: 'NoKeyChannel' }] };
    await expect(packageMessage('secret', 'private', 'NoKeyChannel', config)).rejects.toThrow('key required');
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('rejects an unknown direct recipient instead of leaking plaintext', async () => {
    await expect(packageMessage('secret', 'direct', 'UnknownPerson', baseConfig)).rejects.toThrow('recipient key');
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('rejects a named friend without a public key before signing or encrypting', async () => {
    await expect(packageMessage('secret', 'direct', 'Alice', {
      ...baseConfig, friends: [{ name: 'Alice' }],
    })).rejects.toThrow('recipient key');
    expect(signMessage).not.toHaveBeenCalled();
    expect(encryptDirectMessage).not.toHaveBeenCalled();
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('rejects an unknown private channel before encrypting or padding', async () => {
    await expect(packageMessage('secret', 'private', 'MissingChannel', baseConfig)).rejects.toThrow('key required');
    expect(encryptChannelMessage).not.toHaveBeenCalled();
    expect(padMessage).not.toHaveBeenCalled();
  });

  it.each(['public', 'private'])('rejects failed %s envelope signatures', async type => {
    if (type === 'private') signMessage.mockReturnValueOnce('inner-signature');
    signMessage.mockReturnValueOnce(null);
    await expect(packageMessage('secret', type, type === 'public' ? 'General' : 'SecretRoom', baseConfig))
      .rejects.toThrow('signing failed');
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('rejects a failed inner direct signature before encryption', async () => {
    signMessage.mockReturnValueOnce(null);
    await expect(packageMessage('secret', 'direct', 'Alice', baseConfig)).rejects.toThrow('signing failed');
    expect(encryptDirectMessage).not.toHaveBeenCalled();
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('rejects a failed scoped private signature before encryption', async () => {
    signMessage.mockReturnValueOnce(null);
    await expect(packageMessage('secret', 'private', 'SecretRoom', baseConfig)).rejects.toThrow('signing failed');
    expect(encryptChannelMessage).not.toHaveBeenCalled();
    expect(signMessage).toHaveBeenCalledOnce();
    expect(signMessage.mock.calls[0][1]).toBe('scoped-secret:channel-secret-key');
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('rejects a failed direct envelope signature after inner signing', async () => {
    signMessage.mockReturnValueOnce('inner-signature').mockReturnValueOnce(null);
    await expect(packageMessage('secret', 'direct', 'Alice', baseConfig)).rejects.toThrow('signing failed');
    expect(encryptDirectMessage).toHaveBeenCalledOnce();
    expect(padMessage).not.toHaveBeenCalled();
  });

  it('does not pad or expose plaintext when encryption throws', async () => {
    encryptDirectMessage.mockImplementationOnce(() => { throw new Error('Encryption failed'); });
    await expect(packageMessage('secret', 'direct', 'Alice', baseConfig)).rejects.toThrow('Encryption failed');
    expect(padMessage).not.toHaveBeenCalled();
    expect(signMessage).toHaveBeenCalledOnce();
  });

  it.each([['unsupported', 'hello'], ['public', null], ['private', {}]])(
    'rejects invalid type/content %s before constructing a proof', async (type, content) => {
      await expect(packageMessage(content, type, 'General', baseConfig)).rejects.toThrow('Invalid message configuration');
      expect(generateKeypair).not.toHaveBeenCalled();
      expect(padMessage).not.toHaveBeenCalled();
    });

  it('handles empty message string', async () => {
    await packageMessage('', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.message).toBe('');
  });

  it('handles long message content', async () => {
    const longMsg = 'x'.repeat(10000);
    await packageMessage(longMsg, 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.message).toBe(longMsg);
  });
});
