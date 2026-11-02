// 🔴 Streams: watched Kick / Twitch / YouTube channels, where the bot announces them, the editable
// announcement template with a live preview, and the Twitch / Kick app keys.
(() => {
  const PLATFORM = {
    twitch: { icon: '🟣', label: 'Twitch', color: '#9146ff', placeholder: 'kanaladi veya twitch.tv/kanaladi' },
    kick: { icon: '🟢', label: 'Kick', color: '#53fc18', placeholder: 'kanaladi veya kick.com/kanaladi' },
    youtube: { icon: '🔴', label: 'YouTube', color: '#ff0000', placeholder: '@kanal veya youtube.com/@kanal' }
  };
  const PLACEHOLDERS = [
    ['{streamer}', 'yayıncı'],
    ['{platform}', 'platform'],
    ['{title}', 'yayın başlığı'],
    ['{game}', 'oyun / kategori'],
    ['{url}', 'yayın linki'],
    ['{viewers}', 'izleyici'],
    ['{role}', 'etiketlenen rol']
  ];
  // The bot's usual problems, in Turkish.
  const ERRORS = [
    [/^Twitch keys are missing$/, 'Twitch anahtarları girilmedi'],
    [/^Kick keys are missing$/, 'Kick anahtarları girilmedi'],
    [/^the Client ID or Secret is wrong$/, 'Client ID ya da Secret yanlış'],
    [/^Pick the channel for stream announcements first$/, 'Yayında ama duyuru kanalı seçilmedi'],
    [/^Could not post: /, 'Duyuru gönderilemedi: ']
  ];
  const errorTr = text => panelLanguage() === 'en' ? text : ERRORS.reduce((result, [pattern, turkish]) => result.replace(pattern, turkish), text);
  let data = null;
  let channels = [];
  let roles = [];
  let footer = '';

  const field = (label, control, hint) => el('label', {}, label, hint && el('span', { class: 'muted' }, ` ${hint}`), control);

  async function load() {
    const result = await attempt(async () => [await api('GET', '/api/streams'), await getChannels(), await getRoles()], 'Yayın ayarları yüklenemedi');
    if (!result) return;
    [data, channels, roles] = result;
    footer = (await api('GET', '/api/settings').catch(() => null))?.brandFooter ?? '';
    renderList();
    renderTarget();
    renderKeys();
    renderTemplate();
  }

  // ---------- watched channels ----------

  function status(item) {
    if (item.live) return el('span', { class: 'badge bad' }, '🔴 Canlı');
    if (item.error) return el('span', { class: 'badge warn', title: errorTr(item.error) }, '⚠️ Sorun');
    if (!item.checkedAt) return el('span', { class: 'badge' }, 'Bekliyor');
    return el('span', { class: 'badge' }, '⚫ Çevrimdışı');
  }

  function renderList() {
    const platform = el('select', {}, Object.entries(PLATFORM).map(([key, item]) => el('option', { value: key }, `${item.icon} ${item.label}`)));
    const channel = el('input', { maxlength: 200, placeholder: PLATFORM.twitch.placeholder });
    const name = el('input', { maxlength: 60, placeholder: 'Görünen ad (isteğe bağlı)' });
    platform.addEventListener('change', () => (channel.placeholder = PLATFORM[platform.value].placeholder));
    const add = el('button', { class: 'primary' }, '＋ Ekle');
    const submit = async () => {
      if (!channel.value.trim()) return toast('Kanal adını ya da linkini yaz.', true);
      add.disabled = true;
      const result = await attempt(() => api('POST', '/api/streams/streamers', { platform: platform.value, channel: channel.value, name: name.value }), 'Eklenemedi');
      add.disabled = false;
      if (!result) return;
      toast(`${result.name} eklendi. Bot ${data.checkMinutes} dakikada bir kontrol eder.`);
      load();
    };
    add.addEventListener('click', submit);
    channel.addEventListener('keydown', event => event.key === 'Enter' && submit());

    const needsKeys = data.streamers.filter(item => (item.platform === 'twitch' && !data.keys.twitch) || (item.platform === 'kick' && !data.keys.kick));

    // filter(Boolean): replaceChildren would turn a missing part into the text "null".
    $('streams-list-card').replaceChildren(...[
      el('h2', {}, `Takip edilen kanallar (${data.streamers.length}/25)`),
      needsKeys.length ? el('p', { class: 'small warn-text' }, `⚠️ ${[...new Set(needsKeys.map(item => PLATFORM[item.platform].label))].join(' ve ')} için aşağıdan uygulama anahtarlarını girmen gerekiyor.`) : null,
      data.streamers.length
        ? el(
            'ul',
            { class: 'entries' },
            data.streamers.map(item =>
              el(
                'li',
                {},
                el(
                  'div',
                  { class: 'body' },
                  el('div', { class: 'strong' }, `${PLATFORM[item.platform].icon} ${item.name} `, status(item)),
                  el(
                    'div',
                    { class: 'meta' },
                    item.live
                      ? `${item.live.title ?? 'Canlı'} · ${formatDate(item.live.since)}'den beri`
                      : item.error ? errorTr(item.error) : (item.checkedAt ? `Son kontrol: ${formatDate(item.checkedAt)}` : 'Henüz kontrol edilmedi'),
                    item.lastAnnouncedAt && !item.live ? ` · Son duyuru: ${formatDate(item.lastAnnouncedAt)}` : ''
                  )
                ),
                el(
                  'div',
                  { class: 'row-actions' },
                  el('button', { class: 'small ghost', title: 'Kanalı aç', onclick: () => window.open(item.url) }, '↗'),
                  item.live && el('button', { class: 'small ghost', title: 'Duyuruyu aç', onclick: () => window.open(item.live.messageUrl) }, '💬'),
                  el('button', { class: 'small', title: 'Bu kanal için deneme duyurusu', onclick: () => sendTest(item) }, '🧪'),
                  el('button', {
                    class: 'small danger',
                    onclick: async () => {
                      if (!(await confirmModal('Kanal listeden çıkarılsın mı?', `${PLATFORM[item.platform].label} · ${item.name} artık duyurulmaz.`, 'Çıkar', true))) return;
                      if (await attempt(() => api('DELETE', `/api/streams/streamers/${item.id}`), 'Çıkarılamadı')) {
                        toast('Kanal çıkarıldı.');
                        load();
                      }
                    }
                  }, 'Çıkar')
                )
              )
            )
          )
        : el('p', { class: 'muted' }, 'Henüz kanal yok. İlk kanalı aşağıdan ekle.'),
      el('div', { class: 'field-box spaced' }, el('div', { class: 'form-row' }, field('Platform', platform), field('Kanal', channel)), field('Görünen ad', name, '(boşsa kanalın adı)'), el('div', { class: 'actions' }, add))
    ].filter(Boolean));
  }

  // ---------- where to announce ----------

  function renderTarget() {
    const sorted = [...channels].sort((a, b) => b.announcement - a.announcement);
    const channel = el('select', {}, optionList(sorted, { empty: '— Kanal seç —', selected: data.channelId, label: channelLabel }));
    const role = el('select', {}, optionList(roles, { empty: '— Kimseyi etiketleme —', selected: data.roleId, label: item => `@${item.name}` }));
    const ended = el('input', { type: 'checkbox', checked: data.markEnded });
    const save = el('button', { class: 'primary' }, '💾 Kaydet');
    save.addEventListener('click', async () => {
      const result = await attempt(() => api('PATCH', '/api/streams', { channelId: channel.value || null, roleId: role.value || null, markEnded: ended.checked }), 'Kaydedilemedi');
      if (!result) return;
      data = result;
      toast('Duyuru ayarları kaydedildi.');
      renderList();
      renderTemplate();
    });
    role.addEventListener('change', () => {
      data.roleId = role.value || null;
      preview();
    });
    const picked = roles.find(item => item.id === data.roleId);
    $('streams-target-card').replaceChildren(...[
      el('h2', {}, 'Nereye duyurulsun?'),
      field('Duyuru kanalı', channel),
      field('Etiketlenecek rol', role, '(ör. @Yayın Bildirimi)'),
      picked && !picked.mentionable ? el('p', { class: 'muted small' }, 'Not: bu rol etiketlenebilir değil — botun "Tüm rollerden bahset" izni yoksa etiket gitmez.') : null,
      el('label', { class: 'check' }, ended, ' Yayın bitince duyuruyu "yayın bitti" olarak güncelle'),
      el('div', { class: 'actions' }, save)
    ].filter(Boolean));
  }

  // ---------- Twitch / Kick keys ----------

  function renderKeys() {
    const inputs = {
      twitchClientId: el('input', { maxlength: 200, placeholder: data.keys.twitch ? '•••••• (kayıtlı)' : 'Client ID' }),
      twitchClientSecret: el('input', { maxlength: 200, placeholder: data.keys.twitch ? '•••••• (kayıtlı)' : 'Client Secret' }),
      kickClientId: el('input', { maxlength: 200, placeholder: data.keys.kick ? '•••••• (kayıtlı)' : 'Client ID' }),
      kickClientSecret: el('input', { maxlength: 200, placeholder: data.keys.kick ? '•••••• (kayıtlı)' : 'Client Secret' })
    };
    const save = el('button', { class: 'primary' }, '🔑 Anahtarları kaydet');
    save.addEventListener('click', async () => {
      // Empty fields keep what is saved.
      const body = Object.fromEntries(Object.entries(inputs).filter(([, input]) => input.value.trim()).map(([key, input]) => [key, input.value]));
      if (!Object.keys(body).length) return toast('Değiştirmek istediğin anahtarı yaz.', true);
      const result = await attempt(() => api('PUT', '/api/streams/keys', body), 'Kaydedilemedi');
      if (!result) return;
      data.keys = result.keys;
      toast('Anahtarlar kaydedildi. "Şimdi kontrol et" ile deneyebilirsin.');
      renderKeys();
      renderList();
    });
    const clear = platform => async () => {
      if (!(await confirmModal(`${PLATFORM[platform].label} anahtarları silinsin mi?`, `${PLATFORM[platform].label} kanalları kontrol edilemez hale gelir.`, 'Sil', true))) return;
      const result = await attempt(() => api('PUT', '/api/streams/keys', { [`${platform}ClientId`]: '', [`${platform}ClientSecret`]: '' }), 'Silinemedi');
      if (!result) return;
      data.keys = result.keys;
      toast('Anahtarlar silindi.');
      renderKeys();
      renderList();
    };
    const fromEnv = platform => data.keys.fromEnv.some(key => key.startsWith(platform));
    const box = (platform, steps, portal) =>
      el(
        'div',
        { class: 'field-box' },
        el(
          'div',
          { class: 'strong' },
          `${PLATFORM[platform].icon} ${PLATFORM[platform].label} `,
          data.keys[platform] ? el('span', { class: 'badge ok' }, fromEnv(platform) ? '✓ .env dosyasında' : '✓ Kayıtlı') : el('span', { class: 'badge' }, 'Girilmedi')
        ),
        el('p', { class: 'muted small' }, steps, ' ', el('button', { class: 'link small', onclick: () => window.open(portal) }, 'Sayfayı aç ↗')),
        el('div', { class: 'form-row' }, field('Client ID', masked(inputs[`${platform}ClientId`])), field('Client Secret', masked(inputs[`${platform}ClientSecret`]))),
        data.keys[platform] && !fromEnv(platform) ? el('button', { class: 'link small danger-text', onclick: clear(platform) }, 'Anahtarları sil') : null
      );
    $('streams-keys-card').replaceChildren(
      el('h2', {}, '🔑 Platform anahtarları'),
      el('p', { class: 'muted small' }, 'YouTube anahtar istemez. Twitch ve Kick için ücretsiz bir "uygulama" oluşturup Client ID ve Secret\'ı buraya yapıştır. Anahtarlar bota kaydedilir, panelde bir daha gösterilmez.'),
      box('twitch', 'dev.twitch.tv → Your Console → Applications → Register. OAuth Redirect: http://localhost, Category: Chat Bot. Sonra "Manage" → Client ID ve "New Secret".', 'https://dev.twitch.tv/console/apps'),
      box('kick', 'kick.com → Ayarlar → Developer → Create App (Redirect URL: http://localhost). Client ID ve Client Secret\'ı kopyala.', 'https://kick.com/settings/developer'),
      el('div', { class: 'actions' }, save)
    );
  }

  // ---------- template ----------

  function renderTemplate() {
    const content = el('textarea', { rows: 3, maxlength: 1000, value: data.texts.content });
    const title = el('input', { maxlength: 256, value: data.texts.title });
    const description = el('textarea', { rows: 5, maxlength: 2000, value: data.texts.description });
    let focused = description;
    for (const input of [content, title, description]) {
      input.addEventListener('focus', () => (focused = input));
      input.addEventListener('input', preview);
    }
    const chips = el(
      'div',
      { class: 'chips' },
      PLACEHOLDERS.map(([code, text]) =>
        el('button', {
          class: 'chip',
          type: 'button',
          title: `${text} — tıklayınca imlecin olduğu yere eklenir`,
          onclick: () => {
            const at = focused.selectionStart ?? focused.value.length;
            focused.setRangeText(code, at, focused.selectionEnd ?? at, 'end');
            focused.focus();
            preview();
          }
        }, `${code}`)
      )
    );
    const save = el('button', { class: 'primary' }, '💾 Taslağı kaydet');
    save.addEventListener('click', async () => {
      const result = await attempt(() => api('PATCH', '/api/streams', { template: { content: content.value, title: title.value, description: description.value } }), 'Kaydedilemedi');
      if (!result) return;
      data = result;
      toast('Duyuru taslağı kaydedildi.');
    });
    const reset = el('button', { class: 'ghost' }, '↺ Varsayılana dön');
    reset.addEventListener('click', () => {
      content.value = data.defaults.content;
      title.value = data.defaults.title;
      description.value = data.defaults.description;
      preview();
      toast('Varsayılan metin yüklendi — kaydetmeyi unutma.');
    });
    const test = el('button', {}, '🧪 Deneme duyurusu gönder');
    test.addEventListener('click', () => sendTest(null, { content, title, description }));

    $('streams-template-card').replaceChildren(
      el('h2', {}, '✏️ Duyuru taslağı'),
      el('p', { class: 'muted small' }, 'Metni istediğin gibi değiştir. Süslü parantezli kelimeler yayın başlayınca gerçek bilgiyle dolar — eklemek için tıkla:'),
      chips,
      field('Mesaj', content, '(embed\'in üstündeki yazı — rol etiketi burada çalışır)'),
      field('Embed başlığı', title),
      field('Embed metni', description, '(**kalın**, *italik*, boş bırakılabilir)'),
      el('div', { class: 'actions' }, reset, test, save),
      el('h2', { class: 'spaced' }, 'Önizleme'),
      el('div', { class: 'discord-preview', id: 'streams-preview' })
    );
    preview();
  }

  const SAMPLE = { streamer: 'Yayıncı', platform: 'Twitch', title: 'Bu akşam sıralı maçlar! 🎮', game: 'Valorant', url: 'https://www.twitch.tv/yayinci', viewers: '128' };
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));

  function preview() {
    const box = $('streams-preview');
    const card = $('streams-template-card');
    if (!box || !card) return;
    const [content, title, description] = card.querySelectorAll('textarea, input');
    const sample = data.streamers[0];
    const platform = sample?.platform ?? 'twitch';
    const vars = { ...SAMPLE, streamer: sample?.name ?? SAMPLE.streamer, platform: PLATFORM[platform].label, url: sample?.url ?? SAMPLE.url, role: '\u0000ROLE\u0000' };
    const role = roles.find(item => item.id === data.roleId);

    // The role placeholder becomes a mention bubble; everything else is plain Markdown.
    const text = el('div', { class: 'embed-body' });
    text.innerHTML = discordMarkdown(fill(content.value, vars)).replace(/\u0000ROLE\u0000/g, role ? `<span class="mention">@${role.name.replace(/[&<>]/g, '')}</span>` : '');
    const body = el('div', { class: 'embed-body' });
    body.innerHTML = discordMarkdown(fill(description.value, vars).replace(/\u0000ROLE\u0000/g, ''));
    const embedTitle = fill(title.value, vars).replace(/\u0000ROLE\u0000/g, '');

    const embed = el(
      'div',
      { class: 'embed' },
      el('div', { class: 'embed-author' }, `🔴 ${vars.platform} · ${vars.streamer}`),
      embedTitle.trim() && el('div', { class: 'embed-title linked' }, embedTitle),
      description.value.trim() && body,
      el('div', { class: 'embed-field' }, el('strong', {}, 'Category'), el('div', {}, SAMPLE.game)),
      el('div', { class: 'embed-image stream-thumb' }, '▶ yayın görüntüsü'),
      el('div', { class: 'embed-footer' }, footer || 'Deer Panel')
    );
    embed.style.borderLeftColor = PLATFORM[platform].color;
    box.replaceChildren(
      ...[
        el('div', { class: 'msg-author' }, 'Deer Panel ', el('span', { class: 'bot-tag' }, 'APP')),
        content.value.trim() && text,
        embed,
        el('div', { class: 'muted small' }, sample ? `Örnek: ${sample.name} (${PLATFORM[platform].label}) — oyun ve başlık örnek` : 'Örnek bilgilerle gösteriliyor')
      ].filter(Boolean)
    );
  }

  async function sendTest(item, unsaved) {
    if (!data.channelId) return toast('Önce duyuru kanalını seçip kaydet.', true);
    if (unsaved && ['content', 'title', 'description'].some(key => unsaved[key].value !== data.texts[key])) {
      return toast('Taslakta kaydedilmemiş değişiklik var — önce kaydet.', true);
    }
    const target = channels.find(channel => channel.id === data.channelId);
    if (!(await confirmModal('Deneme duyurusu gönderilsin mi?', `${channelLabel(target)} kanalına örnek bir yayın duyurusu gider${data.roleId ? ' (rol etiketlenir)' : ''}.`, 'Gönder'))) return;
    const result = await attempt(() => api('POST', '/api/streams/test', { streamerId: item?.id ?? null }), 'Gönderilemedi');
    if (result) {
      toast('Deneme duyurusu gönderildi.');
      window.open(result.url);
    }
  }

  $('streams-check').addEventListener('click', async () => {
    $('streams-check').disabled = true;
    const result = await attempt(() => api('POST', '/api/streams/check'), 'Kontrol edilemedi');
    $('streams-check').disabled = false;
    if (!result) return;
    toast(result.announced ? `${result.announced} yeni yayın duyuruldu.` : `${result.checked} kanal kontrol edildi — yeni yayın yok.`);
    load();
  });

  App.registerView('streams', { show: load });
})();
