import { Component, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from './firebase'
import { useCol } from './hooks'
import { disablePush, enablePush, pushStatus, refreshPush } from './push'
import Shopping from './tabs/Shopping'
import Bills from './tabs/Bills'
import Payments from './tabs/Payments'
import Calendar from './tabs/Calendar'
import Chat from './tabs/Chat'

const TABS = [
  { id: 'shopping', label: 'Ψώνια', icon: '🛒', C: Shopping },
  { id: 'bills', label: 'Λογαριασμοί', icon: '🧾', C: Bills },
  { id: 'payments', label: 'Πληρωμές', icon: '💶', C: Payments },
  { id: 'calendar', label: 'Ημερολόγιο', icon: '📅', C: Calendar },
  { id: 'chat', label: 'Chat', icon: '💬', C: Chat }
]

function Login({ error }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(error)
  const go = async () => {
    setBusy(true)
    setErr('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setErr(e.message)
      }
      setBusy(false)
    }
  }
  return (
    <div className="login">
      <div className="logo">🏠</div>
      <h1>Οικογένεια</h1>
      <p>Ψώνια, λογαριασμοί, πληρωμές, ημερολόγιο και chat — μόνο για εμάς.</p>
      <button className="primary big" onClick={go} disabled={busy}>
        {busy ? 'Σύνδεση…' : 'Σύνδεση με Google'}
      </button>
      {err && <p className="error">{err}</p>}
    </div>
  )
}

// Αν κάποιο tab σπάσει, δείχνει το σφάλμα αντί για μαύρη οθόνη
class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="login">
        <div className="logo">⚠️</div>
        <h1>Κάτι πήγε στραβά</h1>
        <p className="error">{String(this.state.error?.message || this.state.error)}</p>
        <button
          className="primary"
          onClick={() => {
            this.setState({ error: null })
            this.props.onReset()
          }}
        >
          Πίσω στα Ψώνια
        </button>
      </div>
    )
  }
}

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = φορτώνει
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState(() =>
    location.hash === '#chat' ? 'chat' : localStorage.getItem('tab') || 'shopping'
  )
  const [push, setPush] = useState('off')
  const [users, usersReady] = useCol('users')
  const [msgs] = useCol('messages', ['createdAt', 'desc'], 100)
  const [visible, setVisible] = useState(document.visibilityState === 'visible')

  useEffect(() => {
    getRedirectResult(auth).catch(() => {})
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setDenied(false)
      if (u) {
        try {
          await setDoc(
            doc(db, 'users', u.uid),
            { name: u.displayName || u.email, email: u.email, photo: u.photoURL || '' },
            { merge: true }
          )
        } catch (e) {
          if (e.code === 'permission-denied') setDenied(true)
        }
      }
    })
  }, [])

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    localStorage.setItem('tab', tab)
    // Το #chat στη διεύθυνση δείχνει στο service worker ότι βλέπεις το chat
    try {
      history.replaceState(null, '', tab === 'chat' ? '#chat' : location.pathname + location.search)
    } catch (e) {}
  }, [tab])

  // Πάτημα σε ειδοποίηση -> άνοιγμα του chat
  useEffect(() => {
    const onMsg = (e) => e.data?.type === 'open-tab' && setTab(e.data.tab)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (!user) return
    pushStatus().then(setPush)
    refreshPush(user.uid)
  }, [user])

  const togglePush = async () => {
    try {
      if (push === 'on') {
        if (!confirm('Απενεργοποίηση ειδοποιήσεων σε αυτή τη συσκευή;')) return
        await disablePush(user.uid)
      } else if (push === 'needs-install') {
        return alert('Στο iPhone, πρώτα πρόσθεσε την εφαρμογή στην Αρχική οθόνη (Κοινοποίηση → Προσθήκη στην Αρχική οθόνη) και άνοιξέ την από εκεί.')
      } else if (push === 'denied') {
        return alert('Οι ειδοποιήσεις είναι μπλοκαρισμένες. Άλλαξέ το από τις ρυθμίσεις του κινητού για αυτή την εφαρμογή.')
      } else if (push === 'unsupported') {
        return alert('Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις.')
      } else {
        await enablePush(user.uid)
      }
    } catch (e) {
      alert(
        /push service error/i.test(e.message)
          ? 'Αυτός ο browser δεν μπορεί να λάβει push ειδοποιήσεις (δεν έχει πρόσβαση στην υπηρεσία push της Google). Δοκίμασε από Chrome/Edge/Safari ή από την εγκατεστημένη εφαρμογή στο κινητό.'
          : e.message
      )
    }
    setPush(await pushStatus())
  }

  // Αδιάβαστα: μηνύματα του άλλου μετά την τελευταία φορά που είδα το chat (αποθηκεύεται στο προφίλ μου)
  const myDoc = user ? users.find((u) => u.id === user.uid) : null
  const seenAt = myDoc?.chatSeenAt?.toMillis ? myDoc.chatSeenAt.toMillis() : 0
  const unread = !user || !myDoc?.chatSeenAt
    ? 0
    : msgs.filter((m) => m.by !== user.uid && m.createdAt?.toMillis && m.createdAt.toMillis() > seenAt).length

  useEffect(() => {
    if (!user || !usersReady || !myDoc) return
    // πρώτη φορά: όσα υπάρχουν ήδη θεωρούνται διαβασμένα· μετά, όσο βλέπω το chat
    if (!myDoc.chatSeenAt || (tab === 'chat' && visible && unread > 0)) {
      updateDoc(doc(db, 'users', user.uid), { chatSeenAt: serverTimestamp() }).catch(() => {})
    }
  }, [user, usersReady, myDoc?.chatSeenAt, tab, visible, unread])

  // Badge στο εικονίδιο της εφαρμογής (iOS/Android όταν υποστηρίζεται)
  useEffect(() => {
    try {
      caches.open('badge').then((c) => c.put('count', new Response(String(unread))))
      if (unread > 0) navigator.setAppBadge?.(unread)
      else navigator.clearAppBadge?.()
    } catch (e) {}
  }, [unread])

  if (user === undefined) return <div className="center">Φόρτωση…</div>
  if (!user) return <Login />
  if (denied)
    return (
      <div className="login">
        <div className="logo">🔒</div>
        <h1>Δεν έχεις πρόσβαση</h1>
        <p>Το {user.email} δεν είναι στη λίστα της οικογένειας.</p>
        <button onClick={() => signOut(auth)}>Αποσύνδεση</button>
      </div>
    )

  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  const Active = TABS.find((t) => t.id === tab).C
  return (
    <div className="app">
      <header>
        <h2>{TABS.find((t) => t.id === tab).label}</h2>
        <div className="row">
        <button className="ghost bell" onClick={togglePush} title="Ειδοποιήσεις">
          {push === 'on' ? '🔔' : '🔕'}
        </button>
        <button
          className="ghost"
          onClick={() => confirm(`Αποσύνδεση από το ${user.email};`) && signOut(auth)}
          title="Αποσύνδεση"
        >
          {user.photoURL ? <img src={user.photoURL} alt="" className="avatar" referrerPolicy="no-referrer" /> : '⎋'}
        </button>
        </div>
      </header>
      <main className={tab === 'chat' ? 'chat-main' : ''}>
        <ErrorBoundary key={tab} onReset={() => setTab('shopping')}>
          <Active me={user} users={users} byId={byId} />
        </ErrorBoundary>
      </main>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span>{t.icon}</span>
            {t.label}
            {t.id === 'chat' && unread > 0 && <i className="badge">{unread > 99 ? '99+' : unread}</i>}
          </button>
        ))}
      </nav>
    </div>
  )
}
