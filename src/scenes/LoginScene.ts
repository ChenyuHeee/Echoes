import Phaser from 'phaser'
import { getCurrentUser, signIn, signUp } from '../lib/supabase'
import { setPlayerIdentity } from '../state/gameState'

export class LoginScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text

  constructor() {
    super('LoginScene')
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0b1122')
    this.add.image(width / 2, height / 2, 'bg_login').setDisplaySize(width, height).setAlpha(0.95)
    this.add.image(width * 0.5, height * 0.78, 'bg_login_hero').setScale(2.5).setAlpha(0.9)
    this.add.image(width * 0.16, height * 0.18, 'title_sigil').setScale(0.92).setAlpha(0.72)
    this.add.image(width / 2, height * 0.55, 'ui_panel_wide').setScale(1.05, 1.28).setAlpha(0.82)

    this.add.text(width / 2, height * 0.18, '认证终端', {
      fontFamily: 'monospace',
      fontSize: '38px',
      color: '#c8a96e',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.3, '使用 Supabase 账号进入在线模式', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#8ca3c9',
    }).setOrigin(0.5)

    this.statusText = this.add.text(width / 2, height * 0.38, '状态：未登录', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#dbe8ff',
      align: 'center',
    }).setOrigin(0.5)

    this.makeButton(width / 2, height * 0.52, '登录', async () => {
      const email = window.prompt('邮箱：')
      if (!email) return
      const password = window.prompt('密码：')
      if (!password) return
      await this.trySignIn(email, password)
    })

    this.makeButton(width / 2, height * 0.62, '注册', async () => {
      const username = window.prompt('昵称：')
      if (!username) return
      const email = window.prompt('邮箱：')
      if (!email) return
      const password = window.prompt('密码（至少6位）：')
      if (!password) return
      await this.trySignUp(email, password, username)
    })

    this.makeButton(width / 2, height * 0.72, '游客模式（仅本地）', () => {
      this.scene.start('LobbyScene', { guest: true })
    })

    this.makeButton(width / 2, height * 0.82, '返回主菜单', () => {
      this.scene.start('MenuScene')
    })

    this.add.text(width * 0.21, height * 0.84, '终端已接入庇护所边缘网络', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#8ca3c9',
    }).setOrigin(0, 0.5)

    this.refreshUser()
  }

  private async refreshUser() {
    const user = await getCurrentUser()
    if (user) {
      const username = (user.user_metadata?.username as string) || user.email || user.id.slice(0, 8)
      setPlayerIdentity(user.id, username)
      this.statusText.setText(`状态：已登录 ${username}`)
    }
  }

  private async trySignIn(email: string, password: string) {
    this.statusText.setText('状态：登录中...')
    const { data, error } = await signIn(email, password)
    if (error || !data.user) {
      this.statusText.setText(`状态：登录失败 ${error?.message || '未知错误'}`)
      return
    }
    const username = (data.user.user_metadata?.username as string) || data.user.email || data.user.id.slice(0, 8)
    setPlayerIdentity(data.user.id, username)
    this.statusText.setText(`状态：登录成功 ${username}`)
    this.time.delayedCall(500, () => this.scene.start('LobbyScene'))
  }

  private async trySignUp(email: string, password: string, username: string) {
    this.statusText.setText('状态：注册中...')
    const { data, error } = await signUp(email, password, username)
    if (error || !data.user) {
      this.statusText.setText(`状态：注册失败 ${error?.message || '未知错误'}`)
      return
    }
    setPlayerIdentity(data.user.id, username)
    this.statusText.setText('状态：注册成功，请检查邮箱激活后登录')
  }

  private makeButton(x: number, y: number, text: string, onClick: () => void | Promise<void>) {
    const bg = this.add.image(x, y, 'ui_button_medium')
    this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#e9f3ff',
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setTint(0xbfdfff))
    bg.on('pointerout', () => bg.clearTint())
    bg.on('pointerdown', () => {
      void onClick()
    })
  }
}
