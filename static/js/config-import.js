// Local-only identity validation: never upload private key material.
export function validateLocalConfig(value, nacl, base64) {
    const fail = () => { throw new Error('Invalid identity file'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    const allowed = ['user', 'channels', 'friends', 'aliases'];
    if (Object.keys(value).some(key => !allowed.includes(key))) fail();
    const text = x => typeof x === 'string' && x.length >= 1 && x.length <= 128;
    const decode = (encoded, length) => {
        if (typeof encoded !== 'string') fail();
        const bytes = base64.toByteArray(encoded);
        if (bytes.length !== length || base64.fromByteArray(bytes) !== encoded) fail();
        return bytes;
    };
    if (!text(value.user?.name)) fail();
    const secret = decode(value.user.privKey, 64), pub = decode(value.user.pubKey, 32);
    const derived = nacl.sign.keyPair.fromSeed(secret.slice(0, 32));
    if (!nacl.verify(derived.publicKey, pub) || !nacl.verify(derived.secretKey, secret)) fail();
    const names = new Set();
    for (const field of ['channels', 'friends']) {
        if (!Array.isArray(value[field]) || value[field].length > 100) fail();
        for (const item of value[field]) {
            if (!text(item?.name) || names.has(item.name)) fail();
            names.add(item.name);
            if (field === 'channels' && item.key) decode(item.key, 32);
            if (field === 'friends') decode(item.pubKey, 32);
        }
    }
    if (value.aliases && (typeof value.aliases !== 'object' || Array.isArray(value.aliases) ||
        Object.entries(value.aliases).some(([key, name]) => !text(key) || !text(name)))) fail();
    // Copy only supported fields. Imported files cannot add bootstrap destinations.
    return {user:{name:value.user.name,pubKey:value.user.pubKey,privKey:value.user.privKey},
        channels:value.channels.map(c=>({name:c.name,...(c.key?{key:c.key}:{})})),
        friends:value.friends.map(f=>({name:f.name,pubKey:f.pubKey})),aliases:value.aliases||{}};
}
