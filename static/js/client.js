import { generateChannelKey } from './crypto.js';
import { displayMessages, enableMessageInput, disableMessageInput, handleMessageSubmit } from './messages.js';
import { 
    populateSidebar, 
    addChannel, 
    addFriend,
    editChannel, 
    editFriend,
    getConfiguration,
    saveConfiguration,
    handleSaveExit,
    setupEventListeners
} from './config.js';

// Get configuration from sessionStorage or initialize new one
const configuration = getConfiguration();

// Initialize event listeners when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Feather Icons
    feather.replace();

    // Initialize the sidebar with the current configuration
    populateSidebar(configuration);
    displayMessages();

    // Setup all event listeners
    setupEventListeners(configuration);

    // Clear session storage when window is closed or refreshed
    window.addEventListener('beforeunload', () => {
        sessionStorage.clear();
    });

    // Add event listener for message logging
    window.addEventListener('messageBroadcast', (event) => {
        console.log('Message Broadcast Event:');
        console.log(JSON.stringify(event.detail, null, 2));
    });
});

// Initialize event listeners when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Feather Icons
    feather.replace();

    // Initialize the sidebar with the current configuration
    populateSidebar(configuration);
    displayMessages();

    let editingItem = null;
    // Set up the generate key button
    document.getElementById('generateKeyBtn').addEventListener('click', () => {
        const channelKey = document.getElementById('channelKey');
        channelKey.value = generateChannelKey();
    });


    // Channel Modal
    const channelModal = new bootstrap.Modal(document.getElementById('addChannelModal'));
    document.getElementById('addChannelBtn').addEventListener('click', () => {
        document.getElementById('channelName').value = '';
        document.getElementById('channelKey').value = '';
        editingItem = null;
        channelModal.show();
    });

    document.getElementById('saveChannelBtn').addEventListener('click', () => {
        const name = document.getElementById('channelName').value;
        const key = document.getElementById('channelKey').value;
        if (addChannel(name, key, configuration, editingItem)) {
            channelModal.hide();
        }
    });

    // Friend Modal
    const friendModal = new bootstrap.Modal(document.getElementById('addFriendModal'));
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        document.getElementById('friendName').value = '';
        document.getElementById('friendPubKey').value = '';
        editingItem = null;
        friendModal.show();
    });

    document.getElementById('saveFriendBtn').addEventListener('click', () => {
        const name = document.getElementById('friendName').value;
        const pubKey = document.getElementById('friendPubKey').value;
        if (addFriend(name, pubKey, configuration, editingItem)) {
            friendModal.hide();
        }
    });

    // Add Channel button handler
    document.getElementById('saveChannelBtn').addEventListener('click', () => {
        const name = document.getElementById('channelName').value.trim();
        const key = document.getElementById('channelKey').value.trim();

        if (addChannel(name, key, configuration, editingItem)) {
            editingItem = null;
            bootstrap.Modal.getInstance(document.getElementById('addChannelModal')).hide();
        }
    });

    // Add Friend button handler
    document.getElementById('saveFriendBtn').addEventListener('click', () => {
        const name = document.getElementById('friendName').value.trim();
        const pubKey = document.getElementById('friendPubKey').value.trim();

        if (addFriend(name, pubKey, configuration, editingItem)) {
            editingItem = null;
            bootstrap.Modal.getInstance(document.getElementById('addFriendModal')).hide();
        }
    });

    // Modal reset handlers
    document.getElementById('addChannelModal').addEventListener('hidden.bs.modal', () => {
        editingItem = null;
        document.getElementById('channelName').value = '';
        document.getElementById('channelKey').value = '';
        document.querySelector('#addChannelModal .modal-title').textContent = 'Add Channel';
        document.getElementById('saveChannelBtn').textContent = 'Add Channel';
    });

    document.getElementById('addFriendModal').addEventListener('hidden.bs.modal', () => {
        editingItem = null;
        document.getElementById('friendName').value = '';
        document.getElementById('friendPubKey').value = '';
        document.querySelector('#addFriendModal .modal-title').textContent = 'Add Friend';
        document.getElementById('saveFriendBtn').textContent = 'Add Friend';
    });
});

// Setup modal functionality
function setupModals() {
    // Save & Exit functionality
    document.getElementById('saveExitBtn').addEventListener('click', () => {
        const configBlob = new Blob([JSON.stringify(configuration, null, 2)], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(configBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = 'hp2p-config.json';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadUrl);
        sessionStorage.removeItem('hp2pConfig');
        window.location.href = '/';
    });
}
document.getElementById('saveFriendBtn').addEventListener('click', () => {
    const name = document.getElementById('friendName').value.trim();
    const pubKey = document.getElementById('friendPubKey').value.trim();

    if (editingItem) {
        // Remove old friend
        removeFriend(editingItem.name);
    }

    if (addFriend(name, pubKey)) {
        editingItem = null;
        bootstrap.Modal.getInstance(document.getElementById('addFriendModal')).hide();
    }
});

// Reset modals on close
document.getElementById('addChannelModal').addEventListener('hidden.bs.modal', () => {
    editingItem = null;
    document.getElementById('channelName').value = '';
    document.getElementById('channelKey').value = '';
    document.querySelector('#addChannelModal .modal-title').textContent = 'Add Channel';
    document.getElementById('saveChannelBtn').textContent = 'Add Channel';
});

document.getElementById('addFriendModal').addEventListener('hidden.bs.modal', () => {
    editingItem = null;
    document.getElementById('friendName').value = '';
    document.getElementById('friendPubKey').value = '';
    document.querySelector('#addFriendModal .modal-title').textContent = 'Add Friend';
    document.getElementById('saveFriendBtn').textContent = 'Add Friend';
});

// Add event listener for message logging
window.addEventListener('messageBroadcast', (event) => {
    console.log('Message Broadcast Event:');
    console.log(JSON.stringify(event.detail, null, 2));
});

// Add event listener for message form
document.getElementById('messageForm').addEventListener('submit', handleMessageSubmit);


// Initialize the page with the configuration
document.addEventListener("DOMContentLoaded", () => {
    // Initially disable message input and show welcome message
    disableMessageInput();
    displayMessages();

    // Initialize Bootstrap modals
    channelModal = new bootstrap.Modal(document.getElementById('addChannelModal'));
    friendModal = new bootstrap.Modal(document.getElementById('addFriendModal'));

    // Initialize sidebar
    populateSidebar(configuration);

    // Add Channel button event listener
    const addChannelBtn = document.getElementById('addChannelBtn');
    if (addChannelBtn) {
        addChannelBtn.addEventListener('click', () => channelModal.show());
    }

    // Add Friend button event listener
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
        addFriendBtn.addEventListener('click', () => friendModal.show());
    }

    // Save Channel button event listener
    const saveChannelBtn = document.getElementById('saveChannelBtn');
    if (saveChannelBtn) {
        saveChannelBtn.addEventListener('click', () => {
            const channelName = document.getElementById('channelName').value;
            const channelKey = document.getElementById('channelKey').value;
            if (addChannel(channelName, channelKey)) {
                channelModal.hide();
                document.getElementById('channelName').value = '';
                document.getElementById('channelKey').value = '';
            }
        });
    }

    // Save Friend button event listener
    const saveFriendBtn = document.getElementById('saveFriendBtn');
    if (saveFriendBtn) {
        saveFriendBtn.addEventListener('click', () => {
            const friendName = document.getElementById('friendName').value;
            const friendPubKey = document.getElementById('friendPubKey').value;
            if (addFriend(friendName, friendPubKey)) {
                friendModal.hide();
                document.getElementById('friendName').value = '';
                document.getElementById('friendPubKey').value = '';
            }
        });
    }

    // Add Save & Exit button event listener
    const saveExitBtn = document.getElementById('saveExitBtn');
    if (saveExitBtn) {
        saveExitBtn.addEventListener('click', handleSaveExit);
    }

    // Add Message form submit event listener
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
        messageForm.addEventListener('submit', handleMessageSubmit);
    }
});

// Clear session storage when window is closed or refreshed
window.addEventListener('beforeunload', () => {
    sessionStorage.clear();
});
