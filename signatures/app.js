(function () {
  'use strict';

  const Parser = window.SignatureReportParser;
  if (!Parser) return;

  const STORAGE_KEYS = {
    DIRECTORY: 'ep_saved_surnames_v1',
    EXPECTED: 'ep_expected_signers_v1',
    MAPPING: 'ep_column_mapping_v1'
  };

  const state = {
    directory: [], // string[]
    expected: [],  // Array<{ id: string, query: string }>
    directoryFilter: '',
    workbook: null,
    sheetNames: [],
    activeSheetName: '',
    rawRows: [],
    formattedRows: [],
    fileName: '',
    isSample: false,
    parseResult: null,
    packageReconciliation: null,
    reconciliation: null,
    selectedDocIndex: 0,
    docFilter: 'all',
    customMapping: null,
    showMappingBar: false,
    activeFilter: 'all',
    searchQuery: '',
    expandedRows: new Set()
  };

  const els = {
    reportFileInput: document.getElementById('reportFileInput'),
    btnLoadSample: document.getElementById('btnLoadSample'),
    btnDropzoneSample: document.getElementById('btnDropzoneSample'),
    dropZoneEmpty: document.getElementById('dropZoneEmpty'),
    activeReportBar: document.getElementById('activeReportBar'),
    activeReportFileName: document.getElementById('activeReportFileName'),
    activeReportModeInfo: document.getElementById('activeReportModeInfo'),
    sheetSelect: document.getElementById('sheetSelect'),
    btnToggleColumnMapping: document.getElementById('btnToggleColumnMapping'),
    btnSaveAllFromReport: document.getElementById('btnSaveAllFromReport'),
    btnCloseReport: document.getElementById('btnCloseReport'),
    docMetaSection: document.getElementById('docMetaSection'),
    docMetaGrid: document.getElementById('docMetaGrid'),
    columnMappingBar: document.getElementById('columnMappingBar'),
    mapNameCol: document.getElementById('mapNameCol'),
    mapValidToCol: document.getElementById('mapValidToCol'),
    mapSignedAtCol: document.getElementById('mapSignedAtCol'),
    mapFileCol: document.getElementById('mapFileCol'),
    reportErrorAlert: document.getElementById('reportErrorAlert'),

    addSurnameForm: document.getElementById('addSurnameForm'),
    newSurnameInput: document.getElementById('newSurnameInput'),
    btnToggleBulkPanel: document.getElementById('btnToggleBulkPanel'),
    btnSelectAllFromDir: document.getElementById('btnSelectAllFromDir'),
    btnClearDirectoryPrompt: document.getElementById('btnClearDirectoryPrompt'),
    clearDirConfirmBox: document.getElementById('clearDirConfirmBox'),
    btnConfirmClearDir: document.getElementById('btnConfirmClearDir'),
    btnCancelClearDir: document.getElementById('btnCancelClearDir'),
    bulkAddPanel: document.getElementById('bulkAddPanel'),
    bulkSurnamesTextarea: document.getElementById('bulkSurnamesTextarea'),
    btnCancelBulk: document.getElementById('btnCancelBulk'),
    btnSaveBulk: document.getElementById('btnSaveBulk'),
    directorySearchWrap: document.getElementById('directorySearchWrap'),
    directorySearchInput: document.getElementById('directorySearchInput'),
    surnameDirectoryContainer: document.getElementById('surnameDirectoryContainer'),
    directoryCountText: document.getElementById('directoryCountText'),

    expectedCountText: document.getElementById('expectedCountText'),
    btnClearExpected: document.getElementById('btnClearExpected'),
    expectedSignersContainer: document.getElementById('expectedSignersContainer'),

    kpiSection: document.getElementById('kpiSection'),
    kpiLabel1: document.getElementById('kpiLabel1'),
    kpiLabel2: document.getElementById('kpiLabel2'),
    kpiLabel3: document.getElementById('kpiLabel3'),
    kpiLabel4: document.getElementById('kpiLabel4'),
    kpiLabel5: document.getElementById('kpiLabel5'),
    kpiTotalInReport: document.getElementById('kpiTotalInReport'),
    kpiTotalExpected: document.getElementById('kpiTotalExpected'),
    kpiMatched: document.getElementById('kpiMatched'),
    kpiMissing: document.getElementById('kpiMissing'),
    kpiExtraOrCert: document.getElementById('kpiExtraOrCert'),

    documentsPackagePanel: document.getElementById('documentsPackagePanel'),
    packageDocsCountText: document.getElementById('packageDocsCountText'),
    packageDocsTableBody: document.getElementById('packageDocsTableBody'),

    resultsPanel: document.getElementById('resultsPanel'),
    activeDocBanner: document.getElementById('activeDocBanner'),
    activeDocSub: document.getElementById('activeDocSub'),
    activeDocTitle: document.getElementById('activeDocTitle'),
    btnPrevDoc: document.getElementById('btnPrevDoc'),
    btnNextDoc: document.getElementById('btnNextDoc'),
    resultsSearchInput: document.getElementById('resultsSearchInput'),
    btnCopySummary: document.getElementById('btnCopySummary'),
    emptyExpectedHint: document.getElementById('emptyExpectedHint'),
    resultsTableBody: document.getElementById('resultsTableBody'),

    epToast: document.getElementById('epToast'),
    epToastIcon: document.getElementById('epToastIcon'),
    epToastTitle: document.getElementById('epToastTitle'),
    epToastBody: document.getElementById('epToastBody')
  };

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, variant = 'info', title = 'Уведомление') {
    if (!els.epToast || !window.bootstrap || !bootstrap.Toast) return;
    const iconMap = {
      success: 'bx bx-check-circle fs-5 me-2 text-success',
      warning: 'bx bx-error fs-5 me-2 text-warning',
      danger: 'bx bx-x-circle fs-5 me-2 text-danger',
      info: 'bx bx-info-circle fs-5 me-2 text-primary'
    };
    if (els.epToastIcon) els.epToastIcon.className = iconMap[variant] || iconMap.info;
    if (els.epToastTitle) els.epToastTitle.textContent = title;
    if (els.epToastBody) els.epToastBody.textContent = message;
    bootstrap.Toast.getOrCreateInstance(els.epToast, { delay: 3200 }).show();
  }

  function loadPersistedState() {
    try {
      const rawDir = localStorage.getItem(STORAGE_KEYS.DIRECTORY);
      if (rawDir) {
        const parsed = JSON.parse(rawDir);
        if (Array.isArray(parsed)) {
          state.directory = parsed.map(Parser.cleanValue).filter(Boolean);
        }
      }
    } catch (e) {
      state.directory = [];
    }

    try {
      const rawExp = localStorage.getItem(STORAGE_KEYS.EXPECTED);
      if (rawExp) {
        const parsed = JSON.parse(rawExp);
        if (Array.isArray(parsed)) {
          state.expected = parsed
            .map((item, idx) => {
              if (typeof item === 'string') {
                return { id: `exp_${idx}_${Date.now()}`, query: Parser.cleanValue(item) };
              }
              if (item && item.query) {
                return { id: String(item.id || `exp_${idx}_${Date.now()}`), query: Parser.cleanValue(item.query) };
              }
              return null;
            })
            .filter((item) => item && item.query);
        }
      }
    } catch (e) {
      state.expected = [];
    }

    try {
      const rawMap = localStorage.getItem(STORAGE_KEYS.MAPPING);
      if (rawMap) {
        state.customMapping = JSON.parse(rawMap);
      }
    } catch (e) {
      state.customMapping = null;
    }
  }

  function saveDirectory() {
    try {
      localStorage.setItem(STORAGE_KEYS.DIRECTORY, JSON.stringify(state.directory));
    } catch (e) {}
  }

  function saveExpected() {
    try {
      localStorage.setItem(STORAGE_KEYS.EXPECTED, JSON.stringify(state.expected));
    } catch (e) {}
  }

  function saveMapping() {
    try {
      if (state.customMapping) {
        localStorage.setItem(STORAGE_KEYS.MAPPING, JSON.stringify(state.customMapping));
      } else {
        localStorage.removeItem(STORAGE_KEYS.MAPPING);
      }
    } catch (e) {}
  }

  function isInExpected(name) {
    const norm = Parser.normalizeText(name);
    return state.expected.some((item) => Parser.normalizeText(item.query) === norm);
  }

  function isInDirectory(name) {
    const norm = Parser.normalizeText(name);
    return state.directory.some((item) => Parser.normalizeText(item) === norm);
  }

  function addSurnamesToDirectory(names, silent = false) {
    const incoming = Array.isArray(names) ? names : [names];
    let added = 0;

    incoming.forEach((raw) => {
      const cleaned = Parser.cleanValue(raw);
      if (!cleaned) return;
      if (!isInDirectory(cleaned)) {
        state.directory.push(cleaned);
        added++;
      }
    });

    if (added > 0) {
      state.directory.sort((a, b) => a.localeCompare(b, 'ru'));
      saveDirectory();
      renderDirectory();
      recalculateAndRenderResults();
      if (!silent) {
        showToast(`Добавлено в справочник: ${added}`, 'success', 'Справочник обновлен');
      }
    } else if (!silent && incoming.length === 1 && Parser.cleanValue(incoming[0])) {
      showToast('Эта фамилия уже есть в справочнике.', 'info', 'Без изменений');
    }
    return added;
  }

  function removeSurnameFromDirectory(name) {
    const norm = Parser.normalizeText(name);
    state.directory = state.directory.filter((item) => Parser.normalizeText(item) !== norm);
    saveDirectory();
    renderDirectory();
  }

  function toggleExpectedSigner(name) {
    const cleaned = Parser.cleanValue(name);
    if (!cleaned) return;
    const norm = Parser.normalizeText(cleaned);
    const existingIdx = state.expected.findIndex((item) => Parser.normalizeText(item.query) === norm);

    if (existingIdx >= 0) {
      state.expected.splice(existingIdx, 1);
    } else {
      state.expected.push({
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        query: cleaned
      });
    }

    saveExpected();
    renderDirectory();
    recalculateAndRenderResults();
  }

  function addExpectedSignerOnly(name) {
    const cleaned = Parser.cleanValue(name);
    if (!cleaned || isInExpected(cleaned)) return;
    state.expected.push({
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      query: cleaned
    });
    saveExpected();
    renderDirectory();
    recalculateAndRenderResults();
  }

  function removeExpectedById(expId) {
    state.expected = state.expected.filter((item) => item.id !== expId);
    saveExpected();
    renderDirectory();
    recalculateAndRenderResults();
  }

  function clearExpectedSigners() {
    state.expected = [];
    saveExpected();
    renderDirectory();
    recalculateAndRenderResults();
  }

  function renderDirectory() {
    const container = els.surnameDirectoryContainer;
    if (!container) return;

    const total = state.directory.length;
    if (els.directoryCountText) {
      els.directoryCountText.textContent = `${total} чел.`;
    }
    if (els.btnClearDirectoryPrompt) {
      els.btnClearDirectoryPrompt.classList.toggle('d-none', total === 0);
    }
    if (els.btnSelectAllFromDir) {
      els.btnSelectAllFromDir.classList.toggle('d-none', total === 0);
    }
    if (els.directorySearchWrap) {
      els.directorySearchWrap.classList.toggle('d-none', total < 6);
    }

    if (total === 0) {
      container.innerHTML = `<div class="small text-muted py-2">Список фамилий пуст. Добавьте фамилии вручную, вставьте списком или загрузите отчет и сохраните подписантов оттуда.</div>`;
      return;
    }

    const filterNorm = Parser.normalizeText(state.directoryFilter);
    const visible = filterNorm
      ? state.directory.filter((s) => Parser.normalizeText(s).includes(filterNorm))
      : state.directory;

    if (visible.length === 0) {
      container.innerHTML = `<div class="small text-muted py-2">Совпадений в справочнике не найдено.</div>`;
      return;
    }

    container.innerHTML = visible.map((surname) => {
      const selected = isInExpected(surname);
      const safeName = escapeHtml(surname);
      const titleText = selected
        ? `Убрать «${safeName}» из перечня ожидаемых подписей`
        : `Добавить «${safeName}» в перечень ожидаемых подписей`;

      return `
        <div class="ep-surname-chip ${selected ? 'is-selected' : ''}" data-surname="${safeName}">
          <button type="button" class="ep-surname-btn js-toggle-surname" data-surname="${safeName}" title="${titleText}">
            <i class="bx ${selected ? 'bx-check' : 'bx-plus'}"></i>
            <span>${safeName}</span>
          </button>
          <button type="button" class="ep-surname-del js-del-surname" data-surname="${safeName}" title="Удалить из справочника" aria-label="Удалить ${safeName}">
            <i class="bx bx-x"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  function renderExpectedList() {
    const container = els.expectedSignersContainer;
    if (!container) return;

    const total = state.expected.length;
    if (els.expectedCountText) {
      els.expectedCountText.textContent = `${total} чел.`;
    }
    if (els.btnClearExpected) {
      els.btnClearExpected.classList.toggle('d-none', total === 0);
    }

    if (total === 0) {
      container.innerHTML = `
        <div class="p-3 small text-muted">
          Перечень ожидаемых подписей пока пуст. Кликните по нужным фамилиям в справочнике выше, чтобы добавить их в список проверки.
        </div>
      `;
      return;
    }

    const pkg = state.packageReconciliation;
    const isMulti = Boolean(pkg && pkg.isMultiDocument);
    const activeDocResult = getActiveDocResult();
    const certs = activeDocResult ? activeDocResult.doc.certificates : (state.parseResult ? state.parseResult.certificates : []);
    const hasReport = Boolean(state.parseResult && state.parseResult.certificates.length > 0);

    container.innerHTML = state.expected.map((item) => {
      let badgeHtml = '';
      if (hasReport) {
        if (isMulti && pkg.expectedStatsById && pkg.expectedStatsById[item.id]) {
          const st = pkg.expectedStatsById[item.id];
          if (st.signedDocsCount === 0) {
            badgeHtml = `<span class="ep-status ep-status-err"><i class="bx bx-x-circle"></i>Нет ни в 1 файле</span>`;
          } else if (st.signedDocsCount < st.totalDocs) {
            badgeHtml = `<span class="ep-status ep-status-err" title="Нет в файлах: ${escapeHtml(st.missingInDocs.join(', '))}"><i class="bx bx-error-circle"></i>${st.signedDocsCount}/${st.totalDocs} файлов</span>`;
          } else if (st.hasExpired) {
            badgeHtml = `<span class="ep-status ep-status-err"><i class="bx bx-error-circle"></i>${st.signedDocsCount}/${st.totalDocs} · Просрочен</span>`;
          } else if (st.hasExpiringSoon) {
            badgeHtml = `<span class="ep-status ep-status-warn"><i class="bx bx-time-five"></i>${st.signedDocsCount}/${st.totalDocs} · Истекает</span>`;
          } else {
            badgeHtml = `<span class="ep-status ep-status-ok"><i class="bx bx-check-circle"></i>${st.signedDocsCount}/${st.totalDocs} файлов</span>`;
          }
        } else {
          const matched = certs.filter((c) => Parser.doesSignerMatchCertificate(item.query, c));
          if (matched.length === 0) {
            badgeHtml = `<span class="ep-status ep-status-err"><i class="bx bx-x-circle"></i>Нет в отчете</span>`;
          } else if (matched.some((c) => c.certStatus === 'expired')) {
            badgeHtml = `<span class="ep-status ep-status-err"><i class="bx bx-error-circle"></i>Просрочен ЭП</span>`;
          } else if (matched.some((c) => c.certStatus === 'expiring_soon')) {
            badgeHtml = `<span class="ep-status ep-status-warn"><i class="bx bx-time-five"></i>Истекает ЭП</span>`;
          } else {
            badgeHtml = `<span class="ep-status ep-status-ok"><i class="bx bx-check-circle"></i>Подписан</span>`;
          }
        }
      }

      return `
        <div class="ep-expected-row">
          <div class="d-flex align-items-center gap-2 min-width-0">
            <span class="fw-medium text-truncate">${escapeHtml(item.query)}</span>
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            ${badgeHtml}
            <button type="button" class="btn btn-link btn-sm p-0 text-muted js-remove-expected" data-exp-id="${escapeHtml(item.id)}" title="Убрать из ожидаемых" aria-label="Убрать ${escapeHtml(item.query)}">
              <i class="bx bx-x fs-5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function getActiveDocResult() {
    if (!state.packageReconciliation || !state.packageReconciliation.docResults.length) {
      return null;
    }
    const idx = Math.max(0, Math.min(state.selectedDocIndex, state.packageReconciliation.docResults.length - 1));
    return state.packageReconciliation.docResults[idx] || null;
  }

  function renderDocumentMetadata() {
    if (!els.docMetaSection || !els.docMetaGrid) return;
    const activeDocRes = getActiveDocResult();
    const meta = activeDocRes
      ? activeDocRes.doc.docMeta
      : (state.parseResult && state.parseResult.docMeta ? state.parseResult.docMeta : null);
    if (!meta) {
      els.docMetaSection.classList.add('d-none');
      return;
    }

    const items = [
      { label: 'Файл документа', val: meta.fileName },
      { label: 'Шифр проекта', val: meta.projectCode },
      { label: 'Наименование проекта', val: meta.projectName },
      { label: 'Наименование документа', val: meta.docName },
      { label: '№ договора', val: meta.contractNumber },
      { label: '№ этапа', val: meta.stageNumber },
      { label: 'Статус подписи в файле', val: meta.overallStatus }
    ].filter((it) => it.val);

    if (items.length === 0) {
      els.docMetaSection.classList.add('d-none');
      return;
    }

    els.docMetaSection.classList.remove('d-none');
    els.docMetaGrid.innerHTML = items.map((it) => {
      let extraClass = '';
      if (it.label === 'Статус подписи в файле') {
        const lower = it.val.toLowerCase();
        if (lower.includes('недействит') || lower.includes('ошиб')) {
          extraClass = 'text-danger';
        } else if (lower.includes('действит')) {
          extraClass = 'text-success';
        }
      }
      return `
        <div>
          <div class="ep-meta-label">${escapeHtml(it.label)}</div>
          <div class="ep-meta-val ${extraClass}">${escapeHtml(it.val)}</div>
        </div>
      `;
    }).join('');
  }

  function renderColumnMappingBar() {
    if (!els.columnMappingBar || !state.parseResult) return;
    const isTabular = state.parseResult.mode === 'tabular';
    const showBar = isTabular && (state.showMappingBar || state.parseResult.certificates.length === 0);

    if (els.btnToggleColumnMapping) {
      els.btnToggleColumnMapping.classList.toggle('d-none', !isTabular);
    }

    els.columnMappingBar.classList.toggle('d-none', !showBar);
    if (!isTabular) return;

    const headers = state.parseResult.headers || [];
    const mapping = state.parseResult.mapping || {};

    const buildOptions = (selectedIdx, allowNone) => {
      const opts = [];
      if (allowNone) {
        opts.push(`<option value="-1"${selectedIdx === -1 ? ' selected' : ''}>Не использовать</option>`);
      }
      headers.forEach((h, idx) => {
        opts.push(`<option value="${idx}"${selectedIdx === idx ? ' selected' : ''}>${escapeHtml(h)} (ст. ${idx + 1})</option>`);
      });
      return opts.join('');
    };

    if (els.mapNameCol) els.mapNameCol.innerHTML = buildOptions(mapping.nameCol ?? 0, false);
    if (els.mapValidToCol) els.mapValidToCol.innerHTML = buildOptions(mapping.validToCol ?? -1, true);
    if (els.mapSignedAtCol) els.mapSignedAtCol.innerHTML = buildOptions(mapping.signedAtCol ?? -1, true);
    if (els.mapFileCol) els.mapFileCol.innerHTML = buildOptions(mapping.fileCol ?? -1, true);
  }

  function renderKpis() {
    if (!els.kpiSection || !state.packageReconciliation) return;
    els.kpiSection.classList.remove('d-none');

    const pkg = state.packageReconciliation;
    if (pkg.isMultiDocument) {
      const s = pkg.stats;
      const hasExp = pkg.hasExpectedList;

      if (els.kpiLabel1) els.kpiLabel1.textContent = 'Документов в отчете';
      if (els.kpiLabel2) els.kpiLabel2.textContent = 'Ожидается на файл';
      if (els.kpiLabel3) els.kpiLabel3.textContent = 'Файлов без пропусков';
      if (els.kpiLabel4) els.kpiLabel4.textContent = 'Файлов с недостачей';
      if (els.kpiLabel5) els.kpiLabel5.textContent = 'С лишними / Срок ЭП';

      els.kpiTotalInReport.textContent = String(s.docCount);
      els.kpiTotalExpected.textContent = hasExp ? String(state.expected.length) : '—';

      els.kpiMatched.textContent = hasExp ? `${s.docsComplete} / ${s.docCount}` : '—';
      els.kpiMatched.style.color = hasExp && s.docsComplete === s.docCount ? 'var(--ep-ok)' : 'var(--ep-text)';

      els.kpiMissing.textContent = hasExp ? String(s.docsWithMissing) : '—';
      els.kpiMissing.style.color = hasExp && s.docsWithMissing > 0 ? 'var(--ep-err)' : 'var(--ep-text)';

      els.kpiExtraOrCert.textContent = `${hasExp ? s.docsWithExtra : 0} / ${s.docsWithCertIssues}`;
      els.kpiExtraOrCert.style.color = s.docsWithCertIssues > 0 || (hasExp && s.docsWithExtra > 0)
        ? 'var(--ep-warn)'
        : 'var(--ep-text)';
      return;
    }

    const reconcile = state.reconciliation;
    if (!reconcile) return;

    if (els.kpiLabel1) els.kpiLabel1.textContent = 'Подписали в отчете';
    if (els.kpiLabel2) els.kpiLabel2.textContent = 'Ожидается по списку';
    if (els.kpiLabel3) els.kpiLabel3.textContent = 'Совпали';
    if (els.kpiLabel4) els.kpiLabel4.textContent = 'Недостает подписей';
    if (els.kpiLabel5) els.kpiLabel5.textContent = 'Лишние / Срок ЭП';

    const { stats, hasExpectedList } = reconcile;
    const certProblems = stats.expiredCount + stats.expiringSoonCount;

    els.kpiTotalInReport.textContent = String(stats.totalInReport);
    els.kpiTotalExpected.textContent = hasExpectedList ? String(stats.totalExpected) : '—';

    els.kpiMatched.textContent = hasExpectedList ? String(stats.matchedCount) : '—';
    els.kpiMatched.style.color = hasExpectedList && stats.matchedCount > 0 && stats.missingCount === 0
      ? 'var(--ep-ok)'
      : 'var(--ep-text)';

    els.kpiMissing.textContent = hasExpectedList ? String(stats.missingCount) : '—';
    els.kpiMissing.style.color = hasExpectedList && stats.missingCount > 0
      ? 'var(--ep-err)'
      : 'var(--ep-text)';

    els.kpiExtraOrCert.textContent = `${hasExpectedList ? stats.extraCount : 0} / ${certProblems}`;
    els.kpiExtraOrCert.style.color = (stats.expiredCount > 0)
      ? 'var(--ep-err)'
      : ((stats.extraCount > 0 || certProblems > 0) ? 'var(--ep-warn)' : 'var(--ep-text)');
  }

  function buildDocPackageStatusPill(dr, hasExpectedList) {
    if (dr.hasExpired) {
      return `<span class="ep-status ep-status-err"><i class="bx bx-error-circle"></i>Просрочен ЭП</span>`;
    }
    if (hasExpectedList && dr.hasMissing) {
      return `<span class="ep-status ep-status-err"><i class="bx bx-x-circle"></i>Недостает ЭП</span>`;
    }
    if (dr.hasExpiringSoon) {
      return `<span class="ep-status ep-status-warn"><i class="bx bx-time-five"></i>Истекает ЭП</span>`;
    }
    if (hasExpectedList && dr.hasExtra) {
      return `<span class="ep-status ep-status-warn"><i class="bx bx-user-plus"></i>Есть лишние</span>`;
    }
    if (hasExpectedList) {
      return `<span class="ep-status ep-status-ok"><i class="bx bx-check-circle"></i>Полный состав</span>`;
    }
    return `<span class="ep-status ep-status-neutral"><i class="bx bx-file"></i>Без замечаний</span>`;
  }

  function renderDocumentsPackagePanel() {
    if (!els.documentsPackagePanel || !els.packageDocsTableBody) return;
    const pkg = state.packageReconciliation;

    if (!pkg || !pkg.isMultiDocument) {
      els.documentsPackagePanel.classList.add('d-none');
      return;
    }

    els.documentsPackagePanel.classList.remove('d-none');
    const allDocs = pkg.docResults;
    const issuesDocs = allDocs.filter((d) => d.hasAnyIssue);
    const okDocs = allDocs.filter((d) => !d.hasAnyIssue);

    if (els.packageDocsCountText) {
      els.packageDocsCountText.textContent = pkg.hasExpectedList
        ? `Всего файлов: ${allDocs.length} · С замечаниями: ${issuesDocs.length} · Кликните по строке для просмотра подписей`
        : `Всего файлов: ${allDocs.length} · Выберите документ, чтобы просмотреть его подписантов`;
    }

    const docFilterCounts = {
      all: allDocs.length,
      issues: issuesDocs.length,
      ok: okDocs.length
    };
    const docFilterLabels = {
      all: 'Все',
      issues: 'С замечаниями',
      ok: 'Без замечаний'
    };
    document.querySelectorAll('.ep-doc-filter-btn').forEach((btn) => {
      const f = btn.getAttribute('data-doc-filter');
      btn.classList.toggle('is-active', f === state.docFilter);
      btn.textContent = `${docFilterLabels[f] || f} (${docFilterCounts[f] ?? 0})`;
    });

    let visibleDocs = allDocs;
    if (state.docFilter === 'issues') {
      visibleDocs = issuesDocs;
    } else if (state.docFilter === 'ok') {
      visibleDocs = okDocs;
    }

    if (visibleDocs.length === 0) {
      els.packageDocsTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-3 text-muted">
            Документов по выбранному фильтру нет.
          </td>
        </tr>
      `;
      return;
    }

    els.packageDocsTableBody.innerHTML = visibleDocs.map((dr) => {
      const doc = dr.doc;
      const s = dr.reconciliation.stats;
      const isSelected = doc.index === state.selectedDocIndex;
      const title = doc.docMeta.fileName || `Документ ${doc.index + 1}`;
      const sub = doc.docMeta.docName && doc.docMeta.docName !== title ? doc.docMeta.docName : '';

      return `
        <tr class="ep-doc-row ${isSelected ? 'is-selected' : ''}" data-doc-index="${doc.index}">
          <td class="ep-tabular text-muted">${doc.index + 1}</td>
          <td>
            <div class="fw-semibold">${escapeHtml(title)}</div>
            ${sub ? `<div class="small text-muted text-truncate" style="max-width: 360px;">${escapeHtml(sub)}</div>` : ''}
          </td>
          <td class="ep-tabular">${s.totalInReport}</td>
          <td class="ep-tabular">${pkg.hasExpectedList ? s.matchedCount : '—'}</td>
          <td class="ep-tabular ${pkg.hasExpectedList && s.missingCount > 0 ? 'text-danger fw-bold' : ''}">${pkg.hasExpectedList ? s.missingCount : '—'}</td>
          <td class="ep-tabular ${pkg.hasExpectedList && s.extraCount > 0 ? 'text-warning fw-semibold' : ''}">${pkg.hasExpectedList ? s.extraCount : '—'}</td>
          <td>${buildDocPackageStatusPill(dr, pkg.hasExpectedList)}</td>
        </tr>
      `;
    }).join('');
  }

  function buildStatusPill(row) {
    if (row.kind === 'missing') {
      return `<span class="ep-status ep-status-err"><i class="bx bx-x-circle"></i>Недостает подписи</span>`;
    }
    if (row.kind === 'extra') {
      return `<span class="ep-status ep-status-warn"><i class="bx bx-user-plus"></i>Лишняя подпись</span>`;
    }
    if (row.kind === 'matched') {
      if (row.cert && row.cert.certStatus === 'expired') {
        return `<span class="ep-status ep-status-err"><i class="bx bx-error-circle"></i>Совпала · Просрочен ЭП</span>`;
      }
      if (row.cert && row.cert.certStatus === 'expiring_soon') {
        return `<span class="ep-status ep-status-warn"><i class="bx bx-time-five"></i>Совпала · Истекает ЭП</span>`;
      }
      return `<span class="ep-status ep-status-ok"><i class="bx bx-check-circle"></i>Подтверждена</span>`;
    }
    // report_only (expected list empty)
    return `<span class="ep-status ep-status-neutral"><i class="bx bx-certification"></i>В отчете</span>`;
  }

  function buildCertValidityCell(cert) {
    if (!cert) {
      return `<span class="text-muted">—</span>`;
    }
    if (cert.certStatus === 'expired') {
      return `<span class="ep-status ep-status-err"><i class="bx bx-error-circle"></i>${escapeHtml(cert.validityLabel)}</span>`;
    }
    if (cert.certStatus === 'expiring_soon') {
      return `<span class="ep-status ep-status-warn"><i class="bx bx-time-five"></i>${escapeHtml(cert.validityLabel)}</span>`;
    }
    if (cert.certStatus === 'valid') {
      return `<span class="ep-status ep-status-ok"><i class="bx bx-check"></i>${escapeHtml(cert.validityLabel)}</span>`;
    }
    return `<span class="ep-status ep-status-neutral">${escapeHtml(cert.validityLabel || 'Не указана')}</span>`;
  }

  function getFilteredRows() {
    if (!state.reconciliation) return [];
    let rows = state.reconciliation.allRows;

    if (state.activeFilter === 'matched') {
      rows = rows.filter((r) => r.kind === 'matched');
    } else if (state.activeFilter === 'missing') {
      rows = rows.filter((r) => r.kind === 'missing');
    } else if (state.activeFilter === 'extra') {
      rows = rows.filter((r) => r.kind === 'extra');
    } else if (state.activeFilter === 'cert_issues') {
      rows = rows.filter((r) => r.cert && (r.cert.certStatus === 'expired' || r.cert.certStatus === 'expiring_soon' || r.cert.certStatus === 'unknown'));
    }

    const qNorm = Parser.normalizeText(state.searchQuery);
    if (qNorm) {
      rows = rows.filter((r) => {
        const haystack = [
          r.expectedQuery,
          r.cert ? r.cert.fullName : '',
          r.cert ? r.cert.email : '',
          r.cert ? r.cert.serialNumber : '',
          r.cert ? r.cert.issuerShort : ''
        ].join(' ');
        return Parser.normalizeText(haystack).includes(qNorm);
      });
    }

    return rows;
  }

  function renderResultsTable() {
    if (!els.resultsPanel || !els.resultsTableBody || !state.reconciliation) return;
    els.resultsPanel.classList.remove('d-none');

    const pkg = state.packageReconciliation;
    const activeDocRes = getActiveDocResult();
    if (els.activeDocBanner) {
      if (pkg && pkg.isMultiDocument && activeDocRes) {
        const totalDocs = pkg.docResults.length;
        const pos = activeDocRes.doc.index + 1;
        els.activeDocBanner.classList.remove('d-none');
        if (els.activeDocSub) {
          els.activeDocSub.textContent = `Документ ${pos} из ${totalDocs}`;
        }
        if (els.activeDocTitle) {
          els.activeDocTitle.textContent = activeDocRes.doc.docMeta.fileName || `Документ ${pos}`;
        }
        if (els.btnPrevDoc) els.btnPrevDoc.disabled = activeDocRes.doc.index <= 0;
        if (els.btnNextDoc) els.btnNextDoc.disabled = activeDocRes.doc.index >= totalDocs - 1;
      } else {
        els.activeDocBanner.classList.add('d-none');
      }
    }

    if (els.emptyExpectedHint) {
      els.emptyExpectedHint.classList.toggle('d-none', state.reconciliation.hasExpectedList);
    }

    // Update filter tab counts
    const { stats, hasExpectedList } = state.reconciliation;
    const certIssuesCount = stats.expiredCount + stats.expiringSoonCount + stats.unknownDateCount;
    const countsByFilter = {
      all: state.reconciliation.allRows.length,
      matched: state.reconciliation.matchedItems.length,
      missing: stats.missingCount,
      extra: hasExpectedList ? stats.extraCount : 0,
      cert_issues: certIssuesCount
    };
    const labelsByFilter = {
      all: 'Все',
      matched: 'Совпали',
      missing: 'Недостающие',
      extra: 'Лишние',
      cert_issues: 'Срок ЭП'
    };

    document.querySelectorAll('.ep-res-filter-btn').forEach((btn) => {
      const f = btn.getAttribute('data-filter');
      btn.classList.toggle('is-active', f === state.activeFilter);
      btn.textContent = `${labelsByFilter[f] || f} (${countsByFilter[f] ?? 0})`;
    });

    const rows = getFilteredRows();
    if (rows.length === 0) {
      els.resultsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            По выбранному фильтру записей нет.
          </td>
        </tr>
      `;
      return;
    }

    els.resultsTableBody.innerHTML = rows.map((row, idx) => {
      const cert = row.cert;
      const rowKey = cert ? `cert_${cert.certNumber}_${idx}` : `miss_${row.expectedId}`;
      const isExpanded = state.expandedRows.has(rowKey);

      const signerName = cert ? cert.fullName : row.expectedQuery;
      const subLineParts = [];
      if (cert && cert.email) subLineParts.push(cert.email);
      if (row.kind === 'matched' && row.expectedQuery && Parser.normalizeText(row.expectedQuery) !== Parser.normalizeText(signerName)) {
        subLineParts.push(`Ожидалось: «${row.expectedQuery}»`);
      }
      if (row.kind === 'missing') {
        subLineParts.push('Подпись в отчете не найдена');
      }

      const validToStr = cert ? cert.validToDisplay : '—';
      const signedAtStr = cert && cert.signedAtMsk ? cert.signedAtMsk : '—';

      const dirCandidate = cert ? (cert.surname || cert.fullName) : row.expectedQuery;
      const inDir = dirCandidate ? isInDirectory(dirCandidate) : true;

      let actionsHtml = '';
      if (cert) {
        if (!inDir) {
          actionsHtml += `<button type="button" class="btn btn-outline-secondary btn-sm py-0_5 px-2 me-1 js-add-dir-from-row" data-name="${escapeHtml(dirCandidate)}" title="Сохранить фамилию в справочник">+ в справочник</button>`;
        }
        if (row.kind === 'extra' || row.kind === 'report_only') {
          const expCandidate = cert.surname || cert.fullName;
          if (!isInExpected(expCandidate)) {
            actionsHtml += `<button type="button" class="btn btn-outline-primary btn-sm py-0_5 px-2 me-1 js-add-exp-from-row" data-name="${escapeHtml(expCandidate)}" title="Добавить в перечень ожидаемых подписей">+ в ожидаемые</button>`;
          }
        }
        actionsHtml += `
          <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none js-toggle-cert-details" data-row-key="${escapeHtml(rowKey)}">
            ${isExpanded ? 'Скрыть' : 'Детали'}
          </button>
        `;
      } else {
        actionsHtml = `<span class="small text-muted">—</span>`;
      }

      let html = `
        <tr>
          <td>${buildStatusPill(row)}</td>
          <td>
            <div class="fw-semibold">${escapeHtml(signerName)}</div>
            ${subLineParts.length ? `<div class="small text-muted">${escapeHtml(subLineParts.join(' · '))}</div>` : ''}
          </td>
          <td class="ep-tabular">${escapeHtml(validToStr)}</td>
          <td>${buildCertValidityCell(cert)}</td>
          <td class="ep-tabular text-muted">${escapeHtml(signedAtStr)}</td>
          <td class="text-end text-nowrap">${actionsHtml}</td>
        </tr>
      `;

      if (cert && isExpanded) {
        html += `
          <tr class="ep-detail-row">
            <td colspan="6">
              <div class="row g-2">
                <div class="col-12 col-md-4">
                  <div class="text-muted small">Действует с</div>
                  <div class="ep-tabular fw-medium">${escapeHtml(cert.validFromDisplay || cert.validFromRaw || '—')}</div>
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-muted small">Время подписи (UTC)</div>
                  <div class="ep-tabular fw-medium">${escapeHtml(cert.signedAtUtc || '—')}</div>
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-muted small">Формат подписи</div>
                  <div class="fw-medium">${escapeHtml(cert.signatureFormat || '—')}</div>
                </div>
                <div class="col-12 col-md-6">
                  <div class="text-muted small">Субъект (X.509)</div>
                  <div class="ep-tabular small" style="word-break: break-word;">${escapeHtml(cert.subjectRaw || '—')}</div>
                </div>
                <div class="col-12 col-md-6">
                  <div class="text-muted small">Издатель</div>
                  <div class="small" style="word-break: break-word;">${escapeHtml(cert.issuerRaw || '—')}</div>
                </div>
                <div class="col-12 col-md-6">
                  <div class="text-muted small">Серийный номер</div>
                  <div class="ep-tabular small">${escapeHtml(cert.serialNumber || '—')}</div>
                </div>
                <div class="col-12 col-md-6">
                  <div class="text-muted small">Отпечаток сертификата</div>
                  <div class="ep-tabular small">${escapeHtml(cert.thumbprint || '—')}</div>
                </div>
              </div>
            </td>
          </tr>
        `;
      }

      return html;
    }).join('');
  }

  function selectDocument(docIndex) {
    if (!state.packageReconciliation || !state.packageReconciliation.docResults.length) return;
    const maxIdx = state.packageReconciliation.docResults.length - 1;
    state.selectedDocIndex = Math.max(0, Math.min(docIndex, maxIdx));
    state.expandedRows.clear();

    const activeDocRes = getActiveDocResult();
    state.reconciliation = activeDocRes ? activeDocRes.reconciliation : null;

    renderDocumentMetadata();
    renderDocumentsPackagePanel();
    renderResultsTable();
  }

  function recalculateAndRenderResults() {
    if (!state.parseResult) {
      state.packageReconciliation = null;
      state.reconciliation = null;
      renderExpectedList();
      if (els.kpiSection) els.kpiSection.classList.add('d-none');
      if (els.documentsPackagePanel) els.documentsPackagePanel.classList.add('d-none');
      if (els.resultsPanel) els.resultsPanel.classList.add('d-none');
      return;
    }

    const docs = Array.isArray(state.parseResult.documents) && state.parseResult.documents.length > 0
      ? state.parseResult.documents
      : [{ index: 0, id: 'doc_0', docMeta: state.parseResult.docMeta || {}, certificates: state.parseResult.certificates || [] }];

    state.packageReconciliation = Parser.reconcilePackage(docs, state.expected);
    if (state.selectedDocIndex >= docs.length) {
      state.selectedDocIndex = 0;
    }
    const activeDocRes = getActiveDocResult();
    state.reconciliation = activeDocRes ? activeDocRes.reconciliation : null;

    renderExpectedList();
    renderDocumentMetadata();
    renderKpis();
    renderDocumentsPackagePanel();
    renderResultsTable();
  }

  function parseActiveRows(mappingOverride) {
    const mapToUse = mappingOverride || state.customMapping;
    state.parseResult = Parser.parseWorkbookSheet(state.rawRows, state.formattedRows, mapToUse, new Date());
    state.selectedDocIndex = 0;
    state.docFilter = 'all';

    if (els.activeReportModeInfo) {
      const docCount = state.parseResult.documents ? state.parseResult.documents.length : 0;
      const modeLabel = state.parseResult.mode === 'protocol'
        ? 'Распознан протокол сертификатов ЭП'
        : (state.parseResult.mode === 'tabular' ? 'Табличный режим разбора' : 'Подписи не найдены');
      const docPart = docCount > 1 ? ` · Документов: ${docCount}` : '';
      els.activeReportModeInfo.textContent = `${modeLabel}${docPart} · Сертификатов: ${state.parseResult.certificates.length}`;
    }

    renderColumnMappingBar();
    recalculateAndRenderResults();
  }

  function loadSheetFromWorkbook(sheetName) {
    if (!state.workbook || !window.XLSX) return;
    const ws = state.workbook.Sheets[sheetName];
    if (!ws) return;
    state.activeSheetName = sheetName;
    state.rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    state.formattedRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    state.expandedRows.clear();
    parseActiveRows(null);
  }

  function showActiveReportBar() {
    if (els.dropZoneEmpty) els.dropZoneEmpty.classList.add('d-none');
    if (els.activeReportBar) els.activeReportBar.classList.remove('d-none');
    if (els.reportErrorAlert) els.reportErrorAlert.classList.add('d-none');
    if (els.activeReportFileName) els.activeReportFileName.textContent = state.fileName || 'Отчет';

    if (els.sheetSelect) {
      if (state.sheetNames.length > 1) {
        els.sheetSelect.classList.remove('d-none');
        els.sheetSelect.innerHTML = state.sheetNames
          .map((name) => `<option value="${escapeHtml(name)}"${name === state.activeSheetName ? ' selected' : ''}>Лист: ${escapeHtml(name)}</option>`)
          .join('');
      } else {
        els.sheetSelect.classList.add('d-none');
      }
    }
  }

  function showError(message) {
    if (!els.reportErrorAlert) return;
    els.reportErrorAlert.textContent = message;
    els.reportErrorAlert.classList.remove('d-none');
  }

  async function handleFileUpload(file) {
    if (!file) return;
    if (els.reportErrorAlert) els.reportErrorAlert.classList.add('d-none');

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    state.fileName = file.name;
    state.isSample = false;
    state.customMapping = null;
    state.showMappingBar = false;
    state.expandedRows.clear();

    try {
      if (ext === 'csv' || ext === 'txt') {
        const text = await Parser.readFileAsTextWithEncoding(file);
        const rows = Parser.parseCsvText(text);
        state.workbook = null;
        state.sheetNames = [];
        state.activeSheetName = '';
        state.rawRows = rows;
        state.formattedRows = rows;
        showActiveReportBar();
        parseActiveRows(null);
      } else if (ext === 'xlsx' || ext === 'xls') {
        if (!window.XLSX) {
          throw new Error('Библиотека обработки Excel не загружена.');
        }
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error('Книга Excel не содержит листов.');
        }
        state.workbook = wb;
        state.sheetNames = wb.SheetNames;
        state.activeSheetName = wb.SheetNames[0];
        showActiveReportBar();
        loadSheetFromWorkbook(state.activeSheetName);
      } else {
        throw new Error('Неподдерживаемый формат файла. Загрузите таблицу .xlsx, .xls или .csv.');
      }

      if (state.parseResult && state.parseResult.certificates.length === 0) {
        showToast('Подписи не определились автоматически. Попробуйте выбрать другой лист или настроить столбцы.', 'warning', 'Проверьте структуру файла');
      } else {
        showToast(`Распознано сертификатов: ${state.parseResult.certificates.length}`, 'success', 'Отчет загружен');
      }
    } catch (err) {
      showError(err.message || 'Ошибка при чтении файла отчета.');
      showToast(err.message || 'Ошибка чтения файла', 'danger', 'Ошибка');
    }
  }

  function loadSampleReport() {
    const sampleRows = Parser.getSampleReportRows();
    state.workbook = null;
    state.sheetNames = [];
    state.activeSheetName = '';
    state.rawRows = sampleRows;
    state.formattedRows = sampleRows;
    state.fileName = 'Отчет_ЭП_пример.xlsx';
    state.isSample = true;
    state.customMapping = null;
    state.showMappingBar = false;
    state.expandedRows.clear();

    showActiveReportBar();
    parseActiveRows(null);
    showToast('Пример отчета загружен. Добавьте фамилии в справочник или сохраните подписантов из отчета.', 'info', 'Демо-отчет');
  }

  function closeActiveReport() {
    state.workbook = null;
    state.sheetNames = [];
    state.activeSheetName = '';
    state.rawRows = [];
    state.formattedRows = [];
    state.fileName = '';
    state.isSample = false;
    state.parseResult = null;
    state.packageReconciliation = null;
    state.reconciliation = null;
    state.selectedDocIndex = 0;
    state.docFilter = 'all';
    state.expandedRows.clear();

    if (els.reportFileInput) els.reportFileInput.value = '';
    if (els.activeReportBar) els.activeReportBar.classList.add('d-none');
    if (els.dropZoneEmpty) els.dropZoneEmpty.classList.remove('d-none');
    if (els.reportErrorAlert) els.reportErrorAlert.classList.add('d-none');

    recalculateAndRenderResults();
  }

  function copyVerificationSummary() {
    if (!state.packageReconciliation || !state.parseResult) return;
    const pkg = state.packageReconciliation;
    const lines = [];

    if (pkg.isMultiDocument) {
      const s = pkg.stats;
      lines.push(`Проверка ЭП по пакету — ${state.fileName}`);
      lines.push(`Документов в отчете: ${s.docCount} · Без пропусков: ${s.docsComplete}`);
      if (pkg.hasExpectedList) {
        lines.push(`Ожидалось подписантов на каждый файл: ${state.expected.length}`);
      }
      const docsWithIssues = pkg.docResults.filter((dr) => dr.hasAnyIssue);
      if (docsWithIssues.length === 0) {
        lines.push('Замечаний по документам не выявлено.');
      } else {
        lines.push(`Документы с замечаниями (${docsWithIssues.length}):`);
        docsWithIssues.forEach((dr) => {
          const title = dr.doc.docMeta.fileName || `Документ ${dr.doc.index + 1}`;
          const rec = dr.reconciliation;
          const details = [];
          if (rec.missingItems.length > 0) {
            details.push(`нет подписей: ${rec.missingItems.map((m) => m.expectedQuery).join(', ')}`);
          }
          if (rec.extraItems.length > 0 && pkg.hasExpectedList) {
            details.push(`лишние: ${rec.extraItems.map((e) => e.cert.surname || e.cert.fullName).join(', ')}`);
          }
          const badCerts = dr.doc.certificates.filter((c) => c.certStatus === 'expired' || c.certStatus === 'expiring_soon');
          if (badCerts.length > 0) {
            details.push(`срок ЭП: ${badCerts.map((c) => `${c.surname || c.fullName} (до ${c.validToDisplay})`).join(', ')}`);
          }
          lines.push(`- ${title}: ${details.join('; ')}`);
        });
      }
    } else if (state.reconciliation) {
      const activeDocRes = getActiveDocResult();
      const meta = activeDocRes ? activeDocRes.doc.docMeta : (state.parseResult.docMeta || {});
      const rec = state.reconciliation;

      lines.push(`Проверка ЭП — ${meta.fileName || state.fileName}`);
      if (meta.docName) lines.push(`Документ: ${meta.docName}`);
      lines.push(`Подписали в отчете: ${rec.stats.totalInReport}`);

      if (rec.hasExpectedList) {
        lines.push(`Ожидалось: ${rec.stats.totalExpected}, совпало: ${rec.stats.matchedCount}`);
        if (rec.missingItems.length > 0) {
          lines.push(`Недостающие подписи (${rec.missingItems.length}): ${rec.missingItems.map((m) => m.expectedQuery).join(', ')}`);
        }
        if (rec.extraItems.length > 0) {
          lines.push(`Лишние подписи (${rec.extraItems.length}): ${rec.extraItems.map((e) => e.cert.fullName).join(', ')}`);
        }
      }

      const certs = activeDocRes ? activeDocRes.doc.certificates : state.parseResult.certificates;
      const problemCerts = certs.filter(
        (c) => c.certStatus === 'expired' || c.certStatus === 'expiring_soon'
      );
      if (problemCerts.length > 0) {
        lines.push('Замечания по срокам ЭП:');
        problemCerts.forEach((c) => {
          lines.push(`- ${c.fullName}: действует до ${c.validToDisplay} (${c.validityLabel})`);
        });
      }
    }

    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Итог проверки скопирован в буфер обмена.', 'success', 'Скопировано'))
        .catch(() => showToast('Не удалось скопировать в буфер обмена.', 'warning', 'Буфер обмена'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('Итог проверки скопирован в буфер обмена.', 'success', 'Скопировано');
      } catch (e) {
        showToast('Не удалось скопировать в буфер обмена.', 'warning', 'Буфер обмена');
      }
      document.body.removeChild(ta);
    }
  }

  function applyCustomColumnMapping() {
    if (!state.parseResult || state.parseResult.mode !== 'tabular') return;
    const mapping = {
      forceTabular: true,
      headerRowIndex: state.parseResult.mapping ? state.parseResult.mapping.headerRowIndex : 0,
      nameCol: els.mapNameCol ? parseInt(els.mapNameCol.value, 10) : 0,
      validToCol: els.mapValidToCol ? parseInt(els.mapValidToCol.value, 10) : -1,
      signedAtCol: els.mapSignedAtCol ? parseInt(els.mapSignedAtCol.value, 10) : -1,
      fileCol: els.mapFileCol ? parseInt(els.mapFileCol.value, 10) : -1
    };
    state.customMapping = mapping;
    saveMapping();
    parseActiveRows(mapping);
  }

  function bindEvents() {
    // Upload & Drag-and-Drop
    if (els.reportFileInput) {
      els.reportFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleFileUpload(file);
      });
    }

    if (els.dropZoneEmpty) {
      ['dragenter', 'dragover'].forEach((evt) => {
        els.dropZoneEmpty.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          els.dropZoneEmpty.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach((evt) => {
        els.dropZoneEmpty.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          els.dropZoneEmpty.classList.remove('is-dragover');
        });
      });
      els.dropZoneEmpty.addEventListener('drop', (e) => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
      });
      els.dropZoneEmpty.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('label')) return;
        if (els.reportFileInput) els.reportFileInput.click();
      });
    }

    if (els.btnLoadSample) els.btnLoadSample.addEventListener('click', loadSampleReport);
    if (els.btnDropzoneSample) els.btnDropzoneSample.addEventListener('click', loadSampleReport);
    if (els.btnCloseReport) els.btnCloseReport.addEventListener('click', closeActiveReport);

    if (els.sheetSelect) {
      els.sheetSelect.addEventListener('change', (e) => {
        state.customMapping = null;
        loadSheetFromWorkbook(e.target.value);
      });
    }

    if (els.btnToggleColumnMapping) {
      els.btnToggleColumnMapping.addEventListener('click', () => {
        state.showMappingBar = !state.showMappingBar;
        renderColumnMappingBar();
      });
    }

    [els.mapNameCol, els.mapValidToCol, els.mapSignedAtCol, els.mapFileCol].forEach((sel) => {
      if (sel) sel.addEventListener('change', applyCustomColumnMapping);
    });

    if (els.btnSaveAllFromReport) {
      els.btnSaveAllFromReport.addEventListener('click', () => {
        if (!state.parseResult || state.parseResult.certificates.length === 0) return;
        const sourceCerts = (state.packageReconciliation && state.packageReconciliation.uniqueSigners.length)
          ? state.packageReconciliation.uniqueSigners
          : state.parseResult.certificates;
        const surnames = sourceCerts
          .map((c) => c.surname || c.fullName)
          .filter(Boolean);
        const count = addSurnamesToDirectory(surnames, true);
        if (count > 0) {
          showToast(`В справочник добавлено новых фамилий: ${count}`, 'success', 'Сохранено');
        } else {
          showToast('Все подписанты из отчета уже есть в справочнике.', 'info', 'Без изменений');
        }
      });
    }

    // Directory Add & Bulk Add
    if (els.addSurnameForm) {
      els.addSurnameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = els.newSurnameInput ? els.newSurnameInput.value : '';
        if (!val.trim()) return;
        addSurnamesToDirectory(val);
        if (els.newSurnameInput) els.newSurnameInput.value = '';
      });
    }

    if (els.btnToggleBulkPanel) {
      els.btnToggleBulkPanel.addEventListener('click', () => {
        if (els.bulkAddPanel) els.bulkAddPanel.classList.toggle('d-none');
        if (els.bulkSurnamesTextarea && !els.bulkAddPanel.classList.contains('d-none')) {
          els.bulkSurnamesTextarea.focus();
        }
      });
    }

    if (els.btnCancelBulk) {
      els.btnCancelBulk.addEventListener('click', () => {
        if (els.bulkAddPanel) els.bulkAddPanel.classList.add('d-none');
      });
    }

    if (els.btnSaveBulk) {
      els.btnSaveBulk.addEventListener('click', () => {
        const rawText = els.bulkSurnamesTextarea ? els.bulkSurnamesTextarea.value : '';
        const items = rawText.split(/\r?\n|,|;/).map((s) => s.trim()).filter(Boolean);
        if (items.length === 0) {
          showToast('Введите хотя бы одну фамилию.', 'warning', 'Пустой список');
          return;
        }
        const added = addSurnamesToDirectory(items, true);
        if (els.bulkSurnamesTextarea) els.bulkSurnamesTextarea.value = '';
        if (els.bulkAddPanel) els.bulkAddPanel.classList.add('d-none');
        showToast(
          added > 0 ? `Добавлено фамилий: ${added}` : 'Новых фамилий не найдено (все уже в списке).',
          added > 0 ? 'success' : 'info',
          'Справочник'
        );
      });
    }

    if (els.btnSelectAllFromDir) {
      els.btnSelectAllFromDir.addEventListener('click', () => {
        let added = 0;
        state.directory.forEach((surname) => {
          if (!isInExpected(surname)) {
            state.expected.push({
              id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              query: surname
            });
            added++;
          }
        });
        if (added > 0) {
          saveExpected();
          renderDirectory();
          recalculateAndRenderResults();
        }
      });
    }

    if (els.btnClearDirectoryPrompt) {
      els.btnClearDirectoryPrompt.addEventListener('click', () => {
        if (els.clearDirConfirmBox) els.clearDirConfirmBox.classList.remove('d-none');
      });
    }

    if (els.btnCancelClearDir) {
      els.btnCancelClearDir.addEventListener('click', () => {
        if (els.clearDirConfirmBox) els.clearDirConfirmBox.classList.add('d-none');
      });
    }

    if (els.btnConfirmClearDir) {
      els.btnConfirmClearDir.addEventListener('click', () => {
        state.directory = [];
        saveDirectory();
        if (els.clearDirConfirmBox) els.clearDirConfirmBox.classList.add('d-none');
        renderDirectory();
      });
    }

    if (els.directorySearchInput) {
      els.directorySearchInput.addEventListener('input', (e) => {
        state.directoryFilter = e.target.value || '';
        renderDirectory();
      });
    }

    // Click delegation on Surname Directory
    if (els.surnameDirectoryContainer) {
      els.surnameDirectoryContainer.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.js-del-surname');
        if (delBtn) {
          e.stopPropagation();
          removeSurnameFromDirectory(delBtn.getAttribute('data-surname'));
          return;
        }
        const toggleBtn = e.target.closest('.js-toggle-surname');
        if (toggleBtn) {
          toggleExpectedSigner(toggleBtn.getAttribute('data-surname'));
        }
      });
    }

    // Expected Signers actions
    if (els.btnClearExpected) {
      els.btnClearExpected.addEventListener('click', clearExpectedSigners);
    }

    if (els.expectedSignersContainer) {
      els.expectedSignersContainer.addEventListener('click', (e) => {
        const remBtn = e.target.closest('.js-remove-expected');
        if (remBtn) {
          removeExpectedById(remBtn.getAttribute('data-exp-id'));
        }
      });
    }

    // Package document switcher & filters
    document.querySelectorAll('.ep-doc-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.docFilter = btn.getAttribute('data-doc-filter') || 'all';
        renderDocumentsPackagePanel();
      });
    });

    if (els.packageDocsTableBody) {
      els.packageDocsTableBody.addEventListener('click', (e) => {
        const row = e.target.closest('.ep-doc-row');
        if (!row) return;
        const idx = parseInt(row.getAttribute('data-doc-index'), 10);
        if (!isNaN(idx)) {
          selectDocument(idx);
        }
      });
    }

    if (els.btnPrevDoc) {
      els.btnPrevDoc.addEventListener('click', () => {
        selectDocument(state.selectedDocIndex - 1);
      });
    }

    if (els.btnNextDoc) {
      els.btnNextDoc.addEventListener('click', () => {
        selectDocument(state.selectedDocIndex + 1);
      });
    }

    // Filter tabs & search
    document.querySelectorAll('.ep-res-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeFilter = btn.getAttribute('data-filter') || 'all';
        renderResultsTable();
      });
    });

    if (els.resultsSearchInput) {
      els.resultsSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value || '';
        renderResultsTable();
      });
    }

    if (els.btnCopySummary) {
      els.btnCopySummary.addEventListener('click', copyVerificationSummary);
    }

    // Table actions delegation
    if (els.resultsTableBody) {
      els.resultsTableBody.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.js-toggle-cert-details');
        if (detailsBtn) {
          const key = detailsBtn.getAttribute('data-row-key');
          if (state.expandedRows.has(key)) {
            state.expandedRows.delete(key);
          } else {
            state.expandedRows.add(key);
          }
          renderResultsTable();
          return;
        }

        const addDirBtn = e.target.closest('.js-add-dir-from-row');
        if (addDirBtn) {
          addSurnamesToDirectory(addDirBtn.getAttribute('data-name'));
          renderResultsTable();
          return;
        }

        const addExpBtn = e.target.closest('.js-add-exp-from-row');
        if (addExpBtn) {
          addExpectedSignerOnly(addExpBtn.getAttribute('data-name'));
        }
      });
    }
  }

  function init() {
    loadPersistedState();
    bindEvents();
    renderDirectory();
    renderExpectedList();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
