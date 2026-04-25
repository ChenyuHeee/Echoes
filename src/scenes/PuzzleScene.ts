/**
 * PuzzleScene — 时序密室（动作冒险模式）
 *
 * 玩法：以回响系统破解上古时序逻辑谜题
 * 机制：
 *   - 踏板被激活后，技能槽"记住"该踏板
 *   - 释放下一技能（触发另一踏板）时，"回响"会再次触发上一踏板
 *   - 某些门需要两个踏板在 1.2s 内被触发两次才能开启
 *   - 三个房间，难度递增
 *
 * 操作：WASD 移动，走上踏板自动触发
 */
import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand } from '../state/gameState'

// 踏板状态
interface Pad {
  id: string
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  active: boolean
  lastActivatedAt: number
}

// 门状态
interface Door {
  sprite: Phaser.GameObjects.Rectangle
  open: boolean
  requiredPads: string[]   // 需要哪些踏板（均需在 windowMs 内激活）
  windowMs: number         // 时间窗口（毫秒）
  hintText: Phaser.GameObjects.Text
}

// 房间定义
interface RoomDef {
  name: string
  hint: string
  echoConcept: string  // 解题逻辑提示
}

const ROOMS: RoomDef[] = [
  {
    name: '第一室·初鸣',
    hint: '踩下 A，再踩 B — 回响会再次触发 A，门需要 A 连续两次',
    echoConcept: '踩 A → 踩 B → 回响 A → 门开（A 在 1.2s 内触发两次）',
  },
  {
    name: '第二室·共鸣',
    hint: '门需要 A 与 B 同时激活，但它们相距太远\n先踩 A，走向 B 踩下 — 回响触发 A，此时 B 也激活',
    echoConcept: '踩 A → 走向 B → 踩 B（同时回响 A）→ 门开',
  },
  {
    name: '第三室·悖论',
    hint: '门需要 C 在 A 触发之前 0.8s 内触发\n先踩 B → 踩 C → 回响 B 触发某机关改变 A 的延迟 → 踩 A → 门开',
    echoConcept: '踩 B → 踩 C → 踩 A（回响 C，此时 B 的残响改变了时序）',
  },
]

export class PuzzleScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image
  private keys!: {
    w: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    s: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
  }

  private pads: Pad[] = []
  private doors: Door[] = []
  private roomIndex = 0
  private finished = false
  private totalSandEarned = 0

  // 回响记忆：上一个踩过的踏板 ID
  private echoMemory: string | null = null
  private echoMemoryAt = 0

  // 解说文字
  private hintText!: Phaser.GameObjects.Text
  private echoText!: Phaser.GameObjects.Text
  private roomTitle!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text

  constructor() {
    super('PuzzleScene')
  }

  create() {
    this.roomIndex = 0
    this.finished = false
    this.totalSandEarned = 0
    this.pads = []
    this.doors = []
    this.echoMemory = null

    audioManager.startMenuBgm()
    this.cameras.main.setBackgroundColor('#06080e')
    this.physics.world.setBounds(0, 0, 960, 540)

    this.add.tileSprite(480, 270, 960, 540, 'tile_forest_a').setAlpha(0.55).setDepth(0)
    this.add.tileSprite(480, 270, 960, 540, 'tile_forest_b').setAlpha(0.12).setDepth(1)

    // 顶栏
    this.add.rectangle(480, 20, 960, 40, 0x040810, 0.95).setDepth(30)

    this.roomTitle = this.add.text(480, 8, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#50e8a0',
    }).setOrigin(0.5, 0).setDepth(31)

    const back = this.add.text(16, 8, '← 返回', {
      fontFamily: 'monospace', fontSize: '12px', color: '#304050',
    }).setOrigin(0, 0).setDepth(31)
    back.setInteractive({ useHandCursor: true })
    back.on('pointerover', () => back.setColor('#608090'))
    back.on('pointerout', () => back.setColor('#304050'))
    back.on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })

    // 回响记忆状态
    this.echoText = this.add.text(480, 26, '回响记忆：空', {
      fontFamily: 'monospace', fontSize: '11px', color: '#506050',
    }).setOrigin(0.5, 0).setDepth(31)

    // 底部提示
    this.hintText = this.add.text(480, 510, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#4a6860',
      wordWrap: { width: 900 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(31)

    // 状态文字（中央临时提示）
    this.statusText = this.add.text(480, 290, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(35).setAlpha(0)

    // 玩家
    this.player = this.physics.add.image(80, 270, 'player_idle')
    this.player.setScale(2.2).setDepth(20).setCollideWorldBounds(true)
    ;(this.player.body as Phaser.Physics.Arcade.Body).allowGravity = false

    // 输入
    const kb = this.input.keyboard!
    this.keys = {
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    this.buildRoom(0)
  }

  // ───────────── 房间构建 ─────────────

  private buildRoom(idx: number) {
    // 清理旧物件
    this.pads.forEach(p => { p.sprite.destroy(); p.label.destroy() })
    this.doors.forEach(d => { d.sprite.destroy(); d.hintText.destroy() })
    this.pads = []
    this.doors = []
    this.echoMemory = null
    this.echoMemoryAt = 0

    const room = ROOMS[idx]
    this.roomTitle.setText(room.name)
    this.hintText.setText(room.hint)
    this.updateEchoDisplay()

    if (idx === 0) this.buildRoom0()
    else if (idx === 1) this.buildRoom1()
    else this.buildRoom2()

    // 玩家归位
    this.player.setPosition(80, 270)

    // 显示房间进入提示
    this.showStatus(room.echoConcept, '#50e8a0')
  }

  /** 第一室：A → B → (echo A) → 门开 */
  private buildRoom0() {
    // 踏板 A（左区）
    this.addPad('A', 200, 200, '#50e8a0')
    // 踏板 B（中区）
    this.addPad('B', 480, 340, '#e0a030')
    // 门（右区）
    this.addDoor(760, 270, 60, 160, ['A', 'A'], 1200)
    // 墙壁提示标签
    this.addWallLabel(760, 160, 'A  ×2\n< 1.2s')
  }

  /** 第二室：A → B（同时回响A）→ 门开 */
  private buildRoom1() {
    this.addPad('A', 180, 180, '#50e8a0')
    this.addPad('B', 720, 360, '#e0a030')
    this.addDoor(760, 200, 60, 120, ['A', 'B'], 2000)
    this.addWallLabel(760, 120, 'A + B\n同时')
  }

  /** 第三室：B → C → A（回响C → 触发时序门）*/
  private buildRoom2() {
    this.addPad('A', 760, 270, '#e06060')
    this.addPad('B', 200, 180, '#50e8a0')
    this.addPad('C', 480, 180, '#c060ff')

    // 主门：需要 A 和 C 在 0.8s 内
    this.addDoor(900, 270, 55, 180, ['A', 'C'], 1000)
    this.addWallLabel(900, 160, 'A + C\n< 1s')
  }

  private addPad(id: string, x: number, y: number, color: string) {
    const col = Phaser.Display.Color.HexStringToColor(color).color
    const sprite = this.add.rectangle(x, y, 48, 48, col, 0.25).setDepth(5)
    sprite.setStrokeStyle(2, col, 0.7)
    const label = this.add.text(x, y, id, {
      fontFamily: 'monospace', fontSize: '20px', color,
    }).setOrigin(0.5).setDepth(6)
    this.pads.push({ id, sprite, label, active: false, lastActivatedAt: 0 })
  }

  private addDoor(x: number, y: number, w: number, h: number, requiredPads: string[], windowMs: number) {
    const sprite = this.add.rectangle(x, y, w, h, 0x8040ff, 0.85).setDepth(8)
    sprite.setStrokeStyle(2, 0xa060ff, 0.9)
    const hintText = this.add.text(x, y + h / 2 + 12, requiredPads.join(' + '), {
      fontFamily: 'monospace', fontSize: '10px', color: '#a060ff',
    }).setOrigin(0.5, 0).setDepth(9)
    this.doors.push({ sprite, open: false, requiredPads, windowMs, hintText })
  }

  private addWallLabel(x: number, y: number, text: string) {
    this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '11px', color: '#304050',
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(9)
  }

  private showStatus(msg: string, color: string) {
    this.statusText.setText(msg).setColor(color).setAlpha(1)
    this.tweens.add({ targets: this.statusText, alpha: 0, delay: 2200, duration: 600 })
  }

  private updateEchoDisplay() {
    if (this.echoMemory) {
      this.echoText.setText(`回响记忆：踏板 ${this.echoMemory}`).setColor('#c060ff')
    } else {
      this.echoText.setText('回响记忆：空').setColor('#384850')
    }
  }

  // ───────────── 帧更新 ─────────────

  update(time: number) {
    if (this.finished) return

    // 移动
    const vx = this.keys.a.isDown ? -200 : this.keys.d.isDown ? 200 : 0
    const vy = this.keys.w.isDown ? -200 : this.keys.s.isDown ? 200 : 0
    this.player.setVelocity(vx, vy)

    // 检测踏板碰撞（步行至踏板范围触发）
    this.pads.forEach(pad => {
      if (!pad.sprite.active) return
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pad.sprite.x, pad.sprite.y)
      if (dist < 28 && !pad.active) {
        this.activatePad(pad, time)
      } else if (dist >= 28 && pad.active) {
        // 离开后重置（允许重复触发）
        pad.active = false
        pad.sprite.setFillStyle(Phaser.Display.Color.HexStringToColor(pad.label.style.color as string).color, 0.25)
      }
    })

    // 检测穿过门（门开时可通行）
    this.doors.forEach(door => {
      if (!door.open) return
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, door.sprite.x, door.sprite.y,
      )
      if (dist < 36) {
        this.onPassDoor()
      }
    })

    // 回响记忆超时（4秒无操作清除）
    if (this.echoMemory && time - this.echoMemoryAt > 4000) {
      this.echoMemory = null
      this.updateEchoDisplay()
    }
  }

  private activatePad(pad: Pad, time: number) {
    pad.active = true
    pad.lastActivatedAt = time
    pad.sprite.setFillStyle(0xffffff, 0.8)

    // 激活特效
    const flash = this.add.image(pad.sprite.x, pad.sprite.y, 'effect_echo_ring').setScale(0.6).setDepth(15)
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 350, onComplete: () => flash.destroy() })
    audioManager.playPickup()

    // ─── 回响机制核心 ───────────────────────────────
    // 1. 如果已有记忆，先"回响"上一个踏板
    if (this.echoMemory && this.echoMemory !== pad.id) {
      const prevPadId = this.echoMemory
      this.time.delayedCall(120, () => {
        // 找到上一个踏板并再次激活（回响）
        const prevPad = this.pads.find(p => p.id === prevPadId)
        if (prevPad && prevPad.sprite.active) {
          prevPad.lastActivatedAt = time + 120
          prevPad.sprite.setFillStyle(0xffffff, 0.6)
          const echoRing = this.add.image(prevPad.sprite.x, prevPad.sprite.y, 'effect_echo_ring')
            .setScale(0.4).setTint(0xc060ff).setDepth(15)
          this.tweens.add({ targets: echoRing, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 400, onComplete: () => echoRing.destroy() })
          this.showStatus(`回响  ${prevPadId}`, '#c060ff')
          // 检查门
          this.checkDoors(time + 120)
        }
      })
    }

    // 2. 将本次踏板存入记忆
    this.echoMemory = pad.id
    this.echoMemoryAt = time
    this.updateEchoDisplay()

    // 3. 检查门
    this.checkDoors(time)
    // ────────────────────────────────────────────────
  }

  private checkDoors(now: number) {
    this.doors.forEach(door => {
      if (door.open) return

      // 检查所有 requiredPads 是否都在 windowMs 内被激活
      const allMet = door.requiredPads.every((reqId, i) => {
        const matches = this.pads.filter(p => p.id === reqId)
        // 对于重复要求（如 ['A','A']），检查该踏板是否被激活了两次（即当前 active + 回响 active）
        if (door.requiredPads.filter(r => r === reqId).length === 2 && i === 1) {
          // 特殊处理：同一踏板需要两次
          // 查看该踏板最近激活时间，以及回响时间，是否在窗口内
          const pad = matches[0]
          if (!pad) return false
          const timeDiff = Math.abs(pad.lastActivatedAt - now)
          return timeDiff < door.windowMs && pad.lastActivatedAt > 0
        }
        return matches.some(p => Math.abs(p.lastActivatedAt - now) < door.windowMs && p.lastActivatedAt > 0)
      })

      if (allMet) {
        this.openDoor(door)
      }
    })
  }

  private openDoor(door: Door) {
    door.open = true
    // 门开动画
    this.tweens.add({
      targets: door.sprite,
      alpha: 0.1,
      scaleY: 0.1,
      duration: 500,
      ease: 'Power2',
    })
    door.hintText.setText('通过！').setColor('#50e8a0')
    this.showStatus('✦ 门已开启', '#50e8a0')
    audioManager.playEcho()
    this.cameras.main.flash(300, 80, 220, 140)

    // 奖励时砂
    const gain = 25
    this.totalSandEarned += gain
    addTimeSand(gain)
    this.showStatus(`+${gain} 时砂`, '#c8e060')
  }

  private onPassDoor() {
    this.roomIndex++
    if (this.roomIndex >= ROOMS.length) {
      // 全部通关
      this.finished = true
      this.showVictory()
    } else {
      this.showStatus(`进入 ${ROOMS[this.roomIndex].name}`, '#50e8a0')
      this.time.delayedCall(600, () => this.buildRoom(this.roomIndex))
    }
  }

  private showVictory() {
    const { width, height } = this.scale
    const bg = this.add.rectangle(width / 2, height / 2, 480, 220, 0x040810, 0.97).setDepth(100)
    bg.setStrokeStyle(2, 0x50e8a0)

    this.add.text(width / 2, height / 2 - 72, '✦ 时序谜题破解 ✦', {
      fontFamily: 'monospace', fontSize: '24px', color: '#50e8a0',
    }).setOrigin(0.5).setDepth(101)
    this.add.text(width / 2, height / 2 - 36, '上古密室的时序逻辑已被你的回响解开', {
      fontFamily: 'monospace', fontSize: '13px', color: '#7090a0',
    }).setOrigin(0.5).setDepth(101)
    this.add.text(width / 2, height / 2 - 8, `获得时砂  ${this.totalSandEarned}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8e060',
    }).setOrigin(0.5).setDepth(101)
    this.add.text(width / 2, height / 2 + 20, '回响不止于战斗——它是时间本身的语言', {
      fontFamily: 'monospace', fontSize: '12px', color: '#384850',
    }).setOrigin(0.5).setDepth(101)

    const retry = this.add.text(width / 2 - 94, height / 2 + 72, '[ 再次挑战 ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#50e8a0',
    }).setOrigin(0.5).setDepth(101)
    retry.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.restart() })

    const back = this.add.text(width / 2 + 94, height / 2 + 72, '[ 返回大厅 ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#607080',
    }).setOrigin(0.5).setDepth(101)
    back.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }
}
