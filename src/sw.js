import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

// Οι χειριστές συμβάντων δηλώνονται στο πάνω επίπεδο (απαίτηση WebKit/iOS για push)
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/family-app/index.html')))

const PUSH_SW_VERSION = 4

// Κρατάει πότε ήρθε το τελευταίο push (για διάγνωση)
async function logPush(info) {
  try {
    const c = await caches.open('push-log')
    await c.put('last', new Response(JSON.stringify({ t: Date.now(), ...info })))
  } catch (e) {}
}

self.addEventListener('message', (event) => {
  if (event.data !== 'ping') return
  event.waitUntil(
    (async () => {
      let last = null
      try {
        const c = await caches.open('push-log')
        const r = await c.match('last')
        last = r ? await r.json() : null
      } catch (e) {}
      event.source && event.source.postMessage({ type: 'pong', v: PUSH_SW_VERSION, last })
    })()
  )
})

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
  // Δείχνουμε πάντα την ειδοποίηση (το iOS το απαιτεί για κάθε push)
  event.waitUntil(
    Promise.all([
      logPush({ title, body: body.slice(0, 40) }),
      self.registration.showNotification(title, {
        body,
        icon: '/family-app/pwa-192x192.png',
        badge: '/family-app/pwa-64x64.png',
        tag: 'chat',
        renotify: true,
        data: { url: d.url || '/family-app/' }
      })
    ])
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
