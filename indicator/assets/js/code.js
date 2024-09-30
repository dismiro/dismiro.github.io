function isEqual(array1, array2) {
  return JSON.stringify(array1) === JSON.stringify(array2);
}

function clearSelection(collection){
  for (let i = 0; i < collection.length; i++) {
    collection[i].classList.remove('active')
  } 
}
function makeMuNormal(collection){
  for (let i = 0; i < collection.length; i++) {
    collection[i].classList.remove('btn-outline-danger')
    collection[i].classList.add('btn-outline-light')
  } 
}
function appendCollectoveWire() {
  const div = document.createElement('div')
  div.className ='row py-1'
  div.innerHTML = `<button type="button" class="btn btn-outline-light text-start w-100 py-1 ">${`Обратный провод`} </button>`
  outputResult.append(div)
  
}

function createTotalButton(num) {
  const div = document.createElement('div')
  const total = num + 1 // + 1 collective wire
  div.className ='row py-1'
  div.innerHTML = `<button type="button" class="btn btn-outline-light text-start w-100 py-2 ">${`Всего жил: ${total}`} </button>`
  outputResult.append(div)
}



function init(){
  const clearButton = document.getElementById('clearButton')
  clearButton.addEventListener('click',function() {
    clearSelection(btns)
    makeMuNormal(document.getElementsByClassName('layerMU'))
  })
  clearButton.addEventListener('mouseover',function() {
    clearButton.classList.remove('btn-outline-light')
    clearButton.classList.add('btn-outline-danger')
  })
  clearButton.addEventListener('mouseout',function() {
    clearButton.classList.remove('btn-outline-danger')
    clearButton.classList.remove('active')
    clearButton.classList.add('btn-outline-light')
  })
  const btns = document.getElementById("buttons-NUM").getElementsByClassName("btn-outline-light");
  document.getElementById("typeMU").addEventListener("click", function() {
    clearSelection(btns)
    this.innerText = (this.innerText === 'Цифровой') ? 'Буквенный': 'Цифровой'
    const hiddenButtons = document.getElementsByClassName("hidden")
    for (let i = 0; i < hiddenButtons.length; i++) hiddenButtons[i].classList.toggle('d-none')
  });

  clearSelection(btns)

  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function() {
      let selectCombs = [] 
      makeMuNormal(document.getElementsByClassName('layerMU'))
      this.classList.toggle('active')
      const activeBtns = document.getElementById("buttons-NUM").getElementsByClassName("active");
      const outputResult = document.getElementById('outputResult')
      outputResult.innerHTML = ''
      const objData = analyze(selectionToString(activeBtns))
      for (let i in objData) {
        const div = document.createElement('div')
        div.className ='row py-1'
        div.innerHTML = `<button type="button" class="btn btn-outline-light text-start w-100 py-1 added">${i} : ${objData[i]} </button>`
        outputResult.append(div)
      }
      appendCollectoveWire()
      createTotalButton(Object.keys(objData).length)
      const addedLinks = outputResult.getElementsByClassName('added')
        for (var i = 0; i < addedLinks.length; i++) {
          addedLinks[i].addEventListener('click', function() {
          this.classList.toggle('active')
          if (this.classList.contains('active')) {
            selectCombs.push(this.innerText.split(': ')[1].split(','))
          }else {
            makeMuNormal(document.getElementsByClassName('layerMU'))
            selectCombs = selectCombs.filter((item) => !isEqual(this.innerText.split(': ')[1].split(','), item) )
          }
          showComb(selectCombs.flat())
          }) 
          addedLinks[i].addEventListener('mouseover', function() {
            HighlightCurrComb(this.innerText.split(': ')[1].split(','))
          })
          addedLinks[i].addEventListener('mouseout', function() {
            turnOffHighlightCurrComb(this.innerText.split(': ')[1].split(','),selectCombs)
          })
      }
    });
  }

function HighlightCurrComb(comb){
  for (i of comb){
    document.getElementById(i).classList.add('active')
    document.getElementById(i).classList.remove('btn-outline-light')
    document.getElementById(i).classList.add('btn-outline-danger')
  }
}
function turnOffHighlightCurrComb(comb,selectCombs){
  for (i of comb){
    document.getElementById(i).classList.remove('active')
    if (!selectCombs.flat().includes(i)){
    document.getElementById(i).classList.remove('btn-outline-danger')
    document.getElementById(i).classList.add('btn-outline-light')
  }
  }
}

  function showComb(comb) {
    // const list = comb.split(',')
    // console.log(list)
    for (i of comb){
      // document.getElementById(i).classList.add('active')
      document.getElementById(i).classList.remove('btn-outline-light')
      document.getElementById(i).classList.add('btn-outline-danger')
      
    }
  }

  const li = document.getElementsByClassName("layerMU ");
  for (var i = 0; i < btns.length; i++) {
    
    btns[i].addEventListener("mouseover", function() {
      const fulltable = getDataFromFile('table2.json')
      const listIndications = fulltable.map((e) => e.indication)
      const currentComb = fulltable[listIndications.indexOf(this.innerText)]
    
      for (i in currentComb){
        if(i !=='indication'&& currentComb[i] === 1 ){
          document.getElementById(i).classList.add('active')
        }
      }
    });
   
    btns[i].addEventListener("mouseout", function() {
      const removeList = document.getElementsByClassName("layerMU ")
      for (let i = 0; i < removeList.length; i++){
        if (removeList[i].classList.contains('active')) {
          removeList[i].classList.remove('active')
        }
      }
    });
  }
}

function selectionToString(obj) {
  const outputData = []
  for (let i = 0; i < obj.length; i++) outputData.push(obj[i].innerText)
  return outputData.join(',')
}

function convertCombination(data, combinations) {
  const newData = {}
  Object.keys(data).forEach(element => {
    const comb = element.split('')
    const col = []
  for (let i in comb) {
    if (comb[i] === '1') col.push(combinations[0].indication[i])
  }
    newData[col.join()] = data[element].join()
  });
  return newData
}

function analyze(str) {
  const list =str.split(',')
  const fulltable = getDataFromFile('table2.json')
  let part = fulltable.filter((item) => list.includes(item.indication))
  let keys = Object.keys(fulltable[0])
  const combinations = keys.map((key) => {
  return { [key] : part.map((item) => item[key])}
  })
  const data = combinations.slice(1).reduce((acc, combination) => {
    const currComb = Object.values(combination).flat().join('')
    if (!currComb.includes('1')) return acc
    const value = (Object.hasOwn(acc, currComb )) 
    ? acc[currComb].concat(Object.keys (combination)) 
    : Object.keys (combination)
    return {...acc, [currComb] : value };
  }, {});
  const outputData = convertCombination(data, combinations)
  return outputData

}



function getDataFromFile(filepath) {
  const table = [
    {
      "indication": '1',
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 0,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 0,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": '2',
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 1
    },
    {
      "indication": '3',
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '4',
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": '5',
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 1,
      "B17": 1,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '6',
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '7',
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 0,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 0,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": '8',
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '9',
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },

    {
      "indication": '10',
      "B1": 1,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 1,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 1,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },

    // ------------------------- Дополненная таблица
    {
      "indication": '11',
      "B1": 1,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 0,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 0,
      "B13": 1,
      "B14": 0,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 0,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 0,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 1,
      "B32": 0,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 0,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": '12',
      "B1": 1,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 1,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 1,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 1
    },
    {
      "indication": '13',
      "B1": 1,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '14',
      "B1": 1,
      "B2": 0,
      "B3": 1,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": '15',
      "B1": 1,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 1,
      "B17": 1,
      "B18": 0,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '16',
      "B1": 1,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 0,
      "B19": 1,
      "B20": 0,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 1,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '17',
      "B1": 1,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 1,
      "B8": 0,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 1,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 1,
      "B38": 0,
      "B39": 1,
      "B40": 0,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": '18',
      "B1": 1,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 1,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": '19',
      "B1": 1,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 1,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 1,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 1,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 1,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 1,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 1,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },

    // -------------------------
    {
      "indication": "А",
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 0,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 0,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 1,
      "B28": 1,
      "B29": 1,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Б",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 1,
      "B15": 1,
      "B16": 1,
      "B17": 1,
      "B18": 0,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "В",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "Г",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": "Д",
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 1,
      "B12": 0,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 1,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 1,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 1,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 1,
      "B34": 1,
      "B35": 1,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Е",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 1,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 1,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 1
    },
    {
      "indication": "Ж",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 1,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 1,
      "B17": 1,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 1,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "З",
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "И",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 1,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "К",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 1,
      "B12": 0,
      "B13": 0,
      "B14": 1,
      "B15": 1,
      "B16": 1,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Л",
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 0,
      "B9": 1,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 1,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 1,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "М",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 1,
      "B10": 0,
      "B11": 1,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Н",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "О",
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "П",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Р",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 1,
      "B28": 1,
      "B29": 1,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": "С",
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "Т",
      "B1": 0,
      "B2": 1,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 0,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 0,
      "B13": 0,
      "B14": 0,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 0,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": "У",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 1,
      "B29": 1,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "Ф",
      "B1": 0,
      "B2": 0,
      "B3": 0,
      "B4": 1,
      "B5": 0,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 1,
      "B10": 1,
      "B11": 1,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 1,
      "B28": 1,
      "B29": 1,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 0,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 1,
      "B41": 0,
      "B42": 0
    },
    {
      "indication": "Х",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 1,
      "B16": 0,
      "B17": 1,
      "B18": 0,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 0,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 1,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Ц",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 1,
      "B12": 0,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 1,
      "B18": 0,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 1,
      "B24": 0,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 0,
      "B29": 1,
      "B30": 0,
      "B31": 0,
      "B32": 1,
      "B33": 1,
      "B34": 1,
      "B35": 1,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Ч",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 0,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 1,
      "B29": 1,
      "B30": 1,
      "B31": 0,
      "B32": 0,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Ш",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 1,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 1
    },
    {
      "indication": "Щ",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 1,
      "B5": 0,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 1,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 1,
      "B34": 1,
      "B35": 1,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    },
    {
      "indication": "Э",
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 0,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 0,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 0,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 0,
      "B39": 1,
      "B40": 1,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "Ю",
      "B1": 0,
      "B2": 1,
      "B3": 0,
      "B4": 0,
      "B5": 1,
      "B6": 0,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 1,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 1,
      "B16": 1,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 1,
      "B21": 0,
      "B22": 1,
      "B23": 0,
      "B24": 1,
      "B25": 0,
      "B26": 1,
      "B27": 0,
      "B28": 1,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 1,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 1,
      "B42": 0
    },
    {
      "indication": "Я",
      "B1": 0,
      "B2": 0,
      "B3": 1,
      "B4": 1,
      "B5": 1,
      "B6": 1,
      "B7": 0,
      "B8": 1,
      "B9": 0,
      "B10": 0,
      "B11": 0,
      "B12": 1,
      "B13": 0,
      "B14": 1,
      "B15": 0,
      "B16": 0,
      "B17": 0,
      "B18": 1,
      "B19": 0,
      "B20": 0,
      "B21": 1,
      "B22": 1,
      "B23": 1,
      "B24": 1,
      "B25": 0,
      "B26": 0,
      "B27": 1,
      "B28": 0,
      "B29": 0,
      "B30": 1,
      "B31": 0,
      "B32": 1,
      "B33": 0,
      "B34": 0,
      "B35": 0,
      "B36": 1,
      "B37": 0,
      "B38": 1,
      "B39": 0,
      "B40": 0,
      "B41": 0,
      "B42": 1
    }
  ]
return table
}



init()