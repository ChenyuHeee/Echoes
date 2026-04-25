import type { FragmentId } from '../config/fragments'
import type { SkillType } from '../types/game.types'

export interface RuntimePlayer {
  id: string
  username: string
  hp: number
  maxHp: number
  stability: number
  maxStability: number
  skills: SkillType[]
  timeSand: number
  lastHarvestAt: number | null
}

export interface RuntimeRoom {
  id: string
  code: string
  hostId: string
  mapFragment: FragmentId
}

interface RuntimeState {
  player: RuntimePlayer
  room: RuntimeRoom | null
  diveStartAt: number | null
  selectedFragment: FragmentId
}

const STORAGE_KEY = 'echoes.runtime.v1'

function randomGuestName(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `guest_${n}`
}

function createDefaultState(): RuntimeState {
  return {
    player: {
      id: `local_${crypto.randomUUID()}`,
      username: randomGuestName(),
      hp: 120,
      maxHp: 120,
      stability: 100,
      maxStability: 100,
      skills: ['burn_module', 'dash', 'gravity_well'],
      timeSand: 120,
      lastHarvestAt: null,
    },
    room: null,
    diveStartAt: null,
    selectedFragment: 'steam_district',
  }
}

function loadState(): RuntimeState {
  const fallback = createDefaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<RuntimeState>
    return {
      ...fallback,
      ...parsed,
      player: {
        ...fallback.player,
        ...(parsed.player || {}),
      },
    }
  } catch {
    return fallback
  }
}

let runtimeState: RuntimeState = loadState()

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runtimeState))
}

export function getRuntimeState(): RuntimeState {
  return runtimeState
}

export function patchRuntimeState(patch: Partial<RuntimeState>) {
  runtimeState = {
    ...runtimeState,
    ...patch,
    player: {
      ...runtimeState.player,
      ...(patch.player || {}),
    },
  }
  persistState()
}

export function setRoom(room: RuntimeRoom | null) {
  runtimeState = { ...runtimeState, room }
  persistState()
}

export function setSelectedFragment(selectedFragment: FragmentId) {
  runtimeState = { ...runtimeState, selectedFragment }
  persistState()
}

export function setPlayerIdentity(id: string, username: string) {
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      id,
      username,
    },
  }
  persistState()
}

export function addTimeSand(amount: number) {
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      timeSand: Math.max(0, runtimeState.player.timeSand + amount),
    },
  }
  persistState()
}

export function resetDiveVitals() {
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      hp: runtimeState.player.maxHp,
      stability: runtimeState.player.maxStability,
    },
  }
  persistState()
}

export function setLastHarvestAt(ts: number) {
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      lastHarvestAt: ts,
    },
  }
  persistState()
}
