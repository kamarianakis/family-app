import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useCol } from '../hooks'
import { firstName } from '../utils'

// Ημερομηνία καταχώρησης (d/m) από το Firestore timestamp· κενό όσο δεν έχει γραφτεί ακόμα
const added = (ts) => {
  try {
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null
    return d ? `${d.getDate()}/${d.getMonth() + 1}` : ''
  } catch {
    return ''
  }
}

export default function Shopping({ me, byId }) {
  const [items] = useCol('shopping', ['createdAt', 'desc'], 300)
  const [text, setText] = useState('')

  const add = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    await addDoc(collection(db, 'shopping'), {
      text: t,
      done: false,
      by: me.uid,
      createdAt: serverTimestamp()
    })
  }
  const toggle = (i) => updateDoc(doc(db, 'shopping', i.id), { done: !i.done })
  const remove = (i) => deleteDoc(doc(db, 'shopping', i.id))
  const clearDone = async () => {
    const b = writeBatch(db)
    items.filter((i) => i.done).forEach((i) => b.delete(doc(db, 'shopping', i.id)))
    await b.commit()
  }

  const todo = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  return (
    <>
      <form className="row" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Τι χρειαζόμαστε;" />
        <button className="primary">+</button>
      </form>
      {todo.length === 0 && <p className="empty">Η λίστα είναι άδεια 🎉</p>}
      <ul className="list">
        {todo.map((i) => (
          <li key={i.id}>
            <button className="check" onClick={() => toggle(i)} aria-label="Έγινε" />
            <span className="grow">{i.text}</span>
            <small className="muted">{firstName(byId[i.by])}{added(i.createdAt) ? ` · ${added(i.createdAt)}` : ''}</small>
            <button className="ghost" onClick={() => remove(i)} aria-label="Διαγραφή">✕</button>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <div className="section-head">
            <h3>Στο καλάθι ({done.length})</h3>
            <button className="link" onClick={clearDone}>Καθαρισμός</button>
          </div>
          <ul className="list done">
            {done.map((i) => (
              <li key={i.id}>
                <button className="check on" onClick={() => toggle(i)} aria-label="Ξεσημείωμα">✓</button>
                <span className="grow">{i.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
