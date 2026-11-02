// 🛡️ Moderation: history of warnings, timeouts, kicks and bans; search in notes/warnings; banned users.
(() => {
  const TYPES = {
    warning: '⚠️ Uyarı',
    timeout: '🔇 Timeout',
    untimeout: '🔊 Timeout kaldırıldı',
    kick: '👢 Kick',
    ban: '🔨 Ban',
    unban: '🕊️ Ban kaldırıldı'
  };

  async function loadHistory() {
    const params = new URLSearchParams();
    if ($('modlog-type').value) params.set('type', $('modlog-type').value);
    if ($('modlog-days').value) params.set('days', $('modlog-days').value);
    const rows = await attempt(() => api('GET', `/api/modlog${params.size ? `?${params}` : ''}`), 'Geçmiş yüklenemedi');
    if (!rows) return;

    $('modlog-table').replaceChildren(
      el('thead', {}, el('tr', {}, ['Zaman', 'İşlem', 'Üye', 'Yetkili', 'Sebep'].map(text => el('th', {}, text)))),
      el(
        'tbody',
        {},
        rows.map(row =>
          el(
            'tr',
            {},
            el('td', { class: 'small nowrap' }, formatDate(row.createdAt)),
            el('td', { class: 'nowrap' }, TYPES[row.type] ?? row.type, row.durationMinutes && el('div', { class: 'muted small' }, formatMinutes(row.durationMinutes))),
            el('td', {}, el('button', { class: 'link', onclick: () => App.selectMember(row.userId) }, row.userName ?? row.userId)),
            el('td', { class: 'small' }, row.via ? row.via : row.moderatorName ?? (row.moderatorId ? row.moderatorId : '—')),
            el('td', { class: 'small' }, row.reason ?? '—')
          )
        )
      )
    );
    if (!rows.length) $('modlog-table').append(el('tbody', {}, el('tr', {}, el('td', { colspan: 5, class: 'muted' }, 'Kayıt yok.'))));
  }

  let searchTimer;
  $('search-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const query = $('search-input').value.trim();
      if (query.length < 2) return $('search-results').replaceChildren();
      const hits = await attempt(() => api('GET', `/api/search?q=${encodeURIComponent(query)}`), 'Aranamadı');
      if (!hits) return;
      $('search-results').replaceChildren(
        ...hits.map(hit =>
          el(
            'li',
            { class: 'clickable', onclick: () => App.selectMember(hit.userId) },
            el('div', { class: 'body' }, el('div', {}, `${hit.kind === 'note' ? '📝' : '⚠️'} ${hit.text}`), el('div', { class: 'meta' }, `${hit.userName ?? hit.userId} · ${formatDate(hit.createdAt)}`))
          )
        )
      );
      if (!hits.length) $('search-results').replaceChildren(el('li', { class: 'muted' }, 'Bulunamadı.'));
    }, 300);
  });

  async function loadBans() {
    const bans = await attempt(() => api('GET', '/api/bans'), 'Banlılar yüklenemedi');
    if (!bans) return;
    $('ban-list').replaceChildren(
      ...bans.map(ban =>
        el(
          'li',
          {},
          el('div', { class: 'body' }, el('div', { class: 'strong' }, ban.username), el('div', { class: 'meta' }, ban.reason ?? 'sebep yok')),
          el('button', {
            class: 'small',
            onclick: async () => {
              if (!(await confirmModal('Ban kaldırılsın mı?', `${ban.username} sunucuya tekrar katılabilir.`, 'Ban kaldır'))) return;
              if (await attempt(() => api('DELETE', `/api/bans/${ban.id}`), 'Kaldırılamadı')) {
                toast('Ban kaldırıldı.');
                loadBans();
                loadHistory();
              }
            }
          }, 'Kaldır')
        )
      )
    );
    if (!bans.length) $('ban-list').replaceChildren(el('li', { class: 'muted' }, 'Banlı kimse yok.'));
  }

  for (const id of ['modlog-type', 'modlog-days']) $(id).addEventListener('change', loadHistory);
  $('modlog-refresh').addEventListener('click', () => {
    loadHistory();
    loadBans();
  });

  App.registerView('moderation', {
    show: () => {
      loadHistory();
      loadBans();
    }
  });
})();
