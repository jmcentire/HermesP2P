// Base64 encoding/decoding functions
const base64Encode = (array) => {
    if (!window.base64js) {
        console.error('base64js not loaded');
        return '';
    }
    return base64js.fromByteArray(new Uint8Array(array));
};
const base64Decode = (str) => {
    if (!window.base64js) {
        console.error('base64js not loaded');
        return new Uint8Array();
    }
    return base64js.toByteArray(str);
};

// Initialize Bootstrap modals
let channelModal;
let friendModal;

// Using global nacl object from CDN
const { box, sign, randomBytes } = window.nacl;

// Channel and Friend Management Functions
function addChannel(name, pubKey = '', privKey = '') {
    if (name.length < 6 || name.length > 36) {
        alert('Channel name must be between 6 and 36 characters');
        return false;
    }
    
    // Check for duplicate channel names
    if (configuration.channels.some(channel => channel.name === name)) {
        alert('Channel with this name already exists');
        return false;
    }

    // Validate keys if provided
    if (pubKey && !/[A-Za-z0-9+/=]{32,96}/.test(pubKey)) {
        alert('Public key must be in base64 format and between 32-96 characters');
        return false;
    }

    if (privKey && !/[A-Za-z0-9+/=]{32,192}/.test(privKey)) {
        alert('Private key must be in base64 format and between 32-192 characters');
        return false;
    }
    
    const channel = { name };
    if (pubKey) channel.pubKey = pubKey;
    if (privKey) channel.privKey = privKey;
    
    configuration.channels.push(channel);
    saveConfiguration(configuration);
    populateSidebar(configuration);
    return true;
}

function removeChannel(name) {
    const index = configuration.channels.findIndex(channel => channel.name === name);
    if (index !== -1) {
        configuration.channels.splice(index, 1);
        saveConfiguration(configuration);
        populateSidebar(configuration);
    }
}

function addFriend(name, pubKey) {
    if (name.length < 6 || name.length > 36) {
        alert('Friend name must be between 6 and 36 characters');
        return false;
    }
    
    if (!/[A-Za-z0-9+/=]{32,96}/.test(pubKey)) {
        alert('Public key must be in base64 format and between 32-96 characters');
        return false;
    }
    
    // Check for duplicate friend names
    if (configuration.friends.some(friend => friend.name === name)) {
        alert('Friend with this name already exists');
        return false;
    }
    
    configuration.friends.push({ name, pubKey });
    saveConfiguration(configuration);
    populateSidebar(configuration);
    return true;
}

function removeFriend(name) {
    const index = configuration.friends.findIndex(friend => friend.name === name);
    if (index !== -1) {
        configuration.friends.splice(index, 1);
        saveConfiguration(configuration);
        populateSidebar(configuration);
    }
}



// Generate a random username (6-36 characters)
function generateUsername() {
    const adjectives = ['Swift', 'Bright', 'Silent', 'Noble', 'Mystic', 'Cosmic'];
    const nouns = ['Phoenix', 'Dragon', 'Falcon', 'Knight', 'Voyager', 'Wanderer'];
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${randomNum}`;
}

// Generate Ed25519 keypair
function generateKeypair() {
    const keypair = sign.keyPair();
    return {
        pubKey: base64Encode(keypair.publicKey),
        privKey: base64Encode(keypair.secretKey)
    };
}

// Generate secure nonce for messages
function generateNonce() {
    return base64Encode(randomBytes(box.nonceLength));
}

// Initialize new configuration
function initializeNewConfig() {
    const keypair = generateKeypair();
    return {
        user: {
            name: generateUsername(),
            ...keypair
        },
        channels: [
            { name: "General" },
            { name: "TechTalk" }
        ],
        friends: []
    };
}

// Get configuration from sessionStorage or initialize new one
const configuration = (() => {
    const storedConfig = sessionStorage.getItem('hp2pConfig');
    return storedConfig ? JSON.parse(storedConfig) : initializeNewConfig();
})();

// Save configuration
function saveConfiguration(config) {
    sessionStorage.setItem('hp2pConfig', JSON.stringify(config));
}

// Dynamically populate the sidebar
function populateSidebar(config) {
    const channelsList = document.getElementById("channels-list");
    const friendsList = document.getElementById("friends-list");

    // Clear existing lists
    channelsList.innerHTML = "";
    friendsList.innerHTML = "";

    // Populate channels
    config.channels.forEach(channel => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        li.style.cursor = "pointer";
        
        const nameSpan = document.createElement("span");
        nameSpan.textContent = channel.name;
        nameSpan.addEventListener("click", () => {
            document.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            li.classList.add('active');
            displayMessages(channel.name);
            enableMessageInput();
        });
        li.appendChild(nameSpan);
        
        if (channel.name !== "General" && channel.name !== "TechTalk") {
            const removeBtn = document.createElement("button");
            removeBtn.className = "btn btn-sm btn-danger";
            removeBtn.innerHTML = "&times;";
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to remove the channel "${channel.name}"?`)) {
                    removeChannel(channel.name);
                }
            });
            li.appendChild(removeBtn);
        }
        
        channelsList.appendChild(li);
    });

    // Populate friends
    config.friends.forEach(friend => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        li.style.cursor = "pointer";
        
        const nameSpan = document.createElement("span");
        nameSpan.textContent = friend.name;
        nameSpan.addEventListener("click", () => {
            document.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            li.classList.add('active');
            displayMessages(friend.name);
            enableMessageInput();
        });
        li.appendChild(nameSpan);
        
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-sm btn-danger";
        removeBtn.innerHTML = "&times;";
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to remove "${friend.name}" from your friends list?`)) {
                removeFriend(friend.name);
            }
        });
        li.appendChild(removeBtn);
        
        friendsList.appendChild(li);
    });
}

// Message history storage
const messageHistory = {};

// Message handling functions
function formatTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString();
}

function displayMessages(name = null) {
    const messagesDiv = document.getElementById("messages");
    
    if (!name) {
        messagesDiv.innerHTML = `
            <div class="text-center p-4">
                <h5 class="text-secondary mb-3">Welcome to HermesP2P Chat</h5>
                <p class="text-muted">Select a channel or friend from the sidebar to start messaging.</p>
                <p class="text-muted small">Your messages are end-to-end encrypted and ephemeral.</p>
            </div>`;
        return;
    }
    
    if (!messageHistory[name]) {
        messageHistory[name] = [];
    }
    
    messagesDiv.innerHTML = '';
    messageHistory[name].forEach(msg => {
        const messageElement = document.createElement("div");
        messageElement.className = "message mb-2 p-2 border-bottom";
        messageElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-baseline">
                <strong class="text-secondary">${msg.sender}</strong>
                <small class="text-muted">${msg.timestamp}</small>
            </div>
            <div class="message-content mt-1">${msg.content}</div>
        `;
        messagesDiv.appendChild(messageElement);
    });
    
    if (messageHistory[name].length === 0) {
        messagesDiv.innerHTML = `<p class="text-center text-muted">Messages for <strong>${name}</strong> will appear here.</p>`;
    }
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendMessage(sender, content) {
    const activeChat = document.querySelector('.list-group-item.active');
    if (!activeChat) return;
    
    const chatName = activeChat.querySelector('span').textContent;
    if (!messageHistory[chatName]) {
        messageHistory[chatName] = [];
    }
    
    const timestamp = formatTimestamp();
    messageHistory[chatName].push({ sender, content, timestamp });
    displayMessages(chatName);
}

function enableMessageInput() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    messageForm.classList.remove('disabled');
    messageInput.disabled = false;
    messageInput.placeholder = 'Type your message...';
}

function disableMessageInput() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    messageForm.classList.add('disabled');
    messageInput.disabled = true;
    messageInput.placeholder = 'Select a chat to send messages';
}

function handleMessageSubmit(e) {
    e.preventDefault();
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();
    const activeChat = document.querySelector('.list-group-item.active');
    
    if (message && activeChat) {
        appendMessage(configuration.user.name, message);
        messageInput.value = '';
        messageInput.focus();
    }
}
// Save and Exit functionality
function handleSaveExit() {
    // Use the global configuration object that contains the actual user data
    if (!configuration) {
        console.error('No configuration found');
        return;
    }
    
    // Create blob and download link
    const blob = new Blob([JSON.stringify(configuration, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hp2p-config.json';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    // Clear storage and redirect
    localStorage.clear();
    sessionStorage.clear();
    
    // Short delay before redirect to ensure download starts
    setTimeout(() => {
        window.location.href = '/';
    }, 100);
}


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
            const channelPubKey = document.getElementById('channelPubKey').value;
            const channelPrivKey = document.getElementById('channelPrivKey').value;
            if (addChannel(channelName, channelPubKey, channelPrivKey)) {
                channelModal.hide();
                document.getElementById('channelName').value = '';
                document.getElementById('channelPubKey').value = '';
                document.getElementById('channelPrivKey').value = '';
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