import { signMessage, encryptChannelMessage, encryptDirectMessage } from './crypto.js';
import { stampTTL } from './ttl.js';
import { padMessage } from './padding.js';
import { generatePseudonym, shortenPseudonym } from './pseudonyms.js';
import { broadcastMessage } from './network.js';

// Message history storage — also used by bots.js via injectBotMessage
const messageHistory = {};

let messageIdCounter = 0;

function generateMessageId() {
    return `msg_${Date.now()}_${messageIdCounter++}_${Math.random().toString(36).slice(2, 8)}`;
}

export function updateChannelName(oldName, newName) {
    if (messageHistory.hasOwnProperty(oldName)) {
        messageHistory[newName] = messageHistory[oldName];
        messageHistory[oldName] = null;
    }
}

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

            const headerDiv = document.createElement("div");
            headerDiv.className = "d-flex justify-content-between align-items-baseline";

            const senderStrong = document.createElement("strong");
            senderStrong.className = "text-secondary";
            senderStrong.textContent = msg.sender;

            const timestampSmall = document.createElement("small");
            timestampSmall.className = "text-muted";
            timestampSmall.textContent = msg.timestamp;

            headerDiv.appendChild(senderStrong);
            headerDiv.appendChild(timestampSmall);

            const contentDiv = document.createElement("div");
            contentDiv.className = "message-content mt-1";
            contentDiv.textContent = msg.content;

            messageElement.appendChild(headerDiv);
            messageElement.appendChild(contentDiv);
            messagesDiv.appendChild(messageElement);
        });

        if (messageHistory[name].length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.className = "text-center text-muted";
            emptyMessage.textContent = `Messages for ${name} will appear here.`;
            messagesDiv.appendChild(emptyMessage);
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

        const messageType = isFriend ? 'direct' :
              (configuration.channels.find(c => c.name === chatName)?.key ? 'private' : 'public');

        try {
            const paddedFrame = await packageMessage(message, messageType, chatName, configuration);
            broadcastMessage(paddedFrame);
            messageInput.value = '';
            appendMessage(configuration.user.name, message, messageType);

            // Notify bots about outgoing DMs
            window.dispatchEvent(new CustomEvent('hermesBotCheck', {
                detail: { to: chatName, type: messageType }
            }));
        } catch (err) {
            if (err instanceof RangeError) {
                appendMessage('System', 'Message too long (max 64KB)', 'public');
            } else {
                console.error('Failed to send message:', err);
            }
        }
    };
}

/**
 * Inject a bot message into message history and refresh display if active.
 * Used by bots.js to post without going through the network.
 * @param {string} channelOrFriendName - Target channel or friend name
 * @param {string} senderName - Display name / pseudonym of the sender
 * @param {string} content - Message content
 * @param {'public'|'private'|'direct'} type - Message type
 */
export function injectBotMessage(channelOrFriendName, senderName, content, type = 'public') {
    if (!messageHistory[channelOrFriendName]) {
        messageHistory[channelOrFriendName] = [];
    }

    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    let displayContent = content;

    switch (type) {
        case 'private':
        case 'direct':
            displayContent = `\u{1F512} ${content}`;
            break;
    }

    messageHistory[channelOrFriendName].push({ sender: senderName, content: displayContent, timestamp });

    // Refresh display if this channel/friend is currently active
    const activeChat = document.querySelector('.list-group-item.active');
    if (activeChat) {
        const activeName = activeChat.querySelector('span').textContent;
        if (activeName === channelOrFriendName) {
            displayMessages(channelOrFriendName);
        }
    }
}

export function disableMessageInput() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    messageForm.classList.add('disabled');
    messageInput.disabled = true;
    messageInput.placeholder = 'Select a chat to send messages';
}

/**
 * Handle message submission (called from ui.js form handler).
 * Now async to support pseudonym generation.
 */
export async function handleMessageSubmit(e, configuration) {
    if (!configuration || !configuration.user) {
        console.error('Invalid configuration in handleMessageSubmit');
        return;
    }
    e.preventDefault();
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();
    const activeChat = document.querySelector('.list-group-item.active');

    if (message && activeChat) {
        const chatName = activeChat.querySelector('span').textContent;
        const isChannel = configuration.channels.some(channel => channel.name === chatName);
        let messageType;

        if (isChannel) {
            const channel = configuration.channels.find(ch => ch.name === chatName);
            messageType = channel.key ? 'private' : 'public';
        } else {
            messageType = 'direct';
        }

        try {
            const paddedFrame = await packageMessage(message, messageType, chatName, configuration);

            // Dispatch message broadcast event
            window.dispatchEvent(new CustomEvent('messageBroadcast', {
                detail: { type: messageType, to: chatName }
            }));

            broadcastMessage(paddedFrame);
            appendMessage(configuration.user.name, message, messageType);
            messageInput.value = '';
        } catch (err) {
            if (err instanceof RangeError) {
                appendMessage('System', 'Message too long (max 64KB)', 'public');
            } else {
                console.error('Failed to send message:', err);
            }
        }
    }
}

/**
 * Builds, encrypts, stamps TTL, signs, serializes, and pads a message.
 * Returns a padded Uint8Array ready for binary broadcast.
 */
export async function packageMessage(plaintext, type, to, configuration) {
    if (!configuration || !configuration.user) {
        throw new Error('Invalid configuration passed to packageMessage');
    }

    // Encrypt content based on type
    let messageContent;
    if (type === 'private') {
        const channel = configuration.channels.find(ch => ch.name === to);
        if (channel?.key) {
            const [encrypted, nonce] = encryptChannelMessage(plaintext, channel.key);
            messageContent = JSON.stringify({ encrypted, nonce });
        } else {
            messageContent = plaintext;
        }
    } else if (type === 'direct') {
        const friend = configuration.friends.find(f => f.name === to);
        if (friend) {
            const [encrypted, nonce, ephemeralPubKey] = encryptDirectMessage(plaintext, friend.pubKey);
            messageContent = JSON.stringify({ encrypted, nonce, ephemeralPubKey });
        } else {
            messageContent = plaintext;
        }
    } else {
        messageContent = plaintext;
    }

    // Build message package
    const messagePackage = {
        id: generateMessageId(),
        type: type,
        timestamp: Date.now(),
        to: to,
        from: {
            name: configuration.user.name,
            pubKey: configuration.user.pubKey
        },
        message: messageContent,
        signature: '',
    };

    // Stamp TTL
    stampTTL(messagePackage, type);

    // Channel messages: remove pubKey for anonymity, replace name with pseudonym
    if (type === 'private' || type === 'public') {
        delete messagePackage.from.pubKey;
        try {
            const pseudonym = await generatePseudonym(configuration.user.privKey, to);
            messagePackage.from.name = shortenPseudonym(pseudonym, 16);
        } catch (err) {
            console.warn('Pseudonym generation failed, using username:', err);
        }
    }

    // Sign the message content
    messagePackage.signature = signMessage(messageContent, configuration.user.privKey);

    // Serialize and pad
    const jsonStr = JSON.stringify(messagePackage);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    return padMessage(jsonBytes);
}
