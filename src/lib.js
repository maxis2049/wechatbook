/** 共用工具 */
const sanitizeHtml = require('sanitize-html');

const PALETTE = ['#D4653C', '#2E9E8F', '#C9922F', '#7A6AC4', '#C4577E', '#4E8CC4', '#5FA05A', '#B85850'];

/** 由标识串（slug / name）稳定映射到一个暖色 */
function avatarColor(key) {
  let x = 0;
  for (const ch of String(key || '')) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[x % PALETTE.length];
}

/** 姓名首字（中文取第一字，英文取首字母大写） */
function initial(name) {
  const s = String(name || '?').trim();
  return s ? s[0].toUpperCase() : '?';
}

/** 富文本白名单清洗，防 XSS */
function clean(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
                  'h3', 'h4', 'blockquote', 'a', 'hr', 'span', 'div'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, target: '_blank', rel: 'noopener noreferrer' } }),
    },
  });
}

/** 纯文本摘要（用于名录卡片，从富文本提取） */
function excerpt(html, len = 90) {
  const t = sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ').trim();
  return t.length > len ? t.slice(0, len) + '…' : t;
}

/** slug 合法性 & 归一化 */
function normalizeSlug(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30);
}

/** 生成唯一 slug（冲突时追加数字） */
function uniqueSlug(db, base, excludeUserId = null) {
  let s = normalizeSlug(base) || 'user';
  if (s.length < 3) s = (s + 'user').slice(0, 20);
  let candidate = s, i = 1;
  const q = excludeUserId
    ? db.prepare('SELECT 1 FROM users WHERE slug = ? COLLATE NOCASE AND id != ?')
    : db.prepare('SELECT 1 FROM users WHERE slug = ? COLLATE NOCASE');
  while (excludeUserId ? q.get(candidate, excludeUserId) : q.get(candidate)) {
    candidate = s + (++i);
  }
  return candidate;
}

const VISIBILITY = ['public', 'circle', 'private'];

/** 联系方式的公开字段映射 */
const CONTACT_FIELDS = ['phone', 'wechat', 'email', 'website'];

module.exports = { avatarColor, initial, clean, excerpt, normalizeSlug, uniqueSlug, PALETTE, VISIBILITY, CONTACT_FIELDS };
