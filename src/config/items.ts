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

// ─── 武器系统 ──────────────────────────────────────────────────────
export type WeaponId = 'pulse_pistol' | 'void_smg' | 'chrono_shotgun' | 'echo_sniper'
export type AttachmentId =
  | 'carbon_barrel' | 'plasma_barrel'
  | 'reflex_scope'  | 'hawk_scope'
  | 'rapid_mag'     | 'drum_mag'
  | 'stabilizer'    | 'precision_stock'
export type AttachmentSlot = 'barrel' | 'scope' | 'magazine' | 'stock'

export interface WeaponDef {
  id: WeaponId
  name: string
  desc: string
  rarity: ItemRarity
  spriteKey: string
  baseDamage: number     // 单发基础伤害
  fireRateMs: number     // 射击间隔（毫秒）
  baseCritChance: number // 基础暴击率 0~1
  pellets?: number       // 霰弹枪：每次射击弹片数
  spreadAngle?: number   // 弹片散布角（弧度，仅 pellets>1）
  attachmentSlots: number
  weight: number
}

export interface AttachmentDef {
  id: AttachmentId
  name: string
  desc: string
  rarity: ItemRarity
  spriteKey: string
  slotType: AttachmentSlot
  damageMult?: number
  fireRateMult?: number  // <1 = 射速更快
  critBonus?: number
  weight: number
}

export const WEAPON_DEFINITIONS: Record<WeaponId, WeaponDef> = {
  pulse_pistol: {
    id: 'pulse_pistol', name: '脉冲手枪', rarity: 'common',
    desc: '标准配备，射速均衡', spriteKey: 'weapon_pistol',
    baseDamage: 12, fireRateMs: 150, baseCritChance: 0.08,
    attachmentSlots: 1, weight: 30,
  },
  void_smg: {
    id: 'void_smg', name: '虚空冲锋枪', rarity: 'uncommon',
    desc: '射速极快，适合连续输出', spriteKey: 'weapon_smg',
    baseDamage: 7, fireRateMs: 80, baseCritChance: 0.05,
    attachmentSlots: 2, weight: 15,
  },
  chrono_shotgun: {
    id: 'chrono_shotgun', name: '时序霰弹枪', rarity: 'rare',
    desc: '近距离爆发，散射 3 枚弹片', spriteKey: 'weapon_shotgun',
    baseDamage: 14, fireRateMs: 700, baseCritChance: 0.15,
    pellets: 3, spreadAngle: 0.40,
    attachmentSlots: 2, weight: 8,
  },
  echo_sniper: {
    id: 'echo_sniper', name: '回响狙击枪', rarity: 'legendary',
    desc: '极高单发伤害与暴击率', spriteKey: 'weapon_sniper',
    baseDamage: 45, fireRateMs: 1400, baseCritChance: 0.30,
    attachmentSlots: 3, weight: 3,
  },
}

export const ATTACHMENT_DEFINITIONS: Record<AttachmentId, AttachmentDef> = {
  carbon_barrel:   { id: 'carbon_barrel',   name: '碳纤枪管',   rarity: 'uncommon', slotType: 'barrel',   spriteKey: 'att_barrel',   desc: '伤害 +15%',            damageMult: 1.15, weight: 20 },
  plasma_barrel:   { id: 'plasma_barrel',   name: '等离子枪管', rarity: 'rare',     slotType: 'barrel',   spriteKey: 'att_barrel',   desc: '伤害 +30%',            damageMult: 1.30, weight: 10 },
  reflex_scope:    { id: 'reflex_scope',    name: '反射瞄准镜', rarity: 'uncommon', slotType: 'scope',    spriteKey: 'att_scope',    desc: '暴击 +12%',            critBonus: 0.12, weight: 20 },
  hawk_scope:      { id: 'hawk_scope',      name: '鹰眼瞄准镜', rarity: 'rare',     slotType: 'scope',    spriteKey: 'att_scope',    desc: '暴击 +22%',            critBonus: 0.22, weight: 10 },
  rapid_mag:       { id: 'rapid_mag',       name: '速射弹匣',   rarity: 'uncommon', slotType: 'magazine', spriteKey: 'att_magazine', desc: '射速 +18%',            fireRateMult: 0.82, weight: 20 },
  drum_mag:        { id: 'drum_mag',        name: '鼓形弹匣',   rarity: 'rare',     slotType: 'magazine', spriteKey: 'att_magazine', desc: '射速 +30%',            fireRateMult: 0.70, weight: 10 },
  stabilizer:      { id: 'stabilizer',      name: '稳定器',     rarity: 'uncommon', slotType: 'stock',    spriteKey: 'att_stock',    desc: '暴击 +6%，伤害 +8%',  critBonus: 0.06, damageMult: 1.08, weight: 20 },
  precision_stock: { id: 'precision_stock', name: '精准枪托',   rarity: 'rare',     slotType: 'stock',    spriteKey: 'att_stock',    desc: '暴击 +10%，伤害 +15%', critBonus: 0.10, damageMult: 1.15, weight: 10 },
}

export const MAX_ATTACHMENTS = 3

// ─── 武器掉落 ────────────────────────────────────────────
const WEAPON_LIST = Object.values(WEAPON_DEFINITIONS)
const W_COMMON    = WEAPON_LIST.filter(w => w.rarity === 'common')
const W_UNCOMMON  = WEAPON_LIST.filter(w => w.rarity === 'uncommon')
const W_RARE      = WEAPON_LIST.filter(w => w.rarity === 'rare')
const W_LEGENDARY = WEAPON_LIST.filter(w => w.rarity === 'legendary')

function wPickWeapon(pool: WeaponDef[]): WeaponDef {
  const total = pool.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const w of pool) { r -= w.weight; if (r <= 0) return w }
  return pool[pool.length - 1]
}

export function rollWeaponDrop(isBoss: boolean, isElite: boolean): WeaponDef | null {
  const r = Math.random()
  if (isBoss) {
    if (r > 0.65) return null
    const q = Math.random()
    if (q < 0.15) return wPickWeapon(W_LEGENDARY)
    if (q < 0.55) return wPickWeapon(W_RARE)
    return wPickWeapon(W_UNCOMMON)
  }
  if (isElite) {
    if (r > 0.25) return null
    const q = Math.random()
    if (q < 0.10) return wPickWeapon(W_LEGENDARY)
    if (q < 0.40) return wPickWeapon(W_RARE)
    return wPickWeapon(W_UNCOMMON)
  }
  if (r > 0.04) return null
  return wPickWeapon(W_COMMON)
}

// ─── 配件掉落 ────────────────────────────────────────────
const ATT_LIST     = Object.values(ATTACHMENT_DEFINITIONS)
const ATT_UNCOMMON = ATT_LIST.filter(a => a.rarity === 'uncommon')
const ATT_RARE     = ATT_LIST.filter(a => a.rarity === 'rare')

function wPickAtt(pool: AttachmentDef[]): AttachmentDef {
  const total = pool.reduce((s, a) => s + a.weight, 0)
  let r = Math.random() * total
  for (const a of pool) { r -= a.weight; if (r <= 0) return a }
  return pool[pool.length - 1]
}

export function rollAttachmentDrop(isBoss: boolean, isElite: boolean): AttachmentDef | null {
  const r = Math.random()
  if (isBoss) {
    if (r > 0.75) return null
    return Math.random() < 0.4 ? wPickAtt(ATT_RARE) : wPickAtt(ATT_UNCOMMON)
  }
  if (isElite) {
    if (r > 0.35) return null
    return Math.random() < 0.25 ? wPickAtt(ATT_RARE) : wPickAtt(ATT_UNCOMMON)
  }
  if (r > 0.06) return null
  return wPickAtt(ATT_UNCOMMON)
}

export const BAG_CAPACITY = 6
