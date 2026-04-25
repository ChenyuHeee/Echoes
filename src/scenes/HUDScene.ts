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

    this.add.image(170, 52, 'ui_hud_box').setScrollFactor(0)
    this.add.image(width - 180, 34, 'ui_hud_box').setDisplaySize(340, 52).setScrollFactor(0)

    this.hudText = this.add.text(16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e8f2ff',
    })

    this.hintText = this.add.text(width - 16, 12, 'WASD移动 鼠标瞄准 左键射击 1/2/3技能 E撤离', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#9fbdde',
    }).setOrigin(1, 0)

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
