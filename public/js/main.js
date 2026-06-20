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

// ── 通知功能 ──────────────────────────────────────────────
let _notifications = []

function fmtNotifTime(d) {
  const dt = new Date(d)
  const now = new Date()
  const diffMin = Math.floor((now - dt) / 60000)
  if (diffMin < 1) return '剛剛'
  if (diffMin < 60) return `${diffMin} 分鐘前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小時前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return dt.toLocaleDateString('zh-TW')
}

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications')
    const data = await res.json()
    _notifications = data.data || []
    renderNotifPanel()
    updateNotifBadge()
  } catch(e) { console.error('載入通知失敗', e) }
}

function renderNotifPanel() {
  const list = document.getElementById('notif-list')
  if (!list) return
  if (_notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">目前沒有新通知</div>'
    return
  }
  const ICONS = { announcement: '📢', leave: '📋', honor: '🏆', inspection: '🏫' }
  list.innerHTML = _notifications.map(n => `
    <a class="notif-item" href="${n.link || '#'}" onclick="closeNotifPanel()">
      <div class="notif-icon">${ICONS[n.type] || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-msg">${escapeHtml(n.message || '')}</div>
        <div class="notif-time">${fmtNotifTime(n.created_at)}</div>
      </div>
    </a>`).join('')
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge')
  const bell  = document.querySelector('.btn-notif')
  if (!badge) return
  const lastSeenId = parseInt(localStorage.getItem('notif_last_seen_id') || '0')
  const unread = _notifications.filter(n => n.id > lastSeenId).length
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread
    badge.style.display = 'flex'
    if (bell) bell.classList.add('has-new')
  } else {
    badge.style.display = 'none'
    if (bell) bell.classList.remove('has-new')
  }
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel')
  if (!panel) return
  const isOpen = panel.classList.contains('open')
  if (isOpen) {
    closeNotifPanel()
  } else {
    panel.classList.add('open')
    // 標記已讀（記住目前最新的通知 id）
    if (_notifications.length > 0) {
      const maxId = Math.max(..._notifications.map(n => n.id))
      localStorage.setItem('notif_last_seen_id', maxId)
      updateNotifBadge()
    }
  }
}
function closeNotifPanel() {
  document.getElementById('notif-panel')?.classList.remove('open')
}

// 點外部關閉通知面板
document.addEventListener('click', e => {
  const wrap = document.querySelector('.notif-wrap')
  if (wrap && !wrap.contains(e.target)) closeNotifPanel()
})

// ── Web Push 推播訂閱 ────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function initWebPush() {
  // 環境檢查：不支援的瀏覽器直接跳過，不報錯
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('此瀏覽器不支援推播通知')
    return
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')

    // 若已經訂閱過，不重複詢問
    const existing = await reg.pushManager.getSubscription()
    if (existing) return

    // 若使用者之前已明確拒絕，不再打擾
    if (Notification.permission === 'denied') return

    // 只有使用者主動點擊「開啟通知」按鈕才會呼叫 subscribeWebPush()
  } catch (e) {
    console.log('Service Worker 註冊失敗', e)
  }
}

async function subscribeWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('您的瀏覽器不支援推播通知功能')
    return
  }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      alert('您已拒絕通知權限，若要開啟請至瀏覽器設定中允許本網站的通知')
      return
    }

    const reg = await navigator.serviceWorker.ready
    const keyRes = await fetch('/api/push/vapid-public-key')
    const keyData = await keyRes.json()

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.key)
      })
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, target: 'public' })
    })

    localStorage.setItem('push_subscribed', '1')
    updatePushButton()
    alert('✅ 通知已開啟！之後有新公告或榮譽榜更新會主動推送給您。')
  } catch (e) {
    console.error('訂閱推播失敗', e)
    alert('開啟通知失敗，請稍後再試')
  }
}

async function unsubscribeWebPush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint })
      })
      await sub.unsubscribe()
    }
    localStorage.removeItem('push_subscribed')
    updatePushButton()
    alert('已關閉推播通知')
  } catch (e) {
    console.error('取消訂閱失敗', e)
  }
}

function updatePushButton() {
  const btn = document.getElementById('push-toggle-btn')
  if (!btn) return
  const subscribed = localStorage.getItem('push_subscribed') === '1'
  const isMobile = window.innerWidth <= 600
  if (isMobile) {
    btn.textContent = subscribed ? '🔔' : '🔕'
  } else {
    btn.textContent = subscribed ? '🔔 通知已開啟' : '🔕 開啟推播通知'
  }
  btn.classList.toggle('subscribed', subscribed)
}

async function togglePushSubscription() {
  const subscribed = localStorage.getItem('push_subscribed') === '1'
  if (subscribed) {
    await unsubscribeWebPush()
  } else {
    await subscribeWebPush()
  }
}

// ── 公告詳情 Modal（全域共用，動態插入 HTML）──────────────
function ensureAnnDetailModal() {
  if (document.getElementById('ann-detail-modal-global')) return
  const modal = document.createElement('div')
  modal.id = 'ann-detail-modal-global'
  modal.className = 'modal-overlay'
  modal.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;align-items:center;justify-content:center;overflow:hidden;z-index:9999;'
  modal.innerHTML = `
    <div class="modal-box ann-detail-box">
      <button class="modal-close" onclick="closeAnnDetailGlobal()">✕</button>
      <div id="ann-detail-content-global"><div class="no-announcements">載入中...</div></div>
    </div>`
  document.body.appendChild(modal)
  modal.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAnnDetailGlobal()
  })
}

function openAnnDetailGlobal(id) {
  ensureAnnDetailModal()
  const ann = _allAnns.find(a => Number(a.id) === Number(id))
  if (!ann) return
  const imgHtml = ann.image_url
    ? `<div class="detail-img"><img src="${ann.image_url}" alt="公告圖片"></div>`
    : ''
  document.getElementById('ann-detail-content-global').innerHTML = `
    <div class="detail-date">📅 ${formatDate(ann.date)}</div>
    <h2 class="detail-title">${escapeHtml(ann.title)}</h2>
    ${imgHtml}
    <div class="detail-body">${escapeHtml(ann.content)}</div>
  `
  const modal = document.getElementById('ann-detail-modal-global')
  modal.style.display = 'flex'
  document.body.classList.add('modal-open')
}
function closeAnnDetailGlobal() {
  const modal = document.getElementById('ann-detail-modal-global')
  if (modal) modal.style.display = 'none'
  document.body.classList.remove('modal-open')
}

// ── 訪客計數 ──────────────────────────────────────────────
async function initVisitorCounter() {
  const el = document.getElementById('visitor-num')
  if (!el) return
  try {
    // 用 sessionStorage 避免同一次瀏覽重複計算
    const counted = sessionStorage.getItem('visit_counted')
    let count
    if (!counted) {
      const res = await fetch('/api/visitor', { method: 'POST' })
      const data = await res.json()
      count = data.count
      sessionStorage.setItem('visit_counted', '1')
    } else {
      const res = await fetch('/api/visitor')
      const data = await res.json()
      count = data.count
    }
    // 數字滾動動畫
    animateCount(el, 0, count, 1200)
  } catch(e) {
    if (el) el.textContent = '—'
  }
}

function animateCount(el, from, to, duration) {
  const start = performance.now()
  const update = (now) => {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    // easeOutQuart
    const ease = 1 - Math.pow(1 - progress, 4)
    el.textContent = Math.floor(from + (to - from) * ease).toLocaleString()
    if (progress < 1) requestAnimationFrame(update)
    else el.textContent = to.toLocaleString()
  }
  requestAnimationFrame(update)
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

// ── 公告：全域資料 & 狀態 ──────────────────────────────────
let _allAnns = []       // 全部公告
let _annShowing = 5    // 目前顯示幾筆
const ANN_PAGE = 5     // 每次多顯示幾筆

function buildAnnouncements(anns) {
  _allAnns = anns
  _annShowing = ANN_PAGE
  renderAnnouncements(_allAnns, _annShowing)
}

function renderAnnouncements(anns, limit) {
  const container = document.getElementById('announcement-list')
  const moreWrap  = document.getElementById('ann-more-wrap')
  const moreBtn   = document.getElementById('ann-more-btn')
  if (!container) return

  if (!anns || anns.length === 0) {
    container.innerHTML = '<div class="no-announcements">目前沒有公告</div>'
    if (moreWrap) moreWrap.style.display = 'none'
    return
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const visible = anns.slice(0, limit)

  container.innerHTML = visible.map(ann => {
    const dateStr = formatDate(ann.date)
    const isNew = dateStr >= sevenDaysAgo
    const imgBadge = ann.image_url
      ? `<span class="ann-has-img">🖼 含附圖</span>`
      : ''
    return `
      <div class="announcement-item ann-clickable" onclick="openAnnDetailGlobal(${ann.id})">
        <div class="ann-date">${dateStr}</div>
        <div class="ann-content">
          <div class="ann-title">${escapeHtml(ann.title)}${isNew ? '<span class="ann-new">NEW</span>' : ''}</div>
          <div class="ann-text">${escapeHtml(ann.content)}</div>
          ${imgBadge}
        </div>
        <div class="ann-arrow">›</div>
      </div>`
  }).join('')

  // 更多按鈕
  if (moreWrap) {
    if (anns.length > limit) {
      moreWrap.style.display = 'block'
      if (moreBtn) moreBtn.textContent = `查看更多公告（還有 ${anns.length - limit} 則）↓`
    } else {
      moreWrap.style.display = 'none'
    }
  }
}

function showMoreAnn() {
  _annShowing += ANN_PAGE
  const keyword = document.getElementById('ann-search')?.value?.trim() || ''
  const filtered = keyword ? filterAnns(keyword) : _allAnns
  renderAnnouncements(filtered, _annShowing)
}

// ── 搜尋功能 ──────────────────────────────────────────────
function filterAnns(keyword) {
  const kw = keyword.toLowerCase()
  return _allAnns.filter(a =>
    a.title.toLowerCase().includes(kw) ||
    a.content.toLowerCase().includes(kw)
  )
}

function searchAnnouncements(keyword) {
  const clearBtn = document.getElementById('ann-search-clear')
  const hint     = document.getElementById('ann-search-hint')
  if (clearBtn) clearBtn.style.display = keyword ? 'block' : 'none'
  _annShowing = ANN_PAGE
  if (!keyword.trim()) {
    renderAnnouncements(_allAnns, _annShowing)
    if (hint) hint.style.display = 'none'
    return
  }
  const result = filterAnns(keyword)
  renderAnnouncements(result, _annShowing)
  if (hint) {
    hint.style.display = 'block'
    hint.textContent = result.length > 0
      ? `找到 ${result.length} 筆符合「${keyword}」的公告`
      : `找不到符合「${keyword}」的公告`
  }
}

function clearSearch() {
  const input = document.getElementById('ann-search')
  if (input) input.value = ''
  searchAnnouncements('')
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
  // 用 style 直接設定，不用 class，避免 pageshow 時殘留
  document.body.style.transition = 'opacity .25s ease, transform .25s ease'
  document.body.style.opacity = '0'
  document.body.style.transform = 'translateY(-8px)'
  setTimeout(() => { window.location.href = href }, 260)
})

// 瀏覽器返回/前進時重設（pageshow 會觸發，包含 bfcache）
window.addEventListener('pageshow', () => {
  document.body.style.transition = ''
  document.body.style.opacity = ''
  document.body.style.transform = ''
})

// ── 登入 Modal ────────────────────────────────────────────
function openLoginModal() {
  const m = document.getElementById('login-modal')
  m.style.display = 'flex'
  // 鎖定頁面捲動
  document.body.classList.add('modal-open')
}
function closeLoginModal() {
  document.getElementById('login-modal').style.display = 'none'
  // 解鎖頁面捲動
  document.body.classList.remove('modal-open')
  const err = document.getElementById('login-error')
  if (err) err.classList.remove('show')
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
  initVisitorCounter()
  loadNotifications()
  initWebPush()
  updatePushButton()
  // 每 60 秒檢查新通知
  setInterval(loadNotifications, 60000)

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
