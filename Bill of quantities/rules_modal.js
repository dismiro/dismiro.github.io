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

// Initialize rules on page load from external works_rules.json
async function initWorksRules() {
  try {
    const res = await fetch('./works_rules.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        cachedDefaultRules = JSON.parse(JSON.stringify(data));
        currentWorksRules = JSON.parse(JSON.stringify(data));
        modalDraftRules = JSON.parse(JSON.stringify(data));
        renderRulesModalContent(currentWorksRules);
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

// Reset rules in editor draft to standard works_rules.json
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
    modalDraftRules = defaultData;
    setWorksJsonEditorValue(JSON.stringify(defaultData, null, 2));
    validateWorksJsonInput();
    renderRulesModalContent(defaultData);
    showToast('Стандартные нормы загружены в редактор. Нажмите «Применить и пересчитать», чтобы активировать их.', 'info', 'Сброс в редакторе');
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

// Standard top header info bar with match counter and JSON editor tip
function renderCatalogHeaderBar(infoText, hintText = 'Для добавления или корректировки параметров откройте вкладку <strong>«Редактор JSON»</strong>') {
  return `
    <div class="small text-muted mb-2 d-flex justify-content-between align-items-center flex-wrap gap-1">
      <div>${infoText}</div>
      <div class="fs-xs text-muted">
        <i class='bx bx-info-circle me-1'></i>${hintText}
      </div>
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
        ${unit ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border text-nowrap font-monospace">${escapeHtml(unit)}</span>` : ''}
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

// Render rules modal cards, cable catalog, couplings, equipment and settings tabs
function renderRulesModalContent(rulesObj = null, updateAllTabs = true) {
  const container = document.getElementById('rulesListContainer');
  const countBadge = document.getElementById('worksRulesCountBadge');
  const rules = resolveValidRules(rulesObj);
  
  if (updateAllTabs) {
    renderCableCatalogModalContent(rules);
    renderCouplingCatalogModalContent(rules);
    renderEquipmentCatalogModalContent(rules);
    renderSettingsModalContent(rules);
  }

  if (!container) return;

  const sections = getRulesSections(rules);
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

  const query = getModalSearchQuery('rulesCardsSearchInput', 'rulesCardsClearSearchBtn');

  if (sections.length === 0 || totalRulesCount === 0) {
    container.innerHTML = renderCatalogEmptyState('Правила расчета отсутствуют', 'В файле сметных норм нет доступных правил', 'bx-layer-x');
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
            <div class="fw-bold text-dark">В загруженном проекте есть позиции без сметных правил:</div>
            <div class="text-body-secondary mt-1">
              ${parts.join('<br>')}
            </div>
            <div class="text-muted fs-xs mt-1">
              Для формирования недостающих правил воспользуйтесь кнопками <strong>«Добавить способ»</strong>, <strong>«Добавить марку»</strong> или <strong>«Добавить оборудование»</strong> в соответствующих вкладках.
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
              if (tierThreshold !== null) {
                groupTitle = tierIsOver 
                  ? `Категория свыше ${tierThreshold} кг/м (ключ "${escapeHtml(key)}")`
                  : `Категория до ${tierThreshold} кг/м (ключ "${escapeHtml(key)}")`;
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
            <div class="d-flex align-items-center gap-2">
              ${cardBadges.join('')}
              <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1_5 btn-jump-to-json" data-json-target="${escapeHtml(rName)}" title="Перейти к позиции в редакторе JSON">
                <i class='bx bx-code-alt me-0_5'></i>JSON
              </button>
            </div>
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

  if (matchedRulesTotal === 0 && query) {
    container.innerHTML = missingNoticeHtml + renderCatalogEmptyState('Способы не найдены', 'Попробуйте изменить поисковый запрос');
    return;
  }

  container.innerHTML = missingNoticeHtml + html;
}

// Render Cable Catalog Tab Content
function renderCableCatalogModalContent(rulesObj = null) {
  const container = document.getElementById('cableCatalogContainer');
  const tabBadge = document.getElementById('tabWorksCablesCountBadge');
  if (!container) return;

  const rules = resolveValidRules(rulesObj);
  const catalog = getCableCatalog(rules) || {};
  const groups = Object.keys(catalog);

  const query = getModalSearchQuery('cableCatalogSearchInput', 'cableCatalogClearSearchBtn');

  const catFilter = document.getElementById('cableCatalogCategoryFilter');
  const catVal = catFilter ? catFilter.value : 'all';

  let totalMarksCount = 0;
  const renderedGroups = [];

  groups.forEach(groupName => {
    const groupObj = catalog[groupName];
    if (!groupObj || typeof groupObj !== 'object') return;

    const isOptCategory = String(groupObj["Категория"] || groupName || '').trim().toLowerCase() === 'оптический кабель';
    if (catVal === 'optical' && !isOptCategory) return;
    if (catVal === 'special' && !/особ/i.test(groupName)) return;
    if (catVal === 'signaling' && (isOptCategory || /особ/i.test(groupName))) return;

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
    container.innerHTML = renderCatalogEmptyState('По вашему запросу кабели не найдены', 'Попробуйте изменить поисковый запрос или выбрать «Все марки и группы»');
    return;
  }

  let html = '';
  let matchCount = 0;

  renderedGroups.forEach(g => {
    matchCount += g.marks.length;
    const isOptGroup = String(g.category || g.name || '').trim().toLowerCase() === 'оптический кабель';

    const rowsHtml = g.marks.map(m => {
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
    }).join('');

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
            <span class="badge bg-secondary-subtle text-secondary-emphasis border font-monospace fs-xs">${worksList.length} поз.</span>
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
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-primary-subtle text-primary border">${methodEntries.length} способов установки</span>
            ${cardWorksCount > 0 ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border">${cardWorksCount} норм</span>` : ''}
            ${cardSubCount > 0 ? `<span class="badge bg-warning-subtle text-warning-emphasis border">${cardSubCount} мат./обор.</span>` : ''}
            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1_5 btn-jump-to-json" data-json-target="${escapeHtml(mark)}" title="Перейти к позиции в редакторе JSON">
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
        <td class="text-center font-monospace text-muted small pe-3">${escapeHtml(unit)}</td>
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
              <th style="width: 240px;">Обозначение / Марка</th>
              <th>Полное наименование</th>
              <th style="width: 120px;" class="text-center">Макс. жил</th>
              <th style="width: 140px;" class="text-center">Группа установки</th>
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

function highlightAndScrollToJsonNode(targetString, isKey = true) {
  const jsonTabBtn = document.getElementById('tabWorksJsonBtn');
  if (jsonTabBtn && window.bootstrap && bootstrap.Tab) {
    bootstrap.Tab.getOrCreateInstance(jsonTabBtn).show();
  }

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

    let searchStr = isKey ? `"${targetString}":` : `"${targetString}"`;
    let foundIndex = fullText.lastIndexOf(searchStr);
    if (foundIndex === -1) {
      searchStr = targetString;
      foundIndex = fullText.lastIndexOf(searchStr);
    }

    if (foundIndex !== -1) {
      const nameIndex = fullText.indexOf(targetString, foundIndex);
      const actualPos = nameIndex !== -1 ? nameIndex : foundIndex;
      const posFrom = doc.posFromIndex(actualPos);
      const posTo = doc.posFromIndex(actualPos + targetString.length);

      let startLine = posFrom.line;

      if (!isKey && startLine > 0) {
        const prevLine = doc.getLine(startLine - 1).trim();
        if (prevLine === '{') {
          startLine = startLine - 1;
        }
      }

      if (typeof worksJsonCodeMirror.foldCode === 'function') {
        for (let l = Math.max(0, startLine - 15); l <= Math.min(doc.lineCount() - 1, startLine + 50); l++) {
          worksJsonCodeMirror.foldCode({ line: l, ch: 0 }, null, "unfold");
        }
      }

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

      const lineCoords = worksJsonCodeMirror.charCoords(posFrom, "local");
      const editorHeight = worksJsonCodeMirror.getWrapperElement().clientHeight || 420;
      const targetScrollTop = Math.max(0, lineCoords.top - Math.floor(editorHeight / 3));
      worksJsonCodeMirror.scrollTo(null, targetScrollTop);

      doc.setSelection(posFrom, posTo);
      worksJsonCodeMirror.focus();

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
  // ADD RULE MODAL (СТРОИТЕЛЬНЫЕ И МОНТАЖНЫЕ РАБОТЫ)
  // =========================================================================

  function appendAddRuleWorkMaterialRow(tbody, name = '', unit = 'м', formula = 'ДЛИНА', show = false, section = '') {
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="form-control form-control-sm rule-mat-title" placeholder="Наименование материала" value="${escapeHtml(name)}" required></td>
      <td style="width: 14%;"><input type="text" class="form-control form-control-sm rule-mat-unit" value="${escapeHtml(unit)}" placeholder="м/шт" required></td>
      <td style="width: 20%;"><input type="text" class="form-control form-control-sm font-monospace rule-mat-formula" value="${escapeHtml(formula)}" placeholder="ДЛИНА" required></td>
      <td style="width: 18%;"><input type="text" class="form-control form-control-sm rule-mat-section" value="${escapeHtml(section)}" placeholder="По умолч."></td>
      <td style="width: 7%;" class="text-center"><input class="form-check-input rule-mat-show" type="checkbox" ${show ? 'checked' : ''} title="Показывать формулу"></td>
      <td style="width: 6%;" class="text-center"><button type="button" class="btn btn-xs btn-outline-danger py-0 px-1 btn-remove-mat-row" title="Удалить материал"><i class='bx bx-trash'></i></button></td>
    `;
    tbody.appendChild(tr);
  }

  function refreshAddRuleWorkCardBadges() {
    const container = document.getElementById('addRuleWorksCardsContainer');
    if (!container) return;
    const cards = container.querySelectorAll('.rule-work-card');
    cards.forEach((card, idx) => {
      const badge = card.querySelector('.rule-work-badge');
      if (badge) badge.textContent = `Работа #${idx + 1}`;
    });
  }

  function appendAddRuleWorkCard(title = '', unit = 'м', formula = 'ДЛИНА', showFormula = true, materials = [], condition = '', section = '') {
    const container = document.getElementById('addRuleWorksCardsContainer');
    if (!container) return;
    const workIndex = container.children.length + 1;
    const cardId = `ruleWorkCard_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const card = document.createElement('div');
    card.className = 'card border shadow-xs rule-work-card mb-2';
    card.innerHTML = `
      <div class="card-header bg-light py-2 px-3 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-primary-subtle text-primary border font-monospace rule-work-badge">Работа #${workIndex}</span>
          <span class="fw-semibold small text-dark">Параметры сметной нормы</span>
        </div>
        <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2 btn-remove-work-card" title="Удалить работу и её материалы">
          <i class='bx bx-trash me-1'></i>Удалить работу
        </button>
      </div>
      <div class="card-body p-2_5">
        <div class="row g-2 mb-2">
          <div class="col-md-6">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Наименование работы <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm rule-work-title" placeholder="Наименование сметной работы" value="${escapeHtml(title)}" required>
          </div>
          <div class="col-md-2">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Ед. изм.</label>
            <input type="text" class="form-control form-control-sm rule-work-unit" value="${escapeHtml(unit)}" required>
          </div>
          <div class="col-md-2">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Формула (ДЛИНА)</label>
            <input type="text" class="form-control form-control-sm font-monospace rule-work-formula" value="${escapeHtml(formula)}" placeholder="ДЛИНА" required>
          </div>
          <div class="col-md-2 d-flex align-items-end pb-1">
            <div class="form-check small mb-0">
              <input class="form-check-input rule-work-show" type="checkbox" id="chkWorkShow_${cardId}" ${showFormula ? 'checked' : ''}>
              <label class="form-check-label fs-xs" for="chkWorkShow_${cardId}">Показ в ВОР</label>
            </div>
          </div>
        </div>

        <div class="row g-2 mb-2">
          <div class="col-md-6">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Условие применения (опционально)</label>
            <input type="text" class="form-control form-control-sm font-monospace rule-work-condition" placeholder="Например: кабелей > 4" value="${escapeHtml(condition)}">
          </div>
          <div class="col-md-6">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Переопределение раздела ВОР (опционально)</label>
            <input type="text" class="form-control form-control-sm rule-work-section" placeholder="Например: Монтажные работы" value="${escapeHtml(section)}">
          </div>
        </div>

        <div class="p-2 rounded border bg-body-tertiary">
          <div class="d-flex align-items-center justify-content-between mb-1_5">
            <span class="fs-xs fw-semibold text-secondary d-flex align-items-center gap-1">
              <i class='bx bx-package text-success'></i> Материалы для данной работы (вложенные):
            </span>
            <button type="button" class="btn btn-xs btn-outline-success py-0 px-1_5 btn-add-work-material">
              <i class='bx bx-plus me-0_5'></i>Добавить материал
            </button>
          </div>
          <div class="table-responsive bg-body rounded border">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light">
                <tr style="font-size: 0.72rem;">
                  <th style="width: 35%;">Наименование материала</th>
                  <th style="width: 14%;">Ед. изм.</th>
                  <th style="width: 20%;">Формула</th>
                  <th style="width: 18%;">Раздел</th>
                  <th style="width: 7%;" class="text-center" title="Показывать формулу в ВОР">ВОР</th>
                  <th style="width: 6%;" class="text-center"></th>
                </tr>
              </thead>
              <tbody class="rule-work-materials-tbody">
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const matTbody = card.querySelector('.rule-work-materials-tbody');
    if (Array.isArray(materials) && materials.length > 0) {
      materials.forEach(m => {
        appendAddRuleWorkMaterialRow(
          matTbody,
          m["Наименование"] || m.name || '',
          m["Единицы измерения"] || m.unit || 'м',
          m["Формула"] || m.formula || 'ДЛИНА',
          shouldShowFormula(m),
          m["Раздел"] || m.section || ''
        );
      });
    }

    container.appendChild(card);
    refreshAddRuleWorkCardBadges();
  }

  const btnAddRuleWorkRow = document.getElementById('btnAddRuleWorkRow');
  if (btnAddRuleWorkRow) {
    btnAddRuleWorkRow.addEventListener('click', () => {
      appendAddRuleWorkCard('', 'м', 'ДЛИНА', true, []);
    });
  }

  const addRuleWorksCardsContainer = document.getElementById('addRuleWorksCardsContainer');
  if (addRuleWorksCardsContainer) {
    addRuleWorksCardsContainer.addEventListener('click', (e) => {
      const addMatBtn = e.target.closest('.btn-add-work-material');
      if (addMatBtn) {
        const card = addMatBtn.closest('.rule-work-card');
        const matTbody = card ? card.querySelector('.rule-work-materials-tbody') : null;
        if (matTbody) {
          appendAddRuleWorkMaterialRow(matTbody, '', 'шт', 'ДЛИНА', false, '');
        }
        return;
      }

      const removeMatBtn = e.target.closest('.btn-remove-mat-row');
      if (removeMatBtn) {
        const tr = removeMatBtn.closest('tr');
        if (tr) tr.remove();
        return;
      }

      const removeWorkBtn = e.target.closest('.btn-remove-work-card');
      if (removeWorkBtn) {
        const card = removeWorkBtn.closest('.rule-work-card');
        if (card) {
          card.remove();
          refreshAddRuleWorkCardBadges();
          if (addRuleWorksCardsContainer.children.length === 0) {
            appendAddRuleWorkCard('', 'м', 'ДЛИНА', true, []);
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
    } else {
      if (constrContainer) constrContainer.classList.remove('d-none');
      if (instContainer) instContainer.classList.add('d-none');
    }
  };

  if (radioConstruction) radioConstruction.addEventListener('change', updateAddRuleSectionsVisibility);
  if (radioInstallation) radioInstallation.addEventListener('change', updateAddRuleSectionsVisibility);

  const quickAddRuleInTabBtn = document.getElementById('quickAddRuleInTabBtn');
  if (quickAddRuleInTabBtn) {
    quickAddRuleInTabBtn.addEventListener('click', () => {
      const form = document.getElementById('formAddRule');
      if (form) form.reset();
      if (radioConstruction) radioConstruction.checked = true;
      updateAddRuleSectionsVisibility();
      if (addRuleWorksCardsContainer) {
        addRuleWorksCardsContainer.innerHTML = '';
        appendAddRuleWorkCard('Разработка грунта в траншее вручную', 'м3 грунта', '0.4 * ДЛИНА', true, [
          { "Наименование": "Песок для постели", "Единицы измерения": "м3", "Формула": "0.1 * ДЛИНА", "ОтображатьФормулу": false }
        ]);
        appendAddRuleWorkCard('Засыпка траншей вручную', 'м3 грунта', '0.4 * ДЛИНА', true, []);
      }
      const modalEl = document.getElementById('addRuleModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
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

      if (isInstallation) {
        const createDefaultCableMaterial = () => ([
          {
            "Наименование": "{МАРКА_КАБЕЛЯ}",
            "Единицы измерения": "км",
            "Формула": "ДЛИНА/1000",
            "Тип": "материал",
            "ОтображатьФормулу": true
          }
        ]);

        const t1Title = document.getElementById('addRuleInst1Title')?.value?.trim() || `Прокладка кабеля массой 1 м до 1 кг (${wayName})`;
        const t1Unit = document.getElementById('addRuleInst1Unit')?.value?.trim() || 'м';
        const t1Formula = document.getElementById('addRuleInst1Formula')?.value?.trim() || 'ДЛИНА';
        const t1Show = Boolean(document.getElementById('addRuleInst1Show')?.checked);

        const t2Title = document.getElementById('addRuleInst2Title')?.value?.trim() || `Прокладка кабеля массой 1 м до 2 кг (${wayName})`;
        const t2Unit = document.getElementById('addRuleInst2Unit')?.value?.trim() || 'м';
        const t2Formula = document.getElementById('addRuleInst2Formula')?.value?.trim() || 'ДЛИНА';
        const t2Show = Boolean(document.getElementById('addRuleInst2Show')?.checked);

        const t3Title = document.getElementById('addRuleInst3Title')?.value?.trim() || `Прокладка кабеля массой 1 м до 3 кг (${wayName})`;
        const t3Unit = document.getElementById('addRuleInst3Unit')?.value?.trim() || 'м';
        const t3Formula = document.getElementById('addRuleInst3Formula')?.value?.trim() || 'ДЛИНА';
        const t3Show = Boolean(document.getElementById('addRuleInst3Show')?.checked);

        const optTitle = document.getElementById('addRuleInstOptTitle')?.value?.trim() || `Прокладка оптического кабеля (${wayName})`;
        const optUnit = document.getElementById('addRuleInstOptUnit')?.value?.trim() || 'м';
        const optFormula = document.getElementById('addRuleInstOptFormula')?.value?.trim() || 'ДЛИНА';
        const optShow = Boolean(document.getElementById('addRuleInstOptShow')?.checked);

        currentObj[targetSectionKey][wayName] = {
          "Шаблон": `Прокладка кабеля массой 1 м, кг, до: {масса} (${wayName})`,
          "Работы": {
            "1": [
              {
                "Наименование": t1Title,
                "МаксВес": 1,
                "Единицы измерения": t1Unit,
                "Формула": t1Formula,
                "Тип": "работа",
                "ОтображатьФормулу": t1Show,
                "Материалы": createDefaultCableMaterial()
              }
            ],
            "2": [
              {
                "Наименование": t2Title,
                "МаксВес": 2,
                "Единицы измерения": t2Unit,
                "Формула": t2Formula,
                "Тип": "работа",
                "ОтображатьФормулу": t2Show,
                "Материалы": createDefaultCableMaterial()
              }
            ],
            "3": [
              {
                "Наименование": t3Title,
                "МаксВес": 3,
                "Единицы измерения": t3Unit,
                "Формула": t3Formula,
                "Тип": "работа",
                "ОтображатьФормулу": t3Show,
                "Материалы": createDefaultCableMaterial()
              }
            ],
            "оптический": [
              {
                "Наименование": optTitle,
                "Категория": "Оптический кабель",
                "Единицы измерения": optUnit,
                "Формула": optFormula,
                "Тип": "работа",
                "ОтображатьФормулу": optShow,
                "Материалы": createDefaultCableMaterial()
              }
            ]
          }
        };
      } else {
        const cards = document.querySelectorAll('#addRuleWorksCardsContainer .rule-work-card');
        const works = [];
        cards.forEach(card => {
          const title = card.querySelector('.rule-work-title')?.value?.trim();
          const unit = card.querySelector('.rule-work-unit')?.value?.trim() || 'м';
          const formula = card.querySelector('.rule-work-formula')?.value?.trim() || 'ДЛИНА';
          const show = Boolean(card.querySelector('.rule-work-show')?.checked);
          const condition = card.querySelector('.rule-work-condition')?.value?.trim();
          const sectionOverride = card.querySelector('.rule-work-section')?.value?.trim();
          
          if (title) {
            const matRows = card.querySelectorAll('.rule-work-materials-tbody tr');
            const materials = [];
            matRows.forEach(mr => {
              const mTitle = mr.querySelector('.rule-mat-title')?.value?.trim();
              const mUnit = mr.querySelector('.rule-mat-unit')?.value?.trim() || 'шт';
              const mFormula = mr.querySelector('.rule-mat-formula')?.value?.trim() || 'ДЛИНА';
              const mSection = mr.querySelector('.rule-mat-section')?.value?.trim();
              const mShow = Boolean(mr.querySelector('.rule-mat-show')?.checked);
              if (mTitle) {
                const matItem = {
                  "Наименование": mTitle,
                  "Единицы измерения": mUnit,
                  "Формула": mFormula,
                  "Тип": "материал",
                  "ОтображатьФормулу": mShow
                };
                if (mSection) matItem["Раздел"] = mSection;
                materials.push(matItem);
              }
            });

            const workObj = {
              "Наименование": title,
              "Единицы измерения": unit,
              "Формула": formula,
              "Тип": "работа",
              "ОтображатьФормулу": show
            };
            if (condition) workObj["Условие"] = condition;
            if (sectionOverride) workObj["Раздел"] = sectionOverride;
            workObj["Материалы"] = materials;

            works.push(workObj);
          }
        });

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

      showToast(`Способ «${wayName}» успешно добавлен в раздел «${targetSectionKey}». Нажмите «Применить и пересчитать работы» для применения.`, 'success', 'Правило добавлено', 6000);
    });
  }

  const rulesCardsSearchInput = document.getElementById('rulesCardsSearchInput');
  const rulesCardsClearSearchBtn = document.getElementById('rulesCardsClearSearchBtn');
  if (rulesCardsSearchInput) {
    const debouncedRenderRules = debounce(() => renderRulesModalContent(null, false), 180);
    rulesCardsSearchInput.addEventListener('input', debouncedRenderRules);

    if (rulesCardsClearSearchBtn) {
      rulesCardsClearSearchBtn.addEventListener('click', () => {
        debouncedRenderRules.cancel();
        rulesCardsSearchInput.value = '';
        renderRulesModalContent(null, false);
        rulesCardsSearchInput.focus();
      });
    }
  }

  // =========================================================================
  // ADD CABLE MODAL
  // =========================================================================

  const quickAddCableInTabBtn = document.getElementById('quickAddCableInTabBtn');
  if (quickAddCableInTabBtn) {
    const dropdownList = document.getElementById('dropdownCableGroupList');
    if (dropdownList && !dropdownList.dataset.bound) {
      dropdownList.dataset.bound = 'true';
      dropdownList.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-group]');
        if (link) {
          e.preventDefault();
          const grp = link.getAttribute('data-group') ?? '';
          const nm = link.getAttribute('data-name') ?? '';
          const groupKeyInput = document.getElementById('addCableGroupKey');
          const groupNameInput = document.getElementById('addCableGroupName');
          if (groupKeyInput) groupKeyInput.value = grp;
          if (groupNameInput) groupNameInput.value = nm;
        }
      });
    }

    quickAddCableInTabBtn.addEventListener('click', () => {
      const form = document.getElementById('formAddCable');
      if (form) form.reset();

      const draft = getDraftRulesFromEditor();
      const cableCatalog = (draft && draft["Справочник кабелей"]) || (cachedDefaultRules && cachedDefaultRules["Справочник кабелей"]) || {};

      const groupDatalist = document.getElementById('datalistCableGroups');
      if (groupDatalist) {
        groupDatalist.innerHTML = Object.entries(cableCatalog).map(([k, v]) => {
          const gName = (v && v["Название"]) || (k === '' ? 'Основная группа' : k);
          const label = k === '' ? '"" (Основная группа СБВБПу)' : `${k} (${gName})`;
          return `<option value="${escapeHtml(k)}">${escapeHtml(label)}</option>`;
        }).join('');
      }

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

      if (catVal === 'optical') {
        if (groupKeyInput) groupKeyInput.value = 'Оптический кабель';
        if (groupNameInput) groupNameInput.value = 'Оптический кабель';
        if (weightInput) weightInput.value = '0.28';
        if (lenInput) lenInput.value = '2000';
        if (coupInput) coupInput.value = 'МТОК-А1/216-1Т3-44';
      } else {
        if (groupKeyInput) groupKeyInput.value = '*';
        if (groupNameInput) groupNameInput.value = 'СБВБэпПуц';
        if (weightInput) weightInput.value = '0.35';
        if (lenInput) lenInput.value = '1000';
        if (coupInput) coupInput.value = 'МСХз40-9-24х0,9';
      }

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

      if (!currentObj["Справочник кабелей"][groupKey] || typeof currentObj["Справочник кабелей"][groupKey] !== 'object') {
        currentObj["Справочник кабелей"][groupKey] = {
          "Название": groupName,
          ...(isOptical ? { "Категория": "Оптический кабель" } : {}),
          "Тип": {}
        };
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
      renderCableCatalogModalContent(modalDraftRules);

      const modalEl = document.getElementById('addCableModal');
      if (modalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      const displayGroup = groupKey === '' ? 'Основная группа ("")' : `группа "${groupKey}"`;
      showToast(`Марка кабеля «${mark}» успешно добавлена в ${displayGroup}. Нажмите «Применить и пересчитать работы» для применения.`, 'success', 'Марка добавлена', 6000);
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
  // ADD COUPLING MODAL
  // =========================================================================

  const quickAddCouplingInTabBtn = document.getElementById('quickAddCouplingInTabBtn');
  if (quickAddCouplingInTabBtn) {
    quickAddCouplingInTabBtn.addEventListener('click', () => {
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

      showToast(`Муфта «${mark}» успешно добавлена в справочник муфт. Нажмите «Применить и пересчитать работы» для применения.`, 'success', 'Муфта добавлена', 6000);
    });
  }

  // =========================================================================
  // ADD EQUIPMENT MODAL (МНОЖЕСТВЕННЫЕ РАБОТЫ, МАТЕРИАЛЫ И ПРОВЕРКА ДУБЛИКАТОВ)
  // =========================================================================

  function appendAddEquipNestedItemRow(tbody, name = '', type = 'материал', unit = 'шт', formula = 'КОЛИЧЕСТВО', show = true) {
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="form-control form-control-sm equip-item-name" placeholder="Наименование позиции" value="${escapeHtml(name)}" required>
      </td>
      <td style="width: 20%;">
        <select class="form-select form-select-sm equip-item-type">
          <option value="оборудование" ${type === 'оборудование' ? 'selected' : ''}>оборудование</option>
          <option value="материал" ${type === 'материал' ? 'selected' : ''}>материал</option>
        </select>
      </td>
      <td style="width: 14%;">
        <input type="text" class="form-control form-control-sm equip-item-unit" value="${escapeHtml(unit)}" placeholder="шт" required>
      </td>
      <td style="width: 20%;">
        <input type="text" class="form-control form-control-sm font-monospace equip-item-formula" value="${escapeHtml(formula)}" placeholder="КОЛИЧЕСТВО" required>
      </td>
      <td style="width: 8%;" class="text-center">
        <input class="form-check-input equip-item-show" type="checkbox" ${show ? 'checked' : ''} title="Показывать формулу в ВОР">
      </td>
      <td style="width: 6%;" class="text-center">
        <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1 btn-remove-equip-item-row" title="Удалить позицию">
          <i class='bx bx-trash'></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  function refreshAddEquipWorkCardBadges() {
    const container = document.getElementById('addEquipWorksContainer');
    if (!container) return;
    const cards = container.querySelectorAll('.equip-work-card');
    cards.forEach((card, idx) => {
      const badge = card.querySelector('.equip-work-badge');
      if (badge) badge.textContent = `Работа #${idx + 1}`;
    });
  }

  function appendAddEquipWorkCard(title = '', unit = 'шт', formula = 'КОЛИЧЕСТВО', showFormula = false, section = 'Монтажные работы', nestedItems = []) {
    const container = document.getElementById('addEquipWorksContainer');
    if (!container) return;
    const workIndex = container.children.length + 1;
    const cardId = `equipWorkCard_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const card = document.createElement('div');
    card.className = 'card border shadow-xs equip-work-card mb-2';
    card.innerHTML = `
      <div class="card-header bg-light py-2 px-3 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-primary-subtle text-primary border font-monospace equip-work-badge">Работа #${workIndex}</span>
          <span class="fw-semibold small text-dark">Параметры сметной нормы</span>
        </div>
        <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2 btn-remove-equip-work-card" title="Удалить работу и её позиции">
          <i class='bx bx-trash me-1'></i>Удалить работу
        </button>
      </div>
      <div class="card-body p-2_5">
        <div class="row g-2 mb-2">
          <div class="col-md-5">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Наименование работы <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm equip-work-title" placeholder="Наименование сметной работы" value="${escapeHtml(title)}" required>
          </div>
          <div class="col-md-2">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Ед. изм.</label>
            <input type="text" class="form-control form-control-sm equip-work-unit" value="${escapeHtml(unit)}" required>
          </div>
          <div class="col-md-2">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Формула</label>
            <input type="text" class="form-control form-control-sm font-monospace equip-work-formula" value="${escapeHtml(formula)}" placeholder="КОЛИЧЕСТВО" required>
          </div>
          <div class="col-md-3">
            <label class="form-label fs-xs fw-semibold mb-0 text-muted">Раздел сметы</label>
            <select class="form-select form-select-sm equip-work-section">
              <option value="Монтажные работы" ${section === 'Монтажные работы' ? 'selected' : ''}>Монтажные работы</option>
              <option value="Строительные работы" ${section === 'Строительные работы' ? 'selected' : ''}>Строительные работы</option>
            </select>
          </div>
        </div>
        <div class="form-check small mb-2">
          <input class="form-check-input equip-work-show" type="checkbox" id="chkEquipWorkShow_${cardId}" ${showFormula ? 'checked' : ''}>
          <label class="form-check-label fs-xs" for="chkEquipWorkShow_${cardId}">Отображать формулу работы в ведомости (ВОР)</label>
        </div>

        <div class="p-2 rounded border bg-body-tertiary">
          <div class="d-flex align-items-center justify-content-between mb-1_5">
            <span class="fs-xs fw-semibold text-secondary d-flex align-items-center gap-1">
              <i class='bx bx-package text-success'></i> Вложенные позиции работы (ключ «Материалы»):
            </span>
            <button type="button" class="btn btn-xs btn-outline-success py-0 px-1_5 btn-add-equip-nested-item">
              <i class='bx bx-plus me-0_5'></i>Добавить позицию
            </button>
          </div>
          <div class="table-responsive bg-body rounded border">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light" style="font-size: 0.72rem;">
                <tr>
                  <th style="width: 32%;">Наименование позиции</th>
                  <th style="width: 20%;">Тип позиции</th>
                  <th style="width: 14%;">Ед. изм.</th>
                  <th style="width: 20%;">Формула</th>
                  <th style="width: 8%;" class="text-center" title="Показывать формулу">ВОР</th>
                  <th style="width: 6%;" class="text-center"></th>
                </tr>
              </thead>
              <tbody class="equip-work-nested-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const tbody = card.querySelector('.equip-work-nested-tbody');
    if (Array.isArray(nestedItems) && nestedItems.length > 0) {
      nestedItems.forEach(item => {
        appendAddEquipNestedItemRow(
          tbody,
          item["Наименование"] || item.name || '',
          item["Тип"] || item.type || 'материал',
          item["Единицы измерения"] || item.unit || 'шт',
          item["Формула"] || item.formula || 'КОЛИЧЕСТВО',
          item["ОтображатьФормулу"] !== undefined ? Boolean(item["ОтображатьФормулу"]) : true
        );
      });
    }

    container.appendChild(card);
    refreshAddEquipWorkCardBadges();
  }

  // Проверка дубликата способа установки для активной марки
  function checkEquipMethodExists() {
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
      const addNestedBtn = e.target.closest('.btn-add-equip-nested-item');
      if (addNestedBtn) {
        const card = addNestedBtn.closest('.equip-work-card');
        const tbody = card ? card.querySelector('.equip-work-nested-tbody') : null;
        if (tbody) {
          appendAddEquipNestedItemRow(tbody, '', 'материал', 'шт', 'КОЛИЧЕСТВО', true);
        }
        return;
      }

      const removeRowBtn = e.target.closest('.btn-remove-equip-item-row');
      if (removeRowBtn) {
        const tr = removeRowBtn.closest('tr');
        if (tr) tr.remove();
        return;
      }

      const removeWorkBtn = e.target.closest('.btn-remove-equip-work-card');
      if (removeWorkBtn) {
        const card = removeWorkBtn.closest('.equip-work-card');
        if (card) {
          card.remove();
          refreshAddEquipWorkCardBadges();
          if (addEquipWorksContainer.children.length === 0) {
            appendAddEquipWorkCard('Монтаж оборудования', 'шт', 'КОЛИЧЕСТВО', false, 'Монтажные работы', []);
          }
        }
        return;
      }
    });

    addEquipWorksContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('equip-work-title') || e.target.classList.contains('equip-item-name')) {
        e.target.dataset.autoFilled = 'false';
      }
    });
  }

  const btnAddEquipWorkCard = document.getElementById('btnAddEquipWorkCard');
  if (btnAddEquipWorkCard) {
    btnAddEquipWorkCard.addEventListener('click', () => {
      appendAddEquipWorkCard('', 'шт', 'КОЛИЧЕСТВО', false, 'Монтажные работы', []);
    });
  }

  const addEquipMarkInput = document.getElementById('addEquipMark');
  if (addEquipMarkInput) {
    addEquipMarkInput.addEventListener('input', () => {
      const mark = addEquipMarkInput.value.trim();
      const firstWorkTitle = document.querySelector('#addEquipWorksContainer .equip-work-card:first-child .equip-work-title');
      if (firstWorkTitle && (!firstWorkTitle.value.trim() || firstWorkTitle.dataset.autoFilled === 'true')) {
        firstWorkTitle.value = mark ? `Монтаж оборудования типа ${mark}` : '';
        firstWorkTitle.dataset.autoFilled = 'true';
      }
      const firstItemName = document.querySelector('#addEquipWorksContainer .equip-work-card:first-child .equip-item-name');
      const firstItemType = document.querySelector('#addEquipWorksContainer .equip-work-card:first-child .equip-item-type');
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
        appendAddEquipWorkCard('', 'шт', 'КОЛИЧЕСТВО', false, 'Монтажные работы', [
          { "Наименование": "", "Тип": "оборудование", "Единицы измерения": "шт", "Формула": "КОЛИЧЕСТВО", "ОтображатьФормулу": true },
          { "Наименование": "", "Тип": "материал", "Единицы измерения": "шт", "Формула": "КОЛИЧЕСТВО", "ОтображатьФормулу": true }
        ]);
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

      const workCards = document.querySelectorAll('#addEquipWorksContainer .equip-work-card');
      const parsedWorks = [];

      workCards.forEach(card => {
        const title = card.querySelector('.equip-work-title')?.value?.trim();
        const unit = card.querySelector('.equip-work-unit')?.value?.trim() || 'шт';
        const formula = card.querySelector('.equip-work-formula')?.value?.trim() || 'КОЛИЧЕСТВО';
        const show = Boolean(card.querySelector('.equip-work-show')?.checked);
        const section = card.querySelector('.equip-work-section')?.value || 'Монтажные работы';

        if (!title) return;

        const nestedItems = [];
        const itemRows = card.querySelectorAll('.equip-work-nested-tbody tr');
        itemRows.forEach(r => {
          const mName = r.querySelector('.equip-item-name')?.value?.trim();
          const mType = r.querySelector('.equip-item-type')?.value?.trim() || 'материал';
          const mUnit = r.querySelector('.equip-item-unit')?.value?.trim() || 'шт';
          const mFormula = r.querySelector('.equip-item-formula')?.value?.trim() || 'КОЛИЧЕСТВО';
          const mShow = Boolean(r.querySelector('.equip-item-show')?.checked);
          if (mName) {
            nestedItems.push({
              "Наименование": mName,
              "Единицы измерения": mUnit,
              "Формула": mFormula,
              "Тип": mType,
              "ОтображатьФормулу": mShow,
              "Раздел": section
            });
          }
        });

        parsedWorks.push({
          "Наименование": title,
          "Единицы измерения": unit,
          "Формула": formula,
          "Тип": "работа",
          "ОтображатьФормулу": show,
          "Раздел": section,
          "Материалы": nestedItems
        });
      });

      if (parsedWorks.length === 0) {
        showToast('Добавьте хотя бы одну работу с наименованием', 'warning', 'Проверка данных');
        return;
      }

      const currentObj = JSON.parse(JSON.stringify(getDraftRulesFromEditor() || cachedDefaultRules || {}));
      if (!currentObj["Оборудование"] || typeof currentObj["Оборудование"] !== 'object' || Array.isArray(currentObj["Оборудование"])) {
        currentObj["Оборудование"] = {};
      }
      if (!currentObj["Оборудование"][mark] || typeof currentObj["Оборудование"][mark] !== 'object') {
        currentObj["Оборудование"][mark] = { "Работы": {} };
      }
      if (!currentObj["Оборудование"][mark]["Работы"] || typeof currentObj["Оборудование"][mark]["Работы"] !== 'object') {
        currentObj["Оборудование"][mark]["Работы"] = {};
      }

      if (mergeStrategy === 'append' && Array.isArray(currentObj["Оборудование"][mark]["Работы"][method])) {
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

      showToast(`Оборудование «${mark}» [${method}]: успешно добавлено ${parsedWorks.length} работ. Нажмите «Применить и пересчитать работы» для применения.`, 'success', 'Оборудование добавлено', 6000);
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

        renderRulesModalContent(currentWorksRules);

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

  // Переход к узлу JSON
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-jump-to-json');
    if (btn) {
      const target = btn.getAttribute('data-json-target');
      if (target) {
        highlightAndScrollToJsonNode(target, true);
      }
    }
  });

  // Сохранение скролла в основном окне при закрытии дочерних модалок
  ['addRuleModal', 'addCableModal', 'addCouplingModal', 'addEquipmentModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('hidden.bs.modal', () => {
        const parentModal = document.getElementById('worksRulesModal');
        if (parentModal && parentModal.classList.contains('show')) {
          document.body.classList.add('modal-open');
        }
      });
    }
  });
}