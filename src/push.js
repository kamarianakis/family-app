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

async function fetchToken() {
  const reg = await navigator.serviceWorker.ready
  // Χωρίς vapidKey, το Firebase χρησιμοποιεί το προεπιλεγμένο κλειδί του project
  return getToken(getMessaging(app), { serviceWorkerRegistration: reg })
}

async function saveToken(uid, token) {
  await setDoc(doc(db, 'users', uid), { tokens: arrayUnion(token) }, { merge: true })
  localStorage.setItem(KEY, token)
}

// Πρέπει να κληθεί από πάτημα κουμπιού (απαίτηση του iOS)
export async function enablePush(uid) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Δεν δόθηκε άδεια για ειδοποιήσεις.')
  const token = await fetchToken()
  if (!token) throw new Error('Δεν δημιουργήθηκε token ειδοποιήσεων.')
  await saveToken(uid, token)
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
