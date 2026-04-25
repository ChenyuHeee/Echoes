// ============================================================
// 《回响：破碎时间》核心类型定义
// ============================================================

// --- 技能系统 ---
export type SkillType =
  | 'burn_module'      // 灼烧模块
  | 'plague_module'    // 瘟疫模块
  | 'magnet_module'    // 磁力模块
  | 'teleport'         // 瞬移
  | 'headshot'         // 爆头弹
  | 'toxic_fog'        // 毒雾
  | 'shadow_clone'     // 分身
  | 'dash'             // 冲刺
  | 'gravity_well'     // 引力阱
  | 'lightning_bolt'   // 闪电弹
  | 'cryo_field'       // 冰晶域
  | 'void_pulse'       // 虚空脉冲

export type SkillElement = 'fire' | 'poison' | 'magnetic' | 'void' | 'cryo' | 'electric' | 'physical'
export type SkillTarget = 'projectile' | 'area' | 'self' | 'line'

export interface SkillDefinition {
  id: SkillType
  name: string
  description: string
  element: SkillElement
  target: SkillTarget
  cooldown: number          // ms
  echoCooldown?: number     // 被回响时的冷却（可不同）
  canBeEchoed: boolean      // 是否可以被回响复现
  echoDelay: number         // 回响触发延迟 ms
  damage?: number
  range?: number
  duration?: number         // 持续效果时长 ms
  thirdEchoTransform?: SkillType  // 第三次回响时质变成的技能
  iconFrame: number         // 图集中的帧序号
  unlockCost: number        // 解锁所需时砂（0 = 初始解锁）
  elementColor: string      // 元素颜色（用于 HUD 技能槽）
}

// --- 回响系统状态 ---
export interface EchoState {
  lastSkill: SkillType | null
  lastSkillTimestamp: number
  echoMultiplier: number     // 来自装备的回响倍率
  phantomEchoChance: number  // 虚空核心：触发上上个技能的概率
  secondToLastSkill: SkillType | null
  echoCount: number          // 当前连续回响次数（用于第三次质变判断）
}

// --- 玩家状态 ---
export interface PlayerState {
  id: string
  username: string
  hp: number
  maxHp: number
  timeSandStability: number  // 时间稳定度（战场用，替代护盾）
  maxStability: number
  x: number
  y: number
  velocityX: number
  velocityY: number
  angle: number              // 朝向角度（弧度）
  activeSkillSlots: SkillType[]  // 当前装备的 3 个技能槽
  echoState: EchoState
  isInvincible: boolean
  invincibleUntil: number
  faction: Faction | null
  equippedModules: string[]  // 装备的模块 ID
}

// --- 敌人类型 ---
export type EnemyType =
  | 'time_construct_basic'   // 基础时砂构造体
  | 'time_construct_heavy'   // 重型构造体
  | 'void_drone'             // 虚空无人机
  | 'echo_hunter'            // 回响猎手（会预判你的回响）
  | 'time_wraith'            // 时间幽灵（半透明，难以命中）
  | 'ancient_guardian'       // 上古守护者（Boss）

export interface EnemyDefinition {
  type: EnemyType
  name: string
  hp: number
  speed: number
  damage: number
  dropTable: DropEntry[]
  aggroRange: number
  attackRange: number
  attackCooldown: number
  spriteKey: string
  isBoss: boolean
}

export interface DropEntry {
  itemType: 'time_sand' | 'skill_memory' | 'module' | 'crystal'
  itemId?: string
  amount?: number
  chance: number  // 0-1
}

// --- 地图碎片 ---
export type FragmentBiome = 'steampunk' | 'magic_forest' | 'cyber_wasteland' | 'gothic_castle' | 'void_sea'

export interface MapFragment {
  id: string
  name: string
  lore: string               // 碎片背景故事
  biome: FragmentBiome
  difficulty: 1 | 2 | 3 | 4 | 5
  width: number
  height: number
  tileData: number[][]
  spawnPoints: {x: number, y: number}[]
  extractionPoints: {x: number, y: number, radius: number}[]
  enemySpawns: {type: EnemyType, x: number, y: number}[]
  crystalLocations: {x: number, y: number, crystalId: string}[]
  lorePickups: {x: number, y: number, loreId: string}[]
  ambientColor: number       // 环境光颜色（Phaser 色彩值）
  musicKey: string
}

// --- 完美回响水晶 ---
export interface PerfectEchoCrystal {
  id: string
  name: string
  rarity: 'rare' | 'epic' | 'paradox'
  lore: string
  echoEnhancement: EchoEnhancement
  sourceFragment: string
}

export interface EchoEnhancement {
  type: 'damage_multiply' | 'range_extend' | 'cooldown_reduce' | 'element_add' | 'chain_echo' | 'paradox'
  value: number
  targetSkill?: SkillType    // 影响特定技能
  description: string
}

// --- 装备模块 ---
export type Rarity = 'common' | 'rare' | 'epic' | 'paradox'

export interface EquipmentModule {
  id: string
  name: string
  lore: string
  rarity: Rarity
  slot: 'weapon' | 'armor' | 'special'
  echoModifier: EchoModifier
  statBonus: Partial<{
    hp: number
    speed: number
    damage: number
    stability: number
  }>
}

export interface EchoModifier {
  type: 'echo_damage' | 'echo_range' | 'phantom_echo' | 'double_echo' | 'echo_shield' | 'none'
  value: number
  condition?: string
}

// --- 阵营 ---
export type Faction = 'rectifiers' | 'weavers' | 'void_seekers'

export const FACTION_NAMES: Record<Faction, string> = {
  rectifiers: '修正者',
  weavers: '织时者',
  void_seekers: '虚空派'
}

// --- 多人联机 ---
export interface RoomState {
  roomId: string
  roomCode: string
  hostId: string
  players: RoomPlayer[]
  status: 'waiting' | 'in_progress' | 'finished'
  mapFragment: string
  difficulty: string
}

export interface RoomPlayer {
  playerId: string
  username: string
  isReady: boolean
  isHost: boolean
  loadout: {
    skills: SkillType[]
    modules: string[]
  }
}

// --- Realtime 广播消息类型 ---
export type BroadcastEventType =
  | 'player_move'
  | 'player_shoot'
  | 'player_skill'
  | 'player_echo'
  | 'player_death'
  | 'enemy_damage'
  | 'item_pickup'
  | 'game_state'
  | 'chat'

export interface BroadcastMessage {
  type: BroadcastEventType
  playerId: string
  timestamp: number
  payload: Record<string, unknown>
}

// --- UI 状态 ---
export interface HUDState {
  hp: number
  maxHp: number
  stability: number
  maxStability: number
  skillSlots: SkillType[]
  skillCooldowns: Record<SkillType, number>
  echoState: EchoState
  timeSand: number
  teammates?: PlayerState[]
}

// --- 故事/叙事 ---
export interface LoreEntry {
  id: string
  title: string
  content: string
  source: string  // 在哪里发现的
  faction?: Faction
  fragmentId: string
}

export interface DialogueLine {
  speaker: string
  text: string
  textEn?: string           // 英文文本，用于 TTS 配音
  voiceKey?: string
  emotion?: 'neutral' | 'urgent' | 'sad' | 'mysterious' | 'angry'
}

export interface NPCDialogue {
  npcId: string
  npcName: string
  condition?: string  // 触发条件
  lines: DialogueLine[]
}
