async function handleFileAsync(e) {
    for (let file of e.target.files){
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    var  wsnames  =  workbook.SheetNames ;
    for (let sheetName of wsnames){
        const  dataFromOneFile  =  XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]).
        map((item) => {
          const value = item['Значение']
            const fixValue = value
            .replace(/\(.\)/g,'')
            .replace(/\(..\)/g,'')
            .replace('x','х')
            .replaceAll(' ','')

            const length = fixValue.substring(0,fixValue.indexOf('-'))
            const type = fixValue.substring(fixValue.indexOf('-') + 1, fixValue.length)
            const count = item['Количество']
            return {'№' : item['__rowNum__'],'Значение':value,'Тип кабеля':type, 'Длина':length, 'Количество':count}
})
const lstMod = String(file.lastModified)
const shtName = String(sheetName).replaceAll(' ','')
                                 .replaceAll('(','')
                                 .replaceAll(')','')
const id= `${shtName}${lstMod}${Date.now()}`
const fileName = file.name.replace('.xlsx', '').replace('.xls', '')
const caption = `${fileName} - ${sheetName}`
const btnText = (countOccurences(caption, '-') > 1) ? caption.slice(caption.indexOf('-') + 1): caption  

const table = createTable(dataFromOneFile, btnText)

document.getElementById('processedData')
        .appendChild(createAccordion(id,btnText,table))
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
    var ws = XLSX.utils.table_to_sheet(table)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }
  XLSX.writeFile(wb,"Спецификация кабеля (название).xlsx")
}

function tableToJson(table) { 
  var data = [];
  var headRow = table.rows[0]
  for (var i = 1; i < table.rows.length; i++) { 

      var tableRow = table.rows[i]; 
      var rowData = {}; 
      for (var j = 0; j < tableRow.cells.length; j++) { 
          rowData[headRow.cells[j].innerHTML]= tableRow.cells[j].innerHTML
      } 
      data.push(rowData); 
  } 
  return data; 
}

function createTable(data, text=''){
  table = document.createElement('table')
  // table.innerHTML=`<tr><th>№</th><th>Значение</th><th>Тип кабеля</th><th>Длина</th><th>Количество</th></tr>`
  const row = table.insertRow();
  Object.keys(data[0]).forEach(text => {
  const th = document.createElement('th')
  th.textContent = text
  row.appendChild(th)
  })

  data.forEach(item => {
    const row = table.insertRow();
     Object.values(item).forEach(text => {
    const cell = row.insertCell();
    cell.textContent = text;
 });
});
table.classList.add('table')
table.classList.add('table-sm')
table.setAttribute('sheet',text)
// table.contentEditable = true
return table
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
  table.innerHTML=`<tr><th>Тип кабеля</th><th>Сумма</th></tr>`
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
  const sumByTabels = dataJS.map((item) => sumByTypes(item))
  // const names = document.getElementById('processedData').getElementsByTagName('button')
  for (let list of sumByTabels){
    const num = sumByTabels.indexOf(list)
    const tableFromOneList = createOutputTable(list)
    const title = arrOfTables[num].getAttribute('sheet') //names[sumByTabels.indexOf(list)].textContent
    out.appendChild(createAccordion('acc'+ num + Date.now(),title , tableFromOneList))
  }    
 }

 function sumByTypes(obj) {
  return obj.reduce((acc,item)=> {
    const currentType = item['Тип кабеля'].replace(' ','')
    const currentLength = item['Длина'] * item['Количество']
    if (acc[currentType]){
        acc[currentType] = acc[currentType] + currentLength
        return acc
    }
    acc[currentType] = currentLength
    return acc
}, {})
 }

function createAccordion(id, text, table) {
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
  button.classList.add("accordion-button")
  button.classList.add("collapsed")

  title.id = `head${id}`
  title.classList.add("accordion-header")

  newDiv.classList.add('accordion-item')

  div2.classList.add('accordion-collapse')
  div2.classList.add('collapse')
  // div2.classList.add('show')
  div2.id = id
  div2.setAttribute('aria-labelledby',`head${id}`)
  div2.setAttribute('data-bs-parent',"accordionDefault")

  accBody.classList.add('accordion-body')
  accBody.appendChild(table)
  title.appendChild(button)
  newDiv.appendChild(title)
  newDiv.appendChild(div2)
  div2.appendChild(accBody)
  return newDiv
}