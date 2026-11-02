// 🔌 Profiles: the picker shown at start, the profile chip in the sidebar, the Bağlantılar list and the
// profile dialog (shared by the picker and Bağlantılar).
(() => {
  let data = { activeId: null, profiles: [], defaults: {} };
  let managing = false;

  // [key, label, hint, type]
  const FIELDS = [
    ['name', 'Profil adı', 'ör. Topluluğum', 'text'],
    ['host', 'Sunucu adresi', 'IP ya da alan adı', 'masked'],
    ['port', 'SSH portu', '', 'number'],
    ['username', 'SSH kullanıcısı', 'servisleri yönetebilen (root ya da sudo)', 'text'],
    ['privateKeyPath', 'SSH anahtar dosyası', 'boş = sadece şifre', 'key'],
    ['passphrase', 'Anahtar parolası', 'varsa', 'secret'],
    ['password', 'SSH şifresi', 'anahtar yoksa', 'secret'],
    ['appDir', 'Bot klasörü (sunucuda)', '', 'text'],
    ['envPath', '.env yolu (sunucuda)', '', 'text'],
    ['service', 'Bot servisi (systemd)', '', 'text'],
    ['serviceUser', 'Servis kullanıcısı', 'botu çalıştıran Linux kullanıcısı', 'text'],
    ['backupService', 'Yedek servisi', '', 'text'],
    ['apiPort', 'Yönetim API portu', 'sunucuda 127.0.0.1', 'number']
  ];

  // ---------- avatar: the server's icon, or initials on a colour picked from the name ----------

  function avatar(profile, size = 'md') {
    const node = el('span', { class: `avatar ${size}` });
    if (profile?.meta?.avatar) {
      const img = el('img', { src: profile.meta.avatar, alt: '' });
      img.addEventListener('error', () => img.replaceWith(initials(profile)));
      node.append(img);
    } else node.append(initials(profile));
    return node;
  }
  function initials(profile) {
    const name = profile?.name ?? '?';
    const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('') || '?';
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) % 360;
    const span = el('span', { class: 'initials' }, letters);
    span.style.cssText = `background: linear-gradient(135deg, hsl(${hash} 70% 58%), hsl(${(hash + 50) % 360} 70% 45%))`;
    return span;
  }
  App.profileAvatar = avatar;

  async function load() {
    const result = await attempt(() => window.panel.profiles(), 'Profiller yüklenemedi');
    if (!result) return;
    data = result;
    renderChip();
    renderPicker();
    renderList();
  }
  App.refreshProfiles = load;

  const active = () => data.profiles.find(profile => profile.id === data.activeId);
  App.activeProfile = () => active();

  function renderChip() {
    const profile = active();
    $('chip-avatar').replaceWith(Object.assign(avatar(profile, 'sm'), { id: 'chip-avatar' }));
    $('chip-name').textContent = profile?.name ?? 'Profil seç';
    $('chip-sub').textContent = profile?.meta?.guildName ?? 'Profil değiştir';
  }

  // ---------- picker ----------

  function showPicker() {
    managing = false;
    $('picker-error').textContent = '';
    $('picker').hidden = false;
    document.body.classList.add('picking');
    load();
  }
  function hidePicker() {
    $('picker').hidden = true;
    document.body.classList.remove('picking');
  }
  App.showPicker = showPicker;

  function renderPicker() {
    $('picker-manage').textContent = managing ? '✔ Bitti' : '✏️ Profilleri yönet';
    $('picker-manage').hidden = !data.profiles.length;
    $('picker-sub').textContent = data.profiles.length
      ? managing ? 'Düzenlemek istediğin profile tıkla.' : 'Bir profil seç ya da yeni bir bot bağla.'
      : 'İlk botunu bağlamak için bir profil ekle.';
    const tiles = data.profiles.map((profile, index) =>
      el(
        'button',
        { id: `picker-tile-${index}`, class: `picker-tile${managing ? ' editing' : ''}${profile.id === data.activeId ? ' last' : ''}`, 'data-id': profile.id, onclick: () => (managing ? openProfileDialog(profile) : choose(profile)) },
        el('span', { class: 'picker-avatar' }, avatar(profile, 'xl'), managing ? el('span', { class: 'picker-edit' }, '✏️') : null),
        el('span', { class: 'picker-name' }, profile.name),
        el('span', { class: 'picker-meta' }, profile.meta?.guildName ?? (profile.meta ? '' : 'Henüz bağlanılmadı'))
      )
    );
    const add = el(
      'button',
      { id: 'picker-add', class: 'picker-tile add', onclick: () => App.openWizard() },
      el('span', { class: 'picker-avatar' }, el('span', { class: 'avatar xl add-avatar' }, '＋')),
      el('span', { class: 'picker-name' }, 'Profil ekle'),
      el('span', { class: 'picker-meta' }, 'Yeni bot ya da sunucu')
    );
    $('picker-grid').replaceChildren(...tiles, add);
  }

  // After the setup wizard: open the new profile.
  App.chooseProfileById = async id => {
    await load();
    const profile = data.profiles.find(item => item.id === id);
    if (profile) await choose(profile);
  };

  async function choose(profile) {
    const tile = $('picker-grid').querySelector(`[data-id="${profile.id}"]`);
    $('picker-grid').classList.add('busy');
    tile?.classList.add('connecting');
    $('picker-error').textContent = '';
    App.connecting();
    try {
      const result = await window.panel.activateProfile(profile.id);
      hidePicker();
      showView('overview');
      await App.afterConnect(result.profile);
    } catch (error) {
      $('picker-error').textContent = `${profile.name}: bağlanılamadı — ${errorText(error)}`;
      setConnection(false, 'Bağlanamadı');
      await load();
    } finally {
      $('picker-grid').classList.remove('busy');
      tile?.classList.remove('connecting');
    }
  }

  $('picker-manage').addEventListener('click', () => {
    managing = !managing;
    renderPicker();
  });
  $('profile-chip').addEventListener('click', showPicker);

  // ---------- Bağlantılar list ----------

  function renderList() {
    $('profile-list').replaceChildren(
      ...data.profiles.map(profile =>
        el(
          'li',
          { class: 'profile-row' },
          avatar(profile, 'md'),
          el(
            'div',
            { class: 'body' },
            el('div', { class: 'strong' }, profile.name, profile.id === data.activeId ? el('span', { class: 'badge ok' }, 'kullanılıyor') : null),
            // The server address is only shown in the dialog (not on the screen all the time).
            el('div', { class: 'meta' }, profile.type === 'local' ? `${profile.meta?.guildName ? `${profile.meta.guildName} · ` : ''}🖥️ Bu bilgisayarda · API portu ${profile.apiPort}` : `${profile.meta?.guildName ? `${profile.meta.guildName} · ` : ''}SSH: ${profile.username} · port ${profile.port} · ${profile.appDir} · ${profile.privateKeyPath ? `🔑 ${profile.keyExists ? 'anahtar' : 'anahtar bulunamadı!'}` : ''}${profile.hasPassword ? ' · 🔒 şifre' : ''}`)
          ),
          el(
            'div',
            { class: 'row-actions' },
            profile.id !== data.activeId && el('button', { class: 'small primary', onclick: () => switchTo(profile) }, 'Kullan'),
            el('button', { class: 'small', onclick: () => openProfileDialog(profile) }, 'Düzenle')
          )
        )
      )
    );
    if (!data.profiles.length) $('profile-list').replaceChildren(el('li', { class: 'muted' }, 'Henüz profil yok. "＋ Yeni bağlantı" ile ekle.'));
  }

  async function switchTo(profile) {
    App.connecting();
    const result = await attempt(() => window.panel.activateProfile(profile.id), 'Bağlanılamadı');
    if (!result) {
      setConnection(false, 'Bağlanamadı');
      return load();
    }
    toast(`${result.profile} profiline geçildi.`);
    showView('overview');
    await App.afterConnect(result.profile);
  }

  $('profile-new').addEventListener('click', () => App.openWizard());

  // ---------- profile dialog ----------

  // A bot on this computer: only the name can change; folder and port are shown for reference.
  function openLocalDialog(profile) {
    const name = el('input', { value: profile.name, maxlength: 40 });
    const result = el('p', { class: 'muted small test-result' });
    let deleteArmed = false;
    const body = el('div', { class: 'form' },
      el('label', {}, el('span', { class: 'field-label' }, 'Profil adı'), name),
      el('p', { class: 'muted small' }, `🖥️ Bu bilgisayarda çalışıyor · klasör: ${profile.botDir} · API portu ${profile.apiPort}`),
      result);
    openModal(`Profili düzenle — ${profile.name}`, body, [
      { label: '🗑 Sil', class: 'danger push-left', value: 'delete' },
      { label: 'Vazgeç', class: 'ghost', value: null },
      { label: '💾 Kaydet', class: 'primary', value: 'save' }
    ], async action => {
      if (action === 'delete') {
        if (!deleteArmed) {
          deleteArmed = true;
          result.textContent = '⚠️ Silmek için "Sil"e tekrar tıkla. Profil silinir; botun klasörü ve verileri bilgisayarda kalır.';
          return false;
        }
        if (!(await attempt(() => window.panel.removeProfile(profile.id), 'Silinemedi'))) return false;
        toast('Profil silindi.');
        load();
        return true;
      }
      if (action !== 'save') return true;
      const saved = await attempt(() => window.panel.saveProfile({ id: profile.id, type: 'local', name: name.value, botDir: profile.botDir, apiPort: profile.apiPort }), 'Kaydedilemedi');
      if (!saved) return false;
      toast('Profil güncellendi.');
      await load();
      return true;
    });
  }

  function openProfileDialog(profile) {
    if (profile?.type === 'local') return openLocalDialog(profile);
    const values = { ...data.defaults, ...(profile ?? {}) };
    const result = el('p', { class: 'muted small test-result' });
    // Label and hint on one line, so the two columns stay aligned.
    const caption = (label, hint) => el('span', { class: 'field-label' }, label, hint ? el('span', { class: 'field-hint' }, hint) : null);
    // Everything but the profile name is hidden (safe for screen sharing); one button shows or hides all of it.
    const hidden = [];
    const hide = input => {
      input.dataset.shownType = input.type;
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      hidden.push(input);
      return input;
    };
    const fields = FIELDS.map(([key, label, hint, type]) => {
      if (type === 'secret') {
        const stored = key === 'password' ? profile?.hasPassword : profile?.hasPassphrase;
        return el('label', {}, caption(label, stored ? 'kayıtlı · değiştirmek için yaz, silmek için "-"' : hint), hide(el('input', { name: key, 'data-secret': '1' })));
      }
      const input = el('input', { name: key, type: type === 'number' ? 'number' : 'text', value: values[key] ?? '' });
      if (key !== 'name') hide(input);
      if (type !== 'key') return el('label', {}, caption(label, hint), input);
      const pick = el('button', {
        type: 'button',
        class: 'small',
        onclick: async () => {
          const file = await attempt(() => window.panel.pickKeyFile(), 'Dosya seçilemedi');
          if (file) input.value = file;
        }
      }, 'Seç…');
      return el('label', {}, caption(label, hint), el('div', { class: 'form-row' }, input, pick));
    });
    const revealAll = el('button', {
      type: 'button',
      class: 'small ghost reveal',
      onclick: () => {
        const show = hidden[0].type === 'password';
        for (const input of hidden) input.type = show ? input.dataset.shownType : 'password';
        revealAll.textContent = show ? '🙈 Tümünü gizle' : '👁 Tümünü göster';
      }
    }, '👁 Tümünü göster');
    const privacyBar = el('div', { class: 'privacy-bar' },
      el('span', { class: 'muted small' }, '🔒 Bağlantı bilgileri ekran paylaşımında görünmesin diye gizli.'),
      revealAll);
    const body = el('div', { class: 'form profile-form' }, privacyBar, el('div', { class: 'form-grid' }, fields), result);

    // Form → { profile, secrets }: secrets only when typed ("-" removes a stored one).
    const read = () => {
      const input = { id: profile?.id };
      const secrets = {};
      for (const control of body.querySelectorAll('input[name]')) {
        if (control.dataset.secret) {
          if (control.value === '-') secrets[control.name] = '';
          else if (control.value) secrets[control.name] = control.value;
        } else input[control.name] = control.value.trim();
      }
      return { input, secrets };
    };

    let deleteArmed = false;
    const actions = [
      ...(profile ? [{ label: '🗑 Sil', class: 'danger push-left', value: 'delete' }] : []),
      { label: 'Vazgeç', class: 'ghost', value: null },
      { label: '🔎 Bağlantıyı dene', value: 'test' },
      { label: '💾 Kaydet', class: 'primary', value: 'save' }
    ];
    openModal(profile ? `Profili düzenle — ${profile.name}` : 'Yeni bağlantı', body, actions, async action => {
      const { input, secrets } = read();
      if (action === 'test') {
        result.textContent = 'Deneniyor…';
        try {
          const test = await window.panel.testProfile(input, secrets);
          result.textContent = `✅ Bağlantı çalışıyor · bot servisi: ${test.service}${test.api ? ' · yönetim API anahtarı bulundu' : ' · ⚠️ .env içinde ADMIN_API_TOKEN bulunamadı'}`;
        } catch (error) {
          result.textContent = `❌ ${errorText(error)}`;
        }
        return false;
      }
      if (action === 'delete') {
        // One dialog at a time: the first click asks, the second deletes.
        if (!deleteArmed) {
          deleteArmed = true;
          result.textContent = '⚠️ Silmek için "Sil"e tekrar tıkla. Sadece bu bilgisayardaki bağlantı ayarı silinir; sunucudaki bot etkilenmez.';
          return false;
        }
        if (!(await attempt(() => window.panel.removeProfile(profile.id), 'Silinemedi'))) return false;
        toast('Profil silindi.');
        load();
        return true;
      }
      if (action !== 'save') return true;
      const saved = await attempt(() => window.panel.saveProfile(input, secrets), 'Kaydedilemedi');
      if (!saved) return false;
      toast(profile ? 'Profil güncellendi.' : 'Profil eklendi.');
      await load();
      return true;
    });
    setTimeout(() => body.querySelector('input')?.focus(), 50);
  }

  App.registerView('connections', { show: load });
})();
