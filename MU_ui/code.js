// Add active class to the current button (highlight it)
var header = document.getElementById("buttons");
var btns = header.getElementsByClassName("btn-outline-primary");

for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener("click", function() {
    // var current = document.getElementsByClassName("active");
    // current[0].className = current[0].className.replace(" active", "");
    // this.className += " active";
    // console.log(this)
    this.classList.toggle('active')
  });
}