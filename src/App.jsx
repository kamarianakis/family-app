import { useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from './firebase'
import { useCol } from './hooks'
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

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = φορτώνει
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState(() => localStorage.getItem('tab') || 'shopping')
  const [users] = useCol('users')

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

  useEffect(() => localStorage.setItem('tab', tab), [tab])

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
        <button className="ghost" onClick={() => signOut(auth)} title="Αποσύνδεση">
          {user.photoURL ? <img src={user.photoURL} alt="" className="avatar" referrerPolicy="no-referrer" /> : '⎋'}
        </button>
      </header>
      <main>
        <Active me={user} users={users} byId={byId} />
      </main>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
