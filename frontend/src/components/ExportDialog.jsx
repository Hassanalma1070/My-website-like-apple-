import { useState } from 'react'
import Modal from './Modal.jsx'
import { useExport } from '../useExport.js'
import { RefreshIcon } from './Icons.jsx'

// Global export: pick categories (all by default) and an optional date range
export default function ExportDialog({ categories, notify, onClose }) {
  const [selected, setSelected] = useState(() => new Set(categories.map((c) => c.key)))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const { busy, run } = useExport(notify)

  function toggle(key) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleExport() {
    if (selected.size === 0) return setError('Select at least one category')
    if (from && to && from > to) return setError('From must be on or before To')
    setError('')
    const all = selected.size === categories.length
    if (await run({ categories: all ? 'all' : [...selected], from, to })) onClose()
  }

  return (
    <Modal
      title="Export to Excel"
      onClose={() => !busy && onClose()}
      width={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleExport} disabled={busy}>
            {busy ? <><RefreshIcon className="spin" /> Preparing export…</> : 'Export'}
          </button>
        </>
      }
    >
      <div className="form">
        {error && <div className="alert alert-error">{error}</div>}
        <fieldset className="field export-categories">
          <span>Categories (one sheet each)</span>
          {categories.map((c) => (
            <label key={c.key} className="checkbox">
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} disabled={busy} />
              {c.name}
            </label>
          ))}
        </fieldset>
        <div className="export-dates">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} disabled={busy} />
          </label>
        </div>
        <p className="muted small">Leave the dates empty to export everything. At most 100,000 rows.</p>
      </div>
    </Modal>
  )
}
