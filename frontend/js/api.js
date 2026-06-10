const API_URL = window.API_URL || '/api';

export function getToken() { return localStorage.getItem('token'); }
export function getUser() { const r = localStorage.getItem('user'); return r ? JSON.parse(r) : null; }
export function logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); location.reload(); }

function getAuthHeaders() {
  const t = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function handleResponse(r) {
  if (!r.ok) {
    const e = await r.json().catch(() => ({ detail: 'Error' }));
    const msg = Array.isArray(e.detail) ? e.detail.map(x => x.msg).join('; ') : (e.detail || 'Error');
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  async login(email, password) {
    return handleResponse(await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
  },
  async getImages(page = 0, limit = 20) {
    return handleResponse(await fetch(`${API_URL}/images?page=${page}&limit=${limit}`, { headers: getAuthHeaders() }));
  },
  async searchImages(query, scoreThreshold = 0.0) {
    return handleResponse(await fetch(`${API_URL}/search`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ query, score_threshold: scoreThreshold }) }));
  },
  async deleteImage(id) {
    const r = await fetch(`${API_URL}/images/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (!r.ok) throw new Error('Error al eliminar');
  },
  async updateImageDesc(id, description) {
    return handleResponse(await fetch(`${API_URL}/images/${id}/description`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ description }) }));
  },
  async getUsers() { return handleResponse(await fetch(`${API_URL}/admin/users`, { headers: getAuthHeaders() })); },
  async createUser(email, password, roles) {
    return handleResponse(await fetch(`${API_URL}/admin/users`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email, password, roles }) }));
  },
  async deleteUser(id) { const r = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!r.ok) throw new Error('Error'); },
  async updateUserRole(id, roles) { return handleResponse(await fetch(`${API_URL}/admin/users/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ roles }) })); },
  async rotateImage(id, deg) { return handleResponse(await fetch(`${API_URL}/admin/images/${id}/rotate?degrees=${deg}`, { method: 'POST', headers: getAuthHeaders() })); },
  async getLabels() { return handleResponse(await fetch(`${API_URL}/search/labels`, { headers: getAuthHeaders() })); },
  async searchByLabels(labels, matchAll, query, scoreThreshold) {
    return handleResponse(await fetch(`${API_URL}/search/labels`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ labels, match_all: matchAll, query, score_threshold: scoreThreshold }) }));
  },
  async getImageDetail(id) { return handleResponse(await fetch(`${API_URL}/admin/images/${id}`, { headers: getAuthHeaders() })); },
  async updateImageLabels(id, labels) { return handleResponse(await fetch(`${API_URL}/admin/images/${id}/labels`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ labels }) })); },
  async uploadAndOCR(files, signal, sessionId = null) {
    const t = getToken(); const fd = new FormData();
    Array.from(files).forEach(f => fd.append('files', f));
    if (sessionId) fd.append('session_id', sessionId);
    const r = await fetch(`${API_URL}/upload/batch/upload`, { method: 'POST', headers: { ...(t && { 'Authorization': `Bearer ${t}` }) }, body: fd, signal });
    if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Error' })); const msg = Array.isArray(e.detail) ? e.detail.map(x => x.msg).join('; ') : (e.detail || 'Error'); throw new Error(msg); }
    return r;
  },
  async cropBatch(sessionId, accepted, signal) {
    const t = getToken();
    const r = await fetch(`${API_URL}/upload/batch/crop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t && { 'Authorization': `Bearer ${t}` }) }, body: JSON.stringify({ session_id: sessionId, accepted }), signal });
    if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Error' })); const msg = Array.isArray(e.detail) ? e.detail.map(x => x.msg).join('; ') : (e.detail || 'Error'); throw new Error(msg); }
    return r;
  },
  async sseReader(response, onEvent, signal) {
    const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = ''; let last = null;
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop();
      for (const p of parts) { if (!p.startsWith('data: ')) continue; try { const d = JSON.parse(p.slice(6)); last = d; if (onEvent) onEvent(d); } catch (e) {} }
    }
    return last;
  },
  async describeBatch(sessionId, signal) {
    const t = getToken();
    const r = await fetch(`${API_URL}/upload/batch/describe`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t && { 'Authorization': `Bearer ${t}` }) }, body: JSON.stringify({ session_id: sessionId }), signal });
    if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Error' })); const msg = Array.isArray(e.detail) ? e.detail.map(x => x.msg).join('; ') : (e.detail || 'Error'); throw new Error(msg); }
    return r;
  },
  async updateDescribe(sessionId, filename, data) {
    return handleResponse(await fetch(`${API_URL}/upload/batch/describe-update`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ session_id: sessionId, filename, ...data }) }));
  },
  async indexBatch(sessionId, accepted, force) {
    const t = getToken();
    const r = await fetch(`${API_URL}/upload/batch/index`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t && { 'Authorization': `Bearer ${t}` }) }, body: JSON.stringify({ session_id: sessionId, accepted, force: !!force }) });
    if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Error' })); const msg = Array.isArray(e.detail) ? e.detail.map(x => x.msg).join('; ') : (e.detail || 'Error'); throw new Error(msg); }
    return r;
  },
  async updateOcrText(sessionId, filename, ocrText) {
    return handleResponse(await fetch(`${API_URL}/upload/batch/ocr-text`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ session_id: sessionId, filename, ocr_text: ocrText }) }));
  },
  async deleteSession(sid) { const t = getToken(); await fetch(`${API_URL}/upload/batch/session/${sid}`, { method: 'DELETE', headers: { ...(t && { 'Authorization': `Bearer ${t}` }) } }).catch(() => {}); },
  async getResizeScale() { return handleResponse(await fetch(`${API_URL}/admin/resize-scale`, { headers: getAuthHeaders() })); },
  async setResizeScale(scale) { return handleResponse(await fetch(`${API_URL}/admin/resize-scale`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ scale }) })); },
  async getRandomImage() { return handleResponse(await fetch(`${API_URL}/images/random`, { headers: getAuthHeaders() })); },
};
