import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import CustomersView from './components/CustomersView.jsx'
import ChatWidget from './components/ChatWidget.jsx'

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [toasts, setToasts] = useState([])
  const [status, setStatus] = useState('checking') // checking | online | offline
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    api.health().then(() => setStatus('online')).catch(() => setStatus('offline'))
  }, [])

  const notify = useCallback((text, kind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  return (
    <div className="app">
      <nav className="globalnav">
        <div className="globalnav-inner">
          <span className="brand">Customer Hub</span>
          <div className="globalnav-links">
            <a href="#customers">Customers</a>
            <button type="button" onClick={() => setChatOpen(true)}>Assistant</button>
            <a href={`${api.baseUrl}/swagger`} target="_blank" rel="noreferrer">Developers</a>
          </div>
          <span className="api-status" title={`API ${status}`}>
            <span className={`status-dot ${status}`} />
            <span>{status === 'checking' ? 'Checking' : status === 'online' ? 'Online' : 'Offline'}</span>
          </span>
        </div>
      </nav>

      <main className="main">
        <CustomersView notify={notify} refreshKey={refreshKey} onAsk={() => setChatOpen(true)} />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>Customer Hub. A React and Express demo.</span>
          <a href={`${api.baseUrl}/swagger`} target="_blank" rel="noreferrer">API documentation</a>
        </div>
      </footer>

      <ChatWidget
        open={chatOpen}
        onOpenChange={setChatOpen}
        onDataChanged={() => setRefreshKey((k) => k + 1)}
      />

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}
