// Add active class to the current button (highlight it)
var header = document.getElementById("buttons");
var btns = header.getElementsByClassName("btn-outline-primary");
const typeMU = document.getElementById("typeMU")

typeMU.addEventListener("click", function() {
  btns = document.getElementById("buttons").getElementsByClassName("btn-outline-primary");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove('active')
  } 
  typeMU.innerText = (this.innerText === 'Цифровой') ? 'Буквенный': 'Цифровой'


  const hiddenButtons = document.getElementsByClassName("hidden")
    for (var i = 0; i < hiddenButtons.length; i++) {
      hiddenButtons[i].classList.toggle('d-none')
    } 

});
for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener("click", function() {
    // var current = document.getElementsByClassName("active");
    // current[0].className = current[0].className.replace(" active", "");
    // this.className += " active";
    // console.log(this)
    this.classList.toggle('active')
    // console.log(this)
  });
}