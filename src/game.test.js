import test from 'node:test'
import assert from 'node:assert/strict'
import { generateLevel, levelData, startState, apply, analyze, moves, solve, isWon, TOTAL_LEVELS, worldOf, WORLDS, starsFor } from './game.js'

test('levels are deterministic and well formed', () => {
  for (const n of [1, 40, 120, TOTAL_LEVELS]) {
    const a = generateLevel(n)
    assert.deepEqual(a, generateLevel(n))
    assert.ok(a.panels.length >= 2)
    assert.equal(a.occ.length, a.holes.length)
    assert.ok(a.par > 0)
    a.panels.forEach((p) => assert.ok(p.holes.length >= 2))
  }
  assert.notDeepEqual(generateLevel(5).panels, generateLevel(6).panels)
})

test('worlds cover every level', () => {
  assert.equal(worldOf(1), 0)
  assert.equal(worldOf(TOTAL_LEVELS), WORLDS.length - 1)
})

test('every level is solvable and its stored par is a real solution length', () => {
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const lvl = levelData(n)
    const res = solve(lvl, startState(lvl), 20000)
    assert.ok(res.path, `level ${n} solvable`)
    assert.equal(res.path.length, lvl.par, `level ${n} par`)
    let st = startState(lvl)
    for (const [s, t] of res.path) {
      assert.ok(moves(lvl, st).some(([a, b]) => a === s && b === t), `level ${n} legal move`)
      st = apply(lvl, st, s, t)
    }
    assert.ok(isWon(st))
  }
})

test('rules: hinge, heavy, slider and cover', () => {
  const holes = [
    { x: 100, y: 300, owner: 0 },
    { x: 300, y: 300, owner: 0 },
    { x: 100, y: 500, owner: 1 },
    { x: 200, y: 500, owner: 1 },
    { x: 300, y: 500, owner: 1 },
    { x: 500, y: 300, owner: -1 },
  ]
  const panels = [
    { id: 0, kind: 'normal', x: 200, y: 300, w: 260, h: 56, a: 0, seed: 1, holes: [0, 1] },
    { id: 1, kind: 'heavy', x: 200, y: 500, w: 300, h: 60, a: 0, seed: 2, holes: [2, 3, 4] },
  ]
  const lvl = { panels, holes, occ: [1, 1, 1, 1, 1, 0] }
  let st = startState(lvl)
  let an = analyze(lvl, st)
  assert.ok(an.covered.every((c) => !c))
  st = apply(lvl, st, 0, 5)
  assert.equal(st.st[0], 2, 'one screw left: hangs from hole 1')
  an = analyze(lvl, st)
  assert.ok(an.pose[0].hung && Math.abs(an.pose[0].cx - 300) < 1e-6 && an.pose[0].cy > 300, 'swings below its pivot')
  st = apply(lvl, st, 1, 0)
  assert.equal(st.st[0], -1, 'last screw out drops it')
  st = apply(lvl, st, 2, 1)
  assert.equal(st.st[1], -1, 'heavy plate drops once a screw is pulled')
  assert.ok(isWon(st))
})

test('star rating follows par', () => {
  const lvl = { par: 10 }
  assert.equal(starsFor(lvl, 10), 3)
  assert.equal(starsFor(lvl, 18), 2)
  assert.equal(starsFor(lvl, 40), 1)
})
