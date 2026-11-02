import Phaser from 'phaser'
import { W, H, background, button, text, fade } from './common.js'
import { data } from './save.js'
import { TOTAL_LEVELS, PACK, WORLDS } from '../game.js'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  create() {
    this.input.enabled = true
    background(this, WORLDS[0].bg, 0xfde68a)
    this.cameras.main.fadeIn(300, 20, 10, 4)

    // A little hanging plank with two screws.
    const plank = this.add.container(W / 2, 205)
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-205, -52, 420, 112, 20)
    g.fillStyle(WORLDS[0].wood, 1).fillRoundedRect(-210, -60, 420, 112, 20)
    g.lineStyle(4, WORLDS[0].dark, 1).strokeRoundedRect(-210, -60, 420, 112, 20)
    g.lineStyle(3, WORLDS[0].grain, 0.8)
    for (let i = 0; i < 6; i++) g.lineBetween(-190, -40 + i * 18, 190, -44 + i * 18 + (i % 2) * 6)
    plank.add(g)
    plank.add(this.add.image(-180, 0, 'hole').setScale(0.8))
    const s1 = this.add.image(180, -4, 'screw').setScale(0.8)
    plank.add(s1)
    plank.add(text(this, 0, -4, 'Screw Loose', 62, '#5b3414', { fontStyle: 'bold' }).setOrigin(0.5))
    plank.setRotation(0.08)
    this.tweens.add({ targets: plank, rotation: -0.08, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.tweens.add({ targets: s1, angle: 360, duration: 3000, repeat: -1 })

    text(this, W / 2, 330, 'Unscrew the panels. Move screws to free holes.', 20, '#fde68a', { align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5)
    text(this, W / 2, 362, 'Hinges, sliders and heavy plates will test you.', 17, '#e7d3b0').setOrigin(0.5)

    const done = Object.keys(data.stars).length
    const stars = Object.values(data.stars).reduce((a, b) => a + b, 0)
    const next = Math.min(data.unlocked, TOTAL_LEVELS)
    button(this, W / 2, 470, next > 1 ? `🔩  Continue · Level ${next}` : '🔩  Play', () => fade(this, 'game', { level: next }), { w: 420, h: 66, size: 28, color: 0xd97706 })
    button(this, W / 2, 560, '🗂  Levels', () => fade(this, 'levels', { page: Math.floor((next - 1) / PACK) }), { w: 420, h: 60, size: 26, color: 0x0f766e })
    text(this, W / 2, 618, `${done}/${TOTAL_LEVELS} levels · ${stars}★`, 20, '#fff').setOrigin(0.5)

    WORLDS.forEach((w, i) => this.add.circle(W / 2 + (i - 2) * 34, 690, 11, w.wood).setStrokeStyle(3, w.dark))
    text(this, W / 2, 770, 'Tap a free screw, then tap an empty hole.', 17, '#f1dfbf').setOrigin(0.5)
    text(this, W / 2, H - 50, '200 levels · 5 workshops · undo & hints', 15, '#bfa77c').setOrigin(0.5)
  }
}
