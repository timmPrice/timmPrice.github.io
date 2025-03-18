const textElement = document.getElementById('text');
const text = "Tim Price";
let index = 0;

function typeWriter() {
    if (index < text.length) {
        textElement.innerHTML += text[index];
        index++;
        setTimeout(typeWriter, 50);  // typing speed 
    }
}

window.onload = typeWriter();
