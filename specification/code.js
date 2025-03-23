const BIG_TITLE_MSG = 'Предельная длина имени таблицы не может превышать 31 символа.'
const BANNED_CHAR_MSG= `Наименования не должны содержать следующих символов: / \ ? * [ ] < > ( ) { } .`
const BANNED_CHAR = ['/','\\','?','*', '[',']','<','>','(',')','{','}','.']
   
async function handleFileAsync(e) {
  for (let file of e.target.files){
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    var  wsnames  =  workbook.SheetNames ;
    for (let sheetName of wsnames){
        const  dataFromOneFile  =  XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]).
        map((item) => {
          const value = item['Значение']
          const fixValue = getFixValue(value)
          const length = getLength(fixValue)
          const type = getType(fixValue)
          const count = (typeof item['Количество'] !== 'undefined')? item['Количество']:item['Кол-во']  
          return {'№' : item['__rowNum__'],'Значение':value, 'Кол-во':count,'Тип кабеля':type, 'Длина':length}
        })
      const lstMod = String(file.lastModified)
      const shtName = fixName(String(sheetName).replaceAll(' ',''))
      const id= `${shtName}${lstMod}${Date.now()}`
      const fileName = fixName(file.name.replace('.xlsx', '').replace('.xls', ''))
      const caption = `${fileName} _ ${sheetName}`
      const btnText = (countOccurences(caption, '_') > 1) ? caption.slice(caption.indexOf('_') + 1): caption  
      const table = createTable(dataFromOneFile, btnText)
      document.getElementById('processedData').appendChild(createAccordion(id,btnText,table,true,isEditableNow()))
    }
  }
}
const input_dom_element = document.getElementById("input");
input_dom_element.addEventListener("change", handleFileAsync, false);

const exportBtn = document.getElementById("export");
exportBtn.addEventListener("click", exportFile, false);

function exportFile() {
  const tables = document.getElementById('processedData').getElementsByTagName('table')
  var wb = XLSX.utils.book_new();
  for (let table of tables){
    const sheetName = table.getAttribute('sheet')
    if (!checkTitleLength(sheetName)){
      fillToast(BIG_TITLE_MSG).show()
      return 
    } 
    var ws = XLSX.utils.table_to_sheet(table)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }
  XLSX.writeFile(wb,"Спецификация.xlsx")
}

function tableToJson(table) { 
  var data = [];
  var headRow = table.rows[0]
  for (var i = 1; i < table.rows.length; i++) { 
      var tableRow = table.rows[i]; 
      var rowData = {}; 
      for (var j = 0; j < tableRow.cells.length; j++) { 
          rowData[headRow.cells[j].textContent]= tableRow.cells[j].textContent
      } 
      data.push(rowData); 
  } 
  return data; 
}

function createTable(data, text=''){
  table = document.createElement('table')
  const row = table.insertRow();
  Object.keys(data[0]).forEach(text => {
  const th = document.createElement('th')
  th.classList.add('noWrap')
  th.textContent = text
  row.appendChild(th)
  })
  data.forEach(item=> fillRow(item, table))
  table.classList.add('table','table-sm', 'my-1')
  table.setAttribute('sheet',text)
  return table
}

function fillRow(item, table){
  const editableNow = isEditableNow()
  const row = table.insertRow();
  let i = 0
  Object.values(item).forEach(text => {
  const cell = document.createElement('td')
  cell.textContent = text;
  
  if (i === 1) {
    cell.classList.add('canEdit')
    cell.setAttribute('contentEditable', editableNow)
    cell.setAttribute('canEdit', true)
    cell.setAttribute('edit', 'value')
  }
  if (i === 2) {
    cell.classList.add('canEdit')
    cell.setAttribute('contentEditable', editableNow)
    cell.setAttribute('canEdit', true)
    cell.setAttribute('edit', 'count')
  }
  i += 1
  row.appendChild(cell)
    }
  )
  row.appendChild(createRemoveBtn(editableNow))
}

function createRemoveBtn(editableNow) {
  const removeBtn = document.createElement('button')
  const iBtn = document.createElement('i')
  removeBtn.classList.add('btn', 'btn-secondary', 'btn-icon', 'btn-sm', 'border-0', 'bg-transparent', 'removeBtn')
  if (!editableNow) removeBtn.classList.add('d-none')
  iBtn.classList.add('bx', 'bx-trash', 'fs-4', 'opacity-80')
  removeBtn.appendChild(iBtn)
  return removeBtn
}

const countOccurences = (text, search) => (text.split(search)).length - 1

function compareFn(a,b) {
  let aPoint = 0
  let bPoint = 0
  const itemA = a[0]
  const itemB = b[0]
  const lastElFromItemA = itemA[itemA.length-1]
  const lastElFromItemB = itemB[itemB.length-1]
  const countSimbA = countOccurences(itemA, '*')
  const countSimbB = countOccurences(itemB,'*')

  const compareText =  itemA.localeCompare(itemB,undefined, {numeric:true, sensitivity:"base"})
  const compareLastEl =  lastElFromItemA.localeCompare(lastElFromItemB,undefined, {numeric:true, sensitivity:"base"})
  const compareCount = countSimbA-countSimbB

  if (compareText<0) bPoint += 1;
  else if (compareText>0) aPoint +=1

  if (compareCount<0) bPoint += 10;
  else if (compareCount>0) aPoint +=10

  if (compareLastEl<0) bPoint += 100;
  else if (compareLastEl>0) aPoint +=100

  return aPoint-bPoint
}

function createOutputTable(obj){
  table = document.createElement('table')
  table.innerHTML=`<tr><th>Название</th><th>Сумма</th></tr>`
  var listTypes = Object.entries(obj).sort(compareFn)
  listTypes.forEach(item => {
    const row = table.insertRow();
    item.forEach(text => {
    const cell = row.insertCell();
    cell.innerHTML = text;
 });
});
table.classList.add('table')
table.classList.add('table-sm')
return table
}

const calculate = document.getElementById("calculate");
calculate.addEventListener("click", calculateCable, false);
function calculateCable() {
  const out = document.getElementById('result')
  out.innerHTML = ''

  const collOfTables = document.getElementById('processedData').getElementsByTagName('table')
  const arrOfTables = Array.from(collOfTables)
  const dataJS = arrOfTables.map(tab=> tableToJson(tab))
  const namesOfSheet = arrOfTables.map(tab=> tab.getAttribute('sheet'))
  const sumByTabels = dataJS.map((item) => sumByTypes(item))
  const sumAll = sumByTypes(dataJS.flat())
  for (let i in sumByTabels){
    const tableFromOneList = createOutputTable(sumByTabels[i])
    const title = namesOfSheet[i]
    out.appendChild(createAccordion('acc'+ i + Date.now(),title , tableFromOneList))
  } 
  const tableResult = createOutputTable(sumAll)
  out.appendChild(createAccordion('total' + Date.now(),'Итог:' , tableResult))

  const resultCouplings = document.getElementById('resultCouplings')
  resultCouplings.innerHTML = '<h5>Заполните данные для указанных типов кабеля</h5>'
  const notFoundTypes = checkAvailability(dataJS.flat())

  if (notFoundTypes.length === 0){
    const couplings = dataJS.map((item) => sumCouplings(item))
    resultCouplings.innerHTML = ''
    for (let i in couplings){
      const tableFromOneList = createOutputTable(couplings[i])
      const title = namesOfSheet[i] 
      resultCouplings.appendChild(createAccordion('coupling'+ i + Date.now(),title , tableFromOneList))
    }
    const sumAllCoupling = sumCouplings(dataJS.flat())
    const totalCouplings = createOutputTable(sumAllCoupling)
    resultCouplings.appendChild(createAccordion('totalCouplings','Итог:' , totalCouplings))
  } else {
      notFoundTypes.forEach((item) => {
      const span = document.createElement('span')
      span.classList.add('badge','bg-danger', 'shadow-danger', 'mx-1')
      span.textContent = item
      resultCouplings.appendChild(span)
      })
    }
 }

 function sumByTypes(obj) {
  return obj.reduce((acc,item)=> {
    const currentType = item['Тип кабеля'].replace(' ','')
    const currentLength = item['Длина'] * item['Кол-во']
    if (acc[currentType]){
        acc[currentType] = acc[currentType] + currentLength
        return acc
    }
    acc[currentType] = currentLength
    return acc
}, {})
 }
 function sumCouplings(obj) {
  return obj.reduce((acc,item)=> {
    const currentType = item['Тип кабеля'].replace(' ','')
    const symbols = getSymbols(currentType)
    const type = getTypeWithoutSymbols(currentType)
    const currentParam = setting[symbols] 
    const count = div(item['Длина'], currentParam['Тип'][type]['Строительная длина']) * item['Кол-во']
    if(count !== 0) {  
      const couplingName = currentParam['Тип'][type]['Муфта']
      if (acc[couplingName]){
          acc[couplingName] = acc[couplingName] + count
          return acc
      }
      acc[couplingName] = count
    }
    return acc
}, {})
 }

 function getSymbols(currentType){
  return (countOccurences(currentType, 'х2') === 1) ?
   currentType.slice(currentType.indexOf('х2') + 2) : 'Особый кабель'
 }
 function getTypeWithoutSymbols(currentType){
  return (countOccurences(currentType, 'х2') === 1) ?
   currentType.slice(0, currentType.indexOf('х2')+2) : currentType
 }

function checkAvailability(arr){
  const notFoundTypes = []
  arr.forEach(item => {
    const currentType = getTypeWithoutSymbols(item['Тип кабеля'])
    const symbols = getSymbols(item['Тип кабеля'])
    const symbolsIncludes = Object.keys(setting).includes(symbols)
    if (symbolsIncludes) {
      const isIncludes = Object.keys(setting[symbols]['Тип']).includes(currentType)
      if (!isIncludes) notFoundTypes.push(item['Тип кабеля'])
    }
     else notFoundTypes.push(`Условное обозначение: ${symbols}`)
  }
)
const uniqueNotFoundTypes = notFoundTypes.reduce((acc, item) => {
  if (acc.includes(item)) {
    return acc; 
  }
  return [...acc, item];
}, []);
return uniqueNotFoundTypes
}


function createAccordion(id, text, table, editable=false, editableNow=false) {
  const newDiv = document.createElement("div");
  const title = document.createElement("h3");
  const button = document.createElement("button");
  const div2 = document.createElement("div");
  const accBody = document.createElement("div");

  button.innerHTML= text

  button.setAttribute('type',"button")
  button.setAttribute('data-bs-toggle',"collapse")
  button.setAttribute('data-bs-target',`#${id}`)
  button.setAttribute('aria-expanded',"false")
  button.setAttribute('aria-controls',id)

  button.classList.add("accordion-button","collapsed","py-1")



  title.id = `head${id}`
  title.classList.add("accordion-header")

  newDiv.classList.add('accordion-item')

  div2.classList.add("accordion-collapse", "collapse")

  div2.id = id
  div2.setAttribute('aria-labelledby',`head${id}`)
  div2.setAttribute('data-bs-parent',"accordionDefault")

  accBody.classList.add('accordion-body')
  accBody.appendChild(table)
  
  title.appendChild(button)
 
  if (editable) {
    button.setAttribute('canEdit' ,'true')
    button.setAttribute('edit' ,'title')
    button.classList.add("canEdit")

    const removeTabBtn = document.createElement("button")
    removeTabBtn.classList.add("btn", "btn-outline-secondary", "btn-sm", "border-0", "py-1", "d-none", "removeBtn","removeTable") 
    removeTabBtn.textContent = 'Удалить лист'
    title.appendChild(removeTabBtn)
    
    const addRowBtn = document.createElement('btn')
    addRowBtn.classList.add('btn', 'btn-outline-secondary', 'd-none', 'addRowBtn', 'w-100')
    addRowBtn.textContent = 'Добавить строку'
    accBody.appendChild(addRowBtn)
    if (editableNow) {
      removeTabBtn.classList.remove("d-none")
      addRowBtn.classList.remove("d-none")
      button.contentEditable = true
    }
  }
  
  newDiv.appendChild(title)
  newDiv.appendChild(div2)
  div2.appendChild(accBody)
  return newDiv
}
function isEditableNow(){
 return document.getElementById('canEdit').classList.value.includes('active')
} 


document.getElementById('canEdit').addEventListener('click', function(event) {
  this.classList.toggle('active')

  const elements = document.getElementsByClassName('canEdit')
  const removeBtns = document.getElementById('processedData').getElementsByClassName('removeBtn')
  const addRowBtns = document.getElementById('processedData').getElementsByClassName('addRowBtn')
  const addNewTab = document.getElementsByClassName('addNewTab')
  for (let el of elements) el.contentEditable = this.classList.value.includes('active') ? 'true':'false'

  if (this.classList.value.includes('active')){
    for (let btn of [...removeBtns,...addRowBtns, ...addNewTab]) btn.classList.remove('d-none')  
  }else {
    for (let btn of [...removeBtns, ...addRowBtns,...addNewTab]) btn.classList.add('d-none')  
  }
  })
  
  const processedData = document.getElementById('processedData')
  let observer = new MutationObserver(mutationRecords => {
    const modifiedEl = mutationRecords[0].target
    const canEdit = modifiedEl.parentElement.getAttribute('canEdit')
    const edit =  modifiedEl.parentElement.getAttribute('edit')
    if ((canEdit === 'true') & (edit=== 'value') ) {
      const value = modifiedEl.textContent
      const parent = modifiedEl.parentElement
      parent.nextElementSibling.nextElementSibling.innerHTML = getType(getFixValue(value))
      parent.nextElementSibling.nextElementSibling.nextElementSibling.innerHTML = getLength(getFixValue(value))
    } 
    if ((canEdit === 'true') & (edit=== 'title') ) {
      const newSheetName = modifiedEl.textContent
      modifiedEl.parentNode.parentNode.nextSibling.getElementsByTagName('table')[0].setAttribute('sheet',newSheetName)
      if (!checkTitle(newSheetName)) {
        modifiedEl.textContent = mutationRecords[0].oldValue
        fillToast(BANNED_CHAR_MSG).show()
      }    
      if (!checkTitleLength(newSheetName)) {
        fillToast(BIG_TITLE_MSG).show()
      }  
    }
  });
  
function fillToast(text){
  document.getElementById('toastText').textContent = text 
  return new bootstrap.Toast(document.getElementById('liveToast'))
}

observer.observe(processedData, {
  childList: true, // наблюдать за непосредственными детьми
  subtree: true, // и более глубокими потомками
  characterDataOldValue: true // передавать старое значение в колбэк
});
function fixName(text){
  let fixedName = text
  for (const char of BANNED_CHAR) fixedName = fixedName.replaceAll(char,'')
  return fixedName
}
function checkTitle(sheetName){
  for (const char of BANNED_CHAR) if (sheetName.includes(char)) return false
  return true
}
function checkTitleLength(sheetName){
  return sheetName.length < 32 ? true : false
}

processedData.addEventListener("click", processedDataClick, false);
function processedDataClick(event){
  const classList = event.target.classList.value;
  if (classList.includes('bx-trash')) event.target.parentNode.parentNode.remove()
  if (classList.includes('removeTable')) event.target.parentNode.parentNode.remove()
  if (classList.includes('addRowBtn')) {
    const parentDiv = event.target.parentElement
    const num = parentDiv.querySelectorAll('tr').length
    // const num = parentDiv.getElementsByTagName('table')[0].querySelectorAll('tr').length
    const newRow = {'№' : num,'Значение':'Длина-Кабель', 'Кол-во': 1 ,'Тип кабеля':'Кабель', 'Длина':'Длина'}
    fillRow(newRow, parentDiv.getElementsByTagName('table')[0])
  }
}

function getFixValue(value){
  return value.replace(/\(.\)/g,'')
       .replace(/\(..\)/g,'')
       .replace('x','х')
       .replaceAll(' ','')
}
function getLength(value){
  return value.substring(0,value.indexOf('-'))
}
function getType(value){
  return value.substring(value.indexOf('-') + 1, value.length)
}
function div(val, by){
  return (val - val % by) / by;
}

let setting = {}
const inputJSON = document.getElementById("inputDesignations");
inputJSON.addEventListener("change", loadJson, false);

async function loadJson(e) {
  const file = await e.target.files[0]
  let reader = new FileReader();

  reader.readAsText(file);

  reader.onload = function() {
    const fieldSettings = document.getElementById('fieldSettings')
    fieldSettings.innerHTML = ''
    setting = JSON.parse(reader.result)
    let index = 0
    
    Object.entries(setting).forEach(item=> {
      const settingTable = document.createElement('table')
      settingTable.classList.add('table','table-sm','table-bordered', 'my-1')
      settingTable.innerHTML = '<tr><th>Название</th><th>Тип</th><th>Стр. длина</th><th>Муфта</th></tr>'
      const row = settingTable.insertRow();
      const dataValue = item[1]
      const types = Object.entries(dataValue['Тип']) 
      row.appendChild(createCell(dataValue["Название"], types.length))
      types.forEach((line) => {
        const row2 = settingTable.insertRow();
        row2.appendChild(createCell(line[0]))
        row2.appendChild(createCell(line[1]['Строительная длина']))
        row2.appendChild(createCell(line[1]['Муфта']))
      })
      fieldSettings.appendChild(createAccordion('showDesignation'+ index, item[0] , settingTable))
      index += 1 
    })
  };
  reader.onerror = function() {
    console.log(reader.error);
  };
}
function createCell(text, row=0){
  const cell = document.createElement('td')
  cell.textContent = text
  cell.setAttribute('rowspan', row+1)
  return cell
}
window.addEventListener('beforeunload', (event) => {
  event.preventDefault();
  // event.returnValue = '';
});

document.getElementById('addNewTabBtn').addEventListener('click', function(event) {
  const titles = getNamesTabs(document.getElementById('processedData').getElementsByClassName('accordion-button'))
  const nums = getNumbsNewTabs(titles)
  const nextNum = findNextNum(nums)

const id = `acc${nextNum}${Date.now()}`
const text = `Новый лист ${nextNum}`
const newRow = [{'№' : 1,'Значение':'Длина-Кабель', 'Кол-во': 1 ,'Тип кабеля':'Кабель', 'Длина':'Длина'}]
const table = createTable(newRow,text)
document.getElementById('processedData').appendChild(createAccordion(id,text,table,true,isEditableNow()))
})
function findNextNum(nums, num=1){
  if (!nums.includes(num)) return num
  return findNextNum(nums, num + 1)
}
function getNamesTabs(coll){
  arr = Object.values(coll).map(item => item.innerText) 
  return arr
}
function getNumbsNewTabs(arr){
  const sortedArr=arr.filter((item) => item.includes('Новый лист'))
  const nums = sortedArr.map(item => {
   const arr =  item.split('Новый лист')
   return parseInt(arr[arr.length-1])
  })
  return nums
}

