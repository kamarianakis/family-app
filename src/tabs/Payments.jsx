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

// Γενική του μικρού ονόματος: Μάνος -> Μάνου, Ελεάνα -> Ελεάνας (λατινικά: αμετάβλητο)
function genitive(n) {
  if (!/[Α-Ωα-ωά-ώ]/.test(n)) return n
  if (/ος$/.test(n)) return n.slice(0, -2) + 'ου'
  if (/ης$/.test(n)) return n.slice(0, -1)
  if (/ας$/.test(n)) return n.slice(0, -1)
  if (/[αη]$/.test(n)) return n + 'ς'
  return n
}

export default function Payments({ me, users, byId }) {
  const [entries] = useCol('expenses', ['date', 'desc'], 500)
  const other = users.find((u) => u.id !== me.uid)
  const [open, setOpen] = useState(false)
  const now = new Date()
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [f, setF] = useState({ title: '', amount: '', paidBy: me.uid, split: 'equal', pMine: '50', pOther: '50', aMine: '', aOther: '', aCommon: '', cat: CATEGORIES[0], date: today() })

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

  const myName = firstName(byId[me.uid]) || 'Εγώ'
  const otherName = other ? firstName(other) : ''
  const setPct = (v, key, otherKey) => {
    const n = parseFloat(v.replace(',', '.'))
    setF({ ...f, [key]: v, [otherKey]: Number.isFinite(n) ? String(Math.round((100 - n) * 100) / 100) : '' })
  }
  const amountCents = toCents(f.amount)
  // ό,τι δεν έχει μοιραστεί σε άτομα (για τα "Κοινά")
  const rest = amountCents - toCents(f.aMine) - toCents(f.aOther) - (f.aCommon.trim() === '' ? 0 : toCents(f.aCommon))

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
    } else if (f.split === 'onlyMe') {
      shares = { [me.uid]: amount }
    } else if (f.split === 'onlyOther') {
      shares = { [other.id]: amount }
    } else if (f.split === 'percent') {
      const p = parseFloat(String(f.pMine).replace(',', '.'))
      if (!(p >= 0 && p <= 100)) return alert('Το ποσοστό πρέπει να είναι από 0 έως 100.')
      const mine = Math.round((amount * p) / 100)
      shares = { [me.uid]: mine, [other.id]: amount - mine }
    } else {
      const a = toCents(f.aMine)
      const b = toCents(f.aOther)
      const c = f.aCommon.trim() === '' ? amount - a - b : toCents(f.aCommon)
      if (c < 0 || a + b + c !== amount)
        return alert(`Τα ποσά δεν δίνουν ${eur(amount)} (τώρα ${eur(a + b + Math.max(c, 0))}).`)
      const half = Math.round(c / 2)
      shares = { [me.uid]: a + c - half, [other.id]: b + half }
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
    setF({ ...f, title: '', amount: '', pMine: '50', pOther: '50', aMine: '', aOther: '', aCommon: '' })
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

      {!open && <button className="primary wide" onClick={() => { setF((x) => ({ ...x, paidBy: me.uid })); setOpen(true) }}>+ Νέα δαπάνη</button>}
      {open && (
        <form className="card form" onSubmit={save}>
          <input placeholder="Τι ήταν;" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
          <div className="row">
            <input inputMode="decimal" placeholder="Ποσό €" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="row selects">
            <label>Πλήρωσε
              <select value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })}>
                <option value={me.uid}>{myName} (εγώ)</option>
                {other && <option value={other.id}>{otherName}</option>}
              </select>
            </label>
            <label>Για ποιον
              <select value={f.split} onChange={(e) => setF({ ...f, split: e.target.value })}>
                <option value="equal">Μισά-μισά</option>
                {other && <option value="onlyMe">Έξοδα {genitive(myName)}</option>}
                {other && <option value="onlyOther">Έξοδα {genitive(otherName)}</option>}
                {other && <option value="percent">Ποσοστό %</option>}
                {other && <option value="amount">Ποσά €</option>}
              </select>
            </label>
            <label>Κατηγορία
              <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          {other && f.split === 'percent' && (
            <div className="row splitrow">
              <label>{myName} %
                <input inputMode="decimal" value={f.pMine} onChange={(e) => setPct(e.target.value, 'pMine', 'pOther')} />
              </label>
              <label>{otherName} %
                <input inputMode="decimal" value={f.pOther} onChange={(e) => setPct(e.target.value, 'pOther', 'pMine')} />
              </label>
            </div>
          )}
          {other && f.split === 'amount' && (
            <>
              <div className="row splitrow">
                <label>{myName} €
                  <input inputMode="decimal" value={f.aMine} onChange={(e) => setF({ ...f, aMine: e.target.value })} />
                </label>
                <label>{otherName} €
                  <input inputMode="decimal" value={f.aOther} onChange={(e) => setF({ ...f, aOther: e.target.value })} />
                </label>
                <label>Κοινά €
                  <input inputMode="decimal" placeholder={eur(Math.max(rest, 0))} value={f.aCommon} onChange={(e) => setF({ ...f, aCommon: e.target.value })} />
                </label>
              </div>
              {amountCents > 0 && (
                <small className={rest === 0 || f.aCommon.trim() === '' && rest > 0 ? 'muted' : 'late'}>
                  {f.aCommon.trim() === ''
                    ? rest >= 0 ? `Κοινά (μισά-μισά): ${eur(rest)}` : `Τα ποσά ξεπερνούν το σύνολο κατά ${eur(-rest)}`
                    : rest === 0 ? 'Τα ποσά συμφωνούν ✓' : `Διαφορά από το σύνολο: ${eur(rest)}`}
                </small>
              )}
            </>
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
