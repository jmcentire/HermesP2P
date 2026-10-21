// UI-related functionality
import {
    addChannel,
    addFriend,
    populateSidebar,
    handleSaveExit,
    downloadIdentity,
    getEditingItem,
    clearEditingItem,
    updateProfileName,
} from "./config.js";
import { generateChannelKey } from "./crypto.js";
import {
    disableMessageInput,
    displayMessages,
} from "./messages.js";

// UI state management
let channelModal = null;
let friendModal = null;
let profileModal = null;

// Initialize UI components
export function initializeUI(configuration) {
    // Initialize Feather Icons
    feather.replace();

    // Initialize modals
    channelModal = new bootstrap.Modal(
        document.getElementById("addChannelModal"),
    );
    friendModal = new bootstrap.Modal(
        document.getElementById("addFriendModal"),
    );
    profileModal = new bootstrap.Modal(
        document.getElementById("editProfileModal"),
    );

    // Populate profile display
    updateProfileDisplay(configuration);

    // Initialize the sidebar
    populateSidebar(configuration);

    // Initially disable message input and show welcome message
    disableMessageInput();
    displayMessages();

    setupEventListeners(configuration);
    if (window.location.hash === "#restore") {
        document.getElementById("identityBackup").open = true;
        document.getElementById("importConfig").focus();
    }
    document.getElementById('backupIdentityBtn')?.addEventListener('click', () => {
        downloadIdentity();
        document.getElementById('backupStatus').textContent = 'Backup download requested. Keep the file somewhere private; this tab stays open.';
    });
    document.getElementById('reloadClientBtn')?.addEventListener('click', () => window.location.reload());
    document.getElementById('messages').addEventListener('click', event => {
        if (event.target.id === 'startPrivateBtn') document.getElementById('addFriendBtn').click();
        if (event.target.id === 'startGeneralBtn') {
            if (!configuration.channels.some(c => c.name === 'General')) {
                if (configuration.friends.some(f => f.name === 'General')) { document.getElementById('addChannelBtn').click(); return; }
                addChannel('General', '', configuration);
            }
            for (const item of document.querySelectorAll('#channels-list .list-group-item')) {
                if (item.querySelector('span')?.textContent === 'General') { item.click(); break; }
            }
        }
    });

    // sessionStorage survives reload/import within the tab and is cleared by Save & Exit.
    // Browser tab closure ends the storage session; never erase unrelated origin storage.

}

// Setup all event listeners
export function setupEventListeners(configuration) {
    // Channel Modal Events
    setupChannelModalEvents(configuration);

    // Friend Modal Events
    setupFriendModalEvents(configuration);

    // Generate Key Button
    document.getElementById("generateKeyBtn").addEventListener("click", () => {
        const channelKey = document.getElementById("channelKey");
        channelKey.value = generateChannelKey();
    });

    // Profile Events
    setupProfileEvents(configuration);

    // Save & Exit Button
    const saveExitBtn = document.getElementById("saveExitBtn");
    if (saveExitBtn) {
        saveExitBtn.addEventListener("click", handleSaveExit);
    }

    // Message form submit is handled by enableMessageInput() when a chat is selected
}

// Channel Modal Events Setup
function setupChannelModalEvents(configuration) {
    document.getElementById("addChannelBtn").addEventListener("click", () => {
        document.getElementById("channelName").value = "";
        document.getElementById("channelKey").value = "";
        clearEditingItem();
        showChannelModal();
    });

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

    const saveChannelBtn = document.getElementById("saveChannelBtn");
    if (saveChannelBtn) {
        saveChannelBtn.addEventListener("click", () => {
            const channelName = document.getElementById("channelName").value;
            const channelKey = document.getElementById("channelKey").value;
            if (addChannel(channelName, channelKey, configuration)) {
                clearEditingItem();
                document.getElementById("channelName").value = "";
                document.getElementById("channelKey").value = "";
                hideChannelModal();
            }
        });
    }
}

// Friend Modal Events Setup
function setupFriendModalEvents(configuration) {
    document.getElementById("addFriendBtn").addEventListener("click", () => {
        document.getElementById("friendName").value = "";
        document.getElementById("friendPubKey").value = "";
        clearEditingItem();
        showFriendModal();
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

    const saveFriendBtn = document.getElementById("saveFriendBtn");
    if (saveFriendBtn) {
        saveFriendBtn.addEventListener("click", () => {
            const friendName = document.getElementById("friendName").value;
            const friendPubKey = document.getElementById("friendPubKey").value;
            if (
                addFriend(
                    friendName,
                    friendPubKey,
                    configuration,
                    getEditingItem(),
                )
            ) {
                clearEditingItem();
                document.getElementById("friendName").value = "";
                document.getElementById("friendPubKey").value = "";
                hideFriendModal();
            }
        });
    }
}

function updateProfileDisplay(configuration) {
    document.getElementById("profileName").textContent = configuration.user.name;
    document.getElementById("profilePubKey").textContent = configuration.user.pubKey;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const status = document.getElementById('backupStatus');
        if (status) status.textContent = 'Contact key copied. Share it with the person you want to message.';
    }).catch(() => {
        // Fallback for older browsers
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    });
}

function setupProfileEvents(configuration) {
    document.getElementById("editProfileBtn").addEventListener("click", () => {
        document.getElementById("profileNameInput").value = configuration.user.name;
        document.getElementById("profilePubKeyDisplay").value = configuration.user.pubKey;
        profileModal.show();
    });

    document.getElementById("copyPubKeyBtn").addEventListener("click", () => {
        copyToClipboard(configuration.user.pubKey);
    });

    document.getElementById("copyPubKeyModalBtn").addEventListener("click", () => {
        copyToClipboard(configuration.user.pubKey);
    });

    document.getElementById("saveProfileBtn").addEventListener("click", () => {
        const newName = document.getElementById("profileNameInput").value.trim();
        if (updateProfileName(newName, configuration)) {
            updateProfileDisplay(configuration);
            profileModal.hide();
        }
    });
}

export function showFriendModal() {
    friendModal.show();
}

export function hideFriendModal() {
    friendModal.hide();
}

export function showChannelModal() {
    channelModal.show();
}

export function hideChannelModal() {
    channelModal.hide();
}
