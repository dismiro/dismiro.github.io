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
          // const div = document.createElement('div')
          // div.className ='row py-1'
          const formData = new FormData(modalForm)
          const nameDevice = formData.get('NameDevice');
          const count = formData.get('CountDevice');
          const li = `<li class="list-group-item d-flex align-items-center">${nameDevice}
          <span class="badge rounded-3 bg-secondary ms-auto">${count}</span>
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Закрыть"></button>
        </li>`
          deviceList.insertAdjacentHTML('beforeend', li)
        //   div.innerHTML = `
        //   <li class="list-group-item d-flex align-items-center">${nameDevice}
        //   <span class="badge rounded-3 bg-secondary ms-auto">${count}</span>
        // </li>`
        
          //   div.innerHTML = `<div class="alert alert-secondary alert-dismissible fade show" role="alert">
        //   <strong>${nameDevice}</strong> x ${count}
        //   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Закрыть"></button>
        // </div>`
          // deviceList.append(div)
          // exampleModal.style.display = 'none';



        }, false)