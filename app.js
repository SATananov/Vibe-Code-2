/* Прост CSV парсър + логика за филтри и агрегиране. Без външни библиотеки. */

const els = {
  file: document.getElementById('file'),
  encoding: document.getElementById('encoding'),
  fileInfo: document.getElementById('fileInfo'),
  sample: document.getElementById('sample'),
  colDate: document.getElementById('col-date'),
  colProduct: document.getElementById('col-product'),
  colQty: document.getElementById('col-qty'),
  colGroup: document.getElementById('col-group'),
  colClass: document.getElementById('col-class'),
  start: document.getElementById('start'),
  end: document.getElementById('end'),
  groupFilter: document.getElementById('groupFilter'),
  classFilter: document.getElementById('classFilter'),
  btnCalc: document.getElementById('btn-calc'),
  btnReset: document.getElementById('btn-reset'),
  status: document.getElementById('status'),
  summary: document.getElementById('summary'),
  byProduct: document.getElementById('byProduct'),
  byGroup: document.getElementById('byGroup'),
  byClass: document.getElementById('byClass'),
};

let dataset = { headers: [], rows: [] };
let lastDelimiter = ',';

els.file.addEventListener('change', handleFile);
els.encoding.addEventListener('change', () => {
  if (els.file.files && els.file.files[0]) {
    handleFile(); // презареждаме със зададената кодировка
  }
});
els.btnCalc.addEventListener('click', calculate);
els.btnReset.addEventListener('click', resetAll);

function resetAll() {
  dataset = { headers: [], rows: [] };
  lastDelimiter = ',';
  els.file.value = '';
  els.fileInfo.textContent = '';
  els.sample.innerHTML = '';
  clearSelects([els.colDate, els.colProduct, els.colQty, els.colGroup, els.colClass]);
  els.start.value = '';
  els.end.value = '';
  els.groupFilter.value = '';
  els.classFilter.value = '';
  els.summary.innerHTML = '';
  els.byProduct.innerHTML = '';
  els.byGroup.innerHTML = '';
  els.byClass.innerHTML = '';
  els.status.textContent = 'Изчистено.';
  setTimeout(() => (els.status.textContent = ''), 1200);
}

function clearSelects(selects) {
  for (const s of selects) {
    s.innerHTML = `<option value="">(няма)</option>`;
  }
}

async function handleFile() {
  resetResults();
  const file = els.file.files?.[0];
  if (!file) return;

  const enc = els.encoding.value || 'utf-8';
  const text = await readFileAsText(file, enc);
  const { delimiter, headers, rows } = parseCSVWithAuto(text);
  dataset = { headers, rows };
  lastDelimiter = delimiter;

  els.fileInfo.innerHTML = `Редове: <strong>${rows.length}</strong> • Колони: <strong>${headers.length}</strong> • Делимитер: <strong>${formatDelimiter(delimiter)}</strong>`;

  populateMapping(headers);
  renderSample(headers, rows);
}

function resetResults() {
  els.summary.innerHTML = '';
  els.byProduct.innerHTML = '';
  els.byGroup.innerHTML = '';
  els.byClass.innerHTML = '';
  els.status.textContent = '';
}

function readFileAsText(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    // за нестандартни кодировки използваме TextDecoder, ако има ArrayBuffer
    if (encoding && encoding.toLowerCase() !== 'utf-8') {
      reader.readAsArrayBuffer(file);
      reader.onload = () => {
        try {
          const dec = new TextDecoder(encoding);
          resolve(dec.decode(reader.result));
        } catch (e) {
          resolve(new TextDecoder('windows-1251').decode(reader.result));
        }
      };
    } else {
      reader.readAsText(file);
    }
  });
}

function formatDelimiter(d) {
  if (d === '\t') return 'TAB';
  if (d === ';') return ';';
  if (d === ',') return ',';
  return d;
}

function populateMapping(headers) {
  const selects = [els.colDate, els.colProduct, els.colQty, els.colGroup, els.colClass];
  clearSelects(selects);
  for (const s of selects) {
    for (const h of headers) {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h
