import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { firstName } from '../utils'

const hhmm = (ts) =>
  ts?.toDate ? new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' }).format(ts.toDate()) : ''
const dayLabel = (ts) =>
  ts?.toDate ? new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' }).format(ts.toDate()) : ''

export default function Chat({ me, byId }) {
  const [msgs] = useCol('messages', ['createdAt', 'desc'], 100)
  const [text, setText] = useState('')
  const end = useRef(null)
  const list = [...msgs].reverse()

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs.length])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    await addDoc(collection(db, 'messages'), { text: t, by: me.uid, createdAt: serverTimestamp() })
  }

  return (
    <div className="chat">
      <div className="msgs">
        {list.length === 0 && <p className="empty">Γράψε το πρώτο μήνυμα 👋</p>}
        {list.map((m, i) => {
          const mine = m.by === me.uid
          const newDay = dayLabel(m.createdAt) !== dayLabel(list[i - 1]?.createdAt)
          return (
            <div key={m.id}>
              {newDay && m.createdAt && <div className="day-sep">{dayLabel(m.createdAt)}</div>}
              <div className={`msg ${mine ? 'mine' : ''}`}>
                {!mine && <small className="muted">{firstName(byId[m.by])}</small>}
                <div className="bubble">{m.text}</div>
                <small className="muted">{hhmm(m.createdAt)}</small>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <form className="row composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Μήνυμα…" />
        <button className="primary">➤</button>
      </form>
    </div>
  )
}
