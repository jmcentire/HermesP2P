// Using global nacl object from CDN
const { box, sign, randomBytes } = window.nacl;

// Base64 encoding/decoding functions
const base64Encode = (array) => {
    const uint8Array = new Uint8Array(array);
    let binaryString = '';
    uint8Array.forEach(byte => binaryString += String.fromCharCode(byte));
    return window.btoa(binaryString);
};

const base64Decode = (str) => {
    const binaryString = window.atob(str);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

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
        li.className = "list-group-item list-group-item-action";
        li.style.cursor = "pointer";
        li.textContent = channel.name;
        li.addEventListener("click", () => displayMessages(channel.name));
        channelsList.appendChild(li);
    });

    // Populate friends
    config.friends.forEach(friend => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action";
        li.style.cursor = "pointer";
        li.textContent = friend.name;
        li.addEventListener("click", () => displayMessages(friend.name));
        friendsList.appendChild(li);
    });
}

// Display messages for the selected channel or friend
function displayMessages(name) {
    const messagesDiv = document.getElementById("messages");
    messagesDiv.innerHTML = `<p>Messages for <strong>${name}</strong> will appear here.</p>`;
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
    populateSidebar(configuration);
    
    // Add Save & Exit button event listener
    const saveExitBtn = document.getElementById('saveExitBtn');
    if (saveExitBtn) {
        saveExitBtn.addEventListener('click', handleSaveExit);
    }
});

// Clear session storage when window is closed or refreshed
window.addEventListener('beforeunload', () => {
    sessionStorage.clear();
});