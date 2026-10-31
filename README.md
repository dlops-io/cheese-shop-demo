# Cheese Shop

A small full-stack app for Lecture 18: one React page and one FastAPI service. You order cheeses,
and two workers age them one at a time while the page shows them moving across the board.

| Folder | Container | On your laptop | What it is |
| --- | --- | --- | --- |
| `src/api-service/` | `cheese-shop-demo-api-service` | http://localhost:9810 | FastAPI: everything is in `api/service.py` |
| `src/frontend-react/` | `cheese-shop-demo-frontend-react` | http://localhost:5810 | React + Vite in development, nginx in production |

Each folder has a `docker-shell.sh` that builds a development image (`Dockerfile.dev`) and opens a
shell in it, with your code mounted. `Dockerfile` in the same folder is the production image.

**You need:** Docker. Nothing else: no Python or Node on your laptop.

## 1. Start the API

```bash
cd src/api-service && ./docker-shell.sh
```

Inside the container:

```bash
api_server
```

Open http://localhost:9810/api/docs and try these, in order:

| Call | What it shows |
| --- | --- |
| `POST /api/orders` with `{"count": 3}` | A JSON body goes in; `201` and three tickets come out |
| `GET /api/orders` | The tickets move from `queued` to `aging` to `ready` |
| `GET /api/orders/1` | A path parameter |
| `GET /api/orders/9999` | `404`: there is no such ticket |
| `POST /api/orders` with `{"count": 51}` | `422`: `Field(ge=1, le=50)` refused it before our code ran |

## 2. Start the frontend

In a second terminal:

```bash
cd src/frontend-react && ./docker-shell.sh
```

Inside the container:

```bash
npm run dev
```

Open http://localhost:5810 (Vite's log says 5173, which is the port inside the container) and order
some cheeses. Open the Network tab in your browser's developer tools: the page calls `/api/orders`
twice a second and draws whatever comes back. The API owns the shop; the page only shows it.

The page calls its own origin, and Vite forwards `/api` to `http://api-service:9000` (see
`vite.config.js`). `api-service` is the API container's alias on the Docker network, and 9000 is its
port inside that network.

The **How does it work?** section at the bottom of the page animates these flows. Its code is in
`src/how-it-works/` and only explains the app, so you can skip that folder when reading the code.

## 3. See why `await` matters

In `api/service.py`, add `import time` and change the worker's sleep:

```python
time.sleep(AGE_S)  # instead of: await asyncio.sleep(AGE_S)
```

Save and order 10 cheeses. The page stops moving. `await` tells Python "do something else while this
waits", and `time.sleep` does not: the whole API is stuck, so even `GET /api/orders` has to wait.
A call to an LLM that blocks like this freezes an API in the same way, which is a bug you can find in
`cheese-app-v2`. Put the line back.

## 4. See CORS fail, on purpose

In `src/api.js`, change the base address and save:

```js
const BASE = 'http://localhost:9810'
```

The page stops updating, and the Console says why: the page's origin (port 5810) is not the API's
origin (port 9810), and the API did not allow it. An origin is the scheme, host and port together.

There are two fixes. The API can list the origins it allows (`CORSMiddleware` in FastAPI), or the
browser can talk to one origin only. This course uses the second: nothing to configure, and the same
build runs everywhere. Put `const BASE = ''` back.

## 5. Build the production image

Stop `npm run dev` with Ctrl-C and leave the container with `exit`. Then, from `src/frontend-react`:

```bash
docker build -t cheese-shop-demo-frontend-react:v1 .
```

```bash
docker run --rm --network cheese-shop-demo-network -p 8080:80 cheese-shop-demo-frontend-react:v1
```

Open http://localhost:8080. There is no Vite and no Node now: nginx serves the built files and passes
`/api` to the same API container (see `nginx.conf`). The browser code did not change.

## Checks

Inside the API container:

```bash
pytest
```

Inside the frontend container:

```bash
npm run check
```
