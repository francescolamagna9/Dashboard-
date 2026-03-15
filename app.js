// ── CONFIG ────────────────────────────────────────────────────────────────────
const GH_OWNER   = 'francescolamagna9';
const GH_REPO    = 'Dashboard-';
const GH_BRANCH  = 'main';
const GH_DATA    = 'dashboard-data.json';
const GH_FILES   = 'files';

const SK = 'skill_db_v5';
const PK = 'skill_project_v2';
const GH_TOKEN_KEY = 'gh_pat_skill';

// ── STATE ─────────────────────────────────────────────────────────────────────
let SKILLS       = [];
let PROJECT      = null;
let selectedType = null;
let selSkill     = null;
let selStep      = null;
let modalTags    = [];
let pendingFile  = null;
let nextId       = 1;
let ghToken      = localStorage.getItem(GH_TOKEN_KEY) || null;
let ghUser       = null;
let ghDataSha    = null;
const previewMode = {};

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

function catCls(c) {
  const map = {
    'Copywriting':'cat-copy','Project Management':'cat-pm',
    'Development':'cat-dev','Design':'cat-design',
    'SEO':'cat-seo','HTML / Template':'cat-html'
  };
  return map[c] || 'cat-other';
}

function fileIcon(name, isText) {
  if (!name) return '📄';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icons = {zip:'🗜️',pdf:'📕',md:'📝',txt:'📄',json:'📋',html:'🌐',css:'🎨',js:'⚙️',ts:'⚙️',png:'🖼️',jpg:'🖼️',jpeg:'🖼️',gif:'🖼️',svg:'🖼️',mp4:'🎬',mp3:'🎵'};
  return icons[ext] || (isText ? '📄' : '📦');
}

function fileExt(name) {
  return name ? (name.split('.').pop() || 'FILE').toUpperCase() : 'FILE';
}

function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function isTextFile(file) {
  const textExts = ['txt','md','json','html','htm','css','js','ts','jsx','tsx','csv','xml','yaml','yml','sh','py','rb','php','sql'];
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (textExts.includes(ext)) return true;
  if (file.type.startsWith('text/')) return true;
  return false;
}

function isHtmlSkill(s) {
  if (!s || !s.isText) return false;
  const ext = (s.filename || '').split('.').pop().toLowerCase();
  return ext === 'html' || ext === 'htm';
}

function isBinarySkill(s) {
  return s && !s.isText && !s.ghPath;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── LOCAL STORAGE ─────────────────────────────────────────────────────────────
function loadLocal() {
  try {
    const r = localStorage.getItem(SK);
    if (r) SKILLS = JSON.parse(r);
  } catch(e) { SKILLS = []; }
  try {
    const p = localStorage.getItem(PK);
    if (p) PROJECT = JSON.parse(p);
  } catch(e) { PROJECT = null; }
  nextId = Math.max(0, ...SKILLS.map(s => s.id)) + 1;
}

function saveLocal() {
  try { localStorage.setItem(SK, JSON.stringify(SKILLS)); } catch(e) {}
  try { if (PROJECT) localStorage.setItem(PK, JSON.stringify(PROJECT)); } catch(e) {}
}

// ── GITHUB SYNC ───────────────────────────────────────────────────────────────
function setSyncStatus(state, label) {
  const st  = document.getElementById('sync-status');
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (!st) return;
  st.className  = 'sync-status ' + state;
  dot.className = 'sync-dot ' + (state === 'connected' ? 'green' : state === 'syncing' ? 'pulse' : 'red');
  lbl.textContent = label || 'GitHub';
}

function openTokenModal() {
  document.getElementById('token-modal-overlay').classList.add('open');
  renderTokenModal();
}
function closeTokenModal() { document.getElementById('token-modal-overlay').classList.remove('open'); }
function handleTokenOverlay(e) { if (e.target === document.getElementById('token-modal-overlay')) closeTokenModal(); }

function renderTokenModal() {
  const el = document.getElementById('token-modal-body');
  if (ghToken && ghUser) {
    el.innerHTML =
      '<div class="gh-user-row">' +
        '<img class="gh-avatar" src="' + ghUser.avatar_url + '" alt="">' +
        '<div><div class="gh-uname">@' + esc(ghUser.login) + '</div>' +
        '<div class="gh-repo">📁 ' + GH_OWNER + '/' + GH_REPO + '</div></div>' +
      '</div>' +
      '<div class="sync-log" id="sync-log">Ultimo sync: ' + (localStorage.getItem('gh_last_sync') || 'mai') + '</div>' +
      '<div class="sync-actions">' +
        '<button class="sync-pull-btn" onclick="ghPull()">⬇ Scarica da GitHub</button>' +
        '<button class="sync-push-btn" onclick="ghPush()">⬆ Salva su GitHub</button>' +
      '</div>' +
      '<button class="gh-disconnect-btn" onclick="ghDisconnect()">🔌 Disconnetti</button>';
  } else {
    el.innerHTML =
      '<div class="token-info">🔑 Inserisci il tuo <strong>Personal Access Token</strong> con scope <strong>repo</strong>. Salvato solo su questo dispositivo.</div>' +
      '<div class="field" style="margin-bottom:0">' +
        '<label>Personal Access Token</label>' +
        '<div class="token-field">' +
          '<input type="password" id="gh-token-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">' +
          '<button class="token-eye" onclick="toggleTokenVis()">👁</button>' +
        '</div>' +
      '</div>' +
      '<button class="gh-connect-btn" onclick="ghConnect()">🔗 Connetti GitHub</button>';
  }
}

function toggleTokenVis() {
  const inp = document.getElementById('gh-token-input');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function ghConnect() {
  const inp = document.getElementById('gh-token-input');
  const tok = (inp ? inp.value : '').trim();
  if (!tok) { showToast('⚠️ Inserisci il token', 'error'); return; }
  setSyncStatus('syncing', 'Verifica...');
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + tok, Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error('Token non valido');
    ghUser  = await res.json();
    ghToken = tok;
    localStorage.setItem(GH_TOKEN_KEY, tok);
    setSyncStatus('connected', '@' + ghUser.login);
    renderTokenModal();
    showToast('✅ Connesso come @' + ghUser.login, 'success');
    await ghPull(true);
  } catch(e) {
    setSyncStatus('disconnected', 'GitHub');
    showToast('❌ ' + e.message, 'error');
  }
}

async function ghDisconnect() {
  if (!confirm('Disconnettere GitHub? I dati restano in locale.')) return;
  ghToken = null; ghUser = null; ghDataSha = null;
  localStorage.removeItem(GH_TOKEN_KEY);
  setSyncStatus('disconnected', 'GitHub');
  renderTokenModal();
  showToast('🔌 Disconnesso', 'error');
}

async function ghPull(silent = false) {
  if (!ghToken) { openTokenModal(); return; }
  setSyncStatus('syncing', 'Carico...');
  setLogMsg('⏳ Download da GitHub...');
  try {
    const res = await fetch(
      'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + GH_DATA + '?ref=' + GH_BRANCH,
      { headers: { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.status === 404) {
      setSyncStatus('connected', '@' + (ghUser ? ghUser.login : ''));
      setLogMsg('📂 Nessun file remoto — push dati locali...');
      await ghPush(true);
      return;
    }
    if (!res.ok) throw new Error('Errore GitHub ' + res.status);
    const file = await res.json();
    ghDataSha = file.sha;
    const raw = atob(file.content.split('\n').join(''));
    const data = JSON.parse(raw);
    if (data.skills)  { SKILLS  = data.skills;  saveLocal(); }
    if (data.project) { PROJECT = data.project; saveLocal(); }
    nextId = Math.max(0, ...SKILLS.map(s => s.id)) + 1;
    renderSkills(filtered());
    renderSkillDetail();
    updateBadge();
    updateProjectTabBadge();
    const now = new Date().toLocaleString('it-IT');
    localStorage.setItem('gh_last_sync', now);
    setSyncStatus('connected', '@' + (ghUser ? ghUser.login : ''));
    setLogMsg('✅ Sincronizzato: ' + now);
    if (!silent) showToast('⬇ Dati scaricati da GitHub', 'success');
  } catch(e) {
    setSyncStatus('connected', '@' + (ghUser ? ghUser.login : ''));
    setLogMsg('❌ ' + e.message);
    if (!silent) showToast('❌ Pull fallito: ' + e.message, 'error');
  }
}

async function ghPush(silent = false) {
  if (!ghToken) { openTokenModal(); return; }
  setSyncStatus('syncing', 'Salvo...');
  setLogMsg('⏳ Upload su GitHub...');
  try {
    const payload = JSON.stringify({ skills: SKILLS, project: PROJECT, updatedAt: new Date().toISOString() }, null, 2);
    const encoded = btoa(unescape(encodeURIComponent(payload)));
    const body = { message: 'Dashboard sync ' + new Date().toLocaleString('it-IT'), content: encoded, branch: GH_BRANCH };
    if (ghDataSha) body.sha = ghDataSha;
    const res = await fetch(
      'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + GH_DATA,
      { method: 'PUT', headers: { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      if (res.status === 409 || res.status === 422) { await refreshDataSha(); await ghPush(silent); return; }
      const err = await res.json();
      throw new Error(err.message || 'Errore ' + res.status);
    }
    const data = await res.json();
    ghDataSha = data.content ? data.content.sha : ghDataSha;
    const now = new Date().toLocaleString('it-IT');
    localStorage.setItem('gh_last_sync', now);
    setSyncStatus('connected', '@' + (ghUser ? ghUser.login : ''));
    setLogMsg('✅ Salvato: ' + now);
    if (!silent) showToast('⬆ Dati salvati su GitHub', 'success');
  } catch(e) {
    setSyncStatus('connected', '@' + (ghUser ? ghUser.login : ''));
    setLogMsg('❌ ' + e.message);
    if (!silent) showToast('❌ Push fallito: ' + e.message, 'error');
  }
}

async function refreshDataSha() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + GH_DATA + '?ref=' + GH_BRANCH,
      { headers: { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.ok) { const f = await res.json(); ghDataSha = f.sha; }
  } catch(e) {}
}

// Upload binary file to /files/ folder in repo
async function ghUploadFile(filename, base64Content) {
  if (!ghToken) throw new Error('Non connesso a GitHub');
  const path = GH_FILES + '/' + filename;
  // Check if file already exists (to get sha for update)
  let existingSha = null;
  try {
    const check = await fetch(
      'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path + '?ref=' + GH_BRANCH,
      { headers: { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.v3+json' } }
    );
    if (check.ok) { const f = await check.json(); existingSha = f.sha; }
  } catch(e) {}

  const body = { message: 'Upload ' + filename, content: base64Content, branch: GH_BRANCH };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(
    'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path,
    { method: 'PUT', headers: { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Upload fallito'); }
  const data = await res.json();
  return data.content.download_url || ('https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/' + GH_BRANCH + '/' + path);
}

function setLogMsg(msg) {
  const el = document.getElementById('sync-log');
  if (el) el.textContent = msg;
}

let autoPushTimer = null;
function scheduleAutoPush() {
  if (!ghToken) return;
  clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(() => ghPush(true), 3000);
}

async function initGitHub() {
  if (!ghToken) { setSyncStatus('disconnected', 'GitHub'); return; }
  setSyncStatus('syncing', 'Connetto...');
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error();
    ghUser = await res.json();
    setSyncStatus('connected', '@' + ghUser.login);
    await ghPull(true);
  } catch(e) {
    ghToken = null;
    localStorage.removeItem(GH_TOKEN_KEY);
    setSyncStatus('disconnected', 'GitHub');
  }
}

// ── SKILLS RENDERING ──────────────────────────────────────────────────────────
function filtered() {
  const q = (document.getElementById('search') ? document.getElementById('search').value : '').toLowerCase();
  return SKILLS.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.category || '').toLowerCase().includes(q) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q))
  );
}

function renderSkills(list) {
  const c = document.getElementById('skills-list');
  if (!list.length) {
    c.innerHTML = '<div class="empty-state"><div>🗂</div><p>Nessuna skill trovata</p></div>';
    return;
  }
  c.innerHTML = list.map(s => {
    const icon = fileIcon(s.filename, s.isText);
    const isBin = !s.isText && !s.ghPath;
    return '<div class="skill-card' + (selSkill && selSkill.id === s.id ? ' selected' : '') + '" onclick="selectSkill(' + s.id + ')">' +
      '<span class="file-type-badge">' + fileExt(s.filename) + '</span>' +
      '<div class="skill-top">' +
        '<span class="cat-badge ' + catCls(s.category) + '">' + esc(s.category) + '</span>' +
        '<span class="skill-ver">' + esc(s.version || '') + '</span>' +
      '</div>' +
      '<div class="skill-name">' + esc(s.name) + '</div>' +
      (s.description ? '<div class="skill-desc">' + esc(s.description) + '</div>' : '') +
      '<div class="skill-tags">' + (s.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="skill-footer">' +
        '<span class="skill-date">📅 ' + esc(s.date || '') + '</span>' +
        '<div class="skill-actions">' +
          '<button class="dl-btn" onclick="dlSkill(event,' + s.id + ')">↓ Scarica</button>' +
          '<button class="del-btn" onclick="delSkill(event,' + s.id + ')" title="Elimina">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  updateBadge();
}

function selectSkill(id) {
  selSkill = (selSkill && selSkill.id === id) ? null : SKILLS.find(s => s.id === id);
  renderSkills(filtered());
  renderSkillDetail();
}

function renderSkillDetail() {
  const el = document.getElementById('skill-detail');
  if (!selSkill) {
    el.innerHTML = '<div class="detail-panel detail-empty"><div class="emoji">🗂</div><p>Clicca su una skill per visualizzarla</p><p style="margin-top:5px;font-size:10px;color:var(--muted)">Puoi scaricarla dalla card</p></div>';
    return;
  }
  const s = selSkill;
  const icon = fileIcon(s.filename, s.isText);
  const isHtml = isHtmlSkill(s);
  if (isHtml && previewMode[s.id] === undefined) previewMode[s.id] = 'preview';
  const mode = previewMode[s.id] || 'code';

  let block = '';

  if (s.ghPath) {
    // Binary file stored in /files/ on GitHub
    const dlUrl = 'https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/' + GH_BRANCH + '/' + s.ghPath;
    block = '<div class="binary-preview">' +
      '<div class="file-icon">' + icon + '</div>' +
      '<p>' + esc(s.filename) + '</p>' +
      '<div class="file-size">' + fmtBytes(s.size) + ' • Archiviato su GitHub</div>' +
    '</div>' +
    '<a class="gh-file-link" href="' + dlUrl + '" target="_blank" download="' + esc(s.filename) + '">📥 Scarica da GitHub</a>';
  } else if (isHtml) {
    const toggleBar =
      '<div class="preview-toggle">' +
        '<button class="ptog-btn' + (mode === 'preview' ? ' active' : '') + '" onclick="setPreviewMode(' + s.id + ',\'preview\')">👁 Anteprima</button>' +
        '<button class="ptog-btn' + (mode === 'code' ? ' active' : '') + '" onclick="setPreviewMode(' + s.id + ',\'code\')">📄 Codice</button>' +
      '</div>';
    if (mode === 'preview') {
      const blob = new Blob([s.content || ''], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      block = toggleBar +
        '<div class="html-iframe-wrap">' +
          '<iframe class="html-iframe" id="preview-iframe-' + s.id + '" src="' + blobUrl + '" sandbox="allow-scripts allow-same-origin"></iframe>' +
          '<div class="iframe-overlay-msg">🔍 Anteprima live</div>' +
        '</div>';
    } else {
      block = toggleBar + '<div class="code-block"><pre>' + esc(s.content || '') + '</pre></div>';
    }
  } else if (s.isText) {
    block = '<div class="code-block"><pre>' + esc(s.content || '') + '</pre></div>';
  } else {
    const isHtmlBin = (s.filename || '').split('.').pop().toLowerCase();
    const canConvert = isHtmlBin === 'html' || isHtmlBin === 'htm';
    block = '<div class="binary-preview">' +
      '<div class="file-icon">' + icon + '</div>' +
      '<p>' + esc(s.filename) + '</p>' +
      '<div class="file-size">' + fmtBytes(s.size) + ' • File binario</div>' +
      (canConvert ? '<button onclick="convertHtmlBinary(' + s.id + ')" style="margin-top:12px;background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.3);border-radius:8px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;width:100%">🔄 Converti in anteprima HTML</button>' : '') +
    '</div>';
  }

  const dlBtn = s.ghPath
    ? ''
    : '<button class="dl-btn-full" onclick="dlSkill(event,' + s.id + ')">↓ Scarica ' + esc(s.filename || s.name) + '</button>';

  el.innerHTML =
    '<div class="detail-panel animate-in">' +
      '<div class="detail-header">' +
        '<div><span class="cat-badge ' + catCls(s.category) + '" style="display:inline-block;margin-bottom:5px">' + esc(s.category) + '</span>' +
        '<div class="detail-title">' + esc(s.name) + '</div></div>' +
        '<button class="close-btn" onclick="selectSkill(' + s.id + ')">✕</button>' +
      '</div>' +
      block +
      dlBtn +
    '</div>';
}

function setPreviewMode(id, mode) {
  const old = document.getElementById('preview-iframe-' + id);
  if (old && old.src && old.src.startsWith('blob:')) URL.revokeObjectURL(old.src);
  previewMode[id] = mode;
  renderSkillDetail();
}

function convertHtmlBinary(id) {
  const s = SKILLS.find(x => x.id === id);
  if (!s || !s.data) return;
  let decoded = null;
  try { const bs = atob(s.data); const bytes = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) bytes[i] = bs.charCodeAt(i); decoded = new TextDecoder('utf-8').decode(bytes); } catch(e) {}
  if (!decoded || !decoded.trim()) { try { decoded = decodeURIComponent(escape(atob(s.data))); } catch(e) {} }
  if (!decoded || !decoded.trim()) { try { decoded = atob(s.data); } catch(e) {} }
  if (!decoded || !decoded.trim()) { showToast('⚠️ Impossibile convertire', 'error'); return; }
  s.isText = true; s.content = decoded; delete s.data;
  saveLocal(); scheduleAutoPush();
  renderSkillDetail(); renderSkills(filtered());
  showToast('✅ Convertito!', 'success');
}

function dlSkill(e, id) {
  e.stopPropagation();
  const s = SKILLS.find(x => x.id === id);
  if (!s) return;
  if (s.ghPath) {
    window.open('https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/' + GH_BRANCH + '/' + s.ghPath, '_blank');
    return;
  }
  if (s.isText) {
    const b = new Blob([s.content || ''], { type: 'text/plain' });
    triggerDl(URL.createObjectURL(b), s.filename || s.name + '.txt');
  } else if (s.data) {
    const bs = atob(s.data); const arr = new Uint8Array(bs.length);
    for (let i = 0; i < bs.length; i++) arr[i] = bs.charCodeAt(i);
    const b = new Blob([arr], { type: s.mimeType || 'application/octet-stream' });
    triggerDl(URL.createObjectURL(b), s.filename || s.name);
  }
}

function triggerDl(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function delSkill(e, id) {
  e.stopPropagation();
  if (!confirm('Eliminare questa skill?')) return;
  SKILLS = SKILLS.filter(s => s.id !== id);
  if (selSkill && selSkill.id === id) { selSkill = null; renderSkillDetail(); }
  saveLocal(); scheduleAutoPush();
  renderSkills(filtered());
  showToast('🗑 Skill eliminata', 'error');
}

function filterSkills(q) {
  renderSkills(SKILLS.filter(s =>
    s.name.toLowerCase().includes(q.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(q.toLowerCase()) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q.toLowerCase()))
  ));
}

function updateBadge() {
  const n = SKILLS.length;
  const b = document.getElementById('header-badge');
  if (b) b.textContent = n + ' Skill';
  const tc = document.getElementById('tc-skills');
  if (tc) tc.textContent = n;
}

// ── MODAL ADD SKILL ───────────────────────────────────────────────────────────
function openModal() {
  modalTags = []; pendingFile = null;
  ['f-name','f-desc','f-content','f-tag-input'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const fv = document.getElementById('f-ver'); if (fv) fv.value = 'v1.0';
  const fi = document.getElementById('file-input'); if (fi) fi.value = '';
  const tp = document.getElementById('tags-preview'); if (tp) tp.innerHTML = '';
  resetDZ();
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function handleOverlayClick(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }

function addTag() {
  const inp = document.getElementById('f-tag-input');
  const v = inp ? inp.value.trim() : '';
  if (!v || modalTags.includes(v)) { if (inp) inp.value = ''; return; }
  modalTags.push(v); if (inp) inp.value = '';
  renderModalTags();
}

function removeTag(t) { modalTags = modalTags.filter(x => x !== t); renderModalTags(); }
function renderModalTags() {
  const el = document.getElementById('tags-preview');
  if (el) el.innerHTML = modalTags.map(t =>
    '<span class="tag-pill">#' + esc(t) + '<button onclick="removeTag(\'' + esc(t) + '\')">×</button></span>'
  ).join('');
}

function resetDZ() {
  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.classList.remove('has-file', 'dragging');
  const txt = document.getElementById('dz-text'); if (txt) txt.textContent = 'Trascina qui il file o clicca per selezionarlo';
  const ico = dz.querySelector('.dz-icon'); if (ico) ico.textContent = '📂';
}

function handleFileInput(inp) { if (inp.files[0]) processFile(inp.files[0]); }
function handleDrop(e) {
  e.preventDefault();
  const dz = document.getElementById('drop-zone'); if (dz) dz.classList.remove('dragging');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
}

function processFile(file) {
  const dz = document.getElementById('drop-zone');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isText = isTextFile(file);
  const icon = fileIcon(file.name, isText);

  if (isText) {
    const r = new FileReader();
    r.onload = ev => {
      pendingFile = { name: file.name, isText: true, content: ev.target.result, size: file.size };
      const hint = (ext === 'html' || ext === 'htm') ? ' — Anteprima live ✨' : '';
      if (dz) { dz.classList.add('has-file'); const ico = dz.querySelector('.dz-icon'); if (ico) ico.textContent = icon; }
      const txt = document.getElementById('dz-text'); if (txt) txt.textContent = '✅ ' + file.name + ' (' + fmtBytes(file.size) + ')' + hint;
      const fc = document.getElementById('f-content'); if (fc) fc.value = ev.target.result;
      const fn = document.getElementById('f-name'); if (fn && !fn.value) fn.value = file.name.replace(/\.[^.]+$/, '');
      if ((ext === 'html' || ext === 'htm')) { const fc2 = document.getElementById('f-cat'); if (fc2) fc2.value = 'HTML / Template'; }
    };
    r.readAsText(file, 'UTF-8');
  } else {
    const r = new FileReader();
    r.onload = ev => {
      const b64 = ev.target.result.split(',')[1];
      pendingFile = { name: file.name, isText: false, data: b64, size: file.size, mimeType: file.type };
      if (dz) { dz.classList.add('has-file'); const ico = dz.querySelector('.dz-icon'); if (ico) ico.textContent = icon; }
      const txt = document.getElementById('dz-text'); if (txt) txt.textContent = '✅ ' + file.name + ' (' + fmtBytes(file.size) + ')';
      const fn = document.getElementById('f-name'); if (fn && !fn.value) fn.value = file.name.replace(/\.[^.]+$/, '');
    };
    r.readAsDataURL(file);
  }
}

async function saveSkill() {
  const nameEl = document.getElementById('f-name');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { showToast('⚠️ Inserisci un nome', 'error'); return; }
  const textEl = document.getElementById('f-content');
  const text = textEl ? textEl.value.trim() : '';
  if (!pendingFile && !text) { showToast('⚠️ Aggiungi un file o scrivi il contenuto', 'error'); return; }

  const catEl  = document.getElementById('f-cat');
  const verEl  = document.getElementById('f-ver');
  const descEl = document.getElementById('f-desc');
  const today  = new Date().toLocaleDateString('it-IT');

  const sk = {
    id: nextId++, name,
    description: descEl ? descEl.value.trim() : '',
    category: catEl ? catEl.value : 'Altro',
    version: (verEl ? verEl.value.trim() : '') || 'v1.0',
    tags: [...modalTags], date: today
  };

  if (pendingFile) {
    sk.filename = pendingFile.name;
    sk.size     = pendingFile.size;
    if (pendingFile.isText) {
      sk.isText  = true;
      sk.content = pendingFile.content;
    } else {
      // Binary file: upload to GitHub /files/ if connected, else store locally
      if (ghToken) {
        const btn = document.getElementById('btn-save');
        if (btn) { btn.disabled = true; btn.textContent = '⬆ Carico su GitHub...'; }
        const prog = document.getElementById('upload-progress');
        if (prog) { prog.classList.add('active'); const bar = prog.querySelector('.upload-progress-bar'); if (bar) bar.style.width = '60%'; }
        try {
          const ghUrl = await ghUploadFile(pendingFile.name, pendingFile.data);
          sk.isText  = false;
          sk.ghPath  = GH_FILES + '/' + pendingFile.name;
          sk.mimeType = pendingFile.mimeType;
          if (prog) { const bar = prog.querySelector('.upload-progress-bar'); if (bar) bar.style.width = '100%'; }
          showToast('✅ File caricato su GitHub!', 'success');
        } catch(e) {
          showToast('⚠️ Upload GitHub fallito, salvato in locale: ' + e.message, 'error');
          sk.isText  = false;
          sk.data    = pendingFile.data;
          sk.mimeType = pendingFile.mimeType;
        }
        if (btn) { btn.disabled = false; btn.textContent = '💾 Salva Skill'; }
        if (prog) prog.classList.remove('active');
      } else {
        sk.isText  = false;
        sk.data    = pendingFile.data;
        sk.mimeType = pendingFile.mimeType;
        showToast('💡 Connetti GitHub per caricare i file binari nel repo', 'error');
      }
    }
  } else {
    sk.filename = name.toLowerCase().replace(/\s+/g, '-') + '.txt';
    sk.isText   = true;
    sk.content  = text;
  }

  SKILLS.push(sk);
  saveLocal(); scheduleAutoPush();
  closeModal();
  renderSkills(filtered());
  showToast('✅ Skill salvata!', 'success');
}

// ── ROADMAP ───────────────────────────────────────────────────────────────────
const STEPS = [
  {id:1,phase:'01',icon:'📥',title:'Ricezione Task',color:'#7c6af7',owner:'Account Manager → Tu',
   description:"L'account manager assegna il progetto e invia tutto il materiale: file TXT, shooting, logo, link social, siti vecchi.",
   deliverables:['File TXT con dati cliente','Shooting / Logo del brand','Link profili social','Siti vecchi (restyling)','Struttura sito + keyword map'],tools:[]},
  {id:2,phase:'02',icon:'📋',title:'Strutturazione Brief',color:'#9b6af7',owner:'Tu',
   description:'Analisi di tutto il materiale e trasformazione in brief operativo completo con Project Bible.',
   deliverables:['Brief strutturato e validato','Project Bible completo','Mappa pagine e sezioni','Keyword mapping per pagina'],tools:['Project Bible v2 Skill']},
  {id:3,phase:'03',icon:'🔍',title:'Ricerca Template',color:'#c26af7',owner:'Tu',
   description:'Selezione del template kit più adatto allo stile, settore e obiettivo comunicativo del cliente.',
   deliverables:['Template kit selezionato','Moodboard visivo','Referenze di stile approvate'],tools:[]},
  {id:4,phase:'04',icon:'⚙️',title:'Import & Setup',color:'#f76ac2',owner:'Tu',
   description:'Importazione del template e configurazione completa di pagine, menù, sezioni e layout con immagini.',
   deliverables:['Struttura sito importata','Menù configurato','Layout sezioni definito','Immagini inserite'],tools:[]},
  {id:5,phase:'05',icon:'✍️',title:'Copywriting',color:'#f7a26c',owner:'Tu',
   description:'Creazione copy per tutte le sezioni del sito, ottimizzato per SEO, conversione e tono del brand.',
   deliverables:['Copy completo per ogni pagina','Headline e sottotitoli','Body copy per sezione','Meta title e description','CTA ottimizzati'],tools:['Web Copywriter v2 Skill']},
  {id:6,phase:'06',icon:'🚀',title:'Revisione & Consegna',color:'#6affc4',owner:'Tu → Account Manager',
   description:'Test responsive su tutti i dispositivi, ottimizzazione finale, checklist qualità e consegna formale.',
   deliverables:['Test responsive completato','Performance ottimizzata','Checklist QA superata','Progetto consegnato'],tools:[]},
];

function isMobile() { return window.innerWidth <= 760; }

function detailHTML(s) {
  return '<div class="detail-step animate-in" style="border-color:' + s.color + '">' +
    '<div class="ds-header">' +
      '<span class="ds-emoji">' + s.icon + '</span>' +
      '<div><div class="ds-phase" style="color:' + s.color + '">FASE ' + s.phase + '</div>' +
      '<div class="ds-title">' + s.title + '</div></div>' +
    '</div>' +
    '<p class="ds-desc">' + s.description + '</p>' +
    '<div class="ds-section" style="margin-bottom:12px"><h4>📦 Deliverable</h4>' +
      s.deliverables.map(d => '<div class="deliverable"><span class="arrow" style="color:' + s.color + '">→</span>' + d + '</div>').join('') +
    '</div>' +
    (s.tools.length ?
      '<div class="ds-section"><h4>🛠 Skill Collegate</h4><div class="tools-list">' +
        s.tools.map(t => '<span class="tool-badge" style="background:' + s.color + '18;color:' + s.color + ';border:1px solid ' + s.color + '38">' + t + '</span>').join('') +
      '</div></div>' : '') +
    '<div style="margin-top:12px;padding-top:11px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);font-weight:600">👤 ' + s.owner + '</div>' +
  '</div>';
}

function renderRoadmap() {
  document.getElementById('roadmap-grid').innerHTML = STEPS.map(s =>
    '<div class="step-card' + (selStep && selStep.id === s.id ? ' active' : '') + '" ' +
      'id="step-card-' + s.id + '" ' +
      (selStep && selStep.id === s.id ? 'style="border-color:' + s.color + ';background:' + s.color + '16;box-shadow:0 6px 18px ' + s.color + '2e"' : '') +
      ' onclick="selectStep(' + s.id + ')">' +
      '<div class="step-top">' +
        '<span class="step-emoji">' + s.icon + '</span>' +
        '<div><div class="step-phase">FASE ' + s.phase + '</div>' +
        '<div class="step-title"' + (selStep && selStep.id === s.id ? ' style="color:' + s.color + '"' : '') + '>' + s.title + '</div></div>' +
      '</div>' +
      '<div class="step-desc">' + s.description.substring(0, 72) + '…</div>' +
      '<div class="step-owner">👤 ' + s.owner + '</div>' +
    '</div>' +
    '<div class="inline-detail' + (selStep && selStep.id === s.id ? ' open' : '') + '" id="inline-' + s.id + '">' +
      (selStep && selStep.id === s.id ? detailHTML(s) : '') +
    '</div>'
  ).join('');
  renderPipelineTop();
}

function selectStep(id) {
  selStep = (selStep && selStep.id === id) ? null : STEPS.find(s => s.id === id);
  renderRoadmap();
  renderStepDetail();
  if (isMobile() && selStep) {
    setTimeout(() => {
      const el = document.getElementById('inline-' + selStep.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function renderStepDetail() {
  const el = document.getElementById('roadmap-detail');
  const pip = '<div class="pipeline" style="margin-top:11px"><h4>⚡ Pipeline Completa</h4><div class="pipeline-track" id="pipeline-track-desktop"></div><div class="pipeline-labels"><span>Inizio</span><span>Consegna</span></div></div>';
  if (!selStep) {
    el.innerHTML = '<div class="detail-step"><div style="text-align:center;padding:32px 14px;border:1px dashed var(--border);border-radius:11px;color:var(--muted)"><div style="font-size:26px;margin-bottom:7px">👆</div><p style="font-size:12px">Seleziona una fase per i dettagli</p></div></div>' + pip;
  } else {
    el.innerHTML = detailHTML(selStep) + pip;
  }
  renderPipelineDesktop();
}

function pipelineNodes() {
  return STEPS.map((s, i) =>
    '<div class="pip-node" style="border-color:' + s.color + ';' + (selStep && selStep.id === s.id ? 'background:' + s.color + ';box-shadow:0 0 9px ' + s.color + '55' : 'background:var(--card2)') + '" onclick="selectStep(' + s.id + ')" title="' + s.title + '">' + s.icon + '</div>' +
    (i < STEPS.length - 1 ? '<div class="pip-line" style="background:linear-gradient(to right,' + s.color + ',' + STEPS[i+1].color + ')"></div>' : '')
  ).join('');
}

function renderPipelineTop() { const t = document.getElementById('pipeline-track-top'); if (t) t.innerHTML = pipelineNodes(); }
function renderPipelineDesktop() { const t = document.getElementById('pipeline-track-desktop'); if (t) t.innerHTML = pipelineNodes(); }

// ── TABS ──────────────────────────────────────────────────────────────────────
function showTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('section-skills').className  = tab === 'skills'  ? 'section-visible animate-in' : 'section-hidden';
  document.getElementById('section-roadmap').className = tab === 'roadmap' ? 'section-visible animate-in' : 'section-hidden';
  document.getElementById('section-project').className = tab === 'project' ? 'section-visible animate-in' : 'section-hidden';
  if (tab === 'project') renderProject();
}

// ── CHECKLIST DATA ────────────────────────────────────────────────────────────
const CATS_COMUNE = [
  {id:'design',icon:'🎨',title:'Design & Layout',color:'#7c6af7',items:[
    {id:'d1',text:'Hai scelto e importato un template performante adatto al brand?'},
    {id:'d2',text:"Il design è coerente con l'identità visiva del cliente?"},
    {id:'d3',text:'Logo in HD e favicon sono inseriti correttamente?'},
    {id:'d4',text:"La hero section cattura l'attenzione e comunica il valore?"},
    {id:'d5',text:'Le immagini in tutto il sito sono reali? Evita foto stock generiche'},
    {id:'d6',text:'Le call-to-action sono posizionate in modo strategico?'},
    {id:'d7',text:"L'esperienza di navigazione (UX) è semplice e intuitiva?"},
    {id:'d8',text:'Menu di navigazione funziona correttamente su tutti i livelli?'},
    {id:'d9',text:'Il footer è completo con link utili, contatti e pagine legali?'},
    {id:'d10',text:'Hai controllato la versione mobile di tutte le pagine principali?'},
    {id:'d11',text:'Il sito è responsive su smartphone, tablet e desktop?'},
    {id:'d12',text:'I font, le dimensioni e i colori sono consistenti in tutto il sito?'},
    {id:'d13',text:'Le animazioni e le transizioni non rallentano la navigazione?'},
  ]},
  {id:'pages',icon:'📄',title:'Pagine & Contenuti',color:'#c26af7',items:[
    {id:'p1',text:'Hai creato tutte le pagine richieste nel brief?'},
    {id:'p2',text:'I testi sono stati inseriti e controllati per errori ortografici?'},
    {id:'p3',text:'I dati aziendali sono corretti (indirizzo, P.IVA, telefono, email)?'},
    {id:'p4',text:'La pagina Chi Siamo racconta bene il brand e il team?'},
    {id:'p5',text:'La pagina Contatti ha indirizzo, mappa, form e orari?'},
    {id:'p6',text:'Il form di contatto invia correttamente le notifiche?'},
    {id:'p7',text:'Hai creato una pagina 404 personalizzata?'},
    {id:'p8',text:'Tutti i link interni ed esterni funzionano correttamente?'},
    {id:'p9',text:'I bottoni e i CTA rimandano alle pagine giuste?'},
    {id:'p10',text:'Hai inserito le sezioni richieste nella home (servizi, testimonianze, ecc.)?'},
  ]},
  {id:'performance',icon:'⚡',title:'Performance & Responsive',color:'#f7a26c',items:[
    {id:'perf1',text:'Il sito si carica in meno di 2-3 secondi?'},
    {id:'perf2',text:'Hai ottimizzato il peso delle immagini (WebP o compressione)?'},
    {id:'perf3',text:'Google PageSpeed Insights: punteggio accettabile su mobile e desktop?'},
    {id:'perf4',text:'Hai pulito il database da plugin inutili e dati non necessari?'},
    {id:'perf5',text:'Il sito è responsive su tutti i dispositivi e browser principali?'},
    {id:'perf6',text:'Le pagine più importanti sono ottimizzate per il mobile?'},
    {id:'perf7',text:'Hai testato su Chrome, Safari, Firefox e su iOS e Android?'},
  ]},
  {id:'legal',icon:'⚖️',title:'Pagine Legali & Cookie',color:'#6affc4',items:[
    {id:'l1',text:'Hai inserito la pagina Privacy Policy?'},
    {id:'l2',text:'Hai inserito la pagina Cookie Policy?'},
    {id:'l3',text:'Hai inserito la pagina Termini e Condizioni?'},
    {id:'l4',text:'La barra cookie è configurata e funzionante?'},
    {id:'l5',text:'I link a privacy, cookie e preferenze sono visibili nel footer?'},
    {id:'l6',text:'I form di contatto hanno le spunte di accettazione privacy?'},
    {id:'l7',text:"Il copyright nel footer è aggiornato con l'anno corrente?"},
  ]},
];

const CATS_ECOMMERCE = [
  {id:'shop',icon:'🛒',title:'Shop & Prodotti',color:'#f76ac2',items:[
    {id:'s1',text:'I prodotti sono caricati con titolo, descrizione, immagini e prezzo?'},
    {id:'s2',text:'Le categorie prodotto sono create e organizzate correttamente?'},
    {id:'s3',text:'Le varianti (taglia, colore, ecc.) funzionano correttamente?'},
    {id:'s4',text:'Le immagini dei prodotti hanno testo alternativo (alt text)?'},
    {id:'s5',text:'Cross-sell e up-sell sono configurati nelle schede prodotto?'},
    {id:'s6',text:'Hai inserito una funzione di ricerca prodotti nel sito?'},
    {id:'s7',text:'La dashboard del cliente è intuitiva e funziona correttamente?'},
    {id:'s8',text:"Se vendi prodotti digitali, il download funziona dopo l'acquisto?"},
  ]},
  {id:'checkout',icon:'💳',title:'Checkout & Pagamenti',color:'#f7a26c',items:[
    {id:'c1',text:"Il carrello è facilmente accessibile dall'header?"},
    {id:'c2',text:'Hai personalizzato il design del carrello e della pagina cassa?'},
    {id:'c3',text:'Il processo di checkout è snello e ridotto al minimo?'},
    {id:'c4',text:'I metodi di pagamento sono attivi e funzionanti?'},
    {id:'c5',text:'Hai impostato correttamente le aliquote IVA?'},
    {id:'c6',text:'Le spese di spedizione vengono applicate correttamente?'},
    {id:'c7',text:'Le email di conferma ordine e avvisi funzionano?'},
    {id:'c8',text:'Hai definito se gli utenti ordinano come ospiti o registrati?'},
    {id:'c9',text:'Hai effettuato un ordine di test completo con pagamento reale?'},
    {id:'c10',text:'I codici sconto funzionano correttamente (%, importo, scadenza)?'},
    {id:'c11',text:'Hai gestito il magazzino e la gestione delle scorte?'},
  ]},
  {id:'ecommerce_extra',icon:'🔗',title:'Integrazioni Shop',color:'#9b6af7',items:[
    {id:'e1',text:'Come appaiono i prodotti condivisi su WhatsApp o Facebook? Snippet OK?'},
    {id:'e2',text:"Hai considerato l'integrazione con Instagram Shopping o Facebook Shop?"},
    {id:'e3',text:'Hai configurato un sistema per raccogliere recensioni sui prodotti?'},
    {id:'e4',text:'Il processo di registrazione/login/logout funziona lato utente?'},
    {id:'e5',text:'Pagina resi, rimborsi e spedizioni è presente e completa?'},
  ]},
];

const CATS_VETRINA = [
  {id:'vetrina_extra',icon:'🌐',title:'Funzionalità Sito',color:'#9b6af7',items:[
    {id:'v1',text:'Hai creato una sezione portfolio o galleria lavori (se richiesto)?'},
    {id:'v2',text:'I form di preventivo o richiesta info funzionano correttamente?'},
    {id:'v3',text:'Hai inserito link ai profili social nel header o footer?'},
    {id:'v4',text:'La sezione servizi è chiara e ben strutturata?'},
    {id:'v5',text:'Hai inserito testimonianze o recensioni clienti?'},
  ]},
];

function getCats(type) { return type === 'ecommerce' ? [...CATS_COMUNE, ...CATS_ECOMMERCE] : [...CATS_COMUNE, ...CATS_VETRINA]; }
function getAllItems(type) { return getCats(type).flatMap(c => c.items); }

// ── PROJECT RENDERING ─────────────────────────────────────────────────────────
function renderProject() {
  const el = document.getElementById('project-content');
  if (!PROJECT) {
    el.innerHTML =
      '<div class="project-setup">' +
        '<div class="ps-icon">🚀</div>' +
        '<h2>Nuovo Progetto</h2>' +
        '<p>Inserisci il nome del progetto e scegli il tipo di sito</p>' +
        '<div class="project-name-row">' +
          '<input type="text" id="pname-input" placeholder="es. Sito Pizzeria Roma" maxlength="60" onkeydown="if(event.key===\'Enter\')startProject()">' +
        '</div>' +
        '<div class="project-type-row">' +
          '<button class="type-btn' + (selectedType === 'vetrina' ? ' selected' : '') + '" onclick="selectType(\'vetrina\')">' +
            '<span class="tb-icon">🌐</span>Sito Vetrina' +
          '</button>' +
          '<button class="type-btn' + (selectedType === 'ecommerce' ? ' selected' : '') + '" onclick="selectType(\'ecommerce\')">' +
            '<span class="tb-icon">🛒</span>E-Commerce' +
          '</button>' +
        '</div>' +
        '<button class="start-btn" onclick="startProject()" ' + (selectedType ? '' : 'disabled') + '>Inizia Progetto →</button>' +
      '</div>';
    return;
  }

  const cats = getCats(PROJECT.type);
  const allItems = getAllItems(PROJECT.type);
  const total = allItems.length;
  const doneCount = PROJECT.checks.filter(Boolean).length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount === total;

  const typeBadge = PROJECT.type === 'ecommerce'
    ? '<span class="gp-type-badge" style="background:rgba(247,162,108,.12);color:#f7a26c;border:1px solid rgba(247,162,108,.28)">🛒 E-Commerce</span>'
    : '<span class="gp-type-badge" style="background:rgba(124,106,247,.12);color:#a99fff;border:1px solid rgba(124,106,247,.28)">🌐 Sito Vetrina</span>';

  const globalCard =
    '<div class="global-progress-card">' +
      '<div class="gp-top">' +
        '<div class="gp-info">' +
          '<div class="gp-name">📁 ' + esc(PROJECT.name) + '</div>' +
          '<div class="gp-meta">Avviato il ' + PROJECT.startDate + '</div>' +
          typeBadge +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
          '<div class="gp-fraction">' + doneCount + '<span>/' + total + '</span></div>' +
          '<button class="reset-btn" onclick="resetProject()">🔄 Reset</button>' +
        '</div>' +
      '</div>' +
      '<div class="gp-bar-wrap"><div class="gp-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="gp-pct">' + pct + '% completato</div>' +
    '</div>';

  const allDoneBanner = allDone
    ? '<div class="all-done-banner animate-in"><div class="adb-icon">🎉</div><h3>Progetto Completato!</h3><p>Ottimo lavoro! Hai spuntato tutti i ' + total + ' punti.<br>Pronto per consegnare?</p><button class="reset-btn" style="margin:0 auto;padding:8px 18px;font-size:12px" onclick="resetProject()">🔄 Nuovo progetto</button></div>'
    : '';

  const accordion = cats.map(cat => {
    const catItems = cat.items;
    const catDone = catItems.filter(item => {
      const idx = allItems.findIndex(x => x.id === item.id);
      return PROJECT.checks[idx];
    }).length;
    const catPct = Math.round((catDone / catItems.length) * 100);
    const isOpen = !PROJECT.openCats || PROJECT.openCats.includes(cat.id);

    return '<div class="acc-cat' + (catDone > 0 ? ' has-done' : '') + (isOpen ? ' open' : '') + '" id="acc-' + cat.id + '">' +
      '<div class="acc-head" onclick="toggleCat(\'' + cat.id + '\')">' +
        '<span class="acc-icon">' + cat.icon + '</span>' +
        '<div class="acc-info"><div class="acc-title">' + cat.title + '</div><div class="acc-sub">' + catDone + '/' + catItems.length + ' completati</div></div>' +
        '<div class="acc-right"><span class="acc-frac' + (catDone === catItems.length ? ' complete' : '') + '">' + catPct + '%</span><span class="acc-chevron">▼</span></div>' +
      '</div>' +
      '<div class="acc-bar-wrap"><div class="acc-bar" style="width:' + catPct + '%;background:' + cat.color + '"></div></div>' +
      '<div class="acc-body"><div class="cl-list">' +
        catItems.map(item => {
          const idx = allItems.findIndex(x => x.id === item.id);
          const done = PROJECT.checks[idx] || false;
          const doneDate = (PROJECT.checkDates && PROJECT.checkDates[idx]) || null;
          return '<div class="cl-item' + (done ? ' done' : '') + '" onclick="toggleCheck(\'' + item.id + '\')">' +
            '<div class="cl-box">' + (done ? '✓' : '') + '</div>' +
            '<div class="cl-text">' + esc(item.text) + '</div>' +
            (done && doneDate ? '<div class="cl-date">' + doneDate + '</div>' : '') +
          '</div>';
        }).join('') +
      '</div></div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="project-active">' + globalCard + allDoneBanner + accordion + '</div>';
}

function selectType(t) {
  selectedType = t;
  renderProject();
  const inp = document.getElementById('pname-input');
  if (inp) inp.focus();
}

function startProject() {
  const inp = document.getElementById('pname-input');
  const n = inp ? inp.value.trim() : '';
  if (!n) { showToast('⚠️ Inserisci il nome del progetto', 'error'); return; }
  if (!selectedType) { showToast('⚠️ Scegli il tipo di sito', 'error'); return; }
  const allItems = getAllItems(selectedType);
  PROJECT = {
    name: n, type: selectedType,
    startDate: new Date().toLocaleDateString('it-IT'),
    checks: new Array(allItems.length).fill(false),
    checkDates: new Array(allItems.length).fill(null),
    openCats: getCats(selectedType).map(c => c.id)
  };
  saveLocal(); scheduleAutoPush();
  renderProject();
  showToast('🚀 Progetto avviato!', 'success');
  updateProjectTabBadge();
}

function toggleCheck(itemId) {
  if (!PROJECT) return;
  const allItems = getAllItems(PROJECT.type);
  const idx = allItems.findIndex(x => x.id === itemId);
  if (idx < 0) return;
  PROJECT.checks[idx] = !PROJECT.checks[idx];
  PROJECT.checkDates[idx] = PROJECT.checks[idx] ? new Date().toLocaleDateString('it-IT') : null;
  saveLocal(); scheduleAutoPush();
  renderProject();
}

function toggleCat(catId) {
  if (!PROJECT) return;
  if (!PROJECT.openCats) PROJECT.openCats = getCats(PROJECT.type).map(c => c.id);
  const i = PROJECT.openCats.indexOf(catId);
  if (i >= 0) PROJECT.openCats.splice(i, 1); else PROJECT.openCats.push(catId);
  saveLocal();
  const el = document.getElementById('acc-' + catId);
  if (el) el.classList.toggle('open');
  const ch = el ? el.querySelector('.acc-chevron') : null;
  if (ch) ch.style.transform = el.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
}

function resetProject() {
  if (!confirm('Iniziare un nuovo progetto? I progressi attuali andranno persi.')) return;
  PROJECT = null; selectedType = null;
  localStorage.removeItem(PK);
  saveLocal(); scheduleAutoPush();
  renderProject();
  showToast('🔄 Pronto per un nuovo progetto', 'success');
  updateProjectTabBadge();
}

function updateProjectTabBadge() {
  const tb = document.getElementById('tab-project');
  if (!tb) return;
  if (PROJECT) {
    const total = getAllItems(PROJECT.type).length;
    const done  = PROJECT.checks.filter(Boolean).length;
    tb.innerHTML = '📋 Progetto <span style="background:rgba(106,255,196,.2);color:#6affc4;border-radius:9px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:2px">' + done + '/' + total + '</span>';
  } else {
    tb.innerHTML = '📋 Progetto Attivo';
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
loadLocal();
renderSkills(SKILLS);
renderSkillDetail();
renderRoadmap();
renderStepDetail();
updateBadge();
updateProjectTabBadge();
initGitHub();
