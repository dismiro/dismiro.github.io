// Bill of quantities (ВОР) module logic
let currentData = null;
let currentFileName = '';
let isEditable = false;
let isRawColCollapsed = false;

// Initialize tooltips and event listeners
document.addEventListener('DOMContentLoaded', () => {
  initTooltips();
  setupEventListeners();
  setupDragAndDrop();
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

function showToast(message, type = 'info', title = 'Уведомление') {
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
    toastHeader.className = 'toast-header text-white ' + (
      type === 'error' ? 'bg-danger' :
      type === 'success' ? 'bg-success' : 'bg-primary'
    );
  }

  if (toastIcon) {
    toastIcon.className = 'fs-4 me-2 bx ' + (
      type === 'error' ? 'bx-error-circle' :
      type === 'success' ? 'bx-check-circle' : 'bx-info-circle'
    );
  }

  if (window.bootstrap && bootstrap.Toast) {
    const toast = new bootstrap.Toast(toastEl);
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
        showToast(`Файл "${fileName}" успешно загружен`, 'success', 'Успешно');
      } catch (err) {
        showToast(`Ошибка парсинга JSON: ${err.message}`, 'error', 'Ошибка');
      }
    };
    reader.onerror = () => {
      showToast('Ошибка чтения файла', 'error', 'Ошибка');
    };
    reader.readAsText(file);
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') {
      showToast('Библиотека XLSX не загружена', 'error', 'Ошибка');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const result = {};
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          result[sheetName] = XLSX.utils.sheet_to_json(sheet);
        });
        currentData = result;
        renderProcessedData(result, fileName);
        showToast(`Excel файл "${fileName}" успешно загружен`, 'success', 'Успешно');
      } catch (err) {
        showToast(`Ошибка чтения Excel: ${err.message}`, 'error', 'Ошибка');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    showToast('Пожалуйста, выберите файл с расширением .json или .xlsx', 'error', 'Неверный формат');
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
      showToast('Пример "data_export.json" успешно загружен в исходные данные', 'success', 'Загружено');
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

  // Update header badges
  const cableBadgeTotal = document.getElementById('cableBadgeTotal');
  if (cableBadgeTotal) {
    cableBadgeTotal.textContent = `${totalCablesCount} шт. / ${Math.round(totalCableLength).toLocaleString('ru-RU')} м`;
    cableBadgeTotal.classList.remove('d-none');
  }
  const routingBadgeTotal = document.getElementById('routingBadgeTotal');
  if (routingBadgeTotal) {
    routingBadgeTotal.textContent = `${totalRoutingCount} шт. / ${Math.round(totalRoutingLength).toLocaleString('ru-RU')} м`;
    routingBadgeTotal.classList.remove('d-none');
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

  // Count mismatches
  const mismatchCount = cables.filter(c => Boolean(c.lengthMismatch)).length;

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-responsive custom-table-scroll';

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover table-striped mb-0 text-start align-middle';
  table.id = 'tableCables';

  // Table header - NO TRUNCATION
  table.innerHTML = `
    <thead class="table-sticky-header">
      <tr>
        <th style="width: 45px;" class="text-center">№</th>
        <th style="width: 85px;">handle</th>
        <th style="min-width: 130px;">Обозначение</th>
        <th style="width: 90px;" class="text-end">Длина,м</th>
        <th style="min-width: 110px;">Тип кабеля</th>
        <th style="min-width: 210px;">Способ прокладки</th>
        <th style="width: 90px;" class="text-center">Соответствие длин</th>
        <th class="action-col d-none" style="width: 40px;"></th>
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
    if (c['routing type'] && typeof c['routing type'] === 'object') {
      const entries = Object.entries(c['routing type']);
      if (entries.length > 0) {
        routingHtml = `<div class="d-flex flex-wrap gap-1 cell-wrap py-1">` + 
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
      ? '<span class="d-inline-flex align-items-center justify-content-center text-danger" title="Несоответствие длины трассы" data-bs-toggle="tooltip"><i class="bx bx-error fs-4"></i></span>' 
      : '<span class="d-inline-flex align-items-center justify-content-center text-success" title="Длина соответствует" data-bs-toggle="tooltip"><i class="bx bx-check fs-4"></i></span>';

    const rawType = c.type || '';
    const normType = normalizeCableType(rawType);
    const typeTitleAttr = (normType && normType !== rawType.trim())
      ? ` title="Марка кабеля при расчете: ${escapeHtml(normType)}"`
      : '';

    row.innerHTML = `
      <td class="text-muted small text-center">${idx + 1}</td>
      <td class="font-monospace text-muted small cell-wrap">${escapeHtml(c.handle || '')}</td>
      <td class="fw-bold canEdit cell-wrap" data-field="cable">${escapeHtml(c.cable || '')}</td>
      <td class="canEdit text-end font-monospace fw-semibold" data-field="length">${c.length ?? 0}</td>
      <td class="canEdit cell-wrap" data-field="type"${typeTitleAttr}>${escapeHtml(rawType)}</td>
      <td class="cell-wrap">${routingHtml}</td>
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

  const mismatchBadgeHeader = mismatchCount > 0
    ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle d-inline-flex align-items-center">
        <i class='bx bx-error me-1'></i>Несоответствий: ${mismatchCount}
       </span>`
    : `<span class="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center">
        <i class='bx bx-check me-1'></i>Несоответствий: 0
       </span>`;

  accItem.innerHTML = `
    <h2 class="accordion-header" id="${headerId}">
      <button class="accordion-button py-2 px-3 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="true" aria-controls="${collapseId}">
        <div class="d-flex align-items-center justify-content-between w-100 me-2">
          <div class="d-flex align-items-center gap-2">
            <i class='bx bx-git-branch text-primary fs-4'></i>
            <span>Кабели</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            ${mismatchBadgeHeader}
            <span class="badge bg-primary-subtle text-primary border">${cables.length} шт. / ${Math.round(totalLength).toLocaleString('ru-RU')} м</span>
          </div>
        </div>
      </button>
    </h2>
    <div id="${collapseId}" class="accordion-collapse collapse show" aria-labelledby="${headerId}">
      <div class="accordion-body p-0">
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
  let headerHtml = '<tr><th style="width: 45px;" class="text-center">№</th>';
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
      rowHtml += `<td class="canEdit cell-wrap" data-field="${escapeHtml(k)}">${escapeHtml(String(val ?? ''))}</td>`;
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

  const cableBadgeTotal = document.getElementById('cableBadgeTotal');
  if (cableBadgeTotal) cableBadgeTotal.classList.add('d-none');

  const routingBadgeTotal = document.getElementById('routingBadgeTotal');
  if (routingBadgeTotal) routingBadgeTotal.classList.add('d-none');

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
        <h4 class="mb-1 fw-bold fs-5">Загрузите файл с исходными данными</h4>
        <p class="text-muted fs-sm mb-4 mx-auto" style="max-width: 460px;">
          Перетащите файл <code>.json</code> сюда или нажмите кнопку для выбора на устройстве. Вся информация отобразится в развернутом виде без сокращений.
        </p>
        <div class="d-flex justify-content-center gap-2 flex-wrap">
          <label for="input" class="btn btn-primary px-3 mb-0 d-inline-flex align-items-center gap-2 shadow-sm" style="cursor: pointer;">
            <i class='bx bx-folder-open fs-5'></i>Выбрать JSON файл
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
        <i class='bx bx-calculator fs-1 mb-2 text-secondary opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Сводка по кабелям</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы сгруппировать кабели по маркоразмерам и суммировать длины</p>
      </div>
    `;
  }
  const resultCouplings = document.getElementById('resultCouplings');
  if (resultCouplings) {
    resultCouplings.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class='bx bx-layer fs-1 mb-2 text-secondary opacity-50 d-block'></i>
        <div class="fw-medium mb-1">Сводка по траншеям</div>
        <p class="small text-muted mb-0 px-2">Нажмите «Расчет», чтобы сгруппировать типы траншей и трасс с подсчетом метража</p>
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
 * 2. При определении типа кабеля отбрасывается значение в скобках с числом жил запаса
 *    в конце строки (или непосредственно перед условными знаками чертежа: *, **, #, &, Δ и т.д.).
 * 3. Если число или значение в скобках находится НЕ в конце (например, в середине марки:
 *    «кабель-4/2(2)хх-16», «(2,0)» или «ВВГнг(А)-LS»), оно не является запасом жил и НЕ отбрасывается.
 */
function normalizeCableType(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') return typeStr || 'Без типа';
  const str = typeStr.trim();
  if (!str) return 'Без типа';

  // Отбрасываем (число) только в конце строки или перед сносками чертежа (*, **, #, &, \U+..., Δ)
  const cleaned = str.replace(/\s*\(\d+\)(?=(?:\s*(?:[*#&^~!Δ§†‡№]|\\U\+[0-9a-fA-F]+))*$)/g, '').trim();
  return cleaned || str || 'Без типа';
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
        const length = parseFloat(lengthCell.textContent.replace(/\s+/g, '')) || 0;

        if (!cableSummary[type]) {
          cableSummary[type] = { count: 0, length: 0, routingTypes: {} };
        }
        cableSummary[type].count += 1;
        cableSummary[type].length += length;
        grandTotalCableCount += 1;
        grandTotalCableLength += length;

        // Extract routing type for this cable row
        const cableObj = row._cableData || (currentData && currentData.cables && currentData.cables[row.dataset.index]);
        const rtObj = (cableObj && (cableObj['routing type'] || cableObj.routingType)) || {};
        let hasRouting = false;

        for (const [rName, lengths] of Object.entries(rtObj)) {
          const arr = Array.isArray(lengths) ? lengths : [lengths];
          const sum = arr.reduce((acc, val) => acc + (Number(val) || 0), 0);
          if (sum > 0 || arr.length > 0) {
            hasRouting = true;
            cableSummary[type].routingTypes[rName] = (cableSummary[type].routingTypes[rName] || 0) + sum;
            grandRoutingSummary[rName] = (grandRoutingSummary[rName] || 0) + sum;
          }
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

      const rtObj = c['routing type'] || c.routingType || {};
      let hasRouting = false;

      for (const [rName, lengths] of Object.entries(rtObj)) {
        const arr = Array.isArray(lengths) ? lengths : [lengths];
        const sum = arr.reduce((acc, val) => acc + (Number(val) || 0), 0);
        if (sum > 0 || arr.length > 0) {
          hasRouting = true;
          cableSummary[type].routingTypes[rName] = (cableSummary[type].routingTypes[rName] || 0) + sum;
          grandRoutingSummary[rName] = (grandRoutingSummary[rName] || 0) + sum;
        }
      }

      if (!hasRouting && length > 0) {
        const fallbackName = 'Не определен';
        cableSummary[type].routingTypes[fallbackName] = (cableSummary[type].routingTypes[fallbackName] || 0) + length;
        grandRoutingSummary[fallbackName] = (grandRoutingSummary[fallbackName] || 0) + length;
      }
    });
  }

  renderCableResult(cableSummary, grandTotalCableCount, grandTotalCableLength, grandRoutingSummary);

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
        const length = parseFloat(lengthCell.textContent.replace(/\s+/g, '')) || 0;

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

  renderRoutingResult(routingSummary, grandTotalRoutingCount, grandTotalRoutingLength);
  showToast('Расчет объемов успешно выполнен', 'success', 'Расчет завершен');
}

function renderCableResult(summary, totalCount, totalLength, grandRoutingSummary) {
  const container = document.getElementById('result');
  if (!container) return;

  const entries = Object.entries(summary).sort((a, b) => b[1].length - a[1].length);

  let rowsHtml = '';
  entries.forEach(([type, val], idx) => {
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
        <td class="fw-bold cell-wrap">${escapeHtml(type)}</td>
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
    <div class="mb-3 d-flex flex-wrap gap-2">
      <div class="stat-summary-card flex-fill text-center">
        <div class="text-muted small text-uppercase fs-xs">Длина кабелей</div>
        <div class="fw-bold fs-5 text-primary font-monospace">${Math.round(totalLength).toLocaleString('ru-RU')} <span class="fs-xs fw-normal text-muted">м</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center">
        <div class="text-muted small text-uppercase fs-xs">Всего ниток</div>
        <div class="fw-bold fs-5 font-monospace">${totalCount} <span class="fs-xs fw-normal text-muted">шт</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center">
        <div class="text-muted small text-uppercase fs-xs">Типов кабеля</div>
        <div class="fw-bold fs-5 font-monospace">${entries.length}</div>
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
            <th style="min-width: 220px;">Способы прокладки</th>
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
    <div class="mb-3 d-flex flex-wrap gap-2">
      <div class="stat-summary-card flex-fill text-center">
        <div class="text-muted small text-uppercase fs-xs">Длина трасс</div>
        <div class="fw-bold fs-5 text-info-emphasis font-monospace">${Math.round(totalLength).toLocaleString('ru-RU')} <span class="fs-xs fw-normal text-muted">м</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center">
        <div class="text-muted small text-uppercase fs-xs">Участков</div>
        <div class="fw-bold fs-5 font-monospace">${totalCount} <span class="fs-xs fw-normal text-muted">шт</span></div>
      </div>
      <div class="stat-summary-card flex-fill text-center">
        <div class="text-muted small text-uppercase fs-xs">Типов траншей</div>
        <div class="fw-bold fs-5 font-monospace">${entries.length}</div>
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
}

// Export current data as JSON
function exportCurrentDataJSON() {
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

// Export calculation results to Excel
function exportCalculationResults() {
  if (typeof XLSX === 'undefined') {
    showToast('Библиотека XLSX недоступна', 'error', 'Ошибка');
    return;
  }
  const resCable = document.querySelector('#result table');
  const resRouting = document.querySelector('#resultCouplings table');

  if (!resCable && !resRouting) {
    showToast('Сначала выполните расчет для экспорта результатов', 'error', 'Ошибка');
    return;
  }

  const wb = XLSX.utils.book_new();
  if (resCable) {
    const ws1 = XLSX.utils.table_to_sheet(resCable);
    XLSX.utils.book_append_sheet(wb, ws1, 'Ведомость кабелей');
  }
  if (resRouting) {
    const ws2 = XLSX.utils.table_to_sheet(resRouting);
    XLSX.utils.book_append_sheet(wb, ws2, 'Ведомость траншей');
  }
  XLSX.writeFile(wb, 'Результаты_расчета_ВОР.xlsx');
  showToast('Результаты расчета успешно экспортированы в Excel', 'success', 'Экспорт');
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
