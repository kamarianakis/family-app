import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, limit, query } from 'firebase/firestore'
import { db } from './firebase'

// Live συλλογή από το Firestore. order = [πεδίο, 'asc'|'desc'], max = όριο εγγράφων
export function useCol(name, order, max, enabled = true) {
  const [docs, setDocs] = useState([])
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const key = `${name}|${order?.join(',')}|${max}|${enabled}|${retry}`
  useEffect(() => {
    if (!enabled) {
      setDocs([])
      setReady(false)
      return
    } // π.χ. πριν γίνει login: ένας listener χωρίς δικαίωμα πεθαίνει για πάντα
    const cons = []
    if (order) cons.push(orderBy(order[0], order[1] || 'asc'))
    if (max) cons.push(limit(max))
    // Αν ο server δεν απαντήσει σε 5" (π.χ. offline), μην μένουμε για πάντα σε "φόρτωση"
    const timer = setTimeout(() => setReady(true), 5000)
    const unsub = onSnapshot(
      query(collection(db, name), ...cons),
      // includeMetadataChanges: να ειδοποιηθούμε και όταν τα δεδομένα επιβεβαιωθούν από τον server (fromCache true -> false)
      { includeMetadataChanges: true },
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        // ready = ήρθαν δεδομένα από τον server (όχι μόνο από την τοπική μνήμη, που σε νέα εγκατάσταση έχει μόνο ό,τι γράψαμε εμείς)
        if (!snap.metadata.fromCache) setReady(true)
      },
      (err) => {
        console.error(name, err)
        // ξαναδοκιμάζουμε λίγο αργότερα (π.χ. το token του login δεν ήταν έτοιμο)
        setTimeout(() => setRetry((r) => (r < 5 ? r + 1 : r)), 2000)
      }
    )
    return () => {
      clearTimeout(timer)
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return [docs, ready]
}
