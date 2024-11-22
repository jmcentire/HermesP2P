// UI-related functionality
import { addChannel, addFriend, populateSidebar, handleSaveExit, editChannel, editFriend } from './config.js';
import { generateChannelKey } from './crypto.js';
import { handleMessageSubmit, disableMessageInput, displayMessages, enableMessageInput } from './messages.js';

// UI state management
let editingItem = null;
let channelModal = null;
let friendModal = null;

// Initialize UI components
export function initializeUI(configuration) {
    // Initialize Feather Icons
    feather.replace();

    // Initialize modals
    channelModal = new bootstrap.Modal(document.getElementById('addChannelModal'));
    friendModal = new bootstrap.Modal(document.getElementById('addFriendModal'));

    // Initialize the sidebar
    populateSidebar(configuration);

    // Initially disable message input and show welcome message
    disableMessageInput();
    displayMessages();

    setupEventListeners(configuration);

    // Add event listener for message logging
    window.addEventListener('messageBroadcast', (event) => {
        console.log('Message Broadcast Event:');
        console.log(JSON.stringify(event.detail, null, 2));
    });

    // Clear session storage when window is closed or refreshed
    window.addEventListener('beforeunload', () => {
        sessionStorage.clear();
    });
}

// Setup all event listeners
export function setupEventListeners(configuration) {
    // Channel Modal Events
    setupChannelModalEvents(configuration);

    // Friend Modal Events
    setupFriendModalEvents(configuration);

    // Generate Key Button
    document.getElementById('generateKeyBtn').addEventListener('click', () => {
        const channelKey = document.getElementById('channelKey');
        channelKey.value = generateChannelKey();
    });

    // Save & Exit Button
    const saveExitBtn = document.getElementById('saveExitBtn');
    if (saveExitBtn) {
        saveExitBtn.addEventListener('click', handleSaveExit);
    }

    // Message Form
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
        messageForm.addEventListener('submit', (e) => handleMessageSubmit(e, configuration));
    }
}

// Channel Modal Events Setup
function setupChannelModalEvents(configuration) {
    document.getElementById('addChannelBtn').addEventListener('click', () => {
        document.getElementById('channelName').value = '';
        document.getElementById('channelKey').value = '';
        editingItem = null;
        channelModal.show();
    });

    document.getElementById('addChannelModal').addEventListener('hidden.bs.modal', () => {
        editingItem = null;
        document.getElementById('channelName').value = '';
        document.getElementById('channelKey').value = '';
        document.querySelector('#addChannelModal .modal-title').textContent = 'Add Channel';
        document.getElementById('saveChannelBtn').textContent = 'Add Channel';
    });

    const saveChannelBtn = document.getElementById('saveChannelBtn');
    if (saveChannelBtn) {
        saveChannelBtn.addEventListener('click', () => {
            const channelName = document.getElementById('channelName').value;
            const channelKey = document.getElementById('channelKey').value;
            if (addChannel(channelName, channelKey, configuration)) {
                channelModal.hide();
                document.getElementById('channelName').value = '';
                document.getElementById('channelKey').value = '';
            }
        });
    }
}

// Friend Modal Events Setup
function setupFriendModalEvents(configuration) {
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        document.getElementById('friendName').value = '';
        document.getElementById('friendPubKey').value = '';
        editingItem = null;
        friendModal.show();
    });

    document.getElementById('addFriendModal').addEventListener('hidden.bs.modal', () => {
        editingItem = null;
        document.getElementById('friendName').value = '';
        document.getElementById('friendPubKey').value = '';
        document.querySelector('#addFriendModal .modal-title').textContent = 'Add Friend';
        document.getElementById('saveFriendBtn').textContent = 'Add Friend';
    });

    const saveFriendBtn = document.getElementById('saveFriendBtn');
    if (saveFriendBtn) {
        saveFriendBtn.addEventListener('click', () => {
            const friendName = document.getElementById('friendName').value;
            const friendPubKey = document.getElementById('friendPubKey').value;
            if (addFriend(friendName, friendPubKey, configuration, editingItem)) {
                editingItem = null;
                document.getElementById('friendName').value = '';
                document.getElementById('friendPubKey').value = '';
                friendModal.hide();
            }
        });
    }
}

// Export UI state modifiers
export function setEditingItem(item) {
    editingItem = item;
}

export function showChannelModal() {
    channelModal.show();
}

export function showFriendModal() {
    friendModal.show();
}

export function hideChannelModal() {
    channelModal.hide();
}

export function hideFriendModal() {
    friendModal.hide();
}
