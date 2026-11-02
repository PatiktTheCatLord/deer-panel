// 🐾 Community: this week's showcase candidates and the weekly staff report.
(() => {
  async function loadShowcase() {
    const data = await attempt(() => api('GET', '/api/showcase'), 'Vitrin yüklenemedi');
    if (!data) return;
    if (!data.configured) {
      $('showcase-info').textContent = 'Vitrin ayarlı değil (Ayarlar → Vitrin kanalı).';
      $('showcase-candidates').replaceChildren();
      $('showcase-pick').disabled = true;
      return;
    }
    $('showcase-pick').disabled = false;
    $('showcase-info').textContent = `Sıradaki otomatik seçim: ${formatDate(data.nextPick)}${data.lastWinnerName ? ` · Şu anki kazanan: ${data.lastWinnerName}` : ''}`;
    $('showcase-candidates').replaceChildren(
      ...data.candidates.map((item, index) =>
        el(
          'div',
          { class: `candidate${index === 0 && item.hearts > 0 ? ' leader' : ''}`, onclick: () => window.open(item.url) },
          item.image ? el('img', { src: item.image, alt: '' }) : el('div', { class: 'no-image' }, '🎞️'),
          el('div', { class: 'candidate-meta' }, el('strong', {}, `❤️ ${item.hearts}`), ` ${item.authorName}`, el('div', { class: 'muted small' }, formatDate(item.createdAt)))
        )
      )
    );
    if (!data.candidates.length) $('showcase-candidates').replaceChildren(el('p', { class: 'muted' }, 'Bu hafta henüz gönderi yok.'));
  }

  async function loadReport() {
    const data = await attempt(() => api('GET', '/api/report'), 'Rapor yüklenemedi');
    if (!data) return;
    $('report-send').disabled = !data.configured;
    $('report-info').textContent = data.configured ? `Sıradaki otomatik rapor: ${formatDate(data.nextReport)}` : 'Rapor kanalı ayarlı değil (Ayarlar → Haftalık rapor kanalı).';
    const embed = data.embed;
    const channels = (await attempt(() => getChannels(), 'Kanallar yüklenemedi')) ?? [];
    const channelName = id => `#${channels.find(channel => channel.id === id)?.name ?? 'kanal'}`;
    // Discord timestamps (<t:…:D>) shown as readable dates.
    const readable = text => String(text ?? '').replace(/<t:(\d+):\w>/g, (_, seconds) => formatDate(Number(seconds) * 1000)).replace(/\*\*/g, '').replace(/<#(\d+)>/g, (_, id) => channelName(id));
    $('report-preview').replaceChildren(
      el(
        'div',
        { class: 'embed' },
        el('div', { class: 'embed-title' }, embed.title),
        el('div', { class: 'embed-body' }, readable(embed.description)),
        el('div', { class: 'embed-fields' }, embed.fields.map(item => el('div', { class: 'embed-field' }, el('strong', {}, item.name), el('div', { class: 'pre' }, readable(item.value)))))
      )
    );
  }

  $('showcase-pick').addEventListener('click', async () => {
    if (!(await confirmModal('Haftalık kazanan şimdi seçilsin mi?', 'En çok ❤️ alan gönderi duyurulur ve kazanan rolü verilir. Pazar günkü otomatik seçim yine yapılır.', 'Seç ve duyur'))) return;
    const result = await attempt(() => api('POST', '/api/showcase/pick'), 'Seçilemedi');
    if (result) {
      toast(result.result.replace(/<@\d+>/g, 'kazanan').replace(/\*\*/g, ''));
      loadShowcase();
    }
  });
  $('report-send').addEventListener('click', async () => {
    if (!(await confirmModal('Rapor şimdi gönderilsin mi?', 'Gönderilince sayaçlar sıfırlanır ve yeni dönem başlar.', 'Gönder'))) return;
    if (await attempt(() => api('POST', '/api/report/send'), 'Gönderilemedi')) {
      toast('Rapor gönderildi.');
      loadReport();
    }
  });
  $('community-refresh').addEventListener('click', () => {
    loadShowcase();
    loadReport();
  });

  App.registerView('community', {
    show: () => {
      loadShowcase();
      loadReport();
    }
  });
})();
