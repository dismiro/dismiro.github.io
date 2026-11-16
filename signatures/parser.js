(function (global) {
  'use strict';

  function normalizeText(str) {
    return String(str || '')
      .replace(/\u00A0/g, ' ')
      .replace(/ё/g, 'е')
      .replace(/Ё/g, 'Е')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function cleanValue(str) {
    return String(str || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseCsvText(text) {
    const cleanText = String(text || '').replace(/^\uFEFF/, '');
    const firstLines = cleanText.split(/\r?\n/).slice(0, 5).join('\n');
    const semiCount = (firstLines.match(/;/g) || []).length;
    const commaCount = (firstLines.match(/,/g) || []).length;
    const tabCount = (firstLines.match(/\t/g) || []).length;

    let delimiter = ',';
    if (tabCount > semiCount && tabCount > commaCount) {
      delimiter = '\t';
    } else if (semiCount >= commaCount && semiCount > 0) {
      delimiter = ';';
    }

    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const ch = cleanText[i];
      const next = cleanText[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  }

  function readFileAsTextWithEncoding(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Файл не выбран'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.onload = (event) => {
        try {
          const buffer = event.target.result;
          const uint8 = new Uint8Array(buffer);

          if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
            return resolve(new TextDecoder('utf-8').decode(uint8.subarray(3)).replace(/^\uFEFF/, ''));
          }
          if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
            return resolve(new TextDecoder('utf-16le').decode(uint8.subarray(2)).replace(/^\uFEFF/, ''));
          }
          if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
            return resolve(new TextDecoder('utf-16be').decode(uint8.subarray(2)).replace(/^\uFEFF/, ''));
          }

          try {
            const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
            return resolve(utf8.replace(/^\uFEFF/, ''));
          } catch (e) {
            try {
              const win1251 = new TextDecoder('windows-1251').decode(uint8);
              return resolve(win1251.replace(/^\uFEFF/, ''));
            } catch (err) {
              return resolve(new TextDecoder('utf-8').decode(uint8).replace(/^\uFEFF/, ''));
            }
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function parseX509Subject(subjectStr) {
    const raw = cleanValue(subjectStr);
    const fields = {};
    if (!raw) {
      return { raw: '', cn: '', sn: '', g: '', email: '', org: '', title: '', fields };
    }

    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        current += ch;
      } else if (ch === ',' && !inQuotes) {
        const rest = raw.slice(i + 1).trim();
        if (/^[A-Za-zА-Яа-яЁё0-9._-]+\s*=/.test(rest)) {
          parts.push(current.trim());
          current = '';
          continue;
        }
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    parts.forEach((part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) return;
      const key = part.slice(0, eqIdx).trim().toUpperCase();
      let val = part.slice(eqIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.slice(1, -1).trim();
      }
      if (!fields[key]) {
        fields[key] = val;
      }
    });

    const cn = fields.CN || '';
    const sn = fields.SN || fields.SURNAME || '';
    const g = fields.G || fields.GIVENNAME || '';
    const email = fields.E || fields.EMAIL || fields.EMAILADDRESS || '';
    const org = fields.O || '';
    const title = fields.T || fields.TITLE || '';

    let fullName = cn;
    if (!fullName && (sn || g)) {
      fullName = [sn, g].filter(Boolean).join(' ').trim();
    }
    if (!fullName) {
      fullName = raw;
    }

    const surname = sn || (fullName ? fullName.split(/\s+/)[0] : '');
    const givenName = g || (fullName ? fullName.split(/\s+/).slice(1).join(' ') : '');

    return {
      raw,
      cn,
      sn,
      g,
      fullName,
      surname,
      givenName,
      email,
      org,
      title,
      fields
    };
  }

  function parseDateValue(input) {
    if (input === null || input === undefined || input === '') return null;

    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }

    if (typeof input === 'number' && !isNaN(input) && input > 20000 && input < 100000) {
      if (global.XLSX && global.XLSX.SSF && typeof global.XLSX.SSF.parse_date_code === 'function') {
        const d = global.XLSX.SSF.parse_date_code(input);
        if (d && d.y && d.m && d.d) {
          return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
        }
      }
      const utcDays = Math.floor(input - 25569);
      const frac = input - Math.floor(input);
      const totalSeconds = Math.round(frac * 86400);
      const date = new Date(utcDays * 86400 * 1000);
      date.setUTCHours(Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60, 0);
      return isNaN(date.getTime()) ? null : new Date(
        date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
        date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()
      );
    }

    const s = cleanValue(String(input));
    if (!s) return null;

    const ruMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ruMatch) {
      const day = parseInt(ruMatch[1], 10);
      const month = parseInt(ruMatch[2], 10);
      const year = parseInt(ruMatch[3], 10);
      const hour = ruMatch[4] ? parseInt(ruMatch[4], 10) : 23;
      const min = ruMatch[5] ? parseInt(ruMatch[5], 10) : 59;
      const sec = ruMatch[6] ? parseInt(ruMatch[6], 10) : 59;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(year, month - 1, day, hour, min, sec);
        if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
          return dt;
        }
      }
    }

    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 23;
      const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 59;
      const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 59;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(year, month - 1, day, hour, min, sec);
        if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
          return dt;
        }
      }
    }

    if (/^\d{5}(?:\.\d+)?$/.test(s)) {
      return parseDateValue(parseFloat(s));
    }

    return null;
  }

  function formatDateDisplay(dateObj, rawFallback) {
    if (!dateObj || isNaN(dateObj.getTime())) {
      return cleanValue(rawFallback) || '—';
    }
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    const hasExplicitTime = !(hh === '23' && min === '59' && dateObj.getSeconds() === 59);
    if (hasExplicitTime) {
      return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
    }
    return `${dd}.${mm}.${yyyy}`;
  }

  function evaluateCertificateValidity(validToDate, referenceNow) {
    const now = referenceNow instanceof Date ? referenceNow : new Date();
    if (!validToDate || isNaN(validToDate.getTime())) {
      return {
        certStatus: 'unknown',
        label: 'Дата не распознана',
        daysLeft: null
      };
    }

    const diffMs = validToDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / 86400000);

    if (diffMs < 0) {
      const overdueDays = Math.max(0, Math.floor((now.getTime() - validToDate.getTime()) / 86400000));
      return {
        certStatus: 'expired',
        label: overdueDays > 0 ? `Просрочен (${overdueDays} дн. назад)` : 'Просрочен',
        daysLeft
      };
    }

    if (daysLeft <= 30) {
      return {
        certStatus: 'expiring_soon',
        label: daysLeft <= 1 ? 'Истекает сегодня/завтра' : `Истекает через ${daysLeft} дн.`,
        daysLeft
      };
    }

    return {
      certStatus: 'valid',
      label: 'Действителен',
      daysLeft
    };
  }

  const DOC_HEADER_ALIASES = {
    fileName: ['наименование файла', 'имя файла', 'файл'],
    projectCode: ['шифр проекта', 'шифр'],
    projectName: ['наименование проекта', 'проект'],
    contractNumber: ['№ договора', 'номер договора', 'договор'],
    stageNumber: ['№ этапа', 'номер этапа', 'этап'],
    docName: ['наименование документа', 'документ']
  };

  function matchHeaderRowToColMap(row) {
    if (!Array.isArray(row)) return null;
    const colMap = {};
    let matches = 0;

    row.forEach((cellVal, cIdx) => {
      const norm = normalizeText(cellVal);
      if (!norm) return;

      let bestField = null;
      let bestScore = -1;

      Object.entries(DOC_HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        aliases.forEach((alias) => {
          if (norm === alias) {
            const score = 1000 + alias.length;
            if (score > bestScore) {
              bestScore = score;
              bestField = fieldKey;
            }
          } else if (norm.includes(alias)) {
            const score = alias.length;
            if (score > bestScore) {
              bestScore = score;
              bestField = fieldKey;
            }
          }
        });
      });

      if (bestField && colMap[bestField] === undefined) {
        colMap[bestField] = cIdx;
        matches++;
      }
    });

    return matches >= 2 ? colMap : null;
  }

  function looksLikeProtocolLineText(text) {
    const norm = normalizeText(text);
    if (!norm) return false;
    return /^(?:время подписи|формат подписи|информация о сертификате|субъект\s*:|издатель\s*:|действует с\s*:|действует до\s*:|серийный номер\s*:|отпечаток|подпись\s+(?:действительна|недействительна|не\s+найдена|проверена))/.test(norm);
  }

  function extractDocMetaFromRow(row, colMap) {
    if (!Array.isArray(row) || !colMap) return null;
    const fileCol = colMap.fileName !== undefined ? colMap.fileName : 0;
    const fileVal = cleanValue(row[fileCol]);
    if (!fileVal || looksLikeProtocolLineText(fileVal)) return null;

    // Count how many mapped metadata columns have non-empty values in this row
    let populatedMappedCols = 0;
    const meta = {
      fileName: fileVal,
      projectCode: '',
      projectName: '',
      contractNumber: '',
      stageNumber: '',
      docName: '',
      overallStatus: ''
    };

    Object.entries(colMap).forEach(([fieldKey, cIdx]) => {
      const val = cleanValue(row[cIdx]);
      if (val) populatedMappedCols++;
      meta[fieldKey] = val;
    });

    const looksLikeFileName = /\.(pdf|docx?|xlsx?|dwg|dxf|tif|tiff|png|jpg|jpeg|xml|sig|p7s|txt|zip|rar)$/i.test(fileVal);
    if (populatedMappedCols >= 2 || looksLikeFileName) {
      return meta;
    }

    return null;
  }

  function rowToProtocolLines(row, rIdx) {
    const out = [];
    if (!Array.isArray(row)) return out;

    const nonEmpty = row
      .map((cell) => ({ raw: cell, str: String(cell === null || cell === undefined ? '' : cell).trim() }))
      .filter((item) => item.str !== '');

    if (nonEmpty.length === 0) return out;

    // Two-column key/value row (e.g. ["Действует до:", "13.03.2027 06:21:15"])
    if (nonEmpty.length === 2 && !nonEmpty[0].str.includes('\n')) {
      const keyCand = nonEmpty[0].str.replace(/:$/, '').trim();
      const keyNorm = normalizeText(keyCand);
      const knownKeys = [
        'время подписи по гринвичу', 'время подписи по мск', 'время подписи',
        'формат подписи', 'субъект', 'издатель', 'действует с', 'действует до',
        'серийный номер', 'отпечаток сертификата', 'отпечаток',
        'наименование файла', 'шифр проекта', 'наименование проекта',
        '№ договора', '№ этапа', 'наименование документа'
      ];
      if (knownKeys.some((k) => keyNorm === k || keyNorm.startsWith('информация о сертификате'))) {
        let valPart = nonEmpty[1].raw;
        if (typeof valPart === 'number' && (keyNorm === 'действует с' || keyNorm === 'действует до' || keyNorm.startsWith('время подписи'))) {
          const parsed = parseDateValue(valPart);
          valPart = parsed ? formatDateDisplay(parsed, '') : String(valPart);
        }
        out.push({ text: `${keyCand}: ${cleanValue(valPart)}`, rowIndex: rIdx });
        return out;
      }
    }

    nonEmpty.forEach((item) => {
      const subLines = item.str.split(/\r?\n/);
      subLines.forEach((sl) => {
        const cleaned = sl.trim();
        if (cleaned) {
          out.push({ text: cleaned, rowIndex: rIdx });
        }
      });
    });

    return out;
  }

  function parseProtocolDocuments(rows, referenceNow) {
    const documents = [];
    let activeColMap = null;

    let currentDoc = null;
    let pendingPre = { signedAtUtc: '', signedAtMsk: '', signatureFormat: '' };
    let currentCert = null;

    function createEmptyDoc(metaOverride, fallbackIndex) {
      return {
        index: fallbackIndex,
        id: `doc_${fallbackIndex}`,
        docMeta: Object.assign({
          fileName: '',
          projectCode: '',
          projectName: '',
          contractNumber: '',
          stageNumber: '',
          docName: '',
          overallStatus: ''
        }, metaOverride || {}),
        certificates: []
      };
    }

    function commitCert() {
      if (!currentCert) return;
      if (currentCert.subjectRaw || currentCert.fullName || currentCert.validToRaw || currentCert.serialNumber) {
        if (!currentDoc) {
          currentDoc = createEmptyDoc({ fileName: 'Отчет о подписании' }, documents.length);
        }

        const subj = parseX509Subject(currentCert.subjectRaw);
        currentCert.fullName = currentCert.fullName || subj.fullName;
        currentCert.surname = currentCert.surname || subj.surname;
        currentCert.givenName = currentCert.givenName || subj.givenName;
        currentCert.email = currentCert.email || subj.email;
        currentCert.org = currentCert.org || subj.org;
        currentCert.title = currentCert.title || subj.title;

        if (currentCert.issuerRaw) {
          const iss = parseX509Subject(currentCert.issuerRaw);
          currentCert.issuerShort = iss.cn || iss.org || currentCert.issuerRaw;
        }

        const validity = evaluateCertificateValidity(currentCert.validToDate, referenceNow);
        currentCert.certStatus = validity.certStatus;
        currentCert.validityLabel = validity.label;
        currentCert.daysLeft = validity.daysLeft;
        currentCert.validToDisplay = formatDateDisplay(currentCert.validToDate, currentCert.validToRaw);
        currentCert.validFromDisplay = formatDateDisplay(currentCert.validFromDate, currentCert.validFromRaw);

        currentDoc.certificates.push(currentCert);
      }
      currentCert = null;
    }

    function commitDoc() {
      commitCert();
      pendingPre = { signedAtUtc: '', signedAtMsk: '', signatureFormat: '' };
      if (currentDoc && (currentDoc.docMeta.fileName || currentDoc.docMeta.docName || currentDoc.certificates.length > 0)) {
        documents.push(currentDoc);
      }
      currentDoc = null;
    }

    function createCert(certNum, rowIndex) {
      return {
        certNumber: certNum || ((currentDoc ? currentDoc.certificates.length : 0) + 1),
        signedAtUtc: pendingPre.signedAtUtc || '',
        signedAtMsk: pendingPre.signedAtMsk || '',
        signatureFormat: pendingPre.signatureFormat || '',
        subjectRaw: '',
        fullName: '',
        surname: '',
        givenName: '',
        email: '',
        org: '',
        title: '',
        issuerRaw: '',
        issuerShort: '',
        validFromRaw: '',
        validFromDate: null,
        validToRaw: '',
        validToDate: null,
        serialNumber: '',
        thumbprint: '',
        rowIndex: rowIndex || 0
      };
    }

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.every((c) => cleanValue(c) === '')) continue;

      // 1. Detect header row (`Наименование файла | Шифр проекта | ...`)
      const detectedHeader = matchHeaderRowToColMap(row);
      if (detectedHeader) {
        activeColMap = detectedHeader;
        continue;
      }

      // 2. Detect document metadata row matching `activeColMap`
      if (activeColMap) {
        const newMeta = extractDocMetaFromRow(row, activeColMap);
        if (newMeta) {
          commitDoc();
          currentDoc = createEmptyDoc(newMeta, documents.length);
          continue;
        }
      }

      // 3. Process protocol lines inside the row
      const lines = rowToProtocolLines(row, r);
      for (const lineObj of lines) {
        const line = lineObj.text;
        const norm = normalizeText(line);

        // Overall verification line (usually right after doc meta)
        if (/^подпись\s+(действительна|недействительна|не\s+найдена|проверена)/i.test(norm)) {
          if (currentDoc && currentDoc.certificates.length > 0 && currentDoc.docMeta.overallStatus) {
            // Status line starts a fresh implicit doc if previous doc already had certs and no file meta row appeared
            commitDoc();
          }
          if (!currentDoc) {
            currentDoc = createEmptyDoc({ fileName: `Документ ${documents.length + 1}` }, documents.length);
          }
          if (!currentDoc.docMeta.overallStatus) {
            currentDoc.docMeta.overallStatus = cleanValue(line);
          }
          continue;
        }

        const kvMatch = line.match(/^([^:]{2,50}):\s*(.*)$/);
        if (!kvMatch) continue;

        const key = kvMatch[1].trim();
        const val = kvMatch[2].trim();
        const keyNorm = normalizeText(key);

        // Explicit key-value metadata
        if (keyNorm === 'наименование файла') {
          if (currentDoc && (currentDoc.certificates.length > 0 || (currentDoc.docMeta.fileName && currentDoc.docMeta.fileName !== val))) {
            commitDoc();
          }
          if (!currentDoc) {
            currentDoc = createEmptyDoc({ fileName: val }, documents.length);
          } else if (!currentDoc.docMeta.fileName) {
            currentDoc.docMeta.fileName = val;
          }
          continue;
        }
        if (keyNorm === 'шифр проекта') {
          if (!currentDoc) currentDoc = createEmptyDoc({}, documents.length);
          if (!currentDoc.docMeta.projectCode) currentDoc.docMeta.projectCode = val;
          continue;
        }
        if (keyNorm === 'наименование проекта') {
          if (!currentDoc) currentDoc = createEmptyDoc({}, documents.length);
          if (!currentDoc.docMeta.projectName) currentDoc.docMeta.projectName = val;
          continue;
        }
        if (keyNorm === 'наименование документа') {
          if (!currentDoc) currentDoc = createEmptyDoc({}, documents.length);
          if (!currentDoc.docMeta.docName) currentDoc.docMeta.docName = val;
          continue;
        }

        // Certificate header: Информация о сертификате N:
        const certHeaderMatch = keyNorm.match(/^информация\s+о\s+сертификате\s*(\d+)?$/i);
        if (certHeaderMatch) {
          commitCert();
          const num = certHeaderMatch[1] ? parseInt(certHeaderMatch[1], 10) : null;
          // If certificate numbering resets to 1 inside an implicit doc that already had >1 certs without a new docMeta row
          if (num === 1 && currentDoc && currentDoc.certificates.length > 0 && !currentDoc.docMeta.fileName) {
            commitDoc();
          }
          if (!currentDoc) {
            currentDoc = createEmptyDoc({ fileName: `Документ ${documents.length + 1}` }, documents.length);
          }
          currentCert = createCert(num || (currentDoc.certificates.length + 1), lineObj.rowIndex);
          pendingPre = { signedAtUtc: '', signedAtMsk: '', signatureFormat: '' };
          continue;
        }

        // Pre-certificate signature timestamp / format lines
        if (keyNorm === 'время подписи по гринвичу') {
          if (currentCert && currentCert.subjectRaw) {
            commitCert();
          }
          if (currentCert && !currentCert.signedAtUtc) {
            currentCert.signedAtUtc = val;
          } else {
            pendingPre.signedAtUtc = val;
          }
          continue;
        }

        if (keyNorm === 'время подписи по мск' || keyNorm === 'время подписи') {
          if (currentCert && currentCert.subjectRaw && currentCert.signedAtMsk) {
            commitCert();
          }
          if (currentCert && !currentCert.signedAtMsk) {
            currentCert.signedAtMsk = val;
          } else {
            pendingPre.signedAtMsk = val;
          }
          continue;
        }

        if (keyNorm === 'формат подписи') {
          if (currentCert && currentCert.subjectRaw && currentCert.signatureFormat) {
            commitCert();
          }
          if (currentCert && !currentCert.signatureFormat) {
            currentCert.signatureFormat = val;
          } else {
            pendingPre.signatureFormat = val;
          }
          continue;
        }

        if (keyNorm === 'субъект' || keyNorm === 'владелец' || keyNorm === 'подписант') {
          if (currentCert && currentCert.subjectRaw) {
            commitCert();
          }
          if (!currentDoc) {
            currentDoc = createEmptyDoc({ fileName: `Документ ${documents.length + 1}` }, documents.length);
          }
          if (!currentCert) {
            currentCert = createCert(currentDoc.certificates.length + 1, lineObj.rowIndex);
            pendingPre = { signedAtUtc: '', signedAtMsk: '', signatureFormat: '' };
          }
          currentCert.subjectRaw = val;
          continue;
        }

        if (!currentCert) continue;

        if (keyNorm === 'издатель') {
          currentCert.issuerRaw = val;
        } else if (keyNorm === 'действует с') {
          currentCert.validFromRaw = val;
          currentCert.validFromDate = parseDateValue(val);
        } else if (keyNorm === 'действует до') {
          currentCert.validToRaw = val;
          currentCert.validToDate = parseDateValue(val);
        } else if (keyNorm === 'серийный номер') {
          currentCert.serialNumber = val;
        } else if (keyNorm.startsWith('отпечаток')) {
          currentCert.thumbprint = val;
        }
      }
    }

    commitDoc();

    // Keep only documents that have at least one certificate OR an explicit filename from metadata
    const validDocs = documents.filter((d) => d.certificates.length > 0 || d.docMeta.fileName);
    const totalCerts = validDocs.reduce((sum, d) => sum + d.certificates.length, 0);

    if (totalCerts === 0) {
      return { mode: 'none', documents: [], docMeta: {}, certificates: [] };
    }

    validDocs.forEach((d, idx) => {
      d.index = idx;
      d.id = `doc_${idx}`;
      if (!d.docMeta.fileName) {
        d.docMeta.fileName = d.docMeta.docName || `Документ ${idx + 1}`;
      }
    });

    return {
      mode: 'protocol',
      documents: validDocs,
      docMeta: validDocs[0].docMeta,
      certificates: validDocs.flatMap((d) => d.certificates)
    };
  }

  function detectTabularColumns(rows) {
    let headerRowIndex = 0;
    let bestScore = -1;
    let headers = [];

    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r] || [];
      const nonEmpty = row.filter((c) => cleanValue(c) !== '');
      if (nonEmpty.length < 2) continue;

      let score = 0;
      row.forEach((cell) => {
        const norm = normalizeText(cell);
        if (/(фио|подписант|владелец|субъект|фамилия|сотрудник)/i.test(norm)) score += 3;
        if (/(действует до|срок действия|окончани|valid to|истекает)/i.test(norm)) score += 3;
        if (/(файл|документ)/i.test(norm)) score += 2;
        if (/(действует с|время подписи|дата подписи|издатель|статус)/i.test(norm)) score += 1;
      });

      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = r;
        headers = row.map((cell, idx) => cleanValue(cell) || `Столбец ${idx + 1}`);
      }
    }

    if (bestScore <= 0 && rows.length > 0) {
      const firstNonEmpty = rows.findIndex((r) => Array.isArray(r) && r.filter((c) => cleanValue(c) !== '').length >= 2);
      headerRowIndex = firstNonEmpty >= 0 ? firstNonEmpty : 0;
      const r = rows[headerRowIndex] || [];
      headers = r.map((cell, idx) => cleanValue(cell) || `Столбец ${idx + 1}`);
    }

    let nameCol = -1;
    let validToCol = -1;
    let signedAtCol = -1;
    let validFromCol = -1;
    let fileCol = -1;

    headers.forEach((h, idx) => {
      const norm = normalizeText(h);
      if (nameCol === -1 && /(фио|подписант|владелец|субъект|фамилия|сотрудник|пользователь)/i.test(norm)) {
        nameCol = idx;
      }
      if (validToCol === -1 && /(действует до|срок действия до|срок действия|окончани|valid to|по\b)/i.test(norm)) {
        validToCol = idx;
      }
      if (validFromCol === -1 && /(действует с|начал|valid from)/i.test(norm)) {
        validFromCol = idx;
      }
      if (signedAtCol === -1 && /(время подписи|дата подписи|подписано)/i.test(norm)) {
        signedAtCol = idx;
      }
      if (fileCol === -1 && /(наименование файла|имя файла|файл|документ)/i.test(norm)) {
        fileCol = idx;
      }
    });

    if (nameCol === -1 && headers.length >= 1) nameCol = 0;
    if (validToCol === -1 && headers.length >= 2) validToCol = nameCol === 0 ? 1 : 0;

    return {
      headerRowIndex,
      headers,
      mapping: { nameCol, validToCol, validFromCol, signedAtCol, fileCol }
    };
  }

  function parseTabularCertificates(rawRows, formattedRows, customMapping, referenceNow) {
    const rowsForDetect = formattedRows && formattedRows.length ? formattedRows : rawRows;
    const detected = detectTabularColumns(rowsForDetect);
    const headerRowIndex = (customMapping && typeof customMapping.headerRowIndex === 'number')
      ? customMapping.headerRowIndex
      : detected.headerRowIndex;
    const nameCol = (customMapping && typeof customMapping.nameCol === 'number')
      ? customMapping.nameCol
      : detected.mapping.nameCol;
    const validToCol = (customMapping && typeof customMapping.validToCol === 'number')
      ? customMapping.validToCol
      : detected.mapping.validToCol;
    const validFromCol = (customMapping && typeof customMapping.validFromCol === 'number')
      ? customMapping.validFromCol
      : detected.mapping.validFromCol;
    const signedAtCol = (customMapping && typeof customMapping.signedAtCol === 'number')
      ? customMapping.signedAtCol
      : detected.mapping.signedAtCol;
    const fileCol = (customMapping && typeof customMapping.fileCol === 'number')
      ? customMapping.fileCol
      : detected.mapping.fileCol;

    const docsMap = new Map();
    const allCertificates = [];

    for (let r = headerRowIndex + 1; r < rowsForDetect.length; r++) {
      const fRow = rowsForDetect[r] || [];
      const rRow = (rawRows && rawRows[r]) ? rawRows[r] : fRow;

      const rawNameCell = cleanValue(fRow[nameCol]);
      if (!rawNameCell) continue;

      const subj = rawNameCell.includes('CN=') || rawNameCell.includes('SN=')
        ? parseX509Subject(rawNameCell)
        : {
          raw: rawNameCell,
          fullName: rawNameCell,
          surname: rawNameCell.split(/\s+/)[0] || rawNameCell,
          givenName: rawNameCell.split(/\s+/).slice(1).join(' '),
          email: '',
          org: '',
          title: ''
        };

      const validToRawVal = validToCol >= 0 ? (rRow[validToCol] !== '' && rRow[validToCol] !== undefined ? rRow[validToCol] : fRow[validToCol]) : '';
      const validToDisplayRaw = validToCol >= 0 ? cleanValue(fRow[validToCol]) : '';
      const validToDate = parseDateValue(validToRawVal) || parseDateValue(validToDisplayRaw);
      const validity = evaluateCertificateValidity(validToDate, referenceNow);

      const validFromRawVal = validFromCol >= 0 ? (rRow[validFromCol] !== '' && rRow[validFromCol] !== undefined ? rRow[validFromCol] : fRow[validFromCol]) : '';
      const validFromDate = parseDateValue(validFromRawVal) || parseDateValue(validFromCol >= 0 ? fRow[validFromCol] : '');
      const signedAtRawVal = signedAtCol >= 0 ? cleanValue(fRow[signedAtCol]) : '';
      const docKey = fileCol >= 0 ? (cleanValue(fRow[fileCol]) || 'Документ') : 'Отчет';

      if (!docsMap.has(docKey)) {
        docsMap.set(docKey, {
          index: docsMap.size,
          id: `doc_${docsMap.size}`,
          docMeta: {
            fileName: docKey,
            projectCode: '',
            projectName: '',
            contractNumber: '',
            stageNumber: '',
            docName: '',
            overallStatus: ''
          },
          certificates: []
        });
      }

      const targetDoc = docsMap.get(docKey);
      const certObj = {
        certNumber: targetDoc.certificates.length + 1,
        signedAtUtc: '',
        signedAtMsk: signedAtRawVal,
        signatureFormat: '',
        subjectRaw: rawNameCell,
        fullName: subj.fullName,
        surname: subj.surname,
        givenName: subj.givenName,
        email: subj.email,
        org: subj.org,
        title: subj.title,
        issuerRaw: '',
        issuerShort: '',
        validFromRaw: String(validFromRawVal || ''),
        validFromDate,
        validFromDisplay: formatDateDisplay(validFromDate, validFromCol >= 0 ? fRow[validFromCol] : ''),
        validToRaw: validToDisplayRaw || String(validToRawVal || ''),
        validToDate,
        validToDisplay: formatDateDisplay(validToDate, validToDisplayRaw),
        serialNumber: '',
        thumbprint: '',
        certStatus: validity.certStatus,
        validityLabel: validity.label,
        daysLeft: validity.daysLeft,
        rowIndex: r
      };

      targetDoc.certificates.push(certObj);
      allCertificates.push(certObj);
    }

    const documents = Array.from(docsMap.values());
    if (documents.length === 0) {
      documents.push({
        index: 0,
        id: 'doc_0',
        docMeta: { fileName: 'Отчет', projectCode: '', projectName: '', contractNumber: '', stageNumber: '', docName: '', overallStatus: '' },
        certificates: []
      });
    }

    return {
      mode: 'tabular',
      documents,
      docMeta: documents[0].docMeta,
      headers: detected.headers,
      mapping: { headerRowIndex, nameCol, validToCol, validFromCol, signedAtCol, fileCol },
      certificates: allCertificates
    };
  }

  function parseWorkbookSheet(rawRows, formattedRows, customMapping, referenceNow) {
    const rows = (formattedRows && formattedRows.length) ? formattedRows : rawRows;
    if (!rows || rows.length === 0) {
      return {
        mode: 'empty',
        documents: [],
        docMeta: {},
        certificates: [],
        headers: [],
        mapping: null
      };
    }

    if (!customMapping || customMapping.forceTabular !== true) {
      const protocolResult = parseProtocolDocuments(rows, referenceNow);
      if (protocolResult.documents.length > 0) {
        return protocolResult;
      }
    }

    return parseTabularCertificates(rawRows, formattedRows, customMapping, referenceNow);
  }

  function normalizeInitialsToken(token) {
    return normalizeText(token).replace(/\./g, '');
  }

  function doesSignerMatchCertificate(expectedQuery, cert) {
    const qNorm = normalizeText(expectedQuery);
    if (!qNorm || !cert) return false;

    const fullNorm = normalizeText(cert.fullName);
    const surnameNorm = normalizeText(cert.surname);

    if (qNorm === fullNorm) return true;

    const qParts = qNorm.replace(/\./g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const cParts = fullNorm.replace(/\./g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

    if (qParts.length === 0 || cParts.length === 0) return false;

    const qSurname = qParts[0];
    const cSurname = surnameNorm || cParts[0];

    if (qSurname !== cSurname) return false;

    if (qParts.length === 1) return true;

    const qRest = qParts.slice(1).join('');
    const cRest = cParts.slice(1);
    if (cRest.length === 0) return false;

    if (qParts.length === 2 && qParts[1].length <= 3 && cRest.length >= qParts[1].length) {
      const targetInitials = cRest.slice(0, qParts[1].length).map((w) => w[0]).join('');
      if (qParts[1] === targetInitials) return true;
    }

    const qTokens = qParts.slice(1);
    if (qTokens.length <= cRest.length) {
      const allMatch = qTokens.every((qt, idx) => {
        const ct = cRest[idx] || '';
        return ct.startsWith(qt) || normalizeInitialsToken(qt) === ct[0];
      });
      if (allMatch) return true;
    }

    return qRest === cRest.map((w) => w[0]).join('');
  }

  function reconcileSigners(certificates, expectedSigners) {
    const certs = Array.isArray(certificates) ? certificates : [];
    const expected = Array.isArray(expectedSigners) ? expectedSigners : [];
    const matchedCertIndices = new Set();

    const matchedItems = [];
    const missingItems = [];

    expected.forEach((expItem) => {
      const query = typeof expItem === 'string' ? expItem : expItem.query;
      const expId = typeof expItem === 'string' ? expItem : (expItem.id || query);
      const matches = [];

      certs.forEach((cert, idx) => {
        if (doesSignerMatchCertificate(query, cert)) {
          matches.push({ cert, idx });
          matchedCertIndices.add(idx);
        }
      });

      if (matches.length > 0) {
        matches.forEach(({ cert }) => {
          matchedItems.push({
            kind: 'matched',
            expectedId: expId,
            expectedQuery: query,
            cert
          });
        });
      } else {
        missingItems.push({
          kind: 'missing',
          expectedId: expId,
          expectedQuery: query,
          cert: null
        });
      }
    });

    const extraItems = [];
    certs.forEach((cert, idx) => {
      if (!matchedCertIndices.has(idx)) {
        extraItems.push({
          kind: expected.length > 0 ? 'extra' : 'report_only',
          expectedId: null,
          expectedQuery: '',
          cert
        });
      }
    });

    const allRows = [...matchedItems, ...missingItems, ...extraItems];

    const expiredCount = certs.filter((c) => c.certStatus === 'expired').length;
    const expiringSoonCount = certs.filter((c) => c.certStatus === 'expiring_soon').length;
    const unknownDateCount = certs.filter((c) => c.certStatus === 'unknown').length;
    const uniqueMatchedExpectedCount = expected.filter((expItem) => {
      const q = typeof expItem === 'string' ? expItem : expItem.query;
      return certs.some((c) => doesSignerMatchCertificate(q, c));
    }).length;

    return {
      hasExpectedList: expected.length > 0,
      stats: {
        totalInReport: certs.length,
        totalExpected: expected.length,
        matchedCount: uniqueMatchedExpectedCount,
        missingCount: missingItems.length,
        extraCount: expected.length > 0 ? extraItems.length : 0,
        expiredCount,
        expiringSoonCount,
        unknownDateCount
      },
      matchedItems,
      missingItems,
      extraItems,
      allRows
    };
  }

  function reconcilePackage(documents, expectedSigners) {
    const docs = Array.isArray(documents) ? documents : [];
    const expected = Array.isArray(expectedSigners) ? expectedSigners : [];

    const docResults = docs.map((doc) => {
      const res = reconcileSigners(doc.certificates, expected);
      const hasMissing = res.stats.missingCount > 0;
      const hasExtra = res.stats.extraCount > 0;
      const hasExpired = res.stats.expiredCount > 0;
      const hasExpiringSoon = res.stats.expiringSoonCount > 0;
      const isComplete = !hasMissing && !hasExpired;
      const hasAnyIssue = hasMissing || hasExtra || hasExpired || hasExpiringSoon;

      return {
        doc,
        reconciliation: res,
        hasMissing,
        hasExtra,
        hasExpired,
        hasExpiringSoon,
        isComplete,
        hasAnyIssue
      };
    });

    const expectedStatsById = {};
    expected.forEach((expItem) => {
      const id = typeof expItem === 'string' ? expItem : expItem.id;
      const query = typeof expItem === 'string' ? expItem : expItem.query;
      let signedDocsCount = 0;
      const missingInDocs = [];
      let hasExpired = false;
      let hasExpiringSoon = false;

      docResults.forEach((dr) => {
        const matched = dr.doc.certificates.filter((c) => doesSignerMatchCertificate(query, c));
        if (matched.length > 0) {
          signedDocsCount++;
          if (matched.some((c) => c.certStatus === 'expired')) hasExpired = true;
          if (matched.some((c) => c.certStatus === 'expiring_soon')) hasExpiringSoon = true;
        } else {
          missingInDocs.push(dr.doc.docMeta.fileName || `Документ ${dr.doc.index + 1}`);
        }
      });

      expectedStatsById[id] = {
        query,
        signedDocsCount,
        totalDocs: docs.length,
        missingInDocs,
        hasExpired,
        hasExpiringSoon
      };
    });

    const uniqueSignersMap = new Map();
    docs.forEach((doc) => {
      doc.certificates.forEach((cert) => {
        const key = normalizeText(cert.fullName);
        if (key && !uniqueSignersMap.has(key)) {
          uniqueSignersMap.set(key, cert);
        }
      });
    });

    const stats = {
      docCount: docs.length,
      docsComplete: docResults.filter((d) => d.isComplete).length,
      docsWithMissing: docResults.filter((d) => d.hasMissing).length,
      docsWithExtra: docResults.filter((d) => d.hasExtra).length,
      docsWithCertIssues: docResults.filter((d) => d.hasExpired || d.hasExpiringSoon).length,
      docsWithAnyIssue: docResults.filter((d) => d.hasAnyIssue).length,
      uniqueSignersCount: uniqueSignersMap.size,
      totalSignaturesAllDocs: docs.reduce((s, d) => s + d.certificates.length, 0)
    };

    return {
      hasExpectedList: expected.length > 0,
      isMultiDocument: docs.length > 1,
      stats,
      docResults,
      expectedStatsById,
      uniqueSigners: Array.from(uniqueSignersMap.values())
    };
  }

  function getSampleReportRows() {
    return [
      ['Наименование файла', 'Шифр проекта', 'Наименование проекта', '№ договора', '№ этапа', 'Наименование документа'],
      // Документ 1 — 8 сертификатов (один из них истекает 03.12.2026)
      ['960-02-232110-02-МПЦ2.1 (Пост ЭЦ).pdf', '00.0001', '010101_Тест', '', '', 'Чертеж - Раздел 1 «Пояснительная записка»'],
      ['Подпись действительна'],
      ['Время подписи по Гринвичу: 12.11.2026 10:47:48'],
      ['Время подписи по МСК: 12.11.2026 13:47:48'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 1:'],
      ['Субъект: CN=Минаев Олег Борисович, SN=Минаев, G=Олег Борисович, C=RU, E=mob@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 13.03.2026 06:11:15'],
      ['Действует до: 13.03.2027 06:21:15'],
      ['Серийный номер: 417238D5EBDF248243CD3916019CE5DB'],
      ['Отпечаток сертификата: CC334369C57526E1702241E093AE3A33BB01848A'],
      ['Время подписи по Гринвичу: 12.11.2026 10:34:34'],
      ['Время подписи по МСК: 12.11.2026 13:34:34'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 2:'],
      ['Субъект: CN=Лисаков Илья Михайлович, SN=Лисаков, G=Илья Михайлович, C=RU, E=lim@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 11.03.2026 11:26:14'],
      ['Действует до: 11.03.2027 11:36:14'],
      ['Серийный номер: 061B8222E01BA6BE4731E0CF019CDCAE'],
      ['Отпечаток сертификата: 614C4BA71CAC2791426E598E4CCC4112885EC402'],
      ['Время подписи по Гринвичу: 12.11.2026 10:31:05'],
      ['Время подписи по МСК: 12.11.2026 13:31:05'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 3:'],
      ['Субъект: CN=Маркова Ирина Валерьевна, SN=Маркова, G=Ирина Валерьевна, C=RU, E=miv@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 10.03.2026 06:51:21'],
      ['Действует до: 10.03.2027 07:01:21'],
      ['Серийный номер: 52A85FA768F927954212DB55019CD68C'],
      ['Отпечаток сертификата: BD9B2A7E2152AEBB4E393EBAF175E88AD6FA66EC'],
      ['Время подписи по Гринвичу: 12.11.2026 10:45:20'],
      ['Время подписи по МСК: 12.11.2026 13:45:20'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 4:'],
      ['Субъект: CN=Кудряшова Ольга Евгеньевна, SN=Кудряшова, G=Ольга Евгеньевна, C=RU, E=koe@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 06.03.2026 10:11:22'],
      ['Действует до: 06.03.2027 10:21:22'],
      ['Серийный номер: 15B41643FD9B3F954EBF87A1019CC2AA'],
      ['Отпечаток сертификата: 377CBF3B72CB5B462591966AC366EFBFD0D45251'],
      ['Время подписи по Гринвичу: 12.11.2026 12:13:53'],
      ['Время подписи по МСК: 12.11.2026 15:13:53'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 5:'],
      ['Субъект: CN=Ашихмин Андрей Алексеевич, SN=Ашихмин, G=Андрей Алексеевич, C=RU, E=3a-cube@mail.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий центр, STREET=Барыковский пер., д. 4, стр. 2, L=Москва, S=77 Москва, C=RU, ИНН ЮЛ=7704211201, ОГРН=1027700071530'],
      ['Действует с: 03.12.2025 09:20:34'],
      ['Действует до: 03.12.2026 09:30:34'],
      ['Серийный номер: 051AB69C00A8B38D9A48C0E749A7D5298D'],
      ['Отпечаток сертификата: 1A4E56B0425F136CD80CB245CEB6CA3FDD46C9D1'],
      // Документ 2 — отличается состав подписантов (недостает Кудряшовой и Ашихмина, но есть Алтухов и Степаненко)
      ['960-02-232110-02-СЦБ300.2.pdf', '00.0001', '010101_Тест', '', '', 'Чертеж - Раздел 2 «Схемы кабельные»'],
      ['Подпись действительна'],
      ['Время подписи по Гринвичу: 12.11.2026 10:47:55'],
      ['Время подписи по МСК: 12.11.2026 13:47:55'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 1:'],
      ['Субъект: CN=Минаев Олег Борисович, SN=Минаев, G=Олег Борисович, C=RU, E=mob@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 13.03.2026 06:11:15'],
      ['Действует до: 13.03.2027 06:21:15'],
      ['Серийный номер: 417238D5EBDF248243CD3916019CE5DB'],
      ['Отпечаток сертификата: CC334369C57526E1702241E093AE3A33BB01848A'],
      ['Время подписи по Гринвичу: 12.11.2026 10:34:40'],
      ['Время подписи по МСК: 12.11.2026 13:34:40'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 2:'],
      ['Субъект: CN=Лисаков Илья Михайлович, SN=Лисаков, G=Илья Михайлович, C=RU, E=lim@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 11.03.2026 11:26:14'],
      ['Действует до: 11.03.2027 11:36:14'],
      ['Серийный номер: 061B8222E01BA6BE4731E0CF019CDCAE'],
      ['Отпечаток сертификата: 614C4BA71CAC2791426E598E4CCC4112885EC402'],
      ['Время подписи по Гринвичу: 12.11.2026 10:37:12'],
      ['Время подписи по МСК: 12.11.2026 13:37:12'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 3:'],
      ['Субъект: CN=Алтухов Андрей Александрович, SN=Алтухов, G=Андрей Александрович, C=RU, E=alaa@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 12.03.2026 09:11:28'],
      ['Действует до: 12.03.2027 09:21:28'],
      ['Серийный номер: 211890E35E0C08814DA9D8D2019CE159'],
      ['Отпечаток сертификата: 1413D87B2689BCF61681F707BAD401095B8E7CF9'],
      ['Время подписи по Гринвичу: 13.11.2026 11:43:45'],
      ['Время подписи по МСК: 13.11.2026 14:43:45'],
      ['Формат подписи: CAdES-XLT1 (долгосрочная расширенная подпись со штампом времени на всей подписи)'],
      ['Информация о сертификате 4:'],
      ['Субъект: CN=Степаненко Светлана Владимировна, SN=Степаненко, G=Светлана Владимировна, C=RU, E=ssvl@szdpro.ru'],
      ['Издатель: CN=ООО ТАКСКОМ, O=ООО ТАКСКОМ, OU=Удостоверяющий Центр, S=77 Москва, L=Москва, STREET=пер. Барыковский, д. 4, стр. 2, C=RU, ОГРН=1027700071530, ИНН ЮЛ=7704211201'],
      ['Действует с: 12.03.2026 11:41:18'],
      ['Действует до: 12.03.2027 11:51:18'],
      ['Серийный номер: 379E7ED673581481475F055C019CE1E3'],
      ['Отпечаток сертификата: 92FCA96116B0754182CB5307532CDDAF610CAD49']
    ];
  }

  global.SignatureReportParser = {
    normalizeText,
    cleanValue,
    parseCsvText,
    readFileAsTextWithEncoding,
    parseX509Subject,
    parseDateValue,
    formatDateDisplay,
    evaluateCertificateValidity,
    parseWorkbookSheet,
    doesSignerMatchCertificate,
    reconcileSigners,
    reconcilePackage,
    getSampleReportRows
  };
})(window);
