import { getConfiguration } from './config.js';
import { initializeUI } from './ui.js';
import { initializeNetwork, getConnectedPeerCount, getConnectedPeerUrls, getConnectedPeerInfo,
         connectToNode, disconnectPeer, sendToPeer, broadcastRaw } from './network.js';
import { initializeDiscovery } from './discovery.js';
import { handleIncomingNetworkMessage } from './messages.js';
import { initializeBots } from './bots.js';
import { initializeNetworkPanel, startPhantomTraffic } from './network-panel.js';

const configuration = getConfiguration();

initializeUI(configuration);

// Initialize network traffic panel
initializeNetworkPanel();

// Initialize network with message handler and status callbacks
initializeNetwork(
    (url, messagePackage) => handleIncomingNetworkMessage(url, messagePackage, configuration),
    (msg, type) => console.log('Network:', msg),
    () => configuration,
);

// Start demo bots
const botCleanup = initializeBots(configuration);
const phantomCleanup = startPhantomTraffic();

window.addEventListener('beforeunload', () => {
    botCleanup();
    phantomCleanup();
});

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
