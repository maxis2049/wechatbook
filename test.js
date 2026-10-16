/** 全链路 API 测试脚本（本地跑，不写进仓库） */
const B = 'http://localhost:3000';
const log = (...a) => console.log(...a);

async function j(method, path, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const r = await fetch(B + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  let data = null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) data = await r.json().catch(() => null);
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, data, setCookie };
}

function cookieFrom(sc) {
  if (!sc) return '';
  return sc.split(';')[0]; // 只取第一个（session）
}

(async () => {
  log('=== 5. 登录 ===');
  const lg = await j('POST', '/api/auth/login', { email: 'zhangmingyuan@demo.com', password: 'quannei123' });
  log('  status', lg.status, 'user?', !!(lg.data && lg.data.user));
  const ck = cookieFrom(lg.setCookie);

  log('=== 6. 我的主页（登录态） ===');
  const me = await j('GET', '/api/me', undefined, ck);
  const p = me.data.profile;
  log('  name', p.name, '| sections', p.sections.length, '| isSelf', p.isSelf,
      '| phone公开', p.contact.find(c => c.type === 'phone').isPublic);

  log('=== 7. 保存主页 ===');
  const sv = await j('PUT', '/api/me', {
    name: '张明远', headline: '更新了的一句话', company: '某跨境电商 SaaS', title: 'CTO',
    industry: '互联网', city: '杭州', phone: '13812345678', wechat: 'zhang_mingyuan',
    website: '', phonePublic: false, wechatPublic: true,
    tags: ['跨境电商', '增长营销', 'AI 应用', '新标签XYZ'], visibility: 'public',
    sections: [{ title: '关于我', kind: 'about', content: '<p>测试内容</p>' }],
  }, ck);
  log('  status', sv.status, '| headline', sv.data.profile.headline,
      '| tags', sv.data.profile.tags.join('/'),
      '| phone公开', sv.data.profile.contact.find(c => c.type === 'phone').isPublic);

  log('=== 8. 匿名看该主页（手机应不可见） ===');
  const anon = await j('GET', '/api/profile/zhangmingyuan');
  const ap = anon.data.profile;
  log('  status', anon.status, '| phone匿名可见', ap.contact.find(c => c.type === 'phone').isPublic,
      '| headline', ap.headline, '| tags', ap.tags.length);

  log('=== 9. 圈子列表 ===');
  const cl = await j('GET', '/api/circles');
  log('  圈子数', cl.data.items.length, cl.data.items.map(c => c.name + '(' + c.memberCount + ')').join(', '));

  log('=== 10. 圈子详情（成员） ===');
  const cd = await j('GET', '/api/circles/zju-cs');
  log('  zju-cs 成员', cd.data.members.map(m => m.name).join(', '));

  log('=== 11. 加入/退出圈子（登录） ===');
  const join = await j('POST', '/api/circles/hmarathon/join', {}, ck);
  log('  加入 hmarathon status', join.status, 'joined', join.data.joined);
  const leave = await j('POST', '/api/circles/hmarathon/leave', {}, ck);
  log('  退出 status', leave.status);

  log('=== 12. 注册新用户 ===');
  const su = await j('POST', '/api/auth/signup',
    { email: 'tester_' + Date.now() + '@t.com', password: 'abc123', name: '测试用户', slug: 'testerxx' });
  log('  status', su.status, 'slug', su.data.user && su.data.user.slug);

  log('=== 13. 字典 ===');
  const dict = await j('GET', '/api/dictionary');
  log('  industries', dict.data.industries.length, '| cities', dict.data.cities.length,
      '| tags', dict.data.tags.length, '| circles', dict.data.circles.length);

  log('=== 14. 可见性：把主页设为 circle，匿名应 403 ===');
  const ck2 = cookieFrom((await j('POST', '/api/auth/login', { email: 'zhangmingyuan@demo.com', password: 'quannei123' })).setCookie);
  await j('PUT', '/api/me', { visibility: 'circle', name: '张明远' }, ck2);
  const anon2 = await j('GET', '/api/profile/zhangmingyuan');
  log('  匿名访问 circle 可见主页 status', anon2.status, 'locked', anon2.data && anon2.data.locked === true);
  // 恢复公开
  await j('PUT', '/api/me', { visibility: 'public', name: '张明远' }, ck2);
  const anon3 = await j('GET', '/api/profile/zhangmingyuan');
  log('  恢复公开后 status', anon3.status);

  log('\n=== 全部测试完成 ===');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
