import { useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { eur, firstName, fmtDate, monthTitle, toCents, today } from '../utils'

const CATEGORIES = ['🛒 Σούπερ μάρκετ', '🍽️ Φαγητό έξω', '🏠 Σπίτι', '🚗 Μετακινήσεις', '🎉 Διασκέδαση', '💊 Υγεία', '🧾 Λογαριασμοί', '📦 Άλλο']

// Κάθε εγγραφή: paidBy πλήρωσε amount, και shares = πόσο αναλογεί σε κάθε άτομο.
// Η εξόφληση είναι επίσης εγγραφή (type: 'settlement'): ο paidBy δίνει στον παραλήπτη.
function balances(entries) {
  const net = {}
  for (const e of entries) {
    net[e.paidBy] = (net[e.paidBy] || 0) + e.amount
    for (const [uid, s] of Object.entries(e.shares || {})) net[uid] = (net[uid] || 0) - s
  }
  return net
}

export default function Payments({ me, users, byId }) {
  const [entries] = useCol('expenses', ['date', 'desc'], 500)
  const other = users.find((u) => u.id !== me.uid)
  const [open, setOpen] = useState(false)
  const now = new Date()
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [f, setF] = useState({ title: '', amount: '', paidBy: me.uid, split: 'equal', otherShare: '', cat: CATEGORIES[0], date: today() })

  const net = useMemo(() => balances(entries), [entries])
  const myNet = net[me.uid] || 0 // >0: μου χρωστάνε, <0: χρωστάω

  const monthKey = `${month.y}-${String(month.m + 1).padStart(2, '0')}`
  const monthExpenses = entries.filter((e) => e.type !== 'settlement' && e.date?.startsWith(monthKey))
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0)
  const byCat = useMemo(() => {
    const m = {}
    monthExpenses.forEach((e) => (m[e.cat] = (m[e.cat] || 0) + e.amount))
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [monthExpenses])

  const shift = (d) => {
    const t = new Date(month.y, month.m + d, 1)
    setMonth({ y: t.getFullYear(), m: t.getMonth() })
  }

  const save = async (e) => {
    e.preventDefault()
    const amount = toCents(f.amount)
    if (!f.title.trim() || amount <= 0) return
    const payer = f.paidBy
    const otherId = payer === me.uid ? other?.id : me.uid
    let shares
    if (!otherId) {
      shares = { [payer]: amount } // ο/η σύντροφος δεν έχει συνδεθεί ακόμα
    } else if (f.split === 'equal') {
      const half = Math.round(amount / 2)
      shares = { [payer]: amount - half, [otherId]: half }
    } else if (f.split === 'otherAll') {
      shares = { [otherId]: amount }
    } else if (f.split === 'payerAll') {
      shares = { [payer]: amount }
    } else {
      const o = Math.min(Math.max(toCents(f.otherShare), 0), amount)
      shares = { [payer]: amount - o, [otherId]: o }
    }
    await addDoc(collection(db, 'expenses'), {
      type: 'expense',
      title: f.title.trim(),
      amount,
      paidBy: payer,
      shares,
      cat: f.cat,
      date: f.date,
      by: me.uid,
      createdAt: serverTimestamp()
    })
    setF({ ...f, title: '', amount: '', otherShare: '' })
    setOpen(false)
  }

  const settle = async () => {
    if (!other || myNet === 0) return
    const amount = Math.abs(myNet)
    const iPay = myNet < 0
    const from = iPay ? me.uid : other.id
    const to = iPay ? other.id : me.uid
    if (!confirm(`Καταγραφή εξόφλησης ${eur(amount)}: ${firstName(byId[from])} → ${firstName(byId[to])};`)) return
    await addDoc(collection(db, 'expenses'), {
      type: 'settlement',
      title: 'Εξόφληση',
      amount,
      paidBy: from,
      shares: { [to]: amount },
      date: today(),
      by: me.uid,
      createdAt: serverTimestamp()
    })
  }

  const remove = (e) => confirm(`Διαγραφή «${e.title}»;`) && deleteDoc(doc(db, 'expenses', e.id))

  const label = !other
    ? 'Περιμένουμε τον/την σύντροφο να συνδεθεί'
    : myNet === 0
    ? 'Είστε πάτσι ✅'
    : myNet > 0
    ? `${firstName(other)} σου χρωστάει`
    : `Χρωστάς στον/στην ${firstName(other)}`

  return (
    <>
      <div className="card balance">
        <span>{label}</span>
        {other && myNet !== 0 && <strong className={myNet > 0 ? 'pos' : 'neg'}>{eur(Math.abs(myNet))}</strong>}
        {other && myNet !== 0 && <button className="primary" onClick={settle}>Εξόφληση</button>}
      </div>

      {!open && <button className="primary wide" onClick={() => setOpen(true)}>+ Νέα δαπάνη</button>}
      {open && (
        <form className="card form" onSubmit={save}>
          <input placeholder="Τι ήταν;" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
          <div className="row">
            <input inputMode="decimal" placeholder="Ποσό €" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label>Πλήρωσε
            <select value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })}>
              <option value={me.uid}>Εγώ</option>
              {other && <option value={other.id}>{firstName(other)}</option>}
            </select>
          </label>
          <label>Διαίρεση
            <select value={f.split} onChange={(e) => setF({ ...f, split: e.target.value })}>
              <option value="equal">Μισά-μισά</option>
              <option value="otherAll">Όλο ο/η άλλος/η</option>
              <option value="payerAll">Μόνο για αυτόν που πλήρωσε</option>
              <option value="custom">Προσαρμοσμένο</option>
            </select>
          </label>
          {f.split === 'custom' && (
            <input inputMode="decimal" placeholder="Πόσα αναλογούν στον/στην άλλο/η (€)" value={f.otherShare} onChange={(e) => setF({ ...f, otherShare: e.target.value })} />
          )}
          <div className="row">
            <button type="button" onClick={() => setOpen(false)}>Άκυρο</button>
            <button className="primary">Αποθήκευση</button>
          </div>
        </form>
      )}

      <div className="section-head">
        <button className="ghost" onClick={() => shift(-1)}>‹</button>
        <h3>{monthTitle(month.y, month.m)}</h3>
        <button className="ghost" onClick={() => shift(1)}>›</button>
      </div>
      <div className="card">
        <div className="summary"><span>Σύνολο μήνα</span><strong>{eur(monthTotal)}</strong></div>
        {byCat.map(([c, v]) => (
          <div key={c} className="bar">
            <div className="bar-label"><span>{c}</span><span>{eur(v)}</span></div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / monthTotal) * 100}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="section-head"><h3>Κινήσεις</h3></div>
      {entries.length === 0 && <p className="empty">Καμία κίνηση ακόμα</p>}
      <ul className="list">
        {entries.slice(0, 60).map((e) => (
          <li key={e.id}>
            <div className="grow">
              <div>{e.type === 'settlement' ? '🤝 ' : ''}{e.title}</div>
              <small className="muted">
                {fmtDate(e.date)} · {e.type === 'settlement' ? `${firstName(byId[e.paidBy])} → ${firstName(byId[Object.keys(e.shares)[0]])}` : `πλήρωσε ${firstName(byId[e.paidBy])}`}
                {e.cat ? ` · ${e.cat}` : ''}
              </small>
            </div>
            <strong>{eur(e.amount)}</strong>
            <button className="ghost" onClick={() => remove(e)} aria-label="Διαγραφή">✕</button>
          </li>
        ))}
      </ul>
    </>
  )
}
