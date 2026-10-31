// The one way the page talks to the API. Every path is relative to the page's own origin, so the
// same build works behind Vite or nginx. Tutorial step: set BASE to 'http://localhost:9810' and
// watch the browser block the call (CORS).
const BASE = ''

async function request(path, options) {
  const res = await fetch(BASE + path, { ...options, signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`The API answered ${res.status}`)
  return res.json()
}

export const getOrders = () => request('/api/orders')

export const placeOrder = (count) =>
  request('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ count }),
  })
