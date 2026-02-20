/**
 * Tests for messages.js gap fixes:
 *   Gap 1: from.pubKey removed from channel messages (both public and private)
 *   Gap 2: Pseudonyms generated for all channel types (not just private)
 *
 * All upstream dependencies are mocked so we test only the packaging logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies BEFORE importing the module under test
vi.mock('../static/js/crypto.js', () => ({
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

vi.mock('../static/js/pseudonyms.js', () => ({
  generatePseudonym: vi.fn(async () => 'bW9jay1wc2V1ZG9ueW0tYmFzZTY0'),
  shortenPseudonym: vi.fn((str, len) => str.substring(0, len)),
}));

vi.mock('../static/js/network.js', () => ({
  broadcastMessage: vi.fn(),
}));

import { packageMessage } from '../static/js/messages.js';
import { signMessage, encryptChannelMessage, encryptDirectMessage } from '../static/js/crypto.js';
import { stampTTL } from '../static/js/ttl.js';
import { padMessage } from '../static/js/padding.js';
import { generatePseudonym, shortenPseudonym } from '../static/js/pseudonyms.js';

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

// ─── Gap 1: pubKey removal ──────────────────────────────────────────

describe('packageMessage — Gap 1: pubKey removal for channel messages', () => {
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

  it('keeps from.pubKey for direct messages', async () => {
    await packageMessage('hello', 'direct', 'Alice', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).toHaveProperty('pubKey', 'test-pub-key-base64');
  });

  it('pubKey field is completely absent, not null or undefined', async () => {
    await packageMessage('test', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(Object.keys(pkg.from)).not.toContain('pubKey');
  });

  it('pubKey removal is unconditional even when pseudonym fails', async () => {
    generatePseudonym.mockRejectedValueOnce(new Error('Web Crypto unavailable'));
    await packageMessage('test', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from).not.toHaveProperty('pubKey');
    // Falls back to real username
    expect(pkg.from.name).toBe('TestUser');
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

// ─── Gap 2: pseudonyms for all channel types ────────────────────────

describe('packageMessage — Gap 2: pseudonyms for all channel types', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates pseudonym for private channel messages', async () => {
    await packageMessage('hello', 'private', 'SecretRoom', baseConfig);
    expect(generatePseudonym).toHaveBeenCalledWith(baseConfig.user.privKey, 'SecretRoom');
    expect(shortenPseudonym).toHaveBeenCalled();
  });

  it('generates pseudonym for public channel messages', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    expect(generatePseudonym).toHaveBeenCalledWith(baseConfig.user.privKey, 'General');
    expect(shortenPseudonym).toHaveBeenCalled();
  });

  it('does NOT generate pseudonym for direct messages', async () => {
    await packageMessage('hello', 'direct', 'Alice', baseConfig);
    expect(generatePseudonym).not.toHaveBeenCalled();
    expect(shortenPseudonym).not.toHaveBeenCalled();
  });

  it('uses pseudonym as from.name for private channels', async () => {
    await packageMessage('hello', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from.name).toBe('bW9jay1wc2V1ZG9u'); // first 16 chars
  });

  it('uses pseudonym as from.name for public channels', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from.name).toBe('bW9jay1wc2V1ZG9u'); // first 16 chars
  });

  it('uses real username for DMs', async () => {
    await packageMessage('hello', 'direct', 'Alice', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from.name).toBe('TestUser');
  });

  it('falls back to real name when pseudonym generation fails', async () => {
    generatePseudonym.mockRejectedValueOnce(new Error('HKDF failed'));
    await packageMessage('test', 'private', 'SecretRoom', baseConfig);
    const pkg = extractPackage();
    expect(pkg.from.name).toBe('TestUser');
  });

  it('passes channel name as channelId to generatePseudonym', async () => {
    const config = {
      ...baseConfig,
      channels: [{ name: 'TechTalk' }],
    };
    await packageMessage('test', 'public', 'TechTalk', config);
    expect(generatePseudonym).toHaveBeenCalledWith(baseConfig.user.privKey, 'TechTalk');
  });

  it('calls shortenPseudonym with length 16', async () => {
    await packageMessage('test', 'public', 'General', baseConfig);
    expect(shortenPseudonym).toHaveBeenCalledWith('bW9jay1wc2V1ZG9ueW0tYmFzZTY0', 16);
  });

  it('different channels get different pseudonyms via channelId argument', async () => {
    await packageMessage('a', 'public', 'ChannelA', {
      ...baseConfig,
      channels: [{ name: 'ChannelA' }, { name: 'ChannelB' }],
    });
    const firstCall = generatePseudonym.mock.calls[0];

    vi.clearAllMocks();

    await packageMessage('b', 'public', 'ChannelB', {
      ...baseConfig,
      channels: [{ name: 'ChannelA' }, { name: 'ChannelB' }],
    });
    const secondCall = generatePseudonym.mock.calls[0];

    expect(firstCall[1]).toBe('ChannelA');
    expect(secondCall[1]).toBe('ChannelB');
  });
});

// ─── Message structure integrity ────────────────────────────────────

describe('packageMessage — message structure integrity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes all required fields for public channel message', async () => {
    await packageMessage('hello', 'public', 'General', baseConfig);
    const pkg = extractPackage();
    expect(pkg).toHaveProperty('id');
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
    expect(pkg).toHaveProperty('to', 'SecretRoom');
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
    expect(pkg).toHaveProperty('to', 'Alice');
    expect(pkg.from).toHaveProperty('name', 'TestUser');
    expect(pkg.from).toHaveProperty('pubKey', 'test-pub-key-base64');
    expect(pkg).toHaveProperty('signature');
    expect(pkg).toHaveProperty('ttl', 300);
  });

  it('still signs channel messages even without pubKey', async () => {
    await packageMessage('signed', 'public', 'General', baseConfig);
    expect(signMessage).toHaveBeenCalledWith('signed', baseConfig.user.privKey);
  });

  it('signs private channel messages after encryption', async () => {
    await packageMessage('secret', 'private', 'SecretRoom', baseConfig);
    // signMessage should be called with the encrypted JSON string
    const signArg = signMessage.mock.calls[0][0];
    const parsed = JSON.parse(signArg);
    expect(parsed).toHaveProperty('encrypted');
    expect(parsed).toHaveProperty('nonce');
  });

  it('encrypts private channel messages with channel key', async () => {
    await packageMessage('secret', 'private', 'SecretRoom', baseConfig);
    expect(encryptChannelMessage).toHaveBeenCalledWith('secret', 'channel-secret-key');
  });

  it('does not encrypt public channel messages', async () => {
    await packageMessage('open', 'public', 'General', baseConfig);
    expect(encryptChannelMessage).not.toHaveBeenCalled();
    expect(encryptDirectMessage).not.toHaveBeenCalled();
    const pkg = extractPackage();
    expect(pkg.message).toBe('open'); // plaintext
  });

  it('encrypts DMs with friend pubKey', async () => {
    await packageMessage('dm', 'direct', 'Alice', baseConfig);
    expect(encryptDirectMessage).toHaveBeenCalledWith('dm', 'alice-pub-key');
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

  it('handles private channel without key (no encryption)', async () => {
    const config = {
      ...baseConfig,
      channels: [{ name: 'NoKeyChannel' }],
    };
    await packageMessage('plain', 'private', 'NoKeyChannel', config);
    expect(encryptChannelMessage).not.toHaveBeenCalled();
    const pkg = extractPackage();
    expect(pkg.message).toBe('plain');
    expect(pkg.from).not.toHaveProperty('pubKey');
  });

  it('handles DM to unknown friend (no encryption)', async () => {
    await packageMessage('hey', 'direct', 'UnknownPerson', baseConfig);
    expect(encryptDirectMessage).not.toHaveBeenCalled();
    const pkg = extractPackage();
    expect(pkg.message).toBe('hey');
    expect(pkg.from).toHaveProperty('pubKey'); // DMs keep pubKey
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
