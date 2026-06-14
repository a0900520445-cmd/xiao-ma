// ── 共用：日期格式化（去除 T00:00:00.000Z）────────────────
function formatDate(dateStr) {
  if (!dateStr) return ''
  return String(dateStr).slice(0, 10)
}

// ── 載入網站設定 & 選單 & 公告 ───────────────────────────
async function loadSiteData() {
  try {
    const [settRes, navRes, annRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/nav-buttons'),
      fetch('/api/announcements')
    ])
    const settings = (await settRes.json()).data || {}
    const navData  = (await navRes.json()).data  || []
    const annData  = (await annRes.json()).data  || []

    if (settings.site_title) {
      document.title = settings.site_title + ' - 官方網站'
      const el = document.getElementById('site-title')
      if (el) el.textContent = settings.site_title
    }
    if (settings.site_subtitle) {
      const el = document.getElementById('site-subtitle')
      if (el) el.textContent = settings.site_subtitle
    }
    document.querySelectorAll('.site-address').forEach(el => el.textContent = settings.site_address || '')
    document.querySelectorAll('.site-phone').forEach(el => el.textContent = settings.site_phone || '')
    document.querySelectorAll('.site-email').forEach(el => el.textContent = settings.site_email || '')

    buildNav(navData)
    buildAnnouncements(annData)
  } catch (e) {
    console.error('載入資料失敗', e)
  }
}

function buildNav(navItems) {
  const nav = document.getElementById('main-nav')
  if (!nav) return
  nav.innerHTML = ''
  const parents = navItems.filter(n => !n.parent_id)
  const children = navItems.filter(n => n.parent_id)
  parents.forEach(item => {
    const li = document.createElement('li')
    li.className = 'nav-item'
    const subs = children.filter(c => String(c.parent_id) === String(item.id))
    if (subs.length > 0) {
      li.innerHTML = `
        <a href="${item.url}" class="nav-link" target="${item.target}">${item.name} ▾</a>
        <div class="sub-menu">
          ${subs.map(s => `<a href="${s.url}" target="${s.target}">${s.name}</a>`).join('')}
        </div>`
    } else {
      li.innerHTML = `<a href="${item.url}" class="nav-link" target="${item.target}">${item.name}</a>`
    }
    nav.appendChild(li)
  })
}

function buildAnnouncements(anns) {
  const container = document.getElementById('announcement-list')
  if (!container) return
  if (anns.length === 0) {
    container.innerHTML = '<div class="no-announcements">目前沒有公告</div>'
    return
  }
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  container.innerHTML = anns.map(ann => {
    const dateStr = formatDate(ann.date)
    const isNew = dateStr >= sevenDaysAgo
    const imgHtml = ann.image_url
      ? `<div class="ann-img"><img src="${ann.image_url}" alt="公告圖片" loading="lazy"></div>`
      : ''
    return `
      <div class="announcement-item">
        <div class="ann-date">${dateStr}</div>
        <div class="ann-content">
          <div class="ann-title">${escapeHtml(ann.title)}${isNew ? '<span class="ann-new">NEW</span>' : ''}</div>
          <div class="ann-text">${escapeHtml(ann.content)}</div>
          ${imgHtml}
        </div>
      </div>`
  }).join('')
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 頁面離開平滑轉場 ────────────────────────────────────────
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]')
  if (!a) return
  const href = a.getAttribute('href')
  if (!href || href.startsWith('#') || href.startsWith('javascript') ||
      a.target === '_blank' || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  document.body.classList.add('page-leaving')
  setTimeout(() => { window.location.href = href }, 280)
})

// ── 登入 Modal ────────────────────────────────────────────
function openLoginModal() {
  document.getElementById('login-modal').classList.add('active')
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('active')
  document.getElementById('login-error').classList.remove('show')
}

async function doLogin() {
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value
  const errEl = document.getElementById('login-error')
  if (!username || !password) {
    errEl.textContent = '請輸入帳號與密碼'
    errEl.classList.add('show')
    return
  }
  const res = await fetch('/admin-api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()
  if (data.success) {
    window.location.href = '/admin/dashboard.html'
  } else {
    errEl.textContent = data.message || '登入失敗'
    errEl.classList.add('show')
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSiteData()

  // 手機版子選單：點擊父連結展開/收合
  document.addEventListener('click', e => {
    const link = e.target.closest('.nav-link')
    if (!link) return
    const item = link.closest('.nav-item')
    if (!item) return
    const sub = item.querySelector('.sub-menu')
    if (!sub) return
    if (window.innerWidth <= 768) {
      e.preventDefault()
      item.classList.toggle('open')
    }
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('login-modal').classList.contains('active')) doLogin()
    if (e.key === 'Escape') closeLoginModal()
  })
  document.getElementById('login-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeLoginModal()
  })
})
