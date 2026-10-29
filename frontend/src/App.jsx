import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import CustomersView from './components/CustomersView.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import AuthView from './components/AuthView.jsx'
import { clearSession, loadSession, saveSession } from './session.js'

function initialSession() {
  const session = loadSession()
  api.setToken(session?.token ?? null)
  return session
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [toasts, setToasts] = useState([])
  const [status, setStatus] = useState('checking') // checking | online | offline
  const [chatOpen, setChatOpen] = useState(false)
  const [session, setSession] = useState(initialSession)

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
  }, [])

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
            {session && <a href="#customers">Customers</a>}
            {session && <button type="button" onClick={() => setChatOpen(true)}>Assistant</button>}
            <a href={`${api.baseUrl}/swagger`} target="_blank" rel="noreferrer">Developers</a>
          </div>
          <div className="globalnav-end">
            <span className="api-status" title={`API ${status}`}>
              <span className={`status-dot ${status}`} />
              <span>{status === 'checking' ? 'Checking' : status === 'online' ? 'Online' : 'Offline'}</span>
            </span>
            {session && (
              <span className="user-menu">
                <span className="user-name" title={session.user.email}>{session.user.name}</span>
                <button type="button" onClick={logout}>Log out</button>
              </span>
            )}
          </div>
        </div>
      </nav>

      <main className="main">
        {session ? (
          // Keyed by user so switching accounts starts with fresh customer data
          <CustomersView key={session.user.user_id} notify={notify} refreshKey={refreshKey} onAsk={() => setChatOpen(true)} />
        ) : (
          <AuthView onAuthenticated={handleAuthenticated} />
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>Customer Hub. A React and Express demo.</span>
          <a href={`${api.baseUrl}/swagger`} target="_blank" rel="noreferrer">API documentation</a>
        </div>
      </footer>

      {session && (
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
