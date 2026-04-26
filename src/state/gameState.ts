import type { FragmentId } from '../config/fragments'
import type { FactionId } from '../config/factions'
import type { SkillType } from '../types/game.types'
import type { CharacterId } from '../config/characters'
import { DEFAULT_CHARACTER } from '../config/characters'

/** 玩家仓库 — 无限量跨局持久化 */
export interface Stash {
  weaponIds: string[]            // 武器 ID 列表（多把，不限量）
  attachmentIds: string[]        // 配件 ID 列表（不限数量，按槽位各一带入）
  itemIds: string[]              // 物品 ID 列表（不限数量）
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
  totalExtractions: number
  upgrades: PlayerUpgrades
  dailyProgress: DailyProgress
  selectedCharacter: CharacterId
  unlockedCharacters: CharacterId[]
  stash: Stash   // 仓库：跨局持久化的装备
  // 连续登录奖励
  lastLoginDate: string  // ISO yyyy-mm-dd
  loginStreak: number
  loginRewardClaimedDate: string  // 今日是否领取过
  // 成就
  achievements: string[]
  // 限定抽卡
  gachaPullsTotal: number          // 总抽取次数
  gachaPityCounter: number         // 距离上次传说该走了多少发（保底计数）
  gachaHistory: string[]           // 抽卡历史（最多保留最近 50 抽，格式：'<charId>:<ts>'）
  // 双货币体系
  echoShards: number               // 回响碎片（出售仓库装备获得）
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
      totalExtractions: 0,
      upgrades: { maxHp: 0, stability: 0, damage: 0, speed: 0 },
      dailyProgress: { date: '', kills: 0, dives: 0, extractions: 0, killsRewarded: false, divesRewarded: false, extractionsRewarded: false },
      selectedCharacter: DEFAULT_CHARACTER,
      unlockedCharacters: [DEFAULT_CHARACTER],
      stash: { weaponIds: [], attachmentIds: [], itemIds: [] },
      lastLoginDate: '',
      loginStreak: 0,
      loginRewardClaimedDate: '',
      achievements: [],
      gachaPullsTotal: 0,
      gachaPityCounter: 0,
      gachaHistory: [],
      echoShards: 0,
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
    const mergedPlayer = {
      ...fallback.player,
      ...(parsed.player || {}),
    }
    // 迁移：旧存档用 persistentItems(string[])，新版用 stash
    const legacy = (mergedPlayer as Record<string, unknown>)['persistentItems'] as string[] | undefined
    if (legacy && legacy.length > 0 && !mergedPlayer.stash?.weaponIds?.length && mergedPlayer.stash?.itemIds?.length === 0) {
      mergedPlayer.stash = { weaponIds: [], attachmentIds: [], itemIds: legacy }
    }
    // 迁移：旧存档 stash.weaponId（单武器）→ weaponIds 数组
    const oldWeaponId = ((mergedPlayer.stash as unknown) as Record<string, unknown>)['weaponId'] as string | null | undefined
    if (oldWeaponId !== undefined) {
      mergedPlayer.stash = {
        weaponIds: oldWeaponId ? [oldWeaponId] : (mergedPlayer.stash.weaponIds ?? []),
        attachmentIds: mergedPlayer.stash.attachmentIds ?? [],
        itemIds: mergedPlayer.stash.itemIds ?? [],
      }
    }
    return { ...fallback, ...parsed, player: mergedPlayer }
  } catch {
    return fallback
  }
}

let runtimeState: RuntimeState = loadState()

// 根据当前统计自动解锁满足条件的角色
function checkCharacterUnlocks() {
  const p = runtimeState.player
  const unlock = (id: CharacterId) => {
    if (!p.unlockedCharacters.includes(id)) {
      runtimeState = {
        ...runtimeState,
        player: {
          ...runtimeState.player,
          unlockedCharacters: [...runtimeState.player.unlockedCharacters, id],
        },
      }
    }
  }
  // void_breaker: 完成 5 次深潜撤离
  if ((runtimeState.player.totalExtractions) >= 5) unlock('void_breaker')
  // chrono_sentinel: 收集 3 枚回响水晶
  if (runtimeState.player.crystalsFound.length >= 3) unlock('chrono_sentinel')
  // echo_phantom: 总击杀数达到 100
  if (runtimeState.player.totalKills >= 100) unlock('echo_phantom')
  // iron_warden: 总深潜次数达到 10
  if (runtimeState.player.totalDives >= 10) unlock('iron_warden')
}

// 初始加载时检查一次（兼容旧存档已满足条件但未解锁的情况）
checkCharacterUnlocks()

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

/**
 * 出发前从仓库扣除带走的装备（武器/配件/物品）。
 * 每个 ID 只删除一个实例（支持同 ID 多份）。
 */
export function deductLoadoutFromStash(weaponId: string | null, attachmentIds: string[], itemIds: string[] = []) {
  const s = runtimeState.player.stash

  // 从 weaponIds 中移除一个实例
  let weaponIds = [...s.weaponIds]
  if (weaponId) {
    const idx = weaponIds.indexOf(weaponId)
    if (idx >= 0) weaponIds.splice(idx, 1)
  }

  // 从 attachmentIds 中每个 ID 各移除一个实例
  let attachmentIds2 = [...s.attachmentIds]
  for (const id of attachmentIds) {
    const idx = attachmentIds2.indexOf(id)
    if (idx >= 0) attachmentIds2.splice(idx, 1)
  }

  // 从 itemIds 中每个 ID 各移除一个实例
  let itemIds2 = [...s.itemIds]
  for (const id of itemIds) {
    const idx = itemIds2.indexOf(id)
    if (idx >= 0) itemIds2.splice(idx, 1)
  }

  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, stash: { ...s, weaponIds, attachmentIds: attachmentIds2, itemIds: itemIds2 } },
  }
  persistState()
}

/** 深潜撤离后：将本次带出的装备合并入仓库（追加，不去重——由 deductLoadoutFromStash 保证对称） */
export function mergeIntoStash(extracted: { weaponId: string | null; attachmentIds: string[]; itemIds: string[] }) {
  const s = runtimeState.player.stash
  // 武器直接追加（出发时已扣除，无需去重）
  const weaponIds = extracted.weaponId ? [...s.weaponIds, extracted.weaponId] : s.weaponIds
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      stash: {
        weaponIds,
        attachmentIds: [...s.attachmentIds, ...extracted.attachmentIds],
        itemIds: [...s.itemIds, ...extracted.itemIds],
      },
    },
  }
  persistState()
}

export function discardFromStash(type: 'weapon' | 'attachment' | 'item', id: string) {
  const s = runtimeState.player.stash
  const updated: Stash = {
    weaponIds:     type === 'weapon'     ? s.weaponIds.filter(x => x !== id)       : s.weaponIds,
    attachmentIds: type === 'attachment' ? s.attachmentIds.filter(x => x !== id)   : s.attachmentIds,
    itemIds:       type === 'item'       ? s.itemIds.filter(x => x !== id)         : s.itemIds,
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

// ─── 限定抽卡 ────────────────────────────────────
export function spendTimeSand(amount: number): boolean {
  if (runtimeState.player.timeSand < amount) return false
  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, timeSand: runtimeState.player.timeSand - amount },
  }
  persistState()
  return true
}

export function recordGachaPull(charId: CharacterId, isLegendary: boolean) {
  const p = runtimeState.player
  const newPity = isLegendary ? 0 : p.gachaPityCounter + 1
  const history = [`${charId}:${Date.now()}`, ...p.gachaHistory].slice(0, 50)
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      gachaPullsTotal: p.gachaPullsTotal + 1,
      gachaPityCounter: newPity,
      gachaHistory: history,
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

export function addEchoShards(amount: number) {
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      echoShards: Math.max(0, (runtimeState.player.echoShards ?? 0) + amount),
    },
  }
  persistState()
}

export function spendEchoShards(amount: number): boolean {
  const cur = runtimeState.player.echoShards ?? 0
  if (cur < amount) return false
  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, echoShards: cur - amount },
  }
  persistState()
  return true
}

/**
 * 从仓库出售一件装备获得回响碎片。
 * 碎片量 = 装备 sandValue（1:1）。
 */
export function sellFromStash(type: 'weapon' | 'attachment' | 'item', id: string, shards: number) {
  const s = runtimeState.player.stash
  const updated: Stash = {
    weaponIds:     type === 'weapon'     ? removeOne(s.weaponIds, id)     : s.weaponIds,
    attachmentIds: type === 'attachment' ? removeOne(s.attachmentIds, id) : s.attachmentIds,
    itemIds:       type === 'item'       ? removeOne(s.itemIds, id)       : s.itemIds,
  }
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      stash: updated,
      echoShards: (runtimeState.player.echoShards ?? 0) + shards,
    },
  }
  persistState()
}

function removeOne(arr: string[], id: string): string[] {
  const i = arr.indexOf(id)
  if (i < 0) return arr
  const out = [...arr]
  out.splice(i, 1)
  return out
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
  checkCharacterUnlocks()
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
      totalExtractions: runtimeState.player.totalExtractions + (extracted ? 1 : 0),
      level,
      exp,
      maxHp: computeMaxHp(level, upgrades.maxHp),
      maxStability: computeMaxStability(level, upgrades.stability),
      dailyProgress: newDp,
    },
  }
  checkCharacterUnlocks()
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

// ─────────────── 连续登录奖励 ───────────────
/** 调用时检查"昨日是否登录"，更新连续天数；不发奖。返回当前 streak。 */
export function tickLoginStreak(): number {
  const today = new Date().toISOString().slice(0, 10)
  const last = runtimeState.player.lastLoginDate
  if (last === today) return runtimeState.player.loginStreak
  // 计算"是否昨日登录"
  let streak = 1
  if (last) {
    const lastDate = new Date(last + 'T00:00:00Z').getTime()
    const todayDate = new Date(today + 'T00:00:00Z').getTime()
    const diff = Math.round((todayDate - lastDate) / 86400000)
    streak = diff === 1 ? runtimeState.player.loginStreak + 1 : 1
  }
  runtimeState = {
    ...runtimeState,
    player: { ...runtimeState.player, lastLoginDate: today, loginStreak: streak },
  }
  persistState()
  return streak
}

/** 当日是否还能领取登录奖励 */
export function canClaimDailyLogin(): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return runtimeState.player.loginRewardClaimedDate !== today
}

/** 领取今日登录奖励，按 streak 阶梯返还时砂数；不可领则返回 0。 */
export function claimDailyLogin(): number {
  if (!canClaimDailyLogin()) return 0
  tickLoginStreak()
  const streak = runtimeState.player.loginStreak
  const base = 30
  const bonusMul = streak >= 30 ? 2.5 : streak >= 15 ? 2.0 : streak >= 7 ? 1.5 : streak >= 3 ? 1.2 : 1
  const reward = Math.round(base * bonusMul + Math.min(streak, 10) * 5)
  const today = new Date().toISOString().slice(0, 10)
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      timeSand: runtimeState.player.timeSand + reward,
      loginRewardClaimedDate: today,
    },
  }
  persistState()
  return reward
}

// ─────────────── 成就系统 ───────────────
export interface AchievementDef {
  id: string
  name: string
  desc: string
  check: (p: RuntimePlayer) => boolean
  reward: number  // 时砂奖励
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_dive',     name: '初次潜入',     desc: '完成首次时间深潜',           check: p => p.totalDives >= 1,        reward: 30 },
  { id: 'dive_veteran',   name: '深潜老兵',     desc: '完成 10 次深潜',              check: p => p.totalDives >= 10,       reward: 80 },
  { id: 'kill_100',       name: '百敌斩',       desc: '累计击杀 100 个敌人',         check: p => p.totalKills >= 100,      reward: 100 },
  { id: 'kill_500',       name: '千锋淬炼',     desc: '累计击杀 500 个敌人',         check: p => p.totalKills >= 500,      reward: 250 },
  { id: 'extract_5',      name: '稳健归来',     desc: '成功撤离 5 次',                check: p => p.totalExtractions >= 5,  reward: 60 },
  { id: 'level_5',        name: '回响初醒',     desc: '达到等级 5',                   check: p => p.level >= 5,             reward: 80 },
  { id: 'level_10',       name: '回响共鸣',     desc: '达到等级 10',                  check: p => p.level >= 10,            reward: 200 },
  { id: 'streak_7',       name: '七日连勤',     desc: '连续登录 7 天',                check: p => p.loginStreak >= 7,       reward: 150 },
  { id: 'streak_30',      name: '月之守望',     desc: '连续登录 30 天',               check: p => p.loginStreak >= 30,      reward: 600 },
  { id: 'unlock_skills_5', name: '回响调律师',  desc: '解锁 5 个技能',                check: p => p.unlockedSkills.length >= 5, reward: 80 },
  { id: 'sand_1000',      name: '时砂收藏家',   desc: '当前持有 1000 时砂',           check: p => p.timeSand >= 1000,       reward: 100 },
]

/** 检查并发放未领取的成就，返回新解锁的 ID 列表。 */
export function checkAndClaimAchievements(): string[] {
  const claimed = new Set(runtimeState.player.achievements)
  const newly: string[] = []
  let totalReward = 0
  for (const a of ACHIEVEMENTS) {
    if (!claimed.has(a.id) && a.check(runtimeState.player)) {
      claimed.add(a.id)
      newly.push(a.id)
      totalReward += a.reward
    }
  }
  if (newly.length === 0) return []
  runtimeState = {
    ...runtimeState,
    player: {
      ...runtimeState.player,
      achievements: Array.from(claimed),
      timeSand: runtimeState.player.timeSand + totalReward,
    },
  }
  persistState()
  return newly
}
