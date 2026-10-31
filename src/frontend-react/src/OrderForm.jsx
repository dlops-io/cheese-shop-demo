import { useState } from 'react'

export default function OrderForm({ onOrder }) {
  const [count, setCount] = useState(10)

  function submit(event) {
    event.preventDefault() // stay on the page instead of the browser's full-page submit
    onOrder(Number(count))
  }

  function quickOrder(n) {
    setCount(n)
    onOrder(n)
  }

  return (
    <form onSubmit={submit}>
      <p>
        Every cheese has to <b>age</b> in a worker before it's ready. Order a few and watch them
        move across the board.
      </p>
      <label htmlFor="count" className="eyebrow">
        How many cheeses?
      </label>
      <div className="order">
        <input
          id="count"
          type="number"
          min="1"
          max="50"
          required
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
        <button type="submit">
          Order {count} {Number(count) === 1 ? 'cheese' : 'cheeses'}
        </button>
      </div>
      <div className="quick">
        Quick:
        {[1, 10, 50].map((n) => (
          <button key={n} type="button" onClick={() => quickOrder(n)}>
            ×{n}
          </button>
        ))}
      </div>
    </form>
  )
}
