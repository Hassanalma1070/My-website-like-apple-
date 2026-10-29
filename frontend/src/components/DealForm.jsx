import { useState } from 'react'
import Modal from './Modal.jsx'
import { STAGES } from '../money.js'

const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/

// Add (customer picker) or edit (customer fixed) a deal. onSubmit receives the API body.
export default function DealForm({ deal, customers = [], customerId, onSubmit, onClose }) {
  const isEdit = Boolean(deal)
  const [form, setForm] = useState({
    customer_id: String(deal?.customer_id ?? customerId ?? ''),
    title: deal?.title ?? '',
    amount: deal ? String(Number(deal.amount)) : '',
    stage: deal?.stage ?? 'lead',
    expected_close_date: deal?.expected_close_date ?? '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const fixedCustomer = isEdit || customerId
  const customerName = deal?.customer_name ?? customers.find((c) => String(c.customer_id) === form.customer_id)?.name

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    const amount = form.amount.trim().replace(/,/g, '')
    if (!form.customer_id) next.customer_id = 'Choose a customer'
    if (!form.title.trim()) next.title = 'Title is required'
    else if (form.title.trim().length > 200) next.title = 'Use at most 200 characters'
    if (!AMOUNT_RE.test(amount)) next.amount = 'Enter an amount in rupees, with at most 2 decimals'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    setServerError('')
    const body = {
      title: form.title.trim(),
      amount,
      stage: form.stage,
      expected_close_date: form.expected_close_date || null,
    }
    try {
      await onSubmit(isEdit ? body : { ...body, customer_id: Number(form.customer_id) })
    } catch (err) {
      setServerError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit deal #${deal.deal_id}` : 'Add deal'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="deal-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create deal'}
          </button>
        </>
      }
    >
      <form id="deal-form" className="form" onSubmit={handleSubmit} noValidate>
        {serverError && <div className="alert alert-error">{serverError}</div>}
        <label className="field">
          <span>Customer <em>*</em></span>
          {fixedCustomer ? (
            <input value={customerName ?? ''} disabled />
          ) : (
            <select autoFocus value={form.customer_id} onChange={set('customer_id')} aria-invalid={!!errors.customer_id}>
              <option value="">Choose a customer…</option>
              {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
            </select>
          )}
          {errors.customer_id && <small className="field-error">{errors.customer_id}</small>}
        </label>
        <label className="field">
          <span>Title <em>*</em></span>
          <input autoFocus={Boolean(fixedCustomer)} value={form.title} onChange={set('title')} placeholder="Brochure printing – Q4" aria-invalid={!!errors.title} />
          {errors.title && <small className="field-error">{errors.title}</small>}
        </label>
        <div className="field-row">
          <label className="field">
            <span>Amount (₹) <em>*</em></span>
            <input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="150000" aria-invalid={!!errors.amount} />
            {errors.amount && <small className="field-error">{errors.amount}</small>}
          </label>
          <label className="field">
            <span>Stage</span>
            <select value={form.stage} onChange={set('stage')}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Expected close date</span>
          <input type="date" value={form.expected_close_date} onChange={set('expected_close_date')} />
        </label>
      </form>
    </Modal>
  )
}
