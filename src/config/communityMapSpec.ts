/**
 * ═══════════════════════════════════════════════════════════════
 *   《回响：破碎时间》  时序密室  ·  社区征稿地图格式规格  v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * 投稿指南
 * --------
 * 1. 按此文件中的 CommunityMap 类型创建一个 JSON 文件
 * 2. 世界坐标范围：x ∈ [0, 960]，y ∈ [40, 510]（上下各留 Header/Footer 40px）
 * 3. 所有元素坐标使用中心点（cx, cy），宽高为全尺寸
 * 4. 元素 id 字段在同一地图内必须唯一（用于开关/压力板联动）
 * 5. 难度 1-5，1 = 新手教学，5 = 高难度挑战
 * 6. sandReward 建议范围：难度1→20, 难度3→40, 难度5→60
 *
 * 玩家操作
 * --------
 *   WASD   — 移动
 *   Q      — 发射传送门（需地图包含 portal_surface 元素）
 *   走近   — 踩踏板 / 收集钥匙 / 触发开关（自动触发，无需按键）
 */

// ── 元素类型枚举 ───────────────────────────────────────────────

export type ElementType =
  | 'wall'           // 静态障碍墙（可用于构建迷宫）
  | 'pad'            // 回响踏板（走上触发，记录时间戳）
  | 'door'           // 回响门（pad 时序同步后开启）
  | 'teleporter'     // 固定传送点（走上即传送到目标点）
  | 'box'            // 可推动木箱（推到压力板上激活）
  | 'pressure_plate' // 压力板（仅箱子触发，非玩家）
  | 'switch'         // 开关（玩家走上触发，切换联动元素）
  | 'trap'           // 陷阱（接触即死亡，重置关卡）
  | 'elevator'       // 移动平台（沿路径点往返运动）
  | 'timed_door'     // 时控门（按周期自动开关）
  | 'conveyor'       // 传送带（施加方向速度）
  | 'key_item'       // 钥匙道具（拾取后永久持有）
  | 'key_door'       // 锁门（需对应钥匙道具才能开启）
  | 'portal_surface' // 可放置传送门的墙面（Q 键发射）
  | 'label'          // 世界内文字提示

// ── 各元素类型的详细字段 ───────────────────────────────────────

/** 静态障碍墙。堆叠多个可拼出迷宫。玩家、箱子均无法穿越。 */
export interface WallElement {
  type: 'wall'
  /** 中心 X（0-960） */
  x: number
  /** 中心 Y（40-510） */
  y: number
  /** 宽度（推荐 ≥16）*/
  w: number
  /** 高度（推荐 ≥16）*/
  h: number
  /** 十六进制颜色，如 "#2a3848"，默认深青灰 */
  color?: string
}

/** 回响踏板。走上后记录激活时间戳，同时将其 id 写入回响记忆。
 *  下一次踩另一个踏板时，会回响触发本踏板（120ms 延迟）。
 *  若设 trapPad:true，则踩下会覆盖回响记忆但不计入有效触发序列（障碍踏板）。 */
export interface PadElement {
  type: 'pad'
  /** 踏板唯一标识，供 door.requires 引用 */
  id: string
  x: number
  y: number
  /** 显示颜色（十六进制），建议用颜色区分踏板用途 */
  color: string
  /** 若为 true，踩下会覆盖回响记忆，干扰玩家 */
  trapPad?: boolean
}

/** 回响门。当 requires 中列出的踏板激活时间戳全部落在 windowMs 范围内时开启。
 *  支持 id 字段，供 switch / pressure_plate 的 linksTo 引用（直接切换状态）。 */
export interface DoorElement {
  type: 'door'
  x: number
  y: number
  w: number
  h: number
  /** 所需踏板 id 列表，可重复（如 ["A","A"] 表示需踩 A 两次）*/
  requires: string[]
  /** 同步窗口（毫秒），所有激活时间戳的最大差值 ≤ windowMs 时开门 */
  windowMs: number
  /** 可选：让开关 / 压力板通过此 id 联动 */
  id?: string
}

/** 固定传送点对。走上 tp1 → 传送到 tp2 所在位置（反向同理）。 */
export interface TeleporterElement {
  type: 'teleporter'
  /** 每个传送点需有唯一 id */
  id: string
  x: number
  y: number
  /** 另一个传送点的 id */
  targetId: string
  /** 传送后的冷却时间（ms），防止反复横跳，默认 1200 */
  cooldown?: number
  /** 颜色，默认青色 "#00e8ff" */
  color?: string
}

/** 可推动木箱。玩家走向箱子可将其推动；箱子碰到墙壁会停止。
 *  推上压力板后激活对应联动元素。 */
export interface BoxElement {
  type: 'box'
  /** 可选 id，供压力板 linksTo 区分是哪个箱子 */
  id?: string
  x: number
  y: number
  /** 默认 36×36 */
  w?: number
  h?: number
}

/** 压力板。只有木箱压上时才激活；箱子移离后停用。
 *  可联动多个元素（门、陷阱、时控门等）。 */
export interface PressurePlateElement {
  type: 'pressure_plate'
  id: string
  x: number
  y: number
  /** 联动的元素 id 列表（按 id 找到 door/timed_door/trap 并切换状态）*/
  linksTo: string[]
  /** 是否需要多块压力板全部激活才联动（默认 false，单块即可）*/
  requireAll?: boolean
  /** 颜色，默认橙色 "#ff9040" */
  color?: string
}

/** 开关。玩家走过即触发；再次走过再次触发（toggle 模式）。 */
export interface SwitchElement {
  type: 'switch'
  id?: string
  x: number
  y: number
  /** 联动的元素 id 列表 */
  linksTo: string[]
  /** "toggle"（切换）| "once"（只触发一次，默认 toggle）*/
  mode?: 'toggle' | 'once'
  /** 颜色，默认黄绿 "#c0e040" */
  color?: string
}

/** 陷阱。接触即死亡（重置到出生点，扣时砂）。
 *  可通过 id 被开关开/关（active 初始状态）。 */
export interface TrapElement {
  type: 'trap'
  id?: string
  x: number
  y: number
  w: number
  h: number
  /** "spike"（刺坑）| "void"（虚空）| "laser"（激光束）*/
  trapType: 'spike' | 'void' | 'laser'
  /** 初始是否激活，默认 true */
  active?: boolean
}

/** 移动平台（电梯）。在 path 路径点之间往返运动；玩家站上会被携带。
 *  电梯本身作为墙壁存在，可阻挡玩家、推动箱子。 */
export interface ElevatorElement {
  type: 'elevator'
  id?: string
  /** 第一个路径点同时也是初始位置（x,y 为平台中心）*/
  x: number
  y: number
  w: number
  h: number
  /** 完整路径点数组（含起始点），至少两个点 */
  path: Array<{ x: number; y: number }>
  /** 移动速度（像素/秒），推荐 60-180 */
  speed: number
  /** 到达端点后的等待时间（ms），默认 500 */
  waitMs?: number
}

/** 时控门。按照 openMs/closeMs 周期自动开关；可被开关强制切换。 */
export interface TimedDoorElement {
  type: 'timed_door'
  id?: string
  x: number
  y: number
  w: number
  h: number
  /** 开启持续时间（ms）*/
  openMs: number
  /** 关闭持续时间（ms）*/
  closeMs: number
  /** 初始状态，默认 "closed" */
  initialState?: 'open' | 'closed'
  /** 相位偏移（ms），错开多扇时控门的节奏 */
  phaseOffset?: number
}

/** 传送带。玩家/箱子踩上后被施加额外速度。 */
export interface ConveyorElement {
  type: 'conveyor'
  x: number
  y: number
  w: number
  h: number
  /** 施加给玩家的 X 轴额外速度（正=右，负=左）*/
  vx: number
  /** 施加给玩家的 Y 轴额外速度（正=下，负=上）*/
  vy: number
  /** 颜色，默认深蓝灰 "#203848" */
  color?: string
}

/** 钥匙道具。走近自动拾取，持久保存在玩家背包。 */
export interface KeyItemElement {
  type: 'key_item'
  /** 唯一 id，与 key_door.keyId 对应 */
  id: string
  x: number
  y: number
  /** 颜色，默认金色 "#f0c840" */
  color?: string
}

/** 锁门。玩家持有 keyId 对应的钥匙后自动开启。 */
export interface KeyDoorElement {
  type: 'key_door'
  id?: string
  x: number
  y: number
  w: number
  h: number
  /** 对应 key_item 的 id */
  keyId: string
  /** 颜色，默认金色 */
  color?: string
}

/** 可放置传送门的墙面。按 Q 向此墙面方向发射传送门，
 *  蓝门(第1次)与橙门(第2次)各占一个槽位，进入其中一个即传送到另一个。 */
export interface PortalSurfaceElement {
  type: 'portal_surface'
  /** 同一地图内唯一 */
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** 世界内文字标签，可用于提示、剧情、机关说明。 */
export interface LabelElement {
  type: 'label'
  x: number
  y: number
  text: string
  /** 颜色，默认灰蓝 "#607080" */
  color?: string
  /** 字号（px），默认 11 */
  fontSize?: number
}

// ── 联合类型 ───────────────────────────────────────────────────

export type MapElement =
  | WallElement | PadElement | DoorElement | TeleporterElement
  | BoxElement | PressurePlateElement | SwitchElement | TrapElement
  | ElevatorElement | TimedDoorElement | ConveyorElement
  | KeyItemElement | KeyDoorElement | PortalSurfaceElement | LabelElement

// ── 地图根结构 ─────────────────────────────────────────────────

/**
 * 社区地图根对象。直接对应一个 JSON 文件。
 *
 * 最小可玩地图只需：name / author / spawn / exit / elements（至少一个 pad + door）。
 */
export interface CommunityMap {
  /** 地图唯一标识（英文+下划线，如 "my_maze_01"）*/
  id: string
  /** 规格版本，固定填 "1.0" */
  version: '1.0'
  /** 地图展示名称 */
  name: string
  /** 作者名 */
  author: string
  /** 一句话描述 */
  description: string
  /** 游戏内提示（HUD 底部显示）*/
  hint: string
  /** 难度 1-5 */
  difficulty: 1 | 2 | 3 | 4 | 5
  /** 是否双人模式 */
  coop: boolean
  /** 完成后获得的时砂奖励（建议 20-60）*/
  sandReward: number
  /** 玩家出生点 */
  spawn: { x: number; y: number }
  /** 出口传送门位置（所有门开启 + 条件满足后出现）*/
  exit: { x: number; y: number }
  /** 所有地图元素列表（顺序不影响加载结果）*/
  elements: MapElement[]
}
