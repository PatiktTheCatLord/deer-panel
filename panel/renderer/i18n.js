// Panel language (Türkçe / English). The panel is written in Turkish; in English mode every Turkish text that
// reaches the page — static HTML, view renders, toasts, setup logs — is swapped for its entry in i18n-en.js.
// Texts with changing parts match the {0} patterns there. The original is remembered, so switching back needs no reload.
// Typed values (inputs, textareas) and the bot's live log are never touched.
(function () {
  const STORAGE_KEY = 'panel.language';
  const read = () => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  };
  let language = read() || ((navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

  const translate = window.makeTranslator(window.PANEL_EN || {});

  const SKIP = 'textarea, script, style, #view-logs .log, [data-no-i18n]';
  const SKIP_ATTRIBUTES = 'script, style, #view-logs .log, [data-no-i18n]';
  const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];
  const originals = new WeakMap(); // text node → Turkish text
  const attributeOriginals = new WeakMap(); // element → { attribute: Turkish text }
  const contextOf = node => node.parentElement?.closest('[data-i18n-ctx]')?.dataset.i18nCtx;

  function translateText(node) {
    if (!node.parentElement || node.parentElement.closest(SKIP)) return;
    const current = node.nodeValue;
    const known = originals.get(node);
    // Changed by the page since we translated it → the new text is the original.
    const source = known && known.english === current ? known.turkish : current;
    if (language === 'tr') {
      if (known && known.english === current) node.nodeValue = known.turkish;
      return;
    }
    const english = translate(source, contextOf(node));
    if (english == null || english === current) return;
    originals.set(node, { turkish: source, english });
    node.nodeValue = english;
  }

  function translateAttributes(element) {
    if (element.closest(SKIP_ATTRIBUTES)) return;
    for (const name of ATTRIBUTES) {
      const current = element.getAttribute(name);
      if (current == null) continue;
      const saved = attributeOriginals.get(element) ?? {};
      const known = saved[name];
      const source = known && known.english === current ? known.turkish : current;
      if (language === 'tr') {
        if (known && known.english === current) element.setAttribute(name, known.turkish);
        continue;
      }
      const english = translate(source);
      if (english == null || english === current) continue;
      saved[name] = { turkish: source, english };
      attributeOriginals.set(element, saved);
      element.setAttribute(name, english);
    }
  }

  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) translateText(node);
      else translateAttributes(node);
    }
  }

  let busy = false;
  const observer = new MutationObserver(mutations => {
    if (busy || language === 'tr') return;
    busy = true;
    try {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateText(mutation.target);
        else if (mutation.type === 'attributes') translateAttributes(mutation.target);
        else for (const node of mutation.addedNodes) walk(node);
      }
    } finally {
      busy = false;
    }
  });
  const start = () => {
    walk(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  document.documentElement.lang = language;

  window.panelLanguage = () => language;
  // Locale for dates and numbers.
  window.panelLocale = () => (language === 'en' ? 'en-GB' : 'tr-TR');
  // Text in the current language, for places outside the page (native dialogs, the window title).
  window.T = text => (language === 'en' ? translate(text) ?? text : text);
  // { save: false } only switches this window (screenshots and tests).
  window.setPanelLanguage = (next, { save = true } = {}) => {
    if (next !== 'tr' && next !== 'en') return;
    language = next;
    document.documentElement.lang = next;
    busy = true;
    try { walk(document.body); } finally { busy = false; }
    // core.js draws the open page again so dates and numbers follow the language.
    window.dispatchEvent(new Event('panel-language'));
    if (!save) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.panel?.setLanguage?.(next);
  };
  window.addEventListener('DOMContentLoaded', () => window.panel?.setLanguage?.(language));
})();
