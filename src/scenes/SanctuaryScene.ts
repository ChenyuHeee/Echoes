import Phaser from 'phaser'
import { SANCTUARY_LINES } from '../config/lore'
import { addTimeSand, getRuntimeState } from '../state/gameState'

export class SanctuaryScene extends Phaser.Scene {
  private tipText!: Phaser.GameObjects.Text

  constructor() {
    super('SanctuaryScene')
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#11111f')
    this.add.image(width / 2, height / 2, 'bg_sanctuary').setDisplaySize(width, height).setAlpha(0.96)
    this.add.image(width / 2, height * 0.52, 'bg_sanctuary_hero').setScale(3.05).setAlpha(0.9)
    this.add.image(width / 2, height * 0.54, 'ui_panel_wide').setScale(1.08, 1.22).setAlpha(0.78)

    this.add.text(width / 2, height * 0.14, '回响庇护所', {
      fontFamily: 'monospace',
      fontSize: '38px',
      color: '#7ce0bc',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.22, '时间静止区：经营、恢复、阅读世界残响', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#a6bddc',
    }).setOrigin(0.5)

    const dialogue = SANCTUARY_LINES.map((line) => `${line.speaker}: ${line.text}`).join('\n')
    this.add.text(width / 2 - 340, height * 0.39, dialogue, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#deebff',
      wordWrap: { width: 680 },
      lineSpacing: 6,
    })

    this.tipText = this.add.text(width / 2, height * 0.72, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#f6f2cc',
    }).setOrigin(0.5)

    this.add.text(width * 0.22, height * 0.84, '温室、主控台与回响档案已同步恢复。', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#a6bddc',
    }).setOrigin(0, 0.5)

    this.makeButton(width / 2 - 140, height * 0.82, '收取温室时砂 +20', () => {
      addTimeSand(20)
      const sand = getRuntimeState().player.timeSand
      this.tipText.setText(`已收取，当前时砂：${sand}`)
    })

    this.makeButton(width / 2 + 140, height * 0.82, '前往深潜大厅', () => {
      this.scene.start('LobbyScene')
    })

    this.makeButton(width / 2, height * 0.9, '返回主菜单', () => {
      this.scene.start('MenuScene')
    })
  }

  private makeButton(x: number, y: number, text: string, onClick: () => void) {
    const bg = this.add.image(x, y, 'ui_button_medium').setDisplaySize(240, 44)
    this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#eef6ff',
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setTint(0xbfdfff))
    bg.on('pointerout', () => bg.clearTint())
    bg.on('pointerdown', onClick)
  }
}
