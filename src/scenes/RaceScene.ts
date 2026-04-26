/**
 * RaceScene — 时隙穿越（竞速模式）
 * 
 * 玩法：驾驭超空间赛道，躲避障碍
 * 模式：
 *   - sprint   冲刺：30 秒内拼远距（远超初始加速）
 *   - marathon 马拉松：到达 5000m 胜利
 *   - endless  无限：仅坠毁才结束
 * 操作：W/S 或 ↑/↓上下移动
 *       [1] 瞬移闪避（0.7s 无敌，冷却 3.5s）
 *       [2] 回响清场（摧毁 180px 内障碍，冷却 5s）
 */
import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand } from '../state/gameState'

type RaceMode = 'sprint' | 'marathon' | 'endless'

export class RaceScene extends Phaser.Scene {
  private mode: RaceMode = 'endless'
  private timeLimitMs = 0      // sprint 模式计时
  private targetDistance = 0   // marathon 模式目标
  private startTime = 0
  private timerText!: Phaser.GameObjects.Text
  private goalText!: Phaser.GameObjects.Text
  private powerUps!: Phaser.Physics.Arcade.Group
  private dodgeCombo = 0       // 连续躲避计数
  private comboText!: Phaser.GameObjects.Text
  private milestones = new Set<number>()  // 已领取里程碑
  private slowUntil = 0        // 减速环境到期时间
  private shieldHits = 0       // 障碍护盾可抵消次数
  private player!: Phaser.Physics.Arcade.Image
  private obstacles!: Phaser.Physics.Arcade.Group
  private sands!: Phaser.Physics.Arcade.Group
  private tunnelGfx!: Phaser.GameObjects.Graphics

  private speed = 300       // 当前赛道滚动速度（随距离持续增加，无上限）
  private distance = 0      // 已穿越距离
  private sandCount = 0     // 本局收集时砂
  private alive = false
  private finished = false
  private countdownDone = false
  private bestDistance = 0  // 本局最远距离
  private obstacleTimer: Phaser.Time.TimerEvent | null = null

  private dashCooldown = 0
  private echoCooldown = 0
  private dashActive = false

  private keys!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    curUp: Phaser.Input.Keyboard.Key
    curDown: Phaser.Input.Keyboard.Key
    skill1: Phaser.Input.Keyboard.Key
    skill2: Phaser.Input.Keyboard.Key
  }

  private distText!: Phaser.GameObjects.Text
  private sandText!: Phaser.GameObjects.Text
  private skill1Txt!: Phaser.GameObjects.Text
  private skill2Txt!: Phaser.GameObjects.Text

  constructor() {
    super('RaceScene')
  }

  init(data?: { mode?: RaceMode }) {
    this.mode = data?.mode ?? 'endless'
    this.timeLimitMs = this.mode === 'sprint' ? 30000 : 0
    this.targetDistance = this.mode === 'marathon' ? 5000 : 0
  }

  create() {
    const { width, height } = this.scale
    this.alive = false
    this.finished = false
    this.countdownDone = false
    this.distance = 0
    this.sandCount = 0
    this.speed = 300
    this.dashCooldown = 0
    this.echoCooldown = 0
    this.dashActive = false
    this.bestDistance = 0
    this.obstacleTimer = null
    this.startTime = Date.now()
    this.dodgeCombo = 0
    this.milestones.clear()
    this.slowUntil = 0
    this.shieldHits = 0

    this.cameras.main.setBackgroundColor('#030508')
    audioManager.startMenuBgm()
    this.physics.world.setBounds(0, 44, width, height - 44)

    // 隧道背景（每帧绘制）
    this.tunnelGfx = this.add.graphics().setDepth(0)

    // 物理组
    this.obstacles = this.physics.add.group()
    this.sands = this.physics.add.group()
    this.powerUps = this.physics.add.group()

    // 玩家（左侧固定，仅上下移动）
    this.player = this.physics.add.image(140, height / 2, 'player_idle')
    this.player.setScale(2.2).setDepth(15)
    this.player.setCollideWorldBounds(true)
    this.player.setMaxVelocity(0, 300)
    this.player.setDrag(0, 1400)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.allowGravity = false

    // 碰撞：撞到障碍 = 坠毁（护盾可抵消一次）
    this.physics.add.overlap(this.player, this.obstacles, (_, o) => {
      if (this.dashActive || !this.alive || this.finished) return
      const obs = o as Phaser.Physics.Arcade.Image
      if (!obs.active) return
      if (this.shieldHits > 0) {
        this.shieldHits--
        obs.destroy()
        const ring = this.add.image(this.player.x, this.player.y, 'effect_echo_ring').setScale(0.6).setTint(0xa0c0ff).setDepth(20)
        this.tweens.add({ targets: ring, alpha: 0, scaleX: 2.6, scaleY: 2.6, duration: 350, onComplete: () => ring.destroy() })
        this.cameras.main.shake(140, 0.008)
        this.dodgeCombo = 0
        return
      }
      this.onCrash()
    })

    // 拾取：道具
    this.physics.add.overlap(this.player, this.powerUps, (_, p) => {
      const pickup = p as Phaser.Physics.Arcade.Image
      if (!pickup.active) return
      const kind = pickup.getData('kind') as string
      pickup.destroy()
      this.applyPowerUp(kind)
    })

    // 拾取：收集时砂
    this.physics.add.overlap(this.player, this.sands, (_, s) => {
      if (!this.alive) return
      const p = s as Phaser.Physics.Arcade.Image
      if (!p.active) return
      p.destroy()
      let gain = 12 + Math.floor(Math.random() * 10)
      // 连击 ×2 加成
      if (this.dodgeCombo >= 3) gain *= 2
      this.sandCount += gain
      addTimeSand(gain)
      this.sandText.setText(`时砂 +${this.sandCount}`)
    })

    // 输入
    const kb = this.input.keyboard!
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      curUp: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      curDown: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      skill1: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      skill2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
    }

    // 定期生成障碍和时砂（障碍间隔会随速度缩短）
    this.obstacleTimer = this.time.addEvent({ delay: 1050, callback: this.spawnObstacle, callbackScope: this, loop: true })
    this.time.addEvent({ delay: 1650, callback: this.spawnSandPickup, callbackScope: this, loop: true })
    // 道具刷新：每 7-9s
    this.time.addEvent({ delay: 8000, callback: this.spawnRandomPowerUp, callbackScope: this, loop: true })

    // HUD
    this.add.rectangle(width / 2, 18, width, 36, 0x030508, 0.94).setDepth(20)
    this.distText = this.add.text(14, 8, '距离   0 m', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#c060ff',
    }).setDepth(21)
    this.sandText = this.add.text(260, 8, '时砂 +0', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#c8e060',
    }).setDepth(21)
    this.add.text(width / 2, 8, '时隙穿越', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#c060ff',
    }).setOrigin(0.5, 0).setDepth(21)
    this.skill1Txt = this.add.text(width - 190, 8, '[1] 瞬移  CD:就绪', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#507060',
    }).setDepth(21)
    this.skill2Txt = this.add.text(width - 90, 8, '[2] 回响  就绪', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#507060',
    }).setDepth(21)

    // 模式 / 目标 / 倒计时
    const modeLabel = this.mode === 'sprint' ? '冲刺 30s' : this.mode === 'marathon' ? '马拉松 5000m' : '无限模式'
    this.goalText = this.add.text(width / 2, 26, modeLabel, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#7050a0',
    }).setOrigin(0.5, 0).setDepth(21)
    this.timerText = this.add.text(width - 14, 26, '', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#a060ff',
    }).setOrigin(1, 0).setDepth(21)

    // 连击提示
    this.comboText = this.add.text(140, 50, '', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#ffd060',
    }).setOrigin(0.5).setDepth(21)

    const backTxt = this.add.text(14, height - 12, '← 返回大厅', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#304050',
    }).setOrigin(0, 1).setDepth(21)
    backTxt.setInteractive({ useHandCursor: true })
    backTxt.on('pointerover', () => backTxt.setColor('#608090'))
    backTxt.on('pointerout', () => backTxt.setColor('#304050'))
    backTxt.on('pointerdown', () => this.scene.start('ModeSelectScene'))

    // 倒计时
    this.showCountdown()
  }

  private showCountdown() {
    const { width, height } = this.scale
    const labels = ['3', '2', '1', '穿越！']
    let idx = 0
    const next = () => {
      const t = this.add.text(width / 2, height / 2, labels[idx], {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '80px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(60)
      this.tweens.add({
        targets: t, alpha: 0, scaleX: 2.2, scaleY: 2.2,
        duration: 900, onComplete: () => t.destroy(),
      })
      idx++
      if (idx < labels.length) {
        this.time.delayedCall(900, next)
      } else {
        this.alive = true
        this.countdownDone = true
      }
    }
    next()
  }

  private spawnObstacle() {
    if (!this.alive) return
    const { width, height } = this.scale
    const y = 72 + Math.random() * (height - 144)
    const big = Math.random() < 0.25
    const sprites = ['enemy_drone', 'enemy_basic', 'prop_crate_steel', 'enemy_heavy']
    const key = big ? 'enemy_heavy' : sprites[Math.floor(Math.random() * sprites.length)]
    const obs = this.physics.add.image(width + 45, y, key)
    obs.setScale(big ? 2.4 : 1.8).setTint(0x6820c8).setDepth(10)
    const body = obs.body as Phaser.Physics.Arcade.Body
    body.setVelocityX(-(this.speed + 60))
    body.setImmovable(true)
    body.allowGravity = false
    this.obstacles.add(obs)
    // 似乎近身过去（躲避）时增加连击
    obs.setData('counted', false)
    this.time.delayedCall(5500, () => { if (obs.active) obs.destroy() })
  }

  private static readonly RACE_POWER_KINDS = [
    { kind: 'shield', tint: 0xa0c0ff, label: '护盾' },
    { kind: 'slow',   tint: 0x60ffe0, label: '减速场' },
    { kind: 'charge', tint: 0xffd060, label: '技能充能' },
    { kind: 'mega',   tint: 0xffe060, label: '庞大时砂' },
  ]

  private spawnRandomPowerUp() {
    if (!this.alive) return
    const { width, height } = this.scale
    const def = RaceScene.RACE_POWER_KINDS[Math.floor(Math.random() * RaceScene.RACE_POWER_KINDS.length)]
    const y = 70 + Math.random() * (height - 140)
    const p = this.physics.add.image(width + 24, y, 'effect_echo_ring').setScale(0.65).setDepth(9)
    p.setTint(def.tint)
    p.setData('kind', def.kind)
    const body = p.body as Phaser.Physics.Arcade.Body
    body.setVelocityX(-this.speed)
    body.allowGravity = false
    this.powerUps.add(p)
    this.tweens.add({ targets: p, scaleX: 0.8, scaleY: 0.8, duration: 600, yoyo: true, repeat: -1 })
    this.tweens.add({ targets: p, angle: 360, duration: 3500, repeat: -1 })
    const lbl = this.add.text(p.x, p.y - 22, def.label, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#' + def.tint.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setDepth(10)
    p.setData('label', lbl)
    p.on('destroy', () => lbl.destroy())
    this.time.delayedCall(6500, () => { if (p.active) p.destroy() })
  }

  private applyPowerUp(kind: string) {
    const { width } = this.scale
    let msg = '', color = '#ffffff'
    switch (kind) {
      case 'shield':
        this.shieldHits = Math.min(3, this.shieldHits + 1)
        msg = `✦ 护盾 ×${this.shieldHits}`; color = '#a0c0ff'
        break
      case 'slow':
        this.slowUntil = this.time.now + 5000
        msg = '✱ 减速场 — 赛道减速 35%'; color = '#60ffe0'
        break
      case 'charge':
        // 重置两个技能 CD
        this.dashCooldown = 0
        this.echoCooldown = 0
        msg = '⚡ 技能充能 — 两技重置'; color = '#ffd060'
        break
      case 'mega': {
        const gain = 80
        this.sandCount += gain
        addTimeSand(gain)
        this.sandText.setText(`时砂 +${this.sandCount}`)
        msg = `★ 庞大时砂 +${gain}`; color = '#ffe060'
        break
      }
    }
    audioManager.playPickup()
    const t = this.add.text(width / 2, 80, msg, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color,
    }).setOrigin(0.5).setDepth(72)
    this.tweens.add({ targets: t, alpha: 0, y: 60, duration: 1500, delay: 400, onComplete: () => t.destroy() })
  }

  private spawnSandPickup() {
    if (!this.alive) return
    const { width, height } = this.scale
    const y = 58 + Math.random() * (height - 116)
    const p = this.physics.add.image(width + 24, y, 'pickup').setScale(1.4).setDepth(9)
    const body = p.body as Phaser.Physics.Arcade.Body
    body.setVelocityX(-this.speed)
    body.allowGravity = false
    this.sands.add(p)
    this.tweens.add({ targets: p, y: p.y - 12, duration: 750, yoyo: true, repeat: -1 })
    this.time.delayedCall(5500, () => { if (p.active) p.destroy() })
  }

  private onCrash() {
    this.alive = false
    this.cameras.main.shake(300, 0.018)
    this.player.setTint(0xff3030)
    // 爆炸特效
    const ring = this.add.image(this.player.x, this.player.y, 'effect_echo_ring')
      .setScale(0.6).setTint(0xff6030).setDepth(20)
    this.tweens.add({ targets: ring, alpha: 0, scaleX: 3, scaleY: 3, duration: 500, onComplete: () => ring.destroy() })
    this.time.delayedCall(700, () => this.showResult(false))
  }

  private showResult(success: boolean) {
    if (this.finished) return
    this.finished = true
    const { width, height } = this.scale
    const bg = this.add.rectangle(width / 2, height / 2, 490, 240, 0x040810, 0.97).setDepth(70)
    bg.setStrokeStyle(2, 0xff4040)
    this.add.text(width / 2, height / 2 - 84, '时隙崩解', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '28px', color: '#ff5030',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 - 44, `穿越距离　${Math.floor(this.distance)} m`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '18px', color: '#c060ff',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 - 14, `最高速度　${Math.floor(this.speed)} px/s`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#506070',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 + 14, `收集时砂　${this.sandCount}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '16px', color: '#c8e060',
    }).setOrigin(0.5).setDepth(71)

    const retry = this.add.text(width / 2 - 92, height / 2 + 82, '[ 再次挑战 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#c060ff',
    }).setOrigin(0.5).setDepth(71)
    retry.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.restart() })

    const back = this.add.text(width / 2 + 92, height / 2 + 82, '[ 返回大厅 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#607080',
    }).setOrigin(0.5).setDepth(71)
    back.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }

  update(time: number, delta: number) {
    const dt = delta / 1000
    this.drawTunnel(time)

    // 更新技能 CD 显示
    const cd1 = Math.max(0, (this.dashCooldown - time) / 1000)
    const cd2 = Math.max(0, (this.echoCooldown - time) / 1000)
    this.skill1Txt.setText(cd1 > 0 ? `[1] 瞬移  ${cd1.toFixed(1)}s` : '[1] 瞬移  就绪').setColor(cd1 > 0 ? '#506070' : '#60ffb0')
    this.skill2Txt.setText(cd2 > 0 ? `[2] 回响  ${cd2.toFixed(1)}s` : '[2] 回响  就绪').setColor(cd2 > 0 ? '#506070' : '#a060ff')

    if (!this.alive || !this.countdownDone) return

    // 上下移动
    const vy = (this.keys.up.isDown || this.keys.curUp.isDown) ? -290
             : (this.keys.down.isDown || this.keys.curDown.isDown) ? 290 : 0
    this.player.setVelocityY(vy)

    // 技能1：瞬移闪避（无敌帧）
    if (Phaser.Input.Keyboard.JustDown(this.keys.skill1) && time > this.dashCooldown) {
      this.dashCooldown = time + 3500
      this.dashActive = true
      this.player.setTint(0x40ffff).setAlpha(0.55)
      this.time.delayedCall(700, () => {
        this.dashActive = false
        this.player.clearTint().setAlpha(1)
      })
    }

    // 技能2：回响清场（摧毁附近障碍）
    if (Phaser.Input.Keyboard.JustDown(this.keys.skill2) && time > this.echoCooldown) {
      this.echoCooldown = time + 5000
      this.obstacles.children.each(obs => {
        const o = obs as Phaser.Physics.Arcade.Image
        if (!o.active) return true
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, o.x, o.y) < 190) {
          const ring = this.add.image(o.x, o.y, 'effect_echo_ring').setScale(0.8).setTint(0xa040ff).setDepth(20)
          this.tweens.add({
            targets: ring, alpha: 0, scaleX: 2.8, scaleY: 2.8,
            duration: 380, onComplete: () => ring.destroy(),
          })
          o.destroy()
        }
        return true
      })
      // 回响特效（以玩家为中心）
      const ring2 = this.add.image(this.player.x, this.player.y, 'effect_echo_ring').setScale(0.5).setTint(0xc060ff).setDepth(20)
      this.tweens.add({ targets: ring2, alpha: 0, scaleX: 3.5, scaleY: 3.5, duration: 450, onComplete: () => ring2.destroy() })
    }

    // 推进距离与加速（减速场期间临时降速）
    const slowMul = this.time.now < this.slowUntil ? 0.65 : 1
    this.distance += this.speed * slowMul * dt
    this.speed = 300 + this.distance * 0.18   // 比原来更陡的加速曲线
    this.distText.setText(`距离   ${Math.floor(this.distance)} m`)

    // 连击计数：差身而过未撞上的障碍
    this.obstacles.children.each(obs => {
      const o = obs as Phaser.Physics.Arcade.Image
      if (!o.active) return true
      if (!o.getData('counted') && o.x < this.player.x - 20) {
        o.setData('counted', true)
        this.dodgeCombo++
        if (this.dodgeCombo >= 3) {
          this.comboText.setText(`连避 ×${this.dodgeCombo}！时砂×2`)
          this.comboText.setAlpha(1)
          this.tweens.killTweensOf(this.comboText)
          this.tweens.add({ targets: this.comboText, alpha: 0, duration: 1200, delay: 800 })
        }
      }
      return true
    })

    // 里程碑奖励：每 500m
    const milestone = Math.floor(this.distance / 500)
    if (milestone > 0 && !this.milestones.has(milestone)) {
      this.milestones.add(milestone)
      const bonus = 30 + milestone * 10
      this.sandCount += bonus
      addTimeSand(bonus)
      this.sandText.setText(`时砂 +${this.sandCount}`)
      // 赠送一次护盾 + 技能充能
      this.shieldHits = Math.min(3, this.shieldHits + 1)
      this.dashCooldown = Math.min(this.dashCooldown, time + 500)
      this.echoCooldown = Math.min(this.echoCooldown, time + 500)
      const { width } = this.scale
      const milestoneText = this.add.text(width / 2, 100, `⚭ ${milestone * 500}m 里程碑！+${bonus} 时砂 / +1 护盾 / 技能加速`, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#ffe080',
      }).setOrigin(0.5).setDepth(72)
      this.tweens.add({ targets: milestoneText, alpha: 0, y: 76, duration: 2200, delay: 800, onComplete: () => milestoneText.destroy() })
    }

    // 障碍生成间隔随速度缩短（最短 320ms）
    if (this.obstacleTimer) {
      const targetDelay = Math.max(320, 1050 - (this.speed - 300) * 0.6)
      if (Math.abs(this.obstacleTimer.delay - targetDelay) > 60) {
        this.obstacleTimer.remove()
        this.obstacleTimer = this.time.addEvent({ delay: targetDelay, callback: this.spawnObstacle, callbackScope: this, loop: true })
      }
    }

    // 同步障碍速度
    this.obstacles.children.each(obs => {
      const o = obs as Phaser.Physics.Arcade.Image
      if (!o.active) return true
      const b = o.body as Phaser.Physics.Arcade.Body
      b.setVelocityX(-(this.speed + 60) * slowMul)
      return true
    })
    this.sands.children.each(s => {
      const sd = s as Phaser.Physics.Arcade.Image
      if (!sd.active) return true
      const b = sd.body as Phaser.Physics.Arcade.Body
      b.setVelocityX(-this.speed * slowMul)
      return true
    })
    this.powerUps.children.each(s => {
      const sd = s as Phaser.Physics.Arcade.Image
      if (!sd.active) return true
      const b = sd.body as Phaser.Physics.Arcade.Body
      b.setVelocityX(-this.speed * slowMul)
      const lbl = sd.getData('label') as Phaser.GameObjects.Text | undefined
      if (lbl) { lbl.x = sd.x; lbl.y = sd.y - 22 }
      return true
    })

    // 模式胜负判定 + 计时器 UI
    const elapsed = (Date.now() - this.startTime) / 1000
    if (this.mode === 'sprint') {
      const remain = Math.max(0, 30 - elapsed)
      this.timerText.setText(`剩余 ${remain.toFixed(1)}s`)
      if (remain <= 0 && !this.finished) {
        this.alive = false
        this.time.delayedCall(200, () => this.showVictory())
      }
    } else if (this.mode === 'marathon') {
      const left = Math.max(0, this.targetDistance - this.distance)
      this.timerText.setText(`剩余 ${Math.ceil(left)}m`)
      if (left <= 0 && !this.finished) {
        this.alive = false
        this.time.delayedCall(200, () => this.showVictory())
      }
    } else {
      this.timerText.setText(`${elapsed.toFixed(1)}s`)
    }
  }

  private showVictory() {
    if (this.finished) return
    this.finished = true
    const { width, height } = this.scale
    const bg = this.add.rectangle(width / 2, height / 2, 490, 240, 0x040810, 0.97).setDepth(70)
    bg.setStrokeStyle(2, 0x40ff80)
    const title = this.mode === 'sprint' ? '★ 冲刺达成' : '★ 马拉松完赛'
    this.add.text(width / 2, height / 2 - 84, title, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '26px', color: '#40ff80',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 - 44, `穿越距离　${Math.floor(this.distance)} m`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '18px', color: '#c060ff',
    }).setOrigin(0.5).setDepth(71)
    const elapsed = (Date.now() - this.startTime) / 1000
    this.add.text(width / 2, height / 2 - 14, `耗时　${elapsed.toFixed(1)} s`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#506070',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 + 14, `收集时砂　${this.sandCount}（胜利加成 ×2）`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '16px', color: '#c8e060',
    }).setOrigin(0.5).setDepth(71)
    // 胜利额外奖励
    addTimeSand(this.sandCount)
    const retry = this.add.text(width / 2 - 92, height / 2 + 82, '[ 再来一局 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#40ff80',
    }).setOrigin(0.5).setDepth(71)
    retry.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.restart({ mode: this.mode }) })
    const back = this.add.text(width / 2 + 92, height / 2 + 82, '[ 返回大厅 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#607080',
    }).setOrigin(0.5).setDepth(71)
    back.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }

  /** 时隙隧道视觉效果：彩色光线 + 边缘暗影 */
  private drawTunnel(time: number) {
    const { width, height } = this.scale
    this.tunnelGfx.clear()

    // 彩色流光线条（模拟超空间感）
    for (let i = 0; i < 55; i++) {
      const t = ((time * 0.00065 + i * 0.13) % 1)
      const x = t * width
      const y = 44 + ((i * 41 + Math.sin(time * 0.0008 + i * 0.7) * 24) % (height - 88))
      const len = 18 + t * 70
      const hue = (i * 0.038 + time * 0.00004) % 1
      const c = Phaser.Display.Color.HSVToRGB(hue, 0.75, 0.85) as { r: number; g: number; b: number }
      const cNum = Phaser.Display.Color.GetColor(c.r, c.g, c.b)
      this.tunnelGfx.lineStyle(1.4, cNum, 0.14 + t * 0.28)
      this.tunnelGfx.beginPath()
      this.tunnelGfx.moveTo(x, y)
      this.tunnelGfx.lineTo(x + len, y)
      this.tunnelGfx.strokePath()
    }

    // 上下边缘暗影（给玩家视觉边界感）
    this.tunnelGfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.75, 0.75, 0, 0)
    this.tunnelGfx.fillRect(0, 38, width, 32)
    this.tunnelGfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.75, 0.75)
    this.tunnelGfx.fillRect(0, height - 70, width, 32)
  }
}
