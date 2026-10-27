// Читает .env из корня проекта до остального кода: Botkeep не всегда пробрасывает
// PORT в контейнер, а вкладка Environment блокируется зависевшим GitHub-импортом.
// Файл .env игнорируется git'ом — секреты в репозиторий не попадают.
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '.env');

function load() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch {
    return false;
  }
  let applied = 0;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (value === '' || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = value;
    applied += 1;
  }
  console.log(`[env] ${path.basename(FILE)}: применено ${applied} переменных`);
  return true;
}

module.exports = { load, FILE };
