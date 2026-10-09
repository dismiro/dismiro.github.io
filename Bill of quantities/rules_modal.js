/**
 * Bill of quantities - Works Rules & Catalogs Modal Manager
 * Handles rules modal UI, tabs (Rules, Cables, Couplings, Equipment, Settings),
 * CodeMirror JSON editor integration, validation and quick-add actions.
 */

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

// --------------------------------------------------------------------------
// UNIFIED CATALOG MODAL RENDERING HELPERS
// --------------------------------------------------------------------------

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
        ${formulaDispBadge}
        ${section ? `<span class="badge bg-light text-secondary border ms-1" style="font-size: 0.68rem;">Раздел: ${escapeHtml(section)}</span>` : ''}
        <span class="badge ${typeBadgeClass} ms-auto"><i class='bx ${typeIcon} me-0_5'></i>${escapeHtml(typeTitle)}</span>
      </div>
      ${workComment ? `<div class="text-muted fs-xs mt-1 fst-italic"><i class='bx bx-comment-detail me-0_5'></i>${escapeHtml(workComment)}</div>` : ''}
    </div>
  `;
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
      const rawWm = rule["Работы и материалы"] !== undefined 
        ? rule["Работы и материалы"] 
        : (rule["Работы"] !== undefined ? rule["Работы"] : rule.works);
      const works = getRuleWorks(rule);
      const isObjectStructure = rawWm && typeof rawWm === 'object' && !Array.isArray(rawWm);

      let worksHtml = '';
      let ruleWorksCount = 0;
      let ruleSubCount = 0;

      // Render a work item along with any nested materials / equipment, with indent and '↳' prefix
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
              <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1_5" onclick="highlightAndScrollToJsonNode('${escapeHtml(rName)}', true)" title="Перейти к позиции в редакторе JSON">
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
  const query = getModalSearchQuery('cableCatalogSearchInput', 'cableCatalogClearSearchBtn');

  // Category filter
  const catFilter = document.getElementById('cableCatalogCategoryFilter');
  const catVal = catFilter ? catFilter.value : 'all';

  let totalMarksCount = 0;
  const renderedGroups = [];

  groups.forEach(groupName => {
    const groupObj = catalog[groupName];
    if (!groupObj || typeof groupObj !== 'object') return;

    const isOptCategory = String(groupObj["Категория"] || groupName || '').trim().toLowerCase() === 'оптический кабель';
    // Filter by group category dropdown
    if (catVal === 'optical' && !isOptCategory) {
      return;
    }
    if (catVal === 'special' && !/особ/i.test(groupName)) {
      return;
    }
    if (catVal === 'signaling' && (isOptCategory || /особ/i.test(groupName))) {
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
  }).join('');

  container.innerHTML = `
    ${renderCatalogHeaderBar(`Показано: <strong>${filtered.length}</strong> из ${totalEquipmentCount} позиций оборудования (${totalMethodsAcrossAll} способов установки, ${totalWorksAcrossAll} норм, ${totalSubItemsAcrossAll} вложенных мат./обор. в JSON)`)}
    ${cardsHtml}
  `;
}

// --------------------------------------------------------------------------
// SETTINGS (НАСТРОЙКИ) TAB & RULES SPECIFICATION
// --------------------------------------------------------------------------

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
      'Попробуйте изменить поисковый запрос или добавьте новую муфту через кнопку «Добавить шаблон муфты»'
    );
    return;
  }

  const rowsHtml = filtered.map(([mark, data], idx) => {
    const fullName = (data && data["Полное наименование"]) || mark;
    const maxCores = (data && data["МаксЖил"]) !== undefined ? data["МаксЖил"] : parseMaxCoresFromString(mark);
    const unit = (data && data["Единицы измерения"]) || 'шт';
    const tier = getCouplingInstallationTier(maxCores);

    return `
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
    const isOpt = Boolean(m && typeof m === 'object' && m.isOptical);
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

