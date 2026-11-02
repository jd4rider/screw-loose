// Screw Loose puzzle rules. Pure functions, no Phaser, so the generator, solver and tests share them.
//
// The board has fixed screw holes. Panels (rotated rectangles stacked by index = z) hang on the screws that sit
// in the holes they own. A state is {occ, st}: which holes hold a screw, and each panel's status
// (-1 gone, 0 rigid, h+1 hanging by the screw in hole h).
//  - normal panel: 2+ screws hold it rigid, exactly 1 makes it swing (hinge) and hang from that screw, 0 drops it.
//  - heavy panel : needs all 3 of its screws; pull any one and it falls.
//  - slider panel: 1 screw holds it, 0 and it slides out sideways.
// A screw can be moved when no higher panel covers it, into any empty hole that is not covered.

import TABLE from './levels-table.js'

export const mulberry32 = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const TOTAL_LEVELS = 200
export const PACK = 12
export const PACKS = Math.ceil(TOTAL_LEVELS / PACK)

export const WORLDS = [
  { name: 'Pine Workshop', wood: 0xe8c07a, dark: 0xa8763a, grain: 0xc99a52, bg: ['#7c5a3a', '#3b2616'], wall: 0x5b4126, accent: 0xf59e0b },
  { name: 'Red Barn', wood: 0xd9694f, dark: 0x8f2f20, grain: 0xb94a35, bg: ['#7f2d1f', '#2b0f0a'], wall: 0x4a1d14, accent: 0xfb7185 },
  { name: 'Dusty Attic', wood: 0xb9a07a, dark: 0x6b5638, grain: 0x9a8260, bg: ['#5a5d6e', '#1d1f2b'], wall: 0x30323f, accent: 0xa5b4fc },
  { name: 'Mossy Shed', wood: 0x9fc07a, dark: 0x4f7a3a, grain: 0x7ea25a, bg: ['#3d6b4a', '#0f2a1a'], wall: 0x1f3a28, accent: 0x86efac },
  { name: 'Iron Works', wood: 0x8aa0b8, dark: 0x3b4a5e, grain: 0x6b829c, bg: ['#334155', '#0b1220'], wall: 0x161f2e, accent: 0x38bdf8 },
]
export const worldOf = (n) => Math.min(WORLDS.length - 1, Math.floor(((n - 1) / TOTAL_LEVELS) * WORLDS.length))
export const difficulty = (n) => (n - 1) / (TOTAL_LEVELS - 1)

export const BOARD = { x0: 56, x1: 584, y0: 170, y1: 690 }
const HOLE_GAP = 46
const COVER_PAD = 4

const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]

// ---- analysis of a state ---------------------------------------------------------------------------------

export const startState = (level) => ({ occ: level.occ.slice(), st: level.panels.map(() => 0) })
const keyOf = (s) => s.occ.join('') + s.st.join(',')

export function analyze(level, state) {
  const { panels, holes } = level
  const { occ, st } = state
  const pose = panels.map((p, i) => {
    if (st[i] < 0) return null
    if (st[i] > 0) return hungPose(p, holes[st[i] - 1])
    return { cx: p.x, cy: p.y, rot: p.a, hung: false }
  })
  // z of the panel a screw in this hole rides on (-1 = bare board)
  const owner = holes.map((h, i) => (h.owner >= 0 && (st[h.owner] === 0 || st[h.owner] === i + 1) ? h.owner : -1))
  const covered = holes.map((h, i) => {
    for (let q = owner[i] + 1; q < panels.length; q++) {
      const pq = pose[q]
      if (!pq) continue
      const [lx, ly] = rot(h.x - pq.cx, h.y - pq.cy, -pq.rot)
      if (Math.abs(lx) <= panels[q].w / 2 + COVER_PAD && Math.abs(ly) <= panels[q].h / 2 + COVER_PAD) return true
    }
    return false
  })
  return { pose, owner, covered, occ }
}

function hungPose(p, hole) {
  const px = hole.x
  const py = hole.y
  const vx = p.x - px
  const vy = p.y - py
  if (Math.hypot(vx, vy) < 1) return { cx: p.x, cy: p.y, rot: p.a, hung: true, pivot: { x: px, y: py }, alpha: 0 }
  let alpha = Math.PI / 2 - Math.atan2(vy, vx)
  alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha))
  const [rx, ry] = rot(vx, vy, alpha)
  return { cx: px + rx, cy: py + ry, rot: p.a + alpha, hung: true, pivot: { x: px, y: py }, alpha }
}

export function moves(level, state, an = analyze(level, state)) {
  const from = []
  const to = []
  level.holes.forEach((_, i) => {
    if (an.covered[i]) return
    if (state.occ[i]) from.push(i)
    else to.push(i)
  })
  const out = []
  for (const s of from) for (const t of to) out.push([s, t])
  return out
}

export function apply(level, state, s, t) {
  const occ = state.occ.slice()
  occ[s] = 0
  occ[t] = 1
  const st = state.st.slice()
  level.panels.forEach((p, i) => {
    if (st[i] < 0) return
    if (st[i] > 0) {
      if (!occ[st[i] - 1]) st[i] = -1
      return
    }
    const owned = p.holes.filter((h) => occ[h])
    if (p.kind === 'heavy' ? owned.length < 3 : owned.length === 0) st[i] = -1
    else if (p.kind === 'normal' && owned.length === 1) st[i] = owned[0] + 1
  })
  return { occ, st }
}

export const isWon = (state) => state.st.every((v) => v < 0)

// Weighted best-first search: finds a good (not always the shortest) solution quickly. `capped` means the search
// gave up, not that the position is unsolvable.
export function solve(level, start, cap = 30000) {
  if (isWon(start)) return { path: [], capped: false }
  const seen = new Map([[keyOf(start), null]])
  const heap = []
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const par = (i - 1) >> 1
      if (heap[par].f <= heap[i].f) break
      ;[heap[par], heap[i]] = [heap[i], heap[par]]
      i = par
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].f < heap[m].f) m = l
        if (r < heap.length && heap[r].f < heap[m].f) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  const score = (state, depth) => state.st.reduce((a, v) => a + (v < 0 ? 0 : v > 0 ? 2 : 3), 0) * 3 + depth * 0.6
  push({ state: start, depth: 0, f: score(start, 0) })
  let expanded = 0
  while (heap.length) {
    const { state, depth } = pop()
    if (++expanded > cap) return { path: null, capped: true }
    const ck = keyOf(state)
    for (const [s, t] of moves(level, state)) {
      const n = apply(level, state, s, t)
      const k = keyOf(n)
      if (seen.has(k)) continue
      seen.set(k, { prev: ck, move: [s, t] })
      if (isWon(n)) {
        const path = []
        let kk = k
        while (seen.get(kk)) {
          const { prev, move } = seen.get(kk)
          path.push(move)
          kk = prev
        }
        return { path: path.reverse(), capped: false }
      }
      push({ state: n, depth: depth + 1, f: score(n, depth + 1) })
    }
  }
  return { path: null, capped: false }
}

// ---- generator -------------------------------------------------------------------------------------------

export function build(n, attempt) {
  const rnd = mulberry32(n * 7919 + attempt * 104729 + 13)
  const pick = (a, b) => a + rnd() * (b - a)
  const d = difficulty(n)
  const easier = Math.min(1, attempt / 30)
  const count = Math.min(9, 3 + Math.floor(d * 6 + rnd() * 1.2))
  const freeCount = Math.round(1 + rnd() * 2)
  const emptyTarget = Math.max(1, Math.round(3.2 - d * 2 + easier * 2))
  const holes = []
  const panels = []
  const near = (x, y) => holes.some((h) => Math.hypot(h.x - x, h.y - y) < HOLE_GAP)
  const inBoard = (x, y) => x > BOARD.x0 - 8 && x < BOARD.x1 + 8 && y > BOARD.y0 - 20 && y < BOARD.y1 + 10

  for (let id = 0; id < count; id++) {
    let kind = 'normal'
    if (d > 0.2 && rnd() < 0.18 + d * 0.12) kind = 'heavy'
    else if (d > 0.4 && rnd() < 0.22) kind = 'slider'
    let placed = null
    for (let tries = 0; tries < 60 && !placed; tries++) {
      const w = kind === 'heavy' ? pick(230, 300) : kind === 'slider' ? pick(210, 320) : pick(150, 290)
      const h = kind === 'slider' ? 56 : kind === 'heavy' ? 66 : pick(48, 66)
      const a = kind === 'slider' ? 0 : ((Math.floor(rnd() * 13) - 6) * 15 * Math.PI) / 180
      const x = pick(BOARD.x0 + 80, BOARD.x1 - 80)
      const y = pick(BOARD.y0 + 70, BOARD.y1 - 70)
      const ends = w / 2 - 25
      const lx = kind === 'heavy' ? [-ends, 0, ends] : kind === 'normal' && w > 225 && rnd() < 0.5 ? [-ends, 0, ends] : [-ends, ends]
      const hp = lx.map((l) => ({ lx: l, x: x + l * Math.cos(a), y: y + l * Math.sin(a) }))
      const ok = hp.every((q, i) => inBoard(q.x, q.y) && !near(q.x, q.y) && hp.every((r, j) => i === j || Math.hypot(r.x - q.x, r.y - q.y) >= HOLE_GAP))
      if (ok) placed = { w, h, a, x, y, hp }
    }
    if (!placed) continue
    const pid = panels.length
    const owned = []
    placed.hp.forEach((q) => {
      owned.push(holes.length)
      holes.push({ x: Math.round(q.x), y: Math.round(q.y), owner: pid })
    })
    panels.push({ id: pid, kind, x: Math.round(placed.x), y: Math.round(placed.y), w: Math.round(placed.w), h: Math.round(placed.h), a: placed.a, seed: Math.floor(rnd() * 1e6), holes: owned })
  }
  for (let w = 0; w < freeCount; w++) {
    for (let tries = 0; tries < 80; tries++) {
      const x = pick(BOARD.x0 + 10, BOARD.x1 - 10)
      const y = pick(BOARD.y0 + 10, BOARD.y1 - 10)
      if (near(x, y)) continue
      holes.push({ x: Math.round(x), y: Math.round(y), owner: -1 })
      break
    }
  }
  // Start full, then empty some holes without ever dropping a panel below what holds it.
  const occ = holes.map(() => 1)
  const canEmpty = (i) => {
    const o = holes[i].owner
    if (o < 0) return true
    const p = panels[o]
    if (p.kind === 'heavy') return false
    const left = p.holes.filter((h) => occ[h] && h !== i).length
    return p.kind === 'slider' ? left >= 1 : left >= 2
  }
  const order = holes.map((_, i) => i).sort(() => rnd() - 0.5)
  let empties = 0
  for (const i of order) {
    if (empties >= emptyTarget) break
    if (canEmpty(i)) {
      occ[i] = 0
      empties++
    }
  }
  return { n, panels, holes, occ }
}

export function generateLevel(n) {
  const row = TABLE[n - 1]
  if (row) return { ...build(n, row[0]), par: row[1] }
  for (let attempt = 0; attempt < 200; attempt++) {
    const level = build(n, attempt)
    if (level.panels.length < 2) continue
    const res = solve(level, startState(level), 20000)
    if (res.path) return { ...level, par: res.path.length }
  }
  throw new Error(`no solvable board for level ${n}`)
}

const cache = new Map()
export function levelData(n) {
  if (!cache.has(n)) cache.set(n, generateLevel(n))
  return cache.get(n)
}

export const starsFor = (level, moves) => (moves <= Math.ceil(level.par * 1.25) ? 3 : moves <= Math.ceil(level.par * 1.8) ? 2 : 1)
