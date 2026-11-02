// ＋ Profil ekle: a step-by-step setup. First the user picks how the bot runs, then only that path's
// steps follow; when the last step is done the profile exists (and the bot is installed, if it had to be).
(() => {
  const CHOICES = [
    {
      key: 'here',
      icon: '🖥️',
      title: 'Botu bu bilgisayarda çalıştır',
      text: 'En kolayı. Bot, panel açıkken bu bilgisayarda çalışır; başka bir şey kurman gerekmez. Bilgisayar kapanınca bot da durur.',
      badge: 'En kolay'
    },
    {
      key: 'server',
      icon: '☁️',
      title: 'Botu kendi sunucuma kur',
      text: 'Bir VPS ya da Linux sunucu (Ubuntu/Debian). Panel her şeyi kurar ve bot 7/24 çalışır. SSH ile bağlanabilmen gerekir.',
      badge: 'Önerilen'
    },
    {
      key: 'existing',
      icon: '🔗',
      title: 'Sunucumda çalışan botu bağla',
      text: 'Bot zaten bir sunucuda kurulu ve çalışıyor Sadece bağlantı bilgilerini gir.'
    },
    {
      // Opens our Discord server (questions, help with the setup).
      key: 'community',
      icon: '💬',
      title: 'Discord sunucumuza katıl',
      text: 'Sorun ya da kafana takılan bir şey mi var? Discord sunucumuzda bize yaz; kurulumda da yardımcı oluruz.',
      badge: 'Yardım',
      link: true
    }
  ];

  const STEPS = {
    here: ['discord', 'name', 'install', 'invite'],
    server: ['discord', 'ssh', 'place', 'install', 'invite'],
    existing: ['ssh', 'botInfo', 'check']
  };
  const STEP_TITLES = {
    discord: 'Discord botu',
    name: 'Profil',
    ssh: 'Sunucu bağlantısı',
    place: 'Kurulum yeri',
    install: 'Kurulum',
    invite: 'Sunucuya davet',
    botInfo: 'Bot bilgileri',
    check: 'Kontrol'
  };

  let state = null;
  let root = null;

  const slug = text => (String(text ?? '').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '').replace(/_/g, '') || 'deerpanel').slice(0, 24);

  function open() {
    state = { choice: null, step: 0, values: {}, secrets: {}, discord: null, sshOk: false, installed: null, busy: false };
    root?.remove();
    root = el('div', { class: 'wizard-backdrop' }, el('div', { class: 'wizard' }));
    document.body.append(root);
    render();
  }
  App.openWizard = open;
  // Debugging / screenshots only: show a step with sample values (the real checks still run on finish).
  App.wizardJump = (choice, step, values = {}) => {
    open();
    Object.assign(state, { choice, step }, values);
    render();
  };

  function close() {
    root?.remove();
    root = null;
    state = null;
  }

  // ---------- layout ----------

  function render() {
    const steps = state.choice ? STEPS[state.choice] : [];
    const current = steps[state.step];
    const header = el(
      'div',
      { class: 'wizard-head' },
      el('div', {}, el('div', { class: 'wizard-kicker' }, 'Yeni profil'), el('h2', { class: 'wizard-title' }, state.choice ? STEP_TITLES[current] : 'Bot nerede çalışsın?')),
      el('button', { class: 'ghost small', onclick: () => !state.busy && close() }, '✕')
    );
    const progress = state.choice
      ? el('ol', { class: 'wizard-steps' }, steps.map((step, index) => el('li', { class: index < state.step ? 'done' : index === state.step ? 'current' : '' }, el('span', { class: 'num' }, index < state.step ? '✓' : index + 1), STEP_TITLES[step])))
      : null;
    const body = el('div', { class: 'wizard-body' }, state.choice ? STEP_VIEWS[current]() : choices());
    root.firstChild.replaceChildren(...[header, progress, body, footer(steps, current)].filter(Boolean));
  }

  function footer(steps, current) {
    if (!state.choice) return el('div', { class: 'wizard-foot' }, el('span', { class: 'muted small' }, 'Sonradan "Profilleri yönet" ile değiştirebilirsin.'));
    const nextLabel = { install: 'Devam', invite: 'Bitir ve aç', check: 'Kaydet ve aç' }[current] ?? 'Devam';
    return el(
      'div',
      { class: 'wizard-foot' },
      el('button', {
        class: 'ghost',
        disabled: state.busy || current === 'invite',
        onclick: () => {
          if (state.step === 0) state.choice = null;
          else state.step -= 1;
          render();
        }
      }, '← Geri'),
      el('button', { class: 'primary', id: 'wizard-next', disabled: state.busy || !canContinue(current), onclick: () => next(current) }, `${nextLabel} →`)
    );
  }

  function refreshFooter() {
    const button = root?.querySelector('#wizard-next');
    if (button) button.disabled = state.busy || !canContinue(state.choice ? STEPS[state.choice][state.step] : null);
  }

  function canContinue(step) {
    if (step === 'discord') return Boolean(state.discord && !state.discord.missingIntents.length);
    if (step === 'ssh') return state.sshOk;
    if (step === 'install') return Boolean(state.installed);
    if (step === 'name' || step === 'place' || step === 'botInfo') return Boolean(String(state.values.name ?? '').trim());
    return true;
  }

  async function next(step) {
    if (step === 'invite' || step === 'check') return finish();
    state.step += 1;
    render();
  }

  // ---------- choose ----------

  function choices() {
    return el(
      'div',
      { class: 'choice-grid' },
      CHOICES.map(choice =>
        el(
          'button',
          {
            id: `choice-${choice.key}`,
            class: `choice${choice.disabled ? ' disabled' : ''}`,
            disabled: choice.disabled,
            onclick: () => {
              if (choice.link) return window.panel.openCommunity();
              state.choice = choice.key;
              state.step = 0;
              render();
            }
          },
          el('span', { class: 'choice-icon' }, choice.icon),
          el('span', { class: 'choice-text' }, el('span', { class: 'choice-title' }, choice.title, choice.badge ? el('span', { class: `choice-badge${choice.disabled ? ' soon' : ''}` }, choice.badge) : null), el('span', { class: 'choice-desc' }, choice.text))
        )
      )
    );
  }

  // ---------- fields ----------

  const field = (label, hint, control) => el('label', {}, el('span', { class: 'field-label' }, label, hint ? el('span', { class: 'field-hint' }, hint) : null), control);
  function input(key, { type = 'text', placeholder = '', secret = false, hide = false, onInput } = {}) {
    const source = secret ? state.secrets : state.values;
    const control = el('input', { type, placeholder, value: source[key] ?? '', autocomplete: 'off' });
    control.addEventListener('input', () => {
      source[key] = control.value;
      onInput?.();
      refreshFooter();
    });
    return hide ? masked(control) : control;
  }
  const guide = (...items) => el('ol', { class: 'guide' }, items.map(item => el('li', {}, item)));

  // ---------- steps ----------

  const STEP_VIEWS = {
    discord() {
      const result = el('div', { class: 'token-result' });
      const showResult = () => {
        if (!state.discord) return result.replaceChildren();
        const { bot, missingIntents } = state.discord;
        result.replaceChildren(
          el('div', { class: 'bot-found' }, el('img', { src: bot.avatar, alt: '' }), el('div', {}, el('strong', {}, bot.name), el('div', { class: 'muted small' }, `@${bot.tag} · bot bulundu`))),
          missingIntents.length
            ? el('p', { class: 'warn-box' }, `⚠️ Developer Portal → Bot → Privileged Gateway Intents bölümünde şunları aç ve kaydet: ${missingIntents.join(', ')}. Sonra "Kontrol et"e tekrar bas.`)
            : el('p', { class: 'ok-box' }, '✅ Token geçerli, gereken izinler açık.')
        );
      };
      const check = async () => {
        result.replaceChildren(el('p', { class: 'muted' }, 'Discord\'a soruluyor…'));
        try {
          state.discord = await window.panel.setupCheckToken(state.secrets.token);
          state.values.name ||= state.discord.bot.name;
          showResult();
        } catch (error) {
          state.discord = null;
          result.replaceChildren(el('p', { class: 'warn-box' }, `❌ ${errorText(error)}`));
        }
        refreshFooter();
      };
      setTimeout(showResult);
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, 'Botun Discord\'daki hesabını oluşturalım. Bunu bir kez yapman yeterli.'),
        guide(
          el('span', {}, el('button', { class: 'link', onclick: () => window.panel.openPortal() }, 'Discord Developer Portal'), "'ı aç → sağ üstte ", el('b', {}, 'New Application'), ' → bir ad ver (botun adı olur).'),
          el('span', {}, 'Soldaki menüden ', el('b', {}, 'Bot'), ' sayfasına geç → ', el('b', {}, 'Reset Token'), ' → çıkan token\'ı kopyala.'),
          el('span', {}, 'Aynı sayfada ', el('b', {}, 'Privileged Gateway Intents'), ' altında ', el('b', {}, 'Server Members Intent'), ' ve ', el('b', {}, 'Message Content Intent'), "'i aç, ", el('b', {}, 'Save Changes'), '.'),
          el('span', {}, 'Token\'ı aşağı yapıştır ve ', el('b', {}, 'Kontrol et'), "'e bas.")
        ),
        field('Bot token', 'kimseyle paylaşma; sadece botun ayar dosyasına yazılır', el('div', { class: 'form-row' }, input('token', { secret: true, hide: true, onInput: () => (state.discord = null) }), el('button', { onclick: check }, 'Kontrol et'))),
        result,
        field('Discord kullanıcı ID\'n', 'isteğe bağlı · sahip komutları için (Ayarlar → Gelişmiş → Geliştirici Modu, sonra adına sağ tık → ID\'yi kopyala)', input('ownerId', { placeholder: 'ör. 175928847299117063' }))
      );
    },

    name() {
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, 'Bot bu bilgisayarda, panelin içinde çalışacak. Panel açıkken (tepside de olur) bot çevrimiçi olur.'),
        field('Profil adı', 'profil seçme ekranında görünür', input('name')),
        el('p', { class: 'muted small' }, '💡 7/24 çevrimiçi olmasını istiyorsan Ayarlar → Panel → "Windows açılınca başlat"ı aç ya da botu bir sunucuya kur.')
      );
    },

    ssh() {
      const result = el('p', { class: 'muted small test-result' });
      const test = async () => {
        result.textContent = 'Bağlanılıyor…';
        state.sshOk = false;
        refreshFooter();
        try {
          await window.panel.testProfile(sshProfile(), sshSecrets());
          state.sshOk = true;
          result.textContent = '✅ Sunucuya bağlanıldı.';
        } catch (error) {
          result.textContent = `❌ ${errorText(error)}`;
        }
        refreshFooter();
      };
      const reset = () => {
        state.sshOk = false;
        result.textContent = '';
      };
      state.values.port ??= 22;
      state.values.username ??= 'root';
      state.values.privateKeyPath ??= '~/.ssh/id_ed25519';
      const keyInput = input('privateKeyPath', { onInput: reset });
      const pick = el('button', {
        class: 'small',
        onclick: async () => {
          const file = await attempt(() => window.panel.pickKeyFile(), 'Dosya seçilemedi');
          if (file) {
            keyInput.value = file;
            state.values.privateKeyPath = file;
            reset();
          }
        }
      }, 'Seç…');
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, state.choice === 'server' ? 'Botun kurulacağı sunucuya nasıl bağlanılacağını yaz. Kullanıcı root ya da şifresiz sudo yetkisi olan biri olmalı.' : 'Botun çalıştığı sunucuya nasıl bağlanılacağını yaz.'),
        el('div', { class: 'form-grid' }, field('Sunucu adresi', 'IP ya da alan adı', input('host', { hide: true, onInput: reset })), field('SSH portu', '', input('port', { type: 'number', onInput: reset })), field('Kullanıcı', 'ör. root', input('username', { onInput: reset })), field('SSH anahtar dosyası', 'boş = şifre ile', el('div', { class: 'form-row' }, keyInput, pick)), field('Anahtar parolası', 'varsa', input('passphrase', { secret: true, hide: true, onInput: reset })), field('SSH şifresi', 'anahtar yoksa', input('password', { secret: true, hide: true, onInput: reset }))),
        el('div', { class: 'actions' }, el('button', { onclick: test }, '🔎 Bağlantıyı dene')),
        result,
        el('p', { class: 'muted small' }, '🔒 Şifre ve parola bu bilgisayarda Windows şifrelemesiyle saklanır.')
      );
    },

    place() {
      const name = state.values.name || 'Deer Panel';
      const id = slug(name);
      state.values.appDir ??= `/opt/${id}`;
      state.values.service ??= id;
      state.values.serviceUser ??= id;
      state.values.apiPort ??= 7410;
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, 'Sunucuda nereye ve hangi adla kurulacağını seç. Varsayılanlar çoğu zaman uygundur.'),
        el('div', { class: 'form-grid' }, field('Profil adı', 'seçme ekranında görünür', input('name')), field('Bot klasörü', 'sunucuda', input('appDir')), field('Servis adı', 'systemd', input('service')), field('Servis kullanıcısı', 'yoksa oluşturulur', input('serviceUser')), field('Yönetim API portu', 'sunucu içinde, dışarı açılmaz', input('apiPort', { type: 'number' }))),
        el('p', { class: 'muted small' }, 'Sunucuda Node.js yoksa (Ubuntu/Debian) otomatik kurulur. Gece yedeği servisi de eklenir.')
      );
    },

    install() {
      const log = el('div', { class: 'log small-log wizard-log' });
      const status = el('p', { class: 'muted small' });
      const add = line => {
        log.append(el('div', { class: `line ${/✖|hata|error/i.test(line) ? 'error' : line.startsWith('==>') ? 'panel' : line.startsWith('✔') || /çalışıyor/.test(line) ? 'ok' : ''}` }, line));
        log.scrollTop = log.scrollHeight;
      };
      App.wizardLog = add;
      const run = async () => {
        state.busy = true;
        // No re-render here: the log and this button must stay the same elements.
        button.disabled = true;
        root.querySelectorAll('.wizard-foot button, .wizard-head button').forEach(item => (item.disabled = true));
        try {
          const result = state.choice === 'here'
            ? await window.panel.setupInstallHere({ name: state.values.name, token: state.secrets.token, ownerId: state.values.ownerId })
            : await window.panel.setupInstallServer(serverProfile(), sshSecrets(), { token: state.secrets.token, ownerId: state.values.ownerId });
          state.installed = result;
          add('✔ Kurulum tamamlandı.');
        } catch (error) {
          add(`✖ ${errorText(error)}`);
        } finally {
          state.busy = false;
          refreshFooter();
          root?.querySelectorAll('.wizard-foot button, .wizard-head button').forEach(button => (button.disabled = false));
          if (!state.installed) button.disabled = false;
          button.textContent = state.installed ? '✔ Kuruldu' : '↻ Tekrar dene';
          button.disabled = Boolean(state.installed);
        }
      };
      const button = el('button', { class: 'primary', disabled: Boolean(state.installed), onclick: run }, state.installed ? '✔ Kuruldu' : state.choice === 'here' ? '⬇ Bu bilgisayara kur' : '⬆ Sunucuya kur');
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, state.choice === 'here' ? 'Bot bu bilgisayara kopyalanacak ve ayar dosyası oluşturulacak.' : `Bot sunucunda ${state.values.appDir} klasörüne kurulacak. Bu 1-3 dakika sürebilir.`),
        el('div', { class: 'actions' }, button),
        status,
        log
      );
    },

    invite() {
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, 'Son adım: botu Discord sunucuna ekle.'),
        guide(
          el('span', {}, el('b', {}, 'Botu sunucuma ekle'), "'ye bas; tarayıcıda Discord açılır."),
          el('span', {}, 'Sunucunu seç → ', el('b', {}, 'Devam'), ' → izinleri onayla.'),
          el('span', {}, 'Buraya dönüp ', el('b', {}, 'Bitir ve aç'), "'a bas.")
        ),
        el('div', { class: 'actions' }, el('button', { class: 'primary', onclick: () => window.panel.setupInvite(state.installed.applicationId) }, '🔗 Botu sunucuma ekle')),
        el('p', { class: 'muted small' }, 'İzinler botun tüm özellikleri için gerekenler (rol verme, mesaj yönetimi, moderasyon). Sunucunda "Rol ayarları"ndan botun rolünü vereceği rollerin üstüne taşımayı unutma.')
      );
    },

    botInfo() {
      state.values.appDir ??= '/opt/deerpanel';
      state.values.envPath ??= '/opt/deerpanel/.env';
      state.values.service ??= 'deerpanel';
      state.values.serviceUser ??= 'deerpanel';
      state.values.backupService ??= 'deerpanel-backup.service';
      state.values.apiPort ??= 7410;
      return el(
        'div',
        { class: 'form' },
        el('p', { class: 'lead' }, 'Bot sunucuda nerede ve hangi adla çalışıyor? Panelle kurulduysa varsayılanlar doğrudur.'),
        el('div', { class: 'form-grid' }, field('Profil adı', 'seçme ekranında görünür', input('name')), field('Bot klasörü', '', input('appDir')), field('.env yolu', '', input('envPath')), field('Servis adı', 'systemd', input('service')), field('Servis kullanıcısı', '', input('serviceUser')), field('Yedek servisi', '', input('backupService')), field('Yönetim API portu', '', input('apiPort', { type: 'number' })))
      );
    },

    check() {
      const result = el('p', { class: 'muted' }, 'Kontrol ediliyor…');
      (async () => {
        try {
          const test = await window.panel.testProfile(existingProfile(), sshSecrets());
          result.textContent = `✅ Bağlantı çalışıyor · bot servisi: ${test.service}${test.api ? ' · yönetim API anahtarı bulundu' : ' · ⚠️ .env içinde ADMIN_API_TOKEN bulunamadı (panel bazı bölümleri açamaz)'}`;
        } catch (error) {
          result.textContent = `❌ ${errorText(error)} — "Geri" ile bilgileri düzeltebilirsin.`;
        }
      })();
      return el('div', { class: 'form' }, el('p', { class: 'lead' }, 'Bilgiler kontrol ediliyor.'), result);
    }
  };

  // ---------- profile data ----------

  const sshSecrets = () => ({ password: state.secrets.password || undefined, passphrase: state.secrets.passphrase || undefined });
  const sshProfile = () => ({
    name: state.values.name || 'Yeni bot',
    host: state.values.host,
    port: state.values.port,
    username: state.values.username,
    privateKeyPath: state.values.privateKeyPath,
    // The connection test only needs valid placeholders for the bot part.
    appDir: state.values.appDir || '/opt/deerpanel',
    envPath: state.values.envPath || '/opt/deerpanel/.env',
    service: state.values.service || 'deerpanel',
    serviceUser: state.values.serviceUser || 'deerpanel',
    backupService: state.values.backupService || 'deerpanel-backup.service',
    apiPort: state.values.apiPort || 7410
  });
  const serverProfile = () => ({
    ...sshProfile(),
    name: state.values.name,
    envPath: `${state.values.appDir}/.env`,
    backupService: `${state.values.service}-backup.service`
  });
  const existingProfile = () => ({ ...sshProfile(), name: state.values.name });

  async function finish() {
    state.busy = true;
    refreshFooter();
    try {
      let id = state.installed?.id;
      if (state.choice === 'existing') {
        const saved = await window.panel.saveProfile(existingProfile(), sshSecrets());
        id = saved.id;
      }
      close();
      toast('Profil oluşturuldu. Bağlanılıyor…');
      await App.chooseProfileById(id);
    } catch (error) {
      state.busy = false;
      refreshFooter();
      toast(`Kaydedilemedi: ${errorText(error)}`, true);
    }
  }

  window.panel.onSetupLine(line => App.wizardLog?.(line));
})();
