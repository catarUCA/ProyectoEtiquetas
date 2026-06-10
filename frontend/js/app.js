import { getUser } from './api.js';
import { renderGallery } from './gallery.js';
import { renderAdmin } from './admin.js';
import { renderLogin } from './login.js';

const app = document.getElementById('app');
let forceGallery = false;

async function init() {
  const user = getUser();
  const isAdmin = user?.roles?.includes('ADMIN');
  if (!user) {
    renderLogin(app, () => init());
    return;
  }
  if (isAdmin && !forceGallery) {
    renderAdmin(app, () => { forceGallery = true; init(); });
  } else {
    renderGallery(app, () => {
      if (getUser()?.roles?.includes('ADMIN')) { forceGallery = false; init(); }
    });
  }
}

init();
