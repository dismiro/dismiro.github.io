var exampleModal = document.getElementById('modalId')
exampleModal.addEventListener('show.bs.modal', function (event) {
  // Button that triggered the modal
  var button = event.relatedTarget
  // Extract info from data-bs-* attributes
  var recipient = button.getAttribute('data-bs-device')
  // If necessary, you could initiate an AJAX request here
  // and then do the updating in a callback.
  //
  // Update the modal's content.
  var modalTitle = exampleModal.querySelector('#NameDevice')
  // var modalBodyInput = exampleModal.querySelector('#device')
  // console.log(exampleModal)

  modalTitle.value = recipient
// modalBodyInput.textContent = recipient
  // modalBodyInput.value = recipient
})



  // const forms = document.querySelectorAll('.needs-validation')
  // console.log
  // Array.from(forms)
  //   .forEach(function (form) {
  //     form.addEventListener('submit', function (event) {
  //     if (!form.checkValidity()) {
  //         event.preventDefault()
  //         event.stopPropagation()
  //     }
    
  //       form.classList.add('was-validated')
  //     }, false)
  //   })
  var modalForm = document.getElementById('modalForm')
  modalForm.addEventListener('submit', function (event) {
    event.preventDefault()    
    if (!modalForm.checkValidity()) {
            
            event.stopPropagation()
            console.log('unvalidate')
            return
        }
      
          // form.classList.add('was-validated')

          const deviceList = document.getElementById('device-list')
          const div = document.createElement('div')
          div.className ='row py-1'
          div.innerHTML = `<button type="button" class="btn btn-outline-light text-start w-100 py-1 added">"Оборудование"<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></button>`
          deviceList.append(div)
          // exampleModal.style.display = 'none';



        }, false)