import { getConfiguration } from './config.js';
import { initializeUI } from './ui.js';
import { initializeDiscovery } from './discovery.js';
import { getConnectedPeerCount, getConnectedPeerUrls, getConnectedPeerInfo,
         connectToNode, disconnectPeer, sendToPeer, broadcastRaw } from './network.js';
import { initializeBots } from './bots.js';
import { initializeNetworkPanel, startPhantomTraffic } from './network-panel.js';

const configuration = getConfiguration();

initializeUI(configuration);

// Initialize network traffic panel
initializeNetworkPanel();

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
    // Store cleanup function for potential teardown
    window._hermesDiscoveryCleanup = cleanup;
} catch (err) {
    console.warn('Discovery initialization deferred:', err.message);
}
