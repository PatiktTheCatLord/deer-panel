// 🛠️ Maintenance: one-click update (deploy) and backups.
(() => {
  // ---------- update ----------

  function logLine(text, className = '') {
    $('deploy-log').append(el('div', { class: `line ${className}` }, text));
    $('deploy-log').scrollTop = $('deploy-log').scrollHeight;
  }

  // Which code runs on the server (from the bot's /api/status).
  async function loadBuild() {
    const status = await api('GET', '/api/status').catch(() => null);
    const build = status?.bot?.build;
    $('build-info').textContent = build
      ? `Sunucudaki sürüm: ${build.version}${build.commit ? ` (${build.commit}${build.dirty ? ', commit edilmemiş değişikliklerle' : ''})` : ' (paketle kurulmadı)'}${build.builtAt ? ` · paket: ${formatDate(build.builtAt)}` : ''}`
      : 'Sunucudaki sürüm: bilinmiyor (bot kapalı olabilir)';
  }

  let release = null;
  // A bot on this computer is updated to the version bundled with the panel (no package to pick).
  const isLocal = () => App.activeProfile?.()?.type === 'local';
  async function setupUpdateCard() {
    const local = isLocal();
    $('release-pick').hidden = local;
    if (!local) {
      $('deploy-run').textContent = '⬆ Yükle ve güncelle';
      $('deploy-run').disabled = !release;
      return;
    }
    const bundle = await window.panel.setupBundle().catch(() => null);
    $('deploy-run').textContent = bundle ? `⬆ Panelle gelen sürüme güncelle (${bundle.version} · ${bundle.commit})` : '⬆ Gömülü bot yok';
    $('deploy-run').disabled = !bundle;
    $('release-info').textContent = 'Bu bot bu bilgisayarda çalışıyor; yeni sürümler panelin yeni sürümüyle gelir. Ayarlar ve veriler korunur.';
  }
  $('release-pick').addEventListener('click', async () => {
    const picked = await attempt(() => window.panel.pickRelease(), 'Paket seçilemedi');
    if (!picked) return;
    release = picked;
    $('release-info').textContent = `Seçilen: ${picked.name} · ${formatBytes(picked.size)}`;
    $('deploy-run').disabled = false;
  });

  $('deploy-run').addEventListener('click', async () => {
    if (!release && !isLocal()) return;
    const ok = await confirmModal('Bot güncellensin mi?', isLocal() ? 'Bot durdurulur, kodu panelle gelen sürümle değiştirilir ve yeniden başlar. Ayarlar ve veriler korunur.' : `${release.name} sunucuya yüklenecek. Önce yedek alınır, bot ~15 sn yeniden başlar.`, 'Güncelle');
    if (!ok) return;
    $('deploy-log').replaceChildren();
    $('deploy-run').disabled = true;
    $('release-pick').disabled = true;
    logLine(`▶ ${release?.name ?? 'Yerel bot'} — güncelleme başladı…`, 'panel');
    try {
      await window.panel.runUpdate();
    } catch (error) {
      logLine(`✖ ${errorText(error)}`, 'error');
    } finally {
      release = null;
      $('release-info').textContent = '';
      $('release-pick').disabled = false;
    }
  });

  window.panel.onDeployLine(line => logLine(line, /error|fail|✖|err!/i.test(line) ? 'error' : line.startsWith('==>') ? 'panel' : ''));
  window.panel.onDeployDone(({ code }) => {
    if (code === 0) {
      logLine('✔ Güncelleme tamamlandı.', 'ok');
      toast('Bot güncellendi.');
      setTimeout(loadBuild, 3000);
    } else {
      logLine('✖ Güncelleme başarısız. Eski kod geri yüklendi; ayrıntılar yukarıda.', 'error');
      toast('Güncelleme başarısız — çıktıya bak.', true);
    }
  });

  // ---------- backups ----------

  function renderBackups(backups) {
    $('backup-list').replaceChildren(
      ...backups.map((backup, index) =>
        el(
          'li',
          {},
          el(
            'div',
            { class: 'body' },
            el('div', { class: 'strong' }, backup.name.slice(9, 19), index === 0 && el('span', { class: 'tag' }, 'en yeni')),
            el('div', { class: 'meta' }, `${formatDate(backup.modified)} · ${formatBytes(backup.size)}`)
          ),
          el(
            'div',
            { class: 'row-actions' },
            el('button', {
              class: 'small',
              onclick: async () => {
                const saved = await attempt(() => window.panel.downloadBackup(backup.name), 'İndirilemedi');
                if (saved) toast(`Kaydedildi: ${saved}`);
              }
            }, '⬇ İndir'),
            el('button', { class: 'small danger', onclick: () => restore(backup) }, '↺ Geri yükle')
          )
        )
      )
    );
    if (!backups.length) $('backup-list').replaceChildren(el('li', { class: 'muted' }, 'Henüz yedek yok.'));
  }

  async function restore(backup) {
    const first = await confirmModal(
      `${backup.name.slice(9, 19)} yedeği geri yüklensin mi?`,
      'Bot durdurulur, şu anki veriler sunucuda ayrı bir dosyaya kopyalanır, yedek yerine konur ve bot yeniden başlar. O tarihten sonraki uyarılar, notlar ve ayar değişiklikleri geri gider.',
      'Devam',
      true
    );
    if (!first) return;
    const second = await confirmModal('Emin misin?', 'Bu işlem şu anki verilerin yerine yedeği koyar.', 'Evet, geri yükle', true);
    if (!second) return;
    const result = await attempt(() => window.panel.restoreBackup(backup.name), 'Geri yükleme başarısız');
    if (result) toast(`Geri yüklendi. Önceki veriler sunucuda saklandı: ${result.safetyCopy}`);
  }

  async function load() {
    const backups = await attempt(() => window.panel.listBackups(), 'Yedekler yüklenemedi');
    if (backups) renderBackups(backups);
  }

  $('backup-refresh').addEventListener('click', load);
  $('backup-now').addEventListener('click', async () => {
    $('backup-now').disabled = true;
    const backups = await attempt(() => window.panel.backupNow(), 'Yedek alınamadı');
    $('backup-now').disabled = false;
    if (backups) {
      toast('Yedek alındı.');
      renderBackups(backups);
    }
  });

  App.registerView('maintenance', {
    show: () => {
      load();
      loadBuild();
      setupUpdateCard();
    }
  });
})();
