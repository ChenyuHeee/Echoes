import Phaser from 'phaser'
import { FRAGMENT_OPTIONS, FRAGMENT_THEMES, type FragmentId } from '../config/fragments'
import { createRoom, getCurrentUser, joinRoom } from '../lib/supabase'
import { getRuntimeState, setRoom, setSelectedFragment } from '../state/gameState'
import { audioManager } from '../systems/AudioManager'

export class LobbyScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text
  private selectedIdx = 0
  private fragCards: Phaser.GameObjects.Container[] = []
  private overlay: HTMLDivElement | null = null

  constructor() {
    super('LobbyScene')
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0b0f1c')
    this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height).setAlpha(0.25)

    // 初始化选中索引
    const rt = getRuntimeState()
    this.selectedIdx = FRAGMENT_OPTIONS.findIndex(f => f.id === rt.selectedFragment) || 0

    // 标题
    this.add.text(width / 2, 26, '时间深潜大厅', {
      fontFamily: 'monospace', fontSize: '28px', color: '#c8a96e',
    }).setOrigin(0.5)
    this.add.text(width / 2, 52, `回响体：${rt.player.username}  ·  时砂：${rt.player.timeSand}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#506070',
    }).setOrigin(0.5)
    this.add.rectangle(width / 2, 62, width, 1, 0x304050, 0.3)

    // 碎片选择卡片区
    this.add.text(width / 2, 78, '选择深潜碎片', {
      fontFamily: 'monospace', fontSize: '13px', color: '#7090b0',
    }).setOrigin(0.5)

    this.buildFragmentCards(width, height)

    // 状态文字
    this.statusText = this.add.text(width / 2, height - 66, '状态：等待组队', {
      fontFamily: 'monospace', fontSize: '12px', color: '#c8d8f0',
    }).setOrigin(0.5)

    // 操作按钮行
    const btnY = height - 40
    this.makeBtn(width / 2 - 220, btnY, '创建在线房间', 190, async () => {
      await this.handleCreateRoom()
    })
    this.makeBtn(width / 2, btnY, '加入在线房间', 190, async () => {
      await this.handleJoinRoom()
    })
    this.makeBtn(width / 2 + 220, btnY, '离线深潜', 170, () => {
      audioManager.playClick()
      const rt2 = getRuntimeState()
      this.scene.start('DiveScene', { offline: true, mapFragment: rt2.selectedFragment })
      if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
    })

    // 返回按钮
    this.makeBtn(width / 2, height - 14, '← 返回庇护所', 200, () => {
      audioManager.playClick()
      this.scene.start('SanctuaryScene')
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeOverlay())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.removeOverlay())
  }

  // ─────────────────── 碎片卡片 ────────────────────────
  private buildFragmentCards(width: number, height: number) {
    this.fragCards.forEach(c => c.destroy())
    this.fragCards = []

    const CARD_W = 265
    const CARD_H = height - 160
    const GAP = 16
    const total = FRAGMENT_OPTIONS.length
    const totalW = total * CARD_W + (total - 1) * GAP
    const startX = width / 2 - totalW / 2 + CARD_W / 2
    const cardY = 90 + CARD_H / 2

    FRAGMENT_OPTIONS.forEach((opt, i) => {
      const theme = FRAGMENT_THEMES[opt.id]
      const isSelected = i === this.selectedIdx
      const colorVal = Phaser.Display.Color.HexStringToColor(theme.ambientColor).color
      const cx = startX + i * (CARD_W + GAP)

      const container = this.add.container(cx, cardY)

      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H,
        isSelected ? 0x101828 : 0x080d16, 1)
      bg.setStrokeStyle(isSelected ? 2 : 1, colorVal, isSelected ? 1 : 0.4)
      container.add(bg)

      // 顶部色条
      container.add(this.add.rectangle(0, -CARD_H / 2 + 3, CARD_W, 5, colorVal, isSelected ? 0.8 : 0.3))

      // 难度星星
      const stars = '★'.repeat(opt.difficulty) + '☆'.repeat(5 - opt.difficulty)
      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 22, text: stars,
        style: { fontFamily: 'monospace', fontSize: '13px', color: theme.ambientColor },
        add: false,
      }).setOrigin(0.5).setAlpha(isSelected ? 1 : 0.5))

      // 名称
      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 42, text: theme.name,
        style: { fontFamily: 'monospace', fontSize: '18px', color: isSelected ? '#e8f0ff' : '#506070' },
        add: false,
      }).setOrigin(0.5))

      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 62, text: theme.subtitle,
        style: { fontFamily: 'monospace', fontSize: '11px', color: theme.ambientColor },
        add: false,
      }).setOrigin(0.5).setAlpha(0.8))

      // 分隔线
      container.add(this.add.rectangle(0, -CARD_H / 2 + 78, CARD_W - 40, 1, colorVal, 0.25))

      // 描述
      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 96, text: opt.description,
        style: {
          fontFamily: 'monospace', fontSize: '11px',
          color: isSelected ? '#8090a8' : '#304050',
          wordWrap: { width: CARD_W - 32 }, align: 'center', lineSpacing: 4,
        },
        add: false,
      }).setOrigin(0.5, 0))

      // 敌人列表
      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 175, text: `敌人：${theme.enemyPool.slice(0, 3).join('  ')}`,
        style: { fontFamily: 'monospace', fontSize: '10px', color: isSelected ? '#5a7090' : '#2a3840' },
        add: false,
      }).setOrigin(0.5))

      // 已选择徽章
      if (isSelected) {
        const badge = this.add.rectangle(0, CARD_H / 2 - 26, CARD_W - 20, 28, 0x0c1c30, 1)
        badge.setStrokeStyle(1, colorVal, 0.6)
        container.add(badge)
        container.add(this.make.text({
          x: 0, y: CARD_H / 2 - 26, text: '✦ 已选择',
          style: { fontFamily: 'monospace', fontSize: '13px', color: theme.ambientColor },
          add: false,
        }).setOrigin(0.5))
      }

      // 点击选择
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerdown', () => {
        audioManager.playClick()
        this.selectedIdx = i
        setSelectedFragment(opt.id)
        this.buildFragmentCards(this.scale.width, this.scale.height)
      })
      bg.on('pointerover', () => {
        if (!isSelected) bg.setFillStyle(0x0c1422, 1)
      })
      bg.on('pointerout', () => {
        bg.setFillStyle(isSelected ? 0x101828 : 0x080d16, 1)
      })

      this.fragCards.push(container)
    })
  }

  // ─────────────────── 房间操作 ────────────────────────
  private async handleCreateRoom() {
    audioManager.playClick()
    const user = await getCurrentUser()
    const rt = getRuntimeState()
    const hostId = user?.id || rt.player.id
    const mapFragment = rt.selectedFragment

    this.statusText.setText('状态：创建中...')
    const { data, error } = await createRoom(hostId, 'dive', mapFragment, 3)
    if (error || !data) {
      this.statusText.setText(`创建失败：${error?.message || '未知错误'}`)
      return
    }

    setRoom({ id: data.id, code: data.room_code, hostId, mapFragment })
    this.statusText.setText(`✦ 房间已创建  ${data.room_code}  —  点击"离线深潜"以房主身份开始`)
    this.showRoomCodePanel(data.room_code, mapFragment)
  }

  private showRoomCodePanel(code: string, mapFragment: FragmentId) {
    this.removeOverlay()
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(4,6,14,0.90)', 'display:flex', 'align-items:center',
      'justify-content:center', 'z-index:9999', 'font-family:monospace',
    ].join(';')

    const panel = document.createElement('div')
    panel.style.cssText = [
      'background:#090d1a', 'border:1px solid #2a4060',
      'padding:36px 44px', 'text-align:center', 'min-width:320px',
    ].join(';')

    panel.innerHTML = `
      <div style="color:#7ce0bc;font-size:18px;margin-bottom:20px;letter-spacing:2px">// 房间已创建</div>
      <div style="color:#c8a96e;font-size:40px;letter-spacing:14px;margin:10px 0">${code}</div>
      <div style="color:#4a6080;font-size:12px;margin:16px 0 24px">将此房间码分享给队友</div>
    `

    const startBtn = document.createElement('button')
    startBtn.textContent = '开始深潜'
    startBtn.style.cssText = [
      'background:#0c2038', 'border:1px solid #3a7090',
      'color:#70d0f0', 'font-family:monospace', 'font-size:16px',
      'padding:12px 36px', 'cursor:pointer', 'margin:6px',
    ].join(';')
    startBtn.addEventListener('click', () => {
      this.removeOverlay()
      this.scene.start('DiveScene', { offline: false, roomCode: code, mapFragment })
      if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
    })

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '稍后'
    closeBtn.style.cssText = [
      'background:#060810', 'border:1px solid #2a3a4a',
      'color:#405060', 'font-family:monospace', 'font-size:14px',
      'padding:10px 28px', 'cursor:pointer', 'margin:6px',
    ].join(';')
    closeBtn.addEventListener('click', () => this.removeOverlay())

    panel.appendChild(startBtn)
    panel.appendChild(closeBtn)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)
    this.overlay = overlay
  }

  private async handleJoinRoom() {
    audioManager.playClick()
    this.showJoinPanel()
  }

  private showJoinPanel() {
    this.removeOverlay()
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(4,6,14,0.90)', 'display:flex', 'align-items:center',
      'justify-content:center', 'z-index:9999', 'font-family:monospace',
    ].join(';')

    const panel = document.createElement('div')
    panel.style.cssText = [
      'background:#090d1a', 'border:1px solid #2a4060',
      'padding:32px 40px', 'min-width:300px', 'display:flex',
      'flex-direction:column', 'gap:14px',
    ].join(';')

    const title = document.createElement('div')
    title.textContent = '// 加入房间'
    title.style.cssText = 'color:#c8a96e;font-size:18px;letter-spacing:2px'
    panel.appendChild(title)

    const label = document.createElement('label')
    label.textContent = '房间码（6位）'
    label.style.cssText = 'color:#4a6a8a;font-size:12px'
    panel.appendChild(label)

    const inp = document.createElement('input')
    inp.type = 'text'
    inp.maxLength = 6
    inp.placeholder = 'ABC123'
    inp.style.cssText = [
      'background:#060b16', 'border:1px solid #2a4060', 'color:#c8d8f0',
      'padding:10px 14px', 'font-family:monospace', 'font-size:20px',
      'letter-spacing:8px', 'text-align:center', 'outline:none', 'width:100%', 'box-sizing:border-box',
    ].join(';')
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase() })
    panel.appendChild(inp)

    const statusEl = document.createElement('div')
    statusEl.style.cssText = 'color:#c06060;font-size:12px;min-height:18px'
    panel.appendChild(statusEl)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:12px'

    const joinBtn = document.createElement('button')
    joinBtn.textContent = '加入'
    joinBtn.style.cssText = [
      'flex:1', 'background:#0c1828', 'border:1px solid #4080b0',
      'color:#90c8e8', 'font-family:monospace', 'font-size:14px',
      'padding:10px', 'cursor:pointer',
    ].join(';')
    joinBtn.addEventListener('click', async () => {
      const code = inp.value.trim().toUpperCase()
      if (code.length < 4) { statusEl.textContent = '房间码无效'; return }
      statusEl.textContent = '连接中...'
      const user = await getCurrentUser()
      const playerId = user?.id || getRuntimeState().player.id
      const { data, error } = await joinRoom(code, playerId)
      if (error || !data) {
        statusEl.textContent = `加入失败：${error?.message || '房间不存在'}`
        return
      }
      const roomId = data.room.id as string
      const mapFragment = data.room.map_fragment as FragmentId
      setRoom({ id: roomId, code, hostId: '', mapFragment })
      this.removeOverlay()
      this.scene.start('DiveScene', { offline: false, roomCode: code, mapFragment })
      if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
    })

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = '取消'
    cancelBtn.style.cssText = [
      'flex:1', 'background:#060810', 'border:1px solid #2a3a4a',
      'color:#405060', 'font-family:monospace', 'font-size:14px',
      'padding:10px', 'cursor:pointer',
    ].join(';')
    cancelBtn.addEventListener('click', () => this.removeOverlay())

    btnRow.appendChild(joinBtn)
    btnRow.appendChild(cancelBtn)
    panel.appendChild(btnRow)

    overlay.appendChild(panel)
    document.body.appendChild(overlay)
    this.overlay = overlay
    setTimeout(() => inp.focus(), 60)

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinBtn.click()
      if (e.key === 'Escape') this.removeOverlay()
    })
  }

  private removeOverlay() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null }
  }

  // ─────────────────── 辅助 ────────────────────────────
  private makeBtn(x: number, y: number, label: string, w: number, onClick: () => void | Promise<void>) {
    const bg = this.add.rectangle(x, y, w, 34, 0x0c1428, 1)
    bg.setStrokeStyle(1, 0x3a5878, 0.7)
    this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '13px', color: '#7090b8',
    }).setOrigin(0.5)
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setFillStyle(0x142032, 1))
    bg.on('pointerout', () => bg.setFillStyle(0x0c1428, 1))
    bg.on('pointerdown', () => void onClick())
  }
}
