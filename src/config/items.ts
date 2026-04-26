// ─── 深潜装备系统 ─────────────────────────────────────────────────
// 装备在战斗中从敌人身上掉落，存入背包（最多6格）
// 效果仅在当次深潜中生效，撤离/阵亡后清除

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export type ItemId =
  | 'rusty_blade'
  | 'resonance_coil'
  | 'void_shard'
  | 'overclock_chip'
  | 'time_weave_vest'
  | 'echo_shield'
  | 'nanite_patch'
  | 'drift_boots'
  | 'chrono_lens'
  | 'sand_magnet'
  | 'echo_crystal_core'
  | 'paradox_engine'

export interface ItemDef {
  id: ItemId
  name: string
  desc: string
  rarity: ItemRarity
  spriteKey: string
  /** 伤害倍率（乘积叠加，1.15 = +15%） */
  damageMult?: number
  /** 速度倍率 */
  speedMult?: number
  /** 最大 HP 加成（固定值） */
  maxHpBonus?: number
  /** 时砂磁吸半径倍率 */
  magnetRadiusMult?: number
  /** 回响技能伤害倍率（仅 isEcho 子弹） */
  echoSkillMult?: number
  /** 每次造成伤害时回血百分比 0~1 */
  lifesteal?: number
  /** 每秒被动回血量 */
  regenPerSec?: number
  /** 暴击概率 0~1（触发时伤害 ×2） */
  critChance?: number
  /** 回响盾：每 N 毫秒格挡一次伤害 */
  shieldCooldownMs?: number
  /** 悖论引擎：每次击杀有概率触发链式闪电 0~1 */
  paradoxChainChance?: number
  /** 掉落权重 */
  weight: number
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDef> = {
  // ─── Common ───────────────────────────────────────
  rusty_blade: {
    id: 'rusty_blade', name: '锈蚀刀片', rarity: 'common',
    desc: '伤害 +15%',
    spriteKey: 'item_rusty_blade', damageMult: 1.15, weight: 30,
  },
  sand_magnet: {
    id: 'sand_magnet', name: '时砂磁铁', rarity: 'common',
    desc: '时砂磁吸范围 ×2',
    spriteKey: 'item_sand_magnet', magnetRadiusMult: 2.0, weight: 30,
  },
  nanite_patch: {
    id: 'nanite_patch', name: '纳米胶布', rarity: 'common',
    desc: '每秒回血 2 HP',
    spriteKey: 'item_nanite_patch', regenPerSec: 2, weight: 25,
  },

  // ─── Uncommon ─────────────────────────────────────
  resonance_coil: {
    id: 'resonance_coil', name: '共鸣线圈', rarity: 'uncommon',
    desc: '回响技能伤害 +30%',
    spriteKey: 'item_resonance_coil', echoSkillMult: 1.30, weight: 15,
  },
  drift_boots: {
    id: 'drift_boots', name: '漂移靴', rarity: 'uncommon',
    desc: '移动速度 +20%',
    spriteKey: 'item_drift_boots', speedMult: 1.20, weight: 15,
  },
  chrono_lens: {
    id: 'chrono_lens', name: '时相镜', rarity: 'uncommon',
    desc: '暴击率 +12%',
    spriteKey: 'item_chrono_lens', critChance: 0.12, weight: 15,
  },
  time_weave_vest: {
    id: 'time_weave_vest', name: '时编护甲', rarity: 'uncommon',
    desc: '最大 HP +40',
    spriteKey: 'item_time_weave_vest', maxHpBonus: 40, weight: 14,
  },

  // ─── Rare ─────────────────────────────────────────
  void_shard: {
    id: 'void_shard', name: '虚空碎片', rarity: 'rare',
    desc: '伤害 +25%，造成伤害回血 8%',
    spriteKey: 'item_void_shard', damageMult: 1.25, lifesteal: 0.08, weight: 8,
  },
  overclock_chip: {
    id: 'overclock_chip', name: '超频芯片', rarity: 'rare',
    desc: '伤害 +20%，速度 +10%',
    spriteKey: 'item_overclock_chip', damageMult: 1.20, speedMult: 1.10, weight: 8,
  },
  echo_shield: {
    id: 'echo_shield', name: '回响盾', rarity: 'rare',
    desc: '每 8 秒格挡一次伤害',
    spriteKey: 'item_echo_shield', shieldCooldownMs: 8000, weight: 7,
  },

  // ─── Legendary ────────────────────────────────────
  echo_crystal_core: {
    id: 'echo_crystal_core', name: '回响晶核', rarity: 'legendary',
    desc: '回响技能伤害 ×2，普通伤害 +15%',
    spriteKey: 'item_echo_crystal_core', echoSkillMult: 2.0, damageMult: 1.15, weight: 3,
  },
  paradox_engine: {
    id: 'paradox_engine', name: '悖论引擎', rarity: 'legendary',
    desc: '击杀时 30% 触发免费链式闪电',
    spriteKey: 'item_paradox_engine', paradoxChainChance: 0.30, weight: 2,
  },
}

export const RARITY_COLORS: Record<ItemRarity, number> = {
  common:    0x607080,
  uncommon:  0x2060c0,
  rare:      0x8030c0,
  legendary: 0xc09020,
}

export const RARITY_NAMES: Record<ItemRarity, string> = {
  common:    '普通',
  uncommon:  '精良',
  rare:      '稀有',
  legendary: '传说',
}

// 掉落权重总表（普通敌人用）
const ALL_ITEMS = Object.values(ITEM_DEFINITIONS)
const COMMON_POOL    = ALL_ITEMS.filter(i => i.rarity === 'common')
const UNCOMMON_POOL  = ALL_ITEMS.filter(i => i.rarity === 'uncommon')
const RARE_POOL      = ALL_ITEMS.filter(i => i.rarity === 'rare')
const LEGENDARY_POOL = ALL_ITEMS.filter(i => i.rarity === 'legendary')

function weightedPick(pool: ItemDef[]): ItemDef {
  const total = pool.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of pool) {
    r -= item.weight
    if (r <= 0) return item
  }
  return pool[pool.length - 1]
}

/**
 * 根据敌人类型决定是否掉落装备，以及掉落什么
 * @returns ItemDef | null
 */
export function rollItemDrop(isBoss: boolean, isElite: boolean): ItemDef | null {
  const r = Math.random()
  if (isBoss) {
    // Boss 必然掉落：60% rare, 30% uncommon, 10% legendary
    const q = Math.random()
    if (q < 0.10) return weightedPick(LEGENDARY_POOL)
    if (q < 0.70) return weightedPick(RARE_POOL)
    return weightedPick(UNCOMMON_POOL)
  }
  if (isElite) {
    // Elite 35% 掉落：50% uncommon, 35% rare, 15% legendary
    if (r > 0.35) return null
    const q = Math.random()
    if (q < 0.15) return weightedPick(LEGENDARY_POOL)
    if (q < 0.50) return weightedPick(RARE_POOL)
    return weightedPick(UNCOMMON_POOL)
  }
  // 普通敌人 12% 掉落：80% common, 18% uncommon, 2% rare
  if (r > 0.12) return null
  const q = Math.random()
  if (q < 0.02) return weightedPick(RARE_POOL)
  if (q < 0.20) return weightedPick(UNCOMMON_POOL)
  return weightedPick(COMMON_POOL)
}

export const BAG_CAPACITY = 6
