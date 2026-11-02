// 🔑 Permissions: which roles and members may use which staff features of the bot. A rule is for a role
// (everyone with it) or one member; a member rule can replace the member's role rules ("only").
// Everything is saved at once with "Kaydet".
(() => {
  const FEATURES = {
    warn: ['⚠️ Uyarılar', '/warn — uyarı ver, listele, sil'],
    members: ['🪪 Üye bilgisi ve notlar', '/info, /note'],
    roles: ['🎭 Rol paneli', '/roles'],
    faq: ['❓ SSS yönetimi', '/faq-manage'],
    showcase: ['🐾 Vitrin yönetimi', '/showcase'],
    setup: ['⚙️ Sunucu kurulumu', '/setup, /welcome, /autorole, /verify, /modlog, /stats'],
    backup: ['💾 Yedek', '/backup — tüm bot verisinin kopyası']
  };

  let data = null;
  let rules = [];
  let trustDiscord = true;
  let dirty = false;

  async function load() {
    const result = await attempt(() => api('GET', '/api/permissions'), 'Yetkiler yüklenemedi');
    if (!result) return;
    data = result;
    rules = result.rules.map(rule => ({ ...rule, features: [...rule.features] }));
    trustDiscord = result.trustDiscord;
    dirty = false;
    render();
  }

  const changed = () => {
    dirty = true;
    $('perm-save').disabled = false;
    $('perm-dirty').hidden = false;
  };

  function render() {
    const owners = [el('li', {}, '👑 ', el('b', {}, data.owner.name ?? data.owner.id), ' — sunucu sahibi')];
    if (data.botOwner) owners.push(el('li', {}, '🤖 ', el('b', {}, data.botOwner.name ?? data.botOwner.id), ' — bot sahibi (.env OWNER_IDS)'));
    $('perm-basics').replaceChildren(
      el('h2', {}, 'Temel kurallar'),
      el('ul', { class: 'perm-owners' }, owners),
      el('p', { class: 'muted small' }, 'Sahipler her şeyi her zaman kullanabilir; aşağıdaki kurallar onları etkilemez.'),
      el(
        'label',
        { class: 'check perm-trust' },
        el('input', {
          type: 'checkbox',
          checked: trustDiscord,
          onchange: event => {
            trustDiscord = event.target.checked;
            changed();
          }
        }),
        el('span', {}, el('b', {}, 'Discord izni olanlar da kullanabilsin'), el('span', { class: 'muted small block' }, 'Ör. "Sunucuyu Yönet" izni olan biri /setup\'ı, "Üyelere Zaman Aşımı Uygula" izni olan /warn\'ı kullanabilir. Kapatırsan sadece aşağıda yetki verdiklerin kullanır.'))
      )
    );

    const roleRules = rules.filter(rule => rule.type === 'role');
    const userRules = rules.filter(rule => rule.type === 'user');
    $('perm-rules').replaceChildren(
      section('🎭 Rollere göre', 'O role sahip herkes seçilen özellikleri kullanabilir.', roleRules, '＋ Rol ekle', addRole),
      section('👤 Kişiye özel', 'Rolünden bağımsız olarak tek bir kişiye yetki ver. İstersen kişinin rollerinden gelen yetkileri tamamen yok sayabilirsin.', userRules, '＋ Kişi ekle', addUser)
    );
    $('perm-save').disabled = !dirty;
    $('perm-dirty').hidden = !dirty;
  }

  function section(title, hint, list, addLabel, onAdd) {
    return el(
      'article',
      { class: 'card perm-section' },
      el('div', { class: 'perm-section-head' }, el('div', {}, el('h2', {}, title), el('p', { class: 'muted small' }, hint)), el('button', { class: 'small', onclick: onAdd }, addLabel)),
      list.length ? el('div', { class: 'perm-list' }, list.map(ruleCard)) : el('p', { class: 'muted empty' }, 'Henüz kural yok.')
    );
  }

  function ruleCard(rule) {
    const who =
      rule.type === 'role'
        ? el('div', { class: 'perm-who' }, roleDot(rule.color), el('b', {}, `@${rule.name ?? 'silinmiş rol'}`), rule.missing ? el('span', { class: 'badge warn' }, 'rol silinmiş') : el('span', { class: 'muted small' }, `${data.roles.find(role => role.id === rule.id)?.members ?? 0} üye`))
        : el('div', { class: 'perm-who' }, rule.avatar ? el('img', { class: 'perm-avatar', src: rule.avatar, alt: '' }) : null, el('b', {}, rule.name ?? rule.id), rule.username ? el('span', { class: 'muted small' }, `@${rule.username}`) : null, rule.missing ? el('span', { class: 'badge warn' }, 'sunucuda değil') : null);
    const all = rule.features.length === Object.keys(FEATURES).length;
    return el(
      'div',
      { class: 'perm-rule' },
      el(
        'div',
        { class: 'perm-rule-head' },
        who,
        el(
          'div',
          { class: 'perm-rule-actions' },
          el('button', {
            class: 'small ghost',
            onclick: () => {
              rule.features = all ? [] : Object.keys(FEATURES);
              changed();
              render();
            }
          }, all ? 'Hiçbiri' : 'Tümü'),
          el('button', {
            class: 'small ghost danger-text',
            title: 'Kuralı kaldır',
            onclick: () => {
              rules = rules.filter(item => item !== rule);
              changed();
              render();
            }
          }, '🗑')
        )
      ),
      rule.type === 'user'
        ? el(
            'label',
            { class: 'check perm-only' },
            el('input', {
              type: 'checkbox',
              checked: Boolean(rule.only),
              onchange: event => {
                rule.only = event.target.checked;
                changed();
              }
            }),
            'Rollerinden ve Discord izinlerinden bağımsız: bu kişi sadece burada seçilenleri kullanabilsin'
          )
        : null,
      el(
        'div',
        { class: 'perm-features' },
        Object.entries(FEATURES).map(([key, [label, detail]]) =>
          el(
            'label',
            { class: `perm-feature${rule.features.includes(key) ? ' on' : ''}` },
            el('input', {
              type: 'checkbox',
              checked: rule.features.includes(key),
              onchange: event => {
                rule.features = event.target.checked ? [...rule.features, key] : rule.features.filter(item => item !== key);
                event.target.closest('.perm-feature').classList.toggle('on', event.target.checked);
                changed();
              }
            }),
            el('span', {}, el('b', {}, label), el('span', { class: 'muted small block' }, detail))
          )
        )
      )
    );
  }

  const roleDot = color => {
    const dot = el('span', { class: 'perm-dot' });
    if (color) dot.style.background = color;
    return dot;
  };

  async function addRole() {
    const taken = new Set(rules.filter(rule => rule.type === 'role').map(rule => rule.id));
    const choices = data.roles.filter(role => !taken.has(role.id));
    if (!choices.length) return toast('Eklenecek başka rol yok.');
    const select = el('select', {}, optionList(choices, { empty: '— Rol seç —', label: role => `@${role.name} (${role.members} üye)` }));
    const result = await openModal('Rol ekle', el('div', { class: 'form' }, el('label', {}, 'Rol', select)), [
      { label: 'Vazgeç', class: 'ghost', value: null },
      { label: 'Ekle', class: 'primary', value: 'add' }
    ], value => (value === 'add' && !select.value ? (toast('Bir rol seç.', true), false) : true));
    if (result !== 'add') return;
    const role = choices.find(item => item.id === select.value);
    rules.push({ type: 'role', id: role.id, name: role.name, color: role.color, features: [] });
    changed();
    render();
  }

  async function addUser() {
    const taken = new Set(rules.filter(rule => rule.type === 'user').map(rule => rule.id));
    const search = el('input', { placeholder: 'İsim veya ID ara…', autocomplete: 'off' });
    const results = el('ul', { class: 'member-list picker perm-picker' });
    let picked = null; // the chosen member
    let timer;
    const find = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const query = search.value.trim();
        if (query.length < 2) return results.replaceChildren(el('li', { class: 'muted small' }, 'En az 2 harf…'));
        const members = await attempt(() => api('GET', `/api/members?q=${encodeURIComponent(query)}`), 'Aranamadı');
        if (!members) return;
        const people = members.filter(member => !member.bot && !taken.has(member.id)).slice(0, 12);
        results.replaceChildren(
          ...(people.length
            ? people.map(member =>
                el('li', {
                  class: picked?.id === member.id ? 'active' : '',
                  onclick: event => {
                    picked = member;
                    results.querySelectorAll('li').forEach(item => item.classList.remove('active'));
                    event.currentTarget.classList.add('active');
                  }
                }, el('img', { class: 'avatar', src: member.avatar, alt: '' }), el('span', {}, member.displayName, ' ', el('span', { class: 'muted small' }, `@${member.username}`)))
              )
            : [el('li', { class: 'muted small' }, 'Kimse bulunamadı')])
        );
      }, 250);
    };
    search.addEventListener('input', find);
    results.replaceChildren(el('li', { class: 'muted small' }, 'En az 2 harf…'));
    setTimeout(() => search.focus(), 50);
    const result = await openModal('Kişi ekle', el('div', { class: 'form' }, search, results), [
      { label: 'Vazgeç', class: 'ghost', value: null },
      { label: 'Ekle', class: 'primary', value: 'add' }
    ], value => (value === 'add' && !picked ? (toast('Listeden bir kişi seç.', true), false) : true));
    if (result !== 'add') return;
    rules.push({ type: 'user', id: picked.id, name: picked.displayName, username: picked.username, avatar: picked.avatar, features: [], only: false });
    changed();
    render();
  }

  $('perm-save').addEventListener('click', async () => {
    const empty = rules.filter(rule => !rule.features.length && !(rule.type === 'user' && rule.only));
    if (empty.length) return toast(`${empty.length} kuralda hiç özellik seçilmedi — en az birini seç ya da kuralı kaldır.`, true);
    const body = { trustDiscord, rules: rules.map(({ type, id, features, only }) => ({ type, id, features, only: Boolean(only) })) };
    const result = await attempt(() => api('PUT', '/api/permissions', body), 'Kaydedilemedi');
    if (!result) return;
    data = result;
    rules = result.rules.map(rule => ({ ...rule, features: [...rule.features] }));
    trustDiscord = result.trustDiscord;
    dirty = false;
    render();
    toast(result.commandsUpdated ? 'Yetkiler kaydedildi. Discord\'daki komut listesi de güncellendi.' : 'Yetkiler kaydedildi.');
  });
  $('perm-reset').addEventListener('click', () => load());

  App.registerView('permissions', { show: load });
})();
