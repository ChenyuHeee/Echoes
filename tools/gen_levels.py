"""
Regenerate src/config/puzzleLevels.ts with 30 redesigned solo levels.
Each level has a distinct challenge type instead of the same mechanic with shrinking windows.
"""
import os

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(THIS_DIR, '..', 'src', 'config', 'puzzleLevels.ts')

with open(TARGET, encoding='utf-8') as f:
    original = f.read()

# Keep the TypeScript interface section (everything before PUZZLE_LEVELS array body)
HEADER_MARKER = 'export const PUZZLE_LEVELS: readonly PuzzleLevel[] = [\n'
header_end = original.find(HEADER_MARKER) + len(HEADER_MARKER)
HEADER = original[:header_end]

# Keep co-op levels section (id 31-35)
COOP_MARKER = '  {\n    id: 31,'
coop_start = original.find(COOP_MARKER)
COOP = '  ' + original[coop_start:]   # keep the closing ] too

# ── New solo levels (TypeScript strings) ────────────────────────────────────

CHAPTER1 = """\
  // ═══ 第一章：共振基础（1-5）— 学会回响机制 ════════════════════════════════
"""

L1 = """\
  {
    id: 1,
    name: '第1室·初鸣',
    hint: `踩踏板 A，走向 B 踩下——回响会重新触发 A，两者同步激活`,
    solution: '走到 A 踩下，再走到 B 踩下',
    pads: [
      { id: 'A', x: 220, y: 270, color: '#50e8a0' },
      { id: 'B', x: 700, y: 270, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 2500 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 18,
  },"""

L2 = """\
  {
    id: 2,
    name: '第2室·绕行',
    hint: `直路上有 X——踩到 X 会覆盖回响记忆，门就无法打开了`,
    solution: '绕过 X，执行 A → B（回响 A）',
    pads: [
      { id: 'A', x: 160, y: 420, color: '#50e8a0' },
      { id: 'X', x: 440, y: 270, color: '#e06060' },
      { id: 'B', x: 730, y: 140, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 2200 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 24,
  },"""

L3 = """\
  {
    id: 3,
    name: '第3室·夹道',
    hint: `两个 X 挡住了中间通道——必须找到上方或下方的缺口绕过去`,
    solution: '从 X 的间隙绕过，执行 A → B',
    pads: [
      { id: 'A', x: 180, y: 420, color: '#50e8a0' },
      { id: 'X', x: 390, y: 270, color: '#e06060' },
      { id: 'X', x: 560, y: 270, color: '#e06060' },
      { id: 'B', x: 760, y: 420, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 2000 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 28,
  },"""

L4 = """\
  {
    id: 4,
    name: '第4室·双踩',
    hint: `门需要 A 激活两次——踩 A 后，利用 B 触发回响让 A 再响一次
X 挡住了下方通路，需要绕上方到达 B`,
    solution: 'A → 绕过 X → B（回响 A，完成双激活）→ 门开',
    pads: [
      { id: 'A', x: 310, y: 310, color: '#50e8a0' },
      { id: 'B', x: 510, y: 200, color: '#e0a030' },
      { id: 'X', x: 510, y: 390, color: '#e06060' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'A'], windowMs: 1400 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 32,
  },"""

L5 = """\
  {
    id: 5,
    name: '第5室·双锁初探',
    hint: `两扇门各需不同配对——A+B 开一扇，B+C 开另一扇
踩踏顺序会决定两扇门能否同时开启`,
    solution: 'A → B（回响 A，门1开）→ C（回响 B，门2开）',
    pads: [
      { id: 'A', x: 160, y: 200, color: '#50e8a0' },
      { id: 'B', x: 460, y: 360, color: '#e0a030' },
      { id: 'C', x: 760, y: 200, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 190, w: 55, h: 120, requiredPads: ['A', 'B'], windowMs: 2200 },
      { x: 900, y: 370, w: 55, h: 120, requiredPads: ['B', 'C'], windowMs: 2200 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 40,
  },"""

CHAPTER2 = """\
  // ═══ 第二章：路径抉择（6-10）— 路线规划成为核心挑战 ══════════════════════
"""

L6 = """\
  {
    id: 6,
    name: '第6室·三重奏',
    hint: `门需要 A B C 同时激活——先踩哪个取决于位置关系
提示：先踩离另两者最远的，让最后两步的距离尽量短`,
    solution: '先踩最远的踏板，利用回响压缩最后两步的时间跨度',
    pads: [
      { id: 'A', x: 160, y: 270, color: '#50e8a0' },
      { id: 'B', x: 640, y: 180, color: '#e0a030' },
      { id: 'C', x: 760, y: 380, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 1400 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 46,
  },"""

L7 = """\
  {
    id: 7,
    name: '第7室·斜线突围',
    hint: `X 挡住了水平通道——换个方向接近 B，A 的双激活依然可以完成`,
    solution: '斜向绕过 X，完成 A → B（回响 A，双激活）',
    pads: [
      { id: 'A', x: 300, y: 300, color: '#50e8a0' },
      { id: 'X', x: 460, y: 300, color: '#e06060' },
      { id: 'B', x: 530, y: 190, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'A'], windowMs: 1400 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 50,
  },"""

L8 = """\
  {
    id: 8,
    name: '第8室·双锁绕线',
    hint: `两扇门需要链式触发——X 拦在 B 到 C 的路上
踩完 B 后要绕过 X 才能到达 C`,
    solution: 'A → B（门1开）→ 绕过 X → C（门2开）',
    pads: [
      { id: 'A', x: 160, y: 200, color: '#50e8a0' },
      { id: 'B', x: 420, y: 360, color: '#e0a030' },
      { id: 'X', x: 620, y: 260, color: '#e06060' },
      { id: 'C', x: 780, y: 160, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 190, w: 55, h: 120, requiredPads: ['A', 'B'], windowMs: 2000 },
      { x: 900, y: 370, w: 55, h: 120, requiredPads: ['B', 'C'], windowMs: 2000 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 55,
  },"""

L9 = """\
  {
    id: 9,
    name: '第9室·栅栏',
    hint: `三个 X 排成一列挡住去路——找到间隙穿过去`,
    solution: '穿过 X 栅栏的间隙，完成 A → B（回响 A）',
    pads: [
      { id: 'A', x: 150, y: 270, color: '#50e8a0' },
      { id: 'X', x: 450, y: 120, color: '#e06060' },
      { id: 'X', x: 450, y: 270, color: '#e06060' },
      { id: 'X', x: 450, y: 420, color: '#e06060' },
      { id: 'B', x: 760, y: 270, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 2500 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 58,
  },"""

L10 = """\
  {
    id: 10,
    name: '第10室·三角陷阱',
    hint: `三踏板门，X 就在 B→C 直线路径上——踩 X 会截断回响链
绕路，但不能绕太远，否则时间超出 1200ms 窗口`,
    solution: '先踩 A（出发），精确绕过 X 完成 B → C 链',
    pads: [
      { id: 'A', x: 160, y: 270, color: '#50e8a0' },
      { id: 'B', x: 580, y: 180, color: '#e0a030' },
      { id: 'X', x: 660, y: 280, color: '#e06060' },
      { id: 'C', x: 740, y: 380, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 1200 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 62,
  },"""

CHAPTER3 = """\
  // ═══ 第三章：精密计时（11-15）— 时间窗口开始产生真正压力 ═══════════════════
"""

L11 = """\
  {
    id: 11,
    name: '第11室·逆向直觉',
    hint: `不一定要从左走到右——哪个踏板先踩，距离更近？
X 挡住了 B 到 A 的斜线`,
    solution: 'B（靠近出生点）→ 绕过 X → A（回响 B）→ 门开',
    pads: [
      { id: 'B', x: 190, y: 360, color: '#e0a030' },
      { id: 'X', x: 440, y: 270, color: '#e06060' },
      { id: 'A', x: 780, y: 200, color: '#50e8a0' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 1500 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 65,
  },"""

L12 = """\
  {
    id: 12,
    name: '第12室·双踩夹击',
    hint: `A 需要激活两次——B 上下各有一个 X，只有从左侧进入才安全`,
    solution: 'A → 从左侧靠近 B（避开上下 X）→ 回响完成双激活',
    pads: [
      { id: 'A', x: 280, y: 270, color: '#50e8a0' },
      { id: 'X', x: 490, y: 130, color: '#e06060' },
      { id: 'B', x: 490, y: 220, color: '#e0a030' },
      { id: 'X', x: 490, y: 350, color: '#e06060' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'A'], windowMs: 1300 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 68,
  },"""

L13 = """\
  {
    id: 13,
    name: '第13室·连锁反应',
    hint: `四个踏板，三扇门——每踩一步都在为下一扇门铺路
Z 字形穿越，每步回响都打开一扇门`,
    solution: 'A → B → C → D（每步回响前一个，链式开三门）',
    pads: [
      { id: 'A', x: 130, y: 200, color: '#50e8a0' },
      { id: 'B', x: 360, y: 380, color: '#e0a030' },
      { id: 'C', x: 580, y: 200, color: '#c060ff' },
      { id: 'D', x: 780, y: 380, color: '#60c0ff' },
    ],
    doors: [
      { x: 900, y: 150, w: 55, h: 100, requiredPads: ['A', 'B'], windowMs: 1800 },
      { x: 900, y: 280, w: 55, h: 100, requiredPads: ['B', 'C'], windowMs: 1800 },
      { x: 900, y: 410, w: 55, h: 100, requiredPads: ['C', 'D'], windowMs: 1800 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 76,
  },"""

L14 = """\
  {
    id: 14,
    name: '第14室·三角博弈',
    hint: `三踏板门，顺序很关键——错误的出发点会让最后两步距离太远
计算三者之间的距离，选最优出发点`,
    solution: '先踩 B（它距离 A、C 最远），最后 A 到 C（两者相近）',
    pads: [
      { id: 'A', x: 160, y: 130, color: '#50e8a0' },
      { id: 'B', x: 740, y: 380, color: '#e0a030' },
      { id: 'C', x: 220, y: 410, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 1200 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 80,
  },"""

L15 = """\
  {
    id: 15,
    name: '第15室·水平封锁',
    hint: `X 挡住了水平直路——但 B 在斜上方，斜向接近不会碰到 X`,
    solution: 'A → 斜向到达 B（天然绕过 X），完成双激活',
    pads: [
      { id: 'A', x: 400, y: 290, color: '#50e8a0' },
      { id: 'X', x: 500, y: 290, color: '#e06060' },
      { id: 'B', x: 620, y: 190, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'A'], windowMs: 1100 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 72,
  },"""

CHAPTER4 = """\
  // ═══ 第四章：多重博弈（16-20）— 多扇门，需要统筹规划整条路线 ═══════════════
"""

L16 = """\
  {
    id: 16,
    name: '第16室·共享枢纽',
    hint: `B 是两扇门的共同钥匙——左右各有一个 X
必须从合适方向进入 B，再从合适方向离开`,
    solution: '从上/下绕入 B（避左侧 X），踩完后绕出到 C（避右侧 X）',
    pads: [
      { id: 'A', x: 160, y: 380, color: '#50e8a0' },
      { id: 'X', x: 430, y: 270, color: '#e06060' },
      { id: 'B', x: 560, y: 270, color: '#e0a030' },
      { id: 'X', x: 690, y: 270, color: '#e06060' },
      { id: 'C', x: 820, y: 160, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 190, w: 55, h: 120, requiredPads: ['A', 'B'], windowMs: 2000 },
      { x: 900, y: 370, w: 55, h: 120, requiredPads: ['B', 'C'], windowMs: 2000 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 85,
  },"""

L17 = """\
  {
    id: 17,
    name: '第17室·双线并行',
    hint: `两扇门完全独立，各自需要不同踏板对，没有共用踏板
先完成一组，再完成另一组——不要踩错`,
    solution: '先踩 A→B（门1），再踩 C→D（门2）',
    pads: [
      { id: 'A', x: 160, y: 160, color: '#50e8a0' },
      { id: 'B', x: 380, y: 380, color: '#e0a030' },
      { id: 'C', x: 540, y: 160, color: '#c060ff' },
      { id: 'D', x: 760, y: 380, color: '#60c0ff' },
    ],
    doors: [
      { x: 900, y: 190, w: 55, h: 120, requiredPads: ['A', 'B'], windowMs: 2200 },
      { x: 900, y: 370, w: 55, h: 120, requiredPads: ['C', 'D'], windowMs: 2200 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 88,
  },"""

L18 = """\
  {
    id: 18,
    name: '第18室·双响交织',
    hint: `一扇门需要 B 激活两次，另一扇需要 A+C——同一条路线要解决两个问题
踩完 A→B→C 后，B 的两次激活时间（直接踩+回响）都在窗口内`,
    solution: 'A → B（B第一次）→ C（回响B触发B第二次）→ 两门全开',
    pads: [
      { id: 'A', x: 160, y: 200, color: '#50e8a0' },
      { id: 'B', x: 420, y: 310, color: '#e0a030' },
      { id: 'C', x: 660, y: 190, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 190, w: 55, h: 120, requiredPads: ['B', 'B'], windowMs: 1500 },
      { x: 900, y: 370, w: 55, h: 120, requiredPads: ['A', 'C'], windowMs: 2600 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 92,
  },"""

L19 = """\
  {
    id: 19,
    name: '第19室·双向封堵',
    hint: `两个 X 分别挡住 B→C 的两条常规路线
必须找到第三条细路绕过，且不能让回响链中断`,
    solution: 'A → B → 找到绕过双重 X 的第三条路 → C',
    pads: [
      { id: 'A', x: 160, y: 270, color: '#50e8a0' },
      { id: 'B', x: 580, y: 140, color: '#e0a030' },
      { id: 'X', x: 680, y: 240, color: '#e06060' },
      { id: 'X', x: 640, y: 340, color: '#e06060' },
      { id: 'C', x: 780, y: 400, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 1400 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 96,
  },"""

L20 = """\
  {
    id: 20,
    name: '第20室·三锁贯通',
    hint: `四踏板开三扇门，X 挡在 C 到 D 之间
在不中断链式回响的情况下绕过 X`,
    solution: 'A → B → C → 绕过 X → D（链式回响，三门全开）',
    pads: [
      { id: 'A', x: 130, y: 200, color: '#50e8a0' },
      { id: 'B', x: 350, y: 400, color: '#e0a030' },
      { id: 'C', x: 580, y: 200, color: '#c060ff' },
      { id: 'X', x: 700, y: 310, color: '#e06060' },
      { id: 'D', x: 800, y: 420, color: '#60c0ff' },
    ],
    doors: [
      { x: 900, y: 150, w: 55, h: 100, requiredPads: ['A', 'B'], windowMs: 1800 },
      { x: 900, y: 280, w: 55, h: 100, requiredPads: ['B', 'C'], windowMs: 1800 },
      { x: 900, y: 410, w: 55, h: 100, requiredPads: ['C', 'D'], windowMs: 1800 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 100,
  },"""

CHAPTER5 = """\
  // ═══ 第五章：逻辑倒置（21-25）— 需要反直觉的解法或更深的推理 ═══════════════
"""

L21 = """\
  {
    id: 21,
    name: '第21室·同色双踏',
    hint: `两个 A 踏板，任意一个被踩都算 A 激活
但其中一个旁边有 X，路线更复杂——选哪个 A 决定难度`,
    solution: '选远处的 A（路径干净）完成 A → B，或绕过 X 用近 A',
    pads: [
      { id: 'A', x: 200, y: 160, color: '#50e8a0' },
      { id: 'X', x: 700, y: 240, color: '#e06060' },
      { id: 'A', x: 660, y: 340, color: '#50e8a0' },
      { id: 'B', x: 820, y: 180, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 1600 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 103,
  },"""

L22 = """\
  {
    id: 22,
    name: '第22室·精确绕行',
    hint: `三踏板门（1100ms），X 正好在 B→C 直线路径中点
稍微偏左的绕路刚好在时间限制内，大弧线就太慢了`,
    solution: 'A → B → 贴近 X 左侧快速通过 → C（严格控制路线长度）',
    pads: [
      { id: 'A', x: 160, y: 270, color: '#50e8a0' },
      { id: 'B', x: 600, y: 180, color: '#e0a030' },
      { id: 'X', x: 660, y: 280, color: '#e06060' },
      { id: 'C', x: 720, y: 380, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 1100 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 107,
  },"""

L23 = """\
  {
    id: 23,
    name: '第23室·双踩陷阱',
    hint: `X 就在 A 到 B 的对角线上——走直线会触发 X
必须绕行，但双激活的 1100ms 窗口不宽裕`,
    solution: 'A → 从 X 上方绕行到 B（回响 A，刚好在 1100ms 内）',
    pads: [
      { id: 'A', x: 300, y: 290, color: '#50e8a0' },
      { id: 'X', x: 390, y: 230, color: '#e06060' },
      { id: 'B', x: 440, y: 180, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'A'], windowMs: 1100 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 111,
  },"""

L24 = """\
  {
    id: 24,
    name: '第24室·三锁连环',
    hint: `四踏板三门链——X 挡在起点附近
从一开始就要绕开 X，否则整条链都会断`,
    solution: 'A → 绕过 X → B → C → D（链不中断）',
    pads: [
      { id: 'A', x: 130, y: 300, color: '#50e8a0' },
      { id: 'X', x: 280, y: 220, color: '#e06060' },
      { id: 'B', x: 400, y: 160, color: '#e0a030' },
      { id: 'C', x: 590, y: 380, color: '#c060ff' },
      { id: 'D', x: 800, y: 200, color: '#60c0ff' },
    ],
    doors: [
      { x: 900, y: 150, w: 55, h: 100, requiredPads: ['A', 'B'], windowMs: 1800 },
      { x: 900, y: 280, w: 55, h: 100, requiredPads: ['B', 'C'], windowMs: 1800 },
      { x: 900, y: 410, w: 55, h: 100, requiredPads: ['C', 'D'], windowMs: 1800 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 115,
  },"""

L25 = """\
  {
    id: 25,
    name: '第25室·三角联锁',
    hint: `三扇门共用同三个踏板——A+B、B+C、A+C 各开一扇
一次正确的走法能让三扇门在同一时间窗口内全部满足`,
    solution: '按正确顺序踩完 A、B、C，三扇门同时满足条件',
    pads: [
      { id: 'A', x: 180, y: 200, color: '#50e8a0' },
      { id: 'B', x: 480, y: 420, color: '#e0a030' },
      { id: 'C', x: 740, y: 220, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 150, w: 55, h: 100, requiredPads: ['A', 'B'], windowMs: 1500 },
      { x: 900, y: 280, w: 55, h: 100, requiredPads: ['B', 'C'], windowMs: 1500 },
      { x: 900, y: 410, w: 55, h: 100, requiredPads: ['A', 'C'], windowMs: 1500 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 120,
  },"""

CHAPTER6 = """\
  // ═══ 第六章：时序极限（26-30）— 综合挑战，大师级难度 ══════════════════════
"""

L26 = """\
  {
    id: 26,
    name: '第26室·双重迷阵',
    hint: `两道 X 屏障封住中路——只有 A 和 D 有用
找到穿越双重屏障的路线（第一道屏障有三个缺口，第二道有一个缺口）`,
    solution: 'A → 穿越两道 X 屏障（找间隙）→ D（回响 A）→ 门开',
    pads: [
      { id: 'A', x: 160, y: 270, color: '#50e8a0' },
      { id: 'X', x: 380, y: 130, color: '#e06060' },
      { id: 'X', x: 380, y: 270, color: '#e06060' },
      { id: 'X', x: 380, y: 410, color: '#e06060' },
      { id: 'X', x: 590, y: 200, color: '#e06060' },
      { id: 'X', x: 590, y: 340, color: '#e06060' },
      { id: 'D', x: 800, y: 270, color: '#60c0ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'D'], windowMs: 3000 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 118,
  },"""

L27 = """\
  {
    id: 27,
    name: '第27室·距离测算',
    hint: `三踏板门，窗口仅 750ms——必须找出哪两个踏板最近，先踩第三个
错误的出发点会让最后两步相距太远`,
    solution: '先踩 A（距离 B、C 最远），最后在 B、C 之间快速移动',
    pads: [
      { id: 'A', x: 200, y: 200, color: '#50e8a0' },
      { id: 'B', x: 720, y: 200, color: '#e0a030' },
      { id: 'C', x: 760, y: 380, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 750 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 126,
  },"""

L28 = """\
  {
    id: 28,
    name: '第28室·枢纽封锁',
    hint: `B 是两门共用钥匙，X 从两侧拦截
进出 B 的方向各只有一个，且不能走同一条路`,
    solution: 'A → 从下绕过左侧 X 到 B（门1）→ 从上绕过右侧 X 到 C（门2）',
    pads: [
      { id: 'A', x: 160, y: 420, color: '#50e8a0' },
      { id: 'X', x: 400, y: 280, color: '#e06060' },
      { id: 'B', x: 560, y: 280, color: '#e0a030' },
      { id: 'X', x: 720, y: 280, color: '#e06060' },
      { id: 'C', x: 840, y: 140, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 190, w: 55, h: 120, requiredPads: ['A', 'B'], windowMs: 1600 },
      { x: 900, y: 370, w: 55, h: 120, requiredPads: ['B', 'C'], windowMs: 1600 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 132,
  },"""

L29 = """\
  {
    id: 29,
    name: '第29室·毫秒博弈',
    hint: `窗口仅 650ms——三踏板中，只有 B 和 C 距离足够近
必须先踩 A，然后在 B→C 段精确绕过 X`,
    solution: '先踩 A，再到 B，精确绕过 X 到达 C（B→C 段严格控制距离）',
    pads: [
      { id: 'A', x: 200, y: 270, color: '#50e8a0' },
      { id: 'B', x: 720, y: 190, color: '#e0a030' },
      { id: 'X', x: 700, y: 300, color: '#e06060' },
      { id: 'C', x: 780, y: 370, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 650 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 140,
  },"""

L30 = """\
  {
    id: 30,
    name: '第30室·时空终局',
    hint: `四扇门，其中含一个循环锁——A+D 的窗口较宽，但需要整条链跑完
X 挡在 C 到 D 之间。提前规划好完整路线再出发`,
    solution: 'A → B → C → 绕过 X → D（四门全开，A+D 依赖回响积累）',
    pads: [
      { id: 'A', x: 160, y: 200, color: '#50e8a0' },
      { id: 'B', x: 360, y: 400, color: '#e0a030' },
      { id: 'C', x: 600, y: 200, color: '#c060ff' },
      { id: 'X', x: 720, y: 320, color: '#e06060' },
      { id: 'D', x: 820, y: 420, color: '#60c0ff' },
    ],
    doors: [
      { x: 900, y: 120, w: 55, h: 80, requiredPads: ['A', 'B'], windowMs: 1800 },
      { x: 900, y: 220, w: 55, h: 80, requiredPads: ['B', 'C'], windowMs: 1800 },
      { x: 900, y: 320, w: 55, h: 80, requiredPads: ['C', 'D'], windowMs: 1800 },
      { x: 900, y: 420, w: 55, h: 80, requiredPads: ['A', 'D'], windowMs: 2600 },
    ],
    exitX: 938,
    exitY: 270,
    coop: false,
    sandReward: 150,
  },"""

ALL_SOLO = [
    CHAPTER1, L1, L2, L3, L4, L5,
    CHAPTER2, L6, L7, L8, L9, L10,
    CHAPTER3, L11, L12, L13, L14, L15,
    CHAPTER4, L16, L17, L18, L19, L20,
    CHAPTER5, L21, L22, L23, L24, L25,
    CHAPTER6, L26, L27, L28, L29, L30,
]

solo_body = '\n'.join(ALL_SOLO) + '\n'
new_file = HEADER + solo_body + '  ' + COOP

with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(new_file)

print(f'Written. Lines: {new_file.count(chr(10))}, Solo levels: 30, Coop: 5')
ids = [int(line.split('id: ')[1].rstrip(',')) for line in new_file.split('\n') if '    id: ' in line]
print(f'IDs found: {sorted(ids)}')
