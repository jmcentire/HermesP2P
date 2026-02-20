import { getConfiguration } from './config.js';
import { initializeUI } from './ui.js';
import { initializeDiscovery } from './discovery.js';
import { getConnectedPeerCount, getConnectedPeerUrls, getConnectedPeerInfo,
         connectToNode, disconnectPeer, sendToPeer, broadcastRaw } from './network.js';

const configuration = getConfiguration();

initializeUI(configuration);

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
