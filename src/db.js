const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const empty = () => ({
  users: [],
  nicknames: [],
  items: [],
  comments: [],
  chat: [],
  submissions: [],
  muted: [],
});

let db = empty();
let writeTimer = null;

function uid(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

function saveSync() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      saveSync();
    } catch (err) {
      console.error('[db] write failed:', err.message);
    }
  }, 100);
}

function load() {
  try {
    db = Object.assign(empty(), JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[db] corrupt or unreadable, resetting:', err.message);
    db = empty();
    saveSync();
  }
}

const byId = (rows, id) => rows.find((r) => r.id === id);

module.exports = {
  load,
  save,
  db,
  uid,
  byId,
  FILE,
  DATA_DIR,
};
