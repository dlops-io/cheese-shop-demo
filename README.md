# Cheese Shop

A small full-stack app for two lectures. You order cheeses, workers age them one at a time, and the
page shows them moving across the board.

- **Part 1 (Lecture 18):** one React page and one FastAPI service, in two containers.
- **Part 2 (Lecture 19):** the same app on a Kubernetes cluster on your laptop. We scale it, watch it
  break, fix it, and let autoscalers take over.

| Folder | Container | On your laptop | What it is |
| --- | --- | --- | --- |
| `src/api-service/` | `cheese-shop-demo-api-service` | http://localhost:9810 | FastAPI: Part 1 is all in `api/service.py` |
| `src/frontend-react/` | `cheese-shop-demo-frontend-react` | http://localhost:5810 | React + Vite in development, nginx in production |
| `src/deployment/` | `cheese-shop-demo-deployment` | none | Part 2: `kind`, `kubectl` and the cluster's files |

Each app folder has a `docker-shell.sh` that builds a development image (`Dockerfile.dev`) and opens
a shell in it, with your code mounted. `Dockerfile` in the same folder is the production image.

**You need:** Docker. Nothing else: no Python or Node on your laptop.

## Part 1: API and frontend (Lecture 18)

You can skip `api/service_redis.py` and `api/worker.py` for now: Part 2 adds them.

### 1. Start the API

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

### 2. Start the frontend

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

### 3. See why `await` matters

In `api/service.py`, add `import time` and change the worker's sleep:

```python
time.sleep(AGE_S)  # instead of: await asyncio.sleep(AGE_S)
```

Save and order 10 cheeses. The page stops moving. `await` tells Python "do something else while this
waits", and `time.sleep` does not: the whole API is stuck, so even `GET /api/orders` has to wait.
A call to an LLM can block an API in the same way, which is why the chat routes in `cheese-app-v2`
are plain `def`: FastAPI runs those in a thread, so one slow answer does not stop the API. Put the
line back.

### 4. See CORS fail, on purpose

In `src/api.js`, change the base address and save:

```js
const BASE = 'http://localhost:9810'
```

The page stops updating, and the Console says why: the page's origin (port 5810) is not the API's
origin (port 9810), and the API did not allow it. An origin is the scheme, host and port together.

There are two fixes. The API can list the origins it allows (`CORSMiddleware` in FastAPI), or the
browser can talk to one origin only. This course uses the second: nothing to configure, and the same
build runs everywhere. Put `const BASE = ''` back.

### 5. Build the production image

Stop `npm run dev` with Ctrl-C and leave the container with `exit`. Then, from `src/frontend-react`:

```bash
docker build -t cheese-shop-demo-frontend-react:v1 .
```

```bash
docker run --rm --network cheese-shop-demo-network -p 8080:80 cheese-shop-demo-frontend-react:v1
```

Open http://localhost:8080. There is no Vite and no Node now: nginx serves the built files and passes
`/api` to the same API container (see `nginx.conf`). The browser code did not change.

Stop it with Ctrl-C before Part 2, which needs port 8080.

## Part 2: Scaling on Kubernetes (Lecture 19)

`kind` runs Kubernetes in Docker: each node of the cluster is a container on your laptop. With
everything running it uses about 2 GB of memory. Six workers at full speed want 3 CPUs: with fewer,
cheeses just take longer. The times below are from one run on a 12-core laptop, so expect yours to
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

Watch the board and the pods. The five cheeses finish in about 9 seconds, and **then** the HPA adds
pods, for work that is already done. CPU is measured after the fact: in three runs, new pods arrived
22 to 42 seconds after the order, and we got between 2 and 5 of them. The numbers change each time,
but the order of events does not.

Wait for it to go back to one pod, about a minute after it goes quiet. Then order a lot:

```bash
./scripts/order.sh 500
```

| Time | Tickets waiting | Pods | CPU |
| --- | --- | --- | --- |
| 17 s | 489 | 1 | 1% |
| 32 s | 450 | 5 | 295% |
| 47 s | 393 | 6 | 500% |
| 94 s | 207 | 6 | 500% |
| 141 s | 21 | 6 | 500% |
| 171 s | 0 | 6 | 499% |
| 234 s | 0 | 1 | 1% |

CPU reads 500% because each worker is at its limit of 500m, five times its request of 100m. It cannot
go higher, so **a busy worker looks the same whether 5 or 500 tickets are waiting**. The queue fell
from 393 to 21 and CPU did not move. It was still high 20 seconds after the queue had emptied.

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
| 5 | Done in about 9 s, then 2 to 5 pods arrive | 1 pod, done in about 12 to 15 s |
| 20 | not measured | 4 pods, done in about 12 s |
| 500 | 149 s, from 1 pod | 135 s, from 0 pods |
| Afterwards | 1 pod, 234 s after the order | 0 pods, 162 s after the order |

KEDA is a little slower on the smallest order, because the first pod has to start from nothing. That
is the price of scaling to zero.

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
| `port is already allocated` when creating the cluster | Something is using port 8080. Stop it, such as the container from Part 1's step 5 |
| `TARGETS` shows `<unknown>` | Wait up to a minute for the first reading |
| `already managed by the hpa` when applying KEDA | Remove the HPA first: `kubectl delete -f k8s/3-hpa.yaml` |
| Orders sit in the queue and no worker starts | You removed KEDA with the worker at zero, and a plain HPA cannot start from zero. Run `kubectl scale deployment worker --replicas=1` |
| A ticket stays in **Aging** forever | Its worker was killed without `SIGTERM`, such as by deleting the node |
| Worker colours repeat | There are six colours, and every new pod takes the next one. Empty the shop with `kubectl delete pod -l app=redis` |

## Checks

Inside the API container:

```bash
pytest
```

Inside the frontend container:

```bash
npm run check
```
