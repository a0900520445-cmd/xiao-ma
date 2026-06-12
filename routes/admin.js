import express from 'express'
import bcrypt from 'bcryptjs'

const router = express.Router()

// Supabase Storage 上傳（base64 → fetch）
// 優先用環境變數，若無則從 site_settings 資料庫讀取
async function uploadToSupabase(base64Data, mimeType, filename, pool) {
  let SUPABASE_URL = process.env.SUPABASE_URL || ''
  let SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

  if ((!SUPABASE_URL || !SUPABASE_KEY) && pool) {
    const r = await pool.query(
      `SELECT key, value FROM site_settings WHERE key IN ('supabase_url','supabase_service_key')`
    )
    r.rows.forEach(row => {
      if (row.key === 'supabase_url') SUPABASE_URL = row.value || ''
      if (row.key === 'supabase_service_key') SUPABASE_KEY = row.value || ''
    })
  }

  if (!SUPABASE_URL || !SUPABASE_KEY)
    throw new Error('請先至後台「網站設定」填入 Supabase URL 與 Service Key')

  const buffer = Buffer.from(base64Data, 'base64')
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/images/${filename}`
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body: buffer
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upload failed: ${text}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/images/${filename}`
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next()
  return res.status(401).json({ success: false, message: '請先登入' })
}

// ── 登入 / 登出 / 確認 ────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  const pool = req.app.locals.pool
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username])
    const user = result.rows[0]
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.json({ success: false, message: '帳號或密碼錯誤' })
    req.session.userId = user.id
    req.session.username = user.username
    res.json({ success: true })
  } catch (err) {
    console.error('login error:', err)
    res.status(500).json({ success: false, message: '伺服器錯誤' })
  }
})
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }))
})
router.get('/check-auth', (req, res) => {
  if (req.session && req.session.userId)
    res.json({ loggedIn: true, username: req.session.username })
  else
    res.json({ loggedIn: false })
})

// ── 圖片上傳（通用）──────────────────────────────────────
router.post('/upload-image', requireAuth, async (req, res) => {
  try {
    const { base64, mimeType, filename } = req.body
    if (!base64 || !mimeType || !filename)
      return res.json({ success: false, message: '缺少欄位' })
    const url = await uploadToSupabase(base64, mimeType, filename, req.app.locals.pool)
    res.json({ success: true, url })
  } catch (err) {
    console.error('upload-image error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── 公告 CRUD ─────────────────────────────────────────────
router.get('/announcements', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM announcements ORDER BY date DESC, id DESC')
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/announcements', requireAuth, async (req, res) => {
  const { title, content, date, department, image_url } = req.body
  if (!title || !content || !date) return res.json({ success: false, message: '欄位不完整' })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'INSERT INTO announcements (title,content,date,department,image_url) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [title, content, date, department || null, image_url || null]
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.put('/announcements/:id', requireAuth, async (req, res) => {
  const { title, content, date, department, image_url } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      'UPDATE announcements SET title=$1,content=$2,date=$3,department=$4,image_url=$5 WHERE id=$6',
      [title, content, date, department || null, image_url || null, req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.delete('/announcements/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM announcements WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 導覽按鈕 CRUD ─────────────────────────────────────────
router.get('/nav-buttons', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM nav_buttons ORDER BY parent_id ASC NULLS FIRST, sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.post('/nav-buttons', requireAuth, async (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body
  if (!name || !url) return res.json({ success: false, message: '欄位不完整' })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'INSERT INTO nav_buttons (name,url,parent_id,sort_order,target) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, url, parent_id || null, sort_order || 0, target || '_self']
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.put('/nav-buttons/:id', requireAuth, async (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      'UPDATE nav_buttons SET name=$1,url=$2,parent_id=$3,sort_order=$4,target=$5 WHERE id=$6',
      [name, url, parent_id || null, sort_order || 0, target || '_self', req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.delete('/nav-buttons/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM nav_buttons WHERE parent_id=$1', [req.params.id])
    await pool.query('DELETE FROM nav_buttons WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 網站設定 ──────────────────────────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM site_settings')
    const s = {}; r.rows.forEach(row => s[row.key] = row.value)
    res.json({ success: true, data: s })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.post('/settings', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    for (const [k,v] of Object.entries(req.body)) {
      await pool.query(
        'INSERT INTO site_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
        [k, v]
      )
    }
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 修改密碼 ──────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.session.userId])
    const user = r.rows[0]
    if (!user || !bcrypt.compareSync(oldPassword, user.password))
      return res.json({ success: false, message: '舊密碼錯誤' })
    const hash = bcrypt.hashSync(newPassword, 10)
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.session.userId])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── Campus 區塊 CRUD ──────────────────────────────────────
router.get('/campus-blocks', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM campus_blocks ORDER BY sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.post('/campus-blocks', requireAuth, async (req, res) => {
  const { type, content, image_url, sort_order } = req.body
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'INSERT INTO campus_blocks (type,content,image_url,sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
      [type, content || null, image_url || null, sort_order || 0]
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.put('/campus-blocks/:id', requireAuth, async (req, res) => {
  const { type, content, image_url, sort_order } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      'UPDATE campus_blocks SET type=$1,content=$2,image_url=$3,sort_order=$4 WHERE id=$5',
      [type, content || null, image_url || null, sort_order || 0, req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.delete('/campus-blocks/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM campus_blocks WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── Campus 按鈕 CRUD ──────────────────────────────────────
router.get('/campus-buttons', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM campus_buttons ORDER BY sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.post('/campus-buttons', requireAuth, async (req, res) => {
  const { name, url, target, sort_order } = req.body
  if (!name || !url) return res.json({ success: false, message: '欄位不完整' })
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'INSERT INTO campus_buttons (name,url,target,sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, url, target || '_self', sort_order || 0]
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.put('/campus-buttons/:id', requireAuth, async (req, res) => {
  const { name, url, target, sort_order } = req.body
  const pool = req.app.locals.pool
  try {
    await pool.query(
      'UPDATE campus_buttons SET name=$1,url=$2,target=$3,sort_order=$4 WHERE id=$5',
      [name, url, target || '_self', sort_order || 0, req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
router.delete('/campus-buttons/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM campus_buttons WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

export default router

// ── 差勤管理（後台）───────────────────────────────────────
router.get('/leaves', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM leave_requests ORDER BY created_at DESC')
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.put('/leaves/:id/approve', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query(
      `UPDATE leave_requests SET status='已批准', review_time=NOW() WHERE id=$1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.put('/leaves/:id/reject', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query(
      `UPDATE leave_requests SET status='已駁回', review_time=NOW() WHERE id=$1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 巡堂管理（後台）───────────────────────────────────────
router.get('/inspections', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      'SELECT * FROM class_inspections ORDER BY inspection_date DESC, created_at DESC'
    )
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.delete('/inspections/:id', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query('DELETE FROM class_inspections WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
