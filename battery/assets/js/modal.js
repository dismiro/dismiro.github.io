
document.addEventListener("DOMContentLoaded", (event) => {
  loadTable(`./assets/tabs/${document.getElementById('typeAcc').value}.json`)
});

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

exampleModal.addEventListener('hidden.bs.modal', function (event) {
  modalForm.reset()
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
          const formData = new FormData(modalForm)
          const nameDevice = formData.get('NameDevice');
          const count = formData.get('CountDevice');
          const li1 = document.createElement('li')
          const span = document.createElement('span')
          const edit = document.createElement('i')
          const remove = document.createElement('i')
          li1.classList.add('list-group-item', 'd-flex', 'align-items-center', 'py-2')
          li1.textContent = `${nameDevice}`
          span.classList.add('badge', 'rounded-3', 'bg-secondary', 'ms-auto', 'me-2')
          span.textContent= `${count} шт.`
          edit.classList.add('bx', 'bx-edit-alt', 'fs-4', 'opacity-70', 'edit')
          remove.classList.add('bx', 'bx-trash', 'fs-4', 'opacity-70', 'ms-2', 'remove')
          li1.appendChild(span)
          li1.appendChild(edit)
          li1.appendChild(remove)
        //   const li = `<li class="list-group-item d-flex align-items-center py-2" data-amperage="0.1">${nameDevice}
        //   <span class="badge rounded-3 bg-secondary ms-auto me-2">${count} шт. </span>
        //   <i class='bx bx-edit-alt fs-4 opacity-70 edit'></i>
        //   <i class='bx bx-trash fs-4 opacity-70 ms-2 remove'></i>
        // </li>`
        // deviceList.insertAdjacentHTML('beforeend', li)
        li1.data = {name: formData.get('NameDevice'),
                    count: formData.get('CountDevice'),
                    amperage: formData.get('amperage')
      }
          deviceList.appendChild(li1)

          
          $('#modalId').modal('hide');
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
  if (classList.includes('edit'))  console.log(event.target.parentNode.data)
  if (classList.includes('remove')) event.target.parentNode.remove()
})


var settingForm = document.getElementById('settingForm')
settingForm.addEventListener('submit', function (event) {
  event.preventDefault()    
  if (!settingForm.checkValidity()) {
          event.stopPropagation()
          console.log('unvalidate')
          return
      }
      // settingForm.classList.remove('was-validated')
        const outputResult = document.getElementById('outputResult')
        outputResult.innerHTML= ''
        const list = Array.from(document.getElementById('device-list').children)
        outputResult.appendChild(makeOutputRow('Количество устройств', countDevices(list)))
        outputResult.appendChild(makeOutputRow('Потребляемый ток', sumAmperage(list), 'А'))
        outputResult.appendChild(makeOutputRow('Расчетная емкость(8ч.)', sumAmperage(list) * 8, 'А/ч'))
        outputResult.appendChild(makeOutputRow('Коэффициент 0,42', Math.round(sumAmperage(list) * 8 / 0.42 * 100) /100, 'А/ч'))
        outputResult.appendChild(makeOutputRow('Коэффициент 0,8', (Math.round(sumAmperage(list) * 8 / 0.42 / 0.8 * 100) /100), 'А/ч'))
        outputResult.appendChild(makeOutputRow('Коэффициент 1,25', (Math.round(sumAmperage(list) * 8 / 0.42 / 0.8 * 1.25* 100) /100), 'А/ч'))
        // loadTable('./assets/tabs/ACK.json')
        const type = document.getElementById('typeAcc')
        console.log(type.table)
        const capacity = (Math.round(sumAmperage(list) * 8 / 0.42 / 0.8 * 1.25* 100) /100)
        outputResult.appendChild(makeOutputRow('Аккумулятор', (findAcc(capacity)),''))
        
        
      }, false)

document.getElementById('typeAcc').addEventListener('change', function() {
  // alert(this.value)
  loadTable(`./assets/tabs/${this.value}.json`)
})

function makeOutputRow(text, num, dim='шт.') {
  const li = document.createElement('li')
  const title = document.createElement('span')
  const result = document.createElement('span')
  li.classList.add('mb-1')
  title.textContent= `${text}: `
  result.textContent = `${num} ${dim}`
  title.classList.add('fw-semibold')
  li.appendChild(title)
  li.appendChild(result)
  return li
}
function countDevices(list) {
return list.reduce((acc,item) => acc + Number(item.data.count), 0);
}
function sumAmperage(list) {
  return list.reduce((acc,item) => acc + (item.data.amperage * item.data.count), 0);
}
function loadTable(path) {
  fetch(path)
  .then(response => {
    if (!response.ok) {
      throw new Error('Ошибка в fetch: ' + response.statusText);
    }
    return response.json();
  })
  .then(jsonData => document.getElementById('typeAcc').table = jsonData)
  .catch(error => console.error('Ошибка при исполнении запроса: ', error));
}

function findAcc(capacity) {
  const table = document.getElementById('typeAcc').table
  return table.filter((item) => item.capacity >= capacity)[0].name
}