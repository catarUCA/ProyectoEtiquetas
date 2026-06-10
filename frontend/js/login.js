import { api } from './api.js';

const IMG_URL = window.API_URL.replace(/\/api\/?$/, '') + '/api/public/random-image';

export function renderLogin(container, onLogin) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center relative">
      <img id="login-bg" src="" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000" style="opacity:0" />
      <div class="absolute inset-0 bg-black bg-opacity-50"></div>
      <div class="relative z-10 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 class="text-2xl font-bold mb-6 text-center dark:text-white">Galeria de Etiquetas</h1>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Email</label>
            <input id="email" type="email" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Contrasena</label>
            <input id="password" type="password" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <p id="login-error" class="text-red-500 text-sm hidden"></p>
          <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">Iniciar sesion</button>
        </form>
      </div>
    </div>`;

  const bg = document.getElementById('login-bg');

  function loadBg() {
    const img = new Image();
    img.onload = function() {
      bg.src = img.src;
      bg.style.opacity = '1';
    };
    img.src = IMG_URL + '?_=' + Date.now();
  }

  loadBg();
  const interval = setInterval(loadBg, 5000);

  container._cleanup = function() { clearInterval(interval); };

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    try {
      const d = await api.login(document.getElementById('email').value, document.getElementById('password').value);
      localStorage.setItem('token', d.access_token);
      localStorage.setItem('user', JSON.stringify(d.user));
      clearInterval(interval);
      onLogin();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });
}
