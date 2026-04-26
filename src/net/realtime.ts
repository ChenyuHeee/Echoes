import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface NetPlayerState {
  id: string
  username: string
  x: number
  y: number
  hp: number
  t: number
}

export interface NetSkillEvent {
  id: string
  skillId: string
  x: number
  y: number
  tx: number   // 目标 X
  ty: number   // 目标 Y
  t: number
  isEcho: boolean
}

export interface NetEnemyDeath {
  enemyId: number
  killerId: string
}

export interface NetDiveResult {
  id: string
  username: string
  result: string
  kills: number
  sand: number
  duration: number
}

/** Host 每帧广播所有存活敌人的位置/HP */
export interface NetEnemyState {
  id: number
  x: number
  y: number
  hp: number
  maxHp: number
}

/** Host 广播掉落物生成（物品/武器/配件/时砂） */
export interface NetDropSpawn {
  dropId: string       // 全局唯一，用于拾取同步
  type: 'item' | 'weapon' | 'attachment' | 'sand'
  refId: string        // item/weapon/attachment ID，sand 时为空
  sandValue?: number   // type='sand' 时有效
  x: number
  y: number
}

/** 任意玩家广播拾取事件，所有客户端删除该 dropId */
export interface NetPickup {
  dropId: string
  playerId: string
}

/** 远程音效（射击/拾取等），用于其他客户端播放 */
export interface NetSoundEvent {
  type: 'shot' | 'pickup' | 'enemyDeath' | 'extract'
  x: number
  y: number
}

/** Host 广播波次开始（非 Host 以此同步波次，避免独立触发） */
export interface NetWaveStart {
  waveNumber: number
}

export class RoomRealtime {
  private channel: RealtimeChannel | null = null

  /** 步骤1：创建 channel（不订阅），之后可以注册 on() 监听 */
  prepare(roomCode: string) {
    this.disconnect()
    this.channel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
      },
    })
  }

  /** 步骤2：注册所有监听后再调用此方法完成订阅 */
  async subscribe(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // 10 秒超时兜底，防止 TIMED_OUT 时 Promise 永远挂起
      const timer = window.setTimeout(() => {
        reject(new Error('Realtime 订阅超时（10s）'))
      }, 10000)

      this.channel!.subscribe((status, err) => {
        console.log('[Realtime] status:', status, err ?? '')
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timer)
          reject(new Error(`Realtime 失败: ${status}${err ? ' - ' + err.message : ''}`))
        }
      })
    })
  }

  onRemoteMove(handler: (state: NetPlayerState) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      handler(payload as NetPlayerState)
    })
  }

  onRemoteSkill(handler: (event: NetSkillEvent) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'skill' }, ({ payload }) => {
      handler(payload as NetSkillEvent)
    })
  }

  sendMove(state: NetPlayerState) {
    this.channel?.send({
      type: 'broadcast',
      event: 'move',
      payload: state,
    })
  }

  sendSkill(event: NetSkillEvent) {
    this.channel?.send({
      type: 'broadcast',
      event: 'skill',
      payload: event,
    })
  }

  sendEnemyDeath(payload: NetEnemyDeath) {
    this.channel?.send({ type: 'broadcast', event: 'enemy_death', payload })
  }

  onEnemyDeath(handler: (p: NetEnemyDeath) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'enemy_death' }, ({ payload }) => {
      handler(payload as NetEnemyDeath)
    })
  }

  sendDiveResult(payload: NetDiveResult) {
    this.channel?.send({ type: 'broadcast', event: 'dive_result', payload })
  }

  onDiveResult(handler: (p: NetDiveResult) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'dive_result' }, ({ payload }) => {
      handler(payload as NetDiveResult)
    })
  }

  // ── 敌人状态 (Host → All) ──────────────────────────
  sendEnemyStates(states: NetEnemyState[]) {
    this.channel?.send({ type: 'broadcast', event: 'enemy_states', payload: { states } })
  }

  onEnemyStates(handler: (states: NetEnemyState[]) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'enemy_states' }, ({ payload }) => {
      handler((payload as { states: NetEnemyState[] }).states)
    })
  }

  // ── 掉落物生成 (Host → All) ───────────────────────
  sendDropSpawn(drops: NetDropSpawn[]) {
    this.channel?.send({ type: 'broadcast', event: 'drop_spawn', payload: { drops } })
  }

  onDropSpawn(handler: (drops: NetDropSpawn[]) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'drop_spawn' }, ({ payload }) => {
      handler((payload as { drops: NetDropSpawn[] }).drops)
    })
  }

  // ── 拾取同步 (Any → All) ─────────────────────────
  sendPickup(pickup: NetPickup) {
    this.channel?.send({ type: 'broadcast', event: 'pickup', payload: pickup })
  }

  onPickup(handler: (p: NetPickup) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'pickup' }, ({ payload }) => {
      handler(payload as NetPickup)
    })
  }

  // ── 音效广播 (Any → All) ─────────────────────────
  sendSound(evt: NetSoundEvent) {
    this.channel?.send({ type: 'broadcast', event: 'sound_event', payload: evt })
  }

  onSound(handler: (evt: NetSoundEvent) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'sound_event' }, ({ payload }) => {
      handler(payload as NetSoundEvent)
    })
  }

  // ── 波次开始 (Host → All) ─────────────────────────
  sendWaveStart(payload: NetWaveStart) {
    this.channel?.send({ type: 'broadcast', event: 'wave_start', payload })
  }

  onWaveStart(handler: (p: NetWaveStart) => void) {
    if (!this.channel) return
    this.channel.on('broadcast', { event: 'wave_start' }, ({ payload }) => {
      handler(payload as NetWaveStart)
    })
  }

  disconnect() {
    if (!this.channel) return
    this.channel.unsubscribe()
    this.channel = null
  }
}
