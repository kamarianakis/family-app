import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

initializeApp()

// Νέο μήνυμα στο chat -> push στις συσκευές του/της άλλου/ης
export const notifyChat = onDocumentCreated(
  { document: 'messages/{id}', region: 'europe-west1' },
  async (event) => {
    const msg = event.data?.data()
    if (!msg || !msg.by) return
    const db = getFirestore()

    const users = await db.collection('users').get()
    const sender = users.docs.find((d) => d.id === msg.by)?.data()
    const senderName = (sender?.name || sender?.email || 'Οικογένεια').split(' ')[0]

    const targets = [] // { uid, token }
    users.docs.forEach((d) => {
      if (d.id === msg.by) return
      ;(d.data().tokens || []).forEach((token) => targets.push({ uid: d.id, token }))
    })
    if (!targets.length) return

    const body = String(msg.text || '').slice(0, 140)
    const res = await getMessaging().sendEach(
      targets.map(({ token }) => ({
        token,
        // data-only: το service worker της εφαρμογής εμφανίζει την ειδοποίηση
        data: { title: senderName, body, url: '/family-app/#chat' },
        webpush: { headers: { Urgency: 'high', TTL: '3600' } }
      }))
    )

    // Καθάρισμα tokens που δεν ισχύουν πια
    const dead = []
    res.responses.forEach((r, i) => {
      const code = r.error?.code
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        dead.push(targets[i])
      } else if (r.error) {
        console.error('push failed', code, r.error.message)
      }
    })
    await Promise.all(
      dead.map(({ uid, token }) =>
        db.collection('users').doc(uid).update({ tokens: FieldValue.arrayRemove(token) })
      )
    )
  }
)
