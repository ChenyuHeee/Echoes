import Phaser from 'phaser'
import { FRAGMENT_OPTIONS, FRAGMENT_THEMES, type FragmentId } from '../config/fragments'
import { closeRoom, closeRoomBeacon, createRoom, getCurrentUser, joinRoom } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { getRuntimeState, setRoom, setSelectedFragment } from '../state/gameState'
import { audioManager } from '../systems/AudioManager'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface LobbyPlayer { username: string; ready: boolean }

type LobbyInit = {
  mode?: 'select' | 'waiting'
  roomCode?: string
  isHost?: boolean
  mapFragment?: FragmentId
}

export class LobbyScene extends Phaser.Scene {
  // Select mode
  private statusText!: Phaser.GameObjects.Text
  private selectedIdx = 0
  private fragCards: Phaser.GameObjects.Container[] = []
  private overlay: HTMLDivElement | null = null
  private createdRoomId: string | null = null
  private _unloadHandler: (() => void) | null = null
  private startingGame = false

  // Waiting room mode
  private mode: 'select' | 'waiting' = 'select'
  private roomCode = ''
  private mapFragment: FragmentId = 'steam_district'
  private isHost = false
  private selfReady = false
  private players = new Map<string, LobbyPlayer>()
  private lobbyChannel: RealtimeChannel | null = null
  private playerListContainer: Phaser.GameObjects.Container | null = null
  private startBtnRect: Phaser.GameObjects.Rectangle | null = null
  private startBtnText: Phaser.GameObjects.Text | null = null
  private readyBtnRect: Phaser.GameObjects.Rectangle | null = null
  private readyBtnText: Phaser.GameObjects.Text | null = null
  private waitingStatusText: Phaser.GameObjects.Text | null = null

  constructor() {
    super('LobbyScene')
  }

  init(data: LobbyInit) {
    this.mode = data.mode ?? 'select'
    this.roomCode = data.roomCode ?? ''
    this.isHost = data.isHost ?? false
    this.mapFragment = data.mapFragment ?? 'steam_district'
    this.startingGame = false
    this.selfReady = false
    this.players.clear()
    this.playerListContainer = null
    this.startBtnRect = null
    this.startBtnText = null
    this.readyBtnRect = null
    this.readyBtnText = null
    this.waitingStatusText = null
    // If host in waiting mode, remember room id for cleanup
    if (this.mode === 'waiting' && this.isHost) {
      this.createdRoomId = getRuntimeState().room?.id ?? null
    } else {
      this.createdRoomId = null
    }
  }

  create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupAll())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupAll())
    if (this.mode === 'waiting') {
      this.createWaitingRoomUI()
    } else {
      this.createSelectUI()
    }
  }

  // ─────────────────── 选择模式 ───────────────────────
  private createSelectUI() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0b0f1c')
    this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height).setAlpha(0.25)

    const rt = getRuntimeState()
    this.selectedIdx = FRAGMENT_OPTIONS.findIndex(f => f.id === rt.selectedFragment) || 0

    this.add.text(width / 2, 26, '时间深潜大厅', {
      fontFamily: 'monospace', fontSize: '28px', color: '#c8a96e',
    }).setOrigin(0.5)
    this.add.text(width / 2, 52, `回响体：${rt.player.username}  ·  时砂：${rt.player.timeSand}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#506070',
    }).setOrigin(0.5)
    this.add.rectangle(width / 2, 62, width, 1, 0x304050, 0.3)

    this.add.text(width / 2, 78, '选择深潜碎片', {
      fontFamily: 'monospace', fontSize: '13px', color: '#7090b0',
    }).setOrigin(0.5)

    this.buildFragmentCards(width, height)

    this.statusText = this.add.text(width / 2, height - 66, '状态：等待组队', {
      fontFamily: 'monospace', fontSize: '12px', color: '#c8d8f0',
    }).setOrigin(0.5)

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

    this.makeBtn(width / 2, height - 14, '← 返回庇护所', 200, () => {
      audioManager.playClick()
      this.scene.start('SanctuaryScene')
    })
  }

  // ─────────────────── 等待室模式 ────────────────────
  private createWaitingRoomUI() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0b0f1c')
    this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height).setAlpha(0.2)
    audioManager.startMenuBgm()

    // 标题
    this.add.text(width / 2, 18, '时间深潜 · 等待室', {
      fontFamily: 'monospace', fontSize: '22px', color: '#c8a96e',
    }).setOrigin(0.5)

    // 房间码（大字）
    this.add.text(width / 2, 56, this.roomCode, {
      fontFamily: 'monospace', fontSize: '40px', color: '#7ce0bc', letterSpacing: 14,
    }).setOrigin(0.5)

    const theme = FRAGMENT_THEMES[this.mapFragment]
    this.add.text(width / 2, 90, `地图：${theme.name}  ·  将房间码分享给队友`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#405060',
    }).setOrigin(0.5)

    this.add.rectangle(width / 2, 102, width - 40, 1, 0x203040, 0.5)

    // 玩家列表面板
    const panelCY = height / 2 - 12
    this.add.rectangle(width / 2, panelCY, 480, 210, 0x060c18, 1)
      .setStrokeStyle(1, 0x2a4060, 0.8)
    this.add.text(width / 2 - 220, panelCY - 98, '▸ 队伍成员', {
      fontFamily: 'monospace', fontSize: '12px', color: '#4a6a8a',
    }).setOrigin(0, 0.5)

    this.playerListContainer = this.add.container(0, 0)
    const rt = getRuntimeState()
    this.players.set(rt.player.id, { username: rt.player.username, ready: false })
    this.renderPlayerList()

    this.waitingStatusText = this.add.text(width / 2, panelCY + 114, '等待所有玩家准备...', {
      fontFamily: 'monospace', fontSize: '11px', color: '#405060',
    }).setOrigin(0.5)

    // 准备按钮
    const readyX = this.isHost ? width / 2 - 92 : width / 2
    this.readyBtnRect = this.add.rectangle(readyX, height - 76, 155, 36, 0x0c1828, 1)
    this.readyBtnRect.setStrokeStyle(1, 0x3a7090, 0.7)
    this.readyBtnRect.setInteractive({ useHandCursor: true })
    this.readyBtnText = this.add.text(readyX, height - 76, '准备', {
      fontFamily: 'monospace', fontSize: '14px', color: '#60a0d0',
    }).setOrigin(0.5)
    this.readyBtnRect.on('pointerdown', () => this.toggleReady())
    this.readyBtnRect.on('pointerover', () => this.readyBtnRect?.setFillStyle(0x142032, 1))
    this.readyBtnRect.on('pointerout', () => {
      this.readyBtnRect?.setFillStyle(this.selfReady ? 0x0c2814 : 0x0c1828, 1)
    })

    // 开始游戏按钮（仅房主）
    if (this.isHost) {
      this.startBtnRect = this.add.rectangle(width / 2 + 92, height - 76, 165, 36, 0x060810, 1)
      this.startBtnRect.setStrokeStyle(1, 0x203040, 0.4)
      this.startBtnText = this.add.text(width / 2 + 92, height - 76, '开始游戏', {
        fontFamily: 'monospace', fontSize: '14px', color: '#304050',
      }).setOrigin(0.5)
      this.startBtnRect.setInteractive({ useHandCursor: true })
      this.startBtnRect.on('pointerdown', () => this.tryStartGame())
      this.startBtnRect.on('pointerover', () => {
        if (this.allReady) this.startBtnRect?.setFillStyle(0x0c2040, 1)
      })
      this.startBtnRect.on('pointerout', () => {
        this.startBtnRect?.setFillStyle(this.allReady ? 0x0c2038 : 0x060810, 1)
      })
    }

    // 取消/返回
    const backTxt = this.add.text(20, height - 12, '← 取消', {
      fontFamily: 'monospace', fontSize: '12px', color: '#405060',
    }).setOrigin(0, 1)
    backTxt.setInteractive({ useHandCursor: true })
    backTxt.on('pointerover', () => backTxt.setColor('#7090b0'))
    backTxt.on('pointerout', () => backTxt.setColor('#405060'))
    backTxt.on('pointerdown', () => {
      audioManager.playClick()
      this.cleanupLobbyChannel()
      this.scene.start('LobbyScene')   // 重启为选择模式
    })

    this.subscribeToLobby()
  }

  private toggleReady() {
    audioManager.playClick()
    this.selfReady = !this.selfReady
    this.readyBtnRect?.setFillStyle(this.selfReady ? 0x0c2814 : 0x0c1828, 1)
    this.readyBtnRect?.setStrokeStyle(1, this.selfReady ? 0x3a9060 : 0x3a7090, 0.9)
    this.readyBtnText?.setText(this.selfReady ? '✓ 已准备' : '准备')
    this.readyBtnText?.setColor(this.selfReady ? '#7ce0bc' : '#60a0d0')
    const rt = getRuntimeState()
    this.players.set(rt.player.id, { username: rt.player.username, ready: this.selfReady })
    this.broadcastSelf()
    this.renderPlayerList()
    this.updateStartBtn()
  }

  private tryStartGame() {
    if (!this.allReady) {
      this.waitingStatusText?.setText('⚠ 所有玩家准备后才可开始')
      this.waitingStatusText?.setColor('#e08050')
      this.time.delayedCall(2500, () => {
        if (this.waitingStatusText?.active) {
          this.waitingStatusText.setText('等待所有玩家准备...')
          this.waitingStatusText.setColor('#405060')
        }
      })
      return
    }
    audioManager.playClick()
    this.startingGame = true
    void this.lobbyChannel?.send({
      type: 'broadcast', event: 'game_start',
      payload: { mapFragment: this.mapFragment },
    })
    // 延迟 200ms 给广播时间传播
    this.time.delayedCall(200, () => {
      this.cleanupLobbyChannel()
      this.scene.start('DiveScene', { offline: false, roomCode: this.roomCode, mapFragment: this.mapFragment })
      if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
    })
  }

  private get allReady(): boolean {
    if (this.players.size === 0) return false
    for (const [, p] of this.players) {
      if (!p.ready) return false
    }
    return true
  }

  private subscribeToLobby() {
    this.lobbyChannel = supabase.channel(`lobby:${this.roomCode}`, {
      config: { broadcast: { self: false } },
    })
    this.lobbyChannel
      .on('broadcast', { event: 'player_update' }, ({ payload }) => {
        const p = payload as { id: string; username: string; ready: boolean }
        this.players.set(p.id, { username: p.username, ready: p.ready })
        this.renderPlayerList()
        this.updateStartBtn()
        const allDone = this.allReady
        this.waitingStatusText?.setText(allDone ? '✦ 所有人已就绪！' : '等待所有玩家准备...')
        this.waitingStatusText?.setColor(allDone ? '#7ce0bc' : '#405060')
      })
      .on('broadcast', { event: 'game_start' }, ({ payload }) => {
        const mapFrag = (payload as { mapFragment: FragmentId }).mapFragment
        this.startingGame = true
        this.cleanupLobbyChannel()
        this.scene.start('DiveScene', { offline: false, roomCode: this.roomCode, mapFragment: mapFrag })
        if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.broadcastSelf()
      })
  }

  private broadcastSelf() {
    const rt = getRuntimeState()
    void this.lobbyChannel?.send({
      type: 'broadcast',
      event: 'player_update',
      payload: { id: rt.player.id, username: rt.player.username, ready: this.selfReady },
    })
  }

  private renderPlayerList() {
    if (!this.playerListContainer) return
    this.playerListContainer.removeAll(true)

    const { width, height } = this.scale
    const panelCY = height / 2 - 12
    const startY = panelCY - 62
    const STEP = 56
    const selfId = getRuntimeState().player.id

    let idx = 0
    for (const [id, player] of this.players) {
      const y = startY + idx * STEP
      const isMe = id === selfId
      const readyColor = player.ready ? '#7ce0bc' : '#8090a8'

      // 状态圆点
      const dot = this.add.graphics()
      dot.fillStyle(player.ready ? 0x4ca87a : 0x304058, 1)
      dot.fillCircle(width / 2 - 208, y, 8)
      dot.setDefaultStyles({ fillStyle: { color: 0 } })
      this.playerListContainer!.add(dot)

      // 玩家名字
      const nameText = this.make.text({
        x: width / 2 - 190, y,
        text: `${player.username}${isMe ? '  (你)' : ''}`,
        style: { fontFamily: 'monospace', fontSize: '15px', color: readyColor },
        add: false,
      }).setOrigin(0, 0.5)
      this.playerListContainer!.add(nameText)

      // 准备标志
      const badge = this.make.text({
        x: width / 2 + 210, y,
        text: player.ready ? '✓ 已准备' : '等待中',
        style: { fontFamily: 'monospace', fontSize: '12px', color: player.ready ? '#5adc9a' : '#404c5a' },
        add: false,
      }).setOrigin(1, 0.5)
      this.playerListContainer!.add(badge)

      idx++
    }
  }

  private updateStartBtn() {
    if (!this.startBtnRect || !this.startBtnText) return
    const ready = this.allReady
    this.startBtnRect.setFillStyle(ready ? 0x0c2038 : 0x060810, 1)
    this.startBtnRect.setStrokeStyle(1, ready ? 0x3a7090 : 0x203040, ready ? 0.8 : 0.4)
    this.startBtnText.setColor(ready ? '#70d0f0' : '#304050')
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

      container.add(this.add.rectangle(0, -CARD_H / 2 + 3, CARD_W, 5, colorVal, isSelected ? 0.8 : 0.3))

      const stars = '★'.repeat(opt.difficulty) + '☆'.repeat(5 - opt.difficulty)
      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 22, text: stars,
        style: { fontFamily: 'monospace', fontSize: '13px', color: theme.ambientColor },
        add: false,
      }).setOrigin(0.5).setAlpha(isSelected ? 1 : 0.5))

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

      container.add(this.add.rectangle(0, -CARD_H / 2 + 78, CARD_W - 40, 1, colorVal, 0.25))

      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 96, text: opt.description,
        style: {
          fontFamily: 'monospace', fontSize: '11px',
          color: isSelected ? '#8090a8' : '#304050',
          wordWrap: { width: CARD_W - 28, useAdvancedWrap: true }, align: 'center', lineSpacing: 4,
        },
        add: false,
      }).setOrigin(0.5, 0))

      container.add(this.make.text({
        x: 0, y: -CARD_H / 2 + 175, text: `敌人：${theme.enemyPool.slice(0, 3).join(' / ')}`,
        style: {
          fontFamily: 'monospace', fontSize: '10px',
          color: isSelected ? '#5a7090' : '#2a3840',
          wordWrap: { width: CARD_W - 24, useAdvancedWrap: true }, align: 'center',
        },
        add: false,
      }).setOrigin(0.5))

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

    const code = data.room_code as string
    const roomId = data.id as string
    setRoom({ id: roomId, code, hostId, mapFragment })

    this._unloadHandler = () => closeRoomBeacon(roomId)
    window.addEventListener('beforeunload', this._unloadHandler)
    // 清除 createdRoomId 避免场景重启时关闭房间（init() 里会从 state 重新读取）
    this.createdRoomId = null

    this.scene.start('LobbyScene', { mode: 'waiting', roomCode: code, isHost: true, mapFragment })
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
    label.textContent = '房间码（4-6位）'
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
      const mapFrag = data.room.map_fragment as FragmentId
      const hostId = data.room.host_id as string
      setRoom({ id: roomId, code, hostId, mapFragment: mapFrag })
      this.removeOverlay()
      this.scene.start('LobbyScene', { mode: 'waiting', roomCode: code, isHost: false, mapFragment: mapFrag })
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

  // ─────────────────── 辅助 ────────────────────────────
  private removeOverlay() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null }
  }

  private cleanupLobbyChannel() {
    if (this.lobbyChannel) {
      this.lobbyChannel.unsubscribe()
      this.lobbyChannel = null
    }
  }

  private cleanupAll() {
    this.removeOverlay()
    this.cleanupLobbyChannel()
    if (this._unloadHandler) {
      window.removeEventListener('beforeunload', this._unloadHandler)
      this._unloadHandler = null
    }
    if (this.createdRoomId && !this.startingGame) {
      void closeRoom(this.createdRoomId)
      this.createdRoomId = null
    }
  }

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
