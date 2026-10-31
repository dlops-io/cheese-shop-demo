const WORKER_COLORS = ['#7fc9b7', '#f0a23f', '#c9a6f0', '#6fb3f2', '#f08a8a', '#b8d86a']

// worker-1 gets the first colour, worker-2 the second, and so on
const workerColor = (worker) =>
  WORKER_COLORS[(parseInt(worker.slice(7)) - 1) % WORKER_COLORS.length]

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

function Ticket({ ticket, ageS }) {
  const color = ticket.worker ? workerColor(ticket.worker) : undefined
  return (
    <li className={`ticket ${ticket.state}`} style={{ '--worker': color, '--age': `${ageS}s` }}>
      {ticket.state === 'ready' ? <i className="swatch" /> : <CheeseIcon />}
      <code>#{ticket.id}</code>
      <span className="name">{ticket.name}</span>
      <code className="worker">{ticket.worker ?? 'waiting'}</code>
      {ticket.state === 'aging' && (
        <div className="progress">
          <div />
        </div>
      )}
    </li>
  )
}

function Column({ title, total, tickets, ageS, empty, more }) {
  return (
    <div className="column">
      <h2>
        {title} <span>{total}</span>
      </h2>
      {total === 0 && <p className="muted">{empty}</p>}
      <ul>
        {tickets.map((ticket) => (
          <Ticket key={ticket.id} ticket={ticket} ageS={ageS} />
        ))}
      </ul>
      {more > 0 && <p className="muted">+ {more} more in line</p>}
    </div>
  )
}

export default function Board({ shop }) {
  const { queued, aging, ready, age_s: ageS } = shop
  return (
    <section className="board">
      <Column
        title="Queued"
        total={queued.length}
        tickets={queued.slice(0, 6)}
        more={queued.length - 6}
        empty="Nothing waiting. Place an order."
      />
      <Column
        title="Aging"
        total={aging.length}
        tickets={aging}
        ageS={ageS}
        empty="Workers are idle."
      />
      <Column
        title="Ready"
        total={ready.length}
        tickets={ready.slice(-8).reverse()}
        empty="Nothing ready yet."
      />
    </section>
  )
}
