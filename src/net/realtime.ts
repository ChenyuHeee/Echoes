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
      this.channel!
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR') reject(new Error('Realtime 频道连接失败'))
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

  disconnect() {
    if (!this.channel) return
    this.channel.unsubscribe()
    this.channel = null
  }
}
