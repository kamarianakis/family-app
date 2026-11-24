import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore'
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
  // Δοκιμαστική ειδοποίηση: δείχνει ότι η συσκευή μπορεί να εμφανίσει ειδοποιήσεις
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification('Οικογένεια', {
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

// Κείμενο διάγνωσης για να δούμε τι συμβαίνει στη συσκευή
export async function diagnose(uid) {
  const out = []
  out.push(`Άδεια: ${'Notification' in window ? Notification.permission : 'n/a'}`)
  out.push(`Εγκατεστημένη (standalone): ${navigator.standalone === true || matchMedia('(display-mode: standalone)').matches ? 'ναι' : 'όχι'}`)
  const tok = localStorage.getItem(KEY)
  out.push(`Token εδώ: ${tok ? '…' + tok.slice(-8) : 'κανένα'}`)
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    const toks = snap.data()?.tokens || []
    out.push(`Tokens στη βάση: ${toks.length}${tok ? (toks.includes(tok) ? ' (το δικό μου υπάρχει)' : ' (το δικό μου ΔΕΝ υπάρχει)') : ''}`)
  } catch (e) {
    out.push('Tokens στη βάση: σφάλμα ' + e.message)
  }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    out.push(`Push subscription: ${sub ? 'ναι' : 'ΟΧΙ'}`)
    const pong = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 2000)
      const h = (e) => {
        if (e.data?.type === 'pong') {
          clearTimeout(t)
          navigator.serviceWorker.removeEventListener('message', h)
          resolve(e.data)
        }
      }
      navigator.serviceWorker.addEventListener('message', h)
      reg.active?.postMessage('ping')
    })
    if (!pong) out.push('Service worker: δεν απάντησε (παλιά έκδοση;)')
    else {
      out.push(`Service worker: έκδοση ${pong.v}`)
      out.push(pong.last ? `Τελευταίο push: ${new Date(pong.last.t).toLocaleString('el-GR')} «${pong.last.body}»` : 'Τελευταίο push: δεν έχει έρθει κανένα')
    }
  } catch (e) {
    out.push('SW σφάλμα: ' + e.message)
  }
  return out.join('\n')
}
