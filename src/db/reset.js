/**
 * 重置数据库：删除 db 文件并重新建表 + 灌种子数据
 * 用法：npm run reset-db
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
for (const f of ['quannei.db', 'quannei.db-wal', 'quannei.db-shm']) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('removed', p); }
}

const { migrate } = require('./index');
const { seed } = require('./seed');
migrate();
const r = seed();
console.log('DB reset done.', r);
