// Bill of quantities (ВОР) module logic
let currentData = null;
let currentFileName = '';
let isRawColCollapsed = false;

// Helper to extract works/materials array from a rule object, supporting nested "Материалы" arrays
function getRuleWorks(rule) {
  if (!rule || typeof rule !== 'object') return [];
  const raw = rule["Работы и материалы"] !== undefined ? rule["Работы и материалы"] : (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
  if (Array.isArray(raw)) {
    const list = [];
    raw.forEach(item => {
      if (item && typeof item === 'object') {
        list.push(item);
        const mats = Array.isArray(item["Материалы"]) ? item["Материалы"] : [];
        const equips = Array.isArray(item["Оборудование"]) ? item["Оборудование"] : [];
        mats.forEach(mat => {
          if (mat && typeof mat === 'object') {
            list.push({
              ...mat,
              "Тип": mat["Тип"] || mat.type || "материал",
              "Раздел": mat["Раздел"] || item["Раздел"] || rule["Раздел"],
              parentWorkName: item["Наименование"]
            });
          }
        });
        equips.forEach(eq => {
          if (eq && typeof eq === 'object') {
            list.push({
              ...eq,
              "Тип": eq["Тип"] || eq.type || "оборудование",
              "Раздел": eq["Раздел"] || item["Раздел"] || rule["Раздел"],
              parentWorkName: item["Наименование"]
            });
          }
        });
      }
    });
    return list;
  }
  if (raw && typeof raw === 'object') {
    const list = [];
    Object.entries(raw).forEach(([tierKey, arr]) => {
      if (Array.isArray(arr)) {
        arr.forEach(item => {
          if (item && typeof item === 'object') {
            list.push({ ...item, _tierKey: tierKey });
            const mats = Array.isArray(item["Материалы"]) ? item["Материалы"] : [];
            const equips = Array.isArray(item["Оборудование"]) ? item["Оборудование"] : [];
            mats.forEach(mat => {
              if (mat && typeof mat === 'object') {
                list.push({
                  ...mat,
                  "Тип": mat["Тип"] || mat.type || "материал",
                  "Раздел": mat["Раздел"] || item["Раздел"] || rule["Раздел"],
                  parentWorkName: item["Наименование"],
                  _tierKey: tierKey
                });
              }
            });
            equips.forEach(eq => {
              if (eq && typeof eq === 'object') {
                list.push({
                  ...eq,
                  "Тип": eq["Тип"] || eq.type || "оборудование",
                  "Раздел": eq["Раздел"] || item["Раздел"] || rule["Раздел"],
                  parentWorkName: item["Наименование"],
                  _tierKey: tierKey
                });
              }
            });
          }
        });
      }
    });
    return list;
  }
  return [];
}

// --------------------------------------------------------------------------
// FORMULA MATH OPERATOR NORMALIZATION
// --------------------------------------------------------------------------

// Normalize all mathematical operator symbols in formula strings to standard characters
// - Multiplication: convert '×', '✕', '✖', '·', '∗', '•', and letter 'х'/'x' in multiplication context to standard '*'
// - Division: convert '÷' to '/'
// - Minus: convert '−', en-dash '–', em-dash '—' to '-'
// - Spaces: convert non-breaking space (\u00A0), thin space (\u2009), narrow nbsp (\u202F) to standard space
// - Formatting: ensure uniform, single spaces around operators (' * ', ' + ', ' - ', ' / ', ' = ')
function normalizeFormulaMathOperators(formulaStr) {
  if (formulaStr === null || formulaStr === undefined) return '';
  let str = String(formulaStr);
  if (!str.trim()) return '';

  // 1. Replace non-breaking spaces and other irregular spaces with regular ASCII space
  str = str.replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');

  // 2. Replace non-standard multiplication symbols:
  // × (U+00D7), ✕ (U+2715), ✖ (U+2716), · (U+00B7), ∗ (U+2217)
  str = str.replace(/[×✕✖·∗]/g, '*');
  str = str.replace(/\s*•\s*/g, ' * ');

  // Letter 'х'/'Х' (Cyrillic) or 'x'/'X' (Latin) when used as multiplication between numbers or after units
  // e.g. "5 х 10", "5x10", "3 шт. х 2 м", "3 шт х 2 м"
  str = str.replace(/(\d+(?:[.,]\d+)?)\s*[xхXХ]\s*(\d+(?:[.,]\d+)?)/g, '$1 * $2');
  str = str.replace(/(\b(?:шт|м|каб|перес|км)\.?)\s*[xхXХ]\s*/gi, '$1 * ');

  // 3. Replace non-standard division symbol ÷
  str = str.replace(/÷/g, '/');

  // 4. Replace non-standard minus symbols: − (U+2212), – (U+2013), — (U+2014)
  str = str.replace(/[\u2212\u2013\u2014]/g, '-');

  // 5. Clean up multiple consecutive asterisks
  str = str.replace(/\*{2,}/g, '*');

  // 6. Ensure uniform spacing around operators: ' * ', ' + ', ' = ', ' / '
  str = str.replace(/\s*\*\s*/g, ' * ');
  str = str.replace(/\s*\+\s*/g, ' + ');
  str = str.replace(/\s*=\s*/g, ' = ');
  str = str.replace(/\s*\/\s*/g, ' / ');
  str = str.replace(/(\w|\)|(?:[.,]\d+))\s*-\s*(\w|\(|\d)/g, '$1 - $2');

  // 7. Collapse multiple spaces into single space and trim
  str = str.replace(/ {2,}/g, ' ').trim();

  return str;
}

// Evaluate formula (e.g. "ДЛИНА", "0.36*ДЛИНА", "1.05*ДЛИНА", "КОЛИЧЕСТВО", "1*КОЛИЧЕСТВО") with a given base value
function evaluateWorkFormula(formula, baseValue) {
  const num = Number(baseValue) || 0;
  if (!formula || typeof formula !== 'string' || !formula.trim()) {
    return num;
  }
  const clean = formula.trim()
    .replace(/[×✕✖·∗]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[\u2212\u2013\u2014]/g, '-');
  const upper = clean.toUpperCase();
  if (upper === 'ДЛИНА' || upper === 'КОЛИЧЕСТВО' || upper === 'КОЛИЧЕСТВО_МУФТ') {
    return num;
  }
  const expr = clean.replace(/,/g, '.')
    .replace(/ДЛИНА/gi, String(num))
    .replace(/КОЛИЧЕСТВО_МУФТ/gi, String(num))
    .replace(/КОЛИЧЕСТВО/gi, String(num));
  try {
    if (/^[0-9+\-*/().\s]+$/.test(expr)) {
      const val = Function("'use strict'; return (" + expr + ");")();
      if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
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
  return normalizeFormulaMathOperators(disp);
}

// Check if calculation formula should be displayed for work or material item
// Controlled by "ОтображатьФормулу", "Показывать формулу", "showFormula", etc.
function shouldShowFormula(item, fallbackValue = true) {
  if (!item || typeof item !== 'object') return fallbackValue;

  const formulaKeyRegex = /^(?:отображать|показывать|show|display)[ _-]*(?:формулу|формула|formula)$/i;

  let val = undefined;
  for (const [key, v] of Object.entries(item)) {
    if (formulaKeyRegex.test(key.trim())) {
      val = v;
      break;
    }
  }

  if (val === undefined || val === null) {
    if (item.showFormula !== undefined) val = item.showFormula;
  }

  if (val === undefined || val === null) return fallbackValue;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'нет' || s === 'ложь' || s === 'off' || s === 'no' || s === 'не показывать' || s === 'не отображать') {
      return false;
    }
    return true;
  }
  return !!val;
}

// Build display string for coupling installation work formula
function buildCouplingWorkFormulaDisplay(formula, tierData, calculatedVolume) {
  const clean = (formula || 'КОЛИЧЕСТВО').trim();
  const rawCount = tierData.count || 0;
  const upper = clean.toUpperCase();

  if (upper === 'КОЛИЧЕСТВО' || upper === 'КОЛИЧЕСТВО_МУФТ') {
    if (tierData.couplings && tierData.couplings.length > 1) {
      return normalizeFormulaMathOperators(tierData.couplings.map(c => `${c.count} шт`).join(' + ') + ` = ${rawCount} шт`);
    }
    return `${rawCount} шт`;
  }

  let disp = clean.replace(/,/g, '.').replace(/\*/g, ' * ');
  disp = disp.replace(/КОЛИЧЕСТВО_МУФТ/gi, `${rawCount} шт`)
             .replace(/КОЛИЧЕСТВО/gi, `${rawCount} шт`)
             .replace(/ДЛИНА/gi, `${rawCount} шт`);
  if (calculatedVolume !== undefined && calculatedVolume !== rawCount) {
    disp += ` = ${calculatedVolume} шт`;
  }
  return normalizeFormulaMathOperators(disp);
}

// Parse condition for cable count in a trench segment
// Supports "Условие": "кабелей > 4", "более 4 кабелей", "свыше 4", ">= 5", "до 4 кабелей", "от 2 до 4 кабелей"
// (and group key in object structure e.g. "более 4 кабелей")
function parseCableCountCondition(work) {
  if (!work || typeof work !== 'object') {
    return { hasCondition: false, minCables: null, maxCables: null, description: '' };
  }

  const condText = [
    work["Условие"],
    work["condition"],
    work._tierKey
  ].filter(Boolean).map(String).join(' ').trim();

  if (!condText) {
    return { hasCondition: false, minCables: null, maxCables: null, description: '' };
  }

  let minCables = null;
  let maxCables = null;

  // Range: "от 2 до 4 кабелей"
  const mRange = condText.match(/от\s*(\d+)\s*до\s*(\d+)\s*(?:кабел|каб|\b)/i);
  if (mRange) {
    minCables = parseInt(mRange[1], 10);
    maxCables = parseInt(mRange[2], 10);
  } else {
    // Greater than: "> 4", "кабелей > 4", "более 4 кабелей", "свыше 4"
    const mGt = condText.match(/(?:кабелей|кабеля|каб\.?|\b)\s*(?:более|свыше|>)\s*(\d+)/i) ||
                condText.match(/(?:более|свыше|>)\s*(\d+)\s*(?:кабелей|кабеля|каб\.?|\b)/i);
    if (mGt) {
      minCables = parseInt(mGt[1], 10) + 1;
    }

    // Greater or equal: ">= 5", "кабелей >= 5", "от 5 кабелей"
    const mGte = condText.match(/(?:кабелей|кабеля|каб\.?|\b)\s*(?:>=|от)\s*(\d+)/i) ||
                 condText.match(/(?:>=|от)\s*(\d+)\s*(?:кабелей|кабеля|каб\.?|\b)/i);
    if (mGte && !mGt) {
      minCables = parseInt(mGte[1], 10);
    }

    // Less or equal / up to: "<= 4", "до 4 кабелей", "не более 4"
    const mLte = condText.match(/(?:кабелей|кабеля|каб\.?|\b)\s*(?:до|не более|<=)\s*(\d+)/i) ||
                 condText.match(/(?:до|не более|<=)\s*(\d+)\s*(?:кабелей|кабеля|каб\.?|\b)/i);
    if (mLte) {
      maxCables = parseInt(mLte[1], 10);
    }

    // Less than: "< 5", "менее 5 кабелей"
    const mLt = condText.match(/(?:кабелей|кабеля|каб\.?|\b)\s*(?:менее|<)\s*(\d+)/i) ||
                condText.match(/(?:менее|<)\s*(\d+)\s*(?:кабелей|кабеля|каб\.?|\b)/i);
    if (mLt && !mLte) {
      maxCables = parseInt(mLt[1], 10) - 1;
    }
  }

  const hasCondition = (minCables !== null) || (maxCables !== null);
  let desc = '';
  if (hasCondition) {
    if (work["Условие"]) {
      desc = String(work["Условие"]);
    } else if (minCables !== null && maxCables !== null) {
      desc = `от ${minCables} до ${maxCables} каб.`;
    } else if (minCables !== null) {
      desc = `кабелей > ${minCables - 1}`;
    } else if (maxCables !== null) {
      desc = `до ${maxCables} каб.`;
    }
  }

  return {
    hasCondition,
    minCables,
    maxCables,
    description: desc
  };
}

// Parse and normalize rule's "Работы" object structure:
// "Работы": { "1": [...], "2": [...], "3": [...], "оптический": [...] }
function parseRuleWorksAndMaterials(rule) {
  if (!rule || typeof rule !== 'object') {
    return { optical: null, tiers: [], allItems: [], isObjectStructure: false, rawObj: {} };
  }

  const wmObj = rule["Работы"] || rule["Работы и материалы"] || {};
  if (!wmObj || typeof wmObj !== 'object' || Array.isArray(wmObj)) {
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
        threshold = numKey;
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

  return { optical, tiers, allItems, isObjectStructure: true, rawObj: wmObj };
}

// Helper to extract all sections from rules object (where top-level keys are section names)
function getRulesSections(rulesData) {
  if (!rulesData || typeof rulesData !== 'object' || Array.isArray(rulesData)) return [];
  const sections = [];
  for (const [key, val] of Object.entries(rulesData)) {
    if (key === "Настройки" || key === "Оборудование" || key === "Справочник кабелей" || key === "Справочник муфт") continue;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const rulesList = Object.entries(val).map(([ruleName, ruleVal]) => ({
        "Название": ruleName,
        ...(ruleVal && typeof ruleVal === 'object' ? ruleVal : {})
      }));
      sections.push({ name: key, rawKey: key, rules: rulesList });
    }
  }
  return sections;
}

// Trench calculation rules - trenches are calculated from the "Строительные работы" section
function getTrenchRules(rulesData) {
  if (!rulesData || typeof rulesData !== 'object' || Array.isArray(rulesData)) {
    return { sectionName: 'Строительные работы', rules: [] };
  }
  const val = rulesData["Строительные работы"];
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const rulesList = Object.entries(val).map(([ruleName, ruleVal]) => ({
      "Название": ruleName,
      ...(ruleVal && typeof ruleVal === 'object' ? ruleVal : {})
    }));
    return { sectionName: 'Строительные работы', rules: rulesList };
  }
  return { sectionName: 'Строительные работы', rules: [] };
}

// Cable calculation rules - cables are calculated from the "Монтажные работы" section
function getCableRules(rulesData) {
  if (!rulesData || typeof rulesData !== 'object' || Array.isArray(rulesData)) {
    return { sectionName: 'Монтажные работы', rules: [] };
  }
  const val = rulesData["Монтажные работы"];
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const rulesList = Object.entries(val).map(([ruleName, ruleVal]) => ({
      "Название": ruleName,
      ...(ruleVal && typeof ruleVal === 'object' ? ruleVal : {})
    }));
    return { sectionName: 'Монтажные работы', rules: rulesList };
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

// Parse cable pair type and trailing symbol (specification/code.js logic)
// 1. Symbol is strictly at the end of the type
// 2. Supports both "х2" and "х2х0,9" / "х2х0.9" formats
// 3. Properly handles parenthesized reserve/dedicated cores like (6) in "16х2(6)**" -> pairKey: "16х2", symbol: "**"
function parseCableTypeAndSymbol(str) {
  if (!str) return { pairKey: '', symbol: '' };
  let s = String(str).trim().replace(/\s+/g, '').replace(/x/g, 'х');

  // Strip parenthesized reserve/dedicated cores like (6), (2), (4) before trailing symbols or at end of string
  s = s.replace(/\(\d+\)(?=(?:\s*(?:[*#&^~!Δ§†‡№]|\\U\+[0-9a-fA-F]+))*$)/gi, '');

  // Match pattern: digits + "х2" + optional conductor diameter "х0,9" / "х1,0" / "х0.9" + trailing symbol
  const match = s.match(/^(\d+х2)(?:\(\d+\))?(?:х\d+(?:[,\.]\d+)?)?(.*)$/i);
  if (match) {
    let sym = match[2] || '';
    if (sym === 'Δ' || sym === 'U+0394') sym = '\\U+0394';
    return {
      pairKey: match[1],
      symbol: sym
    };
  }

  // Generic match if string has prefixes (e.g. cable tag or number like "490-16х2(6)**")
  const genericMatch = s.match(/(\d+х2)(?:\(\d+\))?(?:х\d+(?:[,\.]\d+)?)?(.*)$/i);
  if (genericMatch) {
    let sym = genericMatch[2] || '';
    if (sym === 'Δ' || sym === 'U+0394') sym = '\\U+0394';
    return {
      pairKey: genericMatch[1],
      symbol: sym
    };
  }

  return { pairKey: '', symbol: s };
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
        if (normStr === normKey || rawNormStr === normKey) {
          return {
            brand: secVal["Название"] || 'Оптический кабель',
            key: sKey,
            weight: sVal["Вес"] || 0.28,
            category: sVal["Категория"] || secVal["Категория"] || 'Оптический кабель',
            isOptical: true,
            fullDescription: sVal["Полное описание"] || `Кабель связи оптический ${str}`,
            buildingLength: sVal["Строительная длина"] || 2000,
            coupling: sVal["Муфта"] || 'МТОК-А1/216-1Т3-44',
            showFormula: shouldShowFormula(sVal),
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
          showFormula: shouldShowFormula(sVal),
          foundInCatalog: true
        };
      }
    }
  }

  // 3. Paired cable type and trailing symbol analysis (specification/code.js architecture)
  // Try lookup with normalized string first (removes reserve core notes like (6)), then fallback to raw str
  let parsed = parseCableTypeAndSymbol(cleanStr);
  let pairKey = parsed.pairKey;
  let symbol = parsed.symbol;

  let entry = null;
  let brandName = '';

  if (cat[symbol] && typeof cat[symbol] === 'object' && cat[symbol]["Тип"]) {
    brandName = cat[symbol]["Название"] || '';
    if (pairKey && cat[symbol]["Тип"][pairKey]) {
      entry = cat[symbol]["Тип"][pairKey];
    }
  }

  // Fallback to raw str if not found
  if (!entry && cleanStr !== str) {
    parsed = parseCableTypeAndSymbol(str);
    pairKey = parsed.pairKey;
    symbol = parsed.symbol;
    if (cat[symbol] && typeof cat[symbol] === 'object' && cat[symbol]["Тип"]) {
      brandName = cat[symbol]["Название"] || '';
      if (pairKey && cat[symbol]["Тип"][pairKey]) {
        entry = cat[symbol]["Тип"][pairKey];
      }
    }
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
      showFormula: shouldShowFormula(entry),
      foundInCatalog: true
    };
  }

  // Fallback for cables not found in catalog (does not block calculations, clearly alerts the user)
  const pairNum = pairKey ? parseInt(pairKey, 10) : 0;
  const fallbackWeight = pairNum > 0 ? Math.min(3.0, Math.max(0.15, pairNum * 0.035)) : 0.35;
  const fallbackDesc = str.toLowerCase().startsWith('кабель') ? str : `Кабель ${str}`;
  return {
    brand: symbol ? `Кабель (${symbol})` : 'Кабель',
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
      maxCores: 0,
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
      maxCores: maxCores || 0,
      unit: entry["Единицы измерения"] || entry.unit || 'шт',
      showFormula: shouldShowFormula(entry),
      foundInCatalog: true
    };
  }

  // Normalized key match
  const normStr = str.toLowerCase().replace(/[\s\-_]+/g, '');
  for (const [k, v] of Object.entries(cat)) {
    if (!v || typeof v !== 'object') continue;
    const normK = k.toLowerCase().replace(/[\s\-_]+/g, '');
    if (normStr === normK) {
      const maxCores = Number(v["МаксЖил"] || v["Максимальное количество жил"] || v["Количество жил"] || v.maxCores) || parseMaxCoresFromString(k);
      return {
        type: k,
        fullName: v["Полное наименование"] || v["Наименование"] || v.name || k,
        maxCores: maxCores || 0,
        unit: v["Единицы измерения"] || v.unit || 'шт',
        showFormula: shouldShowFormula(v),
        foundInCatalog: true
      };
    }
  }

  // Fallback if not found in coupling catalog
  const parsedCores = parseMaxCoresFromString(str);
  return {
    type: str,
    fullName: str.startsWith('Муфта') ? str : `Муфта кабельная соединительная ${str}`,
    maxCores: parsedCores || 0,
    unit: 'шт',
    showFormula: true,
    foundInCatalog: false
  };
}

// Extract all numeric coupling installation tiers dynamically from works_rules.json (e.g. [12, 27, 48, 61, 78...])
function getCouplingRuleTiers(rulesData) {
  const rules = rulesData || currentWorksRules || cachedDefaultRules;
  const cableRules = getCableRules(rules);
  const tiersSet = new Set();

  for (const r of (cableRules && cableRules.rules ? cableRules.rules : [])) {
    const rName = (r["Название"] || r.name || '').toLowerCase();
    if (rName.includes('муфт')) {
      const wm = r["Работы"] || r["Работы и материалы"] || {};
      if (wm && typeof wm === 'object' && !Array.isArray(wm)) {
        Object.keys(wm).forEach(k => {
          const num = parseFloat(k.trim().replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            tiersSet.add(num);
          }
        });
      }
    }
  }

  const sortedTiers = Array.from(tiersSet).sort((a, b) => a - b);
  return sortedTiers.length > 0 ? sortedTiers : [12, 27, 48, 61];
}

// Determine coupling installation tier dynamically from rules (e.g. 12, 27, 48, 61, 78...)
function getCouplingInstallationTier(maxCores, rulesData) {
  const cores = Number(maxCores) || 0;
  const availableTiers = getCouplingRuleTiers(rulesData);
  
  for (const t of availableTiers) {
    if (cores <= t) return t;
  }
  return availableTiers[availableTiers.length - 1];
}

// Get coupling installation works array from rules or fallback
function getCouplingInstallationWorkItems(tier, rulesData) {
  const cableRules = getCableRules(rulesData || currentWorksRules);
  const foundItems = [];
  for (const r of cableRules.rules) {
    const rName = (r["Название"] || r.name || '').toLowerCase();
    if (rName.includes('муфт')) {
      const wm = r["Работы"] || r["Работы и материалы"] || {};
      const tierKey = String(tier);
      let tierItems = null;
      if (wm && typeof wm === 'object' && wm[tierKey] !== undefined) {
        tierItems = Array.isArray(wm[tierKey]) ? wm[tierKey] : [wm[tierKey]];
      }

      if (tierItems && tierItems.length > 0) {
        tierItems.forEach(it => {
          if (!it || typeof it !== 'object') return;
          foundItems.push({
            name: it["Наименование"] || it.name || '',
            unit: it["Единицы измерения"] || it.unit || 'шт',
            type: (it["Тип"] || it.type || 'работа').toLowerCase(),
            formula: it["Формула"] || it.formula || 'КОЛИЧЕСТВО',
            maxCores: it["МаксЖил"] || it["Количество жил"] || it.maxCores || tier,
            showFormula: shouldShowFormula(it),
            rawItem: it
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
      maxCores: tier,
      showFormula: true,
      rawItem: null
    });
  }
  return foundItems;
}

// Calculate active couplings summary from active cables and catalog
function getActiveCouplingsSummary(rulesData) {
  const rules = rulesData || currentWorksRules || cachedDefaultRules;
  const cableCatalog = getCableCatalog(rules);
  const couplingCatalog = getCouplingCatalog(rules);

  // Extract individual cable runs directly from currentData
  const cableRows = [];
  if (currentData && Array.isArray(currentData.cables)) {
    currentData.cables.forEach(c => {
      if (!c) return;
      const rawType = c.type || '';
      const normType = normalizeCableType(rawType);
      cableRows.push({
        type: normType,
        rawType: rawType,
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
    // Couplings needed: 0 if length <= buildingLength; otherwise div(length - 1, buildingLength)
    const count = (buildLen > 0 && c.length > buildLen) ? Math.floor((c.length - 1) / buildLen) : 0;
    if (count > 0) {
      totalCouplingsCount += count;
      const cTypeKey = cMeta.coupling ? cMeta.coupling.trim() : '';
      if (!cTypeKey) {
        // Missing coupling configuration for cable
        missingCouplings.push({
          cable: c.cable || c.type,
          cableType: c.type,
          rawCableType: c.rawType,
          length: c.length,
          buildingLength: buildLen,
          couplingsNeeded: count,
          reason: `В справочнике кабелей не указан тип муфты (длина ${Math.round(c.length)} м > стр. длины ${buildLen} м, требуется ${count} шт.)`
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
          rawType: c.rawType,
          length: c.length,
          count: count
        });
      }
    }
  });

  const availableTiers = getCouplingRuleTiers(rules);
  const tiers = {};
  availableTiers.forEach(t => {
    tiers[t] = {
      tier: t,
      titleTier: `до ${t} жил`,
      count: 0,
      couplings: []
    };
  });

  couplingsMap.forEach((cData, cTypeKey) => {
    const cInfo = lookupCouplingInfo(cTypeKey, couplingCatalog);
    if (!cInfo.foundInCatalog) {
      missingInCatalog.push({
        couplingType: cTypeKey,
        count: cData.count,
        usedInCables: Array.from(cData.cableTypes),
        reason: `Муфта «${cTypeKey}» отсутствует в «Справочнике муфт» (используется для кабелей: ${Array.from(cData.cableTypes).join(', ')}, ${cData.count} шт.)`
      });
    }
    const tier = getCouplingInstallationTier(cInfo.maxCores, rules);
    if (!tiers[tier]) {
      tiers[tier] = {
        tier: tier,
        titleTier: `до ${tier} жил`,
        count: 0,
        couplings: []
      };
    }
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
      showFormula: cInfo.showFormula,
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
// Handles "до 1", "до: 1", "до 1,5", "до: 1,5", "до 1.5 кг", "массой 1 м, кг; до 1,5"
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
      numProp = n;
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
        numFromName = rawVal;
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
let currentWorksRules = { "Строительные работы": {}, "Монтажные работы": {}, "Оборудование": {} };

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

  const calculateBtn = document.getElementById('calculate');
  if (calculateBtn) {
    calculateBtn.addEventListener('click', calculateVolumes);
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

  const openSettingsBtn = document.getElementById('openSettingsBtn');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => openWorksRulesModal('settings'));
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

  const menuSettings = document.getElementById('menuSettings');
  if (menuSettings) {
    menuSettings.addEventListener('click', (e) => {
      e.preventDefault();
      openWorksRulesModal('settings');
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

/**
 * Считывает файл как текст с надежным автоопределением кодировки (UTF-8, Windows-1251 / CP1251).
 * Автоматически корректно распознает русскоязычные файлы JSON, сформированные в кодировке Windows-1251.
 * @param {File|Blob} file 
 * @returns {Promise<string>}
 */
function readFileAsTextWithEncoding(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Файл не задан'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.onload = (event) => {
      try {
        const buffer = event.target.result;
        const uint8 = new Uint8Array(buffer);

        // 1. Проверка BOM UTF-8 (EF BB BF)
        if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
          const text = new TextDecoder('utf-8').decode(uint8.subarray(3));
          return resolve(text.replace(/^\uFEFF/, '').trim());
        }

        // 2. Проверка BOM UTF-16 LE / BE
        if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
          const text = new TextDecoder('utf-16le').decode(uint8.subarray(2));
          return resolve(text.replace(/^\uFEFF/, '').trim());
        }
        if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
          const text = new TextDecoder('utf-16be').decode(uint8.subarray(2));
          return resolve(text.replace(/^\uFEFF/, '').trim());
        }

        // 3. Пытаемся строго декодировать через UTF-8 (fatal: true)
        let utf8Text = null;
        let utf8Valid = false;
        try {
          utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
          utf8Valid = true;
        } catch (e) {
          utf8Valid = false;
        }

        // Если это валидный UTF-8, проверим, парсится ли как валидный JSON
        if (utf8Valid && utf8Text) {
          try {
            JSON.parse(utf8Text.replace(/^\uFEFF/, '').trim());
            return resolve(utf8Text.replace(/^\uFEFF/, '').trim());
          } catch (e) {
            // Если не JSON, всё равно может быть текстом UTF-8
          }
        }

        // 4. Пробуем декодировать как Windows-1251 (CP1251)
        let winText = null;
        try {
          const winDecoder = new TextDecoder('windows-1251');
          winText = winDecoder.decode(uint8);
        } catch (e) {
          try {
            const cpDecoder = new TextDecoder('cp1251');
            winText = cpDecoder.decode(uint8);
          } catch (err) {}
        }

        if (winText) {
          try {
            JSON.parse(winText.replace(/^\uFEFF/, '').trim());
            return resolve(winText.replace(/^\uFEFF/, '').trim());
          } catch (e) {}
        }

        // Если UTF-8 не прошел проверку байтов, отдаем Windows-1251
        if (!utf8Valid && winText) {
          return resolve(winText.replace(/^\uFEFF/, '').trim());
        }

        if (utf8Text) {
          return resolve(utf8Text.replace(/^\uFEFF/, '').trim());
        }

        if (winText) {
          return resolve(winText.replace(/^\uFEFF/, '').trim());
        }

        // Резервный вариант
        const fallback = new TextDecoder('utf-8').decode(uint8);
        return resolve(fallback.replace(/^\uFEFF/, '').trim());
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function processFile(file) {
  const fileName = file.name;

  if (fileName.toLowerCase().endsWith('.json')) {
    try {
      const fileText = await readFileAsTextWithEncoding(file);
      const json = JSON.parse(fileText);

      // Check if uploaded JSON is a works rules / specifications file rather than cable schedule data
      const isRulesFile = Boolean(
        json && typeof json === 'object' && !Array.isArray(json) &&
        (json["Строительные работы"] || json["Монтажные работы"] || json["Справочник кабелей"] || json["Справочник муфт"]) &&
        !json.cables && !json.routingTypeBlocks
      );

      if (isRulesFile) {
        currentWorksRules = json;
        setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
        validateWorksJsonInput();
        renderRulesModalContent();
        const sections = getRulesSections(currentWorksRules);
        let totalWays = 0;
        sections.forEach(s => totalWays += s.rules.length);
        showToast(`Сметные нормы успешно загружены из «${fileName}» (${totalWays} способов в ${sections.length} разд.). Выполнен автоматический перерасчет работ.`, 'success', 'Правила обновлены');
        if (currentData) {
          calculateVolumes({ refreshRawData: true });
        }
        return;
      }

      currentFileName = fileName;
      currentData = json;
      renderProcessedData(json, fileName);
      toggleRawColumnCollapse(false);
      calculateVolumes({ refreshRawData: false });
      showToast(`Файл "${fileName}" успешно загружен и рассчитан`, 'success', 'Успешно');
    } catch (err) {
      showToast(`Ошибка обработки JSON: ${err.message}`, 'error', 'Ошибка');
    }
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
      calculateVolumes({ refreshRawData: false });
      showToast('Пример "data_export.json" успешно загружен и рассчитан', 'success', 'Загружено');
    })
    .catch(err => {
      showToast(`Не удалось загрузить data_export.json: ${err.message}`, 'error', 'Ошибка');
    });
}

// Render data inside the "Исходные данные" accordion
function renderProcessedData(data, fileName, options = {}) {
  const container = document.getElementById('processedData');
  if (!container) return;

  const preserveState = Boolean(options && options.preserveState);

  // Preserve open/collapse states and filter value if requested
  const savedCollapseStates = {};
  if (preserveState) {
    document.querySelectorAll('#processedData .accordion-collapse').forEach(el => {
      if (el.id) {
        savedCollapseStates[el.id] = el.classList.contains('show');
      }
    });
  }
  const searchInput = document.getElementById('tableFilterInput');
  const savedFilter = (preserveState && searchInput && searchInput.value) ? searchInput.value : '';

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

  const equipmentList = (data.TracksideEquipment && Array.isArray(data.TracksideEquipment))
    ? data.TracksideEquipment
    : (data.tracksideEquipment && Array.isArray(data.tracksideEquipment))
    ? data.tracksideEquipment
    : (data.equipment && Array.isArray(data.equipment))
    ? data.equipment
    : (data.Equipment && Array.isArray(data.Equipment))
    ? data.Equipment
    : (data['Оборудование'] && Array.isArray(data['Оборудование']))
    ? data['Оборудование']
    : (data['Напольное оборудование'] && Array.isArray(data['Напольное оборудование']))
    ? data['Напольное оборудование']
    : [];

  let totalEquipmentCount = 0;
  if (equipmentList.length > 0) {
    totalEquipmentCount = equipmentList.reduce((acc, eq) => acc + (Number(eq.countEquipment || eq.count || eq.qty || (eq.handles ? eq.handles.length : 1)) || 1), 0);
  }

  // Activate header controls toolbar and reset button
  const dataToolbar = document.getElementById('dataToolbarControls');
  if (dataToolbar) dataToolbar.classList.remove('d-none');
  const resetBtn = document.getElementById('resetDataBtn');
  if (resetBtn) resetBtn.classList.remove('d-none');
  if (!preserveState && searchInput) {
    searchInput.value = '';
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    if (clearFilterBtn) clearFilterBtn.classList.add('d-none');
    const badge = document.getElementById('filteredMatchBadge');
    if (badge) badge.classList.add('d-none');
  }

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

  // 3. Equipment section (after trenches)
  if (equipmentList.length > 0) {
    const equipmentAcc = createEquipmentAccordion(equipmentList, totalEquipmentCount);
    container.appendChild(equipmentAcc);
  }

  // 4. Generic JSON arrays / objects
  if (!data.cables && !data.routingTypeBlocks && equipmentList.length === 0) {
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

  // Restore accordion collapse state and search filter if requested
  if (preserveState) {
    Object.entries(savedCollapseStates).forEach(([id, isShow]) => {
      const el = document.getElementById(id);
      const btn = document.querySelector(`[data-bs-target="#${id}"]`);
      if (el) {
        if (isShow) {
          el.classList.add('show');
          if (btn) {
            btn.classList.remove('collapsed');
            btn.setAttribute('aria-expanded', 'true');
          }
        } else {
          el.classList.remove('show');
          if (btn) {
            btn.classList.add('collapsed');
            btn.setAttribute('aria-expanded', 'false');
          }
        }
      }
    });
    if (savedFilter && searchInput) {
      searchInput.value = savedFilter;
      filterTableRows(savedFilter);
    }
  }

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
  const catalog = getCableCatalog(currentWorksRules);

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
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  cables.forEach((c, idx) => {
    if (!c) return;
    const row = document.createElement('tr');

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
    const info = lookupCableInfo(effectiveType, catalog);
    const cableLen = Number(c.length) || 0;
    const buildLen = Number(info.buildingLength) || 0;
    // Couplings needed: 0 if length <= buildingLength; otherwise div(length - 1, buildingLength)
    const couplingCount = (buildLen > 0 && cableLen > buildLen) ? Math.floor((cableLen - 1) / buildLen) : 0;
    totalCouplingsCount += couplingCount;

    const couplingName = (info.coupling || '').trim();
    const hasCouplingInfo = Boolean(couplingName && couplingName.toLowerCase() !== 'уточнить' && couplingName.toLowerCase() !== '-');

    if (!hasCouplingInfo && effectiveType.trim() && couplingCount > 0) {
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
      <td class="fw-medium cell-wrap small">${escapeHtml(c.cable || '')}</td>
      <td class="text-end font-monospace fw-semibold small">${c.length ?? 0}</td>
      <td class="cell-wrap small"${typeTitleAttr}>${escapeHtml(rawType)}</td>
      <td class="cell-wrap">${routingHtml}</td>
      <td class="text-center align-middle">${couplingHtml}</td>
      <td class="text-center align-middle">${mismatchIcon}</td>
    `;

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
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  blocks.forEach((b, idx) => {
    if (!b) return;
    const row = document.createElement('tr');

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

    const isPipeType = b.type && b.type.toLowerCase().includes('труб');
    const pCount = b.countPipes !== undefined ? Number(b.countPipes) : (isPipeType ? 1 : 0);
    const pLen = b.lengthPipes !== undefined ? Number(b.lengthPipes) : (isPipeType ? (Number(b.length) || 0) : 0);

    let typeBadge = '';
    if (pCount > 0 && pLen > 0) {
      typeBadge += `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle ms-1" style="font-size: 0.68rem; font-weight: 600;" title="Трубы: ${pCount} шт. * ${pLen} м"><i class='bx bx-cylinder me-0_5'></i>${pCount}шт*${pLen}м</span>`;
    } else if (pCount > 0) {
      typeBadge += `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle ms-1" style="font-size: 0.68rem; font-weight: 600;" title="Трубы: ${pCount} шт."><i class='bx bx-cylinder me-0_5'></i>${pCount}шт</span>`;
    } else if (isPipeType) {
      typeBadge += `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle ms-1" style="font-size: 0.68rem; font-weight: 600;" title="Трубы: 1 шт. * ${b.length || 0} м"><i class='bx bx-cylinder me-0_5'></i>1шт*${b.length || 0}м</span>`;
    }

    if (b.countIntersections) {
      typeBadge += `<span class="badge bg-secondary-subtle text-secondary-emphasis border ms-1" style="font-size: 0.68rem;" title="Количество пересечений: ${b.countIntersections}">${b.countIntersections} перес.</span>`;
    }

    row.innerHTML = `
      <td class="text-muted small text-center">${idx + 1}</td>
      <td class="font-monospace text-muted small cell-wrap">${escapeHtml(b.handle || '')}</td>
      <td class="fw-bold cell-wrap">
        <span class="block-type-name">${escapeHtml(b.type || '')}</span>${typeBadge}
      </td>
      <td class="text-end font-monospace fw-semibold">${b.length ?? 0}</td>
      <td class="text-center font-monospace">${b.cablesCount ?? 0}</td>
      <td class="cell-wrap">${containedHtml}</td>
    `;

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

function createEquipmentAccordion(equipmentList, totalCount) {
  const accItem = document.createElement('div');
  accItem.className = 'accordion-item border rounded-3 mb-3 shadow-none overflow-hidden';

  const headerId = 'headingEquipment';
  const collapseId = 'collapseEquipment';

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-responsive custom-table-scroll';

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover table-striped mb-0 text-start align-middle';
  table.id = 'tableEquipment';

  table.innerHTML = `
    <thead class="table-sticky-header">
      <tr>
        <th style="width: 35px;" class="text-center">№</th>
        <th style="min-width: 140px;">Марка оборудования</th>
        <th style="min-width: 140px;">Способ установки</th>
        <th style="width: 90px;" class="text-center">Кол-во, шт</th>
        <th style="min-width: 130px;">handle блоков</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  equipmentList.forEach((eq, idx) => {
    if (!eq) return;
    const row = document.createElement('tr');

    const mark = (eq.EquipmentType || eq.equipmentType || eq.mark || eq.marka || eq.type || eq['Марка'] || 'Без марки').trim();
    const method = (eq.InstallationMethod || eq.installationMethod || eq.method || eq['Способ установки'] || 'Не указано').trim();
    const count = Number(eq.countEquipment || eq.count || eq.qty || (eq.handles ? eq.handles.length : 1)) || 1;
    const handles = Array.isArray(eq.handles) ? eq.handles : (eq.handles ? [eq.handles] : (eq.handle ? [eq.handle] : []));

    let handlesHtml = '<span class="text-muted">-</span>';
    if (handles.length > 0) {
      handlesHtml = `
        <div class="d-flex flex-wrap gap-1 align-items-center py-0_5 cell-wrap">
          ${handles.map(h => `<span class="badge bg-body text-body border font-monospace" style="font-size: 0.72rem;">${escapeHtml(String(h))}</span>`).join('')}
        </div>
      `;
    }

    const methodBadge = method.toLowerCase() !== 'не указано'
      ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace">${escapeHtml(method)}</span>`
      : `<span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace">${escapeHtml(method)}</span>`;

    row.innerHTML = `
      <td class="text-muted small text-center">${idx + 1}</td>
      <td class="fw-bold cell-wrap font-monospace">${escapeHtml(mark)}</td>
      <td class="cell-wrap">${methodBadge}</td>
      <td class="text-center font-monospace fw-semibold">${count}</td>
      <td class="cell-wrap">${handlesHtml}</td>
    `;

    tbody.appendChild(row);
  });

  tableWrapper.appendChild(table);

  accItem.innerHTML = `
    <h2 class="accordion-header" id="${headerId}">
      <button class="accordion-button collapsed py-2 px-3 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
        <div class="d-flex align-items-center justify-content-between w-100 me-2">
          <div class="d-flex align-items-center gap-2">
            <i class='bx bx-cube text-warning fs-4'></i>
            <span>Напольное оборудование</span>
          </div>
          <span class="badge bg-warning-subtle text-warning-emphasis border">${equipmentList.length} поз. / ${totalCount} шт.</span>
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
      rowHtml += `<td class="cell-wrap small">${escapeHtml(String(val ?? ''))}</td>`;
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
        <h4 class="mb-1 fw-bold fs-5">Загрузите файл с исходными данными проекта</h4>
        <p class="text-muted fs-sm mb-4 mx-auto" style="max-width: 480px;">
          Перетащите файл <code>.json</code> сюда либо нажмите кнопку для выбора на устройстве.
        </p>
        <div class="d-flex justify-content-center gap-2 flex-wrap">
          <label for="input" class="btn btn-primary px-3 mb-0 d-inline-flex align-items-center gap-2 shadow-sm" style="cursor: pointer;">
            <i class='bx bx-upload fs-5'></i>Загрузить свой файл (.json)
          </label>
          <button type="button" id="loadSampleBtn" class="btn btn-outline-secondary px-3 d-inline-flex align-items-center gap-2">
            <i class='bx bx-file fs-5'></i>Загрузить пример
          </button>
        </div>
      </div>
    `;
    const btn = container.querySelector('#loadSampleBtn');
    if (btn) btn.addEventListener('click', loadSampleData);
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

  // Hide equipment card and reset equipment badges and empty state
  const equipmentCard = document.getElementById('equipmentCard');
  if (equipmentCard) equipmentCard.classList.add('d-none');
  const equipmentBadgeTotal = document.getElementById('equipmentBadgeTotal');
  if (equipmentBadgeTotal) equipmentBadgeTotal.classList.add('d-none');
  const equipmentMissingBadge = document.getElementById('equipmentMissingBadge');
  if (equipmentMissingBadge) equipmentMissingBadge.classList.add('d-none');
  const resultEquipmentStatement = document.getElementById('resultEquipmentStatement');
  if (resultEquipmentStatement) {
    resultEquipmentStatement.innerHTML = `
      <div class="text-center py-4 py-md-5 text-muted">
        <i class='bx bx-cube fs-1 mb-2 text-secondary opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Сводка по оборудованию</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы сгруппировать оборудование по маркам и способам установки</p>
      </div>
    `;
  }

  // Clear cached calculation states
  window.lastCableWorksCalc = null;
  window.lastTrenchWorksCalc = null;
  window.lastEquipmentWorksCalc = null;

  // Reset file input element to allow re-selecting the same file
  const fileInput = document.getElementById('input');
  if (fileInput) fileInput.value = '';

  showToast('Исходные данные сброшены', 'info', 'Сброс');
}

/**
 * Нормализует марку/тип кабеля для ведомости объемов работ.
 * 
 * Правила:
 * 1. Оптические кабели связи: в марках вида «ОКБ-Н-Сп-4/2(2,0)Сп-16(2) "8кН"»:
 *    - «(2,0)» — конструктивный диаметр ЦСЭ в мм;
 *    - «16(2)» — часть номенклатуры оптического кабеля (не является запасными жилами);
 *    - «"8кН"» — маркировка допустимого растягивающего усилия (кН / kN).
 *    Для оптических кабелей марка сохраняется полностью: «ОКБ-Н-Сп-4/2(2,0)Сп-16(2) "8кН"».
 * 2. Электрические кабели (СЦБ, сигнализация, связь): кабели вида «4х2(2)» и «4х2(4)» — это один и тот же
 *    тип кабеля («4х2»), содержащий разное количество запасных жил в скобках. Запас жил отбрасывается.
 * 3. Буквенные индексы горючести/исполнения: «(А)» в «ВБШвнг(А)-LS» или «(A)» в «ТехноКИПКПнг(A)-HF»
 *    НЕ являются запасом жил/волокон и гарантированно сохраняются.
 */
function normalizeCableType(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') return typeStr || 'Без типа';
  const str = typeStr.trim();
  if (!str) return 'Без типа';

  // Оптические кабели (ОКБ, ОКЛ, ВОЛС, ДПС, марки с кН/kN, Сп- и т.д.):
  // Все скобки с цифрами являются частью заводской номенклатуры и сохраняются.
  const isOptical = /^(?:ОК|ВОЛС|ДП|ДТ|ТОС|ИКА|ЭКБ)/i.test(str) ||
                    /(?:кН|кн|kN|kn)/i.test(str) ||
                    /(?:Сп-|\/2\(|\(2,0\))/i.test(str);

  if (isOptical) {
    return str;
  }

  // Для электрических кабелей отбрасываем (целое число) запаса жил перед сносками чертежа (*, **, #, &, \U+..., Δ) или в конце строки
  const cleaned = str.replace(
    /\s*\(\d+\)(?=(?:\s*(?:[*#&^~!Δ§†‡№]|\\U\+[0-9a-fA-F]+))*$)/gi,
    ''
  ).trim();

  return cleaned || str || 'Без типа';
}

// Extract aggregated cable summary directly from currentData
function getActiveCableSummary() {
  const cableSummary = {};
  const grandRoutingSummary = {};
  let grandTotalCableLength = 0;
  let grandTotalCableCount = 0;

  if (currentData && Array.isArray(currentData.cables)) {
    currentData.cables.forEach(c => {
      if (!c) return;
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
        if (sum > 0) {
          hasRouting = true;
          cableSummary[type].routingTypes[trimmedName] = (cableSummary[type].routingTypes[trimmedName] || 0) + sum;
          grandRoutingSummary[trimmedName] = (grandRoutingSummary[trimmedName] || 0) + sum;
        }
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

// Extract equipment summary directly from currentData
function getActiveEquipmentSummary() {
  const summary = {};
  let totalCount = 0;
  let totalPositions = 0;
  const list = [];

  if (currentData) {
    const rawList = (currentData.TracksideEquipment && Array.isArray(currentData.TracksideEquipment))
      ? currentData.TracksideEquipment
      : (currentData.tracksideEquipment && Array.isArray(currentData.tracksideEquipment))
      ? currentData.tracksideEquipment
      : (currentData.equipment && Array.isArray(currentData.equipment))
      ? currentData.equipment
      : (currentData.Equipment && Array.isArray(currentData.Equipment))
      ? currentData.Equipment
      : (currentData['Оборудование'] && Array.isArray(currentData['Оборудование']))
      ? currentData['Оборудование']
      : (currentData['Напольное оборудование'] && Array.isArray(currentData['Напольное оборудование']))
      ? currentData['Напольное оборудование']
      : [];

    rawList.forEach(eq => {
      if (!eq) return;
      const mark = (eq.EquipmentType || eq.equipmentType || eq.mark || eq.marka || eq.type || eq['Марка'] || 'Без марки').trim();
      const method = (eq.InstallationMethod || eq.installationMethod || eq.method || eq['Способ установки'] || 'Не указано').trim();
      const count = Number(eq.countEquipment || eq.count || eq.qty || (eq.handles ? eq.handles.length : 1)) || 1;
      const handles = Array.isArray(eq.handles) ? eq.handles : (eq.handles ? [eq.handles] : (eq.handle ? [eq.handle] : []));

      const key = `${mark}____${method}`;
      if (!summary[key]) {
        summary[key] = { mark, method, count: 0, handles: [] };
        totalPositions++;
      }
      summary[key].count += count;
      totalCount += count;
      handles.forEach(h => {
        if (!summary[key].handles.includes(h)) summary[key].handles.push(h);
      });
      list.push({ mark, method, count, handles });
    });
  }

  return { summary, totalPositions, totalCount, list };
}

// Calculate Cable Volumes & Trench/Routing Volumes & Equipment
function calculateVolumes(options = {}) {
  if (!currentData) {
    showToast('Сначала загрузите исходные данные для расчета', 'error', 'Внимание');
    return;
  }

  // Refresh Column 1 (Исходные данные / rawCol) so that cable schedule couplings, badges and warnings reflect latest rules
  if (options && options.refreshRawData !== false && currentFileName && currentData) {
    renderProcessedData(currentData, currentFileName, { preserveState: true });
  }

  // 1. Calculate Cable summary with normalized cable types and routing types breakdown
  const cableData = getActiveCableSummary();
  const cableWorksCalc = renderCableResult(cableData.summary, cableData.totalCount, cableData.totalLength, cableData.grandRoutingSummary);

  // 2. Calculate Routing / Trench summary
  const routingSummary = {};
  let grandTotalRoutingLength = 0;
  let grandTotalRoutingCount = 0;

  if (currentData && Array.isArray(currentData.routingTypeBlocks)) {
    currentData.routingTypeBlocks.forEach(r => {
      if (!r) return;
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

  // 3. Calculate and render Equipment summary in Column 2
  let equipmentWorksCalc = { works: [], missingInRules: [] };
  try {
    const equipmentData = getActiveEquipmentSummary();
    equipmentWorksCalc = calculateWorksFromEquipment(equipmentData.summary, currentWorksRules);
    window.lastEquipmentWorksCalc = equipmentWorksCalc;
    renderEquipmentStatement(equipmentData, equipmentWorksCalc);
  } catch (err) {
    console.error('Ошибка при расчете оборудования:', err);
    window.lastEquipmentWorksCalc = equipmentWorksCalc;
  }

  // 4. Calculate and render Couplings summary
  const couplingsSummary = getActiveCouplingsSummary(currentWorksRules);
  renderCouplingsResult(couplingsSummary);

  // 5. Re-distribute works into their target sections for Column 3 UI cards with hierarchical aggregation
  // Any trench work with "Раздел": "Монтажные работы" goes to Installation Works
  // Any work with "Раздел": "Строительные работы" goes to Construction Works
  const rawAllWorks = [ ...(trenchWorksCalc.works || []), ...(cableWorksCalc.works || []), ...(equipmentWorksCalc.works || []) ];
  const allWorks = aggregateCalculatedWorks(rawAllWorks);
  const trenchWorks = allWorks.filter(w => {
    const s = (w.section || '').trim().toLowerCase();
    return s === 'строительные работы' || s.includes('строительн');
  });
  const cableWorks = allWorks.filter(w => !trenchWorks.includes(w));

  renderConstructionWorks({
    works: trenchWorks,
    missingInRules: trenchWorksCalc.missingInRules
  });
  renderInstallationWorks({
    works: cableWorks,
    missingInRules: cableWorksCalc.missingInRules,
    missingInCatalog: cableWorksCalc.missingInCatalog,
    missingEquipment: equipmentWorksCalc.missingInRules
  });

  // Check if any rules or data are missing in Cable works, Trench works, Equipment, or Couplings
  const cableMissingCount = (cableWorksCalc && cableWorksCalc.missingInRules) ? cableWorksCalc.missingInRules.length : 0;
  const trenchMissingCount = (trenchWorksCalc && trenchWorksCalc.missingInRules) ? trenchWorksCalc.missingInRules.length : 0;
  const equipmentMissingCount = (equipmentWorksCalc && equipmentWorksCalc.missingInRules) ? equipmentWorksCalc.missingInRules.length : 0;
  const couplingMissingCount = couplingsSummary.hasMissingInfo
    ? ((couplingsSummary.missingCouplings || []).length + (couplingsSummary.missingInCatalog || []).length)
    : 0;

  if (cableMissingCount > 0 || trenchMissingCount > 0 || equipmentMissingCount > 0 || couplingMissingCount > 0) {
    const missingItems = [];
    if (cableMissingCount > 0) {
      const names = cableWorksCalc.missingInRules.map(m => `«${m.type}»`).join(', ');
      missingItems.push(`по кабелям: ${names}`);
    }
    if (trenchMissingCount > 0) {
      const names = trenchWorksCalc.missingInRules.map(m => `«${m.type}»`).join(', ');
      missingItems.push(`по траншеям: ${names}`);
    }
    if (equipmentMissingCount > 0) {
      const names = equipmentWorksCalc.missingInRules.map(m => `«${m.type}»`).join(', ');
      missingItems.push(`по оборудованию: ${names}`);
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

  return cableWorksCalc;
}

function renderEquipmentStatement(equipmentData, equipmentWorksCalc) {
  const container = document.getElementById('resultEquipmentStatement');
  const card = document.getElementById('equipmentCard');
  if (!container) return;

  const totalPos = equipmentData.totalPositions || Object.keys(equipmentData.summary || {}).length;
  const totalCount = equipmentData.totalCount || 0;

  if (card) {
    if (totalPos > 0 || totalCount > 0) {
      card.classList.remove('d-none');
    } else {
      card.classList.add('d-none');
    }
  }

  const badgeTotal = document.getElementById('equipmentBadgeTotal');
  if (badgeTotal) {
    badgeTotal.textContent = `${totalPos} поз. / ${totalCount} шт`;
    badgeTotal.classList.remove('d-none');
  }

  const missingBadge = document.getElementById('equipmentMissingBadge');
  const hasMissing = equipmentWorksCalc && equipmentWorksCalc.missingInRules && equipmentWorksCalc.missingInRules.length > 0;
  if (missingBadge) {
    if (hasMissing) {
      missingBadge.classList.remove('d-none');
      missingBadge.textContent = `Неполные правила (${equipmentWorksCalc.missingInRules.length})`;
      missingBadge.onclick = () => openWorksRulesModal('editor');
    } else {
      missingBadge.classList.add('d-none');
    }
  }

  let missingAlertHtml = '';
  if (hasMissing) {
    const missingBadges = equipmentWorksCalc.missingInRules
      .map(m => `<span class="badge bg-body text-body border me-1 font-monospace" style="font-size: 0.75rem;">${escapeHtml(m.type || m.mark)} <span class="text-muted">(${m.count} шт)</span></span>`)
      .join(' ');
    missingAlertHtml = `
      <div class="alert alert-warning py-2 px-3 small d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap border-warning shadow-sm">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
          <div>
            <div class="fw-bold text-dark mb-1">
              Внимание: в разделе «Оборудование» отсутствуют сметные нормы для ${equipmentWorksCalc.missingInRules.length} позиций:
            </div>
            <div class="d-flex flex-wrap gap-1 align-items-center mb-1">
              ${missingBadges}
            </div>
            <div class="text-muted" style="font-size: 0.78rem; line-height: 1.35;">
              Для данного оборудования работы и материалы не определены в правилах и не вошли в итоговую ведомость (ВОР). Рекомендуется дополнить сметные нормы.
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-xs btn-outline-dark d-inline-flex align-items-center gap-1 py-1 px-2 mt-1 mt-md-0 flex-shrink-0" id="addMissingEquipmentRulesBtn" style="font-size: 0.75rem;" title="Добавить эти позиции в раздел «Оборудование» правил">
          <i class="bx bx-plus-circle"></i> Добавить в правила JSON
        </button>
      </div>
    `;
  }

  const entries = Object.entries(equipmentData.summary || {}).sort((a, b) => b[1].count - a[1].count);

  let rowsHtml = '';
  entries.forEach(([key, val], idx) => {
    const isMissing = equipmentWorksCalc && equipmentWorksCalc.missingInRules && equipmentWorksCalc.missingInRules.some(m =>
      (m.mark || '').toLowerCase() === (val.mark || '').toLowerCase() &&
      (m.method || 'Не указано').toLowerCase() === (val.method || 'Не указано').toLowerCase()
    );

    const statusBadge = isMissing
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" title="Отсутствуют сметные нормы в правилах JSON"><i class='bx bx-error-circle me-1'></i>нет в правилах</span>`
      : `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class='bx bx-check me-1'></i>в правилах</span>`;

    const methodBadge = val.method.toLowerCase() !== 'не указано'
      ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace">${escapeHtml(val.method)}</span>`
      : `<span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace">${escapeHtml(val.method)}</span>`;

    let handlesHtml = '<span class="text-muted small">-</span>';
    if (val.handles && val.handles.length > 0) {
      handlesHtml = `
        <div class="d-flex flex-wrap gap-1 align-items-center py-0_5 cell-wrap">
          ${val.handles.map(h => `<span class="badge bg-body text-body border font-monospace" style="font-size: 0.72rem;">${escapeHtml(String(h))}</span>`).join('')}
        </div>
      `;
    }

    rowsHtml += `
      <tr class="${isMissing ? 'table-warning-subtle' : ''}">
        <td class="text-muted small text-center">${idx + 1}</td>
        <td class="fw-bold cell-wrap font-monospace">${escapeHtml(val.mark)}</td>
        <td class="cell-wrap">${methodBadge}</td>
        <td class="text-center font-monospace fw-semibold">${val.count}</td>
        <td class="cell-wrap">${handlesHtml}</td>
        <td class="text-center text-nowrap">${statusBadge}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    ${missingAlertHtml}
    <div class="mb-2 d-flex flex-wrap gap-2">
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Всего оборудования</div>
        <div class="fw-bold text-primary font-monospace" style="font-size: 0.9rem;">${totalCount} <span class="fw-normal text-muted" style="font-size: 0.7rem;">шт</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center py-1 px-2">
        <div class="text-muted text-uppercase fw-semibold" style="font-size: 0.65rem;">Типоразмеров</div>
        <div class="fw-bold font-monospace" style="font-size: 0.9rem;">${totalPos} <span class="fw-normal text-muted" style="font-size: 0.7rem;">поз</span></div>
      </div>
    </div>

    <div class="table-responsive table-responsive-full rounded-2 border">
      <table class="table table-sm table-hover text-start align-middle mb-0">
        <thead class="table-sticky-header">
          <tr>
            <th style="width: 35px;" class="text-center">№</th>
            <th style="min-width: 130px;">Марка оборудования</th>
            <th style="min-width: 120px;">Способ установки</th>
            <th class="text-center" style="width: 70px;">Кол-во</th>
            <th style="min-width: 110px;">handle блоков</th>
            <th class="text-center" style="width: 100px;">Нормы</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">Нет данных об оборудовании</td></tr>'}
        </tbody>
        <tfoot class="table-sticky-footer fw-bold">
          <tr>
            <td colspan="3" class="ps-2">Итого:</td>
            <td class="text-center font-monospace text-primary">${totalCount}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  const addMissingBtn = document.getElementById('addMissingEquipmentRulesBtn');
  if (addMissingBtn) {
    addMissingBtn.addEventListener('click', () => {
      addMissingEquipmentToRules(equipmentWorksCalc.missingInRules);
    });
  }
}

function renderInstallationWorks(cableWorksCalc) {
  const container = document.getElementById('resultInstallationWorks');
  if (!container) return;

  const worksList = cableWorksCalc.works || [];
  const worksCount = worksList.filter(w => !w.isSubItem && (w.type === 'работа' || !w.type)).length;
  const materialsCount = worksList.filter(w => w.type === 'материал' || (w.isSubItem && w.type !== 'оборудование')).length;
  const equipmentCount = worksList.filter(w => w.type === 'оборудование').length;

  const badgeTotal = document.getElementById('installationBadgeTotal');
  if (badgeTotal) {
    const parts = [];
    if (worksCount > 0) parts.push(`${worksCount} раб.`);
    if (materialsCount > 0) parts.push(`${materialsCount} мат.`);
    if (equipmentCount > 0) parts.push(`${equipmentCount} оборуд.`);
    badgeTotal.textContent = parts.join(' / ') || `${worksList.length} поз.`;
    badgeTotal.classList.remove('d-none');
  }

  // Update header badges
  const cableMissingBadge = document.getElementById('cableMissingBadge');
  const installationMissingBadge = document.getElementById('installationMissingBadge');
  const hasMissingCable = cableWorksCalc.missingInRules && cableWorksCalc.missingInRules.length > 0;
  const hasMissingEquipment = cableWorksCalc.missingEquipment && cableWorksCalc.missingEquipment.length > 0;
  const hasMissing = hasMissingCable || hasMissingEquipment;
  const totalMissingCount = (hasMissingCable ? cableWorksCalc.missingInRules.length : 0) + (hasMissingEquipment ? cableWorksCalc.missingEquipment.length : 0);

  [cableMissingBadge, installationMissingBadge].forEach(b => {
    if (!b) return;
    if (hasMissing) {
      b.classList.remove('d-none');
      b.innerHTML = `Неполные правила (${totalMissingCount})`;
      b.onclick = () => openWorksRulesModal('editor');
    } else {
      b.classList.add('d-none');
    }
  });

  let missingCableAlertHtml = '';
  if (hasMissingCable) {
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

  let missingEquipmentAlertHtml = '';
  if (hasMissingEquipment) {
    const missingBadges = cableWorksCalc.missingEquipment
      .map(m => `<span class="badge bg-body text-body border me-1 font-monospace" style="font-size: 0.75rem;">${escapeHtml(m.type || m.mark)} <span class="text-muted">(${m.count} шт)</span></span>`)
      .join(' ');
    missingEquipmentAlertHtml = `
      <div class="alert alert-warning py-2 px-3 small d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap border-warning shadow-sm">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-error-circle fs-5 text-warning flex-shrink-0 mt-0_5"></i>
          <div>
            <div class="fw-bold text-dark mb-1">
              Внимание: в разделе «Оборудование» отсутствуют сметные нормы для ${cableWorksCalc.missingEquipment.length} позиций:
            </div>
            <div class="d-flex flex-wrap gap-1 align-items-center mb-1">
              ${missingBadges}
            </div>
            <div class="text-muted" style="font-size: 0.78rem; line-height: 1.35;">
              Для данного оборудования работы и материалы не определены в правилах и не вошли в ведомость (ВОР).
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-xs btn-outline-dark d-inline-flex align-items-center gap-1 py-1 px-2 mt-1 mt-md-0 flex-shrink-0" id="addMissingEquipmentRulesBtnInstallation" style="font-size: 0.75rem;" title="Добавить эти позиции в раздел «Оборудование»">
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
              Для данных кабелей применен приблизительный вес 1 м (от 0.15 до 3 кг/м в зависимости от ёмкости). Рекомендуется дополнить справочник точными паспортными данными.
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
  worksList.forEach((w, idx) => {
    const isSub = Boolean(w.isSubItem);
    const rawType = (w.type || '').trim().toLowerCase();
    const isEquip = rawType === 'оборудование';
    const isMat = rawType === 'материал' || (isSub && !isEquip);
    const rowClass = isSub ? 'table-row-material' : 'table-row-work';

    let tagBadge = '';
    if (isEquip) {
      tagBadge = `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;"><i class='bx bx-cube me-0_5'></i>оборудование</span>`;
    } else if (isMat) {
      tagBadge = `<span class="badge bg-secondary-subtle text-secondary-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal; color: #495057 !important;">материал</span>`;
    } else {
      tagBadge = `<span class="badge bg-primary-subtle text-primary border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;">работа</span>`;
    }

    const opticalBadge = w.isOptical
      ? `<span class="badge bg-info-subtle text-info-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;">ВОЛС</span>`
      : '';
    const catalogBadge = (w.foundInCatalog === false)
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;" title="Марка не найдена в справочнике кабелей"><i class="bx bx-error me-0_5"></i>нет в справочнике</span>`
      : '';
    const trenchBadge = w.trenchType
      ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border ms-1 py-0 px-1" style="font-size: 0.7rem; font-weight: normal; color: #495057 !important;" title="Рассчитано по ведомости траншей (${escapeHtml(w.trenchType)})"><i class='bx bx-git-commit me-0_5'></i>${escapeHtml(w.trenchType)}</span>`
      : '';
    const equipmentBadge = (w.equipmentType || w.mark) && !isEquip
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 py-0 px-1 font-monospace" style="font-size: 0.7rem;" title="Оборудование: ${escapeHtml(w.equipmentType || w.mark)}${w.method ? ` (${escapeHtml(w.method)})` : ''}"><i class='bx bx-cube me-0_5'></i>${escapeHtml(w.equipmentType || w.mark)}</span>`
      : '';

    const volumeStr = formatVolumeDisplay(w.volume, w.unit, currentWorksRules);

    const commentHtml = w.comment
      ? `<div class="text-muted small mt-0_5" style="font-size: 0.74rem; font-weight: normal;"><i class='bx bx-detail me-1 opacity-75'></i>${escapeHtml(w.comment)}</div>`
      : '';

    const numDisplay = w.itemNumber || `${idx + 1}`;
    const nameDisplay = isSub 
      ? `<span class="text-muted me-1 fw-bold">↳</span>${escapeHtml(w.name)}`
      : escapeHtml(w.name);

    cableWorksRowsHtml += `
      <tr class="${rowClass}">
        <td class="text-muted small text-center ${isSub ? 'ps-3 text-secondary' : 'fw-semibold'}">${numDisplay}</td>
        <td class="cell-wrap ${!isSub ? 'fw-semibold' : 'fw-medium ps-4 text-body-secondary'}">
          ${nameDisplay}${tagBadge}${opticalBadge}${catalogBadge}${trenchBadge}${equipmentBadge}
          ${commentHtml}
        </td>
        <td class="text-center small text-nowrap">${escapeHtml(w.unit)}</td>
        <td class="text-end font-monospace fw-bold text-success">${volumeStr}</td>
        <td class="small text-muted cell-wrap" style="max-width: 140px; font-size: 0.78rem;">${(w.showFormula !== false && w.formulaDisplay) ? escapeHtml(w.formulaDisplay) : '<span class="text-muted opacity-50">-</span>'}</td>
      </tr>
    `;
  });

  if (cableWorksCalc.works.length > 0) {
    container.innerHTML = `
      ${missingCableAlertHtml}
      ${missingEquipmentAlertHtml}
      ${missingCatalogAlertHtml}

      <div class="table-responsive rounded-2 border mb-0 custom-table-scroll" style="max-height: 420px;">
        <table class="table table-sm table-hover text-start align-middle mb-0">
          <thead class="table-sticky-header">
            <tr>
              <th style="width: 35px;" class="text-center">№</th>
              <th>Работы, материалы и оборудование</th>
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
      ${missingEquipmentAlertHtml}
      ${missingCatalogAlertHtml}
      <div class="text-center py-4 px-2 text-muted small bg-light rounded border">
        <i class="bx bx-info-circle fs-4 d-block mb-1 text-secondary"></i>
        <div>Работы не определены для текущих способов прокладки кабелей и оборудования.</div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="openWorksRulesModal('editor')">
          <i class="bx bx-edit"></i> Настроить раздел «Монтажные работы» и «Оборудование» в JSON
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

  const addMissingEquipmentRulesBtnInst = document.getElementById('addMissingEquipmentRulesBtnInstallation');
  if (addMissingEquipmentRulesBtnInst) {
    addMissingEquipmentRulesBtnInst.addEventListener('click', () => {
      addMissingEquipmentToRules(cableWorksCalc.missingEquipment);
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

  const worksList = worksCalc.works || [];
  const worksCount = worksList.filter(w => !w.isSubItem && (w.type === 'работа' || !w.type)).length;
  const materialsCount = worksList.filter(w => w.type === 'материал' || (w.isSubItem && w.type !== 'оборудование')).length;
  const equipmentCount = worksList.filter(w => w.type === 'оборудование').length;

  const badgeTotal = document.getElementById('constructionBadgeTotal');
  if (badgeTotal) {
    const parts = [];
    if (worksCount > 0) parts.push(`${worksCount} раб.`);
    if (materialsCount > 0) parts.push(`${materialsCount} мат.`);
    if (equipmentCount > 0) parts.push(`${equipmentCount} оборуд.`);
    badgeTotal.textContent = parts.join(' / ') || `${worksList.length} поз.`;
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
  worksList.forEach((w, idx) => {
    const isSub = Boolean(w.isSubItem);
    const rawType = (w.type || '').trim().toLowerCase();
    const isEquip = rawType === 'оборудование';
    const isMat = rawType === 'материал' || (isSub && !isEquip);
    const rowClass = isSub ? 'table-row-material' : 'table-row-work';

    let tagBadge = '';
    if (isEquip) {
      tagBadge = `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;"><i class='bx bx-cube me-0_5'></i>оборудование</span>`;
    } else if (isMat) {
      tagBadge = `<span class="badge bg-secondary-subtle text-secondary-emphasis border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal; color: #495057 !important;">материал</span>`;
    } else {
      tagBadge = `<span class="badge bg-primary-subtle text-primary border ms-1 py-0 px-1" style="font-size: 0.72rem; font-weight: normal;">работа</span>`;
    }

    const numDisplay = w.itemNumber || `${idx + 1}`;
    const nameDisplay = isSub 
      ? `<span class="text-muted me-1 fw-bold">↳</span>${escapeHtml(w.name)}`
      : escapeHtml(w.name);

    worksRowsHtml += `
      <tr class="${rowClass}">
        <td class="text-muted small text-center ${isSub ? 'ps-3 text-secondary' : 'fw-semibold'}">${numDisplay}</td>
        <td class="cell-wrap ${!isSub ? 'fw-semibold' : 'fw-medium ps-4 text-body-secondary'}">
          ${nameDisplay}${tagBadge}
        </td>
        <td class="text-center small text-nowrap">${escapeHtml(w.unit)}</td>
        <td class="text-end font-monospace fw-bold text-success">${formatVolumeDisplay(w.volume, w.unit, currentWorksRules)}</td>
        <td class="small text-muted cell-wrap" style="max-width: 140px; font-size: 0.78rem;">${(w.showFormula !== false && w.formulaDisplay) ? escapeHtml(w.formulaDisplay) : '<span class="text-muted opacity-50">-</span>'}</td>
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
              <th>Работы, материалы и оборудование</th>
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
  Object.keys(couplingsSummary.tiers || {}).map(Number).sort((a, b) => a - b).forEach(tier => {
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

// --------------------------------------------------------------------------
// WORKS RULES & CALCULATION FUNCTIONS
// --------------------------------------------------------------------------

let worksJsonCodeMirror = null;

// Get current JSON string from CodeMirror or fallback textarea
function getWorksJsonEditorValue() {
  if (worksJsonCodeMirror) {
    return worksJsonCodeMirror.getValue();
  }
  const textarea = document.getElementById('worksJsonEditorTextarea');
  return textarea ? textarea.value : '';
}

// Set JSON string in CodeMirror and fallback textarea
function setWorksJsonEditorValue(val) {
  const textarea = document.getElementById('worksJsonEditorTextarea');
  if (textarea) textarea.value = val;
  if (worksJsonCodeMirror) {
    const cursor = worksJsonCodeMirror.getCursor();
    worksJsonCodeMirror.setValue(val);
    try {
      worksJsonCodeMirror.setCursor(cursor);
    } catch {
      // ignore cursor reset if length changed
    }
  }
}

// Helper to safely parse and synchronize currentWorksRules from the editor if valid
function syncCurrentRulesFromEditorIfValid() {
  try {
    const val = getWorksJsonEditorValue();
    if (!val) return;
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      currentWorksRules = parsed;
    }
  } catch {
    // ignore syntax error while user is actively typing in JSON
  }
}

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
async function handleRulesFileInput(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const fileText = await readFileAsTextWithEncoding(file);
    const parsed = JSON.parse(fileText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      showToast('Неверный формат JSON: ожидается JSON-объект со структурой разделов', 'error', 'Ошибка файла');
      return;
    }

    currentWorksRules = parsed;

    // Synchronize editor textarea and CodeMirror if modal exists
    setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
    validateWorksJsonInput();

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
  } finally {
    e.target.value = '';
  }
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

  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
  validateWorksJsonInput();
  renderRulesModalContent();
  showToast('Сметные нормы сброшены к стандартному файлу works_rules.json. Выполнен перерасчет работ.', 'info', 'Сброс правил');
  if (currentData) {
    calculateVolumes();
  }
}

// Download active rules as JSON
function downloadWorksRules() {
  const jsonStr = getWorksJsonEditorValue() || JSON.stringify(currentWorksRules, null, 2);
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

// Render rules modal cards, cable catalog, couplings, equipment and settings tabs
function renderRulesModalContent() {
  const container = document.getElementById('rulesListContainer');
  const countBadge = document.getElementById('worksRulesCountBadge');
  
  // Render cables, couplings, equipment and settings tabs content
  renderCableCatalogModalContent();
  renderCouplingCatalogModalContent();
  renderEquipmentCatalogModalContent();
  renderSettingsModalContent();

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

  // Search filter query for Rules Cards
  const searchInput = document.getElementById('rulesCardsSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById('rulesCardsClearSearchBtn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('d-none');
    else clearBtn.classList.add('d-none');
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
  const missingEquipment = (window.lastEquipmentWorksCalc && window.lastEquipmentWorksCalc.missingInRules) ? window.lastEquipmentWorksCalc.missingInRules : [];

  if (missingCable.length > 0 || missingTrench.length > 0 || missingEquipment.length > 0) {
    const cableNames = missingCable.map(m => `«${escapeHtml(m.type)}»`).join(', ');
    const trenchNames = missingTrench.map(m => `«${escapeHtml(m.type)}»`).join(', ');
    const eqNames = missingEquipment.map(m => `«${escapeHtml(m.type || m.mark)}»`).join(', ');
    const parts = [];
    if (cableNames) parts.push(`Для кабелей (Монтажные работы): ${cableNames}`);
    if (trenchNames) parts.push(`Для траншей (Строительные работы): ${trenchNames}`);
    if (eqNames) parts.push(`Для оборудования (Оборудование): ${eqNames}`);

    missingNoticeHtml = `
      <div class="alert alert-warning py-2_5 px-3 mb-3 border-warning shadow-sm small">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-alarm-exclamation fs-4 text-warning flex-shrink-0 mt-0_5"></i>
          <div class="flex-grow-1">
            <div class="fw-bold text-dark">В загруженном проекте есть позиции без правил сметных норм!</div>
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
              ${missingEquipment.length > 0 ? `
                <button type="button" class="btn btn-xs btn-outline-dark fw-semibold" id="modalAddMissingEquipmentBtn">
                  <i class="bx bx-plus-circle me-1"></i>Добавить позиции по оборудованию (${missingEquipment.length})
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  let html = '';
  let matchedRulesTotal = 0;

  sections.forEach((sec) => {
    const isCableSec = sec.name.toLowerCase().includes('монтаж') || sec.name.toLowerCase().includes('кабел');
    
    // Filter rules inside section if search query is provided
    const matchingRules = sec.rules.filter(rule => {
      if (!query) return true;
      const rName = rule["Марка"] || rule["Название"] || rule.mark || rule.name || '';
      const works = getRuleWorks(rule);
      const worksNames = works.map(w => w["Наименование"] || '').join(' ');
      const haystack = `${sec.name} ${rName} ${worksNames}`.toLowerCase();
      return haystack.includes(query);
    });

    if (matchingRules.length === 0) return;
    matchedRulesTotal += matchingRules.length;

    html += `
      <div class="mb-3">
        <div class="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom">
          <i class="bx bx-folder text-warning fs-5"></i>
          <span class="fw-bold text-body fs-6">Раздел: ${escapeHtml(sec.name)}</span>
          <span class="badge bg-secondary-subtle text-secondary-emphasis border ms-auto">${matchingRules.length} способов</span>
        </div>
        <div class="d-flex flex-column gap-2">
    `;

    matchingRules.forEach((rule, rIdx) => {
      const rName = rule["Марка"] || rule["Название"] || 'Без названия';
      const rawWm = rule["Работы и материалы"];
      const works = getRuleWorks(rule);
      const isObjectStructure = rawWm && typeof rawWm === 'object' && !Array.isArray(rawWm);

      let worksHtml = '';

      if (isObjectStructure) {
        const isEquipSec = sec.name.toLowerCase().includes('оборудован');
        Object.entries(rawWm).forEach(([key, itemsVal]) => {
          const items = Array.isArray(itemsVal) ? itemsVal : (itemsVal ? [itemsVal] : []);
          const isOptKey = key.toLowerCase().includes('оптич') || key.toLowerCase().includes('волс');
          let groupTitle = `Ключ: "${escapeHtml(key)}"`;
          if (isEquipSec) {
            groupTitle = `Способ установки: «${escapeHtml(key)}»`;
          } else if (isOptKey) {
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

            const cond = parseCableCountCondition(w);
            const condBadge = cond.hasCondition
              ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning ms-1 font-monospace" style="font-size: 0.7rem;" title="Условие применения: ${escapeHtml(cond.description)}"><i class="bx bx-git-branch me-0_5"></i>${escapeHtml(cond.description)}</span>`
              : '';

            const showFormulaOpt = shouldShowFormula(w);
            const formulaDispBadge = showFormulaOpt
              ? `<span class="badge bg-light text-muted border ms-1" style="font-size: 0.68rem;" title="Отображение формулы включено"><i class="bx bx-show me-0_5"></i>в формулах</span>`
              : `<span class="badge bg-secondary-subtle text-muted border ms-1" style="font-size: 0.68rem;" title="Отображение формулы отключено («ОтображатьФормулу»: false)"><i class="bx bx-hide me-0_5"></i>без формулы</span>`;

            groupItemsHtml += `
              <div class="p-2 rounded bg-body border mb-1 small">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                  <div class="fw-semibold text-body">${wIdx + 1}. ${escapeHtml(w["Наименование"] || '')} ${tierBadge}${condBadge}</div>
                  <span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap">${escapeHtml(w["Единицы измерения"] || '')}</span>
                </div>
                <div class="d-flex align-items-center gap-1 text-muted fs-xs">
                  <span class="fw-medium">Формула:</span>
                  <code class="px-1 py-0 bg-body-tertiary border rounded text-primary">${escapeHtml(w["Формула"] || 'ДЛИНА')}</code>
                  ${formulaDispBadge}
                  ${w["Тип"] ? `<span class="badge badge-material ms-auto">${escapeHtml(w["Тип"])}</span>` : ''}
                </div>
              </div>
            `;
          });

          worksHtml += `
            <div class="mb-2 p-2 rounded bg-body-tertiary border">
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

          const cond = parseCableCountCondition(w);
          const condBadge = cond.hasCondition
            ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning ms-1 font-monospace" style="font-size: 0.7rem;" title="Условие применения: ${escapeHtml(cond.description)}"><i class="bx bx-git-branch me-0_5"></i>${escapeHtml(cond.description)}</span>`
            : '';

          const showFormulaOpt = shouldShowFormula(w);
          const formulaDispBadge = showFormulaOpt
            ? `<span class="badge bg-light text-muted border ms-1" style="font-size: 0.68rem;" title="Отображение формулы включено"><i class="bx bx-show me-0_5"></i>в формулах</span>`
            : `<span class="badge bg-secondary-subtle text-muted border ms-1" style="font-size: 0.68rem;" title="Отображение формулы отключено («ОтображатьФормулу»: false)"><i class="bx bx-hide me-0_5"></i>без формулы</span>`;

          worksHtml += `
            <div class="p-2 rounded bg-body-tertiary border mb-2 small">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                <div class="fw-semibold text-body">${wIdx + 1}. ${escapeHtml(w["Наименование"] || '')} ${tierBadge}${condBadge}</div>
                <span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap">${escapeHtml(w["Единицы измерения"] || '')}</span>
              </div>
              <div class="d-flex align-items-center gap-1 text-muted fs-xs">
                <span class="fw-medium">Формула:</span>
                <code class="px-1 py-0 bg-body border rounded text-primary">${escapeHtml(w["Формула"] || 'ДЛИНА')}</code>
                ${formulaDispBadge}
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

  const modalAddMissingEquipmentBtn = document.getElementById('modalAddMissingEquipmentBtn');
  if (modalAddMissingEquipmentBtn && missingEquipment.length > 0) {
    modalAddMissingEquipmentBtn.addEventListener('click', () => {
      addMissingEquipmentToRules(missingEquipment);
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
// RENDER EQUIPMENT CATALOG TAB IN WORKS RULES MODAL
// --------------------------------------------------------------------------

// Helper to get equipment rules dictionary where mark is the key
function getEquipmentRulesDict(rulesData) {
  if (!rulesData || typeof rulesData !== 'object') return {};
  const raw = rulesData["Оборудование"];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

// Helper to extract equipment list from dictionary
function getEquipmentRulesList(rulesData) {
  const dict = getEquipmentRulesDict(rulesData);
  return Object.entries(dict).map(([markKey, itemVal]) => {
    return {
      "Марка": markKey,
      ...(itemVal && typeof itemVal === 'object' ? itemVal : {})
    };
  });
}

// Helper to extract equipment works object
function getEquipmentItemWorksObject(item) {
  if (!item || typeof item !== 'object') return {};
  if (item["Работы"] && typeof item["Работы"] === 'object') {
    return item["Работы"];
  }
  if (item["Работы и материалы"] && typeof item["Работы и материалы"] === 'object') {
    return item["Работы и материалы"];
  }
  return {};
}

function renderEquipmentCatalogModalContent() {
  const container = document.getElementById('equipmentCatalogContainer');
  const tabBadge = document.getElementById('tabWorksEquipmentCountBadge');
  if (!container) return;

  const equipmentList = getEquipmentRulesList(currentWorksRules);
  const totalEquipmentCount = equipmentList.length;

  if (tabBadge) {
    tabBadge.textContent = totalEquipmentCount;
  }

  // Search filter query
  const searchInput = document.getElementById('equipmentCatalogSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById('equipmentCatalogClearSearchBtn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('d-none');
    else clearBtn.classList.add('d-none');
  }

  const filtered = equipmentList.filter(item => {
    if (!query) return true;
    const mark = (item["Марка"] || item.mark || '').toLowerCase();
    const desc = (item["Полное наименование"] || item["Описание"] || item["Название"] || item.description || '').toLowerCase();
    const wm = getEquipmentItemWorksObject(item);
    const methods = Object.keys(wm).join(' ').toLowerCase();
    let worksNames = '';
    Object.values(wm).forEach(wList => {
      const arr = Array.isArray(wList) ? wList : (wList ? [wList] : []);
      arr.forEach(w => {
        if (typeof w === 'string') {
          worksNames += ' ' + w;
          return;
        }
        worksNames += ' ' + (w["Наименование"] || w.name || '');
        const nested = [
          ...(Array.isArray(w["Материалы"]) ? w["Материалы"] : []),
          ...(Array.isArray(w["Оборудование"]) ? w["Оборудование"] : []),
          ...(Array.isArray(w["Ресурсы"]) ? w["Ресурсы"] : []),
          ...(Array.isArray(w.materials) ? w.materials : []),
          ...(Array.isArray(w.equipment) ? w.equipment : [])
        ];
        nested.forEach(n => {
          if (typeof n === 'string') worksNames += ' ' + n;
          else worksNames += ' ' + (n["Наименование"] || n.name || '');
        });
      });
    });
    const haystack = `${mark} ${desc} ${methods} ${worksNames}`.toLowerCase();
    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted bg-light rounded border">
        <i class="bx bx-search-alt fs-1 text-muted opacity-50 mb-2 d-block"></i>
        <div class="fw-semibold">Оборудование не найдено</div>
        <div class="small text-muted mt-1">
          ${totalEquipmentCount === 0
            ? 'В разделе «Оборудование» файла JSON сметных норм пока нет позиций. Нажмите «Добавить оборудование».'
            : 'Попробуйте изменить поисковый запрос или добавьте новую марку оборудования.'}
        </div>
      </div>
    `;
    return;
  }

  let totalMethodsAcrossAll = 0;
  let totalWorksAcrossAll = 0;
  let totalSubItemsAcrossAll = 0;

  equipmentList.forEach(item => {
    const wm = getEquipmentItemWorksObject(item);
    const mKeys = Object.keys(wm);
    totalMethodsAcrossAll += mKeys.length;
    mKeys.forEach(mk => {
      const wList = wm[mk];
      const arr = Array.isArray(wList) ? wList : (wList ? [wList] : []);
      totalWorksAcrossAll += arr.length;
      arr.forEach(w => {
        if (w && typeof w === 'object') {
          const nested = [
            ...(Array.isArray(w["Материалы"]) ? w["Материалы"] : []),
            ...(Array.isArray(w["Оборудование"]) ? w["Оборудование"] : []),
            ...(Array.isArray(w["Ресурсы"]) ? w["Ресурсы"] : []),
            ...(Array.isArray(w.materials) ? w.materials : []),
            ...(Array.isArray(w.equipment) ? w.equipment : [])
          ];
          totalSubItemsAcrossAll += nested.length;
        }
      });
    });
  });

  let cardsHtml = '';
  filtered.forEach((item, idx) => {
    const mark = (item["Марка"] || item.mark || 'Без марки').trim();
    const fullDesc = (item["Полное наименование"] || item["Описание"] || item["Название"] || item.description || '').trim();
    const unitTop = item["Единицы измерения"] || item.unit || '';
    const noteTop = item["Примечание"] || item["Комментарий"] || item.comment || '';
    const wm = getEquipmentItemWorksObject(item);
    const methodEntries = Object.entries(wm);

    let cardWorksCount = 0;
    let cardSubCount = 0;

    let methodsHtml = '';
    methodEntries.forEach(([methodName, worksArr]) => {
      const worksList = Array.isArray(worksArr) ? worksArr : (worksArr ? [worksArr] : []);
      cardWorksCount += worksList.length;
      let worksItemsHtml = '';

      worksList.forEach((work, wIdx) => {
        if (typeof work === 'string') {
          worksItemsHtml += `
            <div class="p-2 rounded bg-body border mb-1 small">
              <div class="fw-semibold text-body">${wIdx + 1}. ${escapeHtml(work)}</div>
            </div>
          `;
          return;
        }

        const rawType = (work["Тип"] || work.type || 'работа').trim().toLowerCase();
        const isEquip = rawType === 'оборудование' || rawType === 'equipment';
        const isMat = rawType === 'материал' || rawType === 'material';
        const formula = work["Формула"] || work.formula || 'КОЛИЧЕСТВО';
        const unit = work["Единицы измерения"] || work.unit || unitTop || 'шт';
        const section = work["Раздел"] || work.section || 'Монтажные работы';
        const showFormula = shouldShowFormula(work);
        const workComment = work["Комментарий"] || work.comment || '';

        let typeBadgeClass = 'bg-primary-subtle text-primary border';
        if (isEquip) typeBadgeClass = 'bg-warning-subtle text-warning-emphasis border';
        else if (isMat) typeBadgeClass = 'badge-material';

        let subItemsHtml = '';
        const nested = [
          ...(Array.isArray(work["Материалы"]) ? work["Материалы"] : []),
          ...(Array.isArray(work["Оборудование"]) ? work["Оборудование"] : []),
          ...(Array.isArray(work["Ресурсы"]) ? work["Ресурсы"] : []),
          ...(Array.isArray(work.materials) ? work.materials : []),
          ...(Array.isArray(work.equipment) ? work.equipment : [])
        ];
        cardSubCount += nested.length;

        nested.forEach((sub, sIdx) => {
          if (typeof sub === 'string') {
            subItemsHtml += `
              <div class="p-2 rounded bg-body border mb-1 ms-3 small">
                <div class="text-body"><span class="text-muted me-1 fw-bold">↳</span>${wIdx + 1}.${sIdx + 1}. ${escapeHtml(sub)}</div>
              </div>
            `;
            return;
          }

          const isDirectEquip = Array.isArray(work["Оборудование"]) && work["Оборудование"].includes(sub);
          const subRawType = (sub["Тип"] || sub.type || (isDirectEquip ? 'оборудование' : 'материал')).trim().toLowerCase();
          const subIsEquip = subRawType === 'оборудование' || subRawType === 'equipment';
          const subFormula = sub["Формула"] || sub.formula || 'КОЛИЧЕСТВО';
          const subUnit = sub["Единицы измерения"] || sub.unit || 'шт';
          const subSection = sub["Раздел"] || sub.section || section;
          const subShowFormula = shouldShowFormula(sub, showFormula);
          const subComment = sub["Комментарий"] || sub.comment || '';

          let subTypeBadgeClass = 'badge-material';
          if (subIsEquip) subTypeBadgeClass = 'bg-warning-subtle text-warning-emphasis border';
          else if (subRawType === 'работа') subTypeBadgeClass = 'bg-primary-subtle text-primary border';

          const typeTitle = sub["Тип"] || (subIsEquip ? 'оборудование' : 'материал');

          subItemsHtml += `
            <div class="p-2 rounded bg-body border mb-1 ms-3 small">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                <div class="fw-medium text-body">
                  <span class="text-muted me-1 fw-bold">↳</span>${wIdx + 1}.${sIdx + 1}. ${escapeHtml(sub["Наименование"] || sub.name || '')}
                </div>
                <span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap font-monospace">${escapeHtml(subUnit)}</span>
              </div>
              <div class="d-flex align-items-center gap-1 text-muted fs-xs flex-wrap">
                <span class="fw-medium">Формула:</span>
                <code class="px-1 py-0 bg-body-tertiary border rounded text-primary">${escapeHtml(subFormula)}</code>
                ${subShowFormula ? '<span class="badge bg-light text-muted border ms-1" style="font-size: 0.68rem;"><i class="bx bx-show me-0_5"></i>в формулах</span>' : ''}
                <span class="badge bg-light text-secondary border ms-1" style="font-size: 0.68rem;">Раздел: ${escapeHtml(subSection)}</span>
                <span class="badge ${subTypeBadgeClass} ms-auto"><i class='bx ${subIsEquip ? 'bx-cube' : 'bx-layer'} me-0_5'></i>${escapeHtml(typeTitle)}</span>
              </div>
              ${subComment ? `<div class="text-muted fs-xs mt-1 fst-italic"><i class='bx bx-comment-detail me-0_5'></i>${escapeHtml(subComment)}</div>` : ''}
            </div>
          `;
        });

        const mainTypeTitle = work["Тип"] || (isEquip ? 'оборудование' : 'работа');

        worksItemsHtml += `
          <div class="p-2 rounded bg-body border mb-1 small">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
              <div class="fw-semibold text-body">
                ${wIdx + 1}. ${escapeHtml(work["Наименование"] || work.name || '')}
              </div>
              <span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap font-monospace">${escapeHtml(unit)}</span>
            </div>
            <div class="d-flex align-items-center gap-1 text-muted fs-xs flex-wrap">
              <span class="fw-medium">Формула:</span>
              <code class="px-1 py-0 bg-body-tertiary border rounded text-primary">${escapeHtml(formula)}</code>
              ${showFormula ? '<span class="badge bg-light text-muted border ms-1" style="font-size: 0.68rem;"><i class="bx bx-show me-0_5"></i>в формулах</span>' : ''}
              <span class="badge bg-light text-secondary border ms-1" style="font-size: 0.68rem;">Раздел: ${escapeHtml(section)}</span>
              <span class="badge ${typeBadgeClass} ms-auto"><i class='bx ${isEquip ? 'bx-cube' : (isMat ? 'bx-layer' : 'bx-wrench')} me-0_5'></i>${escapeHtml(mainTypeTitle)}</span>
            </div>
            ${workComment ? `<div class="text-muted fs-xs mt-1 fst-italic"><i class='bx bx-comment-detail me-0_5'></i>${escapeHtml(workComment)}</div>` : ''}
          </div>
          ${subItemsHtml}
        `;
      });

      methodsHtml += `
        <div class="mb-3 p-2_5 rounded bg-body-tertiary border">
          <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
            <span class="fw-bold text-primary small d-flex align-items-center gap-1">
              <i class="bx bx-wrench"></i> Способ установки: «${escapeHtml(methodName)}»
            </span>
            <span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace fs-xs">${worksList.length} поз.</span>
          </div>
          ${worksItemsHtml || '<div class="text-muted small ps-2">Работы и материалы не определены</div>'}
        </div>
      `;
    });

    cardsHtml += `
      <div class="card border shadow-sm mb-3">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="fw-bold d-flex align-items-center gap-2 flex-wrap">
            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace">${idx + 1}</span>
            <i class="bx bx-cube text-warning fs-5"></i>
            <span class="fs-6 font-monospace">${escapeHtml(mark)}</span>
            ${fullDesc ? `<span class="text-muted small fw-normal ms-1">(${escapeHtml(fullDesc)})</span>` : ''}
            ${unitTop ? `<span class="badge bg-body text-body border font-monospace ms-1" style="font-size: 0.72rem;">${escapeHtml(unitTop)}</span>` : ''}
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-primary-subtle text-primary border">${methodEntries.length} способов установки</span>
            ${cardWorksCount > 0 ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border">${cardWorksCount} норм</span>` : ''}
            ${cardSubCount > 0 ? `<span class="badge bg-warning-subtle text-warning-emphasis border">${cardSubCount} мат./обор.</span>` : ''}
            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1_5" onclick="highlightAndScrollToJsonNode('${escapeHtml(mark)}', true)" title="Перейти к позиции в редакторе JSON">
              <i class='bx bx-code-alt me-0_5'></i>JSON
            </button>
          </div>
        </div>
        ${noteTop ? `<div class="px-3 pt-2 pb-0 text-muted small fst-italic"><i class='bx bx-info-circle me-1'></i>${escapeHtml(noteTop)}</div>` : ''}
        <div class="card-body p-3">
          ${methodsHtml || '<div class="text-muted small">Способы установки не заданы</div>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="small text-muted mb-2 d-flex justify-content-between align-items-center flex-wrap gap-1">
      <div>Показано: <strong>${filtered.length}</strong> из ${totalEquipmentCount} позиций оборудования (${totalMethodsAcrossAll} способов установки, ${totalWorksAcrossAll} норм, ${totalSubItemsAcrossAll} вложенных мат./обор. в JSON)</div>
      <div class="fs-xs text-muted">
        <i class='bx bx-info-circle me-1'></i>Для добавления или корректировки параметров перейдите во вкладку <strong>«Редактор JSON»</strong>
      </div>
    </div>
    ${cardsHtml}
  `;
}

// --------------------------------------------------------------------------
// SETTINGS (НАСТРОЙКИ) TAB & RULES SPECIFICATION
// --------------------------------------------------------------------------

function getRulesSettings(rulesData) {
  const raw = (rulesData && typeof rulesData === 'object')
    ? (rulesData["Настройки"] || rulesData["settings"] || rulesData["Параметры"] || {})
    : {};

  const numModeRaw = String(raw["ТипНумерации"] || raw["НумерацияВОР"] || raw["numberingMode"] || raw["нумерация"] || 'иерархическая').trim().toLowerCase();
  const isSeq = numModeRaw.includes('сквозн') || numModeRaw.includes('seq') || numModeRaw.includes('cont');

  const decKmRaw = raw["ОкруглениеКабелейКм"] !== undefined ? raw["ОкруглениеКабелейКм"] : (raw["decimalsKm"] !== undefined ? raw["decimalsKm"] : 3);
  const decVolRaw = raw["ОкруглениеОбъемов"] !== undefined ? raw["ОкруглениеОбъемов"] : (raw["decimalsVolume"] !== undefined ? raw["decimalsVolume"] : 2);

  const decimalsKm = (!isNaN(Number(decKmRaw)) && Number(decKmRaw) >= 0) ? Math.min(10, Math.floor(Number(decKmRaw))) : 3;
  const decimalsVolume = (!isNaN(Number(decVolRaw)) && Number(decVolRaw) >= 0) ? Math.min(10, Math.floor(Number(decVolRaw))) : 2;

  return {
    numberingMode: isSeq ? 'сквозная' : 'иерархическая',
    ggeVersion: String(raw["ВерсияGGE"] || raw["ВерсияСхемыGGE"] || raw["ggeVersion"] || '3.01').trim(),
    accessLevel: String(raw["УровеньДоступа"] || raw["accessLevel"] || 'коммерческая тайна').trim(),
    softName: String(raw["ПрограммныйКомплекс"] || raw["softName"] || 'Программный комплекс "Строительный эксперт"  v7.3.1.7813').trim(),
    pluginVersion: String(raw["ПлагинGGE"] || raw["pluginVersion"] || 'Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13').trim(),
    decimalsKm: decimalsKm,
    decimalsVolume: decimalsVolume,
    raw: raw
  };
}

/**
 * Returns the configured decimal precision for a given unit based on Settings rules.
 */
function getVolumeDecimals(unit, rulesData = currentWorksRules) {
  const settings = getRulesSettings(rulesData);
  const isKm = String(unit || '').trim().toLowerCase() === 'км';
  return isKm ? settings.decimalsKm : settings.decimalsVolume;
}

/**
 * Rounds a quantity/volume according to the configured decimals for its unit.
 */
function roundQuantity(val, unit = '', rulesData = currentWorksRules) {
  if (val === null || val === undefined || isNaN(val)) return 0;
  const decimals = getVolumeDecimals(unit, rulesData);
  const factor = Math.pow(10, decimals);
  return Math.round(Number(val) * factor) / factor;
}

/**
 * Formats a volume number for UI display according to the configured decimals.
 */
function formatVolumeDisplay(val, unit = '', rulesData = currentWorksRules) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const decimals = getVolumeDecimals(unit, rulesData);
  const num = Number(val);
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: Math.min(decimals, 2),
    maximumFractionDigits: decimals
  });
}

// Render the Settings tab content in Works Rules Modal
function renderSettingsModalContent() {
  syncCurrentRulesFromEditorIfValid();
  const settings = getRulesSettings(currentWorksRules);

  const numSelect = document.getElementById('settingNumberingMode');
  if (numSelect) numSelect.value = settings.numberingMode;

  const decKmInput = document.getElementById('settingDecimalsKm');
  if (decKmInput) decKmInput.value = settings.decimalsKm;

  const decVolInput = document.getElementById('settingDecimalsVolume');
  if (decVolInput) decVolInput.value = settings.decimalsVolume;

  const ggeVerInput = document.getElementById('settingGgeVersion');
  if (ggeVerInput) ggeVerInput.value = settings.ggeVersion;

  const accLevelInput = document.getElementById('settingAccessLevel');
  if (accLevelInput) accLevelInput.value = settings.accessLevel;

  const softNameInput = document.getElementById('settingSoftName');
  if (softNameInput) softNameInput.value = settings.softName;

  const pluginVerInput = document.getElementById('settingPluginVersion');
  if (pluginVerInput) pluginVerInput.value = settings.pluginVersion;
}

// Save settings from UI form into currentWorksRules["Настройки"] and CodeMirror editor
function saveSettingsFromUiToJson(showToastNotification = true) {
  syncCurrentRulesFromEditorIfValid();

  const numMode = document.getElementById('settingNumberingMode')?.value || 'иерархическая';
  const decKm = parseInt(document.getElementById('settingDecimalsKm')?.value, 10);
  const decVol = parseInt(document.getElementById('settingDecimalsVolume')?.value, 10);
  const ggeVer = document.getElementById('settingGgeVersion')?.value || '3.01';
  const accLevel = document.getElementById('settingAccessLevel')?.value || 'коммерческая тайна';
  const softName = document.getElementById('settingSoftName')?.value || 'Программный комплекс "Строительный эксперт"  v7.3.1.7813';
  const pluginVer = document.getElementById('settingPluginVersion')?.value || 'Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13';

  const updatedSettings = {
    "ТипНумерации": numMode,
    "ВерсияGGE": ggeVer,
    "УровеньДоступа": accLevel,
    "ПрограммныйКомплекс": softName,
    "ПлагинGGE": pluginVer,
    "ОкруглениеКабелейКм": !isNaN(decKm) ? Math.max(0, Math.min(10, decKm)) : 3,
    "ОкруглениеОбъемов": !isNaN(decVol) ? Math.max(0, Math.min(10, decVol)) : 2
  };

  if (!currentWorksRules || typeof currentWorksRules !== 'object') {
    currentWorksRules = {};
  }

  // Preserve order with Настройки at top
  const newRulesObj = {
    "Настройки": updatedSettings
  };
  for (const [k, v] of Object.entries(currentWorksRules)) {
    if (k !== "Настройки" && k !== "settings" && k !== "Параметры") {
      newRulesObj[k] = v;
    }
  }

  currentWorksRules = newRulesObj;
  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));

  // Recalculate if data is currently loaded
  if (currentData && typeof calculateVolumes === 'function') {
    calculateVolumes();
  }

  if (showToastNotification) {
    showToast('Параметры сохранены и синхронизированы в JSON', 'success', 'Настройки');
  }
}

// Reset settings to defaults
function resetDefaultSettings() {
  const defaultSettings = {
    "ТипНумерации": "иерархическая",
    "ВерсияGGE": "3.01",
    "УровеньДоступа": "коммерческая тайна",
    "ПрограммныйКомплекс": "Программный комплекс \"Строительный эксперт\"  v7.3.1.7813",
    "ПлагинGGE": "Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13",
    "ОкруглениеКабелейКм": 3,
    "ОкруглениеОбъемов": 2
  };

  currentWorksRules["Настройки"] = defaultSettings;
  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
  renderSettingsModalContent();

  if (currentData && typeof calculateVolumes === 'function') {
    calculateVolumes();
  }

  showToast('Настройки сброшены к стандартным значениям', 'info', 'Сброс настроек');
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
        <i class='bx bx-info-circle me-1'></i>Для добавления или корректировки параметров откройте вкладку <strong>«Редактор JSON»</strong>
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

// Normalize trench/routing type names to canonical forms (handles spacing and variations)
// Match trench/routing type against rule name strictly by exact match (case-insensitive, trimmed whitespace)
function matchesRule(trenchTypeName, ruleName) {
  if (!trenchTypeName || !ruleName) return false;
  const t = trenchTypeName.trim().toLowerCase().replace(/\s+/g, ' ');
  const r = ruleName.trim().toLowerCase().replace(/\s+/g, ' ');
  return t === r;
}

// Extract active trench segments and lengths directly from currentData
function getActiveTrenchSummary() {
  const summary = {};

  if (currentData && Array.isArray(currentData.routingTypeBlocks)) {
    currentData.routingTypeBlocks.forEach(b => {
      if (!b) return;
      const type = (b.type || 'Без типа').trim();
      const length = Number(b.length) || 0;
      let countPipes = Number(b.countPipes) || 0;
      let lengthPipes = Number(b.lengthPipes) || 0;
      const countIntersections = Number(b.countIntersections) || 0;

      const isPipeType = type.toLowerCase().includes('труб');
      if (isPipeType && countPipes === 0 && lengthPipes === 0) {
        countPipes = 1;
        lengthPipes = length;
      } else if (isPipeType && countPipes === 0) {
        countPipes = 1;
      } else if (countPipes > 0 && lengthPipes === 0) {
        lengthPipes = length;
      }

      let cablesCount = Number(b.cablesCount) || 0;
      if (cablesCount === 0 && Array.isArray(b.contained)) {
        cablesCount = b.contained.length;
      }
      if (!summary[type]) {
        summary[type] = { totalLength: 0, count: 0, totalPipesCount: 0, totalPipesLength: 0, segments: [] };
      }
      summary[type].totalLength += length;
      summary[type].count += 1;
      summary[type].totalPipesCount += countPipes;
      summary[type].totalPipesLength += (countPipes * lengthPipes);
      summary[type].segments.push({
        handle: b.handle || '',
        length,
        cablesCount,
        countPipes,
        lengthPipes,
        countIntersections,
        contained: Array.isArray(b.contained) ? b.contained.join(', ') : (b.contained || ''),
        type
      });
    });
  }

  return summary;
}

// Evaluate formula for a single trench segment (supports both ДЛИНА and pipe/cable count variables)
function evaluateTrenchSegmentFormula(formula, length, cablesCount, seg = null) {
  const clean = (formula || 'ДЛИНА').trim()
    .replace(/[×✕✖·∗]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[\u2212\u2013\u2014]/g, '-');
  const len = Number(length) || 0;
  const cab = Number(cablesCount) || 0;
  const countPipes = Number(seg && seg.countPipes !== undefined ? seg.countPipes : (seg && seg.lengthPipes ? 1 : 0)) || 0;
  const lengthPipes = Number(seg && seg.lengthPipes !== undefined && seg.lengthPipes > 0 ? seg.lengthPipes : len) || 0;
  const countIntersections = Number(seg && seg.countIntersections !== undefined && seg.countIntersections > 0 ? seg.countIntersections : (seg && (seg.countPipes || seg.lengthPipes || (seg.type && seg.type.includes('труб'))) ? 1 : 0)) || 0;

  let expr = clean.replace(/,/g, '.')
    // Intersections
    .replace(/(?:КОЛИЧЕСТВО|ЧИСЛО)[_\s]?ПЕРЕСЕЧЕНИ[ЙЯЕ]/gi, String(countIntersections))
    .replace(/\bINTERSECTIONS[_\s]?COUNT\b/gi, String(countIntersections))
    .replace(/\bCOUNT[_\s]?INTERSECTIONS\b/gi, String(countIntersections))
    .replace(/\bПЕРЕСЕЧЕНИ[ЙЯЕ]\b/gi, String(countIntersections))
    // Pipe count
    .replace(/(?:КОЛИЧЕСТВО|ЧИСЛО)[_\s]?ТРУБ[АЫ]?/gi, String(countPipes))
    .replace(/\bPIPES[_\s]?COUNT\b/gi, String(countPipes))
    .replace(/\bCOUNT[_\s]?PIPES\b/gi, String(countPipes))
    // Pipe length
    .replace(/ДЛИН[АЫ][_\s]?ТРУБ[АЫ]?/gi, String(lengthPipes))
    .replace(/\bPIPES[_\s]?LENGTH\b/gi, String(lengthPipes))
    .replace(/\bLENGTH[_\s]?PIPES\b/gi, String(lengthPipes))
    // Cable count
    .replace(/КОЛИЧЕСТВО[_\s]?КАБЕЛЕЙ/gi, String(cab))
    .replace(/CABLES_COUNT/gi, String(cab))
    .replace(/CABLES/gi, String(cab))
    .replace(/КАБЕЛЕЙ/gi, String(cab))
    .replace(/КАБЕЛЯ/gi, String(cab))
    .replace(/КАБЕЛИ/gi, String(cab))
    // Generic
    .replace(/\bКОЛИЧЕСТВО\b/gi, String(cab))
    .replace(/ДЛИНА/gi, String(len))
    .replace(/\bLENGTH\b/gi, String(len));

  try {
    if (/^[0-9+\-*/().\s]+$/.test(expr)) {
      const val = Function("'use strict'; return (" + expr + ");")();
      if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val;
    }
  } catch (e) {}

  return len;
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
        const cond = parseCableCountCondition(work);
        let conditionNote = '';

        // Filter matching segments by cable count condition if specified
        let matchingSegments = tInfo.segments || [];
        if (cond.hasCondition) {
          matchingSegments = matchingSegments.filter(seg => {
            const cCount = Number(seg.cablesCount) || 0;
            if (cond.minCables !== null && cCount < cond.minCables) return false;
            if (cond.maxCables !== null && cCount > cond.maxCables) return false;
            return true;
          });
          conditionNote = cond.description;
        }

        if (matchingSegments.length === 0) {
          // No segments match condition
          return;
        }

        const effectiveLength = matchingSegments.reduce((sum, s) => sum + (Number(s.length) || 0), 0);
        if (effectiveLength <= 0 && matchingSegments.length === 0) return;

        const formula = (work["Формула"] || "ДЛИНА").trim();
        const hasCableVar = /(?:КОЛИЧЕСТВО[_\s]?КАБЕЛЕЙ|CABLES(?:_COUNT)?|КАБЕЛЕ[ЙЯИ]|\bКОЛИЧЕСТВО\b)/i.test(formula);
        const hasPipeVar = /(?:ТРУБ|PIPES)/i.test(formula);

        let totalVolume = 0;
        matchingSegments.forEach(seg => {
          const segLen = Number(seg.length) || 0;
          const segCables = Number(seg.cablesCount) || 0;
          const segVol = evaluateTrenchSegmentFormula(formula, segLen, segCables, seg);
          totalVolume += segVol;
        });
        const trenchWorkUnit = work["Единицы измерения"] || work.unit || '';
        totalVolume = roundQuantity(totalVolume, trenchWorkUnit, rulesData);

        // Build formula display string for VOR
        let displayFormula = '';
        const isTrench = tName.toLowerCase().includes('транше') || ruleName.toLowerCase().includes('транше');
        const unitSuffix = isTrench ? 'м траншеи' : (tName.toLowerCase().includes('канализац') ? 'м канализации' : 'м');
        const condSuffix = conditionNote ? ` (${conditionNote})` : '';

        if (hasPipeVar) {
          const hasInterVar = /(?:ПЕРЕСЕЧЕНИ|INTERSECTIONS)/i.test(formula);
          if (matchingSegments.length === 1) {
            const seg = matchingSegments[0];
            const pInter = seg.countIntersections > 0 ? seg.countIntersections : 1;
            const pCount = seg.countPipes || 1;
            const pLen = seg.lengthPipes || seg.length || 0;
            displayFormula = hasInterVar && pInter > 1
              ? `${pInter} перес. * ${pCount} шт. * ${pLen} м`
              : (hasInterVar ? `${pInter} * ${pCount} шт. * ${pLen} м` : `${pCount} шт. * ${pLen} м`);
          } else if (matchingSegments.length <= 5) {
            displayFormula = matchingSegments.map(s => {
              const pInter = s.countIntersections > 0 ? s.countIntersections : 1;
              const pCount = s.countPipes || 1;
              const pLen = s.lengthPipes || s.length || 0;
              return hasInterVar && pInter > 1
                ? `${pInter} перес. * ${pCount} шт. * ${pLen} м`
                : (hasInterVar ? `${pInter} * ${pCount} шт. * ${pLen} м` : `${pCount} шт. * ${pLen} м`);
            }).join(' + ');
          } else {
            const totalIntersections = matchingSegments.reduce((sum, s) => sum + (s.countIntersections > 0 ? s.countIntersections : 1), 0);
            const totalPipes = matchingSegments.reduce((sum, s) => sum + (s.countPipes || 1), 0);
            const allSameLen = matchingSegments.every(s => (s.lengthPipes || s.length) === (matchingSegments[0].lengthPipes || matchingSegments[0].length));
            const allOneInter = matchingSegments.every(s => (s.countIntersections || 1) === 1);
            if (allSameLen && allOneInter && !hasInterVar) {
              const pLen = matchingSegments[0].lengthPipes || matchingSegments[0].length || 0;
              displayFormula = `${totalPipes} шт. * ${pLen} м`;
            } else if (allSameLen && hasInterVar) {
              const pLen = matchingSegments[0].lengthPipes || matchingSegments[0].length || 0;
              const pCount = matchingSegments[0].countPipes || 1;
              displayFormula = `${totalIntersections} перес. * ${pCount} шт. * ${pLen} м`;
            } else {
              displayFormula = `${formula.replace(/\*/g, ' * ')} по ${matchingSegments.length} блокам (всего ${totalVolume} м)`;
            }
          }
          if (condSuffix) displayFormula += condSuffix;
        } else if (!hasCableVar) {
          // Standard formula without cable count variable (e.g. "0.36 * ДЛИНА")
          displayFormula = formula.replace(/\*/g, ' * ');
          displayFormula = displayFormula.replace(/ДЛИНА/gi, `${effectiveLength} ${unitSuffix}${condSuffix}`);
        } else {
          // Formula uses cable count variable (e.g. "ДЛИНА * КОЛИЧЕСТВО_КАБЕЛЕЙ" or "0.1 * ДЛИНА * КАБЕЛЕЙ")
          if (matchingSegments.length === 1) {
            const seg = matchingSegments[0];
            const segLen = Number(seg.length) || 0;
            const segCables = Number(seg.cablesCount) || 0;
            displayFormula = formula.replace(/\*/g, ' * ')
              .replace(/ДЛИНА/gi, `${segLen} ${unitSuffix}`)
              .replace(/(?:КОЛИЧЕСТВО[_\s]?КАБЕЛЕЙ|CABLES(?:_COUNT)?|КАБЕЛЕ[ЙЯИ]|\bКОЛИЧЕСТВО\b)/gi, `${segCables} каб.`);
            if (condSuffix) displayFormula += condSuffix;
          } else if (matchingSegments.length <= 3) {
            // Detailed segment breakdown: "(100 м * 5 каб + 250 м * 6 каб)"
            const parts = matchingSegments.map(seg => {
              const segLen = Number(seg.length) || 0;
              const segCables = Number(seg.cablesCount) || 0;
              return `${segLen} м * ${segCables} каб`;
            });
            const formulaPrefix = formula.replace(/ДЛИНА.*КОЛИЧЕСТВО.*КАБЕЛЕЙ|ДЛИНА.*КАБЕЛЕЙ|КОЛИЧЕСТВО.*КАБЕЛЕЙ.*ДЛИНА/gi, '').replace(/\*/g, '').trim();
            if (formulaPrefix && formulaPrefix !== '1') {
              displayFormula = `${formulaPrefix} * (${parts.join(' + ')})${condSuffix}`;
            } else {
              displayFormula = `(${parts.join(' + ')})${condSuffix}`;
            }
          } else {
            // More than 3 segments: compact summary
            displayFormula = `${formula.replace(/\*/g, ' * ')} по ${matchingSegments.length} блокам (всего ${effectiveLength} ${unitSuffix})${condSuffix}`;
          }
        }
        displayFormula = normalizeFormulaMathOperators(displayFormula);

        const showFormula = shouldShowFormula(work);
        const targetSection = (work["Раздел"] || work.section || sectionName).trim();
        const rawWorkType = (work["Тип"] || work.type || '').trim().toLowerCase();
        let determinedWorkType = 'работа';
        if (rawWorkType === 'оборудование' || rawWorkType === 'equipment') {
          determinedWorkType = 'оборудование';
        } else if (rawWorkType === 'материал' || rawWorkType === 'material') {
          determinedWorkType = 'материал';
        }
        const isSubWork = determinedWorkType === 'материал' || determinedWorkType === 'оборудование';
        const primaryTrenchWork = works.find(w => {
          const t = (w["Тип"] || w.type || '').trim().toLowerCase();
          return t !== 'материал' && t !== 'оборудование';
        }) || works[0];
        const primaryTrenchWorkTitle = primaryTrenchWork ? (primaryTrenchWork["Наименование"] || primaryTrenchWork.name || ruleName).trim() : ruleName;

        calculatedWorks.push({
          name: work["Наименование"] || work.name || '',
          unit: work["Единицы измерения"] || work.unit || '',
          volume: totalVolume,
          formulaDisplay: showFormula ? displayFormula : '',
          showFormula: showFormula,
          rawFormulaDisplay: displayFormula,
          ruleName: ruleName,
          trenchType: tName,
          trenchLength: effectiveLength,
          totalTrenchLength: tInfo.totalLength,
          matchedSegmentsCount: matchingSegments.length,
          condition: conditionNote,
          section: targetSection,
          type: determinedWorkType,
          parentWorkName: work.parentWorkName || ((isSubWork && primaryTrenchWork !== work) ? primaryTrenchWorkTitle : undefined),
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
    for (const [rName, rLen] of Object.entries(routingMap)) {
      const trimmed = (rName || '').trim();
      if (trimmed && Number(rLen) > 0) {
        allUsedRoutingTypes.add(trimmed);
      }
    }
  });

  // Calculate and prepend coupling installation works and materials
  const couplingsSummary = getActiveCouplingsSummary(rulesData);
  const activeCouplingTiers = Object.keys(couplingsSummary.tiers).map(Number).sort((a, b) => a - b);
  activeCouplingTiers.forEach(tier => {
    const tierData = couplingsSummary.tiers[tier];
    if (tierData && tierData.count > 0) {
      const workItems = getCouplingInstallationWorkItems(tier, rulesData);
      
      // 1. Add all defined work/material items from rules array for this tier
      workItems.forEach(workItem => {
        const formula = workItem.formula || 'КОЛИЧЕСТВО';
        const rawVol = evaluateWorkFormula(formula, tierData.count);
        const volume = roundQuantity(rawVol, workItem.unit || 'шт', rulesData);
        const showFormula = (workItem.showFormula !== undefined) ? workItem.showFormula : shouldShowFormula(workItem.rawItem || workItem);
        const formulaDisplay = showFormula ? buildCouplingWorkFormulaDisplay(formula, tierData, volume) : '';

        calculatedWorks.push({
          name: workItem.name,
          unit: workItem.unit || 'шт',
          volume: volume,
          volumeFormatted: String(volume),
          formula: formula,
          formulaDisplay: formulaDisplay,
          showFormula: showFormula,
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
        const showFormula = (coupling.showFormula !== undefined) ? coupling.showFormula : shouldShowFormula(coupling);
        calculatedWorks.push({
          name: coupling.fullName,
          unit: coupling.unit || 'шт',
          volume: coupling.count,
          volumeFormatted: String(coupling.count),
          formula: 'КОЛИЧЕСТВО',
          formulaDisplay: showFormula ? `${coupling.count} шт` : '',
          showFormula: showFormula,
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

    const parsedWM = parseRuleWorksAndMaterials(rule);
    const template = (rule["Шаблон"] || rule.template || '').trim();

    // If the rule definition has no works or materials, flag it if any cable uses it
    if (!parsedWM.allItems || parsedWM.allItems.length === 0) {
      let totLen = 0;
      let count = 0;
      cableEntries.forEach(([cType, cInfo]) => {
        const routingMap = cInfo.routingTypes || {};
        for (const [rName, rLen] of Object.entries(routingMap)) {
          const lVal = Number(rLen) || 0;
          if (lVal <= 0) continue;
          if (matchesRule(rName, ruleName)) {
            matchedRoutingTypes.add((rName || '').trim());
            totLen += lVal;
            count++;
          }
        }
      });
      if (count > 0 && totLen > 0) {
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
        const effectiveLen = Number(rLen) || 0;
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
            foundInCatalog: !!cMeta.foundInCatalog,
            showFormula: cMeta.showFormula
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

        // Apply all works and their declared materials/equipment from the optical rules list
        optItems.forEach(work => {
          const rawWorkType = (work["Тип"] || work.type || '').trim().toLowerCase();
          let determinedWorkType = 'работа';
          if (rawWorkType === 'оборудование' || rawWorkType === 'equipment') {
            determinedWorkType = 'оборудование';
          } else if (rawWorkType === 'материал' || rawWorkType === 'material') {
            determinedWorkType = 'материал';
          }
          const isWorkSub = determinedWorkType === 'материал' || determinedWorkType === 'оборудование';
          const formula = work["Формула"] || work.formula || "ДЛИНА";
          const rawVal = evaluateWorkFormula(formula, totalOpticalLength);
          const unit = work["Единицы измерения"] || work.unit || 'м';
          const vol = roundQuantity(rawVal, unit, rulesData);
          const workTitle = (work["Наименование"] || work.name || opticalPrimaryTitle).trim();
          const showFormula = shouldShowFormula(work);
          const formulaDisplay = showFormula ? buildWorkFormulaDisplay(formula, totalOpticalLength, opticalCables.length, unit) : '';
          const targetSection = (work["Раздел"] || work.section || sectionName).trim();

          calculatedWorks.push({
            name: workTitle,
            unit: unit,
            volume: vol,
            formulaDisplay: formulaDisplay,
            showFormula: showFormula,
            ruleName: ruleName,
            routingType: ruleName,
            tierKey: parsedWM.optical.key,
            isOptical: true,
            category: 'Оптический кабель',
            section: targetSection,
            type: determinedWorkType,
            parentWorkName: (isWorkSub && primaryWork !== work) ? opticalPrimaryTitle : undefined,
            cablesCount: opticalCables.length,
            comment: work["Комментарий"] || work.comment || ''
          });

          // Process materials and equipment declared under this work
          const declaredSubItems = [
            ...(Array.isArray(work["Материалы"]) ? work["Материалы"] : []),
            ...(Array.isArray(work["Оборудование"]) ? work["Оборудование"] : [])
          ];
          declaredSubItems.forEach(mat => {
            const rawMatType = (mat["Тип"] || mat.type || (Array.isArray(work["Оборудование"]) && work["Оборудование"].includes(mat) ? 'оборудование' : 'материал')).trim().toLowerCase();
            let determinedMatType = 'материал';
            if (rawMatType === 'оборудование' || rawMatType === 'equipment') {
              determinedMatType = 'оборудование';
            } else if (rawMatType === 'работа' || rawMatType === 'work') {
              determinedMatType = 'работа';
            }
            const matNameTpl = (mat["Наименование"] || mat.name || '{МАРКА_КАБЕЛЯ}').trim();
            const matUnit = mat["Единицы измерения"] || mat.unit || 'км';
            const matFormula = mat["Формула"] || mat.formula || "ДЛИНА";
            const matShowFormula = shouldShowFormula(mat, showFormula);
            const matSection = (mat["Раздел"] || mat.section || targetSection).trim();

            if (matNameTpl.includes('{МАРКА_КАБЕЛЯ}') || matNameTpl.includes('{КАБЕЛЬ}') || matNameTpl.includes('{МАРКА}')) {
              // Expand material for each optical cable
              opticalCables.forEach(c => {
                const cVol = roundQuantity(evaluateWorkFormula(matFormula, c.length), matUnit, rulesData);
                const cFormulaDisp = matShowFormula
                  ? (buildWorkFormulaDisplay(matFormula, c.length, 1, matUnit) + ' (ВОЛС)')
                  : '';
                calculatedWorks.push({
                  name: c.fullDescription || `Кабель ${c.type}`,
                  unit: matUnit,
                  volume: cVol,
                  formulaDisplay: cFormulaDisp,
                  showFormula: matShowFormula,
                  ruleName: ruleName,
                  routingType: c.routingName,
                  cableType: c.type,
                  cableLength: c.length,
                  weight: c.weight,
                  isOptical: true,
                  category: 'Оптический кабель',
                  foundInCatalog: !!c.foundInCatalog,
                  section: matSection,
                  type: determinedMatType,
                  parentWorkName: workTitle,
                  comment: mat["Комментарий"] || ''
                });
              });
            } else {
              // Static item declared in work
              const matRawVal = evaluateWorkFormula(matFormula, totalOpticalLength);
              const matVol = roundQuantity(matRawVal, matUnit, rulesData);
              const matFormulaDisp = matShowFormula ? buildWorkFormulaDisplay(matFormula, totalOpticalLength, opticalCables.length, matUnit) : '';
              calculatedWorks.push({
                name: matNameTpl,
                unit: matUnit,
                volume: matVol,
                formulaDisplay: matFormulaDisp,
                showFormula: matShowFormula,
                ruleName: ruleName,
                routingType: ruleName,
                isOptical: true,
                section: matSection,
                type: determinedMatType,
                parentWorkName: workTitle,
                comment: mat["Комментарий"] || ''
              });
            }
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

          // APPLY ALL WORKS AND THEIR DECLARED MATERIALS/EQUIPMENT FROM THIS TIER LIST
          tierItems.forEach(work => {
            const rawWorkType = (work["Тип"] || work.type || '').trim().toLowerCase();
            let determinedWorkType = 'работа';
            if (rawWorkType === 'оборудование' || rawWorkType === 'equipment') {
              determinedWorkType = 'оборудование';
            } else if (rawWorkType === 'материал' || rawWorkType === 'material') {
              determinedWorkType = 'материал';
            }
            const isWorkSub = determinedWorkType === 'материал' || determinedWorkType === 'оборудование';
            const formula = work["Формула"] || work.formula || "ДЛИНА";
            const rawVal = evaluateWorkFormula(formula, totalTierLength);
            const unit = work["Единицы измерения"] || work.unit || 'м';
            const vol = roundQuantity(rawVal, unit, rulesData);
            const workTitle = (work["Наименование"] || work.name || primaryWorkTitle).trim();
            const showFormula = shouldShowFormula(work);
            const formulaDisplay = showFormula ? buildWorkFormulaDisplay(formula, totalTierLength, tier.cables.length, unit) : '';
            const targetSection = (work["Раздел"] || work.section || sectionName).trim();

            calculatedWorks.push({
              name: workTitle,
              unit: unit,
              volume: vol,
              formulaDisplay: formulaDisplay,
              showFormula: showFormula,
              ruleName: ruleName,
              routingType: ruleName,
              tierMax: tier.threshold,
              tierKey: tier.key,
              section: targetSection,
              type: determinedWorkType,
              parentWorkName: (isWorkSub && primaryWork !== work) ? primaryWorkTitle : undefined,
              cablesCount: tier.cables.length,
              comment: work["Комментарий"] || work.comment || ''
            });

            // Process materials and equipment declared under this work
            const declaredSubItems = [
              ...(Array.isArray(work["Материалы"]) ? work["Материалы"] : []),
              ...(Array.isArray(work["Оборудование"]) ? work["Оборудование"] : [])
            ];
            declaredSubItems.forEach(mat => {
              const rawMatType = (mat["Тип"] || mat.type || (Array.isArray(work["Оборудование"]) && work["Оборудование"].includes(mat) ? 'оборудование' : 'материал')).trim().toLowerCase();
              let determinedMatType = 'материал';
              if (rawMatType === 'оборудование' || rawMatType === 'equipment') {
                determinedMatType = 'оборудование';
              } else if (rawMatType === 'работа' || rawMatType === 'work') {
                determinedMatType = 'работа';
              }
              const matNameTpl = (mat["Наименование"] || mat.name || '{МАРКА_КАБЕЛЯ}').trim();
              const matUnit = mat["Единицы измерения"] || mat.unit || 'км';
              const matFormula = mat["Формула"] || mat.formula || "ДЛИНА";
              const matShowFormula = shouldShowFormula(mat, showFormula);
              const matSection = (mat["Раздел"] || mat.section || targetSection).trim();

              if (matNameTpl.includes('{МАРКА_КАБЕЛЯ}') || matNameTpl.includes('{КАБЕЛЬ}') || matNameTpl.includes('{МАРКА}')) {
                // Expand material for each electrical cable in this tier
                tier.cables.forEach(c => {
                  const cVol = roundQuantity(evaluateWorkFormula(matFormula, c.length), matUnit, rulesData);
                  const cFormulaDisp = matShowFormula
                    ? (buildWorkFormulaDisplay(matFormula, c.length, 1, matUnit) + (c.weight ? ` (масса 1 м: ${c.weight} кг)` : ''))
                    : '';
                  calculatedWorks.push({
                    name: c.fullDescription || `Кабель ${c.type}`,
                    unit: matUnit,
                    volume: cVol,
                    formulaDisplay: cFormulaDisp,
                    showFormula: matShowFormula,
                    ruleName: ruleName,
                    routingType: c.routingName,
                    cableType: c.type,
                    cableLength: c.length,
                    weight: c.weight,
                    foundInCatalog: !!c.foundInCatalog,
                    section: matSection,
                    type: determinedMatType,
                    parentWorkName: workTitle,
                    comment: mat["Комментарий"] || ''
                  });
                });
              } else {
                // Static item declared under this work
                const matRawVal = evaluateWorkFormula(matFormula, totalTierLength);
                const matVol = roundQuantity(matRawVal, matUnit, rulesData);
                const matFormulaDisp = matShowFormula ? buildWorkFormulaDisplay(matFormula, totalTierLength, tier.cables.length, matUnit) : '';
                calculatedWorks.push({
                  name: matNameTpl,
                  unit: matUnit,
                  volume: matVol,
                  formulaDisplay: matFormulaDisp,
                  showFormula: matShowFormula,
                  ruleName: ruleName,
                  routingType: ruleName,
                  tierMax: tier.threshold,
                  tierKey: tier.key,
                  section: matSection,
                  type: determinedMatType,
                  parentWorkName: workTitle,
                  comment: mat["Комментарий"] || ''
                });
              }
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
        const lVal = Number(routingMap[rName]) || 0;
        if (lVal > 0) {
          totLen += lVal;
          count += 1;
        }
      }
      if (totLen > 0) {
        missingInRules.push({
          type: rName,
          length: totLen,
          count: count,
          ruleName: rName,
          missingType: 'rule'
        });
      }
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

// --------------------------------------------------------------------------
// EQUIPMENT RULES & CALCULATION FUNCTIONS
// --------------------------------------------------------------------------

function getEquipmentRules(rulesData) {
  const rules = getEquipmentRulesList(rulesData);
  return { sectionName: 'Оборудование', rules };
}

function evaluateEquipmentFormula(formula, count) {
  if (!formula || typeof formula !== 'string') return count;
  const clean = formula.trim()
    .replace(/[×✕✖·∗]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[\u2212\u2013\u2014]/g, '-');
  const expr = clean
    .replace(/,/g, '.')
    .replace(/\bКОЛИЧЕСТВО\b/gi, String(count))
    .replace(/\bQTY\b/gi, String(count))
    .replace(/\bCOUNT\b/gi, String(count))
    .replace(/\bШТ\b/gi, String(count))
    .replace(/\bДЛИНА\b/gi, String(count))
    .replace(/\bLENGTH\b/gi, String(count));

  try {
    if (/^[0-9+\-*/().\s]+$/.test(expr)) {
      const val = Function("'use strict'; return (" + expr + ");")();
      if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val;
    }
  } catch (e) {}

  return count;
}

function buildEquipmentFormulaDisplay(formula, count, unit) {
  if (!formula || formula.trim() === 'КОЛИЧЕСТВО' || formula.trim() === '1') {
    return `${count} ${unit || 'шт'}`;
  }
  const disp = formula
    .replace(/\bКОЛИЧЕСТВО\b/gi, `${count} шт`)
    .replace(/\bCOUNT\b/gi, `${count} шт`)
    .replace(/\bQTY\b/gi, `${count} шт`);
  return normalizeFormulaMathOperators(disp);
}

// Calculate works based on equipment summary and rules JSON ("Оборудование")
function calculateWorksFromEquipment(equipmentSummary, rulesData) {
  const eqDict = getEquipmentRulesDict(rulesData);
  const calculatedWorks = [];
  const missingInRules = [];
  const matchedEquipmentKeys = new Set();

  const eqEntries = Object.entries(equipmentSummary || {});

  eqEntries.forEach(([key, eqInfo]) => {
    const itemMark = (eqInfo.mark || '').trim();
    const itemMethod = (eqInfo.method || 'Не указано').trim();
    const count = Number(eqInfo.count) || 0;
    const handles = eqInfo.handles || [];

    if (count <= 0) return;

    // Lookup equipment directly by mark key from "Оборудование" object
    let equipConfig = eqDict[itemMark];
    if (!equipConfig) {
      const foundKey = Object.keys(eqDict).find(k => k.trim().toLowerCase() === itemMark.toLowerCase());
      if (foundKey) {
        equipConfig = eqDict[foundKey];
      }
    }

    const wm = equipConfig ? getEquipmentItemWorksObject(equipConfig) : null;
    let ruleWorks = null;

    if (wm && typeof wm === 'object') {
      if (Array.isArray(wm[itemMethod])) {
        ruleWorks = wm[itemMethod];
      } else {
        const matchedKey = Object.keys(wm).find(k => k.trim().toLowerCase() === itemMethod.toLowerCase());
        if (matchedKey && Array.isArray(wm[matchedKey])) {
          ruleWorks = wm[matchedKey];
        } else if (Array.isArray(wm["Не указано"])) {
          ruleWorks = wm["Не указано"];
        }
      }
    }

    if (Array.isArray(ruleWorks) && ruleWorks.length > 0) {
      matchedEquipmentKeys.add(key);

      const primaryWork = ruleWorks.find(w => {
        if (typeof w === 'string') return true;
        const t = (w["Тип"] || w.type || '').trim().toLowerCase();
        return t !== 'материал' && t !== 'оборудование';
      }) || ruleWorks[0];
      const primaryWorkTitle = (typeof primaryWork === 'string' ? primaryWork : (primaryWork["Наименование"] || primaryWork.name || `Монтаж оборудования ${itemMark}`)).trim();

      ruleWorks.forEach(work => {
        if (typeof work === 'string') {
          calculatedWorks.push({
            name: work.trim(),
            unit: 'шт',
            volume: count,
            volumeFormatted: String(count),
            formula: 'КОЛИЧЕСТВО',
            formulaDisplay: `${count} шт`,
            showFormula: true,
            mark: itemMark,
            method: itemMethod,
            equipmentType: itemMark,
            section: 'Монтажные работы',
            type: 'работа',
            parentWorkName: undefined,
            count: count,
            handles: handles,
            comment: handles.length > 0 ? `handle: ${handles.join(', ')}` : ''
          });
          return;
        }

        const rawWorkType = (work["Тип"] || work.type || '').trim().toLowerCase();
        let determinedWorkType = 'работа';
        if (rawWorkType === 'оборудование' || rawWorkType === 'equipment') {
          determinedWorkType = 'оборудование';
        } else if (rawWorkType === 'материал' || rawWorkType === 'material') {
          determinedWorkType = 'материал';
        }
        const isWorkSub = determinedWorkType === 'материал' || determinedWorkType === 'оборудование';
        const unit = work["Единицы измерения"] || work.unit || 'шт';
        const formula = (work["Формула"] || work.formula || "КОЛИЧЕСТВО").trim();
        const rawVol = evaluateEquipmentFormula(formula, count);
        const vol = roundQuantity(rawVol, unit, rulesData);
        const workTitle = (work["Наименование"] || work.name || primaryWorkTitle).trim();
        const showFormula = shouldShowFormula(work);
        const formulaDisplay = showFormula ? buildEquipmentFormulaDisplay(formula, count, unit) : '';
        const targetSection = (work["Раздел"] || work.section || 'Монтажные работы').trim();

        calculatedWorks.push({
          name: workTitle,
          unit: unit,
          volume: vol,
          volumeFormatted: String(vol),
          formula: formula,
          formulaDisplay: formulaDisplay,
          showFormula: showFormula,
          mark: itemMark,
          method: itemMethod,
          equipmentType: itemMark,
          section: targetSection,
          type: determinedWorkType,
          parentWorkName: (isWorkSub && primaryWork !== work) ? primaryWorkTitle : undefined,
          count: count,
          handles: handles,
          comment: work["Комментарий"] || work.comment || (handles.length > 0 ? `handle: ${handles.join(', ')}` : '')
        });

        // Process materials and equipment declared under this work
        const declaredSubItems = [
          ...(Array.isArray(work["Материалы"]) ? work["Материалы"] : []),
          ...(Array.isArray(work["Оборудование"]) ? work["Оборудование"] : []),
          ...(Array.isArray(work["Ресурсы"]) ? work["Ресурсы"] : []),
          ...(Array.isArray(work.materials) ? work.materials : []),
          ...(Array.isArray(work.equipment) ? work.equipment : [])
        ];
        declaredSubItems.forEach(mat => {
          if (typeof mat === 'string') {
            calculatedWorks.push({
              name: mat.trim(),
              unit: 'шт',
              volume: count,
              volumeFormatted: String(count),
              formula: 'КОЛИЧЕСТВО',
              formulaDisplay: `${count} шт`,
              showFormula: true,
              mark: itemMark,
              method: itemMethod,
              equipmentType: itemMark,
              section: targetSection,
              type: 'материал',
              parentWorkName: workTitle,
              count: count,
              handles: handles,
              comment: ''
            });
            return;
          }

          const isDirectEquip = Array.isArray(work["Оборудование"]) && work["Оборудование"].includes(mat);
          const rawMatType = (mat["Тип"] || mat.type || (isDirectEquip ? 'оборудование' : 'материал')).trim().toLowerCase();
          let determinedMatType = 'материал';
          if (rawMatType === 'оборудование' || rawMatType === 'equipment') {
            determinedMatType = 'оборудование';
          } else if (rawMatType === 'работа' || rawMatType === 'work') {
            determinedMatType = 'работа';
          }
          const matUnit = mat["Единицы измерения"] || mat.unit || 'шт';
          const matFormula = (mat["Формула"] || mat.formula || "КОЛИЧЕСТВО").trim();
          const matRawVol = evaluateEquipmentFormula(matFormula, count);
          const matVol = roundQuantity(matRawVol, matUnit, rulesData);
          const matName = (mat["Наименование"] || mat.name || itemMark).trim();
          const matShowFormula = shouldShowFormula(mat, showFormula);
          const matFormulaDisp = matShowFormula ? buildEquipmentFormulaDisplay(matFormula, count, matUnit) : '';
          const matSection = (mat["Раздел"] || mat.section || targetSection).trim();

          calculatedWorks.push({
            name: matName,
            unit: matUnit,
            volume: matVol,
            volumeFormatted: String(matVol),
            formula: matFormula,
            formulaDisplay: matFormulaDisp,
            showFormula: matShowFormula,
            mark: itemMark,
            method: itemMethod,
            equipmentType: itemMark,
            section: matSection,
            type: determinedMatType,
            parentWorkName: workTitle,
            count: count,
            handles: handles,
            comment: mat["Комментарий"] || mat.comment || ''
          });
        });
      });
    } else {
      missingInRules.push({
        mark: itemMark,
        method: itemMethod,
        type: `${itemMark} (${itemMethod})`,
        count: count,
        handles: handles,
        missingType: equipConfig ? 'no_method_rule' : 'no_rule'
      });
    }
  });

  return {
    works: calculatedWorks,
    missingInRules
  };
}

// --------------------------------------------------------------------------
// AGGREGATION & HIERARCHICAL WORK-MATERIAL GROUPING (ВОР)
// --------------------------------------------------------------------------

/**
 * Merges identical works by Section, Name, and Unit.
 * Materials linked to works via `parentWorkName` are grouped directly under their parent work.
 * Assigns hierarchical numbering: 1, 1.1, 1.2, 2, 2.1...
 */
function aggregateCalculatedWorks(rawWorksList) {
  if (!Array.isArray(rawWorksList) || rawWorksList.length === 0) return [];

  const workGroups = new Map();
  const orphanMaterials = [];

  const isSubItemPredicate = (item) => {
    const rawType = (item.type || '').trim().toLowerCase();
    const hasParent = Boolean(item.parentWorkName && String(item.parentWorkName).trim());
    return Boolean(item.isSubItem || hasParent || rawType === 'материал');
  };

  const rootWorks = rawWorksList.filter(item => !isSubItemPredicate(item));
  const subItems = rawWorksList.filter(item => isSubItemPredicate(item));

  // Pass 1: Register and aggregate all root work groups
  rootWorks.forEach(item => {
    const section = (item.section || 'Монтажные работы').trim();
    const workName = (item.name || '').trim();
    const unit = (item.unit || 'м').trim();
    const groupKey = `${section}__${workName.toLowerCase()}__${unit.toLowerCase()}`;
    const itemShowFormula = (item.showFormula !== undefined) ? item.showFormula : Boolean(item.formulaDisplay && item.formulaDisplay.trim());

    if (!workGroups.has(groupKey)) {
      workGroups.set(groupKey, {
        name: workName,
        unit: unit,
        section: section,
        type: item.type || 'работа',
        volume: 0,
        formulaParts: [],
        showFormula: false,
        handles: new Set(),
        comments: new Set(),
        materialsMap: new Map(),
        isOptical: !!item.isOptical,
        trenchType: item.trenchType,
        equipmentType: item.equipmentType,
        mark: item.mark,
        method: item.method
      });
    }

    const group = workGroups.get(groupKey);
    group.volume += (Number(item.volume) || 0);

    if (itemShowFormula !== false) {
      group.showFormula = true;
      if (item.formulaDisplay && item.formulaDisplay.trim()) {
        group.formulaParts.push(item.formulaDisplay.trim());
      } else if (item.volume) {
        const srcLabel = item.trenchType || item.routingType || item.mark || item.ruleName || '';
        group.formulaParts.push(srcLabel ? `${item.volume} (${srcLabel})` : `${item.volume}`);
      }
    }

    if (Array.isArray(item.handles)) {
      item.handles.forEach(h => group.handles.add(h));
    }
    if (item.comment) {
      group.comments.add(item.comment);
    }
  });

  // Pass 2: Attach sub-items (materials or equipment) to their parent work group
  subItems.forEach(item => {
    const section = (item.section || 'Монтажные работы').trim();
    const parentName = (item.parentWorkName || '').trim();
    const matName = (item.name || '').trim();
    const matUnit = (item.unit || 'м').trim();

    let targetGroup = null;
    if (parentName) {
      for (const grp of workGroups.values()) {
        if (grp.section.toLowerCase() === section.toLowerCase() && grp.name.toLowerCase() === parentName.toLowerCase()) {
          targetGroup = grp;
          break;
        }
      }
      if (!targetGroup) {
        for (const grp of workGroups.values()) {
          if (grp.name.toLowerCase() === parentName.toLowerCase()) {
            targetGroup = grp;
            break;
          }
        }
      }
    }

    if (!targetGroup) {
      const lastGroup = Array.from(workGroups.values()).reverse().find(g => g.section.toLowerCase() === section.toLowerCase());
      if (lastGroup) {
        targetGroup = lastGroup;
      }
    }

    if (targetGroup) {
      const rawMatType = (item.type || '').trim().toLowerCase();
      const isEquip = rawMatType === 'оборудование' || rawMatType === 'equipment';
      const determinedType = isEquip ? 'оборудование' : (rawMatType === 'работа' ? 'работа' : 'материал');
      const matKey = `${matName.toLowerCase()}__${matUnit.toLowerCase()}__${determinedType}`;
      const itemShowFormula = (item.showFormula !== undefined) ? item.showFormula : (targetGroup.showFormula !== false && Boolean(item.formulaDisplay && item.formulaDisplay.trim()));

      if (!targetGroup.materialsMap.has(matKey)) {
        targetGroup.materialsMap.set(matKey, {
          name: matName,
          unit: matUnit,
          section: section,
          type: item.type || determinedType,
          volume: 0,
          formulaParts: [],
          showFormula: false,
          handles: new Set(),
          comments: new Set(),
          parentWorkName: targetGroup.name,
          isOptical: !!item.isOptical,
          foundInCatalog: item.foundInCatalog !== undefined ? item.foundInCatalog : true,
          trenchType: item.trenchType,
          equipmentType: item.equipmentType,
          mark: item.mark,
          method: item.method
        });
      }

      const matEntry = targetGroup.materialsMap.get(matKey);
      matEntry.volume += (Number(item.volume) || 0);

      if (itemShowFormula !== false) {
        matEntry.showFormula = true;
        if (item.formulaDisplay && item.formulaDisplay.trim()) {
          matEntry.formulaParts.push(item.formulaDisplay.trim());
        } else if (item.volume) {
          const srcLabel = item.trenchType || item.routingType || item.mark || '';
          matEntry.formulaParts.push(srcLabel ? `${item.volume} (${srcLabel})` : `${item.volume}`);
        }
      }

      if (Array.isArray(item.handles)) {
        item.handles.forEach(h => matEntry.handles.add(h));
      }
      if (item.comment) {
        matEntry.comments.add(item.comment);
      }
    } else {
      orphanMaterials.push(item);
    }
  });

  const result = [];
  let workIndex = 1;

  workGroups.forEach(work => {
    const roundedWorkVol = roundQuantity(work.volume, work.unit);

    let finalWorkFormula = '';
    if (work.showFormula === false || work.formulaParts.length === 0) {
      finalWorkFormula = '';
    } else if (work.formulaParts.length > 1) {
      const uniqueParts = Array.from(new Set(work.formulaParts));
      if (uniqueParts.length === 1 && uniqueParts[0].includes('=')) {
        finalWorkFormula = uniqueParts[0];
      } else {
        finalWorkFormula = uniqueParts.join(' + ') + ` = ${roundedWorkVol} ${work.unit}`;
      }
    } else if (work.formulaParts.length === 1) {
      finalWorkFormula = work.formulaParts[0];
    } else {
      finalWorkFormula = `${roundedWorkVol} ${work.unit}`;
    }
    finalWorkFormula = normalizeFormulaMathOperators(finalWorkFormula);

    result.push({
      itemNumber: `${workIndex}`,
      name: work.name,
      unit: work.unit,
      volume: roundedWorkVol,
      volumeFormatted: String(roundedWorkVol),
      formulaDisplay: finalWorkFormula,
      showFormula: Boolean(finalWorkFormula),
      section: work.section,
      type: work.type || 'работа',
      isParentWork: true,
      isSubItem: false,
      subItemsCount: work.materialsMap.size,
      handles: Array.from(work.handles),
      comment: Array.from(work.comments).join('; '),
      isOptical: work.isOptical,
      trenchType: work.trenchType,
      equipmentType: work.equipmentType,
      mark: work.mark,
      method: work.method
    });

    let matIndex = 1;
    work.materialsMap.forEach(mat => {
      const roundedMatVol = roundQuantity(mat.volume, mat.unit);

      let finalMatFormula = '';
      if (mat.showFormula === false || mat.formulaParts.length === 0) {
        finalMatFormula = '';
      } else if (mat.formulaParts.length > 1) {
        const uniqueParts = Array.from(new Set(mat.formulaParts));
        finalMatFormula = uniqueParts.join(' + ') + ` = ${roundedMatVol} ${mat.unit}`;
      } else if (mat.formulaParts.length === 1) {
        finalMatFormula = mat.formulaParts[0];
      } else {
        finalMatFormula = `${roundedMatVol} ${mat.unit}`;
      }
      finalMatFormula = normalizeFormulaMathOperators(finalMatFormula);

      result.push({
        itemNumber: `${workIndex}.${matIndex}`,
        name: mat.name,
        unit: mat.unit,
        volume: roundedMatVol,
        volumeFormatted: String(roundedMatVol),
        formulaDisplay: finalMatFormula,
        showFormula: Boolean(finalMatFormula),
        section: mat.section,
        type: mat.type || 'материал',
        isParentWork: false,
        isSubItem: true,
        parentWorkName: work.name,
        parentNumber: `${workIndex}`,
        handles: Array.from(mat.handles),
        comment: Array.from(mat.comments).join('; '),
        isOptical: mat.isOptical,
        foundInCatalog: mat.foundInCatalog,
        trenchType: mat.trenchType,
        equipmentType: mat.equipmentType,
        mark: mat.mark,
        method: mat.method
      });
      matIndex++;
    });

    workIndex++;
  });

  orphanMaterials.forEach((orphan, oIdx) => {
    const rawType = (orphan.type || '').trim().toLowerCase();
    const isEquip = rawType === 'оборудование' || rawType === 'equipment';
    const isShowFormula = orphan.showFormula !== false && Boolean(orphan.formulaDisplay && orphan.formulaDisplay.trim());
    const orphanVol = roundQuantity(orphan.volume, orphan.unit);
    result.push({
      itemNumber: `${workIndex}.${oIdx + 1}`,
      name: orphan.name,
      unit: orphan.unit,
      volume: orphanVol,
      volumeFormatted: String(orphanVol),
      formulaDisplay: isShowFormula ? normalizeFormulaMathOperators(orphan.formulaDisplay || '') : '',
      showFormula: isShowFormula,
      section: orphan.section || 'Монтажные работы',
      type: orphan.type || (isEquip ? 'оборудование' : 'материал'),
      isParentWork: false,
      isSubItem: true,
      parentWorkName: orphan.parentWorkName || (isEquip ? 'Прочее оборудование' : 'Прочие материалы'),
      handles: orphan.handles || [],
      comment: orphan.comment || ''
    });
  });

  return result;
}

// Get combined works and missing items from Trenches ("Строительные работы"), Cables ("Монтажные работы"), and Equipment ("Оборудование")
function getAllCalculatedWorks() {
  const trenchSummary = getActiveTrenchSummary();
  const trenchCalc = calculateWorksFromTrenches(trenchSummary, currentWorksRules);

  const cableData = getActiveCableSummary();
  const cableCalc = calculateWorksFromCables(cableData.summary, currentWorksRules);

  const equipmentData = getActiveEquipmentSummary();
  const equipmentCalc = calculateWorksFromEquipment(equipmentData.summary, currentWorksRules);

  const rawAllWorks = [ ...(trenchCalc.works || []), ...(cableCalc.works || []), ...(equipmentCalc.works || []) ];
  const allWorks = aggregateCalculatedWorks(rawAllWorks);

  // Group works by actual target section:
  // Items with section "Строительные работы" (or containing "строительн") go to trenchWorks (Section 1)
  // Items with other sections (such as "Монтажные работы") go to cableWorks (Section 2)
  const trenchWorks = allWorks.filter(w => {
    const s = (w.section || '').trim().toLowerCase();
    return s === 'строительные работы' || s.includes('строительн');
  });
  const cableWorks = allWorks.filter(w => !trenchWorks.includes(w));

  return {
    works: allWorks,
    trenchWorks: trenchWorks,
    cableWorks: cableWorks,
    missingInRules: [ ...trenchCalc.missingInRules, ...cableCalc.missingInRules, ...equipmentCalc.missingInRules ],
    trenchMissing: trenchCalc.missingInRules,
    cableMissing: cableCalc.missingInRules,
    equipmentMissing: equipmentCalc.missingInRules,
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
function formatGgeQuantity(val, unit = '', rulesData = currentWorksRules) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  const decimals = getVolumeDecimals(unit, rulesData);
  const num = Number(val);
  return num.toFixed(decimals);
}

// Generate GGE XML format (QuantityTakeoff-3_01.xsd) for Главгосэкспертиза
// Supports numberingMode: 'hierarchical' (1, 1.1, 1.2, 2, 2.1...) or 'sequential' (1, 2, 3, 4, 5...)
function generateVorGgeXml(worksData, currentFileName, numberingMode = null) {
  const settings = getRulesSettings(currentWorksRules);
  const effectiveNumMode = numberingMode || (settings.numberingMode === 'сквозная' ? 'sequential' : 'hierarchical');
  const ggeVersion = settings.ggeVersion || '3.01';
  const accessLevel = settings.accessLevel || 'коммерческая тайна';
  const softName = settings.softName || 'Программный комплекс "Строительный эксперт"  v7.3.1.7813';
  const pluginVersion = settings.pluginVersion || 'Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13';

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const exportDateTime = `${year}-${pad(month)}-${pad(day)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const objectName = currentFileName ? currentFileName.replace(/\.[^/.]+$/, '') : '';

  // Group works strictly by Section from rules structure
  const sectionsMap = new Map();
  worksData.forEach(w => {
    const secName = (w.section || '').trim() || 'Без раздела';
    if (!sectionsMap.has(secName)) {
      sectionsMap.set(secName, []);
    }
    sectionsMap.get(secName).push(w);
  });

  let sectionNum = 1;
  let globalSequentialNum = 1;
  let sectionsXml = '';

  for (const [secName, works] of sectionsMap.entries()) {
    let worksXml = '';

    works.forEach(work => {
      let ggeType = 'работа';
      const rawType = (work.type || '').trim().toLowerCase();
      if (rawType === 'оборудование' || rawType === 'equipment') {
        ggeType = 'оборудование';
      } else if (rawType === 'материал' || rawType === 'material') {
        ggeType = 'материал';
      } else if (work.isSubItem) {
        ggeType = 'материал';
      } else {
        ggeType = 'работа';
      }
      const typeXml = `\t\t\t\t<Type>${ggeType}</Type>\n`;
      const commentXml = work.comment ? `\t\t\t\t<Comment>${escapeXml(work.comment)}</Comment>\n` : '';
      const unitStr = escapeXml(work.unit || 'м');
      const qtyStr = formatGgeQuantity(work.volume, work.unit, currentWorksRules);
      const isShowFormula = work.showFormula !== false && Boolean(work.formulaDisplay && work.formulaDisplay.trim());
      const formulaRaw = isShowFormula ? work.formulaDisplay : '';
      const formulaStr = escapeXml(normalizeFormulaMathOperators(formulaRaw));

      let numStr = '';
      if (effectiveNumMode === 'sequential' || effectiveNumMode === 'continuous') {
        // Mode 2: Continuous sequential numbering (1, 2, 3, 4, 5...)
        numStr = String(globalSequentialNum++);
      } else {
        // Mode 1: Hierarchical numbering (1, 1.1, 1.2, 2, 2.1...)
        numStr = work.itemNumber || String(globalSequentialNum++);
      }

      worksXml += `\t\t\t<Work>
\t\t\t\t<Num>${escapeXml(numStr)}</Num>
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
\t\t<Name>${escapeXml(softName)}</Name>
\t\t<Version>${escapeXml(pluginVersion)}</Version>
\t</Soft>
\t<File>
\t\t<Type>Ведомость объемов работ</Type>
\t\t<Version>${escapeXml(ggeVersion)}</Version>
\t</File>
</Meta>
<AccessLevel>${escapeXml(accessLevel)}</AccessLevel>
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
function generateVorWorkbook(worksData, currentFileName, numberingMode = 'hierarchical') {
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

    let secSequentialNum = 1;
    works.forEach((w, idx) => {
      dataRowIndexes.push({ rowIndex: aoa.length, unit: w.unit });
      const isMaterial = w.isSubItem || w.type === 'материал';
      let numStr = '';
      if (numberingMode === 'sequential' || numberingMode === 'continuous') {
        numStr = secSequentialNum++;
      } else {
        numStr = w.itemNumber || (idx + 1);
      }
      const nameStr = isMaterial ? `    ↳ ${w.name}` : w.name;

      const isShowFormula = w.showFormula !== false && Boolean(w.formulaDisplay && w.formulaDisplay.trim());

      aoa.push([
        numStr,
        nameStr,
        w.unit,
        w.volume,
        isShowFormula ? normalizeFormulaMathOperators(w.formulaDisplay) : '',
        '', // Ссылка на чертежи
        '', // Наименование файла
        '', // Номера страниц
        w.comment || ''  // Дополнительная информация
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

  // Format Volume column as numeric with precision based on unit settings
  dataRowIndexes.forEach(({ rowIndex, unit }) => {
    const cellAddr = XLSX.utils.encode_cell({ r: rowIndex, c: 3 });
    if (ws[cellAddr]) {
      ws[cellAddr].t = 'n';
      const dec = getVolumeDecimals(unit, currentWorksRules);
      const decFmt = dec > 0 ? ('.' + '0'.repeat(dec)) : '';
      ws[cellAddr].z = `#,##0${decFmt}`;
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

// Collect all warnings and unannounced rules / items across all sections
function collectAllGgeWarnings(calcData) {
  if (!calcData) calcData = getAllCalculatedWorks();

  const trenchMissing = calcData.trenchMissing || [];
  const cableMissing = calcData.cableMissing || [];
  const equipmentMissing = calcData.equipmentMissing || [];
  const cableMissingInCatalog = calcData.cableMissingInCatalog || [];

  const couplingsSummary = calcData.couplingsSummary || {};
  const couplingsMissing = [
    ...(couplingsSummary.missingCouplings || []),
    ...(couplingsSummary.missingInCatalog || [])
  ];

  const totalCount = trenchMissing.length + cableMissing.length + equipmentMissing.length + cableMissingInCatalog.length + couplingsMissing.length;

  return {
    hasWarnings: totalCount > 0,
    totalCount,
    worksCount: (calcData.works || []).length,
    trenchMissing,
    cableMissing,
    equipmentMissing,
    cableMissingInCatalog,
    couplingsMissing,
    calcData
  };
}

// Show modal window with all accumulated notices before GGE formation
function showGgeExportWarningsModal(warningsInfo, onProceed) {
  const modalEl = document.getElementById('ggeExportWarningsModal');
  const bodyEl = document.getElementById('ggeExportWarningsModalBody');
  const confirmBtn = document.getElementById('confirmProceedGgeDownloadBtn');
  const openRulesBtn = document.getElementById('openRulesFromGgeModalBtn');

  if (!modalEl || !bodyEl) {
    if (typeof onProceed === 'function') onProceed();
    return;
  }

  const { totalCount, worksCount, trenchMissing, cableMissing, equipmentMissing, cableMissingInCatalog, couplingsMissing } = warningsInfo;

  let bodyHtml = `
    <div class="alert alert-warning border border-warning-subtle d-flex align-items-start gap-2 mb-3 py-2 px-3">
      <i class='bx bx-error-circle fs-4 text-warning flex-shrink-0 mt-0_5'></i>
      <div class="small">
        <div class="fw-bold mb-0_5">Обнаружено замечаний: ${totalCount} (ВОР содержит ${worksCount} сметных позиций)</div>
        <div class="text-muted">Ниже сгруппированы все работы, оборудование и параметры, для которых в правилах сметных норм отсутствуют описания или записи в справочниках. Вы можете добавить недостающие нормы в JSON или продолжить экспорт ВОР.</div>
      </div>
    </div>
  `;

  // 1. Equipment section
  if (equipmentMissing.length > 0) {
    let eqRows = '';
    equipmentMissing.forEach((eq, idx) => {
      const handlesStr = (eq.handles && eq.handles.length > 0) ? `<code>${escapeHtml(eq.handles.join(', '))}</code>` : '<span class="text-muted">-</span>';
      eqRows += `
        <tr>
          <td class="text-center text-muted small">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(eq.mark || eq.type || 'Без марки')}</td>
          <td class="cell-wrap text-secondary small">${escapeHtml(eq.method || 'Не указано')}</td>
          <td class="text-center font-monospace fw-semibold">${eq.count || 1} шт</td>
          <td class="cell-wrap small">${handlesStr}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <div class="card mb-3 border-warning-subtle shadow-none">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark"><i class='bx bx-cube me-1'></i>Оборудование</span>
            <span class="fw-semibold small">Не объявлено в разделе «Оборудование» (${equipmentMissing.length} поз.)</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-warning text-dark fw-semibold d-inline-flex align-items-center gap-1" id="btnAddEquipmentFromModal">
            <i class='bx bx-plus-circle'></i> Добавить марки в JSON правил
          </button>
        </div>
        <div class="table-responsive" style="max-height: 220px;">
          <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.82rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 35px;" class="text-center">№</th>
                <th>Марка оборудования</th>
                <th>Способ установки</th>
                <th style="width: 90px;" class="text-center">Кол-во</th>
                <th>handle блоков</th>
              </tr>
            </thead>
            <tbody>${eqRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 2. Trenches / Construction section
  if (trenchMissing.length > 0) {
    let trRows = '';
    trenchMissing.forEach((tr, idx) => {
      const lenStr = tr.length !== undefined ? `${Math.round(tr.length).toLocaleString('ru-RU')} м` : '-';
      trRows += `
        <tr>
          <td class="text-center text-muted small">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(tr.type || 'Способ')}</td>
          <td class="text-end font-monospace fw-semibold">${lenStr}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <div class="card mb-3 border-warning-subtle shadow-none">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark"><i class='bx bx-layer me-1'></i>Строительные работы</span>
            <span class="fw-semibold small">Не объявлены способы прокладки (${trenchMissing.length} поз.)</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-warning text-dark fw-semibold d-inline-flex align-items-center gap-1" id="btnAddTrenchFromModal">
            <i class='bx bx-plus-circle'></i> Добавить способы в JSON правил
          </button>
        </div>
        <div class="table-responsive" style="max-height: 220px;">
          <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.82rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 35px;" class="text-center">№</th>
                <th>Способ прокладки</th>
                <th style="width: 100px;" class="text-end">Метраж</th>
              </tr>
            </thead>
            <tbody>${trRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. Cables / Installation section
  if (cableMissing.length > 0) {
    let cbRows = '';
    cableMissing.forEach((cb, idx) => {
      const lenStr = cb.length !== undefined ? `${Math.round(cb.length).toLocaleString('ru-RU')} м` : '-';
      let reason = 'Нет правила в разделе «Монтажные работы»';
      if (cb.missingType === 'optical') reason = 'Отсутствует норма для оптического кабеля';
      if (cb.missingType === 'tier') reason = `Отсутствует весовая ступень (до ${cb.tierMax} кг/м)`;
      cbRows += `
        <tr>
          <td class="text-center text-muted small">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(cb.type || 'Способ')}</td>
          <td class="text-end font-monospace fw-semibold">${lenStr}</td>
          <td class="cell-wrap text-secondary small">${reason}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <div class="card mb-3 border-warning-subtle shadow-none">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark"><i class='bx bx-wrench me-1'></i>Монтажные работы</span>
            <span class="fw-semibold small">Не объявлены сметные нормы кабелей (${cableMissing.length} поз.)</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-warning text-dark fw-semibold d-inline-flex align-items-center gap-1" id="btnAddCableWaysFromModal">
            <i class='bx bx-plus-circle'></i> Добавить работы в JSON правил
          </button>
        </div>
        <div class="table-responsive" style="max-height: 220px;">
          <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.82rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 35px;" class="text-center">№</th>
                <th>Способ прокладки</th>
                <th style="width: 100px;" class="text-end">Метраж</th>
                <th>Причина замечания</th>
              </tr>
            </thead>
            <tbody>${cbRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 4. Cables not in Catalog
  if (cableMissingInCatalog.length > 0) {
    let catRows = '';
    cableMissingInCatalog.forEach((cat, idx) => {
      const lenStr = cat.length !== undefined ? `${Math.round(cat.length).toLocaleString('ru-RU')} м` : '-';
      catRows += `
        <tr>
          <td class="text-center text-muted small">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(cat.type || 'Марка')}</td>
          <td class="text-center font-monospace">${cat.weight || 0.35} кг/м</td>
          <td class="text-end font-monospace fw-semibold">${lenStr}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <div class="card mb-3 border-warning-subtle shadow-none">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-secondary"><i class='bx bx-book-open me-1'></i>Справочник кабелей</span>
            <span class="fw-semibold small">Марки отсутствуют в справочнике весов (${cableMissingInCatalog.length} поз.)</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-warning text-dark fw-semibold d-inline-flex align-items-center gap-1" id="btnAddCablesToCatalogFromModal">
            <i class='bx bx-plus-circle'></i> Добавить марки в справочник
          </button>
        </div>
        <div class="table-responsive" style="max-height: 220px;">
          <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.82rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 35px;" class="text-center">№</th>
                <th>Марка кабеля</th>
                <th style="width: 120px;" class="text-center">Принят вес</th>
                <th style="width: 100px;" class="text-end">Метраж</th>
              </tr>
            </thead>
            <tbody>${catRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 5. Couplings Missing
  if (couplingsMissing.length > 0) {
    let coupRows = '';
    couplingsMissing.forEach((cp, idx) => {
      const typeStr = cp.couplingType
        ? `Муфта «${cp.couplingType}»`
        : (cp.cable ? `Кабель «${cp.cable}»` : (cp.cableType || cp.type || 'Кабель'));
      const reason = cp.reason || (cp.couplingsNeeded
        ? `В справочнике кабелей не указан тип муфты (требуется ${cp.couplingsNeeded} шт.)`
        : (cp.couplingType ? `Муфта отсутствует в справочнике муфт` : 'Не задана марка муфты или строительная длина'));
      coupRows += `
        <tr>
          <td class="text-center text-muted small">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(typeStr)}</td>
          <td class="cell-wrap text-secondary small">${escapeHtml(reason)}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <div class="card mb-3 border-warning-subtle shadow-none">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-info text-dark"><i class='bx bx-git-merge me-1'></i>Соединительные муфты</span>
            <span class="fw-semibold small">Требуется сопоставление муфт (${couplingsMissing.length} поз.)</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-primary fw-semibold d-inline-flex align-items-center gap-1" id="btnOpenCouplingsFromModal">
            <i class='bx bx-slider'></i> Настроить справочник муфт
          </button>
        </div>
        <div class="table-responsive" style="max-height: 220px;">
          <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.82rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 35px;" class="text-center">№</th>
                <th>Элемент (кабель / муфта)</th>
                <th>Замечание</th>
              </tr>
            </thead>
            <tbody>${coupRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  bodyEl.innerHTML = bodyHtml;

  // Bind Quick Add buttons in modal
  const btnEq = bodyEl.querySelector('#btnAddEquipmentFromModal');
  if (btnEq) {
    btnEq.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      addMissingEquipmentToRules(equipmentMissing);
    });
  }

  const btnTr = bodyEl.querySelector('#btnAddTrenchFromModal');
  if (btnTr) {
    btnTr.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      addMissingTrenchTypesToRules(trenchMissing);
    });
  }

  const btnCb = bodyEl.querySelector('#btnAddCableWaysFromModal');
  if (btnCb) {
    btnCb.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      addMissingCableWaysToRules(cableMissing);
    });
  }

  const btnCat = bodyEl.querySelector('#btnAddCablesToCatalogFromModal');
  if (btnCat) {
    btnCat.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      addMissingCablesToCatalog(cableMissingInCatalog);
    });
  }

  const btnCp = bodyEl.querySelector('#btnOpenCouplingsFromModal');
  if (btnCp) {
    btnCp.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      openWorksRulesModal('couplings');
    });
  }

  // Footer Actions
  if (openRulesBtn) {
    openRulesBtn.onclick = () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      openWorksRulesModal('editor');
    };
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      if (typeof onProceed === 'function') {
        onProceed();
      }
    };
  }

  // Show the modal
  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

// Download GGE file with selected numbering mode (or read from settings)
function downloadGgeFile(numberingMode) {
  if (!numberingMode) {
    const settings = getRulesSettings(currentWorksRules);
    numberingMode = settings.numberingMode === 'сквозная' ? 'sequential' : 'hierarchical';
  }

  const { works } = getAllCalculatedWorks();

  if (works.length === 0) {
    showToast('Не найдено подходящих сметных норм для выгрузки ВОР', 'error', 'Ошибка');
    return;
  }

  const xmlContent = generateVorGgeXml(works, currentFileName, numberingMode);
  let baseName = currentFileName
    ? currentFileName.replace(/\.[^/.]+$/, '').trim()
    : 'Ведомость_объемов_работ';
  if (baseName.toLowerCase().endsWith('.gge')) {
    baseName = baseName.slice(0, -4);
  }
  const outFileName = `${baseName.startsWith('ВОР_') ? baseName : 'ВОР_' + baseName}.gge`;

  const blob = new Blob([xmlContent], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const modeLabel = (numberingMode === 'sequential') ? 'сквозная (1, 2, 3...)' : 'иерархическая (1, 1.1, 1.2...)';
  showToast(`Ведомость объемов работ (ВОР) успешно экспортирована в «${outFileName}» (${works.length} поз., нумерация: ${modeLabel})`, 'success', 'Экспорт GGE завершен');
}

// Export calculation results directly to XML GGE (.gge) matching Главгосэкспертиза format
function exportCalculationResults(skipWarningsCheck = false) {
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

  const calcData = getAllCalculatedWorks();
  if (!calcData.works || calcData.works.length === 0) {
    showToast('Не найдено подходящих сметных норм для выгрузки ВОР', 'error', 'Ошибка');
    return;
  }

  const settings = getRulesSettings(currentWorksRules);
  const mode = settings.numberingMode === 'сквозная' ? 'sequential' : 'hierarchical';

  const warnings = collectAllGgeWarnings(calcData);

  if (!skipWarningsCheck && warnings.hasWarnings) {
    showGgeExportWarningsModal(warnings, () => downloadGgeFile(mode));
  } else {
    downloadGgeFile(mode);
  }
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
      .map(m => `«${m.type}» (${m.length !== undefined ? Math.round(m.length) + ' м' : (m.count || 0) + ' шт'})`)
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
  const settings = getRulesSettings(currentWorksRules);
  const mode = settings.numberingMode === 'сквозная' ? 'sequential' : 'hierarchical';
  const wb = generateVorWorkbook(works, currentFileName, mode);
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


// --------------------------------------------------------------------------
// WORKS RULES & NORMS JSON EDITOR (WITH CODEMIRROR & CODE FOLDING)
// --------------------------------------------------------------------------

// Fold all collapsible blocks in JSON editor
function foldAllWorksJson() {
  if (worksJsonCodeMirror) {
    worksJsonCodeMirror.operation(() => {
      for (let l = worksJsonCodeMirror.firstLine(); l <= worksJsonCodeMirror.lastLine(); ++l) {
        worksJsonCodeMirror.foldCode({ line: l, ch: 0 }, null, "fold");
      }
    });
    showToast('Все узлы JSON свернуты', 'info', 'Сворачивание');
  }
}

// Unfold all collapsible blocks in JSON editor
function unfoldAllWorksJson() {
  if (worksJsonCodeMirror) {
    worksJsonCodeMirror.operation(() => {
      for (let l = worksJsonCodeMirror.firstLine(); l <= worksJsonCodeMirror.lastLine(); ++l) {
        worksJsonCodeMirror.foldCode({ line: l, ch: 0 }, null, "unfold");
      }
    });
    showToast('Все узлы JSON развернуты', 'info', 'Разворачивание');
  }
}

// Initialize CodeMirror instance on textarea if available
function initWorksJsonCodeMirror() {
  const textarea = document.getElementById('worksJsonEditorTextarea');
  if (!textarea) return null;

  if (worksJsonCodeMirror) {
    worksJsonCodeMirror.refresh();
    return worksJsonCodeMirror;
  }

  if (typeof CodeMirror !== 'undefined') {
    worksJsonCodeMirror = CodeMirror.fromTextArea(textarea, {
      lineNumbers: true,
      mode: { name: "javascript", json: true },
      lineWrapping: false,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      matchBrackets: true,
      autoCloseBrackets: true,
      tabSize: 2,
      indentUnit: 2,
      extraKeys: {
        "Ctrl-Q": function(cm) { cm.foldCode(cm.getCursor()); },
        "Cmd-Q": function(cm) { cm.foldCode(cm.getCursor()); },
        "Ctrl-F": "findPersistent",
        "Cmd-F": "findPersistent"
      }
    });

    worksJsonCodeMirror.on('change', () => {
      textarea.value = worksJsonCodeMirror.getValue();
      validateWorksJsonInput();
    });

    // Refresh layout when modal or tab is shown
    const modalEl = document.getElementById('worksRulesModal');
    if (modalEl) {
      modalEl.addEventListener('shown.bs.modal', () => {
        setTimeout(() => {
          if (worksJsonCodeMirror) worksJsonCodeMirror.refresh();
        }, 50);
      });
    }

    const jsonTabBtn = document.getElementById('tabWorksJsonBtn');
    if (jsonTabBtn) {
      jsonTabBtn.addEventListener('shown.bs.tab', () => {
        setTimeout(() => {
          if (worksJsonCodeMirror) worksJsonCodeMirror.refresh();
        }, 50);
      });
    }
  }

  return worksJsonCodeMirror;
}

// Helper to focus, center-scroll, select and visually highlight newly added JSON node in CodeMirror
function highlightAndScrollToJsonNode(targetString, isKey = true) {
  // 1. Switch to JSON editor tab
  const jsonTabBtn = document.getElementById('tabWorksJsonBtn');
  if (jsonTabBtn && window.bootstrap && bootstrap.Tab) {
    bootstrap.Tab.getOrCreateInstance(jsonTabBtn).show();
  }

  // 2. Perform CodeMirror scroll, selection, fold expansion and animated line highlight
  setTimeout(() => {
    if (!worksJsonCodeMirror) {
      const textarea = document.getElementById('worksJsonEditorTextarea');
      if (textarea) {
        const searchPattern = isKey ? `"${targetString}":` : `"${targetString}"`;
        let idx = textarea.value.lastIndexOf(searchPattern);
        if (idx === -1) idx = textarea.value.lastIndexOf(targetString);
        if (idx !== -1) {
          const startIdx = idx + (isKey ? 1 : (textarea.value.charAt(idx) === '"' ? 1 : 0));
          textarea.focus();
          textarea.setSelectionRange(startIdx, startIdx + targetString.length);
        }
      }
      return;
    }

    worksJsonCodeMirror.refresh();

    const doc = worksJsonCodeMirror.getDoc();
    const fullText = doc.getValue();

    // Look specifically for the KEY declaration first, to avoid matching substrings in "Полное описание"
    let searchStr = isKey ? `"${targetString}":` : `"${targetString}"`;
    let foundIndex = fullText.lastIndexOf(searchStr);
    if (foundIndex === -1) {
      searchStr = targetString;
      foundIndex = fullText.lastIndexOf(searchStr);
    }

    if (foundIndex !== -1) {
      // Find position of the exact target string inside the match for clean cursor selection
      const nameIndex = fullText.indexOf(targetString, foundIndex);
      const actualPos = nameIndex !== -1 ? nameIndex : foundIndex;
      const posFrom = doc.posFromIndex(actualPos);
      const posTo = doc.posFromIndex(actualPos + targetString.length);

      let startLine = posFrom.line;

      // If rule item starts with '{' on line above
      if (!isKey && startLine > 0) {
        const prevLine = doc.getLine(startLine - 1).trim();
        if (prevLine === '{') {
          startLine = startLine - 1;
        }
      }

      // Unfold code around this line
      if (typeof worksJsonCodeMirror.foldCode === 'function') {
        for (let l = Math.max(0, startLine - 15); l <= Math.min(doc.lineCount() - 1, startLine + 50); l++) {
          worksJsonCodeMirror.foldCode({ line: l, ch: 0 }, null, "unfold");
        }
      }

      // Determine exact end line of this JSON object by tracking bracket/brace depth
      let endLine = startLine;
      let openBraces = 0;
      let startedCounting = false;
      
      for (let l = startLine; l < doc.lineCount(); l++) {
        const lineText = doc.getLine(l);
        for (let ch = 0; ch < lineText.length; ch++) {
          const c = lineText[ch];
          if (c === '{' || c === '[') {
            openBraces++;
            startedCounting = true;
          } else if (c === '}' || c === ']') {
            openBraces--;
          }
        }
        if (startedCounting && openBraces <= 0) {
          endLine = l;
          break;
        }
      }

      if (endLine < startLine) {
        endLine = Math.min(doc.lineCount() - 1, startLine + (isKey ? 6 : 14));
      }

      // Center the inserted block in the viewport
      const lineCoords = worksJsonCodeMirror.charCoords(posFrom, "local");
      const editorHeight = worksJsonCodeMirror.getWrapperElement().clientHeight || 420;
      const targetScrollTop = Math.max(0, lineCoords.top - Math.floor(editorHeight / 3));
      worksJsonCodeMirror.scrollTo(null, targetScrollTop);

      // Select the key/name so user can immediately type a replacement
      doc.setSelection(posFrom, posTo);
      worksJsonCodeMirror.focus();

      // Add animated glow pulse highlight to the EXACT lines of the added block
      const highlightedLines = [];
      for (let l = startLine; l <= endLine; l++) {
        worksJsonCodeMirror.addLineClass(l, 'background', 'cm-new-node-glow');
        highlightedLines.push(l);
      }

      setTimeout(() => {
        highlightedLines.forEach(l => {
          worksJsonCodeMirror.removeLineClass(l, 'background', 'cm-new-node-glow');
        });
      }, 3600);
    }
  }, 160);
}

// Open Works Rules Modal with specific tab active ('editor', 'cards', 'cables', 'couplings', 'equipment', or 'settings')
function openWorksRulesModal(activeTab = 'editor') {
  const modalEl = document.getElementById('worksRulesModal');
  if (!modalEl) return;

  try {
    initWorksJsonCodeMirror();
    setWorksJsonEditorValue(JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": {}, "Монтажные работы": {}, "Оборудование": {} }, null, 2));
    validateWorksJsonInput();
  } catch (err) {
    console.warn('Editor sync warning:', err);
  }

  try {
    renderRulesModalContent();
  } catch (err) {
    console.warn('Modal content render warning:', err);
  }

  try {
    let tabBtnId = 'tabWorksJsonBtn';
    if (activeTab === 'cards') tabBtnId = 'tabWorksCardsBtn';
    else if (activeTab === 'cables') tabBtnId = 'tabWorksCablesBtn';
    else if (activeTab === 'couplings') tabBtnId = 'tabWorksCouplingsBtn';
    else if (activeTab === 'equipment') tabBtnId = 'tabWorksEquipmentBtn';
    else if (activeTab === 'settings') tabBtnId = 'tabWorksSettingsBtn';

    const tabBtn = document.getElementById(tabBtnId);
    if (tabBtn && window.bootstrap && bootstrap.Tab) {
      bootstrap.Tab.getOrCreateInstance(tabBtn).show();
    }
  } catch (err) {
    console.warn('Tab switch warning:', err);
  }

  try {
    if (window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  } catch (err) {
    console.error('Failed to open modal with Bootstrap:', err);
  }

  setTimeout(() => {
    try {
      if (worksJsonCodeMirror) worksJsonCodeMirror.refresh();
    } catch {
      // ignore refresh errors
    }
  }, 100);
}
window.openWorksRulesModal = openWorksRulesModal;

// Validate Works Rules JSON in textarea/CodeMirror, update stats, status badge and error display
function validateWorksJsonInput() {
  const val = getWorksJsonEditorValue();
  const badge = document.getElementById('worksJsonValidationBadge');
  const errorAlert = document.getElementById('worksJsonErrorAlert');
  const errorMessage = document.getElementById('worksJsonErrorMessage');
  const applyBtn = document.getElementById('applyWorksRulesBtn');
  const statLines = document.getElementById('worksStatLines');
  const statChars = document.getElementById('worksStatChars');

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

    const tabCouplingsBadge = document.getElementById('tabWorksCouplingsCountBadge');
    if (tabCouplingsBadge) tabCouplingsBadge.textContent = totalCouplingsCount;

    // Count equipment in rules
    const eqList = getEquipmentRulesList(parsed);
    const tabEquipmentBadge = document.getElementById('tabWorksEquipmentCountBadge');
    if (tabEquipmentBadge) tabEquipmentBadge.textContent = eqList.length;

    if (badge) {
      badge.className = 'badge bg-success-subtle text-success border border-success-subtle ms-2';
      badge.innerHTML = "<i class='bx bx-check me-1'></i>Корректный JSON";
    }
    if (errorAlert) errorAlert.classList.add('d-none');
    if (applyBtn) applyBtn.disabled = false;
    return true;
  } catch (err) {
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
  initWorksJsonCodeMirror();

  const textarea = document.getElementById('worksJsonEditorTextarea');
  if (textarea) {
    textarea.addEventListener('input', validateWorksJsonInput);

    // Support Tab key indentation inside fallback textarea
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

  // Fold all JSON nodes button
  const foldAllBtn = document.getElementById('foldAllWorksJsonBtn');
  if (foldAllBtn) {
    foldAllBtn.addEventListener('click', foldAllWorksJson);
  }

  // Unfold all JSON nodes button
  const unfoldAllBtn = document.getElementById('unfoldAllWorksJsonBtn');
  if (unfoldAllBtn) {
    unfoldAllBtn.addEventListener('click', unfoldAllWorksJson);
  }

  // Format JSON button
  const formatBtn = document.getElementById('formatWorksJsonBtn');
  if (formatBtn) {
    formatBtn.addEventListener('click', () => {
      try {
        const val = getWorksJsonEditorValue();
        const parsed = JSON.parse(val);
        setWorksJsonEditorValue(JSON.stringify(parsed, null, 2));
        validateWorksJsonInput();
        showToast('JSON сметных норм отформатирован', 'info', 'Форматирование');
      } catch (err) {
        showToast('Невозможно отформатировать: ' + err.message, 'error', 'Ошибка синтаксиса');
      }
    });
  }

  // Add rule template button (+ Способ) and Quick Add in cards tab
  const insertRuleSample = () => {
    try {
      const val = getWorksJsonEditorValue();
      let currentObj;
      try {
        currentObj = JSON.parse(val);
      } catch {
        currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": [] }));
      }

      const targetKey = (currentObj && typeof currentObj === 'object' && !Array.isArray(currentObj))
        ? ((currentObj["Монтажные работы"] && typeof currentObj["Монтажные работы"] === 'object') ? "Монтажные работы" : "Строительные работы")
        : "Монтажные работы";

      const isMr = targetKey.toLowerCase().includes('монтаж');
      let baseRuleName = isMr ? "Новый способ прокладки (например, ГНБ)" : "Новый способ разработки грунта";
      
      // Determine unique rule name if already exists
      let sampleRuleName = baseRuleName;
      if (currentObj && typeof currentObj === 'object') {
        const rulesMap = (currentObj[targetKey] && typeof currentObj[targetKey] === 'object' && !Array.isArray(currentObj[targetKey])) ? currentObj[targetKey] : {};
        let count = 1;
        while (rulesMap[sampleRuleName]) {
          count++;
          sampleRuleName = `${baseRuleName} (${count})`;
        }
      }

      const sample = isMr ? {
        "Шаблон": `Прокладка кабеля массой 1 м, кг, до: {масса} (${sampleRuleName})`,
        "Работы": {
          "1": [
            {
              "Наименование": `Прокладка кабеля массой 1 м, кг, до: 1 (${sampleRuleName})`,
              "МаксВес": 1,
              "Единицы измерения": "м",
              "Формула": "ДЛИНА",
              "Тип": "работа",
              "ОтображатьФормулу": true
            }
          ],
          "2": [
            {
              "Наименование": `Прокладка кабеля массой 1 м, кг, до: 2 (${sampleRuleName})`,
              "МаксВес": 2,
              "Единицы измерения": "м",
              "Формула": "ДЛИНА",
              "Тип": "работа",
              "ОтображатьФормулу": true
            }
          ],
          "3": [
            {
              "Наименование": `Прокладка кабеля массой 1 м, кг, до: 3 (${sampleRuleName})`,
              "МаксВес": 3,
              "Единицы измерения": "м",
              "Формула": "ДЛИНА",
              "Тип": "работа",
              "ОтображатьФормулу": true
            }
          ],
          "оптический": [
            {
              "Наименование": `Прокладка оптического кабеля (${sampleRuleName})`,
              "Категория": "Оптический кабель",
              "Единицы измерения": "м",
              "Формула": "ДЛИНА",
              "Тип": "работа",
              "ОтображатьФормулу": true
            }
          ]
        }
      } : {
        "Работы": [
          {
            "Наименование": "Разработка грунта механизированным способом",
            "Единицы измерения": "м3 грунта",
            "Формула": "0,36*ДЛИНА",
            "Тип": "работа",
            "ОтображатьФормулу": true,
            "Материалы": []
          },
          {
            "Наименование": "Засыпка траншей механизированным способом",
            "Единицы измерения": "м3 грунта",
            "Формула": "0,36*ДЛИНА",
            "Тип": "работа",
            "ОтображатьФормулу": true,
            "Материалы": []
          }
        ]
      };

      if (!currentObj[targetKey] || typeof currentObj[targetKey] !== 'object' || Array.isArray(currentObj[targetKey])) {
        currentObj[targetKey] = {};
      }
      currentObj[targetKey][sampleRuleName] = sample;

      currentWorksRules = currentObj;

      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();

      highlightAndScrollToJsonNode(sampleRuleName, false);

      showToast(`Шаблон нового способа «${sampleRuleName}» добавлен в раздел «${targetKey}». Отредактируйте параметры и примените.`, 'success', 'Способ добавлен', 6000);
    } catch (err) {
      showToast('Ошибка при добавлении шаблона: ' + err.message, 'error', 'Ошибка');
    }
  };

  const quickAddRuleInTabBtn = document.getElementById('quickAddRuleInTabBtn');
  if (quickAddRuleInTabBtn) {
    quickAddRuleInTabBtn.addEventListener('click', insertRuleSample);
  }

  // Rules cards search listeners
  const rulesCardsSearchInput = document.getElementById('rulesCardsSearchInput');
  if (rulesCardsSearchInput) {
    rulesCardsSearchInput.addEventListener('input', renderRulesModalContent);
  }

  const rulesCardsClearSearchBtn = document.getElementById('rulesCardsClearSearchBtn');
  if (rulesCardsClearSearchBtn && rulesCardsSearchInput) {
    rulesCardsClearSearchBtn.addEventListener('click', () => {
      rulesCardsSearchInput.value = '';
      renderRulesModalContent();
      rulesCardsSearchInput.focus();
    });
  }

  // Add cable template button (+ Кабель) in toolbar and in cables tab
  const insertCableSample = () => {
    try {
      const val = getWorksJsonEditorValue();
      let currentObj;
      try {
        currentObj = JSON.parse(val);
      } catch {
        currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": {}, "Монтажные работы": {} }));
      }

      if (!currentObj || typeof currentObj !== 'object' || Array.isArray(currentObj)) {
        currentObj = { "Строительные работы": {}, "Монтажные работы": {}, "Справочник кабелей": {} };
      }

      if (!currentObj["Справочник кабелей"] || typeof currentObj["Справочник кабелей"] !== 'object') {
        const existingCat = (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"]) ? cachedDefaultRules["Справочник кабелей"] : {};
        currentObj["Справочник кабелей"] = JSON.parse(JSON.stringify(existingCat));
      }

      // Check current category filter in UI to insert into relevant section
      const catFilter = document.getElementById('cableCatalogCategoryFilter');
      const catVal = catFilter ? catFilter.value : 'all';

      let targetCategoryName = "Особый кабель";
      let isOptical = false;
      let defaultCoupling = "МСХз40-9-24х0,9";
      let defaultWeight = 0.45;
      let defaultLength = 600;
      let defaultDesc = "Кабель для сигнализации и блокировки";

      if (catVal === 'optical') {
        targetCategoryName = "Оптический кабель";
        isOptical = true;
        defaultCoupling = "МТОК-А1/216-1Т3-44";
        defaultWeight = 0.28;
        defaultLength = 2000;
        defaultDesc = "Кабель связи оптический бронированный";
      }

      if (!currentObj["Справочник кабелей"][targetCategoryName] || typeof currentObj["Справочник кабелей"][targetCategoryName] !== 'object') {
        currentObj["Справочник кабелей"][targetCategoryName] = {
          "Название": targetCategoryName,
          ...(isOptical ? { "Категория": "Оптический кабель" } : {}),
          "Тип": {}
        };
      }

      if (!currentObj["Справочник кабелей"][targetCategoryName]["Тип"] || typeof currentObj["Справочник кабелей"][targetCategoryName]["Тип"] !== 'object') {
        currentObj["Справочник кабелей"][targetCategoryName]["Тип"] = {};
      }

      const typesMap = currentObj["Справочник кабелей"][targetCategoryName]["Тип"];

      // Generate a unique mark name so multiple clicks add distinct entries
      let sampleMark = isOptical ? "ОКБ-Новый-Кабель-16(2)" : "Новая-Марка-Кабеля 5х2х0,9";
      let counter = 1;
      while (typesMap[sampleMark]) {
        counter++;
        sampleMark = isOptical 
          ? `ОКБ-Новый-Кабель-16(2)-${counter}` 
          : `Новая-Марка-Кабеля-${counter} 5х2х0,9`;
      }

      typesMap[sampleMark] = {
        "Строительная длина": defaultLength,
        "Муфта": defaultCoupling,
        "Вес": defaultWeight,
        ...(isOptical ? { "Категория": "Оптический кабель" } : {}),
        "Полное описание": `${defaultDesc} ${sampleMark}`
      };

      currentWorksRules = currentObj;

      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();

      highlightAndScrollToJsonNode(sampleMark, true);

      showToast(`Шаблон кабеля «${sampleMark}» добавлен в «Справочник кабелей» (категория: «${targetCategoryName}»). Отредактируйте параметры и примените.`, 'success', 'Шаблон кабеля добавлен', 6000);
    } catch (err) {
      showToast('Ошибка при добавлении шаблона кабеля: ' + err.message, 'error', 'Ошибка');
    }
  };

  const quickAddCableInTabBtn = document.getElementById('quickAddCableInTabBtn');
  if (quickAddCableInTabBtn) {
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
      const val = getWorksJsonEditorValue();
      let currentObj;
      try {
        currentObj = JSON.parse(val);
      } catch {
        currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || {}));
      }

      if (!currentObj["Справочник муфт"] || typeof currentObj["Справочник муфт"] !== 'object' || Array.isArray(currentObj["Справочник муфт"])) {
        currentObj["Справочник муфт"] = {};
      }

      let sampleMark = "МСХз-Новая-48";
      let counter = 1;
      while (currentObj["Справочник муфт"][sampleMark]) {
        counter++;
        sampleMark = `МСХз-Новая-48-${counter}`;
      }

      currentObj["Справочник муфт"][sampleMark] = {
        "Полное наименование": `Муфта кабельная соединительная подземная холодноусаживаемая ${sampleMark}`,
        "МаксЖил": 48,
        "Единицы измерения": "шт"
      };

      currentWorksRules = currentObj;

      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();

      highlightAndScrollToJsonNode(sampleMark, true);

      showToast(`Шаблон муфты «${sampleMark}» добавлен в «Справочник муфт». Отредактируйте параметры и примените.`, 'success', 'Шаблон муфты добавлен', 6000);
    } catch (err) {
      showToast('Ошибка при добавлении шаблона муфты: ' + err.message, 'error', 'Ошибка');
    }
  };

  // Tab show listeners to auto-refresh visual tabs with latest JSON data
  const cardsTabBtn = document.getElementById('tabWorksCardsBtn');
  if (cardsTabBtn) {
    cardsTabBtn.addEventListener('shown.bs.tab', () => {
      syncCurrentRulesFromEditorIfValid();
      renderRulesModalContent();
    });
  }

  const cablesTabBtn = document.getElementById('tabWorksCablesBtn');
  if (cablesTabBtn) {
    cablesTabBtn.addEventListener('shown.bs.tab', () => {
      syncCurrentRulesFromEditorIfValid();
      renderCableCatalogModalContent();
    });
  }

  const couplingsTabBtn = document.getElementById('tabWorksCouplingsBtn');
  if (couplingsTabBtn) {
    couplingsTabBtn.addEventListener('shown.bs.tab', () => {
      syncCurrentRulesFromEditorIfValid();
      renderCouplingCatalogModalContent();
    });
  }

  const equipmentTabBtn = document.getElementById('tabWorksEquipmentBtn');
  if (equipmentTabBtn) {
    equipmentTabBtn.addEventListener('shown.bs.tab', () => {
      syncCurrentRulesFromEditorIfValid();
      renderEquipmentCatalogModalContent();
    });
  }

  // Settings tab show listener
  const settingsTabBtn = document.getElementById('tabWorksSettingsBtn');
  if (settingsTabBtn) {
    settingsTabBtn.addEventListener('shown.bs.tab', () => {
      syncCurrentRulesFromEditorIfValid();
      renderSettingsModalContent();
    });
  }

  // Settings action buttons
  const syncSettingsBtn = document.getElementById('syncSettingsToJsonBtn');
  if (syncSettingsBtn) {
    syncSettingsBtn.addEventListener('click', () => saveSettingsFromUiToJson(true));
  }

  const resetSettingsBtn = document.getElementById('resetDefaultSettingsBtn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', resetDefaultSettings);
  }

  // Auto-sync settings inputs on change
  [
    'settingNumberingMode',
    'settingDecimalsKm', 'settingDecimalsVolume',
    'settingGgeVersion', 'settingAccessLevel',
    'settingSoftName', 'settingPluginVersion'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => saveSettingsFromUiToJson(false));
    }
  });

  // Add equipment sample (+ Оборудование)
  const insertEquipmentSample = () => {
    try {
      const val = getWorksJsonEditorValue();
      let currentObj;
      try {
        currentObj = JSON.parse(val);
      } catch {
        currentObj = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || {}));
      }

      if (!currentObj["Оборудование"] || typeof currentObj["Оборудование"] !== 'object' || Array.isArray(currentObj["Оборудование"])) {
        currentObj["Оборудование"] = {};
      }

      let sampleMark = "Шкаф-ШРУ-М";
      let counter = 1;
      while (currentObj["Оборудование"][sampleMark]) {
        counter++;
        sampleMark = `Шкаф-ШРУ-М-${counter}`;
      }

      currentObj["Оборудование"][sampleMark] = {
        "Работы": {
          "Не указано": [
            {
              "Наименование": `Установка оборудования типа ${sampleMark}`,
              "Единицы измерения": "шт",
              "Формула": "КОЛИЧЕСТВО",
              "Тип": "работа",
              "ОтображатьФормулу": true,
              "Раздел": "Монтажные работы",
              "Материалы": [
                {
                  "Наименование": sampleMark,
                  "Единицы измерения": "шт",
                  "Формула": "КОЛИЧЕСТВО",
                  "Тип": "оборудование",
                  "ОтображатьФормулу": true,
                  "Раздел": "Монтажные работы"
                }
              ]
            }
          ]
        }
      };

      currentWorksRules = currentObj;

      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();

      highlightAndScrollToJsonNode(sampleMark, true);

      showToast(`Шаблон оборудования «${sampleMark}» добавлен в раздел «Оборудование». Отредактируйте параметры и примените.`, 'success', 'Оборудование добавлено', 6000);
    } catch (err) {
      showToast('Ошибка при добавлении оборудования: ' + err.message, 'error', 'Ошибка');
    }
  };

  const quickAddEquipmentInTabBtn = document.getElementById('quickAddEquipmentInTabBtn');
  if (quickAddEquipmentInTabBtn) {
    quickAddEquipmentInTabBtn.addEventListener('click', insertEquipmentSample);
  }

  // Equipment tab search listeners
  const equipmentSearchInput = document.getElementById('equipmentCatalogSearchInput');
  if (equipmentSearchInput) {
    equipmentSearchInput.addEventListener('input', renderEquipmentCatalogModalContent);
  }

  const equipmentClearSearchBtn = document.getElementById('equipmentCatalogClearSearchBtn');
  if (equipmentClearSearchBtn && equipmentSearchInput) {
    equipmentClearSearchBtn.addEventListener('click', () => {
      equipmentSearchInput.value = '';
      renderEquipmentCatalogModalContent();
      equipmentSearchInput.focus();
    });
  }

  const quickAddCouplingInTabBtn = document.getElementById('quickAddCouplingInTabBtn');
  if (quickAddCouplingInTabBtn) {
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
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      try {
        const val = getWorksJsonEditorValue();
        const parsed = JSON.parse(val);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          showToast('JSON должен быть объектом со структурой разделов', 'error', 'Неверный формат');
          return;
        }

        currentWorksRules = parsed;

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
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": {} }));
  }
  if (!currentWorksRules["Строительные работы"] || typeof currentWorksRules["Строительные работы"] !== 'object' || Array.isArray(currentWorksRules["Строительные работы"])) {
    currentWorksRules["Строительные работы"] = {};
  }

  let addedCount = 0;
  missingList.forEach(m => {
    const typeName = (typeof m === 'object' ? (m.ruleName || m.type) : m) || '';
    if (!typeName) return;
    const existingKey = Object.keys(currentWorksRules["Строительные работы"]).find(k => matchesRule(typeName, k));
    if (!existingKey) {
      currentWorksRules["Строительные работы"][typeName] = {
        "Работы": [
          {
            "Наименование": `Разработка грунта в траншеях (${typeName})`,
            "Единицы измерения": "м3 грунта",
            "Формула": "0,36*ДЛИНА",
            "Тип": "работа",
            "ОтображатьФормулу": true,
            "Материалы": []
          },
          {
            "Наименование": `Засыпка траншей (${typeName})`,
            "Единицы измерения": "м3 грунта",
            "Формула": "0,36*ДЛИНА",
            "Тип": "работа",
            "ОтображатьФормулу": true,
            "Материалы": []
          }
        ]
      };
      addedCount++;
    }
  });

  openWorksRulesModal('editor');
  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
  validateWorksJsonInput();
  showToast(`Добавлено способов прокладки в раздел «Строительные работы»: ${addedCount}. Отредактируйте формулы и нажмите «Применить и пересчитать».`, 'info', 'Правила дополнены');
}

// Add missing cable routing types or missing work items to "Монтажные работы" in rules and open editor
function addMissingCableWaysToRules(missingList) {
  if (!missingList || missingList.length === 0) return;

  if (!currentWorksRules) {
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": {}, "Монтажные работы": {} }));
  }
  if (!currentWorksRules["Монтажные работы"] || typeof currentWorksRules["Монтажные работы"] !== 'object' || Array.isArray(currentWorksRules["Монтажные работы"])) {
    currentWorksRules["Монтажные работы"] = {};
  }

  const createDefaultMrObj = (typeName) => ({
    "1": [
      {
        "Наименование": `Прокладка кабеля массой 1 м, кг, до: 1 (${typeName})`,
        "МаксВес": 1,
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа",
        "ОтображатьФормулу": true
      }
    ],
    "2": [
      {
        "Наименование": `Прокладка кабеля массой 1 м, кг, до: 2 (${typeName})`,
        "МаксВес": 2,
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа",
        "ОтображатьФормулу": true
      }
    ],
    "3": [
      {
        "Наименование": `Прокладка кабеля массой 1 м, кг, до: 3 (${typeName})`,
        "МаксВес": 3,
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа",
        "ОтображатьФормулу": true
      }
    ],
    "оптический": [
      {
        "Наименование": `Прокладка оптического кабеля (${typeName})`,
        "Категория": "Оптический кабель",
        "Единицы измерения": "м",
        "Формула": "ДЛИНА",
        "Тип": "работа",
        "ОтображатьФормулу": true
      }
    ]
  });

  let addedCount = 0;
  missingList.forEach(m => {
    const typeName = (typeof m === 'object' ? (m.ruleName || m.type) : m) || '';
    if (!typeName) return;
    const existingKey = Object.keys(currentWorksRules["Монтажные работы"]).find(k => matchesRule(typeName, k));
    if (!existingKey) {
      currentWorksRules["Монтажные работы"][typeName] = {
        "Шаблон": `Прокладка кабеля массой 1 м, кг, до: {масса} (${typeName})`,
        "Работы": createDefaultMrObj(typeName)
      };
      addedCount++;
    } else {
      const targetRule = currentWorksRules["Монтажные работы"][existingKey];
      if (!targetRule["Работы"] || typeof targetRule["Работы"] !== 'object') {
        targetRule["Работы"] = createDefaultMrObj(existingKey);
        addedCount++;
      } else if (m && typeof m === 'object' && m.missingType === 'optical') {
        if (!targetRule["Работы"]["оптический"]) {
          targetRule["Работы"]["оптический"] = [
            {
              "Наименование": `Прокладка оптического кабеля (${existingKey})`,
              "Единицы измерения": "м",
              "Категория": "Оптический кабель",
              "Формула": "ДЛИНА",
              "Тип": "работа",
              "ОтображатьФормулу": true
            }
          ];
          addedCount++;
        }
      } else if (m && typeof m === 'object' && m.missingType === 'tier') {
        const tierKey = String(m.tierMax || 1);
        if (!targetRule["Работы"][tierKey]) {
          targetRule["Работы"][tierKey] = [
            {
              "Наименование": `Прокладка кабеля массой 1 м, кг, до: ${tierKey} (${existingKey})`,
              "Единицы измерения": "м",
              "МаксВес": Number(tierKey) || 1,
              "Формула": "ДЛИНА",
              "Тип": "работа",
              "ОтображатьФормулу": true
            }
          ];
          addedCount++;
        }
      } else if (m && typeof m === 'object' && m.missingType === 'empty_rule') {
        targetRule["Работы"] = createDefaultMrObj(existingKey);
        addedCount++;
      }
    }
  });

  openWorksRulesModal('editor');
  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
  validateWorksJsonInput();
  showToast(`Добавлено позиций в раздел «Монтажные работы»: ${addedCount}. Отредактируйте наименования/формулы и нажмите «Применить и пересчитать».`, 'info', 'Правила дополнены');
}

// Add missing cable types to "Справочник кабелей" in rules and open editor
function addMissingCablesToCatalog(missingList) {
  if (!missingList || missingList.length === 0) return;

  if (!currentWorksRules) {
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": {}, "Монтажные работы": {} }));
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
  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
  validateWorksJsonInput();
  showToast(
    `В раздел «Справочник кабелей» добавлены заготовки для ${addedCount} марок: ${addedTypes.join(', ')}. Укажите паспортные характеристики и нажмите «Применить и пересчитать».`,
    'info',
    'Справочник кабелей дополнен',
    8000
  );
}

// Add missing equipment items to "Оборудование" section in rules and open editor
function addMissingEquipmentToRules(missingList) {
  if (!missingList || missingList.length === 0) {
    showToast('Нет недостающих позиций оборудования для добавления', 'info', 'Правила');
    return;
  }

  if (!currentWorksRules) {
    currentWorksRules = JSON.parse(JSON.stringify(cachedDefaultRules || { "Строительные работы": {}, "Монтажные работы": {}, "Оборудование": {} }));
  }
  if (!currentWorksRules["Оборудование"] || typeof currentWorksRules["Оборудование"] !== 'object' || Array.isArray(currentWorksRules["Оборудование"])) {
    currentWorksRules["Оборудование"] = {};
  }

  let addedCount = 0;
  const addedMarks = [];

  missingList.forEach(m => {
    const mark = (m.mark || m.type || 'Оборудование').trim();
    const method = (m.method || 'Не указано').trim();

    const newWorksForMethod = [
      {
        "Наименование": `Установка оборудования типа ${mark}${method.toLowerCase() !== 'не указано' ? ` (${method})` : ''}`,
        "Единицы измерения": "шт",
        "Формула": "КОЛИЧЕСТВО",
        "Тип": "работа",
        "ОтображатьФормулу": true,
        "Раздел": "Монтажные работы"
      },
      {
        "Наименование": `${mark}`,
        "Единицы измерения": "шт",
        "Формула": "КОЛИЧЕСТВО",
        "Тип": "оборудование",
        "ОтображатьФормулу": true,
        "Раздел": "Монтажные работы"
      }
    ];

    let existingEntry = currentWorksRules["Оборудование"][mark];
    if (!existingEntry) {
      const foundKey = Object.keys(currentWorksRules["Оборудование"]).find(k => k.trim().toLowerCase() === mark.toLowerCase());
      if (foundKey) {
        existingEntry = currentWorksRules["Оборудование"][foundKey];
      }
    }

    if (existingEntry) {
      if (!existingEntry["Работы"] || typeof existingEntry["Работы"] !== 'object') {
        existingEntry["Работы"] = {};
      }
      if (!existingEntry["Работы"][method]) {
        existingEntry["Работы"][method] = newWorksForMethod;
        addedCount++;
        addedMarks.push(`${mark} [${method}]`);
      }
    } else {
      currentWorksRules["Оборудование"][mark] = {
        "Работы": {
          [method]: newWorksForMethod
        }
      };
      addedCount++;
      addedMarks.push(`${mark} [${method}]`);
    }
  });

  openWorksRulesModal('editor');
  setWorksJsonEditorValue(JSON.stringify(currentWorksRules, null, 2));
  validateWorksJsonInput();
  if (addedMarks.length > 0) {
    const firstMark = addedMarks[0].split(' ')[0];
    highlightAndScrollToJsonNode(firstMark, true);
  }
  showToast(
    `В раздел «Оборудование» добавлены заготовки для ${addedCount} позиций: ${addedMarks.join(', ')}. Скорректируйте наименования/формулы и сохраните JSON.`,
    'info',
    'Раздел оборудования дополнен',
    8000
  );
}

