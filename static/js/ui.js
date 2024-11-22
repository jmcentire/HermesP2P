import { addChannel, addFriend, populateSidebar } from './config.js';
import { generateChannelKey } from './crypto.js';
import { displayMessages, disableMessageInput } from './messages.js';

// Initialize UI components and event listeners
export function initializeUI(configuration) {
    // Initialize Feather Icons
    feather.replace();

    // Initialize the sidebar with the current configuration
    populateSidebar(configuration);

    // Initially disable message input and show welcome message
    disableMessageInput();
    displayMessages();

    let editingItem = null;

    // Channel Modal
    const channelModal = new bootstrap.Modal(document.getElementById('addChannelModal'));
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
            if (addChannel(channelName, channelKey)) {
                channelModal.hide();
                document.getElementById('channelName').value = '';
                document.getElementById('channelKey').value = '';
            }
        });
    }

    // Friend Modal
    const friendModal = new bootstrap.Modal(document.getElementById('addFriendModal'));
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
            }
        });
    }

    document.getElementById('generateKeyBtn').addEventListener('click', () => {
        const channelKey = document.getElementById('channelKey');
        channelKey.value = generateChannelKey();
    });

    // Add message logging event listener
    window.addEventListener('messageBroadcast', (event) => {
        console.log('Message Broadcast Event:');
        console.log(JSON.stringify(event.detail, null, 2));
    });
}
