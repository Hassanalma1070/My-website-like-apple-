import { useState } from 'react'
import Modal from './Modal.jsx'
import { api } from '../api.js'

const MIN_PASSWORD = 8

export default function ChangePasswordDialog({ onChanged, onClose }) {
  const [form, setForm] = useState({ current: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!form.current) next.current = 'Enter your current password'
    if (form.password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters`
    else if (form.password === form.current) next.password = 'Choose a different password'
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    setServerError('')
    try {
      onChanged(await api.changePassword({ currentPassword: form.current, newPassword: form.password }))
    } catch (err) {
      setServerError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Change password"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="change-password-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </>
      }
    >
      <form id="change-password-form" className="form" onSubmit={handleSubmit} noValidate>
        {serverError && <div className="alert alert-error">{serverError}</div>}
        <p className="muted small">Changing your password signs you out on your other devices.</p>
        <label className="field">
          <span>Current password</span>
          <input type="password" autoFocus value={form.current} onChange={set('current')} autoComplete="current-password" aria-invalid={!!errors.current} />
          {errors.current && <small className="field-error">{errors.current}</small>}
        </label>
        <label className="field">
          <span>New password</span>
          <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" aria-invalid={!!errors.password} />
          {errors.password && <small className="field-error">{errors.password}</small>}
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" aria-invalid={!!errors.confirm} />
          {errors.confirm && <small className="field-error">{errors.confirm}</small>}
        </label>
      </form>
    </Modal>
  )
}
