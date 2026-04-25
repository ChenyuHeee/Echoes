/**
 * ChatScene — 多人游戏实时聊天悬浮面板
 *
 * 设计：
 *   · 永久并行场景，BootScene 结束后 launch，始终叠加在所有场景之上
 *   · 按 T 键打开 / 收起聊天面板
 *   · 打开后出现 DOM <input>，输入文字后 Enter 发送，Escape 收起
 *   · DOM input 的 keydown 调用 stopImmediatePropagation()，防止游戏场景误触发按键逻辑
 *   · 通过 chatManager 收发 Supabase Realtime 消息
 *   · 单机/无房间时聊天仅本地可见（提示标注"本地模式"）
 *
 * 如何接入房间：
 *   在 LobbyScene / 创房成功回调里调用：
 *     import { chatManager } from '../systems/chatManager'
 *     await chatManager.connect(roomCode, username)
 *
 * 面板布局（游戏坐标 960×540）：
 *   收起：底部左侧 [T] 聊天  小药丸（180×24）
 *   展开：底部左侧 320×200 深色半透面板 + DOM input 输入行
 */

import Phaser from 'phaser'
import { chatManager } from '../systems/chatManager'
import { getRuntimeState } from '../state/gameState'
import type { ChatMessage } from '../systems/chatManager'

// ── 常量 ──────────────────────────────────────────────
const PANEL_X   = 8    // 左边距（游戏坐标）
const PANEL_W   = 322
const MSG_LINES = 5    // 消息区可见行数
const LINE_H    = 22   // 每行高度（px in game coords）
const HDR_H     = 26   // 顶部标题行高度
const FOOT_H    = 28   // 输入行高度
const PANEL_H_EXP  = HDR_H + MSG_LINES * LINE_H + FOOT_H   // 展开高度 = 164
const PANEL_H_COLL = 24                                      // 收起高度

const BOTTOM_Y = 534   // 面板底边 y（游戏坐标）

export class ChatScene extends Phaser.Scene {
  // ── Phaser 图形对象 ─────────────────────────────────
  private bg!:        Phaser.GameObjects.Rectangle
  private border!:    Phaser.GameObjects.Rectangle
  private headerText!: Phaser.GameObjects.Text
  private msgTexts:   Phaser.GameObjects.Text[] = []
  private inputBg!:   Phaser.GameObjects.Rectangle
  private pillText!:  Phaser.GameObjects.Text
  private unreadBadge!: Phaser.GameObjects.Text
  private statusDot!: Phaser.GameObjects.Arc

  // ── 状态 ────────────────────────────────────────────
  private expanded = false
  private unread   = 0
  private unsubscribe: (() => void) | null = null
  private inputEl:  HTMLInputElement | null = null

  // ── 快捷键（Phaser）────────────────────────────────
  private tKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super({ key: 'ChatScene', active: false })
  }

  create() {
    this.expanded = false
    this.unread   = 0

    this.buildUI()

    // T 键切换（仅在 chat 关闭时由 Phaser 捕获；打开时 DOM input 劫持键盘）
    this.tKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T)
    this.tKey.on('down', () => {
      if (!this.expanded) this.openPanel()
    })

    // 订阅 chatManager
    this.unsubscribe = chatManager.onMessage(() => {
      if (!this.expanded) this.unread++
      this.refreshMessages()
      this.refreshPill()
    })

    // 刷新初始消息
    this.refreshMessages()
    this.refreshPill()
  }

  // ── 构建 UI ─────────────────────────────────────────

  private buildUI() {
    const depth = 200   // 高于所有游戏对象

    // ── 展开面板背景（收起时隐藏）──────────────────────
    this.bg = this.add.rectangle(
      PANEL_X + PANEL_W / 2,
      BOTTOM_Y - PANEL_H_EXP / 2,
      PANEL_W,
      PANEL_H_EXP,
      0x020408,
      0.94,
    ).setScrollFactor(0).setDepth(depth).setVisible(false)

    this.border = this.add.rectangle(
      PANEL_X + PANEL_W / 2,
      BOTTOM_Y - PANEL_H_EXP / 2,
      PANEL_W,
      PANEL_H_EXP,
      0x000000, 0,
    ).setScrollFactor(0).setDepth(depth + 1).setVisible(false)
    this.border.setStrokeStyle(1, 0x203850, 0.9)

    // 标题行
    this.headerText = this.add.text(
      PANEL_X + 10,
      BOTTOM_Y - PANEL_H_EXP + 5,
      '聊 天',
      { fontFamily: 'monospace', fontSize: '12px', color: '#50a0d0' },
    ).setScrollFactor(0).setDepth(depth + 2).setVisible(false)

    // 连接状态圆点
    this.statusDot = this.add.arc(
      PANEL_X + PANEL_W - 12,
      BOTTOM_Y - PANEL_H_EXP + HDR_H / 2,
      4,
    ).setFillStyle(0x304050).setScrollFactor(0).setDepth(depth + 2).setVisible(false)

    // 关闭按钮
    const closeBtn = this.add.text(
      PANEL_X + PANEL_W - 26,
      BOTTOM_Y - PANEL_H_EXP + 4,
      '×',
      { fontFamily: 'monospace', fontSize: '14px', color: '#304050' },
    ).setScrollFactor(0).setDepth(depth + 2).setVisible(false)
      .setInteractive({ useHandCursor: true })
    closeBtn.on('pointerover',  () => closeBtn.setColor('#c06060'))
    closeBtn.on('pointerout',   () => closeBtn.setColor('#304050'))
    closeBtn.on('pointerdown',  () => this.closePanel())
    // 把 closeBtn 也纳入收起隐藏管理（手动 toggle visible）
    this.events.on('expand',    () => closeBtn.setVisible(true))
    this.events.on('collapse',  () => closeBtn.setVisible(false))

    // 消息行（5 行，从上到下）
    for (let i = 0; i < MSG_LINES; i++) {
      const y = BOTTOM_Y - PANEL_H_EXP + HDR_H + i * LINE_H + 4
      const t = this.add.text(
        PANEL_X + 8, y, '',
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#507090',
          wordWrap: { width: PANEL_W - 18 },
        },
      ).setScrollFactor(0).setDepth(depth + 2).setVisible(false)
      this.msgTexts.push(t)
    }

    // 输入行背景
    this.inputBg = this.add.rectangle(
      PANEL_X + PANEL_W / 2,
      BOTTOM_Y - FOOT_H / 2,
      PANEL_W,
      FOOT_H,
      0x030608,
      0.98,
    ).setScrollFactor(0).setDepth(depth + 1).setVisible(false)
    this.inputBg.setStrokeStyle(1, 0x203040, 0.7)

    // 收起药丸（始终可见）
    this.pillText = this.add.text(
      PANEL_X + 10, BOTTOM_Y - PANEL_H_COLL / 2,
      '[T] 聊天',
      { fontFamily: 'monospace', fontSize: '10px', color: '#253545' },
    ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth + 2)

    this.unreadBadge = this.add.text(
      PANEL_X + 88, BOTTOM_Y - PANEL_H_COLL / 2,
      '',
      { fontFamily: 'monospace', fontSize: '10px', color: '#c06030' },
    ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth + 2)
  }

  // ── 展开 / 收起 ─────────────────────────────────────

  private openPanel() {
    this.expanded = true
    this.unread   = 0

    // 显示面板元素
    this.bg.setVisible(true)
    this.border.setVisible(true)
    this.headerText.setVisible(true)
    this.statusDot.setVisible(true)
    this.inputBg.setVisible(true)
    this.msgTexts.forEach(t => t.setVisible(true))
    this.pillText.setVisible(false)
    this.unreadBadge.setVisible(false)

    this.events.emit('expand')
    this.refreshMessages()
    this.updateStatusDot()
    this.createDomInput()
  }

  private closePanel() {
    this.expanded = false

    this.bg.setVisible(false)
    this.border.setVisible(false)
    this.headerText.setVisible(false)
    this.statusDot.setVisible(false)
    this.inputBg.setVisible(false)
    this.msgTexts.forEach(t => t.setVisible(false))
    this.pillText.setVisible(true)
    this.unreadBadge.setVisible(true)

    this.events.emit('collapse')
    this.destroyDomInput()
    this.refreshPill()
  }

  // ── 消息渲染 ─────────────────────────────────────────

  private refreshMessages() {
    const msgs = [...chatManager.messages].slice(-MSG_LINES)
    // 填充空行（从顶部开始）
    for (let i = 0; i < MSG_LINES; i++) {
      const m: ChatMessage | undefined = msgs[i]
      if (!m) {
        this.msgTexts[i].setText('')
        continue
      }
      const hhmm = new Date(m.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      const prefix = m.local ? '你' : m.from
      const color  = m.local ? '#80c8f0' : '#60a070'
      this.msgTexts[i].setText(`${hhmm} ${prefix}: ${m.text}`).setColor(color)
    }
  }

  private refreshPill() {
    if (this.expanded) return
    const badge = this.unread > 0 ? ` +${this.unread}` : ''
    this.unreadBadge.setText(badge)
  }

  private updateStatusDot() {
    const col = chatManager.connected ? 0x50e8a0 : 0x304050
    this.statusDot.setFillStyle(col)

    const roomInfo = chatManager.connected
      ? `房间 ${chatManager.roomCode}`
      : '本地模式'
    this.headerText.setText(`聊 天  ${roomInfo}`)
  }

  // ── DOM 输入框 ────────────────────────────────────────

  private createDomInput() {
    const el = document.createElement('input')
    el.type        = 'text'
    el.maxLength   = 100
    el.placeholder = '输入消息…  Enter 发送 · Esc 关闭'
    el.id          = 'chat-input'

    this.positionDomInput(el)
    document.body.appendChild(el)
    this.inputEl = el

    // ── 关键：阻止 keydown 传播到 Phaser（bubble 阶段 Phaser 监听 window）──
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopImmediatePropagation()   // Phaser 不会收到这些按键

      if (e.key === 'Enter') {
        e.preventDefault()
        this.sendFromInput()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.closePanel()
      }
      // 其他字符键：stopImmediatePropagation 已阻止 Phaser，浏览器默认行为
      // （文字插入到 input.value）照常发生，无需额外处理。
    })

    // 窗口大小变化时重新定位
    window.addEventListener('resize', this.repositionDomInput, { passive: true })

    el.focus()
  }

  private readonly repositionDomInput = () => {
    if (this.inputEl) this.positionDomInput(this.inputEl)
  }

  private positionDomInput(el: HTMLInputElement) {
    const canvas = this.game.canvas
    const rect   = canvas.getBoundingClientRect()
    const sx     = rect.width  / 960
    const sy     = rect.height / 540

    // 输入框在游戏坐标中的位置：底部 foot 区域
    const gx = PANEL_X + 4
    const gy = BOTTOM_Y - FOOT_H + 5
    const gw = PANEL_W - 8
    const gh = FOOT_H - 10

    const left   = rect.left + gx * sx
    const top    = rect.top  + gy * sy
    const width  = gw * sx
    const height = gh * sy
    const fsize  = Math.max(10, Math.round(11 * sy))

    el.style.cssText = `
      position: fixed;
      left: ${left}px;
      top: ${top}px;
      width: ${width}px;
      height: ${height}px;
      padding: 0 6px;
      margin: 0;
      background: rgba(2,4,8,0.0);
      border: none;
      outline: none;
      color: #90d0f0;
      font-family: monospace;
      font-size: ${fsize}px;
      caret-color: #50e8a0;
      z-index: 9999;
      box-sizing: border-box;
    `
  }

  private destroyDomInput() {
    window.removeEventListener('resize', this.repositionDomInput)
    if (this.inputEl) {
      this.inputEl.remove()
      this.inputEl = null
    }
  }

  private sendFromInput() {
    const text = this.inputEl?.value.trim() ?? ''
    if (text) {
      chatManager.send(text)
      if (this.inputEl) this.inputEl.value = ''
    }
    // 发送后不自动关闭，保持输入框开启以继续聊天
  }

  // ── 帧更新 ───────────────────────────────────────────

  private lastStatusRefresh = 0

  update(_time: number, delta: number) {
    // 每 2s 刷新一次连接状态点
    if (this.expanded) {
      this.lastStatusRefresh += delta
      if (this.lastStatusRefresh >= 2000) {
        this.lastStatusRefresh = 0
        this.updateStatusDot()
      }
    }
  }

  // ── 场景销毁时清理 ────────────────────────────────────

  shutdown() {
    this.unsubscribe?.()
    this.destroyDomInput()
  }
}
