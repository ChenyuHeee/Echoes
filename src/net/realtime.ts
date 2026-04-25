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

export class RoomRealtime {
  private channel: RealtimeChannel | null = null

  async connect(roomCode: string) {
    this.disconnect()
    this.channel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
      },
    })

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

  disconnect() {
    if (!this.channel) return
    this.channel.unsubscribe()
    this.channel = null
  }
}
