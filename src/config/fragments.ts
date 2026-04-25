import type { EnemyType, FragmentBiome } from '../types/game.types'

export type FragmentId = 'steam_district' | 'forest_arc' | 'cyber_sink'

export interface FragmentTheme {
  id: FragmentId
  name: string
  biome: FragmentBiome
  subtitle: string
  description: string
  difficulty: number
  backgroundKey: string
  tileKeys: string[]
  propKeys: string[]
  ambientColor: string
  extractionLabel: string
  enemyPool: EnemyType[]
}

export const FRAGMENT_THEMES: Record<FragmentId, FragmentTheme> = {
  steam_district: {
    id: 'steam_district',
    name: '蒸汽城碎片 A-17',
    biome: 'steampunk',
    subtitle: '锈蚀管道、钟楼残响与高压蒸汽构成的旧工业层',
    description: '工业遗迹，钢铁与蒸汽气息浓郁。时砂浓度高但敌人密集，适合熟练回响体。',
    difficulty: 2,
    backgroundKey: 'bg_dive',
    tileKeys: ['tile_steam_a', 'tile_steam_b', 'tile_steam_c'],
    propKeys: [
      'prop_crate_steel',
      'prop_pipe_column',
      'prop_lamp_post',
      'prop_terminal_broken',
      'prop_steam_vent',
      'prop_guild_banner',
    ],
    ambientColor: '#86a5ce',
    extractionLabel: '蒸汽列车撤离点 [E]',
    enemyPool: ['time_construct_basic', 'time_construct_heavy', 'echo_hunter', 'ancient_guardian'],
  },
  forest_arc: {
    id: 'forest_arc',
    name: '荧冠林地 B-09',
    biome: 'magic_forest',
    subtitle: '菌伞林冠覆盖空岛边缘，时砂结晶沿树根发光',
    description: '开阔的魔法森林空岛，视野宽广。敌人移速快但HP低，推荐新手入门。',
    difficulty: 1,
    backgroundKey: 'bg_forest',
    tileKeys: ['tile_forest_a', 'tile_forest_b', 'tile_forest_c'],
    propKeys: [
      'prop_fungal_tree',
      'prop_time_crystal',
      'prop_crystal_pool',
      'prop_guild_banner',
    ],
    ambientColor: '#9ee0b2',
    extractionLabel: '根脉传送圈 [E]',
    enemyPool: ['time_wraith', 'void_drone', 'echo_hunter', 'ancient_guardian'],
  },
  cyber_sink: {
    id: 'cyber_sink',
    name: '赛博塌陷区 C-21',
    biome: 'cyber_wasteland',
    subtitle: '霓虹残影与断裂高架桥交叠，广告光污染吞没夜空',
    description: '地形复杂，敌人AI进化版本。时砂奖励丰厚，需要精准的回响技巧才能存活。',
    difficulty: 3,
    backgroundKey: 'bg_cyber',
    tileKeys: ['tile_cyber_a', 'tile_cyber_b', 'tile_cyber_c'],
    propKeys: [
      'prop_neon_sign',
      'prop_terminal_broken',
      'prop_hover_car',
      'prop_lamp_post',
      'prop_crate_steel',
    ],
    ambientColor: '#c68cff',
    extractionLabel: '下行电梯撤离点 [E]',
    enemyPool: ['void_drone', 'echo_hunter', 'time_construct_basic', 'ancient_guardian'],
  },
}

export const FRAGMENT_OPTIONS = Object.values(FRAGMENT_THEMES)
