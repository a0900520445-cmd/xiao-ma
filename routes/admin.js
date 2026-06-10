import express from 'express';
import bcrypt from 'bcryptjs';

const router = express.Router();

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ success: false, message: '請先登入' });
}

// ── 登入 ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.json({ success: false, message: '帳號或密碼錯誤' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, message: '登入成功' });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
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
router.get('/announcements', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      'SELECT * FROM announcements ORDER BY date DESC, id DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/announcements', requireAuth, async (req, res) => {
  const { title, content, date } = req.body;
  if (!title || !content || !date) return res.json({ success: false, message: '欄位不完整' });
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      'INSERT INTO announcements (title, content, date) VALUES ($1, $2, $3) RETURNING id',
      [title, content, date]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/announcements/:id', requireAuth, async (req, res) => {
  const { title, content, date } = req.body;
  const pool = req.app.locals.pool;
  try {
    await pool.query(
      'UPDATE announcements SET title=$1, content=$2, date=$3 WHERE id=$4',
      [title, content, date, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/announcements/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    await pool.query('DELETE FROM announcements WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 導覽按鈕 CRUD ─────────────────────────────────────────
router.get('/nav-buttons', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      'SELECT * FROM nav_buttons ORDER BY parent_id ASC NULLS FIRST, sort_order ASC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nav-buttons', requireAuth, async (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body;
  if (!name || !url) return res.json({ success: false, message: '欄位不完整' });
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      'INSERT INTO nav_buttons (name, url, parent_id, sort_order, target) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, url, parent_id || null, sort_order || 0, target || '_self']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/nav-buttons/:id', requireAuth, async (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body;
  const pool = req.app.locals.pool;
  try {
    await pool.query(
      'UPDATE nav_buttons SET name=$1, url=$2, parent_id=$3, sort_order=$4, target=$5 WHERE id=$6',
      [name, url, parent_id || null, sort_order || 0, target || '_self', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/nav-buttons/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    // 先刪子按鈕，再刪本身
    await pool.query('DELETE FROM nav_buttons WHERE parent_id=$1', [req.params.id]);
    await pool.query('DELETE FROM nav_buttons WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 網站設定 ──────────────────────────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query('SELECT * FROM site_settings');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/settings', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    for (const [k, v] of Object.entries(req.body)) {
      await pool.query(
        'INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2',
        [k, v]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 修改密碼 ──────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [req.session.userId]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
      return res.json({ success: false, message: '舊密碼錯誤' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.session.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
