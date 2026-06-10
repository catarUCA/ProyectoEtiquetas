import { api, getUser, getToken, logout } from './api.js';

const MEDIA_BASE = window.API_URL.replace(/\/api\/?$/, '');

export function renderGallery(container, onSwitchToAdmin) {
  let page = 0, loading = false, totalImages = 0, perPage = 20, searchMode = false;
  let allLabels = [], selectedLabels = [], labelMatchMode = 'OR', scoreThreshold = 0.0, searchQuery = '';
  const user = getUser();
  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-white">Galeria</h1>
        <div class="flex items-center gap-3">
          <button id="dark-toggle" class="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600" title="Modo oscuro">&#x1F319;</button>
          ${onSwitchToAdmin ? '<button id="admin-btn" class="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Admin</button>' : ''}
          <button id="logout-btn" class="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Salir</button>
        </div>
      </div>
      <div class="mb-6 space-y-3">
        <div class="flex gap-2">
          <input id="search-input" type="text" placeholder="Buscar etiquetas..." class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          <button id="upload-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"><span>+</span> Subir</button>
        </div>
        <div id="labels-filter-bar" class="hidden space-y-2">
          <div class="flex items-center gap-2 flex-wrap" id="labels-container"></div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-500 dark:text-gray-400">Modo:</span>
            <label class="text-xs dark:text-gray-300"><input type="radio" name="label-mode" value="OR" checked> Cualquier label (OR)</label>
            <label class="text-xs dark:text-gray-300"><input type="radio" name="label-mode" value="AND"> Todos los labels (AND)</label>
            <span class="text-xs text-gray-400 mx-2">|</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">Similitud minima:</span>
            <input id="threshold-slider" type="range" min="0" max="100" value="0" class="w-24 h-1 accent-blue-600">
            <span id="threshold-label" class="text-xs text-gray-500 dark:text-gray-400">0%</span>
          </div>
        </div>
      </div>
      <p id="result-count" class="text-sm text-gray-500 dark:text-gray-400 mb-3 hidden"></p>
      <div id="image-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"></div>
      <div id="loading-spinner" class="flex justify-center py-8 hidden"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      <p id="no-results" class="text-center text-gray-500 dark:text-gray-400 py-8 hidden">No se encontraron imagenes</p>
      <div id="pagination-bar" class="flex items-center justify-center gap-2 mt-6 hidden"></div>
    </div>
    <div id="image-modal" class="fixed inset-0 bg-black bg-opacity-90 z-50 hidden flex items-center justify-center">
      <button id="modal-close" class="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-50">&times;</button>
      <button id="modal-delete" class="absolute top-4 right-14 text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1 text-sm z-50">Eliminar</button>
      <div class="flex flex-col items-center gap-4 max-w-[90vw] max-h-[90vh]">
        <div id="image-viewer-container" class="relative overflow-hidden">
          <img id="image-viewer" src="" class="max-w-[85vw] max-h-[65vh] object-contain transition-transform duration-100 select-none" draggable="false" />
        </div>
        <div class="w-full max-w-xl px-2">
          <textarea id="modal-description" class="w-full text-sm text-white bg-black bg-opacity-60 rounded-lg p-3 resize-y border border-gray-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none" rows="3" placeholder="Sin descripción"></textarea>
          <div class="flex justify-end mt-2">
            <p id="save-desc-status" class="text-xs text-green-400 mr-3 self-center hidden">Guardado</p>
            <button id="save-desc-btn" class="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Guardar</button>
          </div>
        </div>
      </div>
    </div>`;
  const grid = document.getElementById('image-grid');
  const searchInput = document.getElementById('search-input');
  const spinner = document.getElementById('loading-spinner');
  const noResults = document.getElementById('no-results');
  const modal = document.getElementById('image-modal');
  const viewer = document.getElementById('image-viewer');
  const resultCount = document.getElementById('result-count');
  const paginationBar = document.getElementById('pagination-bar');
  const labelsContainer = document.getElementById('labels-container');
  const labelsFilterBar = document.getElementById('labels-filter-bar');
  const thresholdSlider = document.getElementById('threshold-slider');
  const thresholdLabel = document.getElementById('threshold-label');
  let currentViewerImg = null;

  function toLabelHtml(l) {
    const color = l.color || '#6366f1';
    return '<span class="text-[10px] rounded px-1 whitespace-nowrap" style="background:' + color + '20;color:' + color + ';border:1px solid ' + color + '40">' + l.name + '</span>';
  }

  function renderCard(img) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow relative group';
    card.setAttribute('data-id', img.id);
    const labelsHtml = (img.labels || []).length
      ? '<div class="flex flex-wrap gap-1 px-2 pb-1">' + img.labels.map(toLabelHtml).join('') + '</div>'
      : '';
    card.innerHTML = `
      <div class="cursor-pointer">
        <img src="${MEDIA_BASE}${img.url}?token=${getToken()}" alt="${img.title}" class="w-full h-40 object-cover" loading="lazy" />
        <div class="p-2"><p class="text-xs text-gray-500 dark:text-gray-400 truncate">${img.title}</p></div>
        ${labelsHtml}
      </div>
      <button class="delete-btn absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700" title="Eliminar">&times;</button>`;
    card.querySelector('.cursor-pointer').addEventListener('click', () => openViewer(img));
    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Eliminar ' + img.title + '?')) return;
      try { await api.deleteImage(parseInt(img.id)); card.remove(); totalImages--; updateResultCount(); if (!grid.children.length && page === 0) noResults.classList.remove('hidden'); } catch (err) { alert('Error: ' + err.message); }
    });
    return card;
  }

  function openViewer(img) {
    currentViewerImg = img; viewer.src = MEDIA_BASE + img.url + '?token=' + getToken(); viewer.style.transform = 'scale(1) translate(0px,0px)';
    document.getElementById('modal-description').value = img.description || '';
    document.getElementById('save-desc-status').classList.add('hidden');
    modal.classList.remove('hidden');
    let scale = 1, panX = 0, panY = 0, dragging = false, sx, sy;
    viewer.onwheel = (e) => { e.preventDefault(); scale = Math.max(0.5, Math.min(5, scale + (e.deltaY > 0 ? -0.1 : 0.1))); viewer.style.transform = 'scale(' + scale + ') translate(' + panX + 'px,' + panY + 'px)'; };
    viewer.onmousedown = (e) => { if (scale <= 1) return; dragging = true; sx = e.clientX - panX; sy = e.clientY - panY; };
    window.onmousemove = (e) => { if (!dragging) return; panX = e.clientX - sx; panY = e.clientY - sy; viewer.style.transform = 'scale(' + scale + ') translate(' + panX + 'px,' + panY + 'px)'; };
    window.onmouseup = () => { dragging = false; };
  }

  document.getElementById('modal-close').addEventListener('click', () => { modal.classList.add('hidden'); viewer.src = ''; currentViewerImg = null; });
  document.getElementById('modal-delete').addEventListener('click', async () => {
    if (!currentViewerImg || !confirm('Eliminar ' + currentViewerImg.title + '?')) return;
    try { await api.deleteImage(parseInt(currentViewerImg.id)); modal.classList.add('hidden'); viewer.src = '';
      const c = grid.querySelector('[data-id="' + currentViewerImg.id + '"]'); if (c) c.remove(); totalImages--; updateResultCount(); currentViewerImg = null;
    } catch (err) { alert('Error: ' + err.message); }
  });

  document.getElementById('save-desc-btn').addEventListener('click', async () => {
    if (!currentViewerImg) return;
    const img = currentViewerImg;
    const newDesc = document.getElementById('modal-description').value;
    const status = document.getElementById('save-desc-status');
    try {
      await api.updateImageDesc(parseInt(img.id), newDesc);
      img.description = newDesc;
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 2000);
    } catch (err) { alert('Error al guardar: ' + err.message); }
  });

  document.getElementById('logout-btn').addEventListener('click', logout);
  if (document.getElementById('admin-btn')) document.getElementById('admin-btn').addEventListener('click', onSwitchToAdmin);
  document.getElementById('dark-toggle').addEventListener('click', () => { document.documentElement.classList.toggle('dark'); });
  document.getElementById('upload-btn').addEventListener('click', () => { import('./upload.js').then(m => m.renderUploadModal(() => { page = 0; grid.innerHTML = ''; totalImages = 0; loadImages(); })); });

  loadLabels();
  async function loadLabels() {
    try { const d = await api.getLabels(); allLabels = d.labels; renderLabelFilters(); } catch (e) {}
  }

  function renderLabelFilters() {
    if (!allLabels.length) return;
    labelsContainer.innerHTML = allLabels.map(l => {
      const color = l.color || '#6366f1';
      return '<label class="inline-flex items-center gap-1 text-xs cursor-pointer select-none px-2 py-0.5 rounded" style="background:' + color + '15"><input type="checkbox" class="label-checkbox rounded accent-blue-600" value="' + l.name + '"> ' + l.name + '</label>';
    }).join('');
    labelsContainer.querySelectorAll('.label-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        selectedLabels = Array.from(labelsContainer.querySelectorAll('.label-checkbox:checked')).map(x => x.value);
        if (selectedLabels.length) { page = 0; grid.innerHTML = ''; doLabelSearch(); } else if (searchQuery) { page = 0; grid.innerHTML = ''; doTextSearch(); } else { page = 0; grid.innerHTML = ''; searchMode = false; loadImages(); }
      });
    });
    document.querySelectorAll('input[name="label-mode"]').forEach(r => r.addEventListener('change', () => {
      labelMatchMode = document.querySelector('input[name="label-mode"]:checked').value;
      if (selectedLabels.length) { page = 0; grid.innerHTML = ''; doLabelSearch(); }
    }));
    thresholdSlider.addEventListener('input', () => {
      scoreThreshold = parseInt(thresholdSlider.value) / 100;
      thresholdLabel.textContent = thresholdSlider.value + '%';
    });
    let thrTimer;
    thresholdSlider.addEventListener('change', () => {
      clearTimeout(thrTimer);
      thrTimer = setTimeout(() => {
        if (selectedLabels.length) { page = 0; grid.innerHTML = ''; doLabelSearch(); }
        else if (searchQuery) { page = 0; grid.innerHTML = ''; doTextSearch(); }
      }, 300);
    });
    labelsFilterBar.classList.remove('hidden');
  }

  function updateResultCount() {
    if (totalImages > 0) {
      const start = page * perPage + 1;
      const end = Math.min((page + 1) * perPage, totalImages);
      resultCount.textContent = 'Mostrando ' + start + '-' + end + ' de ' + totalImages + ' imagenes';
      resultCount.classList.remove('hidden');
    } else {
      resultCount.classList.add('hidden');
    }
  }

  function renderPagination() {
    const totalPages = Math.ceil(totalImages / perPage);
    if (totalPages <= 1) { paginationBar.classList.add('hidden'); return; }
    paginationBar.classList.remove('hidden');
    let html = '<button id="prev-page" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50" ' + (page === 0 ? 'disabled' : '') + '>&laquo; Anterior</button>';
    const maxButtons = 7;
    let startPage = Math.max(0, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages - 1, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) startPage = Math.max(0, endPage - maxButtons + 1);
    for (let i = startPage; i <= endPage; i++) {
      html += '<button class="page-btn px-3 py-1 rounded-lg text-sm ' + (i === page ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600') + '" data-page="' + i + '">' + (i + 1) + '</button>';
    }
    html += '<button id="next-page" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50" ' + (page >= totalPages - 1 ? 'disabled' : '') + '>Siguiente &raquo;</button>';
    paginationBar.innerHTML = html;
    paginationBar.querySelectorAll('.page-btn').forEach(b => b.addEventListener('click', () => { page = parseInt(b.dataset.page); grid.innerHTML = ''; loadImages(); }));
    document.getElementById('prev-page').addEventListener('click', () => { if (page > 0) { page--; grid.innerHTML = ''; loadImages(); } });
    document.getElementById('next-page').addEventListener('click', () => { if (page < totalPages - 1) { page++; grid.innerHTML = ''; loadImages(); } });
  }

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      searchQuery = searchInput.value.trim();
      selectedLabels = Array.from(labelsContainer.querySelectorAll('.label-checkbox:checked')).map(x => x.value);
      page = 0; grid.innerHTML = '';
      if (!searchQuery && !selectedLabels.length) { searchMode = false; loadImages(); return; }
      if (selectedLabels.length) { doLabelSearch(); } else { doTextSearch(); }
    }, 300);
  });

  async function doTextSearch() {
    searchMode = true; spinner.classList.remove('hidden'); noResults.classList.add('hidden'); paginationBar.classList.add('hidden');
    try {
      const d = await api.searchImages(searchQuery, scoreThreshold);
      grid.innerHTML = '';
      totalImages = d.total;
      if (!d.images.length) noResults.classList.remove('hidden');
      else d.images.forEach(i => grid.appendChild(renderCard(i)));
      updateResultCount();
    } catch (e) {} finally { spinner.classList.add('hidden'); }
  }

  async function doLabelSearch() {
    searchMode = true; spinner.classList.remove('hidden'); noResults.classList.add('hidden'); paginationBar.classList.add('hidden');
    try {
      const d = await api.searchByLabels(selectedLabels, labelMatchMode === 'AND', searchQuery || null, scoreThreshold);
      grid.innerHTML = '';
      totalImages = d.total;
      if (!d.images.length) noResults.classList.remove('hidden');
      else d.images.forEach(i => grid.appendChild(renderCard(i)));
      updateResultCount();
    } catch (e) {} finally { spinner.classList.add('hidden'); }
  }

  async function loadImages() {
    if (loading) return; loading = true; spinner.classList.remove('hidden'); noResults.classList.add('hidden');
    try {
      const d = await api.getImages(page, perPage);
      grid.innerHTML = '';
      totalImages = d.total;
      if (!d.images.length && page === 0) noResults.classList.remove('hidden');
      else d.images.forEach(i => grid.appendChild(renderCard(i)));
      updateResultCount();
      renderPagination();
    } catch (e) {} finally { loading = false; spinner.classList.add('hidden'); }
  }

  loadImages();
}
