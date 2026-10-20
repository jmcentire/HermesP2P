import { validateLocalConfig } from './config-import.js';
import { getConfiguration, setAlias } from './config.js';
import { initializeUI } from './ui.js';
import { initializeNetwork, getConnectedPeerCount, getConnectedPeerUrls, getConnectedPeerInfo,
         connectToNode, disconnectPeer, sendToPeer, broadcastRaw } from './network.js';
import { initializeDiscovery } from './discovery.js';
import { handleIncomingNetworkMessage } from './messages.js';
import { initializeNetworkPanel } from './network-panel.js';

const configuration = getConfiguration();

initializeUI(configuration);

// Initialize network traffic panel with config access for alias resolution
initializeNetworkPanel(
    () => configuration,
    (pseudonym, alias) => setAlias(pseudonym, alias, configuration),
);

// Initialize network with message handler and status callbacks
initializeNetwork(
    (url, messagePackage) => handleIncomingNetworkMessage(url, messagePackage, configuration),
    (msg, type) => console.log('Network:', msg),
    () => configuration,
);

// Bootstrap peer discovery with dependency-injected network API
try {
    const cleanup = initializeDiscovery({
        getConnectedPeerCount,
        getConnectedPeerUrls,
        getConnectedPeerInfo,
        connectToPeer: connectToNode,
        disconnectPeer,
        sendToPeer,
        broadcastRaw,
    });
    window._hermesDiscoveryCleanup = cleanup;
} catch (err) {
    console.warn('Discovery initialization deferred:', err.message);
}

// Imports stay in this browser. Never send identity files to the relay.
document.getElementById('importConfig').addEventListener('change', async event => {
    const status = document.getElementById('importStatus');
    try {
        const file = event.target.files[0];
        if (!file || file.size > 65536) throw new Error('Identity file too large');
        const config = validateLocalConfig(JSON.parse(await file.text()), window.nacl, window.base64js);
        sessionStorage.setItem('hp2pConfig', JSON.stringify(config));
        window.location.reload();
    } catch { status.textContent = 'Invalid identity file. Nothing was imported or uploaded.'; }
});
