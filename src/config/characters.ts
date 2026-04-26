// ─── 角色系统 ─────────────────────────────────────────────────────
// 每个角色拥有：初始武器、基础属性差异、专属被动、专属主动技能（Q键）

import type { SkillType } from '../types/game.types'
import type { WeaponId } from './items'

export type CharacterId =
  | 'echo_ranger'       // 时间游侠 — 均衡型
  | 'void_breaker'      // 虚空破碎者 — 攻击型
  | 'chrono_sentinel'   // 时序哨兵 — 控制型
  | 'echo_phantom'      // 回响幻影 — 速度型
  | 'iron_warden'       // 铁甲守卫 — 防御型

export interface CharacterDef {
  id: CharacterId
  name: string
  nameEn: string
  lore: string                // 一句话背景
  role: string                // 定位标签
  roleColor: string           // 定位颜色

  /** 初始武器 */
  startWeapon: WeaponId

  /** 基础属性（相对于默认值的差异） */
  baseHp: number              // 默认 120
  baseSpeed: number           // 默认 1.0（倍率）
  baseDamage: number          // 默认 1.0（倍率）

  /** 专属被动描述 */
  passiveName: string
  passiveDesc: string

  /** 专属主动技能（Q键） */
  uniqueSkill: {
    name: string
    desc: string
    cooldownMs: number
    element: string           // 技能元素颜色
    iconColor: number         // Phaser hex
  }

  /** 解锁条件（null = 初始可用） */
  unlockRequirement: string | null

  spriteKey: string           // Phaser 贴图 key（头像/预览）
  accentColor: string         // 主题色
}

// ─── 专属主动技能 ID（与 SkillType 分离，避免冲突） ──────────────
export type CharacterSkillId =
  | 'time_rewind'     // 时间游侠：时间回溯 — 瞬间回到 3 秒前的位置，期间无敌
  | 'void_rupture'    // 虚空破碎者：虚空爆裂 — 在光标位置生成爆炸，击飞周围敌人
  | 'temporal_freeze' // 时序哨兵：时序冻结 — 冻结屏幕内所有敌人 2 秒
  | 'shadow_step'     // 回响幻影：幻影步 — 留下残影，自身瞬移到光标位置并短暂隐身
  | 'iron_bastion'    // 铁甲守卫：铁甲堡垒 — 4 秒内减伤 70%，并对贴近的敌人造成反伤

// ─── 角色定义 ─────────────────────────────────────────────────────
export const CHARACTER_DEFINITIONS: Record<CharacterId, CharacterDef> = {
  echo_ranger: {
    id: 'echo_ranger',
    name: '时间游侠',
    nameEn: 'Echo Ranger',
    lore: '穿梭于时间裂缝间的猎手，以回响为武器对抗虚空。',
    role: '均衡',
    roleColor: '#7ce0bc',
    startWeapon: 'pulse_pistol',
    baseHp: 120,
    baseSpeed: 1.0,
    baseDamage: 1.0,
    passiveName: '回响亲和',
    passiveDesc: '技能回响触发时，额外恢复 5 HP。',
    uniqueSkill: {
      name: '时间回溯',
      desc: '瞬间传送回 3 秒前所在位置，传送期间无敌。',
      cooldownMs: 8000,
      element: '#88ccff',
      iconColor: 0x88ccff,
    },
    unlockRequirement: null,
    spriteKey: 'char_echo_ranger',
    accentColor: '#7ce0bc',
  },

  void_breaker: {
    id: 'void_breaker',
    name: '虚空破碎者',
    nameEn: 'Void Breaker',
    lore: '从虚空深渊归来的战士，以毁灭换取力量。',
    role: '攻击',
    roleColor: '#e0607c',
    startWeapon: 'void_smg',
    baseHp: 95,
    baseSpeed: 1.05,
    baseDamage: 1.35,
    passiveName: '虚空侵蚀',
    passiveDesc: '每次击杀使下一次攻击伤害 +8%，最多叠加 5 层。',
    uniqueSkill: {
      name: '虚空爆裂',
      desc: '在光标位置释放虚空爆炸，对范围内敌人造成大量伤害并击飞。',
      cooldownMs: 10000,
      element: '#cc44ff',
      iconColor: 0xcc44ff,
    },
    unlockRequirement: '完成 5 次深潜撤离',
    spriteKey: 'char_void_breaker',
    accentColor: '#cc44ff',
  },

  chrono_sentinel: {
    id: 'chrono_sentinel',
    name: '时序哨兵',
    nameEn: 'Chrono Sentinel',
    lore: '守护时间节点的精英，用控制代替杀戮。',
    role: '控制',
    roleColor: '#60b0e0',
    startWeapon: 'chrono_shotgun',
    baseHp: 110,
    baseSpeed: 0.9,
    baseDamage: 0.95,
    passiveName: '时序感知',
    passiveDesc: '命中减速的敌人时，伤害提升 20%。',
    uniqueSkill: {
      name: '时序冻结',
      desc: '冻结屏幕内所有敌人 2 秒，期间它们无法行动和攻击。',
      cooldownMs: 14000,
      element: '#44ccff',
      iconColor: 0x44ccff,
    },
    unlockRequirement: '收集 3 枚回响水晶',
    spriteKey: 'char_chrono_sentinel',
    accentColor: '#44ccff',
  },

  echo_phantom: {
    id: 'echo_phantom',
    name: '回响幻影',
    nameEn: 'Echo Phantom',
    lore: '以速度为盾，以残影为剑，令敌人无从捉摸。',
    role: '速度',
    roleColor: '#e0c060',
    startWeapon: 'void_smg',
    baseHp: 90,
    baseSpeed: 1.35,
    baseDamage: 0.9,
    passiveName: '幻影残像',
    passiveDesc: '快速移动时每 1.5 秒在原地留下残影，可吸引敌人攻击。',
    uniqueSkill: {
      name: '幻影步',
      desc: '留下原地残影，自身瞬移到光标位置并隐身 1.5 秒。',
      cooldownMs: 9000,
      element: '#f0e040',
      iconColor: 0xf0e040,
    },
    unlockRequirement: '总击杀数达到 100',
    spriteKey: 'char_echo_phantom',
    accentColor: '#e0c060',
  },

  iron_warden: {
    id: 'iron_warden',
    name: '铁甲守卫',
    nameEn: 'Iron Warden',
    lore: '无坚不摧的战场堡垒，用铁血意志抵御一切。',
    role: '防御',
    roleColor: '#a08060',
    startWeapon: 'chrono_shotgun',
    baseHp: 180,
    baseSpeed: 0.82,
    baseDamage: 1.1,
    passiveName: '铁甲之躯',
    passiveDesc: '受到伤害时有 15% 概率完全免疫，并恢复 5 HP。',
    uniqueSkill: {
      name: '铁甲堡垒',
      desc: '4 秒内受到的伤害减少 70%，同时对靠近的敌人造成反伤（伤害值 = 受击伤害 ×2）。',
      cooldownMs: 16000,
      element: '#ddaa44',
      iconColor: 0xddaa44,
    },
    unlockRequirement: '总深潜次数达到 10',
    spriteKey: 'char_iron_warden',
    accentColor: '#c08840',
  },
}

export const CHARACTER_LIST = Object.values(CHARACTER_DEFINITIONS)
export const DEFAULT_CHARACTER: CharacterId = 'echo_ranger'
