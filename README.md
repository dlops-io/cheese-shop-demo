# Cheese Shop Demo

In this tutorial we run a small full-stack app on our laptop, in four containers on one Docker network.
You order cheeses, a worker ages them one at a time, and the page shows them moving across the board.

![Application Architecture](images/llm-rag-flow-1.png)

## Prerequisites
- Docker, with ports 5810 and 9810 free. Nothing else: no Python or Node on your laptop.

## Tutorial: Environment Setup

### Clone the GitHub repository
- Clone or download from [here](https://github.com/dlops-io/cheese-shop-demo)

## Tutorial: APIs & Frontend
We run a typical web app: a React frontend, a FastAPI backend, Redis for the data, and a worker for the
slow jobs.

### Start the shop
1. From the `cheese-shop-demo` folder, build and start all four containers:
```bash
cd src
```

```bash
docker compose up --build
```

The first run takes a few minutes to build the images.

2. When the log says `VITE ... ready`, open http://localhost:5810 and order some cheeses. Vite's log
   says 5173: that is the port inside the container.

3. Open the Network tab in your browser's developer tools. The page calls `/api/orders` twice a second
   and draws whatever comes back: it only shows the shop.

The page calls its own origin, and Vite forwards `/api` to `http://api-service:9000` (see
`vite.config.js`). `api-service` is the API's name on the Docker network, and 9000 is its port there.

### View API docs
FastAPI gives us interactive API documentation for free.
- Go to http://localhost:9810/api/docs
- Try these, in order:

| Call | What it shows |
| --- | --- |
| `POST /api/orders` with `{"count": 3}` | A JSON body goes in; `201` and three tickets come out |
| `GET /api/orders` | The tickets move from `queued` to `aging` to `ready` |
| `GET /api/orders/1` | A path parameter |
| `GET /api/orders/9999` | `404`: there is no such ticket |
| `POST /api/orders` with `{"count": 51}` | `422`: `Field(ge=1, le=50)` refused it before our code ran |

### Look inside Redis
1. In a new terminal, open Redis's command line:
```bash
docker exec -it cheese-shop-demo-redis redis-cli
```

2. Order 50 cheeses on the page, then ask Redis:
```
LLEN queue
HGET tickets 1
```

`LLEN` is how many tickets are waiting. `HGET` is one ticket, exactly as the API returns it.

3. Leave with `exit`, and restart the API from the `src` folder:
```bash
docker compose restart api-service
```

4. Reload the page: every ticket is still there. The API keeps nothing of its own, so it can restart,
   or run as many copies as we like. The Kubernetes tutorial relies on this.

### See why `await` matters
1. In `src/api-service/api/service.py`, add `import time` at the top, and this as the first line of
   `place_order`:
```python
    time.sleep(3)  # pretend to check the payment
```

2. Save, and the API reloads. Order a few cheeses. The whole page stops moving for 3 seconds:
   `time.sleep` holds up the API, so even `GET /api/orders` has to wait.

3. Add `import asyncio` at the top, and change the line to:
```python
    await asyncio.sleep(3)  # pretend to check the payment
```

4. Order again. Only your order waits, and the board keeps moving. `await` tells Python "do something
   else while this waits".

5. Take the line out again.

A slow call that cannot be awaited, such as a call to an LLM, goes in a plain `def` route instead:
FastAPI runs those in a thread, so one slow answer does not stop the API. The chat routes in
`cheese-app-v2` do this.

### Review the code
| File | What it does |
| --- | --- |
| `src/docker-compose.yml` | The four containers, and how they connect |
| `src/api-service/api/service.py` | The API: its routes, and the `Order` model that checks every order |
| `src/api-service/api/worker.py` | The worker: takes a ticket from the queue, ages the cheese, repeats |
| `src/frontend-react/vite.config.js` | Forwards `/api` to the API container |
| `src/frontend-react/src/api.js` | Every call to the API |
| `src/frontend-react/src/App.jsx` | Asks the API for the shop twice a second, and draws it |
| `src/frontend-react/src/OrderForm.jsx` | The order form |
| `src/frontend-react/src/Board.jsx` | The three columns of tickets |

`src/frontend-react/src/how-it-works/` draws the **How does it work?** section at the bottom of the
page. It only explains the app, so you can skip it when reading the code.

Run the tests and the frontend checks while the shop is running:
```bash
docker compose exec api-service pytest
```

```bash
docker compose exec frontend-react npm run check
```

## Tutorial: Scaling with Kubernetes

Coming soon...

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `port is already allocated` | Another container is using port 5810 or 9810. Stop it, or run `docker ps` to find it |
| `The container name ... is already in use` | A container from an earlier run is still there. Run `docker ps -a` to find it, then `docker rm -f` it |
| The page says `The API answered 500` | Redis is not running. Run `docker compose up -d redis` in `src` |
| Tickets stay in **Queued** | The worker is not running. Run `docker compose ps` in `src` to check |

## Docker Cleanup

Press Ctrl-C where `docker compose up` is running, then, from `src`:
```bash
docker compose down
```

The next command removes images and containers you are not using, across all your projects, so check
the list it shows you first:
```bash
docker system prune
```
