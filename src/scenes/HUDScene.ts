import Phaser from 'phaser'
import { getRuntimeState } from '../state/gameState'

interface HudPayload {
  hp: number
  maxHp: number
  stability: number
  maxStability: number
  timeSand: number
  roomCode?: string
  echoSkill?: string
  hint?: string
}

export class HUDScene extends Phaser.Scene {
  private hudText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text

  constructor() {
    super('HUDScene')
  }

  create() {
    const rt = getRuntimeState()
    const { width } = this.scale

    // 左侧状态面板（HP / 稳定度 / 时砂 / 房间 / 回响技能）
    // 背景矩形：左上角 (0,0)，宽 330，高 76
    this.add.rectangle(165, 38, 330, 76, 0x05060f, 0.82).setScrollFactor(0).setDepth(9)
    this.add.rectangle(165, 76, 330, 1, 0x7cceff, 0.35).setScrollFactor(0).setDepth(9)   // 底边线
    this.add.rectangle(330, 38, 1, 76, 0x7cceff, 0.2).setScrollFactor(0).setDepth(9)     // 右边线

    // 右侧提示面板
    this.add.rectangle(width - 200, 18, 394, 32, 0x05060f, 0.78).setScrollFactor(0).setDepth(9)
    this.add.rectangle(width - 200, 34, 394, 1, 0x7cceff, 0.25).setScrollFactor(0).setDepth(9)

    this.hudText = this.add.text(10, 6, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e8f2ff',
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(10)

    this.hintText = this.add.text(width - 8, 6, 'WASD移动  鼠标瞄准  左键射击  1/2/3技能  E撤离', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#9fbdde',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(10)

    this.updateHud({
      hp: rt.player.hp,
      maxHp: rt.player.maxHp,
      stability: rt.player.stability,
      maxStability: rt.player.maxStability,
      timeSand: rt.player.timeSand,
      roomCode: rt.room?.code,
    })

    this.game.events.on('hud:update', this.updateHud, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this)
  }

  shutdown() {
    this.game.events.off('hud:update', this.updateHud, this)
  }

  private updateHud(payload: HudPayload) {
    if (!this.hudText?.active || !this.hintText?.active) {
      return
    }

    const room = payload.roomCode || 'OFFLINE'
    this.hudText.setText(
      `HP ${Math.ceil(payload.hp)}/${payload.maxHp}  |  稳定度 ${Math.ceil(payload.stability)}/${payload.maxStability}\n` +
      `时砂 ${Math.floor(payload.timeSand)}  |  房间 ${room}\n` +
      `当前回响：${payload.echoSkill || '无'}`
    )

    if (payload.hint) {
      this.hintText.setText(payload.hint)
    }
  }
}
