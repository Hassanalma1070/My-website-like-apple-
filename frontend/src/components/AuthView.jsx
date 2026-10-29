import { useState } from 'react'
import { api } from '../api.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

export default function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('login') // login | register
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegister = mode === 'register'

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function switchMode() {
    setMode(isRegister ? 'login' : 'register')
    setErrors({})
    setServerError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (isRegister && !form.name.trim()) next.name = 'Name is required'
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address'
    if (!form.password) next.password = 'Password is required'
    else if (isRegister && form.password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters`
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    setServerError('')
    try {
      const body = { email: form.email.trim(), password: form.password }
      const session = isRegister
        ? await api.register({ ...body, name: form.name.trim() })
        : await api.login(body)
      onAuthenticated(session)
    } catch (err) {
      setServerError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <h2>{isRegister ? 'Create your account' : 'Sign in'}</h2>
        <p className="muted">
          {isRegister ? 'New accounts are created as sales users.' : 'Sign in to manage your customers.'}
        </p>
        <form className="form" onSubmit={handleSubmit} noValidate>
          {serverError && <div className="alert alert-error">{serverError}</div>}
          {isRegister && (
            <label className="field">
              <span>Name</span>
              <input autoFocus value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} />
              {errors.name && <small className="field-error">{errors.name}</small>}
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoFocus={!isRegister}
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
            {errors.email && <small className="field-error">{errors.email}</small>}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              aria-invalid={!!errors.password}
            />
            {errors.password && <small className="field-error">{errors.password}</small>}
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch muted">
          {isRegister ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="btn-link" onClick={switchMode}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  )
}
