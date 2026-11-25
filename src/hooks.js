import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, limit, query } from 'firebase/firestore'
import { db } from './firebase'

// Live συλλογή από το Firestore. order = [πεδίο, 'asc'|'desc'], max = όριο εγγράφων
export function useCol(name, order, max) {
  const [docs, setDocs] = useState([])
  const [ready, setReady] = useState(false)
  const key = `${name}|${order?.join(',')}|${max}`
  useEffect(() => {
    const cons = []
    if (order) cons.push(orderBy(order[0], order[1] || 'asc'))
    if (max) cons.push(limit(max))
    return onSnapshot(
      query(collection(db, name), ...cons),
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        // ready = ήρθαν δεδομένα από τον server (όχι μόνο από την τοπική μνήμη, που σε νέα εγκατάσταση έχει μόνο ό,τι γράψαμε εμείς)
        setReady(!snap.metadata.fromCache)
      },
      (err) => console.error(name, err)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return [docs, ready]
}
