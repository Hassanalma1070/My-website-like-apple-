import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { RefreshIcon } from './Icons.jsx'
import ExportButton from './ExportButton.jsx'

const formatDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—')

const initials = (name) =>
  name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')

// Read-only overview for admins: every sales user and how many customers they own
export default function AdminDashboard({ notify, canExport = false }) {
  const [data, setData] = useState(null) // { summary, users }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api.adminUsers())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const users = data?.users ?? []

  return (
    <div className="page">
      <section className="hero hero-compact">
        <p className="eyebrow">Admin</p>
        <h1>Sales team overview.</h1>
        <p className="hero-sub">Every sales user and the number of customers they manage.</p>
      </section>

      <section className="stats stats-2">
        <div className="stat"><span className="stat-value">{data ? data.summary.sales_users : '–'}</span><span className="stat-label">Sales users</span></div>
        <div className="stat"><span className="stat-value">{data ? data.summary.total_customers : '–'}</span><span className="stat-label">Total customers</span></div>
      </section>

      <section className="section-head">
        <h2>Sales users.</h2>
      </section>

      <section className="card">
        <div className="toolbar toolbar-end">
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshIcon className={loading ? 'spin' : ''} /> Refresh
          </button>
          {canExport && <ExportButton category="sales_users" notify={notify} />}
        </div>

        {error ? (
          <div className="empty">
            <p className="alert alert-error">{error}</p>
            <button className="btn btn-ghost" onClick={load}>Try again</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th className="right">Customers</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data
                  ? Array.from({ length: 4 }, (_, i) => (
                      <tr key={i} className="skeleton-row">
                        {Array.from({ length: 4 }, (_, j) => <td key={j}><span className="skeleton" /></td>)}
                      </tr>
                    ))
                  : users.map((u) => (
                      <tr key={u.user_id}>
                        <td>
                          <div className="person">
                            <span className="avatar">{initials(u.name) || '?'}</span>
                            <div className="person-name">{u.name}</div>
                          </div>
                        </td>
                        <td><a href={`mailto:${u.email}`}>{u.email}</a></td>
                        <td className="muted">{formatDate(u.created_at)}</td>
                        <td className="right count">{u.customer_count}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && data && users.length === 0 && (
              <div className="empty"><p>No sales users yet.</p></div>
            )}
          </div>
        )}
        {!error && users.length > 0 && <div className="table-footer muted small">{users.length} sales {users.length === 1 ? 'user' : 'users'}</div>}
      </section>
    </div>
  )
}
