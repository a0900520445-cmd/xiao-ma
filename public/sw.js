// ── 御園國小 Service Worker ──────────────────────────────
// 負責接收 Web Push 推播並顯示系統通知（即使網站沒開著）

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// 接收伺服器推送的訊息並顯示通知
self.addEventListener('push', (event) => {
  let data = { title: '御園國小', body: '您有一則新通知', url: '/' }
  try {
    if (event.data) data = event.data.json()
  } catch (e) {
    data.body = event.data ? event.data.text() : data.body
  }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '御園國小', options)
  )
})

// 點擊通知時跳轉到對應頁面
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
