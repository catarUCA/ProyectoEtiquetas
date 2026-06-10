import { api } from './api.js';

const PHASE_LABELS = { ocr: 'OCR', crop: 'Recorte', describe: 'Descripcion', index: 'Indexado' };
const PHASE_COLORS = { ocr: 'bg-blue-600', crop: 'bg-green-600', describe: 'bg-purple-600', index: 'bg-indigo-600' };

function escape(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

function _makeProgressBar(filename, pct, color) {
  color = color || 'bg-blue-500';
  return '<div class="progress-wrap mt-1" data-fn="' + escape(filename) + '">'
    + '<div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">'
    + '<div class="h-1.5 rounded-full transition-all duration-300 ' + color + '" style="width:' + (Math.round((pct || 0) * 100)) + '%"></div>'
    + '</div></div>';
}

function _ensureBar(card, filename, color) {
  let wrap = card.querySelector('.progress-wrap');
  if (!wrap) {
    card.insertAdjacentHTML('beforeend', _makeProgressBar(filename, 0, color || 'bg-blue-500'));
    wrap = card.querySelector('.progress-wrap');
  }
  return wrap;
}

function _updateBar(card, pct, color) {
  const bar = card.querySelector('.progress-wrap .rounded-full');
  if (bar) {
    bar.style.width = Math.round((pct || 0) * 100) + '%';
    if (color) bar.className = bar.className.replace(/bg-\w+-\d+/, color);
  }
}

export function renderUploadModal(onDone) {
  const existing = document.getElementById('upload-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'upload-overlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-70 z-40 flex items-center justify-center';
  overlay.innerHTML = '<div id="upload-panel" class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { if (currentSessionId) api.deleteSession(currentSessionId).catch(function() {}); overlay.remove(); } });
  var currentSessionId = null;
  var panel = document.getElementById('upload-panel');

  function _handleHeartbeat(evt) {
    if (evt.heartbeat && evt.filename) {
      var safeFn = escape(evt.filename);
      var card = panel.querySelector('[data-fn="' + safeFn + '"]') || panel.querySelector('[data-filename="' + safeFn + '"]');
      if (!card) {
        card = panel.querySelector('.progress-wrap[data-fn="' + safeFn + '"]');
        if (card) card = card.parentNode;
      }
      if (card) _updateBar(card, evt.image_progress || 0, PHASE_COLORS[evt.phase]);
      if (evt.total) {
        var textEls = { ocr: 'ocr-text', crop: 'crop-text', describe: 'desc-text', index: 'index-text' };
        var barEls = { ocr: 'ocr-bar', crop: 'crop-bar', describe: 'desc-bar', index: 'index-bar' };
        var textEl = document.getElementById(textEls[evt.phase]);
        var barEl = document.getElementById(barEls[evt.phase]);
        if (textEl) textEl.textContent = (evt.processed || 0) + '/' + evt.total;
        if (barEl && evt.total > 0) barEl.style.width = ((evt.processed || 0) / evt.total * 100) + '%';
      }
    }
  }

  function _updateCardProgress(filename, pct, color) {
    var safeFn = escape(filename);
    var card = panel.querySelector('[data-filename="' + safeFn + '"]')
           || panel.querySelector('[data-fn="' + safeFn + '"]');
    if (!card) return;
    card = card.closest ? (card.closest('.relative, .bg-gray-50, .bg-gray-100') || card) : card;
    _ensureBar(card, filename);
    _updateBar(card, pct, color);
  }

  // ---- Phase 1: Upload + OCR ----
  function renderPhase1() {
    panel.innerHTML = ''
      + '<div class="flex items-center justify-between p-4 border-b dark:border-gray-700">'
      + '<h2 class="text-lg font-bold dark:text-white">Subir imagenes</h2>'
      + '<button id="upload-close" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl">&times;</button>'
      + '</div>'
      + '<div class="p-6 flex-1 overflow-y-auto">'
      + '<div id="drop-zone" class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">'
      + '<p class="text-gray-500 dark:text-gray-400 text-lg mb-2">Arrastra imagenes aqui</p>'
      + '<p class="text-gray-400 dark:text-gray-500 text-sm">o haz clic para seleccionar</p>'
      + '<input type="file" id="file-input" multiple accept="image/*" class="hidden" />'
      + '</div>'
      + '<div id="ocr-progress" class="mt-4 hidden">'
      + '<div class="flex items-center gap-2 mb-2">'
      + '<div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div id="ocr-bar" class="bg-blue-600 h-2 rounded-full transition-all" style="width:0%"></div></div>'
      + '<span id="ocr-text" class="text-sm text-gray-500 dark:text-gray-400">0/0</span>'
      + '</div></div>'
      + '<div id="ocr-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4"></div>'
      + '<div id="ocr-actions" class="flex justify-end gap-3 mt-4 hidden">'
      + '<button id="select-all-btn" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600">Seleccionar todo</button>'
      + '<button id="continue-crop-btn" class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Continuar con recorte</button>'
      + '</div></div>';

    document.getElementById('upload-close').addEventListener('click', function() { if (currentSessionId) api.deleteSession(currentSessionId).catch(function() {}); overlay.remove(); });
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    dropZone.addEventListener('click', function() { fileInput.click(); });
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('border-blue-500'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('border-blue-500'); });
    dropZone.addEventListener('drop', function(e) { e.preventDefault(); dropZone.classList.remove('border-blue-500'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', function() { handleFiles(fileInput.files); });

    async function handleFiles(files) {
      if (!files.length) return;
      var progress = document.getElementById('ocr-progress');
      var bar = document.getElementById('ocr-bar');
      var text = document.getElementById('ocr-text');
      var grid = document.getElementById('ocr-grid');
      var actions = document.getElementById('ocr-actions');
      progress.classList.remove('hidden'); dropZone.classList.add('hidden'); grid.innerHTML = '';
      try {
        var response = await api.uploadAndOCR(files, null, currentSessionId);
        await api.sseReader(response, function(evt) {
          _handleHeartbeat(evt);
          if (evt.done) { currentSessionId = evt.session_id; bar.style.width = '100%'; text.textContent = evt.success + '/' + evt.total; }
          else if (evt.ok) {
            bar.style.width = ((evt.processed / evt.total) * 100) + '%'; text.textContent = evt.processed + '/' + evt.total;
            var safeFilename = escape(evt.filename);
            var card = document.createElement('div');
            card.className = 'relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden p-2';
            card.setAttribute('data-filename', safeFilename);
            card.innerHTML = '<p class="text-sm font-medium dark:text-gray-200 truncate mb-1">' + safeFilename + '</p>'
              + '<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">' + escape(evt.ocr_text || '(sin texto)').substring(0, 120) + '</p>'
              + '<input type="checkbox" checked data-filename="' + safeFilename + '" class="absolute top-1 right-1 w-4 h-4">'
              + _makeProgressBar(evt.filename, evt.image_progress || 0, 'bg-blue-600');
            grid.appendChild(card);
          }
        });
        if (currentSessionId && grid.children.length > 0) actions.classList.remove('hidden');
      } catch (err) {
        var msg = typeof err.message === 'string' ? err.message : JSON.stringify(err.message);
        alert('Error en OCR: ' + msg);
        console.error('Upload error:', err);
        progress.classList.add('hidden'); dropZone.classList.remove('hidden');
      }
    }

    document.getElementById('select-all-btn').addEventListener('click', function() {
      var c = document.querySelectorAll('#ocr-grid input[type="checkbox"]');
      var all = Array.from(c).every(function(x) { return x.checked; });
      c.forEach(function(x) { x.checked = !all; });
    });
    document.getElementById('continue-crop-btn').addEventListener('click', function() {
      var a = Array.from(document.querySelectorAll('#ocr-grid input[type="checkbox"]:checked')).map(function(x) { return x.dataset.filename; });
      if (!a.length) { alert('Selecciona al menos una imagen'); return; }
      renderPhase2(currentSessionId, a);
    });
  }

  // ---- Phase 2: Crop ----
  function renderPhase2(sessionId, accepted) {
    panel.innerHTML = ''
      + '<div class="flex items-center justify-between p-4 border-b dark:border-gray-700"><h2 class="text-lg font-bold dark:text-white">Recortando</h2></div>'
      + '<div class="p-6 flex-1 overflow-y-auto">'
      + '<div class="flex items-center gap-2 mb-4"><div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div id="crop-bar" class="bg-green-600 h-2 rounded-full transition-all" style="width:0%"></div></div><span id="crop-text" class="text-sm text-gray-500 dark:text-gray-400">0/' + accepted.length + '</span></div>'
      + '<div id="crop-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3"></div>'
      + '</div>';
    var bar = document.getElementById('crop-bar'), cropText = document.getElementById('crop-text'), grid = document.getElementById('crop-grid');
    (async function() {
      try {
        var r = await api.cropBatch(sessionId, accepted, null);
        await api.sseReader(r, function(evt) {
          _handleHeartbeat(evt);
          if (evt.done) { bar.style.width = '100%'; cropText.textContent = evt.success + '/' + evt.total; renderPhase3(sessionId); }
          else if (evt.ok) {
            bar.style.width = ((evt.processed / evt.total) * 100) + '%'; cropText.textContent = evt.processed + '/' + evt.total;
            var card = document.createElement('div'); card.className = 'relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden';
            card.setAttribute('data-filename', escape(evt.filename));
            card.innerHTML = '<img src="data:image/png;base64,' + evt.preview + '" class="w-full h-32 object-cover" />'
          + '<p class="p-1 text-xs truncate dark:text-gray-300">' + escape(evt.filename) + '</p>'
          + _makeProgressBar(evt.filename, evt.image_progress || 0, 'bg-green-600');
        grid.appendChild(card);
          }
        });
      } catch (err) { alert('Error en recorte: ' + err.message); }
    })();
  }

  // ---- Phase 3: Describe + review ----
  var _reviewData = {};

  function renderPhase3(sessionId) {
    panel.innerHTML = ''
      + '<div class="flex items-center justify-between p-4 border-b dark:border-gray-700"><h2 class="text-lg font-bold dark:text-white">Describiendo</h2></div>'
      + '<div class="p-6 flex-1 overflow-y-auto">'
      + '<div class="flex items-center gap-2 mb-4"><div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div id="desc-bar" class="bg-purple-600 h-2 rounded-full transition-all" style="width:0%"></div></div><span id="desc-text" class="text-sm text-gray-500 dark:text-gray-400">0/0</span></div>'
      + '<div id="desc-results" class="space-y-4"></div>'
      + '<div id="desc-actions" class="hidden flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">'
      + '<button id="select-all-desc-btn" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600">Seleccionar todo</button>'
      + '<button id="index-btn" class="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Indexar seleccionadas</button>'
      + '</div></div>';
    var bar = document.getElementById('desc-bar'), descText = document.getElementById('desc-text'), results = document.getElementById('desc-results'), actions = document.getElementById('desc-actions');
    var descTotal = 0;

    (async function() {
      try {
        var r = await api.describeBatch(sessionId, null);
        await api.sseReader(r, function(evt) {
          _handleHeartbeat(evt);
          if (evt.done) {
            bar.style.width = '100%'; bar.classList.remove('bg-purple-600'); bar.classList.add('bg-green-600');
            descText.textContent = evt.success + '/' + evt.total;
            descTotal = evt.success;
            if (evt.success > 0) actions.classList.remove('hidden');
          } else if (evt.ok) {
            bar.style.width = ((evt.processed / evt.total) * 100) + '%';
            descText.textContent = evt.processed + '/' + evt.total;

            var fn = evt.filename;
            var safeFn = escape(fn);
            var ocrText = evt.ocr_text || '';
            var description = evt.description || '';

            _reviewData[fn] = { ocrText: ocrText, description: description };

            var row = document.createElement('div');
            row.className = 'bg-gray-50 dark:bg-gray-700 rounded-lg p-4';
            row.setAttribute('data-filename', safeFn);
            row.innerHTML = ''
              + '<div class="flex gap-4">'
              + '<div class="flex-shrink-0 w-32 h-32"><img src="data:image/png;base64,' + evt.preview + '" class="w-full h-full object-cover rounded-lg" /></div>'
              + '<div class="flex-1 space-y-3 min-w-0">'
              + '<p class="font-medium text-sm dark:text-white truncate">' + safeFn + '</p>'
              + _makeProgressBar(fn, evt.image_progress || 0, 'bg-purple-600')
              + '<div><label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Texto reconocido (OCR)</label>'
              + '<textarea class="review-ocr w-full text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 rounded border border-gray-300 dark:border-gray-500 p-2 resize-y focus:border-blue-400 focus:ring-1 focus:ring-blue-300" rows="3" data-filename="' + safeFn + '">' + escape(ocrText) + '</textarea></div>'
              + '<div><label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Descripcion (gemma4)</label>'
              + '<textarea class="review-desc w-full text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 rounded border border-gray-300 dark:border-gray-500 p-2 resize-y focus:border-purple-400 focus:ring-1 focus:ring-purple-300" rows="3" data-filename="' + safeFn + '">' + escape(description) + '</textarea></div>'
              + '</div>'
              + '<div class="flex-shrink-0 flex items-start pt-6"><input type="checkbox" checked data-filename="' + safeFn + '" class="review-check w-4 h-4"></div>'
              + '</div>';
            results.appendChild(row);
          }
        });
      } catch (err) { alert('Error en descripcion: ' + err.message); }
    })();

    var saveTimers = {};
    panel.addEventListener('input', function(e) {
      var ta = e.target;
      if (!ta.classList.contains('review-ocr') && !ta.classList.contains('review-desc')) return;
      var fn = ta.dataset.filename;
      if (!fn) return;
      var key = ta.classList.contains('review-ocr') ? 'ocrText' : 'description';
      var val = ta.value;
      if (_reviewData[fn]) _reviewData[fn][key] = val;
      if (saveTimers[fn + key]) clearTimeout(saveTimers[fn + key]);
      saveTimers[fn + key] = setTimeout(function() {
        var data = {};
        if (ta.classList.contains('review-ocr')) data.ocr_text = val;
        else data.description = val;
        api.updateDescribe(currentSessionId, fn, data).catch(function() {});
      }, 500);
    });

    document.getElementById('select-all-desc-btn').addEventListener('click', function() {
      var c = document.querySelectorAll('.review-check');
      var all = Array.from(c).every(function(x) { return x.checked; });
      c.forEach(function(x) { x.checked = !all; });
    });
    document.getElementById('index-btn').addEventListener('click', function() {
      var accepted = Array.from(document.querySelectorAll('.review-check:checked')).map(function(x) { return x.dataset.filename; });
      if (!accepted.length) { alert('Selecciona al menos una imagen'); return; }
      renderPhase4(sessionId, accepted);
    });
  }

  // ---- Phase 4: Index ----
  function renderPhase4(sessionId, accepted) {
    panel.innerHTML = ''
      + '<div class="flex items-center justify-between p-4 border-b dark:border-gray-700"><h2 class="text-lg font-bold dark:text-white">Indexando</h2></div>'
      + '<div class="p-6 flex-1 overflow-y-auto">'
      + '<div class="flex items-center gap-2 mb-4"><div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div id="index-bar" class="bg-indigo-600 h-2 rounded-full transition-all" style="width:0%"></div></div><span id="index-text" class="text-sm text-gray-500 dark:text-gray-400">0/' + accepted.length + '</span></div>'
      + '<div id="index-results" class="space-y-2"></div>'
      + '<div id="index-done" class="hidden mt-4 p-4 bg-green-50 dark:bg-green-900 rounded-lg text-center">'
      + '<p class="text-green-700 dark:text-green-300 font-bold">Completado!</p>'
      + '<button id="close-done-btn" class="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Cerrar</button>'
      + '</div></div>';
    var bar = document.getElementById('index-bar'), indexText = document.getElementById('index-text'), results = document.getElementById('index-results'), doneDiv = document.getElementById('index-done');

    (async function() {
      try {
        var r = await api.indexBatch(sessionId, accepted, false, null);
        await api.sseReader(r, function(evt) {
          _handleHeartbeat(evt);
          if (evt.heartbeat) return;
          bar.style.width = (((evt.processed || 0) + (evt.errors ? evt.errors.length : 0) + (evt.duplicate ? 1 : 0)) / evt.total * 100) + '%';
          indexText.textContent = (evt.processed || 0) + '/' + evt.total;
          if (evt.done) {
            bar.style.width = '100%'; bar.classList.remove('bg-indigo-600'); bar.classList.add('bg-green-600');
            indexText.textContent = (evt.processed || 0) + '/' + evt.total;
            var dup = evt.duplicates || 0;
            var errCount = evt.errors ? evt.errors.length : 0;
            if (evt.processed === 0 && dup > 0 && errCount === 0) {
              document.getElementById('index-done').querySelector('p').textContent = 'Todas las imagenes ya existian (duplicadas)';
            } else if (evt.processed > 0 && dup > 0) {
              document.getElementById('index-done').querySelector('p').textContent = 'Indexadas: ' + evt.processed + '. Duplicadas: ' + dup;
            } else if (evt.processed === 0 && errCount > 0) {
              document.getElementById('index-done').querySelector('p').textContent = 'No se indexo ninguna imagen. Revisa los logs del motor en a22.';
            }
            doneDiv.classList.remove('hidden');
            if (onDone) onDone();
          } else if (evt.duplicate) {
            var row = document.createElement('div');
            row.className = 'p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg';
            var safeFn = escape(evt.filename);
            row.innerHTML = '<p class="font-medium text-yellow-800 dark:text-yellow-200 text-sm mb-2">Duplicado: ' + safeFn + '</p>'
              + '<div class="flex gap-2"><div class="flex-1"><img src="data:image/png;base64,' + evt.new_preview + '" class="w-full h-24 object-cover rounded" /></div>'
              + '<span class="text-yellow-600 dark:text-yellow-400 self-center">&asymp;</span>'
              + '<div class="flex-1"><p class="text-xs text-yellow-600 dark:text-yellow-400 truncate">' + escape((evt.existing_path || '').split('/').pop()) + '</p></div></div>'
              + '<button class="force-index-btn mt-2 px-3 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700">Anadir de todos modos</button>'
              + _makeProgressBar(evt.filename, evt.image_progress || 0, 'bg-indigo-600');
            row.querySelector('.force-index-btn').addEventListener('click', async function() {
              try {
                var rr = await api.indexBatch(sessionId, [evt.filename], true);
                await api.sseReader(rr, function(re) {
                  if (re.done) { bar.style.width = '100%'; bar.classList.remove('bg-indigo-600'); bar.classList.add('bg-green-600'); doneDiv.classList.remove('hidden'); row.remove(); if (onDone) onDone(); }
                });
              } catch (e) {}
            });
            results.appendChild(row);
          } else {
            var row2 = document.createElement('div');
            row2.className = 'p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm';
            row2.innerHTML = '<span class="text-green-600 dark:text-green-400">&check;</span> <span class="dark:text-gray-200">' + escape(evt.filename || '') + '</span>'
              + _makeProgressBar(evt.filename || '', evt.image_progress || 0, 'bg-indigo-600');
            results.appendChild(row2);
          }
        });
      } catch (err) { alert('Error en indexado: ' + err.message); }
    })();

    document.getElementById('close-done-btn') && document.getElementById('close-done-btn').addEventListener('click', function() {
      overlay.remove();
      if (onDone) onDone();
    });
  }

  renderPhase1();
}
