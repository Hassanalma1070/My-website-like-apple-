import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api.js'
import { ChatIcon, RefreshIcon, SendIcon, SparkIcon, XIcon } from './Icons.jsx'

const SUGGESTIONS = [
  'Get all customers',
  'Find customers named Ali',
  'Add a customer named Sara Lee with email sara@example.com',
  'How many customers have no phone number?',
]

const MUTATING_TOOLS = new Set(['add_customer', 'update_customer', 'delete_customer'])

const TOOL_LABELS = {
  get_all_customers: 'Listed all customers',
  get_customer_by_name: 'Searched by name',
  get_customer_by_id: 'Looked up by ID',
  add_customer: 'Added a customer',
  update_customer: 'Updated a customer',
  delete_customer: 'Deleted a customer',
}

// `open` is controlled by the parent so other parts of the page can open the chat
export default function ChatWidget({ open, onOpenChange: setOpen, onDataChanged }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  useEffect(() => {
    if (!open) return
    setUnread(false)
    inputRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  function toggle() {
    setOpen((o) => !o)
  }

  async function send(text) {
    const message = text.trim()
    if (!message || sending) return

    // Only successful text turns are sent back as history
    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setSending(true)
    try {
      const { reply, toolCalls = [] } = await api.chat(message, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, toolCalls }])
      if (toolCalls.some((t) => t.ok && MUTATING_TOOLS.has(t.name))) onDataChanged?.()
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: err.message, error: true }])
    } finally {
      setSending(false)
      if (!openRef.current) setUnread(true)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <>
      {/* Panel stays mounted while closed so the conversation is kept */}
      <section className="chat-panel" hidden={!open} aria-label="AI Assistant">
        <header className="chat-panel-header">
          <span className="msg-avatar"><SparkIcon width={16} height={16} /></span>
          <div className="chat-panel-title">
            <strong>AI Assistant</strong>
            <span className="small muted">Ask about customer data</span>
          </div>
          {messages.length > 0 && (
            <button className="icon-btn" onClick={() => setMessages([])} disabled={sending} title="New conversation" aria-label="New conversation">
              <RefreshIcon />
            </button>
          )}
          <button className="icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close assistant">
            <XIcon />
          </button>
        </header>

        <div className="chat-messages" ref={listRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon"><SparkIcon width={24} height={24} /></div>
              <h3>How can I help?</h3>
              <p className="muted">I can list, search, add, update and delete customers.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}${m.error ? ' msg-error' : ''}`}>
              {m.role === 'assistant' && <span className="msg-avatar"><SparkIcon width={16} height={16} /></span>}
              <div className="msg-body">
                {m.toolCalls?.length > 0 && (
                  <div className="tool-chips">
                    {m.toolCalls.map((t, j) => (
                      <span key={j} className={`tool-chip${t.ok ? '' : ' failed'}`} title={JSON.stringify(t.input)}>
                        {TOOL_LABELS[t.name] || t.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="msg-bubble">
                  {m.role === 'assistant' && !m.error ? (
                    <div className="markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            </div>
          ))}

          {sending && (
            <div className="msg msg-assistant">
              <span className="msg-avatar"><SparkIcon width={16} height={16} /></span>
              <div className="msg-bubble typing" aria-label="Assistant is thinking"><span /><span /><span /></div>
            </div>
          )}
        </div>

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about customers…"
            aria-label="Message"
            disabled={sending}
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()} aria-label="Send">
            <SendIcon />
          </button>
        </form>
      </section>

      <button
        className={`chat-fab${open ? ' open' : ''}`}
        onClick={toggle}
        aria-label={open ? 'Close assistant' : 'Open AI assistant'}
        aria-expanded={open}
      >
        {open ? <XIcon width={22} height={22} /> : <ChatIcon width={22} height={22} />}
        {unread && !open && <span className="chat-fab-badge" />}
      </button>
    </>
  )
}
