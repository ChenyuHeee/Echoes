/**
 * StormScene — 虚空风暴（战术竞技模式）
 * 
 * 玩法：碎片岛屿被虚空吞噬，时间稳定度持续消耗
 *       搜刮时砂维持稳定度，击杀 AI 对手夺取回响
 *       最后一名存活者胜
 * 
 * 机制：
 * - 稳定度代替 HP，降至 0 即死亡
 * - 在虚空区域（安全圈外）稳定度消耗 ×4
 * - 击杀 AI 掉落大量时砂
 * - 安全圈每 6 秒缩小
 * - 操作：WASD 移动，碰撞 AI 互相损耗
 */
import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand } from '../state/gameState'

const MAP_W = 2000
const MAP_H = 1400

interface AIPlayer {
  sprite: Phaser.Physics.Arcade.Image
  hpBarBg: Phaser.GameObjects.Rectangle
  hpBarFill: Phaser.GameObjects.Rectangle
  stability: number
  maxStability: number
  isAlive: boolean
  speed: number
  lastTargetAt: number
  targetX: number
  targetY: number
}

export class StormScene extends Phaser.Scene {
  // 玩家
  private player!: Phaser.Physics.Arcade.Image
  private playerStability = 100
  private playerMaxStability = 100
  private playerAlive = true
  private finished = false

  // AI
  private aiList: AIPlayer[] = []

  // 地图物件
  private sandPickups!: Phaser.Physics.Arcade.Group
  private powerUps!: Phaser.Physics.Arcade.Group

  // 玩家增益（叠加倍率/计时）
  private speedBoostUntil = 0      // 速度爆发：移动+45%
  private damageBoostUntil = 0     // 撕裂：碰撞伤害×1.6 / 受伤×0.6
  private shieldHits = 0           // 护盾：抵消接下来 N 次接触伤害
  private echoBurstReady = false   // 回响爆发：一次性范围清场

  // 击杀连击
  private killStreak = 0
  private lastKillAt = 0

  // 援军波次
  private waveCount = 0
  private waveText!: Phaser.GameObjects.Text

  // 虚空
  private voidRadius = 880
  private readonly VOID_CX = MAP_W / 2
  private readonly VOID_CY = MAP_H / 2
  private voidGfx!: Phaser.GameObjects.Graphics

  // HUD
  private stabilityBarFill!: Phaser.GameObjects.Rectangle
  private aliveText!: Phaser.GameObjects.Text
  private sandText!: Phaser.GameObjects.Text
  private voidWarningText!: Phaser.GameObjects.Text

  // 统计
  private totalSand = 0
  private kills = 0
  private startTime = 0

  // 输入
  private keys!: {
    w: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    s: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
  }

  constructor() {
    super('StormScene')
  }

  create() {
    this.playerStability = 100
    this.playerMaxStability = 100
    this.playerAlive = true
    this.finished = false
    this.totalSand = 0
    this.kills = 0
    this.voidRadius = 880
    this.aiList = []
    this.startTime = Date.now()
    this.speedBoostUntil = 0
    this.damageBoostUntil = 0
    this.shieldHits = 0
    this.echoBurstReady = false
    this.killStreak = 0
    this.lastKillAt = 0
    this.waveCount = 0

    audioManager.startBattleBgm()
    this.cameras.main.setBackgroundColor('#07090f')
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H)

    // 地面贴图
    this.add.tileSprite(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 'tile_cyber_a').setAlpha(0.6).setDepth(0)
    this.add.tileSprite(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 'tile_cyber_b').setAlpha(0.18).setDepth(1)

    // 虚空边界圈（深度低于玩家但高于地面）
    this.voidGfx = this.add.graphics().setDepth(4)

    // 散落道具
    this.sandPickups = this.physics.add.group()
    this.powerUps = this.physics.add.group()
    this.spawnInitialSands()
    this.spawnInitialPowerUps()

    // 玩家（地图中心）
    this.player = this.physics.add.image(MAP_W / 2, MAP_H / 2, 'player_idle')
    this.player.setScale(2.4).setDepth(20).setTint(0x40ffff)
    this.player.setCollideWorldBounds(true)
    this.player.setDrag(1300, 1300)
    this.player.setMaxVelocity(210, 210)
    ;(this.player.body as Phaser.Physics.Arcade.Body).allowGravity = false

    // AI 玩家（20 人）
    this.spawnAI()

    // 输入
    const kb = this.input.keyboard!
    this.keys = {
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    // 时砂拾取
    this.physics.add.overlap(this.player, this.sandPickups, (_, p) => {
      const pickup = p as Phaser.Physics.Arcade.Image
      if (!pickup.active) return
      pickup.destroy()
      const gain = 18 + Math.floor(Math.random() * 14)
      this.playerStability = Math.min(this.playerMaxStability, this.playerStability + gain)
      this.totalSand += gain
      addTimeSand(gain)
      this.sandText.setText(`时砂 ${this.totalSand}`)
    })

    // 道具拾取
    this.physics.add.overlap(this.player, this.powerUps, (_, p) => {
      const pickup = p as Phaser.Physics.Arcade.Image
      if (!pickup.active) return
      const kind = pickup.getData('kind') as string
      pickup.destroy()
      this.applyPowerUp(kind)
    })

    // 摄像机
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(0.82)

    // HUD
    this.buildHUD()

    // 虚空收缩计时
    this.time.addEvent({
      delay: 6000,
      callback: () => {
        this.voidRadius = Math.max(80, this.voidRadius - 55)
        if (this.voidRadius < 200) {
          this.voidWarningText.setText('⚠ 虚空崩解迫近！').setColor('#ff2020')
        }
      },
      loop: true,
    })

    // 周期补充时砂
    this.time.addEvent({
      delay: 5000,
      callback: () => {
        if (Math.random() < 0.7) {
          const x = 100 + Math.random() * (MAP_W - 200)
          const y = 100 + Math.random() * (MAP_H - 200)
          this.dropSand(x, y, 1)
        }
      },
      loop: true,
    })

    // 周期补充道具（每 12-18s 1 件）
    this.time.addEvent({
      delay: 14000,
      callback: () => {
        const x = 120 + Math.random() * (MAP_W - 240)
        const y = 120 + Math.random() * (MAP_H - 240)
        this.spawnRandomPowerUp(x, y)
      },
      loop: true,
    })

    // 援军波次：每 35s 来 1 波（5+1*wave 个，速度+15%/波）
    this.time.addEvent({
      delay: 35000,
      callback: () => this.spawnReinforcementWave(),
      loop: true,
    })

    // 空格触发回响爆发
    this.input.keyboard!.on('keydown-SPACE', () => this.tryEchoBurst())
  }

  // ───────────── 初始化 ─────────────

  private spawnInitialSands() {
    for (let i = 0; i < 65; i++) {
      const x = 100 + Math.random() * (MAP_W - 200)
      const y = 100 + Math.random() * (MAP_H - 200)
      this.dropSand(x, y, 1)
    }
  }

  private dropSand(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 80
      const oy = (Math.random() - 0.5) * 80
      const p = this.physics.add.image(x + ox, y + oy, 'pickup').setScale(1.35).setDepth(8)
      ;(p.body as Phaser.Physics.Arcade.Body).allowGravity = false
      this.sandPickups.add(p)
      this.tweens.add({ targets: p, y: p.y - 7, duration: 900, yoyo: true, repeat: -1 })
    }
  }

  // ───────────── 道具系统 ─────────────
  private static readonly POWER_KINDS = [
    { kind: 'speed',  tint: 0x40e0ff, label: '极速' },
    { kind: 'shield', tint: 0xa0c0ff, label: '护盾' },
    { kind: 'rage',   tint: 0xff6040, label: '撕裂' },
    { kind: 'sand',   tint: 0xffe060, label: '时砂' },
    { kind: 'echo',   tint: 0xc080ff, label: '回响爆发' },
  ]

  private spawnInitialPowerUps() {
    for (let i = 0; i < 8; i++) {
      const x = 200 + Math.random() * (MAP_W - 400)
      const y = 200 + Math.random() * (MAP_H - 400)
      this.spawnRandomPowerUp(x, y)
    }
  }

  private spawnRandomPowerUp(x: number, y: number) {
    const def = StormScene.POWER_KINDS[Math.floor(Math.random() * StormScene.POWER_KINDS.length)]
    const p = this.physics.add.image(x, y, 'effect_echo_ring').setScale(0.7).setDepth(9)
    p.setTint(def.tint)
    p.setData('kind', def.kind)
    ;(p.body as Phaser.Physics.Arcade.Body).allowGravity = false
    this.powerUps.add(p)
    // 浮动 + 旋转
    this.tweens.add({ targets: p, scaleX: 0.85, scaleY: 0.85, duration: 700, yoyo: true, repeat: -1 })
    this.tweens.add({ targets: p, angle: 360, duration: 4000, repeat: -1 })
    // 标签
    const lbl = this.add.text(x, y - 22, def.label, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#' + def.tint.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setDepth(10)
    p.setData('label', lbl)
    p.on('destroy', () => lbl.destroy())
  }

  private applyPowerUp(kind: string) {
    const now = this.time.now
    switch (kind) {
      case 'speed':
        this.speedBoostUntil = now + 6000
        this.flashHud('⚡ 极速 +45%（6s）', '#40e0ff')
        break
      case 'shield':
        this.shieldHits = Math.min(5, this.shieldHits + 3)
        this.flashHud(`✦ 护盾 ×${this.shieldHits}`, '#a0c0ff')
        break
      case 'rage':
        this.damageBoostUntil = now + 5000
        this.flashHud('☄ 撕裂 ×1.6（5s）', '#ff6040')
        break
      case 'sand': {
        const gain = 60
        this.playerStability = Math.min(this.playerMaxStability, this.playerStability + gain)
        this.totalSand += gain
        addTimeSand(gain)
        this.sandText.setText(`时砂 ${this.totalSand}`)
        this.flashHud(`✦ 时砂 +${gain}`, '#ffe060')
        break
      }
      case 'echo':
        this.echoBurstReady = true
        this.flashHud('★ 回响爆发就绪！按 [空格] 释放', '#c080ff')
        break
    }
    audioManager.playPickup()
  }

  private flashHud(text: string, color: string) {
    const { width } = this.scale
    const t = this.add.text(width / 2, 38, text, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82)
    this.tweens.add({
      targets: t, alpha: 0, y: 22, duration: 1600, delay: 400,
      onComplete: () => t.destroy(),
    })
  }

  private tryEchoBurst() {
    if (!this.echoBurstReady || !this.playerAlive || this.finished) return
    this.echoBurstReady = false
    const px = this.player.x, py = this.player.y
    // 3 层扩散环
    for (let r = 0; r < 3; r++) {
      this.time.delayedCall(r * 80, () => {
        const ring = this.add.graphics().setDepth(60)
        ring.lineStyle(3 - r, 0xc080ff, 0.85 - r * 0.2)
        ring.strokeCircle(px, py, 8)
        this.tweens.add({
          targets: ring, scaleX: 12 + r * 4, scaleY: 12 + r * 4, alpha: 0,
          duration: 520 + r * 80, ease: 'Quad.Out',
          onComplete: () => ring.destroy(),
        })
      })
    }
    // 范围 360 内 AI 直接掉血 60 + 击退
    const RADIUS = 360
    this.aiList.forEach(ai => {
      if (!ai.isAlive) return
      const d = Phaser.Math.Distance.Between(px, py, ai.sprite.x, ai.sprite.y)
      if (d < RADIUS) {
        const ang = Math.atan2(ai.sprite.y - py, ai.sprite.x - px)
        ai.sprite.setVelocity(Math.cos(ang) * 480, Math.sin(ang) * 480)
        ai.stability -= 60
        if (ai.stability <= 0) this.killAI(ai)
      }
    })
    this.cameras.main.shake(220, 0.012)
    audioManager.playEnemyDeath()
  }

  private spawnReinforcementWave() {
    if (this.finished) return
    this.waveCount++
    const count = 4 + this.waveCount
    const speedMul = 1 + this.waveCount * 0.12
    const stabMul = 1 + this.waveCount * 0.15
    const spritePool = ['enemy_basic', 'enemy_drone', 'enemy_hunter', 'enemy_wraith', 'enemy_heavy']
    const tintPool = [0xff8040, 0xff40a0, 0x40e0ff, 0xa040ff, 0xffff40, 0x40ff80]
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = this.voidRadius * 0.85
      const x = Phaser.Math.Clamp(this.VOID_CX + Math.cos(angle) * r, 60, MAP_W - 60)
      const y = Phaser.Math.Clamp(this.VOID_CY + Math.sin(angle) * r, 60, MAP_H - 60)
      const sprite = this.physics.add.image(x, y, spritePool[i % spritePool.length])
      sprite.setScale(2.2).setDepth(16).setTint(tintPool[i % tintPool.length])
      sprite.setCollideWorldBounds(true)
      sprite.setDrag(900, 900)
      sprite.setMaxVelocity(160 * speedMul, 160 * speedMul)
      ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false
      const barBg = this.add.rectangle(x, y - 24, 32, 5, 0x200010).setDepth(17)
      const barFill = this.add.rectangle(x - 16, y - 24, 32, 5, 0xff5050).setOrigin(0, 0.5).setDepth(18)
      const ai: AIPlayer = {
        sprite, hpBarBg: barBg, hpBarFill: barFill,
        stability: (55 + Math.floor(Math.random() * 45)) * stabMul,
        maxStability: 100 * stabMul,
        isAlive: true,
        speed: (75 + Math.random() * 65) * speedMul,
        lastTargetAt: 0,
        targetX: x, targetY: y,
      }
      this.aiList.push(ai)
      this.physics.add.overlap(this.player, ai.sprite, () => {
        if (!ai.isAlive || !this.playerAlive || this.finished) return
        const dmgMul = this.time.now < this.damageBoostUntil ? 1.6 : 1
        const recvMul = this.time.now < this.damageBoostUntil ? 0.6 : 1
        if (this.shieldHits > 0) {
          this.shieldHits--
        } else {
          this.playerStability -= 8 * recvMul
        }
        ai.stability -= 14 * dmgMul
        const dx = this.player.x - ai.sprite.x
        const dy = this.player.y - ai.sprite.y
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        this.player.setVelocity((dx / len) * 200, (dy / len) * 200)
        ai.sprite.setVelocity(-(dx / len) * 170, -(dy / len) * 170)
        this.cameras.main.shake(60, 0.005)
        if (ai.stability <= 0) this.killAI(ai)
      })
    }
    // 提示
    const { width } = this.scale
    const txt = this.add.text(width / 2, 80, `⚠ 第 ${this.waveCount} 波援军 — ${count} 名敌人 (强度 +${Math.round((speedMul - 1) * 100)}%)`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#ff5040',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82)
    this.tweens.add({ targets: txt, alpha: 0, duration: 2200, delay: 1500, onComplete: () => txt.destroy() })
  }

  private spawnAI() {
    const spritePool = ['enemy_basic', 'enemy_drone', 'enemy_hunter', 'enemy_wraith', 'enemy_heavy']
    const tintPool = [0xff8040, 0xff40a0, 0x40e0ff, 0xa040ff, 0xffff40, 0x40ff80]

    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2
      const r = 420 + Math.random() * 380
      const x = Phaser.Math.Clamp(MAP_W / 2 + Math.cos(angle) * r, 60, MAP_W - 60)
      const y = Phaser.Math.Clamp(MAP_H / 2 + Math.sin(angle) * r, 60, MAP_H - 60)

      const sprite = this.physics.add.image(x, y, spritePool[i % spritePool.length])
      sprite.setScale(2.2).setDepth(16).setTint(tintPool[i % tintPool.length])
      sprite.setCollideWorldBounds(true)
      sprite.setDrag(900, 900)
      sprite.setMaxVelocity(160, 160)
      ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false

      // AI 血条
      const barBg = this.add.rectangle(x, y - 24, 32, 5, 0x200010).setDepth(17)
      const barFill = this.add.rectangle(x - 16, y - 24, 32, 5, 0xff5050).setOrigin(0, 0.5).setDepth(18)

      const ai: AIPlayer = {
        sprite, hpBarBg: barBg, hpBarFill: barFill,
        stability: 55 + Math.floor(Math.random() * 45),
        maxStability: 100,
        isAlive: true,
        speed: 75 + Math.random() * 65,
        lastTargetAt: 0,
        targetX: x, targetY: y,
      }
      this.aiList.push(ai)

      // 碰撞：玩家接触 AI = 互相损耗稳定度
      this.physics.add.overlap(this.player, ai.sprite, () => {
        if (!ai.isAlive || !this.playerAlive || this.finished) return
        this.playerStability -= 8
        ai.stability -= 14

        // 击退
        const dx = this.player.x - ai.sprite.x
        const dy = this.player.y - ai.sprite.y
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        this.player.setVelocity((dx / len) * 200, (dy / len) * 200)
        ai.sprite.setVelocity(-(dx / len) * 170, -(dy / len) * 170)
        this.cameras.main.shake(60, 0.005)

        if (ai.stability <= 0) this.killAI(ai)
      })
    }
  }

  private buildHUD() {
    const { width, height } = this.scale

    // 稳定度条
    this.add.rectangle(width / 2, height - 14, 220, 14, 0x10000a, 0.88).setScrollFactor(0).setDepth(80)
    this.stabilityBarFill = this.add.rectangle(width / 2 - 110, height - 14, 220, 10, 0x60e080)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(81)
    this.add.text(width / 2, height - 28, '时间稳定度', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#304840',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(81)

    // 存活人数
    this.aliveText = this.add.text(width - 14, 10, '存活 21/21', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#ff9050',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(81)

    // 时砂计数
    this.sandText = this.add.text(14, 10, '时砂 0', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#c8e060',
    }).setScrollFactor(0).setDepth(81)

    // 虚空警告
    this.voidWarningText = this.add.text(width / 2, 10, '虚空风暴', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#ff7050',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(81)

    // 操作提示
    this.add.text(14, height - 28, 'WASD 移动  ·  接触损耗  ·  拾取道具  ·  [空格] 回响爆发', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#28323a',
    }).setScrollFactor(0).setDepth(81)

    // 援军波次提示
    this.waveText = this.add.text(width - 14, 32, '援军 35s', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#806060',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(81)

    const backTxt = this.add.text(width - 14, height - 12, '返回 →', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#304050',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(81)
    backTxt.setInteractive({ useHandCursor: true })
    backTxt.on('pointerover', () => backTxt.setColor('#6090b0'))
    backTxt.on('pointerout', () => backTxt.setColor('#304050'))
    backTxt.on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }

  // ───────────── 游戏逻辑 ─────────────

  private killAI(ai: AIPlayer) {
    if (!ai.isAlive) return
    ai.isAlive = false
    this.kills++

    const dx = ai.sprite.x
    const dy = ai.sprite.y
    // 死亡特效
    const ring = this.add.image(dx, dy, 'effect_echo_ring').setScale(0.7).setTint(0xffa040).setDepth(25)
    this.tweens.add({ targets: ring, alpha: 0, scaleX: 3, scaleY: 3, duration: 500, onComplete: () => ring.destroy() })

    ai.sprite.destroy()
    ai.hpBarBg.destroy()
    ai.hpBarFill.destroy()

    // 掉落时砂（2-4 颗）
    const dropCount = 2 + Math.floor(Math.random() * 3)
    this.dropSand(dx, dy, dropCount)

    audioManager.playEnemyDeath()
    this.cameras.main.shake(90, 0.006)

    // 击杀连击：3s 内连续击杀加成
    const now = this.time.now
    if (now - this.lastKillAt < 3000) this.killStreak++
    else this.killStreak = 1
    this.lastKillAt = now
    if (this.killStreak >= 2) {
      const bonus = this.killStreak * 12
      this.totalSand += bonus
      addTimeSand(bonus)
      this.playerStability = Math.min(this.playerMaxStability, this.playerStability + this.killStreak * 5)
      this.sandText.setText(`时砂 ${this.totalSand}`)
      this.flashHud(`★ ${this.killStreak} 连击！+${bonus} 时砂`, '#ffd060')
    }

    // 检查胜利
    if (this.aiList.every(a => !a.isAlive) && !this.finished) {
      this.finished = true
      this.playerAlive = false
      this.time.delayedCall(400, () => this.showResult(true))
    }
  }

  private showResult(win: boolean) {
    const { width, height } = this.scale
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    const borderColor = win ? 0x40ff80 : 0xff4040

    const bg = this.add.rectangle(width / 2, height / 2, 470, 230, 0x040810, 0.97)
      .setScrollFactor(0).setDepth(100)
    bg.setStrokeStyle(2, borderColor)

    this.add.text(width / 2, height / 2 - 76, win ? '✦ 最后的回响体 ✦' : '时间稳定度归零', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '22px',
      color: win ? '#40ff80' : '#ff5030',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    this.add.text(width / 2, height / 2 - 40, `存活时间   ${elapsed}s`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#9090b0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    this.add.text(width / 2, height / 2 - 14, `击杀对手   ${this.kills}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#ff8050',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    this.add.text(width / 2, height / 2 + 12, `收集时砂   ${this.totalSand}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#c8e060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    const remaining = this.aiList.filter(a => a.isAlive).length
    this.add.text(width / 2, height / 2 + 36, `残余对手   ${remaining}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#507090',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const retry = this.add.text(width / 2 - 94, height / 2 + 80, '[ 再次挑战 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#40ff80',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    retry.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.restart() })

    const back = this.add.text(width / 2 + 94, height / 2 + 80, '[ 返回大厅 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#607080',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    back.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }

  // ───────────── 帧更新 ─────────────

  update(_time: number, delta: number) {
    if (!this.playerAlive || this.finished) return
    const dt = delta / 1000
    const now = _time

    // 玩家移动（道具加成）
    const speedMul = this.time.now < this.speedBoostUntil ? 1.45 : 1
    const vx = this.keys.a.isDown ? -210 * speedMul : this.keys.d.isDown ? 210 * speedMul : 0
    const vy = this.keys.w.isDown ? -210 * speedMul : this.keys.s.isDown ? 210 * speedMul : 0
    this.player.setVelocity(vx, vy)

    // 虚空稳定度消耗
    const inVoid = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.VOID_CX, this.VOID_CY,
    ) > this.voidRadius
    const drain = inVoid ? 7.5 : 1.2
    this.playerStability = Math.max(0, this.playerStability - drain * dt)

    // 玩家颜色警告
    if (inVoid) {
      this.player.setTint(0xff6040)
    } else if (this.playerStability < 30) {
      this.player.setTint(0xff9040)
    } else {
      this.player.setTint(0x40ffff)
    }

    // 稳定度条
    const ratio = this.playerStability / this.playerMaxStability
    this.stabilityBarFill.setDisplaySize(220 * ratio, 10)
    this.stabilityBarFill.setFillStyle(ratio > 0.5 ? 0x60e080 : ratio > 0.25 ? 0xe0a030 : 0xff4040)

    // 死亡检查
    if (this.playerStability <= 0) {
      this.playerAlive = false
      this.finished = true
      this.player.setTint(0xff2020)
      this.cameras.main.shake(400, 0.014)
      this.time.delayedCall(600, () => this.showResult(false))
      return
    }

    // HUD 更新
    const aliveAI = this.aiList.filter(a => a.isAlive).length
    const total = this.aiList.length + 1
    this.aliveText.setText(`存活 ${aliveAI + 1}/${total}`)
    // 援军倒计时
    const sinceStart = (Date.now() - this.startTime) / 1000
    const nextWaveSec = Math.max(0, Math.ceil(35 - (sinceStart % 35)))
    if (this.waveText) this.waveText.setText(`援军 ${nextWaveSec}s`)
    if (inVoid) {
      this.voidWarningText.setText('⚠ 虚空侵蚀中！稳定度急剧消耗').setColor('#ff2020')
    } else {
      this.voidWarningText.setText('虚空风暴  安全区缩小中').setColor('#ff7050')
    }

    // 绘制虚空边界
    this.drawVoidBorder()

    // AI 更新
    this.updateAI(now, dt)
  }

  private drawVoidBorder() {
    this.voidGfx.clear()
    // 外侧危险光晕（多层渐变圈）
    for (let i = 0; i < 6; i++) {
      const r = this.voidRadius + i * 16
      const alpha = 0.08 + i * 0.02
      this.voidGfx.lineStyle(14, 0xff2010, alpha)
      this.voidGfx.strokeCircle(this.VOID_CX, this.VOID_CY, r)
    }
    // 边界线
    this.voidGfx.lineStyle(3, 0xff4020, 0.9)
    this.voidGfx.strokeCircle(this.VOID_CX, this.VOID_CY, this.voidRadius)
    // 内侧安全提示（淡蓝色）
    this.voidGfx.lineStyle(1, 0x4080ff, 0.2)
    this.voidGfx.strokeCircle(this.VOID_CX, this.VOID_CY, this.voidRadius - 12)
  }

  private updateAI(now: number, dt: number) {
    this.aiList.forEach(ai => {
      if (!ai.isAlive) return

      // 虚空消耗
      const aiInVoid = Phaser.Math.Distance.Between(
        ai.sprite.x, ai.sprite.y, this.VOID_CX, this.VOID_CY,
      ) > this.voidRadius
      ai.stability -= (aiInVoid ? 3.5 : 0.8) * dt
      if (ai.stability <= 0) { this.killAI(ai); return }

      // 更新血条位置和宽度
      ai.hpBarBg.setPosition(ai.sprite.x, ai.sprite.y - 25)
      ai.hpBarFill.setPosition(ai.sprite.x - 16, ai.sprite.y - 25)
      ai.hpBarFill.setDisplaySize(32 * (ai.stability / ai.maxStability), 5)

      // AI 决策（每 1.5-3 秒刷新目标）
      const interval = 1500 + Math.random() * 1500
      if (now - ai.lastTargetAt > interval) {
        ai.lastTargetAt = now
        const distToPlayer = Phaser.Math.Distance.Between(
          ai.sprite.x, ai.sprite.y, this.player.x, this.player.y,
        )
        if (distToPlayer < 380 && this.playerAlive) {
          // 追击玩家
          ai.targetX = this.player.x + (Math.random() - 0.5) * 80
          ai.targetY = this.player.y + (Math.random() - 0.5) * 80
        } else if (aiInVoid) {
          // 逃向安全圈内
          const ang = Math.atan2(this.VOID_CY - ai.sprite.y, this.VOID_CX - ai.sprite.x)
          ai.targetX = ai.sprite.x + Math.cos(ang) * 320
          ai.targetY = ai.sprite.y + Math.sin(ang) * 320
        } else {
          // 随机游荡
          ai.targetX = ai.sprite.x + (Math.random() - 0.5) * 450
          ai.targetY = ai.sprite.y + (Math.random() - 0.5) * 450
        }
        // 夹紧在地图范围内
        ai.targetX = Phaser.Math.Clamp(ai.targetX, 40, MAP_W - 40)
        ai.targetY = Phaser.Math.Clamp(ai.targetY, 40, MAP_H - 40)
      }

      // 朝目标移动
      const tdx = ai.targetX - ai.sprite.x
      const tdy = ai.targetY - ai.sprite.y
      const d = Math.sqrt(tdx * tdx + tdy * tdy)
      if (d > 8) {
        ai.sprite.setVelocity((tdx / d) * ai.speed, (tdy / d) * ai.speed)
      }
    })
  }
}
