document.addEventListener("DOMContentLoaded", (event) => {
  loadTable(`./assets/tabs/${document.getElementById('typeAcc').value}.json`)
});

document.getElementById('typeAcc').addEventListener('change', function() {
  loadTable(`./assets/tabs/${this.value}.json`)
})

var exampleModal = document.getElementById('modalId')
exampleModal.addEventListener('show.bs.modal', function (event) {
  const target = event.relatedTarget
  const title = exampleModal.querySelector('#NameDevice')
  const count = exampleModal.querySelector('#numCount')
  const amperageClosed = exampleModal.querySelector('#amperageClosed')
  const amperageOpened = exampleModal.querySelector('#amperageOpened')
  const alwaysConnected = exampleModal.querySelector('#alwaysConnected')
  const groupBtn = document.getElementById('groupBtn') 
  const saveEditBtn = document.getElementById('saveEditBtn')
  const addBtn = document.getElementById('submitModal')
  
  if (target.dataset.role==="create"){
  title.textContent = target.getAttribute('data-bs-device')
  count.textContent = target.getAttribute('data-count')
  amperageClosed.textContent = target.getAttribute('data-amperageClosed')
  amperageOpened.textContent = target.getAttribute('data-amperageOpened')
  alwaysConnected.checked = target.getAttribute('data-alwaysConnected')
  saveEditBtn.classList.add('d-none')
  addBtn.classList.remove('d-none')
  
  } else if (target.dataset.role==="edit") {
    const data = target.parentNode.data
    title.textContent = data.name
    count.textContent = data.count
    amperageClosed.textContent = data.amperageClosed
    amperageOpened.textContent = data.amperageOpened
    alwaysConnected.checked = data.alwaysConnected
    groupBtn.textContent = 'Батарея №'+ data.groupNumber
    groupBtn.value =  data.groupNumber
    saveEditBtn.classList.remove('d-none')
    saveEditBtn.editedElement = event.relatedTarget.parentNode
    addBtn.classList.add('d-none')
  }
})

// exampleModal.addEventListener('hidden.bs.modal', function (event) {
//   document.getElementById('numCount').textContent = 1
// })

var modalForm = document.getElementById('modalForm')
document.getElementById('submitModal').addEventListener('click', function (event) { 
  const deviceList = document.getElementById('device-list')
  deviceList.appendChild(fillDevice())
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
  if (classList.includes('remove')) event.target.parentNode.parentNode.remove()
  if (classList.includes('changeGroup')) {
    const target = event.target
    const currentGroup = parseInt(target.parentNode.parentNode.data.groupNumber)
    const newGroup = getNewGroup(currentGroup, event.ctrlKey)
    target.parentNode.parentNode.data.groupNumber = newGroup
    target.classList.remove(`bi-${currentGroup}-square`)
    target.classList.add(`bi-${newGroup}-square`)
  }
  
})
function getNewGroup(currentGroup, ctrlKey) {
  const countGroups = parseInt(document.getElementById('countGroups').value)
  if (ctrlKey) return currentGroup <= 1 ?  countGroups : currentGroup - 1
  return currentGroup >= countGroups ?  1 : currentGroup + 1
}

var settingForm = document.getElementById('settingForm')
settingForm.addEventListener('submit', function (event) {
  event.preventDefault()    
  if (!settingForm.checkValidity()) {
          event.stopPropagation()
          console.log('unvalidate')
          return
      }
 fillResult(1)
 fillResult(2)
 fillResult(3)
 fillResult(4)
        
      }, false)


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

function sumAmperage(list, state='Closed') {
  return list.reduce((acc,item) => acc + (item.data['amperage' + state] * item.data.count), 0);
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
  return searchValue 
}

function getSumAmperageAlwaysConnected(list){
  return (Math.round(list
    .filter((item) => item.data.alwaysConnected ===true)
    .reduce((acc, item) =>  acc + item.data.amperageOpened * item.data.count , 0)* 1000) / 1000)
}

function getMaxCapacity(amp) {
  const boostAmp = parseFloat(document.getElementById('chargerBoost').value)
  return (boostAmp-amp) * 36
}

function checkMaxCapacity(amp, capacity) {
  return getMaxCapacity(amp) > capacity
}

function checkMaxAmperage(amp) {
  const chargerAmp = parseFloat(document.getElementById('chargerNorm').value)
  return amp < chargerAmp
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

// document.getElementById('devicesToAdded').addEventListener('click', function(event) {
// document.getElementById('NameDevice').textContent = event.target.textContent
// })

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
  listGroups.innerHTML=''
  const countGroups = parseInt(this.value)
  showFirstTab()
  clearAllTabs()
  disableAllTabs()
  
  if(countGroups == 1){
    selectGroup.classList.add('d-none')
    document.getElementById('navTabs').classList.add('d-none')
  } else {
    selectGroup.classList.remove('d-none')
    document.getElementById('navTabs').classList.remove('d-none')
  }
  for (let i = 1; i <= countGroups; i++){
    const a = document.createElement('a')
    a.classList.add('dropdown-item')
    a.textContent = 'Батарея №'+ i
    a.value = i
    listGroups.appendChild(a)
    document.getElementById('tabAcc'+ i).classList.remove('d-none')
  }
})

document.getElementById('listGroups').addEventListener('click', function(event) {
  const groupBtn = document.getElementById('groupBtn') 
  groupBtn.textContent =  event.target.textContent
  groupBtn.value =  event.target.value
})

document.getElementById('saveEditBtn').addEventListener('click', function(event) {
  const li = this.editedElement
  li.replaceWith(fillDevice())
})

function fillDevice() {
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
  group.classList.add('bi', `bi-${groupNumber}-square`, 'fs-4', 'opacity-80','changeGroup')
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
  return li1
}

function fillResult(acc) {
  const outputResult = document.getElementById('acc' + acc)
  const list = Array.from(document.getElementById('device-list').children).filter((item) => item.data.groupNumber === acc)
  const amperage = getMaxAmperage(list)
  const hours = getCountHours(isOnlyZagrad(list))
  const ampAlwaysConnected = getSumAmperageAlwaysConnected(list)
  const capacity = (Math.round(amperage * hours / 0.42 / 0.8 * 1.25 * 100) /100)
  const selectAcc = findAcc(capacity)
  outputResult.innerHTML= ''
  outputResult.appendChild(makeOutputRow('Состояние переезда', getWorstState(list),''))
  outputResult.appendChild(makeOutputRow('Количество устройств', countDevices(list)))
  outputResult.appendChild(makeOutputRow('Потребляемый ток', Math.round(amperage*100)/100, 'А'))
  outputResult.appendChild(makeOutputRow(`Расч. емкость(${hours}ч.)`, Math.round(amperage * hours * 100)/100, 'А/ч'))
  outputResult.appendChild(makeOutputRow('Коэффициент 0,42', Math.round(amperage * hours / 0.42 * 100) /100, 'А/ч'))
  outputResult.appendChild(makeOutputRow('Коэффициент 0,8', (Math.round(amperage * hours / 0.42 / 0.8 * 100) /100), 'А/ч'))
  outputResult.appendChild(makeOutputRow('Коэффициент 1,25', capacity, 'А/ч'))
  outputResult.appendChild(makeOutputRow('Аккумулятор', `${selectAcc.name} - ${selectAcc.capacity}`,'А/ч'))
  outputResult.appendChild(makeOutputRow('Ток при наличии внешнего питания', `${ampAlwaysConnected}А - 
              ${checkMaxAmperage(ampAlwaysConnected)?'в норме': 'превышен'}`,''))
  outputResult.appendChild(makeOutputRow('Макс. допустимая емкость', `${Math.round(getMaxCapacity(ampAlwaysConnected)*100)/100} А/ч -
              ${checkMaxCapacity(ampAlwaysConnected, selectAcc.capacity)?'в норме': 'превышен'}`,''))
  // const message = (checkMaxCapacity(ampAlwaysConnected, selectAcc.capacity) 
  //                 & checkMaxAmperage(ampAlwaysConnected))? 'выполняются':'не выполняются'
  outputResult.appendChild(makeOutputRow('Требования к батарее',(checkMaxCapacity(ampAlwaysConnected, selectAcc.capacity) 
                                                              & checkMaxAmperage(ampAlwaysConnected))? 'выполняются':'не выполняются' ,''))
}

function getCountHours(isOnlyZG){
  return isOnlyZG ? 2 : 8
}

function getMaxAmperage(list) {
  const closedAmp = sumAmperage(list, 'Closed')
  const openedAmp = sumAmperage(list, 'Opened')
  return (closedAmp >= openedAmp) ? closedAmp : openedAmp 
}

function getWorstState(list) {
  const closedAmp = sumAmperage(list, 'Closed')
  const openedAmp = sumAmperage(list, 'Opened')
  return (closedAmp >= openedAmp) ? 'Закрыт' : "Открыт" 
}
function isOnlyZagrad(list){
  const fullLength = list.length
  if (fullLength === 0) return false
  const filteredLength = list.filter((item) => item.data.name.includes('Заград')).length
  return (fullLength === filteredLength)
}

function showFirstTab() {
  const triggerFirstTab = document.querySelector('#navTabs li:first-child a')
  bootstrap.Tab.getInstance(triggerFirstTab).show() 
 }

 function clearAllTabs() {
  document.getElementById('acc1').textContent = ''
  document.getElementById('acc2').textContent = ''
  document.getElementById('acc3').textContent = ''
  document.getElementById('acc4').textContent = ''
 }
 function disableAllTabs() {
  document.getElementById('tabAcc1').classList.add('d-none')
  document.getElementById('tabAcc2').classList.add('d-none')
  document.getElementById('tabAcc3').classList.add('d-none')
  document.getElementById('tabAcc4').classList.add('d-none')
 }
