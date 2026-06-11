import express from 'express'
const router = express.Router()

// ── 公告（前台公開）────────────────────────────────────────
router.get('/announcements', async (req, res) => {
  const pool = req.app.locals.pool
  const { department } = req.query
  try {
    let q = 'SELECT * FROM announcements'
    const params = []
    if (department) {
      q += ' WHERE department=$1'
      params.push(department)
    }
    q += ' ORDER BY date DESC, id DESC'
    const r = await pool.query(q, params)
    res.json({ success: true, data: r.rows })
  } catch (err) {
    console.error('api/announcements error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── 導覽按鈕（前台公開）───────────────────────────────────
router.get('/nav-buttons', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM nav_buttons ORDER BY parent_id ASC NULLS FIRST, sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) {
    console.error('api/nav-buttons error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── 網站設定（前台公開）───────────────────────────────────
router.get('/settings', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM site_settings')
    const s = {}; r.rows.forEach(row => s[row.key] = row.value)
    res.json({ success: true, data: s })
  } catch (err) {
    console.error('api/settings error:', err)
    res.status(500).json({ success: false })
  }
})

// ── Campus 區塊（前台公開）───────────────────────────────
router.get('/campus-blocks', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM campus_blocks ORDER BY sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Campus 按鈕（前台公開）───────────────────────────────
router.get('/campus-buttons', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM campus_buttons ORDER BY sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
