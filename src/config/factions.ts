import type { SkillType } from '../types/game.types'

export type FactionId = 'rectifiers' | 'weavers' | 'void_seekers'

export interface FactionDefinition {
  id: FactionId
  name: string
  nameEn: string
  description: string
  philosophy: string
  color: string
  accentColor: string
  startingSkillBonus: SkillType    // 选择该阵营时额外解锁的技能
  startingTimeSand: number
  passiveName: string
  passiveDescription: string
}

export const FACTION_DEFINITIONS: Record<FactionId, FactionDefinition> = {
  rectifiers: {
    id: 'rectifiers',
    name: '修正者',
    nameEn: 'The Rectifiers',
    description: '认为时震是错误，必须重启时间线，让宇宙回归"正确的"唯一历史。',
    philosophy: '秩序就是我们欠时间的债。',
    color: '#d4a840',
    accentColor: '#f0cc60',
    startingSkillBonus: 'headshot',
    startingTimeSand: 150,
    passiveName: '精准之誓',
    passiveDescription: '基础射击造成的伤害提升 15%，爆头弹冷却缩短 20%',
  },
  weavers: {
    id: 'weavers',
    name: '织时者',
    nameEn: 'The Weavers',
    description: '拥抱破碎，相信每个碎片都有权独立演化，致力于编织永恒的多元之网。',
    philosophy: '每一个可能性都值得在某处生长。',
    color: '#7ce0bc',
    accentColor: '#a4f0d0',
    startingSkillBonus: 'shadow_clone',
    startingTimeSand: 120,
    passiveName: '多元织法',
    passiveDescription: '回响触发概率提升 20%，回响技能伤害额外加成 10%',
  },
  void_seekers: {
    id: 'void_seekers',
    name: '虚空派',
    nameEn: 'The Void Seekers',
    description: '视时间为枷锁，追求所有时砂的彻底湮灭，让一切归于静止。',
    philosophy: '在彻底的虚无中，才有真正的自由。',
    color: '#b47cff',
    accentColor: '#d0a0ff',
    startingSkillBonus: 'teleport',
    startingTimeSand: 100,
    passiveName: '虚空漫步',
    passiveDescription: '冲刺/瞬移后获得 1.5 秒无敌帧，移动速度持续提升 10%',
  },
}

export const ALL_FACTIONS = Object.values(FACTION_DEFINITIONS)
