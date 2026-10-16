// Tiny JSON-file store (atomic writes). Fine for a community game; swap for SQLite/Postgres at scale.
const fs = require('fs'), path = require('path');
function open(file) {
  let data = { users: {}, sessions: {}, nonces: {}, weeks: {}, history: [], prizes: { title: 'Weekly Trench Prizes', note: '', items: [] } };
  if (file && fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  let t = null;
  const save = () => { if (!file) return; clearTimeout(t); t = setTimeout(flush, 50); };
  const flush = () => { if (!file) return; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); };
  return { data, save, flush };
}
module.exports = { open };
