// 📝 Content: rules editor, role panel editor, messages and polls sent as the bot.
(() => {
  let tab = 'rules';

  for (const button of document.querySelectorAll('#content-tabs .tab')) {
    button.addEventListener('click', () => {
      tab = button.dataset.tab;
      for (const other of document.querySelectorAll('#content-tabs .tab')) other.classList.toggle('active', other === button);
      show();
    });
  }

  const field = (label, control, hint) => el('label', {}, label, hint && el('span', { class: 'muted' }, ` ${hint}`), control);

  // ---------- rules ----------

  async function rulesTab() {
    const rules = await attempt(() => api('GET', '/api/rules'), 'Kurallar yüklenemedi');
    if (!rules) return el('p', { class: 'muted' }, 'Kurallar yüklenemedi.');
    return el(
      'div',
      { class: 'stack' },
      el('p', { class: 'muted' }, '#rules kanalındaki bot mesajları yerinde düzenlenir — sıra ve doğrulama butonu bozulmaz. Değişikliği #announcements\'ta duyurmayı unutma.'),
      ...rules.map((rule, index) => {
        const title = el('input', { maxlength: 256, value: rule.title });
        const description = el('textarea', { rows: 14, maxlength: 4096, value: rule.description });
        const fieldRows = rule.fields.map(item => ({ name: el('input', { maxlength: 256, value: item.name }), value: el('textarea', { rows: 3, maxlength: 1024, value: item.value }) }));
        const save = el('button', { class: 'primary' }, '💾 Kaydet');
        save.addEventListener('click', async () => {
          if (!(await confirmModal(`${index + 1}. mesaj güncellensin mi?`, 'Discord\'daki kural mesajı hemen değişir.', 'Kaydet'))) return;
          const result = await attempt(
            () => api('PUT', `/api/rules/${rule.messageId}`, { title: title.value, description: description.value, fields: fieldRows.map(row => ({ name: row.name.value, value: row.value.value })) }),
            'Kaydedilemedi'
          );
          if (result) toast(`${index + 1}. kural mesajı güncellendi.`);
        });
        return el(
          'article',
          { class: 'card form' },
          el('h2', {}, `Mesaj ${index + 1}`, el('button', { class: 'link small', onclick: () => window.open(rule.url) }, "  Discord'da aç ↗")),
          field('Başlık', title, '(boş bırakılabilir)'),
          field('Metin', description, '(Markdown: **kalın**, • madde)'),
          ...fieldRows.map((row, fieldIndex) => el('div', { class: 'field-box' }, field(`Alan ${fieldIndex + 1} başlığı`, row.name), field('Alan metni', row.value))),
          el('div', { class: 'actions' }, save)
        );
      })
    );
  }

  // ---------- role panel ----------

  async function rolesTab() {
    const [panel, roles] = (await attempt(async () => [await api('GET', '/api/rolepanel'), await getRoles(true)], 'Rol paneli yüklenemedi')) ?? [];
    if (!panel) return el('p', { class: 'muted' }, 'Yüklenemedi.');

    const update = async (method, path, body, done) => {
      const result = await attempt(() => api(method, path, body), 'Kaydedilemedi');
      if (result) {
        toast(done);
        show();
      }
    };
    const move = (index, delta) => {
      const ids = panel.roles.map(item => item.roleId);
      [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
      update('POST', '/api/rolepanel/order', { roleIds: ids }, 'Sıra değişti, panel güncellendi.');
    };

    const roleSelect = el('select', {}, optionList(roles.filter(role => !panel.roles.some(item => item.roleId === role.id)), { empty: '— Rol seç —', label: role => `@${role.name}` }));
    const emoji = el('input', { maxlength: 64, placeholder: '🪟', class: 'emoji-input' });
    const label = el('input', { maxlength: 80, placeholder: 'Buton yazısı (boş = rol adı)' });
    const description = el('input', { maxlength: 100, placeholder: 'Kısa açıklama (isteğe bağlı)' });
    const add = el('button', { class: 'primary' }, '＋ Ekle');
    add.addEventListener('click', () => {
      if (!roleSelect.value) return toast('Bir rol seç.', true);
      update('POST', '/api/rolepanel/roles', { roleId: roleSelect.value, emoji: emoji.value, label: label.value, description: description.value }, 'Rol eklendi, panel güncellendi.');
    });

    return el(
      'div',
      { class: 'grid two align-start' },
      el(
        'article',
        { class: 'card' },
        el('h2', {}, `Paneldeki roller (${panel.roles.length}/${panel.max})`),
        panel.panel ? el('p', { class: 'muted small' }, 'Değişiklikler Discord\'daki panele hemen yansır. ', el('button', { class: 'link small', onclick: () => window.open(panel.panel.url) }, 'Paneli aç ↗')) : el('p', { class: 'muted small' }, 'Panel henüz gönderilmemiş (Discord\'da /roles panel).'),
        el(
          'ul',
          { class: 'entries' },
          panel.roles.map((item, index) =>
            el(
              'li',
              {},
              el('div', { class: 'body' }, el('div', { class: 'strong' }, `${item.emoji ?? '•'} ${item.label}`), el('div', { class: 'meta' }, `@${item.roleName ?? 'silinmiş rol'}${item.description ? ` · ${item.description}` : ''}${item.problem ? ` · ⚠️ ${item.problem}` : ''}`)),
              el(
                'div',
                { class: 'row-actions' },
                el('button', { class: 'small', disabled: index === 0, onclick: () => move(index, -1) }, '↑'),
                el('button', { class: 'small', disabled: index === panel.roles.length - 1, onclick: () => move(index, 1) }, '↓'),
                el('button', {
                  class: 'small danger',
                  onclick: async () => {
                    if (await confirmModal('Rol panelden kaldırılsın mı?', `${item.label} — üyelerdeki rol silinmez.`, 'Kaldır', true)) {
                      update('DELETE', `/api/rolepanel/roles/${item.roleId}`, null, 'Rol kaldırıldı.');
                    }
                  }
                }, 'Kaldır')
              )
            )
          )
        )
      ),
      el('article', { class: 'card form' }, el('h2', {}, 'Rol ekle / güncelle'), field('Rol', roleSelect), el('div', { class: 'form-row' }, field('Emoji', emoji), field('Yazı', label)), field('Açıklama', description), el('div', { class: 'actions' }, add))
    );
  }

  // ---------- message as the bot ----------

  async function sayTab() {
    const channels = (await attempt(() => getChannels(), 'Kanallar yüklenemedi')) ?? [];
    const channel = el('select', {}, optionList(channels, { label: channelLabel }));
    const content = el('textarea', { rows: 4, maxlength: 2000, placeholder: 'Mesaj (kimse etiketlenmez)' });
    const embedTitle = el('input', { maxlength: 256, placeholder: 'Embed başlığı (isteğe bağlı)' });
    const embedText = el('textarea', { rows: 5, maxlength: 4000, placeholder: 'Embed metni (isteğe bağlı)' });
    const send = el('button', { class: 'primary' }, '💬 Bot olarak gönder');
    send.addEventListener('click', async () => {
      const target = channels.find(item => item.id === channel.value);
      if (!(await confirmModal('Mesaj gönderilsin mi?', `${channelLabel(target)} kanalına bot olarak gönderilecek.`, 'Gönder'))) return;
      const result = await attempt(() => api('POST', '/api/say', { channelId: channel.value, content: content.value, embedTitle: embedTitle.value, embedText: embedText.value }), 'Gönderilemedi');
      if (result) {
        toast('Mesaj gönderildi.');
        for (const input of [content, embedTitle, embedText]) input.value = '';
      }
    });
    return el('article', { class: 'card form narrow' }, field('Kanal', channel), field('Mesaj', content), field('Embed başlığı', embedTitle), field('Embed metni', embedText), el('div', { class: 'actions' }, send));
  }

  // ---------- poll ----------

  async function pollTab() {
    const channels = (await attempt(() => getChannels(), 'Kanallar yüklenemedi')) ?? [];
    const channel = el('select', {}, optionList([...channels].sort((a, b) => b.announcement - a.announcement), { label: channelLabel }));
    const question = el('input', { maxlength: 300, placeholder: 'Sıradaki özellik hangisi olsun?' });
    const answers = el('div', { class: 'stack' });
    const addAnswer = (value = '') => {
      if (answers.children.length >= 10) return toast('En fazla 10 seçenek.', true);
      answers.append(el('input', { maxlength: 55, value, placeholder: `Seçenek ${answers.children.length + 1}` }));
    };
    addAnswer();
    addAnswer();
    const hours = el('select', {}, [[1, '1 saat'], [24, '1 gün'], [72, '3 gün'], [168, '1 hafta'], [336, '2 hafta']].map(([value, label]) => el('option', { value, selected: value === 24 }, label)));
    const multiple = el('input', { type: 'checkbox' });
    const send = el('button', { class: 'primary' }, '📊 Anketi gönder');
    send.addEventListener('click', async () => {
      const options = [...answers.children].map(input => input.value.trim()).filter(Boolean);
      if (!(await confirmModal('Anket gönderilsin mi?', `${question.value} — ${options.length} seçenek`, 'Gönder'))) return;
      const result = await attempt(() => api('POST', '/api/poll', { channelId: channel.value, question: question.value, answers: options, hours: Number(hours.value), multiple: multiple.checked }), 'Gönderilemedi');
      if (result) toast('Anket gönderildi.');
    });
    return el(
      'article',
      { class: 'card form narrow' },
      field('Kanal', channel),
      field('Soru', question),
      el('label', {}, 'Seçenekler', answers),
      el('div', { class: 'actions' }, el('button', { type: 'button', onclick: () => addAnswer() }, '＋ Seçenek')),
      field('Süre', hours),
      el('label', { class: 'check' }, multiple, 'Birden fazla seçime izin ver'),
      el('div', { class: 'actions' }, send)
    );
  }

  const TABS = { rules: rulesTab, roles: rolesTab, say: sayTab, poll: pollTab };

  async function show() {
    $('content-body').replaceChildren(el('p', { class: 'muted' }, 'Yükleniyor…'));
    $('content-body').replaceChildren(await TABS[tab]());
  }

  App.registerView('content', { show });
})();
