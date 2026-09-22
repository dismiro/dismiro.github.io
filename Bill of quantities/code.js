// Bill of quantities (ВОР) module logic
let currentData = null;
let currentFileName = '';
let isEditable = false;
let isRawColCollapsed = false;

// Helper to extract works/materials array from a rule object,
// supporting both "Работы и материалы" (array or object with tier keys) and legacy "Работы" / "works"
function getRuleWorks(rule) {
  if (!rule || typeof rule !== 'object') return [];
  const wm = rule["Работы и материалы"] !== undefined ? rule["Работы и материалы"] :
             (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
  if (Array.isArray(wm)) return wm;
  if (wm && typeof wm === 'object') {
    const list = [];
    Object.entries(wm).forEach(([tierKey, arr]) => {
      if (Array.isArray(arr)) {
        arr.forEach(item => {
          if (item && typeof item === 'object') {
            list.push({ ...item, _tierKey: tierKey });
          }
        });
      } else if (arr && typeof arr === 'object') {
        list.push({ ...arr, _tierKey: tierKey });
      }
    });
    return list;
  }
  return [];
}

// Evaluate formula (e.g. "ДЛИНА", "0.36*ДЛИНА", "1.05*ДЛИНА", "КОЛИЧЕСТВО", "1*КОЛИЧЕСТВО") with a given base value
function evaluateWorkFormula(formula, baseValue) {
  const num = Number(baseValue) || 0;
  if (!formula || typeof formula !== 'string' || !formula.trim()) {
    return num;
  }
  const clean = formula.trim();
  const upper = clean.toUpperCase();
  if (upper === 'ДЛИНА' || upper === 'КОЛИЧЕСТВО' || upper === 'КОЛ-ВО' || upper === 'КОЛИЧЕСТВО_МУФТ') {
    return num;
  }
  const expr = clean.replace(/,/g, '.')
    .replace(/ДЛИНА/gi, String(num))
    .replace(/КОЛИЧЕСТВО_МУФТ/gi, String(num))
    .replace(/КОЛИЧЕСТВО/gi, String(num))
    .replace(/КОЛ-ВО/gi, String(num));
  try {
    if (/^[0-9+\-*/().\s]+$/.test(expr)) {
      const val = Function("'use strict'; return (" + expr + ");")();
      if (typeof val === 'number' && !isNaN(val)) {
        return val;
      }
    }
  } catch (e) {
    // fallback
  }
  return num;
}

// Build display string for formula in VOR
function buildWorkFormulaDisplay(formula, totalLength, itemsCount, unit) {
  const clean = (formula || 'ДЛИНА').trim();
  if (clean.toUpperCase() === 'ДЛИНА') {
    return `${totalLength.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м кабеля${itemsCount > 1 ? ` (${itemsCount} мар.)` : ''}`;
  }
  let disp = clean.replace(/,/g, '.').replace(/\*/g, ' * ');
  disp = disp.replace(/ДЛИНА/gi, `${totalLength.toLocaleString('ru-RU')} м кабеля`);
  return disp;
}

// Build display string for coupling installation work formula
function buildCouplingWorkFormulaDisplay(formula, tierData, calculatedVolume) {
  const clean = (formula || 'КОЛИЧЕСТВО').trim();
  const rawCount = tierData.count || 0;
  const upper = clean.toUpperCase();

  if (upper === 'КОЛИЧЕСТВО' || upper === 'КОЛ-ВО' || upper === 'КОЛИЧЕСТВО_МУФТ') {
    if (tierData.couplings && tierData.couplings.length > 1) {
      return tierData.couplings.map(c => `${c.count} шт`).join(' + ') + ` = ${rawCount} шт`;
    }
    return `${rawCount} шт`;
  }

  let disp = clean.replace(/,/g, '.').replace(/\*/g, ' * ');
  disp = disp.replace(/КОЛИЧЕСТВО_МУФТ/gi, `${rawCount} шт`)
             .replace(/КОЛИЧЕСТВО/gi, `${rawCount} шт`)
             .replace(/КОЛ-ВО/gi, `${rawCount} шт`)
             .replace(/ДЛИНА/gi, `${rawCount} шт`);
  if (calculatedVolume !== undefined && calculatedVolume !== rawCount) {
    disp += ` = ${calculatedVolume} шт`;
  }
  return disp;
}

// Parse and normalize rule's "Работы и материалы" supporting both the new object structure:
// "Работы и материалы": { "1": [...], "2": [...], "3": [...], "оптический": [...] }
// and legacy flat array format: [ { ... }, ... ]
function parseRuleWorksAndMaterials(rule) {
  if (!rule || typeof rule !== 'object') {
    return { optical: null, tiers: [], allItems: [], isObjectStructure: false, rawObj: {} };
  }

  const wm = rule["Работы и материалы"] !== undefined ? rule["Работы и материалы"] :
             (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);

  if (!wm || typeof wm !== 'object') {
    return { optical: null, tiers: [], allItems: [], isObjectStructure: false, rawObj: {} };
  }

  const isOpticalItem = item => {
    if (!item || typeof item !== 'object') return false;
    const cat = String(item["Категория"] || item.category || '').toLowerCase();
    const nm = String(item["Наименование"] || item.name || '').toLowerCase();
    return cat.includes('оптич') || nm.includes('оптическ') || cat.includes('волс') || nm.includes('волс');
  };

  const isOpticalKey = k => {
    const s = String(k || '').toLowerCase();
    return s.includes('оптич') || s.includes('волс') || s.includes('optic');
  };

  // Convert legacy array to object representation if needed
  let wmObj = {};
  let isObjectStructure = true;

  if (Array.isArray(wm)) {
    isObjectStructure = false;
    wm.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (isOpticalItem(item)) {
        if (!wmObj["оптический"]) wmObj["оптический"] = [];
        wmObj["оптический"].push(item);
      } else {
        const th = extractWeightThreshold(item);
        const k = th !== null ? String(th) : (item["МаксВес"] !== undefined ? String(item["МаксВес"]) : "1");
        if (!wmObj[k]) wmObj[k] = [];
        wmObj[k].push(item);
      }
    });
  } else {
    wmObj = wm;
  }

  let optical = null;
  const tiers = [];
  const allItems = [];

  for (const [key, itemsVal] of Object.entries(wmObj)) {
    const items = Array.isArray(itemsVal) ? itemsVal : (itemsVal ? [itemsVal] : []);
    items.forEach(it => allItems.push(it));

    if (isOpticalKey(key) || items.some(isOpticalItem)) {
      optical = {
        key,
        items,
        isOptical: true
      };
    } else {
      let threshold = null;
      let isOver = false;

      // 1. Try parsing key directly as a number or threshold
      const cleanKey = String(key).trim().replace(',', '.');
      const numKey = parseFloat(cleanKey);
      if (!isNaN(numKey) && /^-?\d+(?:\.\d+)?$/.test(cleanKey)) {
        threshold = numKey > 50 ? numKey / 1000 : numKey;
      } else {
        const matchDo = cleanKey.match(/(?:до|макс(?:имум)?)\s*[:;]?\s*(\d+(?:[.,]\d+)?)/i);
        if (matchDo) {
          threshold = parseFloat(matchDo[1].replace(',', '.'));
        }
        if (/(?:свыше|более|от|>)\s*[:;]?\s*\d+/i.test(cleanKey)) {
          isOver = true;
          const matchOver = cleanKey.match(/(?:свыше|более|от|>)\s*[:;]?\s*(\d+(?:[.,]\d+)?)/i);
          if (matchOver) threshold = parseFloat(matchOver[1].replace(',', '.'));
        }
      }

      // 2. If threshold not determined from key, check items inside this tier
      if (threshold === null && items.length > 0) {
        for (const it of items) {
          const itTh = extractWeightThreshold(it);
          if (itTh !== null) {
            threshold = itTh;
            break;
          }
        }
      }
      if (!isOver && items.some(it => isOverWeightThreshold(it))) {
        isOver = true;
      }

      tiers.push({
        key,
        threshold,
        isOver,
        items,
        cables: []
      });
    }
  }

  // Sort tiers: ascending by threshold for "до X", then "свыше X", then unthresholded
  tiers.sort((a, b) => {
    if (!a.isOver && !b.isOver) {
      if (a.threshold !== null && b.threshold !== null) return a.threshold - b.threshold;
      if (a.threshold !== null) return -1;
      if (b.threshold !== null) return 1;
      return 0;
    }
    if (a.isOver && !b.isOver) return 1;
    if (!a.isOver && b.isOver) return -1;
    return (a.threshold || 0) - (b.threshold || 0);
  });

  return { optical, tiers, allItems, isObjectStructure, rawObj: wmObj };
}

// Helper to extract all sections from rules object (where top-level keys are section names)
function getRulesSections(rulesData) {
  if (!rulesData || typeof rulesData !== 'object') return [];
  if (Array.isArray(rulesData)) {
    return [{ name: "Строительные работы", rawKey: "Строительные работы", rules: rulesData }];
  }
  const sections = [];
  for (const [key, val] of Object.entries(rulesData)) {
    if (Array.isArray(val)) {
      const displaySectionName = (key === "Способы прокладки") ? "Строительные работы" : key;
      sections.push({ name: displaySectionName, rawKey: key, rules: val });
    }
  }
  return sections;
}

// Trench calculation rules - trenches are always calculated from the "Строительные работы" section
function getTrenchRules(rulesData) {
  if (!rulesData || typeof rulesData !== 'object') {
    return { sectionName: 'Строительные работы', rules: [] };
  }
  if (Array.isArray(rulesData)) {
    return { sectionName: 'Строительные работы', rules: rulesData };
  }
  // 1. Exact or case-insensitive match for "Строительные работы"
  for (const key of Object.keys(rulesData)) {
    if (key.trim().toLowerCase() === 'строительные работы') {
      return { sectionName: key, rules: Array.isArray(rulesData[key]) ? rulesData[key] : [] };
    }
  }
  // 2. Contains "строительн"
  for (const key of Object.keys(rulesData)) {
    if (key.toLowerCase().includes('строительн') && Array.isArray(rulesData[key])) {
      return { sectionName: key, rules: rulesData[key] };
    }
  }
  // 3. Fallback for legacy "Способы прокладки"
  if (Array.isArray(rulesData["Способы прокладки"])) {
    return { sectionName: 'Строительные работы', rules: rulesData["Способы прокладки"] };
  }
  // 4. Any first array
  for (const key of Object.keys(rulesData)) {
    if (Array.isArray(rulesData[key])) {
      return { sectionName: key, rules: rulesData[key] };
    }
  }
  return { sectionName: 'Строительные работы', rules: [] };
}

// Cable calculation rules - cables are always calculated from the "Монтажные работы" section
function getCableRules(rulesData) {
  if (!rulesData || typeof rulesData !== 'object') {
    return { sectionName: 'Монтажные работы', rules: [] };
  }
  if (Array.isArray(rulesData)) {
    return { sectionName: 'Монтажные работы', rules: [] };
  }
  // 1. Exact or case-insensitive match for "Монтажные работы"
  for (const key of Object.keys(rulesData)) {
    if (key.trim().toLowerCase() === 'монтажные работы') {
      return { sectionName: key, rules: Array.isArray(rulesData[key]) ? rulesData[key] : [] };
    }
  }
  // 2. Contains "монтаж"
  for (const key of Object.keys(rulesData)) {
    if (key.toLowerCase().includes('монтаж') && Array.isArray(rulesData[key])) {
      return { sectionName: key, rules: rulesData[key] };
    }
  }
  return { sectionName: 'Монтажные работы', rules: [] };
}

// Helper to get active cable catalog from rules data
function getCableCatalog(rulesData) {
  if (rulesData && typeof rulesData === 'object' && !Array.isArray(rulesData)) {
    if (rulesData["Справочник кабелей"] && typeof rulesData["Справочник кабелей"] === 'object') {
      return rulesData["Справочник кабелей"];
    }
    if (rulesData["Кабели"] && typeof rulesData["Кабели"] === 'object') {
      return rulesData["Кабели"];
    }
  }
  if (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"] && typeof cachedDefaultRules["Справочник кабелей"] === 'object') {
    return cachedDefaultRules["Справочник кабелей"];
  }
  return {};
}

// Helper to normalize cable names for flexible catalog lookup (ignoring quote styles and extra spaces)
function normalizeCableLookupKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/["«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lookup cable weight, category and full description from catalog
function lookupCableInfo(rawType, catalog) {
  const cat = catalog || getCableCatalog(currentWorksRules) || {};
  const str = String(rawType || '').trim();
  if (!str) {
    return {
      brand: 'Кабель',
      key: '',
      weight: 0.35,
      category: 'Электрический кабель',
      isOptical: false,
      fullDescription: 'Кабель',
      buildingLength: 300,
      coupling: '',
      foundInCatalog: false
    };
  }

  const cleanStr = normalizeCableType(str);
  const normStr = normalizeCableLookupKey(cleanStr);
  const rawNormStr = normalizeCableLookupKey(str);

  // 1. Check dedicated optical cable category in catalog ("Оптический кабель" or category containing "оптич")
  // User mandate: "проверка должна производится из справочника кабеля по отдельно выделенной категории кабеля"
  for (const [secKey, secVal] of Object.entries(cat)) {
    if (!secVal || typeof secVal !== 'object') continue;
    const secName = String(secVal["Название"] || secKey || '').toLowerCase();
    const secCategory = String(secVal["Категория"] || '').toLowerCase();
    const isOpticalSection = secName.includes('оптич') || secCategory.includes('оптич') || secKey.toLowerCase().includes('оптич');

    if (secVal["Тип"] && typeof secVal["Тип"] === 'object') {
      for (const [sKey, sVal] of Object.entries(secVal["Тип"])) {
        if (!sVal || typeof sVal !== 'object') continue;
        const itemCategory = String(sVal["Категория"] || '').toLowerCase();
        const isOpticalItem = isOpticalSection || itemCategory.includes('оптич');

        if (!isOpticalItem) continue;

        const normKey = normalizeCableLookupKey(sKey);
        if (normStr === normKey || rawNormStr === normKey || normStr.includes(normKey) || normKey.includes(normStr) || rawNormStr.includes(normKey) || normKey.includes(rawNormStr)) {
          return {
            brand: secVal["Название"] || 'Оптический кабель',
            key: sKey,
            weight: sVal["Вес"] || 0.28,
            category: sVal["Категория"] || secVal["Категория"] || 'Оптический кабель',
            isOptical: true,
            fullDescription: sVal["Полное описание"] || `Кабель связи оптический ${str}`,
            buildingLength: sVal["Строительная длина"] || 2000,
            coupling: sVal["Муфта"] || 'МТОК-А1/216-1Т3-44',
            foundInCatalog: true
          };
        }
      }
    }
  }

  // 2. Check special and custom cables ("Особый кабель")
  if (cat["Особый кабель"] && cat["Особый кабель"]["Тип"]) {
    for (const [sKey, sVal] of Object.entries(cat["Особый кабель"]["Тип"])) {
      if (!sVal || typeof sVal !== 'object') continue;
      const normKey = normalizeCableLookupKey(sKey);
      if (normStr === normKey || rawNormStr === normKey) {
        const itemCat = String(sVal["Категория"] || '').toLowerCase();
        const isOpt = itemCat.includes('оптич');
        return {
          brand: cat["Особый кабель"]["Название"] || 'Особый кабель',
          key: sKey,
          weight: sVal["Вес"] || 0.4,
          category: isOpt ? 'Оптический кабель' : (sVal["Категория"] || 'Электрический кабель'),
          isOptical: isOpt,
          fullDescription: sVal["Полное описание"] || `Кабель ${str}`,
          buildingLength: sVal["Строительная длина"] || 600,
          coupling: sVal["Муфта"] || '',
          foundInCatalog: true
        };
      }
    }
  }

  // 3. Identify brand symbol
  let symbol = '';
  if (str.includes('**')) symbol = '**';
  else if (str.includes('*')) symbol = '*';
  else if (str.includes('&')) symbol = '&';
  else if (str.includes('#')) symbol = '#';
  else if (str.includes('Δ') || str.includes('\\U+0394') || str.includes('U+0394')) symbol = '\\U+0394';
  else symbol = '';

  // Extract pair count (e.g. 3х2, 7х2, 21х2, 30х2)
  const pairMatch = str.match(/(\d+)\s*[хx]\s*2/i);
  const pairKey = pairMatch ? `${pairMatch[1]}х2` : null;

  let entry = null;
  let brandName = '';
  if (symbol && cat[symbol] && cat[symbol]["Тип"]) {
    brandName = cat[symbol]["Название"] || '';
    if (pairKey && cat[symbol]["Тип"][pairKey]) {
      entry = cat[symbol]["Тип"][pairKey];
    }
  }
  if (!entry && cat[''] && cat['']["Тип"] && pairKey && cat['']["Тип"][pairKey]) {
    brandName = cat['']["Название"] || 'СБВБПу';
    entry = cat['']["Тип"][pairKey];
  }

  if (entry) {
    const descPrefix = str.toLowerCase().startsWith('кабель') ? '' : 'Кабель ';
    return {
      brand: brandName,
      key: pairKey,
      weight: entry["Вес"] || 0.35,
      category: entry["Категория"] || 'Электрический кабель',
      isOptical: false,
      fullDescription: entry["Полное описание"] || `${descPrefix}${brandName ? brandName + ' ' : ''}${str}`.trim(),
      buildingLength: entry["Строительная длина"] || 300,
      coupling: entry["Муфта"] || '',
      foundInCatalog: true
    };
  }

  // Fallback for cables not found in catalog
  const fallbackWeight = pairMatch ? Math.min(3.0, Math.max(0.15, Number(pairMatch[1]) * 0.035)) : 0.35;
  const fallbackDesc = str.toLowerCase().startsWith('кабель') ? str : `Кабель ${str}`;
  return {
    brand: 'Кабель',
    key: str,
    weight: Math.round(fallbackWeight * 100) / 100,
    category: 'Электрический кабель',
    isOptical: false,
    fullDescription: fallbackDesc,
    buildingLength: 300,
    coupling: '',
    foundInCatalog: false
  };
}

// --------------------------------------------------------------------------
// COUPLING CATALOG & HELPER FUNCTIONS
// --------------------------------------------------------------------------

// Helper to get active coupling catalog from rules data
function getCouplingCatalog(rulesData) {
  if (rulesData && typeof rulesData === 'object' && !Array.isArray(rulesData)) {
    if (rulesData["Справочник муфт"] && typeof rulesData["Справочник муфт"] === 'object') {
      return rulesData["Справочник муфт"];
    }
    if (rulesData["Муфты"] && typeof rulesData["Муфты"] === 'object') {
      return rulesData["Муфты"];
    }
  }
  if (cachedDefaultRules && cachedDefaultRules["Справочник муфт"] && typeof cachedDefaultRules["Справочник муфт"] === 'object') {
    return cachedDefaultRules["Справочник муфт"];
  }
  return {};
}

// Parse max cores from string (e.g. "24х0,9", "3-24х0,9", "7х0,9", "до 27 жил")
function parseMaxCoresFromString(str) {
  if (!str) return 0;
  const s = String(str);
  // Match "до 12", "до: 27", etc.
  const doMatch = s.match(/до[:\s]+(\d+)/i);
  if (doMatch) return parseInt(doMatch[1], 10);
  // Match "3-24х0,9" or "27-61х0,9" -> take the larger number before 'х'
  const rangeMatch = s.match(/(\d+)[-–](\d+)х/i);
  if (rangeMatch) return parseInt(rangeMatch[2], 10);
  // Match "24х0,9" or "7х" -> number before 'х'
  const xMatch = s.match(/(\d+)х/i);
  if (xMatch) return parseInt(xMatch[1], 10);
  // Match any standalone number
  const numMatch = s.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
}

// Lookup coupling metadata (full name, max cores, unit, foundInCatalog)
function lookupCouplingInfo(rawType, couplingCatalog) {
  const cat = couplingCatalog || getCouplingCatalog(currentWorksRules);
  const str = String(rawType || '').trim();
  if (!str) {
    return {
      type: '',
      fullName: 'Соединительная муфта',
      maxCores: 27,
      unit: 'шт',
      foundInCatalog: false
    };
  }

  // Exact match
  if (cat[str] && typeof cat[str] === 'object') {
    const entry = cat[str];
    const maxCores = Number(entry["МаксЖил"] || entry["Максимальное количество жил"] || entry["Количество жил"] || entry.maxCores) || parseMaxCoresFromString(str);
    return {
      type: str,
      fullName: entry["Полное наименование"] || entry["Наименование"] || entry.name || str,
      maxCores: maxCores || 27,
      unit: entry["Единицы измерения"] || entry.unit || 'шт',
      foundInCatalog: true
    };
  }

  // Normalized key match
  const normStr = str.toLowerCase().replace(/[\s\-_]+/g, '');
  for (const [k, v] of Object.entries(cat)) {
    if (!v || typeof v !== 'object') continue;
    const normK = k.toLowerCase().replace(/[\s\-_]+/g, '');
    if (normStr === normK || normStr.includes(normK) || normK.includes(normStr)) {
      const maxCores = Number(v["МаксЖил"] || v["Максимальное количество жил"] || v["Количество жил"] || v.maxCores) || parseMaxCoresFromString(k);
      return {
        type: k,
        fullName: v["Полное наименование"] || v["Наименование"] || v.name || k,
        maxCores: maxCores || 27,
        unit: v["Единицы измерения"] || v.unit || 'шт',
        foundInCatalog: true
      };
    }
  }

  // Fallback if not found in coupling catalog
  const parsedCores = parseMaxCoresFromString(str) || 27;
  return {
    type: str,
    fullName: str.startsWith('Муфта') ? str : `Муфта кабельная соединительная ${str}`,
    maxCores: parsedCores,
    unit: 'шт',
    foundInCatalog: false
  };
}

// Determine coupling installation tier: 12, 27, 48, 61
function getCouplingInstallationTier(maxCores) {
  const cores = Number(maxCores) || 0;
  if (cores <= 12) return 12;
  if (cores <= 27) return 27;
  if (cores <= 48) return 48;
  return 61;
}

// Get coupling installation works array from rules or fallback
function getCouplingInstallationWorkItems(tier, rulesData) {
  const cableRules = getCableRules(rulesData || currentWorksRules);
  const foundItems = [];
  for (const r of cableRules.rules) {
    const rName = (r["Название"] || r.name || '').toLowerCase();
    if (rName.includes('муфт')) {
      const wm = r["Работы и материалы"] || r["Работы"] || {};
      const tierKey = String(tier);
      let tierItems = null;
      if (wm[tierKey] !== undefined) {
        tierItems = Array.isArray(wm[tierKey]) ? wm[tierKey] : [wm[tierKey]];
      } else if (Array.isArray(wm)) {
        tierItems = wm.filter(it => {
          const maxCores = Number(it["МаксЖил"] || it["Количество жил"] || it.maxCores);
          return maxCores === Number(tier);
        });
      }

      if (tierItems && tierItems.length > 0) {
        tierItems.forEach(it => {
          if (!it || typeof it !== 'object') return;
          foundItems.push({
            name: it["Наименование"] || it.name || '',
            unit: it["Единицы измерения"] || it.unit || 'шт',
            type: (it["Тип"] || it.type || 'работа').toLowerCase(),
            formula: it["Формула"] || it.formula || 'КОЛИЧЕСТВО',
            maxCores: it["МаксЖил"] || it["Количество жил"] || it.maxCores || tier
          });
        });
        if (foundItems.length > 0) break;
      }
    }
  }

  if (foundItems.length === 0) {
    foundItems.push({
      name: `Установка муфты кабельной соединительной подземной для кабеля с количеством жил до: ${tier} с гидрофобным заполнением`,
      unit: 'шт',
      type: 'работа',
      formula: 'КОЛИЧЕСТВО',
      maxCores: tier
    });
  }
  return foundItems;
}

// Get single coupling installation work definition (backwards compatibility)
function getCouplingInstallationWorkItem(tier, rulesData) {
  const items = getCouplingInstallationWorkItems(tier, rulesData);
  return items.find(it => it.type === 'работа') || items[0];
}

// Calculate active couplings summary from active cables and catalog
function getActiveCouplingsSummary(rulesData) {
  const rules = rulesData || currentWorksRules || cachedDefaultRules;
  const cableCatalog = getCableCatalog(rules);
  const couplingCatalog = getCouplingCatalog(rules);

  // Extract individual cable runs from tableCables or currentData
  const cableRows = [];
  const cableTable = document.getElementById('tableCables');
  if (cableTable) {
    const rows = cableTable.querySelectorAll('tbody tr');
    rows.forEach(r => {
      const typeCell = r.querySelector('[data-field="type"]');
      const lengthCell = r.querySelector('[data-field="length"]');
      const cableCell = r.querySelector('[data-field="cable"]');
      if (typeCell && lengthCell) {
        const rawType = typeCell.textContent.trim();
        const length = parseFloat(lengthCell.textContent.replace(/\s+/g, '').replace(/,/g, '.')) || 0;
        const cableName = cableCell ? cableCell.textContent.trim() : '';
        cableRows.push({ type: rawType, length, cable: cableName });
      }
    });
  } else if (currentData && Array.isArray(currentData.cables)) {
    currentData.cables.forEach(c => {
      cableRows.push({
        type: c.type || '',
        length: Number(c.length) || 0,
        cable: c.cable || ''
      });
    });
  }

  const couplingsMap = new Map();
  const missingCouplings = [];
  const missingInCatalog = [];
  let totalCouplingsCount = 0;

  cableRows.forEach(c => {
    if (!c.type || c.length <= 0) return;
    const cMeta = lookupCableInfo(c.type, cableCatalog);
    const buildLen = Number(cMeta.buildingLength) || 0;
    const count = buildLen > 0 ? Math.floor(c.length / buildLen) : 0;
    if (count > 0) {
      totalCouplingsCount += count;
      const cTypeKey = cMeta.coupling ? cMeta.coupling.trim() : '';
      if (!cTypeKey) {
        // Missing coupling configuration for cable
        missingCouplings.push({
          cable: c.cable || c.type,
          cableType: c.type,
          length: c.length,
          buildingLength: buildLen,
          couplingsNeeded: count
        });
      } else {
        if (!couplingsMap.has(cTypeKey)) {
          couplingsMap.set(cTypeKey, {
            couplingType: cTypeKey,
            count: 0,
            cableTypes: new Set(),
            cables: []
          });
        }
        const item = couplingsMap.get(cTypeKey);
        item.count += count;
        item.cableTypes.add(c.type);
        item.cables.push({
          cable: c.cable || c.type,
          type: c.type,
          length: c.length,
          count: count
        });
      }
    }
  });

  const tiers = {
    12: { tier: 12, titleTier: 'до 12 жил', count: 0, couplings: [] },
    27: { tier: 27, titleTier: 'до 27 жил', count: 0, couplings: [] },
    48: { tier: 48, titleTier: 'до 48 жил', count: 0, couplings: [] },
    61: { tier: 61, titleTier: 'до 61 жил', count: 0, couplings: [] }
  };

  couplingsMap.forEach((cData, cTypeKey) => {
    const cInfo = lookupCouplingInfo(cTypeKey, couplingCatalog);
    if (!cInfo.foundInCatalog) {
      missingInCatalog.push({
        couplingType: cTypeKey,
        count: cData.count,
        usedInCables: Array.from(cData.cableTypes)
      });
    }
    const tier = getCouplingInstallationTier(cInfo.maxCores);
    tiers[tier].count += cData.count;
    tiers[tier].couplings.push({
      couplingType: cTypeKey,
      fullName: cInfo.fullName,
      maxCores: cInfo.maxCores,
      unit: cInfo.unit || 'шт',
      count: cData.count,
      tier: tier,
      cableTypes: Array.from(cData.cableTypes),
      cables: cData.cables,
      foundInCatalog: cInfo.foundInCatalog
    });
  });

  let totalCablesWithCouplings = 0;
  couplingsMap.forEach(item => {
    totalCablesWithCouplings += item.cables.length;
  });

  return {
    totalCouplingsCount,
    couplingsCount: couplingsMap.size,
    totalCablesWithCouplings,
    tiers,
    couplingsList: Array.from(couplingsMap.values()),
    missingCouplings,
    missingInCatalog,
    hasMissingInfo: missingCouplings.length > 0 || missingInCatalog.length > 0
  };
}

// Extract numeric weight threshold (kg/m) from a work item
// Supports explicit properties (МаксВес, maxWeight, вес, масса) and parsing from Наименование
// Handles decimal comma or dot ("1,5" -> 1.5, "1.5" -> 1.5)
// Handles "до 1", "до: 1", "до 1,5", "до: 1,5", "до 1.5 кг", "массой 1 км, кг; до 1,5", "массой 1 км, кг; до 1000" (-> 1.0)
function extractWeightThreshold(work) {
  if (!work || typeof work !== 'object') return null;

  // 1. Try explicit properties
  const propVal = work["МаксВес"] !== undefined ? work["МаксВес"] :
                  (work.maxWeight !== undefined ? work.maxWeight :
                  (work["вес"] !== undefined ? work["вес"] : work["масса"]));
  let numProp = null;
  if (propVal !== undefined && propVal !== null && propVal !== '') {
    const s = String(propVal).trim().replace(',', '.');
    const n = parseFloat(s);
    if (!isNaN(n)) {
      numProp = n > 50 ? n / 1000 : n;
    }
  }

  // 2. Try parsing from name
  const name = String(work["Наименование"] || work.name || '').trim();
  let numFromName = null;

  // Weight thresholds only apply to cable works or works mentioning mass/weight/kg
  // Must NOT match distance expressions like "до 5 м", "до 10 м", "до 100 м" (перемещение грунта, бурение и т.д.)
  const hasWeightContext = /(?:кабел|масс[аое]|вес[аое]|кг(?:\/м)?)/i.test(name);
  if (hasWeightContext) {
    // A: Look for "массой ... до:? X"
    const matchMassDo = name.match(/масс[а-я0-9\s,;:]*?(?:до|макс(?:имум)?)\s*[:;]?\s*(\d+(?:[.,]\d+)?)/i);
    // B: Look for "до:? X\s*кг"
    const matchKgDo = name.match(/(?:до|макс(?:имум)?)\s*[:;]?\s*(\d+(?:[.,]\d+)?)\s*кг/i);
    // C: In cable work: "до: X" where unit is NOT distance (м, км, см, мм) or machine power
    let matchCableDo = null;
    if (!matchMassDo && !matchKgDo && /кабел/i.test(name)) {
      const matchCandidate = name.match(/(?:до|макс(?:имум)?)\s*[:;]?\s*(\d+(?:[.,]\d+)?)(?:\s*([а-яa-z]+))?/i);
      if (matchCandidate) {
        const trailingUnit = (matchCandidate[2] || '').toLowerCase();
        if (!['м', 'км', 'см', 'мм', 'т', 'квт', 'л.с.', 'шт', 'чел'].includes(trailingUnit)) {
          matchCableDo = matchCandidate;
        }
      }
    }

    const matchDo = matchMassDo || matchKgDo || matchCableDo;
    if (matchDo) {
      const rawVal = parseFloat(matchDo[1].replace(',', '.'));
      if (!isNaN(rawVal)) {
        if (rawVal > 50 && /1\s*км/i.test(name)) {
          numFromName = rawVal / 1000;
        } else {
          numFromName = rawVal;
        }
      }
    }
  }

  // If both exist, check if one was explicitly modified by user (e.g. non-standard or changed)
  if (numFromName !== null && numProp !== null) {
    if (numFromName === numProp) return numFromName;
    const isStandard = v => v === 1 || v === 2 || v === 3;
    if (!isStandard(numFromName) && isStandard(numProp)) return numFromName;
    if (!isStandard(numProp) && isStandard(numFromName)) return numProp;
    return numFromName;
  }

  if (numFromName !== null) return numFromName;
  if (numProp !== null) return numProp;
  return null;
}

// Check if work represents an "over threshold" category ("свыше 3 кг", "более 3", etc.)
function isOverWeightThreshold(work) {
  const name = String(work["Наименование"] || work.name || '').toLowerCase();
  if (!/(?:кабел|масс|вес|кг)/i.test(name)) return false;
  return /(?:свыше|более|от)\s*[:;]?\s*\d+/i.test(name);
}

// Weight tier categories: dynamically evaluated from rule, or fallback to standard 1, 2, 3, 6
function getCableWeightTier(weight, rule) {
  const w = Number(weight) || 0.35;
  if (rule) {
    const works = getRuleWorks(rule);
    const thresholds = works
      .map(extractWeightThreshold)
      .filter(t => t !== null)
      .sort((a, b) => a - b);
    if (thresholds.length > 0) {
      for (const t of thresholds) {
        if (w <= t) return t;
      }
      return thresholds[thresholds.length - 1];
    }
  }
  if (w <= 1.0) return 1;
  if (w <= 2.0) return 2;
  if (w <= 3.0) return 3;
  return 6;
}

// Active rules state and cached standard rules loaded dynamically from works_rules.json
let cachedDefaultRules = null;
let currentWorksRules = { "Строительные работы": [], "Монтажные работы": [] };

// Initialize tooltips and event listeners
document.addEventListener('DOMContentLoaded', () => {
  initTooltips();
  setupEventListeners();
  setupDragAndDrop();
  initWorksRules();
});

function toggleRawColumnCollapse(forceState) {
  const mainRow = document.getElementById('mainContentRow');
  const expandedContent = document.getElementById('rawCardExpandedContent');
  const collapsedContent = document.getElementById('rawCardCollapsedContent');
  const toggleBtn = document.getElementById('toggleRawColBtn');

  if (!mainRow || !expandedContent || !collapsedContent) return;

  isRawColCollapsed = typeof forceState === 'boolean' ? forceState : !isRawColCollapsed;

  if (isRawColCollapsed) {
    mainRow.classList.add('row-raw-collapsed');
    expandedContent.classList.add('d-none');
    expandedContent.classList.remove('d-flex');
    collapsedContent.classList.remove('d-none');
    collapsedContent.classList.add('d-flex');
    if (toggleBtn) {
      toggleBtn.setAttribute('title', 'Развернуть панель исходных данных');
      toggleBtn.setAttribute('data-bs-original-title', 'Развернуть панель исходных данных');
      toggleBtn.innerHTML = "<i class='bx bx-chevrons-right fs-5'></i>";
    }
  } else {
    mainRow.classList.remove('row-raw-collapsed');
    collapsedContent.classList.add('d-none');
    collapsedContent.classList.remove('d-flex');
    expandedContent.classList.remove('d-none');
    expandedContent.classList.add('d-flex');
    if (toggleBtn) {
      toggleBtn.setAttribute('title', 'Свернуть панель исходных данных');
      toggleBtn.setAttribute('data-bs-original-title', 'Свернуть панель исходных данных');
      toggleBtn.innerHTML = "<i class='bx bx-chevrons-left fs-5'></i>";
    }
  }

  // Remove any open tooltips to prevent orphaned tooltip bubbles
  document.querySelectorAll('.tooltip').forEach(t => t.remove());
  initTooltips();
}

function initTooltips() {
  if (window.bootstrap && bootstrap.Tooltip) {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
  }
}

function showToast(message, type = 'info', title = 'Уведомление', delay = 4000) {
  const toastEl = document.getElementById('liveToast');
  const toastText = document.getElementById('toastText');
  const toastTitle = document.getElementById('toastTitle');
  const toastHeader = document.getElementById('toastHeader');
  const toastIcon = document.getElementById('toastIcon');

  if (!toastEl || !toastText) {
    alert(message);
    return;
  }

  toastText.textContent = message;
  if (toastTitle) toastTitle.textContent = title;

  if (toastHeader) {
    toastHeader.className = 'toast-header ' + (
      type === 'error' ? 'bg-danger text-white' :
      type === 'warning' ? 'bg-warning text-dark' :
      type === 'success' ? 'bg-success text-white' : 'bg-primary text-white'
    );
  }

  if (toastIcon) {
    toastIcon.className = 'fs-4 me-2 bx ' + (
      type === 'error' ? 'bx-error-circle' :
      type === 'warning' ? 'bx-alarm-exclamation text-dark' :
      type === 'success' ? 'bx-check-circle' : 'bx-info-circle'
    );
  }

  if (window.bootstrap && bootstrap.Toast) {
    const toast = new bootstrap.Toast(toastEl, { delay: type === 'warning' ? Math.max(delay, 7000) : delay });
    toast.show();
  }
}

function setupEventListeners() {
  const fileInput = document.getElementById('input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileInput);
  }

  const loadSampleBtn = document.getElementById('loadSampleBtn');
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', loadSampleData);
  }

  const canEditBtn = document.getElementById('canEdit');
  if (canEditBtn) {
    canEditBtn.addEventListener('click', toggleEditMode);
  }

  const calculateBtn = document.getElementById('calculate');
  if (calculateBtn) {
    calculateBtn.addEventListener('click', calculateVolumes);
  }

  // Data upload buttons
  const uploadDataBtn = document.getElementById('uploadDataBtn');
  if (uploadDataBtn) {
    uploadDataBtn.addEventListener('click', () => {
      const fileInput = document.getElementById('input');
      if (fileInput) fileInput.click();
    });
  }

  const menuUploadData = document.getElementById('menuUploadData');
  if (menuUploadData) {
    menuUploadData.addEventListener('click', (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('input');
      if (fileInput) fileInput.click();
    });
  }

  // Works rules (JSON) editor & modal open buttons
  const openWorksRulesBtn = document.getElementById('openWorksRulesBtn');
  if (openWorksRulesBtn) {
    openWorksRulesBtn.addEventListener('click', () => openWorksRulesModal('editor'));
  }

  const menuUploadWorksJson = document.getElementById('menuUploadWorksJson');
  if (menuUploadWorksJson) {
    menuUploadWorksJson.addEventListener('click', (e) => {
      e.preventDefault();
      const rulesFileInput = document.getElementById('rulesFileInput');
      if (rulesFileInput) rulesFileInput.click();
    });
  }

  const menuEditWorksJson = document.getElementById('menuEditWorksJson');
  if (menuEditWorksJson) {
    menuEditWorksJson.addEventListener('click', (e) => {
      e.preventDefault();
      openWorksRulesModal('editor');
    });
  }

  const menuViewCablesCatalog = document.getElementById('menuViewCablesCatalog');
  if (menuViewCablesCatalog) {
    menuViewCablesCatalog.addEventListener('click', (e) => {
      e.preventDefault();
      openWorksRulesModal('cables');
    });
  }

  // Setup Works Rules modal controls & JSON editor listeners
  setupWorksRulesListeners();

  const exportBtn = document.getElementById('export');
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCurrentDataJSON();
    });
  }

  const exportExcelBtn = document.getElementById('exportExcel');
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCurrentDataExcel();
    });
  }

  const exportResultBtn = document.getElementById('exportResult');
  if (exportResultBtn) {
    exportResultBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCalculationResults();
    });
  }

  const exportVorExcelBtn = document.getElementById('exportVorExcel');
  if (exportVorExcelBtn) {
    exportVorExcelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportVorExcel();
    });
  }

  const exportVorBtn = document.getElementById('exportVorBtn');
  if (exportVorBtn) {
    exportVorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCalculationResults();
    });
  }

  const exportVorExcelQuickBtn = document.getElementById('exportVorExcelQuickBtn');
  if (exportVorExcelQuickBtn) {
    exportVorExcelQuickBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportVorExcel();
    });
  }

  // Works rules (JSON) event listeners
  const rulesFileInput = document.getElementById('rulesFileInput');
  if (rulesFileInput) {
    rulesFileInput.addEventListener('change', handleRulesFileInput);
  }

  const resetRulesBtn = document.getElementById('resetRulesBtn');
  if (resetRulesBtn) {
    resetRulesBtn.addEventListener('click', resetWorksRules);
  }

  const downloadRulesBtn = document.getElementById('downloadRulesBtn');
  if (downloadRulesBtn) {
    downloadRulesBtn.addEventListener('click', downloadWorksRules);
  }

  const rulesModalEl = document.getElementById('worksRulesModal');
  if (rulesModalEl) {
    rulesModalEl.addEventListener('show.bs.modal', renderRulesModalContent);
  }

  // Header data search & expand/collapse listeners
  const searchInput = document.getElementById('tableFilterInput');
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value;
      if (clearFilterBtn) {
        if (q) clearFilterBtn.classList.remove('d-none');
        else clearFilterBtn.classList.add('d-none');
      }
      filterTableRows(q);
    });
  }

  if (clearFilterBtn && searchInput) {
    clearFilterBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearFilterBtn.classList.add('d-none');
      filterTableRows('');
      searchInput.focus();
    });
  }

  const expandAllBtn = document.getElementById('expandAllBtn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      document.querySelectorAll('#processedData .accordion-collapse').forEach(el => {
        if (window.bootstrap && bootstrap.Collapse) {
          bootstrap.Collapse.getOrCreateInstance(el).show();
        } else {
          el.classList.add('show');
        }
      });
    });
  }

  const collapseAllBtn = document.getElementById('collapseAllBtn');
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      document.querySelectorAll('#processedData .accordion-collapse').forEach(el => {
        if (window.bootstrap && bootstrap.Collapse) {
          bootstrap.Collapse.getOrCreateInstance(el).hide();
        } else {
          el.classList.remove('show');
        }
      });
    });
  }

  const resetBtn = document.getElementById('resetDataBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetDataToEmpty);
  }

  // Toggle raw data column collapse / expand
  const toggleRawColBtn = document.getElementById('toggleRawColBtn');
  if (toggleRawColBtn) {
    toggleRawColBtn.addEventListener('click', () => toggleRawColumnCollapse());
  }

  const expandRawColBtn = document.getElementById('expandRawColBtn');
  if (expandRawColBtn) {
    expandRawColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRawColumnCollapse(false);
    });
  }

  const collapsedRawContent = document.getElementById('rawCardCollapsedContent');
  if (collapsedRawContent) {
    collapsedRawContent.addEventListener('click', (e) => {
      if (e.target.closest('#collapsedCalcBtn') || e.target.closest('#expandRawColBtn')) return;
      toggleRawColumnCollapse(false);
    });
  }

  const collapsedCalcBtn = document.getElementById('collapsedCalcBtn');
  if (collapsedCalcBtn) {
    collapsedCalcBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      calculateVolumes();
    });
  }
}

function setupDragAndDrop() {
  const container = document.querySelector('.main-container');
  if (!container) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    container.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropZone = document.getElementById('dropZone');
      if (dropZone) dropZone.classList.add('border-primary', 'bg-light');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    container.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropZone = document.getElementById('dropZone');
      if (dropZone) dropZone.classList.remove('border-primary', 'bg-light');
    }, false);
  });

  container.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, false);
}

function handleFileInput(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  processFile(files[0]);
  e.target.value = '';
}

function processFile(file) {
  const fileName = file.name;
  currentFileName = fileName;

  if (fileName.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        currentData = json;
        renderProcessedData(json, fileName);
        toggleRawColumnCollapse(false);
        calculateVolumes();
        showToast(`Файл "${fileName}" успешно загружен и рассчитан`, 'success', 'Успешно');
      } catch (err) {
        showToast(`Ошибка парсинга JSON: ${err.message}`, 'error', 'Ошибка');
      }
    };
    reader.onerror = () => {
      showToast('Ошибка чтения файла', 'error', 'Ошибка');
    };
    reader.readAsText(file);
  } else {
    showToast('Пожалуйста, выберите файл с исходными данными в формате .json', 'error', 'Неверный формат');
  }
}

// Quick load sample data_export.json
function loadSampleData() {
  fetch('./data_export.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP status ${res.status}`);
      return res.json();
    })
    .then(data => {
      currentFileName = 'data_export.json';
      currentData = data;
      renderProcessedData(data, 'data_export.json');
      toggleRawColumnCollapse(false);
      calculateVolumes();
      showToast('Пример "data_export.json" успешно загружен и рассчитан', 'success', 'Загружено');
    })
    .catch(err => {
      showToast(`Не удалось загрузить data_export.json: ${err.message}`, 'error', 'Ошибка');
    });
}

// Render data inside the "Исходные данные" accordion
function renderProcessedData(data, fileName) {
  const container = document.getElementById('processedData');
  if (!container) return;

  container.innerHTML = '';

  const activeFileNameEl = document.getElementById('activeFileName');
  if (activeFileNameEl) {
    activeFileNameEl.innerHTML = `<span class="badge bg-primary-subtle text-primary border me-1"><i class='bx bx-check-circle me-1'></i>${escapeHtml(fileName)}</span>`;
  }

  const collapsedFileBadge = document.getElementById('collapsedFileBadge');
  if (collapsedFileBadge) {
    collapsedFileBadge.setAttribute('title', fileName || 'Файл загружен');
    collapsedFileBadge.setAttribute('data-bs-original-title', fileName || 'Файл загружен');
  }

  let totalCablesCount = 0;
  let totalCableLength = 0;
  let totalRoutingCount = 0;
  let totalRoutingLength = 0;

  if (data.cables && Array.isArray(data.cables)) {
    totalCablesCount = data.cables.length;
    totalCableLength = data.cables.reduce((acc, c) => acc + (Number(c.length) || 0), 0);
  }
  if (data.routingTypeBlocks && Array.isArray(data.routingTypeBlocks)) {
    totalRoutingCount = data.routingTypeBlocks.length;
    totalRoutingLength = data.routingTypeBlocks.reduce((acc, r) => acc + (Number(r.length) || 0), 0);
  }

  // Activate header controls toolbar and reset button
  const dataToolbar = document.getElementById('dataToolbarControls');
  if (dataToolbar) dataToolbar.classList.remove('d-none');
  const resetBtn = document.getElementById('resetDataBtn');
  if (resetBtn) resetBtn.classList.remove('d-none');
  const searchInput = document.getElementById('tableFilterInput');
  if (searchInput) searchInput.value = '';
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  if (clearFilterBtn) clearFilterBtn.classList.add('d-none');
  const badge = document.getElementById('filteredMatchBadge');
  if (badge) badge.classList.add('d-none');

  // 1. Cables section
  if (data.cables && Array.isArray(data.cables)) {
    const cableAcc = createCablesAccordion(data.cables, totalCableLength);
    container.appendChild(cableAcc);
  }

  // 2. Routing section
  if (data.routingTypeBlocks && Array.isArray(data.routingTypeBlocks)) {
    const routingAcc = createRoutingAccordion(data.routingTypeBlocks, totalRoutingLength);
    container.appendChild(routingAcc);
  }

  // 3. Generic JSON arrays / objects
  if (!data.cables && !data.routingTypeBlocks) {
    if (Array.isArray(data)) {
      container.appendChild(createGenericTableAccordion('Данные', data));
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([key, val]) => {
        if (Array.isArray(val)) {
          container.appendChild(createGenericTableAccordion(key, val));
        }
      });
    }
  }

  // Update edit styles if active
  updateEditableElements();
  initTooltips();
}

function createCablesAccordion(cables, totalLength) {
  const accItem = document.createElement('div');
  accItem.className = 'accordion-item border rounded-3 mb-3 shadow-none overflow-hidden';

  const headerId = 'headingCables';
  const collapseId = 'collapseCables';

  // Count mismatches and missing couplings
  const mismatchCount = cables.filter(c => Boolean(c.lengthMismatch)).length;
  let totalCouplingsCount = 0;
  const missingCouplingTypesSet = new Set();

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-responsive custom-table-scroll';

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover table-striped mb-0 text-start align-middle';
  table.id = 'tableCables';

  // Table header - with coupling count column
  table.innerHTML = `
    <thead class="table-sticky-header">
      <tr>
        <th style="width: 35px;" class="text-center">№</th>
        <th style="width: 75px;">handle</th>
        <th style="min-width: 110px;">Обозначение</th>
        <th style="width: 75px;" class="text-end">Длина,м</th>
        <th style="min-width: 100px;">Тип кабеля</th>
        <th style="min-width: 160px;">Способ прокладки</th>
        <th style="width: 85px;" class="text-center">Муфты</th>
        <th style="width: 65px;" class="text-center">Длина</th>
        <th class="action-col d-none" style="width: 35px;"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  cables.forEach((c, idx) => {
    const row = document.createElement('tr');
    row.dataset.index = idx;
    row._cableData = c;

    // Formatting routing type: render each routing type as a multi-line badge
    let routingHtml = '<span class="text-muted">-</span>';
    let routingSumLength = 0;
    let rawRouting = c['routing type'] || c.routingType || c.routing_type || c['способы прокладки'] || c['способ прокладки'];
    if (typeof rawRouting === 'string' && rawRouting.trim()) {
      rawRouting = { [rawRouting.trim()]: [c.length || 0] };
    } else if (Array.isArray(rawRouting)) {
      const conv = {};
      rawRouting.forEach(item => {
        if (typeof item === 'string') conv[item.trim()] = [c.length || 0];
        else if (item && typeof item === 'object') Object.assign(conv, item);
      });
      rawRouting = conv;
    }
    if (rawRouting && typeof rawRouting === 'object') {
      const entries = Object.entries(rawRouting);
      if (entries.length > 0) {
        routingHtml = `<div class="d-flex flex-wrap gap-1 cell-wrap py-0_5">` + 
          entries.map(([rtype, lengths]) => {
            const arr = Array.isArray(lengths) ? lengths : [lengths];
            const sumForType = arr.reduce((acc, val) => acc + (Number(val) || 0), 0);
            routingSumLength += sumForType;
            const lenStr = arr.join(' + ');
            return `<span class="routing-tag">` +
              `<span class="fw-semibold">${escapeHtml(rtype)}:</span> <span>${escapeHtml(String(lenStr))} м</span>` +
            `</span>`;
          }).join('') +
        `</div>`;
      }
    }

    const mismatchIcon = c.lengthMismatch 
      ? '<span class="d-inline-flex align-items-center justify-content-center text-danger" title="Несоответствие длины трассы" data-bs-toggle="tooltip"><i class="bx bx-error fs-5"></i></span>' 
      : '<span class="d-inline-flex align-items-center justify-content-center text-success" title="Длина соответствует" data-bs-toggle="tooltip"><i class="bx bx-check fs-5"></i></span>';

    const rawType = c.type || '';
    const normType = normalizeCableType(rawType);
    const typeTitleAttr = (normType && normType !== rawType.trim())
      ? ` title="Марка кабеля при расчете: ${escapeHtml(normType)}"`
      : '';

    // Coupling calculation and info lookup from catalog
    const effectiveType = normType || rawType;
    const info = lookupCableInfo(effectiveType);
    const cableLen = Number(c.length) || 0;
    const buildLen = Number(info.buildingLength) || 0;
    const couplingCount = buildLen > 0 ? Math.floor(cableLen / buildLen) : 0;
    totalCouplingsCount += couplingCount;

    const couplingName = (info.coupling || '').trim();
    const hasCouplingInfo = Boolean(couplingName && couplingName.toLowerCase() !== 'уточнить' && couplingName.toLowerCase() !== '-');

    if (!hasCouplingInfo && effectiveType.trim()) {
      missingCouplingTypesSet.add(effectiveType.trim());
    }

    let couplingHtml = '';
    if (hasCouplingInfo) {
      const countBadge = couplingCount > 0 
        ? `<span class="badge bg-primary text-white fw-semibold px-1_5 py-0_5" style="font-size: 0.72rem;">${couplingCount}</span>` 
        : `<span class="text-muted small">0</span>`;
      couplingHtml = `
        <div class="d-flex flex-column align-items-center justify-content-center">
          <div>${countBadge}</div>
          <div class="text-muted text-truncate font-monospace" style="font-size: 0.68rem; max-width: 110px;" title="Тип муфты: ${escapeHtml(couplingName)} (строит. длина: ${buildLen} м)">
            ${escapeHtml(couplingName)}
          </div>
        </div>
      `;
    } else {
      const countBadge = couplingCount > 0 
        ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning fw-semibold px-1_5 py-0_5" style="font-size: 0.72rem;">${couplingCount}</span>` 
        : `<span class="text-muted small">0</span>`;
      couplingHtml = `
        <div class="d-flex flex-column align-items-center justify-content-center">
          <div>${countBadge}</div>
          <span class="badge bg-warning-subtle text-warning border border-warning-subtle d-inline-flex align-items-center gap-1 mt-0_5 py-0 px-1" style="font-size: 0.65rem; cursor: pointer;" title="Тип муфты не указан в справочнике кабелей. Кликните, чтобы открыть справочник" onclick="openWorksRulesModal('cables')">
            <i class='bx bx-error-circle'></i>Нет типа муфты
          </span>
        </div>
      `;
    }

    row.innerHTML = `
      <td class="text-muted small text-center">${idx + 1}</td>
      <td class="font-monospace text-muted small cell-wrap" style="font-size: 0.75rem;">${escapeHtml(c.handle || '')}</td>
      <td class="fw-medium canEdit cell-wrap small" data-field="cable">${escapeHtml(c.cable || '')}</td>
      <td class="canEdit text-end font-monospace fw-semibold small" data-field="length">${c.length ?? 0}</td>
      <td class="canEdit cell-wrap small" data-field="type"${typeTitleAttr}>${escapeHtml(rawType)}</td>
      <td class="cell-wrap">${routingHtml}</td>
      <td class="text-center align-middle">${couplingHtml}</td>
      <td class="text-center align-middle">${mismatchIcon}</td>
      <td class="action-col d-none text-center">
        <button type="button" class="btn btn-sm btn-outline-danger p-0 border-0 removeRowBtn" title="Удалить строку">
          <i class='bx bx-trash fs-5'></i>
        </button>
      </td>
    `;

    const removeBtn = row.querySelector('.removeRowBtn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
      });
    }

    tbody.appendChild(row);
  });

  tableWrapper.appendChild(table);

  const missingCouplingsCount = missingCouplingTypesSet.size;

  let missingCouplingsAlert = '';
  if (missingCouplingsCount > 0) {
    const missingBadges = Array.from(missingCouplingTypesSet)
      .map(t => `<span class="badge bg-body text-body border me-1 font-monospace" style="font-size: 0.75rem;">${escapeHtml(t)}</span>`)
      .join(' ');

    missingCouplingsAlert = `
      <div class="alert alert-warning border-warning shadow-sm mx-3 mt-3 mb-2 py-2 px-3 small d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
          <div>
            <div class="fw-bold text-dark mb-1">
              Внимание: в справочнике кабелей не указан тип муфты для ${missingCouplingsCount} марок:
            </div>
            <div class="d-flex flex-wrap gap-1 align-items-center mb-1">
              ${missingBadges}
            </div>
            <div class="text-muted" style="font-size: 0.78rem; line-height: 1.35;">
              Для корректного подсчета и спецификации подземных муфт укажите тип муфты и строительную длину в разделе «Справочник кабелей».
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-xs btn-outline-dark d-inline-flex align-items-center gap-1 py-1 px-2 mt-1 mt-md-0 flex-shrink-0" style="font-size: 0.75rem;" onclick="openWorksRulesModal('cables')">
          <i class="bx bx-book-open"></i> Открыть справочник кабелей
        </button>
      </div>
    `;
  }

  const mismatchBadgeHeader = mismatchCount > 0
    ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle d-inline-flex align-items-center">
        <i class='bx bx-error me-1'></i>Несоответствий: ${mismatchCount}
       </span>`
    : '';

  const missingCouplingHeaderBadge = missingCouplingsCount > 0
    ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning d-inline-flex align-items-center" title="Нет информации о типе муфты для ${missingCouplingsCount} марок">
        <i class='bx bx-error-circle me-1'></i>Муфты без типа: ${missingCouplingsCount}
       </span>`
    : '';

  const headerBadges = [
    missingCouplingHeaderBadge,
    mismatchBadgeHeader,
    `<span class="badge bg-primary-subtle text-primary border">${cables.length} шт. / ${Math.round(totalLength).toLocaleString('ru-RU')} м</span>`
  ].filter(Boolean).join('');

  accItem.innerHTML = `
    <h2 class="accordion-header" id="${headerId}">
      <button class="accordion-button py-2 px-3 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="true" aria-controls="${collapseId}">
        <div class="d-flex align-items-center justify-content-between w-100 me-2">
          <div class="d-flex align-items-center gap-2">
            <i class='bx bx-git-branch text-primary fs-4'></i>
            <span>Кабели</span>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            ${headerBadges}
          </div>
        </div>
      </button>
    </h2>
    <div id="${collapseId}" class="accordion-collapse collapse show" aria-labelledby="${headerId}">
      <div class="accordion-body p-0">
        ${missingCouplingsAlert}
        <!-- table appended here -->
      </div>
    </div>
  `;

  accItem.querySelector('.accordion-body').appendChild(tableWrapper);
  return accItem;
}

function createRoutingAccordion(blocks, totalLength) {
  const accItem = document.createElement('div');
  accItem.className = 'accordion-item border rounded-3 mb-2 shadow-none overflow-hidden';

  const headerId = 'headingRouting';
  const collapseId = 'collapseRouting';

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-responsive custom-table-scroll';

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover table-striped mb-0 text-start align-middle';
  table.id = 'tableRouting';

  table.innerHTML = `
    <thead class="table-sticky-header">
      <tr>
        <th style="width: 45px;" class="text-center">№</th>
        <th style="width: 85px;">Handle</th>
        <th style="min-width: 140px;">Тип прокладки</th>
        <th style="width: 90px;" class="text-end">Длина, м</th>
        <th style="width: 70px;" class="text-center">Кабелей</th>
        <th style="min-width: 240px;">Состав кабелей в траншее</th>
        <th class="action-col d-none" style="width: 40px;"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  blocks.forEach((b, idx) => {
    const row = document.createElement('tr');
    row.dataset.index = idx;

    // Multiline wrapped pills for contained cables - NEVER TRUNCATE
    let containedHtml = '<span class="text-muted">-</span>';
    if (Array.isArray(b.contained) && b.contained.length > 0) {
      containedHtml = `
        <div class="d-flex flex-wrap gap-1 align-items-center py-1 cell-wrap">
          ${b.contained.map(cableName => 
            `<span class="cable-pill">${escapeHtml(cableName)}</span>`
          ).join('')}
        </div>
      `;
    } else if (b.contained) {
      containedHtml = `<span class="cell-wrap">${escapeHtml(String(b.contained))}</span>`;
    }

    row.innerHTML = `
      <td class="text-muted small text-center">${idx + 1}</td>
      <td class="font-monospace text-muted small cell-wrap">${escapeHtml(b.handle || '')}</td>
      <td class="canEdit fw-bold cell-wrap" data-field="type">${escapeHtml(b.type || '')}</td>
      <td class="canEdit text-end font-monospace fw-semibold" data-field="length">${b.length ?? 0}</td>
      <td class="text-center font-monospace">${b.cablesCount ?? 0}</td>
      <td class="cell-wrap">${containedHtml}</td>
      <td class="action-col d-none text-center">
        <button type="button" class="btn btn-sm btn-outline-danger p-0 border-0 removeRowBtn" title="Удалить строку">
          <i class='bx bx-trash fs-5'></i>
        </button>
      </td>
    `;

    const removeBtn = row.querySelector('.removeRowBtn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
      });
    }

    tbody.appendChild(row);
  });

  tableWrapper.appendChild(table);

  accItem.innerHTML = `
    <h2 class="accordion-header" id="${headerId}">
      <button class="accordion-button collapsed py-2 px-3 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
        <div class="d-flex align-items-center justify-content-between w-100 me-2">
          <div class="d-flex align-items-center gap-2">
            <i class='bx bx-layer text-info fs-4'></i>
            <span>Участки трассы / траншеи</span>
          </div>
          <span class="badge bg-info-subtle text-info-emphasis border">${blocks.length} шт. / ${Math.round(totalLength).toLocaleString('ru-RU')} м</span>
        </div>
      </button>
    </h2>
    <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headerId}">
      <div class="accordion-body p-0">
        <!-- table appended here -->
      </div>
    </div>
  `;

  accItem.querySelector('.accordion-body').appendChild(tableWrapper);
  return accItem;
}

function createGenericTableAccordion(title, items) {
  const accItem = document.createElement('div');
  accItem.className = 'accordion-item border rounded-3 mb-3 shadow-none overflow-hidden';

  const collapseId = 'collapse_' + Math.random().toString(36).substr(2, 9);

  if (!items || items.length === 0) {
    accItem.innerHTML = `<div class="p-3 text-muted">Нет записей в ${escapeHtml(title)}</div>`;
    return accItem;
  }

  const keys = Object.keys(items[0]);
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-responsive custom-table-scroll';

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover table-striped mb-0 text-start align-middle';

  const thead = document.createElement('thead');
  thead.className = 'table-sticky-header';
  let headerHtml = '<tr><th style="width: 35px;" class="text-center">№</th>';
  keys.forEach(k => {
    headerHtml += `<th class="cell-wrap">${escapeHtml(k)}</th>`;
  });
  headerHtml += '</tr>';
  thead.innerHTML = headerHtml;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  items.forEach((item, idx) => {
    const row = document.createElement('tr');
    let rowHtml = `<td class="text-muted small text-center">${idx + 1}</td>`;
    keys.forEach(k => {
      let val = item[k];
      if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val);
      }
      rowHtml += `<td class="canEdit cell-wrap small" data-field="${escapeHtml(k)}">${escapeHtml(String(val ?? ''))}</td>`;
    });
    row.innerHTML = rowHtml;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  accItem.innerHTML = `
    <h2 class="accordion-header">
      <button class="accordion-button py-2 px-3 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="true">
        <div class="d-flex align-items-center justify-content-between w-100 me-2">
          <div class="d-flex align-items-center gap-2">
            <i class='bx bx-table text-primary fs-4'></i>
            <span>${escapeHtml(title)}</span>
          </div>
          <span class="badge bg-secondary-subtle text-secondary-emphasis border">${items.length} строк</span>
        </div>
      </button>
    </h2>
    <div id="${collapseId}" class="accordion-collapse collapse show">
      <div class="accordion-body p-0"></div>
    </div>
  `;

  accItem.querySelector('.accordion-body').appendChild(tableWrapper);
  return accItem;
}

function filterTableRows(query) {
  const q = query.trim().toLowerCase();
  const tables = document.querySelectorAll('#processedData table tbody');
  let matchCount = 0;
  let totalCount = 0;

  tables.forEach(tbody => {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      totalCount++;
      const text = row.textContent.toLowerCase();
      if (!q || text.includes(q)) {
        row.style.display = '';
        matchCount++;
      } else {
        row.style.display = 'none';
      }
    });
  });

  const badge = document.getElementById('filteredMatchBadge');
  if (badge) {
    if (q) {
      badge.textContent = `Найдено: ${matchCount} из ${totalCount}`;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }
}

function resetDataToEmpty() {
  currentData = null;
  currentFileName = '';

  const activeFileNameEl = document.getElementById('activeFileName');
  if (activeFileNameEl) activeFileNameEl.textContent = 'Файл не выбран';

  const collapsedFileBadge = document.getElementById('collapsedFileBadge');
  if (collapsedFileBadge) {
    collapsedFileBadge.setAttribute('title', 'Файл не выбран');
    collapsedFileBadge.setAttribute('data-bs-original-title', 'Файл не выбран');
  }

  const constructionBadgeTotal = document.getElementById('constructionBadgeTotal');
  if (constructionBadgeTotal) constructionBadgeTotal.classList.add('d-none');

  const installationBadgeTotal = document.getElementById('installationBadgeTotal');
  if (installationBadgeTotal) installationBadgeTotal.classList.add('d-none');

  const trenchMissingBadge = document.getElementById('trenchMissingBadge');
  if (trenchMissingBadge) trenchMissingBadge.classList.add('d-none');

  const cableMissingBadge = document.getElementById('cableMissingBadge');
  if (cableMissingBadge) cableMissingBadge.classList.add('d-none');

  const constructionMissingBadge = document.getElementById('constructionMissingBadge');
  if (constructionMissingBadge) constructionMissingBadge.classList.add('d-none');

  const installationMissingBadge = document.getElementById('installationMissingBadge');
  if (installationMissingBadge) installationMissingBadge.classList.add('d-none');

  // Hide header search and expand/collapse controls
  const dataToolbar = document.getElementById('dataToolbarControls');
  if (dataToolbar) dataToolbar.classList.add('d-none');
  const resetBtn = document.getElementById('resetDataBtn');
  if (resetBtn) resetBtn.classList.add('d-none');
  const searchInput = document.getElementById('tableFilterInput');
  if (searchInput) searchInput.value = '';
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  if (clearFilterBtn) clearFilterBtn.classList.add('d-none');
  const badge = document.getElementById('filteredMatchBadge');
  if (badge) badge.classList.add('d-none');

  const container = document.getElementById('processedData');
  if (container) {
    container.innerHTML = `
      <div id="dropZone" class="drop-zone-container p-4 p-md-5 text-center my-2">
        <div class="d-inline-flex p-3 rounded-circle bg-primary-subtle text-primary mb-3">
          <i class='bx bx-cloud-upload' style="font-size: 2.75rem;"></i>
        </div>
        <h4 class="mb-1 fw-bold fs-5">Загрузите свой файл или введите JSON</h4>
        <p class="text-muted fs-sm mb-4 mx-auto" style="max-width: 480px;">
          Перетащите файл <code>.json</code> сюда, выберите файл на устройстве либо откройте редактор для ручной корректировки исходных данных.
        </p>
        <div class="d-flex justify-content-center gap-2 flex-wrap">
          <label for="input" class="btn btn-primary px-3 mb-0 d-inline-flex align-items-center gap-2 shadow-sm" style="cursor: pointer;">
            <i class='bx bx-upload fs-5'></i>Загрузить свой файл (.json)
          </label>
          <button type="button" id="dropZoneEditJsonBtn" class="btn btn-outline-primary px-3 d-inline-flex align-items-center gap-2">
            <i class='bx bx-code-curly fs-5'></i>Редактировать JSON
          </button>
          <button type="button" id="loadSampleBtn" class="btn btn-outline-secondary px-3 d-inline-flex align-items-center gap-2">
            <i class='bx bx-file fs-5'></i>Загрузить пример
          </button>
        </div>
      </div>
    `;
    const btn = container.querySelector('#loadSampleBtn');
    if (btn) btn.addEventListener('click', loadSampleData);
    const editBtn = container.querySelector('#dropZoneEditJsonBtn');
    if (editBtn) editBtn.addEventListener('click', openJsonEditorModal);
  }

  // Clear results with polished empty states
  const resultCard = document.getElementById('result');
  if (resultCard) {
    resultCard.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class='bx bx-calculator fs-1 mb-2 text-muted opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Сводка по кабелям</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы сгруппировать кабели по маркоразмерам и суммировать длины</p>
      </div>
    `;
  }
  const resultCouplings = document.getElementById('resultCouplings');
  if (resultCouplings) {
    resultCouplings.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class='bx bx-layer fs-1 mb-2 text-muted opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Сводка по траншеям</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы сгруппировать типы траншей и трасс с подсчетом метража</p>
      </div>
    `;
  }
  const resultCouplingsStatement = document.getElementById('resultCouplingsStatement');
  if (resultCouplingsStatement) {
    resultCouplingsStatement.innerHTML = `
      <div class="text-center py-4 py-md-5 text-muted">
        <i class='bx bx-git-merge fs-1 mb-2 text-secondary opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Сводка по соединительным муфтам</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы выполнить подсчет муфт по строительным длинам кабелей и сгруппировать работы</p>
      </div>
    `;
  }
  const couplingBadgeTotal = document.getElementById('couplingBadgeTotal');
  if (couplingBadgeTotal) couplingBadgeTotal.classList.add('d-none');
  const couplingMissingBadge = document.getElementById('couplingMissingBadge');
  if (couplingMissingBadge) couplingMissingBadge.classList.add('d-none');

  const resultConstructionWorks = document.getElementById('resultConstructionWorks');
  if (resultConstructionWorks) {
    resultConstructionWorks.innerHTML = `
      <div class="text-center py-4 py-md-5 text-muted">
        <i class='bx bx-spreadsheet fs-1 mb-2 text-secondary opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Строительные работы (ВОР)</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы рассчитать объемы земляных и строительных работ по траншеям</p>
      </div>
    `;
  }
  const resultInstallationWorks = document.getElementById('resultInstallationWorks');
  if (resultInstallationWorks) {
    resultInstallationWorks.innerHTML = `
      <div class="text-center py-4 py-md-5 text-muted">
        <i class='bx bx-wrench fs-1 mb-2 text-secondary opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Монтажные работы (ВОР)</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы рассчитать объемы монтажных работ и кабельной продукции</p>
      </div>
    `;
  }

  showToast('Исходные данные сброшены', 'info', 'Сброс');
}

function toggleEditMode() {
  isEditable = !isEditable;
  const canEditBtn = document.getElementById('canEdit');
  if (canEditBtn) {
    if (isEditable) {
      canEditBtn.classList.add('btn-primary', 'text-white');
      canEditBtn.classList.remove('btn-outline-secondary');
      showToast('Режим редактирования включен: кликните на ячейку для изменения данных', 'info', 'Редактирование');
    } else {
      canEditBtn.classList.remove('btn-primary', 'text-white');
      canEditBtn.classList.add('btn-outline-secondary');
      showToast('Режим редактирования выключен', 'info', 'Редактирование');
    }
  }
  updateEditableElements();
}

function updateEditableElements() {
  const editableCells = document.querySelectorAll('#processedData .canEdit');
  editableCells.forEach(cell => {
    cell.contentEditable = isEditable ? 'true' : 'false';
  });

  const actionCols = document.querySelectorAll('#processedData .action-col');
  actionCols.forEach(col => {
    if (isEditable) {
      col.classList.remove('d-none');
    } else {
      col.classList.add('d-none');
    }
  });
}

/**
 * Нормализует марку/тип кабеля для ведомости объемов работ.
 * 
 * Правила:
 * 1. Кабели вида «4х2(2)» и «4х2(4)» — это один и тот же тип кабеля («4х2»),
 *    содержащий разное количество запасных жил в скобках.
 * 2. Оптические кабели связи: в марках вида «ОКБ-Н-Сп-4/2(2,0)Сп-16(2) "8кН"»:
 *    - «16» — общее число волокон;
 *    - «(2)» — число запасных волокон (отбрасывается при определении типа);
 *    - «(2,0)» — конструктивный диаметр ЦСЭ в мм (содержит запятую, НЕ является числом запаса и сохраняется);
 *    - «"8кН"» — маркировка допустимого растягивающего усилия (кН / kN) со сносками или без (сохраняется).
 *    В результате кабель нормализуется в точное наименование: «ОКБ-Н-Сп-4/2(2,0)Сп-16 "8кН"».
 * 3. Буквенные индексы горючести/исполнения: «(А)» в «ВБШвнг(А)-LS» или «(A)» в «ТехноКИПКПнг(A)-HF»
 *    НЕ являются запасом жил/волокон и гарантированно сохраняются.
 * 4. Число запаса жил/волокон отбрасывается:
 *    - Либо перед механической маркировкой прочности оптического кабеля (кН / kN, в кавычках или без);
 *    - Либо в конце строки или непосредственно перед условными знаками чертежа (*, **, #, &, Δ, \U+...).
 */
function normalizeCableType(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') return typeStr || 'Без типа';
  const str = typeStr.trim();
  if (!str) return 'Без типа';

  // Отбрасываем (целое число) запаса волокон/жил:
  // 1) Либо перед маркировкой растягивающего усилия оптического кабеля (кН/kN), например 16(2) "8кН" -> 16 "8кН"
  // 2) Либо в конце строки или перед сносками чертежа (*, **, #, &, \U+..., Δ)
  const cleaned = str.replace(
    /\s*\(\d+\)(?=(?:\s*[-—]?\s*["«']?\d+(?:[.,]\d+)?\s*(?:кН|кн|kN|kn)["»']?)?(?:\s*(?:[*#&^~!Δ§†‡№]|\\U\+[0-9a-fA-F]+))*$)/gi,
    ''
  ).trim();

  return cleaned || str || 'Без типа';
}

// Extract aggregated cable summary from DOM table or currentData
function getActiveCableSummary() {
  const cableTable = document.getElementById('tableCables');
  const cableSummary = {};
  const grandRoutingSummary = {};
  let grandTotalCableLength = 0;
  let grandTotalCableCount = 0;

  if (cableTable) {
    const rows = cableTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const typeCell = row.querySelector('[data-field="type"]');
      const lengthCell = row.querySelector('[data-field="length"]');
      if (typeCell && lengthCell) {
        const rawType = typeCell.textContent.trim() || 'Без типа';
        const type = normalizeCableType(rawType);
        const length = parseFloat(lengthCell.textContent.replace(/\s+/g, '').replace(/,/g, '.')) || 0;

        if (!cableSummary[type]) {
          cableSummary[type] = { count: 0, length: 0, routingTypes: {} };
        }
        cableSummary[type].count += 1;
        cableSummary[type].length += length;
        grandTotalCableCount += 1;
        grandTotalCableLength += length;

        // Extract routing type for this cable row
        const cableObj = row._cableData || (currentData && currentData.cables && currentData.cables[row.dataset.index]);
        let rawRt = (cableObj && (cableObj['routing type'] || cableObj.routingType || cableObj.routing_type || cableObj['способы прокладки'] || cableObj['способ прокладки'] || cableObj.way)) || {};
        if (typeof rawRt === 'string' && rawRt.trim()) {
          rawRt = { [rawRt.trim()]: [length] };
        } else if (Array.isArray(rawRt)) {
          const conv = {};
          rawRt.forEach(item => {
            if (typeof item === 'string') conv[item.trim()] = [length];
            else if (item && typeof item === 'object') Object.assign(conv, item);
          });
          rawRt = conv;
        }

        let hasRouting = false;
        const rtEntries = Object.entries(rawRt);
        for (const [rName, lengths] of rtEntries) {
          const trimmedName = (rName || '').trim();
          if (!trimmedName) continue;
          const arr = Array.isArray(lengths) ? lengths : [lengths];
          let sum = arr.reduce((acc, val) => acc + (Number(val) || 0), 0);
          // If 1 routing type has sum 0 but cable length > 0, assign full cable length
          if (sum === 0 && rtEntries.length === 1 && length > 0) {
            sum = length;
          }
          hasRouting = true;
          cableSummary[type].routingTypes[trimmedName] = (cableSummary[type].routingTypes[trimmedName] || 0) + sum;
          grandRoutingSummary[trimmedName] = (grandRoutingSummary[trimmedName] || 0) + sum;
        }

        if (!hasRouting && length > 0) {
          const fallbackName = 'Не определен';
          cableSummary[type].routingTypes[fallbackName] = (cableSummary[type].routingTypes[fallbackName] || 0) + length;
          grandRoutingSummary[fallbackName] = (grandRoutingSummary[fallbackName] || 0) + length;
        }
      }
    });
  } else if (currentData && currentData.cables) {
    currentData.cables.forEach(c => {
      const rawType = c.type || 'Без типа';
      const type = normalizeCableType(rawType);
      const length = Number(c.length) || 0;
      if (!cableSummary[type]) {
        cableSummary[type] = { count: 0, length: 0, routingTypes: {} };
      }
      cableSummary[type].count += 1;
      cableSummary[type].length += length;
      grandTotalCableCount += 1;
      grandTotalCableLength += length;

      let rawRt = c['routing type'] || c.routingType || c.routing_type || c['способы прокладки'] || c['способ прокладки'] || c.way || {};
      if (typeof rawRt === 'string' && rawRt.trim()) {
        rawRt = { [rawRt.trim()]: [length] };
      } else if (Array.isArray(rawRt)) {
        const conv = {};
        rawRt.forEach(item => {
          if (typeof item === 'string') conv[item.trim()] = [length];
          else if (item && typeof item === 'object') Object.assign(conv, item);
        });
        rawRt = conv;
      }

      let hasRouting = false;
      const rtEntries = Object.entries(rawRt);
      for (const [rName, lengths] of rtEntries) {
        const trimmedName = (rName || '').trim();
        if (!trimmedName) continue;
        const arr = Array.isArray(lengths) ? lengths : [lengths];
        let sum = arr.reduce((acc, val) => acc + (Number(val) || 0), 0);
        if (sum === 0 && rtEntries.length === 1 && length > 0) {
          sum = length;
        }
        hasRouting = true;
        cableSummary[type].routingTypes[trimmedName] = (cableSummary[type].routingTypes[trimmedName] || 0) + sum;
        grandRoutingSummary[trimmedName] = (grandRoutingSummary[trimmedName] || 0) + sum;
      }

      if (!hasRouting && length > 0) {
        const fallbackName = 'Не определен';
        cableSummary[type].routingTypes[fallbackName] = (cableSummary[type].routingTypes[fallbackName] || 0) + length;
        grandRoutingSummary[fallbackName] = (grandRoutingSummary[fallbackName] || 0) + length;
      }
    });
  }

  return {
    summary: cableSummary,
    totalCount: grandTotalCableCount,
    totalLength: grandTotalCableLength,
    grandRoutingSummary
  };
}

// Calculate Cable Volumes & Trench/Routing Volumes
function calculateVolumes() {
  const cableTable = document.getElementById('tableCables');
  const routingTable = document.getElementById('tableRouting');

  if (!cableTable && !routingTable && !currentData) {
    showToast('Сначала загрузите исходные данные для расчета', 'error', 'Внимание');
    return;
  }

  // 1. Calculate Cable summary with normalized cable types and routing types breakdown
  const cableData = getActiveCableSummary();
  const cableWorksCalc = renderCableResult(cableData.summary, cableData.totalCount, cableData.totalLength, cableData.grandRoutingSummary);

  // 2. Calculate Routing / Trench summary
  const routingSummary = {};
  let grandTotalRoutingLength = 0;
  let grandTotalRoutingCount = 0;

  if (routingTable) {
    const rows = routingTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const typeCell = row.querySelector('[data-field="type"]');
      const lengthCell = row.querySelector('[data-field="length"]');
      if (typeCell && lengthCell) {
        const type = typeCell.textContent.trim() || 'Без типа';
        const length = parseFloat(lengthCell.textContent.replace(/\s+/g, '').replace(/,/g, '.')) || 0;

        if (!routingSummary[type]) {
          routingSummary[type] = { count: 0, length: 0 };
        }
        routingSummary[type].count += 1;
        routingSummary[type].length += length;
        grandTotalRoutingCount += 1;
        grandTotalRoutingLength += length;
      }
    });
  } else if (currentData && currentData.routingTypeBlocks) {
    currentData.routingTypeBlocks.forEach(r => {
      const type = r.type || 'Без типа';
      const length = Number(r.length) || 0;
      if (!routingSummary[type]) routingSummary[type] = { count: 0, length: 0 };
      routingSummary[type].count += 1;
      routingSummary[type].length += length;
      grandTotalRoutingCount += 1;
      grandTotalRoutingLength += length;
    });
  }

  const trenchWorksCalc = renderRoutingResult(routingSummary, grandTotalRoutingCount, grandTotalRoutingLength);

  // 3. Calculate and render Couplings summary
  const couplingsSummary = getActiveCouplingsSummary(currentWorksRules);
  renderCouplingsResult(couplingsSummary);

  // Check if any rules or data are missing in Cable works, Trench works, or Couplings
  const cableMissingCount = (cableWorksCalc && cableWorksCalc.missingInRules) ? cableWorksCalc.missingInRules.length : 0;
  const trenchMissingCount = (trenchWorksCalc && trenchWorksCalc.missingInRules) ? trenchWorksCalc.missingInRules.length : 0;
  const couplingMissingCount = couplingsSummary.hasMissingInfo
    ? ((couplingsSummary.missingCouplings || []).length + (couplingsSummary.missingInCatalog || []).length)
    : 0;

  if (cableMissingCount > 0 || trenchMissingCount > 0 || couplingMissingCount > 0) {
    const missingItems = [];
    if (cableMissingCount > 0) {
      const names = cableWorksCalc.missingInRules.map(m => `«${m.type}»`).join(', ');
      missingItems.push(`по кабелям: ${names}`);
    }
    if (trenchMissingCount > 0) {
      const names = trenchWorksCalc.missingInRules.map(m => `«${m.type}»`).join(', ');
      missingItems.push(`по траншеям: ${names}`);
    }
    if (couplingMissingCount > 0) {
      missingItems.push(`по муфтам: ${couplingMissingCount} неполных позиций`);
    }
    showToast(
      `Внимание: обнаружены неполные данные (${missingItems.join('; ')}). Проверьте предупреждения в ведомостях.`,
      'warning',
      'Внимание'
    );
  } else {
    showToast('Расчет объемов успешно выполнен', 'success', 'Расчет завершен');
  }
}

function renderCableResult(summary, totalCount, totalLength, grandRoutingSummary) {
  const container = document.getElementById('result');
  if (!container) return;

  const catalog = getCableCatalog(currentWorksRules);
  const entries = Object.entries(summary).sort((a, b) => b[1].length - a[1].length);

  let rowsHtml = '';
  entries.forEach(([type, val], idx) => {
    const cMeta = lookupCableInfo(type, catalog);
    const opticalBadge = cMeta.isOptical
      ? `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle ms-1" style="font-size: 0.68rem; font-weight: 500;" title="Оптический кабель (ВОЛС). Прокладывается по нормам оптических кабелей независимо от веса">оптический</span>`
      : '';
    const notInCatalogBadge = !cMeta.foundInCatalog
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" style="font-size: 0.68rem; font-weight: normal;" title="Марка не найдена в справочнике кабелей. Принят оценочный вес: ${cMeta.weight} кг/м"><i class="bx bx-error-circle me-0_5"></i>нет в справочнике</span>`
      : '';

    const rtEntries = Object.entries(val.routingTypes || {}).sort((a, b) => b[1] - a[1]);
    let routingHtml = '<span class="text-muted small">-</span>';
    if (rtEntries.length > 0) {
      routingHtml = `<div class="d-flex flex-wrap gap-1 align-items-center py-1">` +
        rtEntries.map(([rName, len]) => {
          return `<span class="routing-tag py-0 px-2" style="font-size: 0.75rem;">` +
            `<span class="fw-semibold">${escapeHtml(rName)}:</span> <span class="font-monospace">${Math.round(len).toLocaleString('ru-RU')} м</span>` +
          `</span>`;
        }).join('') +
      `</div>`;
    }

    rowsHtml += `
      <tr>
        <td class="text-muted small text-center">${idx + 1}</td>
        <td class="fw-bold cell-wrap">${escapeHtml(type)}${opticalBadge}${notInCatalogBadge}</td>
        <td class="text-center font-monospace">${val.count}</td>
        <td class="text-end font-monospace fw-semibold">${Math.round(val.length).toLocaleString('ru-RU')}</td>
        <td class="cell-wrap">${routingHtml}</td>
      </tr>
    `;
  });

  const grandRtEntries = Object.entries(grandRoutingSummary || {}).sort((a, b) => b[1] - a[1]);
  let grandRoutingHtml = '<span class="text-muted small">-</span>';
  if (grandRtEntries.length > 0) {
    grandRoutingHtml = `<div class="d-flex flex-wrap gap-1 align-items-center py-1">` +
      grandRtEntries.map(([rName, len]) => {
        return `<span class="routing-tag py-0 px-2 bg-primary-subtle text-primary border border-primary-subtle" style="font-size: 0.75rem;">` +
          `<span class="fw-semibold">${escapeHtml(rName)}:</span> <span class="font-monospace">${Math.round(len).toLocaleString('ru-RU')} м</span>` +
        `</span>`;
      }).join('') +
    `</div>`;
  }

  container.innerHTML = `
    <div class="mb-2 d-flex flex-wrap gap-2">
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Длина кабелей</div>
        <div class="fw-bold text-primary font-monospace" style="font-size: 0.9rem;">${Math.round(totalLength).toLocaleString('ru-RU')} <span class="fw-normal text-muted" style="font-size: 0.7rem;">м</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Всего ниток</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${totalCount} <span class="fw-normal text-muted" style="font-size: 0.7rem;">шт</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Типов кабеля</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${entries.length}</div>
      </div>
    </div>

    <div class="table-responsive table-responsive-full rounded-2 border">
      <table class="table table-sm table-hover text-start align-middle mb-0">
        <thead class="table-sticky-header">
          <tr>
            <th style="width: 40px;" class="text-center">№</th>
            <th style="min-width: 120px;">Марка кабеля</th>
            <th class="text-center" style="width: 50px;">Шт</th>
            <th class="text-end" style="width: 90px;">Длина,м</th>
            <th style="min-width: 200px;">Способы прокладки</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot class="table-sticky-footer fw-bold">
          <tr>
            <td colspan="2" class="ps-2">Итого:</td>
            <td class="text-center font-monospace">${totalCount}</td>
            <td class="text-end font-monospace text-primary">${Math.round(totalLength).toLocaleString('ru-RU')}</td>
            <td class="cell-wrap">${grandRoutingHtml}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Calculate works from cables according to rules JSON ("Монтажные работы")
  const cableWorksCalc = calculateWorksFromCables(summary, currentWorksRules);
  window.lastCableWorksCalc = cableWorksCalc;

  // Render "Монтажные работы" into Column 3
  renderInstallationWorks(cableWorksCalc);

  return cableWorksCalc;
}

function renderInstallationWorks(cableWorksCalc) {
  const container = document.getElementById('resultInstallationWorks');
  if (!container) return;

  const worksCount = cableWorksCalc.works.filter(w => w.type === 'работа').length;
  const materialsCount = cableWorksCalc.works.filter(w => w.type === 'материал').length;

  const badgeTotal = document.getElementById('installationBadgeTotal');
  if (badgeTotal) {
    badgeTotal.textContent = `${worksCount} раб. / ${materialsCount} мат.`;
    badgeTotal.classList.remove('d-none');
  }

  // Update header badges
  const cableMissingBadge = document.getElementById('cableMissingBadge');
  const installationMissingBadge = document.getElementById('installationMissingBadge');
  const hasMissing = cableWorksCalc.missingInRules && cableWorksCalc.missingInRules.length > 0;

  [cableMissingBadge, installationMissingBadge].forEach(b => {
    if (!b) return;
    if (hasMissing) {
      b.classList.remove('d-none');
      b.innerHTML = `Неполные правила (${cableWorksCalc.missingInRules.length})`;
      b.onclick = () => openWorksRulesModal('editor');
    } else {
      b.classList.add('d-none');
    }
  });

  let missingCableAlertHtml = '';
  if (hasMissing) {
    const missingBadges = cableWorksCalc.missingInRules
      .map(m => `<span class="badge bg-body text-body border me-1 font-monospace" style="font-size: 0.75rem;">${escapeHtml(m.type)} <span class="text-muted">(${Math.round(m.length)} м)</span></span>`)
      .join(' ');
    missingCableAlertHtml = `
      <div class="alert alert-warning py-2 px-3 small d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap border-warning shadow-sm">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
          <div>
            <div class="fw-bold text-dark mb-1">
              Внимание: в разделе «Монтажные работы» отсутствуют сметные нормы для ${cableWorksCalc.missingInRules.length} способов прокладки:
            </div>
            <div class="d-flex flex-wrap gap-1 align-items-center mb-1">
              ${missingBadges}
            </div>
            <div class="text-muted" style="font-size: 0.78rem; line-height: 1.35;">
              Для данных способов прокладки работы не определены в правилах и не вошли в итоговую ведомость (ВОР). Рекомендуется дополнить сметные нормы соответствующими позициями работ и материалов.
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-xs btn-outline-dark d-inline-flex align-items-center gap-1 py-1 px-2 mt-1 mt-md-0 flex-shrink-0" id="addMissingCableRulesBtn" style="font-size: 0.75rem;" title="Добавить эти позиции в раздел «Монтажные работы»">
          <i class="bx bx-plus-circle"></i> Добавить в правила JSON
        </button>
      </div>
    `;
  }

  let missingCatalogAlertHtml = '';
  if (cableWorksCalc.missingInCatalog && cableWorksCalc.missingInCatalog.length > 0) {
    const missingBadges = cableWorksCalc.missingInCatalog
      .map(m => `<span class="badge bg-body text-body border me-1 font-monospace" style="font-size: 0.75rem;">${escapeHtml(m.type)} <span class="text-muted">(${Math.round(m.length)} м, расч. ~${m.fallbackWeight} кг/м)</span></span>`)
      .join(' ');
    missingCatalogAlertHtml = `
      <div class="alert alert-warning py-2 px-3 small d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap border-warning shadow-sm">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
          <div>
            <div class="fw-bold text-dark mb-1">
              Внимание: в справочнике кабелей отсутствуют данные для ${cableWorksCalc.missingInCatalog.length} марок:
            </div>
            <div class="d-flex flex-wrap gap-1 align-items-center mb-1">
              ${missingBadges}
            </div>
            <div class="text-muted" style="font-size: 0.78rem; line-height: 1.35;">
              Для данных кабелей применен приблизительный вес 1 м (до 1 кг/м). Рекомендуется дополнить справочник точными паспортными данными.
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-xs btn-outline-dark d-inline-flex align-items-center gap-1 py-1 px-2 mt-1 mt-md-0 flex-shrink-0" id="addMissingCablesToCatalogBtn" style="font-size: 0.75rem;" title="Добавить заготовки для этих кабелей в раздел «Справочник кабелей»">
          <i class="bx bx-plus-circle"></i> Добавить марки в справочник
        </button>
      </div>
    `;
  }

  let cableWorksRowsHtml = '';
  cableWorksCalc.works.forEach((w, idx) => {
    const isMaterial = (w.type === 'материал' || (w.type && String(w.type).toLowerCase().trim() === 'материал'));
    const isWork = !isMaterial;
    const rowClass = isWork ? 'table-row-work' : 'table-row-material';

    const tagBadge = isMaterial
      ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;">материал</span>`
      : '';
    const opticalBadge = w.isOptical
      ? `<span class="badge bg-info-subtle text-info-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;">ВОЛС</span>`
      : '';
    const catalogBadge = (w.foundInCatalog === false)
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;" title="Марка не найдена в справочнике кабелей"><i class="bx bx-error me-0_5"></i>нет в справочнике</span>`
      : '';

    const volumeStr = w.volume.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: w.unit === 'км' ? 3 : 2
    });

    const commentHtml = w.comment
      ? `<div class="text-muted small mt-0_5" style="font-size: 0.74rem; font-weight: normal;"><i class='bx bx-detail me-1 opacity-75'></i>${escapeHtml(w.comment)}</div>`
      : '';

    cableWorksRowsHtml += `
      <tr class="${rowClass}">
        <td class="text-muted small text-center">${idx + 1}</td>
        <td class="cell-wrap ${isWork ? 'fw-semibold' : 'fw-medium ps-3'}">
          ${escapeHtml(w.name)}${tagBadge}${opticalBadge}${catalogBadge}
          ${commentHtml}
        </td>
        <td class="text-center small text-nowrap">${escapeHtml(w.unit)}</td>
        <td class="text-end font-monospace fw-bold text-success">${volumeStr}</td>
        <td class="small text-muted cell-wrap" style="max-width: 140px; font-size: 0.78rem;">${escapeHtml(w.formulaDisplay)}</td>
      </tr>
    `;
  });

  if (cableWorksCalc.works.length > 0) {
    container.innerHTML = `
      ${missingCableAlertHtml}
      ${missingCatalogAlertHtml}

      <div class="table-responsive rounded-2 border mb-0 custom-table-scroll" style="max-height: 420px;">
        <table class="table table-sm table-hover text-start align-middle mb-0">
          <thead class="table-sticky-header">
            <tr>
              <th style="width: 35px;" class="text-center">№</th>
              <th>Работы и материалы</th>
              <th class="text-center" style="width: 55px;">Ед.</th>
              <th class="text-end" style="width: 75px;">Объем</th>
              <th style="width: 110px;">Формула</th>
            </tr>
          </thead>
          <tbody>
            ${cableWorksRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.innerHTML = `
      ${missingCableAlertHtml}
      ${missingCatalogAlertHtml}
      <div class="text-center py-4 px-2 text-muted small bg-light rounded border">
        <i class="bx bx-info-circle fs-4 d-block mb-1 text-secondary"></i>
        <div>Работы не определены для текущих способов прокладки кабелей.</div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="openWorksRulesModal('editor')">
          <i class="bx bx-edit"></i> Настроить раздел «Монтажные работы» в JSON
        </button>
      </div>
    `;
  }

  const addMissingCableRulesBtn = document.getElementById('addMissingCableRulesBtn');
  if (addMissingCableRulesBtn) {
    addMissingCableRulesBtn.addEventListener('click', () => {
      addMissingCableWaysToRules(cableWorksCalc.missingInRules);
    });
  }

  const addMissingCablesToCatalogBtn = document.getElementById('addMissingCablesToCatalogBtn');
  if (addMissingCablesToCatalogBtn) {
    addMissingCablesToCatalogBtn.addEventListener('click', () => {
      addMissingCablesToCatalog(cableWorksCalc.missingInCatalog);
    });
  }
}

function renderRoutingResult(summary, totalCount, totalLength) {
  const container = document.getElementById('resultCouplings');
  if (!container) return;

  const entries = Object.entries(summary).sort((a, b) => b[1].length - a[1].length);

  let rowsHtml = '';
  entries.forEach(([type, val], idx) => {
    const pct = totalLength > 0 ? ((val.length / totalLength) * 100).toFixed(1) : 0;
    rowsHtml += `
      <tr>
        <td class="text-muted small text-center">${idx + 1}</td>
        <td class="fw-bold cell-wrap">${escapeHtml(type)}</td>
        <td class="text-center font-monospace">${val.count}</td>
        <td class="text-end font-monospace fw-semibold">${Math.round(val.length).toLocaleString('ru-RU')}</td>
        <td class="text-end" style="width: 80px;">
          <div class="small font-monospace">${pct}%</div>
          <div class="progress" style="height: 4px;">
            <div class="progress-bar bg-info" role="progressbar" style="width: ${pct}%"></div>
          </div>
        </td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="mb-2 d-flex flex-wrap gap-2">
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Длина трасс</div>
        <div class="fw-bold text-info-emphasis font-monospace" style="font-size: 0.9rem;">${Math.round(totalLength).toLocaleString('ru-RU')} <span class="fw-normal text-muted" style="font-size: 0.7rem;">м</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Участков</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${totalCount} <span class="fw-normal text-muted" style="font-size: 0.7rem;">шт</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Типов траншей</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${entries.length}</div>
      </div>
    </div>

    <div class="table-responsive table-responsive-full rounded-2 border">
      <table class="table table-sm table-hover text-start align-middle mb-0">
        <thead class="table-sticky-header">
          <tr>
            <th style="width: 40px;" class="text-center">№</th>
            <th>Тип прокладки</th>
            <th class="text-center" style="width: 60px;">Участков</th>
            <th class="text-end" style="width: 85px;">Длина,м</th>
            <th class="text-end" style="width: 75px;">Доля</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot class="table-sticky-footer fw-bold">
          <tr>
            <td colspan="2" class="ps-2">Итого:</td>
            <td class="text-center font-monospace">${totalCount}</td>
            <td class="text-end font-monospace text-info-emphasis">${Math.round(totalLength).toLocaleString('ru-RU')}</td>
            <td class="text-end small font-monospace">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Calculate works from trenches according to rules JSON ("Строительные работы")
  const trenchSummary = getActiveTrenchSummary();
  const worksCalc = calculateWorksFromTrenches(trenchSummary, currentWorksRules);
  window.lastTrenchWorksCalc = worksCalc;

  // Render "Строительные работы" into Column 3
  renderConstructionWorks(worksCalc);

  return worksCalc;
}

function renderConstructionWorks(worksCalc) {
  const container = document.getElementById('resultConstructionWorks');
  if (!container) return;

  const badgeTotal = document.getElementById('constructionBadgeTotal');
  if (badgeTotal) {
    badgeTotal.textContent = `${worksCalc.works.length} поз.`;
    badgeTotal.classList.remove('d-none');
  }

  // Update header badges
  const trenchMissingBadge = document.getElementById('trenchMissingBadge');
  const constructionMissingBadge = document.getElementById('constructionMissingBadge');
  const hasMissing = worksCalc.missingInRules && worksCalc.missingInRules.length > 0;

  [trenchMissingBadge, constructionMissingBadge].forEach(badge => {
    if (!badge) return;
    if (hasMissing) {
      badge.classList.remove('d-none');
      badge.innerHTML = `Неполные правила (${worksCalc.missingInRules.length})`;
      badge.onclick = () => openWorksRulesModal('editor');
    } else {
      badge.classList.add('d-none');
    }
  });

  let missingAlertHtml = '';
  if (hasMissing) {
    const missingBadges = worksCalc.missingInRules
      .map(m => `<span class="badge bg-body text-body border me-1 font-monospace" style="font-size: 0.75rem;">${escapeHtml(m.type)} <span class="text-muted">(${Math.round(m.length)} м)</span></span>`)
      .join(' ');
    missingAlertHtml = `
      <div class="alert alert-warning py-2 px-3 small d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap border-warning shadow-sm">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
          <div>
            <div class="fw-bold text-dark mb-1">
              Внимание: в разделе «Строительные работы» отсутствуют сметные нормы для ${worksCalc.missingInRules.length} способов прокладки:
            </div>
            <div class="d-flex flex-wrap gap-1 align-items-center mb-1">
              ${missingBadges}
            </div>
            <div class="text-muted" style="font-size: 0.78rem; line-height: 1.35;">
              Для данных способов прокладки работы не определены в правилах и не вошли в итоговую ведомость (ВОР). Рекомендуется дополнить сметные нормы соответствующими позициями работ и материалов.
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-xs btn-outline-dark d-inline-flex align-items-center gap-1 py-1 px-2 mt-1 mt-md-0 flex-shrink-0" id="addMissingRulesBtn" style="font-size: 0.75rem;" title="Добавить эти способы прокладки в правила JSON">
          <i class="bx bx-plus-circle"></i> Добавить в правила JSON
        </button>
      </div>
    `;
  }

  let worksRowsHtml = '';
  worksCalc.works.forEach((w, idx) => {
    const isMaterial = (w.type === 'материал' || (w.type && String(w.type).toLowerCase().trim() === 'материал'));
    const isWork = !isMaterial;
    const rowClass = isWork ? 'table-row-work' : 'table-row-material';
    const tagBadge = isMaterial
      ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;">материал</span>`
      : '';

    worksRowsHtml += `
      <tr class="${rowClass}">
        <td class="text-muted small text-center">${idx + 1}</td>
        <td class="cell-wrap ${isWork ? 'fw-semibold' : 'fw-medium ps-3'}">
          ${escapeHtml(w.name)}${tagBadge}
        </td>
        <td class="text-center small text-nowrap">${escapeHtml(w.unit)}</td>
        <td class="text-end font-monospace fw-bold text-success">${w.volume.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="small text-muted cell-wrap" style="max-width: 140px; font-size: 0.78rem;">${escapeHtml(w.formulaDisplay)}</td>
      </tr>
    `;
  });

  if (worksCalc.works.length > 0) {
    container.innerHTML = `
      ${missingAlertHtml}

      <div class="table-responsive rounded-2 border mb-0 custom-table-scroll" style="max-height: 420px;">
        <table class="table table-sm table-hover text-start align-middle mb-0">
          <thead class="table-sticky-header">
            <tr>
              <th style="width: 35px;" class="text-center">№</th>
              <th>Наименование работ</th>
              <th class="text-center" style="width: 55px;">Ед.</th>
              <th class="text-end" style="width: 75px;">Объем</th>
              <th style="width: 110px;">Формула</th>
            </tr>
          </thead>
          <tbody>
            ${worksRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.innerHTML = `
      ${missingAlertHtml}
      <div class="text-center py-4 px-2 text-muted small bg-light rounded border">
        <i class="bx bx-info-circle fs-4 d-block mb-1 text-secondary"></i>
        <div>Работы не определены для текущих способов прокладки.</div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="openWorksRulesModal('editor')">
          <i class="bx bx-edit"></i> Настроить правила в JSON
        </button>
      </div>
    `;
  }

  const addMissingRulesBtn = document.getElementById('addMissingRulesBtn');
  if (addMissingRulesBtn) {
    addMissingRulesBtn.addEventListener('click', () => {
      addMissingTrenchTypesToRules(worksCalc.missingInRules);
    });
  }
}

// --------------------------------------------------------------------------
// RENDER COUPLINGS STATEMENT ("Ведомость соединительных муфт")
// --------------------------------------------------------------------------

function renderCouplingsResult(couplingsSummary) {
  const container = document.getElementById('resultCouplingsStatement');
  if (!container) return;

  const totalCouplingsCount = couplingsSummary.totalCouplingsCount || 0;
  const activeCouplingTypesCount = couplingsSummary.couplingsCount || 0;
  const totalCablesWithCouplings = couplingsSummary.totalCablesWithCouplings || 0;

  // Header badges update
  const couplingBadgeTotal = document.getElementById('couplingBadgeTotal');
  if (couplingBadgeTotal) {
    couplingBadgeTotal.textContent = `${totalCouplingsCount} шт`;
    couplingBadgeTotal.classList.remove('d-none');
  }

  const couplingMissingBadge = document.getElementById('couplingMissingBadge');
  if (couplingMissingBadge) {
    if (couplingsSummary.hasMissingInfo) {
      const missingTotal = (couplingsSummary.missingCouplings || []).length + (couplingsSummary.missingInCatalog || []).length;
      couplingMissingBadge.classList.remove('d-none');
      couplingMissingBadge.innerHTML = `<i class='bx bx-error-circle me-1'></i>Неполные данные (${missingTotal})`;
      couplingMissingBadge.onclick = () => openWorksRulesModal('couplings');
    } else {
      couplingMissingBadge.classList.add('d-none');
    }
  }

  // Missing info alert HTML if applicable
  let missingAlertHtml = '';
  if (couplingsSummary.hasMissingInfo) {
    const missingItemsList = [];
    if (couplingsSummary.missingCouplings && couplingsSummary.missingCouplings.length > 0) {
      couplingsSummary.missingCouplings.forEach(mc => {
        missingItemsList.push(
          `<li><strong>Кабель «${escapeHtml(mc.cable)}» (${escapeHtml(mc.cableType)})</strong>: длина ${Math.round(mc.length)} м, требуется ${mc.couplingsNeeded} муфт, но тип муфты не указан в справочнике кабелей.</li>`
        );
      });
    }
    if (couplingsSummary.missingInCatalog && couplingsSummary.missingInCatalog.length > 0) {
      couplingsSummary.missingInCatalog.forEach(mc => {
        missingItemsList.push(
          `<li><strong>Муфта «${escapeHtml(mc.couplingType)}»</strong> (${mc.count} шт, кабели: ${escapeHtml(mc.usedInCables.join(', '))}): отсутствует в «Справочнике муфт».</li>`
        );
      });
    }

    missingAlertHtml = `
      <div class="alert alert-warning py-2 px-3 small mb-2 border-warning shadow-sm">
        <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
          <div class="d-flex align-items-start gap-2">
            <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
            <div>
              <div class="fw-bold text-dark mb-1">
                Внимание: неполная информация о соединительных муфтах (${missingItemsList.length} поз.)
              </div>
              <ul class="mb-1 ps-3 text-muted" style="font-size: 0.8rem; line-height: 1.35;">
                ${missingItemsList.join('')}
              </ul>
              <div class="text-muted" style="font-size: 0.75rem;">
                Рекомендуется добавить отсутствующие марки муфт в «Справочник муфт» или указать муфты в справочнике кабелей для точного формирования сметных норм.
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-dark d-inline-flex align-items-center gap-1 mt-1" onclick="openWorksRulesModal('couplings')">
            <i class="bx bx-edit"></i> Справочник муфт
          </button>
        </div>
      </div>
    `;
  }

  // Stat summary cards
  const statsHtml = `
    <div class="mb-2 d-flex flex-wrap gap-2">
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Всего муфт</div>
        <div class="fw-bold text-warning-emphasis font-monospace" style="font-size: 0.9rem;">${totalCouplingsCount} <span class="fw-normal text-muted" style="font-size: 0.7rem;">шт</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Марок муфт</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${activeCouplingTypesCount}</div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Кабелей с муфтами</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${totalCablesWithCouplings} <span class="fw-normal text-muted" style="font-size: 0.7rem;">шт</span></div>
      </div>
    </div>
  `;

  if (totalCouplingsCount === 0 && !couplingsSummary.hasMissingInfo) {
    container.innerHTML = `
      ${statsHtml}
      <div class="alert alert-light border py-3 text-center text-muted small mb-0 rounded-2">
        <i class="bx bx-check-circle fs-3 text-success d-block mb-1"></i>
        Все кабели в проекте укладываются в строительные длины без соединительных муфт (0 шт).
      </div>
    `;
    return;
  }

  // Build rows for Column 2: purely coupling specification (Типы, количество муфт и кабели, на которые она устанавливается)
  let rowsHtml = '';
  let rowIdx = 1;

  const allCouplings = [];
  [12, 27, 48, 61].forEach(tier => {
    const tierData = couplingsSummary.tiers[tier];
    if (!tierData || tierData.count <= 0) return;
    tierData.couplings.forEach(c => allCouplings.push(c));
  });

  allCouplings.forEach(coupling => {
    const missingWarning = !coupling.foundInCatalog
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" style="font-size: 0.65rem;" title="Марка муфты не найдена в справочнике муфт"><i class="bx bx-error-circle me-0_5"></i>нет в справочнике</span>`
      : '';

    // Group cables by cableType
    const cablesByTypeHtml = Array.from(coupling.cableTypes).map(cType => {
      const cablesOfType = (coupling.cables || []).filter(c => c.type === cType);
      const cablePills = cablesOfType.map(c => `
        <span class="routing-tag font-monospace" title="Трасса: ${escapeHtml(c.cable)}, строительная длина: ${Math.round(c.length)} м">
          <i class='bx bx-cable me-1 text-muted'></i><strong>${escapeHtml(c.cable)}</strong> <span class="text-muted">(${Math.round(c.length)} м — ${c.count} шт)</span>
        </span>
      `).join(' ');

      return `
        <div class="mb-1_5">
          <div class="d-flex align-items-center gap-1 mb-1">
            <span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace" style="font-size: 0.72rem;">${escapeHtml(cType)}</span>
            <span class="text-muted small" style="font-size: 0.74rem;">${cablesOfType.length} ${cablesOfType.length === 1 ? 'кабель' : 'кабелей'}, ${cablesOfType.reduce((s, x) => s + x.count, 0)} шт:</span>
          </div>
          <div class="d-flex flex-wrap gap-1 ps-1">
            ${cablePills}
          </div>
        </div>
      `;
    }).join('');

    rowsHtml += `
      <tr>
        <td class="text-muted small text-center">${rowIdx++}</td>
        <td class="cell-wrap">
          <div class="fw-bold text-dark font-monospace" style="font-size: 0.88rem;">${escapeHtml(coupling.couplingType)}${missingWarning}</div>
          <div class="text-muted small mt-0_5" style="font-size: 0.75rem; line-height: 1.35;">${escapeHtml(coupling.fullName)}</div>
          <div class="mt-1">
            <span class="badge bg-info-subtle text-info-emphasis border" style="font-size: 0.68rem;">группа монтажа до ${coupling.tier || getCouplingInstallationTier(coupling.maxCores)} жил</span>
          </div>
        </td>
        <td class="text-center align-middle">
          <span class="badge bg-warning-subtle text-warning-emphasis border font-monospace fw-bold fs-6 px-2 py-1">${coupling.count} шт</span>
        </td>
        <td class="cell-wrap align-middle">
          ${cablesByTypeHtml}
        </td>
      </tr>
    `;
  });

  container.innerHTML = `
    ${statsHtml}
    ${missingAlertHtml}
    <div class="table-responsive table-responsive-full rounded-2 border">
      <table class="table table-sm table-hover text-start align-middle mb-0">
        <thead class="table-sticky-header">
          <tr>
            <th style="width: 35px;" class="text-center align-middle">№</th>
            <th style="min-width: 150px;" class="align-middle">Тип и марка муфты</th>
            <th class="text-center align-middle" style="width: 85px;">Кол-во</th>
            <th style="min-width: 180px;" class="align-middle">Кабели, на которые устанавливается</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot class="table-sticky-footer fw-bold">
          <tr>
            <td colspan="2" class="ps-2">Всего соединительных муфт:</td>
            <td class="text-center font-monospace text-warning-emphasis">${totalCouplingsCount} шт</td>
            <td class="small text-muted font-monospace">Кабельных трасс с муфтами: ${totalCablesWithCouplings} шт</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// Export current data as JSON
function exportCurrentDataJSON() {
  syncTableToCurrentData();
  if (!currentData) {
    showToast('Нет данных для экспорта', 'error', 'Ошибка');
    return;
  }
  const jsonStr = JSON.stringify(currentData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName ? `export_${currentFileName}` : 'data_export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Файл JSON успешно сохранен', 'success', 'Экспорт');
}

// Export current data to Excel
function exportCurrentDataExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Библиотека XLSX недоступна', 'error', 'Ошибка');
    return;
  }
  const cableTable = document.getElementById('tableCables');
  const routingTable = document.getElementById('tableRouting');

  if (!cableTable && !routingTable) {
    showToast('Нет таблиц для экспорта', 'error', 'Ошибка');
    return;
  }

  const wb = XLSX.utils.book_new();
  if (cableTable) {
    const wsCable = XLSX.utils.table_to_sheet(cableTable);
    XLSX.utils.book_append_sheet(wb, wsCable, 'Кабели');
  }
  if (routingTable) {
    const wsRouting = XLSX.utils.table_to_sheet(routingTable);
    XLSX.utils.book_append_sheet(wb, wsRouting, 'Трассы');
  }
  XLSX.writeFile(wb, 'Исходные_данные_ВОР.xlsx');
  showToast('Файл Excel успешно экспортирован', 'success', 'Экспорт');
}

// --------------------------------------------------------------------------
// WORKS RULES & CALCULATION FUNCTIONS
// --------------------------------------------------------------------------

// Initialize rules on page load from external works_rules.json
async function initWorksRules() {
  try {
    const res = await fetch('./works_rules.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        cachedDefaultRules = JSON.parse(JSON.stringify(data));
        currentWorksRules = JSON.parse(JSON.stringify(data));
        renderRulesModalContent();
        if (currentData) {
          calculateVolumes();
        }
        return currentWorksRules;
      }
    }
  } catch (err) {
    console.warn('Не удалось загрузить стандартный файл works_rules.json:', err);
  }
}

// Upload custom rules JSON
function handleRulesFileInput(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!parsed || typeof parsed !== 'object') {
        showToast('Неверный формат JSON: ожидается JSON-объект со структурой разделов или массив', 'error', 'Ошибка файла');
        return;
      }

      if (Array.isArray(parsed)) {
        currentWorksRules = { "Строительные работы": parsed };
      } else {
        currentWorksRules = parsed;
      }

      // Synchronize editor textarea if modal exists
      const textarea = document.getElementById('worksJsonEditorTextarea');
      if (textarea) {
        textarea.value = JSON.stringify(currentWorksRules, null, 2);
        validateWorksJsonInput();
      }

      renderRulesModalContent();
      const sections = getRulesSections(currentWorksRules);
      let totalWays = 0;
      sections.forEach(s => totalWays += s.rules.length);
      showToast(`Сметные нормы успешно загружены из «${file.name}» (${totalWays} способов в ${sections.length} разд.). Выполнен автоматический перерасчет работ.`, 'success', 'Перерасчет выполнен');

      // Refresh calculation if data is loaded
      if (currentData) {
        calculateVolumes();
      }
    } catch (err) {
      showToast('Ошибка синтаксиса JSON: ' + err.message, 'error', 'Ошибка файла');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// Reset rules to standard works_rules.json
async function resetWorksRules() {
  try {
    const res = await fetch('./works_rules.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      cachedDefaultRules = JSON.parse(JSON.stringify(data));
      currentWorksRules = JSON.parse(JSON.stringify(data));
    } else if (cachedDefaultRules) {
      currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules));
    }
  } catch (err) {
    if (cachedDefaultRules) {
      currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules));
    }
  }

  const textarea = document.getElementById('worksJsonEditorTextarea');
  if (textarea) {
    textarea.value = JSON.stringify(currentWorksRules, null, 2);
    validateWorksJsonInput();
  }
  renderRulesModalContent();
  showToast('Сметные нормы сброшены к стандартному файлу works_rules.json. Выполнен перерасчет работ.', 'info', 'Сброс правил');
  if (currentData) {
    calculateVolumes();
  }
}

// Download active rules as JSON
function downloadWorksRules() {
  const textarea = document.getElementById('worksJsonEditorTextarea');
  let jsonStr = '';
  if (textarea && textarea.value) {
    jsonStr = textarea.value;
  } else {
    jsonStr = JSON.stringify(currentWorksRules, null, 2);
  }
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'works_rules.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('JSON файл сметных норм скачан', 'success', 'Скачивание');
}

// Render rules modal cards and cable catalog tab
function renderRulesModalContent() {
  const container = document.getElementById('rulesListContainer');
  const countBadge = document.getElementById('worksRulesCountBadge');
  
  // Render cables tab content as well
  renderCableCatalogModalContent();
  renderCouplingCatalogModalContent();

  if (!container) return;

  const sections = getRulesSections(currentWorksRules);
  let totalRulesCount = 0;
  let totalWorksCount = 0;

  sections.forEach(sec => {
    totalRulesCount += sec.rules.length;
    sec.rules.forEach(r => {
      const works = getRuleWorks(r);
      if (Array.isArray(works)) totalWorksCount += works.length;
    });
  });

  if (countBadge) {
    countBadge.textContent = `${totalRulesCount} способов в ${sections.length} разд. (${totalWorksCount} поз.)`;
  }

  if (sections.length === 0 || totalRulesCount === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="bx bx-layer-x fs-1 text-muted opacity-50 mb-2 d-block"></i>
        <div>Правила расчета отсутствуют</div>
      </div>
    `;
    return;
  }

  let missingNoticeHtml = '';
  const missingCable = (window.lastCableWorksCalc && window.lastCableWorksCalc.missingInRules) ? window.lastCableWorksCalc.missingInRules : [];
  const missingTrench = (window.lastTrenchWorksCalc && window.lastTrenchWorksCalc.missingInRules) ? window.lastTrenchWorksCalc.missingInRules : [];

  if (missingCable.length > 0 || missingTrench.length > 0) {
    const cableNames = missingCable.map(m => `«${escapeHtml(m.type)}»`).join(', ');
    const trenchNames = missingTrench.map(m => `«${escapeHtml(m.type)}»`).join(', ');
    const parts = [];
    if (cableNames) parts.push(`Для кабелей (Монтажные работы): ${cableNames}`);
    if (trenchNames) parts.push(`Для траншей (Строительные работы): ${trenchNames}`);

    missingNoticeHtml = `
      <div class="alert alert-warning py-2_5 px-3 mb-3 border-warning shadow-sm small">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-alarm-exclamation fs-4 text-warning flex-shrink-0 mt-0_5"></i>
          <div class="flex-grow-1">
            <div class="fw-bold text-dark">В загруженном проекте есть способы прокладки без правил сметных норм!</div>
            <div class="text-body-secondary mt-1 mb-2">
              ${parts.join('<br>')}
            </div>
            <div class="d-flex flex-wrap gap-2">
              ${missingCable.length > 0 ? `
                <button type="button" class="btn btn-xs btn-outline-dark fw-semibold" id="modalAddMissingCableBtn">
                  <i class="bx bx-plus-circle me-1"></i>Добавить позиции по кабелям (${missingCable.length})
                </button>
              ` : ''}
              ${missingTrench.length > 0 ? `
                <button type="button" class="btn btn-xs btn-outline-dark fw-semibold" id="modalAddMissingTrenchBtn">
                  <i class="bx bx-plus-circle me-1"></i>Добавить позиции по траншеям (${missingTrench.length})
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  let html = '';
  sections.forEach((sec) => {
    const isCableSec = sec.name.toLowerCase().includes('монтаж') || sec.name.toLowerCase().includes('кабел');
    html += `
      <div class="mb-3">
        <div class="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom">
          <i class="bx bx-folder text-warning fs-5"></i>
          <span class="fw-bold text-dark fs-6">Раздел: ${escapeHtml(sec.name)}</span>
          <span class="badge bg-secondary-subtle text-secondary-emphasis border ms-auto">${sec.rules.length} способов</span>
        </div>
        <div class="d-flex flex-column gap-2">
    `;

    sec.rules.forEach((rule, rIdx) => {
      const rName = rule["Название"] || rule.name || 'Без названия';
      const rawWm = rule["Работы и материалы"] !== undefined ? rule["Работы и материалы"] :
                   (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
      const works = getRuleWorks(rule);
      const isObjectStructure = rawWm && typeof rawWm === 'object' && !Array.isArray(rawWm);

      let worksHtml = '';

      if (isObjectStructure) {
        Object.entries(rawWm).forEach(([key, itemsVal]) => {
          const items = Array.isArray(itemsVal) ? itemsVal : (itemsVal ? [itemsVal] : []);
          const isOptKey = key.toLowerCase().includes('оптич') || key.toLowerCase().includes('волс');
          let groupTitle = `Ключ: "${escapeHtml(key)}"`;
          if (isOptKey) {
            groupTitle = `Оптический кабель (ключ "${escapeHtml(key)}")`;
          } else {
            const numK = parseFloat(String(key).replace(',', '.'));
            if (!isNaN(numK)) {
              groupTitle = `Категория до ${numK} кг/м (ключ "${escapeHtml(key)}")`;
            }
          }

          let groupItemsHtml = '';
          items.forEach((w, wIdx) => {
            const threshold = isCableSec ? extractWeightThreshold(w) : null;
            const isOver = isCableSec ? isOverWeightThreshold(w) : false;
            const tierBadge = threshold !== null 
              ? `<span class="badge bg-info-subtle text-info-emphasis border ms-1 font-monospace" style="font-size: 0.7rem;">до ${threshold} кг/м</span>`
              : (isOver ? `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 font-monospace" style="font-size: 0.7rem;">свыше</span>` : '');

            groupItemsHtml += `
              <div class="p-2 rounded bg-white border mb-1 small">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                  <div class="fw-semibold text-dark">${wIdx + 1}. ${escapeHtml(w["Наименование"] || '')} ${tierBadge}</div>
                  <span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap">${escapeHtml(w["Единицы измерения"] || '')}</span>
                </div>
                <div class="d-flex align-items-center gap-1 text-muted fs-xs">
                  <span class="fw-medium">Формула:</span>
                  <code class="px-1 py-0 bg-light border rounded text-primary">${escapeHtml(w["Формула"] || 'ДЛИНА')}</code>
                  ${w["Тип"] ? `<span class="badge badge-material ms-auto">${escapeHtml(w["Тип"])}</span>` : ''}
                </div>
              </div>
            `;
          });

          worksHtml += `
            <div class="mb-2 p-2 rounded bg-light border">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="fw-bold text-primary small d-flex align-items-center gap-1">
                  <i class="bx bx-category-alt"></i> ${groupTitle}
                </span>
                <span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace fs-xs fw-semibold">${items.length} поз.</span>
              </div>
              ${groupItemsHtml || '<div class="text-muted small ps-2">Нет позиций</div>'}
            </div>
          `;
        });
      } else {
        works.forEach((w, wIdx) => {
          const threshold = isCableSec ? extractWeightThreshold(w) : null;
          const isOver = isCableSec ? isOverWeightThreshold(w) : false;
          const tierBadge = threshold !== null 
            ? `<span class="badge bg-info-subtle text-info-emphasis border ms-1 font-monospace" style="font-size: 0.7rem;">до ${threshold} кг/м</span>`
            : (isOver ? `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 font-monospace" style="font-size: 0.7rem;">свыше</span>` : '');

          worksHtml += `
            <div class="p-2 rounded bg-light border mb-2 small">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                <div class="fw-semibold text-dark">${wIdx + 1}. ${escapeHtml(w["Наименование"] || '')} ${tierBadge}</div>
                <span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap">${escapeHtml(w["Единицы измерения"] || '')}</span>
              </div>
              <div class="d-flex align-items-center gap-1 text-muted fs-xs">
                <span class="fw-medium">Формула:</span>
                <code class="px-1 py-0 bg-white border rounded text-primary">${escapeHtml(w["Формула"] || 'ДЛИНА')}</code>
                ${w["Тип"] ? `<span class="badge badge-material ms-auto">${escapeHtml(w["Тип"])}</span>` : ''}
              </div>
            </div>
          `;
        });
      }

      html += `
        <div class="card border shadow-sm">
          <div class="card-header py-2 px-3 bg-body-tertiary d-flex justify-content-between align-items-center">
            <div class="fw-bold d-flex align-items-center gap-2">
              <i class="bx bx-git-commit text-primary"></i>
              <span>${rIdx + 1}. ${escapeHtml(rName)}</span>
            </div>
            <span class="badge bg-primary-subtle text-primary border">${works.length} поз.</span>
          </div>
          <div class="card-body p-3">
            ${worksHtml || '<div class="text-muted small">Работы и материалы не определены</div>'}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = missingNoticeHtml + html;

  const modalAddMissingCableBtn = document.getElementById('modalAddMissingCableBtn');
  if (modalAddMissingCableBtn && missingCable.length > 0) {
    modalAddMissingCableBtn.addEventListener('click', () => {
      addMissingCableWaysToRules(missingCable);
    });
  }

  const modalAddMissingTrenchBtn = document.getElementById('modalAddMissingTrenchBtn');
  if (modalAddMissingTrenchBtn && missingTrench.length > 0) {
    modalAddMissingTrenchBtn.addEventListener('click', () => {
      addMissingTrenchTypesToRules(missingTrench);
    });
  }
}

// Render Cable Catalog Tab Content
function renderCableCatalogModalContent() {
  const container = document.getElementById('cableCatalogContainer');
  const tabBadge = document.getElementById('tabWorksCablesCountBadge');
  if (!container) return;

  // Extract catalog from current rules or default
  const catalog = getCableCatalog(currentWorksRules) || {};
  const groups = Object.keys(catalog);

  // Search filter query
  const searchInput = document.getElementById('cableCatalogSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById('cableCatalogClearSearchBtn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('d-none');
    else clearBtn.classList.add('d-none');
  }

  // Category filter
  const catFilter = document.getElementById('cableCatalogCategoryFilter');
  const catVal = catFilter ? catFilter.value : 'all';

  let totalMarksCount = 0;
  const renderedGroups = [];

  groups.forEach(groupName => {
    const groupObj = catalog[groupName];
    if (!groupObj || typeof groupObj !== 'object') return;

    // Filter by group category dropdown
    if (catVal === 'optical' && !/оптическ|волс/i.test(groupName) && !/оптическ/i.test(groupObj["Категория"] || '')) {
      return;
    }
    if (catVal === 'special' && !/особ/i.test(groupName)) {
      return;
    }
    if (catVal === 'signaling' && (/оптическ|волс|особ/i.test(groupName))) {
      return;
    }

    const typesObj = groupObj["Тип"] || {};
    const markNames = Object.keys(typesObj);
    const filteredMarks = [];

    markNames.forEach(markKey => {
      totalMarksCount++;
      const item = typesObj[markKey];
      if (!item || typeof item !== 'object') return;

      const desc = item["Полное описание"] || '';
      const coupling = item["Муфта"] || '';
      const buildLen = item["Строительная длина"] !== undefined ? String(item["Строительная длина"]) : '';
      const weight = item["Вес"] !== undefined ? String(item["Вес"]) : '';
      const cat = item["Категория"] || groupObj["Категория"] || '';

      if (query) {
        const fullHaystack = `${markKey} ${groupName} ${desc} ${coupling} ${buildLen} ${weight} ${cat}`.toLowerCase();
        if (!fullHaystack.includes(query)) return;
      }

      filteredMarks.push({
        mark: markKey,
        data: item,
        groupName: groupName
      });
    });

    if (filteredMarks.length > 0) {
      renderedGroups.push({
        name: groupName,
        category: groupObj["Категория"] || '',
        description: groupObj["Название"] || groupName,
        marks: filteredMarks
      });
    }
  });

  if (tabBadge) {
    tabBadge.textContent = totalMarksCount;
  }

  if (renderedGroups.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted bg-light rounded border">
        <i class="bx bx-search-alt fs-1 text-muted opacity-50 mb-2 d-block"></i>
        <div class="fw-semibold">По вашему запросу кабели не найдены</div>
        <div class="small text-muted mt-1">Попробуйте изменить поисковый запрос или выбрать «Все марки и группы»</div>
      </div>
    `;
    return;
  }

  let html = '';
  let matchCount = 0;

  renderedGroups.forEach(g => {
    matchCount += g.marks.length;
    const isOptGroup = /оптическ|волс/i.test(g.name) || /оптическ/i.test(g.category);

    html += `
      <div class="card border shadow-sm mb-3">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="fw-bold d-flex align-items-center gap-2">
            <i class="bx ${isOptGroup ? 'bx-broadcast text-info' : 'bx-cable text-primary'} fs-5"></i>
            <span class="fs-6">${escapeHtml(g.name)}</span>
            ${isOptGroup ? '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle small">ВОЛС</span>' : ''}
          </div>
          <span class="badge bg-secondary-subtle text-secondary-emphasis border">${g.marks.length} марок</span>
        </div>
        <div class="card-body p-0 table-responsive">
          <table class="table table-sm table-hover align-middle mb-0 text-start">
            <thead class="table-light text-muted small border-bottom">
              <tr>
                <th style="width: 28%;" class="ps-3">Марка / Обозначение</th>
                <th style="width: 32%;">Полное наименование по ТУ/ГОСТ</th>
                <th style="width: 14%;" class="text-center">Строит. длина, м</th>
                <th style="width: 12%;" class="text-center">Вес, кг/м</th>
                <th style="width: 14%;" class="pe-3">Тип муфты</th>
              </tr>
            </thead>
            <tbody class="small">
    `;

    g.marks.forEach(m => {
      const d = m.data;
      const isOptical = /оптическ|волс/i.test(d["Категория"] || '') || isOptGroup || /^(?:ОК|ВОЛС|ДПС|ТОС|ДПО|ОКБ|ОКЛ|ОКС)/i.test(m.mark);
      const markBadge = isOptical 
        ? `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle fs-xs ms-1">Оптич.</span>`
        : '';

      const lenFormatted = d["Строительная длина"] !== undefined && d["Строительная длина"] !== null
        ? `<span class="badge bg-light text-dark border font-monospace">${Number(d["Строительная длина"]).toLocaleString('ru-RU')} м</span>`
        : '<span class="text-muted">—</span>';

      const weightFormatted = d["Вес"] !== undefined && d["Вес"] !== null
        ? `<span class="font-monospace fw-semibold">${Number(d["Вес"]).toFixed(d["Вес"] < 0.1 ? 3 : 2)}</span>`
        : '<span class="text-muted">—</span>';

      const couplingFormatted = d["Муфта"] 
        ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle text-wrap">${escapeHtml(d["Муфта"])}</span>`
        : '<span class="text-muted small">без муфты</span>';

      html += `
        <tr>
          <td class="ps-3">
            <div class="fw-bold text-dark font-monospace">${escapeHtml(m.mark)} ${markBadge}</div>
            <div class="fs-xs text-muted">Группа: ${escapeHtml(m.groupName)}</div>
          </td>
          <td>
            <div class="text-body" style="max-width: 380px; line-height: 1.35;">${escapeHtml(d["Полное описание"] || m.mark)}</div>
          </td>
          <td class="text-center">${lenFormatted}</td>
          <td class="text-center">${weightFormatted}</td>
          <td class="pe-3">${couplingFormatted}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="small text-muted mb-2 d-flex justify-content-between align-items-center">
      <div>Показано: <strong>${matchCount}</strong> из ${totalMarksCount} марок кабелей в справочнике</div>
      <div class="fs-xs text-muted">
        <i class='bx bx-info-circle me-1'></i>Для добавления или корректировки параметров откройте вкладку <strong>«Редактор JSON»</strong>
      </div>
    </div>
    ${html}
  `;
}

// --------------------------------------------------------------------------
// RENDER COUPLING CATALOG TAB IN WORKS RULES MODAL
// --------------------------------------------------------------------------

function renderCouplingCatalogModalContent() {
  const container = document.getElementById('couplingCatalogContainer');
  const tabBadge = document.getElementById('tabWorksCouplingsCountBadge');
  if (!container) return;

  const catalog = getCouplingCatalog(currentWorksRules) || {};
  const entries = Object.entries(catalog);
  const totalCouplingsCount = entries.length;

  if (tabBadge) {
    tabBadge.textContent = totalCouplingsCount;
  }

  // Search filter query
  const searchInput = document.getElementById('couplingCatalogSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById('couplingCatalogClearSearchBtn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('d-none');
    else clearBtn.classList.add('d-none');
  }

  const filtered = entries.filter(([mark, data]) => {
    if (!query) return true;
    const fullName = (data && data["Полное наименование"]) || '';
    const maxCores = (data && data["МаксЖил"]) !== undefined ? String(data["МаксЖил"]) : '';
    const unit = (data && data["Единицы измерения"]) || '';
    const haystack = `${mark} ${fullName} ${maxCores} ${unit}`.toLowerCase();
    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted bg-light rounded border">
        <i class="bx bx-search-alt fs-1 text-muted opacity-50 mb-2 d-block"></i>
        <div class="fw-semibold">По вашему запросу муфты не найдены</div>
        <div class="small text-muted mt-1">Попробуйте изменить поисковый запрос или добавьте новую муфту через кнопку «Добавить шаблон муфты»</div>
      </div>
    `;
    return;
  }

  let rowsHtml = '';
  filtered.forEach(([mark, data], idx) => {
    const fullName = (data && data["Полное наименование"]) || mark;
    const maxCores = (data && data["МаксЖил"]) !== undefined ? data["МаксЖил"] : parseMaxCoresFromString(mark);
    const unit = (data && data["Единицы измерения"]) || 'шт';
    const tier = getCouplingInstallationTier(maxCores);

    rowsHtml += `
      <tr>
        <td class="text-center text-muted small ps-3">${idx + 1}</td>
        <td>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace py-1 px-2" style="font-size: 0.82rem;">${escapeHtml(mark)}</span>
        </td>
        <td>
          <div class="text-body fw-medium" style="line-height: 1.35;">${escapeHtml(fullName)}</div>
        </td>
        <td class="text-center">
          <span class="badge bg-body-secondary text-body border" style="font-size: 0.78rem;">до ${maxCores} жил</span>
        </td>
        <td class="text-center">
          <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace" style="font-size: 0.75rem;">до ${tier} жил</span>
        </td>
        <td class="text-center font-monospace text-muted small pe-3">${escapeHtml(unit)}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="small text-muted mb-2 d-flex justify-content-between align-items-center">
      <div>Показано: <strong>${filtered.length}</strong> из ${totalCouplingsCount} позиций муфт в справочнике</div>
      <div class="fs-xs text-muted">
        <i class='bx bx-info-circle me-1'></i>Монтажные работы распределяются по группам жил: <strong>до 12, 27, 48, 61</strong>
      </div>
    </div>
    <div class="card border shadow-sm">
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width: 40px;" class="text-center ps-3">№</th>
              <th style="width: 240px;">Обозначение / Марка</th>
              <th>Полное наименование</th>
              <th style="width: 120px;" class="text-center">Макс. жил</th>
              <th style="width: 140px;" class="text-center">Группа монтажа</th>
              <th style="width: 70px;" class="text-center pe-3">Ед. изм.</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Match trench/routing type against rule name strictly without heuristic guessing
function matchesRule(trenchTypeName, ruleName) {
  if (!trenchTypeName || !ruleName) return false;
  const t = trenchTypeName.trim().toLowerCase();
  const r = ruleName.trim().toLowerCase();
  if (t === r) return true;

  // Normalized spacing comparison
  if (t.replace(/\s+/g, ' ') === r.replace(/\s+/g, ' ')) return true;

  // Stem helper (e.g. "кабельная канализация" vs "кабельные канализации", "траншея вне пути" vs "траншея вне путей")
  const stem = s => s.toLowerCase().replace(/[^а-яa-z0-9]/g, '').replace(/(ая|ое|ые|ий|ый|о|е|я|а|ей|ей)$/, '');
  const tStem = stem(t);
  const rStem = stem(r);

  if (tStem === rStem) return true;

  // Specific canonical aliases only (NO aggressive substring guessing)
  // E.g. "Стрелка" <-> "Стрелка 1-25", "Стрелочный перевод"
  if ((t.startsWith('стрелк') || t.includes('стрелочн')) && (r.startsWith('стрелк') || r.includes('стрелочн'))) {
    return true;
  }
  // Canonical: "Канализация" <-> "Кабельная канализация" (exact single word against exact phrase)
  if ((t === 'канализация' && r === 'кабельная канализация') || (r === 'канализация' && t === 'кабельная канализация')) {
    return true;
  }

  return false;
}

// Extract active trench segments and lengths from table or state
function getActiveTrenchSummary() {
  const routingTable = document.getElementById('tableRouting');
  const summary = {};

  if (routingTable) {
    const rows = routingTable.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const typeCell = row.querySelector('[data-field="type"]');
      const lengthCell = row.querySelector('[data-field="length"]');
      if (typeCell && lengthCell) {
        const type = (typeCell.textContent || '').trim() || 'Без типа';
        const length = parseFloat((lengthCell.textContent || '').replace(/\s+/g, '').replace(/,/g, '.')) || 0;

        const handleCell = row.children[1];
        const handle = handleCell ? handleCell.textContent.trim() : '';
        const containedCell = row.children[5];
        const contained = containedCell ? containedCell.textContent.trim() : '';

        if (!summary[type]) {
          summary[type] = { totalLength: 0, count: 0, segments: [] };
        }
        summary[type].totalLength += length;
        summary[type].count += 1;
        summary[type].segments.push({ handle, length, contained, type });
      }
    });
  } else if (currentData && currentData.routingTypeBlocks) {
    currentData.routingTypeBlocks.forEach(b => {
      const type = (b.type || 'Без типа').trim();
      const length = Number(b.length) || 0;
      if (!summary[type]) {
        summary[type] = { totalLength: 0, count: 0, segments: [] };
      }
      summary[type].totalLength += length;
      summary[type].count += 1;
      summary[type].segments.push({
        handle: b.handle || '',
        length,
        contained: Array.isArray(b.contained) ? b.contained.join(', ') : (b.contained || ''),
        type
      });
    });
  }

  return summary;
}

// Calculate works based on trench summary and rules JSON
// Trenches are always calculated from the "Строительные работы" section
function calculateWorksFromTrenches(trenchSummary, rulesData) {
  const { sectionName, rules } = getTrenchRules(rulesData);
  const calculatedWorks = [];
  const missingInRules = [];
  const matchedTrenchTypes = new Set();

  // Iterate rules in the JSON file order
  rules.forEach(rule => {
    const ruleName = (rule["Название"] || rule.name || '').trim();
    if (!ruleName) return;

    // Find all trench types in summary matching this rule
    const matchingTypes = [];
    for (const tName of Object.keys(trenchSummary)) {
      if (matchesRule(tName, ruleName)) {
        matchingTypes.push(tName);
      }
    }

    if (matchingTypes.length === 0) return;

    matchingTypes.forEach(tName => {
      matchedTrenchTypes.add(tName);
      const tInfo = trenchSummary[tName];
      const works = getRuleWorks(rule);

      works.forEach((work, workIdx) => {
        const formula = work["Формула"] || "ДЛИНА";
        const evalExpr = formula.replace(/,/g, '.').replace(/ДЛИНА/gi, String(tInfo.totalLength));
        let val = 0;
        try {
          if (/^[0-9+\-*/().\s]+$/.test(evalExpr)) {
            val = Function("'use strict'; return (" + evalExpr + ");")();
          } else {
            val = tInfo.totalLength;
          }
        } catch (e) {
          val = tInfo.totalLength;
        }
        val = Math.round(val * 100) / 100;

        // Build formula display string (e.g. "0,36 * 1132 м траншеи")
        let displayFormula = formula.replace(/\*/g, ' * ');
        const isTrench = tName.toLowerCase().includes('транше') || ruleName.toLowerCase().includes('транше');
        const unitSuffix = isTrench ? 'м траншеи' : (tName.toLowerCase().includes('канализац') ? 'м канализации' : 'м');
        displayFormula = displayFormula.replace(/ДЛИНА/gi, `${tInfo.totalLength} ${unitSuffix}`);

        calculatedWorks.push({
          name: work["Наименование"] || work.name || '',
          unit: work["Единицы измерения"] || work.unit || '',
          volume: val,
          formulaDisplay: displayFormula,
          ruleName: ruleName,
          trenchType: tName,
          trenchLength: tInfo.totalLength,
          section: sectionName,
          type: work["Тип"] || work.type || '',
          comment: work["Комментарий"] || work.comment || ''
        });
      });
    });
  });

  // Identify any trench types from data that have no matching works in rules
  for (const [tName, tInfo] of Object.entries(trenchSummary)) {
    if (!matchedTrenchTypes.has(tName)) {
      missingInRules.push({
        type: tName,
        length: tInfo.totalLength,
        count: tInfo.count
      });
    }
  }

  return {
    works: calculatedWorks,
    missingInRules
  };
}

// Calculate works based on cable summary and rules JSON
// Cables are always calculated from the "Монтажные работы" section
function calculateWorksFromCables(cableSummary, rulesData) {
  const { sectionName, rules } = getCableRules(rulesData);
  const catalog = getCableCatalog(rulesData);
  const calculatedWorks = [];
  const missingInRules = [];
  const matchedRoutingTypes = new Set();
  const allUsedRoutingTypes = new Set();

  // Sort cables by length descending (same order as in the cable schedule table)
  const cableEntries = Object.entries(cableSummary || {}).sort((a, b) => (b[1].length || 0) - (a[1].length || 0));

  // Collect all routing types used across all cables
  cableEntries.forEach(([cType, cInfo]) => {
    const routingMap = cInfo.routingTypes || {};
    for (const [rName] of Object.entries(routingMap)) {
      const trimmed = (rName || '').trim();
      if (trimmed) {
        allUsedRoutingTypes.add(trimmed);
      }
    }
  });

  // Calculate and prepend coupling installation works and materials
  const couplingsSummary = getActiveCouplingsSummary(rulesData);
  const activeCouplingTiers = [12, 27, 48, 61];
  activeCouplingTiers.forEach(tier => {
    const tierData = couplingsSummary.tiers[tier];
    if (tierData && tierData.count > 0) {
      const workItems = getCouplingInstallationWorkItems(tier, rulesData);
      
      // 1. Add all defined work/material items from rules array for this tier
      workItems.forEach(workItem => {
        const formula = workItem.formula || 'КОЛИЧЕСТВО';
        const rawVol = evaluateWorkFormula(formula, tierData.count);
        const volume = Math.round(rawVol * 100) / 100;
        const formulaDisplay = buildCouplingWorkFormulaDisplay(formula, tierData, volume);

        calculatedWorks.push({
          name: workItem.name,
          unit: workItem.unit || 'шт',
          volume: volume,
          volumeFormatted: String(volume),
          formula: formula,
          formulaDisplay: formulaDisplay,
          tier: tier,
          section: sectionName,
          type: workItem.type || 'работа',
          parentWorkName: null,
          comment: `Установка соединительных муфт (до ${tier} жил)`
        });
      });

      // 2. Following material lines for each coupling type
      const primaryWorkName = workItems[0] ? workItems[0].name : null;
      tierData.couplings.forEach(coupling => {
        calculatedWorks.push({
          name: coupling.fullName,
          unit: coupling.unit || 'шт',
          volume: coupling.count,
          volumeFormatted: String(coupling.count),
          formula: 'КОЛИЧЕСТВО',
          formulaDisplay: `${coupling.count} шт`,
          tier: tier,
          maxCores: coupling.maxCores,
          section: sectionName,
          type: 'материал',
          parentWorkName: primaryWorkName,
          comment: `Кабели: ${coupling.cableTypes.join(', ')}`
        });
      });
    }
  });

  // Iterate rules in the JSON file order
  rules.forEach(rule => {
    const ruleName = (rule["Название"] || rule.name || '').trim();
    if (!ruleName) return;
    if (ruleName.toLowerCase().includes('муфт')) return; // Handled specifically above by couplings calculation

    const parsedWM = parseRuleWorksAndMaterials(rule);
    const template = (rule["Шаблон"] || rule.template || '').trim();

    // If the rule definition has no works or materials, flag it if any cable uses it
    if (!parsedWM.allItems || parsedWM.allItems.length === 0) {
      let totLen = 0;
      let count = 0;
      cableEntries.forEach(([cType, cInfo]) => {
        const routingMap = cInfo.routingTypes || {};
        for (const [rName, rLen] of Object.entries(routingMap)) {
          if (matchesRule(rName, ruleName)) {
            matchedRoutingTypes.add((rName || '').trim());
            totLen += (rLen || cInfo.length || 0);
            count++;
          }
        }
      });
      if (count > 0) {
        missingInRules.push({
          type: `${ruleName} (в правиле нет сметных норм)`,
          length: totLen,
          count: count,
          ruleName: ruleName,
          missingType: 'empty_rule'
        });
      }
      return;
    }

    // Collect matching cables for this rule
    const matchedCables = [];

    cableEntries.forEach(([cType, cInfo]) => {
      const routingMap = cInfo.routingTypes || {};
      for (const [rName, rLen] of Object.entries(routingMap)) {
        const trimmedRName = (rName || '').trim();
        if (!trimmedRName) continue;
        const effectiveLen = (rLen && rLen > 0) ? rLen : (cInfo.length || 0);
        if (effectiveLen <= 0) continue;

        if (matchesRule(trimmedRName, ruleName)) {
          matchedRoutingTypes.add(trimmedRName);

          const cMeta = lookupCableInfo(cType, catalog);
          const weight = cMeta.weight || 0.35;
          const cableItem = {
            type: cType,
            length: effectiveLen,
            weight: weight,
            fullDescription: cMeta.fullDescription,
            buildingLength: cMeta.buildingLength,
            coupling: cMeta.coupling,
            brand: cMeta.brand,
            routingName: trimmedRName,
            isOptical: !!cMeta.isOptical,
            category: cMeta.category || (cMeta.isOptical ? 'Оптический кабель' : 'Электрический кабель'),
            foundInCatalog: !!cMeta.foundInCatalog
          };
          matchedCables.push(cableItem);
        }
      }
    });

    if (matchedCables.length === 0) return;

    // 1. Separate optical cables and electrical cables
    const opticalCables = matchedCables.filter(c => c.isOptical);
    const electricalCables = matchedCables.filter(c => !c.isOptical);

    // 1. Process OPTICAL cables separately
    if (opticalCables.length > 0) {
      opticalCables.sort((a, b) => (b.length || 0) - (a.length || 0));
      const totalOpticalLength = Math.round(opticalCables.reduce((sum, c) => sum + c.length, 0) * 100) / 100;

      if (parsedWM.optical && Array.isArray(parsedWM.optical.items) && parsedWM.optical.items.length > 0) {
        const optItems = parsedWM.optical.items;
        const primaryWork = optItems.find(w => (w["Тип"] || w.type) !== 'материал') || optItems[0];
        const opticalPrimaryTitle = (primaryWork["Наименование"] || primaryWork.name || `Прокладка оптического кабеля (${ruleName})`).trim();

        // Apply ALL works and materials from the optical list
        optItems.forEach(item => {
          const formula = item["Формула"] || item.formula || "ДЛИНА";
          const rawVal = evaluateWorkFormula(formula, totalOpticalLength);
          const isMaterial = (item["Тип"] || item.type) === 'материал';
          const vol = isMaterial ? Math.round(rawVal * 1000) / 1000 : Math.round(rawVal * 100) / 100;
          const unit = item["Единицы измерения"] || item.unit || 'м';
          const itemName = (item["Наименование"] || item.name || opticalPrimaryTitle).trim();
          const formulaDisplay = buildWorkFormulaDisplay(formula, totalOpticalLength, opticalCables.length, unit);

          calculatedWorks.push({
            name: itemName,
            unit: unit,
            volume: vol,
            formulaDisplay: formulaDisplay,
            ruleName: ruleName,
            routingType: ruleName,
            tierKey: parsedWM.optical.key,
            isOptical: true,
            category: 'Оптический кабель',
            section: sectionName,
            type: isMaterial ? 'материал' : 'работа',
            parentWorkName: isMaterial ? opticalPrimaryTitle : undefined,
            cablesCount: opticalCables.length,
            comment: item["Комментарий"] || item.comment || ''
          });
        });

        // List all optical cables under this primary work
        opticalCables.forEach(c => {
          const kmVol = Number((c.length / 1000).toFixed(3));
          calculatedWorks.push({
            name: c.fullDescription || `Кабель ${c.type}`,
            unit: 'км',
            volume: kmVol,
            formulaDisplay: `${kmVol.toFixed(3)} км (${Math.round(c.length)} м • ВОЛС)`,
            ruleName: ruleName,
            routingType: c.routingName,
            cableType: c.type,
            cableLength: c.length,
            weight: c.weight,
            isOptical: true,
            category: 'Оптический кабель',
            foundInCatalog: !!c.foundInCatalog,
            section: sectionName,
            type: 'материал',
            parentWorkName: opticalPrimaryTitle,
            comment: ''
          });
        });
      } else {
        missingInRules.push({
          type: `${ruleName} (оптический кабель)`,
          length: totalOpticalLength,
          count: opticalCables.length,
          ruleName: ruleName,
          missingType: 'optical'
        });
      }
    }

    // 2. Process ELECTRICAL cables dynamically by rule's weight tiers (object keys)
    if (electricalCables.length > 0) {
      if (parsedWM.tiers.length === 0) {
        let totElecLen = 0;
        electricalCables.forEach(c => totElecLen += c.length);
        missingInRules.push({
          type: `${ruleName} (электрический кабель)`,
          length: totElecLen,
          count: electricalCables.length,
          ruleName: ruleName,
          missingType: 'tier'
        });
      } else {
        const hasAnyThreshold = parsedWM.tiers.some(t => t.threshold !== null);

        // Distribute each electrical cable to the matching tier (key in object)
        electricalCables.forEach(cableItem => {
          const w = cableItem.weight || 0.35;
          let matchedTier = null;

          if (hasAnyThreshold) {
            // 1. Check "до X" tiers in ascending order
            matchedTier = parsedWM.tiers.find(t => !t.isOver && t.threshold !== null && w <= t.threshold);

            // 2. If not found, check "свыше X" tier
            if (!matchedTier) {
              matchedTier = parsedWM.tiers.find(t => t.isOver && (t.threshold === null || w > t.threshold));
            }

            // 3. If still not found, check if there is an unthresholded work in the rule
            if (!matchedTier) {
              matchedTier = parsedWM.tiers.find(t => !t.isOver && t.threshold === null);
            }
          } else {
            // If no tiers have thresholds, assign to first
            matchedTier = parsedWM.tiers[0];
          }

          if (matchedTier) {
            matchedTier.cables.push(cableItem);
          } else {
            // Cable weight exceeds all defined tiers
            const highestThreshold = Math.max(...parsedWM.tiers.map(t => t.threshold || 0).filter(t => t > 0));
            missingInRules.push({
              type: `${ruleName} (кабель массой 1 м: ${w} кг свыше ${highestThreshold || 3} кг)`,
              length: cableItem.length,
              count: 1,
              ruleName: ruleName,
              missingType: 'tier',
              tierMax: Math.ceil(w)
            });
          }
        });

        // Add calculated works and materials for tiers that have cables
        parsedWM.tiers.forEach(tier => {
          if (tier.cables.length === 0) return;

          // Sort cables in this tier by length descending
          tier.cables.sort((a, b) => (b.length || 0) - (a.length || 0));

          const totalTierLength = Math.round(tier.cables.reduce((sum, c) => sum + c.length, 0) * 100) / 100;

          const tierItems = (Array.isArray(tier.items) && tier.items.length > 0)
            ? tier.items
            : [{
                "Наименование": (template && (template.includes('{масса}') || template.includes('{вес}')))
                  ? template.replace(/\{масса\}|\{вес\}/gi, String(tier.threshold || '')).trim()
                  : (tier.threshold !== null ? `Прокладка кабеля массой 1 м, кг, до: ${tier.threshold} (${ruleName})` : `Прокладка кабеля (${ruleName})`),
                "Единицы измерения": "м",
                "Формула": "ДЛИНА",
                "Тип": "работа"
              }];

          const primaryWork = tierItems.find(w => (w["Тип"] || w.type) !== 'материал') || tierItems[0];
          let primaryWorkTitle = (primaryWork["Наименование"] || primaryWork.name || '').trim();
          if (!primaryWorkTitle && template && (template.includes('{масса}') || template.includes('{вес}'))) {
            primaryWorkTitle = template.replace(/\{масса\}|\{вес\}/gi, String(tier.threshold || '')).trim();
          }
          if (!primaryWorkTitle) {
            primaryWorkTitle = tier.threshold !== null
              ? `Прокладка кабеля массой 1 м, кг, до: ${tier.threshold} (${ruleName})`
              : `Прокладка кабеля (${ruleName})`;
          }

          // APPLY ALL WORKS AND MATERIALS FROM THIS TIER LIST
          tierItems.forEach(item => {
            const formula = item["Формула"] || item.formula || "ДЛИНА";
            const rawVal = evaluateWorkFormula(formula, totalTierLength);
            const isMaterial = (item["Тип"] || item.type) === 'материал';
            const vol = isMaterial ? Math.round(rawVal * 1000) / 1000 : Math.round(rawVal * 100) / 100;
            const unit = item["Единицы измерения"] || item.unit || 'м';
            const itemName = (item["Наименование"] || item.name || primaryWorkTitle).trim();
            const formulaDisplay = buildWorkFormulaDisplay(formula, totalTierLength, tier.cables.length, unit);

            calculatedWorks.push({
              name: itemName,
              unit: unit,
              volume: vol,
              formulaDisplay: formulaDisplay,
              ruleName: ruleName,
              routingType: ruleName,
              tierMax: tier.threshold,
              tierKey: tier.key,
              section: sectionName,
              type: isMaterial ? 'материал' : 'работа',
              parentWorkName: isMaterial ? primaryWorkTitle : undefined,
              cablesCount: tier.cables.length,
              comment: item["Комментарий"] || item.comment || ''
            });
          });

          // List all cables under this primary work as materials
          tier.cables.forEach(c => {
            const kmVol = Number((c.length / 1000).toFixed(3));
            calculatedWorks.push({
              name: c.fullDescription || `Кабель ${c.type}`,
              unit: 'км',
              volume: kmVol,
              formulaDisplay: `${kmVol.toFixed(3)} км (${Math.round(c.length)} м • масса 1 м: ${c.weight} кг)`,
              ruleName: ruleName,
              routingType: c.routingName,
              cableType: c.type,
              cableLength: c.length,
              weight: c.weight,
              foundInCatalog: !!c.foundInCatalog,
              section: sectionName,
              type: 'материал',
              parentWorkName: primaryWorkTitle,
              comment: ''
            });
          });
        });
      }
    }
  });

  // Identify any routing types in cables that have no matching works in "Монтажные работы"
  for (const rName of allUsedRoutingTypes) {
    if (!matchedRoutingTypes.has(rName)) {
      let totLen = 0;
      let count = 0;
      for (const [, cInfo] of cableEntries) {
        const routingMap = cInfo.routingTypes || {};
        if (routingMap[rName] !== undefined) {
          const lVal = routingMap[rName];
          totLen += (lVal > 0 ? lVal : (cInfo.length || 0));
          count += 1;
        }
      }
      missingInRules.push({
        type: rName,
        length: totLen,
        count: count,
        ruleName: rName,
        missingType: 'rule'
      });
    }
  }

  // Identify any cables that are not present in the cable catalog
  const missingInCatalog = [];
  const seenMissingCatalog = new Set();
  cableEntries.forEach(([cType, cInfo]) => {
    const cMeta = lookupCableInfo(cType, catalog);
    if (!cMeta.foundInCatalog && !seenMissingCatalog.has(cType)) {
      seenMissingCatalog.add(cType);
      missingInCatalog.push({
        type: cType,
        length: cInfo.length || 0,
        count: cInfo.count || 1,
        fallbackWeight: cMeta.weight || 0.35,
        tierMax: getCableWeightTier(cMeta.weight)
      });
    }
  });

  return {
    works: calculatedWorks,
    missingInRules,
    missingInCatalog,
    couplingsSummary
  };
}

// Get combined works and missing items from both Trenches ("Строительные работы") and Cables ("Монтажные работы")
function getAllCalculatedWorks() {
  const trenchSummary = getActiveTrenchSummary();
  const trenchCalc = calculateWorksFromTrenches(trenchSummary, currentWorksRules);

  const cableData = getActiveCableSummary();
  const cableCalc = calculateWorksFromCables(cableData.summary, currentWorksRules);

  return {
    works: [ ...trenchCalc.works, ...cableCalc.works ],
    trenchWorks: trenchCalc.works,
    cableWorks: cableCalc.works,
    missingInRules: [ ...trenchCalc.missingInRules, ...cableCalc.missingInRules ],
    trenchMissing: trenchCalc.missingInRules,
    cableMissing: cableCalc.missingInRules,
    cableMissingInCatalog: cableCalc.missingInCatalog || [],
    couplingsSummary: cableCalc.couplingsSummary
  };
}

// Escape XML special characters
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format numbers for GGE QuantityTakeoff XML
function formatGgeQuantity(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  const num = Number(val);
  const str = num.toString();
  const parts = str.split('.');
  if (parts.length === 1) {
    return num.toFixed(2);
  }
  if (parts[1].length === 1) {
    return num.toFixed(2);
  }
  if (parts[1].length === 2) {
    return num.toFixed(2);
  }
  return num.toFixed(3);
}

// Generate GGE XML format (QuantityTakeoff-3_01.xsd) for Главгосэкспертиза
function generateVorGgeXml(worksData, currentFileName) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const exportDateTime = `${year}-${pad(month)}-${pad(day)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const objectName = currentFileName ? currentFileName.replace(/\.[^/.]+$/, '') : '';

  // Group works by Section
  const sectionsMap = new Map();
  worksData.forEach(w => {
    let secName = (w.section || '').trim();
    if (!secName) {
      const lowerName = (w.name || '').toLowerCase();
      if (
        lowerName.includes('разработ') ||
        lowerName.includes('засып') ||
        lowerName.includes('грунт') ||
        lowerName.includes('транше') ||
        lowerName.includes('котлован') ||
        lowerName.includes('землян') ||
        lowerName.includes('планировк') ||
        lowerName.includes('бульдозер') ||
        lowerName.includes('экскаватор')
      ) {
        secName = 'Строительные работы';
      } else {
        secName = 'Монтажные работы';
      }
    }
    if (!sectionsMap.has(secName)) {
      sectionsMap.set(secName, []);
    }
    sectionsMap.get(secName).push(w);
  });

  let globalWorkNum = 1;
  let sectionNum = 1;
  let sectionsXml = '';

  for (const [secName, works] of sectionsMap.entries()) {
    let worksXml = '';
    works.forEach(work => {
      const typeXml = work.type ? `\t\t\t\t<Type>${escapeXml(work.type)}</Type>\n` : '';
      const commentXml = work.comment ? `\t\t\t\t<Comment>${escapeXml(work.comment)}</Comment>\n` : '';
      const unitStr = escapeXml(work.unit || 'м');
      const qtyStr = formatGgeQuantity(work.volume);
      const formulaStr = escapeXml(work.formulaDisplay || String(work.volume));

      worksXml += `\t\t\t<Work>
\t\t\t\t<Num>${globalWorkNum++}</Num>
${typeXml}\t\t\t\t<Name>${escapeXml(work.name)}</Name>
\t\t\t\t<Unit>${unitStr}</Unit>
\t\t\t\t<Quantity>${qtyStr}</Quantity>
\t\t\t\t<QuantityFormula>${formulaStr}</QuantityFormula>
\t\t\t\t<Links>
\t\t\t\t</Links>
${commentXml}\t\t\t</Work>\n`;
    });

    sectionsXml += `\t<Section>
\t\t<Num>${sectionNum++}</Num>
\t\t<Name>${escapeXml(secName)}</Name>
\t\t<Works>
${worksXml}\t\t</Works>
\t</Section>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Construction xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="QuantityTakeoff-3_01.xsd">
<Meta>
\t<Soft>
\t\t<Name>Программный комплекс &quot;Строительный эксперт&quot;  v7.3.1.7813</Name>
\t\t<Version>Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13</Version>
\t</Soft>
\t<File>
\t\t<Type>Ведомость объемов работ</Type>
\t\t<Version>3.01</Version>
\t</File>
</Meta>
<AccessLevel>коммерческая тайна</AccessLevel>
<ConstructionSite></ConstructionSite>
<ObjectName>${escapeXml(objectName)}</ObjectName>
<Num></Num>
<Reason></Reason>
<Date>
\t<Year>${year}</Year>
\t<Month>${month}</Month>
\t<Day>${day}</Day>
</Date>
<ExportDateTime>${exportDateTime}</ExportDateTime>
<Signatures>
\t<Composer>
\t\t<Name></Name>
\t\t<Position></Position>
\t</Composer>
\t<Verifier>
\t\t<Name></Name>
\t\t<Position></Position>
\t</Verifier>
</Signatures>
<Files>
\t<File>
\t\t<ID>1</ID>
\t\t<FileName>${escapeXml(currentFileName || '')}</FileName>
\t</File>
</Files>
<Sections>
${sectionsXml}</Sections>
</Construction>`;

  return xml;
}

// Generate Excel Workbook matching the user's template format
function generateVorWorkbook(worksData, currentFileName) {
  const headersRow1 = [
    '№ п.п.',
    'Наименование работ, ресурсов, затрат по проекту',
    'Ед. изм.',
    'Объем работ / Количество',
    'Формула расчета объемов работ и расхода материалов, потребности ресурсов',
    'Ссылка на чертежи, спецификации в проектной документации',
    'Наименование файла',
    'Номера страниц (через пробел)',
    'Дополнительная информация (комментарий).'
  ];

  const headersRow2 = [
    1, 2, 3, 4, 5, 6, '6.1', '6.2', 7
  ];

  const aoa = [
    headersRow1,
    headersRow2
  ];

  // Group works by Section
  const sectionsMap = new Map();
  worksData.forEach(w => {
    const secName = (w.section || 'Строительные работы').trim();
    if (!sectionsMap.has(secName)) {
      sectionsMap.set(secName, []);
    }
    sectionsMap.get(secName).push(w);
  });

  const merges = [];
  let secIndex = 1;
  const dataRowIndexes = [];

  for (const [secName, works] of sectionsMap.entries()) {
    const secRowIndex = aoa.length;
    aoa.push([
      `Раздел ${secIndex}. ${secName}`,
      '', '', '', '', '', '', '', ''
    ]);
    merges.push({ s: { r: secRowIndex, c: 0 }, e: { r: secRowIndex, c: 8 } });
    secIndex++;

    works.forEach((w, idx) => {
      dataRowIndexes.push(aoa.length);
      aoa.push([
        idx + 1,
        w.name,
        w.unit,
        w.volume,
        w.formulaDisplay,
        '', // Ссылка на чертежи
        '', // Наименование файла
        '', // Номера страниц
        ''  // Дополнительная информация
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Proportional column widths
  ws['!cols'] = [
    { wch: 8 },   // 1: № п.п.
    { wch: 52 },  // 2: Наименование
    { wch: 14 },  // 3: Ед. изм.
    { wch: 18 },  // 4: Объем работ
    { wch: 45 },  // 5: Формула расчета
    { wch: 22 },  // 6: Ссылка
    { wch: 18 },  // 6.1: Файл
    { wch: 18 },  // 6.2: Номера страниц
    { wch: 25 }   // 7: Доп. инфо
  ];

  ws['!merges'] = merges;

  // Format Volume column as numeric
  dataRowIndexes.forEach(r => {
    const cellAddr = XLSX.utils.encode_cell({ r, c: 3 });
    if (ws[cellAddr]) {
      ws[cellAddr].t = 'n';
      ws[cellAddr].z = '#,##0.00';
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ВОР');

  // Also include summary sheets so all project data is available
  const resCable = document.querySelector('#result table');
  const resRouting = document.querySelector('#resultCouplings table');
  if (resCable) {
    const wsCable = XLSX.utils.table_to_sheet(resCable);
    XLSX.utils.book_append_sheet(wb, wsCable, 'Ведомость кабелей');
  }
  if (resRouting) {
    const wsRouting = XLSX.utils.table_to_sheet(resRouting);
    XLSX.utils.book_append_sheet(wb, wsRouting, 'Ведомость траншей');
  }
  const resCouplings = document.querySelector('#resultCouplingsStatement table');
  if (resCouplings) {
    const wsCouplings = XLSX.utils.table_to_sheet(resCouplings);
    XLSX.utils.book_append_sheet(wb, wsCouplings, 'Ведомость муфт');
  }

  return wb;
}

// Export calculation results to XML GGE (.gge) matching Главгосэкспертиза format
function exportCalculationResults() {
  // Ensure calculations have been executed
  const resCable = document.querySelector('#result table');
  const resRouting = document.querySelector('#resultCouplings table');

  if (!resCable && !resRouting) {
    if (currentData) {
      calculateVolumes();
    } else {
      showToast('Сначала загрузите исходные данные для расчета', 'error', 'Ошибка');
      return;
    }
  }

  const { works, missingInRules, cableMissingInCatalog } = getAllCalculatedWorks();

  if (works.length === 0) {
    showToast('Не найдено подходящих правил сметных норм для траншей или кабелей в проекте', 'error', 'Ошибка');
    return;
  }

  // If any types had missing works in the rules, notify user
  if (missingInRules.length > 0) {
    const missingStr = missingInRules
      .map(m => `«${m.type}» (${Math.round(m.length)} м)`)
      .join(', ');
    showToast(
      `Внимание: для способов ${missingStr} в файле правил сметных норм отсутствуют работы. Экспорт продолжен для остальных позиций.`,
      'warning',
      'Внимание',
      8000
    );
  }

  if (cableMissingInCatalog && cableMissingInCatalog.length > 0) {
    const missingCables = cableMissingInCatalog.map(m => m.type).join(', ');
    showToast(
      `Внимание: в ВОР присутствуют марки кабелей (${missingCables}), отсутствующие в справочнике. Применен приблизительный расчетный вес.`,
      'warning',
      'Справочник кабелей',
      8000
    );
  }

  const xmlContent = generateVorGgeXml(works, currentFileName);
  const outBaseName = currentFileName
    ? currentFileName.replace(/\.[^/.]+$/, '')
    : 'Ведомость_объемов_работ';
  const outFileName = `ВОР_${outBaseName}.gge`;

  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Ведомость объемов работ (ВОР) успешно экспортирована в файл «${outFileName}» (${works.length} поз.)`, 'success', 'Экспорт GGE завершен');
}

// Optional secondary export to Excel (.xlsx)
function exportVorExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Библиотека XLSX недоступна', 'error', 'Ошибка');
    return;
  }
  const { works, missingInRules, cableMissingInCatalog } = getAllCalculatedWorks();
  if (works.length === 0) {
    showToast('Не найдено работ для экспорта в ВОР', 'error', 'Ошибка');
    return;
  }
  if (missingInRules.length > 0) {
    const missingStr = missingInRules
      .map(m => `«${m.type}» (${Math.round(m.length)} м)`)
      .join(', ');
    showToast(
      `Внимание: для способов ${missingStr} в файле сметных норм отсутствуют работы.`,
      'warning',
      'Внимание',
      6000
    );
  }
  if (cableMissingInCatalog && cableMissingInCatalog.length > 0) {
    const missingCables = cableMissingInCatalog.map(m => m.type).join(', ');
    showToast(
      `Внимание: ${cableMissingInCatalog.length} марок кабелей (${missingCables}) отсутствуют в справочнике. Применен расчетный вес.`,
      'warning',
      'Справочник кабелей',
      7000
    );
  }
  const wb = generateVorWorkbook(works, currentFileName);
  const outBaseName = currentFileName
    ? currentFileName.replace(/\.[^/.]+$/, '')
    : 'Ведомость_объемов_работ';
  XLSX.writeFile(wb, `ВОР_${outBaseName}.xlsx`);
  showToast(`Ведомость объемов работ успешно экспортирована в Excel (.xlsx) (${works.length} поз.)`, 'success', 'Экспорт Excel');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------
// JSON Editor & Custom Data Utilities
// ---------------------------------------------------------

// Synchronize table cell values to currentData
function syncTableToCurrentData() {
  if (!currentData) return;
  const cableTable = document.getElementById('tableCables');
  if (cableTable && Array.isArray(currentData.cables)) {
    const rows = cableTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const idx = parseInt(row.dataset.index, 10);
      if (!isNaN(idx) && currentData.cables[idx]) {
        const cableField = row.querySelector('[data-field="cable"]');
        const typeField = row.querySelector('[data-field="type"]');
        const lengthField = row.querySelector('[data-field="length"]');
        if (cableField) currentData.cables[idx].cable = cableField.textContent.trim();
        if (typeField) currentData.cables[idx].type = typeField.textContent.trim();
        if (lengthField) {
          const num = parseFloat(lengthField.textContent.replace(/\s+/g, '').replace(/,/g, '.'));
          if (!isNaN(num)) currentData.cables[idx].length = num;
        }
      }
    });
  }

  const routingTable = document.getElementById('tableRouting');
  if (routingTable && Array.isArray(currentData.routingTypeBlocks)) {
    const rows = routingTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const idx = parseInt(row.dataset.index, 10);
      if (!isNaN(idx) && currentData.routingTypeBlocks[idx]) {
        const typeField = row.querySelector('[data-field="type"]');
        const lengthField = row.querySelector('[data-field="length"]');
        if (typeField) currentData.routingTypeBlocks[idx].type = typeField.textContent.trim();
        if (lengthField) {
          const num = parseFloat(lengthField.textContent.replace(/\s+/g, '').replace(/,/g, '.'));
          if (!isNaN(num)) currentData.routingTypeBlocks[idx].length = num;
        }
      }
    });
  }
}

// --------------------------------------------------------------------------
// WORKS RULES & NORMS JSON EDITOR
// --------------------------------------------------------------------------

// Open Works Rules Modal with specific tab active ('editor', 'cards', 'cables', or 'couplings')
function openWorksRulesModal(activeTab = 'editor') {
  const modalEl = document.getElementById('worksRulesModal');
  if (!modalEl) return;

  const textarea = document.getElementById('worksJsonEditorTextarea');
  if (textarea) {
    textarea.value = JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": [] }, null, 2);
    validateWorksJsonInput();
  }

  renderRulesModalContent();

  if (activeTab === 'cards') {
    const cardsTabBtn = document.getElementById('tabWorksCardsBtn');
    if (cardsTabBtn && window.bootstrap && bootstrap.Tab) {
      bootstrap.Tab.getOrCreateInstance(cardsTabBtn).show();
    }
  } else if (activeTab === 'cables') {
    const cablesTabBtn = document.getElementById('tabWorksCablesBtn');
    if (cablesTabBtn && window.bootstrap && bootstrap.Tab) {
      bootstrap.Tab.getOrCreateInstance(cablesTabBtn).show();
    }
  } else if (activeTab === 'couplings') {
    const couplingsTabBtn = document.getElementById('tabWorksCouplingsBtn');
    if (couplingsTabBtn && window.bootstrap && bootstrap.Tab) {
      bootstrap.Tab.getOrCreateInstance(couplingsTabBtn).show();
    }
  } else {
    const jsonTabBtn = document.getElementById('tabWorksJsonBtn');
    if (jsonTabBtn && window.bootstrap && bootstrap.Tab) {
      bootstrap.Tab.getOrCreateInstance(jsonTabBtn).show();
    }
  }

  if (window.bootstrap && bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// Validate Works Rules JSON in textarea, update stats, status badge and error display
function validateWorksJsonInput() {
  const textarea = document.getElementById('worksJsonEditorTextarea');
  const badge = document.getElementById('worksJsonValidationBadge');
  const countBadge = document.getElementById('worksRulesCountBadge');
  const errorAlert = document.getElementById('worksJsonErrorAlert');
  const errorMessage = document.getElementById('worksJsonErrorMessage');
  const applyBtn = document.getElementById('applyWorksRulesBtn');
  const statLines = document.getElementById('worksStatLines');
  const statChars = document.getElementById('worksStatChars');
  const statTrenches = document.getElementById('worksStatTrenches');
  const statCables = document.getElementById('worksStatCables');
  const statCouplings = document.getElementById('worksStatCouplings');
  const statWorks = document.getElementById('worksStatWorks');

  if (!textarea) return false;
  const val = textarea.value;

  const lines = val ? val.split('\n').length : 0;
  if (statLines) statLines.textContent = lines.toLocaleString('ru-RU');
  if (statChars) statChars.textContent = val.length.toLocaleString('ru-RU');

  try {
    const parsed = JSON.parse(val);
    const sections = getRulesSections(parsed);

    let totalWaysCount = 0;
    let totalWorksCount = 0;
    sections.forEach(sec => {
      totalWaysCount += sec.rules.length;
      sec.rules.forEach(t => {
        const works = getRuleWorks(t);
        if (Array.isArray(works)) totalWorksCount += works.length;
      });
    });

    // Count cables in catalog
    const catalog = getCableCatalog(parsed) || {};
    let totalCablesCount = 0;
    if (catalog && typeof catalog === 'object') {
      Object.keys(catalog).forEach(gk => {
        const g = catalog[gk];
        if (g && typeof g === 'object' && g["Тип"] && typeof g["Тип"] === 'object') {
          totalCablesCount += Object.keys(g["Тип"]).length;
        }
      });
    }

    // Count couplings in catalog
    const couplingCatalog = getCouplingCatalog(parsed) || {};
    const totalCouplingsCount = (couplingCatalog && typeof couplingCatalog === 'object') ? Object.keys(couplingCatalog).length : 0;

    if (statTrenches) statTrenches.textContent = totalWaysCount.toLocaleString('ru-RU');
    if (statCables) statCables.textContent = totalCablesCount.toLocaleString('ru-RU');
    if (statCouplings) statCouplings.textContent = totalCouplingsCount.toLocaleString('ru-RU');
    if (statWorks) statWorks.textContent = totalWorksCount.toLocaleString('ru-RU');

    const tabCouplingsBadge = document.getElementById('tabWorksCouplingsCountBadge');
    if (tabCouplingsBadge) tabCouplingsBadge.textContent = totalCouplingsCount;

    if (badge) {
      badge.className = 'badge bg-success-subtle text-success border border-success-subtle ms-2';
      badge.innerHTML = "<i class='bx bx-check me-1'></i>Корректный JSON";
    }
    if (countBadge) {
      countBadge.textContent = `${totalWaysCount} способов в ${sections.length} разд. (${totalWorksCount} поз.)`;
    }
    if (errorAlert) errorAlert.classList.add('d-none');
    if (applyBtn) applyBtn.disabled = false;
    return true;
  } catch (err) {
    if (statTrenches) statTrenches.textContent = '—';
    if (statCables) statCables.textContent = '—';
    if (statCouplings) statCouplings.textContent = '—';
    if (statWorks) statWorks.textContent = '—';

    if (badge) {
      badge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle ms-2';
      badge.innerHTML = "<i class='bx bx-x me-1'></i>Ошибка синтаксиса";
    }
    if (errorAlert) {
      errorAlert.classList.remove('d-none');
      if (errorMessage) {
        errorMessage.textContent = err.message;
      }
    }
    if (applyBtn) applyBtn.disabled = true;
    return false;
  }
}

// Setup Works Rules modal controls & JSON editor listeners
function setupWorksRulesListeners() {
  const textarea = document.getElementById('worksJsonEditorTextarea');
  if (textarea) {
    textarea.addEventListener('input', validateWorksJsonInput);

    // Support Tab key indentation inside textarea (inserts 2 spaces)
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
        validateWorksJsonInput();
      }
    });
  }

  // Format JSON button
  const formatBtn = document.getElementById('formatWorksJsonBtn');
  if (formatBtn && textarea) {
    formatBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(textarea.value);
        textarea.value = JSON.stringify(parsed, null, 2);
        validateWorksJsonInput();
        showToast('JSON сметных норм отформатирован', 'info', 'Форматирование');
      } catch (err) {
        showToast('Невозможно отформатировать: ' + err.message, 'error', 'Ошибка синтаксиса');
      }
    });
  }

  // Add rule template button (+ Способ)
  const addTemplateBtn = document.getElementById('addRuleTemplateBtn');
  if (addTemplateBtn && textarea) {
    addTemplateBtn.addEventListener('click', () => {
      try {
        let currentObj;
        try {
          currentObj = JSON.parse(textarea.value);
        } catch {
          currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": [] }));
        }

        const targetKey = (currentObj && typeof currentObj === 'object' && !Array.isArray(currentObj))
          ? (Array.isArray(currentObj["Монтажные работы"]) ? "Монтажные работы" : (Array.isArray(currentObj["Строительные работы"]) ? "Строительные работы" : (Object.keys(currentObj).find(k => Array.isArray(currentObj[k])) || "Монтажные работы")))
          : "Монтажные работы";

        const isMr = targetKey.toLowerCase().includes('монтаж');
        const sample = isMr ? {
          "Название": "Новый способ прокладки (например, ГНБ)",
          "Работы и материалы": {
            "1": [
              {
                "Наименование": "Прокладка кабеля массой 1 м, кг, до: 1 (ГНБ)",
                "МаксВес": 1,
                "Единицы измерения": "м",
                "Формула": "ДЛИНА",
                "Тип": "работа"
              }
            ],
            "2": [
              {
                "Наименование": "Прокладка кабеля массой 1 м, кг, до: 2 (ГНБ)",
                "МаксВес": 2,
                "Единицы измерения": "м",
                "Формула": "ДЛИНА",
                "Тип": "работа"
              }
            ],
            "3": [
              {
                "Наименование": "Прокладка кабеля массой 1 м, кг, до: 3 (ГНБ)",
                "МаксВес": 3,
                "Единицы измерения": "м",
                "Формула": "ДЛИНА",
                "Тип": "работа"
              }
            ],
            "оптический": [
              {
                "Наименование": "Прокладка оптического кабеля (ГНБ)",
                "Категория": "Оптический кабель",
                "Единицы измерения": "м",
                "Формула": "ДЛИНА",
                "Тип": "работа"
              }
            ]
          }
        } : {
          "Название": "Новый способ разработки грунта",
          "Работы и материалы": [
            {
              "Наименование": "Разработка грунта механизированным способом",
              "Единицы измерения": "м3",
              "Формула": "ДЛИНА",
              "Тип": "работа"
            }
          ]
        };

        if (Array.isArray(currentObj)) {
          currentObj.push(sample);
        } else if (currentObj && typeof currentObj === 'object') {
          if (!Array.isArray(currentObj[targetKey])) {
            currentObj[targetKey] = [];
          }
          currentObj[targetKey].push(sample);
        }

        textarea.value = JSON.stringify(currentObj, null, 2);
        validateWorksJsonInput();
        textarea.scrollTop = textarea.scrollHeight;
        showToast(`Шаблон нового способа прокладки добавлен в раздел «${targetKey}»`, 'success', 'Добавлено');
      } catch (err) {
        showToast('Ошибка при добавлении шаблона: ' + err.message, 'error', 'Ошибка');
      }
    });
  }

  // Add cable template button (+ Кабель) in toolbar and in cables tab
  const insertCableSample = () => {
    try {
      let currentObj;
      try {
        currentObj = JSON.parse(textarea.value);
      } catch {
        currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": [] }));
      }

      if (!currentObj || typeof currentObj !== 'object' || Array.isArray(currentObj)) {
        currentObj = { "Строительные работы": Array.isArray(currentObj) ? currentObj : [], "Справочник кабелей": {} };
      }

      if (!currentObj["Справочник кабелей"] || typeof currentObj["Справочник кабелей"] !== 'object') {
        const existingCat = (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"]) ? cachedDefaultRules["Справочник кабелей"] : {};
        currentObj["Справочник кабелей"] = JSON.parse(JSON.stringify(existingCat));
      }

      if (!currentObj["Справочник кабелей"]["Особый кабель"]) {
        currentObj["Справочник кабелей"]["Особый кабель"] = { "Название": "Особый кабель", "Тип": {} };
      }

      const sampleMark = "Новая-Марка-Кабеля 5х2х0,9";
      currentObj["Справочник кабелей"]["Особый кабель"]["Тип"][sampleMark] = {
        "Строительная длина": 600,
        "Муфта": "МСХз60-27",
        "Вес": 0.45,
        "Полное описание": "Кабель сигнализации и блокировки Новая-Марка-Кабеля 5х2х0,9"
      };

      textarea.value = JSON.stringify(currentObj, null, 2);
      validateWorksJsonInput();
      textarea.scrollTop = textarea.scrollHeight;

      // Switch to editor tab if not there
      const jsonTabBtn = document.getElementById('tabWorksJsonBtn');
      if (jsonTabBtn && window.bootstrap && bootstrap.Tab) {
        bootstrap.Tab.getOrCreateInstance(jsonTabBtn).show();
      }

      showToast(`Шаблон кабеля «${sampleMark}» добавлен в «Справочник кабелей» в редакторе JSON. Отредактируйте параметры и примените.`, 'success', 'Шаблон кабеля добавлен', 6000);
    } catch (err) {
      showToast('Ошибка при добавлении шаблона кабеля: ' + err.message, 'error', 'Ошибка');
    }
  };

  const addCableTemplateBtn = document.getElementById('addCableTemplateBtn');
  if (addCableTemplateBtn && textarea) {
    addCableTemplateBtn.addEventListener('click', insertCableSample);
  }

  const quickAddCableInTabBtn = document.getElementById('quickAddCableInTabBtn');
  if (quickAddCableInTabBtn && textarea) {
    quickAddCableInTabBtn.addEventListener('click', insertCableSample);
  }

  // Cable catalog tab search and filter listeners
  const cableSearchInput = document.getElementById('cableCatalogSearchInput');
  if (cableSearchInput) {
    cableSearchInput.addEventListener('input', renderCableCatalogModalContent);
  }

  const cableClearSearchBtn = document.getElementById('cableCatalogClearSearchBtn');
  if (cableClearSearchBtn && cableSearchInput) {
    cableClearSearchBtn.addEventListener('click', () => {
      cableSearchInput.value = '';
      renderCableCatalogModalContent();
      cableSearchInput.focus();
    });
  }

  const cableCatFilter = document.getElementById('cableCatalogCategoryFilter');
  if (cableCatFilter) {
    cableCatFilter.addEventListener('change', renderCableCatalogModalContent);
  }

  // Add coupling template sample (+ Муфта)
  const insertCouplingSample = () => {
    try {
      let currentObj;
      try {
        currentObj = JSON.parse(textarea.value);
      } catch {
        currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || {}));
      }

      if (!currentObj["Справочник муфт"] || typeof currentObj["Справочник муфт"] !== 'object' || Array.isArray(currentObj["Справочник муфт"])) {
        currentObj["Справочник муфт"] = {};
      }

      const sampleMark = "МСХз-Новая-48";
      currentObj["Справочник муфт"][sampleMark] = {
        "Полное наименование": "Муфта соединительная холодноусаживаемая МСХз-Новая до 48 жил",
        "МаксЖил": 48,
        "Единицы измерения": "шт"
      };

      textarea.value = JSON.stringify(currentObj, null, 2);
      validateWorksJsonInput();
      textarea.scrollTop = textarea.scrollHeight;

      // Switch to editor tab if not there
      const jsonTabBtn = document.getElementById('tabWorksJsonBtn');
      if (jsonTabBtn && window.bootstrap && bootstrap.Tab) {
        bootstrap.Tab.getOrCreateInstance(jsonTabBtn).show();
      }

      showToast(`Шаблон муфты «${sampleMark}» добавлен в «Справочник муфт» в редакторе JSON. Отредактируйте параметры и примените.`, 'success', 'Шаблон муфты добавлен', 6000);
    } catch (err) {
      showToast('Ошибка при добавлении шаблона муфты: ' + err.message, 'error', 'Ошибка');
    }
  };

  const addCouplingTemplateBtn = document.getElementById('addCouplingTemplateBtn');
  if (addCouplingTemplateBtn && textarea) {
    addCouplingTemplateBtn.addEventListener('click', insertCouplingSample);
  }

  const quickAddCouplingInTabBtn = document.getElementById('quickAddCouplingInTabBtn');
  if (quickAddCouplingInTabBtn && textarea) {
    quickAddCouplingInTabBtn.addEventListener('click', insertCouplingSample);
  }

  // Coupling catalog tab search and filter listeners
  const couplingSearchInput = document.getElementById('couplingCatalogSearchInput');
  if (couplingSearchInput) {
    couplingSearchInput.addEventListener('input', renderCouplingCatalogModalContent);
  }

  const couplingClearSearchBtn = document.getElementById('couplingCatalogClearSearchBtn');
  if (couplingClearSearchBtn && couplingSearchInput) {
    couplingClearSearchBtn.addEventListener('click', () => {
      couplingSearchInput.value = '';
      renderCouplingCatalogModalContent();
      couplingSearchInput.focus();
    });
  }

  // Reset rules button
  const resetBtn = document.getElementById('resetRulesBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetWorksRules);
  }

  // Download rules JSON button
  const downloadBtn = document.getElementById('downloadRulesBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadWorksRules);
  }

  // Upload rules JSON file button
  const rulesFileInput = document.getElementById('rulesFileInput');
  if (rulesFileInput) {
    rulesFileInput.addEventListener('change', handleRulesFileInput);
  }

  // Apply Works Rules & Recalculate button
  const applyBtn = document.getElementById('applyWorksRulesBtn');
  if (applyBtn && textarea) {
    applyBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(textarea.value);
        if (!parsed || typeof parsed !== 'object') {
          showToast('JSON должен быть объектом со структурой разделов или массивом', 'error', 'Неверный формат');
          return;
        }

        if (Array.isArray(parsed)) {
          currentWorksRules = { "Строительные работы": parsed };
        } else {
          currentWorksRules = parsed;
        }

        renderRulesModalContent();

        // Recalculate volumes if data is loaded
        if (currentData) {
          calculateVolumes();
        }

        const modalEl = document.getElementById('worksRulesModal');
        if (modalEl && window.bootstrap && bootstrap.Modal) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        const sections = getRulesSections(currentWorksRules);
        let totalWays = 0;
        sections.forEach(s => totalWays += s.rules.length);
        showToast(`Сметные нормы обновлены (${totalWays} способов в ${sections.length} разд.). Выполнен автоматический перерасчет работ.`, 'success', 'Перерасчет выполнен');
      } catch (err) {
        showToast('Ошибка синтаксиса JSON: ' + err.message, 'error', 'Ошибка');
      }
    });
  }
}

// Add missing trench types to rules and open editor
function addMissingTrenchTypesToRules(missingList) {
  if (!missingList || missingList.length === 0) return;

  if (!currentWorksRules) {
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": [] }));
  }
  if (!Array.isArray(currentWorksRules["Строительные работы"])) {
    currentWorksRules["Строительные работы"] = [];
  }

  let addedCount = 0;
  missingList.forEach(m => {
    const typeName = (typeof m === 'object' ? (m.ruleName || m.type) : m) || '';
    if (!typeName) return;
    const targetRule = currentWorksRules["Строительные работы"].find(r => matchesRule(typeName, r["Название"] || r.name));
    if (!targetRule) {
      currentWorksRules["Строительные работы"].push({
        "Название": typeName,
        "Работы и материалы": [
          {
            "Наименование": `Разработка грунта в траншеях (${typeName})`,
            "Единицы измерения": "м3 грунта",
            "Формула": "0,36*ДЛИНА",
            "Тип": "работа"
          },
          {
            "Наименование": `Засыпка траншей (${typeName})`,
            "Единицы измерения": "м3 грунта",
            "Формула": "0,36*ДЛИНА",
            "Тип": "работа"
          }
        ]
      });
      addedCount++;
    } else if (!targetRule["Работы и материалы"] || targetRule["Работы и материалы"].length === 0) {
      targetRule["Работы и материалы"] = [
        {
          "Наименование": `Разработка грунта в траншеях (${targetRule["Название"] || typeName})`,
          "Единицы измерения": "м3 грунта",
          "Формула": "0,36*ДЛИНА",
          "Тип": "работа"
        },
        {
          "Наименование": `Засыпка траншей (${targetRule["Название"] || typeName})`,
          "Единицы измерения": "м3 грунта",
          "Формула": "0,36*ДЛИНА",
          "Тип": "работа"
        }
      ];
      addedCount++;
    }
  });

  openWorksRulesModal('editor');
  showToast(`Добавлено способов прокладки в раздел «Строительные работы»: ${addedCount}. Отредактируйте формулы и нажмите «Применить и пересчитать».`, 'info', 'Правила дополнены');
}

// Add missing cable routing types or missing work items to "Монтажные работы" in rules and open editor
function addMissingCableWaysToRules(missingList) {
  if (!missingList || missingList.length === 0) return;

  if (!currentWorksRules) {
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": [], "Монтажные работы": [] }));
  }
  if (!Array.isArray(currentWorksRules["Монтажные работы"])) {
    currentWorksRules["Монтажные работы"] = [];
  }

  const createDefaultMrObj = (typeName) => ({
    "1": [
      {
        "Наименование": `Прокладка кабеля массой 1 м, кг, до: 1 (${typeName})`,
        "МаксВес": 1,
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа"
      }
    ],
    "2": [
      {
        "Наименование": `Прокладка кабеля массой 1 м, кг, до: 2 (${typeName})`,
        "МаксВес": 2,
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа"
      }
    ],
    "3": [
      {
        "Наименование": `Прокладка кабеля массой 1 м, кг, до: 3 (${typeName})`,
        "МаксВес": 3,
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа"
      }
    ],
    "оптический": [
      {
        "Наименование": `Прокладка оптического кабеля (${typeName})`,
        "Категория": "Оптический кабель",
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа"
      }
    ]
  });

  let addedCount = 0;
  missingList.forEach(m => {
    if (m && typeof m === 'object' && m.missingType === 'optical') {
      const targetRule = currentWorksRules["Монтажные работы"].find(r => matchesRule(m.ruleName, r["Название"] || r.name));
      if (targetRule) {
        if (!targetRule["Работы и материалы"] || typeof targetRule["Работы и материалы"] !== 'object') {
          targetRule["Работы и материалы"] = {};
        }
        if (Array.isArray(targetRule["Работы и материалы"])) {
          // Convert legacy array to object
          const oldArr = targetRule["Работы и материалы"];
          targetRule["Работы и материалы"] = {};
          oldArr.forEach(w => {
            const th = extractWeightThreshold(w);
            const k = th !== null ? String(th) : "1";
            if (!targetRule["Работы и материалы"][k]) targetRule["Работы и материалы"][k] = [];
            targetRule["Работы и материалы"][k].push(w);
          });
        }
        const wmObj = targetRule["Работы и материалы"];
        const hasOpt = Object.keys(wmObj).some(k => {
          if (k.toLowerCase().includes('оптич') || k.toLowerCase().includes('волс')) return true;
          const arr = wmObj[k];
          return Array.isArray(arr) && arr.some(w => {
            const cat = String(w["Категория"] || w.category || '').toLowerCase();
            const nm = String(w["Наименование"] || w.name || '').toLowerCase();
            return cat.includes('оптич') || nm.includes('оптическ');
          });
        });
        if (!hasOpt) {
          wmObj["оптический"] = [
            {
              "Наименование": `Прокладка оптического кабеля (${targetRule["Название"] || m.ruleName})`,
              "Единицы измерения": "м",
              "Категория": "Оптический кабель",
              "Формула": "ДЛИНА",
              "Тип": "работа"
            }
          ];
          addedCount++;
        }
      }
    } else if (m && typeof m === 'object' && m.missingType === 'tier') {
      const targetRule = currentWorksRules["Монтажные работы"].find(r => matchesRule(m.ruleName, r["Название"] || r.name));
      if (targetRule) {
        if (!targetRule["Работы и материалы"] || typeof targetRule["Работы и материалы"] !== 'object') {
          targetRule["Работы и материалы"] = {};
        }
        if (Array.isArray(targetRule["Работы и материалы"])) {
          const oldArr = targetRule["Работы и материалы"];
          targetRule["Работы и материалы"] = {};
          oldArr.forEach(w => {
            const th = extractWeightThreshold(w);
            const k = th !== null ? String(th) : "1";
            if (!targetRule["Работы и материалы"][k]) targetRule["Работы и материалы"][k] = [];
            targetRule["Работы и материалы"][k].push(w);
          });
        }
        const wmObj = targetRule["Работы и материалы"];
        const tierKey = String(m.tierMax || 1);
        const hasTier = wmObj[tierKey] && wmObj[tierKey].length > 0;
        if (!hasTier) {
          wmObj[tierKey] = [
            {
              "Наименование": `Прокладка кабеля массой 1 м, кг, до: ${tierKey} (${targetRule["Название"] || m.ruleName})`,
              "Единицы измерения": "м",
              "МаксВес": Number(tierKey) || m.tierMax || 1,
              "Формула": "ДЛИНА",
              "Тип": "работа"
            }
          ];
          addedCount++;
        }
      }
    } else if (m && typeof m === 'object' && m.missingType === 'empty_rule') {
      const targetRule = currentWorksRules["Монтажные работы"].find(r => matchesRule(m.ruleName, r["Название"] || r.name));
      if (targetRule) {
        targetRule["Работы и материалы"] = createDefaultMrObj(targetRule["Название"] || m.ruleName);
        addedCount++;
      }
    } else {
      const typeName = (typeof m === 'object' ? (m.ruleName || m.type) : m) || '';
      if (!typeName) return;
      const targetRule = currentWorksRules["Монтажные работы"].find(r => matchesRule(typeName, r["Название"] || r.name));
      if (!targetRule) {
        currentWorksRules["Монтажные работы"].push({
          "Название": typeName,
          "Работы и материалы": createDefaultMrObj(typeName)
        });
        addedCount++;
      } else if (!targetRule["Работы и материалы"] || (Array.isArray(targetRule["Работы и материалы"]) && targetRule["Работы и материалы"].length === 0) || Object.keys(targetRule["Работы и материалы"]).length === 0) {
        targetRule["Работы и материалы"] = createDefaultMrObj(typeName);
        addedCount++;
      }
    }
  });

  openWorksRulesModal('editor');
  showToast(`Добавлено позиций в раздел «Монтажные работы»: ${addedCount}. Отредактируйте наименования/формулы и нажмите «Применить и пересчитать».`, 'info', 'Правила дополнены');
}

// Add missing cable types to "Справочник кабелей" in rules and open editor
function addMissingCablesToCatalog(missingList) {
  if (!missingList || missingList.length === 0) return;

  if (!currentWorksRules) {
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": [], "Монтажные работы": [] }));
  }
  if (!currentWorksRules["Справочник кабелей"] || typeof currentWorksRules["Справочник кабелей"] !== 'object') {
    const existingCat = (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"]) ? cachedDefaultRules["Справочник кабелей"] : {};
    currentWorksRules["Справочник кабелей"] = JSON.parse(JSON.stringify(existingCat));
  }
  if (!currentWorksRules["Справочник кабелей"]["Особый кабель"]) {
    currentWorksRules["Справочник кабелей"]["Особый кабель"] = { "Название": "Особый кабель", "Тип": {} };
  }
  if (!currentWorksRules["Справочник кабелей"]["Особый кабель"]["Тип"] || typeof currentWorksRules["Справочник кабелей"]["Особый кабель"]["Тип"] !== 'object') {
    currentWorksRules["Справочник кабелей"]["Особый кабель"]["Тип"] = {};
  }
  if (!currentWorksRules["Справочник кабелей"]["Оптический кабель"]) {
    currentWorksRules["Справочник кабелей"]["Оптический кабель"] = { "Название": "Оптический кабель", "Категория": "Оптический кабель", "Тип": {} };
  }
  if (!currentWorksRules["Справочник кабелей"]["Оптический кабель"]["Тип"] || typeof currentWorksRules["Справочник кабелей"]["Оптический кабель"]["Тип"] !== 'object') {
    currentWorksRules["Справочник кабелей"]["Оптический кабель"]["Тип"] = {};
  }

  let addedCount = 0;
  const addedTypes = [];

  missingList.forEach(m => {
    const typeName = m.type || m;
    const isOpt = m.isOptical || /^(?:ОК|ВОЛС|ДПС|ТОС|ДПО|ОКБ|ОКЛ|ОКС)/i.test(typeName);
    const targetSection = isOpt ? "Оптический кабель" : "Особый кабель";

    if (!currentWorksRules["Справочник кабелей"][targetSection]["Тип"][typeName]) {
      currentWorksRules["Справочник кабелей"][targetSection]["Тип"][typeName] = isOpt ? {
        "Строительная длина": 2000,
        "Муфта": "МТОК-А1/216-1Т3-44",
        "Вес": 0.28,
        "Категория": "Оптический кабель",
        "Полное описание": `Кабель связи оптический ${typeName}`
      } : {
        "Строительная длина": 300,
        "Муфта": "Уточнить",
        "Вес": m.fallbackWeight || 0.35,
        "Полное описание": `Кабель ${typeName}`
      };
      addedCount++;
      addedTypes.push(typeName);
    }
  });

  openWorksRulesModal('editor');
  showToast(
    `В раздел «Справочник кабелей» добавлены заготовки для ${addedCount} марок: ${addedTypes.join(', ')}. Укажите паспортные характеристики и нажмите «Применить и пересчитать».`,
    'info',
    'Справочник кабелей дополнен',
    8000
  );
}

