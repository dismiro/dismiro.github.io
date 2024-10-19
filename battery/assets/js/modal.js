
document.addEventListener("DOMContentLoaded", (event) => {
  loadTable(`./assets/tabs/${document.getElementById('typeAcc').value}.json`)
});

var exampleModal = document.getElementById('modalId')
exampleModal.addEventListener('show.bs.modal', function (event) {
  // console.log(event.relatedTarget.parentNode.data)
  const target = event.relatedTarget
  const title = exampleModal.querySelector('#NameDevice')
  const count = exampleModal.querySelector('#numCount')
  const amperageClosed = exampleModal.querySelector('#amperageClosed')
  const amperageOpened = exampleModal.querySelector('#amperageOpened')
  const alwaysConnected = exampleModal.querySelector('#alwaysConnected')
  
  
  if (target.dataset.role==="create"){
  title.textContent = target.getAttribute('data-bs-device')
  } else if (target.dataset.role==="edit") {
    const data = target.parentNode.data
    title.textContent = data.name
    count.textContent = data.count
    amperageClosed.textContent = data.amperageClosed
    amperageOpened.textContent = data.amperageOpened
    alwaysConnected.checked = data.alwaysConnected
  }
})

exampleModal.addEventListener('hidden.bs.modal', function (event) {
  document.getElementById('numCount').textContent = 1
})

  var modalForm = document.getElementById('modalForm')
  modalForm.addEventListener('submit', function (event) {
    event.preventDefault()    
    if (!modalForm.checkValidity()) {
            
            event.stopPropagation()
            console.log('unvalidate')
            return
        }
          // modalForm.classList.add('was-validated')
          const deviceList = document.getElementById('device-list')
          // const formData = new FormData(modalForm)
          const nameDevice = document.getElementById('NameDevice').textContent
          const count = parseInt(document.getElementById('numCount').textContent);
          const amperageClosed = parseFloat(document.getElementById('amperageClosed').textContent);;
          const amperageOpened = parseFloat(document.getElementById('amperageOpened').textContent);;
          const groupNumber = parseInt(document.getElementById('groupBtn').value)
          const alwaysConnected = document.getElementById('alwaysConnected').checked
          const li1 = document.createElement('li')
          const span = document.createElement('span')
          const group = document.createElement('i')
          const groupBtn = document.createElement('button')
          const edit = document.createElement('i')
          const editBtn = document.createElement('button')
          const remove = document.createElement('i')
          const removeBtn = document.createElement('button')
          li1.classList.add('list-group-item', 'd-flex', 'align-items-center', 'py-2')
          li1.textContent = `${nameDevice}`
          span.classList.add('badge', 'rounded-3', 'bg-secondary', 'ms-auto', 'me-2')
          span.textContent= `${amperageClosed} А х ${count} шт.`
          group.classList.add('bi', `bi-${groupNumber}-square`, 'fs-4', 'opacity-80')
          edit.classList.add('bx', 'bx-edit-alt', 'fs-4', 'opacity-80', 'edit')
          remove.classList.add('bx', 'bx-trash', 'fs-4', 'opacity-80', 'remove')

          groupBtn.classList.add('btn', 'btn-secondary', 'btn-icon', 'btn-sm' ,'border-0', 'bg-transparent')
          groupBtn.append(group)
          editBtn.classList.add('btn', 'btn-secondary', 'btn-icon', 'btn-sm' ,'border-0', 'bg-transparent')
          editBtn.append(edit)
          removeBtn.classList.add('btn', 'btn-secondary', 'btn-icon', 'btn-sm' ,'border-0', 'bg-transparent')
          removeBtn.append(remove)

          editBtn.setAttribute('data-bs-toggle','modal')
          editBtn.setAttribute('data-bs-target','#modalId')
          editBtn.setAttribute('data-role','edit')

          li1.appendChild(span)
          li1.appendChild(groupBtn)
          li1.appendChild(editBtn)
          li1.appendChild(removeBtn)
          
        li1.data = {name: nameDevice,
                    count: count,
                    amperageClosed: amperageClosed,
                    amperageOpened: amperageOpened,
                    groupNumber: groupNumber,
                    alwaysConnected: alwaysConnected   
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
  if (classList.includes('edit'))  console.log(event.target.parentNode.parentNode.data)
  if (classList.includes('remove')) event.target.parentNode.parentNode.remove()
})


var settingForm = document.getElementById('settingForm')
settingForm.addEventListener('submit', function (event) {
  event.preventDefault()    
  if (!settingForm.checkValidity()) {
          event.stopPropagation()
          console.log('unvalidate')
          return
      }
        const outputResult = document.getElementById('outputResult')
        outputResult.innerHTML= ''
        const list = Array.from(document.getElementById('device-list').children)
        outputResult.appendChild(makeOutputRow('Количество устройств', countDevices(list)))
        outputResult.appendChild(makeOutputRow('Потребляемый ток', sumAmperage(list), 'А'))
        outputResult.appendChild(makeOutputRow('Расч. емкость(8ч.)', sumAmperage(list) * 8, 'А/ч'))
        outputResult.appendChild(makeOutputRow('Коэффициент 0,42', Math.round(sumAmperage(list) * 8 / 0.42 * 100) /100, 'А/ч'))
        outputResult.appendChild(makeOutputRow('Коэффициент 0,8', (Math.round(sumAmperage(list) * 8 / 0.42 / 0.8 * 100) /100), 'А/ч'))
        outputResult.appendChild(makeOutputRow('Коэффициент 1,25', (Math.round(sumAmperage(list) * 8 / 0.42 / 0.8 * 1.25* 100) /100), 'А/ч'))
        const type = document.getElementById('typeAcc')
        const capacity = (Math.round(sumAmperage(list) * 8 / 0.42 / 0.8 * 1.25* 100) /100)
        outputResult.appendChild(makeOutputRow('Аккумулятор', (findAcc(capacity)),''))
      }, false)

document.getElementById('typeAcc').addEventListener('change', function() {
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
  const searchValue =  table.filter((item) => item.capacity >= capacity)[0]
  return `${searchValue.name} - ${searchValue.capacity}А/ч ` 
}



const numCount = document.getElementById('numCount');
const plusBtn = document.getElementById('buttonPlus');
const minusBtn = document.getElementById('buttonMinus');
plusBtn.addEventListener('click',  function() {
  numCount.textContent = parseInt(numCount.textContent) + 1;
})
minusBtn.addEventListener('click', function() {
  let num =  parseInt(numCount.textContent)
  if (num > 0)  numCount.textContent = num - 1;
})

document.getElementById('devicesToAdded').addEventListener('click', function(event) {
document.getElementById('NameDevice').textContent = event.target.textContent
})

document.getElementById('canEdit').addEventListener('click', function(event) {
  this.classList.toggle('active')
  const editable = document.getElementById('NameDeviceDiv').contentEditable
  document.getElementById('NameDeviceDiv').contentEditable = editable !== 'true'? 'true':'false'
  document.getElementById('amperageClosed').contentEditable = editable !== 'true'? 'true':'false'
  document.getElementById('amperageOpened').contentEditable = editable !== 'true'? 'true':'false'
  })

document.getElementById('countGroups').addEventListener('change', function() {
  const listGroups = document.getElementById('listGroups')
  const selectGroup = document.getElementById('selectGroup')

  selectGroup
  listGroups.innerHTML=''
  const countGroups = parseInt(this.value)
  if(countGroups == 1){
    selectGroup.classList.add('d-none')
  } else {
    selectGroup.classList.remove('d-none')
  }
  for (let i = 1; i <= countGroups; i++){
    const a = document.createElement('a')
    a.classList.add('dropdown-item')
    a.textContent = 'Батарея №'+ i
    a.value = i
    listGroups.appendChild(a)
  }
})
document.getElementById('listGroups').addEventListener('click', function(event) {
  const groupBtn = document.getElementById('groupBtn') 
  groupBtn.textContent =  event.target.textContent
  groupBtn.value =  event.target.value
})