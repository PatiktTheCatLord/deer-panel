// 📜 Logs: live journal of the bot, with a filter and an errors-only switch.
(() => {
  const MAX_LINES = 2000;
  let lines = [];

  function logClass(text) {
    if (text.includes('[DELETE]')) return 'delete';
    if (/\[COMMAND\]|\[EVENT\]/.test(text)) return ''; // e.g. "/warn loaded" is not a warning
    if (/\b(error|failed|fail|exception|unhandled)\b/i.test(text)) return 'error';
    if (/\[WARN\]|\bwarning:|rate limited|could not/i.test(text)) return 'warn';
    if (/\[ADMIN\]/.test(text)) return 'panel';
    return '';
  }

  function render(line) {
    // "2026-10-28T15:16:28+03:00 host node[123]: message" → time + message
    const match = line.match(/^(\S+)\s+\S+\s+\S+:\s?(.*)$/);
    const time = match ? new Date(match[1]).toLocaleTimeString(panelLocale()) : '';
    const text = match ? match[2] : line;
    return el('div', { class: `line ${logClass(text)}` }, time && el('span', { class: 'time' }, `${time}  `), text);
  }

  function visible(line) {
    const filter = $('log-filter').value.toLowerCase();
    if (filter && !line.toLowerCase().includes(filter)) return false;
    if ($('log-errors').checked && logClass(line) !== 'error') return false;
    // Deleted messages: who wrote it, what it said and who deleted it (moderator, bot or the author).
    if ($('log-deletes').checked && !line.includes('[DELETE]')) return false;
    return true;
  }

  function scroll() {
    if ($('log-follow').checked) $('log').scrollTop = $('log').scrollHeight;
  }

  function rerender() {
    $('log').replaceChildren(...lines.filter(visible).map(render));
    scroll();
  }

  window.panel.onLog(line => {
    lines.push(line);
    if (lines.length > MAX_LINES) {
      lines.shift();
      $('log').firstChild?.remove();
    }
    if (visible(line)) {
      $('log').append(render(line));
      if (App.view === 'logs') scroll();
    }
  });
  $('log-filter').addEventListener('input', rerender);
  $('log-errors').addEventListener('change', rerender);
  $('log-deletes').addEventListener('change', rerender);
  $('log-clear').addEventListener('click', () => {
    lines = [];
    $('log').replaceChildren();
  });

  App.registerView('logs', { show: scroll });
})();
