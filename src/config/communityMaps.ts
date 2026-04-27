/**
 * 社区征稿示例地图
 * 包含三张展示不同机制的演示地图
 */
import type { CommunityMap } from './communityMapSpec'

// ══════════════════════════════════════════════════════════════════
//  地图一：迷途·回响
//  机制：迷宫墙壁 / 回响踏板 / 固定传送点 / 陷阱
// ══════════════════════════════════════════════════════════════════
const MAP_MAZE_ECHO: CommunityMap = {
  id: 'maze_echo_01',
  version: '1.0',
  name: '迷途·回响',
  author: '官方示例',
  description: '穿越时空迷宫，找到回响序列，打开封印之门',
  hint: 'A → B 让回响帮你同步两块踏板 · 小心绕开障碍踏板 X',
  difficulty: 2,
  coop: false,
  sandReward: 30,
  spawn: { x: 60, y: 275 },
  exit: { x: 895, y: 160 },
  elements: [
    // ── 迷宫外墙（T字分隔结构）───────────────────────────────
    // 中央纵向隔墙（上半段，y=30-260）
    { type: 'wall', x: 470, y: 145, w: 16, h: 230, color: '#1e3040' },
    // 中央纵向隔墙（下半段，y=310-490）
    { type: 'wall', x: 470, y: 400, w: 16, h: 180, color: '#1e3040' },
    // → 中央通道缺口 y=260-310，玩家可从中央穿过

    // 上半横向隔断（左室）：分两段，留出 x=170-220 的缺口
    { type: 'wall', x: 100, y: 240, w: 140, h: 16, color: '#1e3040' },  // x: 30-170
    { type: 'wall', x: 305, y: 240, w: 170, h: 16, color: '#1e3040' },  // x: 220-390
    // → 缺口在 x=170-220（玩家能从此处上到 A 区域）

    // 右室横向隔断（让 B 在上区）：分两段，留 x=820-870 的缺口
    { type: 'wall', x: 640, y: 320, w: 290, h: 16, color: '#1e3040' },  // x: 495-785
    { type: 'wall', x: 905, y: 320, w: 60,  h: 16, color: '#1e3040' },  // x: 875-935
    // → 缺口在 x=785-875（玩家能从下区上来到出口）

    // 左下走廊封堵（强迫玩家绕行陷阱）
    { type: 'wall', x: 330, y: 350, w: 16, h: 120, color: '#1e3040' },

    // ── 踏板 ─────────────────────────────────────────────────
    // A：左室上区
    { type: 'pad', id: 'A', x: 200, y: 160, color: '#50e8a0' },
    // B：右室上区（回响会帮你重击 A）
    { type: 'pad', id: 'B', x: 680, y: 160, color: '#60a0ff' },
    // X：障碍踏板，挡在进入中央通道的必经处（下侧走廊）
    { type: 'pad', id: 'X', x: 470, y: 450, color: '#e05050', trapPad: true },

    // ── 回响门 ───────────────────────────────────────────────
    // 需要 A+B 在 3000ms 内同步激活
    { type: 'door', id: 'door_main', x: 840, y: 160, w: 16, h: 200,
      requires: ['A', 'B'], windowMs: 3000 },

    // ── 固定传送点 ────────────────────────────────────────────
    // 左室底部 → 右室底部（快速绕过 X 的陷阱区）
    { type: 'teleporter', id: 'tp_left',  x: 120, y: 460, targetId: 'tp_right', color: '#00e8ff', cooldown: 1500 },
    { type: 'teleporter', id: 'tp_right', x: 800, y: 460, targetId: 'tp_left',  color: '#00e8ff', cooldown: 1500 },

    // ── 陷阱 ─────────────────────────────────────────────────
    // X 踏板旁的陷阱坑
    { type: 'trap', x: 400, y: 490, w: 180, h: 18, trapType: 'void' },
    // 右室底部刺坑
    { type: 'trap', x: 700, y: 490, w: 200, h: 18, trapType: 'spike' },

    // ── 文字提示 ──────────────────────────────────────────────
    { type: 'label', x: 200, y: 100, text: '先踩 A…', color: '#405868', fontSize: 11 },
    { type: 'label', x: 680, y: 100, text: '…再踩 B，回响会帮你补上 A', color: '#405868', fontSize: 11 },
    { type: 'label', x: 120, y: 485, text: '传送', color: '#007080', fontSize: 10 },
    { type: 'label', x: 800, y: 485, text: '传送', color: '#007080', fontSize: 10 },
    { type: 'label', x: 470, y: 410, text: '⚠ 障碍踏板', color: '#803030', fontSize: 10 },
  ],
}

// ══════════════════════════════════════════════════════════════════
//  地图二：齿轮时刻
//  机制：可推木箱 / 压力板 / 移动平台 / 传送带 / 时控门 / 开关
// ══════════════════════════════════════════════════════════════════
const MAP_GEAR_MOMENT: CommunityMap = {
  id: 'gear_moment_02',
  version: '1.0',
  name: '齿轮时刻',
  author: '官方示例',
  description: '借助平台、传送带与木箱，让机关在正确的时刻同步',
  hint: '把两个木箱分别推到两块黄色压力板上 · 同时激活后中央通道开启 · 开关可临时关闭刺坑',
  difficulty: 3,
  coop: false,
  sandReward: 40,
  spawn: { x: 60, y: 270 },
  exit: { x: 480, y: 90 },
  elements: [
    // ── 房间外墙（俯视图）────────────────────────────────────────
    { type: 'wall', x: 480, y: 50,  w: 920, h: 16, color: '#182030' },  // 顶
    { type: 'wall', x: 480, y: 490, w: 920, h: 16, color: '#182030' },  // 底
    { type: 'wall', x: 24,  y: 270, w: 16,  h: 460, color: '#182030' },  // 左
    { type: 'wall', x: 936, y: 270, w: 16,  h: 460, color: '#182030' },  // 右

    // ── 把房间纵向分成 3 区：左推箱区 / 中过道 / 右推箱区 ──
    // 左隔墙（y=140-340 阻挡，下方 y=340-490 完全开放，让玩家通过）
    { type: 'wall', x: 320, y: 240, w: 16, h: 200, color: '#1e3040' },
    // 右隔墙
    { type: 'wall', x: 640, y: 240, w: 16, h: 200, color: '#1e3040' },

    // ── 顶部「中央门」墙段（位于中过道上方，挡住通往出口的最后一段）
    // 该墙段挂在 center_gate id 上，被两块压力板同时激活后消失
    { type: 'door', id: 'center_gate', x: 480, y: 140, w: 220, h: 16, requires: [], windowMs: 99999 },

    // ── 木箱（左右各一）────────────────────────────────────────
    { type: 'box', id: 'box_a', x: 140, y: 400 },
    { type: 'box', id: 'box_b', x: 820, y: 400 },

    // ── 压力板（黄色：两块同时激活才能打开 center_gate）───────
    { type: 'pressure_plate', id: 'pp_sync_l', x: 200, y: 200, linksTo: ['center_gate'], color: '#ffe060', requireAll: true },
    { type: 'pressure_plate', id: 'pp_sync_r', x: 760, y: 200, linksTo: ['center_gate'], color: '#ffe060', requireAll: true },

    // ── 中过道里的巡逻平台（增加难度，玩家要等空隙穿过）────
    {
      type: 'elevator', id: 'elev_mid_v', x: 480, y: 260, w: 60, h: 16,
      path: [{ x: 480, y: 260 }, { x: 480, y: 400 }],
      speed: 50, waitMs: 700,
    },

    // ── 中过道的刺坑（开关可暂时关闭）────────────────────────
    { type: 'switch', x: 420, y: 460, linksTo: ['trap_mid'], color: '#c0e040' },
    { type: 'trap', id: 'trap_mid', x: 540, y: 460, w: 100, h: 16, trapType: 'spike', active: true },

    // ── 文字提示 ──────────────────────────────────────────────
    { type: 'label', x: 140, y: 360, text: '推→', color: '#405060', fontSize: 11 },
    { type: 'label', x: 820, y: 360, text: '←推', color: '#405060', fontSize: 11 },
    { type: 'label', x: 200, y: 168, text: '黄·压力板', color: '#806030', fontSize: 10 },
    { type: 'label', x: 760, y: 168, text: '黄·压力板', color: '#806030', fontSize: 10 },
    { type: 'label', x: 420, y: 442, text: '⚡开关', color: '#608030', fontSize: 10 },
    { type: 'label', x: 540, y: 442, text: '⚠ 刺', color: '#803030', fontSize: 10 },
    { type: 'label', x: 480, y: 110, text: '中央门（双压力板同时激活）', color: '#807030', fontSize: 10 },
  ],
}

// ══════════════════════════════════════════════════════════════════
//  地图三：量子试炼
//  机制：传送门 / 钥匙收集 / 开关联动 / 全元素综合
// ══════════════════════════════════════════════════════════════════
const MAP_QUANTUM_TRIAL: CommunityMap = {
  id: 'quantum_trial_03',
  version: '1.0',
  name: '量子试炼',
  author: '官方示例',
  description: '用传送门穿越虚空，收集量子钥匙，解开时间封印',
  hint: 'Q 键对准墙面发射传送门 · 蓝门→橙门，橙门→蓝门 · 收集全部钥匙',
  difficulty: 4,
  coop: false,
  sandReward: 55,
  spawn: { x: 60, y: 440 },
  exit: { x: 895, y: 440 },
  elements: [
    // ── 房间结构 ──────────────────────────────────────────────
    // 下层地板
    { type: 'wall', x: 480, y: 490, w: 960, h: 16, color: '#0c1428' },
    // 上层天花板
    { type: 'wall', x: 480, y: 56, w: 960, h: 16, color: '#0c1428' },
    // 左墙
    { type: 'wall', x: 16, y: 275, w: 16, h: 432, color: '#0c1428' },
    // 右墙
    { type: 'wall', x: 944, y: 275, w: 16, h: 432, color: '#0c1428' },

    // 三个内部隔间墙（创建四个区域）
    { type: 'wall', x: 240, y: 300, w: 16, h: 380, color: '#1a2840' },
    { type: 'wall', x: 480, y: 300, w: 16, h: 380, color: '#1a2840' },
    { type: 'wall', x: 720, y: 300, w: 16, h: 380, color: '#1a2840' },
    // 各隔间上部连通（门洞在底部）

    // 上层中间平台
    { type: 'wall', x: 360, y: 200, w: 200, h: 16, color: '#1a2840' },
    { type: 'wall', x: 600, y: 200, w: 200, h: 16, color: '#1a2840' },

    // ── 传送门可放置面 ────────────────────────────────────────
    // 第一区左墙（可放传送门）
    { type: 'portal_surface', id: 'ps_wall_l1', x: 24, y: 350, w: 16, h: 160 },
    // 第二区右墙
    { type: 'portal_surface', id: 'ps_wall_r2', x: 232, y: 350, w: 16, h: 160 },
    // 第三区左墙
    { type: 'portal_surface', id: 'ps_wall_l3', x: 488, y: 350, w: 16, h: 160 },
    // 第三区右墙
    { type: 'portal_surface', id: 'ps_wall_r3', x: 712, y: 350, w: 16, h: 160 },
    // 上层平台底面（可以朝天花板射）
    { type: 'portal_surface', id: 'ps_ceil_1', x: 360, y: 206, w: 200, h: 16 },
    { type: 'portal_surface', id: 'ps_ceil_2', x: 600, y: 206, w: 200, h: 16 },
    // 地板（可朝地板射）
    { type: 'portal_surface', id: 'ps_floor', x: 480, y: 484, w: 560, h: 16 },

    // ── 钥匙 ─────────────────────────────────────────────────
    // 钥匙1：在高处平台（需传送门到达）
    { type: 'key_item', id: 'key_blue',   x: 360, y: 165, color: '#40a0ff' },
    // 钥匙2：第三区（被陷阱包围）
    { type: 'key_item', id: 'key_red',    x: 600, y: 420, color: '#ff4040' },
    // 钥匙3：第四区深处
    { type: 'key_item', id: 'key_green',  x: 840, y: 420, color: '#40ff80' },

    // ── 钥匙门 ────────────────────────────────────────────────
    { type: 'key_door', x: 240, y: 430, w: 16, h: 120, keyId: 'key_blue',  color: '#40a0ff' },
    { type: 'key_door', x: 480, y: 430, w: 16, h: 120, keyId: 'key_red',   color: '#ff4040' },
    { type: 'key_door', x: 720, y: 430, w: 16, h: 120, keyId: 'key_green', color: '#40ff80' },

    // ── 开关 + 联动 ───────────────────────────────────────────
    // 第一区开关：关闭第一区陷阱
    { type: 'switch', id: 'sw_1', x: 130, y: 460, linksTo: ['trap_zone1'], color: '#c0e040' },
    // 第二区开关：临时关闭激光
    { type: 'switch', id: 'sw_2', x: 360, y: 460, linksTo: ['trap_laser'], mode: 'toggle', color: '#c0e040' },

    // ── 陷阱 ─────────────────────────────────────────────────
    // 第一区地板陷阱（开关可关）
    { type: 'trap', id: 'trap_zone1', x: 130, y: 480, w: 160, h: 14, trapType: 'void', active: true },
    // 第三区激光（开关2可关）
    { type: 'trap', id: 'trap_laser', x: 600, y: 350, w: 14, h: 100, trapType: 'laser', active: true },
    // 第四区底部刺坑
    { type: 'trap', x: 830, y: 480, w: 200, h: 14, trapType: 'spike', active: true },

    // ── 移动平台 ──────────────────────────────────────────────
    // 第二区竖向电梯（到达上层平台）
    {
      type: 'elevator', x: 360, y: 460, w: 70, h: 14,
      path: [{ x: 360, y: 460 }, { x: 360, y: 230 }],
      speed: 100, waitMs: 600,
    },
    // 第三区→第四区横向平台
    {
      type: 'elevator', x: 620, y: 380, w: 90, h: 14,
      path: [{ x: 620, y: 380 }, { x: 810, y: 380 }],
      speed: 80, waitMs: 1000,
    },

    // ── 时控门（最终出口前的时间关）─────────────────────────
    { type: 'timed_door', x: 895, y: 390, w: 16, h: 100,
      openMs: 2500, closeMs: 2000, initialState: 'closed' },

    // ── 传送带（加速区 + 减速区）─────────────────────────────
    { type: 'conveyor', x: 130, y: 492, w: 190, h: 14, vx: 150, vy: 0, color: '#1a3050' },
    { type: 'conveyor', x: 840, y: 492, w: 160, h: 14, vx: -150, vy: 0, color: '#301a1a' },

    // ── 回响踏板 + 门（终局谜题）─────────────────────────────
    { type: 'pad', id: 'PA', x: 130, y: 350, color: '#50e8a0' },
    { type: 'pad', id: 'PB', x: 840, y: 280, color: '#e0a030' },
    { type: 'door', x: 895, y: 160, w: 16, h: 100, requires: ['PA', 'PB'], windowMs: 2500 },

    // ── 文字提示 ──────────────────────────────────────────────
    { type: 'label', x: 60,  y: 420, text: '→ Q 放传送门',      color: '#405878', fontSize: 11 },
    { type: 'label', x: 360, y: 140, text: '🔑 蓝钥匙',         color: '#305080', fontSize: 11 },
    { type: 'label', x: 600, y: 395, text: '🔑 红钥匙',         color: '#602030', fontSize: 11 },
    { type: 'label', x: 840, y: 395, text: '🔑 绿钥匙',         color: '#206030', fontSize: 11 },
    { type: 'label', x: 130, y: 330, text: 'PA',                 color: '#305848', fontSize: 10 },
    { type: 'label', x: 840, y: 260, text: 'PB',                 color: '#604818', fontSize: 10 },
  ],
}

// ── 导出 ───────────────────────────────────────────────────────

export const COMMUNITY_MAPS: readonly CommunityMap[] = [
  MAP_MAZE_ECHO,
  MAP_GEAR_MOMENT,
  MAP_QUANTUM_TRIAL,
]
