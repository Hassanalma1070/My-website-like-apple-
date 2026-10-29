import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { formatINR, STAGES } from '../money.js'
import DealsTable from './DealsTable.jsx'
import ExportButton from './ExportButton.jsx'
import { useDealActions } from './useDealActions.jsx'
import { PlusIcon, RefreshIcon, SearchIcon } from './Icons.jsx'

const STAGE_FILTERS = [{ key: '', label: 'All stages' }, { key: 'open', label: 'Open' }, ...STAGES]

export default function DealsView({ notify, refreshKey, canExport = false }) {
  const [data, setData] = useState(null) // { deals, summary }
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stage, setStage] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [deals, customerList] = await Promise.all([
        api.listDeals({ stage, customer_id: customerId, q: query.trim() }),
        api.listCustomers(),
      ])
      setData(deals)
      setCustomers(customerList)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [stage, customerId, query])

  // Reload when filters change (the title search waits for typing to pause) or the assistant changed data
  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, query, refreshKey])

  const actions = useDealActions({ notify, onChanged: load, customers })
  const deals = data?.deals ?? []
  const summary = data?.summary
  const filtered = stage || customerId || query.trim()

  return (
    <div className="page">
      <section className="hero hero-compact">
        <p className="eyebrow">Deals</p>
        <h1>Your sales pipeline.</h1>
        <p className="hero-sub">Every opportunity with your customers, from lead to won.</p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={actions.add} disabled={customers.length === 0}>
            <PlusIcon /> Add deal
          </button>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="stat-value stat-money">{summary ? formatINR(summary.open.amount) : '–'}</span>
          <span className="stat-label">Open pipeline · {summary?.open.count ?? 0} deals</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-money">{summary ? formatINR(summary.won_this_month.amount) : '–'}</span>
          <span className="stat-label">Won this month · {summary?.won_this_month.count ?? 0} deals</span>
        </div>
        <div className="stat">
          <span className="stat-value">{summary ? summary.by_stage.lost.count : '–'}</span>
          <span className="stat-label">Lost</span>
        </div>
      </section>

      <section className="card">
        <div className="toolbar toolbar-wrap">
          <div className="search">
            <SearchIcon />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deal titles" aria-label="Search deals" />
          </div>
          <select className="filter-select" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
            {STAGE_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="filter-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Filter by customer">
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshIcon className={loading ? 'spin' : ''} /> Refresh
          </button>
          {canExport && <ExportButton category="deals" notify={notify} />}
        </div>

        {error ? (
          <div className="empty">
            <p className="alert alert-error">{error}</p>
            <button className="btn btn-ghost" onClick={load}>Try again</button>
          </div>
        ) : (
          <div className="table-wrap">
            {loading && !data ? (
              <div className="empty"><p>Loading deals…</p></div>
            ) : deals.length === 0 ? (
              <div className="empty">
                <p>{filtered ? 'No deals match these filters.' : customers.length ? 'No deals yet. Add your first one.' : 'Add a customer first, then create deals for them.'}</p>
              </div>
            ) : (
              <DealsTable deals={deals} actions={actions} />
            )}
          </div>
        )}
        {!error && deals.length > 0 && (
          <div className="table-footer muted small">
            {deals.length} {deals.length === 1 ? 'deal' : 'deals'} · {formatINR(deals.reduce((sum, d) => sum + Number(d.amount), 0))}
          </div>
        )}
      </section>

      {actions.dialogs}
    </div>
  )
}
