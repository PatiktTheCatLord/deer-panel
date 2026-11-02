// Builds a Turkish → English text lookup from a dictionary like i18n-en.js. Shared by the window (i18n.js)
// and the main process (tray, notifications, dialogs). translate(text, context) returns null when unknown.
(function (root) {
  function makeTranslator(dictionary) {
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const exact = new Map();
    const patterns = [];
    for (const [key, value] of Object.entries(dictionary)) {
      const source = normalize(key);
      if (!/\{\d\}/.test(source)) {
        exact.set(source, value);
        continue;
      }
      const order = [];
      const regex = source.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d)\}/g, (_, index) => {
        order.push(Number(index));
        return '([\\s\\S]*?)';
      });
      patterns.push({ regex: new RegExp(`^${regex}$`), order, value, literal: source.replace(/\{\d\}/g, '').length });
    }
    // The most specific pattern wins.
    patterns.sort((a, b) => b.literal - a.literal);

    // A changing part may itself be a Turkish word (a theme name, a fragment like " ve yayınlandı").
    const translatePart = (part, context) => (part.trim() ? translate(part, context) ?? part : part);

    return translate;
    function translate(text, context) {
      const trimmed = normalize(text);
      if (!trimmed || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(trimmed)) return null;
      let hit = (context && exact.get(`${context}:${trimmed}`)) ?? exact.get(trimmed);
      if (hit == null) {
        for (const pattern of patterns) {
          const match = pattern.regex.exec(trimmed);
          if (!match) continue;
          const parts = {};
          pattern.order.forEach((index, position) => { parts[index] = match[position + 1]; });
          hit = pattern.value.replace(/\{(\d)\}/g, (_, index) => translatePart(parts[index] ?? '', context));
          break;
        }
      }
      if (hit == null) return null;
      return text.match(/^\s*/)[0] + hit + text.match(/\s*$/)[0];
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = makeTranslator;
  else root.makeTranslator = makeTranslator;
})(this);
