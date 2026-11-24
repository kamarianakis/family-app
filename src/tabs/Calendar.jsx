import { useState } from 'react'
import { addDoc, arrayUnion, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { addMonths, eur, firstName, fmtDate, fmtDayLong, monthTitle, parseYmd, today, ymd } from '../utils'

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
  if (ev.exceptions?.includes(d)) return false // διαγραμμένη εμφάνιση
  if (ev.date === d) return true
  if (!ev.repeat || d < ev.date) return false
  if (ev.until && d > ev.until) return false // έληξε η επανάληψη
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

// Ημερομηνία της τελευταίας εμφάνισης όταν η επανάληψη έχει πλήθος (count συνολικών εμφανίσεων)
function untilFromCount(date, repeat, count) {
  const n = Math.max(count, 1) - 1
  if (repeat === 'daily') {
    const d = parseYmd(date)
    d.setDate(d.getDate() + n)
    return ymd(d)
  }
  if (repeat === 'weekly') {
    const d = parseYmd(date)
    d.setDate(d.getDate() + 7 * n)
    return ymd(d)
  }
  if (repeat === 'monthly') return addMonths(date, n)
  return addMonths(date, 12 * n)
}

// Πληκτρολόγηση ώρας 24ωρου: "1730" -> "17:30", "930" -> "9:30", "17" -> "17"
const formatTime = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, -2)}:${d.slice(-2)}` : d
}
// Επιστρέφει "HH:MM", '' (καμία ώρα) ή null (άκυρη)
const parseTime = (v) => {
  if (!v) return ''
  const [h, m = '0'] = v.split(':')
  const hh = Number(h)
  const mm = Number(m)
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 23 || mm > 59) return null
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
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
  const [endType, setEndType] = useState('never') // never | count | until
  const [count, setCount] = useState('10')
  const [untilDate, setUntilDate] = useState('')
  const [del, setDel] = useState(null) // εμφάνιση προς διαγραφή {ev, date}

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
    const t24 = parseTime(time)
    if (t24 === null) return alert('Η ώρα δεν είναι σωστή. Γράψε π.χ. 1730 για 17:30.')
    let until = null
    if (repeat && endType === 'count') until = untilFromCount(sel, repeat, parseInt(count, 10) || 1)
    if (repeat && endType === 'until') {
      if (!untilDate || untilDate < sel) return alert('Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη.')
      until = untilDate
    }
    await addDoc(collection(db, 'events'), {
      title: title.trim(),
      date: sel,
      time: t24,
      repeat,
      ...(until ? { until } : {}),
      by: me.uid,
      createdAt: serverTimestamp()
    })
    setTitle('')
    setTime('')
    setRepeat('')
    setEndType('never')
  }
  const remove = (ev) => {
    if (ev.repeat) setDel({ ev, date: sel })
    else if (confirm(`Διαγραφή «${ev.title}»;`)) deleteDoc(doc(db, 'events', ev.id))
  }
  const deleteOne = async () => {
    await updateDoc(doc(db, 'events', del.ev.id), { exceptions: arrayUnion(del.date) })
    setDel(null)
  }
  const deleteAll = async () => {
    await deleteDoc(doc(db, 'events', del.ev.id))
    setDel(null)
  }

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
          <input
            value={time}
            onChange={(e) => setTime(formatTime(e.target.value))}
            onBlur={() => { const t = parseTime(time); if (t) setTime(t) }}
            inputMode="numeric"
            placeholder="ΩΩ:ΛΛ"
            maxLength={5}
            className="time"
            aria-label="Ώρα (24ωρο)"
          />
          <button className="primary">+</button>
        </div>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          {REPEATS.map(([v, l]) => <option key={v} value={v}>{v === '' ? '↻ ' + l : l}</option>)}
        </select>
        {repeat && (
          <div className="row">
            <select value={endType} onChange={(e) => setEndType(e.target.value)}>
              <option value="never">Χωρίς λήξη</option>
              <option value="count">Μετά από πλήθος</option>
              <option value="until">Έως ημερομηνία</option>
            </select>
            {endType === 'count' && (
              <input type="number" min="1" max="999" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="narrow" aria-label="Πλήθος εμφανίσεων" />
            )}
            {endType === 'until' && (
              <input type="date" value={untilDate} min={sel} onChange={(e) => setUntilDate(e.target.value)} />
            )}
          </div>
        )}
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
              <small className="muted">{firstName(byId[ev.by])}{ev.repeat ? ` · ↻ ${REPEAT_LABEL[ev.repeat]?.toLowerCase()}${ev.until ? ` έως ${fmtDate(ev.until)}` : ''}` : ''}</small>
            </div>
            <button className="ghost" onClick={() => remove(ev)} aria-label="Διαγραφή">✕</button>
          </li>
        ))}
      </ul>

      {del && (
        <div className="modal-bg" onClick={() => setDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Διαγραφή «{del.ev.title}»</h3>
            <p className="muted">Το γεγονός επαναλαμβάνεται. Τι να διαγραφεί;</p>
            <button onClick={deleteOne}>Μόνο αυτή ({fmtDate(del.date)})</button>
            <button className="danger" onClick={deleteAll}>Όλες οι επαναλήψεις</button>
            <button className="ghost" onClick={() => setDel(null)}>Άκυρο</button>
          </div>
        </div>
      )}
    </>
  )
}
