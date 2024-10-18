// Данный скрипт поможет подключить навигацию 
fetch('../assets/templates/navigation.html')
.then(response => response.text())
.then(navigation => document.getElementById('navbar').innerHTML = navigation);

window.onload = function() {
    const links = document.querySelectorAll('nav ul li a');
    const currentUrl = window.location.href;

    links.forEach(function(link) {
        if(link.href === currentUrl) {
            link.classList.add("active");
        }
    });
};