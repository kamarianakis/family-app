// Φορτώνεται μέσα στο service worker της εφαρμογής (workbox importScripts)
self.addEventListener('push', (event) => {
  let p = {}
  try {
    p = event.data ? event.data.json() : {}
  } catch (e) {
    p = {}
  }
  const d = p.data || p
  const n = p.notification || {}
  const title = d.title || n.title || 'Οικογένεια'
  const body = d.body || n.body || ''
  event.waitUntil(
    (async () => {
      // Αν η εφαρμογή είναι ανοιχτή μπροστά σου, δεν χρειάζεται ειδοποίηση
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return
      await self.registration.showNotification(title, {
        body,
        icon: '/family-app/pwa-192x192.png',
        badge: '/family-app/pwa-64x64.png',
        tag: 'chat',
        renotify: true,
        data: { url: d.url || '/family-app/' }
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/family-app/'
  event.waitUntil(
    (async () => {
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          w.postMessage({ type: 'open-tab', tab: 'chat' })
          return
        }
      }
      await clients.openWindow(url)
    })()
  )
})
