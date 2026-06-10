import express from 'express';
import bcrypt from 'bcryptjs';

const router = express.Router();

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ success: false, message: '請先登入' });
}

// ── 登入 ─────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, message: '帳號或密碼錯誤' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, message: '登入成功' });
});

// ── 登出 ─────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ── 確認登入狀態 ──────────────────────────────────────────
router.get('/check-auth', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// ── 公告 CRUD ─────────────────────────────────────────────
router.get('/announcements', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM announcements ORDER BY date DESC, id DESC').all();
  res.json({ success: true, data: rows });
});

router.post('/announcements', requireAuth, (req, res) => {
  const { title, content, date } = req.body;
  if (!title || !content || !date) return res.json({ success: false, message: '欄位不完整' });
  const db = req.app.locals.db;
  const info = db.prepare('INSERT INTO announcements (title, content, date) VALUES (?, ?, ?)').run(title, content, date);
  res.json({ success: true, id: info.lastInsertRowid });
});

router.put('/announcements/:id', requireAuth, (req, res) => {
  const { title, content, date } = req.body;
  const db = req.app.locals.db;
  db.prepare('UPDATE announcements SET title=?, content=?, date=? WHERE id=?').run(title, content, date, req.params.id);
  res.json({ success: true });
});

router.delete('/announcements/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── 導覽按鈕 CRUD ─────────────────────────────────────────
router.get('/nav-buttons', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM nav_buttons ORDER BY parent_id ASC, sort_order ASC').all();
  res.json({ success: true, data: rows });
});

router.post('/nav-buttons', requireAuth, (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body;
  if (!name || !url) return res.json({ success: false, message: '欄位不完整' });
  const db = req.app.locals.db;
  const info = db.prepare('INSERT INTO nav_buttons (name, url, parent_id, sort_order, target) VALUES (?, ?, ?, ?, ?)').run(
    name, url, parent_id || null, sort_order || 0, target || '_self'
  );
  res.json({ success: true, id: info.lastInsertRowid });
});

router.put('/nav-buttons/:id', requireAuth, (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body;
  const db = req.app.locals.db;
  db.prepare('UPDATE nav_buttons SET name=?, url=?, parent_id=?, sort_order=?, target=? WHERE id=?').run(
    name, url, parent_id || null, sort_order || 0, target || '_self', req.params.id
  );
  res.json({ success: true });
});

router.delete('/nav-buttons/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  // 同時刪除子按鈕
  db.prepare('DELETE FROM nav_buttons WHERE parent_id=?').run(req.params.id);
  db.prepare('DELETE FROM nav_buttons WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── 網站設定 ──────────────────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM site_settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json({ success: true, data: settings });
});

router.post('/settings', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const upsert = db.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)');
  Object.entries(req.body).forEach(([k, v]) => upsert.run(k, v));
  res.json({ success: true });
});

// ── 修改密碼 ──────────────────────────────────────────────
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.json({ success: false, message: '舊密碼錯誤' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.session.userId);
  res.json({ success: true });
});

export default router;
