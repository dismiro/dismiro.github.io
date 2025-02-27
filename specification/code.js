// const inputElement = document.getElementById("input");
// inputElement.addEventListener("change", handleFiles, false);
// function handleFiles() {
//   const fileList = this.files;
//   console.log(fileList) /* now you can work with the file list */
// //   var  workbook  =  XLSX.readFile (fileList[0])
// //   console.log(workbook)
// }

async function handleFileAsync(e) {
    // console.log(e.target.files)
    var dataJS = []
    for (let file of e.target.files){

    // const file = e.target.files[0];
    const data = await file.arrayBuffer();
    /* data is an ArrayBuffer */
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
            .replace(' ','')

            const length = fixValue.substring(0,fixValue.indexOf('-'))
            const type = fixValue.substring(fixValue.indexOf('-') + 1, fixValue.length)
            const count = item['Количество']
            return {'row' : item['__rowNum__'],'value':value,'type':type, 'length':length, 'count':count}
})
dataJS.push(dataFromOneFile)
// console.log(file.lastModified)

const newDiv = document.createElement("div");
const title = document.createElement("h3");
const button = document.createElement("button");
const titleText = file.name.replace('.xlsx', '').replace('.xls', '')
const div2 = document.createElement("div");
const accBody = document.createElement("div");
const id= `${sheetName}-${file.lastModified}`.replace(' ','')


button.innerHTML= `${titleText} : ${sheetName}`

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
// accBody.innerHTML = 'Здесь будет таблица!'

// const table = document.createElement('table');
// // Заполнение таблицы данными
// table.innerHTML=`<tr><th>№</th><th>Значение</th><th>Тип кабеля</th><th>Длина</th><th>Количество</th></tr>`
// dataFromOneFile.forEach(item => {
//     const row = table.insertRow();
//      Object.values(item).forEach(text => {
//     const cell = row.insertCell();
//     cell.textContent = text;
//  });
// });
const table = createTable(dataFromOneFile)

accBody.appendChild(table)
// console.log(tableToJson(table))









// console.log(dataFromOneFile)
title.appendChild(button)
newDiv.appendChild(title)
newDiv.appendChild(div2)
div2.appendChild(accBody)
document.getElementById('processedData').appendChild(newDiv)
}
   
    
    ;
    // var  html  =  XLSX.utils.sheet_to_html (workbook.Sheets[wsnames],{editable:true}).replace("<table",'<table id="data-table" class="table table-sm"') ;
    // var  container  =  document.getElementById ("table")
    // container.innerHTML = html
    // const dataJS = jsa
    }
    // console.log(dataJS)
//     const dataJS = jsa.map((item) => {
//         const fixValue = item['Значение']
//         .replace(/\(.\)/g,'')
//         .replace(/\(..\)/g,'')
//         .replace('x','х')
//         .replace(' ','')

//         const length = fixValue.substring(0,fixValue.indexOf('-'))
//         const type = fixValue.substring(fixValue.indexOf('-') + 1, fixValue.length)
//         const count = item['Количество']
//         return {'row' : item['__rowNum__'],'fixValue':fixValue,'type':type, 'length':length, 'count':count}
// })
    // console.log(dataJS)
    // const table = document.createElement('table');

// Заполнение таблицы данными
//     dataJS.forEach(item => {
//     const row = table.insertRow();
//      Object.values(item).forEach(text => {
//     const cell = row.insertCell();
//     cell.textContent = text;
//  });
// });
// var outData = dataJS.reduce((acc,item)=> {
//     const currentType = item['type'].replace(' ','')
//     const currentLength = item['length'] * item['count']
//     if (acc[currentType]){
//         acc[currentType] = acc[currentType] + currentLength
//         return acc
//     }
//     acc[currentType] = currentLength
//     return acc
// }, {})
// console.log(outData)
// table.classList.add('table')
// table.classList.add('table-sm')
// const processedData = document.getElementById('processedData') 
// processedData.appendChild(table);
    // const out = document.getElementById('outputResult') 
    // var listTypes = Object.entries(outData) 
    // out.innerHTML = listTypes.map((item) => `<li>${item[0]} ---- ${item[1]} </li>`).join(' ');    

    // var  jsa  =  XLSX.utils.sheet_to_json ( worksheet , opts ) ;​​​​ 
    // console.log(workbook)
  
    /* DO SOMETHING WITH workbook HERE */
  }
  const input_dom_element = document.getElementById("input");
  input_dom_element.addEventListener("change", handleFileAsync, false);

const inputElement = document.getElementById("export");
inputElement.addEventListener("click", exportFile, false);
function exportFile() {
//     const aoo = [
//         {Name: "Dmitrii1", Age: 1},
//         {Name: "Dmitrii2", Age: 2},
//         {Name: "Dmitrii3", Age: 3},
//         {Name: "Dmitrii4", Age: 4},
//         {Name: "Dmitrii5", Age: 5},
//     ]
//     //var ws = XLSX.utils.json_to_sheet(aoo)
//     //var wb = XLSX.utils.book_new()
//     //XLSX.utils.book_append_sheet(wb,ws,"Sheet1")
//     //XLSX.writeFile(wb,"ExportData.xlsx")


var elt = document.getElementById('table')
var wb = XLSX.utils.table_to_book(elt, {sheet: "Sheet JS"})

XLSX.writeFile(wb,"ExportData.xlsx")
    

    
//  console.log("Hello") /* now you can work with the file list */
// //   var  workbook  =  XLSX.readFile (fileList[0])
// // //   console.log(workbook)
 }

 function tableToJson(table) { 
  var data = [];
  var headRow = table.rows[0]
  for (var i = 1; i < table.rows.length; i++) { 

      var tableRow = table.rows[i]; 
      var rowData = {}; 
      for (var j = 0; j < tableRow.cells.length; j++) { 
          // rowData.push(tableRow.cells[j].innerHTML);
          rowData[headRow.cells[j].innerHTML]= tableRow.cells[j].innerHTML
      } 
      data.push(rowData); 
  } 
  return data; 
}

function createTable(data){
  table = document.createElement('table')
  table.innerHTML=`<tr><th>№</th><th>Значение</th><th>Тип кабеля</th><th>Длина</th><th>Количество</th></tr>`
data.forEach(item => {
    const row = table.insertRow();
     Object.values(item).forEach(text => {
    const cell = row.insertCell();
    cell.textContent = text;
 });
});
table.classList.add('table')
table.classList.add('table-sm')
// table.contentEditable = true
return table
}


const calculate = document.getElementById("calculate");
calculate.addEventListener("click", calculateCable, false);
function calculateCable() {
  const collOfTables = document.getElementById('processedData').getElementsByTagName('table')
 const arrOfTables = Array.from(collOfTables)
  const dataJS = arrOfTables.map(tab=> tableToJson(tab))
  const sumByTabels = dataJS.map((item) => {
    return sumByTypes(item)
  })
  console.log(sumByTabels)
    const out = document.getElementById('outputResult')
    for (let list of sumByTabels){
    const ul = document.createElement('ul') 
    ul.classList.add('list-group')
    ul.classList.add('pb-2')
    
    var listTypes = Object.entries(list) 
    ul.innerHTML += listTypes.map((item) => `<li class="list-group-item pt-1 pb-1">${item[0]} ---- ${item[1]} </li>`).join(' ');    
    out.appendChild(ul)
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
