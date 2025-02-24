// const inputElement = document.getElementById("input");
// inputElement.addEventListener("change", handleFiles, false);
// function handleFiles() {
//   const fileList = this.files;
//   console.log(fileList) /* now you can work with the file list */
// //   var  workbook  =  XLSX.readFile (fileList[0])
// //   console.log(workbook)
// }

async function handleFileAsync(e) {
    const file = e.target.files[0];
    const data = await file.arrayBuffer();
    /* data is an ArrayBuffer */
    const workbook = XLSX.read(data);
    var  wsnames  =  workbook.SheetNames ;
    // console.log(wsnames)
    var  jsa  =  XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    var  html  =  XLSX.utils.sheet_to_html (workbook.Sheets[wsnames],{editable:true}).replace("<table",'<table id="data-table" class="table table-sm"') ;
    var  container  =  document.getElementById ("table")
    container.innerHTML = html
    // const dataJS = jsa
    const dataJS = jsa.map((item) => {
        const value = item['Значение']
        .replace(/\(.\)/g,'')
        .replace(/\(..\)/g,'')
        .replace(' ','')

        const length = value.substring(0,value.indexOf('-'))
        const type = value.substring(value.indexOf('-') + 1, value.length)
        const count = item['Количество']
        return {'row' : item['__rowNum__'],'type':type, 'length':length, 'count':count}
})
    console.log(dataJS)
    const table = document.createElement('table');

// Заполнение таблицы данными
    dataJS.forEach(item => {
    const row = table.insertRow();
     Object.values(item).forEach(text => {
    const cell = row.insertCell();
    cell.textContent = text;
 });
});
table.classList.add('table')
table.classList.add('table-sm')
const processedData = document.getElementById('processedData') 
processedData.appendChild(table);
    
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