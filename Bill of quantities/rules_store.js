/**
 * Bill of quantities - Centralized Rules & Catalog Store
 * Single source of truth for works rules persistence, loading, versioning,
 * file export/import, factory reset, and cross-tab event synchronization.
 */

(function(window) {
  'use strict';

  const LOCAL_STORAGE_RULES_KEY = 'si_works_rules_v1';
  const LOCAL_STORAGE_RULES_META_KEY = 'si_works_rules_v1_meta';

  let cachedRules = null;
  let cachedFactoryRules = null;
  let listeners = [];

  const rulesStore = {
    STORAGE_KEY: LOCAL_STORAGE_RULES_KEY,
    META_KEY: LOCAL_STORAGE_RULES_META_KEY,

    /**
     * Synchronously returns cached rules, or reads from LocalStorage, or fallback empty structure.
     */
    getRulesSync() {
      if (cachedRules) return cachedRules;
      const fromLocal = this.loadFromLocalStorage();
      if (fromLocal) {
        cachedRules = fromLocal;
        return cachedRules;
      }
      return cachedFactoryRules || { "Строительные работы": {}, "Монтажные работы": {}, "Оборудование": {} };
    },

    /**
     * Reads rules JSON from LocalStorage.
     */
    loadFromLocalStorage() {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_RULES_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err) {
        console.warn('[rulesStore] Ошибка чтения LocalStorage:', err);
      }
      return null;
    },

    /**
     * Gets metadata about saved rules in LocalStorage.
     */
    getStorageMeta() {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_RULES_META_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      const hasSaved = Boolean(localStorage.getItem(LOCAL_STORAGE_RULES_KEY));
      return {
        hasSaved,
        savedAt: hasSaved ? Date.now() : null,
        version: 1
      };
    },

    /**
     * Loads rules: first checks LocalStorage, if empty fetches ./works_rules.json.
     */
    async fetchFactoryRulesJson() {
      if (cachedFactoryRules) {
        return JSON.parse(JSON.stringify(cachedFactoryRules));
      }
      const candidates = [
        './works_rules.json',
        '/works_rules.json',
        '/Bill of quantities/works_rules.json',
        '/Bill%20of%20quantities/works_rules.json'
      ];
      for (const path of candidates) {
        try {
          const res = await fetch(`${path}?t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object') {
              cachedFactoryRules = JSON.parse(JSON.stringify(data));
              window.cachedDefaultRules = cachedFactoryRules;
              return cachedFactoryRules;
            }
          }
        } catch (e) {
          // try next path
        }
      }
      return null;
    },

    /**
     * Loads rules: first checks LocalStorage, if empty fetches works_rules.json.
     */
    async loadRules() {
      const local = this.loadFromLocalStorage();
      if (local) {
        cachedRules = JSON.parse(JSON.stringify(local));
        window.currentWorksRules = cachedRules;
        return cachedRules;
      }

      // Fetch default factory rules
      const factory = await this.fetchFactoryRulesJson();
      if (factory) {
        cachedRules = JSON.parse(JSON.stringify(factory));
        window.currentWorksRules = cachedRules;
        return cachedRules;
      }

      console.warn('[rulesStore] Не удалось загрузить works_rules.json по всем путям');
      return cachedRules || (window.currentWorksRules || {});
    },

    /**
     * Saves rules to LocalStorage and notifies listeners and other tabs.
     */
    saveRules(rulesObj) {
      if (!rulesObj || typeof rulesObj !== 'object' || Array.isArray(rulesObj)) {
        throw new Error('Правила должны быть объектом');
      }

      const jsonStr = JSON.stringify(rulesObj, null, 2);
      localStorage.setItem(LOCAL_STORAGE_RULES_KEY, jsonStr);

      const meta = {
        savedAt: Date.now(),
        sizeBytes: new Blob([jsonStr]).size,
        version: 1
      };
      localStorage.setItem(LOCAL_STORAGE_RULES_META_KEY, JSON.stringify(meta));

      cachedRules = JSON.parse(jsonStr);
      window.currentWorksRules = cachedRules;

      this._notifyListeners({ type: 'saved', rules: cachedRules, meta });
      return true;
    },

    /**
     * Clears saved rules from LocalStorage and resets to factory works_rules.json.
     */
    async resetToDefaultRules() {
      const defaultData = await this.fetchFactoryRulesJson();
      if (!defaultData) {
        throw new Error('Не удалось получить заводские правила works_rules.json');
      }

      localStorage.removeItem(LOCAL_STORAGE_RULES_KEY);
      localStorage.removeItem(LOCAL_STORAGE_RULES_META_KEY);

      cachedRules = JSON.parse(JSON.stringify(defaultData));
      window.currentWorksRules = cachedRules;

      this._notifyListeners({ type: 'reset', rules: cachedRules });
      return cachedRules;
    },

    /**
     * Downloads current rules as a JSON file.
     */
    exportRulesJson(filename = 'works_rules.json') {
      const rules = this.getRulesSync();
      const jsonStr = JSON.stringify(rules, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /**
     * Imports rules from a JSON file.
     */
    async importRulesJsonFile(file) {
      if (!file) throw new Error('Файл не выбран');
      const text = await readFileAsTextWithEncoding(file);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Файл не содержит корректную структуру JSON-объекта');
      }
      this.saveRules(parsed);
      return parsed;
    },

    /**
     * Subscribe to rule update events (both local and cross-tab).
     */
    subscribe(callback) {
      if (typeof callback === 'function') {
        listeners.push(callback);
      }
      return () => {
        listeners = listeners.filter(cb => cb !== callback);
      };
    },

    _notifyListeners(event) {
      listeners.forEach(cb => {
        try {
          cb(event);
        } catch (e) {
          console.error('[rulesStore] Ошибка в слушателе событий:', e);
        }
      });
      // Also dispatch standard DOM event
      window.dispatchEvent(new CustomEvent('si:rules-updated', { detail: event }));
    }
  };

  // 1. Cross-tab storage event handler (supported in all browsers for 15+ years)
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_STORAGE_RULES_KEY || e.key === LOCAL_STORAGE_RULES_META_KEY) {
      cachedRules = rulesStore.loadFromLocalStorage();
      window.currentWorksRules = cachedRules;
      rulesStore._notifyListeners({ type: 'external-storage-change', key: e.key, newValue: e.newValue });
    }
  });

  // 2. Modern BroadcastChannel API for instant cross-tab sync where available
  let syncChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      syncChannel = new BroadcastChannel('si_works_rules_sync');
      syncChannel.onmessage = (event) => {
        if (event && event.data && event.data.type === 'rules-updated') {
          cachedRules = rulesStore.loadFromLocalStorage();
          window.currentWorksRules = cachedRules;
          rulesStore._notifyListeners({ type: 'external-storage-change', source: 'broadcast-channel' });
        }
      };
    }
  } catch (err) {
    console.debug('[rulesStore] BroadcastChannel не поддерживается или заблокирован:', err);
  }

  // Hook saveRules to broadcast
  const originalSaveRules = rulesStore.saveRules.bind(rulesStore);
  rulesStore.saveRules = function(rulesObj) {
    const res = originalSaveRules(rulesObj);
    if (syncChannel) {
      try {
        syncChannel.postMessage({ type: 'rules-updated', timestamp: Date.now() });
      } catch (e) {}
    }
    return res;
  };

  const originalResetToDefaultRules = rulesStore.resetToDefaultRules.bind(rulesStore);
  rulesStore.resetToDefaultRules = async function() {
    const res = await originalResetToDefaultRules();
    if (syncChannel) {
      try {
        syncChannel.postMessage({ type: 'rules-updated', timestamp: Date.now() });
      } catch (e) {}
    }
    return res;
  };

  // 3. Fallback check on tab activation (handles suspended background tabs / sleeping tabs)
  let lastCheckedSavedAt = 0;
  function checkTabRulesFreshness() {
    try {
      const metaStr = localStorage.getItem(LOCAL_STORAGE_RULES_META_KEY);
      if (metaStr) {
        const meta = JSON.parse(metaStr);
        if (meta && meta.savedAt && meta.savedAt > lastCheckedSavedAt) {
          if (lastCheckedSavedAt > 0) {
            // New rules were saved while tab was in background
            cachedRules = rulesStore.loadFromLocalStorage();
            window.currentWorksRules = cachedRules;
            rulesStore._notifyListeners({ type: 'external-storage-change', source: 'tab-focus' });
          }
          lastCheckedSavedAt = meta.savedAt;
        }
      }
    } catch (e) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkTabRulesFreshness();
    }
  });
  window.addEventListener('focus', checkTabRulesFreshness);

  window.rulesStore = rulesStore;
})(window);

// --------------------------------------------------------------------------
// SHARED RULES DOM & DATA HELPER FUNCTIONS (FALLBACKS FOR STANDALONE PAGES)
// --------------------------------------------------------------------------

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  if (typeof window.escapeHtml !== 'function') window.escapeHtml = escapeHtml;

  // Universal debounce helper with cancel method
  function debounce(fn, delay = 180) {
    let timer = null;
    const debounced = function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, delay);
    };
    debounced.cancel = function() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return debounced;
  }
  if (typeof window.debounce !== 'function') window.debounce = debounce;

  function showToast(message, type = 'info', title = 'Уведомление', delay = 4000) {
    const toastEl = document.getElementById('liveToast');
    const toastText = document.getElementById('toastText');
    const toastTitle = document.getElementById('toastTitle');
    const toastHeader = document.getElementById('toastHeader');
    const toastIcon = document.getElementById('toastIcon');

    if (!toastEl || !toastText) {
      console.log(`[Toast ${type}] ${title}: ${message}`);
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
  if (typeof window.showToast !== 'function') window.showToast = showToast;

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
  if (typeof window.getRulesSections !== 'function') window.getRulesSections = getRulesSections;

  function getTrenchRules(rulesData) {
    if (!rulesData || typeof rulesData !== 'object' || Array.isArray(rulesData)) {
      return { sectionName: 'Строительные работы', rules: [] };
    }
    const val = rulesData["Строительные работы"];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const rulesList = Object.entries(val).map(([ruleName, ruleVal]) => ({
        "Название": ruleName,
        "Раздел": (ruleVal && ruleVal["Раздел"]) || 'Строительные работы',
        ...(ruleVal && typeof ruleVal === 'object' ? ruleVal : {})
      }));
      return { sectionName: 'Строительные работы', rules: rulesList };
    }
    return { sectionName: 'Строительные работы', rules: [] };
  }
  if (typeof window.getTrenchRules !== 'function') window.getTrenchRules = getTrenchRules;

  function getCableRules(rulesData) {
    if (!rulesData || typeof rulesData !== 'object' || Array.isArray(rulesData)) {
      return { sectionName: 'Монтажные работы', rules: [] };
    }
    const val = rulesData["Монтажные работы"];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const rulesList = Object.entries(val).map(([ruleName, ruleVal]) => ({
        "Название": ruleName,
        "Раздел": (ruleVal && ruleVal["Раздел"]) || 'Монтажные работы',
        ...(ruleVal && typeof ruleVal === 'object' ? ruleVal : {})
      }));
      return { sectionName: 'Монтажные работы', rules: rulesList };
    }
    return { sectionName: 'Монтажные работы', rules: [] };
  }
  if (typeof window.getCableRules !== 'function') window.getCableRules = getCableRules;

  function getCableCatalog(rulesData) {
    const rules = rulesData || window.currentWorksRules || (window.rulesStore ? window.rulesStore.getRulesSync() : null) || window.cachedDefaultRules;
    if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
      if (rules["Справочник кабелей"] && typeof rules["Справочник кабелей"] === 'object') {
        return rules["Справочник кабелей"];
      }
      if (rules["Кабели"] && typeof rules["Кабели"] === 'object') {
        return rules["Кабели"];
      }
    }
    if (window.cachedDefaultRules && window.cachedDefaultRules["Справочник кабелей"] && typeof window.cachedDefaultRules["Справочник кабелей"] === 'object') {
      return window.cachedDefaultRules["Справочник кабелей"];
    }
    return {};
  }
  window.getCableCatalog = getCableCatalog;

  function getCouplingCatalog(rulesData) {
    const rules = rulesData || window.currentWorksRules || (window.rulesStore ? window.rulesStore.getRulesSync() : null) || window.cachedDefaultRules;
    if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
      if (rules["Справочник муфт"] && typeof rules["Справочник муфт"] === 'object') {
        return rules["Справочник муфт"];
      }
      if (rules["Муфты"] && typeof rules["Муфты"] === 'object') {
        return rules["Муфты"];
      }
    }
    if (window.cachedDefaultRules && window.cachedDefaultRules["Справочник муфт"] && typeof window.cachedDefaultRules["Справочник муфт"] === 'object') {
      return window.cachedDefaultRules["Справочник муфт"];
    }
    return {};
  }
  window.getCouplingCatalog = getCouplingCatalog;

  function getRuleWorks(rule, defaultSection = '') {
    if (!rule || typeof rule !== 'object') return [];
    const ruleSec = (rule && rule["Раздел"]) || defaultSection || '';
    const raw = rule["Работы и материалы"] !== undefined ? rule["Работы и материалы"] : (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
    const list = [];

    function appendItemWithResources(item, tierKey = null) {
      if (!item || typeof item !== 'object') return;
      const workEntry = tierKey !== null ? { ...item, _tierKey: tierKey } : item;
      list.push(workEntry);

      const mats = Array.isArray(item["Материалы"]) ? item["Материалы"] : [];
      const equips = Array.isArray(item["Оборудование"]) ? item["Оборудование"] : [];
      const parentSection = item["Раздел"] || ruleSec;
      const parentCondition = item["Условие"] !== undefined ? item["Условие"] : item["condition"];
      const parentWorkName = item["Наименование"] || item.name || '';
      const parentWorkUnit = item["Единицы измерения"] || item.unit || '';

      mats.forEach(mat => {
        if (mat && typeof mat === 'object') {
          const matEntry = {
            ...mat,
            "Тип": mat["Тип"] || mat.type || "материал",
            "Раздел": mat["Раздел"] || parentSection,
            "Условие": mat["Условие"] !== undefined ? mat["Условие"] : parentCondition,
            parentWorkName: mat.parentWorkName || parentWorkName,
            parentWorkUnit: mat.parentWorkUnit || parentWorkUnit,
            parentWorkSection: mat.parentWorkSection || parentSection
          };
          if (tierKey !== null) matEntry._tierKey = tierKey;
          list.push(matEntry);
        }
      });

      equips.forEach(eq => {
        if (eq && typeof eq === 'object') {
          const eqEntry = {
            ...eq,
            "Тип": eq["Тип"] || eq.type || "оборудование",
            "Раздел": eq["Раздел"] || parentSection,
            "Условие": eq["Условие"] !== undefined ? eq["Условие"] : parentCondition,
            parentWorkName: eq.parentWorkName || parentWorkName,
            parentWorkUnit: eq.parentWorkUnit || parentWorkUnit,
            parentWorkSection: eq.parentWorkSection || parentSection
          };
          if (tierKey !== null) eqEntry._tierKey = tierKey;
          list.push(eqEntry);
        }
      });
    }

    if (Array.isArray(raw)) {
      raw.forEach(item => appendItemWithResources(item));
    } else if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([tierKey, arr]) => {
        if (Array.isArray(arr)) {
          arr.forEach(item => appendItemWithResources(item, tierKey));
        }
      });
    }
    return list;
  }
  if (typeof window.getRuleWorks !== 'function') window.getRuleWorks = getRuleWorks;

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
  if (typeof window.shouldShowFormula !== 'function') window.shouldShowFormula = shouldShowFormula;

  function getRulesSettings(rulesData) {
    const raw = (rulesData && typeof rulesData === 'object')
      ? (rulesData["Настройки"] || {})
      : {};
    const numModeRaw = String(raw["ТипНумерации"] || 'иерархическая').trim().toLowerCase();
    const isSeq = numModeRaw.includes('сквозн');
    const decWorksRaw = raw["ОкруглениеРабот"] !== undefined ? raw["ОкруглениеРабот"] : 2;
    const decMatsRaw = raw["ОкруглениеМатериалов"] !== undefined ? raw["ОкруглениеМатериалов"] : 3;
    const decimalsWorks = (!isNaN(Number(decWorksRaw)) && Number(decWorksRaw) >= 0) ? Math.min(10, Math.floor(Number(decWorksRaw))) : 2;
    const decimalsMaterials = (!isNaN(Number(decMatsRaw)) && Number(decMatsRaw) >= 0) ? Math.min(10, Math.floor(Number(decMatsRaw))) : 3;
    return {
      numberingMode: isSeq ? 'сквозная' : 'иерархическая',
      ggeVersion: String(raw["ВерсияGGE"] || '3.01').trim(),
      accessLevel: String(raw["УровеньДоступа"] || 'коммерческая тайна').trim(),
      softName: String(raw["ПрограммныйКомплекс"] || 'Программный комплекс "Строительный эксперт"  v7.3.1.7813').trim(),
      pluginVersion: String(raw["ПлагинGGE"] || 'Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13').trim(),
      decimalsWorks: decimalsWorks,
      decimalsMaterials: decimalsMaterials,
      raw: raw
    };
  }
  if (typeof window.getRulesSettings !== 'function') window.getRulesSettings = getRulesSettings;

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

    const mRange = condText.match(/от\s*(\d+)\s*до\s*(\d+)(?:\s*(?:кабелей|кабеля|кабел|каб))?/i);
    if (mRange) {
      minCables = parseInt(mRange[1], 10);
      maxCables = parseInt(mRange[2], 10);
    } else {
      const mGt = condText.match(/(?:кабелей|кабеля|каб\.?)?\s*(?<!не\s*)(?:более|свыше|>)\s*(\d+)/i) ||
                  condText.match(/(?<!не\s*)(?:более|свыше|>)\s*(\d+)(?:\s*(?:кабелей|кабеля|каб\.?))?/i);
      if (mGt) {
        minCables = parseInt(mGt[1], 10) + 1;
      }
      const mGte = condText.match(/(?:кабелей|кабеля|каб\.?)?\s*(?:>=|от)\s*(\d+)/i) ||
                   condText.match(/(?:>=|от)\s*(\d+)(?:\s*(?:кабелей|кабеля|каб\.?))?/i);
      if (mGte && !mGt) {
        minCables = parseInt(mGte[1], 10);
      }
      const mLte = condText.match(/(?:кабелей|кабеля|каб\.?)?\s*(?:до|не более|<=)\s*(\d+)/i) ||
                   condText.match(/(?:до|не более|<=)\s*(\d+)(?:\s*(?:кабелей|кабеля|каб\.?))?/i);
      if (mLte) {
        maxCables = parseInt(mLte[1], 10);
      }
      const mLt = condText.match(/(?:кабелей|кабеля|каб\.?)?\s*(?:менее|<)\s*(\d+)/i) ||
                  condText.match(/(?:менее|<)\s*(\d+)(?:\s*(?:кабелей|кабеля|каб\.?))?/i);
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
  if (typeof window.parseCableCountCondition !== 'function') window.parseCableCountCondition = parseCableCountCondition;

  function parseMaxCoresFromString(str) {
    if (!str) return 0;
    const s = String(str);
    const doMatch = s.match(/до[:\s]+(\d+)/i);
    if (doMatch) return parseInt(doMatch[1], 10);
    const rangeMatch = s.match(/(\d+)[-–](\d+)х/i);
    if (rangeMatch) return parseInt(rangeMatch[2], 10);
    const xMatch = s.match(/(\d+)х/i);
    if (xMatch) return parseInt(xMatch[1], 10);
    const numMatch = s.match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return 0;
  }
  if (typeof window.parseMaxCoresFromString !== 'function') window.parseMaxCoresFromString = parseMaxCoresFromString;

  function getCouplingRuleTiers(rulesData, isOptical = false) {
    const rules = rulesData || window.currentWorksRules || window.cachedDefaultRules;
    const cableRules = getCableRules(rules);
    const tiersSet = new Set();

    for (const r of (cableRules && cableRules.rules ? cableRules.rules : [])) {
      const rName = (r["Название"] || r.name || '').toLowerCase();
      if (rName.includes('муфт')) {
        const isRuleOpt = rName.includes('оптич') || rName.includes('волс');
        if (isOptical && !isRuleOpt) continue;
        if (!isOptical && isRuleOpt) continue;

        const wm = r["Работы"] || r["Работы и материалы"] || {};
        if (wm && typeof wm === 'object' && !Array.isArray(wm)) {
          Object.keys(wm).forEach(k => {
            const num = parseFloat(String(k).trim().replace(',', '.'));
            if (!isNaN(num) && num > 0) {
              tiersSet.add(num);
            }
          });
        }
      }
    }

    const sortedTiers = Array.from(tiersSet).sort((a, b) => a - b);
    if (sortedTiers.length > 0) return sortedTiers;
    return isOptical ? [8, 16, 32, 48, 96, 144] : [12, 27, 48, 61];
  }
  if (typeof window.getCouplingRuleTiers !== 'function') window.getCouplingRuleTiers = getCouplingRuleTiers;

  function getCouplingInstallationTier(maxCores, rulesData, isOptical = false) {
    const cores = Number(maxCores) || 0;
    const availableTiers = getCouplingRuleTiers(rulesData, isOptical);
    
    for (const t of availableTiers) {
      if (cores <= t) return t;
    }
    return availableTiers[availableTiers.length - 1];
  }
  if (typeof window.getCouplingInstallationTier !== 'function') window.getCouplingInstallationTier = getCouplingInstallationTier;

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

          return resolve(new TextDecoder('utf-8').decode(uint8).replace(/^\uFEFF/, '').trim());
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  window.readFileAsTextWithEncoding = readFileAsTextWithEncoding;

  function getEquipmentRulesDict(rulesData) {
    const rules = rulesData || window.currentWorksRules || (window.rulesStore ? window.rulesStore.getRulesSync() : null);
    if (!rules || typeof rules !== 'object') return {};
    const raw = rules["Оборудование"];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw;
    }
    return {};
  }
  window.getEquipmentRulesDict = getEquipmentRulesDict;

  function getEquipmentRulesList(rulesData) {
    const dict = getEquipmentRulesDict(rulesData);
    return Object.entries(dict).map(([markKey, itemVal]) => {
      return {
        "Марка": markKey,
        ...(itemVal && typeof itemVal === 'object' ? itemVal : {})
      };
    });
  }
  window.getEquipmentRulesList = getEquipmentRulesList;

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
  window.getEquipmentItemWorksObject = getEquipmentItemWorksObject;

  // Single Source of Truth exports on rulesStore namespace
  if (window.rulesStore) {
    window.rulesStore.escapeHtml = escapeHtml;
    window.rulesStore.debounce = debounce;
    window.rulesStore.showToast = showToast;
    window.rulesStore.getRulesSections = getRulesSections;
    window.rulesStore.getTrenchRules = getTrenchRules;
    window.rulesStore.getCableRules = getCableRules;
    window.rulesStore.getCableCatalog = getCableCatalog;
    window.rulesStore.getCouplingCatalog = getCouplingCatalog;
    window.rulesStore.getRuleWorks = getRuleWorks;
    window.rulesStore.shouldShowFormula = shouldShowFormula;
    window.rulesStore.getRulesSettings = getRulesSettings;
    window.rulesStore.parseCableCountCondition = parseCableCountCondition;
    window.rulesStore.parseMaxCoresFromString = parseMaxCoresFromString;
    window.rulesStore.getCouplingRuleTiers = getCouplingRuleTiers;
    window.rulesStore.getCouplingInstallationTier = getCouplingInstallationTier;
    window.rulesStore.readFileAsTextWithEncoding = readFileAsTextWithEncoding;
    window.rulesStore.getEquipmentRulesDict = getEquipmentRulesDict;
    window.rulesStore.getEquipmentRulesList = getEquipmentRulesList;
    window.rulesStore.getEquipmentItemWorksObject = getEquipmentItemWorksObject;
  }

