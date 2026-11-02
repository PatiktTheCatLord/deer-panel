// Start: PIN screen (if a PIN is set), then the profile picker. Started hidden (Windows login, for
// notifications) or in test mode it connects to the last profile right away; PANEL_VIEW=picker shows the picker.
async function start() {
  const [{ autoConnect }, testView] = await Promise.all([window.panel.startup(), window.panel.testView()]);
  if (!autoConnect || testView === 'picker') {
    setConnection(false, 'Profil seçilmedi');
    return App.showPicker();
  }
  await connect();
  if (!testView) return;
  showView(testView);
  if (testView === 'members') setTimeout(() => $('member-list').querySelector('li:not(.muted)')?.click(), 1500);
}

(async () => {
  const { hasPin, unlocked } = await window.panel.pinStatus();
  if (!hasPin || unlocked) return start();

  $('lock').hidden = false;
  $('lock-pin').focus();
  $('lock-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await window.panel.unlock($('lock-pin').value);
      $('lock').hidden = true;
      start();
    } catch (error) {
      $('lock-error').textContent = errorText(error);
      $('lock-pin').value = '';
      $('lock-pin').focus();
    }
  });
})();
