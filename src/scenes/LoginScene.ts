import Phaser from 'phaser'
import { getCurrentUser, signIn, signUp } from '../lib/supabase'
import { setPlayerIdentity } from '../state/gameState'
import { audioManager } from '../systems/AudioManager'

export class LoginScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text
  private overlay: HTMLDivElement | null = null

  constructor() {
    super('LoginScene')
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0b1122')
    this.add.image(width / 2, height / 2, 'bg_login').setDisplaySize(width, height).setAlpha(0.9)

    // 先显示检查中状态，异步检测登录
    const checkingText = this.add.text(width / 2, height / 2, '正在检查登录状态...', {
      fontFamily: 'monospace', fontSize: '16px', color: '#4a6a8a',
    }).setOrigin(0.5)

    void getCurrentUser().then(user => {
      checkingText.destroy()
      if (user) {
        // 已登录，直接跳转
        const username = (user.user_metadata?.username as string) || user.email || user.id.slice(0, 8)
        setPlayerIdentity(user.id, username)
        audioManager.playTransition()
        this.scene.start('MenuScene')
      } else {
        // 未登录，渲染完整 UI
        this.buildLoginUI()
      }
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeOverlay())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.removeOverlay())
  }

  private buildLoginUI() {
    const { width, height } = this.scale

    this.add.text(width / 2, height * 0.14, '认证终端', {
      fontFamily: 'monospace', fontSize: '36px', color: '#c8a96e',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.26, '使用 Supabase 账号进入在线模式', {
      fontFamily: 'monospace', fontSize: '15px', color: '#6080a0',
    }).setOrigin(0.5)

    this.statusText = this.add.text(width / 2, height * 0.35, '状态：未登录', {
      fontFamily: 'monospace', fontSize: '13px', color: '#dbe8ff', align: 'center',
    }).setOrigin(0.5)

    // 按钮行
    this.makeBtn(width / 2 - 100, height * 0.50, '登录', 180, () => this.showLoginPanel())
    this.makeBtn(width / 2 + 100, height * 0.50, '注册', 180, () => this.showRegisterPanel())
    this.makeBtn(width / 2, height * 0.62, '游客模式（仅本地）', 260, () => {
      audioManager.playClick()
      this.scene.start('MenuScene', { guest: true })
    })
    this.makeBtn(width / 2, height * 0.74, '返回主菜单', 200, () => {
      audioManager.playClick()
      this.scene.start('MenuScene')
    })

    this.add.text(width / 2, height * 0.88, '终端已接入庇护所边缘网络  ·  注册后需邮件激活', {
      fontFamily: 'monospace', fontSize: '11px', color: '#304050',
    }).setOrigin(0.5)
  }

  // ─── HTML 输入覆盖层 ──────────────────────────────────
  private showLoginPanel() {
    audioManager.playClick()
    this.showInputPanel(
      '// 登录',
      [
        { id: 'email', label: '邮箱', type: 'email', placeholder: 'user@example.com' },
        { id: 'password', label: '密码', type: 'password', placeholder: '••••••••' },
      ],
      (values) => {
        void this.trySignIn(values['email'], values['password'])
      },
    )
  }

  private showRegisterPanel() {
    audioManager.playClick()
    this.showInputPanel(
      '// 注册',
      [
        { id: 'username', label: '昵称', type: 'text', placeholder: '你的代号' },
        { id: 'email', label: '邮箱', type: 'email', placeholder: 'user@example.com' },
        { id: 'password', label: '密码（≥6位）', type: 'password', placeholder: '••••••••' },
      ],
      (values) => {
        void this.trySignUp(values['email'], values['password'], values['username'])
      },
    )
  }

  private showInputPanel(
    title: string,
    fields: Array<{ id: string; label: string; type: string; placeholder: string }>,
    onSubmit: (values: Record<string, string>) => void,
  ) {
    this.removeOverlay()

    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(4,6,14,0.92)', 'display:flex', 'align-items:center',
      'justify-content:center', 'z-index:9999', 'font-family:monospace',
    ].join(';')

    const panel = document.createElement('div')
    panel.style.cssText = [
      'background:#0a0d1a', 'border:1px solid #2a4060', 'padding:32px 36px',
      'min-width:340px', 'display:flex', 'flex-direction:column', 'gap:14px',
    ].join(';')

    const titleEl = document.createElement('div')
    titleEl.textContent = title
    titleEl.style.cssText = 'color:#c8a96e;font-size:20px;margin-bottom:6px;letter-spacing:2px'
    panel.appendChild(titleEl)

    const inputs: Record<string, HTMLInputElement> = {}
    for (const f of fields) {
      const label = document.createElement('label')
      label.textContent = f.label
      label.style.cssText = 'color:#4a6a8a;font-size:12px;letter-spacing:1px'
      panel.appendChild(label)

      const inp = document.createElement('input')
      inp.type = f.type
      inp.placeholder = f.placeholder
      inp.style.cssText = [
        'background:#060b16', 'border:1px solid #2a4060', 'color:#c8d8f0',
        'padding:8px 12px', 'font-family:monospace', 'font-size:14px',
        'outline:none', 'width:100%', 'box-sizing:border-box',
      ].join(';')
      inp.addEventListener('focus', () => { inp.style.borderColor = '#4080c0' })
      inp.addEventListener('blur', () => { inp.style.borderColor = '#2a4060' })
      panel.appendChild(inp)
      inputs[f.id] = inp
    }

    // 状态文字
    const statusEl = document.createElement('div')
    statusEl.style.cssText = 'color:#c06060;font-size:12px;min-height:18px'
    panel.appendChild(statusEl)

    // 按钮行
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:4px'

    const submitBtn = document.createElement('button')
    submitBtn.textContent = '确认'
    submitBtn.style.cssText = [
      'flex:1', 'background:#0c1828', 'border:1px solid #4080b0',
      'color:#90c8e8', 'font-family:monospace', 'font-size:14px',
      'padding:10px', 'cursor:pointer',
    ].join(';')
    submitBtn.addEventListener('click', () => {
      // 简单验证
      for (const f of fields) {
        if (!inputs[f.id].value.trim()) {
          statusEl.textContent = `${f.label} 不能为空`
          return
        }
      }
      const vals: Record<string, string> = {}
      for (const f of fields) vals[f.id] = inputs[f.id].value.trim()
      this.removeOverlay()
      onSubmit(vals)
    })

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = '取消'
    cancelBtn.style.cssText = [
      'flex:1', 'background:#0a0e16', 'border:1px solid #2a3a4a',
      'color:#506070', 'font-family:monospace', 'font-size:14px',
      'padding:10px', 'cursor:pointer',
    ].join(';')
    cancelBtn.addEventListener('click', () => this.removeOverlay())

    btnRow.appendChild(submitBtn)
    btnRow.appendChild(cancelBtn)
    panel.appendChild(btnRow)

    overlay.appendChild(panel)
    document.body.appendChild(overlay)
    this.overlay = overlay

    // 第一个输入框自动获焦
    if (fields.length > 0) {
      setTimeout(() => inputs[fields[0].id]?.focus(), 60)
    }

    // Enter 键提交
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBtn.click()
      if (e.key === 'Escape') this.removeOverlay()
    })
  }

  private removeOverlay() {
    if (this.overlay) {
      this.overlay.remove()
      this.overlay = null
    }
  }

  // ─── 刷新当前登录状态 ────────────────────────────────
  private async refreshUser() {
    const user = await getCurrentUser()
    if (user) {
      const username = (user.user_metadata?.username as string) || user.email || user.id.slice(0, 8)
      setPlayerIdentity(user.id, username)
      this.statusText?.setText(`状态：已登录 ${username}`)
    }
  }

  private async trySignIn(email: string, password: string) {
    this.statusText.setText('状态：登录中...')
    const { data, error } = await signIn(email, password)
    if (error || !data.user) {
      this.statusText.setText(`状态：失败 — ${error?.message || '未知错误'}`)
      return
    }
    const username = (data.user.user_metadata?.username as string) || data.user.email || data.user.id.slice(0, 8)
    setPlayerIdentity(data.user.id, username)
    audioManager.playTransition()
    this.statusText.setText(`✦ 登录成功 ${username}`)
    this.time.delayedCall(600, () => this.scene.start('SanctuaryScene'))
  }

  private async trySignUp(email: string, password: string, username: string) {
    this.statusText.setText('状态：注册中...')
    const { data, error } = await signUp(email, password, username)
    if (error || !data.user) {
      this.statusText.setText(`状态：失败 — ${error?.message || '未知错误'}`)
      return
    }
    setPlayerIdentity(data.user.id, username)
    this.statusText.setText('✦ 注册成功 — 请检查邮箱并点击激活链接')
  }

  private makeBtn(x: number, y: number, label: string, w: number, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, 40, 0x0c1428, 1)
    bg.setStrokeStyle(1, 0x405880, 0.7)

    this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '14px', color: '#8ab0d0',
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => { bg.setFillStyle(0x16253c, 1) })
    bg.on('pointerout', () => { bg.setFillStyle(0x0c1428, 1) })
    bg.on('pointerdown', onClick)
  }
}

