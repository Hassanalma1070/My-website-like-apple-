// Deal amounts arrive as strings ("150000.00") and are shown in Indian rupees: ₹1,50,000
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function formatINR(amount) {
  const value = Number(amount ?? 0)
  return Number.isInteger(value) ? inrWhole.format(value) : inr.format(value)
}

export const STAGES = [
  { key: 'lead', label: 'Lead' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]
const OPEN = new Set(['lead', 'qualified', 'proposal'])
export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label ?? key

// Today's date in the browser's time zone, as YYYY-MM-DD
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// An open deal whose expected close date has passed
export const isOverdue = (deal) => OPEN.has(deal.stage) && !!deal.expected_close_date && deal.expected_close_date < todayISO()

// "2026-11-30" → "30 Nov 2026", without a time-zone shift
export function formatDay(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
