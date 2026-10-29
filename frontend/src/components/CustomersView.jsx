import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import CustomerForm from './CustomerForm.jsx'
import Modal from './Modal.jsx'
import HeroIllustration from './HeroIllustration.jsx'
import ExportButton from './ExportButton.jsx'
import CustomerDealsDialog from './CustomerDealsDialog.jsx'
import { formatINR } from '../money.js'
import { BriefcaseIcon, EditIcon, PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from './Icons.jsx'

const formatDate = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const initials = (name) =>
  name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')

export default function CustomersView({ notify, refreshKey, onAsk, canExport = false }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | customer
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [dealsFor, setDealsFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCustomers(await api.listCustomers())
      setLoadedAt(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      [c.name, c.email, c.phone, String(c.customer_id)].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [customers, query])

  const withEmail = customers.filter((c) => c.email).length
  const newThisWeek = customers.filter(
    (c) => c.created_at && loadedAt - new Date(c.created_at).getTime() < 7 * 864e5,
  ).length

  async function handleSave(data) {
    if (editing === 'new') {
      const created = await api.createCustomer(data)
      notify(`Customer “${created.name}” created`)
    } else {
      const updated = await api.updateCustomer(editing.customer_id, data)
      notify(`Customer “${updated.name}” updated`)
    }
    setEditing(null)
    load()
  }

  async function handleDelete() {
    setDeleteBusy(true)
    try {
      await api.deleteCustomer(deleting.customer_id)
      notify(`Customer “${deleting.name}” deleted`)
      setDeleting(null)
      load()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Customer Hub</p>
        <h1>Every customer.<br />All in one place.</h1>
        <p className="hero-sub">Add, find and update customer records, or ask the assistant in plain language.</p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <PlusIcon /> Add customer
          </button>
          <button className="btn btn-link" onClick={onAsk}>Ask the assistant ›</button>
        </div>
        <div className="hero-art">
          <HeroIllustration />
        </div>
      </section>

      <section className="stats">
        <div className="stat"><span className="stat-value">{customers.length}</span><span className="stat-label">Total customers</span></div>
        <div className="stat"><span className="stat-value">{withEmail}</span><span className="stat-label">With an email address</span></div>
        <div className="stat"><span className="stat-value">{newThisWeek}</span><span className="stat-label">Added in the last 7 days</span></div>
      </section>

      <section className="section-head" id="customers">
        <h2>Customers.</h2>
        <p className="muted">Search, edit or remove any record.</p>
      </section>

      <section className="card">
        <div className="toolbar">
          <div className="search">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone or ID"
              aria-label="Search customers"
            />
          </div>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshIcon className={loading ? 'spin' : ''} /> Refresh
          </button>
          {/* Sends the search text, so the file holds the rows shown below */}
          {canExport && <ExportButton category="customers" filters={{ q: query.trim() }} notify={notify} />}
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
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Open deals</th>
                  <th>Created</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && customers.length === 0
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} className="skeleton-row">
                        {Array.from({ length: 6 }, (_, j) => <td key={j}><span className="skeleton" /></td>)}
                      </tr>
                    ))
                  : filtered.map((c) => (
                      <tr key={c.customer_id}>
                        <td>
                          <div className="person">
                            <span className="avatar">{initials(c.name) || '?'}</span>
                            <div>
                              <div className="person-name">{c.name}</div>
                              <div className="muted small">ID {c.customer_id}</div>
                            </div>
                          </div>
                        </td>
                        <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">—</span>}</td>
                        <td>{c.phone || <span className="muted">—</span>}</td>
                        <td className="nowrap">
                          {c.open_deals > 0 ? `${c.open_deals} · ${formatINR(c.open_amount)}` : <span className="muted">—</span>}
                        </td>
                        <td className="muted">{formatDate(c.created_at)}</td>
                        <td className="right">
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => setDealsFor(c)} aria-label={`Deals for ${c.name}`} title="Deals"><BriefcaseIcon /></button>
                            <button className="icon-btn" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`} title="Edit"><EditIcon /></button>
                            <button className="icon-btn danger" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} title="Delete"><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div className="empty">
                <p>{query ? `No customers match “${query}”.` : 'No customers yet.'}</p>
              </div>
            )}
          </div>
        )}
        {!error && customers.length > 0 && (
          <div className="table-footer muted small">
            Showing {filtered.length} of {customers.length}
          </div>
        )}
      </section>

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <Modal
          title="Delete customer"
          onClose={() => !deleteBusy && setDeleting(null)}
          width={420}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>
            Delete <strong>{deleting.name}</strong> (ID {deleting.customer_id})?
            {deleting.total_deals > 0 && ` This also deletes ${deleting.total_deals} ${deleting.total_deals === 1 ? 'deal' : 'deals'}.`}
            {' '}This can’t be undone.
          </p>
        </Modal>
      )}

      {dealsFor && (
        <CustomerDealsDialog customer={dealsFor} notify={notify} onChanged={load} onClose={() => setDealsFor(null)} />
      )}
    </div>
  )
}
