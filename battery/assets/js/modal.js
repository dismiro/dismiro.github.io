var exampleModal = document.getElementById('modalId')

exampleModal.addEventListener('show.bs.modal', function (event) {
  // Button that triggered the modal
  var button = event.relatedTarget
  // Extract info from data-bs-* attributes
  var recipient = button.getAttribute('data-bs-device')
  var modalTitle = exampleModal.querySelector('#NameDevice')
  // var modalBodyInput = exampleModal.querySelector('#device')
  // console.log(exampleModal)

  modalTitle.value = recipient
// modalBodyInput.textContent = recipient
  // modalBodyInput.value = recipient
})

exampleModal.addEventListener('hide.bs.modal', function (event) {
  // alert('close')
  modalForm.classList.remove('was-validated')
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
          modalForm.classList.add('was-validated')
          const deviceList = document.getElementById('device-list')
          // const div = document.createElement('div')
          // div.className ='row py-1'
          const formData = new FormData(modalForm)
          const nameDevice = formData.get('NameDevice');
          const count = formData.get('CountDevice');
          const li = `<li class="list-group-item d-flex align-items-center py-2">${nameDevice}
          <span class="badge rounded-3 bg-secondary ms-auto me-2">${count} шт. </span>
          <i class='bx bx-edit-alt fs-4 opacity-70 edit'></i>
          <i id="yourElemId" class='bx bx-trash fs-4 opacity-70 ms-2 remove'></i>
        </li>`
          deviceList.insertAdjacentHTML('beforeend', li)

        }, false)
const deviceList = document.getElementById('device-list')
deviceList.addEventListener('mouseover', function(event) {
  const classList = event.target.classList.value;
  if (classList.includes('edit')) event.target.classList.add('text-success-emphasis')
  if (classList.includes('remove')) event.target.classList.add('text-danger')
})
deviceList.addEventListener('mouseout', function(event) {
  const classList = event.target.classList.value;
  if (classList.includes('edit')) event.target.classList.remove('text-success-emphasis')
  if (classList.includes('remove')) event.target.classList.remove('text-danger')
})
deviceList.addEventListener('click', function(event) {
  const classList = event.target.classList.value;
  if (classList.includes('remove')) event.target.parentNode.remove()
})
