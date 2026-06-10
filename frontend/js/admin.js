import { api, getUser, logout, getToken } from './api.js';

const MEDIA_BASE = window.API_URL.replace(/\/api\/?$/, '');
const AVAILABLE_ROLES = ['ADMIN', 'RESEARCHER', 'UPLOADER', 'USER', 'PUBLISHER'];

function toLabelBadge(l) {
  const color = l.color || '#6366f1';
  return '<span class="inline-flex items-center gap-1 text-xs rounded px-2 py-1" style="background:' + color + '20;color:' + color + ';border:1px solid ' + color + '40">' + l.name + '<button class="remove-label-btn hover:opacity-70 ml-1 font-bold" data-label="' + l.name + '">&times;</button></span>';
}

export function renderAdmin(container, onSwitchToGallery) {
  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-white">Panel de Administracion</h1>
        <div class="flex items-center gap-3">
          <button id="dark-toggle" class="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">&#x1F319;</button>
          <button id="gallery-btn" class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Galeria</button>
          <button id="logout-btn" class="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Salir</button>
        </div>
      </div>
      <div class="flex gap-2 mb-4" id="admin-tabs">
        <button class="tab-btn px-4 py-2 rounded-t-lg text-sm font-medium bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-gray-700" data-tab="users">Usuarios</button>
        <button class="tab-btn px-4 py-2 rounded-t-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-b-0 border-gray-200 dark:border-gray-700" data-tab="images">Imagenes</button>
      </div>
      <div id="tab-users" class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 rounded-tl-none">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold dark:text-white">Usuarios</h2>
          <button id="add-user-btn" class="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">+ Nuevo</button>
        </div>
        <table class="w-full text-sm"><thead><tr class="text-left dark:text-gray-300"><th class="pb-2">Email</th><th class="pb-2">Roles</th><th class="pb-2"></th></tr></thead><tbody id="users-table"></tbody></table>
      </div>
      <div id="tab-images" class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 rounded-tl-none hidden">
        <h2 class="text-lg font-semibold dark:text-white mb-4">Imagenes</h2>
        <div class="space-y-2">
          <div><label class="block text-sm dark:text-gray-300 mb-1">ID de imagen</label><input id="image-id-input" type="number" placeholder="Ej: 1" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"></div>
          <div class="flex gap-2">
            <button id="rotate-90-btn" class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Rotar 90&#176;</button>
            <button id="rotate-180-btn" class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Rotar 180&#176;</button>
            <button id="rotate-270-btn" class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Rotar 270&#176;</button>
          </div>
          <button id="view-image-btn" class="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm mt-2">Ver detalles</button>
          <button id="delete-image-btn" class="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm mt-2">Eliminar imagen</button>
          <p id="image-status" class="text-sm mt-2 hidden"></p>
          <hr class="border-gray-300 dark:border-gray-600 my-4">
          <h3 class="text-sm font-semibold dark:text-white mb-2">Tamaño de imagen para descripción</h3>
          <div class="flex items-center gap-2">
            <input id="resize-scale-slider" type="range" min="5" max="100" value="20" class="flex-1 h-1 accent-blue-600 cursor-pointer">
            <span id="resize-scale-label" class="text-xs dark:text-gray-300 w-10 text-right">20%</span>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Escala de redimensionado antes de enviar al modelo de visión</p>
        </div>
      </div>
    </div>
    <div id="user-modal" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden flex items-center justify-center">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 class="text-lg font-bold dark:text-white mb-4">Nuevo usuario</h3>
        <form id="user-form" class="space-y-3">
          <input id="new-email" type="email" placeholder="Email" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm">
          <input id="new-password" type="password" placeholder="Contrasena" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm">
          <div class="flex flex-wrap gap-2" id="new-roles-checks">
            ${AVAILABLE_ROLES.map(r => '<label class="text-xs dark:text-gray-300"><input type="checkbox" value="' + r + '" ' + (r === 'USER' ? 'checked' : '') + '> ' + r + '</label>').join('')}
          </div>
          <div class="flex gap-2 justify-end"><button type="button" id="cancel-user-btn" class="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg text-sm">Cancelar</button><button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Crear</button></div>
          <p id="user-error" class="text-red-500 text-sm hidden"></p>
        </form>
      </div>
    </div>
    <div id="image-detail-panel" class="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 transform translate-x-full transition-transform duration-300 overflow-y-auto">
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold dark:text-white">Detalle de imagen</h3>
          <button id="close-detail-btn" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl">&times;</button>
        </div>
        <img id="detail-image" src="" class="w-full rounded-lg mb-4 object-contain bg-gray-100 dark:bg-gray-900" style="max-height: 300px;" />
        <div class="space-y-2 text-sm dark:text-gray-200">
          <p><span class="font-medium">ID:</span> <span id="detail-id"></span></p>
          <p><span class="font-medium">Archivo:</span> <span id="detail-filename" class="break-all"></span></p>
          <p><span class="font-medium">Descripcion:</span> <span id="detail-desc" class="text-gray-600 dark:text-gray-400"></span></p>
          <p><span class="font-medium">Fecha:</span> <span id="detail-date"></span></p>
        </div>
        <div class="mt-4">
          <h4 class="text-sm font-medium dark:text-white mb-2">Labels</h4>
          <div id="detail-labels" class="flex flex-wrap gap-1 mb-2"></div>
          <div class="flex gap-2">
            <input id="new-label-input" type="text" placeholder="Nuevo label..." class="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white outline-none">
            <button id="add-label-btn" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">+</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('gallery-btn').addEventListener('click', onSwitchToGallery);
  document.getElementById('dark-toggle').addEventListener('click', () => { document.documentElement.classList.toggle('dark'); });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => { b.className = b.className.replace(/bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400/, 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'); });
      btn.className = btn.className.replace(/bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300/, 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400');
      document.getElementById('tab-users').classList.toggle('hidden', btn.dataset.tab !== 'users');
      document.getElementById('tab-images').classList.toggle('hidden', btn.dataset.tab !== 'images');
    });
  });

  loadUsers();
  async function loadUsers() {
    try {
      const d = await api.getUsers();
      const tbody = document.getElementById('users-table');
      tbody.innerHTML = d.users.map(u => {
        const rolesStr = (u.roles || []).join(', ');
        return '<tr class="border-t dark:border-gray-700"><td class="py-2 dark:text-gray-200">' + u.email + '</td><td class="py-2"><span class="text-xs dark:text-gray-400">' + rolesStr + '</span><button data-id="' + u.id + '" class="edit-roles-btn ml-2 text-blue-600 dark:text-blue-400 text-xs hover:underline">Editar</button></td><td class="py-2 text-right"><button data-id="' + u.id + '" class="del-user text-red-600 hover:text-red-800 dark:text-red-400 text-sm">Eliminar</button></td></tr>';
      }).join('');
      tbody.querySelectorAll('.edit-roles-btn').forEach(b => b.addEventListener('click', () => editRolesModal(b.dataset.id, d.users.find(u => u.id == b.dataset.id))));
      tbody.querySelectorAll('.del-user').forEach(b => b.addEventListener('click', async () => { if (confirm('Eliminar usuario?')) { await api.deleteUser(b.dataset.id); loadUsers(); } }));
    } catch (e) {}
  }

  function editRolesModal(userId, user) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    modal.innerHTML = '<div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-xs"><h3 class="text-lg font-bold dark:text-white mb-4">Editar roles</h3><div class="flex flex-wrap gap-2 mb-4" id="edit-roles-checks">' + AVAILABLE_ROLES.map(r => '<label class="text-xs dark:text-gray-300"><input type="checkbox" value="' + r + '" ' + ((user.roles || []).includes(r) ? 'checked' : '') + '> ' + r + '</label>').join('') + '</div><div class="flex gap-2 justify-end"><button class="cancel-edit px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg text-sm">Cancelar</button><button class="save-roles px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Guardar</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.cancel-edit').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('.save-roles').addEventListener('click', async () => {
      const roles = Array.from(modal.querySelectorAll('#edit-roles-checks input:checked')).map(x => x.value);
      try { await api.updateUserRole(userId, roles); modal.remove(); loadUsers(); } catch (e) { alert(e.message); }
    });
  }

  const userModal = document.getElementById('user-modal');
  document.getElementById('add-user-btn').addEventListener('click', () => userModal.classList.remove('hidden'));
  document.getElementById('cancel-user-btn').addEventListener('click', () => userModal.classList.add('hidden'));
  userModal.addEventListener('click', (e) => { if (e.target === userModal) userModal.classList.add('hidden'); });
  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = document.getElementById('user-error');
    const roles = Array.from(document.querySelectorAll('#new-roles-checks input:checked')).map(x => x.value);
    try { await api.createUser(document.getElementById('new-email').value, document.getElementById('new-password').value, roles); userModal.classList.add('hidden'); loadUsers(); } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });

  const imgInput = document.getElementById('image-id-input');
  const imgStatus = document.getElementById('image-status');
  const detailPanel = document.getElementById('image-detail-panel');
  let currentDetailId = null, currentDetailLabels = [];

  async function rotate(deg) {
    const id = imgInput.value; if (!id) return; imgStatus.classList.remove('hidden'); imgStatus.textContent = 'Procesando...';
    try { await api.rotateImage(id, deg); imgStatus.textContent = 'Rotada correctamente'; imgStatus.className = 'text-sm mt-2 text-green-600 dark:text-green-400'; }
    catch (e) { imgStatus.textContent = e.message; imgStatus.className = 'text-sm mt-2 text-red-500'; }
  }
  document.getElementById('rotate-90-btn').addEventListener('click', () => rotate(90));
  document.getElementById('rotate-180-btn').addEventListener('click', () => rotate(180));
  document.getElementById('rotate-270-btn').addEventListener('click', () => rotate(270));
  document.getElementById('delete-image-btn').addEventListener('click', async () => {
    const id = imgInput.value; if (!id || !confirm('Eliminar imagen ' + id + '?')) return;
    imgStatus.classList.remove('hidden'); imgStatus.textContent = 'Eliminando...';
    try { await api.deleteImage(parseInt(id)); imgStatus.textContent = 'Eliminada'; imgStatus.className = 'text-sm mt-2 text-green-600 dark:text-green-400'; }
    catch (e) { imgStatus.textContent = e.message; imgStatus.className = 'text-sm mt-2 text-red-500'; }
  });

  document.getElementById('view-image-btn').addEventListener('click', async () => {
    const id = imgInput.value;
    if (!id) return;
    imgStatus.classList.add('hidden');
    try {
      currentDetailId = parseInt(id);
      const detail = await api.getImageDetail(currentDetailId);
      currentDetailLabels = detail.labels || [];
      document.getElementById('detail-id').textContent = detail.img_id;
      document.getElementById('detail-filename').textContent = detail.filename;
      document.getElementById('detail-desc').textContent = detail.image_description || 'Sin descripcion';
      document.getElementById('detail-date').textContent = detail.indexed_at || '';
      document.getElementById('detail-image').src = MEDIA_BASE + '/images/' + detail.filename + '?token=' + getToken();
      renderDetailLabels();
      detailPanel.classList.add('translate-x-0');
      detailPanel.classList.remove('translate-x-full');
    } catch (e) {
      imgStatus.classList.remove('hidden');
      imgStatus.textContent = e.message;
      imgStatus.className = 'text-sm mt-2 text-red-500';
    }
  });

  function renderDetailLabels() {
    const container = document.getElementById('detail-labels');
    container.innerHTML = currentDetailLabels.map(toLabelBadge).join('');
    container.querySelectorAll('.remove-label-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.label;
        currentDetailLabels = currentDetailLabels.filter(l => l.name !== name);
        await api.updateImageLabels(currentDetailId, currentDetailLabels.map(l => l.name));
        renderDetailLabels();
      });
    });
  }

  document.getElementById('add-label-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-label-input');
    const label = input.value.trim();
    if (!label || currentDetailLabels.some(l => l.name === label)) return;
    currentDetailLabels.push({ name: label, color: '#6366f1', slug: label.toLowerCase().replace(/\s+/g, '-') });
    await api.updateImageLabels(currentDetailId, currentDetailLabels.map(l => l.name));
    input.value = '';
    renderDetailLabels();
  });
  document.getElementById('new-label-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('add-label-btn').click();
    }
  });

  document.getElementById('close-detail-btn').addEventListener('click', () => {
    detailPanel.classList.add('translate-x-full');
    detailPanel.classList.remove('translate-x-0');
    currentDetailId = null;
  });

  const scaleSlider = document.getElementById('resize-scale-slider');
  const scaleLabel = document.getElementById('resize-scale-label');

  async function loadResizeScale() {
    try {
      const d = await api.getResizeScale();
      const pct = Math.round(d.scale * 100);
      scaleSlider.value = pct;
      scaleLabel.textContent = pct + '%';
    } catch (e) {}
  }
  loadResizeScale();

  let scaleTimeout;
  scaleSlider.addEventListener('input', () => {
    const pct = scaleSlider.value;
    scaleLabel.textContent = pct + '%';
    clearTimeout(scaleTimeout);
    scaleTimeout = setTimeout(async () => {
      try {
        await api.setResizeScale(parseInt(pct) / 100);
      } catch (e) { alert('Error al guardar escala: ' + e.message); loadResizeScale(); }
    }, 400);
  });
}
