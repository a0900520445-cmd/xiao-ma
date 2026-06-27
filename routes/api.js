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

// ── 訪客計數 ──────────────────────────────────────────────
router.post('/visitor', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    await pool.query(`
      INSERT INTO site_settings (key, value) VALUES ('visitor_count', '1')
      ON CONFLICT (key) DO UPDATE SET value = (CAST(site_settings.value AS BIGINT) + 1)::TEXT
    `)
    const r = await pool.query(`SELECT value FROM site_settings WHERE key='visitor_count'`)
    res.json({ success: true, count: parseInt(r.rows[0]?.value || 0) })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/visitor', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(`SELECT value FROM site_settings WHERE key='visitor_count'`)
    res.json({ success: true, count: parseInt(r.rows[0]?.value || 0) })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

export default router

// ── 差勤：提交請假（公開）────────────────────────────────
router.post('/leaves', async (req, res) => {
  const pool = req.app.locals.pool
  const { student_id, name, class: cls, leave_type, start_date, end_date, reason } = req.body
  if (!student_id || !name || !cls || !leave_type || !start_date || !end_date || !reason)
    return res.json({ success: false, message: '請填寫所有欄位' })
  try {
    const r = await pool.query(
      `INSERT INTO leave_requests (student_id,name,class,leave_type,start_date,end_date,reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [student_id, name, cls, leave_type, start_date, end_date, reason]
    )
    // 新請假申請 → 寫入後台通知
    await pool.query(
      `INSERT INTO notifications (type,title,message,link,target) VALUES ($1,$2,$3,$4,'admin')`,
      ['leave', '📋 新的請假申請', `${name}（${cls}）申請${leave_type}`, '/admin/dashboard.html']
    )
    await req.app.locals.sendPushToTarget('admin', {
      title: '📋 新的請假申請',
      body: `${name}（${cls}）申請${leave_type}`,
      url: '/admin/dashboard.html'
    })
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 差勤：查詢請假狀態（公開，依學號）───────────────────
router.get('/leaves/query', async (req, res) => {
  const pool = req.app.locals.pool
  const { student_id } = req.query
  if (!student_id) return res.json({ success: false, message: '請輸入學號' })
  try {
    const r = await pool.query(
      `SELECT id,name,class,leave_type,start_date,end_date,reason,status,created_at,review_time
       FROM leave_requests WHERE student_id=$1 ORDER BY created_at DESC`,
      [student_id]
    )
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 巡堂：送出記錄（公開）────────────────────────────────
router.post('/inspections', async (req, res) => {
  const pool = req.app.locals.pool
  const { class_name, teacher_name, score, comment, inspection_date,
          period, subject, subject_teacher, inspector_position } = req.body
  if (!class_name || !teacher_name || score === undefined || !inspection_date)
    return res.json({ success: false, message: '請填寫所有必填欄位' })
  if (score < 0 || score > 100)
    return res.json({ success: false, message: '分數需介於 0～100' })
  try {
    const r = await pool.query(
      `INSERT INTO class_inspections
        (class_name,teacher_name,score,comment,inspection_date,period,subject,subject_teacher,inspector_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [class_name, teacher_name, score, comment||null, inspection_date,
       period||null, subject||null, subject_teacher||null, inspector_position||null]
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 榮譽榜（前台公開）─────────────────────────────────────
router.get('/honors', async (req, res) => {
  const pool = req.app.locals.pool
  const { category } = req.query
  try {
    let q = 'SELECT * FROM honor_board'
    const params = []
    if (category) { q += ' WHERE category=$1'; params.push(category) }
    q += ' ORDER BY award_date DESC NULLS LAST, created_at DESC'
    const r = await pool.query(q, params)
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 通知（前台公開，target='public'）────────────────────
router.get('/notifications', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query(
      `SELECT * FROM notifications WHERE target='public' ORDER BY created_at DESC LIMIT 20`
    )
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── Web Push 訂閱（公開，前台訪客）───────────────────────
router.get('/push/vapid-public-key', (req, res) => {
  res.json({ success: true, key: req.app.locals.vapidPublicKey })
})

router.post('/push/subscribe', async (req, res) => {
  const pool = req.app.locals.pool
  const { subscription, target } = req.body
  if (!subscription || !subscription.endpoint || !subscription.keys)
    return res.json({ success: false, message: '訂閱資料不完整' })
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint,p256dh,auth,target)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh=$2, auth=$3, target=$4`,
      [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, target || 'public']
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/push/unsubscribe', async (req, res) => {
  const pool = req.app.locals.pool
  const { endpoint } = req.body
  if (!endpoint) return res.json({ success: false })
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 學生點數查詢（公開，依學號）──────────────────────────
router.get('/points/query', async (req, res) => {
  const pool = req.app.locals.pool
  const { student_id } = req.query
  if (!student_id) return res.json({ success: false, message: '請輸入學號' })
  try {
    const studentR = await pool.query(
      `SELECT * FROM students WHERE student_id=$1`, [student_id]
    )
    if (studentR.rows.length === 0) {
      return res.json({ success: false, message: '查無此學號的資料' })
    }
    const student = studentR.rows[0]
    const recordsR = await pool.query(
      `SELECT * FROM point_records WHERE student_id=$1 ORDER BY created_at DESC`,
      [student_id]
    )
    const totalR = await pool.query(
      `SELECT COALESCE(SUM(points),0) AS total FROM point_records WHERE student_id=$1`,
      [student_id]
    )
    res.json({
      success: true,
      student: { student_id: student.student_id, name: student.name, class_name: student.class_name },
      total: parseInt(totalR.rows[0].total),
      records: recordsR.rows
    })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
