// Get configuration from sessionStorage or use default
const configuration = (() => {
    const storedConfig = sessionStorage.getItem('hp2pConfig');
    if (storedConfig) {
        // Clear the stored config to prevent reuse
        sessionStorage.removeItem('hp2pConfig');
        return JSON.parse(storedConfig);
    }
    // Default configuration for new users
    return {
        user: {
            name: "NewUser" + Math.random().toString(36).substr(2, 6),
            pubKey: "DEMO" + "0".repeat(28),
            privKey: "DEMO" + "0".repeat(28)
        },
        channels: [
            { name: "General", pubKey: "CHAN" + "0".repeat(28) }
        ],
        friends: []
    };
})();

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
        li.className = "name-item";
        li.textContent = channel.name;
        li.addEventListener("click", () => displayMessages(channel.name));
        channelsList.appendChild(li);
    });

    // Populate friends
    config.friends.forEach(friend => {
        const li = document.createElement("li");
        li.className = "name-item";
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

// Initialize the page with the configuration
document.addEventListener("DOMContentLoaded", () => {
    populateSidebar(configuration);
});