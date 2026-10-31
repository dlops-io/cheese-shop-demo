import { useEffect, useState } from 'react'
import { doWork, getCheese } from './api'

const WINDOW_MS = 10_000 // the pod list shows the last 10 seconds

// The same pod always gets the same colour
function podColor(pod) {
  const hue = [...pod].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7)
  return `hsl(${hue} 65% 50%)`
}

// Last 10 seconds of answers, one row per pod, busiest first
function summarize(answers, now) {
  const pods = new Map()
  for (const { pod, version, ms, at } of answers) {
    if (now - at > WINDOW_MS) continue
    const row = pods.get(pod) ?? { pod, version, count: 0, totalMs: 0 }
    row.count += 1
    row.totalMs += ms
    pods.set(pod, row)
  }
  return [...pods.values()].sort((a, b) => b.count - a.count)
}

export default function App() {
  const [cheese, setCheese] = useState(null)
  const [message, setMessage] = useState('')
  const [rate, setRate] = useState(0) // requests per second
  const [answers, setAnswers] = useState([])
  const [failures, setFailures] = useState([])
  const [now, setNow] = useState(() => Date.now())

  function record(started, answer) {
    const at = Date.now()
    setAnswers((old) => [
      ...old.filter((a) => at - a.at <= WINDOW_MS),
      { ...answer, ms: at - started, at },
    ])
  }

  async function fetchCheese() {
    const started = Date.now()
    try {
      const answer = await getCheese()
      setCheese(answer)
      setMessage('')
      record(started, answer)
    } catch (error) {
      setMessage(error.message)
    }
  }

  // Load: send `rate` requests per second until it goes back to 0
  useEffect(() => {
    if (rate === 0) return
    const timer = setInterval(async () => {
      const started = Date.now()
      try {
        record(started, await doWork())
      } catch {
        setFailures((old) => [...old.filter((at) => Date.now() - at <= WINDOW_MS), Date.now()])
      }
    }, 1000 / rate)
    return () => clearInterval(timer)
  }, [rate])

  // Keep the rows moving when nothing is answering
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const pods = summarize(answers, now)
  const total = pods.reduce((sum, row) => sum + row.count, 0)
  const failed = failures.filter((at) => now - at <= WINDOW_MS).length

  return (
    <main>
      <header>
        <h1>Cheese Hello</h1>
        <p>One page, one API. Every answer says which pod served it.</p>
      </header>

      <section className="card">
        <button onClick={fetchCheese}>Get a cheese</button>
        {cheese && (
          <p className="cheese">
            <strong>{cheese.cheese}</strong>
            <span>
              from <code>{cheese.pod}</code>, answer {cheese.served} from this pod, {cheese.version}
            </span>
          </p>
        )}
        {message && <p className="error">{message}</p>}
      </section>

      <section className="card">
        <label htmlFor="rate">
          Load: <strong>{rate}</strong> requests/s
        </label>
        <input
          id="rate"
          type="range"
          min="0"
          max="30"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </section>

      <section className="card">
        <h2>
          Pods answering <small>last 10 seconds</small>
        </h2>
        {pods.length === 0 && <p className="muted">No answers yet.</p>}
        <ul>
          {pods.map(({ pod, version, count, totalMs }) => (
            <li key={pod}>
              <div className="row">
                <i style={{ background: podColor(pod) }} />
                <code>{pod}</code>
                <span className="muted">{version}</span>
                <span className="stats">
                  {count} answers, {Math.round(totalMs / count)} ms
                </span>
              </div>
              <div className="bar">
                <div
                  style={{ width: `${(count / total) * 100}%`, background: podColor(pod) }}
                ></div>
              </div>
            </li>
          ))}
        </ul>
        {failed > 0 && <p className="error">{failed} requests failed or timed out</p>}
      </section>
    </main>
  )
}
