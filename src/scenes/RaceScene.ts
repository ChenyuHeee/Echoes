/**
 * RaceScene — 时隙穿越（竞速模式）
 * 
 * 玩法：驾驭超空间赛道，在 3000m 内躲避时间碎片残骸
 * 操作：W/S 或 ↑/↓ 上下移动
 *       [1] 瞬移闪避（0.7s 无敌，冷却 3.5s）
 *       [2] 回响清场（摧毁 180px 内障碍，冷却 5s）
 */
import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand } from '../state/gameState'

export class RaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image
  private obstacles!: Phaser.Physics.Arcade.Group
  private sands!: Phaser.Physics.Arcade.Group
  private tunnelGfx!: Phaser.GameObjects.Graphics

  private speed = 300       // 当前赛道滚动速度（随距离增加）
  private distance = 0      // 已穿越距离
  private sandCount = 0     // 本局收集时砂
  private alive = false
  private finished = false
  private countdownDone = false

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

    this.cameras.main.setBackgroundColor('#030508')
    audioManager.startMenuBgm()
    this.physics.world.setBounds(0, 44, width, height - 44)

    // 隧道背景（每帧绘制）
    this.tunnelGfx = this.add.graphics().setDepth(0)

    // 物理组
    this.obstacles = this.physics.add.group()
    this.sands = this.physics.add.group()

    // 玩家（左侧固定，仅上下移动）
    this.player = this.physics.add.image(140, height / 2, 'player_idle')
    this.player.setScale(2.2).setDepth(15)
    this.player.setCollideWorldBounds(true)
    this.player.setMaxVelocity(0, 300)
    this.player.setDrag(0, 1400)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.allowGravity = false

    // 碰撞：撞到障碍 = 坠毁
    this.physics.add.overlap(this.player, this.obstacles, () => {
      if (!this.dashActive && this.alive && !this.finished) this.onCrash()
    })

    // 拾取：收集时砂
    this.physics.add.overlap(this.player, this.sands, (_, s) => {
      if (!this.alive) return
      const p = s as Phaser.Physics.Arcade.Image
      if (!p.active) return
      p.destroy()
      const gain = 12 + Math.floor(Math.random() * 10)
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

    // 定期生成障碍和时砂
    this.time.addEvent({ delay: 1050, callback: this.spawnObstacle, callbackScope: this, loop: true })
    this.time.addEvent({ delay: 1650, callback: this.spawnSandPickup, callbackScope: this, loop: true })

    // HUD
    this.add.rectangle(width / 2, 18, width, 36, 0x030508, 0.94).setDepth(20)
    this.distText = this.add.text(14, 8, '距离   0 / 3000m', {
      fontFamily: 'monospace', fontSize: '12px', color: '#c060ff',
    }).setDepth(21)
    this.sandText = this.add.text(260, 8, '时砂 +0', {
      fontFamily: 'monospace', fontSize: '12px', color: '#c8e060',
    }).setDepth(21)
    this.add.text(width / 2, 8, '时隙穿越', {
      fontFamily: 'monospace', fontSize: '14px', color: '#c060ff',
    }).setOrigin(0.5, 0).setDepth(21)
    this.skill1Txt = this.add.text(width - 190, 8, '[1] 瞬移  CD:就绪', {
      fontFamily: 'monospace', fontSize: '10px', color: '#507060',
    }).setDepth(21)
    this.skill2Txt = this.add.text(width - 90, 8, '[2] 回响  就绪', {
      fontFamily: 'monospace', fontSize: '10px', color: '#507060',
    }).setDepth(21)

    const backTxt = this.add.text(14, height - 12, '← 返回大厅', {
      fontFamily: 'monospace', fontSize: '12px', color: '#304050',
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
        fontFamily: 'monospace', fontSize: '80px', color: '#ffffff',
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
    this.time.delayedCall(5500, () => { if (obs.active) obs.destroy() })
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
    const borderColor = success ? 0xc060ff : 0xff4040
    const bg = this.add.rectangle(width / 2, height / 2, 490, 220, 0x040810, 0.97).setDepth(70)
    bg.setStrokeStyle(2, borderColor)
    this.add.text(width / 2, height / 2 - 74, success ? '✦ 时隙穿越完成 ✦' : '时隙崩解', {
      fontFamily: 'monospace', fontSize: '26px',
      color: success ? '#c060ff' : '#ff5030',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 - 36, `穿越距离　${Math.floor(this.distance)} m`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#9090b0',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 - 10, `最高速度　${Math.floor(this.speed)} px/s`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#506070',
    }).setOrigin(0.5).setDepth(71)
    this.add.text(width / 2, height / 2 + 16, `收集时砂　${this.sandCount}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8e060',
    }).setOrigin(0.5).setDepth(71)

    const retry = this.add.text(width / 2 - 92, height / 2 + 72, '[ 再次挑战 ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#c060ff',
    }).setOrigin(0.5).setDepth(71)
    retry.setInteractive({ useHandCursor: true }).on('pointerdown', () => { audioManager.playClick(); this.scene.restart() })

    const back = this.add.text(width / 2 + 92, height / 2 + 72, '[ 返回大厅 ]', {
      fontFamily: 'monospace', fontSize: '15px', color: '#607080',
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

    // 推进距离与加速
    this.distance += this.speed * dt
    this.speed = Math.min(820, 300 + this.distance * 0.115)
    this.distText.setText(`距离   ${Math.floor(this.distance)} / 3000m`)

    // 同步障碍速度
    this.obstacles.children.each(obs => {
      const o = obs as Phaser.Physics.Arcade.Image
      if (!o.active) return true
      const b = o.body as Phaser.Physics.Arcade.Body
      b.setVelocityX(-(this.speed + 60))
      return true
    })
    this.sands.children.each(s => {
      const sd = s as Phaser.Physics.Arcade.Image
      if (!sd.active) return true
      const b = sd.body as Phaser.Physics.Arcade.Body
      b.setVelocityX(-this.speed)
      return true
    })

    // 胜利条件：穿越 3000m
    if (this.distance >= 3000 && !this.finished) {
      this.alive = false
      this.showResult(true)
    }
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
