// 🧩 Addons: features other people wrote (addons/<id>/ next to the bot, see ADDONS.md). Lists what the
// bot loaded, switches each one on or off for the server, and installs or removes them (the bot restarts).
(() => {
  let current = [];

  // Author · commands · events · folder, each its own text node so it can be translated.
  function meta(addon) {
    const parts = [
      addon.author && el('span', {}, `Yazan: ${addon.author}`),
      addon.commands.length && el('span', { 'data-no-i18n': '' }, addon.commands.map(name => `/${name}`).join(' ')),
      addon.events && el('span', {}, `${addon.events} olay`),
      el('span', {}, `klasör: ${addon.id}`)
    ].filter(Boolean);
    return parts.flatMap((part, index) => (index ? [' · ', part] : [part]));
  }

  function render(result) {
    current = result.addons;
    $('addons-dir').textContent = result.dir;
    if (!current.length) {
      $('addons-list').replaceChildren(
        el('p', { class: 'muted' }, 'Henüz eklenti yok. Bir eklenti klasörü ya da .zip dosyası seçerek kurabilirsin. Örnek eklenti: examples/addons/hello-world')
      );
      return;
    }
    $('addons-list').replaceChildren(...current.map(addon => {
      const box = el('input', { type: 'checkbox', checked: addon.enabled, disabled: Boolean(addon.error) });
      box.addEventListener('change', async () => {
        box.disabled = true;
        const saved = await attempt(() => api('PATCH', '/api/modules', { [addon.key]: box.checked }), 'Kaydedilemedi');
        box.disabled = false;
        if (!saved) {
          box.checked = !box.checked;
          return;
        }
        App.applyModules(saved.modules);
        toast(`${addon.name} ${box.checked ? 'açıldı' : 'kapatıldı'}.`);
        load();
      });
      const remove = el('button', { class: 'ghost danger-text', type: 'button' }, '🗑 Kaldır');
      remove.addEventListener('click', () => uninstall(addon));
      return el(
        'div',
        { class: `module addon${addon.enabled ? '' : ' off'}` },
        box,
        el(
          'span',
          { class: 'module-text' },
          el('strong', {}, addon.name, addon.version ? el('span', { class: 'muted small' }, ` v${addon.version}`) : null, addon.error ? el('span', { class: 'badge bad' }, 'yüklenemedi') : null),
          addon.description ? el('span', { class: 'muted small' }, addon.description) : null,
          addon.error ? el('span', { class: 'small bad-text' }, addon.error) : null,
          el('span', { class: 'muted small' }, ...meta(addon))
        ),
        remove
      );
    }));
  }

  async function load() {
    const result = await attempt(() => api('GET', '/api/addons'), 'Eklentiler yüklenemedi');
    if (result) render(result);
  }

  // The bot is restarting: ask again until it answers (a few seconds).
  async function reloadAfterRestart() {
    $('addons-list').replaceChildren(el('p', { class: 'muted' }, 'Bot yeniden başlıyor…'));
    for (let tries = 0; tries < 15; tries += 1) {
      await new Promise(done => setTimeout(done, 2000));
      const result = await api('GET', '/api/addons').catch(() => null);
      if (result) {
        render(result);
        App.reloadModules();
        return;
      }
    }
    toast('Bot henüz cevap vermiyor. Biraz sonra ↻ Yenile\'ye bas.', true);
  }

  async function install(kind) {
    const picked = await attempt(() => window.panel.pickAddon(kind), 'Eklenti açılamadı');
    if (!picked) return;
    const existing = current.find(addon => addon.id === picked.id);
    const body = el(
      'div',
      { class: 'stack' },
      el('p', {}, el('strong', {}, picked.name), picked.version ? ` v${picked.version}` : '', picked.author ? ` · ${picked.author}` : ''),
      picked.description ? el('p', { class: 'muted' }, picked.description) : null,
      existing ? el('p', { class: 'warn-text' }, `Kurulu "${existing.name}" eklentisinin yerine geçer.`) : null,
      el('p', { class: 'muted small' }, 'Eklentiler botla aynı yetkilerle çalışır: sunucundaki mesajları okuyabilir, botun verisine erişebilir. Sadece güvendiğin kişilerin yazdığı eklentileri kur. Kurulumdan sonra bot yeniden başlar.')
    );
    const ok = await openModal('Eklenti kurulsun mu?', body, [
      { label: 'Vazgeç', class: 'ghost', value: false },
      { label: '🧩 Kur', class: 'primary', value: true }
    ]);
    if (ok !== true) {
      window.panel.cancelAddon();
      return;
    }
    toast(`${picked.name} kuruluyor…`);
    if (await attempt(() => window.panel.installAddon(), 'Kurulamadı')) {
      toast(`${picked.name} kuruldu, bot yeniden başlatıldı.`);
      reloadAfterRestart();
    }
  }

  async function uninstall(addon) {
    if (!(await confirmModal(`${addon.name} kaldırılsın mı?`, 'Eklentinin klasörü silinir ve bot yeniden başlar. Eklentinin kaydettiği veriler botun verisinde kalır.', 'Kaldır', true))) return;
    if (await attempt(() => window.panel.removeAddon(addon.id), 'Kaldırılamadı')) {
      toast(`${addon.name} kaldırıldı.`);
      reloadAfterRestart();
    }
  }

  $('addons-folder').addEventListener('click', () => install('folder'));
  $('addons-zip').addEventListener('click', () => install('zip'));
  $('addons-refresh').addEventListener('click', () => load());

  App.registerView('addons', { show: load });
})();
