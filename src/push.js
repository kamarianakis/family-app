import { arrayRemove, arrayUnion, doc, setDoc } from 'firebase/firestore'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import { app, db } from './firebase'

const KEY = 'pushToken'

// 'unsupported' | 'needs-install' (iPhone εκτός αρχικής οθόνης) | 'denied' | 'off' | 'on'
export async function pushStatus() {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  if (!('Notification' in window)) {
    return /iPhone|iPad/.test(navigator.userAgent) ? 'needs-install' : 'unsupported'
  }
  if (!(await isSupported().catch(() => false))) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted' && localStorage.getItem(KEY)) return 'on'
  return 'off'
}

// Τρέχει ένα βήμα με χρονικό όριο και μήνυμα που λέει ποιο βήμα απέτυχε
function step(label, promise, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: δεν απάντησε σε ${ms / 1000}"`)), ms)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(new Error(`${label}: ${e?.code || ''} ${e?.message || e}`.trim()))
      }
    )
  })
}

async function fetchToken() {
  const reg = await step('Service worker', navigator.serviceWorker.ready, 8000)
  // Χωρίς vapidKey, το Firebase χρησιμοποιεί το προεπιλεγμένο κλειδί του project
  return step('Token ειδοποιήσεων', getToken(getMessaging(app), { serviceWorkerRegistration: reg }))
}

async function saveToken(uid, token) {
  await step('Αποθήκευση', setDoc(doc(db, 'users', uid), { tokens: arrayUnion(token) }, { merge: true }))
  localStorage.setItem(KEY, token)
}

// Πρέπει να κληθεί από πάτημα κουμπιού (απαίτηση του iOS)
export async function enablePush(uid) {
  const perm = await step('Άδεια', Notification.requestPermission(), 60000)
  if (perm !== 'granted') throw new Error('Δεν δόθηκε άδεια για ειδοποιήσεις.')
  const token = await fetchToken()
  if (!token) throw new Error('Δεν δημιουργήθηκε token ειδοποιήσεων.')
  await saveToken(uid, token)
  // Δοκιμαστική ειδοποίηση: δείχνει ότι η συσκευή μπορεί να εμφανίσει ειδοποιήσεις
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification('MyFamilyApp', {
      body: 'Οι ειδοποιήσεις είναι ενεργές ✓',
      icon: '/family-app/pwa-192x192.png'
    })
  } catch (e) {
    console.warn('test notification', e)
  }
}

export async function disablePush(uid) {
  const token = localStorage.getItem(KEY)
  localStorage.removeItem(KEY)
  if (token) {
    await setDoc(doc(db, 'users', uid), { tokens: arrayRemove(token) }, { merge: true })
    await deleteToken(getMessaging(app)).catch(() => {})
  }
}

// Σε κάθε άνοιγμα: αν έχει δοθεί άδεια, ανανέωσε σιωπηλά το token (μπορεί να άλλαξε)
export async function refreshPush(uid) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !localStorage.getItem(KEY)) return
  try {
    const token = await fetchToken()
    if (token) await saveToken(uid, token)
  } catch (e) {
    console.warn('push refresh', e)
  }
}
