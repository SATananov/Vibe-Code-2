/* =========================================================
   Брояч на продадени продукти от CSV
   Без външни библиотеки. Всичко в браузъра.
   Поддържани колони (синоними):
   - Продукт:  ["продукт","артикул","име","product","item","product name"]
   - Количество: ["количество","брой","брой продажби","qty","quantity"]
   - Дата: ["дата","date"]
   - Продуктова група: ["продуктова група","група","категория","product group","group","category"]
   - Продуктов клас: ["продуктов клас","клас","product class","class","grade"]
========================================================= */

const els = {
  alert: document.getElementById('alert'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  dateStart: document.getElementById('dateStart'),
  dateEnd: document.getElementById('dateEnd'),
  groupSelect: document.getElementById('groupSelect'),
  classSelect: document.getElementById('classSelect'),
  searchInput: document.getElementById('searchInput'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  totalQty: document.getElementById('totalQty'),
  uniqueCount: document.getElementById('uniqueCount'),
  rowsAll: document.getElementById('rowsAll'),
  rowsFiltered: document.getElementById('rowsFiltered'),
  tableBody: document.getElementById('tableBody'),
};

const state = {
  rawRows: /** @type {Row[]} */ ([]),
  headers: /** @type {DetectedHeaders|null} */ (null),
};

const nf = new Intl.NumberFormat('bg-BG');

els.fileInput.addEventListener('change', handleFile);
setupDropzone(els.dropzone, handleFileFromDrop);

[els.dateStart, els.dateEnd, els.groupSelect, els.classSelect].forEach(el =>
  el.addEventListener('change', render)
);
els.searchInput.addEventListener('input', render);
els.clearFiltersBtn.addEventListener('click', () => {
  els.dateStart.value = '';
  els.dateEnd.value = '';
  els.groupSelect.value = '';
  els.classSelect.value = '';
  els.searchInput.value = '';
  render();
});

/* ========================== File handlers ========================== */
function handleFile(e) {
  const file = e.target.files?.[0];
  if (file) readFile(file);
  e.target.value = ''; // reset input
}

function handleFileFromDrop(file) {
  if (file) readFile(file);
}

function readFile(file) {
  hideAlert();

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'csv') {
    return showAlert(
      'Поддържам само CSV към момента. Моля, експортирайте Excel файла като <strong>CSV (UTF-8)</strong> и опитайте отново.'
    );
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const { rows, headers } = parseCSVToRows(text);
      state.rawRows = rows;
      state.headers = headers;
      populateFilterOptions(rows);
      render();
      if (!headers.product || !headers.qty) {
        showAlert(
          'Не открих задължителни колони <strong>Продукт</strong> и/или <strong>Количество</strong>. Проверете заглавията във файла.'
        );
      }
    } catch (err) {
      console.error(err);
      showAlert('Възникна грешка при четене на файла. Проверете формата/разделителя.');
    }
  };
  reader.onerror = () => showAlert('Неуспешно четене на файла.');
  reader.readAsText(file, 'utf-8');
}

/* ========================== Parsing ========================== */
/**
 * @typedef {{product?:string, qty?:string, date?:string, group?:string, class?:string}} RowRaw
 * @typedef {{product?:string, qty?:string, date?:string, group?:string, class?:string}} DetectedHeaders
 * @typedef {{product:string, qty:number, date:Date|null, group:string, class:string}} Row
 */

function parseCSVToRows(text) {
  const delimiter = detectDelimiter(text);
  const matrix = parseCSV(text, delimiter);

  if (!matrix.length) return { rows: [], headers: {} };

  const rawHeader = matrix[0].map(normalizeHeader);
  const map = detectHeaders(rawHeader);

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (cells.length === 1 && cells[0].trim() === '') continue; // skip empty lines

    const get = (key) => {
      const idx = map[key];
      return typeof idx === 'number' ? (cells[idx] ?? '').trim() : '';
    };

    const product = get('product');
    const qtyNum = stringToNumberInt(get('qty'));
    const dateVal = parseDateSafe(get('date'));
    const groupVal = get('group');
    const classVal = get('class');

    rows.push({
      product: product || '(без име)',
      qty: isFinite(qtyNum) ? qtyNum : 0,
      date: dateVal,
      group: groupVal || '',
      class: classVal || ''
    });
  }

  return { rows, headers: map };
}

function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[„“"']/g, '')
    .replace(/\(.*?\)/g, '').trim();
}

function detectHeaders(headers) {
  const H = {
    product: undefined,
    qty: undefined,
    date: undefined,
    group: undefined,
    class: undefined
  };

  const synonyms = {
    product: ['продукт','артикул','име','product','item','product name','име на продукт'],
    qty: ['количество','брой','брой продажби','qty','quantity','бройка'],
    date: ['дата','date'],
    group: ['продуктова група','група','категория','product group','group','category'],
    class: ['продуктов клас','клас','product class','class','grade']
  };

  headers.forEach((h, idx) => {
    for (const key of Object.keys(synonyms)) {
      if (synonyms[key].some(s => h === s)) {
        H[key] ??= idx;
      }
    }
  });

  return H;
}

function detectDelimiter(text) {
  const sample = text.slice(0, 2000);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    // score = avg count of delimiter per non-empty line
    const lines = sample.split(/\r?\n/).filter(l => l.trim().length);
    const counts = lines.map(l => (l.match(new RegExp(escapeRegex(d), 'g')) || []).length);
    const score = counts.reduce((a,b)=>a+b,0) / (lines.length || 1);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Robust-ish CSV parser (RFC4180-ish) */
function parseCSV(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0, inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i+1] === '"') {
        field += '"'; i += 2; continue; // escaped quote
      }
      inQuotes = !inQuotes; i++; continue;
    }

    if (!inQuotes && (c === delimiter)) {
      row.push(field); field = ''; i++; continue;
    }

    if (!inQuotes && (c === '\n' || c === '\r')) {
      // handle CRLF / LF
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
      i++; continue;
    }

    field += c; i++;
  }

  row.push(field);
  rows.push(row);
  return rows;
}

/* ========================== Utilities ========================== */
function stringToNumberInt(v) {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  // remove everything except digits, minus sign and separators
  s = s.replace(/[^0-9,\.\-]/g, '');
  // If both comma and dot exist, assume comma is thousands and remove it
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  // If only comma exists, treat it as decimal point (then round)
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const n = Number(s);
  return Math.round(n); // quantity assumed as integer
}

function parseDateSafe(v) {
  if (!v) return null;
  let s = String(v).trim();
  // try ISO first
  let d = new Date(s);
  if (!isNaN(d)) return d;
  // try DD/MM/YYYY or DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    const year = Number(yyyy.length === 2 ? '20'+yyyy : yyyy);
    const date = new Date(year, Number(mm)-1, Number(dd));
    if (!isNaN(date)) return date;
  }
  return null;
}

function showAlert(html) {
  els.alert.innerHTML = html;
  els.alert.classList.remove('hidden');
}
function hideAlert() {
  els.alert.classList.add('hidden');
  els.alert.innerHTML = '';
}

/* ========================== Filters & Render ========================== */
function populateFilterOptions(rows) {
  // unique group/class values
  const groups = new Set();
  const classes = new Set();

  rows.forEach(r => {
    if (r.group) groups.add(r.group);
    if (r.class) classes.add(r.class);
  });

  // reset selects
  resetSelect(els.groupSelect, groups);
  resetSelect(els.classSelect, classes);
}

function resetSelect(select, valuesSet) {
  const current = select.value;
  select.innerHTML = '<option value="">Всички</option>';
  [...valuesSet].sort(localeSort).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  if ([...valuesSet].includes(current)) select.value = current;
}

function localeSort(a,b){ return String(a).localeCompare(String(b), 'bg'); }

function applyFilters(rows) {
  const s = els.dateStart.value ? new Date(els.dateStart.value) : null;
  const e = els.dateEnd.value ? new Date(els.dateEnd.value) : null;
  const g = els.groupSelect.value;
  const c = els.classSelect.value;
  const q = els.searchInput.value.trim().toLowerCase();

  return rows.filter(r => {
    if (s && r.date && r.date < s) return false;
    if (e && r.date && r.date > addOneDay(e)) return false;
    if (g && r.group !== g) return false;
    if (c && r.class !== c) return false;
    if (q && !String(r.product).toLowerCase().includes(q)) return false;
    // if there is a date filter but row has no date -> keep it (policy choice) or exclude?
    // We'll keep it unless both s and e exist:
    if ((s || e) && r.date === null) return false;
    return true;
  });
}
function addOneDay(d){ const x = new Date(d); x.setDate(x.getDate()+1); return x; }

function aggregateByProduct(rows) {
  /** @type {Record<string, number>} */
  const map = {};
  for (const r of rows) {
    map[r.product] = (map[r.product] || 0) + (r.qty || 0);
  }
  return Object.entries(map).map(([product, qty]) => ({ product, qty }));
}

function render() {
  const all = state.rawRows;
  els.rowsAll.textContent = nf.format(all.length);

  const filtered = applyFilters(all);
  els.rowsFiltered.textContent = nf.format(filtered.length);

  const totalQty = filtered.reduce((s, r) => s + (r.qty || 0), 0);
  els.totalQty.textContent = nf.format(totalQty);

  const uniqueProducts = new Set(filtered.map(r => r.product));
  els.uniqueCount.textContent = nf.format(uniqueProducts.size);

  const agg = aggregateByProduct(filtered).sort((a,b)=> b.qty - a.qty);

  // build table
  els.tableBody.innerHTML = '';
  if (!agg.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'empty';
    td.textContent = 'Няма резултати за показване. Променете филтрите или качете файл.';
    tr.appendChild(td); els.tableBody.appendChild(tr);
    return;
  }

  for (const row of agg) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const tdQty = document.createElement('td');
    tdName.textContent = row.product;
    tdQty.textContent = nf.format(row.qty);
    tdQty.className = 'text-right';
    tr.appendChild(tdName); tr.appendChild(tdQty);
    els.tableBody.appendChild(tr);
  }
}

/* ========================== Dropzone UX ========================== */
function setupDropzone(zone, onFileDropped) {
  ['dragenter','dragover'].forEach(evt =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('is-dragover'); })
  );
  ['dragleave','drop'].forEach(evt =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('is-dragover'); })
  );
  zone.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) onFileDropped(f);
  });

  // keyboard support: Enter/Space to open file dialog
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });
}

/* ========================== Types (JSDoc) ========================== */
/**
 * @typedef {Object} Row
 * @property {string} product
 * @property {number} qty
 * @property {Date|null} date
 * @property {string} group
 * @property {string} class
 */

/* Initial UI */
render();
