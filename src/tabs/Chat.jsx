import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
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

export default function Chat({ me, byId }) {
  const [msgs] = useCol('messages', ['createdAt', 'desc'], 100)
  const [text, setText] = useState('')
  const box = useRef(null)
  const list = [...msgs].reverse()

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [msgs.length])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    await addDoc(collection(db, 'messages'), { text: t, by: me.uid, createdAt: serverTimestamp() })
  }

  return (
    <div className="chat">
      <div className="msgs" ref={box}>
        {list.length === 0 && <p className="empty">Γράψε το πρώτο μήνυμα 👋</p>}
        {list.map((m, i) => {
          const mine = m.by === me.uid
          const newDay = dayLabel(m.createdAt) !== dayLabel(list[i - 1]?.createdAt)
          return (
            <div key={m.id}>
              {newDay && m.createdAt && <div className="day-sep">{dayLabel(m.createdAt)}</div>}
              <div className={`msg ${mine ? 'mine' : ''}`}>
                {!mine && <small className="muted">{firstName(byId[m.by])}</small>}
                <div className="bubble">{String(m.text ?? '')}</div>
                <small className="muted">{hhmm(m.createdAt)}</small>
              </div>
            </div>
          )
        })}
      </div>
      <form className="row composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Μήνυμα…" />
        <button className="primary">➤</button>
      </form>
    </div>
  )
}
