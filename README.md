# Cheese Shop Demo

A small full-stack app for demonstrating APIs & Frontend. You order cheeses, workers age them one at a time, and the
page shows them moving across the board.

- **Part 1 (Lecture APIs & Frontend):** a typical web app: a React frontend, a FastAPI backend, Redis for the data
  and a worker for the slow jobs, in four containers.

- **Part 2 (Lecture Scaling with Kubernetes):** the same app under load, on a Kubernetes cluster on your laptop.


** Application Architecture: **
```
browser -> frontend-react -> api-service -> redis <- worker
```

| Folder | Container | On your laptop | What it is |
| --- | --- | --- | --- |
| `src/frontend-react/` | `cheese-shop-demo-frontend-react` | http://localhost:5810 | The page: React + Vite in development, nginx in production |
| `src/api-service/` | `cheese-shop-demo-api-service` | http://localhost:9810 | The backend: FastAPI, in `api/service.py` |
| none | `cheese-shop-demo-redis` | none | Redis: the tickets, and the queue of tickets waiting for a worker |
| `src/api-service/` | `cheese-shop-demo-worker-1` | none | The worker: ages the cheeses, in `api/worker.py`. The same image as the API |
| `src/deployment/` | `cheese-shop-demo-deployment` | none | Part 2: `kind`, `kubectl` and the cluster's files |

`src/docker-compose.yml` describes the four containers of Part 1. Each app folder also has a
`docker-shell.sh`, which opens a shell in its running container.

**You need:** Docker. Nothing else: no Python or Node on your laptop.

## Part 1: APIs & Frontend

### 1. Start the shop

```bash
cd src
```

```bash
docker compose up --build
```

The first run takes a few minutes to build the images. When the log says `VITE ... ready`, open
http://localhost:5810 (Vite's log says 5173, which is the port inside the container) and order some
cheeses.

Open the Network tab in your browser's developer tools: the page calls `/api/orders` twice a second and
draws whatever comes back. The page only shows the shop. Each container has one job:

| Container | Its job |
| --- | --- |
| `frontend-react` | Draws the page. The browser calls `/api/...` on the page's own origin, and Vite forwards that to `http://api-service:9000` (see `vite.config.js`) |
| `api-service` | Takes orders and answers questions about the shop. It checks every order before anything is saved |
| `redis` | Keeps the shop: a hash of tickets, and a list of tickets waiting |
| `worker` | Takes the next ticket off the list and ages the cheese. The slow work happens here, not in a request |

`api-service` is the API's name on the Docker network, and 9000 is its port inside that network.

### 2. Try the API

Open http://localhost:9810/api/docs and try these, in order:

| Call | What it shows |
| --- | --- |
| `POST /api/orders` with `{"count": 3}` | A JSON body goes in; `201` and three tickets come out |
| `GET /api/orders` | The tickets move from `queued` to `aging` to `ready` |
| `GET /api/orders/1` | A path parameter |
| `GET /api/orders/9999` | `404`: there is no such ticket |
| `POST /api/orders` with `{"count": 51}` | `422`: `Field(ge=1, le=50)` refused it before our code ran |

### 3. Look inside Redis

In a second terminal, open Redis's own command line:

```bash
docker exec -it cheese-shop-demo-redis redis-cli
```

Order 50 cheeses on the page, then ask Redis:

```
LLEN queue
HGET tickets 1
```

`LLEN` is how many tickets are waiting. `HGET` is one ticket, exactly as the API returns it. Leave
with `exit`.

Now restart the API:

```bash
docker compose restart api-service
```

Reload the page: every ticket is still there. The API keeps nothing of its own, so it can restart, or
run as many copies as we like. Part 2 needs exactly that.

### 4. See why `await` matters

In `api/service.py`, add `import time` at the top, and this as the first line of `place_order`:

```python
    time.sleep(3)  # pretend to check the payment
```

Save, and the API reloads. Order a few cheeses. The whole page stops moving for 3 seconds, because
`time.sleep` holds up the API: even `GET /api/orders` has to wait. Now change it:

```python
    await asyncio.sleep(3)  # pretend to check the payment
```

with `import asyncio` at the top, and order again. Only your order waits, and the board keeps moving.
`await` tells Python "do something else while this waits". A call to an LLM waits in the same way,
which is why the chat routes in `cheese-app-v2` are plain `def`: FastAPI runs those in a thread, so
one slow answer does not stop the API. Take the line out again.

### 5. See CORS fail, on purpose

In `src/frontend-react/src/api.js`, change the base address and save:

```js
const BASE = 'http://localhost:9810'
```

The page stops updating, and the Console says why: the page's origin (port 5810) is not the API's
origin (port 9810), and the API did not allow it. An origin is the scheme, host and port together.

There are two fixes. The API can list the origins it allows (`CORSMiddleware` in FastAPI), or the
browser can talk to one origin only. This course uses the second: nothing to configure, and the same
build runs everywhere. Put `const BASE = ''` back.

### 6. Build the production image

From `src/frontend-react`, with the shop still running:

```bash
docker build -t cheese-shop-demo-frontend-react:v1 .
```

```bash
docker run --rm --network cheese-shop-demo-network -p 8080:80 cheese-shop-demo-frontend-react:v1
```

Open http://localhost:8080. There is no Vite and no Node now: nginx serves the built files and passes
`/api` to the same API container (see `nginx.conf`). The browser code did not change. Stop it with
Ctrl-C.

### 7. Stop the shop

Press Ctrl-C where `docker compose up` is running, then:

```bash
docker compose down
```

## Part 2: Scaling with Kubernetes

> **Being rewritten for Lecture 19.** Part 1 now runs the shop in Redis from the start, and the steps
> below still begin from the old version that kept it in the API's memory, so they do not work as
> written yet.

`kind` runs Kubernetes in Docker: each node of the cluster is a container on your laptop. With
everything running it uses about 2 GB of memory. Six workers at full speed want 3 CPUs: with fewer,
cheeses just take longer. The times below are from a few runs on a 12-core laptop, so expect yours to
differ.

| Step | What you run | What you learn |
| --- | --- | --- |
| 1 | The app as it is | Each pod has its own shop |
| 2 | Redis and separate workers | State moves out of the pods, so pods can come and go |
| 3 | An HPA on CPU | Scaling by hand is over, and CPU is a late, blunt signal |
| 4 | KEDA on queue length | Scaling on what you actually care about, down to zero |

### Set up, before class

This downloads images, so do it on a good connection. It takes a few minutes the first time.

```bash
cd src/deployment && ./docker-shell.sh
```

Inside the container:

```bash
./scripts/create-cluster.sh
```

```bash
./scripts/install-keda.sh
```

```bash
./scripts/deploy.sh
```

That makes one control plane and two workers, installs metrics-server (which measures CPU) and KEDA,
builds the production images, copies them into the nodes, and starts the app.

For a second shell in the same container, run `./docker-shell.sh` again from `src/deployment`. Every
`kubectl` command below runs in one of these shells. Running `deploy.sh` again puts the API back on
step 1's in-memory version, so to start over, delete the cluster and run all three again.

### Step 1: Scale the app as it is

Open http://localhost:8080 and order some cheeses. This is the app from Part 1, unchanged, in one pod.
Read what made it happen: `k8s/1-in-memory/api-service.yaml` and `frontend-react.yaml`. The labels
connect them: a Deployment manages the pods with `app: api-service`, and the Service sends traffic to
the pods with that same label.

```bash
kubectl get pods,services -o wide
```

More pods should mean more capacity, so ask for three:

```bash
kubectl scale deployment api-service --replicas=3
```

Order a few times with the **×50** button, and watch **Ready**. It blinks between numbers, such as 50
and 0, and ticket numbers repeat. This is not a bug in the page: nginx opens a new connection for each
request, and the Service picks a pod each time. Each pod has its own memory, so each has its own shop
and its own workers.

Do not use `kubectl port-forward` to look at this: it connects to a single pod, so you would never see
the others.

Now copy a pod's name from `kubectl get pods` and delete it:

```bash
kubectl delete pod <pod-name>
```

The Deployment starts a replacement, but that pod's tickets are gone for good.

### Step 2: Move the shop into Redis

The fix is to keep the shop outside the API. Here is everything that changed in the API:

```bash
diff /api-service/api/service.py /api-service/api/service_redis.py
```

The routes and the JSON are the same, so the page did not need to change. Tickets are in a Redis hash
and the queue is a Redis list. The workers moved out as well: read `/api-service/api/worker.py`. They
now burn real CPU to age a cheese, because CPU is what the autoscaler in step 3 measures.

Apply it. This is a switch and not a migration, so the tickets in the old pods' memory are lost:

```bash
kubectl apply -k k8s/2-redis
```

```bash
kubectl get pods
```

The API is still at 3 pods, and there are two new Deployments: `redis` and `worker`. Order some
cheeses. The board holds still, and ticket numbers no longer repeat. The same three pods now share one
shop.

One worker ages about one cheese every 1.5 seconds, so add more:

```bash
kubectl scale deployment worker --replicas=3
```

Order 50 again. Each worker gets its own colour on the board. The pill at the top counts the workers
aging a cheese right now.

Now try to lose something. Delete a worker while it is busy, and an API pod too:

```bash
kubectl delete pod <worker-pod-name>
```

```bash
kubectl delete pod <api-service-pod-name>
```

Nothing is lost. Kubernetes sends a worker `SIGTERM`, and `worker.py` finishes the cheese in its hands
and takes no more. Any API pod can answer any request, because none of them holds the shop.

Finally, delete the one pod that matters:

```bash
kubectl delete pod -l app=redis
```

The shop is empty. We moved the state out of the pods, so now that state needs protecting. Our Redis
keeps nothing on disk, which is fine here. A real app needs a volume or a managed database.

The **How does it work?** section on the page still describes Part 1, where the shop is in memory.

### Step 3: Let an HPA scale on CPU

A HorizontalPodAutoscaler adds pods when CPU passes a target: here, 60% of each worker's request. Go
back to one worker and turn it on:

```bash
kubectl scale deployment worker --replicas=1
```

```bash
kubectl apply -f k8s/3-hpa.yaml
```

In a second shell, watch both, refreshed every 2 seconds:

```bash
watch -n 2 kubectl get hpa,pods
```

Wait for a number under `TARGETS`, such as `cpu: 1%/60%`. Until then the HPA has nothing to read. Keep
the page open too, and start with a small order:

```bash
./scripts/order.sh 5
```

Watch the board and the pods. The five cheeses finish in about 8 seconds, and **then** the HPA adds
pods, for work that is already done. CPU is measured after the fact: in three runs, new pods arrived
22 to 42 seconds after the order, and we got between 2 and 5 of them. The numbers change each time,
but the order of events does not.

Wait for it to go back to one pod, about a minute after it goes quiet. Then order a lot:

```bash
./scripts/order.sh 500
```

| Time | Tickets waiting | Pods | CPU |
| --- | --- | --- | --- |
| 16 s | 489 | 1 | 1% |
| 31 s | 471 | 5 | 418% |
| 46 s | 419 | 6 | 500% |
| 92 s | 239 | 6 | 500% |
| 137 s | 59 | 6 | 500% |
| 152 s | 0 | 6 | 500% |
| 182 s | 0 | 6 | 131% |
| 239 s | 0 | 1 | 1% |

CPU reads 500% because each worker is at its limit of 500m, five times its request of 100m. It cannot
go higher, so **a busy worker looks the same whether 5 or 500 tickets are waiting**. The queue fell
from 419 to 59 and CPU did not move. It stayed over its target for about 40 seconds after the queue
had emptied.

### Step 4: Scale on the queue with KEDA

The number we care about is how many tickets are waiting, and Redis knows it exactly. KEDA reads that
number and gives it to an HPA. Remove ours first, because a Deployment can only have one:

```bash
kubectl delete -f k8s/3-hpa.yaml
```

```bash
kubectl apply -f k8s/4-keda.yaml
```

Read `k8s/4-keda.yaml`: it asks for one worker for every 5 tickets waiting, and no workers at all when
there are none.

In your watch, the worker goes to zero, and the page says **0 workers aging**. Nothing is running, and
nothing is wasted. There is a new HPA called `keda-hpa-worker`: KEDA does not replace the HPA from
step 3, it gives it a better signal. Under `TARGETS`, `296/5 (avg)` means about 296 tickets per worker, and
`61334m` is the same kind of number in thousandths: about 61.

Order 5, then 20, then 500. Wait for it to return to zero between orders, about 30 seconds after the
last cheese.

```bash
./scripts/order.sh 5
```

| Tickets | CPU HPA | KEDA |
| --- | --- | --- |
| 5 | Done in about 8 s, then 2 to 5 pods arrive | 1 pod, done in about 13 s |
| 20 | Done in about 30 s, just as 5 or 6 pods arrive | Usually 4 pods, done in about 13 s |
| 500, first new pod | About 30 s | About 5 s |
| 500, every ticket done | About 154 s, from 1 pod | About 138 s, from 0 pods |
| Afterwards | 1 pod, 240 to 270 s after the order | 0 pods, about 165 s after the order |

KEDA is a little slower on the smallest order, because the first pod has to start from nothing. That
is the price of scaling to zero.

KEDA reads the queue every 5 seconds, but the HPA behind it decides every 15. In one run of four, that
decision came late: only 10 tickets were left, so 20 tickets got 2 pods and took 29 seconds.

### Clean up

```bash
./scripts/delete-cluster.sh
```

Leave the container with `exit`.

### What carries over to the cheese app

| Here | In `cheese-app-v3` |
| --- | --- |
| The browser only calls `/api/...` on its own origin | The same, so one image runs everywhere |
| `api-service` is the name in Docker and Kubernetes | The same |
| Vite in development, nginx in production | The same |
| The shop in Redis, so pods can come and go | Chats in Cloud Storage (`CHAT_BUCKET`), for the same reason |
| `kind load` copies images into the nodes | On GKE, images are pushed to Artifact Registry |
| A NodePort and `kind.yaml` | On GKE, a Google load balancer through a Gateway |
| CPU cannot see a queue | A chat mostly waits on Gemini, so CPU barely moves there either |

### If something goes wrong

| What you see | What to do |
| --- | --- |
| The worker jumps to 5 pods as soon as you apply the HPA | Its first reading still includes your last order. Wait for it to return to one pod |
| `port is already allocated` when creating the cluster | Something is using port 8080. Stop it, such as the container from Part 1's step 6 |
| `TARGETS` shows `<unknown>` | Wait up to a minute for the first reading |
| `already managed by the hpa` when applying KEDA | Remove the HPA first: `kubectl delete -f k8s/3-hpa.yaml` |
| Orders sit in the queue and no worker starts | You removed KEDA with the worker at zero, and a plain HPA cannot start from zero. Run `kubectl scale deployment worker --replicas=1` |
| A ticket stays in **Aging** forever | Its worker was killed without `SIGTERM`, such as by deleting the node |
| Worker colours repeat | There are six colours, and every new pod takes the next one. Empty the shop with `kubectl delete pod -l app=redis` |

## Checks

To rehearse Part 2 before class, run this inside the deployment shell. It **deletes the cluster**,
builds a new one, runs all four steps, checks each result and prints the numbers. It takes about 20
minutes, and the other commands should wait until it finishes:

```bash
./scripts/verify.sh
```

Inside the API container:

```bash
pytest
```

Inside the frontend container:

```bash
npm run check
```
