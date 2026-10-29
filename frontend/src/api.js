const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')

let token = null
let onUnauthorized = null

// keepSessionOn401: a 401 here means a wrong password, not an expired session
async function request(path, { keepSessionOn401 = false, ...options } = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new Error(`Cannot reach the API at ${BASE_URL}. Is the backend running?`)
  }
  const data = await res.json().catch(() => null)
  // An expired or invalid token logs the user out; login failures are handled by the form
  if (res.status === 401 && token && !keepSessionOn401) onUnauthorized?.()
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  baseUrl: BASE_URL,
  setToken: (value) => { token = value },
  setOnUnauthorized: (fn) => { onUnauthorized = fn },
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  adminLogin: (body) => request('/api/admin/login', { method: 'POST', body: JSON.stringify(body) }),
  adminUsers: () => request('/api/admin/users'),
  me: () => request('/api/auth/me'),
  changePassword: (body) =>
    request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body), keepSessionOn401: true }),
  forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (body) => request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  listCustomers: (name) =>
    request(`/api/customers${name ? `?name=${encodeURIComponent(name)}` : ''}`),
  createCustomer: (body) => request('/api/customers', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomer: (id, body) =>
    request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCustomer: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),
  chat: (message, history) =>
    request('/api/agent/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  health: () => request('/api/health'),
}
