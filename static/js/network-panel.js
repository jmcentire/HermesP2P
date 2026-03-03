/**
 * Network Traffic Panel — live feed of P2P traffic flowing through the mesh.
 *
 * Displays real messages as they are sent and received:
 * - Public channel messages (readable plaintext)
 * - Private/encrypted channel messages (shows ciphertext)
 * - Encrypted DMs (shows ciphertext)
 *
 * Users can click the pencil icon next to sender names to set a preferred alias.
 */

const MAX_ENTRIES = 50;
const entries = [];
let panelBody = null;
let panelVisible = false;
let getConfigCallback = null;
let saveAliasCallback = null;

/**
 * Initialize the network panel UI.
 * @param {function} configGetter - Returns current configuration
 * @param {function} aliasSaver - Saves an alias: (pseudonym, displayName) => void
 */
export function initializeNetworkPanel(configGetter, aliasSaver) {
    panelBody = document.getElementById('network-panel-body');
    const toggleBtn = document.getElementById('network-panel-toggle');
    getConfigCallback = configGetter || null;
    saveAliasCallback = aliasSaver || null;

    if (!panelBody || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        panelVisible = !panelVisible;
        panelBody.style.display = panelVisible ? 'block' : 'none';
        toggleBtn.querySelector('.toggle-indicator').textContent = panelVisible ? '\u25BC' : '\u25B6';
    });
}

/** Resolve a pseudonym to its alias if one exists. */
function resolveAlias(name) {
    if (!getConfigCallback || !name) return name;
    const config = getConfigCallback();
    return config?.aliases?.[name] || name;
}

/** Create a clickable pencil icon for setting an alias. */
function createAliasButton(pseudonym) {
    const btn = document.createElement('span');
    btn.className = 'network-alias-btn';
    btn.textContent = ' \u270E';
    btn.title = `Set alias for ${pseudonym}`;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = resolveAlias(pseudonym);
        const input = prompt(`Set display name for "${pseudonym}":`, current !== pseudonym ? current : '');
        if (input !== null && saveAliasCallback) {
            saveAliasCallback(pseudonym, input.trim());
        }
    });
    return btn;
}

/**
 * Add a traffic entry to the network panel.
 * @param {'public'|'private'|'direct'} type - Message type
 * @param {string} channel - Channel name or DM peer name
 * @param {string|null} content - Message content (plaintext for public, encrypted blob for others, null if unavailable)
 * @param {string} from - Sender name/pseudonym
 * @param {'in'|'out'} [direction='in'] - Traffic direction
 */
export function addTrafficEntry(type, channel, content, from, direction = 'in') {
    if (!panelBody) return;

    const entry = document.createElement('div');
    entry.className = 'network-entry';

    const time = new Date().toLocaleTimeString();

    // Direction arrow
    const dirSpan = document.createElement('span');
    dirSpan.className = `network-dir network-dir-${direction}`;
    dirSpan.textContent = direction === 'out' ? '\u2191' : '\u2193';
    dirSpan.title = direction === 'out' ? 'Outgoing' : 'Incoming';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'network-meta';
    metaSpan.textContent = time;

    const typeSpan = document.createElement('span');
    typeSpan.className = `network-type network-type-${type}`;
    typeSpan.textContent = type === 'direct' ? 'DM' : type === 'private' ? 'ENC' : 'PUB';

    entry.appendChild(dirSpan);
    entry.appendChild(document.createTextNode(' '));
    entry.appendChild(metaSpan);
    entry.appendChild(document.createTextNode(' '));
    entry.appendChild(typeSpan);
    entry.appendChild(document.createTextNode(' '));

    if (type === 'direct') {
        // DMs: show @peerName
        const peerName = direction === 'out' ? channel : from;
        const displayPeer = resolveAlias(peerName);
        const channelSpan = document.createElement('span');
        channelSpan.className = 'network-channel';
        channelSpan.textContent = `@${displayPeer}`;
        entry.appendChild(channelSpan);

        if (direction === 'in' && saveAliasCallback) {
            entry.appendChild(createAliasButton(peerName));
        }

        const arrow = document.createTextNode(' \u2192 ');
        entry.appendChild(arrow);

        const cipherSpan = document.createElement('span');
        cipherSpan.className = 'network-ciphertext';
        if (content) {
            cipherSpan.textContent = content.length > 60 ? content.substring(0, 60) + '\u2026' : content;
        } else {
            cipherSpan.textContent = '[encrypted]';
        }
        entry.appendChild(cipherSpan);
    } else {
        // Channel messages: show #channelName
        const channelSpan = document.createElement('span');
        channelSpan.className = 'network-channel';
        channelSpan.textContent = `#${channel}`;
        entry.appendChild(channelSpan);

        if (type === 'public' && content) {
            const arrow = document.createTextNode(' \u2192 ');
            const displayFrom = resolveAlias(from);

            const fromSpan = document.createElement('span');
            fromSpan.className = 'network-sender';
            fromSpan.textContent = displayFrom;

            entry.appendChild(arrow);
            entry.appendChild(fromSpan);

            if (direction === 'in' && saveAliasCallback) {
                entry.appendChild(createAliasButton(from));
            }

            const msgSpan = document.createElement('span');
            msgSpan.className = 'network-plaintext';
            const truncated = content.length > 80 ? content.substring(0, 80) + '\u2026' : content;
            msgSpan.textContent = `: ${truncated}`;
            entry.appendChild(msgSpan);
        } else {
            // Encrypted channel message
            const arrow = document.createTextNode(' \u2192 ');
            entry.appendChild(arrow);

            const cipherSpan = document.createElement('span');
            cipherSpan.className = 'network-ciphertext';
            if (content) {
                cipherSpan.textContent = content.length > 60 ? content.substring(0, 60) + '\u2026' : content;
            } else {
                cipherSpan.textContent = '[encrypted]';
            }
            entry.appendChild(cipherSpan);
        }
    }

    entries.push(entry);
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
