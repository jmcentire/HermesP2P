/**
 * Network Traffic Panel — shows simulated P2P traffic flowing through the mesh.
 *
 * Displays three types of traffic:
 * - Public channel messages for channels the user isn't in (readable plaintext)
 * - Private/encrypted channel messages (shows ciphertext blobs)
 * - Encrypted DMs between other parties (shows ciphertext blobs)
 *
 * Users can click public channel names to join them.
 */

const MAX_ENTRIES = 50;
const entries = [];
let panelBody = null;
let panelVisible = false;

/** Channels the bots post to that the user might not have */
const EXTRA_CHANNELS = ['Philosophy', 'CryptoNews', 'Random Thoughts'];

/** Generate a fake ciphertext blob (random base64-ish string) */
function fakeCiphertext(len = 40) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result + '=';
}

/** Generate a short random hex string for packet IDs */
function fakePacketId() {
    const hex = '0123456789abcdef';
    let id = '0x';
    for (let i = 0; i < 8; i++) id += hex.charAt(Math.floor(Math.random() * 16));
    return id;
}

/**
 * Initialize the network panel UI.
 * Call after DOM is ready.
 */
export function initializeNetworkPanel() {
    panelBody = document.getElementById('network-panel-body');
    const toggleBtn = document.getElementById('network-panel-toggle');

    if (!panelBody || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        panelVisible = !panelVisible;
        panelBody.style.display = panelVisible ? 'block' : 'none';
        toggleBtn.querySelector('.toggle-indicator').textContent = panelVisible ? '\u25BC' : '\u25B6';
    });
}

/**
 * Add a traffic entry to the network panel.
 * @param {'public'|'private'|'direct'} type - Message type
 * @param {string} channel - Channel name or DM label
 * @param {string|null} content - Plaintext content (null for encrypted)
 * @param {string} from - Sender pseudonym
 */
export function addTrafficEntry(type, channel, content, from) {
    if (!panelBody) return;

    const entry = document.createElement('div');
    entry.className = 'network-entry';

    const time = new Date().toLocaleTimeString();
    const packetId = fakePacketId();

    const metaSpan = document.createElement('span');
    metaSpan.className = 'network-meta';
    metaSpan.textContent = `${time} ${packetId}`;

    const typeSpan = document.createElement('span');
    typeSpan.className = `network-type network-type-${type}`;
    typeSpan.textContent = type === 'direct' ? 'DM' : type === 'private' ? 'ENC' : 'PUB';

    const channelSpan = document.createElement('span');
    channelSpan.className = 'network-channel';
    channelSpan.textContent = `#${channel}`;

    entry.appendChild(metaSpan);
    entry.appendChild(document.createTextNode(' '));
    entry.appendChild(typeSpan);
    entry.appendChild(document.createTextNode(' '));
    entry.appendChild(channelSpan);

    if (type === 'public' && content) {
        const arrow = document.createTextNode(' \u2192 ');
        const fromSpan = document.createElement('span');
        fromSpan.className = 'network-sender';
        fromSpan.textContent = from;

        const msgSpan = document.createElement('span');
        msgSpan.className = 'network-plaintext';
        msgSpan.textContent = `: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`;

        entry.appendChild(arrow);
        entry.appendChild(fromSpan);
        entry.appendChild(msgSpan);
    } else {
        const arrow = document.createTextNode(' \u2192 ');
        const cipherSpan = document.createElement('span');
        cipherSpan.className = 'network-ciphertext';
        cipherSpan.textContent = fakeCiphertext(48 + Math.floor(Math.random() * 32));

        entry.appendChild(arrow);
        entry.appendChild(cipherSpan);
    }

    entries.push(entry);

    // Trim old entries
    while (entries.length > MAX_ENTRIES) {
        const old = entries.shift();
        old.remove();
    }

    panelBody.appendChild(entry);
    panelBody.scrollTop = panelBody.scrollHeight;
}

/**
 * Generate phantom encrypted traffic (DMs and private channel messages
 * between unknown parties) to make the network feel alive.
 * @returns {function} cleanup — call to stop generating phantom traffic
 */
export function startPhantomTraffic() {
    const phantomNames = ['Anon_7kx', 'Peer_m3q', 'Node_9vb', 'Relay_4fp', 'Ghost_2jw', 'Shadow_8nc'];
    const phantomChannels = ['Private_Room', 'Encrypted_Hub', 'Secure_Chat'];

    function emitPhantom() {
        const isDM = Math.random() < 0.4;
        if (isDM) {
            const from = phantomNames[Math.floor(Math.random() * phantomNames.length)];
            const to = phantomNames[Math.floor(Math.random() * phantomNames.length)];
            addTrafficEntry('direct', `${from}\u2194${to}`, null, from);
        } else {
            const ch = phantomChannels[Math.floor(Math.random() * phantomChannels.length)];
            addTrafficEntry('private', ch, null, 'unknown');
        }
    }

    // Random intervals between 3-12 seconds
    let timer = null;
    function schedule() {
        const delay = 3000 + Math.random() * 9000;
        timer = setTimeout(() => {
            emitPhantom();
            schedule();
        }, delay);
    }
    schedule();

    return () => clearTimeout(timer);
}
