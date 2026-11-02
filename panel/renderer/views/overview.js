// 📊 Overview: service state, start/stop/restart, bot and server numbers.
(() => {
  async function refresh() {
    if (!App.connected) return;

    try {
      const service = await window.panel.serviceStatus();
      const running = service.ActiveState === 'active';
      const starting = service.ActiveState === 'activating';
      const badge = $('service-state');
      badge.textContent = running ? 'Çalışıyor' : starting ? 'Başlıyor…' : 'Durdu';
      badge.className = `badge ${running ? 'ok' : starting ? 'warn' : 'bad'}`;
      // systemd gives "Wed 2026-10-28 15:16:25 +03"
      const since = service.ActiveEnterTimestamp?.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})/);
      $('service-since').textContent = running && since ? `${formatDate(`${since[1]}T${since[2]}${since[3]}:00`)} tarihinden beri` : '';
      const memory = Number(service.MemoryCurrent);
      $('service-memory').textContent = Number.isFinite(memory) && memory < 1e15 ? `${Math.round(memory / 1048576)} MB` : '—';
      sampleMemory(memory);
      $('service-restarts').textContent = service.NRestarts ?? '—';
      document.querySelector('[data-action="start"]').disabled = running;
      document.querySelector('[data-action="stop"]').disabled = !running;
      document.querySelector('[data-action="restart"]').disabled = false;
    } catch (error) {
      toast(`Servis durumu alınamadı: ${errorText(error)}`, true);
    }

    try {
      const status = await api('GET', '/api/status');
      $('bot-avatar').src = status.bot.avatar;
      $('bot-avatar').hidden = false;
      $('bot-tag').textContent = status.bot.tag;
      $('guild-name').textContent = status.guild.name;
      $('bot-ping').textContent = status.bot.pingMs >= 0 ? `${status.bot.pingMs} ms` : 'ölçülüyor';
      $('bot-uptime').textContent = formatDuration(status.bot.uptimeSeconds);
      $('guild-members').textContent = `${status.guild.humans.toLocaleString(panelLocale())} kişi`;
      $('count-warnings').textContent = status.counts.warnings;
      $('count-notes').textContent = status.counts.notes;
      $('count-faqs').textContent = status.counts.faqs;
    } catch {
      // The API is unreachable while the bot is stopped.
      $('bot-tag').textContent = 'Bot çevrimdışı';
      $('guild-name').textContent = '';
      for (const id of ['bot-ping', 'bot-uptime', 'guild-members', 'count-warnings', 'count-notes', 'count-faqs']) $(id).textContent = '—';
    }
  }

  // ---------- VDS health ----------

  const memorySamples = []; // bot memory (MB) sampled while the panel is open
  const gb = bytes => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

  function meter(label, used, total, detail) {
    const ratio = total ? used / total : 0;
    return el(
      'div',
      { class: 'meter' },
      el('div', { class: 'meter-head' }, el('span', {}, label), el('span', { class: 'muted' }, detail)),
      el('div', { class: 'meter-track' }, el('div', { class: `meter-fill ${ratio > 0.9 ? 'bad' : ratio > 0.75 ? 'warn' : ''}`, style: `width:${Math.min(100, ratio * 100)}%` }))
    );
  }

  function sparkline(values) {
    const width = 520;
    const height = 70;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, max);
    const range = Math.max(1, max - min);
    const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * width},${height - 6 - ((value - min) / range) * (height - 12)}`).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'sparkline');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', points);
    svg.append(line);
    return el('div', {}, el('div', { class: 'muted small' }, `Bot belleği (panel açıkken): ${values.at(-1)} MB · en yüksek ${max} MB`), svg);
  }

  async function refreshHealth() {
    const health = await window.panel.health().catch(() => null);
    if (!health) return;
    const cpu = Math.min(100, Math.round((health.load[0] / health.cores) * 100));
    $('health').replaceChildren(
      meter('CPU (1 dk ort.)', health.load[0], health.cores, `%${cpu} · ${health.cores} çekirdek`),
      meter('RAM', health.memory.total - health.memory.available, health.memory.total, `${gb(health.memory.total - health.memory.available)} / ${gb(health.memory.total)}`),
      meter('Disk', health.disk.used, health.disk.total, `${gb(health.disk.used)} / ${gb(health.disk.total)}`),
      el('div', { class: 'muted small' }, `Sunucu ${formatDuration(health.uptimeSeconds)} açık`)
    );
    if (health.memory.available / health.memory.total < 0.1) toast('VDS\'te boş RAM %10\'un altında!', true);
  }

  async function refreshFlagged() {
    const flagged = await api('GET', '/api/flagged').catch(() => null);
    if (!flagged) return;
    $('flagged').replaceChildren(
      ...flagged.map(item =>
        el('li', { class: 'clickable', onclick: () => App.selectMember(item.userId) }, el('div', { class: 'body' }, el('div', { class: 'strong' }, item.userName ?? item.userId), el('div', { class: 'meta' }, `${item.active} aktif uyarı — incele ›`)))
      )
    );
    if (!flagged.length) $('flagged').replaceChildren(el('li', { class: 'muted' }, 'Uyarı seviyesinde kimse yok. 🎉'));
  }

  async function refreshAll() {
    await refresh();
    refreshHealth();
    refreshFlagged();
  }

  function sampleMemory(memoryBytes) {
    if (!Number.isFinite(memoryBytes) || memoryBytes >= 1e15) return;
    memorySamples.push(Math.round(memoryBytes / 1048576));
    if (memorySamples.length > 180) memorySamples.shift();
    if (memorySamples.length > 1) $('memory-chart').replaceChildren(sparkline(memorySamples));
  }

  $('refresh').addEventListener('click', refreshAll);
  setInterval(() => App.view === 'overview' && refresh(), 10_000);
  setInterval(() => App.view === 'overview' && (refreshHealth(), refreshFlagged()), 30_000);

  const ACTION_TEXT = { start: 'başlatıldı', stop: 'durduruldu', restart: 'yeniden başlatıldı' };
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (action === 'stop' && !(await confirmModal('Bot durdurulsun mu?', 'Durduğu sürece doğrulama, karşılama, kayıtlar ve panelin çoğu bölümü çalışmaz.', 'Durdur', true))) return;
      for (const other of document.querySelectorAll('[data-action]')) other.disabled = true;
      try {
        await window.panel.serviceAction(action);
        toast(`Bot ${ACTION_TEXT[action]}.`);
        setTimeout(refresh, action === 'stop' ? 500 : 6000);
      } catch (error) {
        toast(`İşlem başarısız: ${errorText(error)}`, true);
        refresh();
      }
    });
  }

  App.registerView('overview', { show: refreshAll });
})();
