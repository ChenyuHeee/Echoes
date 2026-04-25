import Phaser from 'phaser'
import { FRAGMENT_OPTIONS, FRAGMENT_THEMES, type FragmentId } from '../config/fragments'
import { createRoom, getCurrentUser, joinRoom } from '../lib/supabase'
import { getRuntimeState, setRoom, setSelectedFragment } from '../state/gameState'

export class LobbyScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text
  private fragmentText!: Phaser.GameObjects.Text

  constructor() {
    super('LobbyScene')
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0c1327')
    this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height).setAlpha(0.95)
    this.add.image(width * 0.5, height * 0.8, 'bg_lobby_hero').setScale(2.45).setAlpha(0.9)
    this.add.image(width * 0.16, height * 0.16, 'title_sigil').setScale(0.92).setAlpha(0.72)
    this.add.image(width / 2, height * 0.61, 'ui_panel_wide').setScale(1.12, 1.8).setAlpha(0.84)

    const rt = getRuntimeState()
    const selectedTheme = FRAGMENT_THEMES[rt.selectedFragment]

    this.add.text(width / 2, height * 0.15, '时间深潜大厅', {
      fontFamily: 'monospace',
      fontSize: '36px',
      color: '#c8a96e',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.24, `回响体：${rt.player.username}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#c9dcff',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.3, '无专用服务器模式：通过 Supabase Realtime 做房间广播', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#8fa9d4',
    }).setOrigin(0.5)

    this.statusText = this.add.text(width / 2, height * 0.38, '状态：等待组队', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e9f3ff',
    }).setOrigin(0.5)

    this.fragmentText = this.add.text(width / 2, height * 0.44, `当前碎片：${selectedTheme.name} / ${selectedTheme.subtitle}`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: selectedTheme.ambientColor,
      wordWrap: { width: 560 },
      align: 'center',
    }).setOrigin(0.5)

    this.makeButton(width / 2, height * 0.5, '切换深潜碎片主题', () => {
      this.cycleFragment()
    })

    this.makeButton(width / 2, height * 0.6, '创建在线房间（最多3人）', async () => {
      await this.handleCreateRoom()
    })

    this.makeButton(width / 2, height * 0.7, '加入在线房间（输入房间码）', async () => {
      await this.handleJoinRoom()
    })

    this.makeButton(width / 2, height * 0.8, '开始离线深潜', () => {
      const runtime = getRuntimeState()
      this.scene.start('DiveScene', { offline: true, mapFragment: runtime.selectedFragment })
      if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
    })

    this.makeButton(width / 2, height * 0.9, '返回主菜单', () => {
      this.scene.start('MenuScene')
    })

    this.add.text(width * 0.21, height * 0.94, '当前在线模式为房间广播 MVP，可继续扩展为房主主机模式', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#8fa9d4',
    }).setOrigin(0, 0.5)
  }

  private cycleFragment() {
    const runtime = getRuntimeState()
    const ids = FRAGMENT_OPTIONS.map((option) => option.id)
    const currentIndex = ids.indexOf(runtime.selectedFragment)
    const nextId = ids[(currentIndex + 1) % ids.length] as FragmentId
    const nextTheme = FRAGMENT_THEMES[nextId]
    setSelectedFragment(nextId)
    this.fragmentText.setText(`当前碎片：${nextTheme.name} / ${nextTheme.subtitle}`)
    this.fragmentText.setColor(nextTheme.ambientColor)
  }

  private async handleCreateRoom() {
    const user = await getCurrentUser()
    const runtime = getRuntimeState()
    const hostId = user?.id || runtime.player.id
    const mapFragment = runtime.selectedFragment

    const { data, error } = await createRoom(hostId, 'dive', mapFragment, 3)
    if (error || !data) {
      this.statusText.setText(`状态：创建失败 ${error?.message || '未知错误'}`)
      return
    }

    setRoom({ id: data.id, code: data.room_code, hostId, mapFragment })
    this.statusText.setText(`状态：房间已创建 ${data.room_code}`)

    const go = window.confirm(`房间码：${data.room_code}\n点击确定立刻开始深潜`) 
    if (go) {
      this.scene.start('DiveScene', { offline: false, roomCode: data.room_code, mapFragment })
      if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
    }
  }

  private async handleJoinRoom() {
    const roomCode = window.prompt('输入6位房间码：')?.trim().toUpperCase()
    if (!roomCode) return

    const user = await getCurrentUser()
    const playerId = user?.id || getRuntimeState().player.id
    const { data, error } = await joinRoom(roomCode, playerId)

    if (error || !data) {
      this.statusText.setText(`状态：加入失败 ${error?.message || '房间不存在'}`)
      return
    }

    const roomId = data.room.id as string
    const mapFragment = data.room.map_fragment as FragmentId
    setRoom({ id: roomId, code: roomCode, hostId: '', mapFragment })
    this.statusText.setText(`状态：加入成功 ${roomCode}`)

    this.scene.start('DiveScene', { offline: false, roomCode, mapFragment })
    if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
  }

  private makeButton(x: number, y: number, text: string, onClick: () => void | Promise<void>) {
    const bg = this.add.image(x, y, 'ui_button_long')
    this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#f1f7ff',
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setTint(0xbfdfff))
    bg.on('pointerout', () => bg.clearTint())
    bg.on('pointerdown', () => {
      void onClick()
    })
  }
}
