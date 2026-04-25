/**
 * chatManager — 多人聊天单例
 *
 * 通过 Supabase Realtime broadcast 频道在房间内广播聊天消息。
 * ChatScene 使用本模块收发消息；无房间时（单机）消息仅本地可见。
 *
 * 用法：
 *   import { chatManager } from '../systems/chatManager'
 *   chatManager.connect('ABCD', 'myUsername')
 *   chatManager.send('hello')
 *   chatManager.onMessage(msg => console.log(msg))
 *   chatManager.disconnect()
 */

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface ChatMessage {
  id: string
  from: string       // 发送者用户名
  text: string
  at: number         // Date.now()
  local?: boolean    // 是否是本地玩家发送的
}

type MsgHandler = (msg: ChatMessage) => void

class ChatManager {
  private channel: RealtimeChannel | null = null
  private handlers = new Set<MsgHandler>()
  private _messages: ChatMessage[] = []
  private _connected = false
  private _roomCode = ''
  private _username = 'guest'

  // ── 状态读取 ───────────────────────────────────────
  get messages(): readonly ChatMessage[] { return this._messages }
  get connected(): boolean { return this._connected }
  get roomCode(): string { return this._roomCode }

  // ── 连接 / 断开 ────────────────────────────────────

  async connect(roomCode: string, username: string) {
    if (this._roomCode === roomCode && this._connected) return
    await this.disconnect()
    this._roomCode = roomCode
    this._username = username

    try {
      this.channel = supabase.channel(`chat:${roomCode}`, {
        config: { broadcast: { self: false } },
      })

      this.channel.on('broadcast', { event: 'msg' }, ({ payload }) => {
        this._push(payload as ChatMessage)
      })

      await new Promise<void>((resolve, reject) => {
        this.channel!.subscribe(status => {
          if (status === 'SUBSCRIBED')  { this._connected = true; resolve() }
          if (status === 'CHANNEL_ERROR') reject(new Error('chat channel error'))
        })
      })
    } catch (err) {
      console.warn('[chatManager] realtime 连接失败:', err)
      this._connected = false
      this.channel = null
    }
  }

  async disconnect() {
    if (!this.channel) return
    await this.channel.unsubscribe()
    this.channel = null
    this._connected = false
    this._roomCode  = ''
  }

  // ── 发送消息 ───────────────────────────────────────

  send(text: string) {
    const trimmed = text.trim().slice(0, 120)
    if (!trimmed) return

    const msg: ChatMessage = {
      id:    crypto.randomUUID(),
      from:  this._username,
      text:  trimmed,
      at:    Date.now(),
      local: true,
    }

    // 本地立即展示
    this._push(msg)

    // 广播给其他人（去掉 local 标记）
    if (this.channel && this._connected) {
      this.channel.send({
        type: 'broadcast',
        event: 'msg',
        payload: { ...msg, local: false },
      })
    }
  }

  // ── 订阅回调 ───────────────────────────────────────

  /** 注册消息回调，返回取消函数 */
  onMessage(cb: MsgHandler): () => void {
    this.handlers.add(cb)
    return () => this.handlers.delete(cb)
  }

  // ── 内部 ───────────────────────────────────────────

  private _push(msg: ChatMessage) {
    this._messages.push(msg)
    if (this._messages.length > 60) this._messages.shift()
    this.handlers.forEach(h => h(msg))
  }
}

export const chatManager = new ChatManager()
