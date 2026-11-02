// Applies the saved theme and accent color before the page paints (loaded in <head>).
// The choice lives on this computer (localStorage); change it in 🎨 Görünüm (core.js → openAppearance).
(() => {
  const read = key => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const light = matchMedia('(prefers-color-scheme: light)');

  // theme: dark | light | black | system (follows Windows); accent: see ACCENTS in core.js
  window.applyAppearance = (theme = read('panel.theme') || 'dark', accent = read('panel.accent') || 'purple') => {
    const root = document.documentElement;
    root.dataset.theme = theme === 'system' ? (light.matches ? 'light' : 'dark') : theme;
    root.dataset.themeChoice = theme;
    root.dataset.accent = accent;
  };
  light.addEventListener('change', () => {
    if ((read('panel.theme') || 'dark') === 'system') window.applyAppearance();
  });
  window.applyAppearance();
})();
