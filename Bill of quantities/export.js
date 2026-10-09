/**
 * Bill of quantities - Export Manager
 * Handles exporting calculation results to XML GGE (.gge for Главгосэкспертиза)
 * and Excel (.xlsx), export warnings modal validation, and file generation.
 */

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
    formulaErrors: [ ...(trenchCalc.formulaErrors || []), ...(cableCalc.formulaErrors || []), ...(equipmentCalc.formulaErrors || []) ],
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

// Collect all warnings and unannounced rules / items across all sections, including formula errors
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

  // Collect formula errors from calculation and from window.lastFormulaErrors, deduplicating them
  const rawFormulaErrors = [
    ...(calcData.formulaErrors || []),
    ...(window.lastFormulaErrors || [])
  ];
  const formulaErrors = [];
  const seenErrors = new Set();
  rawFormulaErrors.forEach(err => {
    if (!err) return;
    const key = `${err.section || ''}|${err.ruleName || ''}|${err.name || ''}|${err.formula || ''}|${err.reason || ''}`;
    if (!seenErrors.has(key)) {
      seenErrors.add(key);
      formulaErrors.push(err);
    }
  });

  const totalCount = trenchMissing.length + cableMissing.length + equipmentMissing.length + cableMissingInCatalog.length + couplingsMissing.length + formulaErrors.length;

  return {
    hasWarnings: totalCount > 0,
    totalCount,
    worksCount: (calcData.works || []).length,
    formulaErrors,
    trenchMissing,
    cableMissing,
    equipmentMissing,
    cableMissingInCatalog,
    couplingsMissing,
    calcData
  };
}

// Show modal window with all accumulated notices before GGE / VOR formation
function showGgeExportWarningsModal(warningsInfo, onProceed) {
  const modalEl = document.getElementById('ggeExportWarningsModal');
  const bodyEl = document.getElementById('ggeExportWarningsModalBody');
  const confirmBtn = document.getElementById('confirmProceedGgeDownloadBtn');
  const openRulesBtn = document.getElementById('openRulesFromGgeModalBtn');

  if (!modalEl || !bodyEl) {
    if (typeof onProceed === 'function') onProceed();
    return;
  }

  const {
    totalCount,
    worksCount,
    formulaErrors = [],
    trenchMissing = [],
    cableMissing = [],
    equipmentMissing = [],
    cableMissingInCatalog = [],
    couplingsMissing = []
  } = warningsInfo;

  const hasFormulaErrors = formulaErrors.length > 0;

  // Update modal header subtitle and icon depending on error severity
  const labelEl = document.getElementById('ggeExportWarningsModalLabel');
  const subEl = document.getElementById('ggeExportWarningsModalSub');
  const headerIcon = modalEl.querySelector('.modal-header i');

  if (hasFormulaErrors) {
    if (labelEl) labelEl.textContent = 'Замечания перед экспортом ВОР';
    if (subEl) subEl.textContent = `Обнаружено замечаний: ${totalCount}, включая ошибки формул: ${formulaErrors.length}`;
    if (headerIcon) {
      headerIcon.className = 'bx bx-error-circle text-primary fs-4';
    }
  } else {
    if (labelEl) labelEl.textContent = 'Замечания перед экспортом ВОР';
    if (subEl) subEl.textContent = 'Сводная информация о недостающих правилах и сметных нормах';
    if (headerIcon) {
      headerIcon.className = 'bx bx-error-circle text-primary fs-4';
    }
  }

  let bodyHtml = `
    <div class="alert alert-warning border border-warning-subtle d-flex align-items-start gap-2 mb-3 py-2 px-3">
      <i class='bx bx-error-circle text-warning fs-4 flex-shrink-0 mt-0_5'></i>
      <div class="small">
        <div class="fw-bold mb-0_5 text-dark">
          Обнаружено замечаний: ${totalCount} (ВОР содержит ${worksCount} сметных позиций)${hasFormulaErrors ? `, включая ошибки формул: ${formulaErrors.length}` : ''}
        </div>
        <div class="text-body">
          ${hasFormulaErrors ? '<strong>Внимание!</strong> Из-за некорректных формул часть работ или материалов не была рассчитана и не попала в итоговую ведомость. ' : ''}Ниже сгруппированы все проблемные места, ошибки в формулах, не объявленные работы и отсутствующие записи в справочниках. Вы можете исправить правила в JSON редакторе или продолжить формирование файла.
        </div>
      </div>
    </div>
  `;

  // 0. Formula errors section
  if (hasFormulaErrors) {
    let feRows = '';
    formulaErrors.forEach((fe, idx) => {
      const sectionBadge = fe.section
        ? `<span class="badge bg-light text-dark border border-secondary-subtle fw-semibold me-1" style="font-size: 0.72rem;">${escapeHtml(fe.section)}</span>`
        : '';
      const ruleText = fe.ruleName ? `<span class="text-body-secondary small font-monospace">(${escapeHtml(fe.ruleName)})</span>` : '';
      const typeBadge = fe.type === 'материал'
        ? `<span class="badge bg-warning-subtle text-dark border border-warning-subtle fw-semibold ms-1" style="font-size: 0.68rem;">материал</span>`
        : '';

      feRows += `
        <tr>
          <td class="text-center text-dark small fw-medium">${idx + 1}</td>
          <td class="cell-wrap">
            <div class="fw-bold text-dark">${escapeHtml(fe.name || 'Без названия')}${typeBadge}</div>
            <div class="d-flex align-items-center gap-1 mt-0_5 flex-wrap">
              ${sectionBadge}
              ${ruleText}
            </div>
          </td>
          <td class="cell-wrap font-monospace small" style="min-width: 140px;">
            <code class="text-dark bg-light px-1 py-0_5 rounded border">${escapeHtml(fe.formula || '')}</code>
          </td>
          <td class="cell-wrap text-dark small fw-medium">${escapeHtml(fe.reason || 'Ошибка вычисления')}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <div class="card mb-3 border-warning-subtle shadow-none">
        <div class="card-header py-2 px-3 bg-body-tertiary d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark"><i class='bx bx-error me-1'></i>Ошибки формул</span>
            <span class="fw-semibold small">Некорректная формула (${formulaErrors.length} поз.)</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-warning text-dark fw-semibold d-inline-flex align-items-center gap-1" id="btnEditFormulasFromModal">
            <i class='bx bx-edit'></i> Исправить в JSON правил
          </button>
        </div>
        <div class="table-responsive" style="max-height: 220px;">
          <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.82rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 35px;" class="text-center">№</th>
                <th>Наименование работы / раздел</th>
                <th style="width: 150px;">Формула</th>
                <th>Причина ошибки</th>
              </tr>
            </thead>
            <tbody>${feRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

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
          <td class="text-center text-dark small fw-medium">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(cb.type || 'Способ')}</td>
          <td class="text-end font-monospace fw-semibold text-dark">${lenStr}</td>
          <td class="cell-wrap text-dark small fw-medium">${reason}</td>
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
          <td class="text-center text-dark small fw-medium">${idx + 1}</td>
          <td class="fw-bold text-dark cell-wrap">${escapeHtml(typeStr)}</td>
          <td class="cell-wrap text-dark small fw-medium">${escapeHtml(reason)}</td>
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
  const btnFe = bodyEl.querySelector('#btnEditFormulasFromModal');
  if (btnFe) {
    btnFe.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      openWorksRulesModal('editor');
    });
  }

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
function exportVorExcel(skipWarningsCheck = false) {
  if (typeof XLSX === 'undefined') {
    showToast('Библиотека XLSX недоступна', 'error', 'Ошибка');
    return;
  }
  const calcData = getAllCalculatedWorks();
  const { works } = calcData;
  if (!works || works.length === 0) {
    showToast('Не найдено работ для экспорта в ВОР', 'error', 'Ошибка');
    return;
  }

  const doExcelExport = () => {
    const settings = getRulesSettings(currentWorksRules);
    const mode = settings.numberingMode === 'сквозная' ? 'sequential' : 'hierarchical';
    const wb = generateVorWorkbook(works, currentFileName, mode);
    const outBaseName = currentFileName
      ? currentFileName.replace(/\.[^/.]+$/, '')
      : 'Ведомость_объемов_работ';
    XLSX.writeFile(wb, `ВОР_${outBaseName}.xlsx`);
    showToast(`Ведомость объемов работ успешно экспортирована в Excel (.xlsx) (${works.length} поз.)`, 'success', 'Экспорт Excel');
  };

  const warnings = collectAllGgeWarnings(calcData);

  if (!skipWarningsCheck && warnings.hasWarnings) {
    showGgeExportWarningsModal(warnings, doExcelExport);
  } else {
    doExcelExport();
  }
}

// Setup event listeners for export buttons
function setupExportListeners() {
  const exportResultBtn = document.getElementById('exportResult');
  if (exportResultBtn && !exportResultBtn.dataset.boundExport) {
    exportResultBtn.dataset.boundExport = 'true';
    exportResultBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCalculationResults();
    });
  }

  const exportVorExcelBtn = document.getElementById('exportVorExcel');
  if (exportVorExcelBtn && !exportVorExcelBtn.dataset.boundExport) {
    exportVorExcelBtn.dataset.boundExport = 'true';
    exportVorExcelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportVorExcel();
    });
  }

  const exportVorBtn = document.getElementById('exportVorBtn');
  if (exportVorBtn && !exportVorBtn.dataset.boundExport) {
    exportVorBtn.dataset.boundExport = 'true';
    exportVorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCalculationResults();
    });
  }

  const exportVorExcelQuickBtn = document.getElementById('exportVorExcelQuickBtn');
  if (exportVorExcelQuickBtn && !exportVorExcelQuickBtn.dataset.boundExport) {
    exportVorExcelQuickBtn.dataset.boundExport = 'true';
    exportVorExcelQuickBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportVorExcel();
    });
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupExportListeners);
} else {
  setupExportListeners();
}
