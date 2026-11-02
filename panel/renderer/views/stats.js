// 📈 Stats: last 30 days as simple SVG charts (no chart library needed).
(() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, ...children) => {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  };

  // Bars (or a line) for one or two series over the days. `values` may contain null (no data).
  function chart(days, series, { line = false } = {}) {
    const width = 560;
    const height = 200;
    const pad = { left: 36, right: 8, top: 10, bottom: 24 };
    const all = series.flatMap(item => item.values).filter(value => value !== null);
    const max = Math.max(1, ...all);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const step = plotW / days.length;
    const y = value => pad.top + plotH - (value / max) * plotH;

    const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart' });
    for (const fraction of [0, 0.5, 1]) {
      const value = Math.round(max * fraction);
      root.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), class: 'grid-line' }));
      root.append(svg('text', { x: pad.left - 6, y: y(value) + 4, class: 'axis', 'text-anchor': 'end' }, String(value)));
    }
    days.forEach((day, index) => {
      if (index % 5 === 0 || index === days.length - 1) {
        root.append(svg('text', { x: pad.left + index * step + step / 2, y: height - 6, class: 'axis', 'text-anchor': 'middle' }, formatDay(day)));
      }
    });

    series.forEach((item, seriesIndex) => {
      if (line) {
        const points = item.values.map((value, index) => (value === null ? null : `${pad.left + index * step + step / 2},${y(value)}`)).filter(Boolean);
        if (points.length) root.append(svg('polyline', { points: points.join(' '), class: `series-line s${seriesIndex}` }));
        if (points.length === 1) {
          const [cx, cy] = points[0].split(',');
          root.append(svg('circle', { cx, cy, r: 3, class: `series-dot s${seriesIndex}` }));
        }
        return;
      }
      const barW = (step * 0.7) / series.length;
      item.values.forEach((value, index) => {
        if (!value) return;
        const x = pad.left + index * step + step * 0.15 + seriesIndex * barW;
        const bar = svg('rect', { x, y: y(value), width: barW, height: pad.top + plotH - y(value), class: `bar s${seriesIndex}`, rx: 2 });
        bar.append(svg('title', {}, `${formatDay(days[index])}: ${value}`));
        root.append(bar);
      });
    });
    return root;
  }

  function card(title, subtitle, content, legend = []) {
    return el(
      'article',
      { class: 'card' },
      el('h2', {}, title),
      subtitle && el('p', { class: 'muted small' }, subtitle),
      legend.length > 0 && el('div', { class: 'legend' }, legend.map((label, index) => el('span', {}, el('span', { class: `swatch s${index}` }), label))),
      content
    );
  }

  async function load() {
    const data = await attempt(() => api('GET', '/api/stats'), 'İstatistik yüklenemedi');
    if (!data) return;
    const sum = values => values.reduce((total, value) => total + (value ?? 0), 0);
    const since = data.historySince ? `Katılım ve üye sayısı ${formatDay(data.historySince)} tarihinden beri kaydediliyor.` : 'Katılım ve üye sayısı kaydı yeni başladı.';
    const maxChannel = Math.max(1, ...data.topChannels.map(item => item.count));

    $('charts').replaceChildren(
      card('💬 Mesajlar', `30 günde ${sum(data.messages)} mesaj`, chart(data.days, [{ values: data.messages }])),
      card('🔊 Ses', `30 günde ${formatMinutes(sum(data.voiceMinutes))}`, chart(data.days, [{ values: data.voiceMinutes }])),
      card('📥 Katılan / 📤 Ayrılan', `${sum(data.joins)} katıldı · ${sum(data.leaves)} ayrıldı. ${since}`, chart(data.days, [{ values: data.joins }, { values: data.leaves }]), ['Katılan', 'Ayrılan']),
      card('👥 Üye sayısı', since, chart(data.days, [{ values: data.members }], { line: true })),
      card(
        '🏆 En aktif kanallar',
        'Aktivite takibi başladığından beri',
        el(
          'div',
          { class: 'hbars' },
          data.topChannels.length
            ? data.topChannels.map(item =>
                el('div', { class: 'hbar' }, el('span', { class: 'hbar-label' }, `#${item.name}`), el('span', { class: 'hbar-track' }, el('span', { class: 'hbar-fill', style: `width:${(item.count / maxChannel) * 100}%` })), el('span', { class: 'hbar-value' }, item.count))
              )
            : el('p', { class: 'muted' }, 'Henüz veri yok.')
        )
      )
    );
  }

  // ---------- member leaderboards (in a popup, so the page stays calm) ----------

  const BOARDS = [
    ['messages', '💬 En çok mesaj atanlar', value => `${value.toLocaleString(panelLocale())} mesaj`],
    ['activeDays', '📅 En aktif üyeler (aktif gün)', value => `${value} gün`],
    ['voice', '🔊 Seste en çok kalanlar', value => formatMinutes(value)]
  ];
  const PERIODS = [['7', 'Son 7 gün'], ['30', 'Son 30 gün'], ['all', 'Tüm zamanlar']];
  const MEDALS = ['🥇', '🥈', '🥉'];

  function openLeaderboards() {
    const typeSelect = el('select', {}, BOARDS.map(([key, label]) => el('option', { value: key }, label)));
    const periodSelect = el('select', {}, PERIODS.map(([key, label]) => el('option', { value: key, selected: key === '30' }, label)));
    const info = el('p', { class: 'muted small' });
    const list = el('ul', { class: 'entries leaderboard' }, el('li', { class: 'muted' }, 'Yükleniyor…'));

    const fill = async () => {
      const type = typeSelect.value;
      const result = await attempt(() => api('GET', `/api/leaderboard?type=${type}&period=${periodSelect.value}`), 'Sıralama yüklenemedi');
      if (!result) return;
      const board = result.boards[type];
      // Daily counts only go back 30 days; the other boards are all-time totals.
      periodSelect.disabled = !board.period;
      for (const option of periodSelect.options) option.disabled = option.value === 'all' && Boolean(board.maxDays);
      if (board.maxDays && periodSelect.value === 'all') periodSelect.value = '30';
      info.textContent = board.period ? `${result.total} üye sıralamada.` : `Tüm zamanlar · ${result.total} üye sıralamada.`;
      const format = BOARDS.find(([key]) => key === type)[2];
      list.replaceChildren(
        ...result.rows.map((row, index) =>
          el(
            'li',
            { class: 'clickable', onclick: () => { closeModal(); App.selectMember(row.userId); } },
            el('span', { class: 'rank' }, MEDALS[index] ?? `${index + 1}.`),
            el('img', { src: row.avatar, alt: '' }),
            el('div', { class: 'body' }, el('div', { class: 'strong' }, row.name)),
            el('span', { class: 'nowrap' }, format(row.value))
          )
        )
      );
      if (!result.rows.length) list.replaceChildren(el('li', { class: 'muted' }, 'Bu sıralamada henüz kimse yok.'));
    };
    typeSelect.addEventListener('change', fill);
    periodSelect.addEventListener('change', fill);
    fill();

    openModal('🏅 Üye sıralamaları', el('div', { class: 'form' }, el('div', { class: 'form-row' }, typeSelect, periodSelect), info, list), [{ label: 'Kapat', class: 'ghost', value: null }]);
  }

  $('stats-leaderboards').addEventListener('click', openLeaderboards);
  $('stats-refresh').addEventListener('click', load);
  App.registerView('stats', { show: load });
})();
