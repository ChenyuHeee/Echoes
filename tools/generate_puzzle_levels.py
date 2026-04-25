#!/usr/bin/env python3
"""
generate_puzzle_levels.py
=========================
为《回响：破碎时间》时序密室模式生成关卡数据。

生成规则：
  - 30 个逐渐变难的单人关卡（id 1-30）
  - 5 个精心设计的双人关卡（id 31-35）
  - 输出：src/config/puzzleLevels.ts

解谜机制说明：
  - 踩踏板 X → X 被记住（回响记忆）
  - 踩踏板 Y → Y 激活，同时回响触发 X（120ms 延迟）
  - 门 [A,B] 窗口 W：A 和 B 的最近激活时间之差 ≤ W
  - 门 [A,A] 窗口 W：A 最近两次激活时间之差 ≤ W

关卡类型：
  Type AB_SYNC  : 踩 A（记住）→ 踩 B（回响 A，A+B 同时激活）→ 门 [A,B]
  Type AA_DOUBLE: 踩 A（记住）→ 踩 B（回响 A，A 第二次激活）→ 门 [A,A]
  Type AC_VIA_B : 踩 C（记住）→ 踩 A（回响 C，A+C 同时激活）→ 门 [A,C]，B 是干扰踏板
  Type TWO_DOORS: A→B（回响A，门1[A,B]开）→ C（回响B，门2[B,C]开）→ 通过
"""

import random
import math
import os
import sys
import json

SEED = 2026
rng = random.Random(SEED)

# ── 游戏区域 ──────────────────────────────────────────
FIELD_X = (75, 815)     # 踏板可用 x 范围（右边留给门和出口）
FIELD_Y = (55, 498)     # 踏板可用 y 范围（避开顶栏和底栏）

DOOR_X  = 900           # 门的 x 坐标（右边缘）
DOOR_W  = 55
EXIT_X  = 938
EXIT_Y  = 270

PAD_COLORS = [
    '#50e8a0',  # A - 青绿
    '#e0a030',  # B - 琥珀
    '#c060ff',  # C - 紫
    '#e06060',  # D - 红
    '#40b8ff',  # E - 蓝
    '#f0e040',  # F - 黄
    '#ff9090',  # G - 粉
    '#90c0ff',  # H - 淡蓝
]
PAD_IDS = 'ABCDEFGH'

def pad_color(pid: str) -> str:
    idx = PAD_IDS.index(pid) if pid in PAD_IDS else 0
    return PAD_COLORS[idx % len(PAD_COLORS)]

def rand_pos(used: list, min_dist: int = 95, max_dist_from: tuple = None, max_dist: int = 9999) -> tuple:
    """随机生成一个有效踏板位置。
    used: 已占用的坐标列表（会避开门区域）
    max_dist_from: (x,y) 若指定，则新位置必须在其 max_dist 范围内
    """
    for _ in range(600):
        x = rng.randint(*FIELD_X)
        y = rng.randint(*FIELD_Y)
        # 避开门附近（x>840, |y-270|<90）
        if x > 840 and abs(y - 270) < 100:
            continue
        # 与已有位置保持距离
        if any(math.hypot(x - ux, y - uy) < min_dist for ux, uy in used):
            continue
        # 若指定了 max_dist_from，检查距离上限
        if max_dist_from is not None:
            if math.hypot(x - max_dist_from[0], y - max_dist_from[1]) > max_dist:
                continue
        return x, y
    # 兜底：放松约束
    x = rng.randint(*FIELD_X)
    y = rng.randint(*FIELD_Y)
    return x, y

def make_pad(pid: str, x: int, y: int) -> dict:
    return {'id': pid, 'x': x, 'y': y, 'color': pad_color(pid)}

def make_door(x: int, y: int, w: int, h: int, reqs: list, window: int) -> dict:
    return {'x': x, 'y': y, 'w': w, 'h': h, 'requiredPads': reqs, 'windowMs': window}

# ── 关卡模板 ──────────────────────────────────────────

def build_ab_sync(lv: int, window: int, n_distract: int, sand: int) -> dict:
    """
    解法：踩 A（记住）→ 踩 B（回响 A，A+B 同步激活）→ 门 [A,B] 开
    难度控制：干扰踏板数量，窗口大小（AB 间距不影响难度，但需知道顺序）
    """
    used = [(DOOR_X, 270)]
    ax, ay = rand_pos(used)
    used.append((ax, ay))
    bx, by = rand_pos(used)
    used.append((bx, by))

    pads = [make_pad('A', ax, ay), make_pad('B', bx, by)]
    for k in range(n_distract):
        dx, dy = rand_pos(used)
        used.append((dx, dy))
        pads.append(make_pad(PAD_IDS[2 + k], dx, dy))

    door_y = rng.choice([220, 270, 310]) if n_distract == 0 else 270
    return {
        'id': lv,
        'name': f'第{lv}室·共鸣',
        'hint': f'踩 A（记住），走向 B 踩下——回响同时触发 A，两者在 {window}ms 内激活开门',
        'solution': 'A → B（回响 A）→ 门开',
        'pads': pads,
        'doors': [make_door(DOOR_X, door_y, DOOR_W, 160, ['A', 'B'], window)],
        'exitX': EXIT_X, 'exitY': door_y,
        'coop': False,
        'sandReward': sand,
    }

def build_aa_double(lv: int, window: int, n_distract: int, sand: int) -> dict:
    """
    解法：踩 A（记住）→ 踩 B（回响 A 再次激活）→ 门 [A,A] 开
    难度控制：A→B 的距离（决定两次激活间隔），窗口大小
    玩家速度 200px/s，所以 dist(A,B)/200*1000 + 120 ≤ window
    """
    max_travel_ms = window - 150  # 留 150ms 余量
    max_dist = int(max_travel_ms * 200 / 1000)
    max_dist = max(100, min(max_dist, 450))

    used = [(DOOR_X, 270)]
    ax, ay = rand_pos(used)
    used.append((ax, ay))
    # B 必须在 A 的 max_dist 范围内
    bx, by = rand_pos(used, min_dist=80, max_dist_from=(ax, ay), max_dist=max_dist)
    used.append((bx, by))

    pads = [make_pad('A', ax, ay), make_pad('B', bx, by)]
    for k in range(n_distract):
        dx, dy = rand_pos(used)
        used.append((dx, dy))
        pads.append(make_pad(PAD_IDS[2 + k], dx, dy))

    return {
        'id': lv,
        'name': f'第{lv}室·双响',
        'hint': f'门需要 A 激活两次（间隔 ≤ {window}ms）\n踩 A（记住），快速走向 B 踩下——回响再次触发 A',
        'solution': 'A → B（回响 A → A 第二次激活）→ 门开',
        'pads': pads,
        'doors': [make_door(DOOR_X, 270, DOOR_W, 160, ['A', 'A'], window)],
        'exitX': EXIT_X, 'exitY': EXIT_Y,
        'coop': False,
        'sandReward': sand,
    }

def build_ac_via_b(lv: int, window: int, n_distract: int, sand: int) -> dict:
    """
    解法：踩 C（记住）→ 踩 A（回响 C，A+C 同步）→ 门 [A,C] 开
    B 及其他踏板是干扰（踩了会破坏回响记忆）
    难度：干扰踏板数 + 窗口大小 + 踏板布局（干扰踏板放在 C→A 路径上）
    """
    used = [(DOOR_X, 270)]
    ax, ay = rand_pos(used)
    used.append((ax, ay))
    cx, cy = rand_pos(used)  # C 需要先踩
    used.append((cx, cy))

    pads = [make_pad('A', ax, ay), make_pad('C', cx, cy)]
    # 干扰踏板 B 放在 C→A 路径上（增加难度）
    for k in range(max(1, n_distract)):  # 至少一个干扰（才叫 AC_VIA_B）
        # 尝试放在 C 和 A 之间
        mx = int((cx + ax) / 2) + rng.randint(-80, 80)
        my = int((cy + ay) / 2) + rng.randint(-60, 60)
        mx = max(FIELD_X[0], min(FIELD_X[1], mx))
        my = max(FIELD_Y[0], min(FIELD_Y[1], my))
        # 确保不与已有踏板太近
        attempts = 0
        while any(math.hypot(mx - ux, my - uy) < 85 for ux, uy in used) and attempts < 50:
            mx = rng.randint(*FIELD_X)
            my = rng.randint(*FIELD_Y)
            attempts += 1
        used.append((mx, my))
        pads.append(make_pad(PAD_IDS[2 + k], mx, my))

    return {
        'id': lv,
        'name': f'第{lv}室·三鸣',
        'hint': f'门需要 A 和 C（{window}ms 内）\n直接来回走不到，注意：踩了 B 会打断回响链\n先踩 C（记住），再踩 A——回响触发 C',
        'solution': 'C → A（回响 C，A+C 同步激活）→ 门开（避开 B）',
        'pads': pads,
        'doors': [make_door(DOOR_X, 270, DOOR_W, 160, ['A', 'C'], window)],
        'exitX': EXIT_X, 'exitY': EXIT_Y,
        'coop': False,
        'sandReward': sand,
    }

def build_two_doors(lv: int, window: int, n_distract: int, sand: int) -> dict:
    """
    解法：踩 A（记住）→ 踩 B（回响A，门1[A,B]开）→ 踩 C（回响B，门2[B,C]开）→ 通过
    """
    door1_y = 205
    door2_y = 350
    used = [(DOOR_X, door1_y), (DOOR_X, door2_y)]

    ax, ay = rand_pos(used)
    used.append((ax, ay))
    bx, by = rand_pos(used)
    used.append((bx, by))
    cx, cy = rand_pos(used)
    used.append((cx, cy))

    pads = [make_pad('A', ax, ay), make_pad('B', bx, by), make_pad('C', cx, cy)]
    for k in range(n_distract):
        dx, dy = rand_pos(used)
        used.append((dx, dy))
        pads.append(make_pad(PAD_IDS[3 + k], dx, dy))

    return {
        'id': lv,
        'name': f'第{lv}室·双门',
        'hint': f'两扇门都要打开（各需在 {window}ms 内满足）\n门1需要 A+B，门2需要 B+C\n利用 B 作为枢纽：A→B（回响A）→C（回响B）',
        'solution': 'A → B（回响A，门1开）→ C（回响B，门2开）→ 通过',
        'pads': pads,
        'doors': [
            make_door(DOOR_X, door1_y, DOOR_W, 108, ['A', 'B'], window),
            make_door(DOOR_X, door2_y, DOOR_W, 108, ['B', 'C'], window),
        ],
        'exitX': EXIT_X, 'exitY': 278,
        'coop': False,
        'sandReward': sand,
    }

# ── 双人关卡（精心设计）─────────────────────────────────────
# 每个双人关卡都有独特的协同机制，两个玩家各有独立回响记忆

COOP_LEVELS = [
    # 双人关卡 1：镜像同步（最简，教学）
    # 两人各占一侧踏板，必须在 600ms 内同步踩下
    # P1→A（左区），P2→B（右区），同时踩开门 [A,B] window=600ms
    {
        'id': 31,
        'name': '双人第1室·镜像',
        'hint': '两人分工：P1（WASD）前往 A，P2（方向键）前往 B\n需在 600ms 内同时踩下——纯粹的眼神交流',
        'solution': 'P1:A 与 P2:B 同时踩下（600ms 内）→ 门开',
        'pads': [
            {'id': 'A', 'x': 210, 'y': 270, 'color': '#50e8a0'},
            {'id': 'B', 'x': 680, 'y': 270, 'color': '#e0a030'},
        ],
        'doors': [
            {'x': 900, 'y': 270, 'w': 55, 'h': 160, 'requiredPads': ['A', 'B'], 'windowMs': 600},
        ],
        'exitX': 938, 'exitY': 270,
        'coop': True,
        'sandReward': 55,
    },
    # 双人关卡 2：接力回响
    # P1：A→B（回响A，门1[A,B]开）；P2：C→D（回响C，门2[C,D]开）
    # 两人各负责一扇门，互不干扰
    {
        'id': 32,
        'name': '双人第2室·接力',
        'hint': '两人各自负责一扇门（互相独立）\nP1：踩 A → B（回响触发 A，门1）\nP2：踩 C → D（回响触发 C，门2）',
        'solution': 'P1:A→B(回响A)=门1  P2:C→D(回响C)=门2  → 通过',
        'pads': [
            {'id': 'A', 'x': 155, 'y': 175, 'color': '#50e8a0'},
            {'id': 'B', 'x': 380, 'y': 375, 'color': '#e0a030'},
            {'id': 'C', 'x': 480, 'y': 175, 'color': '#c060ff'},
            {'id': 'D', 'x': 680, 'y': 375, 'color': '#e06060'},
        ],
        'doors': [
            {'x': 900, 'y': 205, 'w': 55, 'h': 108, 'requiredPads': ['A', 'B'], 'windowMs': 1600},
            {'x': 900, 'y': 345, 'w': 55, 'h': 108, 'requiredPads': ['C', 'D'], 'windowMs': 1600},
        ],
        'exitX': 938, 'exitY': 275,
        'coop': True,
        'sandReward': 65,
    },
    # 双人关卡 3：三角协同
    # 门 [A,B,C] window=1800ms
    # P1 激活 A（记忆A）→ P1 激活 B（回响A，A+B在window内）
    # P2 独立激活 C（在同一 1800ms 窗口内）
    # 关键：P2 需要卡准时机，不能太早也不能太晚
    {
        'id': 33,
        'name': '双人第3室·三角',
        'hint': '门需要 A、B、C 全部在 1800ms 内激活\nP1：踩 A → B（回响 A）\nP2：在 P1 踩 B 的前后 1.8s 内踩 C',
        'solution': 'P1:A→B(回响A)  P2:恰当时机踩C  三者在1800ms内 → 门开',
        'pads': [
            {'id': 'A', 'x': 175, 'y': 200, 'color': '#50e8a0'},
            {'id': 'B', 'x': 400, 'y': 380, 'color': '#e0a030'},
            {'id': 'C', 'x': 650, 'y': 200, 'color': '#c060ff'},
        ],
        'doors': [
            {'x': 900, 'y': 270, 'w': 55, 'h': 160, 'requiredPads': ['A', 'B', 'C'], 'windowMs': 1800},
        ],
        'exitX': 938, 'exitY': 270,
        'coop': True,
        'sandReward': 75,
    },
    # 双人关卡 4：回响交汇
    # 两人各自完成一个 AA_DOUBLE 序列，各自门分上下
    # P1：踩 A（记忆A）→ 踩 E（回响A，A×2，门1[A,A]开）
    # P2：踩 C（记忆C）→ 踩 F（回响C，C×2，门2[C,C]开）
    # 两人独立但需同步节奏（两扇门的 window 都很紧）
    {
        'id': 34,
        'name': '双人第4室·回响交汇',
        'hint': '两扇门各需某踏板激活两次（双响机制）\nP1：踩 A（记住）→ 快速踩 E（回响触发 A 第二次）→ 门1\nP2：踩 C（记住）→ 快速踩 F（回响触发 C 第二次）→ 门2\n两人都要快！',
        'solution': 'P1:A→E(回响A,A×2)=门1  P2:C→F(回响C,C×2)=门2  → 通过',
        'pads': [
            {'id': 'A', 'x': 155, 'y': 160, 'color': '#50e8a0'},
            {'id': 'E', 'x': 315, 'y': 160, 'color': '#40b8ff'},  # A 的中继（靠近A）
            {'id': 'C', 'x': 490, 'y': 390, 'color': '#c060ff'},
            {'id': 'F', 'x': 660, 'y': 390, 'color': '#f0e040'},  # C 的中继（靠近C）
        ],
        'doors': [
            {'x': 900, 'y': 185, 'w': 55, 'h': 108, 'requiredPads': ['A', 'A'], 'windowMs': 1100},
            {'x': 900, 'y': 360, 'w': 55, 'h': 108, 'requiredPads': ['C', 'C'], 'windowMs': 1100},
        ],
        'exitX': 938, 'exitY': 275,
        'coop': True,
        'sandReward': 90,
    },
    # 双人关卡 5：时间悖论（终极）
    # 两扇门，极限窗口 650ms
    # 门1 [A,C] window=650ms：P1踩C（记忆C）→ P1踩A（回响C）→ A+C同步
    # 门2 [B,D] window=650ms：P2踩D（记忆D）→ P2踩B（回响D）→ B+D同步
    # 干扰踏板 E 放在 C→A 路径上，P2 的 X 放在 D→B 路径上
    # 两人必须各自完成精准序列，任何失误都会破坏另一人的计划
    {
        'id': 35,
        'name': '双人第5室·时间悖论',
        'hint': '终极挑战——窗口仅 650ms，任何失误都是全队重来\nP1：踩 C（记住）→ 快速踩 A（回响 C）避开干扰踏板 E\nP2：踩 D（记住）→ 快速踩 B（回响 D）避开干扰踏板 X\n两人必须几乎同时完成各自序列',
        'solution': 'P1:C→A(回响C,避开E)=门1  P2:D→B(回响D,避开X)=门2  → 通关',
        'pads': [
            {'id': 'A', 'x': 200, 'y': 175, 'color': '#50e8a0'},
            {'id': 'B', 'x': 610, 'y': 375, 'color': '#e0a030'},
            {'id': 'C', 'x': 120, 'y': 375, 'color': '#c060ff'},
            {'id': 'D', 'x': 700, 'y': 175, 'color': '#e06060'},
            {'id': 'E', 'x': 155, 'y': 275, 'color': '#ff9090'},  # 干扰：在C→A之间
            {'id': 'X', 'x': 655, 'y': 275, 'color': '#90c0ff'},  # 干扰：在D→B之间（用X代替F避免混淆）
        ],
        'doors': [
            {'x': 900, 'y': 185, 'w': 55, 'h': 108, 'requiredPads': ['A', 'C'], 'windowMs': 650},
            {'x': 900, 'y': 360, 'w': 55, 'h': 108, 'requiredPads': ['B', 'D'], 'windowMs': 650},
        ],
        'exitX': 938, 'exitY': 275,
        'coop': True,
        'sandReward': 120,
    },
]

# ── 生成单人关卡 ──────────────────────────────────────

def generate_solo_levels() -> list:
    levels = []

    # 第一梯队（1-5）：AB_SYNC，零干扰，宽窗口，入门
    windows_t1 = [2000, 1900, 1800, 1700, 1600]
    sands_t1   = [18, 21, 24, 27, 30]
    for i in range(5):
        levels.append(build_ab_sync(i + 1, windows_t1[i], 0, sands_t1[i]))

    # 第二梯队（6-10）：AA_DOUBLE，0-1 干扰，窗口收紧
    windows_t2 = [1800, 1600, 1450, 1300, 1150]
    sands_t2   = [33, 37, 41, 45, 49]
    distracts_t2 = [0, 0, 1, 1, 1]
    for i in range(5):
        levels.append(build_aa_double(i + 6, windows_t2[i], distracts_t2[i], sands_t2[i]))

    # 第三梯队（11-15）：AC_VIA_B，1 干扰（B 在路径上）
    windows_t3 = [1600, 1450, 1300, 1150, 1000]
    sands_t3   = [52, 56, 60, 64, 68]
    for i in range(5):
        levels.append(build_ac_via_b(i + 11, windows_t3[i], 1, sands_t3[i]))

    # 第四梯队（16-20）：TWO_DOORS，0-1 干扰
    windows_t4 = [1800, 1650, 1500, 1350, 1200]
    sands_t4   = [72, 77, 82, 87, 92]
    distracts_t4 = [0, 0, 1, 1, 1]
    for i in range(5):
        levels.append(build_two_doors(i + 16, windows_t4[i], distracts_t4[i], sands_t4[i]))

    # 第五梯队（21-25）：AC_VIA_B，2 干扰，窗口很紧
    windows_t5 = [950, 880, 820, 760, 700]
    sands_t5   = [96, 101, 106, 111, 116]
    for i in range(5):
        levels.append(build_ac_via_b(i + 21, windows_t5[i], 2, sands_t5[i]))

    # 第六梯队（26-30）：交替 TWO_DOORS / AA_DOUBLE，1 干扰，极限窗口
    windows_t6 = [1050, 900, 800, 720, 650]
    sands_t6   = [120, 126, 132, 138, 145]
    for i in range(5):
        lv = i + 26
        if i % 2 == 0:
            levels.append(build_two_doors(lv, windows_t6[i], 1, sands_t6[i]))
        else:
            levels.append(build_aa_double(lv, windows_t6[i], 1, sands_t6[i]))

    return levels

# ── 生成 TypeScript 输出 ──────────────────────────────

def ts_value(v) -> str:
    """将 Python 值序列化为 TypeScript 字面量。"""
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str):
        # 转义反斜杠和单引号，使用模板字符串（带换行支持）
        escaped = v.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
        return f'`{escaped}`'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        items = ', '.join(ts_value(x) for x in v)
        return f'[{items}]'
    if isinstance(v, dict):
        pairs = []
        for k, val in v.items():
            pairs.append(f'    {k}: {ts_value(val)}')
        inner = ',\n'.join(pairs)
        return f'{{\n{inner}\n  }}'
    return str(v)

def level_to_ts(level: dict) -> str:
    lines = ['  {']
    for key, val in level.items():
        if key == 'pads':
            pad_lines = ['    pads: [']
            for p in val:
                pad_lines.append(f"      {{ id: '{p['id']}', x: {p['x']}, y: {p['y']}, color: '{p['color']}' }},")
            pad_lines.append('    ],')
            lines.append('\n'.join(pad_lines))
        elif key == 'doors':
            door_lines = ['    doors: [']
            for d in val:
                reqs = ', '.join(f"'{r}'" for r in d['requiredPads'])
                door_lines.append(
                    f"      {{ x: {d['x']}, y: {d['y']}, w: {d['w']}, h: {d['h']}, "
                    f"requiredPads: [{reqs}], windowMs: {d['windowMs']} }},"
                )
            door_lines.append('    ],')
            lines.append('\n'.join(door_lines))
        elif isinstance(val, str):
            # 多行字符串用模板字面量
            escaped = val.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
            if '\n' in escaped:
                lines.append(f'    {key}: `{escaped}`,')
            else:
                lines.append(f"    {key}: '{escaped}',")
        elif isinstance(val, bool):
            lines.append(f"    {key}: {'true' if val else 'false'},")
        else:
            lines.append(f'    {key}: {val},')
    lines.append('  }')
    return '\n'.join(lines)

def generate_ts(all_levels: list) -> str:
    header = '''// AUTO-GENERATED by tools/generate_puzzle_levels.py — DO NOT EDIT MANUALLY
// Seed: 2026 | 30 solo levels + 5 co-op levels

export interface PuzzlePad {
  id: string
  x: number
  y: number
  color: string
}

export interface PuzzleDoor {
  x: number
  y: number
  w: number
  h: number
  requiredPads: string[]
  windowMs: number
}

export interface PuzzleLevel {
  id: number
  name: string
  hint: string
  solution: string
  pads: PuzzlePad[]
  doors: PuzzleDoor[]
  exitX: number
  exitY: number
  coop: boolean
  sandReward: number
}

export const PUZZLE_LEVELS: readonly PuzzleLevel[] = [
'''
    body = ',\n'.join(level_to_ts(lv) for lv in all_levels)
    footer = '\n]\n'
    return header + body + footer

# ── 主程序 ────────────────────────────────────────────

def main():
    solo   = generate_solo_levels()
    coop   = COOP_LEVELS
    all_lv = solo + coop

    print(f'生成关卡数量：单人 {len(solo)}，双人 {len(coop)}，合计 {len(all_lv)}')

    ts_content = generate_ts(all_lv)

    out_path = os.path.join(
        os.path.dirname(__file__), '..', 'src', 'config', 'puzzleLevels.ts'
    )
    out_path = os.path.normpath(out_path)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(ts_content)

    print(f'已写入：{out_path}')

    # 简单验证
    for lv in all_lv:
        assert lv['id'], f'关卡缺少 id：{lv}'
        assert lv['pads'], f'关卡 {lv["id"]} 无踏板'
        assert lv['doors'], f'关卡 {lv["id"]} 无门'

    # 打印关卡概览
    print('\n关卡一览：')
    for lv in all_lv:
        tag = '[双人]' if lv['coop'] else '      '
        doors_desc = ' | '.join(
            f"[{'+'.join(d['requiredPads'])}] {d['windowMs']}ms"
            for d in lv['doors']
        )
        print(f"  {lv['id']:2d} {tag} {lv['name']:<20}  {doors_desc}")

if __name__ == '__main__':
    main()
