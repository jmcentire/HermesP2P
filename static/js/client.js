// Global variables
let editingItem = null;
let channelModal;
let friendModal;

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

// Edit functionality
function editChannel(channel) {
    editingItem = {
        original: channel,
        type: 'channel'
    };
    const channelNameInput = document.getElementById('channelName');
    const channelKeyInput = document.getElementById('channelKey');
    const saveButton = document.getElementById('saveChannelBtn');
    const modalTitle = document.querySelector('#addChannelModal .modal-title');

    channelNameInput.value = channel.name;
    channelKeyInput.value = channel.key || '';
    modalTitle.textContent = 'Edit Channel';
    saveButton.textContent = 'Save Changes';

    const modal = new bootstrap.Modal(document.getElementById('addChannelModal'));
    modal.show();
}

function editFriend(friend) {
    editingItem = {
        original: friend,
        type: 'friend'
    };
    const friendNameInput = document.getElementById('friendName');
    const friendPubKeyInput = document.getElementById('friendPubKey');
    const saveButton = document.getElementById('saveFriendBtn');
    const modalTitle = document.querySelector('#addFriendModal .modal-title');

    friendNameInput.value = friend.name;
    friendPubKeyInput.value = friend.pubKey;
    modalTitle.textContent = 'Edit Friend';
    saveButton.textContent = 'Save Changes';

    const modal = new bootstrap.Modal(document.getElementById('addFriendModal'));
    modal.show();
}

// Initialize event listeners when document is ready
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generateKeyBtn').addEventListener('click', () => {
        const channelKey = document.getElementById('channelKey');
        channelKey.value = generateChannelKey();
    });
});

// Using global nacl object from CDN
const { secretbox, box, sign, randomBytes } = window.nacl;
// Standardized message signing function
function signMessage(message) {
    const messageUint8 = new TextEncoder().encode(message);
    return base64Encode(sign.detached(messageUint8, base64Decode(configuration.user.privKey)));
}

// Generate a secure channel key
function generateChannelKey() {
    const key = randomBytes(secretbox.keyLength);
    return base64Encode(key);
}

// Channel and Friend Management Functions
function addChannel(name, key = '') {
    if (name.length < 6 || name.length > 36) {
        alert('Channel name must be between 6 and 36 characters');
        return false;
    }
    
    // Check for name collisions, excluding the channel being edited
    const isEdit = editingItem && editingItem.type === 'channel';
    const nameExists = configuration.channels.some(channel => {
        // If we're editing and this is the channel being edited, allow the name
        if (isEdit && channel === editingItem.original) {
            return false;
        }
        // For all other cases, check if the name exists
        return channel.name === name;
    });
    
    // Only show the error message once and only when there's actually a duplicate
    if (nameExists) {
        alert('Channel with this name already exists');
        return false;
    }

    // Validate key if provided
    if (key) {
        try {
            const keyUint8 = base64Decode(key);
            if (keyUint8.length !== secretbox.keyLength) {
                alert(`Channel key must be exactly ${secretbox.keyLength} bytes when decoded`);
                return false;
            }
        } catch (error) {
            alert('Invalid base64 key format');
            return false;
        }
    }

    // If editing, update the existing channel
    if (isEdit) {
        const index = configuration.channels.findIndex(
            channel => channel === editingItem.original
        );
        if (index !== -1) {
            configuration.channels[index] = { name, ...(key && { key }) };
            
            // Update message history key if channel name changed
            if (name !== editingItem.original.name && messageHistory[editingItem.original.name]) {
                messageHistory[name] = messageHistory[editingItem.original.name];
                delete messageHistory[editingItem.original.name];
            }
        }
    } else {
        // Add new channel
        configuration.channels.push({ name, ...(key && { key }) });
    }
    
    saveConfiguration(configuration);
    populateSidebar(configuration);
    editingItem = null;
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
    
    // Check for name collisions, excluding the friend being edited
    const isEdit = editingItem && editingItem.type === 'friend';
    const nameExists = configuration.friends.some(friend => 
        friend.name === name && 
        (!isEdit || friend.name !== editingItem.original.name)
    );
    
    if (nameExists) {
        alert('Friend with this name already exists');
        return false;
    }

    // If editing, update the existing friend
    if (isEdit) {
        const index = configuration.friends.findIndex(
            friend => friend.name === editingItem.original.name
        );
        if (index !== -1) {
            configuration.friends[index] = { name, pubKey };
        }
    } else {
        // Add new friend
        configuration.friends.push({ name, pubKey });
    }
    
    saveConfiguration(configuration);
    populateSidebar(configuration);
    editingItem = null;
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
// Helper function to create action buttons
function createActionButton(icon, clickHandler, isEdit = false) {
    const btn = document.createElement("button");
    btn.className = `btn btn-sm px-0 py-0 ${isEdit ? 'me-1' : ''}`;
    btn.style.backgroundColor = "#000033";
    btn.style.color = "#FFFFFF";
    btn.style.fontSize = "0.75rem";
    btn.style.width = "15px";
    btn.style.height = "15px";
    btn.style.lineHeight = "1";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.innerHTML = icon;
    btn.addEventListener("click", clickHandler);
    return btn;
}

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
        li.appendChild(nameSpan);

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "d-flex gap-1";

        // Edit button
        const editBtn = createActionButton("✎", (e) => {
            e.stopPropagation();
            editChannel(channel);
        }, true);
        buttonContainer.appendChild(editBtn);

        // Remove button
        const removeBtn = createActionButton("&times;", (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to remove the channel "${channel.name}"?`)) {
                removeChannel(channel.name);
            }
        });
        buttonContainer.appendChild(removeBtn);
        
        li.appendChild(buttonContainer);

        // Click handler for messages
        li.addEventListener("click", (e) => {
            if (e.target.tagName === 'BUTTON') return;
            document.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            li.classList.add('active');
            displayMessages(channel.name);
            enableMessageInput();
        });

        channelsList.appendChild(li);
    });

    // Populate friends
    config.friends.forEach(friend => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        li.style.cursor = "pointer";
        
        const nameSpan = document.createElement("span");
        nameSpan.textContent = friend.name;
        li.appendChild(nameSpan);

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "d-flex gap-1";

        // Edit button
        const editBtn = createActionButton("✎", (e) => {
            e.stopPropagation();
            editFriend(friend);
        }, true);
        buttonContainer.appendChild(editBtn);

        // Remove button
        const removeBtn = createActionButton("&times;", (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to remove "${friend.name}" from your friends list?`)) {
                removeFriend(friend.name);
            }
        });
        buttonContainer.appendChild(removeBtn);
        
        li.appendChild(buttonContainer);

        // Click handler for messages
        li.addEventListener("click", (e) => {
            if (e.target.tagName === 'BUTTON') return;
            document.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            li.classList.add('active');
            displayMessages(friend.name);
            enableMessageInput();
        });

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
    const messagesHeader = document.getElementById("messagesHeader");
    
    if (name) {
        messagesHeader.textContent = name;
        
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
    } else {
        messagesHeader.textContent = "Messages";
        messagesDiv.innerHTML = `
            <div class="text-center p-4">
                <h5 class="text-navy mb-3" style="color: #000033;">Welcome to HermesP2P Chat</h5>
                <p class="mb-3 fs-6" style="color: #000033;">Explore the secure, peer-to-peer network by selecting a channel or friend from the lists on the left. From there, you can view and send messages with ease. Want to personalize your experience? You can expand your network:</p>
                <div class="px-4">
                    <ul class="list-unstyled text-start mb-3 ps-5">
                        <li class="mb-3 ps-3">
                            <strong class="d-block mb-2">Add a Channel:</strong>
                            <ul class="list-unstyled ps-4">
                                <li class="mb-1">• Public channels require no keys</li>
                                <li class="mb-1">• Private channels require a public/private key pair</li>
                            </ul>
                        </li>
                        <li class="ps-3">
                            <strong class="d-block mb-2">Add a Friend:</strong>
                            <ul class="list-unstyled ps-4">
                                <li>• Enter their public key</li>
                            </ul>
                        </li>
                    </ul>
                </div>
                <p class="fs-6" style="color: #000033;">Feel free to remove channels or friends as your preferences change. When you’re finished, remember to Save and Exit to download your updated configuration file and keep your settings for next time. Dive in and enjoy a secure, customizable messaging experience!</p>
            </div>`;
    }
    
    // Always scroll to bottom after updating messages
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendMessage(sender, content, type = 'public') {
    const activeChat = document.querySelector('.list-group-item.active');
    if (!activeChat) return;
    
    const chatName = activeChat.querySelector('span').textContent;
    if (!messageHistory[chatName]) {
        messageHistory[chatName] = [];
    }
    
    const timestamp = formatTimestamp();
    let displayContent = content;
    
    // Add appropriate indicators based on message type
    switch (type) {
        case 'private':
            displayContent = `🔒 ✍️ ${content}`;
            break;
        case 'direct':
            displayContent = `🔒 ✍️ ${content}`;
            break;
        case 'public':
            displayContent = `✍️ ${content}`;
            break;
    }
    
    messageHistory[chatName].push({ sender, content: displayContent, timestamp });
    displayMessages(chatName);
}

function enableMessageInput() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    
    messageForm.classList.remove('disabled');
    messageInput.disabled = false;
    messageInput.placeholder = 'Type your message...';

    messageForm.onsubmit = async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message) return;
        
        const activeChat = document.querySelector('.list-group-item.active');
        if (!activeChat) return;
        
        const chatName = activeChat.querySelector('span').textContent;
        const isFriend = activeChat.closest('#friends-list') !== null;
        
        // Package and sign the message
        const messagePackage = {
            type: isFriend ? 'direct' : 
                  (configuration.channels.find(c => c.name === chatName)?.key ? 'private' : 'public'),
            timestamp: new Date().toISOString(),
            from: {
                name: configuration.user.name,
                pubKey: configuration.user.pubKey
            },
            to: chatName,
            message: message,
            signature: ''
        };
        
        // Sign the plaintext message
        messagePackage.signature = signMessage(message);
        
        // Broadcast the message (to be implemented)
        appendMessage(configuration.user.name, message, messagePackage.type);
        
        // Clear input
        messageInput.value = '';
    };
}

// Update save handlers for channels and friends
document.getElementById('saveChannelBtn').addEventListener('click', () => {
    const name = document.getElementById('channelName').value.trim();
    const key = document.getElementById('channelKey').value.trim();

    if (editingItem) {
        // Remove old channel
        removeChannel(editingItem.name);
    }

    if (addChannel(name, key)) {
        editingItem = null;
        bootstrap.Modal.getInstance(document.getElementById('addChannelModal')).hide();
    }
});

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

function disableMessageInput() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    messageForm.classList.add('disabled');
    messageInput.disabled = true;
    messageInput.placeholder = 'Select a chat to send messages';
}

// Uses symmetric encryption for private channels
function encryptChannelMessage(plaintext, channelKey) {
    const nonce = randomBytes(secretbox.nonceLength);
    const messageUint8 = new TextEncoder().encode(plaintext);
    const keyUint8 = base64Decode(channelKey);
    
    const encrypted = secretbox(messageUint8, nonce, keyUint8);
    
    return packageMessage(
        {
            encrypted: base64Encode(encrypted),
            nonce: base64Encode(nonce)
        },
        'private',
        channelKey
    );
}

function encryptDirectMessage(plaintext, recipientPubKey) {
    const ephemeralKeyPair = box.keyPair();
    const nonce = randomBytes(box.nonceLength);
    const messageUint8 = new TextEncoder().encode(plaintext);
    
    const encrypted = box(
        messageUint8,
        nonce,
        base64Decode(recipientPubKey),
        ephemeralKeyPair.secretKey
    );

    return packageMessage(
        {
            encrypted: base64Encode(encrypted),
            nonce: base64Encode(nonce),
            ephemeralPubKey: base64Encode(ephemeralKeyPair.publicKey)
        },
        'direct',
        recipientPubKey
    );
}

function packageMessage(content, type, to) {
    return {
        type: type,
        timestamp: Date.now(),
        to: to,
        from: {
            name: configuration.user.name,
            pubKey: configuration.user.pubKey
        },
        signature: signMessage(typeof content === 'string' ? content : JSON.stringify(content)),
        message: content
    };
}

// Add event listener for message logging
window.addEventListener('messageBroadcast', (event) => {
    console.log('Message Broadcast Event:');
    console.log(JSON.stringify(event.detail, null, 2));
});
                    // Handle message submission with standardized signing
function handleMessageSubmit(e) {
    e.preventDefault();
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();
    const activeChat = document.querySelector('.list-group-item.active');
    
    if (message && activeChat) {
        const chatName = activeChat.querySelector('span').textContent;
        const isChannel = configuration.channels.some(channel => channel.name === chatName);
        let content;
        let messageType;
        
        if (isChannel) {
            const channel = configuration.channels.find(ch => ch.name === chatName);
            if (channel.key) {
                // Private channel message
                messageType = 'private';
                content = encryptChannelMessage(message, channel.key);
            } else {
                // Public channel message
                messageType = 'public';
                content = packageMessage(message, messageType, chatName);
            }
        } else {
            // Direct message
            const friend = configuration.friends.find(f => f.name === chatName);
            if (friend) {
                messageType = 'direct';
                content = encryptDirectMessage(message, friend.pubKey);
            }
        }

        // Dispatch message broadcast event
        window.dispatchEvent(new CustomEvent('messageBroadcast', {
            detail: content
        }));

        // Append message to UI and clear input
        appendMessage(configuration.user.name, message, messageType);
        messageInput.value = '';
        
        // Clear input
        messageInput.value = '';
    }
}

// Add event listener for message form
document.getElementById('messageForm').addEventListener('submit', handleMessageSubmit);
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