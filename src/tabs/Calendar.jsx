import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { eur, firstName, fmtDayLong, monthTitle, parseYmd, today, ymd } from '../utils'

const DOW = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ']
const REPEATS = [
  ['', 'Δεν επαναλαμβάνεται'],
  ['daily', 'Κάθε μέρα'],
  ['weekly', 'Κάθε εβδομάδα'],
  ['monthly', 'Κάθε μήνα'],
  ['yearly', 'Κάθε χρόνο']
]
const REPEAT_LABEL = Object.fromEntries(REPEATS)

// Πέφτει το event (με επανάληψη) στην ημέρα d (yyyy-mm-dd);
function occursOn(ev, d) {
  if (ev.date === d) return true
  if (!ev.repeat || d < ev.date) return false
  const s = parseYmd(ev.date)
  const t = parseYmd(d)
  if (ev.repeat === 'daily') return true
  if (ev.repeat === 'weekly') return Math.round((t - s) / 86400000) % 7 === 0
  // μήνας/χρόνος: αν ο μήνας δεν έχει π.χ. 31, πέφτει στην τελευταία μέρα του μήνα
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  if (t.getDate() !== Math.min(s.getDate(), lastDay)) return false
  if (ev.repeat === 'monthly') return true
  if (ev.repeat === 'yearly') return t.getMonth() === s.getMonth()
  return false
}

export default function Calendar({ me, byId }) {
  const [events] = useCol('events', ['date', 'asc'], 1000)
  const [bills] = useCol('bills', ['due', 'asc'], 300)
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [sel, setSel] = useState(today())
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [repeat, setRepeat] = useState('')

  const first = new Date(view.y, view.m, 1)
  const offset = (first.getDay() + 6) % 7 // Δευτέρα πρώτη
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(view.y, view.m, i + 1)))]

  const evOn = (d) => events.filter((e) => occursOn(e, d))
  const billOn = (d) => bills.filter((b) => b.due === d && !b.paid)

  const shift = (d) => {
    const t = new Date(view.y, view.m + d, 1)
    setView({ y: t.getFullYear(), m: t.getMonth() })
  }
  const add = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    await addDoc(collection(db, 'events'), {
      title: title.trim(),
      date: sel,
      time,
      repeat,
      by: me.uid,
      createdAt: serverTimestamp()
    })
    setTitle('')
    setTime('')
    setRepeat('')
  }
  const remove = (ev) =>
    confirm(ev.repeat ? `Διαγραφή «${ev.title}» (όλες οι επαναλήψεις);` : `Διαγραφή «${ev.title}»;`) &&
    deleteDoc(doc(db, 'events', ev.id))

  const dayEvents = evOn(sel).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  const dayBills = billOn(sel)
  const t = today()

  return (
    <>
      <div className="section-head">
        <button className="ghost" onClick={() => shift(-1)}>‹</button>
        <h3>{monthTitle(view.y, view.m)}</h3>
        <button className="ghost" onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal">
        {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              className={`day ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''}`}
              onClick={() => setSel(d)}
            >
              {Number(d.slice(8))}
              <span className="dots">
                {evOn(d).length > 0 && <i className="dot ev" />}
                {billOn(d).length > 0 && <i className="dot bill" />}
              </span>
            </button>
          ) : (
            <div key={`e${i}`} />
          )
        )}
      </div>

      <div className="section-head"><h3>{fmtDayLong(sel)}</h3></div>
      <form className="evform" onSubmit={add}>
        <div className="row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Νέο γεγονός…" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="time" />
          <button className="primary">+</button>
        </div>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          {REPEATS.map(([v, l]) => <option key={v} value={v}>{l === 'Δεν επαναλαμβάνεται' ? '↻ ' + l : l}</option>)}
        </select>
      </form>
      {dayEvents.length === 0 && dayBills.length === 0 && <p className="empty">Τίποτα προγραμματισμένο</p>}
      <ul className="list">
        {dayBills.map((b) => (
          <li key={b.id}>
            <span>🧾</span>
            <span className="grow">{b.name} <small className="muted">λήγει</small></span>
            <strong>{eur(b.amount)}</strong>
          </li>
        ))}
        {dayEvents.map((ev) => (
          <li key={ev.id}>
            <span className="time-tag">{ev.time || '—'}</span>
            <div className="grow">
              <div>{ev.title}</div>
              <small className="muted">{firstName(byId[ev.by])}{ev.repeat ? ` · ↻ ${REPEAT_LABEL[ev.repeat]?.toLowerCase()}` : ''}</small>
            </div>
            <button className="ghost" onClick={() => remove(ev)} aria-label="Διαγραφή">✕</button>
          </li>
        ))}
      </ul>
    </>
  )
}
