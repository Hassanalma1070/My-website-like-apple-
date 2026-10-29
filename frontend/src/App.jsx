import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import CustomersView from './components/CustomersView.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import AuthView from './components/AuthView.jsx'
import ResetPasswordView from './components/ResetPasswordView.jsx'
import ChangePasswordDialog from './components/ChangePasswordDialog.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import ExportDialog from './components/ExportDialog.jsx'
import { clearSession, loadSession, saveSession } from './session.js'

function initialSession() {
  const session = loadSession()
  api.setToken(session?.token ?? null)
  return session
}

const readResetToken = () => new URLSearchParams(window.location.search).get('reset_token')

// Remove ?reset_token=... so the one-time token doesn't stay in the address bar or history
function clearResetToken() {
  const url = new URL(window.location.href)
  url.searchParams.delete('reset_token')
  window.history.replaceState(null, '', url)
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [toasts, setToasts] = useState([])
  const [status, setStatus] = useState('checking') // checking | online | offline
  const [chatOpen, setChatOpen] = useState(false)
  const [session, setSession] = useState(initialSession)
  const [resetToken, setResetToken] = useState(readResetToken)
  const [authNotice, setAuthNotice] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  // Admins only get the dashboard; the customers screen and the assistant are for sales users
  const isAdmin = session?.user.role === 'admin'
  const isSales = session && !isAdmin
  // Categories this user may export, tagged with whose they are so a stale list is never shown
  const [exportState, setExportState] = useState({ userId: null, categories: [] })
  const [exporting, setExporting] = useState(false)
  const userId = session?.user.user_id ?? null
  const exportCategories = exportState.userId === userId ? exportState.categories : []
  const canExport = (key) => exportCategories.some((c) => c.key === key)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    api.exportCategories()
      .then((categories) => !cancelled && setExportState({ userId, categories }))
      .catch(() => !cancelled && setExportState({ userId, categories: [] }))
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    api.health().then(() => setStatus('online')).catch(() => setStatus('offline'))
  }, [])

  const notify = useCallback((text, kind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const handleAuthenticated = useCallback((next) => {
    api.setToken(next.token)
    saveSession(next)
    setSession(next)
  }, [])

  const logout = useCallback(() => {
    api.setToken(null)
    clearSession()
    setSession(null)
    setChatOpen(false)
    setChangingPassword(false)
    setExporting(false)
  }, [])

  // A reset signs out every session, so return to sign-in with a confirmation
  const finishReset = useCallback((message) => {
    clearResetToken()
    setResetToken(null)
    logout()
    setAuthNotice(message)
  }, [logout])

  const cancelReset = useCallback(() => {
    clearResetToken()
    setResetToken(null)
  }, [])

  const handlePasswordChanged = useCallback((next) => {
    handleAuthenticated(next)
    setChangingPassword(false)
    notify('Password changed. Your other devices have been signed out.')
  }, [handleAuthenticated, notify])

  // Any 401 from a protected endpoint (expired or invalid token) signs the user out
  useEffect(() => {
    api.setOnUnauthorized(() => {
      logout()
      notify('Your session has ended. Please sign in again.', 'error')
    })
    return () => api.setOnUnauthorized(null)
  }, [logout, notify])

  return (
    <div className="app">
      <nav className="globalnav">
        <div className="globalnav-inner">
          <span className="brand">Customer Hub</span>
          <div className="globalnav-links">
            {isSales && <a href="#customers">Customers</a>}
            {isSales && <button type="button" onClick={() => setChatOpen(true)}>Assistant</button>}
            {session && !resetToken && exportCategories.length > 0 && (
              <button type="button" onClick={() => setExporting(true)}>Export</button>
            )}
            <a href={`${api.baseUrl}/swagger`} target="_blank" rel="noreferrer">Developers</a>
          </div>
          <div className="globalnav-end">
            <span className="api-status" title={`API ${status}`}>
              <span className={`status-dot ${status}`} />
              <span>{status === 'checking' ? 'Checking' : status === 'online' ? 'Online' : 'Offline'}</span>
            </span>
            {session && !resetToken && (
              <span className="user-menu">
                <span className="user-name" title={session.user.email}>{session.user.name}</span>
                {isAdmin && <span className="badge">Admin</span>}
                <button type="button" onClick={() => setChangingPassword(true)}>Change password</button>
                <button type="button" onClick={logout}>Log out</button>
              </span>
            )}
          </div>
        </div>
      </nav>

      <main className="main">
        {resetToken ? (
          <ResetPasswordView token={resetToken} onDone={finishReset} onCancel={cancelReset} />
        ) : isAdmin ? (
          <AdminDashboard key={session.user.user_id} notify={notify} canExport={canExport('sales_users')} />
        ) : session ? (
          // Keyed by user so switching accounts starts with fresh customer data
          <CustomersView
            key={session.user.user_id}
            notify={notify}
            refreshKey={refreshKey}
            onAsk={() => setChatOpen(true)}
            canExport={canExport('customers')}
          />
        ) : (
          // Keyed by the notice so a new confirmation message resets the form
          <AuthView key={authNotice} notice={authNotice} onAuthenticated={handleAuthenticated} />
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>Customer Hub. A React and Express demo.</span>
          <a href={`${api.baseUrl}/swagger`} target="_blank" rel="noreferrer">API documentation</a>
        </div>
      </footer>

      {exporting && exportCategories.length > 0 && (
        <ExportDialog categories={exportCategories} notify={notify} onClose={() => setExporting(false)} />
      )}

      {changingPassword && (
        <ChangePasswordDialog onChanged={handlePasswordChanged} onClose={() => setChangingPassword(false)} />
      )}

      {isSales && !resetToken && (
        // Keyed by user so logging out or switching accounts clears the conversation
        <ChatWidget
          key={session.user.user_id}
          open={chatOpen}
          onOpenChange={setChatOpen}
          onDataChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}
