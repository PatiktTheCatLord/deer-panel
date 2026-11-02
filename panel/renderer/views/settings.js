// ⚙️ Settings (channels, roles, welcome text) and the FAQ editor.
(() => {
  const CHANNEL_FIELDS = [
    ['welcomeChannelId', '👋 Karşılama kanalı'],
    ['showcaseChannelId', '🐾 Vitrin kanalı'],
    ['modLogChannelId', '🛡️ Mod kaydı kanalı'],
    ['statsChannelId', '📊 Haftalık rapor kanalı'],
    ['staffAlertChannelId', '🚨 Yetkili bildirim kanalı (boş = mod kaydı)']
  ];
  const ROLE_FIELDS = [
    ['autoRoleId', '🎭 Otomatik rol (katılınca)'],
    ['showcaseRoleId', '🏆 Haftalık kazanan rolü'],
    ['staffRoleId', '🚨 Bildirimde etiketlenecek rol']
  ];
  const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  // [key, label, hint]; weekday/hour keys get selects, booleans a checkbox.
  const BOT_FIELDS = [
    ['warningAlertThreshold', '🚨 Kaç aktif uyarıda yetkililere bildirilsin', 'Otomatik ceza yok, sadece bildirim'],
    ['warningWindowDays', '⏳ Uyarılar kaç gün aktif sayılır', 'gün'],
    ['autoModWarnings', '🤖 AutoMod engellediğinde otomatik uyarı ekle'],
    ['showcaseWeekday', '🐾 Haftalık seçim günü'],
    ['showcaseHourUtc', '🐾 Haftalık seçim saati'],
    ['statsWeekday', '📊 Haftalık rapor günü'],
    ['statsHourUtc', '📊 Haftalık rapor saati']
  ];
  let savedConfig = {};
  let saved = {};

  async function loadSettings() {
    const result = await attempt(async () => [await api('GET', '/api/settings'), await getChannels(true), await getRoles(true)], 'Ayarlar yüklenemedi');
    if (!result) return;
    const [settings, channels, roles] = result;
    saved = settings;

    const select = (key, label, items, itemLabel) =>
      el('label', {}, label, el('select', { name: key }, optionList(items, { empty: '— Kapalı —', selected: settings[key], label: itemLabel })));
    const text = (key, label, hint, max) => el('label', {}, label, el('span', { class: 'muted' }, ` ${hint}`), el('input', { name: key, maxlength: max, value: settings[key] ?? '' }));

    $('settings-fields').replaceChildren(
      el('label', {}, '🌐 Bot dili', el('span', { class: 'muted' }, ' üyelerin gördüğü metinler; yeni dil: src/locales/en.json kopyalanıp çevrilir'), el('select', { name: 'language' }, Object.entries(settings.languages ?? { en: 'English' }).map(([code, label]) => el('option', { value: code, selected: code === settings.language }, label)))),
      text('brandName', '🏷️ Topluluk adı', 'mesajlarda görünür (ör. "Welcome to …")', 60),
      text('brandFooter', '🏷️ Mesaj alt yazısı', 'bot mesajlarının altında', 100),
      text('showcaseItem', '🐾 Vitrinde paylaşılan şey', 'tekil, küçük harf (ör. pet, creation, screenshot) — "Your … won"', 30),
      text('showcaseTitle', '🏆 Haftalık kazananın adı', 'ör. Pet of the Week, Pick of the Week', 40),
      ...CHANNEL_FIELDS.map(([key, label]) => select(key, label, channels, channelLabel)),
      ...ROLE_FIELDS.map(([key, label]) => select(key, label, roles, role => `@${role.name}`)),
      el('label', {}, '✉️ Karşılama metni ', el('span', { class: 'muted' }, '{user} {username} {server} {count} — boş = varsayılan'), el('textarea', { name: 'welcomeMessage', rows: 3, maxlength: 1500, value: settings.welcomeMessage ?? '' }))
    );
  }

  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    const changes = {};
    for (const control of $('settings-fields').querySelectorAll('[name]')) {
      const value = control.value.trim() || null;
      if (value !== (saved[control.name] ?? null)) changes[control.name] = value;
    }
    if (!Object.keys(changes).length) return toast('Değişiklik yok.');
    const result = await attempt(() => api('PATCH', '/api/settings', changes), 'Kaydedilemedi');
    if (result) {
      saved = result;
      toast(`${Object.keys(changes).length} ayar kaydedildi.`);
    }
  });

  // ---------- FAQ ----------

  function resetFaqForm() {
    $('faq-id').value = '';
    $('faq-question').value = '';
    $('faq-answer').value = '';
    $('faq-save').textContent = '＋ Ekle';
    $('faq-cancel').hidden = true;
  }

  async function loadFaqs() {
    const faqs = await attempt(() => api('GET', '/api/faqs'), 'SSS yüklenemedi');
    if (!faqs) return;
    $('faq-list').replaceChildren(
      ...faqs.map(faq =>
        el(
          'li',
          {},
          el('div', { class: 'body' }, el('div', { class: 'strong' }, faq.question), el('div', { class: 'faq-answer' }, faq.answer), el('div', { class: 'meta' }, `#${faq.id} · ${faq.uses ?? 0} kez kullanıldı`)),
          el(
            'div',
            { class: 'row-actions' },
            el('button', {
              class: 'small',
              onclick: () => {
                $('faq-id').value = faq.id;
                $('faq-question').value = faq.question;
                $('faq-answer').value = faq.answer;
                $('faq-save').textContent = '💾 Kaydet';
                $('faq-cancel').hidden = false;
                $('faq-question').focus();
              }
            }, 'Düzenle'),
            el('button', {
              class: 'small danger',
              onclick: async () => {
                if (!(await confirmModal('SSS kaydı silinsin mi?', faq.question, 'Sil', true))) return;
                if (await attempt(() => api('DELETE', `/api/faqs/${faq.id}`), 'Silinemedi')) {
                  toast('Silindi.');
                  loadFaqs();
                }
              }
            }, 'Sil')
          )
        )
      )
    );
    if (!faqs.length) $('faq-list').replaceChildren(el('li', { class: 'muted' }, 'Henüz SSS yok. Üyeler /faq ile buradakileri görür.'));
  }

  $('faq-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = $('faq-id').value;
    const payload = { question: $('faq-question').value, answer: $('faq-answer').value };
    const result = await attempt(() => (id ? api('PUT', `/api/faqs/${id}`, payload) : api('POST', '/api/faqs', payload)), 'Kaydedilemedi');
    if (!result) return;
    toast(id ? 'SSS güncellendi.' : 'SSS eklendi.');
    resetFaqForm();
    loadFaqs();
  });
  $('faq-cancel').addEventListener('click', resetFaqForm);

  // ---------- bot config ----------

  async function loadBotConfig() {
    const result = await attempt(() => api('GET', '/api/botconfig'), 'Bot ayarları yüklenemedi');
    if (!result) return;
    savedConfig = result.values;
    const control = (key, field) => {
      const value = result.values[key];
      if (field.type === 'boolean') return el('input', { type: 'checkbox', name: key, checked: value });
      if (key.endsWith('Weekday')) return el('select', { name: key }, WEEKDAYS.map((day, index) => el('option', { value: index, selected: index === value }, day)));
      if (key.endsWith('HourUtc')) return el('select', { name: key }, Array.from({ length: 24 }, (_, hour) => el('option', { value: hour, selected: hour === value }, `${String(hour).padStart(2, '0')}:00 UTC · ${String((hour + 3) % 24).padStart(2, '0')}:00 TR`)));
      return el('input', { type: 'number', name: key, min: field.min, max: field.max, value });
    };
    $('botconfig-fields').replaceChildren(
      ...BOT_FIELDS.filter(([key]) => result.fields[key]).map(([key, label, hint]) => {
        const field = result.fields[key];
        if (field.type === 'boolean') return el('label', { class: 'check' }, control(key, field), label);
        return el('label', {}, label, hint ? el('span', { class: 'muted' }, ` ${hint}`) : '', control(key, field));
      })
    );
  }

  $('botconfig-form').addEventListener('submit', async event => {
    event.preventDefault();
    const changes = {};
    for (const control of $('botconfig-fields').querySelectorAll('[name]')) {
      const value = control.type === 'checkbox' ? control.checked : Number(control.value);
      if (value !== savedConfig[control.name]) changes[control.name] = value;
    }
    if (!Object.keys(changes).length) return toast('Değişiklik yok.');
    const result = await attempt(() => api('PATCH', '/api/botconfig', changes), 'Kaydedilemedi');
    if (!result) return;
    savedConfig = result.values;
    toast(`${Object.keys(changes).length} bot ayarı kaydedildi.`);
  });

  // ---------- panel: autostart, PIN, history ----------

  async function loadPanel() {
    $('autostart').checked = await attempt(() => window.panel.getAutostart(), 'Otomatik başlatma okunamadı');
    const pin = await attempt(() => window.panel.pinStatus(), 'PIN durumu okunamadı');
    $('pin-state').textContent = pin?.hasPin ? '🔒 PIN açık: panel her açılışta PIN ister.' : '🔓 PIN yok: panel doğrudan açılır.';
    $('pin-current').hidden = !pin?.hasPin;
    $('pin-remove').hidden = !pin?.hasPin;
    const history = (await attempt(() => window.panel.history(), 'Geçmiş okunamadı')) ?? [];
    $('history-list').replaceChildren(
      ...history.slice(0, 100).map(entry =>
        el('li', { class: entry.ok ? '' : 'failed' }, el('div', { class: 'body' }, el('div', { class: 'strong' }, `${entry.ok ? '' : '❌ '}${entry.action}`), el('div', { class: 'meta' }, `${formatDate(entry.time)}${entry.detail ? ` · ${entry.detail}` : ''}`)))
      )
    );
    if (!history.length) $('history-list').replaceChildren(el('li', { class: 'muted' }, 'Henüz kayıt yok.'));
  }

  $('autostart').addEventListener('change', async () => {
    const result = await attempt(() => window.panel.setAutostart($('autostart').checked), 'Ayarlanamadı');
    if (result === null) return;
    toast($('autostart').checked ? 'Panel Windows açılınca arka planda başlayacak.' : 'Otomatik başlatma kapatıldı.');
  });

  async function changePin(newPin) {
    if (newPin !== null && !/^\d{4,8}$/.test(newPin)) return toast('PIN 4–8 rakam olmalı.', true);
    const result = await attempt(() => window.panel.setPin(newPin, $('pin-current').value), 'PIN değiştirilemedi');
    if (!result) return;
    $('pin-current').value = '';
    $('pin-new').value = '';
    toast(newPin === null ? 'PIN kaldırıldı.' : 'PIN ayarlandı.');
    loadPanel();
  }
  $('pin-save').addEventListener('click', () => changePin($('pin-new').value.trim()));
  $('pin-remove').addEventListener('click', async () => {
    if (await confirmModal('PIN kaldırılsın mı?', 'Panel PIN sormadan açılır.', 'Kaldır', true)) changePin(null);
  });

  // ---------- modules ----------

  // Turkish names for the panel; the bot's own labels are English.
  const MODULE_TEXT = {
    welcome: ['👋 Karşılama', 'Karşılama mesajı ve katılınca otomatik rol'],
    verification: ['✅ Doğrulama', 'Sunucuyu açan doğrulama butonu'],
    moderation: ['🛡️ Moderasyon', 'Uyarılar, notlar, AutoMod uyarıları, yetkili bildirimi'],
    roles: ['🎭 Rol paneli', 'Butonla rol seçme'],
    showcase: ['🐾 Vitrin', 'Resim vitrini, ❤️ ve haftanın seçimi'],
    activity: ['📈 Aktivite', 'Mesaj/ses sayımı, /top, sıralamalar'],
    stats: ['📊 Haftalık rapor', 'Yetkili raporu'],
    faq: ['❓ SSS', 'Sık sorulan sorular'],
    streams: ['🔴 Yayın duyuruları', 'Kick, Twitch ve YouTube yayınlarını duyurur']
  };

  function renderModules(result) {
    $('modules-info').textContent = `Kapalı modülün komutları ${result.perServerCommands ? 'sunucunun komut listesinden hemen kalkar' : 'çalışmaz ("turned off" der)'}, otomatik işleri durur ve sekmesi gizlenir. Kayıtlı veriler silinmez.`;
    const names = Object.fromEntries(result.modules.map(module => [module.key, MODULE_TEXT[module.key]?.[0] ?? module.label]));
    $('modules-list').replaceChildren(
      ...result.modules.map(module => {
        const [title, description] = MODULE_TEXT[module.key] ?? [module.label, module.description];
        const box = el('input', { type: 'checkbox', checked: module.enabled });
        box.addEventListener('change', async () => {
          box.disabled = true;
          const saved = await attempt(() => api('PATCH', '/api/modules', { [module.key]: box.checked }), 'Kaydedilemedi');
          box.disabled = false;
          if (!saved) {
            box.checked = !box.checked;
            return;
          }
          App.applyModules(saved.modules);
          renderModules(saved);
          toast(`${title} ${box.checked ? 'açıldı' : 'kapatıldı'}.`);
        });
        return el(
          'label',
          { class: `module${module.enabled ? '' : ' off'}` },
          box,
          el('span', { class: 'module-text' }, el('strong', {}, title), el('span', { class: 'muted small' }, description), module.requires.length ? el('span', { class: 'muted small' }, `Gerekli: ${module.requires.map(key => names[key]).join(', ')}`) : null, el('span', { class: 'muted small' }, module.commands.map(name => `/${name}`).join(' ')))
        );
      })
    );
  }

  async function loadModuleSwitches() {
    const result = await attempt(() => api('GET', '/api/modules'), 'Modüller yüklenemedi');
    if (!result) return;
    App.applyModules(result.modules);
    renderModules(result);
  }

  App.registerView('settings', {
    show: () => {
      loadModuleSwitches();
      loadSettings();
      loadFaqs();
      loadBotConfig();
      loadPanel();
    }
  });
})();
