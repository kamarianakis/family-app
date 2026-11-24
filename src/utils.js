export const eur = (cents) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100)

// "12,50" ή "12.50" -> 1250 (λεπτά)
export const toCents = (s) => {
  const n = parseFloat(String(s).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addMonths = (s, n) => {
  const d = parseYmd(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return ymd(d)
}
export const fmtDate = (s) =>
  new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' }).format(parseYmd(s))
export const fmtDayLong = (s) =>
  new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    parseYmd(s)
  )
export const monthTitle = (y, m) =>
  new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(new Date(y, m, 1))

export const firstName = (u) => (u?.name || u?.email || '?').split(' ')[0]
