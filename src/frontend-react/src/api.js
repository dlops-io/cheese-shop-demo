// The one way the page talks to the API. Every path is relative to the page's own origin, so the
// same build works behind Vite, nginx or a cluster. Tutorial step: set BASE to
// 'http://localhost:9000' and watch the browser block the call (CORS).
const BASE = ''

async function get(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`The API answered ${res.status}`)
  return res.json()
}

export const getCheese = () => get('/api/cheese')
export const doWork = () => get('/api/work?ms=100')
