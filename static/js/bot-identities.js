/**
 * Bot Identities — hardcoded demo keypairs (intentionally public).
 * These are demo entities, not real users. Zero imports.
 */

export const BOT_IDENTITIES = {
    hermes: {
        name: 'Hermes Guide',
        pubKey: '4t9pZ8YscGKTNq8au1UvEwCUzdZlZPw/h5V2WqYdNMY=',
        privKey: 'gSMUX4BRr0EYVvCjCVv/P8n4jcznh/cykU4HU6AAx63i32lnxixwYpM2rxq7VS8TAJTN1mVk/D+HlXZaph00xg==',
        respondsToDMs: true,
        channels: ['General', 'TechTalk'],
    },
    oracle: {
        name: 'Oracle Quotes',
        pubKey: 'w7r4lWBaU4VMvecd48gDhrmuIY+3uiXjZkhLdgb4qd4=',
        privKey: 'BAfIK73dbppCZGooVJYemrRWSWpenUn7PmkE0iTOI5jDuviVYFpThUy95x3jyAOGua4hj7e6JeNmSEt2Bvip3g==',
        respondsToDMs: false,
        channels: ['General'],
    },
    cipher: {
        name: 'Cipher Security',
        pubKey: 'KsSf8Bp0SO3VmwhSCus3Khq27dREPSGMdAOEy9vZW6o=',
        privKey: 'JS6R/XiYufphE9bch39QEA1+RlWK8TuCe3W4bxPNC6cqxJ/wGnRI7dWbCFIK6zcqGrbt1EQ9IYx0A4TL29lbqg==',
        respondsToDMs: false,
        channels: ['TechTalk'],
    },
    echo: {
        name: 'Echo Starter',
        pubKey: 'JsNLxcujgLSXhRnyB/g10zIQWGbpvMTcFhMIEsfnYQ0=',
        privKey: 'jldKUGKDpUkOXptW27ETDYNupJ41Zy90+I0uvsktTfAmw0vFy6OAtJeFGfIH+DXTMhBYZum8xNwWEwgSx+dhDQ==',
        respondsToDMs: false,
        channels: ['General'],
    },
};

/** For config injection — just name + pubKey pairs */
export const BOT_PUBLIC_KEYS = Object.values(BOT_IDENTITIES).map(bot => ({
    name: bot.name,
    pubKey: bot.pubKey,
}));
