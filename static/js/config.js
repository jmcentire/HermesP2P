import {
    displayMessages,
    enableMessageInput,
    handleMessageSubmit,
    updateChannelName
} from "./messages.js";
import {
    generateKeypair,
    generateUsername,
    generateChannelKey,
} from "./crypto.js";
import {
    showFriendModal,
    hideFriendModal,
    hideChannelModal,
    showChannelModal,
} from "./ui.js";

// UI state management
let editingItem = null;

export function setEditingItem(item) {
    editingItem = item;
}
export function getEditingItem() {
    return editingItem;
}
export function clearEditingItem() {
    editingItem = null;
}

// Get configuration from sessionStorage or initialize new one
export function getConfiguration() {
    const storedConfig = sessionStorage.getItem("hp2pConfig");
    return storedConfig ? JSON.parse(storedConfig) : initializeNewConfig();
}

// Save configuration
// TODO:  Encrypt on download w/ password
function saveConfiguration(config) {
    sessionStorage.setItem("hp2pConfig", JSON.stringify(config));
}

// Initialize new configuration
function initializeNewConfig() {
    const keypair = generateKeypair();
    return {
        user: {
            name: generateUsername(),
            ...keypair,
        },
        channels: [{ name: "General" }, { name: "TechTalk" }],
        friends: [],
    };
}

// Save and Exit functionality
export function handleSaveExit() {
    const config = JSON.parse(sessionStorage.getItem("hp2pConfig"));
    if (!config) {
        console.error("No configuration found");
        return;
    }

    const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hermesp2p-config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.location.href = "/";
}

// Setup all event listeners
export function setupEventListeners(configuration) {
    // Set up the generate key button
    document.getElementById("generateKeyBtn").addEventListener("click", () => {
        const channelKey = document.getElementById("channelKey");
        channelKey.value = generateChannelKey();
    });

    // Channel Modal
    document.getElementById("addChannelBtn").addEventListener("click", () => {
        document.getElementById("channelName").value = "";
        document.getElementById("channelKey").value = "";
        clearEditingItem();
        showChannelModal();
    });

    // Add Channel button handler
    document.getElementById("saveChannelBtn").addEventListener("click", () => {
        const name = document.getElementById("channelName").value.trim();
        const key = document.getElementById("channelKey").value.trim();
        if (addChannel(name, key, configuration, getEditingItem())) {
            clearEditingItem();
            hideChannelModal();
        }
    });

    // Friend Modal
    document.getElementById("addFriendBtn").addEventListener("click", () => {
        document.getElementById("friendName").value = "";
        document.getElementById("friendPubKey").value = "";
        clearEditingItem();
        showFriendModal();
    });

    // Add Friend button handler
    document.getElementById("saveFriendBtn").addEventListener("click", () => {
        const name = document.getElementById("friendName").value.trim();
        const pubKey = document.getElementById("friendPubKey").value.trim();
        if (addFriend(name, pubKey, configuration, editingItem)) {
            clearEditingItem();
            hideFriendModal();
        }
    });

    // Modal reset handlers
    document
        .getElementById("addChannelModal")
        .addEventListener("hidden.bs.modal", () => {
            clearEditingItem();
            document.getElementById("channelName").value = "";
            document.getElementById("channelKey").value = "";
            document.querySelector(
                "#addChannelModal .modal-title",
            ).textContent = "Add Channel";
            document.getElementById("saveChannelBtn").textContent =
                "Add Channel";
        });

    document
        .getElementById("addFriendModal")
        .addEventListener("hidden.bs.modal", () => {
            clearEditingItem();
            document.getElementById("friendName").value = "";
            document.getElementById("friendPubKey").value = "";
            document.querySelector("#addFriendModal .modal-title").textContent =
                "Add Friend";
            document.getElementById("saveFriendBtn").textContent = "Add Friend";
        });

    // Save & Exit button handler
    document
        .getElementById("saveExitBtn")
        .addEventListener("click", handleSaveExit);

    // Message form submit handler
    const messageForm = document.getElementById("messageForm");
    if (messageForm) {
        messageForm.addEventListener("submit", handleMessageSubmit);
    }
}

// Channel management
export function addChannel(name, key = "", configuration, editingItem = getEditingItem()) {
    if (name.length < 6 || name.length > 36) {
        alert("Channel name must be between 6 and 36 characters");
        return false;
    }

    const isEdit = editingItem && editingItem.type === "channel";
    const nameExists = configuration.channels.some((channel) => {
        if (isEdit && channel === editingItem.original) {
            return false;
        }
        return channel.name === name;
    });

    if (nameExists) {
        alert("Channel with this name already exists");
        return false;
    }

    if (key) {
        try {
            const keyUint8 = base64Decode(key);
            if (keyUint8.length !== secretbox.keyLength) {
                alert(
                    `Channel key must be exactly ${secretbox.keyLength} bytes when decoded`,
                );
                return false;
            }
        } catch (error) {
            alert("Invalid base64 key format");
            return false;
        }
    }

    if (isEdit) {
        const index = configuration.channels.findIndex(
            (channel) => channel === editingItem.original,
        );
        if (index !== -1) {
            configuration.channels[index] = { name, ...(key && { key }) };
            updateChannelName(editingItem.original.name, name)
        }
    } else {
        configuration.channels.push({ name, ...(key && { key }) });
    }

    saveConfiguration(configuration);
    populateSidebar(configuration);
    return true;
}

// Edit channel function
export function editChannel(channel) {
    document.getElementById("channelName").value = channel.name;
    document.getElementById("channelKey").value = channel.key || "";
    document.querySelector("#addChannelModal .modal-title").textContent =
        "Edit Channel";
    document.getElementById("saveChannelBtn").textContent = "Save Changes";
    setEditingItem({ type: "channel", original: channel });
    showChannelModal();
}

export function removeChannel(name, configuration) {
    const index = configuration.channels.findIndex(
        (channel) => channel.name === name,
    );
    if (index !== -1) {
        configuration.channels.splice(index, 1);
        saveConfiguration(configuration);
        populateSidebar(configuration);
    }
}

// Friend management
export function addFriend(name, pubKey, configuration, editingItem = getEditingItem()) {
    if (name.length < 6 || name.length > 36) {
        alert("Friend name must be between 6 and 36 characters");
        return false;
    }

    if (!/[A-Za-z0-9+/=]{32,96}/.test(pubKey)) {
        alert(
            "Public key must be in base64 format and between 32-96 characters",
        );
        return false;
    }

    const isEdit = editingItem && editingItem.type === "friend";
    const nameExists = configuration.friends.some(
        (friend) =>
            friend.name === name &&
            (!isEdit || friend.name !== editingItem.original.name),
    );

    if (nameExists) {
        alert("Friend with this name already exists");
        return false;
    }

    if (isEdit) {
        const index = configuration.friends.findIndex(
            (friend) => friend.name === editingItem.original.name,
        );
        if (index !== -1) {
            configuration.friends[index] = { name, pubKey };
        }
    } else {
        configuration.friends.push({ name, pubKey });
    }

    saveConfiguration(configuration);
    populateSidebar(configuration);
    return true;
}

export function editFriend(friend) {
    setEditingItem({
        original: friend,
        type: "friend",
    });
    const friendNameInput = document.getElementById("friendName");
    const friendPubKeyInput = document.getElementById("friendPubKey");
    const saveButton = document.getElementById("saveFriendBtn");
    const modalTitle = document.querySelector("#addFriendModal .modal-title");

    friendNameInput.value = friend.name;
    friendPubKeyInput.value = friend.pubKey;
    modalTitle.textContent = "Edit Friend";
    saveButton.textContent = "Save Changes";

    showFriendModal();
}

export function removeFriend(name, configuration) {
    const index = configuration.friends.findIndex(
        (friend) => friend.name === name,
    );
    if (index !== -1) {
        configuration.friends.splice(index, 1);
        saveConfiguration(configuration);
        populateSidebar(configuration);
    }
}

// Create action button helper
function createActionButton(text, clickHandler, isEdit = false) {
    const btn = document.createElement("button");
    btn.className = `btn btn-sm px-0 py-0 ${isEdit ? "me-1" : ""}`;
    btn.style.backgroundColor = "#000033";
    btn.style.color = "#FFFFFF";
    btn.style.width = "15px";
    btn.style.height = "15px";
    btn.style.fontSize = "0.75rem";
    btn.style.lineHeight = "1";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";

    if (text === "edit-2") {
        const icon = document.createElement("i");
        icon.setAttribute("data-feather", "edit-2");
        icon.style.width = "10px";
        icon.style.height = "10px";
        btn.appendChild(icon);
    } else {
        btn.innerHTML = text;
    }

    btn.addEventListener("click", clickHandler);
    return btn;
}

// Populate sidebar with channels and friends
export function populateSidebar(config) {
    const channelsList = document.getElementById("channels-list");
    const friendsList = document.getElementById("friends-list");

    // Clear existing lists
    channelsList.innerHTML = "";
    friendsList.innerHTML = "";

    // Populate channels
    config.channels.forEach((channel) => {
        const li = document.createElement("li");
        li.className =
            "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        li.style.cursor = "pointer";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = channel.name;
        li.appendChild(nameSpan);

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "d-flex gap-1";

        // Edit button
        const editBtn = createActionButton(
            "edit-2",
            (e) => {
                e.stopPropagation();
                editChannel(channel);
            },
            true,
        );
        buttonContainer.appendChild(editBtn);

        // Remove button
        const removeBtn = createActionButton("×", (e) => {
            e.stopPropagation();
            if (
                confirm(
                    `Are you sure you want to remove the channel "${channel.name}"?`,
                )
            ) {
                removeChannel(channel.name, config);
            }
        });
        buttonContainer.appendChild(removeBtn);

        li.appendChild(buttonContainer);

        // Click handler for messages
        li.addEventListener("click", (e) => {
            if (e.target.tagName === "BUTTON") return;
            document.querySelectorAll(".list-group-item").forEach((item) => {
                item.classList.remove("active");
            });
            li.classList.add("active");
            displayMessages(channel.name);
            enableMessageInput(config);
        });

        channelsList.appendChild(li);
    });

    // Populate friends
    config.friends.forEach((friend) => {
        const li = document.createElement("li");
        li.className =
            "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        li.style.cursor = "pointer";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = friend.name;
        li.appendChild(nameSpan);

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "d-flex gap-1";

        // Edit button
        const editBtn = createActionButton(
            "edit-2",
            (e) => {
                e.stopPropagation();
                editFriend(friend);
            },
            true,
        );
        buttonContainer.appendChild(editBtn);

        // Remove button
        const removeBtn = createActionButton("×", (e) => {
            e.stopPropagation();
            if (
                confirm(
                    `Are you sure you want to remove "${friend.name}" from your friends list?`,
                )
            ) {
                removeFriend(friend.name, config);
            }
        });
        buttonContainer.appendChild(removeBtn);

        li.appendChild(buttonContainer);

        // Click handler for messages
        li.addEventListener("click", (e) => {
            if (e.target.tagName === "BUTTON") return;
            document.querySelectorAll(".list-group-item").forEach((item) => {
                item.classList.remove("active");
            });
            li.classList.add("active");
            displayMessages(friend.name);
            enableMessageInput(config);
        });

        friendsList.appendChild(li);
    });

    // Initialize Feather icons
    feather.replace();
}
