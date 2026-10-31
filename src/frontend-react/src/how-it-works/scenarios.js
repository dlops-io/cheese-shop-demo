// What the diagram draws and what plays on it. Coordinates are in the SVG's viewBox (1000 x 480).

export const NODES = {
  browser: { x: 40, y: 172, w: 210, h: 110, title: 'Cheese Shop', sub: 'React, in your browser' },
  frontend: {
    x: 310,
    y: 195,
    w: 165,
    h: 64,
    badge: 'V',
    title: 'frontend-react',
    sub: 'Vite dev server',
  },
  routes: { x: 545, y: 195, w: 135, h: 64, badge: 'API', title: 'Routes', sub: '/api/orders' },
  tickets: { x: 545, y: 330, w: 135, h: 64, badge: '#', title: 'tickets', sub: 'in memory' },
  queue: { x: 735, y: 115, w: 205, h: 60, badge: '≡', title: 'queue', sub: 'waiting for a worker' },
  worker1: { x: 735, y: 235, w: 98, h: 60, title: 'worker-1', sub: 'aging', color: '#7fc9b7' },
  worker2: { x: 842, y: 235, w: 98, h: 60, title: 'worker-2', sub: 'aging', color: '#f0a23f' },
}

// Each edge is a list of corners, drawn from `from` to `to`; hops can travel it backwards
export const EDGES = {
  page: {
    from: 'browser',
    to: 'frontend',
    points: [
      [250, 227],
      [310, 227],
    ],
  },
  proxy: {
    from: 'frontend',
    to: 'routes',
    points: [
      [475, 227],
      [545, 227],
    ],
  },
  store: {
    from: 'routes',
    to: 'tickets',
    points: [
      [612, 259],
      [612, 330],
    ],
  },
  enqueue: {
    from: 'routes',
    to: 'queue',
    points: [
      [680, 215],
      [708, 215],
      [708, 145],
      [735, 145],
    ],
  },
  take1: {
    from: 'queue',
    to: 'worker1',
    points: [
      [784, 175],
      [784, 235],
    ],
  },
  take2: {
    from: 'queue',
    to: 'worker2',
    points: [
      [891, 175],
      [891, 235],
    ],
  },
  update1: {
    from: 'worker1',
    to: 'tickets',
    points: [
      [784, 295],
      [784, 352],
      [680, 352],
    ],
  },
  update2: {
    from: 'worker2',
    to: 'tickets',
    points: [
      [891, 295],
      [891, 372],
      [680, 372],
    ],
  },
  direct: {
    from: 'browser',
    to: 'routes',
    points: [
      [145, 172],
      [145, 135],
      [502, 135],
      [502, 207],
      [545, 207],
    ],
  },
}

export const KINDS = {
  request: { color: '#6fb3f2', label: 'Request' },
  response: { color: '#58d08a', label: 'Response' },
  data: { color: '#f0b43f', label: 'Tickets' },
  local: { color: '#c9a6f0', label: 'Runs right here' },
  problem: { color: '#ee6a5c', label: 'Something goes wrong' },
}

const fwd = (id) => [id, 1]
const rev = (id) => [id, -1]
const TO_API = [fwd('page'), fwd('proxy')]
const FROM_API = [rev('proxy'), rev('page')]

// A hop moves a labelled dot along `path`, or pulses at one node with `at`
export const SCENARIOS = [
  {
    title: 'Open the page',
    where: 'Browser · Vite',
    hops: [
      {
        path: [fwd('page')],
        label: 'GET /',
        kind: 'request',
        caption:
          'You open localhost:5810. Docker forwards that port to the Vite dev server in the frontend-react container.',
      },
      {
        path: [rev('page')],
        label: 'HTML + JavaScript',
        kind: 'response',
        caption: 'Vite sends back index.html and the React code.',
      },
      {
        at: 'browser',
        label: 'React starts',
        kind: 'local',
        caption:
          'The page now runs in your browser, not in a container. Every /api call still goes to its own origin, port 5810.',
      },
    ],
  },
  {
    title: 'Place an order',
    where: 'OrderForm.jsx · api.js · service.py',
    hops: [
      {
        at: 'browser',
        label: 'placeOrder(3)',
        kind: 'local',
        caption: 'You click Order. OrderForm calls onOrder, which calls placeOrder in api.js.',
      },
      {
        path: [fwd('page')],
        label: 'POST {"count": 3}',
        kind: 'request',
        caption: 'The browser sends a JSON body to /api/orders on its own origin.',
      },
      {
        path: [fwd('proxy')],
        label: 'POST /api/orders',
        kind: 'request',
        caption:
          'Vite sees /api and forwards the request, full path included, to http://api-service:9000.',
      },
      {
        at: 'routes',
        label: 'Order model ✓',
        kind: 'local',
        caption:
          'FastAPI checks the body against the Order model. A count of 51 would stop here with a 422.',
      },
      {
        path: [fwd('store')],
        label: '3 new tickets',
        kind: 'data',
        caption: 'place_order creates 3 tickets in memory, each one "queued".',
      },
      {
        path: [fwd('enqueue')],
        label: '3 tickets',
        kind: 'data',
        caption: 'It puts them in the queue for the workers.',
      },
      {
        path: FROM_API,
        label: '201 + tickets',
        kind: 'response',
        caption: 'The API answers right away. It does not wait for the cheese to age.',
      },
    ],
  },
  {
    title: 'Age a cheese',
    where: 'service.py · worker()',
    hops: [
      {
        path: [fwd('take1')],
        label: 'ticket #1',
        kind: 'data',
        caption: 'worker-1 has been waiting at queue.get(). It takes the first ticket.',
      },
      {
        path: [fwd('update1')],
        label: 'state: aging',
        kind: 'data',
        caption: 'It marks the ticket "aging" and writes its own name on it.',
      },
      {
        path: [fwd('take2')],
        label: 'ticket #2',
        kind: 'data',
        caption: 'worker-2 does the same with the next ticket.',
      },
      {
        at: 'worker1',
        label: 'await 1.5 s',
        kind: 'local',
        caption:
          'Each worker waits with await asyncio.sleep. While they wait, the API is free to answer requests.',
      },
      {
        path: [fwd('update1')],
        label: 'state: ready',
        kind: 'data',
        caption: 'The cheese is ready, and worker-1 goes back to the queue for another ticket.',
      },
    ],
  },
  {
    title: 'Poll for updates',
    where: 'App.jsx · service.py',
    hops: [
      {
        at: 'browser',
        label: 'every 500 ms',
        kind: 'local',
        caption: 'A timer in App.jsx fires twice a second. The page never guesses: it asks.',
      },
      {
        path: TO_API,
        label: 'GET /api/orders',
        kind: 'request',
        caption: 'The request goes through Vite to the same API.',
      },
      {
        path: [fwd('store')],
        label: 'read tickets',
        kind: 'request',
        caption: 'list_orders reads every ticket in memory.',
      },
      {
        path: [rev('store')],
        label: 'queued · aging · ready',
        kind: 'data',
        caption: 'It groups them by state.',
      },
      { path: FROM_API, label: 'JSON', kind: 'response', caption: 'The shop comes back as JSON.' },
      {
        at: 'browser',
        label: 'setShop(...)',
        kind: 'local',
        caption:
          'setShop stores the answer and React redraws the board. The API owns the shop; the page only shows it.',
      },
    ],
  },
  {
    title: 'What if it blocks?',
    where: 'time.sleep vs await',
    hops: [
      {
        at: 'worker1',
        label: 'time.sleep(1.5)',
        kind: 'problem',
        caption: 'Suppose a worker calls time.sleep instead of await asyncio.sleep.',
      },
      {
        path: TO_API,
        label: 'GET /api/orders',
        kind: 'request',
        caption: "The page's next poll arrives at the API.",
      },
      {
        at: 'routes',
        label: 'stuck',
        kind: 'problem',
        caption:
          'Routes and workers share one event loop, and time.sleep never gives it back, so this request has to wait.',
      },
      {
        path: FROM_API,
        label: 'late answer',
        kind: 'response',
        caption:
          'The answer only comes when the sleeping stops: 8.9 s instead of an instant, in our test with 6 cheeses.',
      },
    ],
  },
  {
    title: 'Blocked by CORS',
    where: 'api.js · the browser',
    hops: [
      {
        at: 'browser',
        label: "BASE = ':9810'",
        kind: 'problem',
        caption: 'Suppose api.js calls http://localhost:9810 directly, skipping Vite.',
      },
      {
        path: [fwd('direct')],
        label: 'GET :9810/api/orders',
        kind: 'request',
        caption:
          'The page is on port 5810 and the API is on 9810. A different port means a different origin.',
      },
      {
        path: [rev('direct')],
        label: 'answer',
        kind: 'response',
        caption: 'The API answers as usual, but nothing in the answer says that origin is allowed.',
      },
      {
        at: 'browser',
        label: 'CORS error',
        kind: 'problem',
        caption:
          'So the browser refuses to hand the answer to the page. Going through one origin avoids the problem.',
      },
    ],
  },
]
