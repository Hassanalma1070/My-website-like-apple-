import { useState } from 'react'
import { api } from '../api.js'

const MIN_PASSWORD = 8

// Shown when the page is opened from a reset link (?reset_token=...)
export default function ResetPasswordView({ token, onDone, onCancel }) {
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (form.password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters`
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    setServerError('')
    try {
      const { message } = await api.resetPassword({ token, newPassword: form.password })
      onDone(message)
    } catch (err) {
      setServerError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <h2>Set a new password</h2>
        <p className="muted">This link works once and expires 30 minutes after it was sent.</p>
        <form className="form" onSubmit={handleSubmit} noValidate>
          {serverError && <div className="alert alert-error">{serverError}</div>}
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoFocus
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
            />
            {errors.password && <small className="field-error">{errors.password}</small>}
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={form.confirm}
              onChange={set('confirm')}
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && <small className="field-error">{errors.confirm}</small>}
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : 'Set new password'}
          </button>
        </form>
        <p className="auth-switch muted">
          <button type="button" className="btn-link" onClick={onCancel}>Back to sign in</button>
        </p>
      </div>
    </div>
  )
}
