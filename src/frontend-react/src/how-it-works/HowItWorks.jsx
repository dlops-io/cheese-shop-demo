// The animated "How does it work?" section. It only explains the app: nothing here talks to the API.
import { useCallback, useEffect, useRef, useState } from 'react'
import { EDGES, KINDS, NODES, SCENARIOS } from './scenarios'
import './how-it-works.css'

const HOP_MS = 1300
const AT_NODE_MS = 1800
const HOP_GAP_MS = 300
const SCENARIO_GAP_MS = 1600

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const svgPath = (points) => `M${points.map(([x, y]) => `${x} ${y}`).join(' L')}`
const hopEdges = (hop) => (hop.path ?? []).map(([id]) => id)
const hopNodes = (hop) =>
  hop.at ? [hop.at] : hop.path.flatMap(([id]) => [EDGES[id].from, EDGES[id].to])

// Where the dot is, a fraction `t` of the way along the corners of a hop
function pointAlong(points, t) {
  const legs = points.slice(1).map(([x, y], i) => {
    const [fromX, fromY] = points[i]
    return { fromX, fromY, x, y, length: Math.hypot(x - fromX, y - fromY) }
  })
  let remaining = t * legs.reduce((sum, leg) => sum + leg.length, 0)
  for (const leg of legs) {
    if (remaining <= leg.length) {
      const f = leg.length ? remaining / leg.length : 0
      return { x: leg.fromX + (leg.x - leg.fromX) * f, y: leg.fromY + (leg.y - leg.fromY) * f }
    }
    remaining -= leg.length
  }
  const [x, y] = points.at(-1)
  return { x, y }
}

function dotPosition(hop, progress) {
  if (hop.at) {
    const node = NODES[hop.at]
    return { x: node.x + node.w / 2, y: node.y - 4 }
  }
  const points = hop.path.flatMap(([id, direction]) =>
    direction === 1 ? EDGES[id].points : EDGES[id].points.toReversed(),
  )
  const eased = progress < 0.5 ? 2 * progress ** 2 : 1 - (-2 * progress + 2) ** 2 / 2
  return pointAlong(points, eased)
}

function Node({ id, state, color }) {
  const { x, y, w, h, title, sub, badge, color: titleColor } = NODES[id]
  const active = state === 'active'
  const left = badge ? x + 52 : x + 12

  if (id === 'browser') {
    return (
      <g className={`node ${state}`}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={14}
          className="box"
          stroke={active ? color : undefined}
        />
        <path d={`M${x} ${y + 26} H${x + w}`} className="divider" />
        {['#ee6a5c', '#f0b43f', '#58d08a'].map((fill, i) => (
          <circle key={fill} cx={x + 14 + i * 10} cy={y + 13} r={3.2} fill={fill} />
        ))}
        <rect x={x + 50} y={y + 6} width={w - 62} height={14} rx={7} className="address" />
        <text x={x + 58} y={y + 16.5} className="sub small">
          localhost:5810
        </text>
        <text x={x + 34} y={y + 72} fontSize={26} textAnchor="middle">
          🧀
        </text>
        <text x={x + 58} y={y + 60} className="title">
          {title}
        </text>
        <text x={x + 58} y={y + 77} className="sub">
          {sub}
        </text>
      </g>
    )
  }

  return (
    <g className={`node ${state}`}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        className="box"
        stroke={active ? color : undefined}
      />
      {badge && (
        <>
          <rect
            x={x + 10}
            y={y + h / 2 - 16}
            width={32}
            height={32}
            rx={8}
            className="badge"
            fill={active ? color : undefined}
          />
          <text
            x={x + 26}
            y={y + h / 2 + 4.5}
            textAnchor="middle"
            className={active ? 'badge-text on' : 'badge-text'}
          >
            {badge}
          </text>
        </>
      )}
      <text x={left} y={y + h / 2 - 3} className="title" fill={titleColor}>
        {title}
      </text>
      <text x={left} y={y + h / 2 + 13} className="sub">
        {sub}
      </text>
    </g>
  )
}

function Dot({ hop, progress, color }) {
  const { x, y } = dotPosition(hop, progress)
  const width = hop.label.length * 6.4 + 28
  const chipX = Math.max(8, Math.min(1000 - width - 8, x - width / 2))
  const chipY = Math.max(6, y - 36)
  return (
    <g className="dot">
      <circle cx={x} cy={y} r={7} fill={color} className="ring" />
      <circle cx={x} cy={y} r={7} fill={color} stroke="#0d2727" strokeWidth={2.5} />
      <g transform={`translate(${chipX} ${chipY})`}>
        <rect width={width} height={22} rx={11} className="chip" />
        <circle cx={11} cy={11} r={3.5} fill={color} />
        <text x={20} y={15} className="chip-text">
          {hop.label}
        </text>
      </g>
    </g>
  )
}

export default function HowItWorks() {
  const [{ scenarioIndex, hopIndex }, setPosition] = useState({ scenarioIndex: 0, hopIndex: 0 })
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0))
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const progressRef = useRef(progress)

  const scenario = SCENARIOS[scenarioIndex]
  const hop = scenario.hops[hopIndex]
  const color = KINDS[hop.kind].color

  const goTo = useCallback((nextScenario, nextHop, nextProgress = 0) => {
    progressRef.current = nextProgress
    setProgress(nextProgress)
    setPosition({ scenarioIndex: nextScenario, hopIndex: nextHop })
  }, [])

  const goToNextHop = useCallback(
    (fromScenario, fromHop, nextProgress) => {
      if (fromHop < SCENARIOS[fromScenario].hops.length - 1) {
        goTo(fromScenario, fromHop + 1, nextProgress)
      } else {
        goTo((fromScenario + 1) % SCENARIOS.length, 0, nextProgress)
      }
    },
    [goTo],
  )

  // Play the current hop, then move on
  useEffect(() => {
    if (!playing) return
    const current = SCENARIOS[scenarioIndex]
    const duration = current.hops[hopIndex].at ? AT_NODE_MS : HOP_MS
    const isLast = hopIndex === current.hops.length - 1
    let frame, timeout, start
    const tick = (time) => {
      start ??= time - progressRef.current * duration
      const next = Math.min(1, (time - start) / duration)
      progressRef.current = next
      setProgress(next)
      if (next < 1) frame = requestAnimationFrame(tick)
      else {
        const pause = isLast ? SCENARIO_GAP_MS : HOP_GAP_MS
        timeout = setTimeout(() => goToNextHop(scenarioIndex, hopIndex), pause)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [playing, scenarioIndex, hopIndex, goToNextHop])

  function showHop(index) {
    setPlaying(false)
    goTo(scenarioIndex, index, 1)
  }

  function stepBack() {
    setPlaying(false)
    if (hopIndex > 0) return goTo(scenarioIndex, hopIndex - 1, 1)
    const previous = (scenarioIndex - 1 + SCENARIOS.length) % SCENARIOS.length
    goTo(previous, SCENARIOS[previous].hops.length - 1, 1)
  }

  function stepForward() {
    setPlaying(false)
    goToNextHop(scenarioIndex, hopIndex, 1)
  }

  function pickScenario(index) {
    goTo(index, 0)
    setPlaying(true)
  }

  function togglePlay() {
    if (!playing && progressRef.current >= 1) goToNextHop(scenarioIndex, hopIndex)
    setPlaying(!playing)
  }

  const scenarioEdges = new Set(scenario.hops.flatMap(hopEdges))
  const scenarioNodes = new Set(scenario.hops.flatMap(hopNodes))
  const visitedEdges = new Set(scenario.hops.slice(0, hopIndex).flatMap(hopEdges))
  const activeEdges = new Map(hop.path ?? [])
  const activeNodes = new Set(hopNodes(hop))
  // The direct line only exists in the CORS scenario, so it must not look like a real connection
  const visibleEdges = Object.entries(EDGES).filter(
    ([id]) => id !== 'direct' || scenarioEdges.has(id),
  )
  const nodeState = (id) =>
    activeNodes.has(id) ? 'active' : scenarioNodes.has(id) ? 'normal' : 'dim'
  const edgeState = (id) =>
    visitedEdges.has(id) ? 'visited' : scenarioEdges.has(id) ? 'normal' : 'dim'

  return (
    <section className="how">
      <h2>How does it work?</h2>
      <p className="intro">
        The page runs in your browser. The API runs in a container and keeps the shop in memory.
        Pick a scenario to follow the data.
      </p>

      <div className="how-card">
        <div className="tabs">
          {SCENARIOS.map(({ title }, i) => (
            <button
              key={title}
              type="button"
              aria-pressed={i === scenarioIndex}
              onClick={() => pickScenario(i)}
            >
              <span>{i + 1}</span>
              {title}
            </button>
          ))}
        </div>

        <div className="diagram">
          <svg
            viewBox="0 0 1000 480"
            role="img"
            aria-label="The browser talks to the Vite dev server, which forwards /api to the FastAPI routes. The routes keep tickets in memory and put them in a queue, and two workers take tickets from the queue and age them."
          >
            <rect x={10} y={10} width={980} height={460} rx={20} className="zone" />
            <text x={30} y={38} className="zone-label">
              Your laptop
            </text>
            <rect x={285} y={50} width={690} height={405} rx={14} className="group" />
            <text x={300} y={72} className="group-label">
              Docker · cheese-shop-demo-network
            </text>
            <rect x={520} y={90} width={440} height={350} rx={14} className="group" />
            <text x={535} y={112} className="group-label">
              api-service · FastAPI
            </text>

            {visibleEdges.map(([id, { points }]) => (
              <g key={id}>
                <path d={svgPath(points)} className={`edge ${edgeState(id)}`} />
                {activeEdges.has(id) && (
                  <path
                    d={svgPath(points)}
                    stroke={color}
                    className={activeEdges.get(id) === 1 ? 'flow forward' : 'flow backward'}
                  />
                )}
              </g>
            ))}

            <text x={280} y={219} textAnchor="middle" className="edge-label">
              :5810
            </text>
            <text x={510} y={246} textAnchor="middle" className="edge-label">
              :9000
            </text>
            {scenarioEdges.has('direct') && (
              <text x={320} y={127} textAnchor="middle" className="edge-label">
                :9810, a different origin
              </text>
            )}

            {Object.keys(NODES).map((id) => (
              <Node key={id} id={id} state={nodeState(id)} color={color} />
            ))}
            <Dot hop={hop} progress={progress} color={color} />
          </svg>
        </div>

        <div className="caption">
          <div className="caption-row">
            <div aria-live={playing ? 'off' : 'polite'}>
              <small>
                <b>{scenario.title}</b> · {scenario.where} · Step {hopIndex + 1} of{' '}
                {scenario.hops.length}
              </small>
              <p>{hop.caption}</p>
            </div>
            <div className="controls">
              <button type="button" aria-label="Previous step" onClick={stepBack}>
                ⏮
              </button>
              <button
                type="button"
                aria-label={playing ? 'Pause' : 'Play'}
                className="play"
                onClick={togglePlay}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <button type="button" aria-label="Next step" onClick={stepForward}>
                ⏭
              </button>
            </div>
          </div>

          <div className="steps">
            {scenario.hops.map((step, i) => {
              const filled = i < hopIndex ? 1 : i === hopIndex ? progress : 0
              return (
                <button
                  key={`${scenario.title}-${i}`}
                  type="button"
                  aria-label={`Step ${i + 1}`}
                  onClick={() => showHop(i)}
                >
                  <span
                    style={{
                      width: `${filled * 100}%`,
                      background: KINDS[step.kind].color,
                    }}
                  />
                </button>
              )
            })}
          </div>

          <div className="legend">
            {Object.values(KINDS).map(({ color: kindColor, label }) => (
              <span key={label}>
                <i style={{ background: kindColor }} />
                {label}
              </span>
            ))}
            <a href="/api/docs" target="_blank" rel="noreferrer">
              Try the API →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
