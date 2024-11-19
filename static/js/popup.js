// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, preparing to show alert');
    // Show a simple alert after a short delay
    setTimeout(function() {
        console.log('Showing alert now');
        alert('Hello');
    }, 500);
});
