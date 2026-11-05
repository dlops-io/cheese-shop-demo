import { useEffect, useState } from 'react'
import { getOrders, placeOrder } from './api'
import Board, { CheeseIcon } from './Board'
import OrderForm from './OrderForm'

export default function App() {
  const [shop, setShop] = useState({ workers: 0, age_s: 0, queued: [], aging: [], ready: [] })
  const [error, setError] = useState('')

  // The API owns the shop: ask it what is happening, twice a second, and draw the answer
  useEffect(() => {
    async function refresh() {
      try {
        setShop(await getOrders())
        setError('')
      } catch (e) {
        setError(e.message)
      }
    }
    refresh()
    const timer = setInterval(refresh, 500)
    return () => clearInterval(timer)
  }, [])

  function order(count) {
    placeOrder(count).catch((e) => setError(e.message))
  }

  return (
    <main>
      <header>
        <CheeseIcon size={56} />
        <div className="title">
          <span className="eyebrow">AC215 · Frontend and API</span>
          <h1>Cheese Shop</h1>
        </div>
        <span className="pill">
          <i /> {shop.workers} {shop.workers === 1 ? 'worker' : 'workers'} aging
        </span>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="top">
        <OrderForm onOrder={order} />
        <div className="stats">
          <Stat label="In the queue" value={shop.queued.length} color="#f0b43f" />
          <Stat label="Aging now" value={shop.aging.length} color="#7fc9b7" />
          <Stat label="Ready" value={shop.ready.length} color="#58d08a" />
        </div>
      </section>

      <Board shop={shop} />

      <p className="note">Workers age each cheese for {shop.age_s} s.</p>
    </main>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}
