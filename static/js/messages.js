import { getConfiguration } from './config.js';
import { signMessage, encryptChannelMessage, encryptDirectMessage } from './crypto.js';

// Message history storage
const messageHistory = {};
const configuration = getConfiguration();

// Display messages in the UI
export function displayMessages(name = null) {
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
                <p class="fs-6" style="color: #000033;">Feel free to remove channels or friends as your preferences change. When you're finished, remember to Save and Exit to download your updated configuration file and keep your settings for next time. Dive in and enjoy a secure, customizable messaging experience!</p>
            </div>`;
    }
    
    // Always scroll to bottom after updating messages
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Append a new message
function appendMessage(sender, content, type = 'public') {
    const activeChat = document.querySelector('.list-group-item.active');
    if (!activeChat) return;
    
    const chatName = activeChat.querySelector('span').textContent;
    if (!messageHistory[chatName]) {
        messageHistory[chatName] = [];
    }
    
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    let displayContent = content;
    
    // Add appropriate indicators based on message type
    switch (type) {
        case 'private':
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

// Enable message input functionality
export function enableMessageInput(configuration) {
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
        messagePackage.signature = signMessage(message, configuration.user.privKey);
        
        // Clear input after sending
        messageInput.value = '';
        
        // Append message locally
        appendMessage(configuration.user.name, message, messagePackage.type);
        
        // Broadcast message (to be implemented)
        // broadcastMessage(messagePackage);
    };
}

export function disableMessageInput() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    messageForm.classList.add('disabled');
    messageInput.disabled = true;
    messageInput.placeholder = 'Select a chat to send messages';
}

// Handle message submission with standardized signing
export function handleMessageSubmit(e) {
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
                e, n = encryptChannelMessage(message, channel.key);
                content = packageMessage({encrypted: e, nonce: n}, 'private', channel.key);
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
                e, n, eph = encryptDirectMessage(message, friend.pubKey);
                content = packageMessage(
                    {
                        encrypted: e,
                        nonce: n,
                        ephemeralPubKey: eph
                    },
                    'direct',
                    recipientPubKey
                );
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