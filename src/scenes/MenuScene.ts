import Phaser from 'phaser'
import { getRuntimeState } from '../state/gameState'
import { getCurrentUser } from '../lib/supabase'
import { audioManager } from '../systems/AudioManager'
import { showSettingsPanel, showAboutPanel } from '../systems/SettingsManager'

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
      fontFamily: '"Silkscreen", monospace',
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
      fontFamily: '"Silkscreen", monospace',
      fontSize: '14px',
      color: '#6d86ac',
      letterSpacing: 3,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.45, `当前回响体: ${rt.player.username}`, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '18px',
      color: '#dbebff',
    }).setOrigin(0.5)

    // 异步检查登录状态，动态显示"进入房间大厅"或"登录/注册"
    const onlineBtn = this.makeButton(width / 2, height * 0.58, '读取中...', () => {})
    void getCurrentUser().then(user => {
      if (user) {
        onlineBtn.label.setText('选择游戏模式')
        onlineBtn.bg.removeAllListeners('pointerdown')
        onlineBtn.bg.on('pointerdown', () => {
          audioManager.playClick()
          this.scene.start('ModeSelectScene')
        })
      } else {
        onlineBtn.label.setText('登录 / 注册')
        onlineBtn.bg.removeAllListeners('pointerdown')
        onlineBtn.bg.on('pointerdown', () => {
          audioManager.playClick()
          this.scene.start('LoginScene')
        })
      }
    })

    this.makeButton(width / 2, height * 0.68, '进入回响庇护所', () => {
      audioManager.playClick()
      this.scene.start('SanctuaryScene')
    })

    // 右上角设置图标
    const gearTxt = this.add.text(width - 14, 14, '⚙', {
      fontFamily: '"Silkscreen", monospace', fontSize: '20px', color: '#304050',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
    gearTxt.on('pointerover', () => gearTxt.setColor('#9ab0c8'))
    gearTxt.on('pointerout', () => gearTxt.setColor('#304050'))
    gearTxt.on('pointerdown', () => {
      audioManager.playClick()
      showSettingsPanel({ onLogout: () => { this.scene.start('LoginScene') } })
    })

    // 左下角关于按钮
    const aboutTxt = this.add.text(14, height - 10, '关于', {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#2a3a4a',
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true })
    aboutTxt.on('pointerover', () => aboutTxt.setColor('#4a6a8a'))
    aboutTxt.on('pointerout', () => aboutTxt.setColor('#2a3a4a'))
    aboutTxt.on('pointerdown', () => { audioManager.playClick(); showAboutPanel() })
  }

  private makeButton(x: number, y: number, text: string, onClick: () => void) {
    const bg = this.add.image(x, y, 'ui_button_long')
    const label = this.add.text(x, y, text, {
      fontFamily: '"Silkscreen", monospace',
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
