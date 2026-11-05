const WORKER_COLORS = ['#7fc9b7', '#f0a23f', '#c9a6f0', '#6fb3f2', '#f08a8a', '#b8d86a']

// Workers take colours in the order they took their first ticket, so each keeps its colour as more
// join, even after a reload
function workerColors(tickets) {
  const oldestFirst = [...tickets].sort((a, b) => a.id - b.id)
  const workers = [...new Set(oldestFirst.map((ticket) => ticket.worker))]
  return Object.fromEntries(
    workers.map((worker, i) => [worker, WORKER_COLORS[i % WORKER_COLORS.length]]),
  )
}

// A pod's name is long: worker-6f7d9c8b5-x2k4p reads as worker-x2k4p. A container's ID stays as it is.
function shortName(worker) {
  const parts = worker.split('-')
  return parts.length > 2 ? `${parts[0]}-${parts.at(-1)}` : worker
}

export function CheeseIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 46 L58 46 L36 10 Z" fill="#f6c445" stroke="#d99a1c" strokeWidth="3" />
      <circle cx="28" cy="36" r="5" fill="#8f5f0a" opacity=".55" />
      <circle cx="43" cy="39" r="3.5" fill="#8f5f0a" opacity=".55" />
      <circle cx="35" cy="26" r="3" fill="#8f5f0a" opacity=".55" />
    </svg>
  )
}

function Ticket({ ticket, ageS, colors }) {
  return (
    <li
      className={`ticket ${ticket.state}`}
      style={{ '--worker': colors[ticket.worker], '--age': `${ageS}s` }}
    >
      {ticket.state === 'ready' ? <i className="swatch" /> : <CheeseIcon />}
      <code>#{ticket.id}</code>
      <span className="name">{ticket.name}</span>
      <code className="worker">{ticket.worker ? shortName(ticket.worker) : 'waiting'}</code>
      {ticket.state === 'aging' && (
        <div className="progress">
          <div />
        </div>
      )}
    </li>
  )
}

function Column({ title, total, tickets, ageS, colors, empty, more }) {
  return (
    <div className="column">
      <h2>
        {title} <span>{total}</span>
      </h2>
      {total === 0 && <p className="muted">{empty}</p>}
      <ul>
        {tickets.map((ticket) => (
          <Ticket key={ticket.id} ticket={ticket} ageS={ageS} colors={colors} />
        ))}
      </ul>
      {more > 0 && <p className="muted">+ {more} more in line</p>}
    </div>
  )
}

export default function Board({ shop }) {
  const { queued, aging, ready, age_s: ageS } = shop
  const colors = workerColors([...aging, ...ready])
  return (
    <section className="board">
      <Column
        title="Queued"
        total={queued.length}
        tickets={queued.slice(0, 6)}
        colors={colors}
        more={queued.length - 6}
        empty="Nothing waiting. Place an order."
      />
      <Column
        title="Aging"
        total={aging.length}
        tickets={aging}
        ageS={ageS}
        colors={colors}
        empty="Workers are idle."
      />
      <Column
        title="Ready"
        total={ready.length}
        tickets={ready.slice(-8).reverse()}
        colors={colors}
        empty="Nothing ready yet."
      />
    </section>
  )
}
