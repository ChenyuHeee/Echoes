import Phaser from 'phaser'
import { getRuntimeState } from '../state/gameState'
import { audioManager } from '../systems/AudioManager'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const { width, height } = this.scale
    const rt = getRuntimeState()
    audioManager.startMenuBgm()

    this.cameras.main.setBackgroundColor('#080d18')
    this.add.image(width / 2, height / 2, 'bg_menu').setDisplaySize(width, height).setAlpha(0.96)
    this.add.image(width / 2, height * 0.79, 'bg_menu_hero').setScale(2.4).setAlpha(0.92)
    this.add.image(width / 2, height * 0.11, 'title_sigil').setScale(0.9).setAlpha(0.65)

    const title = this.add.text(width / 2, height * 0.24, '回响：破碎时间', {
      fontFamily: 'monospace',
      fontSize: '44px',
      color: '#c8a96e',
    }).setOrigin(0.5)

    this.tweens.add({
      targets: title,
      y: title.y - 8,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    this.add.text(width / 2, height * 0.34, 'ECHOES: FRACTURED TIME', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#6d86ac',
      letterSpacing: 3,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.45, `当前回响体: ${rt.player.username}`, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#dbebff',
    }).setOrigin(0.5)

    this.makeButton(width / 2, height * 0.58, '进入登录与房间大厅', () => {
      this.scene.start('LoginScene')
    })

    this.makeButton(width / 2, height * 0.68, '离线快速深潜（练习）', () => {
      this.scene.start('DiveScene', { offline: true })
      this.scene.launch('HUDScene')
    })

    this.makeButton(width / 2, height * 0.78, '进入回响庇护所', () => {
      this.scene.start('SanctuaryScene')
    })
  }

  private makeButton(x: number, y: number, text: string, onClick: () => void) {
    const bg = this.add.image(x, y, 'ui_button_long')
    const label = this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#e9f3ff',
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setTint(0xbfdfff))
    bg.on('pointerout', () => bg.clearTint())
    bg.on('pointerdown', onClick)

    return { bg, label }
  }
}
