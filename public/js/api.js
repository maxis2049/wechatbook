/* ==========================================================================
   圈内 · API 封装
   ========================================================================== */
const API = (() => {
  async function req(method, url, body) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const r = await fetch(url, opt);
    let data = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await r.json(); } catch (e) { data = null; }
    }
    if (!r.ok) {
      const err = new Error((data && data.error) || `请求失败 (${r.status})`);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' ) return;
      if (Array.isArray(v)) { if (v.length) p.set(k, v.join(',')); }
      else p.set(k, v);
    });
    const s = p.toString();
    return s ? '?' + s : '';
  };

  return {
    // 账号
    signup: (d) => req('POST', '/api/auth/signup', d),
    login: (d) => req('POST', '/api/auth/login', d),
    logout: () => req('POST', '/api/auth/logout'),
    me: () => req('GET', '/api/auth/me'),
    deleteAccount: () => req('DELETE', '/api/auth/me'),
    // 我的主页
    myProfile: () => req('GET', '/api/me'),
    saveProfile: (d) => req('PUT', '/api/me', d),
    scaffold: () => req('POST', '/api/me/scaffold'),
    // 公开主页
    profile: (slug) => req('GET', '/api/profile/' + encodeURIComponent(slug)),
    // 名录
    directory: (params) => req('GET', '/api/directory' + qs(params)),
    // 圈子
    circles: () => req('GET', '/api/circles'),
    circle: (slug) => req('GET', '/api/circles/' + encodeURIComponent(slug)),
    createCircle: (d) => req('POST', '/api/circles', d),
    joinCircle: (slug) => req('POST', `/api/circles/${encodeURIComponent(slug)}/join`),
    leaveCircle: (slug) => req('POST', `/api/circles/${encodeURIComponent(slug)}/leave`),
    // 字典
    dictionary: () => req('GET', '/api/dictionary'),
  };
})();
