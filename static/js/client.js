// Example configuration object (replace with the uploaded JSON data)
const configuration = {
    user: {
        name: "JohnDoe",
        pubKey: "ABCD1234...5678",
        privKey: "WXYZ9876...4321"
    },
    channels: [
        { name: "General", pubKey: "1234ABCD...EFGH" },
        { name: "TechTalk", pubKey: "5678WXYZ...JKLM" }
    ],
    friends: [
        { name: "Alice", pubKey: "1111AAAA...BBBB" },
        { name: "Bob", pubKey: "2222CCCC...DDDD" }
    ]
};

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