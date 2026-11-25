import { useEffect, useRef, useState } from 'react'
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { firstName } from '../utils'

const pad = (n) => String(n).padStart(2, '0')
// Απλή μορφοποίηση χωρίς Intl, για να μη σπάει σε παλιούς browsers
const toDate = (ts) => {
  try {
    return ts && typeof ts.toDate === 'function' ? ts.toDate() : null
  } catch {
    return null
  }
}
const hhmm = (ts) => {
  const d = toDate(ts)
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}
const dayLabel = (ts) => {
  const d = toDate(ts)
  return d ? `${d.getDate()}/${d.getMonth() + 1}` : ''
}

// Κάνει τα http(s):// και www. σύνδεσμα πατήσιμα (μόνο http/https, ποτέ javascript:)
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi
function linkify(text) {
  return String(text ?? '')
    .split(URL_RE)
    .map((part, i) => {
      if (i % 2 === 0) return part
      // τελικά σημεία στίξης δεν ανήκουν στον σύνδεσμο
      const m = part.match(/^(.*?)([).,;:!?]*)$/)
      const url = m[1]
      const tail = m[2]
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
      return (
        <span key={i}>
          <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link" onClick={(e) => e.stopPropagation()}>
            {url}
          </a>
          {tail}
        </span>
      )
    })
}

// Καρδιά με μια τελεία στη μέση. Γεμάτη όταν έχει γίνει like.
function Heart({ on, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`heart ${on ? 'on' : ''}`}>
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        className="heart-body"
      />
      <circle cx="12" cy="11" r="2.4" className="heart-dot" />
    </svg>
  )
}

export default function Chat({ me, users = [], byId }) {
  const [msgs] = useCol('messages', ['createdAt', 'desc'], 100)
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(null) // id μηνύματος με ανοιχτό μενού
  const [editing, setEditing] = useState(null) // μήνυμα που επεξεργάζομαι
  const box = useRef(null)
  const list = [...msgs].reverse()
  // Πότε είδε ο άλλος το chat τελευταία φορά (για τα ✓✓)
  const other = users.find((u) => u.id !== me.uid)
  const otherSeen = other?.chatSeenAt?.toMillis ? other.chatSeenAt.toMillis() : 0
  // 🕓 στέλνεται · ✓ στάλθηκε · ✓✓ διαβάστηκε
  const status = (m) => {
    if (!m.createdAt?.toMillis) return { icon: '🕓', cls: 'pending', label: 'Αποστέλλεται' }
    if (otherSeen >= m.createdAt.toMillis()) return { icon: '✓✓', cls: 'read', label: 'Διαβάστηκε' }
    return { icon: '✓', cls: 'sent', label: 'Στάλθηκε' }
  }

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [msgs.length])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    if (editing) {
      const m = editing
      setEditing(null)
      if (t !== m.text) await updateDoc(doc(db, 'messages', m.id), { text: t, edited: true })
      return
    }
    await addDoc(collection(db, 'messages'), { text: t, by: me.uid, likes: [], createdAt: serverTimestamp() })
  }

  const startEdit = (m) => {
    setEditing(m)
    setText(m.text)
    setMenu(null)
  }
  const cancelEdit = () => {
    setEditing(null)
    setText('')
  }
  const remove = async (m) => {
    setMenu(null)
    if (confirm('Διαγραφή μηνύματος;')) {
      if (editing?.id === m.id) cancelEdit()
      await deleteDoc(doc(db, 'messages', m.id))
    }
  }
  const toggleLike = (m) =>
    updateDoc(doc(db, 'messages', m.id), {
      likes: m.likes?.includes(me.uid) ? arrayRemove(me.uid) : arrayUnion(me.uid)
    })

  return (
    <div className="chat">
      <div className="msgs" ref={box}>
        {list.length === 0 && <p className="empty">Γράψε το πρώτο μήνυμα 👋</p>}
        {list.map((m, i) => {
          const mine = m.by === me.uid
          const likes = m.likes || []
          const liked = likes.includes(me.uid)
          const newDay = dayLabel(m.createdAt) !== dayLabel(list[i - 1]?.createdAt)
          return (
            <div key={m.id}>
              {newDay && m.createdAt && <div className="day-sep">{dayLabel(m.createdAt)}</div>}
              <div className={`msg ${mine ? 'mine' : ''}`}>
                {!mine && <small className="muted">{firstName(byId[m.by])}</small>}
                <div className="bubble-row">
                  {mine && likes.length > 0 && (
                    <span className="like static" title="Του άρεσε">
                      <Heart on size={18} />
                    </span>
                  )}
                  <div
                    className={`bubble ${mine ? 'tappable' : ''}`}
                    onClick={() => mine && setMenu(menu === m.id ? null : m.id)}
                  >
                    {linkify(m.text)}
                  </div>
                  {!mine && (
                    <button className={`like ${liked ? 'on' : ''}`} onClick={() => toggleLike(m)} aria-label="Like">
                      <Heart on={liked} size={20} />
                    </button>
                  )}
                </div>
                {menu === m.id && (
                  <div className="row msg-menu">
                    <button onClick={() => startEdit(m)}>✎ Επεξεργασία</button>
                    <button className="danger" onClick={() => remove(m)}>Διαγραφή</button>
                  </div>
                )}
                <div className="meta">
                  <small className="muted">
                    {hhmm(m.createdAt)}
                    {m.edited ? ' · επεξεργάστηκε' : ''}
                  </small>
                  {mine && (() => {
                    const st = status(m)
                    return <span className={`tick ${st.cls}`} title={st.label} aria-label={st.label}>{st.icon}</span>
                  })()}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {editing && (
        <div className="editing">
          <span>✎ Επεξεργασία μηνύματος</span>
          <button className="ghost" onClick={cancelEdit}>✕</button>
        </div>
      )}
      <form className="row composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Μήνυμα…" />
        <button className="primary">{editing ? '✓' : '➤'}</button>
      </form>
    </div>
  )
}
