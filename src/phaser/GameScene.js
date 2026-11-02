import Phaser from 'phaser'
import { W, H, button, text, fade, background } from './common.js'
import { ring, flashAt, popText, grains } from './fx.js'
import { sfx } from '../sound.js'
import { data, persist } from './save.js'
import { levelData, WORLDS, worldOf, TOTAL_LEVELS, PACK, BOARD, analyze, apply, startState, isWon, solve, starsFor } from '../game.js'

const SCREW_SCALE = 0.62
const HOLE_SCALE = 0.8
const rotate = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const shade = (c, f) => {
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)))
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255)
}
const mulberry = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game')
  }

  init(d) {
    this.n = Phaser.Math.Clamp(d?.level ?? 1, 1, TOTAL_LEVELS)
  }

  create() {
    this.input.enabled = true
    this.lvl = levelData(this.n)
    this.world = WORLDS[worldOf(this.n)]
    this.state = startState(this.lvl)
    this.history = []
    this.moveCount = 0
    this.busy = false
    this.ended = false
    this.sel = null
    this.marks = []
    this.panelObj = []
    this.screwObj = []
    this.cameras.main.fadeIn(250, 20, 10, 4)

    background(this, this.world.bg, this.world.accent)
    this.drawBoard()
    this.layout()
    this.buildHud()
    this.input.on('pointerdown', (pointer, over) => {
      if (!over.length) this.onTap(pointer.worldX, pointer.worldY)
    })
    this.input.keyboard.on('keydown-U', () => this.undo())
    this.input.keyboard.on('keydown-Z', () => this.undo())
    this.input.keyboard.on('keydown-H', () => this.hint())
    this.input.keyboard.on('keydown-R', () => this.scene.restart({ level: this.n }))
    this.input.keyboard.on('keydown-ESC', () => fade(this, 'levels', { page: Math.floor((this.n - 1) / PACK) }))
    this.intro()
  }

  // ---- static board ---------------------------------------------------------------------------------------

  drawBoard() {
    const w = this.world
    const g = this.add.graphics().setDepth(-10)
    const x = BOARD.x0 - 36
    const y = BOARD.y0 - 44
    const bw = BOARD.x1 - BOARD.x0 + 72
    const bh = BOARD.y1 - BOARD.y0 + 80
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 4, y + 8, bw, bh, 26)
    g.fillStyle(w.wall, 1).fillRoundedRect(x, y, bw, bh, 26)
    g.lineStyle(2, 0x000000, 0.25)
    for (let yy = y + 56; yy < y + bh - 20; yy += 56) g.lineBetween(x + 10, yy, x + bw - 10, yy)
    g.lineStyle(5, shade(w.wall, 1.6), 1).strokeRoundedRect(x, y, bw, bh, 26)

    const groove = this.add.graphics().setDepth(-5)
    this.lvl.panels.forEach((p) => {
      if (p.kind !== 'slider') return
      const dir = p.x < W / 2 ? -1 : 1
      const x0 = dir < 0 ? x + 6 : p.x
      const x1 = dir < 0 ? p.x : x + bw - 6
      groove.fillStyle(0x000000, 0.45).fillRoundedRect(x0, p.y - p.h / 2 + 8, x1 - x0, p.h - 16, 10)
    })
    this.lvl.holes.forEach((h) => this.add.image(h.x, h.y, 'hole').setScale(HOLE_SCALE).setDepth(0.2))
  }

  panelColor(p) {
    const base = p.kind === 'heavy' ? 0x7b8aa0 : this.world.wood
    return shade(base, 0.92 + ((p.seed % 17) / 17) * 0.16)
  }

  makePanel(i) {
    const p = this.lvl.panels[i]
    const c = this.add.container(p.x, p.y).setRotation(p.a).setDepth((i + 1) * 10)
    const sh = this.add.graphics()
    sh.fillStyle(0x000000, 0.35).fillRoundedRect(-p.w / 2 + 3, -p.h / 2 + 6, p.w, p.h, 12)
    const g = this.add.graphics()
    const base = this.panelColor(p)
    const dark = p.kind === 'heavy' ? 0x1e293b : this.world.dark
    g.fillStyle(base, 1).fillRoundedRect(-p.w / 2, -p.h / 2, p.w, p.h, 12)
    const rnd = mulberry(p.seed)
    g.lineStyle(2, shade(base, 0.78), 0.7)
    if (p.kind === 'heavy') {
      for (let k = -1; k <= 1; k += 2) g.lineBetween(-p.w / 2 + 14, k * (p.h / 2 - 9), p.w / 2 - 14, k * (p.h / 2 - 9))
    } else {
      for (let k = 0; k < 4; k++) {
        const yy = -p.h / 2 + 9 + rnd() * (p.h - 18)
        const x0 = -p.w / 2 + 14 + rnd() * 30
        g.lineBetween(x0, yy, p.w / 2 - 14 - rnd() * 40, yy + (rnd() - 0.5) * 6)
      }
    }
    g.lineStyle(3, dark, 1).strokeRoundedRect(-p.w / 2, -p.h / 2, p.w, p.h, 12)
    g.lineStyle(2, 0xffffff, 0.35).lineBetween(-p.w / 2 + 12, -p.h / 2 + 3, p.w / 2 - 12, -p.h / 2 + 3)
    c.add([sh, g])
    if (p.kind === 'heavy') {
      const label = text(this, 0, 0, 'HEAVY', 15, '#e2e8f0', { fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0.85)
      c.add(label)
    } else if (p.kind === 'slider') {
      const dir = p.x < W / 2 ? -1 : 1
      const ch = this.add.graphics()
      ch.lineStyle(5, dark, 0.7)
      for (let k = -1; k <= 1; k++) {
        const cx = k * 24
        ch.beginPath()
        ch.moveTo(cx - dir * 8, -10)
        ch.lineTo(cx + dir * 4, 0)
        ch.lineTo(cx - dir * 8, 10)
        ch.strokePath()
      }
      c.add(ch)
    }
    p.holes.forEach((hi) => {
      const h = this.lvl.holes[hi]
      const [lx, ly] = rotate(h.x - p.x, h.y - p.y, -p.a)
      c.add(this.add.image(lx, ly, 'hole').setScale(HOLE_SCALE))
    })
    return c
  }

  placePanel(c, pose) {
    c.setPosition(pose.cx, pose.cy).setRotation(pose.rot)
  }

  screwDepth(owner) {
    return owner < 0 ? 1 : (owner + 1) * 10 + 5
  }

  layout() {
    this.panelObj.forEach((c) => c && c.destroy())
    this.screwObj.forEach((s) => s && s.destroy())
    this.clearMarks()
    this.sel = null
    const an = analyze(this.lvl, this.state)
    this.panelObj = this.lvl.panels.map((_, i) => {
      if (this.state.st[i] < 0) return null
      const c = this.makePanel(i)
      this.placePanel(c, an.pose[i])
      return c
    })
    this.screwObj = this.lvl.holes.map((h, i) => (this.state.occ[i] ? this.add.image(h.x, h.y, 'screw').setScale(SCREW_SCALE).setDepth(this.screwDepth(an.owner[i])).setAngle(((i * 53) % 90) - 45) : null))
  }

  refreshDepths() {
    const an = analyze(this.lvl, this.state)
    this.screwObj.forEach((s, i) => s && !this.flying?.has(s) && s.setDepth(this.screwDepth(an.owner[i])))
  }

  // ---- HUD ------------------------------------------------------------------------------------------------

  buildHud() {
    text(this, W / 2, 34, `Level ${this.n}`, 32, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5)
    text(this, W / 2, 70, this.world.name, 17, '#f1dfbf').setOrigin(0.5)
    this.movesText = text(this, W / 2, 104, '', 20, '#fde68a', { fontStyle: 'bold' }).setOrigin(0.5)
    this.msg = text(this, W / 2, 140, '', 18, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5).setDepth(150)
    this.updateHud()
    const y = 792
    const b = { w: 126, h: 52, size: 19 }
    this.undoBtn = button(this, 78, y, '↶ Undo', () => this.undo(), { ...b, color: 0x0f766e })
    button(this, 218, y, '💡 Hint', () => this.hint(), { ...b, color: 0xb45309 })
    button(this, 358, y, '↻ Restart', () => this.scene.restart({ level: this.n }), { ...b, color: 0x1d4ed8 })
    button(this, 498, y, '☰ Levels', () => fade(this, 'levels', { page: Math.floor((this.n - 1) / PACK) }), { ...b, color: 0x475569 })
    text(this, W / 2, 836, 'Tap a free screw, then an empty hole  ·  U undo · H hint · R restart', 13, '#bfa77c').setOrigin(0.5)
  }

  updateHud() {
    this.movesText.setText(`Moves ${this.moveCount}   ·   3★ in ${Math.ceil(this.lvl.par * 1.25)}`)
    this.undoBtn?.setAlpha(this.history.length ? 1 : 0.45)
  }

  toast(str, color = '#fff', ms = 2600) {
    this.msg.setText(str).setColor(color).setAlpha(1)
    this.msgTimer?.remove()
    if (ms) this.msgTimer = this.time.delayedCall(ms, () => this.tweens.add({ targets: this.msg, alpha: 0, duration: 300 }))
  }

  intro() {
    const kinds = new Set(this.lvl.panels.map((p) => p.kind))
    data.seen ||= {}
    if (this.n === 1) this.toast('Tap a free screw, then tap an empty hole to move it.', '#fde68a', 6000)
    else if (kinds.has('heavy') && !data.seen.heavy) {
      data.seen.heavy = 1
      persist()
      this.toast('HEAVY plates drop the moment you pull any one screw!', '#fca5a5', 6000)
    } else if (kinds.has('slider') && !data.seen.slider) {
      data.seen.slider = 1
      persist()
      this.toast('Sliders hang on one screw and slide out when it is gone.', '#93c5fd', 6000)
    }
  }

  // ---- input ----------------------------------------------------------------------------------------------

  nearest(x, y, test) {
    let best = -1
    let bd = 32
    this.lvl.holes.forEach((h, i) => {
      if (!test(i)) return
      const d = Math.hypot(h.x - x, h.y - y)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }

  onTap(x, y) {
    if (this.busy || this.ended) return
    const an = analyze(this.lvl, this.state)
    const { occ } = this.state
    if (this.sel !== null) {
      const t = this.nearest(x, y, (i) => !occ[i] && !an.covered[i])
      if (t >= 0) return this.doMove(this.sel, t)
    }
    const s = this.nearest(x, y, (i) => occ[i] && !an.covered[i])
    if (s >= 0 && s !== this.sel) return this.select(s, an)
    this.deselect()
  }

  select(s, an = analyze(this.lvl, this.state)) {
    this.deselect()
    this.sel = s
    sfx.select()
    const obj = this.screwObj[s]
    obj.setDepth(60)
    this.tweens.add({ targets: obj, scale: SCREW_SCALE * 1.4, duration: 120, ease: 'Back.Out' })
    const glow = this.add.image(obj.x, obj.y, 'glow').setTint(0xfde047).setBlendMode('ADD').setAlpha(0.7).setDepth(59).setScale(0.7)
    this.marks.push(glow)
    let free = 0
    this.lvl.holes.forEach((h, i) => {
      if (this.state.occ[i] || an.covered[i]) return
      free++
      const r = this.add.circle(h.x, h.y, 24).setStrokeStyle(3, 0xfde047).setDepth(70)
      this.tweens.add({ targets: r, scale: 1.25, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 })
      this.marks.push(r)
    })
    if (!free) this.toast('No free hole! Uncover one first.', '#fca5a5', 2000)
  }

  deselect() {
    if (this.sel === null) return
    const obj = this.screwObj[this.sel]
    this.clearMarks()
    if (obj) {
      const an = analyze(this.lvl, this.state)
      obj.setDepth(this.screwDepth(an.owner[this.sel]))
      this.tweens.add({ targets: obj, scale: SCREW_SCALE, duration: 100 })
    }
    this.sel = null
  }

  clearMarks() {
    this.marks.forEach((m) => {
      this.tweens.killTweensOf(m)
      m.destroy()
    })
    this.marks = []
  }

  // ---- moves ----------------------------------------------------------------------------------------------

  doMove(s, t) {
    const old = this.state
    const next = apply(this.lvl, old, s, t)
    this.history.push(old)
    this.moveCount++
    this.state = next
    this.busy = true
    this.clearMarks()
    this.sel = null
    const obj = this.screwObj[s]
    this.screwObj[s] = null
    this.screwObj[t] = obj
    this.flying = new Set([obj])
    const to = this.lvl.holes[t]
    sfx.unscrew()
    obj.setDepth(100)
    this.tweens.add({ targets: obj, x: to.x, y: to.y, angle: obj.angle + 540, duration: 420, ease: 'Sine.InOut' })
    this.tweens.add({ targets: obj, scale: SCREW_SCALE * 1.5, duration: 200, yoyo: true, ease: 'Sine.Out' })
    this.time.delayedCall(180, () => this.transition(old, next))
    this.time.delayedCall(430, () => {
      sfx.screw()
      this.flying = null
      ring(this, to.x, to.y, 0xfde047, 46, 350, 4)
      obj.setScale(SCREW_SCALE)
      this.refreshDepths()
      this.busy = false
      this.updateHud()
      if (isWon(next)) {
        this.ended = true
        this.time.delayedCall(1100, () => this.win())
      } else {
        this.time.delayedCall(700, () => this.checkStuck())
      }
    })
    this.time.delayedCall(700, () => this.refreshDepths())
    this.updateHud()
  }

  transition(old, next) {
    const an = analyze(this.lvl, next)
    this.lvl.panels.forEach((p, i) => {
      if (old.st[i] === next.st[i]) return
      const c = this.panelObj[i]
      if (!c) return
      if (next.st[i] > 0) this.swing(c, p, an.pose[i])
      else if (next.st[i] < 0) this.leave(i, c, p)
    })
  }

  swing(c, p, pose) {
    sfx.creak()
    const { pivot, alpha } = pose
    const place = (a) => {
      const [rx, ry] = rotate(p.x - pivot.x, p.y - pivot.y, a)
      c.setPosition(pivot.x + rx, pivot.y + ry).setRotation(p.a + a)
    }
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1200,
      onUpdate: (tw) => place(alpha * (1 - Math.exp(-5 * tw.getValue()) * Math.cos(16 * tw.getValue()))),
      onComplete: () => place(alpha),
    })
    if (!data.seen?.hinge) {
      data.seen ||= {}
      data.seen.hinge = 1
      persist()
      this.toast('One screw left: the panel swings and hangs from it!', '#fde68a', 4500)
    }
  }

  leave(i, c, p) {
    this.panelObj[i] = null
    this.tweens.killTweensOf(c)
    const x = c.x
    const y = c.y
    if (p.kind === 'slider') {
      const dir = p.x < W / 2 ? -1 : 1
      sfx.whoosh()
      this.tweens.add({ targets: c, x: x + dir * 900, duration: 750, ease: 'Cubic.In', onComplete: () => c.destroy() })
      return
    }
    sfx.whoosh()
    grains(this, x, y, this.panelColor(p), 14, 220)
    this.tweens.add({
      targets: c,
      y: y + 1100,
      x: x + Phaser.Math.Between(-70, 70),
      rotation: c.rotation + Phaser.Math.FloatBetween(-1, 1),
      duration: 900,
      ease: 'Quad.In',
      onComplete: () => c.destroy(),
    })
    if (p.kind === 'heavy') {
      this.cameras.main.shake(220, 0.006)
      this.time.delayedCall(500, () => sfx.clunk())
    }
  }

  undo() {
    if (this.busy || this.ended || !this.history.length) return
    this.state = this.history.pop()
    this.moveCount = Math.max(0, this.moveCount - 1)
    this.layout()
    this.toast('', '#fff', 1)
    sfx.click()
    this.updateHud()
  }

  hint() {
    if (this.busy || this.ended) return
    const res = solve(this.lvl, this.state, 20000)
    if (!res.path) {
      this.toast(res.capped ? 'No hint found, try undoing a few moves.' : 'Stuck! Undo or restart.', '#fca5a5', 3000)
      return
    }
    const [s, t] = res.path[0]
    this.deselect()
    this.toast('Move this screw… to this hole.', '#fde68a', 2500)
    const hs = this.lvl.holes[s]
    const ht = this.lvl.holes[t]
    for (const [h, col] of [[hs, 0xfde047], [ht, 0x4ade80]]) {
      const r = this.add.circle(h.x, h.y, 26).setStrokeStyle(4, col).setDepth(70)
      this.tweens.add({ targets: r, scale: 1.4, alpha: 0.2, duration: 500, yoyo: true, repeat: 4, onComplete: () => r.destroy() })
    }
    sfx.hint()
  }

  checkStuck() {
    if (this.ended || this.busy) return
    const res = solve(this.lvl, this.state, 6000)
    if (!res.path && !res.capped) {
      this.toast('Stuck! Undo (U) or restart (R).', '#fca5a5', 0)
      sfx.wrong()
    }
  }

  // ---- finish ---------------------------------------------------------------------------------------------

  win() {
    const earned = starsFor(this.lvl, this.moveCount)
    data.stars[this.n] = Math.max(data.stars[this.n] || 0, earned)
    if (this.n + 1 > data.unlocked && this.n < TOTAL_LEVELS) data.unlocked = this.n + 1
    const prev = data.best[this.n]
    const best = prev && this.moveCount < prev
    if (!prev || this.moveCount < prev) data.best[this.n] = this.moveCount
    persist()
    sfx.win()
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 140, () => grains(this, Phaser.Math.Between(120, 520), Phaser.Math.Between(240, 560), [0xfde047, 0xf59e0b, 0xffffff, this.world.accent], 24, 380))
    const D = 200
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(D)
    this.tweens.add({ targets: shade, fillAlpha: 0.55, duration: 300 })
    const box = this.add.container(W / 2, H / 2 - 20).setDepth(D + 1)
    const bg = this.add.graphics()
    bg.fillStyle(0x24160a, 0.97).fillRoundedRect(-270, -200, 540, 400, 28)
    bg.lineStyle(4, 0xfde047, 1).strokeRoundedRect(-270, -200, 540, 400, 28)
    box.add(bg)
    box.add(text(this, 0, -150, 'All panels down!', 42, '#fde047', { fontStyle: 'bold' }).setOrigin(0.5))
    for (let i = 0; i < 3; i++) {
      const st = text(this, (i - 1) * 80, -70, '★', 70, i < earned ? '#fde047' : '#4b3a28').setOrigin(0.5)
      box.add(st)
      if (i < earned) this.tweens.add({ targets: st, scale: 1.4, duration: 260, delay: 250 + i * 240, yoyo: true, ease: 'Back.Out' })
    }
    box.add(text(this, 0, 5, `${this.moveCount} moves  ·  par ${this.lvl.par}${best ? '  ·  new best!' : ''}`, 20, '#e7d3b0').setOrigin(0.5))
    const hasNext = this.n < TOTAL_LEVELS
    const y = 110
    box.add(button(this, hasNext ? -170 : -90, y, '↻ Retry', () => this.scene.restart({ level: this.n }), { w: 150, h: 58, size: 22, color: 0x1d4ed8 }))
    box.add(button(this, hasNext ? 0 : 90, y, '🗂 Levels', () => fade(this, 'levels', { page: Math.floor((this.n - 1) / PACK) }), { w: 150, h: 58, size: 22, color: 0x475569 }))
    if (hasNext) box.add(button(this, 170, y, 'Next ▶', () => fade(this, 'game', { level: this.n + 1 }), { w: 150, h: 58, size: 22, color: 0xd97706 }))
    box.setScale(0.7).setAlpha(0)
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 280, ease: 'Back.Out' })
    this.input.keyboard.once('keydown-ENTER', () => (hasNext ? fade(this, 'game', { level: this.n + 1 }) : this.scene.restart({ level: this.n })))
    flashAt(this, W / 2, H / 2, 600, 0xfde047)
    popText(this, W / 2, 150, `${earned}★`, '#fde047', 34)
  }
}
