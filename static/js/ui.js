import { generateChannelKey } from './crypto.js';
import { displayMessages, enableMessageInput, disableMessageInput } from './messages.js';
import { 
    addChannel, 
    addFriend,
    editChannel, 
    editFriend,
    handleSaveExit,
    populateSidebar
} from './config.js';

// Initialize UI components and event listeners
export function initializeUI(configuration) {
    // Initialize Feather Icons
    feather.replace();

    // Initialize the sidebar with the current configuration
    populateSidebar(configuration);
    displayMessages();

    // Setup all event listeners
    setupEventListeners(configuration);

    // Initially disable message input
    disableMessageInput();
}

// Setup event listeners for UI components
export function setupEventListeners(configuration) {
    // Generate key button
    document.getElementById('generateKeyBtn').addEventListener('click', () => {
        const channelKey = document.getElementById('channelKey');
        channelKey.value = generateChannelKey();
    });

    // Channel Modal
    const channelModal = new bootstrap.Modal(document.getElementById('addChannelModal'));
    document.getElementById('addChannelBtn').addEventListener('click', () => {
        document.getElementById('channelName').value = '';
        document.getElementById('channelKey').value = '';
        channelModal.show();
    });

    // Friend Modal
    const friendModal = new bootstrap.Modal(document.getElementById('addFriendModal'));
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        document.getElementById('friendName').value = '';
        document.getElementById('friendPubKey').value = '';
        friendModal.show();
    });

    // Save & Exit button
    document.getElementById('saveExitBtn').addEventListener('click', handleSaveExit);

    // Modal reset handlers
    setupModalResetHandlers();

    // Save buttons handlers
    setupSaveButtonHandlers(configuration);
}

// Setup modal reset handlers
function setupModalResetHandlers() {
    document.getElementById('addChannelModal').addEventListener('hidden.bs.modal', () => {
        document.getElementById('channelName').value = '';
        document.getElementById('channelKey').value = '';
        document.querySelector('#addChannelModal .modal-title').textContent = 'Add Channel';
        document.getElementById('saveChannelBtn').textContent = 'Add Channel';
    });

    document.getElementById('addFriendModal').addEventListener('hidden.bs.modal', () => {
        document.getElementById('friendName').value = '';
        document.getElementById('friendPubKey').value = '';
        document.querySelector('#addFriendModal .modal-title').textContent = 'Add Friend';
        document.getElementById('saveFriendBtn').textContent = 'Add Friend';
    });
}

// Setup save button handlers
function setupSaveButtonHandlers(configuration) {
    // Channel save button
    document.getElementById('saveChannelBtn').addEventListener('click', () => {
        const name = document.getElementById('channelName').value.trim();
        const key = document.getElementById('channelKey').value.trim();
        if (addChannel(name, key, configuration)) {
            bootstrap.Modal.getInstance(document.getElementById('addChannelModal')).hide();
        }
    });

    // Friend save button
    document.getElementById('saveFriendBtn').addEventListener('click', () => {
        const name = document.getElementById('friendName').value.trim();
        const pubKey = document.getElementById('friendPubKey').value.trim();
        if (addFriend(name, pubKey, configuration)) {
            bootstrap.Modal.getInstance(document.getElementById('addFriendModal')).hide();
        }
    });
}

// Export additional UI-related functions
export { setupEventListeners };
