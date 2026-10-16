/**
 * 数据库连接 & Schema 初始化
 * 使用 Node 22 内置的 node:sqlite（零依赖、免编译、文件数据库）
 *
 * 注意：node:sqlite 与 better-sqlite3 的差异：
 *  - 没有 db.transaction(fn)，用下方 withTransaction() 手动 BEGIN/COMMIT
 *  - 命名参数对象里「多余的键」会抛错，调用方要精确匹配占位符
 *  - .run / .get / .all 的位置参数是变参形式：stmt.run(a, b, c)
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'quannei.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** 手动事务 */
function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  }
}

/** 建表（幂等） */
function migrate() {
  db.exec(`
    -- 用户
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      slug          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      headline      TEXT DEFAULT '',
      avatar_url    TEXT,
      company       TEXT DEFAULT '',
      title         TEXT DEFAULT '',
      industry      TEXT DEFAULT '其他',
      city          TEXT DEFAULT '',
      phone         TEXT DEFAULT '',
      wechat        TEXT DEFAULT '',
      website       TEXT DEFAULT '',
      phone_public   INTEGER NOT NULL DEFAULT 0,
      wechat_public  INTEGER NOT NULL DEFAULT 0,
      email_public   INTEGER NOT NULL DEFAULT 0,
      website_public INTEGER NOT NULL DEFAULT 0,
      visibility    TEXT NOT NULL DEFAULT 'public',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_industry ON users(industry);
    CREATE INDEX IF NOT EXISTS idx_users_city     ON users(city);
    CREATE INDEX IF NOT EXISTS idx_users_updated  ON users(updated_at DESC);

    -- 主页富文本小节
    CREATE TABLE IF NOT EXISTS profile_sections (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL DEFAULT 'custom',
      title      TEXT NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sections_user ON profile_sections(user_id, sort_order);

    -- 行业字典
    CREATE TABLE IF NOT EXISTS industries (
      name   TEXT PRIMARY KEY,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- 自定义标签
    CREATE TABLE IF NOT EXISTS tags (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      use_count INTEGER NOT NULL DEFAULT 0
    );

    -- 用户 ↔ 标签
    CREATE TABLE IF NOT EXISTS user_tags (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_usertags_tag ON user_tags(tag_id);

    -- 圈子
    CREATE TABLE IF NOT EXISTS circles (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      intro       TEXT DEFAULT '',
      emoji       TEXT DEFAULT '🏛',
      theme       TEXT DEFAULT 'teal',
      join_policy TEXT NOT NULL DEFAULT 'open',
      owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 圈子成员
    CREATE TABLE IF NOT EXISTS circle_members (
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (circle_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cm_user ON circle_members(user_id);
  `);
}

module.exports = { db, withTransaction, migrate, DB_FILE, DATA_DIR };
