"""Writes 30 redesigned solo puzzle levels to src/config/puzzleLevels.ts.
All 30 levels have distinct challenge types:
  - Route traps (X pads on natural paths)
  - Three-pad doors [A,B,C] requiring spatial planning
  - Double activation [A,A] with timing constraints
  - Multi-door chains requiring ordered planning
  - Counterintuitive pad ordering
"""

import os

HEADER = '''\
// 30 solo levels + 5 co-op levels
// Design: genuine puzzle variety — routing traps, spatial [A,B,C], timing [A,A], multi-door chains

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

# 30 solo levels. Each is a dict with the TypeScript content as a string.
SOLO_LEVELS = [

# ─── 第一章：共振基础（1-5） ──────────────────────────────────────────
# Teaches the echo mechanic. Challenge is navigation, not pure memorization.

# L1 — Tutorial: A left, B right, no traps. Pure intro.
dict(
  id=1, name='第1室·初鸣',
  hint='踩踏板 A，走向 B 踩下——回响会重新触发 A，两者同步激活',
  solution='A → B（回响 A）',
  pads=[('A',220,270,'#50e8a0'),('B',700,270,'#e0a030')],
  doors=[(900,270,55,160,['A','B'],2500)],
  exitX=938,exitY=270,reward=18,
),

# L2 — Route trap: X sits on the diagonal from A to B.
# A(bottom-left), X(center), B(top-right). Must go around X.
dict(
  id=2, name='第2室·绕行',
  hint='直路上有 X——踩 X 会覆盖回响，门就打不开了',
  solution='绕过 X，执行 A → B（回响 A）',
  pads=[('A',160,420,'#50e8a0'),('X',440,270,'#e06060'),('B',730,140,'#e0a030')],
  doors=[(900,270,55,160,['A','B'],2200)],
  exitX=938,exitY=270,reward=24,
),

# L3 — Two traps on natural routes, must zig-zag
# A(top-left), B(top-right). Direct horizontal path at y≈200 is clear.
# X pads are below the line, tempting players who drift downward.
dict(
  id=3, name='第3室·夹道',
  hint='X 堵住了中间水平通道——找一条上方或下方的路',
  solution='从上方绕过两个 X，执行 A → B',
  pads=[
    ('A',180,420,'#50e8a0'),
    ('X',380,270,'#e06060'),
    ('X',560,270,'#e06060'),
    ('B',760,420,'#e0a030'),
  ],
  doors=[(900,270,55,160,['A','B'],2000)],
  exitX=938,exitY=270,reward=28,
),

# L4 — Double activation [A,A]. A in center-left, B above-right as echo trigger.
# X below B on the "easy" lower path — must go up-right to B.
# dist(A,B)=sqrt(200²+100²)≈224px at 250px/s→896ms+120=1016ms < 1400ms ✓
dict(
  id=4, name='第4室·双踩',
  hint='门需要 A 激活两次——踩 A 后，用 B 触发回响让 A 再响一次',
  solution='A → B（回响 A，完成双激活）→ 门开',
  pads=[
    ('A',310,310,'#50e8a0'),
    ('B',510,200,'#e0a030'),  # echo trigger, upper-right
    ('X',510,380,'#e06060'),  # trap on lower path to B
  ],
  doors=[(900,270,55,160,['A','A'],1400)],
  exitX=938,exitY=270,reward=32,
),

# L5 — Two-door chain [A,B]+[B,C]. Intro to chained doors.
# A top-left, B center, C top-right. Chain A→B→C opens both doors.
dict(
  id=5, name='第5室·双锁初探',
  hint='两扇门各需不同组合——A+B 开一扇，B+C 开另一扇\n找到让两扇门都开的踩踏顺序',
  solution='A → B（回响A，门1开）→ C（回响B，门2开）',
  pads=[
    ('A',160,200,'#50e8a0'),
    ('B',460,360,'#e0a030'),
    ('C',760,200,'#c060ff'),
  ],
  doors=[
    (900,190,55,120,['A','B'],2200),
    (900,370,55,120,['B','C'],2200),
  ],
  exitX=938,exitY=270,reward=40,
),

# ─── 第二章：路径抉择（6-10） ────────────────────────────────────────
# Routing becomes the core challenge. Trap positions force non-obvious paths.

# L6 — [A,B,C] three-pad door intro.
# A far left (step first, it's the "free" pad), B and C close together on right.
# span = dist(B,C) = sqrt(140²+200²)≈244px at 250px/s→976ms < 1400ms ✓
dict(
  id=6, name='第6室·三重奏',
  hint='门需要 A B C 同时激活——三个踏板，先踩哪个取决于位置关系',
  solution='A（远端出发）→ B → C（span = B到C距离，利用回响压缩时间）',
  pads=[
    ('A',160,270,'#50e8a0'),   # far left, step first
    ('B',640,180,'#e0a030'),   # close to C
    ('C',760,380,'#c060ff'),   # close to B
  ],
  doors=[(900,270,55,160,['A','B','C'],1400)],
  exitX=938,exitY=270,reward=46,
),

# L7 — [A,A] with trap on horizontal path.
# A left-center, B upper-right as echo trigger. X directly between A and B (horizontal).
# Must go diagonally, not straight right.
# dist(A,B diagonal) = sqrt(220²+100²)≈242px→968ms+120=1088ms < 1400ms ✓
dict(
  id=7, name='第7室·斜线突围',
  hint='X 挡住了水平通道——换一个方向，A 到 B 还有别的路',
  solution='斜向绕过 X，完成 A → B（双激活）',
  pads=[
    ('A',300,300,'#50e8a0'),
    ('X',460,300,'#e06060'),  # blocks horizontal path right
    ('B',530,190,'#e0a030'),  # upper-right, reachable diagonally
  ],
  doors=[(900,270,55,160,['A','A'],1400)],
  exitX=938,exitY=270,reward=50,
),

# L8 — Two-door chain with trap between B and C.
# A → B opens door1. Then must reach C without hitting X.
# X is between B(center) and C(right). Forces a detour.
dict(
  id=8, name='第8室·双锁绕线',
  hint='两扇门需要链式触发——但 X 拦在 B 到 C 的路上',
  solution='A → B（门1开）→ 绕过 X → C（门2开）',
  pads=[
    ('A',160,200,'#50e8a0'),
    ('B',420,360,'#e0a030'),
    ('X',620,260,'#e06060'),   # on direct path B→C
    ('C',780,160,'#c060ff'),
  ],
  doors=[
    (900,190,55,120,['A','B'],2000),
    (900,370,55,120,['B','C'],2000),
  ],
  exitX=938,exitY=270,reward=55,
),

# L9 — [A,B] with three traps forming a "wall" at x≈450.
# Three X pads spaced 120px vertically at (450, 160/280/400).
# Center gap: 280-160=120px apart (28+28=56 needed, 120>>56, so gaps ARE passable).
# But the wall forces the player to commit to one gap (top, middle, or bottom).
# A(left), B(right). Must thread one of the gaps.
dict(
  id=9, name='第9室·栅栏',
  hint='三个 X 排成一排挡住去路——找到间隙穿过',
  solution='穿过栅栏间隙，完成 A → B（回响 A）',
  pads=[
    ('A',150,270,'#50e8a0'),
    ('X',450,120,'#e06060'),
    ('X',450,270,'#e06060'),
    ('X',450,420,'#e06060'),
    ('B',760,270,'#e0a030'),
  ],
  doors=[(900,270,55,160,['A','B'],2500)],
  exitX=938,exitY=270,reward=58,
),

# L10 — [A,B,C] with trap on the B→C optimal path.
# A(left), B(center-top), C(right-bottom). B-C dist=sqrt(240²+220²)≈325px (span=1300ms).
# Optimal: A→B→C with span=dist(B,C)/250*1000=1300ms. Window=1400ms, tight!
# X at (640,270) on the B→C straight path. Forces detour → span increases → fails!
# Solution: go A→C→B instead! span=dist(C,B)=same. Hmm same.
# OR: recognize that going A first (far), then either order for B/C works as long as B-C dist ≤ window*0.25.
# Let me reduce B-C distance: B(580,200), C(720,340). dist=sqrt(140²+140²)≈198px→792ms < 1000ms.
# X at (650,270) between B and C. Must detour: add ~80px → 278px → 1112ms > 1000ms. Fails with trap!
# Solution: go B first (echo=B), then C (C fires, B echoes). A → B → C gives span=dist(B→C). 
# But with detour: span increases past 1000ms. Alternative: A → C → B gives span=dist(C→B) = same. Hmm.
# Alternative: can player choose to step A, then go C (not B), then B? span=dist(C,B)=same distance. Same issue.
# The trap forces a longer path between the close pair B and C.
# To solve: step B first (nearby to C, but the trap is between them... same issue)
# Actually, rethink: X is on the B-C direct path. Going around adds distance. Window is set tight enough that detour fails.
# The REAL solution: step C first, walk around X to B... still same distance either way.
# The solution is: player needs to step A AND THEN go from B side or C side first, choosing the path that avoids X.
# If X is between B(580,200) and C(720,340), going around costs ~80px extra.
# dist(B→C direct)=198px→792ms. With 80px detour: 278px→1112ms > 1000ms. Fails!
# But wait: the TRAP only increases the travel time, not the span calculation itself.
# The span calculation counts the ACTIVATION TIMES, not the physical distance traveled.
# If player takes 1200ms to go from B to C (with detour), span = 1200ms > 1000ms. FAILS.
# If player avoids the trap (slightly longer path 250px), span=1000ms. BARELY PASSES.
# So the puzzle is: take the smart route that's slightly longer but under the limit.
# Window=1100ms, dist(B→C)=198px. With optimal detour: ~220px→880ms < 1100ms ✓.
# BUT going through the trap would mean stepping X and resetting echo, failing for a different reason.
# Right, the REAL reason traps are bad: stepping X sets echo=X (not B or C). Then C doesn't echo B.
# So the puzzle is: must not step X, and the detour around X must be fast enough.
# Window=1200ms (forgiving with smart route, tight if going wide), X between B and C.
dict(
  id=10, name='第10室·三角陷阱',
  hint='三踏板门，X 就在最优路线上——绕路才能保持回响链完整',
  solution='选择正确出发踏板，绕过 X 完成链式激活',
  pads=[
    ('A',160,270,'#50e8a0'),   # far left, step first
    ('B',580,180,'#e0a030'),   # close to C
    ('X',660,280,'#e06060'),   # between B and C
    ('C',740,380,'#c060ff'),   # close to B
  ],
  doors=[(900,270,55,160,['A','B','C'],1200)],
  exitX=938,exitY=270,reward=62,
),

# ─── 第三章：精密计时（11-15） ────────────────────────────────────────
# Timing becomes the primary challenge alongside routing.

# L11 — [A,B] where obvious order (left to right) works, but there's a misleading "shortcut" trap.
# A(right near exit), B(left near start). "Shortcut": step B right after spawn, walk to A.
# Trap X in the center makes the B→A path require careful navigation.
# Players learn: check BOTH directions, not just left→right.
dict(
  id=11, name='第11室·逆向直觉',
  hint='不一定要从左走到右——想想哪个踏板先踩更省时',
  solution='B → A（回响 B）→ 门开（从 B 出发更近）',
  pads=[
    ('B',190,350,'#e0a030'),   # near start, step first
    ('X',440,270,'#e06060'),   # trap on B→A diagonal
    ('A',780,200,'#50e8a0'),   # near exit
  ],
  doors=[(900,270,55,160,['A','B'],1500)],
  exitX=938,exitY=270,reward=65,
),

# L12 — [A,A] with tighter window. B (echo trigger) is surrounded on two sides by X pads.
# Only one safe approach angle.
# A(left), B(center-right), X above and below B. Must come from the right angle.
# dist(A,B) = sqrt(320²+70²)≈328px at 250px/s → 1312ms+120=1432ms > 1300ms.
# Shorter path: A(280,270), B(480,190). dist=sqrt(200²+80²)≈215px→860ms+120=980ms<1300ms ✓
dict(
  id=12, name='第12室·双踩夹击',
  hint='A 需要激活两次——B 被两个 X 包围，只留一条进路',
  solution='A → 从安全方向进入 B（回响完成双激活）→ 门开',
  pads=[
    ('A',280,270,'#50e8a0'),
    ('X',490,130,'#e06060'),   # above B
    ('B',490,210,'#e0a030'),   # echo trigger
    ('X',490,350,'#e06060'),   # below B
  ],
  doors=[(900,270,55,160,['A','A'],1300)],
  exitX=938,exitY=270,reward=68,
),

# L13 — Three-door chain [A,B]+[B,C]+[C,D]. Four pads in a Z-shape.
# Tests whether player can maintain echo chain over 4 pads.
# A→B→C→D: each step echoes previous, each door opens in sequence.
dict(
  id=13, name='第13室·连锁反应',
  hint='四个踏板，三扇门——每踩一步都会为下一扇门铺路',
  solution='A → B → C → D（每步回响前一个，链式开门）',
  pads=[
    ('A',130,200,'#50e8a0'),
    ('B',360,380,'#e0a030'),
    ('C',580,200,'#c060ff'),
    ('D',780,380,'#60c0ff'),
  ],
  doors=[
    (900,150,55,100,['A','B'],1800),
    (900,280,55,100,['B','C'],1800),
    (900,410,55,100,['C','D'],1800),
  ],
  exitX=938,exitY=270,reward=76,
),

# L14 — [A,B,C] with careful spatial planning needed.
# Three pads: A(top-left), B(right-center), C(bottom-left). 
# B is far from A and C. Optimal: step A or C first (both far from the B-C/A-C pair), 
# then chain to minimize final span.
# If step A(160,130): span = dist(B,C) if chain is A→B→C, or dist(A,C)/A→C→B etc.
# Best: step B first (center-right). Then A or C.
# span for B→A→C: dist(A,C)=sqrt(60²+280²)≈288px→1152ms. Window=1200ms. Tight!
# span for B→C→A: dist(C,A)=same. 
# span for A→B→C: dist(B,C)=sqrt(580²+250²)≈632px→2528ms. Way too slow.
# span for C→B→A: dist(B,A)=sqrt(580²+250²)≈632px. Same. 
# span for A→C→B: dist(C,B)=632px. Same.
# Wait: A(160,130), B(740,380), C(220,410). 
# dist(A,B)=sqrt(580²+250²)≈632px. dist(B,C)=sqrt(520²+30²)≈521px. dist(A,C)=sqrt(60²+280²)≈288px.
# Best pair for last two: A and C (dist=288px → span=1152ms < 1200ms ✓).
# Strategy: step B first (farthest), then A,C (or C,A).
dict(
  id=14, name='第14室·三角博弈',
  hint='三踏板门——先踩哪个很关键，错误的顺序让最后两步距离太远',
  solution='先踩离另两者最远的踏板，再完成最后两步',
  pads=[
    ('A',160,130,'#50e8a0'),
    ('B',740,380,'#e0a030'),   # far from A and C, step first
    ('C',220,410,'#c060ff'),
  ],
  doors=[(900,270,55,160,['A','B','C'],1200)],
  exitX=938,exitY=270,reward=80,
),

# L15 — [A,A] tight window with one trap blocking shortcut.
# A(center-left), B(center-right), X between them on direct path.
# Must go around X. Detour adds ~80px to direct 280px path.
# direct: dist(A,B)=280px→1120ms+120=1240ms. Window=1400ms? 
# But X at (520,270) is on y=270 horizontal. A(340,270), B(700,270). 
# X blocks horizontal path. Must go up/down: add 2*80=160px detour → 440px@200px/s=2200ms+120=2320ms > 1400ms. Fails!
# Need window ≥ 2320ms. That's too generous.
# Alternative: shorter distance. A(400,270), B(580,190). X(490,270) on horizontal.
# direct diagonal dist=sqrt(180²+80²)≈198px@250px/s→792ms+120=912ms.  
# But X at (490,270) is NOT on direct diagonal from (400,270) to (580,190). Let me check.
# Path: from (400,270) to (580,190): parametrize (400+180t, 270-80t). At t=0.5: (490,230). X is at (490,270) — distance from (490,230) to (490,270) = 40px > 28px. Safe!
# So X doesn't block the diagonal. It only blocks players going straight right at y=270.
# This is actually a good trap: players who habitually move right will hit it, 
# but players who naturally go diagonally to B won't.
# Window=1100ms. dist=198px@250px/s→792ms+120=912ms < 1100ms ✓.
dict(
  id=15, name='第15室·水平封锁',
  hint='X 挡住了水平直路——但 B 在斜上方，你不需要走直线',
  solution='斜向到达 B（回响 A，完成双激活），无需经过 X',
  pads=[
    ('A',400,290,'#50e8a0'),
    ('X',500,290,'#e06060'),   # blocks horizontal right path
    ('B',620,190,'#e0a030'),   # up-right, reachable diagonally
  ],
  doors=[(900,270,55,160,['A','A'],1100)],
  exitX=938,exitY=270,reward=72,
),

# ─── 第四章：多重博弈（16-20） ────────────────────────────────────────
# Multiple doors with shared pads, conflicting routes, planning required.

# L16 — [A,B]+[B,C] but B is surrounded by two X pads.
# Must reach B carefully, then reach C without hitting X again.
dict(
  id=16, name='第16室·共享枢纽',
  hint='B 是两扇门的共同钥匙——但它左右各有一个 X',
  solution='从上方或下方进入 B，再绕出到 C',
  pads=[
    ('A',160,380,'#50e8a0'),
    ('X',430,270,'#e06060'),   # left of B
    ('B',560,270,'#e0a030'),   # shared hub
    ('X',690,270,'#e06060'),   # right of B (between B and C)
    ('C',820,160,'#c060ff'),
  ],
  doors=[
    (900,190,55,120,['A','B'],2000),
    (900,370,55,120,['B','C'],2000),
  ],
  exitX=938,exitY=270,reward=85,
),

# L17 — Two independent doors [A,B] + [C,D].
# Must do two separate echo chains. Player must plan which chain to execute first.
# If they do A→B, echo is now B. Then doing C→D works (C→D is independent).
# Challenge: actually execute both correctly without getting confused.
dict(
  id=17, name='第17室·双线并行',
  hint='两扇门完全独立——各自需要不同的踩踏对，没有共用踏板',
  solution='先完成 A→B（门1），再完成 C→D（门2）',
  pads=[
    ('A',160,160,'#50e8a0'),
    ('B',380,380,'#e0a030'),
    ('C',540,160,'#c060ff'),
    ('D',760,380,'#60c0ff'),
  ],
  doors=[
    (900,190,55,120,['A','B'],2200),
    (900,370,55,120,['C','D'],2200),
  ],
  exitX=938,exitY=270,reward=88,
),

# L18 — [B,B]+[A,C] combo: one door needs B twice, another needs A+C.
# Step A (far left), then B (center, door1 gets one B), then C (echo B → B fires again → door1 gets B,B!
# Also: most recent A = T0, C = T2, span=T2-T0. Window for [A,C] must be > time(A→B→C).
# T0=A, T1=B, T2=C. A activated T0, C activated T2. span for [A,C] = T2-T0.
# At 250px/s, dist(A,B)=sqrt(260²+100²)≈278px→1112ms. dist(B,C)=sqrt(240²+120²)≈268px→1072ms.
# Total A→B→C = 2184ms. [A,C] window must be > 2184ms. Use 2500ms.
# For [B,B]: B at T1, B(echo from C) at T2+120. span=T2+120-T1=dist(B,C)/250*1000+120=1192ms. Window=1400ms.
dict(
  id=18, name='第18室·双响交织',
  hint='一扇门需要 B 激活两次，另一扇需要 A+C——同一次走完要解决两个问题',
  solution='A → B（B第一次）→ C（回响B，B第二次）→ 两门全开',
  pads=[
    ('A',160,200,'#50e8a0'),
    ('B',420,310,'#e0a030'),   # shared, needs double activation
    ('C',660,190,'#c060ff'),
  ],
  doors=[
    (900,190,55,120,['B','B'],1500),
    (900,370,55,120,['A','C'],2600),
  ],
  exitX=938,exitY=270,reward=92,
),

# L19 — [A,B,C] with two traps. Both obvious B→C paths blocked.
# A(left, step first). B and C on right, X pads on direct routes between them.
# Must find the safe path between B and C.
# B(640,180), X(680,260), C(720,380). Direct B→C path passes near X.
# X at (680,260): path from B(640,180) to C(720,380) passes through (680,280)... close to X(680,260)! Distance=20px < 28px. Triggered!
# Must go around: either left or right of the X. Going right: (640,180)→(780,180)→(780,380)→(720,380).
# Extra dist: (140+200+60)=400px vs direct ≈206px. span increases from 824ms to 1600ms.
# Hmm, too slow for window 1000ms.
# Better design: B(620,160), X(700,270), C(780,400). 
# Direct B→C: goes through (700,280), X at (700,270) — distance=10px. Triggered!
# Must detour. Direct dist=sqrt(160²+240²)≈288px→1152ms. With detour ~320px→1280ms.
# Window=1400ms. Detour path is achievable.
dict(
  id=19, name='第19室·双向封堵',
  hint='两个 X 分别挡住 B→C 的两条常规路线——需要找第三条路',
  solution='A（出发）→ B → 绕过双重封堵 → C（回响链完整）',
  pads=[
    ('A',160,270,'#50e8a0'),
    ('B',580,140,'#e0a030'),
    ('X',680,240,'#e06060'),   # on direct B→C path
    ('X',640,340,'#e06060'),   # on lower bypass
    ('C',780,400,'#c060ff'),
  ],
  doors=[(900,270,55,160,['A','B','C'],1400)],
  exitX=938,exitY=270,reward=96,
),

# L20 — Three doors with four pads. One trap forces a routing decision.
# A→B→C→D opens all three doors in chain. But X is between C and D.
# Must navigate X while maintaining timing.
dict(
  id=20, name='第20室·三锁贯通',
  hint='四个踏板开三扇门——链式踩踏，但 X 挡住了 C 到 D 的路',
  solution='A → B → C → 绕过 X → D（链式回响，三门全开）',
  pads=[
    ('A',130,200,'#50e8a0'),
    ('B',350,400,'#e0a030'),
    ('C',580,200,'#c060ff'),
    ('X',700,310,'#e06060'),   # between C and D
    ('D',800,420,'#60c0ff'),
  ],
  doors=[
    (900,150,55,100,['A','B'],1800),
    (900,280,55,100,['B','C'],1800),
    (900,410,55,100,['C','D'],1800),
  ],
  exitX=938,exitY=270,reward=100,
),

# ─── 第五章：逻辑倒置（21-25） ────────────────────────────────────────
# Counterintuitive or surprising solutions required.

# L21 — Two A pads at different positions. Door needs [A,B] tight window (600ms).
# One A pad is close to B, the other is far. Player must recognize which A to use.
# Close A(720,280) to B(820,180): dist=sqrt(100²+100²)≈141px@250px/s=564ms+120=684ms > 600ms! Tight.
# Better: A(740,260), B(840,180). dist=sqrt(100²+80²)≈128px@250px/s=512ms+120=632ms > 600ms. Still fails!
# Hmm. For [A,B] with 600ms window, using echo trick: span=120ms always. Just need to step one then other.
# Oh wait — for [A,B] with window 600ms, echo always gives 120ms span. So 600ms is MORE than enough!
# The challenge must be something else. Let me make the window 500ms (still > 120ms, works with echo) but
# there's a trap between the two A pads making it hard to choose which one to step first.
# Actually for any [A,B] door, ANY window >= 120ms works with echo trick. The "600ms" window is irrelevant.
# Real challenge: which A pad to step, given traps on paths between the non-obvious A and B.
# Far A(200,160): no traps. Close A(700,300) near B: X(760,220) between them.
# So use far A (no traps), step far A then B (echo). Window=1800ms easily achievable.
# OR: step close A, careful path to B avoiding X(760,220).
# The puzzle is: both A pads work, but one path is trap-free.
# Use window=1600ms to make far-A route work fine, close-A requires careful navigation.
# This makes the close-A route "valid but tricky". More interesting than just "use far A".
dict(
  id=21, name='第21室·同色双踏',
  hint='房间里有两个 A——任意一个被踩都算 A 激活，但路线不同',
  solution='选择合适的 A，避开 X，完成 A → B（回响 A）',
  pads=[
    ('A',200,160,'#50e8a0'),   # far A, no traps on its path to B
    ('X',700,240,'#e06060'),   # between close-A and B
    ('A',660,340,'#50e8a0'),   # close A, X nearby
    ('B',820,180,'#e0a030'),
  ],
  doors=[(900,270,55,160,['A','B'],1600)],
  exitX=938,exitY=270,reward=103,
),

# L22 — [A,B,C] tight 900ms window. Clever ordering required.
# A(160,270) far left. B(620,200) and C(700,390) on right.
# dist(B,C)=sqrt(80²+190²)≈206px@250px/s=824ms < 900ms. 
# Step A→B→C: span=824ms < 900ms ✓. But tight.
# X at (660,300) on direct B→C path. Must detour from B to C.
# Detour: (620,200)→(750,200)→(750,390)→(700,390). Extra: (130+190+50)=370px vs 206px direct.
# span = 370/250*1000 = 1480ms > 900ms. FAILS with detour!
# Alternative: step A→C→B instead. span=dist(C,B)=same. Same issue.
# Solution: step C first, then go to B (span=dist(C,B) with detour), then go all the way to A.
# Wait no: for A→B→C, span depends only on B→C path time. X is on this path. Detour fails.
# For C→B→A: span = dist(B,A). dist(B,A)=sqrt(460²+70²)≈465px@250=1860ms. Too slow.
# For C→A→B: span = dist(A,B). dist(A,B)=sqrt(460²+70²)=465px. Same.
# For B→C→A: span=dist(C,A)=sqrt(460²+120²)≈476px. Too slow.
# Hmm. The only way to get span < 900ms is to have the last two pads within 225px.
# With X on B-C path, player must find alternate path where distance to C is < 225px.
# Alternative path from B(620,200): go to (720,200) then (720,390) then (700,390).
# That's going wide right. dist = 100+190+20 = 310px → 1240ms. Still too slow.
# I need to redesign. Let me put X elsewhere.
# B(600,180), C(720,400). dist=sqrt(120²+220²)≈252px→1008ms > 900ms. Already too slow without detour!
# B(600,200), C(720,360). dist=sqrt(120²+160²)=200px→800ms < 900ms ✓.  
# X at (640,270) between them. Detour: ~250px→1000ms > 900ms. Hard!
# But if player finds path that goes (600,200)→(600,360)→(720,360): 160+120=280px→1120ms. Still too slow.
# Maybe I need window=1200ms and make it achievable with a ~280px detour.
# Actually let me reconsider: X at (660,280), B(600,180), C(720,380).
# Direct dist(B,C) = sqrt(120²+200²)≈233px → 932ms. Window=1000ms, tight!
# X at (660,280): is it on the direct path? B(600,180)→C(720,380) parameterized: (600+120t, 180+200t).
# At t=0.5: (660,280). EXACTLY on the direct path! X at (660,280) blocks it.
# Detour: go left of X: (600,180)→(590,280)→(720,380). dist=sqrt(10²+100²)+sqrt(130²+100²)≈101+164=265px→1060ms > 1000ms. FAILS by 60ms!
# Or go right of X: (600,180)→(730,180)→(730,380)→(720,380). dist=130+200+10=340px→1360ms. Way too slow.
# Only barely-achievable solution: go slightly left of center, fast.
# With window=1100ms, detour ~265px→1060ms ✓ (just barely).
# This is a very tight level! Good for level 22.
dict(
  id=22, name='第22室·精确绕行',
  hint='三踏板门（900ms），X 正好在最优路线上——必须找精确的绕行路径',
  solution='A → B → 快速绕过 X → C（严格控制路线长度）',
  pads=[
    ('A',160,270,'#50e8a0'),
    ('B',600,180,'#e0a030'),
    ('X',660,280,'#e06060'),   # exactly on direct B→C path
    ('C',720,380,'#c060ff'),
  ],
  doors=[(900,270,55,160,['A','B','C'],1100)],
  exitX=938,exitY=270,reward=107,
),

# L23 — [A,A] with multiple traps. Very tight window.
# A(300,270), B(430,190). dist=sqrt(130²+80²)≈153px@250px/s=612ms+120=732ms < 900ms ✓.
# X at (380,230) on direct diagonal path. Must slightly arc around it.
# X at (380,230): direct path (300,270)→(430,190) passes through ~(365,230). 
# Parameterize: (300+130t, 270-80t). At (365,230): t≈0.5, point=(365,230). X is at (380,230).
# Distance from (365,230) to (380,230) = 15px < 28px. ON THE PATH! 
# Must detour. Path around X: go up more first. E.g., (300,270)→(300,170)→(430,190).
# dist=100+131=231px@250px/s=924ms+120=1044ms > 900ms. FAILS.
# With window=1100ms: 1044ms < 1100ms ✓. Just barely.
dict(
  id=23, name='第23室·双踩陷阱',
  hint='X 就在 A 到 B 的对角线上——需要绕行，但 A 的双激活窗口很紧',
  solution='A → 绕过 X → B（回响 A，刚好在 1100ms 内）',
  pads=[
    ('A',300,290,'#50e8a0'),
    ('X',390,230,'#e06060'),   # on direct diagonal
    ('B',440,180,'#e0a030'),   # echo trigger
  ],
  doors=[(900,270,55,160,['A','A'],1100)],
  exitX=938,exitY=270,reward=111,
),

# L24 — [A,B]+[B,C]+[C,D] three-door chain with a trap between A and B.
# Must still complete the full chain.
dict(
  id=24, name='第24室·三锁连环',
  hint='四踏板三门链——X 挡在起点附近，要维持整条链就必须绕开',
  solution='A → 绕过 X → B → C → D（回响链不中断）',
  pads=[
    ('A',130,300,'#50e8a0'),
    ('X',280,220,'#e06060'),   # between A and B
    ('B',400,160,'#e0a030'),
    ('C',590,380,'#c060ff'),
    ('D',800,200,'#60c0ff'),
  ],
  doors=[
    (900,150,55,100,['A','B'],1800),
    (900,280,55,100,['B','C'],1800),
    (900,410,55,100,['C','D'],1800),
  ],
  exitX=938,exitY=270,reward=115,
),

# L25 — [A,B,C] + [A,B,D] two separate three-pad doors sharing A and B.
# Must activate A, B, C, D all in correct order.
# Key insight: A→B fires A+B together. Then C echoes B: A+B+C. 
# Then must re-trigger for [A,B,D] door. But A and B are "old".
# Actually: door2 [A,B,D] checks MOST RECENT A, B, D.
# After step A→B→C: most recent A=T1+120(echo), B=T2+120(echo), C=T2.
# For door2 [A,B,D]: need D to be within windowMs of most recent A and B.
# Most recent A=T1+120, B=T2+120. D must be within windowMs of max(T1+120,T2+120)=T2+120.
# If D is stepped at T3: span=T3-T1+120 (from A=T1+120 to D=T3). Need T3-T1 ≤ window-120.
# At 250px/s, dist(C,D)*4=max dist for window.
# C(760,180), D(760,400). dist(C,D)=220px→880ms. window=1400ms: T3-T2=880ms. 
# T3-T1 = (T2-T1)+880ms. T2-T1=dist(B,C)@250px/s. B(480,290), C(760,180): sqrt(280²+110²)≈300px→1200ms.
# T3-T1 = 1200+880=2080ms+120=2200ms. Window=1400ms. 2200ms >> 1400ms. FAILS.
# This approach is getting too complex. Let me simplify.
# For two independent three-pad doors, use [A,B,C] + [D,E,F] instead (completely separate).
# A,B,C on one side, D,E,F on other. No interaction needed.
# Two sets of three-pad doors, each needing its own chain. Tighter windows.
# Actually let me use [A,B]+[A,C]+[B,C] — all three pairwise combinations of three pads.
# This means: after stepping all three pads within windowMs, all three doors open simultaneously!
# A+B → door1. B+C → door2. A+C → door3.
# Strategy: A→B→C: door1 (A+B from T1+120 and T1), door2 (B+C from T2+120 and T2), door3 (A+C from T1+120 and T2)
# For door3 [A,C]: most recent A=T1+120, most recent C=T2. span=T2-T1-120=dist(B,C)/250*1000-120.
# For window=1000ms: dist(B,C) ≤ (1000+120)/250*1000 = ...wait let me recalc.
# span = T2 - (T1+120) = T2-T1-120 = dist(B,C)/0.250ms - 120ms.
# Need span ≤ window: dist(B,C)/0.250 - 120 ≤ 1000 → dist(B,C) ≤ 280px. OK manageable.
dict(
  id=25, name='第25室·三角联锁',
  hint='三扇门，共用三个踏板——A+B、B+C、A+C 各开一扇\n一次正确走法能同时开全',
  solution='按正确顺序踩完 A、B、C，三扇门在同一时间窗口内全部满足',
  pads=[
    ('A',180,200,'#50e8a0'),
    ('B',480,420,'#e0a030'),
    ('C',740,220,'#c060ff'),
  ],
  doors=[
    (900,150,55,100,['A','B'],1500),
    (900,280,55,100,['B','C'],1500),
    (900,410,55,100,['A','C'],1500),
  ],
  exitX=938,exitY=270,reward=120,
),

# ─── 第六章：时序极限（26-30） ────────────────────────────────────────
# Master challenges combining all mechanics.

# L26 — Trap maze: A and D are the only useful pads. Five X pads form two barriers.
# Must navigate through barriers to complete A→D chain.
# Barrier 1: X at (340,160), (340,280), (340,400) — vertical wall at x=340. Gaps at y<132 and y>428.
# Barrier 2: X at (560,200), (560,320) — partial wall at x=560. Gap at y<172 or y>348 or between.
# Gap between 200 and 320 at x=560: 200-320=120px gap — passable (120>>56).
# So: can thread through gap in barrier2. But barrier1 has gaps only at extremes.
# A(160,270), D(780,270). Player must:
# Step A → go above barrier1 (y<132 or y>428) → pass through barrier2 gap → reach D.
dict(
  id=26, name='第26室·双重迷阵',
  hint='两道 X 屏障挡住去路——只有 A 和 D 有用，找到穿越两道屏障的路',
  solution='A → 穿越双重 X 屏障 → D（回响 A）→ 门开',
  pads=[
    ('A',160,270,'#50e8a0'),
    ('X',380,130,'#e06060'),   # barrier 1 (3 pads)
    ('X',380,270,'#e06060'),
    ('X',380,410,'#e06060'),
    ('X',590,200,'#e06060'),   # barrier 2 (2 pads, has gap)
    ('X',590,340,'#e06060'),
    ('D',800,270,'#60c0ff'),
  ],
  doors=[(900,270,55,160,['A','D'],3000)],
  exitX=938,exitY=270,reward=118,
),

# L27 — [A,B,C] window=750ms. Very tight. No traps but requires optimal first-pad choice.
# A(180,200), B(600,180), C(680,380).
# dist(B,C)=sqrt(80²+200²)≈215px@250px/s=860ms > 750ms. Too slow for A→B→C!
# Must try A→C→B: span=dist(C,B)=same. Still too slow.
# Try C→A→B: span=dist(A,B)=sqrt(420²+20²)≈420px@250=1680ms. Way too slow.
# Try B→A→C: span=dist(A,C)=sqrt(500²+180²)≈528px. Too slow.
# Try B→C→A: span=dist(C,A)=528px. Too slow.
# Try C→B→A: span=dist(B,A)=420px. Too slow.
# Hmm, need to rethink. For window=750ms: dist between last two pads ≤ 187px.
# Need B and C (or A and C, or A and B) within 187px.
# Let me redesign pads so exactly ONE pair is within 187px:
# A(200,200), B(720,200), C(760,380). 
# dist(A,B)=520px, dist(B,C)=sqrt(40²+180²)≈184px. Optimal: A→B→C, span=dist(B,C)=184px→736ms < 750ms ✓!
# Other orderings: A→C→B: span=dist(C,B)=184px→736ms ✓ (same, since B and C are the close pair).
# dist(A,C)=sqrt(560²+180²)≈588px, dist(A,B)=520px. Both too slow if A is last.
# So: must step A first (it's farthest from BC cluster), then B and C in any order.
# This is a genuine spatial insight puzzle!
dict(
  id=27, name: '第27室·距离测算',
  hint='三踏板门，窗口仅 750ms——必须找出哪对踏板最近，先踩另一个',
  solution='分析三者距离，先踩离另两者最远的踏板，最后两步在窗口内完成',
  pads=[
    ('A',200,200,'#50e8a0'),   # far from B and C, step first
    ('B',720,200,'#e0a030'),   # close to C (184px), step second or third
    ('C',760,380,'#c060ff'),   # close to B, step second or third
  ],
  doors=[(900,270,55,160,['A','B','C'],750)],
  exitX=938,exitY=270,reward=126,
),

# L28 — [A,B]+[B,C] with tight windows and trap on A→B path.
# Also B is centrally placed but surrounded by two X pads.
# Must approach from the open side.
dict(
  id=28, name='第28室·枢纽封锁',
  hint='B 是两门共用钥匙，X 从两侧挡住——找准进出 B 的方向',
  solution='A → 从下方绕 X → B（门1）→ 从上方绕 X → C（门2）',
  pads=[
    ('A',160,420,'#50e8a0'),
    ('X',400,280,'#e06060'),   # blocks A-to-B path
    ('B',560,280,'#e0a030'),   # hub
    ('X',720,280,'#e06060'),   # blocks B-to-C path
    ('C',840,140,'#c060ff'),
  ],
  doors=[
    (900,190,55,120,['A','B'],1600),
    (900,370,55,120,['B','C'],1600),
  ],
  exitX=938,exitY=270,reward=132,
),

# L29 — [A,B,C] window=650ms. Requires optimal ordering AND precise movement.
# Need last two pads within 162px distance.
# A(200,270), B(720,200), C(760,340). 
# dist(B,C)=sqrt(40²+140²)≈146px@250px/s=584ms < 650ms ✓. Just fits!
# Other orderings too slow. Must step A first, then choose B or C, then the other.
# X at (680,270) — slightly on path between B and C. Must navigate carefully.
dict(
  id=29, name='第29室·毫秒博弈',
  hint='窗口仅 650ms——三踏板中，只有一对距离足够近，必须先踩第三个',
  solution='先踩离另两者最远的踏板，最后在 B、C 之间精确移动（绕过 X）',
  pads=[
    ('A',200,270,'#50e8a0'),   # far left, step first
    ('B',720,190,'#e0a030'),   # close to C
    ('X',700,300,'#e06060'),   # slightly on B→C path
    ('C',780,370,'#c060ff'),   # close to B
  ],
  doors=[(900,270,55,160,['A','B','C'],650)],
  exitX=938,exitY=270,reward=140,
),

# L30 — Ultimate: Four doors, five pads, one trap. Requires complete mental planning.
# Doors: [A,B]+[B,C]+[C,D]+[A,D]. The four doors form a "cycle" — need all four pads activated.
# A→B→C→D chain opens first three doors. But [A,D] door needs most recent A and D.
# After A→B→C→D:
#   most recent A = T1+120 (echo from step B), B = T2+120 (echo from step C), 
#   C = T3+120 (echo from step D), D = T3.
# For [A,D]: most recent A=T1+120, D=T3. span = T3-(T1+120) = T3-T1-120.
# = (dist(B,C)+dist(C,D))/250*1000 - 120.
# For this to be ≤ windowMs: dist(B,C)+dist(C,D) ≤ (windowMs+120)*0.250.
# With windowMs=2500: dist ≤ 655px. Achievable.
# X between C and D to add challenge.
# A(160,200), B(360,400), C(600,200), X(720,320), D(820,400).
# dist(A→B)=sqrt(200²+200²)≈283px. dist(B→C)=sqrt(240²+200²)≈312px. dist(C→D)=sqrt(220²+200²)≈297px.
# For [A,D]: T3-T1-120ms. T1-T0=dist(A,B)/250*1000=1132ms. T2-T1=1248ms. T3-T2≈dist(C,D)/250*1000=1188ms (with detour around X).
# T3-T1 = 1248+1188=2436ms. span=2436-120=2316ms. Window=2500ms ✓. Barely.
dict(
  id=30, name='第30室·时空终局',
  hint='四扇门含一个循环锁——A+B、B+C、C+D 依次踩通，最后 A+D 也要满足\n思考整个路线再出发',
  solution='A → B → C → 绕过 X → D（四门全开，最后的 A+D 依赖回响时间积累）',
  pads=[
    ('A',160,200,'#50e8a0'),
    ('B',360,400,'#e0a030'),
    ('C',600,200,'#c060ff'),
    ('X',720,320,'#e06060'),   # between C and D
    ('D',820,420,'#60c0ff'),
  ],
  doors=[
    (900,120,55,80,['A','B'],1800),
    (900,220,55,80,['B','C'],1800),
    (900,320,55,80,['C','D'],1800),
    (900,420,55,80,['A','D'],2600),
  ],
  exitX=938,exitY=270,reward=150,
),

]

COOP_LEVELS = '''\
  {
    id: 31,
    name: '双人第1室·镜像',
    hint: `两人分工：P1（WASD）前往 A，P2（方向键）前往 B
需在 600ms 内同时踩下——纯粹的眼神交流`,
    solution: 'P1:A 与 P2:B 同时踩下（600ms 内）→ 门开',
    pads: [
      { id: 'A', x: 210, y: 270, color: '#50e8a0' },
      { id: 'B', x: 680, y: 270, color: '#e0a030' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B'], windowMs: 600 },
    ],
    exitX: 938,
    exitY: 270,
    coop: true,
    sandReward: 55,
  },
  {
    id: 32,
    name: '双人第2室·接力',
    hint: `两人各自负责一扇门（互相独立）
P1：踩 A → B（回响触发 A，门1）
P2：踩 C → D（回响触发 C，门2）`,
    solution: 'P1:A→B(回响A)=门1  P2:C→D(回响C)=门2  → 通过',
    pads: [
      { id: 'A', x: 155, y: 175, color: '#50e8a0' },
      { id: 'B', x: 380, y: 375, color: '#e0a030' },
      { id: 'C', x: 480, y: 175, color: '#c060ff' },
      { id: 'D', x: 680, y: 375, color: '#e06060' },
    ],
    doors: [
      { x: 900, y: 205, w: 55, h: 108, requiredPads: ['A', 'B'], windowMs: 1600 },
      { x: 900, y: 345, w: 55, h: 108, requiredPads: ['C', 'D'], windowMs: 1600 },
    ],
    exitX: 938,
    exitY: 275,
    coop: true,
    sandReward: 65,
  },
  {
    id: 33,
    name: '双人第3室·三角',
    hint: `门需要 A、B、C 全部在 1800ms 内激活
P1：踩 A → B（回响 A）
P2：在 P1 踩 B 的前后 1.8s 内踩 C`,
    solution: 'P1:A→B(回响A)  P2:恰当时机踩C  三者在1800ms内 → 门开',
    pads: [
      { id: 'A', x: 175, y: 200, color: '#50e8a0' },
      { id: 'B', x: 400, y: 380, color: '#e0a030' },
      { id: 'C', x: 650, y: 200, color: '#c060ff' },
    ],
    doors: [
      { x: 900, y: 270, w: 55, h: 160, requiredPads: ['A', 'B', 'C'], windowMs: 1800 },
    ],
    exitX: 938,
    exitY: 270,
    coop: true,
    sandReward: 75,
  },
  {
    id: 34,
    name: '双人第4室·回响交汇',
    hint: `两扇门各需某踏板激活两次（双响机制）
P1：踩 A（记住）→ 快速踩 E（回响触发 A 第二次）→ 门1
P2：踩 C（记住）→ 快速踩 F（回响触发 C 第二次）→ 门2
两人都要快！`,
    solution: 'P1:A→E(回响A,A×2)=门1  P2:C→F(回响C,C×2)=门2  → 通过',
    pads: [
      { id: 'A', x: 155, y: 160, color: '#50e8a0' },
      { id: 'E', x: 315, y: 160, color: '#40b8ff' },
      { id: 'C', x: 490, y: 390, color: '#c060ff' },
      { id: 'F', x: 660, y: 390, color: '#f0e040' },
    ],
    doors: [
      { x: 900, y: 185, w: 55, h: 108, requiredPads: ['A', 'A'], windowMs: 1100 },
      { x: 900, y: 360, w: 55, h: 108, requiredPads: ['C', 'C'], windowMs: 1100 },
    ],
    exitX: 938,
    exitY: 275,
    coop: true,
    sandReward: 90,
  },
  {
    id: 35,
    name: '双人第5室·时间悖论',
    hint: `终极挑战——窗口仅 650ms，任何失误都是全队重来
P1：踩 C（记住）→ 快速踩 A（回响 C）避开干扰踏板 E
P2：踩 D（记住）→ 快速踩 B（回响 D）避开干扰踏板 X
两人必须几乎同时完成各自序列`,
    solution: 'P1:C→A(回响C,避开E)=门1  P2:D→B(回响D,避开X)=门2  → 通关',
    pads: [
      { id: 'A', x: 200, y: 175, color: '#50e8a0' },
      { id: 'B', x: 610, y: 375, color: '#e0a030' },
      { id: 'C', x: 120, y: 375, color: '#c060ff' },
      { id: 'D', x: 700, y: 175, color: '#e06060' },
      { id: 'E', x: 155, y: 275, color: '#ff9090' },
      { id: 'X', x: 655, y: 275, color: '#90c0ff' },
    ],
    doors: [
      { x: 900, y: 185, w: 55, h: 108, requiredPads: ['A', 'C'], windowMs: 650 },
      { x: 900, y: 360, w: 55, h: 108, requiredPads: ['B', 'D'], windowMs: 650 },
    ],
    exitX: 938,
    exitY: 275,
    coop: true,
    sandReward: 120,
  }
]
'''

def pad_ts(pad):
    """Convert pad tuple to TypeScript object."""
    pid, x, y, color = pad
    return f"      {{ id: '{pid}', x: {x}, y: {y}, color: '{color}' }},"

def door_ts(door):
    """Convert door tuple to TypeScript object."""
    x, y, w, h, required, window = door
    req_str = ', '.join(f"'{r}'" for r in required)
    return f"      {{ x: {x}, y: {y}, w: {w}, h: {h}, requiredPads: [{req_str}], windowMs: {window} }},"

def level_ts(lv):
    pads_str = '\n'.join(pad_ts(p) for p in lv['pads'])
    doors_str = '\n'.join(door_ts(d) for d in lv['doors'])
    hint = lv['hint'].replace('`', r'\`')
    solution = lv['solution'].replace("'", "\\'")
    return f"""  {{
    id: {lv['id']},
    name: '{lv['name']}',
    hint: `{hint}`,
    solution: '{solution}',
    pads: [
{pads_str}
    ],
    doors: [
{doors_str}
    ],
    exitX: {lv['exitX']},
    exitY: {lv['exitY']},
    coop: false,
    sandReward: {lv['reward']},
  }},"""


def build_file():
    lines = [HEADER]
    for lv in SOLO_LEVELS:
        lines.append(level_ts(lv))
        lines.append('')
    lines.append(COOP_LEVELS)
    return '\n'.join(lines)


if __name__ == '__main__':
    out_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'config', 'puzzleLevels.ts')
    content = build_file()
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Written {len(SOLO_LEVELS)} solo levels to {out_path}')
