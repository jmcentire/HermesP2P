// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Show the modal after a short delay
    setTimeout(function() {
        const welcomeModal = new bootstrap.Modal(document.getElementById('welcomeModal'));
        welcomeModal.show();
    }, 500);
});
