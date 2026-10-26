/**
 * Bill of quantities - Dedicated Rules & Catalog Page Controller
 * Controls rules.html: tab switching, sidebar navigation, CodeMirror lifecycle,
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
    window.currentWorksRules = rules;
    setWorksJsonEditorValue(JSON.stringify(rules, null, 2));
    validateWorksJsonInput();
    renderRulesModalContent(rules);
    updateStorageStatusUi();
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
    updateStorageStatusUi();
  });
});

function updateJsonLinesCount() {
  const badge = document.getElementById('jsonLinesCountBadge');
  const codeEl = document.getElementById('worksJsonPreviewCode');
  if (badge && codeEl) {
    const lines = (codeEl.textContent || '').split('\n').length;
    badge.textContent = `${lines} строк`;
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
        setWorksJsonEditorValue(JSON.stringify(imported, null, 2));
        validateWorksJsonInput();
        renderRulesModalContent(imported);
        updateStorageStatusUi();
        showToast(`Сметные нормы из «${file.name}» успешно импортированы и сохранены.`, 'success', 'Импорт завершен');
      } catch (err) {
        showToast('Ошибка импорта: ' + err.message, 'error', 'Ошибка файла');
      } finally {
        e.target.value = '';
      }
    });
  }

  // Export
  const btnDownload = document.getElementById('downloadRulesBtn');
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      try {
        window.rulesStore.exportRulesJson('works_rules.json');
        showToast('Файл works_rules.json успешно экспортирован.', 'success', 'Экспорт');
      } catch (err) {
        showToast('Ошибка экспорта: ' + err.message, 'error', 'Ошибка');
      }
    });
  }

  // Reset
  const btnReset = document.getElementById('resetRulesBtn');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (!confirm('Вы уверены, что хотите сбросить все правила к заводским works_rules.json? Все сохраненные изменения в браузере будут удалены.')) {
        return;
      }
      try {
        const defaultData = await window.rulesStore.resetToDefaultRules();
        setWorksJsonEditorValue(JSON.stringify(defaultData, null, 2));
        validateWorksJsonInput();
        renderRulesModalContent(defaultData);
        updateStorageStatusUi();
        showToast('Сметные правила сброшены к заводским настройкам.', 'info', 'Сброс выполнен');
      } catch (err) {
        showToast('Ошибка сброса: ' + err.message, 'error', 'Ошибка');
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
