import express from 'express';

const router = express.Router();

// ── 公告（前台公開）────────────────────────────────────────
router.get('/announcements', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      'SELECT * FROM announcements ORDER BY date DESC, id DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('api/announcements error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 導覽按鈕（前台公開）───────────────────────────────────
router.get('/nav-buttons', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      'SELECT * FROM nav_buttons ORDER BY parent_id ASC NULLS FIRST, sort_order ASC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('api/nav-buttons error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 網站設定（前台公開）───────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query('SELECT * FROM site_settings');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error('api/settings error:', err);
    res.status(500).json({ success: false });
  }
});

export default router;
