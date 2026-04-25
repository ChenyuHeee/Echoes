/**
 * PuzzleScene — 时序密室（动作冒险模式）
 *
 * 机制核心：
 *   踩踏板 X → X 激活（记入 activationTimes），X 存入回响记忆
 *   踩踏板 Y → Y 激活，同时回响触发 X（120ms 后，X 再次记入 activationTimes）
 *
 * 门解锁算法（span-check）：
 *   门 [A,B]：A & B 最近各一次，时间差 <= windowMs → 开门
 *   门 [A,A]：A 最近两次，时间差 <= windowMs → 开门
 *   门 [A,B,C]：三者最近各一次，max-min <= windowMs → 开门
 *
 * 操作：P1 WASD，P2（双人关卡）方向键，走上踏板自动触发
 * 出口：所有门开启后出现金色传送门，走入即通关
 */

import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand } from '../state/gameState'
import { PUZZLE_LEVELS } from '../config/puzzleLevels'
import type { PuzzleLevel } from '../config/puzzleLevels'

interface PadObj {
  id: string
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  onPad: boolean
  activationTimes: number[]
  color: number
}

interface DoorObj {
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  open: boolean
  requiredPads: string[]
  windowMs: number
}

export class PuzzleScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image
  private player2: Phaser.Physics.Arcade.Image | null = null

  private levelIndex = 0
  private currentLevel!: PuzzleLevel
  private isCoop = false

  private pads: PadObj[] = []
  private doors: DoorObj[] = []
  private exitGfx!: Phaser.GameObjects.Graphics
  private exitTxt: Phaser.GameObjects.Text | null = null
  private exitActive = false

  private echoMemory: string | null = null
  private echoMemoryAt = 0
  private echo2Memory: string | null = null
  private echo2MemoryAt = 0

  private transitioning = false
  private finished = false
  private totalSand = 0

  private hintText!: Phaser.GameObjects.Text
  private echoText!: Phaser.GameObjects.Text
  private echo2Text: Phaser.GameObjects.Text | null = null
  private roomTitle!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private levelCounter!: Phaser.GameObjects.Text

  private keys!: {
    w: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    s: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
  }
  private keys2: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  } | null = null

  constructor() {
    super('PuzzleScene')
  }

  init(data: { coop?: boolean; startLevel?: number }) {
    this.isCoop     = data.coop ?? false
    this.levelIndex = data.startLevel != null ? data.startLevel : (this.isCoop ? 30 : 0)
  }

  create() {
    this.transitioning = false
    this.finished      = false
    this.totalSand     = 0
    this.echoMemory    = null
    this.echoMemoryAt  = 0
    this.echo2Memory   = null
    this.echo2MemoryAt = 0
    this.pads          = []
    this.doors         = []
    this.player2       = null
    this.keys2         = null
    this.echo2Text     = null

    audioManager.startMenuBgm()
    this.cameras.main.setBackgroundColor('#06080e')
    this.physics.world.setBounds(0, 0, 960, 540)

    this.add.tileSprite(480, 270, 960, 540, 'tile_forest_a').setAlpha(0.45).setDepth(0)

    this.add.rectangle(480, 20, 960, 40, 0x040810, 0.96).setScrollFactor(0).setDepth(30)
    this.add.rectangle(480, 40, 960, 1, 0x304860, 0.5).setScrollFactor(0).setDepth(30)

    this.roomTitle = this.add.text(480, 8, '', {
      fontFamily: '"Silkscreen", monospace', fontSize: '15px', color: '#50e8a0',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31)

    this.levelCounter = this.add.text(480, 27, '', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#304860',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31)

    const back = this.add.text(14, 8, '<- \u8fd4\u56de', {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#304050',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(31)
    back.setInteractive({ useHandCursor: true })
    back.on('pointerover', () => back.setColor('#608090'))
    back.on('pointerout',  () => back.setColor('#304050'))
    back.on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })

    this.echoText = this.add.text(700, 8, 'P1\u56de\u54cd\uff1a\u7a7a', {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#384850',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(31)

    this.hintText = this.add.text(480, 510, '', {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#3a5868',
      wordWrap: { width: 920 }, align: 'center',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(31)

    this.statusText = this.add.text(480, 290, '', {
      fontFamily: '"Silkscreen", monospace', fontSize: '17px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(40).setAlpha(0)

    this.exitGfx = this.add.graphics().setDepth(12)

    const kb = this.input.keyboard!
    this.keys = {
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    this.player = this.physics.add.image(80, 270, 'player_idle')
    this.player.setScale(2.2).setDepth(20).setCollideWorldBounds(true).setTint(0x40ffff)
    ;(this.player.body as Phaser.Physics.Arcade.Body).allowGravity = false

    this.buildLevel()
  }

  private buildLevel() {
    this.pads.forEach(p => { p.sprite.destroy(); p.label.destroy() })
    this.doors.forEach(d => { d.sprite.destroy(); d.label.destroy() })
    this.pads       = []
    this.doors      = []
    this.exitActive = false
    this.exitGfx.clear()
    this.exitTxt?.destroy()
    this.exitTxt       = null
    this.echoMemory    = null
    this.echoMemoryAt  = 0
    this.echo2Memory   = null
    this.echo2MemoryAt = 0
    this.transitioning = false

    const level = PUZZLE_LEVELS[this.levelIndex]
    if (!level) {
      this.finished = true
      this.showVictory()
      return
    }
    this.currentLevel = level

    const maxIdx  = this.isCoop ? PUZZLE_LEVELS.length : 30
    const baseIdx = this.isCoop ? 30 : 0
    this.roomTitle.setText(level.name)
    this.levelCounter.setText(`${this.levelIndex - baseIdx + 1} / ${maxIdx - baseIdx}`)
    this.hintText.setText(level.hint)
    this.updateEchoDisplay()

    level.pads.forEach(p => {
      const col = Phaser.Display.Color.HexStringToColor(p.color).color
      const sprite = this.add.rectangle(p.x, p.y, 52, 52, col, 0.18).setDepth(5)
      sprite.setStrokeStyle(2, col, 0.65)
      const label = this.add.text(p.x, p.y, p.id, {
        fontFamily: '"Silkscreen", monospace', fontSize: '22px', color: p.color,
      }).setOrigin(0.5).setDepth(6)
      this.pads.push({ id: p.id, sprite, label, onPad: false, activationTimes: [], color: col })
    })

    level.doors.forEach(d => {
      const sprite = this.add.rectangle(d.x, d.y, d.w, d.h, 0x6820c0, 0.88).setDepth(8)
      sprite.setStrokeStyle(2, 0xa060ff, 0.9)
      const unique = [...new Set(d.requiredPads)]
      const reqStr = unique.map(id => {
        const cnt = d.requiredPads.filter(r => r === id).length
        return cnt > 1 ? `${id}x${cnt}` : id
      }).join('+')
      const label = this.add.text(d.x, d.y + d.h / 2 + 10, `${reqStr}\n${d.windowMs}ms`, {
        fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#8850d0', align: 'center',
      }).setOrigin(0.5, 0).setDepth(9)
      this.doors.push({ sprite, label, open: false, requiredPads: d.requiredPads, windowMs: d.windowMs })
    })

    this.player.setPosition(72, 270)

    if (level.coop && !this.player2) {
      this.setupPlayer2()
    } else if (!level.coop && this.player2) {
      this.player2.destroy(); this.player2 = null
      this.echo2Text?.destroy(); this.echo2Text = null
      this.keys2 = null
    }
    if (this.player2) this.player2.setPosition(72, 330)

    this.showStatus(level.solution, '#50e8a0')
  }

  private setupPlayer2() {
    this.player2 = this.physics.add.image(80, 330, 'player_idle')
    this.player2.setScale(2.2).setDepth(20).setCollideWorldBounds(true).setTint(0xffb030)
    ;(this.player2.body as Phaser.Physics.Arcade.Body).allowGravity = false

    const kb = this.input.keyboard!
    this.keys2 = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    }
    this.echo2Text = this.add.text(700, 25, 'P2\u56de\u54cd\uff1a\u7a7a', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#7a6020',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(31)
  }

  private showExitPortal() {
    const level = this.currentLevel
    this.exitGfx.clear()
    for (let r = 38; r >= 20; r -= 5) {
      this.exitGfx.lineStyle(3, 0xffd060, (38 - r) / 22)
      this.exitGfx.strokeCircle(level.exitX, level.exitY, r)
    }
    this.exitGfx.fillStyle(0xffd060, 0.15)
    this.exitGfx.fillCircle(level.exitX, level.exitY, 24)
    this.exitGfx.lineStyle(2, 0xffd060, 0.9)
    this.exitGfx.strokeCircle(level.exitX, level.exitY, 26)

    this.exitTxt = this.add.text(level.exitX, level.exitY - 36, '\u51fa\u53e3', {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#ffd060',
    }).setOrigin(0.5, 1).setDepth(13)
    this.tweens.add({ targets: this.exitTxt, y: this.exitTxt.y - 6, duration: 800, yoyo: true, repeat: -1 })
    this.showStatus('\u2746 \u51fa\u53e3\u5df2\u5f00\u542f \u2014 \u8d70\u5165\u91d1\u8272\u4f20\u9001\u95e8', '#ffd060')
  }

  private checkDoors(now: number) {
    let anyJustOpened = false
    this.doors.forEach(door => {
      if (door.open) return
      const required = new Map<string, number>()
      for (const id of door.requiredPads) required.set(id, (required.get(id) ?? 0) + 1)

      const chosenTimes: number[] = []
      let feasible = true
      for (const [padId, count] of required.entries()) {
        const pad = this.pads.find(p => p.id === padId)
        if (!pad) { feasible = false; break }
        const recent = pad.activationTimes
          .filter(t => now - t < door.windowMs * 3.5)
          .sort((a, b) => b - a)
        if (recent.length < count) { feasible = false; break }
        chosenTimes.push(...recent.slice(0, count))
      }
      if (!feasible || chosenTimes.length === 0) return

      const span = Math.max(...chosenTimes) - Math.min(...chosenTimes)
      if (span <= door.windowMs) {
        this.openDoor(door)
        anyJustOpened = true
      }
    })

    if (anyJustOpened && this.doors.every(d => d.open) && !this.exitActive) {
      this.exitActive = true
      this.showExitPortal()
    }
  }

  private openDoor(door: DoorObj) {
    door.open = true
    this.tweens.add({ targets: door.sprite, alpha: 0.08, scaleY: 0.08, duration: 480, ease: 'Power2' })
    door.label.setColor('#50e8a0').setText('\u2713')
    audioManager.playEcho()
    this.cameras.main.flash(280, 80, 220, 140)
    const gain = Math.floor(this.currentLevel.sandReward * 0.4)
    this.totalSand += gain
    addTimeSand(gain)
    this.showStatus(`\u2746 \u95e8\u5df2\u5f00\u542f  +${gain} \u65f6\u7802`, '#50e8a0')
  }

  private activatePad(pad: PadObj, time: number, isPlayer2 = false) {
    pad.activationTimes.push(time)
    if (pad.activationTimes.length > 8) pad.activationTimes.shift()

    pad.sprite.setFillStyle(0xffffff, 0.8)
    const flash = this.add.image(pad.sprite.x, pad.sprite.y, 'effect_echo_ring')
      .setScale(0.55).setDepth(15)
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 340, onComplete: () => flash.destroy() })
    audioManager.playPickup()

    const memory = isPlayer2 ? this.echo2Memory : this.echoMemory
    if (memory && memory !== pad.id) {
      const prevId = memory
      const echoTime = time + 120
      this.time.delayedCall(120, () => {
        const prevPad = this.pads.find(p => p.id === prevId)
        if (prevPad && prevPad.sprite.active) {
          prevPad.activationTimes.push(echoTime)
          if (prevPad.activationTimes.length > 8) prevPad.activationTimes.shift()
          prevPad.sprite.setFillStyle(0xffffff, 0.5)
          const ring = this.add.image(prevPad.sprite.x, prevPad.sprite.y, 'effect_echo_ring')
            .setScale(0.4).setTint(0xc060ff).setDepth(15)
          this.tweens.add({ targets: ring, alpha: 0, scaleX: 2.4, scaleY: 2.4, duration: 380, onComplete: () => ring.destroy() })
          const who = isPlayer2 ? 'P2\u56de\u54cd' : '\u56de\u54cd'
          this.showStatus(`${who}  ${prevId}`, '#c060ff')
          this.checkDoors(echoTime)
        }
      })
    }

    if (isPlayer2) { this.echo2Memory = pad.id; this.echo2MemoryAt = time }
    else           { this.echoMemory  = pad.id; this.echoMemoryAt  = time }
    this.updateEchoDisplay()
    this.checkDoors(time)
  }

  private updateEchoDisplay() {
    this.echoText.setText(this.echoMemory ? `P1\u56de\u54cd\uff1a${this.echoMemory}` : 'P1\u56de\u54cd\uff1a\u7a7a')
      .setColor(this.echoMemory ? '#c060ff' : '#384850')
    if (this.echo2Text) {
      this.echo2Text.setText(this.echo2Memory ? `P2\u56de\u54cd\uff1a${this.echo2Memory}` : 'P2\u56de\u54cd\uff1a\u7a7a')
        .setColor(this.echo2Memory ? '#ffb030' : '#4a3818')
    }
  }

  private showStatus(msg: string, color: string) {
    this.tweens.killTweensOf(this.statusText)
    this.statusText.setText(msg).setColor(color).setAlpha(1)
    this.tweens.add({ targets: this.statusText, alpha: 0, delay: 2400, duration: 500 })
  }

  private onPassExit() {
    if (this.transitioning || this.finished) return
    this.transitioning = true
    this.cameras.main.flash(300, 255, 230, 100)
    const gain = Math.floor(this.currentLevel.sandReward * 0.6)
    this.totalSand += gain
    addTimeSand(gain)

    const maxSoloIdx = this.isCoop ? PUZZLE_LEVELS.length : 30
    this.levelIndex++
    if (this.levelIndex >= maxSoloIdx) {
      this.finished = true
      this.time.delayedCall(500, () => this.showVictory())
    } else {
      this.showStatus(`\u8fdb\u5165 ${PUZZLE_LEVELS[this.levelIndex]?.name ?? '\u4e0b\u4e00\u5ba4'}`, '#ffd060')
      this.time.delayedCall(700, () => this.buildLevel())
    }
  }

  private showVictory() {
    const W = 960, H = 540
    this.add.rectangle(W / 2, H / 2, 510, 250, 0x040810, 0.97)
      .setScrollFactor(0).setDepth(120).setStrokeStyle(2, 0x50e8a0)
    this.add.text(W / 2, H / 2 - 85, '\u2746 \u65f6\u5e8f\u8c1c\u9898\u5168\u90e8\u7834\u89e3 \u2746', {
      fontFamily: '"Silkscreen", monospace', fontSize: '22px', color: '#50e8a0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(121)

    const totalLevels = this.isCoop ? 5 : 30
    this.add.text(W / 2, H / 2 - 50, `\u901a\u5173 ${totalLevels} \u4e2a\u5173\u5361`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: '#507090',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(121)
    this.add.text(W / 2, H / 2 - 18, `\u83b7\u5f97\u65f6\u7802  ${this.totalSand}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '18px', color: '#c8e060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(121)
    this.add.text(W / 2, H / 2 + 14, '\u56de\u54cd\u4e0d\u6b62\u4e8e\u6218\u6597\u2014\u2014\u5b83\u662f\u65f6\u95f4\u672c\u8eab\u7684\u8bed\u8a00', {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#384850',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(121)

    const mkBtn = (cx: number, label: string, color: number, fn: () => void) => {
      const bg = this.add.rectangle(cx, H / 2 + 76, 160, 32, 0x040810)
        .setScrollFactor(0).setDepth(121)
      bg.setStrokeStyle(1, color, 0.9)
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerover',  () => bg.setFillStyle(color, 0.12))
      bg.on('pointerout',   () => bg.setFillStyle(0x040810))
      bg.on('pointerdown',  () => { audioManager.playClick(); fn() })
      const hex = '#' + color.toString(16).padStart(6, '0')
      this.add.text(cx, H / 2 + 76, label, {
        fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: hex,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(122)
    }
    mkBtn(W / 2 - 100, '\u518d\u6b21\u6311\u6218', 0x50e8a0, () => this.scene.restart())
    mkBtn(W / 2 + 100, '\u8fd4\u56de\u5927\u5385', 0x607080, () => this.scene.start('ModeSelectScene'))
  }

  update(time: number) {
    if (this.finished) return

    const vx1 = this.keys.a.isDown ? -200 : this.keys.d.isDown ? 200 : 0
    const vy1 = this.keys.w.isDown ? -200 : this.keys.s.isDown ? 200 : 0
    this.player.setVelocity(vx1, vy1)

    if (this.player2 && this.keys2) {
      const vx2 = this.keys2.left.isDown ? -200 : this.keys2.right.isDown ? 200 : 0
      const vy2 = this.keys2.up.isDown   ? -200 : this.keys2.down.isDown  ? 200 : 0
      this.player2.setVelocity(vx2, vy2)
    }

    this.pads.forEach(pad => {
      if (!pad.sprite.active) return
      const d1 = Phaser.Math.Distance.Between(this.player.x, this.player.y, pad.sprite.x, pad.sprite.y)
      const d2 = this.player2
        ? Phaser.Math.Distance.Between(this.player2.x, this.player2.y, pad.sprite.x, pad.sprite.y)
        : Infinity
      const anyOn = d1 < 28 || d2 < 28
      if (anyOn && !pad.onPad) {
        pad.onPad = true
        this.activatePad(pad, time, d2 < d1 && this.player2 != null)
      } else if (!anyOn && pad.onPad) {
        pad.onPad = false
        pad.sprite.setFillStyle(pad.color, 0.18)
      }
    })

    if (this.exitActive && !this.transitioning && this.currentLevel) {
      const level = this.currentLevel
      const d1 = Phaser.Math.Distance.Between(this.player.x, this.player.y, level.exitX, level.exitY)
      const d2 = this.player2
        ? Phaser.Math.Distance.Between(this.player2.x, this.player2.y, level.exitX, level.exitY)
        : Infinity
      const p1In = d1 < 30
      const p2In = !this.player2 || d2 < 30
      if (p1In && p2In) this.onPassExit()
    }

    if (this.echoMemory  && time - this.echoMemoryAt  > 5000) { this.echoMemory  = null; this.updateEchoDisplay() }
    if (this.echo2Memory && time - this.echo2MemoryAt > 5000) { this.echo2Memory = null; this.updateEchoDisplay() }

    if (this.exitActive && this.currentLevel) this.drawExitPulse(time)
  }

  private drawExitPulse(time: number) {
    const { exitX, exitY } = this.currentLevel
    const pulse = 0.14 + Math.sin(time * 0.004) * 0.1
    this.exitGfx.clear()
    for (let r = 40; r >= 20; r -= 5) {
      this.exitGfx.lineStyle(3, 0xffd060, ((40 - r) / 20) * pulse * 1.8)
      this.exitGfx.strokeCircle(exitX, exitY, r)
    }
    this.exitGfx.fillStyle(0xffd060, pulse * 0.85)
    this.exitGfx.fillCircle(exitX, exitY, 22)
    this.exitGfx.lineStyle(2, 0xffd060, 0.9)
    this.exitGfx.strokeCircle(exitX, exitY, 27)
  }
}
