// Разовая проверка boot-логики (db + auth) без Express. Запуск: node tools/selftest.js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmp = path.join(os.tmpdir(), 'vb-selftest-' + Date.now());
process.env.DATA_DIR = tmp;
process.env.ADMIN_PASSWORD = 'test-pass-123';
process.env.SESSION_SECRET = 'x'.repeat(32);

const db = require('../src/db.js');
const auth = require('../src/auth.js');

const log = [];
const assert = (cond, label) => log.push((cond ? 'OK   ' : 'FAIL ') + label);

db.load();
assert(db.db.users.length === 0, 'пустая база после load()');

auth.seedAdmin();
assert(db.db.users.length === 1 && db.db.users[0].nick === 'admin', 'создан админ из ADMIN_NICK');
assert(fs.existsSync(path.join(tmp, 'db.json')), 'db.json записан на диск');

auth.seedAdmin();
assert(db.db.users.length === 1, 'повторный seed не дублирует админа');

const shared = db.db;
db.db.users.push({ id: 'u_test', nick: 'mod', role: 'moderator', salt: 'a', passHash: 'b', createdAt: 1 });
db.saveSync();
db.load();
assert(db.db === shared, 'load() не подменяет объект, на который ссылруются модули');
assert(db.db.users.length === 2, 'данные переживают перезагрузку');
assert(Array.isArray(db.db.muted), 'недостающие коллекции добираются из empty()');

const admin = db.db.users[0];
assert(auth.verifyPassword('test-pass-123', admin.salt, admin.passHash), 'scrypt: верный пароль принят');
assert(!auth.verifyPassword('nope', admin.salt, admin.passHash), 'scrypt: неверный пароль отклонён');

console.log(log.join('\n'));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(log.some((l) => l.startsWith('FAIL')) ? 1 : 0);
