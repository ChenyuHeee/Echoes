import type { EnemyType, FragmentBiome } from '../types/game.types'

export type FragmentId = 'steam_district' | 'forest_arc' | 'cyber_sink'

export interface FragmentTheme {
  id: FragmentId
  name: string
  biome: FragmentBiome
  subtitle: string
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
