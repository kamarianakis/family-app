import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { addMonths, eur, fmtDate, toCents, today } from '../utils'

export default function Bills({ me }) {
  const [bills] = useCol('bills', ['due', 'asc'], 300)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', amount: '', due: today(), monthly: true })

  const add = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    await addDoc(collection(db, 'bills'), {
      name: f.name.trim(),
      amount: toCents(f.amount),
      due: f.due,
      monthly: f.monthly,
      paid: false,
      by: me.uid,
      createdAt: serverTimestamp()
    })
    setF({ name: '', amount: '', due: today(), monthly: true })
    setOpen(false)
  }

  const pay = async (b) => {
    await updateDoc(doc(db, 'bills', b.id), { paid: true, paidAt: today() })
    // Μηνιαίος λογαριασμός: δημιουργείται αυτόματα ο επόμενος
    if (b.monthly) {
      await addDoc(collection(db, 'bills'), {
        name: b.name,
        amount: b.amount,
        due: addMonths(b.due, 1),
        monthly: true,
        paid: false,
        by: b.by,
        createdAt: serverTimestamp()
      })
    }
  }
  const unpay = (b) => updateDoc(doc(db, 'bills', b.id), { paid: false, paidAt: null })
  const remove = (b) => confirm(`Διαγραφή «${b.name}»;`) && deleteDoc(doc(db, 'bills', b.id))

  const unpaid = bills.filter((b) => !b.paid)
  const paid = bills.filter((b) => b.paid).sort((a, b) => (b.due > a.due ? 1 : -1)).slice(0, 10)
  const total = unpaid.reduce((s, b) => s + (b.amount || 0), 0)
  const t = today()

  return (
    <>
      <div className="card summary">
        <span>Απλήρωτα</span>
        <strong>{eur(total)}</strong>
      </div>
      {!open && (
        <button className="primary wide" onClick={() => setOpen(true)}>+ Νέος λογαριασμός</button>
      )}
      {open && (
        <form className="card form" onSubmit={add}>
          <input placeholder="Όνομα (ΔΕΗ, Νερό, Ενοίκιο…)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          <div className="row">
            <input inputMode="decimal" placeholder="Ποσό €" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </div>
          <label className="inline">
            <input type="checkbox" checked={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.checked })} />
            Επαναλαμβάνεται κάθε μήνα
          </label>
          <div className="row">
            <button type="button" onClick={() => setOpen(false)}>Άκυρο</button>
            <button className="primary">Αποθήκευση</button>
          </div>
        </form>
      )}

      {unpaid.length === 0 && <p className="empty">Δεν υπάρχουν απλήρωτοι λογαριασμοί ✅</p>}
      <ul className="list">
        {unpaid.map((b) => {
          const late = b.due < t
          return (
            <li key={b.id}>
              <button className="check" onClick={() => pay(b)} aria-label="Πληρώθηκε" />
              <div className="grow">
                <div>{b.name} {b.monthly && <small className="muted">↻</small>}</div>
                <small className={late ? 'late' : 'muted'}>{late ? 'Έληξε ' : 'Λήγει '}{fmtDate(b.due)}</small>
              </div>
              <strong>{eur(b.amount)}</strong>
              <button className="ghost" onClick={() => remove(b)} aria-label="Διαγραφή">✕</button>
            </li>
          )
        })}
      </ul>

      {paid.length > 0 && (
        <>
          <div className="section-head"><h3>Πληρωμένοι</h3></div>
          <ul className="list done">
            {paid.map((b) => (
              <li key={b.id}>
                <button className="check on" onClick={() => unpay(b)} aria-label="Ακύρωση πληρωμής">✓</button>
                <span className="grow">{b.name} <small className="muted">{fmtDate(b.due)}</small></span>
                <span>{eur(b.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
