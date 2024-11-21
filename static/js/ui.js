import { displayMessages, enableMessageInput } from './messages.js';

// Create action button helper
function createActionButton(text, clickHandler, isEdit = false) {
    const btn = document.createElement("button");
    btn.className = `btn btn-sm px-0 py-0 ${isEdit ? 'me-1' : ''}`;
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

// Channel management
export function addChannel(name, key = '', configuration, editingItem = null) {
    if (name.length < 6 || name.length > 36) {
        alert('Channel name must be between 6 and 36 characters');
        return false;
    }
    
    const isEdit = editingItem && editingItem.type === 'channel';
    const nameExists = configuration.channels.some(channel => {
        if (isEdit && channel === editingItem.original) {
            return false;
        }
        return channel.name === name;
    });
    
    if (nameExists) {
        alert('Channel with this name already exists');
        return false;
    }

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

    if (isEdit) {
        const index = configuration.channels.findIndex(
            channel => channel === editingItem.original
        );
        if (index !== -1) {
            configuration.channels[index] = { name, ...(key && { key }) };
        }
    } else {
        configuration.channels.push({ name, ...(key && { key }) });
    }
    
    saveConfiguration(configuration);
    populateSidebar(configuration);
    return true;
}

export function removeChannel(name, configuration) {
    const index = configuration.channels.findIndex(channel => channel.name === name);
    if (index !== -1) {
        configuration.channels.splice(index, 1);
        saveConfiguration(configuration);
        populateSidebar(configuration);
    }
}

// Friend management
export function addFriend(name, pubKey, configuration, editingItem = null) {
    if (name.length < 6 || name.length > 36) {
        alert('Friend name must be between 6 and 36 characters');
        return false;
    }
    
    if (!/[A-Za-z0-9+/=]{32,96}/.test(pubKey)) {
        alert('Public key must be in base64 format and between 32-96 characters');
        return false;
    }
    
    const isEdit = editingItem && editingItem.type === 'friend';
    const nameExists = configuration.friends.some(friend => 
        friend.name === name && 
        (!isEdit || friend.name !== editingItem.original.name)
    );
    
    if (nameExists) {
        alert('Friend with this name already exists');
        return false;
    }

    if (isEdit) {
        const index = configuration.friends.findIndex(
            friend => friend.name === editingItem.original.name
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

export function removeFriend(name, configuration) {
    const index = configuration.friends.findIndex(friend => friend.name === name);
    if (index !== -1) {
        configuration.friends.splice(index, 1);
        saveConfiguration(configuration);
        populateSidebar(configuration);
    }
}

// Save configuration helper
export function saveConfiguration(config) {
    sessionStorage.setItem('hp2pConfig', JSON.stringify(config));
}

// Populate sidebar with channels and friends
export function populateSidebar(config) {
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
        const editBtn = createActionButton("edit-2", (e) => {
            e.stopPropagation();
            editChannel(channel);
        }, true);
        buttonContainer.appendChild(editBtn);

        // Remove button
        const removeBtn = createActionButton("×", (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to remove the channel "${channel.name}"?`)) {
                removeChannel(channel.name, config);
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
            enableMessageInput(config);
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
        const editBtn = createActionButton("edit-2", (e) => {
            e.stopPropagation();
            editFriend(friend);
        }, true);
        buttonContainer.appendChild(editBtn);

        // Remove button
        const removeBtn = createActionButton("×", (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to remove "${friend.name}" from your friends list?`)) {
                removeFriend(friend.name, config);
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
            enableMessageInput(config);
        });

        friendsList.appendChild(li);
    });
    
    // Initialize Feather icons
    feather.replace();
}
