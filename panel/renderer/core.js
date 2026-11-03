// Shared helpers for all panel views. Everything goes through window.panel (preload.js).
const $ = id => document.getElementById(id);

const App = {
  connected: false,
  view: 'overview',
  views: {}, // name -> { show() } registered by the files in views/

  registerView(name, view) {
    this.views[name] = view;
  }
};

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    // Set through CSSOM: the Content-Security-Policy blocks inline style attributes.
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'selected' || key === 'disabled') node[key] = Boolean(value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

let toastTimer;
function toast(message, isError = false) {
  const box = $('toast');
  box.textContent = message;
  box.className = `toast${isError ? ' error' : ''}`;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), isError ? 7000 : 3500);
}

const errorText = error => String(error?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// Views that work without a connection (no API calls).
const OFFLINE_VIEWS = ['connections'];

async function api(method, path, body) {
  return window.panel.api(method, path, body);
}

// Runs an action, shows a toast on failure, and returns null instead of throwing.
async function attempt(action, failText) {
  try {
    return await action();
  } catch (error) {
    toast(`${failText}: ${errorText(error)}`, true);
    return null;
  }
}

// Sensitive fields (server address, tokens, passwords) are hidden by default, so screen sharing is safe;
// "Göster" shows the value until it is clicked again.
function masked(input) {
  input.type = 'password';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const toggle = el('button', {
    type: 'button',
    class: 'small ghost reveal',
    title: 'Göster / gizle',
    onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? '🙈 Gizle' : '👁 Göster';
    }
  }, '👁 Göster');
  return el('div', { class: 'secret-field' }, input, toggle);
}

// Small Markdown → HTML for Discord-like previews (input is escaped first).
function discordMarkdown(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split('\n')
    .map(line => {
      if (/^### /.test(line)) return `<div class="md-h3">${line.slice(4)}</div>`;
      if (/^## /.test(line)) return `<div class="md-h2">${line.slice(3)}</div>`;
      if (/^# /.test(line)) return `<div class="md-h1">${line.slice(2)}</div>`;
      if (/^[-*] /.test(line)) return `<div class="md-li">• ${line.slice(2)}</div>`;
      return `<div>${line || '&nbsp;'}</div>`;
    })
    .join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<span class="md-link">$1</span>');
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString(panelLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
function formatDay(value) {
  return new Date(value).toLocaleDateString(panelLocale(), { day: 'numeric', month: 'short' });
}
function formatDuration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const [day, hour, minute] = panelLanguage() === 'en' ? ['d', 'h', 'm'] : ['g', 's', 'dk'];
  return d ? `${d}${day} ${h}${hour}` : h ? `${h}${hour} ${m}${minute}` : `${m}${minute}`;
}
function formatMinutes(minutes) {
  const [hour, minute] = panelLanguage() === 'en' ? ['h', 'm'] : ['s', 'dk'];
  return minutes < 60 ? `${minutes}${minute}` : `${Math.floor(minutes / 60)}${hour} ${minutes % 60}${minute}`;
}
function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// ---------- modal ----------

let modalResolve = null;
/**
 * Shows a modal. `actions`: [{ label, class, value }]. Resolves with the clicked action's value
 * (or null when closed). `onAction(value)` may return false to keep the modal open (e.g. validation).
 */
function openModal(title, body, actions, onAction) {
  $('modal-title').textContent = title;
  $('modal-body').replaceChildren(body);
  $('modal-actions').replaceChildren(
    ...actions.map(action =>
      el('button', {
        class: action.class ?? '',
        type: 'button',
        onclick: async () => {
          if (onAction && (await onAction(action.value)) === false) return;
          closeModal(action.value);
        }
      }, action.label)
    )
  );
  $('modal').hidden = false;
  return new Promise(resolve => (modalResolve = resolve));
}

function closeModal(value = null) {
  $('modal').hidden = true;
  modalResolve?.(value);
  modalResolve = null;
}

$('modal').addEventListener('click', event => {
  if (event.target === $('modal')) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('modal').hidden) closeModal();
});

async function confirmModal(title, text, confirmLabel = 'Onayla', danger = false) {
  const result = await openModal(title, el('p', {}, text), [
    { label: 'Vazgeç', class: 'ghost', value: false },
    { label: confirmLabel, class: danger ? 'danger' : 'primary', value: true }
  ]);
  return result === true;
}

// ---------- selects ----------

function optionList(items, { empty, selected, label = item => item.name, value = item => item.id } = {}) {
  const options = items.map(item => el('option', { value: value(item), selected: value(item) === selected }, label(item)));
  return empty === undefined ? options : [el('option', { value: '', selected: !selected }, empty), ...options];
}

const channelLabel = channel => `${channel.announcement ? '📢' : '#'} ${channel.name}${channel.category ? `  ·  ${channel.category}` : ''}`;

// Channel / role lists change rarely; cached for the session and refreshed on demand.
const lookups = { channels: null, roles: null };
async function getChannels(refresh = false) {
  if (!lookups.channels || refresh) lookups.channels = await api('GET', '/api/discord/channels');
  return lookups.channels;
}
async function getRoles(refresh = false) {
  if (!lookups.roles || refresh) lookups.roles = await api('GET', '/api/discord/roles');
  return lookups.roles;
}

// ---------- navigation ----------

function showView(view) {
  App.view = view;
  for (const button of document.querySelectorAll('.nav')) button.classList.toggle('active', button.dataset.view === view);
  for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== `view-${view}`;
  if (App.connected || OFFLINE_VIEWS.includes(view)) App.views[view]?.show?.();
}
for (const button of document.querySelectorAll('.nav')) button.addEventListener('click', () => showView(button.dataset.view));
// After a language switch the open page is drawn again (dates, numbers, units).
window.addEventListener('panel-language', () => App.view && showView(App.view));

// Tabs that belong to bot modules: hidden when all of their modules are off on the server.
const VIEW_MODULES = {
  moderation: ['moderation'],
  community: ['showcase', 'stats'],
  streams: ['streams'],
  stats: ['activity']
};
App.modules = {};
App.applyModules = list => {
  App.modules = Object.fromEntries(list.map(module => [module.key, module.enabled]));
  for (const button of document.querySelectorAll('.nav')) {
    const needed = VIEW_MODULES[button.dataset.view];
    button.hidden = Boolean(needed) && !needed.some(key => App.modules[key] !== false);
  }
  // A group heading without visible items is hidden too.
  for (const heading of document.querySelectorAll('.nav-group')) {
    let next = heading.nextElementSibling;
    let visible = false;
    while (next && !next.classList.contains('nav-group')) {
      visible ||= !next.hidden;
      next = next.nextElementSibling;
    }
    heading.hidden = !visible;
  }
  if (document.querySelector(`.nav[data-view="${App.view}"]`)?.hidden) showView('settings');
};
App.reloadModules = () => loadModules();
async function loadModules() {
  const result = await api('GET', '/api/modules').catch(() => null);
  if (result) App.applyModules(result.modules);
  return result;
}

// ---------- connection ----------

function setConnection(connected, text) {
  App.connected = connected;
  $('connection-dot').className = `dot ${connected ? 'ok' : 'bad'}`;
  $('connection-text').textContent = text;
  $('reconnect').hidden = connected;
}

// After a profile is connected (from the picker, a reconnect or a hidden start): fill the app for it.
async function afterConnect(profileName) {
  // The profile chip above shows which profile; here only the state.
  setConnection(true, 'Bağlı');
  App.refreshProfiles?.();
  await window.panel.startLogs().catch(() => {});
  await loadModules();
  App.views[App.view]?.show?.();
  if (App.view !== 'overview') App.views.overview.show();
}
App.afterConnect = afterConnect;

function connecting() {
  $('connection-dot').className = 'dot';
  $('connection-text').textContent = 'Bağlanıyor…';
  $('reconnect').hidden = true;
}
App.connecting = connecting;

async function connect() {
  connecting();
  try {
    const { profile } = await window.panel.connect();
    await afterConnect(profile);
  } catch (error) {
    App.refreshProfiles?.();
    // No profile yet: the picker offers "Profil ekle".
    if (errorText(error).startsWith('NO_PROFILE')) {
      setConnection(false, 'Bağlantı profili yok');
      App.showPicker?.();
      return;
    }
    setConnection(false, `Bağlanamadı: ${errorText(error)}`);
  }
}

window.panel.onConnection(({ connected }) => {
  if (!connected) setConnection(false, 'Bağlantı koptu');
});
// Problems (bot stopped / crashed, staff alerts) in red; other notices (e.g. an update finished) normal.
window.panel.onAlert(({ title, body }) => toast(`${title} — ${body}`, /durdu|çöktü|🚨/.test(title)));
$('reconnect').addEventListener('click', connect);
for (const id of ['community-link', 'picker-community']) $(id).addEventListener('click', () => window.panel.openCommunity());
// Patreon: the sidebar button is always there; without a link (main.js → PATREON_URL) it says the page is coming.
// The profile picker's button shows only once there is a link.
window.panel.links().then(links => {
  $('picker-patreon').hidden = !links.patreon;
  for (const id of ['patreon-link', 'picker-patreon']) {
    $(id).addEventListener('click', () => (links.patreon ? window.panel.openPatreon() : toast('Patreon sayfamız çok yakında açılıyor! Şimdilik Discord sunucumuzdan bize ulaşabilirsin.')));
  }
});

// ---------- appearance (theme + accent color, saved on this computer) ----------

const THEMES = [
  ['dark', 'Koyu', ['#0c0e13', '#151922', '#242a37']],
  ['light', 'Açık', ['#eceff5', '#ffffff', '#e6e9f1']],
  ['black', 'Siyah', ['#000000', '#0b0c0f', '#1a1c22']],
  ['system', 'Sistem', null]
];
// Language names stay in their own language.
const LANGUAGES = [
  ['tr', 'Türkçe'],
  ['en', 'English']
];
const ACCENTS = [
  ['purple', 'Mor', '#6d7cff', '#a46bff'],
  ['blue', 'Mavi', '#3b82f6', '#06b6d4'],
  ['green', 'Yeşil', '#10b981', '#65be28'],
  ['pink', 'Pembe', '#ec4899', '#a855f7'],
  ['orange', 'Turuncu', '#f97316', '#eaa008'],
  ['red', 'Kırmızı', '#e53946', '#db2777'],
  ['discord', 'Discord', '#5865f2', '#7289da']
];

function saveAppearance(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice still applies until the panel closes.
  }
}

function openAppearance() {
  const root = document.documentElement;
  const body = el('div', { class: 'appearance', 'data-i18n-ctx': 'theme' });
  const draw = () => {
    const theme = root.dataset.themeChoice;
    const accent = root.dataset.accent;
    const language = window.panelLanguage();
    body.replaceChildren(
      el('h3', {}, 'Dil'),
      el(
        'div',
        { class: 'language-options', 'data-no-i18n': '' },
        LANGUAGES.map(([key, label]) =>
          el('button', {
            type: 'button',
            class: `language-option${language === key ? ' active' : ''}`,
            onclick: () => {
              window.setPanelLanguage(key);
              draw();
            }
          }, label)
        )
      ),
      el('h3', {}, 'Tema'),
      el(
        'div',
        { class: 'theme-options' },
        THEMES.map(([key, label, colors]) => {
          const swatch = el('div', { class: 'theme-swatch' });
          if (colors) {
            const [bg, panel, bar] = colors;
            swatch.style.background = panel;
            const side = el('i');
            side.style.background = bg;
            const block = el('b');
            block.style.background = bar;
            swatch.append(side, block);
          } else {
            swatch.style.background = 'linear-gradient(90deg, #0c0e13 50%, #eceff5 50%)';
          }
          return el('button', {
            type: 'button',
            class: `theme-option${theme === key ? ' active' : ''}`,
            onclick: () => {
              saveAppearance('panel.theme', key);
              window.applyAppearance(key, accent);
              draw();
            }
          }, swatch, el('span', {}, label));
        })
      ),
      el('h3', {}, 'Vurgu rengi'),
      el(
        'div',
        { class: 'accent-options' },
        ACCENTS.map(([key, label, from, to]) => {
          const dot = el('button', {
            type: 'button',
            class: `accent-option${accent === key ? ' active' : ''}`,
            title: label,
            onclick: () => {
              saveAppearance('panel.accent', key);
              window.applyAppearance(theme, key);
              draw();
            }
          });
          dot.style.background = `linear-gradient(135deg, ${from}, ${to})`;
          return dot;
        })
      ),
      el('div', { class: 'accent-name' }, `Seçili: ${THEMES.find(([key]) => key === theme)?.[1] ?? 'Koyu'} tema · ${ACCENTS.find(([key]) => key === accent)?.[1] ?? 'Mor'}. Seçim bu bilgisayarda saklanır.`)
    );
  };
  draw();
  openModal('🎨 Görünüm', body, [{ label: 'Tamam', class: 'primary', value: true }]);
}
for (const id of ['appearance-button', 'picker-appearance', 'settings-appearance']) $(id).addEventListener('click', openAppearance);

// Cards fold up when their heading is clicked. Cards marked data-fold="closed" start folded;
// the user's choice per card is remembered on this computer.
const FOLD_KEY = 'panel.folded';
let foldState = {};
try { foldState = JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch {}
function foldKey(card) {
  const view = card.closest('.view');
  return `${view.id}:${card.id || [...view.querySelectorAll('.card')].indexOf(card)}`;
}
function applyFolding() {
  for (const card of document.querySelectorAll('.view:not(#view-overview) .card')) {
    const heading = card.querySelector(':scope > h2');
    if (!heading) continue;
    heading.classList.add('fold-head');
    const saved = foldState[foldKey(card)];
    card.classList.toggle('folded', saved ?? card.dataset.fold === 'closed');
  }
}
document.addEventListener('click', event => {
  const heading = event.target.closest('.card > h2.fold-head');
  if (!heading || event.target.closest('button, a, input, select, label')) return;
  const card = heading.parentElement;
  const folded = card.classList.toggle('folded');
  foldState[foldKey(card)] = folded;
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(foldState)); } catch {}
});
let foldQueued = false;
new MutationObserver(() => {
  if (foldQueued) return;
  foldQueued = true;
  requestAnimationFrame(() => { foldQueued = false; applyFolding(); });
}).observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
applyFolding();
