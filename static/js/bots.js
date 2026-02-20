/**
 * Demo Bots — simulated users that post canned messages on timers.
 *
 * Bots inject messages directly into the UI via injectBotMessage() — no
 * WebSocket needed. They also push all traffic through the network panel
 * so users can see the mesh activity.
 *
 * Hermes responds to DMs with canned replies. Other bots ignore DMs.
 */

import { BOT_IDENTITIES } from './bot-identities.js';
import { injectBotMessage } from './messages.js';
import { generatePseudonym, shortenPseudonym } from './pseudonyms.js';
import { addTrafficEntry } from './network-panel.js';

// ── Content pools ──────────────────────────────────────────────────

const CONTENT = {
    hermes: {
        General: [
            'Welcome to HermesP2P! Every message here is signed and relayed peer-to-peer.',
            'Tip: Your pseudonym changes per channel, so nobody can link your identities across rooms.',
            'Try sending a direct message — click a friend in the sidebar to start a private conversation.',
            'All messages have a TTL. Public ones last 24 hours, DMs only 5 minutes. Nothing persists forever.',
            'HermesP2P uses no central server for messages. Peers relay everything directly.',
            'Your config file IS your identity. Keep it safe — lose it and your keys are gone.',
        ],
        TechTalk: [
            'Under the hood: messages are padded to fixed frame sizes (1KB, 4KB, 16KB, 64KB) to prevent size analysis.',
            'We use Ed25519 for signing and X25519 + XSalsa20-Poly1305 for DM encryption.',
            'Pseudonyms are derived via HKDF: your private key + channel name = deterministic but unlinkable identity.',
            'The peer discovery protocol exchanges known-peer lists to maintain mesh connectivity.',
            'TTL-based rebroadcast probability decays linearly — older messages are less likely to be relayed.',
            'Channel encryption uses NaCl secretbox (XSalsa20-Poly1305) with a shared symmetric key.',
        ],
    },
    oracle: {
        General: [
            '"Privacy is not about having something to hide. It is about having something to protect."',
            '"The right to be let alone is the most comprehensive of rights." — Louis Brandeis',
            '"Arguing that you don\'t care about privacy because you have nothing to hide is like arguing you don\'t care about free speech because you have nothing to say."',
            '"In the digital age, privacy is not a luxury — it is the oxygen of democracy."',
            '"Encryption works. It is one of the few things we can rely on." — Edward Snowden',
            '"The question isn\'t who\'s going to let me; it\'s who\'s going to stop me."',
            '"A society that trades liberty for security deserves neither and loses both."',
        ],
    },
    cipher: {
        TechTalk: [
            'Fun fact: NaCl (the crypto library) stands for "Networking and Cryptography library" by djb.',
            'Ed25519 signatures are 64 bytes and can be verified in ~70 microseconds on modern hardware.',
            'XSalsa20 uses a 24-byte nonce, making random nonce collisions astronomically unlikely.',
            'Curve25519 was designed to be fast and resistant to timing side-channel attacks.',
            'HKDF (HMAC-based Key Derivation Function) is defined in RFC 5869. We use it for pseudonym generation.',
            'Perfect forward secrecy: each DM uses an ephemeral keypair. Compromise one, and only one message leaks.',
            'Base64 encoding expands data by ~33%. A 32-byte key becomes 44 characters.',
        ],
    },
    echo: {
        General: [
            'Has anyone tried running HermesP2P on a local network? Curious about latency.',
            'What channels do people want to see here? I think we need a Music channel.',
            'The peer count in the top right shows how many nodes you\'re connected to.',
            'I love that there\'s no signup, no email, no phone number. Just generate keys and go.',
            'Question for the room: what\'s your favorite encryption algorithm and why?',
            'Anyone else think it\'s wild that your identity is just a keypair? Pure math.',
        ],
    },
};

const HERMES_DM_REPLIES = [
    'Hey! I\'m Hermes, the demo bot. I\'m here to show you how DMs work in HermesP2P.',
    'DMs are end-to-end encrypted using X25519 key exchange. Only you and I can read these.',
    'Try messaging one of the other bots — Oracle, Cipher, or Echo. They won\'t reply, because P2P requires both parties to be online!',
    'Your messages aren\'t stored on any server. Once the TTL expires (5 minutes for DMs), they\'re gone from the network.',
    'Fun fact: each DM generates a fresh ephemeral keypair, so even if one message is compromised, the others remain safe.',
    'You can add anyone as a friend by pasting their public key. No friend requests, no approval needed — just crypto.',
    'Remember to save your config before leaving! It\'s the only way to preserve your identity and friend list.',
    'Want to create a private channel? Add a channel with a key, then share that key with friends out-of-band.',
];

/** Messages that bots post to channels the user probably doesn't have */
const EXTRA_CHANNEL_CONTENT = {
    Philosophy: [
        'Is consciousness computable? Discuss.',
        'The ship of Theseus, but for code: if you refactor every line, is it the same program?',
        'Free will in a deterministic universe: the eternal debate.',
    ],
    CryptoNews: [
        'New side-channel attack on RSA published. Ed25519 unaffected.',
        'Post-quantum lattice-based cryptography is progressing faster than expected.',
        'Reminder: SHA-1 has been broken for collisions since 2017. Always use SHA-256+.',
    ],
    'Random Thoughts': [
        'If a tree falls in a P2P network and no peer is connected, does it make a packet?',
        'I wonder how many messages are floating through the mesh right now.',
        'The internet was supposed to be decentralized. We\'re just bringing it back.',
    ],
};

// ── Bot scheduling ─────────────────────────────────────────────────

const BOT_SCHEDULES = {
    hermes:  { initialDelay: 5000,  minInterval: 45000,  maxInterval: 90000  },
    oracle:  { initialDelay: 15000, minInterval: 60000,  maxInterval: 120000 },
    cipher:  { initialDelay: 25000, minInterval: 50000,  maxInterval: 100000 },
    echo:    { initialDelay: 35000, minInterval: 70000,  maxInterval: 140000 },
};

// ── Bot engine ─────────────────────────────────────────────────────

const messageIndexes = {}; // { "hermes:General": 0, ... }

function getNextMessage(botKey, channel) {
    const key = `${botKey}:${channel}`;
    if (messageIndexes[key] === undefined) messageIndexes[key] = 0;

    const pool = CONTENT[botKey]?.[channel];
    if (!pool || pool.length === 0) return null;

    const msg = pool[messageIndexes[key] % pool.length];
    messageIndexes[key]++;
    return msg;
}

/**
 * Start all demo bots. Returns a cleanup function.
 * @param {object} userConfig - The user's configuration object
 */
export function initializeBots(userConfig) {
    const timers = [];
    const userChannels = new Set(userConfig.channels.map(c => c.name));

    // Start each bot's channel posting loop
    for (const [botKey, bot] of Object.entries(BOT_IDENTITIES)) {
        const schedule = BOT_SCHEDULES[botKey];
        if (!schedule) continue;

        const botChannels = bot.channels || [];

        // Initial delay, then recurring
        const initialTimer = setTimeout(async () => {
            await postBotMessage(botKey, bot, botChannels, userChannels);
            startRecurring(botKey, bot, botChannels, userChannels, schedule, timers);
        }, schedule.initialDelay);

        timers.push(initialTimer);
    }

    // Start extra-channel traffic (channels user doesn't have)
    const extraTimer = startExtraChannelTraffic(timers);
    timers.push(extraTimer);

    // DM listener for Hermes
    const dmHandler = (e) => {
        const { to, type } = e.detail;
        if (type !== 'direct') return;
        if (to !== BOT_IDENTITIES.hermes.name) return;

        const delay = 1500 + Math.random() * 2000;
        const replyTimer = setTimeout(() => {
            const reply = HERMES_DM_REPLIES[Math.floor(Math.random() * HERMES_DM_REPLIES.length)];
            injectBotMessage(BOT_IDENTITIES.hermes.name, BOT_IDENTITIES.hermes.name, reply, 'direct');
            addTrafficEntry('direct', `Hermes\u2194You`, null, 'Hermes');
        }, delay);
        timers.push(replyTimer);
    };

    window.addEventListener('hermesBotCheck', dmHandler);

    // Cleanup function
    return () => {
        timers.forEach(t => clearTimeout(t));
        window.removeEventListener('hermesBotCheck', dmHandler);
    };
}

function startRecurring(botKey, bot, botChannels, userChannels, schedule, timers) {
    function scheduleNext() {
        const delay = schedule.minInterval + Math.random() * (schedule.maxInterval - schedule.minInterval);
        const timer = setTimeout(async () => {
            await postBotMessage(botKey, bot, botChannels, userChannels);
            scheduleNext();
        }, delay);
        timers.push(timer);
    }
    scheduleNext();
}

async function postBotMessage(botKey, bot, botChannels, userChannels) {
    // Pick a random channel from this bot's list
    const channel = botChannels[Math.floor(Math.random() * botChannels.length)];
    const content = getNextMessage(botKey, channel);
    if (!content) return;

    // Generate pseudonym for this bot in this channel
    let senderName = bot.name;
    try {
        const pseudonym = await generatePseudonym(bot.privKey, channel);
        senderName = shortenPseudonym(pseudonym, 16);
    } catch {
        // Fall back to bot name
    }

    // If user is in this channel, inject into message history
    if (userChannels.has(channel)) {
        injectBotMessage(channel, senderName, content, 'public');
    }

    // Always show in network panel
    addTrafficEntry('public', channel, content, senderName);
}

function startExtraChannelTraffic(timers) {
    const channels = Object.keys(EXTRA_CHANNEL_CONTENT);
    const indexes = {};

    function post() {
        const ch = channels[Math.floor(Math.random() * channels.length)];
        if (!indexes[ch]) indexes[ch] = 0;
        const pool = EXTRA_CHANNEL_CONTENT[ch];
        const msg = pool[indexes[ch] % pool.length];
        indexes[ch]++;

        // These channels the user doesn't have — show as readable in network panel
        addTrafficEntry('public', ch, msg, 'Anon_' + Math.random().toString(36).slice(2, 5));

        const delay = 20000 + Math.random() * 40000;
        const timer = setTimeout(post, delay);
        timers.push(timer);
    }

    const initial = setTimeout(post, 8000 + Math.random() * 12000);
    return initial;
}
