/**
 * Bill of quantities - Works Rules & Catalogs Modal Manager
 * Handles rules modal UI, tabs (Rules, Cables, Couplings, Equipment, Settings),
 * CodeMirror JSON editor integration, validation and quick-add actions.
 */

let worksJsonCodeMirror = null;

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

// Draft rules object currently active within the modal editor
let modalDraftRules = null;

// Get current working draft rules from CodeMirror editor without modifying global currentWorksRules
function getDraftRulesFromEditor() {
  try {
    const val = getWorksJsonEditorValue();
    if (!val) {
      return modalDraftRules || currentWorksRules || cachedDefaultRules || {};
    }
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      modalDraftRules = parsed;
      return parsed;
    }
  } catch {
    // ignore syntax error while user is actively typing in JSON
  }
  return modalDraftRules || currentWorksRules || cachedDefaultRules || {};
}

// Backward compatible helper: updates internal modal draft cache only, NEVER overwrites global currentWorksRules
function syncCurrentRulesFromEditorIfValid() {
  return getDraftRulesFromEditor();
}

// Safely resolve rules object, rejecting DOM Event objects or invalid inputs
function resolveValidRules(rulesObj) {
  if (rulesObj && typeof rulesObj === 'object' && !(rulesObj instanceof Event) && !('target' in rulesObj) && !Array.isArray(rulesObj)) {
    return rulesObj;
  }
  return getDraftRulesFromEditor();
}

// ---------------------------------------------------------------------------
// LOCALSTORAGE PERSISTENCE MECHANISM
// ---------------------------------------------------------------------------
const LOCAL_STORAGE_RULES_KEY = 'si_works_rules_v1';
const LOCAL_STORAGE_RULES_META_KEY = 'si_works_rules_v1_meta';

function saveWorksRulesToLocalStorage(rules) {
  if (!rules || typeof rules !== 'object') return false;
  if (window.rulesStore && typeof window.rulesStore.saveRules === 'function') {
    try {
      window.rulesStore.saveRules(rules);
      updateStorageStatusUi();
      return true;
    } catch (err) {
      console.error('Ошибка сохранения правил через rulesStore:', err);
    }
  }
  try {
    const jsonStr = JSON.stringify(rules);
    localStorage.setItem(LOCAL_STORAGE_RULES_KEY, jsonStr);
    const meta = {
      savedAt: Date.now(),
      sizeBytes: new Blob([jsonStr]).size,
      version: 1
    };
    localStorage.setItem(LOCAL_STORAGE_RULES_META_KEY, JSON.stringify(meta));
    updateStorageStatusUi();
    return true;
  } catch (err) {
    console.error('Ошибка сохранения правил в LocalStorage:', err);
    showToast('Не удалось сохранить правила в LocalStorage: ' + (err.message || err), 'warning', 'LocalStorage');
    return false;
  }
}

function loadWorksRulesFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_RULES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Ошибка чтения правил из LocalStorage:', err);
  }
  return null;
}

function clearWorksRulesFromLocalStorage() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_RULES_KEY);
    localStorage.removeItem(LOCAL_STORAGE_RULES_META_KEY);
    updateStorageStatusUi();
    return true;
  } catch (err) {
    console.warn('Ошибка очистки LocalStorage:', err);
    return false;
  }
}

function updateStorageStatusUi() {
  const raw = localStorage.getItem(LOCAL_STORAGE_RULES_KEY);
  let meta = null;
  try {
    const rawMeta = localStorage.getItem(LOCAL_STORAGE_RULES_META_KEY);
    if (rawMeta) meta = JSON.parse(rawMeta);
  } catch (e) {}

  const hasSaved = Boolean(raw);
  const settingsBadge = document.getElementById('settingsStorageStatusBadge');
  const sizeSpan = document.getElementById('storageSizeSpan');
  const dateSpan = document.getElementById('storageDateSpan');
  const footerIcon = document.getElementById('footerStorageSavedIcon');
  const footerText = document.getElementById('footerStorageText');

  const sizeKb = raw ? (raw.length / 1024).toFixed(1) + ' КБ' : '0 КБ';
  const dateStr = (meta && meta.savedAt) ? new Date(meta.savedAt).toLocaleString('ru-RU') : (hasSaved ? 'Сохранено' : '—');

  if (settingsBadge) {
    if (hasSaved) {
      settingsBadge.className = 'badge bg-success-subtle text-success border border-success-subtle';
      settingsBadge.textContent = 'Сохранено в LocalStorage';
    } else {
      settingsBadge.className = 'badge bg-secondary-subtle text-secondary-emphasis border';
      settingsBadge.textContent = 'Используется works_rules.json';
    }
  }

  if (sizeSpan) sizeSpan.textContent = sizeKb;
  if (dateSpan) dateSpan.textContent = dateStr;

  if (footerIcon) {
    if (hasSaved) footerIcon.className = 'bx bx-check-circle text-success';
    else footerIcon.className = 'bx bx-file text-secondary';
  }
  if (footerText) {
    footerText.textContent = hasSaved ? `LocalStorage: ${sizeKb}` : 'works_rules.json (файл)';
  }
}

window.saveWorksRulesToLocalStorage = saveWorksRulesToLocalStorage;
window.loadWorksRulesFromLocalStorage = loadWorksRulesFromLocalStorage;
window.clearWorksRulesFromLocalStorage = clearWorksRulesFromLocalStorage;
window.updateStorageStatusUi = updateStorageStatusUi;

// Initialize rules on page load from external works_rules.json or LocalStorage
async function initWorksRules() {
  let defaultData = null;
  try {
    const res = await fetch('./works_rules.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        cachedDefaultRules = JSON.parse(JSON.stringify(data));
        window.cachedDefaultRules = cachedDefaultRules;
        defaultData = JSON.parse(JSON.stringify(data));
      }
    }
  } catch (err) {
    console.warn('Не удалось загрузить стандартный файл works_rules.json:', err);
  }

  // Check if custom rules are saved in LocalStorage
  const localRules = loadWorksRulesFromLocalStorage();
  if (localRules) {
    currentWorksRules = JSON.parse(JSON.stringify(localRules));
    window.currentWorksRules = currentWorksRules;
    modalDraftRules = JSON.parse(JSON.stringify(localRules));
    renderRulesModalContent(currentWorksRules);
    updateStorageStatusUi();
    if (typeof currentData !== 'undefined' && currentData && typeof calculateVolumes === 'function') {
      calculateVolumes();
    }
    return currentWorksRules;
  }

  if (defaultData) {
    currentWorksRules = JSON.parse(JSON.stringify(defaultData));
    window.currentWorksRules = currentWorksRules;
    modalDraftRules = JSON.parse(JSON.stringify(defaultData));
    renderRulesModalContent(currentWorksRules);
    updateStorageStatusUi();
    if (typeof currentData !== 'undefined' && currentData && typeof calculateVolumes === 'function') {
      calculateVolumes();
    }
    return currentWorksRules;
  }
}

// Upload custom rules JSON into editor draft (requires clicking Apply & Recalculate to commit)
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

    modalDraftRules = parsed;

    setWorksJsonEditorValue(JSON.stringify(parsed, null, 2));
    validateWorksJsonInput();

    renderRulesModalContent(parsed);
    const sections = getRulesSections(parsed);
    let totalWays = 0;
    sections.forEach(s => totalWays += s.rules.length);
    showToast(`Сметные нормы из «${file.name}» загружены в редактор (${totalWays} способов в ${sections.length} разд.). Нажмите «Применить и пересчитать», чтобы активировать их.`, 'info', 'Файл загружен в редактор');
  } catch (err) {
    showToast('Ошибка синтаксиса JSON: ' + err.message, 'error', 'Ошибка файла');
  } finally {
    e.target.value = '';
  }
}

// Reset rules in editor draft to standard works_rules.json and clear LocalStorage
async function resetWorksRules() {
  let defaultData = null;
  try {
    const res = await fetch('./works_rules.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      cachedDefaultRules = JSON.parse(JSON.stringify(data));
      defaultData = JSON.parse(JSON.stringify(data));
    } else if (cachedDefaultRules) {
      defaultData = JSON.parse(JSON.stringify(cachedDefaultRules));
    }
  } catch (err) {
    if (cachedDefaultRules) {
      defaultData = JSON.parse(JSON.stringify(cachedDefaultRules));
    }
  }

  if (defaultData) {
    modalDraftRules = JSON.parse(JSON.stringify(defaultData));
    setWorksJsonEditorValue(JSON.stringify(defaultData, null, 2));
    validateWorksJsonInput();
    renderRulesModalContent(defaultData);
    clearWorksRulesFromLocalStorage();
    showToast('Стандартные нормы загружены в редактор, сохраненные правила удалены из LocalStorage. Нажмите «Применить и пересчитать», чтобы активировать их.', 'info', 'Сброс к заводским нормам');
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

// Standard search query extractor with clear-button toggle
function getModalSearchQuery(inputId, clearBtnId) {
  const input = document.getElementById(inputId);
  const query = input ? input.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById(clearBtnId);
  if (clearBtn) {
    if (query) clearBtn.classList.remove('d-none');
    else clearBtn.classList.add('d-none');
  }
  return query;
}

// Standard empty state placeholder for modal catalog tabs
function renderCatalogEmptyState(title, subtitle, icon = 'bx-search-alt') {
  return `
    <div class="text-center py-5 text-muted bg-light rounded border">
      <i class="bx ${icon} fs-1 text-muted opacity-50 mb-2 d-block"></i>
      <div class="fw-semibold">${escapeHtml(title)}</div>
      <div class="small text-muted mt-1">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

// Standard top header info bar with match counter
function renderCatalogHeaderBar(infoText) {
  return `
    <div class="small text-muted mb-2 d-flex justify-content-between align-items-center flex-wrap gap-1">
      <div>${infoText}</div>
    </div>
  `;
}

// Extract nested resources (materials, equipment, resources) from a work item
function getWorkItemNestedResources(work) {
  if (!work || typeof work !== 'object') return [];
  return [
    ...(Array.isArray(work["Материалы"]) ? work["Материалы"] : []),
    ...(Array.isArray(work["Оборудование"]) ? work["Оборудование"] : []),
    ...(Array.isArray(work["Ресурсы"]) ? work["Ресурсы"] : []),
    ...(Array.isArray(work.materials) ? work.materials : []),
    ...(Array.isArray(work.equipment) ? work.equipment : [])
  ];
}

// Unified work/material item row renderer for catalog modal cards
function renderModalWorkItemHtml(w, wIdx, options = {}) {
  if (typeof w === 'string') {
    return `
      <div class="p-2 rounded bg-body border mb-1 small">
        <div class="fw-semibold text-body">${wIdx + 1}. ${escapeHtml(w)}</div>
      </div>
    `;
  }

  const rawType = (w["Тип"] || w.type || (options.defaultType || 'работа')).trim().toLowerCase();
  const isEquip = rawType === 'оборудование' || rawType === 'equipment';
  const isMat = rawType === 'материал' || rawType === 'material';
  const formula = w["Формула"] || w.formula || (options.defaultFormula || 'КОЛИЧЕСТВО');
  const unit = w["Единицы измерения"] || w.unit || (options.defaultUnit || 'шт');
  const section = w["Раздел"] || w.section || (options.defaultSection || '');
  const showFormula = shouldShowFormula(w, options.parentShowFormula);
  const workComment = w["Комментарий"] || w.comment || '';

  let typeBadgeClass = 'bg-primary-subtle text-primary border';
  let typeIcon = 'bx-wrench';
  if (isEquip) {
    typeBadgeClass = 'bg-warning-subtle text-warning-emphasis border';
    typeIcon = 'bx-cube';
  } else if (isMat) {
    typeBadgeClass = 'badge-material';
    typeIcon = 'bx-layer';
  }

  const typeTitle = w["Тип"] || (isEquip ? 'оборудование' : (isMat ? 'материал' : 'работа'));

  const formulaDispBadge = showFormula
    ? `<span class="badge bg-light text-muted border ms-1" style="font-size: 0.68rem;" title="Отображение формулы включено"><i class="bx bx-show me-0_5"></i>в формулах</span>`
    : `<span class="badge bg-secondary-subtle text-muted border ms-1" style="font-size: 0.68rem;" title="Отображение формулы отключено («ОтображатьФормулу»: false)"><i class="bx bx-hide me-0_5"></i>без формулы</span>`;

  const explicitDec = (w["Округление"] !== undefined && w["Округление"] !== null && !isNaN(Number(w["Округление"])))
    ? Number(w["Округление"])
    : null;
  const roundingBadge = (explicitDec !== null)
    ? `<span class="badge bg-light text-primary border ms-1" style="font-size: 0.68rem;" title="Индивидуальное округление правила"><i class="bx bx-target-lock me-0_5"></i>округление: ${explicitDec} зн.</span>`
    : '';

  const extraBadges = options.extraBadges || '';
  const isSub = Boolean(options.isSub);
  const prefix = isSub ? `<span class="text-muted me-1 fw-bold">↳</span>${options.parentIdx !== undefined ? (options.parentIdx + 1) + '.' : ''}${wIdx + 1}. ` : `${wIdx + 1}. `;
  const containerClass = isSub ? 'p-2 rounded bg-body border mb-1 ms-3 small' : (options.bgClass || 'p-2 rounded bg-body border mb-1 small');

  return `
    <div class="${containerClass}">
      <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
        <div class="${isSub ? 'fw-medium' : 'fw-semibold'} text-body">
          ${prefix}${escapeHtml(w["Наименование"] || w.name || '')}${extraBadges}
        </div>
        <div class="d-flex align-items-center gap-1">
          ${unit ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap font-monospace">${escapeHtml(unit)}</span>` : ''}
        </div>
      </div>
      <div class="d-flex align-items-center gap-1 text-muted fs-xs flex-wrap">
        <span class="fw-medium">Формула:</span>
        <code class="px-1 py-0 bg-body-tertiary border rounded text-primary">${escapeHtml(formula)}</code>
        ${formulaDispBadge}${roundingBadge}
        ${section ? `<span class="badge bg-light text-secondary border ms-1" style="font-size: 0.68rem;">Раздел: ${escapeHtml(section)}</span>` : ''}
        <span class="badge ${typeBadgeClass} ms-auto"><i class='bx ${typeIcon} me-0_5'></i>${escapeHtml(typeTitle)}</span>
      </div>
      ${workComment ? `<div class="text-muted fs-xs mt-1 fst-italic"><i class='bx bx-comment-detail me-0_5'></i>${escapeHtml(workComment)}</div>` : ''}
    </div>
  `;
}

/// Helper to render rules cards for a specific section
function renderSingleRulesSectionHtml(sec, query) {
  if (!sec || !Array.isArray(sec.rules)) return { html: '', matchedCount: 0, totalCount: 0, worksCount: 0 };

  const isCableSec = sec.name.toLowerCase().includes('монтаж') || sec.name.toLowerCase().includes('кабел');
  const totalCount = sec.rules.length;
  let worksCount = 0;

  sec.rules.forEach(r => {
    const works = getRuleWorks(r);
    if (Array.isArray(works)) worksCount += works.length;
  });

  const matchingRules = sec.rules.filter(rule => {
    if (!query) return true;
    const rName = rule["Марка"] || rule["Название"] || rule.mark || rule.name || '';
    const works = getRuleWorks(rule);
    const worksNames = works.map(w => {
      if (!w) return '';
      if (typeof w === 'string') return w;
      return `${w["Наименование"] || w.name || ''} ${w["Единицы измерения"] || w.unit || ''} ${w["Тип"] || w.type || ''}`;
    }).join(' ');
    const rawWm = rule["Работы и материалы"] !== undefined ? rule["Работы и материалы"] : (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
    const tierKeys = (rawWm && typeof rawWm === 'object' && !Array.isArray(rawWm)) ? Object.keys(rawWm).join(' ') : '';
    const haystack = `${sec.name} ${rName} ${worksNames} ${tierKeys}`.toLowerCase();
    return haystack.includes(query);
  });

  if (matchingRules.length === 0) {
    return {
      html: renderCatalogEmptyState('Позиции не найдены', query ? 'Попробуйте изменить поисковый запрос' : 'В этом разделе пока нет правил', 'bx-search'),
      matchedCount: 0,
      totalCount,
      worksCount
    };
  }

  let html = '<div class="d-flex flex-column gap-3">';

  matchingRules.forEach((rule, rIdx) => {
    const rName = rule["Марка"] || rule["Название"] || 'Без названия';
    const rawWm = rule["Работы и материалы"] !== undefined 
      ? rule["Работы и материалы"] 
      : (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
    const works = getRuleWorks(rule);
    const isObjectStructure = rawWm && typeof rawWm === 'object' && !Array.isArray(rawWm);

    let worksHtml = '';
    let ruleWorksCount = 0;
    let ruleSubCount = 0;

    const renderWorkWithSubItems = (w, wIdx, tierContext = null) => {
      if (typeof w === 'string') {
        ruleWorksCount++;
        return `
          <div class="p-2 rounded bg-body border mb-1 small">
            <div class="fw-semibold text-body">${wIdx + 1}. ${escapeHtml(w)}</div>
          </div>
        `;
      }

      ruleWorksCount++;
      const threshold = (tierContext && tierContext.threshold !== null) ? tierContext.threshold : null;
      const isOver = tierContext ? tierContext.isOver : false;
      const tierBadge = threshold !== null 
        ? `<span class="badge bg-info-subtle text-info-emphasis border ms-1 font-monospace" style="font-size: 0.7rem;">до ${threshold} кг/м</span>`
        : (isOver ? `<span class="badge bg-warning-subtle text-warning-emphasis border ms-1 font-monospace" style="font-size: 0.7rem;">свыше</span>` : '');

      const cond = parseCableCountCondition(w);
      const condBadge = cond.hasCondition
        ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning ms-1 font-monospace" style="font-size: 0.7rem;" title="Условие применения: ${escapeHtml(cond.description)}"><i class="bx bx-git-branch me-0_5"></i>${escapeHtml(cond.description)}</span>`
        : '';

      const showFormula = shouldShowFormula(w);
      const section = w["Раздел"] || w.section || sec.name;

      const nested = getWorkItemNestedResources(w);
      ruleSubCount += nested.length;

      const subItemsHtml = nested.map((sub, sIdx) => {
        if (typeof sub === 'string') {
          return `
            <div class="p-2 rounded bg-body border mb-1 ms-3 small">
              <div class="text-body"><span class="text-muted me-1 fw-bold">↳</span>${wIdx + 1}.${sIdx + 1}. ${escapeHtml(sub)}</div>
            </div>
          `;
        }

        const isDirectSubEquip = Array.isArray(w["Оборудование"]) && w["Оборудование"].includes(sub);
        const subType = sub["Тип"] || sub.type || (isDirectSubEquip ? 'оборудование' : 'материал');

        return renderModalWorkItemHtml(sub, sIdx, {
          isSub: true,
          parentIdx: wIdx,
          defaultType: subType,
          defaultFormula: 'ДЛИНА',
          defaultUnit: sub["Единицы измерения"] || sub.unit || 'м',
          defaultSection: sub["Раздел"] || section,
          parentShowFormula: showFormula
        });
      }).join('');

      return renderModalWorkItemHtml(w, wIdx, {
        defaultFormula: 'ДЛИНА',
        defaultSection: section,
        extraBadges: `${tierBadge}${condBadge}`
      }) + subItemsHtml;
    };

    if (isObjectStructure) {
      const isEquipSec = sec.name.toLowerCase().includes('оборудован');
      Object.entries(rawWm).forEach(([key, itemsVal]) => {
        const items = Array.isArray(itemsVal) ? itemsVal : (itemsVal ? [itemsVal] : []);
        const isOptKey = key.toLowerCase().includes('оптич') || key.toLowerCase().includes('волс');
        let groupTitle = `Ключ: "${escapeHtml(key)}"`;
        let tierThreshold = null;
        let tierIsOver = false;

        if (isEquipSec) {
          groupTitle = `Способ установки: «${escapeHtml(key)}»`;
        } else if (rName.toLowerCase().includes('муфт')) {
          const isRuleOpt = rName.toLowerCase().includes('оптич') || rName.toLowerCase().includes('волс');
          const unitLabel = isRuleOpt ? 'волокон' : 'жил';
          const cleanKey = String(key).trim().replace(',', '.');
          const numK = parseFloat(cleanKey);
          if (!isNaN(numK)) {
            tierThreshold = numK;
            groupTitle = `Емкость до ${tierThreshold} ${unitLabel} (ключ "${escapeHtml(key)}")`;
          } else {
            groupTitle = `Емкость "${escapeHtml(key)}"`;
          }
        } else if (isOptKey) {
          groupTitle = `Оптический кабель (ключ "${escapeHtml(key)}")`;
        } else {
          const cleanKey = String(key).trim().replace(',', '.');
          const numK = parseFloat(cleanKey);
          if (!isNaN(numK) && /^-?\d+(?:\.\d+)?$/.test(cleanKey)) {
            tierThreshold = numK;
            groupTitle = `Категория до ${tierThreshold} кг/м (ключ "${escapeHtml(key)}")`;
          } else {
            const matchDo = cleanKey.match(/(?:до|макс(?:имум)?)\s*[:;]?\s*(\d+(?:[.,]\d+)?)/i);
            if (matchDo) {
              tierThreshold = parseFloat(matchDo[1].replace(',', '.'));
            }
            if (/(?:свыше|более|от|>)\s*[:;]?\s*\d+/i.test(cleanKey)) {
              tierIsOver = true;
              const matchOver = cleanKey.match(/(?:свыше|более|от|>)\s*[:;]?\s*(\d+(?:[.,]\d+)?)/i);
              if (matchOver) tierThreshold = parseFloat(matchOver[1].replace(',', '.'));
            }
            if (tierThreshold === null && items && items.length > 0) {
              for (const it of items) {
                if (it && typeof it === 'object' && it["МаксВес"] !== undefined) {
                  const mw = parseFloat(String(it["МаксВес"]).replace(',', '.'));
                  if (!isNaN(mw)) {
                    tierThreshold = mw;
                    break;
                  }
                }
              }
            }
            if (tierThreshold !== null) {
              groupTitle = tierIsOver 
                ? `Категория свыше ${tierThreshold} кг/м (ключ "${escapeHtml(key)}")`
                : `Категория до ${tierThreshold} кг/м (ключ "${escapeHtml(key)}")`;
            } else {
              groupTitle = `Категория "${escapeHtml(key)}"`;
            }
          }
        }

        const tierContext = isCableSec ? { threshold: tierThreshold, isOver: tierIsOver } : null;

        let tierWorksCount = 0;
        let tierSubCount = 0;
        const groupItemsHtml = items.map((w, wIdx) => {
          const beforeWorks = ruleWorksCount;
          const beforeSubs = ruleSubCount;
          const res = renderWorkWithSubItems(w, wIdx, tierContext);
          tierWorksCount += (ruleWorksCount - beforeWorks);
          tierSubCount += (ruleSubCount - beforeSubs);
          return res;
        }).join('');

        const tierBadgeText = tierSubCount > 0 
          ? `${tierWorksCount} норм, ${tierSubCount} мат.`
          : `${items.length} поз.`;

        worksHtml += `
          <div class="mb-2 p-2 rounded bg-body-tertiary border">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="fw-bold text-primary small d-flex align-items-center gap-1">
                <i class="bx bx-category-alt"></i> ${groupTitle}
              </span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace fs-xs fw-semibold">${tierBadgeText}</span>
            </div>
            ${groupItemsHtml || '<div class="text-muted small ps-2">Нет позиций</div>'}
          </div>
        `;
      });
    } else {
      const topWorks = Array.isArray(rawWm) ? rawWm : works;
      worksHtml = topWorks.map((w, wIdx) => renderWorkWithSubItems(w, wIdx)).join('');
    }

    const cardBadges = [];
    if (ruleWorksCount > 0) {
      cardBadges.push(`<span class="badge bg-primary-subtle text-primary border">${ruleWorksCount} норм</span>`);
    }
    if (ruleSubCount > 0) {
      cardBadges.push(`<span class="badge bg-warning-subtle text-warning-emphasis border">${ruleSubCount} мат./обор.</span>`);
    }
    if (cardBadges.length === 0) {
      cardBadges.push(`<span class="badge bg-primary-subtle text-primary border">${works.length} поз.</span>`);
    }

    html += `
      <div class="card border shadow-sm">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="fw-bold d-flex align-items-center gap-2">
            <i class="bx bx-git-commit text-primary"></i>
            <span>${rIdx + 1}. ${escapeHtml(rName)}</span>
          </div>
          <div class="d-flex align-items-center gap-1_5">
            ${cardBadges.join('')}
            <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1_5 btn-edit-rule" data-rule-section="${escapeHtml(sec.name)}" data-rule-name="${escapeHtml(rName)}" title="Редактировать этот способ прокладки">
              <i class='bx bx-edit-alt'></i>
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1_5 btn-delete-rule" data-rule-section="${escapeHtml(sec.name)}" data-rule-name="${escapeHtml(rName)}" title="Удалить этот способ прокладки из правил">
              <i class='bx bx-trash'></i>
            </button>
          </div>
        </div>
        <div class="card-body p-3">
          ${worksHtml || '<div class="text-muted small">Работы и материалы не определены</div>'}
        </div>
      </div>
    `;
  });

  html += '</div>';

  return {
    html,
    matchedCount: matchingRules.length,
    totalCount,
    worksCount
  };
}

// Render rules modal cards, cable catalog, couplings, equipment and settings tabs
function renderRulesModalContent(rulesObj = null, updateAllTabs = true) {
  const rules = resolveValidRules(rulesObj);
  
  if (updateAllTabs) {
    renderCableCatalogModalContent(rules);
    renderCouplingCatalogModalContent(rules);
    renderEquipmentCatalogModalContent(rules);
    renderSettingsModalContent(rules);
  }

  const sections = getRulesSections(rules);
  const constContainer = document.getElementById('rulesConstructionListContainer');
  const instContainer = document.getElementById('rulesInstallationListContainer');
  const legacyContainer = document.getElementById('rulesListContainer');

  const missingCable = (window.lastCableWorksCalc && window.lastCableWorksCalc.missingInRules) ? window.lastCableWorksCalc.missingInRules : [];
  const missingTrench = (window.lastTrenchWorksCalc && window.lastTrenchWorksCalc.missingInRules) ? window.lastTrenchWorksCalc.missingInRules : [];

  // Helper to build a missing items alert
  const buildMissingNotice = (items, label) => {
    if (!items || items.length === 0) return '';
    const names = items.map(m => `«${escapeHtml(m.type || m.mark)}»`).join(', ');
    return `
      <div class="alert alert-warning py-2_5 px-3 mb-3 border-warning shadow-sm small">
        <div class="d-flex align-items-start gap-2">
          <i class="bx bx-alarm-exclamation fs-4 text-warning flex-shrink-0 mt-0_5"></i>
          <div class="flex-grow-1">
            <div class="fw-bold text-dark">В проекте есть позиции без правил (${label}):</div>
            <div class="text-body-secondary mt-1">${names}</div>
            <div class="text-muted fs-xs mt-1">Добавьте способ прокладки для данных позиций с помощью кнопки выше.</div>
          </div>
        </div>
      </div>
    `;
  };

  // 1. Render Строительные работы
  const constSec = sections.find(s => s.name === 'Строительные работы' || s.name.toLowerCase().includes('строит')) || { name: 'Строительные работы', rules: [] };
  const constQuery = getModalSearchQuery('rulesConstructionSearchInput', 'rulesConstructionClearSearchBtn');
  const constResult = renderSingleRulesSectionHtml(constSec, constQuery);

  if (constContainer) {
    constContainer.innerHTML = buildMissingNotice(missingTrench, 'Строительные работы') + constResult.html;
  }
  const constCountBadge = document.getElementById('worksConstructionCountBadge');
  if (constCountBadge) {
    constCountBadge.textContent = `${constResult.totalCount} способов (${constResult.worksCount} поз.)`;
  }
  const tabConstBadge = document.getElementById('tabWorksConstructionCountBadge');
  if (tabConstBadge) {
    tabConstBadge.textContent = constResult.totalCount;
  }

  // 2. Render Монтажные работы
  const instSec = sections.find(s => s.name === 'Монтажные работы' || s.name.toLowerCase().includes('монтаж')) || { name: 'Монтажные работы', rules: [] };
  const instQuery = getModalSearchQuery('rulesInstallationSearchInput', 'rulesInstallationClearSearchBtn');
  const instResult = renderSingleRulesSectionHtml(instSec, instQuery);

  if (instContainer) {
    instContainer.innerHTML = buildMissingNotice(missingCable, 'Монтажные работы') + instResult.html;
  }
  const instCountBadge = document.getElementById('worksInstallationCountBadge');
  if (instCountBadge) {
    instCountBadge.textContent = `${instResult.totalCount} способов (${instResult.worksCount} поз.)`;
  }
  const tabInstBadge = document.getElementById('tabWorksInstallationCountBadge');
  if (tabInstBadge) {
    tabInstBadge.textContent = instResult.totalCount;
  }

  // 3. Backward compatibility for legacyContainer
  if (legacyContainer) {
    let combinedHtml = '';
    const query = getModalSearchQuery('rulesCardsSearchInput', 'rulesCardsClearSearchBtn');
    sections.forEach(sec => {
      const res = renderSingleRulesSectionHtml(sec, query);
      combinedHtml += `<div class="mb-3"><h5 class="fw-bold border-bottom pb-1 text-primary">${escapeHtml(sec.name)}</h5>${res.html}</div>`;
    });
    legacyContainer.innerHTML = combinedHtml;
  }
}

// Dynamically populate Cable Group dropdown and datalist from active rules catalog
function populateDynamicCableGroups(rulesObj = null) {
  const rules = resolveValidRules(rulesObj);
  const catalog = getCableCatalog(rules) || {};
  const entries = Object.entries(catalog);

  // 1. Populate dropdown menu (#dropdownCableGroupList)
  const dropdownList = document.getElementById('dropdownCableGroupList');
  if (dropdownList) {
    if (entries.length === 0) {
      dropdownList.innerHTML = `
        <li><span class="dropdown-item-text small text-muted fst-italic py-2 px-3">Справочник кабелей пуст</span></li>
      `;
    } else {
      dropdownList.innerHTML = entries.map(([grpKey, grpVal]) => {
        const rawName = (grpVal && typeof grpVal === 'object' && (grpVal["Название"] || grpVal["Наименование"])) || '';
        const effectiveName = rawName || (grpKey === '' ? 'Основная группа' : grpKey);
        const codeDisplay = grpKey === '' ? '<code>"" (пусто)</code>' : `<code>"${escapeHtml(grpKey)}"</code>`;
        const count = (grpVal && grpVal["Тип"] && typeof grpVal["Тип"] === 'object') ? Object.keys(grpVal["Тип"]).length : 0;
        const countBadge = count > 0 ? `<span class="badge bg-light text-muted border ms-auto fs-xs">${count} мар.</span>` : '';
        const isOpt = Boolean(grpVal?.["Категория"] === 'Оптический кабель' || String(grpKey).toLowerCase().includes('оптич') || String(effectiveName).toLowerCase().includes('оптич'));
        const optBadge = isOpt ? `<span class="badge bg-info-subtle text-info border ms-1 fs-xs">ВОЛС</span>` : '';

        return `
          <li>
            <a class="dropdown-item small d-flex align-items-center justify-content-between gap-2 py-1_5" href="#" data-group="${escapeHtml(grpKey)}" data-name="${escapeHtml(effectiveName)}">
              <div class="text-truncate">
                ${codeDisplay} — <span class="fw-medium">${escapeHtml(effectiveName)}</span>${optBadge}
              </div>
              ${countBadge}
            </a>
          </li>
        `;
      }).join('');
    }
  }

  // 2. Populate datalist (#datalistCableGroups)
  const groupDatalist = document.getElementById('datalistCableGroups');
  if (groupDatalist) {
    groupDatalist.innerHTML = entries.map(([k, v]) => {
      const gName = (v && typeof v === 'object' && (v["Название"] || v["Наименование"])) || (k === '' ? 'Основная группа' : k);
      const label = k === '' ? '"" (Основная группа)' : `${k} (${gName})`;
      return `<option value="${escapeHtml(k)}">${escapeHtml(label)}</option>`;
    }).join('');
  }
}

// Render Cable Catalog Tab Content
function renderCableCatalogModalContent(rulesObj = null) {
  const container = document.getElementById('cableCatalogContainer');
  const tabBadge = document.getElementById('tabWorksCablesCountBadge');
  if (!container) return;

  const rules = resolveValidRules(rulesObj);
  const catalog = getCableCatalog(rules) || {};
  const groups = Object.keys(catalog);

  // Dynamically populate Cable Group dropdown and datalist with active rules
  populateDynamicCableGroups(rules);

  const query = getModalSearchQuery('cableCatalogSearchInput', 'cableCatalogClearSearchBtn');

  const catFilter = document.getElementById('cableCatalogCategoryFilter');
  const catVal = catFilter ? catFilter.value : 'all';

  let totalMarksCount = 0;
  const renderedGroups = [];

  groups.forEach(groupName => {
    const groupObj = catalog[groupName];
    if (!groupObj || typeof groupObj !== 'object') return;

    const brandName = groupObj["Название"] || (groupName === '' ? 'СБВБПу' : groupName);
    const groupCat = groupObj["Категория"] || '';
    const isOptCategory = String(groupCat || groupName || brandName || '').trim().toLowerCase() === 'оптический кабель';
    if (catVal === 'optical' && !isOptCategory) return;
    if (catVal === 'special' && !/особ/i.test(groupName) && !/особ/i.test(brandName)) return;
    if (catVal === 'signaling' && (isOptCategory || /особ/i.test(groupName) || /особ/i.test(brandName))) return;

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
      const cat = item["Категория"] || groupCat || '';

      if (query) {
        const fullHaystack = `${markKey} ${groupName} ${brandName} ${desc} ${coupling} ${buildLen} ${weight} ${cat}`.toLowerCase();
        if (!fullHaystack.includes(query)) return;
      }

      filteredMarks.push({
        mark: markKey,
        data: item,
        groupName: groupName
      });
    });

    const matchesGroupDirectly = query && `${groupName} ${brandName} ${groupCat}`.toLowerCase().includes(query);

    if (filteredMarks.length > 0 || !query || matchesGroupDirectly) {
      renderedGroups.push({
        key: groupName,
        brandName: brandName,
        category: groupCat,
        marks: filteredMarks,
        totalInGroup: markNames.length
      });
    }
  });

  if (tabBadge) {
    tabBadge.textContent = totalMarksCount;
  }

  if (renderedGroups.length === 0) {
    container.innerHTML = renderCatalogEmptyState('По вашему запросу кабели не найдены', 'Попробуйте изменить поисковый запрос или выбрать «Все марки и группы»');
    return;
  }

  let html = '';
  let matchCount = 0;

  renderedGroups.forEach(g => {
    matchCount += g.marks.length;
    const isOptGroup = String(g.category || g.brandName || g.key || '').trim().toLowerCase() === 'оптический кабель';
    const isSpecialGroup = /особ/i.test(g.key) || /особ/i.test(g.brandName);

    let codeBadge = '';
    if (g.key === '') {
      codeBadge = `<span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace px-2 py-1" title="Основная марка без специального символа">"" (без знака)</span>`;
    } else if (g.key === '\\U+0394') {
      codeBadge = `<span class="badge bg-primary-subtle text-primary border font-monospace px-2 py-1" title="Греческая буква Дельта (AutoCAD: \\U+0394)">\\U+0394 (Δ)</span>`;
    } else {
      codeBadge = `<span class="badge bg-primary-subtle text-primary border font-monospace px-2 py-1" title="Условное обозначение на схеме">${escapeHtml(g.key)}</span>`;
    }

    let catBadge = '';
    if (isOptGroup) {
      catBadge = `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle small ms-1">ВОЛС</span>`;
    } else if (isSpecialGroup) {
      catBadge = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle small ms-1">Особый</span>`;
    } else if (g.category) {
      catBadge = `<span class="badge bg-light text-muted border small ms-1">${escapeHtml(g.category)}</span>`;
    }

    let rowsHtml = '';
    if (g.marks.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="6" class="text-center py-3 text-muted small">
            <i class='bx bx-info-circle me-1 text-primary'></i> В этой группе пока нет марок кабелей.
            <button type="button" class="btn btn-xs btn-outline-primary ms-2 btn-add-mark-to-group" data-group-key="${escapeHtml(g.key)}" data-group-name="${escapeHtml(g.brandName)}">
              <i class='bx bx-plus me-0_5'></i>Добавить первую марку
            </button>
          </td>
        </tr>
      `;
    } else {
      const displayGroupSymbol = g.key === '' ? '"" (без знака)' : (g.key === '\\U+0394' ? '\\U+0394 (Δ)' : `"${g.key}"`);

      rowsHtml = g.marks.map(m => {
        const d = m.data;
        const isOptical = String(d["Категория"] || g.category || '').trim().toLowerCase() === 'оптический кабель';
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

        return `
          <tr>
            <td class="ps-3">
              <div class="fw-bold text-dark font-monospace">${escapeHtml(m.mark)} ${markBadge}</div>
              <div class="fs-xs text-muted">
                Обозначение: <span class="font-monospace fw-semibold text-primary">${escapeHtml(displayGroupSymbol)}</span>
                <span class="fst-italic text-secondary">(${escapeHtml(g.brandName)})</span>
              </div>
            </td>
            <td>
              <div class="text-body" style="max-width: 380px; line-height: 1.35;">${escapeHtml(d["Полное описание"] || m.mark)}</div>
            </td>
            <td class="text-center">${lenFormatted}</td>
            <td class="text-center">${weightFormatted}</td>
            <td>${couplingFormatted}</td>
            <td class="text-end pe-3 text-nowrap">
              <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1_5 btn-edit-cable" data-cable-group="${escapeHtml(m.groupName)}" data-cable-mark="${escapeHtml(m.mark)}" title="Редактировать параметры марки кабеля">
                <i class='bx bx-edit-alt'></i>
              </button>
              <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1_5 btn-delete-cable" data-cable-group="${escapeHtml(m.groupName)}" data-cable-mark="${escapeHtml(m.mark)}" title="Удалить эту марку кабеля из справочника">
                <i class='bx bx-trash'></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    html += `
      <div class="card border shadow-sm mb-3">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <i class="bx ${isOptGroup ? 'bx-broadcast text-info' : 'bx-cable text-primary'} fs-5"></i>
            <div class="d-flex align-items-center gap-2">
              ${codeBadge}
              <span class="fs-6 fw-bold text-dark">${escapeHtml(g.brandName)}</span>
              ${catBadge}
            </div>
          </div>
          <div class="d-flex align-items-center gap-1 flex-wrap">
            <span class="badge bg-secondary-subtle text-secondary-emphasis border me-1">${g.marks.length} марок</span>
            <button type="button" class="btn btn-xs btn-outline-secondary py-1 px-2 btn-edit-cable-group d-inline-flex align-items-center gap-1" data-group-key="${escapeHtml(g.key)}" title="Изменить соответствие наименования марки «${escapeHtml(g.brandName)}» и условного обозначения">
              <i class='bx bx-edit-alt'></i> Изменить группу
            </button>
            <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2 btn-add-mark-to-group d-inline-flex align-items-center gap-1" data-group-key="${escapeHtml(g.key)}" data-group-name="${escapeHtml(g.brandName)}" title="Добавить типоразмер кабеля в эту группу">
              <i class='bx bx-plus'></i> Добавить марку
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger py-1 px-1_5 btn-delete-cable-group" data-group-key="${escapeHtml(g.key)}" data-group-name="${escapeHtml(g.brandName)}" title="Удалить эту группу кабелей и условное обозначение">
              <i class='bx bx-trash'></i>
            </button>
          </div>
        </div>
        <div class="card-body p-0 table-responsive">
          <table class="table table-sm table-hover align-middle mb-0 text-start">
            <thead class="table-light text-muted small border-bottom">
              <tr>
                <th style="width: 25%;" class="ps-3">Марка / Обозначение</th>
                <th style="width: 28%;">Полное наименование по ТУ/ГОСТ</th>
                <th style="width: 12%;" class="text-center">Строит. длина, м</th>
                <th style="width: 10%;" class="text-center">Вес, кг/м</th>
                <th style="width: 11%;">Тип муфты</th>
                <th style="width: 14%;" class="text-end pe-3">Действия</th>
              </tr>
            </thead>
            <tbody class="small">
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = renderCatalogHeaderBar(`Показано: <strong>${matchCount}</strong> из ${totalMarksCount} марок кабелей в справочнике`) + html;
}

// Helper to get equipment rules dictionary
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

function renderEquipmentCatalogModalContent(rulesObj = null) {
  const container = document.getElementById('equipmentCatalogContainer');
  const tabBadge = document.getElementById('tabWorksEquipmentCountBadge');
  if (!container) return;

  const rules = resolveValidRules(rulesObj);
  const equipmentList = getEquipmentRulesList(rules);
  const totalEquipmentCount = equipmentList.length;

  if (tabBadge) {
    tabBadge.textContent = totalEquipmentCount;
  }

  const query = getModalSearchQuery('equipmentCatalogSearchInput', 'equipmentCatalogClearSearchBtn');

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
        getWorkItemNestedResources(w).forEach(n => {
          if (typeof n === 'string') worksNames += ' ' + n;
          else worksNames += ' ' + (n["Наименование"] || n.name || '');
        });
      });
    });
    return `${mark} ${desc} ${methods} ${worksNames}`.toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = renderCatalogEmptyState(
      'Оборудование не найдено',
      totalEquipmentCount === 0
        ? 'В разделе «Оборудование» файла JSON сметных норм пока нет позиций. Нажмите «Добавить оборудование».'
        : 'Попробуйте изменить поисковый запрос или добавьте новую марку оборудования.'
    );
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
          totalSubItemsAcrossAll += getWorkItemNestedResources(w).length;
        }
      });
    });
  });

  const cardsHtml = filtered.map((item, idx) => {
    const mark = (item["Марка"] || item.mark || 'Без марки').trim();
    const fullDesc = (item["Полное наименование"] || item["Описание"] || item["Название"] || item.description || '').trim();
    const unitTop = item["Единицы измерения"] || item.unit || '';
    const noteTop = item["Примечание"] || item["Комментарий"] || item.comment || '';
    const wm = getEquipmentItemWorksObject(item);
    const methodEntries = Object.entries(wm);

    let cardWorksCount = 0;
    let cardSubCount = 0;

    const methodsHtml = methodEntries.map(([methodName, worksArr]) => {
      const worksList = Array.isArray(worksArr) ? worksArr : (worksArr ? [worksArr] : []);
      cardWorksCount += worksList.length;

      const worksItemsHtml = worksList.map((work, wIdx) => {
        if (typeof work === 'string') {
          return `
            <div class="p-2 rounded bg-body border mb-1 small">
              <div class="fw-semibold text-body">${wIdx + 1}. ${escapeHtml(work)}</div>
            </div>
          `;
        }

        const isDirectEquip = Array.isArray(work["Оборудование"]);
        const mainType = work["Тип"] || work.type || (isDirectEquip ? 'оборудование' : 'работа');
        const showFormula = shouldShowFormula(work);
        const section = work["Раздел"] || work.section || 'Монтажные работы';

        const nested = getWorkItemNestedResources(work);
        cardSubCount += nested.length;

        const subItemsHtml = nested.map((sub, sIdx) => {
          if (typeof sub === 'string') {
            return `
              <div class="p-2 rounded bg-body border mb-1 ms-3 small">
                <div class="text-body"><span class="text-muted me-1 fw-bold">↳</span>${wIdx + 1}.${sIdx + 1}. ${escapeHtml(sub)}</div>
              </div>
            `;
          }

          const isDirectSubEquip = Array.isArray(work["Оборудование"]) && work["Оборудование"].includes(sub);
          const subType = sub["Тип"] || sub.type || (isDirectSubEquip ? 'оборудование' : 'материал');

          return renderModalWorkItemHtml(sub, sIdx, {
            isSub: true,
            parentIdx: wIdx,
            defaultType: subType,
            defaultFormula: 'КОЛИЧЕСТВО',
            defaultUnit: 'шт',
            defaultSection: section,
            parentShowFormula: showFormula
          });
        }).join('');

        return renderModalWorkItemHtml(work, wIdx, {
          defaultType: mainType,
          defaultFormula: 'КОЛИЧЕСТВО',
          defaultUnit: unitTop || 'шт',
          defaultSection: section
        }) + subItemsHtml;
      }).join('');

      return `
        <div class="mb-3 p-2_5 rounded bg-body-tertiary border">
          <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
            <span class="fw-bold text-primary small d-flex align-items-center gap-1">
              <i class="bx bx-wrench"></i> Способ установки: «${escapeHtml(methodName)}»
            </span>
            <div class="d-flex align-items-center gap-1">
              <span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace fs-xs">${worksList.length} поз.</span>
              <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1_5 btn-edit-equipment-method" data-equipment-mark="${escapeHtml(mark)}" data-method-name="${escapeHtml(methodName)}" title="Редактировать сметные нормы для способа «${escapeHtml(methodName)}»">
                <i class='bx bx-edit-alt'></i>
              </button>
              <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1_5 btn-delete-equipment-method" data-equipment-mark="${escapeHtml(mark)}" data-method-name="${escapeHtml(methodName)}" title="Удалить этот способ установки">
                <i class='bx bx-trash'></i>
              </button>
            </div>
          </div>
          ${worksItemsHtml || '<div class="text-muted small ps-2">Работы и материалы не определены</div>'}
        </div>
      `;
    }).join('');

    return `
      <div class="card border shadow-sm mb-3">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="fw-bold d-flex align-items-center gap-2 flex-wrap">
            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace">${idx + 1}</span>
            <i class="bx bx-cube text-warning fs-5"></i>
            <span class="fs-6 font-monospace">${escapeHtml(mark)}</span>
            ${fullDesc ? `<span class="text-muted small fw-normal ms-1">(${escapeHtml(fullDesc)})</span>` : ''}
            ${unitTop ? `<span class="badge bg-body text-body border font-monospace ms-1" style="font-size: 0.72rem;">${escapeHtml(unitTop)}</span>` : ''}
          </div>
          <div class="d-flex align-items-center gap-1_5">
            <span class="badge bg-primary-subtle text-primary border">${methodEntries.length} способов установки</span>
            ${cardWorksCount > 0 ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border">${cardWorksCount} норм</span>` : ''}
            ${cardSubCount > 0 ? `<span class="badge bg-warning-subtle text-warning-emphasis border">${cardSubCount} мат./обор.</span>` : ''}
            <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1_5 btn-edit-equipment" data-equipment-mark="${escapeHtml(mark)}" title="Редактировать позицию оборудования">
              <i class='bx bx-edit-alt'></i>
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1_5 btn-delete-equipment" data-equipment-mark="${escapeHtml(mark)}" title="Удалить всё оборудование «${escapeHtml(mark)}»">
              <i class='bx bx-trash'></i>
            </button>
          </div>
        </div>
        ${noteTop ? `<div class="px-3 pt-2 pb-0 text-muted small fst-italic"><i class='bx bx-info-circle me-1'></i>${escapeHtml(noteTop)}</div>` : ''}
        <div class="card-body p-3">
          ${methodsHtml || '<div class="text-muted small">Способы установки не заданы</div>'}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${renderCatalogHeaderBar(`Показано: <strong>${filtered.length}</strong> из ${totalEquipmentCount} позиций оборудования (${totalMethodsAcrossAll} способов установки, ${totalWorksAcrossAll} норм, ${totalSubItemsAcrossAll} вложенных мат./обор. в JSON)`)}
    ${cardsHtml}
  `;
}

// --------------------------------------------------------------------------
// SETTINGS TAB
// --------------------------------------------------------------------------

function renderSettingsModalContent(rulesObj = null) {
  const rules = resolveValidRules(rulesObj);
  const settings = getRulesSettings(rules);

  const numSelect = document.getElementById('settingNumberingMode');
  if (numSelect) numSelect.value = settings.numberingMode;

  const decWorksInput = document.getElementById('settingDecimalsWorks');
  if (decWorksInput) decWorksInput.value = settings.decimalsWorks;

  const decMatsInput = document.getElementById('settingDecimalsMaterials');
  if (decMatsInput) decMatsInput.value = settings.decimalsMaterials;

  const ggeVerInput = document.getElementById('settingGgeVersion');
  if (ggeVerInput) ggeVerInput.value = settings.ggeVersion;

  const accLevelInput = document.getElementById('settingAccessLevel');
  if (accLevelInput) accLevelInput.value = settings.accessLevel;

  const softNameInput = document.getElementById('settingSoftName');
  if (softNameInput) softNameInput.value = settings.softName;

  const pluginVerInput = document.getElementById('settingPluginVersion');
  if (pluginVerInput) pluginVerInput.value = settings.pluginVersion;
}

function saveSettingsFromUiToJson(showToastNotification = true) {
  const currentDraft = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || {}));

  const numMode = document.getElementById('settingNumberingMode')?.value || 'иерархическая';
  const decWorks = parseInt(document.getElementById('settingDecimalsWorks')?.value, 10);
  const decMats = parseInt(document.getElementById('settingDecimalsMaterials')?.value, 10);
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
    "ОкруглениеРабот": !isNaN(decWorks) ? Math.max(0, Math.min(10, decWorks)) : 2,
    "ОкруглениеМатериалов": !isNaN(decMats) ? Math.max(0, Math.min(10, decMats)) : 3
  };

  const newDraftObj = {
    "Настройки": updatedSettings
  };
  for (const [k, v] of Object.entries(currentDraft)) {
    if (k !== "Настройки") {
      newDraftObj[k] = v;
    }
  }

  modalDraftRules = newDraftObj;
  setWorksJsonEditorValue(JSON.stringify(newDraftObj, null, 2));
  validateWorksJsonInput();

  if (showToastNotification) {
    showToast('Параметры обновлены в редакторе JSON. Нажмите «Применить и пересчитать», чтобы применить изменения.', 'info', 'Настройки');
  }
}

function resetDefaultSettings() {
  const defaultSettings = {
    "ТипНумерации": "иерархическая",
    "ВерсияGGE": "3.01",
    "УровеньДоступа": "коммерческая тайна",
    "ПрограммныйКомплекс": "Программный комплекс \"Строительный эксперт\"  v7.3.1.7813",
    "ПлагинGGE": "Plugin EvhEstGGE.dll v3.6.1.1377 2026-09-08 12:08:13",
    "ОкруглениеРабот": 2,
    "ОкруглениеМатериалов": 3
  };

  const currentDraft = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || {}));
  const newDraftObj = {
    "Настройки": defaultSettings
  };
  for (const [k, v] of Object.entries(currentDraft)) {
    if (k !== "Настройки") {
      newDraftObj[k] = v;
    }
  }

  modalDraftRules = newDraftObj;
  setWorksJsonEditorValue(JSON.stringify(newDraftObj, null, 2));
  validateWorksJsonInput();
  renderSettingsModalContent(newDraftObj);

  showToast('Настройки в редакторе сброшены к стандартным значениям. Нажмите «Применить и пересчитать», чтобы применить их.', 'info', 'Сброс настроек');
}

// --------------------------------------------------------------------------
// RENDER COUPLING CATALOG TAB
// --------------------------------------------------------------------------

function renderCouplingCatalogModalContent(rulesObj = null) {
  const container = document.getElementById('couplingCatalogContainer');
  const tabBadge = document.getElementById('tabWorksCouplingsCountBadge');
  if (!container) return;

  const rules = resolveValidRules(rulesObj);
  const catalog = getCouplingCatalog(rules) || {};
  const entries = Object.entries(catalog);
  const totalCouplingsCount = entries.length;

  if (tabBadge) {
    tabBadge.textContent = totalCouplingsCount;
  }

  const query = getModalSearchQuery('couplingCatalogSearchInput', 'couplingCatalogClearSearchBtn');

  const filtered = entries.filter(([mark, data]) => {
    if (!query) return true;
    const fullName = (data && data["Полное наименование"]) || '';
    const maxCores = (data && data["МаксЖил"]) !== undefined ? String(data["МаксЖил"]) : '';
    const unit = (data && data["Единицы измерения"]) || '';
    return `${mark} ${fullName} ${maxCores} ${unit}`.toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = renderCatalogEmptyState(
      'По вашему запросу муфты не найдены',
      'Попробуйте изменить поисковый запрос или добавьте новую муфту через кнопку «Добавить муфту»'
    );
    return;
  }

  const rowsHtml = filtered.map(([mark, data], idx) => {
    const fullName = (data && data["Полное наименование"]) || mark;
    const maxCores = (data && data["МаксЖил"]) !== undefined ? data["МаксЖил"] : parseMaxCoresFromString(mark);
    const unit = (data && data["Единицы измерения"]) || 'шт';
    const isOpt = !!(data && String(data["Категория"] || '').trim().toLowerCase() === 'оптическая муфта');
    const tier = getCouplingInstallationTier(maxCores, rules, isOpt);
    const unitLabel = isOpt ? 'волокон' : 'жил';
    const optBadge = isOpt
      ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" style="font-size: 0.65rem;">ВОЛС</span>`
      : '';

    return `
      <tr>
        <td class="text-center text-muted small ps-3">${idx + 1}</td>
        <td>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace py-1 px-2" style="font-size: 0.82rem;">${escapeHtml(mark)}</span>${optBadge}
        </td>
        <td>
          <div class="text-body fw-medium" style="line-height: 1.35;">${escapeHtml(fullName)}</div>
        </td>
        <td class="text-center">
          <span class="badge bg-body-secondary text-body border" style="font-size: 0.78rem;">до ${maxCores} ${unitLabel}</span>
        </td>
        <td class="text-center">
          <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace" style="font-size: 0.75rem;">до ${tier} ${unitLabel}</span>
        </td>
        <td class="text-center font-monospace text-muted small">${escapeHtml(unit)}</td>
        <td class="text-end pe-3 text-nowrap">
          <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1_5 btn-edit-coupling" data-coupling-mark="${escapeHtml(mark)}" title="Редактировать муфту">
            <i class='bx bx-edit-alt'></i>
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1_5 btn-delete-coupling" data-coupling-mark="${escapeHtml(mark)}" title="Удалить эту муфту из справочника">
            <i class='bx bx-trash'></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    ${renderCatalogHeaderBar(`Показано: <strong>${filtered.length}</strong> из ${totalCouplingsCount} позиций муфт в справочнике`)}
    <div class="card border shadow-sm">
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width: 40px;" class="text-center ps-3">№</th>
              <th style="width: 220px;">Обозначение / Марка</th>
              <th>Полное наименование</th>
              <th style="width: 110px;" class="text-center">Макс. жил</th>
              <th style="width: 130px;" class="text-center">Группа установки</th>
              <th style="width: 70px;" class="text-center">Ед. изм.</th>
              <th style="width: 120px;" class="text-end pe-3">Действия</th>
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

// --------------------------------------------------------------------------
// WORKS RULES & NORMS JSON EDITOR (WITH CODEMIRROR)
// --------------------------------------------------------------------------

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

    const debouncedValidateCodeMirror = debounce(validateWorksJsonInput, 200);

    worksJsonCodeMirror.on('change', () => {
      textarea.value = worksJsonCodeMirror.getValue();
      debouncedValidateCodeMirror();
    });

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


function openWorksRulesModal(activeTab = 'editor') {
  const modalEl = document.getElementById('worksRulesModal');
  if (!modalEl) return;

  try {
    initWorksJsonCodeMirror();
    const activeRulesCopy = JSON.parse(JSON.stringify(currentWorksRules || cachedDefaultRules || { "Строительные работы": {}, "Монтажные работы": {}, "Оборудование": {} }));
    modalDraftRules = activeRulesCopy;
    setWorksJsonEditorValue(JSON.stringify(activeRulesCopy, null, 2));
    validateWorksJsonInput();
  } catch (err) {
    console.warn('Editor sync warning:', err);
  }

  try {
    renderRulesModalContent(modalDraftRules);
    updateStorageStatusUi();
  } catch (err) {
    console.warn('Modal content render warning:', err);
  }

  try {
    let tabBtnId = 'tabWorksJsonBtn';
    if (activeTab === 'construction') tabBtnId = 'tabWorksConstructionBtn';
    else if (activeTab === 'installation') tabBtnId = 'tabWorksInstallationBtn';
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
      // ignore
    }
  }, 100);
}
window.openWorksRulesModal = openWorksRulesModal;

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

    const couplingCatalog = getCouplingCatalog(parsed) || {};
    const totalCouplingsCount = (couplingCatalog && typeof couplingCatalog === 'object') ? Object.keys(couplingCatalog).length : 0;

    const tabCouplingsBadge = document.getElementById('tabWorksCouplingsCountBadge');
    if (tabCouplingsBadge) tabCouplingsBadge.textContent = totalCouplingsCount;

    const eqList = getEquipmentRulesList(parsed);
    const tabEquipmentBadge = document.getElementById('tabWorksEquipmentCountBadge');
    if (tabEquipmentBadge) tabEquipmentBadge.textContent = eqList.length;

    if (badge) {
      badge.classList.add('d-none');
      badge.classList.remove('d-inline-flex');
    }
    if (errorAlert) errorAlert.classList.add('d-none');
    if (applyBtn) applyBtn.disabled = false;
    return true;
  } catch (err) {
    if (badge) {
      const badgeText = document.getElementById('worksJsonValidationText');
      badge.classList.remove('d-none');
      badge.classList.add('d-inline-flex');
      badge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle d-inline-flex align-items-center gap-1 shadow-sm';
      badge.title = `Ошибка синтаксиса: ${err.message}`;
      if (badgeText) {
        badgeText.textContent = `Ошибка синтаксиса: ${err.message}`;
      } else {
        badge.innerHTML = `<i class='bx bx-error-circle flex-shrink-0'></i><span class="text-truncate">Ошибка синтаксиса: ${escapeHtml(err.message)}</span>`;
      }
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
    const debouncedValidateTextarea = debounce(validateWorksJsonInput, 200);
    textarea.addEventListener('input', debouncedValidateTextarea);

    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
        debouncedValidateTextarea();
      }
    });
  }

  const foldAllBtn = document.getElementById('foldAllWorksJsonBtn');
  if (foldAllBtn) foldAllBtn.addEventListener('click', foldAllWorksJson);

  const unfoldAllBtn = document.getElementById('unfoldAllWorksJsonBtn');
  if (unfoldAllBtn) unfoldAllBtn.addEventListener('click', unfoldAllWorksJson);

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

  // =========================================================================
  // UNIFIED WORK ITEMS AND NESTED RESOURCES COMPONENT (WORKS & MATERIALS)
  // =========================================================================

  let addRuleEditContext = null;      // { mode: 'create'|'edit', originalSection: '', originalRuleName: '', ruleObj: null }
  let addCableEditContext = null;     // { mode: 'create'|'edit', originalGroup: '', originalMark: '', cableData: null }
  let addCouplingEditContext = null;  // { mode: 'create'|'edit', originalMark: '', couplingData: null }
  let addEquipEditContext = null;     // { mode: 'create'|'edit', originalMark: '', originalMethod: '', eqData: null }

  function resetRuleModalToAddMode() {
    addRuleEditContext = null;
    const titleEl = document.getElementById('addRuleModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-plus-circle text-primary fs-5'></i> Добавление способа прокладки и сметных норм`;
    }
    const btnSave = document.getElementById('btnSaveNewRule');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check'></i> Добавить способ в правила`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentRuleInModal');
    if (btnDel) btnDel.classList.add('d-none');
    const tplInput = document.getElementById('addRuleInstTemplate');
    if (tplInput) tplInput.value = '';
    const instTiers = document.getElementById('addRuleInstallationTiersContainer');
    if (instTiers) {
      applyInstallationPreset('standard', '');
    }
  }

  function resetCableModalToAddMode() {
    addCableEditContext = null;
    const titleEl = document.getElementById('addCableModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-plus-circle text-primary fs-5'></i> Добавление марки кабеля в справочник`;
    }
    const btnSave = document.getElementById('btnSaveNewCable');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check'></i> Добавить марку`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentCableInModal');
    if (btnDel) btnDel.classList.add('d-none');
    populateDynamicCableGroups();
  }

  function resetCouplingModalToAddMode() {
    addCouplingEditContext = null;
    const titleEl = document.getElementById('addCouplingModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-plus-circle text-primary fs-5'></i> Добавление соединительной муфты в справочник`;
    }
    const btnSave = document.getElementById('btnSaveNewCoupling');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check'></i> Добавить муфту`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentCouplingInModal');
    if (btnDel) btnDel.classList.add('d-none');
  }

  function resetEquipmentModalToAddMode() {
    addEquipEditContext = null;
    const titleEl = document.getElementById('addEquipmentModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-plus-circle text-primary fs-5'></i> Добавление оборудования и сметных норм`;
    }
    const btnSave = document.getElementById('btnSaveNewEquipment');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check'></i> Добавить оборудование`;
    }
    const btnDelMethod = document.getElementById('btnDeleteCurrentEquipMethodInModal');
    if (btnDelMethod) btnDelMethod.classList.add('d-none');
    const btnDelAll = document.getElementById('btnDeleteCurrentEquipAllInModal');
    if (btnDelAll) btnDelAll.classList.add('d-none');
  }

  function appendUnifiedNestedItemRow(tbody, name = '', type = 'материал', unit = 'шт', formula = 'КОЛИЧЕСТВО', show = true, section = '') {
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'unified-nested-item-row';
    tr.innerHTML = `
      <td>
        <input type="text" class="form-control form-control-sm unified-nested-name" placeholder="Наименование позиции" value="${escapeHtml(name)}" required>
      </td>
      <td style="width: 16%;">
        <select class="form-select form-select-sm unified-nested-type">
          <option value="материал" ${type === 'материал' ? 'selected' : ''}>материал</option>
          <option value="оборудование" ${type === 'оборудование' ? 'selected' : ''}>оборудование</option>
        </select>
      </td>
      <td style="width: 10%;">
        <input type="text" class="form-control form-control-sm unified-nested-unit" value="${escapeHtml(unit)}" placeholder="шт/м" required>
      </td>
      <td style="width: 16%;">
        <input type="text" class="form-control form-control-sm font-monospace unified-nested-formula" value="${escapeHtml(formula)}" placeholder="Формула" required>
      </td>
      <td style="width: 15%;">
        <input type="text" class="form-control form-control-sm unified-nested-section" value="${escapeHtml(section)}" placeholder="По умолч.">
      </td>
      <td style="width: 6%;" class="text-center">
        <input class="form-check-input unified-nested-show" type="checkbox" ${show ? 'checked' : ''} title="Показывать формулу">
      </td>
      <td style="width: 5%;" class="text-center">
        <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1 btn-remove-nested-row" title="Удалить позицию">
          <i class='bx bx-trash'></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  function refreshUnifiedWorkCardBadges(container) {
    if (!container) return;
    const cards = container.querySelectorAll('.unified-work-card');
    cards.forEach((card, idx) => {
      const badge = card.querySelector('.unified-work-badge');
      if (badge) badge.textContent = `Работа #${idx + 1}`;
    });
  }

  function appendUnifiedWorkCard(container, workData = null, options = {}) {
    if (!container) return;
    const work = workData || {};
    const workIndex = container.children.length + 1;
    const cardId = `unifiedWorkCard_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const title = work["Наименование"] || work.name || '';
    const unit = work["Единицы измерения"] || work.unit || (options.defaultUnit || 'м');
    const formula = work["Формула"] || work.formula || (options.defaultFormula || 'ДЛИНА');
    const rawType = (work["Тип"] || work.type || (options.defaultType || 'работа')).toLowerCase();
    const type = rawType === 'оборудование' ? 'оборудование' : (rawType === 'материал' ? 'материал' : 'работа');
    const showFormula = work["ОтображатьФормулу"] !== undefined ? Boolean(work["ОтображатьФормулу"]) : (options.defaultShowFormula !== undefined ? options.defaultShowFormula : true);
    const condition = work["Условие"] || work.condition || '';
    const section = work["Раздел"] || work.section || (options.defaultSection || '');
    const rounding = (work["Округление"] !== undefined && work["Округление"] !== null) ? work["Округление"] : '';

    const nestedResources = getWorkItemNestedResources(work);

    const card = document.createElement('div');
    card.className = 'card border shadow-xs unified-work-card mb-2';
    card.innerHTML = `
      <div class="card-header bg-light py-1_5 px-2_5 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-primary-subtle text-primary border font-monospace unified-work-badge">Работа #${workIndex}</span>
        </div>
        <div class="d-flex align-items-center gap-3">
          <div class="form-check form-check-inline small mb-0 me-0">
            <input class="form-check-input unified-work-show" type="checkbox" id="chkShow_${cardId}" ${showFormula ? 'checked' : ''}>
            <label class="form-check-label fs-xs user-select-none" for="chkShow_${cardId}">Показывать формулу</label>
          </div>
          <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2 btn-remove-unified-work-card" title="Удалить работу и её позиции">
            <i class='bx bx-trash me-1'></i>Удалить работу
          </button>
        </div>
      </div>
      <div class="card-body p-2_5">
        <div class="row g-2 mb-2">
          <div class="col-md-5">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Наименование работы <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm unified-work-title" placeholder="Наименование сметной работы" value="${escapeHtml(title)}" required>
          </div>
          <div class="col-md-2">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Тип позиции</label>
            <select class="form-select form-select-sm unified-work-type">
              <option value="работа" ${type === 'работа' ? 'selected' : ''}>работа</option>
              <option value="материал" ${type === 'материал' ? 'selected' : ''}>материал</option>
              <option value="оборудование" ${type === 'оборудование' ? 'selected' : ''}>оборудование</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Ед. изм.</label>
            <input type="text" class="form-control form-control-sm unified-work-unit" value="${escapeHtml(unit)}" placeholder="м/шт" required>
          </div>
          <div class="col-md-3">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Формула (расчет)</label>
            <input type="text" class="form-control form-control-sm font-monospace unified-work-formula" value="${escapeHtml(formula)}" placeholder="${escapeHtml(options.defaultFormula || 'ДЛИНА')}" required>
          </div>
        </div>

        <div class="row g-2 mb-2">
          <div class="col-md-5">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Раздел сметы (опционально)</label>
            <input type="text" class="form-control form-control-sm unified-work-section" placeholder="${escapeHtml(options.defaultSection || 'По умолчанию')}" value="${escapeHtml(section)}">
          </div>
          <div class="col-md-4">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Условие применения</label>
            <input type="text" class="form-control form-control-sm font-monospace unified-work-condition" placeholder="Введите условие" value="${escapeHtml(condition)}">
          </div>
          <div class="col-md-3">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Округление (зн.)</label>
            <input type="number" min="0" max="6" class="form-control form-control-sm font-monospace unified-work-rounding" placeholder="По умолч." value="${escapeHtml(String(rounding))}">
          </div>
        </div>

        <div class="p-2 rounded border bg-body-tertiary">
          <div class="d-flex align-items-center justify-content-between mb-1_5">
            <span class="fs-xs fw-semibold text-secondary d-flex align-items-center gap-1">
              <i class='bx bx-package text-success'></i> Вложенные материалы и оборудование (ключ «Материалы»):
            </span>
            <button type="button" class="btn btn-xs btn-outline-success py-0 px-1_5 btn-add-nested-row">
              <i class='bx bx-plus me-0_5'></i>Добавить позицию
            </button>
          </div>
          <div class="table-responsive bg-body rounded border">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light" style="font-size: 0.72rem;">
                <tr>
                  <th style="width: 32%;">Наименование</th>
                  <th style="width: 16%;">Тип</th>
                  <th style="width: 10%;">Ед. изм.</th>
                  <th style="width: 16%;">Формула</th>
                  <th style="width: 15%;">Раздел</th>
                  <th style="width: 6%;" class="text-center" title="Показывать формулу">ВОР</th>
                  <th style="width: 5%;" class="text-center"></th>
                </tr>
              </thead>
              <tbody class="unified-nested-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const tbody = card.querySelector('.unified-nested-tbody');
    if (nestedResources.length > 0) {
      nestedResources.forEach(res => {
        if (typeof res === 'string') {
          appendUnifiedNestedItemRow(tbody, res, 'материал', 'шт', formula, false, section);
        } else {
          const resType = (res["Тип"] || res.type || 'материал').toLowerCase() === 'оборудование' ? 'оборудование' : 'материал';
          appendUnifiedNestedItemRow(
            tbody,
            res["Наименование"] || res.name || '',
            resType,
            res["Единицы измерения"] || res.unit || (resType === 'оборудование' ? 'шт' : 'м'),
            res["Формула"] || res.formula || formula,
            res["ОтображатьФормулу"] !== undefined ? Boolean(res["ОтображатьФормулу"]) : false,
            res["Раздел"] || res.section || ''
          );
        }
      });
    }

    container.appendChild(card);
    refreshUnifiedWorkCardBadges(container);
  }

  function collectUnifiedWorksData(container) {
    if (!container) return [];
    const cards = container.querySelectorAll('.unified-work-card');
    const works = [];
    cards.forEach(card => {
      const title = card.querySelector('.unified-work-title')?.value?.trim();
      if (!title) return;
      const type = card.querySelector('.unified-work-type')?.value?.trim() || 'работа';
      const unit = card.querySelector('.unified-work-unit')?.value?.trim() || 'шт';
      const formula = card.querySelector('.unified-work-formula')?.value?.trim() || 'КОЛИЧЕСТВО';
      const section = card.querySelector('.unified-work-section')?.value?.trim() || '';
      const show = Boolean(card.querySelector('.unified-work-show')?.checked);
      const condition = card.querySelector('.unified-work-condition')?.value?.trim() || '';
      const roundingVal = card.querySelector('.unified-work-rounding')?.value?.trim();
      const rounding = roundingVal !== '' && !isNaN(Number(roundingVal)) ? Number(roundingVal) : null;

      const nestedItems = [];
      const nestedRows = card.querySelectorAll('.unified-nested-tbody tr');
      nestedRows.forEach(nr => {
        const nName = nr.querySelector('.unified-nested-name')?.value?.trim();
        if (!nName) return;
        const nType = nr.querySelector('.unified-nested-type')?.value?.trim() || 'материал';
        const nUnit = nr.querySelector('.unified-nested-unit')?.value?.trim() || 'шт';
        const nFormula = nr.querySelector('.unified-nested-formula')?.value?.trim() || formula;
        const nSection = nr.querySelector('.unified-nested-section')?.value?.trim() || section;
        const nShow = Boolean(nr.querySelector('.unified-nested-show')?.checked);

        const nItem = {
          "Наименование": nName,
          "Тип": nType,
          "Единицы измерения": nUnit,
          "Формула": nFormula,
          "ОтображатьФормулу": nShow
        };
        if (nSection) nItem["Раздел"] = nSection;
        nestedItems.push(nItem);
      });

      const workObj = {
        "Наименование": title,
        "Единицы измерения": unit,
        "Формула": formula,
        "Тип": type,
        "ОтображатьФормулу": show
      };
      if (section) workObj["Раздел"] = section;
      if (condition) workObj["Условие"] = condition;
      if (rounding !== null) workObj["Округление"] = rounding;
      if (nestedItems.length > 0) {
        workObj["Материалы"] = nestedItems;
      }

      works.push(workObj);
    });
    return works;
  }

  // -------------------------------------------------------------------------
  // ADAPTIVE CABLE WEIGHT TIERS & INSTALLATION WORKS
  // -------------------------------------------------------------------------

  let tierDomCounter = 0;

  function createInstallationTierCard(data = {}, options = {}) {
    tierDomCounter++;
    const tierId = `tier_${Date.now()}_${tierDomCounter}`;
    const card = document.createElement('div');
    card.className = 'card p-2_5 border bg-body-tertiary tier-card shadow-xs';
    card.setAttribute('data-tier-id', tierId);

    const wayName = options.ruleName || document.getElementById('addRuleWayName')?.value?.trim() || '';
    const template = options.template || document.getElementById('addRuleInstTemplate')?.value?.trim() || '';

    // Determine initial type, key and threshold
    let initialKey = String(data.key !== undefined ? data.key : (data.threshold !== undefined && data.threshold !== null ? data.threshold : '1')).trim();
    let initialType = data.type;
    let initialThreshold = data.threshold !== undefined ? data.threshold : null;

    if (!initialType) {
      const lowerKey = initialKey.toLowerCase();
      if (lowerKey.includes('оптич') || lowerKey.includes('волс') || data.isOptical) {
        initialType = 'optical';
      } else if (lowerKey.includes('свыше') || lowerKey.includes('более') || lowerKey.includes('от') || lowerKey.includes('>') || data.isOver) {
        initialType = 'over';
      } else if (!isNaN(parseFloat(initialKey.replace(',', '.'))) || lowerKey.includes('до')) {
        initialType = 'up_to';
      } else {
        initialType = 'custom';
      }
    }

    if (initialThreshold === null) {
      const cleanKey = initialKey.replace(',', '.');
      const numK = parseFloat(cleanKey);
      if (!isNaN(numK) && /^-?\d+(?:\.\d+)?$/.test(cleanKey)) {
        initialThreshold = numK;
      } else {
        const m = cleanKey.match(/(?:до|макс(?:имум)?|свыше|более|от|>)[_\s]*[:;]?[_\s]*(\d+(?:[.,]\d+)?)/i);
        if (m) initialThreshold = parseFloat(m[1].replace(',', '.'));
      }
      if (initialThreshold === null && data.maxWeight !== undefined) {
        initialThreshold = data.maxWeight;
      }
    }

    if (initialType === 'up_to' && initialThreshold === null) initialThreshold = 1;
    if (initialType === 'over' && initialThreshold === null) initialThreshold = 3;
    if (initialType === 'optical') {
      initialKey = 'оптический';
      initialThreshold = '';
    }

    const defaultTitle = initialType === 'optical'
      ? (wayName ? `Прокладка оптического кабеля (${wayName})` : 'Прокладка оптического кабеля')
      : (template && (template.includes('{масса}') || template.includes('{вес}'))
          ? template.replace(/\{масса\}|\{вес\}/gi, String(initialThreshold || '')).trim()
          : (initialType === 'over'
              ? (wayName ? `Прокладка кабеля массой 1 м свыше ${initialThreshold || 3} кг (${wayName})` : `Прокладка кабеля массой 1 м свыше ${initialThreshold || 3} кг`)
              : (wayName ? `Прокладка кабеля массой 1 м, кг, до: ${initialThreshold || 1} (${wayName})` : `Прокладка кабеля массой 1 м, кг, до: ${initialThreshold || 1}`)));

    const titleVal = data.title !== undefined ? data.title : defaultTitle;
    const unitVal = data.unit !== undefined ? data.unit : 'м';
    const formulaVal = data.formula !== undefined ? data.formula : 'ДЛИНА';
    const showFormula = data.showFormula !== undefined ? Boolean(data.showFormula) : true;

    // Materials: if explicit array is passed, use it; otherwise default to {МАРКА_КАБЕЛЯ}
    const initialMaterials = Array.isArray(data.materials)
      ? data.materials
      : (data.includeCableMaterial === false
          ? (Array.isArray(data.extraMaterials) ? data.extraMaterials : [])
          : [
              {
                "Наименование": "{МАРКА_КАБЕЛЯ}",
                "Тип": "материал",
                "Единицы измерения": "км",
                "Формула": "ДЛИНА/1000",
                "ОтображатьФормулу": true,
                "Раздел": "Монтажные работы"
              },
              ...(Array.isArray(data.extraMaterials) ? data.extraMaterials : [])
            ]);

    card.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2 pb-1_5 border-bottom">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-secondary-subtle text-secondary-emphasis border tier-index-badge">Ступень</span>
          <span class="badge bg-primary-subtle text-primary border tier-condition-badge">вес ≤ 1 кг/м</span>
          <span class="fs-xs text-muted font-monospace tier-key-preview">ключ: "${escapeHtml(initialKey)}"</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <div class="form-check form-check-inline small mb-0 me-1">
            <input class="form-check-input tier-work-show-formula" type="checkbox" ${showFormula ? 'checked' : ''} id="sh_${tierId}">
            <label class="form-check-label fs-xs user-select-none" for="sh_${tierId}">Показ формулы</label>
          </div>
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1_5 btn-move-tier-up" title="Поднять выше"><i class='bx bx-chevron-up'></i></button>
            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1_5 btn-move-tier-down" title="Опустить ниже"><i class='bx bx-chevron-down'></i></button>
          </div>
          <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1_5 btn-remove-tier" title="Удалить эту категорию"><i class='bx bx-trash'></i></button>
        </div>
      </div>

      <div class="row g-2 align-items-end mb-2">
        <div class="col-md-4">
          <label class="form-label fs-xs fw-semibold mb-0 text-muted">Тип категории</label>
          <select class="form-select form-select-sm tier-type-select">
            <option value="up_to" ${initialType === 'up_to' ? 'selected' : ''}>Масса 1 м до X кг (≤)</option>
            <option value="over" ${initialType === 'over' ? 'selected' : ''}>Масса 1 м свыше X кг (>)</option>
            <option value="optical" ${initialType === 'optical' ? 'selected' : ''}>Оптический кабель (ВОЛС)</option>
            <option value="custom" ${initialType === 'custom' ? 'selected' : ''}>Пользовательский ключ</option>
          </select>
        </div>
        <div class="col-md-3 tier-threshold-col" style="${initialType === 'optical' ? 'display: none;' : ''}">
          <label class="form-label fs-xs fw-semibold mb-0 text-muted">Порог (кг/м)</label>
          <input type="number" step="0.1" min="0" class="form-control form-control-sm tier-threshold-input font-monospace" placeholder="1" value="${initialThreshold !== null && initialThreshold !== undefined ? initialThreshold : ''}">
        </div>
        <div class="col-md-5 tier-key-col">
          <label class="form-label fs-xs fw-semibold mb-0 text-muted">JSON ключ</label>
          <input type="text" class="form-control form-control-sm tier-key-input font-monospace" placeholder="1" value="${escapeHtml(initialKey)}" required>
        </div>
      </div>

      <div class="row g-2 align-items-end mb-2">
        <div class="col-md-6">
          <label class="form-label fs-xs fw-semibold mb-0 text-muted">Наименование сметной работы <span class="text-danger">*</span></label>
          <input type="text" class="form-control form-control-sm tier-work-title" placeholder="Наименование сметной работы" value="${escapeHtml(titleVal)}" required>
        </div>
        <div class="col-md-2">
          <label class="form-label fs-xs fw-semibold mb-0 text-muted">Ед. изм.</label>
          <input type="text" class="form-control form-control-sm tier-work-unit" placeholder="м" value="${escapeHtml(unitVal)}" required>
        </div>
        <div class="col-md-4">
          <label class="form-label fs-xs fw-semibold mb-0 text-muted">Формула работы</label>
          <input type="text" class="form-control form-control-sm font-monospace tier-work-formula" placeholder="ДЛИНА" value="${escapeHtml(formulaVal)}" required>
        </div>
      </div>

      <!-- Materials and associated resources section (open & editable) -->
      <div class="p-2 rounded border bg-body mt-2">
        <div class="d-flex align-items-center justify-content-between mb-1_5">
          <div class="d-flex align-items-center gap-1_5">
            <i class='bx bx-layer text-success fs-6'></i>
            <span class="fs-xs fw-semibold text-dark">Материалы монтажной работы (ключ «Материалы»):</span>
            <span class="badge bg-secondary-subtle text-secondary-emphasis border tier-materials-count" style="font-size: 0.68rem;">${initialMaterials.length}</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-success py-0 px-2 btn-add-tier-mat d-inline-flex align-items-center gap-1" title="Добавить дополнительный материал или сопутствующий ресурс">
            <i class='bx bx-plus'></i> Добавить материал
          </button>
        </div>
        <div class="table-responsive border rounded bg-body">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light" style="font-size: 0.72rem;">
              <tr>
                <th style="width: 32%;">Наименование ресурса</th>
                <th style="width: 16%;">Тип</th>
                <th style="width: 10%;">Ед. изм.</th>
                <th style="width: 16%;">Формула</th>
                <th style="width: 15%;">Раздел</th>
                <th style="width: 6%;" class="text-center" title="Показывать формулу">ВОР</th>
                <th style="width: 5%;" class="text-center"></th>
              </tr>
            </thead>
            <tbody class="tier-materials-tbody unified-nested-tbody">
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Populate materials directly into editable table rows
    const matsTbody = card.querySelector('.tier-materials-tbody');
    if (matsTbody && initialMaterials.length > 0) {
      initialMaterials.forEach(m => {
        if (!m) return;
        if (typeof m === 'string') {
          appendUnifiedNestedItemRow(matsTbody, m, 'материал', 'м', 'ДЛИНА', true, 'Монтажные работы');
        } else {
          const mType = (m["Тип"] || m.type || 'материал').toLowerCase() === 'оборудование' ? 'оборудование' : 'материал';
          appendUnifiedNestedItemRow(
            matsTbody,
            m["Наименование"] || m.name || '',
            mType,
            m["Единицы измерения"] || m.unit || (mType === 'оборудование' ? 'шт' : 'км'),
            m["Формула"] || m.formula || 'ДЛИНА/1000',
            m["ОтображатьФормулу"] !== undefined ? Boolean(m["ОтображатьФормулу"]) : true,
            m["Раздел"] || m.section || ''
          );
        }
      });
    }

    // Attach handler for adding material row on this card
    const addTierMatBtn = card.querySelector('.btn-add-tier-mat');
    if (addTierMatBtn && matsTbody) {
      addTierMatBtn.addEventListener('click', () => {
        appendUnifiedNestedItemRow(matsTbody, '', 'материал', 'м', 'ДЛИНА', true, '');
        const cnt = card.querySelector('.tier-materials-count');
        if (cnt) cnt.textContent = matsTbody.children.length;
      });
    }

    // Attach internal sync handlers
    const typeSelect = card.querySelector('.tier-type-select');
    const thresholdCol = card.querySelector('.tier-threshold-col');
    const thresholdInput = card.querySelector('.tier-threshold-input');
    const keyInput = card.querySelector('.tier-key-input');
    const condBadge = card.querySelector('.tier-condition-badge');
    const keyPreview = card.querySelector('.tier-key-preview');
    const titleInput = card.querySelector('.tier-work-title');

    const updateCardConditionAndKey = (isUserManualKey = false) => {
      const type = typeSelect.value;
      const tVal = thresholdInput.value.trim().replace(',', '.');
      const numT = parseFloat(tVal);

      if (type === 'optical') {
        thresholdCol.style.display = 'none';
        condBadge.className = 'badge bg-info-subtle text-info border tier-condition-badge';
        condBadge.innerHTML = 'ВОЛС (оптика)';
        if (!isUserManualKey) keyInput.value = 'оптический';
      } else if (type === 'over') {
        thresholdCol.style.display = '';
        condBadge.className = 'badge bg-warning-subtle text-warning-emphasis border tier-condition-badge';
        condBadge.innerHTML = !isNaN(numT) ? `вес &gt; ${numT} кг/м` : 'вес &gt; X кг/м';
        if (!isUserManualKey) keyInput.value = !isNaN(numT) ? `свыше ${numT}` : 'свыше 3';
      } else if (type === 'up_to') {
        thresholdCol.style.display = '';
        condBadge.className = 'badge bg-primary-subtle text-primary border tier-condition-badge';
        condBadge.innerHTML = !isNaN(numT) ? `вес &le; ${numT} кг/м` : 'вес &le; X кг/м';
        if (!isUserManualKey) keyInput.value = !isNaN(numT) ? String(numT) : '1';
      } else {
        thresholdCol.style.display = '';
        condBadge.className = 'badge bg-secondary-subtle text-secondary-emphasis border tier-condition-badge';
        condBadge.innerHTML = 'Кастомный ключ';
      }

      keyPreview.textContent = `ключ: "${keyInput.value.trim()}"`;
    };

    typeSelect.addEventListener('change', () => {
      updateCardConditionAndKey(false);
      const currTitle = titleInput.value.trim();
      const currentWay = document.getElementById('addRuleWayName')?.value?.trim() || '';
      const currentTpl = document.getElementById('addRuleInstTemplate')?.value?.trim() || '';
      const type = typeSelect.value;
      const tVal = thresholdInput.value.trim().replace(',', '.');

      if (!currTitle || currTitle.startsWith('Прокладка кабеля') || currTitle.startsWith('Прокладка оптического')) {
        if (type === 'optical') {
          titleInput.value = currentWay ? `Прокладка оптического кабеля (${currentWay})` : 'Прокладка оптического кабеля';
        } else if (currentTpl && (currentTpl.includes('{масса}') || currentTpl.includes('{вес}'))) {
          titleInput.value = currentTpl.replace(/\{масса\}|\{вес\}/gi, tVal || '1').trim();
        } else if (type === 'over') {
          titleInput.value = currentWay ? `Прокладка кабеля массой 1 м свыше ${tVal || 3} кг (${currentWay})` : `Прокладка кабеля массой 1 м свыше ${tVal || 3} кг`;
        } else {
          titleInput.value = currentWay ? `Прокладка кабеля массой 1 м, кг, до: ${tVal || 1} (${currentWay})` : `Прокладка кабеля массой 1 м, кг, до: ${tVal || 1}`;
        }
      }
    });

    thresholdInput.addEventListener('input', () => {
      updateCardConditionAndKey(false);
    });

    keyInput.addEventListener('input', () => {
      keyPreview.textContent = `ключ: "${keyInput.value.trim()}"`;
    });

    updateCardConditionAndKey(data.key !== undefined);
    return card;
  }

  function refreshInstallationTiersBadges(container) {
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.tier-card'));
    const total = cards.length;
    const badge = document.getElementById('addRuleTiersCountBadge');
    if (badge) {
      badge.textContent = `${total} ${total === 1 ? 'категория' : (total >= 2 && total <= 4 ? 'категории' : 'категорий')}`;
    }

    cards.forEach((c, idx) => {
      const idxBadge = c.querySelector('.tier-index-badge');
      if (idxBadge) idxBadge.textContent = `Ступень ${idx + 1}`;
      const btnUp = c.querySelector('.btn-move-tier-up');
      const btnDown = c.querySelector('.btn-move-tier-down');
      if (btnUp) btnUp.disabled = (idx === 0);
      if (btnDown) btnDown.disabled = (idx === total - 1);
    });
  }

  // Standard filling with exact 5 parameters: 1, 2, 3, свыше 3, ВОЛС
  function applyDefaultStandardTiers(wayName = '') {
    const container = document.getElementById('addRuleInstallationTiersContainer');
    if (!container) return;
    container.innerHTML = '';
    const template = document.getElementById('addRuleInstTemplate')?.value?.trim() || '';
    const effectiveWay = wayName || document.getElementById('addRuleWayName')?.value?.trim() || '';

    const defaultCableMat = [
      {
        "Наименование": "{МАРКА_КАБЕЛЯ}",
        "Тип": "материал",
        "Единицы измерения": "км",
        "Формула": "ДЛИНА/1000",
        "ОтображатьФормулу": true,
        "Раздел": "Монтажные работы"
      }
    ];

    const createItem = (type, threshold, key, title) => {
      const card = createInstallationTierCard({
        type: type,
        threshold: threshold,
        key: key,
        title: title,
        unit: 'м',
        formula: 'ДЛИНА',
        showFormula: true,
        materials: JSON.parse(JSON.stringify(defaultCableMat))
      }, { ruleName: effectiveWay, template: template });
      container.appendChild(card);
    };

    // 1. Ступень: до 1 кг
    createItem('up_to', 1, '1', effectiveWay ? `Прокладка кабеля массой 1 м, кг, до: 1 (${effectiveWay})` : 'Прокладка кабеля массой 1 м, кг, до: 1');

    // 2. Ступень: до 2 кг
    createItem('up_to', 2, '2', effectiveWay ? `Прокладка кабеля массой 1 м, кг, до: 2 (${effectiveWay})` : 'Прокладка кабеля массой 1 м, кг, до: 2');

    // 3. Ступень: до 3 кг
    createItem('up_to', 3, '3', effectiveWay ? `Прокладка кабеля массой 1 м, кг, до: 3 (${effectiveWay})` : 'Прокладка кабеля массой 1 м, кг, до: 3');

    // 4. Ступень: свыше 3 кг
    createItem('over', 3, 'свыше 3', effectiveWay ? `Прокладка кабеля массой 1 м свыше 3 кг (${effectiveWay})` : 'Прокладка кабеля массой 1 м свыше 3 кг');

    // 5. Ступень: ВОЛС
    createItem('optical', null, 'оптический', effectiveWay ? `Прокладка оптического кабеля (${effectiveWay})` : 'Прокладка оптического кабеля');

    refreshInstallationTiersBadges(container);
  }

  function applyInstallationPreset(presetType, wayName = '') {
    applyDefaultStandardTiers(wayName);
  }

  function collectInstallationTiersData() {
    const container = document.getElementById('addRuleInstallationTiersContainer');
    if (!container) return null;
    const cards = container.querySelectorAll('.tier-card');
    if (cards.length === 0) {
      showToast('Добавьте хотя бы одну весовую категорию прокладки кабеля', 'warning', 'Проверка данных');
      return null;
    }

    const tiersDict = {};
    const usedKeys = new Set();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const key = card.querySelector('.tier-key-input')?.value?.trim();
      const title = card.querySelector('.tier-work-title')?.value?.trim();
      const unit = card.querySelector('.tier-work-unit')?.value?.trim() || 'м';
      const formula = card.querySelector('.tier-work-formula')?.value?.trim() || 'ДЛИНА';
      const showFormula = Boolean(card.querySelector('.tier-work-show-formula')?.checked);
      const type = card.querySelector('.tier-type-select')?.value || 'up_to';
      const rawThreshold = card.querySelector('.tier-threshold-input')?.value?.trim();

      if (!key) {
        showToast(`Укажите JSON-ключ для ступени ${i + 1}`, 'warning', 'Проверка данных');
        card.querySelector('.tier-key-input')?.focus();
        return null;
      }
      if (usedKeys.has(key)) {
        showToast(`Повторяющийся JSON-ключ «${key}». Ключи ступеней должны быть уникальными`, 'warning', 'Проверка данных');
        card.querySelector('.tier-key-input')?.focus();
        return null;
      }
      usedKeys.add(key);

      if (!title) {
        showToast(`Укажите наименование сметной работы для ступени «${key}»`, 'warning', 'Проверка данных');
        card.querySelector('.tier-work-title')?.focus();
        return null;
      }

      let parsedThreshold = null;
      if (rawThreshold !== undefined && rawThreshold !== '') {
        const num = parseFloat(rawThreshold.replace(',', '.'));
        if (!isNaN(num)) parsedThreshold = num;
      }

      const workItem = {
        "Наименование": title,
        "Единицы измерения": unit,
        "Формула": formula,
        "Тип": "работа",
        "ОтображатьФормулу": showFormula
      };

      if (type === 'optical') {
        workItem["Категория"] = "Оптический кабель";
      } else if (parsedThreshold !== null) {
        workItem["МаксВес"] = parsedThreshold;
      }

      // Collect all materials directly from this tier's editable materials table
      const materials = [];
      const matRows = card.querySelectorAll('.tier-materials-tbody tr');
      matRows.forEach(nr => {
        const nName = nr.querySelector('.unified-nested-name')?.value?.trim();
        if (!nName) return;
        const nType = nr.querySelector('.unified-nested-type')?.value?.trim() || 'материал';
        const nUnit = nr.querySelector('.unified-nested-unit')?.value?.trim() || 'км';
        const nFormula = nr.querySelector('.unified-nested-formula')?.value?.trim() || 'ДЛИНА/1000';
        const nSection = nr.querySelector('.unified-nested-section')?.value?.trim() || '';
        const nShow = Boolean(nr.querySelector('.unified-nested-show')?.checked);

        const matItem = {
          "Наименование": nName,
          "Тип": nType,
          "Единицы измерения": nUnit,
          "Формула": nFormula,
          "ОтображатьФормулу": nShow
        };
        if (nSection) matItem["Раздел"] = nSection;
        materials.push(matItem);
      });

      workItem["Материалы"] = materials;
      tiersDict[key] = [workItem];
    }

    return tiersDict;
  }

  // -------------------------------------------------------------------------
  // EDIT RULE MODAL (СПРАВОЧНИКИ И ПРАВИЛА ПРОКЛАДКИ)
  // -------------------------------------------------------------------------

  function openEditRuleModal(sectionName, ruleName) {
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const secDict = currentObj[sectionName];
    if (!secDict || typeof secDict !== 'object') {
      showToast(`Раздел «${sectionName}» не найден`, 'warning', 'Ошибка');
      return;
    }
    const ruleObj = secDict[ruleName];
    if (!ruleObj) {
      showToast(`Правило «${ruleName}» не найдено в разделе «${sectionName}»`, 'warning', 'Ошибка');
      return;
    }

    addRuleEditContext = {
      mode: 'edit',
      originalSection: sectionName,
      originalRuleName: ruleName,
      ruleObj: JSON.parse(JSON.stringify(ruleObj))
    };

    const titleEl = document.getElementById('addRuleModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-edit text-primary fs-5'></i> Редактирование способа: «${escapeHtml(ruleName)}»`;
    }
    const btnSave = document.getElementById('btnSaveNewRule');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check-double'></i> Сохранить изменения`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentRuleInModal');
    if (btnDel) {
      btnDel.classList.remove('d-none');
    }

    const wayInput = document.getElementById('addRuleWayName');
    if (wayInput) wayInput.value = ruleName;

    const isInstallation = sectionName === 'Монтажные работы' || (ruleObj["Шаблон"] && ruleObj["Работы"] && typeof ruleObj["Работы"] === 'object' && !Array.isArray(ruleObj["Работы"]));
    const radioInstallation = document.getElementById('addRuleSecInstallation');
    const radioConstruction = document.getElementById('addRuleSecConstruction');

    if (isInstallation && radioInstallation) {
      radioInstallation.checked = true;
    } else if (radioConstruction) {
      radioConstruction.checked = true;
    }
    updateAddRuleSectionsVisibility();

    if (isInstallation) {
      const templateInput = document.getElementById('addRuleInstTemplate');
      if (templateInput) templateInput.value = ruleObj["Шаблон"] || '';

      const instContainer = document.getElementById('addRuleInstallationTiersContainer');
      if (instContainer) {
        instContainer.innerHTML = '';
        const rawWorks = ruleObj["Работы"] || ruleObj["Работы и материалы"] || {};

        if (rawWorks && typeof rawWorks === 'object' && !Array.isArray(rawWorks)) {
          const keys = Object.keys(rawWorks);
          if (keys.length > 0) {
            keys.forEach(key => {
              const val = rawWorks[key];
              const items = Array.isArray(val) ? val : (val ? [val] : []);
              const firstItem = items[0] || {};
              const lowerKey = String(key).toLowerCase();

              let type = 'up_to';
              let threshold = null;

              if (lowerKey.includes('оптич') || lowerKey.includes('волс') || (firstItem["Категория"] || '').toLowerCase().includes('оптич')) {
                type = 'optical';
              } else if (lowerKey.includes('свыше') || lowerKey.includes('более') || lowerKey.includes('от') || lowerKey.includes('>')) {
                type = 'over';
              } else if (!isNaN(parseFloat(String(key).replace(',', '.'))) || lowerKey.includes('до')) {
                type = 'up_to';
              } else {
                type = 'custom';
              }

              const cleanKey = String(key).trim().replace(',', '.');
              const numK = parseFloat(cleanKey);
              if (!isNaN(numK) && /^-?\d+(?:\.\d+)?$/.test(cleanKey)) {
                threshold = numK;
              } else {
                const m = cleanKey.match(/(?:до|макс(?:имум)?|свыше|более|от|>)[_\s]*[:;]?[_\s]*(\d+(?:[.,]\d+)?)/i);
                if (m) threshold = parseFloat(m[1].replace(',', '.'));
              }
              if (threshold === null && firstItem["МаксВес"] !== undefined) {
                threshold = parseFloat(String(firstItem["МаксВес"]).replace(',', '.'));
              }

              const allMats = Array.isArray(firstItem["Материалы"]) ? firstItem["Материалы"] : [];

              const card = createInstallationTierCard({
                key: key,
                type: type,
                threshold: threshold,
                title: firstItem["Наименование"] || firstItem.name || '',
                unit: firstItem["Единицы измерения"] || firstItem.unit || 'м',
                formula: firstItem["Формула"] || firstItem.formula || 'ДЛИНА',
                showFormula: firstItem["ОтображатьФормулу"] !== undefined ? Boolean(firstItem["ОтображатьФормулу"]) : true,
                materials: allMats
              }, { ruleName: ruleName, template: ruleObj["Шаблон"] || '' });

              instContainer.appendChild(card);
            });
            refreshInstallationTiersBadges(instContainer);
          } else {
            applyInstallationPreset('standard', ruleName);
          }
        } else {
          applyInstallationPreset('standard', ruleName);
        }
      }
    } else {
      const container = document.getElementById('addRuleWorksCardsContainer');
      if (container) {
        container.innerHTML = '';
        const works = getRuleWorks(ruleObj);
        if (Array.isArray(works) && works.length > 0) {
          works.forEach(w => appendUnifiedWorkCard(container, w, { defaultSection: sectionName, defaultFormula: 'ДЛИНА', defaultUnit: 'м' }));
        } else {
          appendUnifiedWorkCard(container, null, { defaultSection: sectionName, defaultFormula: 'ДЛИНА', defaultUnit: 'м' });
        }
      }
    }

    const modalEl = document.getElementById('addRuleModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  // Legacy compatibility aliases
  function appendAddRuleWorkMaterialRow(tbody, name = '', unit = 'м', formula = 'ДЛИНА', show = false, section = '') {
    appendUnifiedNestedItemRow(tbody, name, 'материал', unit, formula, show, section);
  }
  function refreshAddRuleWorkCardBadges() {
    refreshUnifiedWorkCardBadges(document.getElementById('addRuleWorksCardsContainer'));
  }
  function appendAddRuleWorkCard(title = '', unit = 'м', formula = 'ДЛИНА', showFormula = true, materials = [], condition = '', section = '') {
    const workData = {
      "Наименование": title,
      "Единицы измерения": unit,
      "Формула": formula,
      "Тип": "работа",
      "ОтображатьФормулу": showFormula,
      "Условие": condition,
      "Раздел": section,
      "Материалы": materials
    };
    appendUnifiedWorkCard(document.getElementById('addRuleWorksCardsContainer'), workData, { defaultFormula: 'ДЛИНА', defaultUnit: 'м' });
  }

  const btnAddRuleWorkRow = document.getElementById('btnAddRuleWorkRow');
  if (btnAddRuleWorkRow) {
    btnAddRuleWorkRow.addEventListener('click', () => {
      appendUnifiedWorkCard(document.getElementById('addRuleWorksCardsContainer'), null, { defaultFormula: 'ДЛИНА', defaultUnit: 'м' });
    });
  }

  const addRuleWorksCardsContainer = document.getElementById('addRuleWorksCardsContainer');
  if (addRuleWorksCardsContainer) {
    addRuleWorksCardsContainer.addEventListener('click', (e) => {
      const addNestedBtn = e.target.closest('.btn-add-nested-row, .btn-add-work-material');
      if (addNestedBtn) {
        const card = addNestedBtn.closest('.unified-work-card, .rule-work-card');
        const tbody = card ? (card.querySelector('.unified-nested-tbody') || card.querySelector('.rule-work-materials-tbody')) : null;
        if (tbody) {
          appendUnifiedNestedItemRow(tbody, '', 'материал', 'шт', 'ДЛИНА', false, '');
        }
        return;
      }

      const removeRowBtn = e.target.closest('.btn-remove-nested-row, .btn-remove-mat-row');
      if (removeRowBtn) {
        const tr = removeRowBtn.closest('tr');
        if (tr) tr.remove();
        return;
      }

      const removeCardBtn = e.target.closest('.btn-remove-unified-work-card, .btn-remove-work-card');
      if (removeCardBtn) {
        const card = removeCardBtn.closest('.unified-work-card, .rule-work-card');
        if (card) {
          card.remove();
          refreshUnifiedWorkCardBadges(addRuleWorksCardsContainer);
          if (addRuleWorksCardsContainer.children.length === 0) {
            appendUnifiedWorkCard(addRuleWorksCardsContainer, null, { defaultFormula: 'ДЛИНА', defaultUnit: 'м' });
          }
        }
        return;
      }
    });
  }

  const radioConstruction = document.getElementById('addRuleSecConstruction');
  const radioInstallation = document.getElementById('addRuleSecInstallation');
  const constrContainer = document.getElementById('addRuleConstructionContainer');
  const instContainer = document.getElementById('addRuleInstallationContainer');

  const updateAddRuleSectionsVisibility = () => {
    if (radioInstallation && radioInstallation.checked) {
      if (constrContainer) constrContainer.classList.add('d-none');
      if (instContainer) instContainer.classList.remove('d-none');
      const instTiers = document.getElementById('addRuleInstallationTiersContainer');
      if (instTiers && instTiers.children.length === 0) {
        applyInstallationPreset('standard');
      }
    } else {
      if (constrContainer) constrContainer.classList.remove('d-none');
      if (instContainer) instContainer.classList.add('d-none');
    }
  };

  if (radioConstruction) radioConstruction.addEventListener('change', updateAddRuleSectionsVisibility);
  if (radioInstallation) radioInstallation.addEventListener('change', updateAddRuleSectionsVisibility);

  // Dynamic installation tiers toolbar and container event listeners
  const instTiersContainer = document.getElementById('addRuleInstallationTiersContainer');
  if (instTiersContainer) {
    instTiersContainer.addEventListener('click', (e) => {
      // Reorder up
      const moveUpBtn = e.target.closest('.btn-move-tier-up');
      if (moveUpBtn) {
        const card = moveUpBtn.closest('.tier-card');
        if (card && card.previousElementSibling) {
          card.parentNode.insertBefore(card, card.previousElementSibling);
          refreshInstallationTiersBadges(instTiersContainer);
        }
        return;
      }

      // Reorder down
      const moveDownBtn = e.target.closest('.btn-move-tier-down');
      if (moveDownBtn) {
        const card = moveDownBtn.closest('.tier-card');
        if (card && card.nextElementSibling) {
          card.parentNode.insertBefore(card.nextElementSibling, card);
          refreshInstallationTiersBadges(instTiersContainer);
        }
        return;
      }

      // Remove tier
      const removeBtn = e.target.closest('.btn-remove-tier');
      if (removeBtn) {
        const card = removeBtn.closest('.tier-card');
        if (card) {
          if (instTiersContainer.querySelectorAll('.tier-card').length <= 1) {
            showToast('В способе прокладки должна оставаться хотя бы одна категория', 'warning', 'Предупреждение');
            return;
          }
          card.remove();
          refreshInstallationTiersBadges(instTiersContainer);
        }
        return;
      }

      // Remove material row in tier
      const removeMatBtn = e.target.closest('.btn-remove-nested-row, .btn-remove-nested-item, .btn-remove-mat-row');
      if (removeMatBtn) {
        const tr = removeMatBtn.closest('tr');
        const card = removeMatBtn.closest('.tier-card');
        if (tr) tr.remove();
        if (card) {
          const tbody = card.querySelector('.tier-materials-tbody') || card.querySelector('.tier-extra-mats-tbody');
          const countSpan = card.querySelector('.tier-materials-count') || card.querySelector('.tier-extra-mats-count');
          if (tbody && countSpan) countSpan.textContent = tbody.children.length;
        }
        return;
      }
    });
  }

  // Add cable tier button
  const btnAddCableTier = document.getElementById('btnAddRuleCableTierBtn');
  if (btnAddCableTier && instTiersContainer) {
    btnAddCableTier.addEventListener('click', () => {
      const wayName = document.getElementById('addRuleWayName')?.value?.trim() || '';
      const template = document.getElementById('addRuleInstTemplate')?.value?.trim() || '';

      const existingThresholds = Array.from(instTiersContainer.querySelectorAll('.tier-threshold-input'))
        .map(inp => parseFloat(inp.value.replace(',', '.')))
        .filter(n => !isNaN(n));

      let nextThreshold = 1;
      if (existingThresholds.length > 0) {
        const maxVal = Math.max(...existingThresholds);
        if (maxVal < 3) nextThreshold = maxVal + 1;
        else if (maxVal === 3) nextThreshold = 6;
        else nextThreshold = maxVal + 2;
      }

      const card = createInstallationTierCard({
        type: 'up_to',
        threshold: nextThreshold,
        key: String(nextThreshold),
        unit: 'м',
        formula: 'ДЛИНА',
        showFormula: true
      }, { ruleName: wayName, template: template });

      instTiersContainer.appendChild(card);
      refreshInstallationTiersBadges(instTiersContainer);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.querySelector('.tier-work-title')?.focus();
    });
  }

  // Add optical tier button
  const btnAddOpticalTier = document.getElementById('btnAddRuleOpticalTierBtn');
  if (btnAddOpticalTier && instTiersContainer) {
    btnAddOpticalTier.addEventListener('click', () => {
      const wayName = document.getElementById('addRuleWayName')?.value?.trim() || '';
      const hasOptical = Array.from(instTiersContainer.querySelectorAll('.tier-type-select'))
        .some(sel => sel.value === 'optical');
      if (hasOptical) {
        showToast('Категория для оптического кабеля (ВОЛС) уже присутствует в списке', 'info', 'ВОЛС');
        return;
      }

      const card = createInstallationTierCard({
        type: 'optical',
        key: 'оптический',
        unit: 'м',
        formula: 'ДЛИНА',
        showFormula: true
      }, { ruleName: wayName });

      instTiersContainer.appendChild(card);
      refreshInstallationTiersBadges(instTiersContainer);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  // Standard filling button with parameters: 1, 2, 3, свыше 3, ВОЛС
  const btnApplyStdTiers = document.getElementById('btnApplyDefaultStandardTiers');
  if (btnApplyStdTiers) {
    btnApplyStdTiers.addEventListener('click', () => {
      applyDefaultStandardTiers();
      showToast('Заполнен стандартный набор категорий (1, 2, 3, свыше 3, ВОЛС)', 'success', 'Стандартное заполнение');
    });
  }

  // Apply template button
  const btnApplyTpl = document.getElementById('btnApplyRuleTemplateToTiers');
  if (btnApplyTpl && instTiersContainer) {
    btnApplyTpl.addEventListener('click', () => {
      const tpl = document.getElementById('addRuleInstTemplate')?.value?.trim();
      if (!tpl) {
        showToast('Укажите шаблон с маркером {масса} в поле выше', 'warning', 'Шаблон');
        document.getElementById('addRuleInstTemplate')?.focus();
        return;
      }

      const cards = instTiersContainer.querySelectorAll('.tier-card');
      let updatedCount = 0;
      cards.forEach(card => {
        const type = card.querySelector('.tier-type-select')?.value;
        const thVal = card.querySelector('.tier-threshold-input')?.value?.trim() || '';
        const titleInput = card.querySelector('.tier-work-title');
        if (!titleInput) return;

        if (type === 'up_to') {
          titleInput.value = tpl.replace(/\{масса\}|\{вес\}/gi, thVal || '1').trim();
          updatedCount++;
        } else if (type === 'over') {
          titleInput.value = tpl.replace(/\{масса\}|\{вес\}/gi, `свыше ${thVal || '3'}`).trim();
          updatedCount++;
        } else if (type === 'custom') {
          titleInput.value = tpl.replace(/\{масса\}|\{вес\}/gi, thVal || '').trim();
          updatedCount++;
        }
      });

      showToast(`Шаблон применен к ${updatedCount} ступеням`, 'success', 'Шаблон применен');
    });
  }

  function openAddRuleModalForSection(sectionName = 'Строительные работы') {
    resetRuleModalToAddMode();
    const form = document.getElementById('formAddRule');
    if (form) form.reset();
    const isInst = sectionName === 'Монтажные работы';
    if (isInst && radioInstallation) {
      radioInstallation.checked = true;
    } else if (radioConstruction) {
      radioConstruction.checked = true;
    }
    updateAddRuleSectionsVisibility();
    if (!isInst && addRuleWorksCardsContainer) {
      addRuleWorksCardsContainer.innerHTML = '';
      appendUnifiedWorkCard(addRuleWorksCardsContainer, {
        "Наименование": "Разработка грунта в траншее вручную",
        "Единицы измерения": "м3 грунта",
        "Формула": "0.4 * ДЛИНА",
        "Тип": "работа",
        "ОтображатьФормулу": true,
        "Материалы": [
          { "Наименование": "Песок для постели", "Тип": "материал", "Единицы измерения": "м3", "Формула": "0.1 * ДЛИНА", "ОтображатьФормулу": false }
        ]
      });
      appendUnifiedWorkCard(addRuleWorksCardsContainer, {
        "Наименование": "Засыпка траншей вручную",
        "Единицы измерения": "м3 грунта",
        "Формула": "0.4 * ДЛИНА",
        "Тип": "работа",
        "ОтображатьФормулу": true
      });
    }
    const modalEl = document.getElementById('addRuleModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  const quickAddRuleInTabBtn = document.getElementById('quickAddRuleInTabBtn');
  if (quickAddRuleInTabBtn) {
    quickAddRuleInTabBtn.addEventListener('click', () => openAddRuleModalForSection('Строительные работы'));
  }

  const quickAddConstructionRuleBtn = document.getElementById('quickAddConstructionRuleBtn');
  if (quickAddConstructionRuleBtn) {
    quickAddConstructionRuleBtn.addEventListener('click', () => openAddRuleModalForSection('Строительные работы'));
  }

  const quickAddInstallationRuleBtn = document.getElementById('quickAddInstallationRuleBtn');
  if (quickAddInstallationRuleBtn) {
    quickAddInstallationRuleBtn.addEventListener('click', () => openAddRuleModalForSection('Монтажные работы'));
  }

  const btnSaveNewRule = document.getElementById('btnSaveNewRule');
  if (btnSaveNewRule) {
    btnSaveNewRule.addEventListener('click', () => {
      const wayNameInput = document.getElementById('addRuleWayName');
      const wayName = wayNameInput ? wayNameInput.value.trim() : '';
      if (!wayName) {
        showToast('Укажите наименование способа прокладки', 'warning', 'Проверка данных');
        if (wayNameInput) wayNameInput.focus();
        return;
      }

      const isInstallation = radioInstallation && radioInstallation.checked;
      const targetSectionKey = isInstallation ? "Монтажные работы" : "Строительные работы";

      const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
      if (!currentObj[targetSectionKey] || typeof currentObj[targetSectionKey] !== 'object' || Array.isArray(currentObj[targetSectionKey])) {
        currentObj[targetSectionKey] = {};
      }

      // If in edit mode, remove old rule if renamed or section changed
      if (addRuleEditContext && addRuleEditContext.mode === 'edit') {
        const oldSec = addRuleEditContext.originalSection;
        const oldName = addRuleEditContext.originalRuleName;
        if (oldSec && oldName && (oldSec !== targetSectionKey || oldName !== wayName)) {
          if (currentObj[oldSec] && currentObj[oldSec][oldName]) {
            delete currentObj[oldSec][oldName];
          }
        }
      }

      if (isInstallation) {
        const templateInput = document.getElementById('addRuleInstTemplate');
        const templateVal = templateInput ? templateInput.value.trim() : '';

        const tiersDict = collectInstallationTiersData();
        if (!tiersDict) return; // Validation message already shown

        const rulePayload = {
          "Работы": tiersDict
        };
        if (templateVal) {
          rulePayload["Шаблон"] = templateVal;
        }

        currentObj[targetSectionKey][wayName] = rulePayload;
      } else {
        const works = collectUnifiedWorksData(document.getElementById('addRuleWorksCardsContainer'));
        if (works.length === 0) {
          showToast('Добавьте хотя бы одну работу в состав способа', 'warning', 'Проверка данных');
          return;
        }

        currentObj[targetSectionKey][wayName] = {
          "Работы": works
        };
      }

      modalDraftRules = currentObj;
      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();
      renderRulesModalContent(modalDraftRules);

      const modalEl = document.getElementById('addRuleModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      const isEdit = addRuleEditContext && addRuleEditContext.mode === 'edit';
      resetRuleModalToAddMode();

      showToast(
        isEdit ? `Способ «${wayName}» успешно обновлен в разделе «${targetSectionKey}».` : `Способ «${wayName}» успешно добавлен в раздел «${targetSectionKey}».`,
        'success',
        isEdit ? 'Правило обновлено' : 'Правило добавлено',
        5000
      );
    });
  }

  function bindModalSearchInput(inputId, clearBtnId) {
    const input = document.getElementById(inputId);
    const clearBtn = document.getElementById(clearBtnId);
    if (!input) return;

    const debouncedRender = debounce(() => renderRulesModalContent(null, false), 180);
    input.addEventListener('input', debouncedRender);

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        debouncedRender.cancel();
        input.value = '';
        renderRulesModalContent(null, false);
        input.focus();
      });
    }
  }

  bindModalSearchInput('rulesConstructionSearchInput', 'rulesConstructionClearSearchBtn');
  bindModalSearchInput('rulesInstallationSearchInput', 'rulesInstallationClearSearchBtn');
  bindModalSearchInput('rulesCardsSearchInput', 'rulesCardsClearSearchBtn');

  // =========================================================================
  // ADD / EDIT CABLE MODAL
  // =========================================================================

  function openEditCableModal(groupName, markKey) {
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const catalog = currentObj["Справочник кабелей"] || {};
    let targetGroup = groupName;
    let targetData = catalog[groupName]?.["Тип"]?.[markKey];

    if (!targetData) {
      for (const [gKey, gVal] of Object.entries(catalog)) {
        if (gVal?.["Тип"]?.[markKey]) {
          targetGroup = gKey;
          targetData = gVal["Тип"][markKey];
          break;
        }
      }
    }

    if (!targetData) {
      showToast(`Марка кабеля «${markKey}» не найдена в справочнике`, 'warning', 'Ошибка');
      return;
    }

    addCableEditContext = {
      mode: 'edit',
      originalGroup: targetGroup,
      originalMark: markKey,
      cableData: JSON.parse(JSON.stringify(targetData))
    };

    const titleEl = document.getElementById('addCableModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-edit text-primary fs-5'></i> Редактирование марки кабеля: «${escapeHtml(markKey)}»`;
    }
    const btnSave = document.getElementById('btnSaveNewCable');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check-double'></i> Сохранить изменения`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentCableInModal');
    if (btnDel) {
      btnDel.classList.remove('d-none');
    }

    // Populate dynamic groups and datalists from active rules
    populateDynamicCableGroups(currentObj);

    const cpList = document.getElementById('datalistCouplingsList');
    if (cpList) {
      const cpCatalog = currentObj["Справочник муфт"] || (cachedDefaultRules && cachedDefaultRules["Справочник муфт"]) || {};
      cpList.innerHTML = Object.keys(cpCatalog).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(cpCatalog[k]["Полное наименование"] || '')}</option>`).join('');
    }

    const groupKeyInput = document.getElementById('addCableGroupKey');
    const groupNameInput = document.getElementById('addCableGroupName');
    const markInput = document.getElementById('addCableMark');
    const weightInput = document.getElementById('addCableWeight');
    const lenInput = document.getElementById('addCableBuildingLength');
    const couplingInput = document.getElementById('addCableCoupling');
    const descInput = document.getElementById('addCableDescription');

    if (groupKeyInput) groupKeyInput.value = targetGroup;
    if (groupNameInput) groupNameInput.value = catalog[targetGroup]?.["Название"] || targetGroup;
    if (markInput) markInput.value = markKey;
    if (weightInput) weightInput.value = targetData["Вес"] !== undefined ? targetData["Вес"] : '';
    if (lenInput) lenInput.value = targetData["Строительная длина"] !== undefined ? targetData["Строительная длина"] : 1000;
    if (couplingInput) couplingInput.value = targetData["Муфта"] || '';
    if (descInput) descInput.value = targetData["Полное описание"] || '';

    const modalEl = document.getElementById('addCableModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  // Delegated click handler for dynamic dropdown menu items
  const cableDropdownList = document.getElementById('dropdownCableGroupList');
  if (cableDropdownList && !cableDropdownList.dataset.bound) {
    cableDropdownList.dataset.bound = 'true';
    cableDropdownList.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-group]');
      if (link) {
        e.preventDefault();
        const grp = link.getAttribute('data-group') ?? '';
        const nm = link.getAttribute('data-name') ?? '';
        const groupKeyInput = document.getElementById('addCableGroupKey');
        const groupNameInput = document.getElementById('addCableGroupName');
        if (groupKeyInput) {
          groupKeyInput.value = grp;
          groupKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (groupNameInput) groupNameInput.value = nm;
      }
    });
  }

  // Auto-sync group name when typing or selecting from datalist in group key input
  const cableGroupKeyInputEl = document.getElementById('addCableGroupKey');
  if (cableGroupKeyInputEl && !cableGroupKeyInputEl.dataset.syncBound) {
    cableGroupKeyInputEl.dataset.syncBound = 'true';
    const syncGroupNameFromKey = () => {
      const currentVal = cableGroupKeyInputEl.value.trim();
      const draft = getDraftRulesFromEditor();
      const cableCatalog = getCableCatalog(draft) || {};
      if (cableCatalog[currentVal] && (cableCatalog[currentVal]["Название"] || cableCatalog[currentVal]["Наименование"])) {
        const groupNameInput = document.getElementById('addCableGroupName');
        if (groupNameInput) {
          groupNameInput.value = cableCatalog[currentVal]["Название"] || cableCatalog[currentVal]["Наименование"] || '';
        }
      }
    };
    cableGroupKeyInputEl.addEventListener('input', syncGroupNameFromKey);
    cableGroupKeyInputEl.addEventListener('change', syncGroupNameFromKey);
  }

  // Ensure dynamic groups refresh whenever addCableModal opens
  const addCableModalEl = document.getElementById('addCableModal');
  if (addCableModalEl && !addCableModalEl.dataset.dynamicBound) {
    addCableModalEl.dataset.dynamicBound = 'true';
    addCableModalEl.addEventListener('show.bs.modal', () => {
      populateDynamicCableGroups();
    });
  }

  const quickAddCableInTabBtn = document.getElementById('quickAddCableInTabBtn');
  if (quickAddCableInTabBtn) {
    quickAddCableInTabBtn.addEventListener('click', () => {
      resetCableModalToAddMode();
      const form = document.getElementById('formAddCable');
      if (form) form.reset();

      const draft = getDraftRulesFromEditor();
      const cableCatalog = getCableCatalog(draft) || {};

      // Populate dynamic groups and datalists from active rules
      populateDynamicCableGroups(draft);

      const cpList = document.getElementById('datalistCouplingsList');
      if (cpList) {
        const cpCatalog = (draft && draft["Справочник муфт"]) || (cachedDefaultRules && cachedDefaultRules["Справочник муфт"]) || {};
        cpList.innerHTML = Object.keys(cpCatalog).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(cpCatalog[k]["Полное наименование"] || '')}</option>`).join('');
      }

      const catFilter = document.getElementById('cableCatalogCategoryFilter');
      const catVal = catFilter ? catFilter.value : 'all';
      const groupKeyInput = document.getElementById('addCableGroupKey');
      const groupNameInput = document.getElementById('addCableGroupName');
      const weightInput = document.getElementById('addCableWeight');
      const lenInput = document.getElementById('addCableBuildingLength');
      const coupInput = document.getElementById('addCableCoupling');

      const catEntries = Object.entries(cableCatalog);
      let targetGrpKey = '';
      let targetGrpName = '';
      let defaultWeight = '0.35';
      let defaultLen = '1000';
      let defaultCoup = '';

      if (catVal === 'optical') {
        const optEntry = catEntries.find(([k, v]) => v?.["Категория"] === 'Оптический кабель' || k.toLowerCase().includes('оптич') || (v?.["Название"] || '').toLowerCase().includes('оптич'));
        if (optEntry) {
          targetGrpKey = optEntry[0];
          targetGrpName = optEntry[1]?.["Название"] || optEntry[0];
          const firstMarkData = optEntry[1]?.["Тип"] ? Object.values(optEntry[1]["Тип"])[0] : null;
          if (firstMarkData) {
            if (firstMarkData["Вес"]) defaultWeight = String(firstMarkData["Вес"]);
            if (firstMarkData["Строительная длина"]) defaultLen = String(firstMarkData["Строительная длина"]);
            if (firstMarkData["Муфта"]) defaultCoup = firstMarkData["Муфта"];
          }
        } else {
          targetGrpKey = 'Оптический кабель';
          targetGrpName = 'Оптический кабель';
          defaultWeight = '0.28';
          defaultLen = '2000';
        }
      } else if (catEntries.length > 0) {
        // Pick first non-optical group if available, else first group
        const normalEntry = catEntries.find(([k, v]) => v?.["Категория"] !== 'Оптический кабель' && !k.toLowerCase().includes('оптич')) || catEntries[0];
        targetGrpKey = normalEntry[0];
        targetGrpName = normalEntry[1]?.["Название"] || normalEntry[0];
        const firstMarkData = normalEntry[1]?.["Тип"] ? Object.values(normalEntry[1]["Тип"])[0] : null;
        if (firstMarkData) {
          if (firstMarkData["Вес"]) defaultWeight = String(firstMarkData["Вес"]);
          if (firstMarkData["Строительная длина"]) defaultLen = String(firstMarkData["Строительная длина"]);
          if (firstMarkData["Муфта"]) defaultCoup = firstMarkData["Муфта"];
        }
      }

      if (groupKeyInput) groupKeyInput.value = targetGrpKey;
      if (groupNameInput) groupNameInput.value = targetGrpName;
      if (weightInput) weightInput.value = defaultWeight;
      if (lenInput) lenInput.value = defaultLen;
      if (coupInput) coupInput.value = defaultCoup;

      const modalEl = document.getElementById('addCableModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  const btnSaveNewCable = document.getElementById('btnSaveNewCable');
  if (btnSaveNewCable) {
    btnSaveNewCable.addEventListener('click', () => {
      const groupKeyInput = document.getElementById('addCableGroupKey');
      const groupKey = groupKeyInput ? groupKeyInput.value.trim() : '';

      const groupNameInput = document.getElementById('addCableGroupName');
      const groupName = (groupNameInput ? groupNameInput.value.trim() : '') || (groupKey === '' ? 'СБВБПу' : groupKey);

      const markInput = document.getElementById('addCableMark');
      const mark = markInput ? markInput.value.trim() : '';
      if (!mark) {
        showToast('Укажите марку/обозначение кабеля', 'warning', 'Проверка данных');
        if (markInput) markInput.focus();
        return;
      }

      const weight = parseFloat(document.getElementById('addCableWeight')?.value || '0.35') || 0.35;
      const buildingLength = parseInt(document.getElementById('addCableBuildingLength')?.value || '1000', 10) || 1000;
      const coupling = document.getElementById('addCableCoupling')?.value?.trim() || '';
      const description = document.getElementById('addCableDescription')?.value?.trim() || (groupName ? `${groupName} ${mark}` : `Кабель ${mark}`);
      const isOptical = groupKey === 'Оптический кабель' || groupName.toLowerCase().includes('оптич') || mark.toLowerCase().includes('окк');

      const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
      if (!currentObj["Справочник кабелей"] || typeof currentObj["Справочник кабелей"] !== 'object') {
        const existingCat = (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"]) ? cachedDefaultRules["Справочник кабелей"] : {};
        currentObj["Справочник кабелей"] = JSON.parse(JSON.stringify(existingCat));
      }

      // If in edit mode, remove old cable mark if group or mark changed
      if (addCableEditContext && addCableEditContext.mode === 'edit') {
        const oldGrp = addCableEditContext.originalGroup;
        const oldMrk = addCableEditContext.originalMark;
        if (oldGrp !== undefined && oldMrk && (oldGrp !== groupKey || oldMrk !== mark)) {
          if (currentObj["Справочник кабелей"][oldGrp]?.["Тип"]?.[oldMrk]) {
            delete currentObj["Справочник кабелей"][oldGrp]["Тип"][oldMrk];
          }
        }
      }

      if (!currentObj["Справочник кабелей"][groupKey] || typeof currentObj["Справочник кабелей"][groupKey] !== 'object') {
        currentObj["Справочник кабелей"][groupKey] = {
          "Название": groupName,
          ...(isOptical ? { "Категория": "Оптический кабель" } : {}),
          "Тип": {}
        };
      } else {
        if (groupName) {
          currentObj["Справочник кабелей"][groupKey]["Название"] = groupName;
        }
      }

      if (!currentObj["Справочник кабелей"][groupKey]["Тип"] || typeof currentObj["Справочник кабелей"][groupKey]["Тип"] !== 'object') {
        currentObj["Справочник кабелей"][groupKey]["Тип"] = {};
      }

      currentObj["Справочник кабелей"][groupKey]["Тип"][mark] = {
        "Строительная длина": buildingLength,
        "Муфта": coupling,
        "Вес": weight,
        ...(isOptical ? { "Категория": "Оптический кабель" } : {}),
        "Полное описание": description
      };

      modalDraftRules = currentObj;
      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();
      saveWorksRulesToLocalStorage(modalDraftRules);
      populateDynamicCableGroups(modalDraftRules);
      renderCableCatalogModalContent(modalDraftRules);
      renderCableGroupsOverviewModalContent(modalDraftRules);

      const modalEl = document.getElementById('addCableModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      const isEdit = addCableEditContext && addCableEditContext.mode === 'edit';
      resetCableModalToAddMode();

      const displayGroup = groupKey === '' ? 'Основная группа ("")' : `группа "${groupKey}"`;
      showToast(
        isEdit ? `Марка кабеля «${mark}» успешно изменена.` : `Марка кабеля «${mark}» успешно добавлена в ${displayGroup}.`,
        'success',
        isEdit ? 'Марка изменена' : 'Марка добавлена',
        5000
      );
    });
  }

  const cableSearchInput = document.getElementById('cableCatalogSearchInput');
  const cableClearSearchBtn = document.getElementById('cableCatalogClearSearchBtn');
  if (cableSearchInput) {
    const debouncedRenderCableCatalog = debounce(renderCableCatalogModalContent, 180);
    cableSearchInput.addEventListener('input', debouncedRenderCableCatalog);

    if (cableClearSearchBtn) {
      cableClearSearchBtn.addEventListener('click', () => {
        debouncedRenderCableCatalog.cancel();
        cableSearchInput.value = '';
        renderCableCatalogModalContent();
        cableSearchInput.focus();
      });
    }
  }

  const cableCatFilter = document.getElementById('cableCatalogCategoryFilter');
  if (cableCatFilter) {
    cableCatFilter.addEventListener('change', renderCableCatalogModalContent);
  }

  // =========================================================================
  // ADD / EDIT COUPLING MODAL
  // =========================================================================

  function openEditCouplingModal(couplingKey) {
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const catalog = currentObj["Справочник муфт"] || {};
    const data = catalog[couplingKey];

    if (!data) {
      showToast(`Муфта «${couplingKey}» не найдена в справочнике`, 'warning', 'Ошибка');
      return;
    }

    addCouplingEditContext = {
      mode: 'edit',
      originalMark: couplingKey,
      couplingData: JSON.parse(JSON.stringify(data))
    };

    const titleEl = document.getElementById('addCouplingModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-edit text-primary fs-5'></i> Редактирование соединительной муфты: «${escapeHtml(couplingKey)}»`;
    }
    const btnSave = document.getElementById('btnSaveNewCoupling');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check-double'></i> Сохранить изменения`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentCouplingInModal');
    if (btnDel) {
      btnDel.classList.remove('d-none');
    }

    const markInput = document.getElementById('addCouplingMark');
    const fullNameInput = document.getElementById('addCouplingFullName');
    const maxCoresInput = document.getElementById('addCouplingMaxCores');
    const unitInput = document.getElementById('addCouplingUnit');
    const optCheck = document.getElementById('addCouplingIsOptical');

    if (markInput) markInput.value = couplingKey;
    if (fullNameInput) fullNameInput.value = data["Полное наименование"] || couplingKey;
    if (maxCoresInput) maxCoresInput.value = data["МаксЖил"] !== undefined ? data["МаксЖил"] : 24;
    if (unitInput) unitInput.value = data["Единицы измерения"] || 'шт';
    if (optCheck) optCheck.checked = String(data["Категория"] || '').trim().toLowerCase() === 'оптическая муфта';

    const modalEl = document.getElementById('addCouplingModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  const quickAddCouplingInTabBtn = document.getElementById('quickAddCouplingInTabBtn');
  if (quickAddCouplingInTabBtn) {
    quickAddCouplingInTabBtn.addEventListener('click', () => {
      resetCouplingModalToAddMode();
      const form = document.getElementById('formAddCoupling');
      if (form) form.reset();
      const unitInput = document.getElementById('addCouplingUnit');
      if (unitInput) unitInput.value = 'шт';
      const optCheck = document.getElementById('addCouplingIsOptical');
      if (optCheck) optCheck.checked = false;

      const modalEl = document.getElementById('addCouplingModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  const btnSaveNewCoupling = document.getElementById('btnSaveNewCoupling');
  if (btnSaveNewCoupling) {
    btnSaveNewCoupling.addEventListener('click', () => {
      const markInput = document.getElementById('addCouplingMark');
      const mark = markInput ? markInput.value.trim() : '';
      if (!mark) {
        showToast('Укажите марку/тип муфты', 'warning', 'Проверка данных');
        if (markInput) markInput.focus();
        return;
      }

      const fullName = document.getElementById('addCouplingFullName')?.value?.trim() || `Муфта кабельная соединительная ${mark}`;
      const maxCores = parseInt(document.getElementById('addCouplingMaxCores')?.value || '24', 10) || 24;
      const unit = document.getElementById('addCouplingUnit')?.value?.trim() || 'шт';
      const isOptical = Boolean(document.getElementById('addCouplingIsOptical')?.checked);

      const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
      if (!currentObj["Справочник муфт"] || typeof currentObj["Справочник муфт"] !== 'object' || Array.isArray(currentObj["Справочник муфт"])) {
        currentObj["Справочник муфт"] = {};
      }

      // If in edit mode, remove old mark if renamed
      if (addCouplingEditContext && addCouplingEditContext.mode === 'edit') {
        const oldMark = addCouplingEditContext.originalMark;
        if (oldMark && oldMark !== mark && currentObj["Справочник муфт"][oldMark]) {
          delete currentObj["Справочник муфт"][oldMark];
        }
      }

      const couplingEntry = {
        "Полное наименование": fullName,
        "МаксЖил": maxCores,
        "Единицы измерения": unit
      };
      if (isOptical) {
        couplingEntry["Категория"] = "Оптическая муфта";
      }

      currentObj["Справочник муфт"][mark] = couplingEntry;

      modalDraftRules = currentObj;
      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();
      renderCouplingCatalogModalContent(modalDraftRules);

      const modalEl = document.getElementById('addCouplingModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      const isEdit = addCouplingEditContext && addCouplingEditContext.mode === 'edit';
      resetCouplingModalToAddMode();

      showToast(
        isEdit ? `Муфта «${mark}» успешно изменена.` : `Муфта «${mark}» успешно добавлена в справочник муфт.`,
        'success',
        isEdit ? 'Муфта изменена' : 'Муфта добавлена',
        5000
      );
    });
  }

  // =========================================================================
  // ADD / EDIT EQUIPMENT MODAL
  // =========================================================================

  function openEditEquipmentModal(markKey, targetMethod = null) {
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const eqCatalog = currentObj["Оборудование"] || {};
    const eqObj = eqCatalog[markKey];

    if (!eqObj) {
      showToast(`Оборудование «${markKey}» не найдено в нормах`, 'warning', 'Ошибка');
      return;
    }

    const wm = getEquipmentItemWorksObject(eqObj);
    const methodNames = Object.keys(wm);
    const activeMethod = targetMethod || (methodNames.length > 0 ? methodNames[0] : 'Не указано');
    const worksForMethod = wm[activeMethod] || [];

    addEquipEditContext = {
      mode: 'edit',
      originalMark: markKey,
      originalMethod: activeMethod,
      eqData: JSON.parse(JSON.stringify(eqObj))
    };

    const titleEl = document.getElementById('addEquipmentModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-edit text-primary fs-5'></i> Редактирование оборудования: «${escapeHtml(markKey)}»`;
    }
    const btnSave = document.getElementById('btnSaveNewEquipment');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check-double'></i> Сохранить изменения`;
    }
    const btnDelMethod = document.getElementById('btnDeleteCurrentEquipMethodInModal');
    if (btnDelMethod) {
      btnDelMethod.classList.remove('d-none');
      btnDelMethod.setAttribute('title', `Удалить способ «${escapeHtml(activeMethod)}»`);
    }
    const btnDelAll = document.getElementById('btnDeleteCurrentEquipAllInModal');
    if (btnDelAll) {
      btnDelAll.classList.remove('d-none');
      btnDelAll.setAttribute('title', `Удалить оборудование «${escapeHtml(markKey)}» целиком`);
    }

    const markInput = document.getElementById('addEquipMark');
    const methodInput = document.getElementById('addEquipMethod');
    if (markInput) markInput.value = markKey;
    if (methodInput) methodInput.value = activeMethod;

    const warningAlert = document.getElementById('addEquipExistWarning');
    if (warningAlert) warningAlert.classList.add('d-none');
    const strategyContainer = document.getElementById('addEquipMergeStrategyContainer');
    if (strategyContainer) strategyContainer.classList.add('d-none');

    const container = document.getElementById('addEquipWorksContainer');
    if (container) {
      container.innerHTML = '';
      const worksList = Array.isArray(worksForMethod) ? worksForMethod : (worksForMethod ? [worksForMethod] : []);
      if (worksList.length > 0) {
        worksList.forEach(w => {
          appendUnifiedWorkCard(container, w, { defaultSection: 'Монтажные работы', defaultFormula: 'КОЛИЧЕСТВО', defaultUnit: 'шт' });
        });
      } else {
        appendUnifiedWorkCard(container, null, { defaultSection: 'Монтажные работы', defaultFormula: 'КОЛИЧЕСТВО', defaultUnit: 'шт' });
      }
    }

    const modalEl = document.getElementById('addEquipmentModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  // Legacy compatibility aliases for equipment
  function appendAddEquipNestedItemRow(tbody, name = '', type = 'материал', unit = 'шт', formula = 'КОЛИЧЕСТВО', show = true) {
    appendUnifiedNestedItemRow(tbody, name, type, unit, formula, show, 'Монтажные работы');
  }
  function refreshAddEquipWorkCardBadges() {
    refreshUnifiedWorkCardBadges(document.getElementById('addEquipWorksContainer'));
  }
  function appendAddEquipWorkCard(title = '', unit = 'шт', formula = 'КОЛИЧЕСТВО', showFormula = false, section = 'Монтажные работы', nestedItems = []) {
    const workData = {
      "Наименование": title,
      "Единицы измерения": unit,
      "Формула": formula,
      "Тип": "работа",
      "ОтображатьФормулу": showFormula,
      "Раздел": section,
      "Материалы": nestedItems
    };
    appendUnifiedWorkCard(document.getElementById('addEquipWorksContainer'), workData, { defaultSection: section, defaultFormula: 'КОЛИЧЕСТВО', defaultUnit: 'шт', defaultShowFormula: false });
  }

  // Проверка дубликата способа установки для активной марки
  function checkEquipMethodExists() {
    if (addEquipEditContext && addEquipEditContext.mode === 'edit') return;
    const markInput = document.getElementById('addEquipMark');
    const methodInput = document.getElementById('addEquipMethod');
    const warningAlert = document.getElementById('addEquipExistWarning');
    const strategyContainer = document.getElementById('addEquipMergeStrategyContainer');

    if (!markInput || !methodInput || !warningAlert) return;

    const mark = markInput.value.trim();
    const method = methodInput.value.trim() || 'Не указано';

    const draft = getDraftRulesFromEditor();
    const eqCatalog = (draft && draft["Оборудование"]) || (cachedDefaultRules && cachedDefaultRules["Оборудование"]) || {};

    let exists = false;
    if (eqCatalog[mark] && eqCatalog[mark]["Работы"] && eqCatalog[mark]["Работы"][method]) {
      exists = true;
    }

    if (exists) {
      warningAlert.classList.remove('d-none');
      if (strategyContainer) strategyContainer.classList.remove('d-none');
    } else {
      warningAlert.classList.add('d-none');
      if (strategyContainer) strategyContainer.classList.add('d-none');
    }
  }

  const addEquipWorksContainer = document.getElementById('addEquipWorksContainer');
  if (addEquipWorksContainer) {
    addEquipWorksContainer.addEventListener('click', (e) => {
      const addNestedBtn = e.target.closest('.btn-add-nested-row, .btn-add-equip-nested-item');
      if (addNestedBtn) {
        const card = addNestedBtn.closest('.unified-work-card, .equip-work-card');
        const tbody = card ? (card.querySelector('.unified-nested-tbody') || card.querySelector('.equip-work-nested-tbody')) : null;
        if (tbody) {
          appendUnifiedNestedItemRow(tbody, '', 'материал', 'шт', 'КОЛИЧЕСТВО', true, 'Монтажные работы');
        }
        return;
      }

      const removeRowBtn = e.target.closest('.btn-remove-nested-row, .btn-remove-equip-item-row');
      if (removeRowBtn) {
        const tr = removeRowBtn.closest('tr');
        if (tr) tr.remove();
        return;
      }

      const removeWorkBtn = e.target.closest('.btn-remove-unified-work-card, .btn-remove-equip-work-card');
      if (removeWorkBtn) {
        const card = removeWorkBtn.closest('.unified-work-card, .equip-work-card');
        if (card) {
          card.remove();
          refreshUnifiedWorkCardBadges(addEquipWorksContainer);
          if (addEquipWorksContainer.children.length === 0) {
            appendUnifiedWorkCard(addEquipWorksContainer, null, { defaultSection: 'Монтажные работы', defaultFormula: 'КОЛИЧЕСТВО', defaultUnit: 'шт' });
          }
        }
        return;
      }
    });

    addEquipWorksContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('unified-work-title') || e.target.classList.contains('equip-work-title') || e.target.classList.contains('unified-nested-name')) {
        e.target.dataset.autoFilled = 'false';
      }
    });
  }

  const btnAddEquipWorkCard = document.getElementById('btnAddEquipWorkCard');
  if (btnAddEquipWorkCard) {
    btnAddEquipWorkCard.addEventListener('click', () => {
      appendUnifiedWorkCard(addEquipWorksContainer, null, { defaultSection: 'Монтажные работы', defaultFormula: 'КОЛИЧЕСТВО', defaultUnit: 'шт' });
    });
  }

  const addEquipMarkInput = document.getElementById('addEquipMark');
  if (addEquipMarkInput) {
    addEquipMarkInput.addEventListener('input', () => {
      const mark = addEquipMarkInput.value.trim();
      const firstWorkTitle = document.querySelector('#addEquipWorksContainer .unified-work-card:first-child .unified-work-title, #addEquipWorksContainer .equip-work-card:first-child .equip-work-title');
      if (firstWorkTitle && (!firstWorkTitle.value.trim() || firstWorkTitle.dataset.autoFilled === 'true')) {
        firstWorkTitle.value = mark ? `Монтаж оборудования типа ${mark}` : '';
        firstWorkTitle.dataset.autoFilled = 'true';
      }
      const firstItemName = document.querySelector('#addEquipWorksContainer .unified-work-card:first-child .unified-nested-name, #addEquipWorksContainer .equip-work-card:first-child .equip-item-name');
      const firstItemType = document.querySelector('#addEquipWorksContainer .unified-work-card:first-child .unified-nested-type, #addEquipWorksContainer .equip-work-card:first-child .equip-item-type');
      if (firstItemName && firstItemType && firstItemType.value === 'оборудование' && (!firstItemName.value.trim() || firstItemName.dataset.autoFilled === 'true')) {
        firstItemName.value = mark;
        firstItemName.dataset.autoFilled = 'true';
      }
      checkEquipMethodExists();
    });
  }

  const addEquipMethodInput = document.getElementById('addEquipMethod');
  if (addEquipMethodInput) {
    addEquipMethodInput.addEventListener('input', checkEquipMethodExists);
    addEquipMethodInput.addEventListener('change', checkEquipMethodExists);
  }

  const quickAddEquipmentInTabBtn = document.getElementById('quickAddEquipmentInTabBtn');
  if (quickAddEquipmentInTabBtn) {
    quickAddEquipmentInTabBtn.addEventListener('click', () => {
      resetEquipmentModalToAddMode();
      const form = document.getElementById('formAddEquipment');
      if (form) form.reset();

      const methodInput = document.getElementById('addEquipMethod');
      if (methodInput) methodInput.value = 'Не указано';

      const methodsList = document.getElementById('datalistEquipMethods');
      if (methodsList) {
        const draft = getDraftRulesFromEditor();
        const eqCatalog = (draft && draft["Оборудование"]) || (cachedDefaultRules && cachedDefaultRules["Оборудование"]) || {};
        const knownMethods = new Set(['Не указано', 'На стрелочном башмаке', 'На бетонном фундаменте', 'В релейном шкафу', 'Боковые пути']);
        Object.values(eqCatalog).forEach(e => {
          if (e && e["Работы"] && typeof e["Работы"] === 'object') {
            Object.keys(e["Работы"]).forEach(m => knownMethods.add(m));
          }
        });
        methodsList.innerHTML = Array.from(knownMethods).map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
      }

      if (addEquipWorksContainer) {
        addEquipWorksContainer.innerHTML = '';
        appendUnifiedWorkCard(addEquipWorksContainer, {
          "Наименование": "",
          "Тип": "работа",
          "Единицы измерения": "шт",
          "Формула": "КОЛИЧЕСТВО",
          "ОтображатьФормулу": false,
          "Раздел": "Монтажные работы",
          "Материалы": [
            { "Наименование": "", "Тип": "оборудование", "Единицы измерения": "шт", "Формула": "КОЛИЧЕСТВО", "ОтображатьФормулу": true },
            { "Наименование": "", "Тип": "материал", "Единицы измерения": "шт", "Формула": "КОЛИЧЕСТВО", "ОтображатьФормулу": true }
          ]
        }, { defaultSection: 'Монтажные работы', defaultFormula: 'КОЛИЧЕСТВО', defaultUnit: 'шт' });
      }

      checkEquipMethodExists();

      const modalEl = document.getElementById('addEquipmentModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  const btnSaveNewEquipment = document.getElementById('btnSaveNewEquipment');
  if (btnSaveNewEquipment) {
    btnSaveNewEquipment.addEventListener('click', () => {
      const markInput = document.getElementById('addEquipMark');
      const mark = markInput ? markInput.value.trim() : '';
      if (!mark) {
        showToast('Укажите марку/тип оборудования', 'warning', 'Проверка данных');
        if (markInput) markInput.focus();
        return;
      }

      const methodInput = document.getElementById('addEquipMethod');
      const method = (methodInput ? methodInput.value.trim() : '') || 'Не указано';
      const mergeStrategy = document.getElementById('addEquipMergeStrategy')?.value || 'append';

      const parsedWorks = collectUnifiedWorksData(document.getElementById('addEquipWorksContainer'));

      if (parsedWorks.length === 0) {
        showToast('Добавьте хотя бы одну работу с наименованием', 'warning', 'Проверка данных');
        return;
      }

      const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
      if (!currentObj["Оборудование"] || typeof currentObj["Оборудование"] !== 'object' || Array.isArray(currentObj["Оборудование"])) {
        currentObj["Оборудование"] = {};
      }

      // If in edit mode, handle rename or method change
      if (addEquipEditContext && addEquipEditContext.mode === 'edit') {
        const oldMark = addEquipEditContext.originalMark;
        const oldMethod = addEquipEditContext.originalMethod;

        if (oldMark && oldMark !== mark && currentObj["Оборудование"][oldMark]) {
          // Move existing methods to new mark
          currentObj["Оборудование"][mark] = currentObj["Оборудование"][oldMark];
          delete currentObj["Оборудование"][oldMark];
        }

        if (!currentObj["Оборудование"][mark] || typeof currentObj["Оборудование"][mark] !== 'object') {
          currentObj["Оборудование"][mark] = { "Работы": {} };
        }
        if (!currentObj["Оборудование"][mark]["Работы"] || typeof currentObj["Оборудование"][mark]["Работы"] !== 'object') {
          currentObj["Оборудование"][mark]["Работы"] = {};
        }

        if (oldMethod && oldMethod !== method && currentObj["Оборудование"][mark]["Работы"][oldMethod]) {
          delete currentObj["Оборудование"][mark]["Работы"][oldMethod];
        }
      }

      if (!currentObj["Оборудование"][mark] || typeof currentObj["Оборудование"][mark] !== 'object') {
        currentObj["Оборудование"][mark] = { "Работы": {} };
      }
      if (!currentObj["Оборудование"][mark]["Работы"] || typeof currentObj["Оборудование"][mark]["Работы"] !== 'object') {
        currentObj["Оборудование"][mark]["Работы"] = {};
      }

      if (!addEquipEditContext && mergeStrategy === 'append' && Array.isArray(currentObj["Оборудование"][mark]["Работы"][method])) {
        currentObj["Оборудование"][mark]["Работы"][method].push(...parsedWorks);
      } else {
        currentObj["Оборудование"][mark]["Работы"][method] = parsedWorks;
      }

      modalDraftRules = currentObj;
      setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
      validateWorksJsonInput();
      renderEquipmentCatalogModalContent(modalDraftRules);

      const modalEl = document.getElementById('addEquipmentModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      const isEdit = addEquipEditContext && addEquipEditContext.mode === 'edit';
      resetEquipmentModalToAddMode();

      showToast(
        isEdit ? `Оборудование «${mark}» [${method}]: сметные нормы успешно обновлены.` : `Оборудование «${mark}» [${method}]: успешно добавлено ${parsedWorks.length} работ.`,
        'success',
        isEdit ? 'Нормы обновлены' : 'Оборудование добавлено',
        5000
      );
    });
  }

  // =========================================================================
  // ТАБЫ, ПОИСК И НАСТРОЙКИ
  // =========================================================================

  const cardsTabBtn = document.getElementById('tabWorksCardsBtn');
  if (cardsTabBtn) {
    cardsTabBtn.addEventListener('shown.bs.tab', () => {
      renderRulesModalContent(getDraftRulesFromEditor(), false);
    });
  }

  const cablesTabBtn = document.getElementById('tabWorksCablesBtn');
  if (cablesTabBtn) {
    cablesTabBtn.addEventListener('shown.bs.tab', () => {
      renderCableCatalogModalContent(getDraftRulesFromEditor());
    });
  }

  const couplingsTabBtn = document.getElementById('tabWorksCouplingsBtn');
  if (couplingsTabBtn) {
    couplingsTabBtn.addEventListener('shown.bs.tab', () => {
      renderCouplingCatalogModalContent(getDraftRulesFromEditor());
    });
  }

  const equipmentTabBtn = document.getElementById('tabWorksEquipmentBtn');
  if (equipmentTabBtn) {
    equipmentTabBtn.addEventListener('shown.bs.tab', () => {
      renderEquipmentCatalogModalContent(getDraftRulesFromEditor());
    });
  }

  const settingsTabBtn = document.getElementById('tabWorksSettingsBtn');
  if (settingsTabBtn) {
    settingsTabBtn.addEventListener('shown.bs.tab', () => {
      renderSettingsModalContent(getDraftRulesFromEditor());
    });
  }

  const syncSettingsBtn = document.getElementById('syncSettingsToJsonBtn');
  if (syncSettingsBtn) syncSettingsBtn.addEventListener('click', () => saveSettingsFromUiToJson(true));

  const resetSettingsBtn = document.getElementById('resetDefaultSettingsBtn');
  if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', resetDefaultSettings);

  [
    'settingNumberingMode',
    'settingDecimalsWorks', 'settingDecimalsMaterials',
    'settingGgeVersion', 'settingAccessLevel',
    'settingSoftName', 'settingPluginVersion'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => saveSettingsFromUiToJson(false));
  });

  const equipmentSearchInput = document.getElementById('equipmentCatalogSearchInput');
  const equipmentClearSearchBtn = document.getElementById('equipmentCatalogClearSearchBtn');
  if (equipmentSearchInput) {
    const debouncedRenderEquipment = debounce(renderEquipmentCatalogModalContent, 180);
    equipmentSearchInput.addEventListener('input', debouncedRenderEquipment);

    if (equipmentClearSearchBtn) {
      equipmentClearSearchBtn.addEventListener('click', () => {
        debouncedRenderEquipment.cancel();
        equipmentSearchInput.value = '';
        renderEquipmentCatalogModalContent();
        equipmentSearchInput.focus();
      });
    }
  }

  const couplingSearchInput = document.getElementById('couplingCatalogSearchInput');
  const couplingClearSearchBtn = document.getElementById('couplingCatalogClearSearchBtn');
  if (couplingSearchInput) {
    const debouncedRenderCouplings = debounce(renderCouplingCatalogModalContent, 180);
    couplingSearchInput.addEventListener('input', debouncedRenderCouplings);

    if (couplingClearSearchBtn) {
      couplingClearSearchBtn.addEventListener('click', () => {
        debouncedRenderCouplings.cancel();
        couplingSearchInput.value = '';
        renderCouplingCatalogModalContent();
        couplingSearchInput.focus();
      });
    }
  }

  const resetBtn = document.getElementById('resetRulesBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetWorksRules);

  const downloadBtn = document.getElementById('downloadRulesBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadWorksRules);

  const rulesFileInput = document.getElementById('rulesFileInput');
  if (rulesFileInput) rulesFileInput.addEventListener('change', handleRulesFileInput);

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
        window.currentWorksRules = currentWorksRules;
        modalDraftRules = JSON.parse(JSON.stringify(parsed));

        // Save committed rules to LocalStorage
        saveWorksRulesToLocalStorage(currentWorksRules);

        renderRulesModalContent(currentWorksRules);

        if (typeof currentData !== 'undefined' && currentData && typeof calculateVolumes === 'function') {
          calculateVolumes();
        }

        const modalEl = document.getElementById('worksRulesModal');
        if (modalEl && window.bootstrap && bootstrap.Modal) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        const sections = getRulesSections(currentWorksRules);
        let totalWays = 0;
        sections.forEach(s => totalWays += s.rules.length);
        showToast(`Сметные нормы обновлены и сохранены в LocalStorage (${totalWays} способов в ${sections.length} разд.). Выполнен авто-перерасчет работ.`, 'success', 'Сохранено в LocalStorage');
      } catch (err) {
        showToast('Ошибка синтаксиса JSON: ' + err.message, 'error', 'Ошибка');
      }
    });
  }

  // LocalStorage explicit actions in Settings tab
  const saveStorageBtn = document.getElementById('saveLocalStorageRulesBtn');
  if (saveStorageBtn) {
    saveStorageBtn.addEventListener('click', () => {
      const draft = getDraftRulesFromEditor();
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        showToast('Не удалось сохранить: ошибка формата JSON в редакторе', 'error', 'Ошибка');
        return;
      }
      currentWorksRules = JSON.parse(JSON.stringify(draft));
      window.currentWorksRules = currentWorksRules;
      saveWorksRulesToLocalStorage(currentWorksRules);
      if (typeof currentData !== 'undefined' && currentData && typeof calculateVolumes === 'function') calculateVolumes();
      showToast('Текущие правила из редактора успешно сохранены в LocalStorage браузера', 'success', 'LocalStorage обновлен');
    });
  }

  const clearStorageBtn = document.getElementById('clearLocalStorageRulesBtn');
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', () => {
      clearWorksRulesFromLocalStorage();
      showToast('Сохраненные правила удалены из LocalStorage. Нажмите кнопку «По умолчанию», если хотите загрузить стандартный шаблон works_rules.json.', 'info', 'LocalStorage очищен');
    });
  }

  // Delegated event listener for block Edit buttons
  document.addEventListener('click', (e) => {
    // Edit Rule / Installation Way
    const editRuleBtn = e.target.closest('.btn-edit-rule');
    if (editRuleBtn) {
      const sec = editRuleBtn.getAttribute('data-rule-section');
      const name = editRuleBtn.getAttribute('data-rule-name');
      if (sec && name) {
        openEditRuleModal(sec, name);
      }
      return;
    }

    // Edit Cable Group / Designation Mapping
    const editCableGroupBtn = e.target.closest('.btn-edit-cable-group');
    if (editCableGroupBtn) {
      e.preventDefault();
      e.stopPropagation();
      const grpKey = editCableGroupBtn.getAttribute('data-group-key') ?? '';
      openEditCableGroupModal(grpKey);
      return;
    }

    // Add Cable Mark to specific group
    const addMarkToGroupBtn = e.target.closest('.btn-add-mark-to-group');
    if (addMarkToGroupBtn) {
      e.preventDefault();
      e.stopPropagation();
      const grpKey = addMarkToGroupBtn.getAttribute('data-group-key') ?? '';
      const grpName = addMarkToGroupBtn.getAttribute('data-group-name') ?? '';
      openAddCableModalForGroup(grpKey, grpName);
      return;
    }

    // Delete Cable Group
    const delCableGroupBtn = e.target.closest('.btn-delete-cable-group');
    if (delCableGroupBtn) {
      e.preventDefault();
      e.stopPropagation();
      const grpKey = delCableGroupBtn.getAttribute('data-group-key') ?? '';
      deleteCableGroupItem(grpKey);
      return;
    }

    // Edit Cable Mark
    const editCableBtn = e.target.closest('.btn-edit-cable');
    if (editCableBtn) {
      const grp = editCableBtn.getAttribute('data-cable-group') ?? '';
      const mark = editCableBtn.getAttribute('data-cable-mark');
      if (mark) {
        openEditCableModal(grp, mark);
      }
      return;
    }

    // Edit Coupling
    const editCouplingBtn = e.target.closest('.btn-edit-coupling');
    if (editCouplingBtn) {
      const mark = editCouplingBtn.getAttribute('data-coupling-mark');
      if (mark) {
        openEditCouplingModal(mark);
      }
      return;
    }

    // Edit Equipment (Full item)
    const editEquipBtn = e.target.closest('.btn-edit-equipment');
    if (editEquipBtn) {
      const mark = editEquipBtn.getAttribute('data-equipment-mark');
      if (mark) {
        openEditEquipmentModal(mark);
      }
      return;
    }

    // Edit Equipment Method
    const editEquipMethodBtn = e.target.closest('.btn-edit-equipment-method');
    if (editEquipMethodBtn) {
      const mark = editEquipMethodBtn.getAttribute('data-equipment-mark');
      const method = editEquipMethodBtn.getAttribute('data-method-name');
      if (mark) {
        openEditEquipmentModal(mark, method);
      }
      return;
    }

    // Delete Rule / Installation Way
    const delRuleBtn = e.target.closest('.btn-delete-rule');
    if (delRuleBtn) {
      e.preventDefault();
      e.stopPropagation();
      const sec = delRuleBtn.getAttribute('data-rule-section');
      const name = delRuleBtn.getAttribute('data-rule-name');
      if (sec && name) {
        deleteRuleItem(sec, name);
      }
      return;
    }

    // Delete Cable Mark
    const delCableBtn = e.target.closest('.btn-delete-cable');
    if (delCableBtn) {
      e.preventDefault();
      e.stopPropagation();
      const grp = delCableBtn.getAttribute('data-cable-group') ?? '';
      const mark = delCableBtn.getAttribute('data-cable-mark');
      if (mark) {
        deleteCableItem(grp, mark);
      }
      return;
    }

    // Delete Coupling
    const delCouplingBtn = e.target.closest('.btn-delete-coupling');
    if (delCouplingBtn) {
      e.preventDefault();
      e.stopPropagation();
      const mark = delCouplingBtn.getAttribute('data-coupling-mark');
      if (mark) {
        deleteCouplingItem(mark);
      }
      return;
    }

    // Delete Equipment Method
    const delEquipMethodBtn = e.target.closest('.btn-delete-equipment-method');
    if (delEquipMethodBtn) {
      e.preventDefault();
      e.stopPropagation();
      const mark = delEquipMethodBtn.getAttribute('data-equipment-mark');
      const method = delEquipMethodBtn.getAttribute('data-method-name');
      if (mark && method) {
        deleteEquipmentMethodItem(mark, method);
      }
      return;
    }

    // Delete Equipment (Full item)
    const delEquipBtn = e.target.closest('.btn-delete-equipment');
    if (delEquipBtn) {
      e.preventDefault();
      e.stopPropagation();
      const mark = delEquipBtn.getAttribute('data-equipment-mark');
      if (mark) {
        deleteEquipmentAllItem(mark);
      }
      return;
    }
  });

  // =========================================================================
  // DELETION LOGIC (RULES, CABLES, COUPLINGS, EQUIPMENT)
  // =========================================================================

  function deleteRuleItem(sectionName, ruleName) {
    if (!sectionName || !ruleName) return;
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    let deleted = false;

    if (currentObj[sectionName] && typeof currentObj[sectionName] === 'object') {
      if (currentObj[sectionName][ruleName] !== undefined) {
        delete currentObj[sectionName][ruleName];
        deleted = true;
      } else {
        const foundKey = Object.keys(currentObj[sectionName]).find(k => k.trim() === ruleName.trim());
        if (foundKey) {
          delete currentObj[sectionName][foundKey];
          deleted = true;
        }
      }
    }

    if (!deleted) {
      for (const [secKey, secVal] of Object.entries(currentObj)) {
        if (secVal && typeof secVal === 'object' && secVal[ruleName] !== undefined) {
          delete secVal[ruleName];
          deleted = true;
          break;
        }
      }
    }

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    renderRulesModalContent(modalDraftRules, true);

    const modalEl = document.getElementById('addRuleModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetRuleModalToAddMode();

    showToast(`Способ «${ruleName}» успешно удален из раздела «${sectionName}».`, 'success', 'Удалено');
  }

  function deleteCableItem(groupName, markKey) {
    if (!markKey) return;
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const catalog = currentObj["Справочник кабелей"];
    let deleted = false;

    if (catalog && typeof catalog === 'object') {
      if (groupName !== undefined && catalog[groupName]?.["Тип"]?.[markKey]) {
        delete catalog[groupName]["Тип"][markKey];
        deleted = true;
      }
      if (!deleted) {
        for (const g of Object.values(catalog)) {
          if (g?.["Тип"]?.[markKey]) {
            delete g["Тип"][markKey];
            deleted = true;
            break;
          }
        }
      }
    }

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    renderCableCatalogModalContent(modalDraftRules);

    const modalEl = document.getElementById('addCableModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetCableModalToAddMode();

    showToast(`Марка кабеля «${markKey}» успешно удалена из справочника.`, 'success', 'Удалено');
  }

  function deleteCouplingItem(markKey) {
    if (!markKey) return;
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    if (currentObj["Справочник муфт"] && currentObj["Справочник муфт"][markKey]) {
      delete currentObj["Справочник муфт"][markKey];
    }

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    renderCouplingCatalogModalContent(modalDraftRules);

    const modalEl = document.getElementById('addCouplingModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetCouplingModalToAddMode();

    showToast(`Муфта «${markKey}» успешно удалена из справочника.`, 'success', 'Удалено');
  }

  function deleteEquipmentMethodItem(markKey, methodName) {
    if (!markKey || !methodName) return;
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const eqObj = currentObj["Оборудование"]?.[markKey];
    if (eqObj) {
      if (eqObj["Работы"] && eqObj["Работы"][methodName]) {
        delete eqObj["Работы"][methodName];
      }
      if (eqObj["Работы и материалы"] && eqObj["Работы и материалы"][methodName]) {
        delete eqObj["Работы и материалы"][methodName];
      }
    }

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    renderEquipmentCatalogModalContent(modalDraftRules);

    const modalEl = document.getElementById('addEquipmentModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetEquipmentModalToAddMode();

    showToast(`Способ установки «${methodName}» для оборудования «${markKey}» удален.`, 'success', 'Удалено');
  }

  function deleteEquipmentAllItem(markKey) {
    if (!markKey) return;
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    if (currentObj["Оборудование"] && currentObj["Оборудование"][markKey]) {
      delete currentObj["Оборудование"][markKey];
    }

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    renderEquipmentCatalogModalContent(modalDraftRules);

    const modalEl = document.getElementById('addEquipmentModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetEquipmentModalToAddMode();

    showToast(`Оборудование «${markKey}» полностью удалено из справочника.`, 'success', 'Удалено');
  }

  // =========================================================================
  // CABLE GROUPS & CONDITIONAL DESIGNATIONS MANAGER
  // =========================================================================

  let addCableGroupEditContext = null;

  function resetCableGroupModalToAddMode() {
    addCableGroupEditContext = null;
    const titleEl = document.getElementById('editCableGroupModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class='bx bx-folder-plus text-success fs-5'></i> Добавление группы кабелей и обозначения`;
    }
    const btnSave = document.getElementById('btnSaveCableGroup');
    if (btnSave) {
      btnSave.innerHTML = `<i class='bx bx-check'></i> Создать группу`;
    }
    const btnDel = document.getElementById('btnDeleteCurrentCableGroupInModal');
    if (btnDel) btnDel.classList.add('d-none');

    const keyInput = document.getElementById('editCableGroupKey');
    const nameInput = document.getElementById('editCableGroupName');
    const catSelect = document.getElementById('editCableGroupCategory');
    if (keyInput) keyInput.value = '';
    if (nameInput) nameInput.value = '';
    if (catSelect) catSelect.value = '';
  }

  function openEditCableGroupModal(groupKey = null) {
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const catalog = currentObj["Справочник кабелей"] || {};

    const keyInput = document.getElementById('editCableGroupKey');
    const nameInput = document.getElementById('editCableGroupName');
    const catSelect = document.getElementById('editCableGroupCategory');
    const titleEl = document.getElementById('editCableGroupModalTitle');
    const btnSave = document.getElementById('btnSaveCableGroup');
    const btnDel = document.getElementById('btnDeleteCurrentCableGroupInModal');

    if (groupKey !== null && groupKey !== undefined) {
      const targetGroup = catalog[groupKey] || {};
      const brandName = targetGroup["Название"] || (groupKey === '' ? 'СБВБПу' : groupKey);
      const displayKey = groupKey === '' ? '"" (без знака)' : (groupKey === '\\U+0394' ? '\\U+0394 (Δ)' : `"${groupKey}"`);

      addCableGroupEditContext = {
        mode: 'edit',
        originalKey: groupKey,
        originalName: brandName,
        groupData: JSON.parse(JSON.stringify(targetGroup))
      };

      if (titleEl) {
        titleEl.innerHTML = `<i class='bx bx-edit text-primary fs-5'></i> Изменение соответствия: ${escapeHtml(displayKey)} ↔ «${escapeHtml(brandName)}»`;
      }
      if (btnSave) {
        btnSave.innerHTML = `<i class='bx bx-check-double'></i> Сохранить соответствие`;
      }
      if (btnDel) {
        btnDel.classList.remove('d-none');
      }

      if (keyInput) keyInput.value = groupKey;
      if (nameInput) nameInput.value = targetGroup["Название"] || '';
      if (catSelect) catSelect.value = targetGroup["Категория"] || '';
    } else {
      resetCableGroupModalToAddMode();
    }

    const modalEl = document.getElementById('editCableGroupModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  function saveCableGroupModal() {
    const keyInput = document.getElementById('editCableGroupKey');
    const nameInput = document.getElementById('editCableGroupName');
    const catSelect = document.getElementById('editCableGroupCategory');
    const updateDescCheck = document.getElementById('editCableGroupUpdateFullDesc');

    let newKey = keyInput ? keyInput.value.trim() : '';
    // If user entered Greek delta Δ or U+0394 directly, normalize to \U+0394 for AutoCAD export compatibility
    if (newKey === 'Δ' || newKey === 'U+0394') {
      newKey = '\\U+0394';
    }

    const newName = nameInput ? nameInput.value.trim() : '';
    if (!newName) {
      showToast('Укажите наименование марки кабеля для этой группы', 'warning', 'Проверка данных');
      if (nameInput) nameInput.focus();
      return;
    }

    const newCat = catSelect ? catSelect.value.trim() : '';
    const shouldUpdateDesc = updateDescCheck ? updateDescCheck.checked : true;

    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    if (!currentObj["Справочник кабелей"] || typeof currentObj["Справочник кабелей"] !== 'object') {
      const existingCat = (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"]) ? cachedDefaultRules["Справочник кабелей"] : {};
      currentObj["Справочник кабелей"] = JSON.parse(JSON.stringify(existingCat));
    }

    const isEdit = addCableGroupEditContext && addCableGroupEditContext.mode === 'edit';
    const oldKey = isEdit ? addCableGroupEditContext.originalKey : null;
    const oldName = isEdit ? addCableGroupEditContext.originalName : '';

    if (isEdit && oldKey !== null) {
      // If key (conditional designation) changed
      if (oldKey !== newKey) {
        if (currentObj["Справочник кабелей"][newKey] && newKey !== oldKey) {
          // If destination group already exists, merge types
          const targetExistingTypes = currentObj["Справочник кабелей"][newKey]["Тип"] || {};
          const oldTypes = currentObj["Справочник кабелей"][oldKey]?.["Тип"] || {};
          currentObj["Справочник кабелей"][newKey]["Тип"] = { ...targetExistingTypes, ...oldTypes };
          delete currentObj["Справочник кабелей"][oldKey];
        } else {
          // Rename group key
          const groupData = currentObj["Справочник кабелей"][oldKey] || { "Тип": {} };
          delete currentObj["Справочник кабелей"][oldKey];
          currentObj["Справочник кабелей"][newKey] = groupData;
        }
      }
    } else {
      // Add mode: check if key already exists
      if (currentObj["Справочник кабелей"][newKey]) {
        showToast(`Группа с условным обозначением «${newKey || '""'}» уже существует. Выберите другое обозначение или отредактируйте существующую группу.`, 'warning', 'Группа существует');
        return;
      }
      currentObj["Справочник кабелей"][newKey] = {
        "Название": newName,
        "Тип": {}
      };
    }

    if (!currentObj["Справочник кабелей"][newKey]) {
      currentObj["Справочник кабелей"][newKey] = { "Название": newName, "Тип": {} };
    }

    currentObj["Справочник кабелей"][newKey]["Название"] = newName;
    if (newCat) {
      currentObj["Справочник кабелей"][newKey]["Категория"] = newCat;
    } else {
      delete currentObj["Справочник кабелей"][newKey]["Категория"];
    }

    // Optionally update mark name in full descriptions of all types in this group
    if (shouldUpdateDesc && oldName && oldName !== newName && currentObj["Справочник кабелей"][newKey]["Тип"]) {
      Object.values(currentObj["Справочник кабелей"][newKey]["Тип"]).forEach(tObj => {
        if (tObj && typeof tObj === 'object' && tObj["Полное описание"]) {
          tObj["Полное описание"] = tObj["Полное описание"].split(oldName).join(newName);
        }
      });
    }

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    saveWorksRulesToLocalStorage(modalDraftRules);

    // Re-populate and re-render
    populateDynamicCableGroups(modalDraftRules);
    renderCableCatalogModalContent(modalDraftRules);
    renderCableGroupsOverviewModalContent(modalDraftRules);

    const modalEl = document.getElementById('editCableGroupModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetCableGroupModalToAddMode();

    const displayKey = newKey === '' ? '"" (без знака)' : `"${newKey}"`;
    showToast(
      isEdit 
        ? `Соответствие марки «${newName}» и условного обозначения ${displayKey} успешно сохранено.`
        : `Группа кабелей «${newName}» с условным обозначением ${displayKey} создана.`,
      'success',
      'Сохранено',
      5000
    );
  }

  function deleteCableGroupItem(groupKey) {
    if (groupKey === undefined || groupKey === null) return;
    const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
    const catalog = currentObj["Справочник кабелей"];
    if (!catalog || !catalog[groupKey]) return;

    const brandName = catalog[groupKey]["Название"] || groupKey;
    const displayKey = groupKey === '' ? '"" (без знака)' : `"${groupKey}"`;

    delete currentObj["Справочник кабелей"][groupKey];

    modalDraftRules = currentObj;
    setWorksJsonEditorValue(JSON.stringify(currentObj, null, 2));
    validateWorksJsonInput();
    saveWorksRulesToLocalStorage(modalDraftRules);

    populateDynamicCableGroups(modalDraftRules);
    renderCableCatalogModalContent(modalDraftRules);
    renderCableGroupsOverviewModalContent(modalDraftRules);

    const modalEl = document.getElementById('editCableGroupModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    resetCableGroupModalToAddMode();

    showToast(`Группа кабелей «${brandName}» (${displayKey}) успешно удалена из справочника.`, 'success', 'Группа удалена');
  }

  function openAddCableModalForGroup(groupKey, groupName) {
    resetCableModalToAddMode();
    const form = document.getElementById('formAddCable');
    if (form) form.reset();

    const draft = getDraftRulesFromEditor();
    populateDynamicCableGroups(draft);

    const groupKeyInput = document.getElementById('addCableGroupKey');
    const groupNameInput = document.getElementById('addCableGroupName');
    if (groupKeyInput) groupKeyInput.value = groupKey;
    if (groupNameInput) groupNameInput.value = groupName;

    const modalEl = document.getElementById('addCableModal');
    if (modalEl && window.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  function renderCableGroupsOverviewModalContent(rulesObj = null) {
    const tableBody = document.getElementById('cableGroupsOverviewTableBody');
    const totalBadge = document.getElementById('cableGroupsTotalBadge');
    if (!tableBody) return;

    const rules = resolveValidRules(rulesObj);
    const catalog = getCableCatalog(rules) || {};
    const entries = Object.entries(catalog);

    if (totalBadge) {
      totalBadge.textContent = `${entries.length} групп`;
    }

    const searchInput = document.getElementById('cableGroupOverviewSearchInput');
    const query = (searchInput ? searchInput.value.trim().toLowerCase() : '');

    let filtered = entries;
    if (query) {
      filtered = entries.filter(([k, v]) => {
        const name = (v && v["Название"]) || '';
        const cat = (v && v["Категория"]) || '';
        return `${k} ${name} ${cat}`.toLowerCase().includes(query);
      });
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-muted">
            <i class='bx bx-search fs-4 d-block mb-1'></i>
            ${query ? 'По запросу группы не найдены' : 'Справочник групп кабелей пуст'}
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(([grpKey, grpVal]) => {
      const brandName = (grpVal && grpVal["Название"]) || (grpKey === '' ? 'СБВБПу' : grpKey);
      const cat = (grpVal && grpVal["Категория"]) || 'Сигнально-блокировочный кабель';
      const count = (grpVal && grpVal["Тип"] && typeof grpVal["Тип"] === 'object') ? Object.keys(grpVal["Тип"]).length : 0;

      let codeDisplay = '';
      if (grpKey === '') {
        codeDisplay = `<span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace px-2 py-1">"" (пусто / без знака)</span>`;
      } else if (grpKey === '\\U+0394') {
        codeDisplay = `<span class="badge bg-primary-subtle text-primary border font-monospace px-2 py-1">\\U+0394 (Дельта Δ)</span>`;
      } else {
        codeDisplay = `<span class="badge bg-primary-subtle text-primary border font-monospace px-2 py-1">"${escapeHtml(grpKey)}"</span>`;
      }

      const sampleMarks = (grpVal && grpVal["Тип"]) 
        ? Object.keys(grpVal["Тип"]).slice(0, 4).map(k => `<span class="badge bg-light text-dark border font-monospace me-1 fs-xs">${escapeHtml(k)}</span>`).join('')
        : '';
      const moreBadge = count > 4 ? `<span class="text-muted fs-xs">+${count - 4}</span>` : '';

      return `
        <tr>
          <td class="ps-3">
            <div class="fw-bold">${codeDisplay}</div>
            <div class="fs-xs text-muted mt-0_5">Чертеж: <code class="text-dark">${grpKey === '' ? '10х2' : `10х2${escapeHtml(grpKey)}`}</code></div>
          </td>
          <td>
            <div class="fw-bold text-dark fs-6">${escapeHtml(brandName)}</div>
            <div class="mt-1">${sampleMarks} ${moreBadge}</div>
          </td>
          <td>
            <span class="badge bg-light text-muted border">${escapeHtml(cat)}</span>
          </td>
          <td class="text-center font-monospace fw-semibold">${count}</td>
          <td class="text-end pe-3 text-nowrap">
            <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2 btn-edit-cable-group" data-group-key="${escapeHtml(grpKey)}" title="Изменить соответствие марки и условного обозначения">
              <i class='bx bx-edit-alt me-0_5'></i>Изменить
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger py-1 px-1_5 btn-delete-cable-group" data-group-key="${escapeHtml(grpKey)}" data-group-name="${escapeHtml(brandName)}" title="Удалить эту группу кабелей">
              <i class='bx bx-trash'></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.deleteRuleItem = deleteRuleItem;
  window.deleteCableItem = deleteCableItem;
  window.deleteCouplingItem = deleteCouplingItem;
  window.deleteEquipmentMethodItem = deleteEquipmentMethodItem;
  window.deleteEquipmentAllItem = deleteEquipmentAllItem;
  window.deleteCableGroupItem = deleteCableGroupItem;
  window.openEditCableGroupModal = openEditCableGroupModal;
  window.renderCableGroupsOverviewModalContent = renderCableGroupsOverviewModalContent;

  // In-modal delete buttons click listeners
  const btnDeleteCurrentRuleInModal = document.getElementById('btnDeleteCurrentRuleInModal');
  if (btnDeleteCurrentRuleInModal) {
    btnDeleteCurrentRuleInModal.addEventListener('click', (e) => {
      e.preventDefault();
      if (addRuleEditContext && addRuleEditContext.originalSection && addRuleEditContext.originalRuleName) {
        deleteRuleItem(addRuleEditContext.originalSection, addRuleEditContext.originalRuleName);
      }
    });
  }

  const btnDeleteCurrentCableInModal = document.getElementById('btnDeleteCurrentCableInModal');
  if (btnDeleteCurrentCableInModal) {
    btnDeleteCurrentCableInModal.addEventListener('click', (e) => {
      e.preventDefault();
      if (addCableEditContext && addCableEditContext.originalMark) {
        deleteCableItem(addCableEditContext.originalGroup, addCableEditContext.originalMark);
      }
    });
  }

  const btnDeleteCurrentCableGroupInModal = document.getElementById('btnDeleteCurrentCableGroupInModal');
  if (btnDeleteCurrentCableGroupInModal) {
    btnDeleteCurrentCableGroupInModal.addEventListener('click', (e) => {
      e.preventDefault();
      if (addCableGroupEditContext && addCableGroupEditContext.originalKey !== undefined) {
        deleteCableGroupItem(addCableGroupEditContext.originalKey);
      }
    });
  }

  const btnDeleteCurrentCouplingInModal = document.getElementById('btnDeleteCurrentCouplingInModal');
  if (btnDeleteCurrentCouplingInModal) {
    btnDeleteCurrentCouplingInModal.addEventListener('click', (e) => {
      e.preventDefault();
      if (addCouplingEditContext && addCouplingEditContext.originalMark) {
        deleteCouplingItem(addCouplingEditContext.originalMark);
      }
    });
  }

  const btnDeleteCurrentEquipMethodInModal = document.getElementById('btnDeleteCurrentEquipMethodInModal');
  if (btnDeleteCurrentEquipMethodInModal) {
    btnDeleteCurrentEquipMethodInModal.addEventListener('click', (e) => {
      e.preventDefault();
      if (addEquipEditContext && addEquipEditContext.originalMark && addEquipEditContext.originalMethod) {
        deleteEquipmentMethodItem(addEquipEditContext.originalMark, addEquipEditContext.originalMethod);
      }
    });
  }

  const btnDeleteCurrentEquipAllInModal = document.getElementById('btnDeleteCurrentEquipAllInModal');
  if (btnDeleteCurrentEquipAllInModal) {
    btnDeleteCurrentEquipAllInModal.addEventListener('click', (e) => {
      e.preventDefault();
      if (addEquipEditContext && addEquipEditContext.originalMark) {
        deleteEquipmentAllItem(addEquipEditContext.originalMark);
      }
    });
  }

  // Cable group toolbar & overview buttons
  const btnOpenCableGroupsManager = document.getElementById('btnOpenCableGroupsManager');
  if (btnOpenCableGroupsManager) {
    btnOpenCableGroupsManager.addEventListener('click', () => {
      renderCableGroupsOverviewModalContent(getDraftRulesFromEditor());
      const modalEl = document.getElementById('manageCableGroupsOverviewModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  const quickAddCableGroupBtn = document.getElementById('quickAddCableGroupBtn');
  if (quickAddCableGroupBtn) {
    quickAddCableGroupBtn.addEventListener('click', () => {
      openEditCableGroupModal(null);
    });
  }

  const btnAddNewCableGroupFromOverview = document.getElementById('btnAddNewCableGroupFromOverview');
  if (btnAddNewCableGroupFromOverview) {
    btnAddNewCableGroupFromOverview.addEventListener('click', () => {
      openEditCableGroupModal(null);
    });
  }

  const btnSaveCableGroup = document.getElementById('btnSaveCableGroup');
  if (btnSaveCableGroup) {
    btnSaveCableGroup.addEventListener('click', () => {
      saveCableGroupModal();
    });
  }

  const cableGroupOverviewSearchInput = document.getElementById('cableGroupOverviewSearchInput');
  if (cableGroupOverviewSearchInput) {
    cableGroupOverviewSearchInput.addEventListener('input', () => {
      renderCableGroupsOverviewModalContent();
    });
  }

  // Quick symbol buttons in editCableGroupModal
  const editCableGroupModalEl = document.getElementById('editCableGroupModal');
  if (editCableGroupModalEl) {
    editCableGroupModalEl.addEventListener('click', (e) => {
      const symBtn = e.target.closest('.btn-group-symbol-choice');
      if (symBtn) {
        e.preventDefault();
        const sym = symBtn.getAttribute('data-symbol') ?? '';
        const keyInput = document.getElementById('editCableGroupKey');
        if (keyInput) {
          keyInput.value = sym;
          keyInput.dispatchEvent(new Event('input', { bubbles: true }));
          keyInput.focus();
        }
      }
    });
  }

  // Quick symbol buttons in addCableModal
  if (addCableModalEl) {
    addCableModalEl.addEventListener('click', (e) => {
      const symBtn = e.target.closest('.btn-cable-modal-symbol');
      if (symBtn) {
        e.preventDefault();
        const sym = symBtn.getAttribute('data-symbol') ?? '';
        const groupKeyInput = document.getElementById('addCableGroupKey');
        if (groupKeyInput) {
          groupKeyInput.value = sym;
          groupKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
          groupKeyInput.dispatchEvent(new Event('change', { bubbles: true }));
          groupKeyInput.focus();
        }
      }
    });
  }

  // Delegated clicks inside manageCableGroupsOverviewModal
  const manageCableGroupsOverviewModalEl = document.getElementById('manageCableGroupsOverviewModal');
  if (manageCableGroupsOverviewModalEl) {
    manageCableGroupsOverviewModalEl.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit-cable-group');
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const grpKey = editBtn.getAttribute('data-group-key') ?? '';
        openEditCableGroupModal(grpKey);
        return;
      }
      const delBtn = e.target.closest('.btn-delete-cable-group');
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        const grpKey = delBtn.getAttribute('data-group-key') ?? '';
        deleteCableGroupItem(grpKey);
        return;
      }
    });
  }

  // Reset modal modes and preserve scroll on child modal close
  const modalResetMap = {
    'addRuleModal': resetRuleModalToAddMode,
    'addCableModal': resetCableModalToAddMode,
    'addCouplingModal': resetCouplingModalToAddMode,
    'addEquipmentModal': resetEquipmentModalToAddMode,
    'editCableGroupModal': resetCableGroupModalToAddMode
  };

  Object.entries(modalResetMap).forEach(([id, resetFn]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('hidden.bs.modal', () => {
        resetFn();
        const parentModal = document.getElementById('worksRulesModal');
        if (parentModal && parentModal.classList.contains('show')) {
          document.body.classList.add('modal-open');
        }
      });
    }
  });
}