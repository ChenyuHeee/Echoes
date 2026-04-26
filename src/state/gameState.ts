import type { FragmentId } from '../config/fragments'
import type { FactionId } from '../config/factions'
import type { SkillType } from '../types/game.types'
import type { CharacterId } from '../config/characters'
import { DEFAULT_CHARACTER } from '../config/characters'

/** 玩家仓库 — 跨局持久化 */
export interface Stash {
  weaponId: string | null        // 武器 ID (WeaponId)
  attachmentIds: string[]        // 配件 ID 列表（最多 4 个，每槽位 1 个）
  itemIds: string[]              // 物品 ID 列表（最多 BAG_CAPACITY 个）
}

export interface DailyProgress {
  date: string
  kills: number
  dives: number
  extractions: number
  killsRewarded: boolean
  divesRewarded: boolean
  extractionsRewarded: boolean
}

export interface PlayerUpgrades {
  maxHp: number      // 0-8，每级 +15 HP
  stability: number  // 0-8，每级 +10 稳定度
  damage: number     // 0-8，每级 +5% 伤害
  speed: number      // 0-8，每级 +5% 速度
}

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
  faction: FactionId | null
  unlockedSkills: SkillType[]
  crystalsFound: string[]
  loreCollected: string[]
  level: number
  exp: number
  totalDives: number
  totalKills: number
  upgrades: PlayerUpgrades
  dailyProgress: DailyProgress
  selectedCharacter: CharacterId
  unlockedCharacters: CharacterId[]
  stash: Stash   // 仓库：跨局持久化的装备
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
      faction: null,
      unlockedSkills: ['burn_module', 'dash', 'gravity_well'],
      crystalsFound: [],
      loreCollected: [],
      level: 1,
      exp: 0,
      totalDives: 0,
      totalKills: 0,
      upgrades: { maxHp: 0, stability: 0, damage: 0, speed: 0 },
      dailyProgress: { date: '', kills: 0, dives: 0, extractions: 0, killsRewarded: false, divesRewarded: false, extractionsRewarded: false },
      selectedCharacter: DEFAULT_CHARACTER,
      unlockedCharacters: [DEFAULT_CHARACTER],
      stash: { weaponId: null, attachmentIds: [], itemIds: [] },
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

export function setSelectedCharacter(characterId: CharacterId) {
  const unlocked = runtimeState.player.unlockedCharacters || [DEFAULT_CHARACTER]
  if (!unlocked.includes(characterId)) return
  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, selectedCharacter: characterId },
  }
  persistState()
}

export function unlockCharacter(characterId: CharacterId) {
  const existing = runtimeState.player.unlockedCharacters || [DEFAULT_CHARACTER]
  if (existing.includes(characterId)) return
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      unlockedCharacters: [...existing, characterId],
    },
  }
  persistState()
}

export function saveStash(stash: Stash) {
  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, stash },
  }
  persistState()
}

export function discardFromStash(type: 'weapon' | 'attachment' | 'item', id: string) {
  const s = runtimeState.player.stash
  const updated: Stash = {
    weaponId:      type === 'weapon'     ? null                             : s.weaponId,
    attachmentIds: type === 'attachment' ? s.attachmentIds.filter(x => x !== id) : s.attachmentIds,
    itemIds:       type === 'item'       ? s.itemIds.filter(x => x !== id)       : s.itemIds,
  }
  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, stash: updated },
  }
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

export function setFaction(faction: FactionId, bonusSkill: SkillType) {
  const unlocked = [...new Set([...runtimeState.player.unlockedSkills, bonusSkill])]
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      faction,
      unlockedSkills: unlocked,
    },
  }
  persistState()
}

export function unlockSkill(skill: SkillType) {
  if (runtimeState.player.unlockedSkills.includes(skill)) return
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      unlockedSkills: [...runtimeState.player.unlockedSkills, skill],
    },
  }
  persistState()
}

export function setEquippedSkills(skills: SkillType[]) {
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      skills: skills.slice(0, 3),
    },
  }
  persistState()
}

export function addCrystal(crystalId: string) {
  if (runtimeState.player.crystalsFound.includes(crystalId)) return
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      crystalsFound: [...runtimeState.player.crystalsFound, crystalId],
    },
  }
  persistState()
}

export function addLoreEntry(loreId: string) {
  if (runtimeState.player.loreCollected.includes(loreId)) return
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      loreCollected: [...runtimeState.player.loreCollected, loreId],
    },
  }
  persistState()
}

function computeMaxHp(level: number, upgradeLevel: number): number {
  return 120 + (level - 1) * 8 + upgradeLevel * 15
}
function computeMaxStability(level: number, upgradeLevel: number): number {
  return 100 + (level - 1) * 6 + upgradeLevel * 10
}

export function recordDiveComplete(kills: number, extracted: boolean) {
  // ── 每日进度 ──
  const today = new Date().toISOString().slice(0, 10)
  const dp = runtimeState.player.dailyProgress
  const newDp: DailyProgress = dp.date === today
    ? { ...dp }
    : { date: today, kills: 0, dives: 0, extractions: 0, killsRewarded: false, divesRewarded: false, extractionsRewarded: false }
  newDp.kills += kills
  newDp.dives += 1
  if (extracted) newDp.extractions += 1

  // ── 经验值 / 升级 ──
  const EXP_PER_KILL = 15
  const EXP_EXTRACT_BONUS = 50
  let { exp, level } = runtimeState.player
  exp += kills * EXP_PER_KILL + (extracted ? EXP_EXTRACT_BONUS : 10)
  const MAX_LEVEL = 20
  while (level < MAX_LEVEL) {
    const needed = level * 150
    if (exp >= needed) { exp -= needed; level++ } else break
  }
  if (level >= MAX_LEVEL) exp = 0

  const upgrades = runtimeState.player.upgrades
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      totalDives: runtimeState.player.totalDives + 1,
      totalKills: runtimeState.player.totalKills + kills,
      level,
      exp,
      maxHp: computeMaxHp(level, upgrades.maxHp),
      maxStability: computeMaxStability(level, upgrades.stability),
      dailyProgress: newDp,
    },
  }
  persistState()
}

// 每升一级属性强化费用 = (当前等级+1) * 30 时砂
export const UPGRADE_MAX_LEVEL = 8
export const UPGRADE_COST_PER_LEVEL = 30

export function upgradeAttribute(attr: keyof PlayerUpgrades): boolean {
  const upgrades = { ...runtimeState.player.upgrades }
  if (upgrades[attr] >= UPGRADE_MAX_LEVEL) return false
  const cost = (upgrades[attr] + 1) * UPGRADE_COST_PER_LEVEL
  if (runtimeState.player.timeSand < cost) return false
  upgrades[attr] += 1
  const { level } = runtimeState.player
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      timeSand: runtimeState.player.timeSand - cost,
      upgrades,
      maxHp: computeMaxHp(level, upgrades.maxHp),
      maxStability: computeMaxStability(level, upgrades.stability),
    },
  }
  persistState()
  return true
}

export function claimDailyQuest(quest: 'kills' | 'dives' | 'extractions'): number {
  const today = new Date().toISOString().slice(0, 10)
  const dp = { ...runtimeState.player.dailyProgress }
  if (dp.date !== today) return 0
  const REWARDS = { kills: 20, dives: 25, extractions: 30 } as const
  const rewardedKey = (quest + 'Rewarded') as 'killsRewarded' | 'divesRewarded' | 'extractionsRewarded'
  if (dp[rewardedKey]) return 0
  dp[rewardedKey] = true
  const reward = REWARDS[quest]
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      timeSand: runtimeState.player.timeSand + reward,
      dailyProgress: dp,
    },
  }
  persistState()
  return reward
}

export function getDamageMultiplier(): number {
  return 1 + runtimeState.player.upgrades.damage * 0.05
}
export function getSpeedMultiplier(): number {
  return 1 + runtimeState.player.upgrades.speed * 0.05
}
