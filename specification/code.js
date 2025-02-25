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
            .replace(/\(.\)/g,'')
            .replace(/\(..\)/g,'')
            .replace('x','х')
            .replace(' ','')

            const length = value.substring(0,value.indexOf('-'))
            const type = value.substring(value.indexOf('-') + 1, value.length)
            const count = item['Количество']
            return {'row' : item['__rowNum__'],'value':value,'type':type, 'length':length, 'count':count}
})
dataJS.push(dataFromOneFile)
const newDiv = document.createElement("div");
const title = document.createElement("h3");
const button = document.createElement("button");
button.innerHTML= 'text'
button.setAttribute('type',"button")
button.setAttribute('data-bs-toggle',"collapse")
button.setAttribute('data-bs-target',"#collapseOne")
button.setAttribute('aria-expanded',"true")
button.setAttribute('aria-controls',"collapseOne")

newDiv.classList.add('accordion-item')
title.classList.add("accordion-header")
button.classList.add("accordion-button")
title.id = 'headingOne'
title.appendChild(button)
newDiv.appendChild(title)
newDiv.innerHTML += `<div class="accordion-collapse collapse show" id="collapseOne" aria-labelledby="headingOne" data-bs-parent="#accordionDefault">
  <div class="accordion-body">This is the first item's accordion body. It is hidden by default, until the collapse plugin adds the appropriate classes that we use to style each element.</div>
</div>`
document.getElementById('accordionExample').appendChild(newDiv)
}
   
    
    ;
    // var  html  =  XLSX.utils.sheet_to_html (workbook.Sheets[wsnames],{editable:true}).replace("<table",'<table id="data-table" class="table table-sm"') ;
    // var  container  =  document.getElementById ("table")
    // container.innerHTML = html
    // const dataJS = jsa
    }
    console.log(dataJS)
//     const dataJS = jsa.map((item) => {
//         const value = item['Значение']
//         .replace(/\(.\)/g,'')
//         .replace(/\(..\)/g,'')
//         .replace('x','х')
//         .replace(' ','')

//         const length = value.substring(0,value.indexOf('-'))
//         const type = value.substring(value.indexOf('-') + 1, value.length)
//         const count = item['Количество']
//         return {'row' : item['__rowNum__'],'value':value,'type':type, 'length':length, 'count':count}
// })
    // console.log(dataJS)
    const table = document.createElement('table');

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
table.classList.add('table')
table.classList.add('table-sm')
const processedData = document.getElementById('processedData') 
processedData.appendChild(table);
    // const out = document.getElementById('outputResult') 
    // var listTypes = Object.entries(outData) 
    // out.innerHTML = listTypes.map((item) => `<li>${item[0]} ---- ${item[1]} </li>`).join(' ');    

    // var  jsa  =  XLSX.utils.sheet_to_json ( worksheet , opts ) ;​​​​ 
    // console.log(workbook)
  
    /* DO SOMETHING WITH workbook HERE */
  }
  const input_dom_element = document.getElementById("input");
  input_dom_element.addEventListener("change", handleFileAsync, false);

// const inputElement = document.getElementById("export");
// inputElement.addEventListener("click", exportFile, false);
// function exportFile() {
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
// var elt = document.getElementById('table')
// var wb = XLSX.utils.table_to_book(elt, {sheet: "Sheet JS"})

// XLSX.writeFile(wb,"ExportData.xlsx")
    

    
//  console.log("Hello") /* now you can work with the file list */
// //   var  workbook  =  XLSX.readFile (fileList[0])
// // //   console.log(workbook)
//  }
