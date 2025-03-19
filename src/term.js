function typeWriter(elementId, text, speed = 50) {
    const textElement = document.getElementById(elementId);
    let index = 0;

    function write() {
        if (index < text.length) {
            textElement.innerHTML += text[index];
            index++;
            setTimeout(write, speed);
        }
    }

    write();
}

// Example usage on different pages:
window.onload = () => {
    const textElement = document.getElementById('text');
    const text = textElement.getAttribute('data-title');
    typeWriter('text', text);
};
