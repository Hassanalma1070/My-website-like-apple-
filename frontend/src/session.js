// The logged-in session ({ token, user }) kept in localStorage.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.
const KEY = 'customer-hub-session'

export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(KEY))
    return session?.token && session?.user ? session : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // The session still works in memory for this tab
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored
  }
}
