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
  api: { x: 545, y: 195, w: 150, h: 64, badge: 'API', title: 'api-service', sub: 'FastAPI' },
  tickets: {
    x: 750,
    y: 120,
    w: 195,
    h: 60,
    badge: '#',
    title: 'tickets',
    sub: 'a hash: id → ticket',
  },
  queue: {
    x: 750,
    y: 215,
    w: 195,
    h: 60,
    badge: '≡',
    title: 'queue',
    sub: 'a list of ids waiting',
  },
  worker: {
    x: 750,
    y: 360,
    w: 195,
    h: 60,
    badge: 'W',
    title: 'worker',
    sub: 'ages one cheese at a time',
    color: '#7fc9b7',
  },
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
    to: 'api',
    points: [
      [475, 227],
      [545, 227],
    ],
  },
  store: {
    from: 'api',
    to: 'tickets',
    points: [
      [695, 212],
      [722, 212],
      [722, 150],
      [750, 150],
    ],
  },
  enqueue: {
    from: 'api',
    to: 'queue',
    points: [
      [695, 245],
      [750, 245],
    ],
  },
  take: {
    from: 'queue',
    to: 'worker',
    points: [
      [847, 275],
      [847, 360],
    ],
  },
  update: {
    from: 'worker',
    to: 'tickets',
    points: [
      [945, 390],
      [970, 390],
      [970, 150],
      [945, 150],
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
        at: 'api',
        label: 'Order model ✓',
        kind: 'local',
        caption:
          'FastAPI checks the body against the Order model. A count of 51 would stop here with a 422.',
      },
      {
        path: [fwd('store')],
        label: '3 new tickets',
        kind: 'data',
        caption:
          'place_order numbers each ticket with INCR next_id and saves it in Redis, in the tickets hash, as "queued".',
      },
      {
        path: [fwd('enqueue')],
        label: 'RPUSH queue',
        kind: 'data',
        caption: 'It adds each ticket id to the end of the queue list.',
      },
      {
        path: FROM_API,
        label: '201 + tickets',
        kind: 'response',
        caption:
          "The API answers right away. It does not wait for the cheese to age: that is the worker's job.",
      },
    ],
  },
  {
    title: 'Age a cheese',
    where: 'worker.py',
    hops: [
      {
        at: 'worker',
        label: 'BLPOP queue',
        kind: 'local',
        caption:
          'The worker is its own container, waiting at BLPOP: Redis answers as soon as an id is in the queue.',
      },
      {
        path: [fwd('take')],
        label: 'ticket #1',
        kind: 'data',
        caption:
          'It takes the oldest id off the queue. Each id goes to one worker only, however many are running.',
      },
      {
        path: [fwd('update')],
        label: 'state: aging',
        kind: 'data',
        caption: 'It saves the ticket as "aging", with its own name on it.',
      },
      {
        at: 'worker',
        label: 'burn 0.75 s of CPU',
        kind: 'local',
        caption:
          'It ages the cheese: real CPU work, about 1.5 s with the half a CPU this container gets.',
      },
      {
        path: [fwd('update')],
        label: 'state: ready',
        kind: 'data',
        caption: 'It saves the ticket as "ready", and goes back to the queue for the next one.',
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
        caption: 'The request goes through Vite to the API.',
      },
      {
        path: [fwd('store')],
        label: 'HVALS tickets',
        kind: 'request',
        caption: 'list_orders reads every ticket from the hash in Redis.',
      },
      {
        path: [rev('store')],
        label: 'queued · aging · ready',
        kind: 'data',
        caption: 'It groups them by state, in id order.',
      },
      { path: FROM_API, label: 'JSON', kind: 'response', caption: 'The shop comes back as JSON.' },
      {
        at: 'browser',
        label: 'setShop(...)',
        kind: 'local',
        caption:
          'setShop stores the answer and React redraws the board. Redis keeps the shop; the page only shows it.',
      },
    ],
  },
  {
    title: 'Restart the API',
    where: 'docker compose restart api-service',
    hops: [
      {
        at: 'api',
        label: 'restart',
        kind: 'problem',
        caption: 'The API stops and starts again, as it would after a crash or a new release.',
      },
      {
        at: 'tickets',
        label: 'still here',
        kind: 'data',
        caption: 'The tickets were never in the API: they are in Redis, so nothing is lost.',
      },
      {
        path: [...TO_API, fwd('store')],
        label: 'GET /api/orders',
        kind: 'request',
        caption: 'The next poll reaches the new API, which reads the same hash.',
      },
      {
        path: [rev('store'), ...FROM_API],
        label: 'the same shop',
        kind: 'response',
        caption:
          'The page carries on as if nothing happened. An API that keeps nothing can restart, or run as many copies as we like.',
      },
    ],
  },
]
