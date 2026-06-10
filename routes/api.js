import express from 'express';

const router = express.Router();
// 公開：取得公告
router.get('/announcements', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM announcements ORDER BY date DESC, id DESC').all();
  res.json({ success: true, data: rows });
});

// 公開：取得導覽按鈕
router.get('/nav-buttons', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM nav_buttons ORDER BY parent_id ASC, sort_order ASC').all();
  res.json({ success: true, data: rows });
});

// 公開：取得網站設定
router.get('/settings', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare('SELECT * FROM site_settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json({ success: true, data: settings });
});

export default router;
