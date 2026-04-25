import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] 环境变量未配置，部分功能不可用。请复制 .env.example 为 .env.local 并填写配置。')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// 认证工具函数
export async function signUp(email: string, password: string, username: string) {
  // 动态计算 auth-callback 页面路径，支持本地和 GitHub Pages
  const pathname = window.location.pathname.replace(/[^/]*$/, '')
  const emailRedirectTo = `${window.location.origin}${pathname}auth-callback.html`

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: username },
      emailRedirectTo,
    }
  })
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 玩家档案
export async function getPlayerProfile(userId: string) {
  return supabase
    .from('player_profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

export async function updatePlayerProfile(userId: string, updates: Record<string, unknown>) {
  return supabase
    .from('player_profiles')
    .update(updates)
    .eq('id', userId)
}

// 技能记忆
export async function getSkillMemories(playerId: string) {
  return supabase
    .from('skill_memories')
    .select('*')
    .eq('player_id', playerId)
}

export async function unlockSkill(playerId: string, skillId: string, skillName: string) {
  return supabase
    .from('skill_memories')
    .upsert({ player_id: playerId, skill_id: skillId, skill_name: skillName })
}

// 庇护所
export async function getSanctuary(playerId: string) {
  return supabase
    .from('sanctuaries')
    .select('*')
    .eq('player_id', playerId)
    .single()
}

export async function updateSanctuary(playerId: string, updates: Record<string, unknown>) {
  return supabase
    .from('sanctuaries')
    .update(updates)
    .eq('player_id', playerId)
}

// 深潜记录
export async function saveDiveRecord(record: {
  player_id: string
  map_fragment: string
  result: string
  time_sand_gained: number
  crystals_found: unknown[]
  duration: number
  kills: number
  echo_sequence: unknown[]
  session_id?: string
  death_cause?: string
}) {
  return supabase.from('dive_records').insert(record)
}

// 完美回响
export async function getPerfectEchoes(playerId: string) {
  return supabase
    .from('perfect_echoes')
    .select('*')
    .eq('player_id', playerId)
}

// 游戏房间
export async function createRoom(hostId: string, roomType: string, mapFragment: string, maxPlayers: number) {
  // 生成房间码（前端生成，也可用 Supabase 函数）
  const roomCode = generateRoomCode()
  return supabase
    .from('game_rooms')
    .insert({
      room_code: roomCode,
      room_type: roomType,
      host_id: hostId,
      max_players: maxPlayers,
      map_fragment: mapFragment
    })
    .select()
    .single()
}

export async function joinRoom(roomCode: string, playerId: string) {
  const { data: room, error } = await supabase
    .from('game_rooms')
    .select('*')
    .eq('room_code', roomCode.toUpperCase())
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !room) return { data: null, error: error || new Error('房间不存在或已开始') }

  const { data, error: insertError } = await supabase
    .from('room_players')
    .insert({ room_id: room.id, player_id: playerId })
    .select()

  if (insertError || !data) {
    return { data: null, error: insertError || new Error('加入房间失败') }
  }

  return {
    data: {
      room,
      players: data,
    },
    error: null,
  }
}

export async function leaveRoom(roomId: string, playerId: string) {
  return supabase
    .from('room_players')
    .delete()
    .eq('room_id', roomId)
    .eq('player_id', playerId)
}

/** 关闭房间（房主离开/浏览器关闭时调用） */
export async function closeRoom(roomId: string) {
  return supabase
    .from('game_rooms')
    .update({ status: 'finished', updated_at: new Date().toISOString() })
    .eq('id', roomId)
}

/**
 * 在 beforeunload 中调用，使用 keepalive fetch 确保请求在页面卸载时仍能发出。
 * 直接走 Supabase REST API，不依赖 JS client 的异步队列。
 */
export function closeRoomBeacon(roomId: string) {
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) return
  const url = `${supabaseUrl}/rest/v1/game_rooms?id=eq.${encodeURIComponent(roomId)}`
  void fetch(url, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ status: 'finished', updated_at: new Date().toISOString() }),
  })
}

// 排行榜
export async function getLeaderboard(season: number = 1, limit: number = 50) {
  return supabase
    .from('leaderboard_arena')
    .select('*, player_profiles(username, display_name, avatar_skin)')
    .eq('season', season)
    .order('elo_rating', { ascending: false })
    .limit(limit)
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
