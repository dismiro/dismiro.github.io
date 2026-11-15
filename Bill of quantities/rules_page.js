/**
 * Bill of quantities - Dedicated Rules & Catalog Page Controller
 * Controls rules.html: tab switching, sidebar navigation, JSON preview lifecycle,
 * hotkeys, and integration with rulesStore.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Rules from store
  let rules = null;
  try {
    rules = await window.rulesStore.loadRules();
  } catch (err) {
    console.error('[rules_page] Ошибка загрузки правил:', err);
  }

  // 2. Setup Tab & Hash Navigation
  setupSidebarNavigation();

  // 3. Setup Toolbar & Hotkeys
  setupPageActions();

  // 4. Initial Render
  if (rules) {
    applyRulesToPage(rules, { resetDirty: false });
  }

  // 5. Setup Modal and Rules Event Listeners
  if (typeof setupWorksRulesListeners === 'function') {
    try {
      setupWorksRulesListeners();
    } catch (e) {
      console.warn('[rules_page] Предупреждение инициализации слушателей:', e);
    }
  }

  // 6. Listen for Store updates
  window.rulesStore.subscribe((event) => {
    if (event && event.type === 'external-storage-change' && event.rules) {
      applyRulesToPage(event.rules, { resetDirty: true });
      return;
    }
    if (event && event.rules) {
      window.currentWorksRules = event.rules;
      if (typeof setModalDraftRules === 'function') setModalDraftRules(event.rules);
    }
    if (typeof updateStorageStatusUi === 'function') {
      updateStorageStatusUi();
    }
  });
});

function applyRulesToPage(rulesData, { resetDirty = true } = {}) {
  const cloned = (rulesData && typeof rulesData === 'object')
    ? JSON.parse(JSON.stringify(rulesData))
    : {};
  window.currentWorksRules = cloned;
  if (typeof setModalDraftRules === 'function') setModalDraftRules(cloned);
  if (typeof setWorksJsonEditorValue === 'function') {
    setWorksJsonEditorValue(JSON.stringify(cloned, null, 2));
  }
  hideSaveValidationError();
  if (typeof validateWorksJsonInput === 'function') {
    validateWorksJsonInput();
  }
  if (typeof renderRulesModalContent === 'function') {
    renderRulesModalContent(cloned, true);
  }
  if (resetDirty && typeof setDraftDirtyState === 'function') {
    setDraftDirtyState(false);
  }
  if (typeof updateStorageStatusUi === 'function') {
    updateStorageStatusUi();
  }
}



/**
 * Connects sidebar links to Bootstrap tab panes and URL hash.
 */
function setupSidebarNavigation() {
  const pills = document.querySelectorAll('#rulesNavList .rules-nav-pill');
  const panes = document.querySelectorAll('#worksRulesTabContent .tab-pane');

  function activateTab(targetPaneId, updateHash = true) {
    pills.forEach(p => {
      if (p.getAttribute('data-pane') === targetPaneId) {
        p.classList.add('active');
        if (updateHash) {
          const hash = p.getAttribute('href');
          if (hash && window.history.replaceState) {
            window.history.replaceState(null, '', hash);
          }
        }
      } else {
        p.classList.remove('active');
      }
    });

    panes.forEach(pane => {
      if (pane.id === targetPaneId) {
        pane.classList.add('show', 'active');
      } else {
        pane.classList.remove('show', 'active');
      }
    });

    // Update JSON preview if switching to JSON tab
    if (targetPaneId === 'tabWorksJsonPane') {
      const draft = (typeof getDraftRulesFromEditor === 'function') ? getDraftRulesFromEditor() : window.currentWorksRules;
      if (typeof setWorksJsonEditorValue === 'function') {
        setWorksJsonEditorValue(JSON.stringify(draft || {}, null, 2));
      }
    }

    // Refresh Settings form if switching to Settings tab
    if (targetPaneId === 'tabWorksSettingsPane' && typeof renderSettingsModalContent === 'function') {
      renderSettingsModalContent(getDraftRulesFromEditor ? getDraftRulesFromEditor() : window.currentWorksRules);
    }
  }

  pills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPane = pill.getAttribute('data-pane');
      if (targetPane) {
        activateTab(targetPane, true);
      }
    });
  });

  // Handle URL hash on initial load
  const hash = window.location.hash;
  const hashToPane = {
    '#construction': 'tabWorksConstructionPane',
    '#installation': 'tabWorksInstallationPane',
    '#equipment': 'tabWorksEquipmentPane',
    '#cables': 'tabWorksCablesPane',
    '#couplings': 'tabWorksCouplingsPane',
    '#settings': 'tabWorksSettingsPane',
    '#json': 'tabWorksJsonPane',
    '#editor': 'tabWorksJsonPane'
  };

  if (hash && hashToPane[hash]) {
    activateTab(hashToPane[hash], false);
  } else {
    // Default to construction pane
    activateTab('tabWorksConstructionPane', false);
  }
}

/**
 * Connects toolbar buttons and Ctrl+S hotkey.
 */
function setupPageActions() {
  const btnSave = document.getElementById('btnSaveRulesHeader');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      saveRulesFromPage();
    });
  }

  // File import
  const fileInput = document.getElementById('rulesFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const imported = await window.rulesStore.importRulesJsonFile(file);
        window.currentWorksRules = imported;
        if (typeof setModalDraftRules === 'function') setModalDraftRules(imported);
        setWorksJsonEditorValue(JSON.stringify(imported, null, 2));
        validateWorksJsonInput();
        renderRulesModalContent(imported);
        if (typeof setDraftDirtyState === 'function') setDraftDirtyState(false);
        updateStorageStatusUi();
        showToast(`Сметные нормы из «${file.name}» успешно импортированы и сохранены.`, 'success', 'Импорт завершен');
      } catch (err) {
        showToast('Ошибка импорта: ' + err.message, 'error', 'Ошибка файла');
      } finally {
        e.target.value = '';
      }
    });

    const btnImportDropdown = document.getElementById('btnImportRulesDropdown');
    if (btnImportDropdown) {
      btnImportDropdown.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });
    }
  }

  // Export
  const btnDownload = document.getElementById('downloadRulesBtn');
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      try {
        const currentDraft = (typeof getDraftRulesFromEditor === 'function')
          ? getDraftRulesFromEditor()
          : (window.currentWorksRules || window.rulesStore.getRulesSync());
        window.rulesStore.exportRulesJson('works_rules.json', currentDraft);
        showToast('Файл works_rules.json успешно экспортирован.', 'success', 'Экспорт');
      } catch (err) {
        showToast('Ошибка экспорта: ' + err.message, 'error', 'Ошибка');
      }
    });
  }

  // Reset
  const btnReset = document.getElementById('resetRulesBtn');
  const confirmResetModalEl = document.getElementById('confirmResetRulesModal');
  const btnConfirmReset = document.getElementById('btnConfirmResetRules');

  async function executeFactoryReset() {
    const origHtml = btnConfirmReset ? btnConfirmReset.innerHTML : '';
    if (btnConfirmReset) {
      btnConfirmReset.disabled = true;
      btnConfirmReset.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Сброс...`;
    }
    try {
      const defaultData = await window.rulesStore.resetToDefaultRules();
      applyRulesToPage(defaultData, { resetDirty: true });
      if (confirmResetModalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(confirmResetModalEl).hide();
      }
      showToast('Сметные правила сброшены к заводским настройкам (works_rules.json).', 'info', 'Сброс выполнен');
    } catch (err) {
      showToast('Ошибка сброса: ' + err.message, 'error', 'Ошибка');
    } finally {
      if (btnConfirmReset) {
        btnConfirmReset.disabled = false;
        btnConfirmReset.innerHTML = origHtml;
      }
    }
  }

  if (btnConfirmReset) {
    btnConfirmReset.addEventListener('click', executeFactoryReset);
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const dropdownBtn = document.getElementById('rulesActionsDropdownBtn');
      if (dropdownBtn && window.bootstrap && bootstrap.Dropdown) {
        const dropdownInstance = bootstrap.Dropdown.getInstance(dropdownBtn);
        if (dropdownInstance) dropdownInstance.hide();
      }
      if (confirmResetModalEl && window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(confirmResetModalEl).show();
      } else {
        executeFactoryReset();
      }
    });
  }

  // Keyboard shortcut Ctrl+S / Cmd+S
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveRulesFromPage();
    }
  });
}

function showSaveValidationError(message, title = 'Ошибка в данных') {
  const badge = document.getElementById('worksJsonValidationBadge');
  const badgeText = document.getElementById('worksJsonValidationText');
  if (badge) {
    badge.classList.remove('d-none');
    badge.classList.add('d-inline-flex');
    badge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle d-inline-flex align-items-center gap-1 shadow-sm';
    badge.title = message;
    if (badgeText) {
      badgeText.textContent = message;
    } else {
      badge.innerHTML = `<i class='bx bx-error-circle flex-shrink-0'></i><span class="text-truncate">${escapeHtml(message)}</span>`;
    }
  }
  if (typeof showToast === 'function') {
    showToast(message, 'warning', title, 6000);
  }
}

function hideSaveValidationError() {
  const badge = document.getElementById('worksJsonValidationBadge');
  if (badge) {
    badge.classList.add('d-none');
    badge.classList.remove('d-inline-flex');
  }
}

function saveRulesFromPage() {
  const draft = typeof getDraftRulesFromEditor === 'function' ? getDraftRulesFromEditor() : window.currentWorksRules;

  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    showSaveValidationError('Некорректная структура правил: данные должны быть JSON-объектом', 'Ошибка данных');
    return;
  }

  const keys = Object.keys(draft);
  if (keys.length === 0) {
    showSaveValidationError('Правила пусты. Сохранение отменено.', 'Пустые правила');
    return;
  }

  try {
    window.rulesStore.saveRules(draft);
    hideSaveValidationError();
    if (typeof setDraftDirtyState === 'function') {
      setDraftDirtyState(false);
    }
    if (typeof updateStorageStatusUi === 'function') {
      updateStorageStatusUi();
    }
    if (typeof showToast === 'function') {
      showToast('Сметные правила и справочники успешно сохранены в LocalStorage.', 'success', 'Правила сохранены', 3500);
    }
  } catch (err) {
    showSaveValidationError(`Ошибка сохранения: ${err.message}`, 'Ошибка');
  }
}
