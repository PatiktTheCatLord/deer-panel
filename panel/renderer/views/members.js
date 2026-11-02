// 👥 Members: search, profile card, warnings and notes.
(() => {
  let selected = null;
  let searchTimer;

  $('member-filter').addEventListener('change', load);
  $('member-export').addEventListener('click', async () => {
    const rows = await attempt(() => api('GET', '/api/export/members'), 'Dışa aktarılamadı');
    if (!rows) return;
    const saved = await attempt(() => window.panel.exportCsv(`uyeler-${new Date().toISOString().slice(0, 10)}.csv`, rows), 'Kaydedilemedi');
    if (saved) toast(`${rows.length} üye kaydedildi: ${saved}`);
  });

  $('member-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  });

  async function load() {
    const query = $('member-search').value.trim();
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if ($('member-filter').value) params.set('filter', $('member-filter').value);
      const members = await api('GET', `/api/members${params.size ? `?${params}` : ''}`);
      $('member-list').replaceChildren(
        ...members.map(member =>
          el(
            'li',
            { class: member.id === selected ? 'active' : '', onclick: () => select(member.id) },
            el('img', { src: member.avatar, alt: '' }),
            el('span', {}, member.displayName),
            member.bot && el('span', { class: 'bot-tag' }, 'BOT')
          )
        )
      );
      if (!members.length) $('member-list').replaceChildren(el('li', { class: 'muted' }, 'Kimse bulunamadı'));
    } catch (error) {
      $('member-list').replaceChildren(el('li', { class: 'muted' }, `Yüklenemedi: ${errorText(error)}`));
    }
  }

  async function select(id) {
    selected = id;
    load();
    $('profile').replaceChildren(el('p', { class: 'muted empty' }, 'Yükleniyor…'));
    try {
      render(await api('GET', `/api/members/${id}`));
    } catch (error) {
      $('profile').replaceChildren(el('p', { class: 'muted empty' }, `Profil yüklenemedi: ${errorText(error)}`));
    }
  }

  const fact = (label, value) => el('div', {}, el('dt', {}, label), el('dd', {}, value));

  function entryList(items, renderItem) {
    return el('ul', { class: 'entries' }, items.map(renderItem));
  }

  function deleteButton(label, confirmText, path, doneText, memberId) {
    return el('button', {
      class: 'small ghost',
      onclick: async () => {
        if (!(await confirmModal(label, confirmText, 'Sil', true))) return;
        if (await attempt(() => api('DELETE', path), 'Silinemedi')) {
          toast(doneText);
          select(memberId);
        }
      }
    }, 'Sil');
  }

  // Timeout / kick / ban / manual verification. Nothing happens without a confirmation.
  function moderationSection(p) {
    if (p.bot || p.isOwner) return el('div');
    const reasonInput = placeholder => el('textarea', { rows: 2, maxlength: 400, placeholder });
    const run = async (title, body, label, action, done) => {
      const result = await openModal(title, body, [
        { label: 'Vazgeç', class: 'ghost', value: false },
        { label, class: 'danger', value: true }
      ], async value => {
        if (!value) return true;
        const ok = await attempt(action, 'İşlem başarısız');
        if (!ok) return false;
        toast(done);
        return true;
      });
      if (result) select(p.id);
    };

    const timeout = () => {
      const duration = el('select', {}, [[10, '10 dakika'], [60, '1 saat'], [360, '6 saat'], [1440, '1 gün'], [10080, '1 hafta']].map(([value, label]) => el('option', { value }, label)));
      const reason = reasonInput('Sebep (denetim kaydında ve #mod-log\'da görünür)');
      run(`${p.displayName} — timeout`, el('div', { class: 'form' }, el('label', {}, 'Süre', duration), el('label', {}, 'Sebep', reason)), '🔇 Timeout', () => {
        if (!reason.value.trim()) throw new Error('Sebep yaz');
        return api('POST', `/api/members/${p.id}/timeout`, { minutes: Number(duration.value), reason: reason.value });
      }, 'Timeout uygulandı.');
    };
    const kick = () => {
      const reason = reasonInput('Sebep');
      run(`${p.displayName} sunucudan atılsın mı?`, el('div', { class: 'form' }, el('p', { class: 'muted' }, 'Tekrar katılabilir.'), reason), '👢 Kick', () => {
        if (!reason.value.trim()) throw new Error('Sebep yaz');
        return api('POST', `/api/members/${p.id}/kick`, { reason: reason.value });
      }, 'Üye atıldı.');
    };
    const ban = () => {
      const reason = reasonInput('Sebep');
      const days = el('select', {}, [[0, 'Mesajları silme'], [1, 'Son 1 günün mesajlarını sil'], [7, 'Son 7 günün mesajlarını sil']].map(([value, label]) => el('option', { value }, label)));
      run(`${p.displayName} banlansın mı?`, el('div', { class: 'form' }, reason, days), '🔨 Ban', () => {
        if (!reason.value.trim()) throw new Error('Sebep yaz');
        return api('POST', `/api/members/${p.id}/ban`, { reason: reason.value, deleteMessageDays: Number(days.value) });
      }, 'Üye banlandı.');
    };
    const untimeout = async () => {
      if (!(await confirmModal('Timeout kaldırılsın mı?', p.displayName, 'Kaldır'))) return;
      if (await attempt(() => api('DELETE', `/api/members/${p.id}/timeout`), 'Kaldırılamadı')) {
        toast('Timeout kaldırıldı.');
        select(p.id);
      }
    };
    const verify = async () => {
      if (!(await confirmModal('Elle doğrulansın mı?', `${p.displayName} doğrulama rolünü alır ve sunucunun tamamını görür.`, 'Doğrula'))) return;
      const result = await attempt(() => api('POST', `/api/members/${p.id}/verify`), 'Doğrulanamadı');
      if (result) {
        toast(result.alreadyVerified ? 'Zaten doğrulanmış.' : 'Doğrulandı.');
        select(p.id);
      }
    };

    return el(
      'div',
      { class: 'section mod-actions' },
      el('h3', {}, '🛡️ Moderasyon'),
      el(
        'div',
        { class: 'actions' },
        p.inServer && el('button', { onclick: verify }, '✅ Elle doğrula'),
        p.inServer && (p.timeoutUntil ? el('button', { onclick: untimeout }, '🔊 Timeout kaldır') : el('button', { onclick: timeout }, '🔇 Timeout')),
        p.inServer && el('button', { onclick: kick }, '👢 Kick'),
        el('button', { class: 'danger', onclick: ban }, '🔨 Ban')
      )
    );
  }

  function render(p) {
    const policy = p.warningPolicy;
    const activeCount = p.warnings.filter(warning => warning.active).length;
    const canWarn = p.inServer && !p.bot && !p.isOwner;

    const head = el(
      'div',
      { class: 'profile-head' },
      el('img', { src: p.avatar, alt: '' }),
      el(
        'div',
        {},
        el('div', { class: 'name' }, p.displayName),
        el('div', { class: 'muted' }, `@${p.username} · ${p.id}`),
        el(
          'div',
          { class: 'chips' },
          el('span', { class: `badge ${p.inServer ? 'ok' : 'bad'}` }, p.inServer ? 'Sunucuda' : 'Sunucuda değil'),
          p.timeoutUntil && el('span', { class: 'badge bad' }, `Timeout · ${formatDate(p.timeoutUntil)}`),
          p.isOwner && el('span', { class: 'badge warn' }, 'Sunucu sahibi'),
          p.bot && el('span', { class: 'badge' }, 'Bot')
        )
      )
    );

    const info = el(
      'div',
      { class: 'section' },
      el('h3', {}, '🪪 Hesap'),
      el(
        'dl',
        { class: 'facts' },
        fact('Hesap açılışı', formatDate(p.createdAt)),
        fact('Sunucuya katılış', formatDate(p.joinedAt)),
        p.activity && p.activity.joins > 1 && fact('Giriş / çıkış', `${p.activity.joins} / ${p.activity.leaves}`)
      ),
      p.roles.length > 0 &&
        el('div', { class: 'chips' }, p.roles.map(role => el('span', { class: 'chip' }, el('span', { class: 'swatch', style: `background:${role.color === '#000000' ? '#99aab5' : role.color}` }), role.name)))
    );

    const a = p.activity;
    const activity = el(
      'div',
      { class: 'section' },
      el('h3', {}, '📈 Aktivite'),
      a
        ? el(
            'dl',
            { class: 'facts' },
            fact('Mesaj (7g / 30g / toplam)', `${a.messages7} / ${a.messages30} / ${a.messagesTotal}`),
            fact('Ses (7g / 30g / toplam)', `${formatMinutes(a.voice7)} / ${formatMinutes(a.voice30)} / ${formatMinutes(a.voiceTotal)}`),
            fact('Son mesaj', formatDate(a.lastMessageAt))
          )
        : el('p', { class: 'muted' }, 'Henüz aktivite kaydı yok.')
    );

    // Warnings
    const reason = el('textarea', { placeholder: canWarn ? 'Uyarı sebebi (üyeye DM olarak gider)…' : 'Bu kişi uyarılamaz', maxlength: 500, disabled: !canWarn });
    const warnButton = el('button', { class: 'danger', disabled: !canWarn }, '⚠️ Uyar');
    warnButton.addEventListener('click', async () => {
      const text = reason.value.trim();
      if (!text) return toast('Bir sebep yaz.', true);
      if (!(await confirmModal(`${p.displayName} uyarılsın mı?`, `Sebep: ${text}`, 'Uyar', true))) return;
      warnButton.disabled = true;
      const result = await attempt(() => api('POST', `/api/members/${p.id}/warnings`, { reason: text }), 'Uyarı eklenemedi');
      if (!result) return (warnButton.disabled = false);
      const extra = [result.dmSent ? 'DM gönderildi' : 'DM gönderilemedi', result.alerted && '🚨 uyarı seviyesine ulaştı, yetkililere bildirildi'].filter(Boolean);
      toast(`Uyarı #${result.warning.id} eklendi (${result.active} aktif) · ${extra.join(' · ')}`, Boolean(result.alerted));
      select(p.id);
    });

    const warnings = el(
      'div',
      { class: 'section' },
      el('h3', {}, `⚠️ Uyarılar — ${activeCount} aktif (son ${policy.windowDays} gün, ${policy.alertThreshold}'de yetkililere bildirilir) · ${p.warnings.length} toplam`),
      el('div', { class: 'form-row' }, reason, warnButton),
      entryList(p.warnings, warning =>
        el(
          'li',
          { class: warning.active ? '' : 'inactive' },
          el('div', { class: 'body' }, el('div', {}, warning.reason), el('div', { class: 'meta' }, `#${warning.id} · ${formatDate(warning.createdAt)}${warning.via ? ` · ${warning.via}` : ''}${warning.active ? '' : ' · süresi doldu'}`)),
          deleteButton(`Uyarı #${warning.id} silinsin mi?`, warning.reason, `/api/members/${p.id}/warnings/${warning.id}`, `Uyarı #${warning.id} silindi.`, p.id)
        )
      )
    );

    // Notes
    const noteText = el('textarea', { placeholder: 'Özel not (sadece sen görürsün)…', maxlength: 500 });
    const noteButton = el('button', { class: 'primary' }, '📝 Not ekle');
    noteButton.addEventListener('click', async () => {
      const text = noteText.value.trim();
      if (!text) return toast('Not boş olamaz.', true);
      noteButton.disabled = true;
      const result = await attempt(() => api('POST', `/api/members/${p.id}/notes`, { text }), 'Not eklenemedi');
      if (!result) return (noteButton.disabled = false);
      toast(`Not #${result.id} eklendi.`);
      select(p.id);
    });

    const notes = el(
      'div',
      { class: 'section' },
      el('h3', {}, `📝 Notlar — ${p.notes.length}`),
      el('div', { class: 'form-row' }, noteText, noteButton),
      entryList(p.notes, note =>
        el(
          'li',
          {},
          el('div', { class: 'body' }, el('div', {}, note.text), el('div', { class: 'meta' }, `#${note.id} · ${formatDate(note.createdAt)}`)),
          deleteButton(`Not #${note.id} silinsin mi?`, note.text, `/api/members/${p.id}/notes/${note.id}`, `Not #${note.id} silindi.`, p.id)
        )
      )
    );

    const contributions = el(
      'div',
      { class: 'section' },
      el('h3', {}, '🐾 Katkılar'),
      el('dl', { class: 'facts' }, fact('Haftalık seçim', p.contributions.petOfTheWeek))
    );

    $('profile').replaceChildren(head, moderationSection(p), info, activity, warnings, notes, contributions);
  }

  App.selectMember = id => {
    showView('members');
    select(id);
  };
  App.registerView('members', { show: load });
})();
