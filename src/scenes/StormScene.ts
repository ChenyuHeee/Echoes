/**
 * StormScene — 虚空风暴 · 大逃杀
 *
 * 玩法：21 名回响体降落于碎片岛屿，搜刮装备，最后一人存活获胜。
 *
 * 操作：
 *   WASD     移动
 *   鼠标     瞄准
 *   左键     开火
 *   F        拾取武器
 *   TAB / Q  切换武器槽
 *   R        丢弃当前武器
 *   空格     近身回响冲击（短 CD 群体击退）
 *
 * 阶段缩圈：
 *   00s  半径 880  ─ 起始
 *   60s  半径 520  ─ 第一次（圈外 -4 HP/s）
 *  150s  半径 260
 *  240s  半径 100
 *  300s  半径  40  ─ 决战
 */
import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand, getRuntimeState } from '../state/gameState'
import { CHARACTER_DEFINITIONS, DEFAULT_CHARACTER } from '../config/characters'
import {
  WEAPON_DEFINITIONS, type WeaponDef, type WeaponId,
} from '../config/items'

const MAP_W = 2400
const MAP_H = 1800
const PLAYER_MAX_HP = 100
const TOTAL_PLAYERS = 21          // 1 人玩家 + 20 AI
const VOID_DPS = 4                // 圈外每秒掉血

// 缩圈时间表（秒 → 目标半径）
const STORM_PHASES: Array<{ at: number; r: number; label: string }> = [
  { at: 60,  r: 520, label: '虚空收缩 · 第 1 阶段' },
  { at: 150, r: 260, label: '虚空收缩 · 第 2 阶段' },
  { at: 240, r: 100, label: '虚空收缩 · 第 3 阶段' },
  { at: 300, r:  40, label: '决战之圈' },
]

// 武器掉落权重池（不出现传说，传说仅极小概率）
const COMMON_WEAPONS: WeaponId[]   = ['pulse_pistol', 'plasma_cutter']
const UNCOMMON_WEAPONS: WeaponId[] = ['void_smg', 'arc_rifle', 'temporal_burst']
const RARE_WEAPONS: WeaponId[]     = ['chrono_shotgun', 'gravity_cannon']
const LEGENDARY_WEAPONS: WeaponId[]= ['echo_sniper', 'void_launcher']

interface WeaponInstance {
  def: WeaponDef
  ammo: number
}

interface AIPlayer {
  id: number
  sprite: Phaser.Physics.Arcade.Image
  hpBarBg: Phaser.GameObjects.Rectangle
  hpBarFill: Phaser.GameObjects.Rectangle
  weaponLabel: Phaser.GameObjects.Text
  hp: number
  maxHp: number
  isAlive: boolean
  speed: number
  weapon: WeaponInstance | null
  // AI 状态
  mode: 'wander' | 'engage' | 'flee' | 'rotate'
  lastDecisionAt: number
  lastShotAt: number
  targetX: number
  targetY: number
  // 战斗
  facing: number
  // 排名
  placement?: number
}

interface FloorPickup {
  sprite: Phaser.Physics.Arcade.Image
  label?: Phaser.GameObjects.Text
  kind: 'weapon' | 'ammo' | 'medkit'
  data: WeaponInstance | { ammo: number } | { heal: number }
}

export class StormScene extends Phaser.Scene {
  // ── 玩家 ─────────────────────────────────────────────
  private player!: Phaser.Physics.Arcade.Image
  private playerHp = PLAYER_MAX_HP
  private playerMaxHp = PLAYER_MAX_HP
  private playerAlive = true
  private finished = false
  private charSpriteKey = 'player_idle'

  // 武器槽（最多 2 把）
  private weaponSlots: (WeaponInstance | null)[] = [null, null]
  private currentSlot = 0

  // 射击
  private playerLastShotAt = 0
  private playerBullets!: Phaser.Physics.Arcade.Group
  private aiBullets!: Phaser.Physics.Arcade.Group

  // 近身冲击（空格）
  private burstReadyAt = 0

  // ── AI ───────────────────────────────────────────────
  private aiList: AIPlayer[] = []

  // ── 地图与战利品 ─────────────────────────────────────
  private floorPickups: FloorPickup[] = []
  private floorGroup!: Phaser.Physics.Arcade.Group

  // ── 风暴圈 ───────────────────────────────────────────
  private currentRadius = 880
  private targetRadius = 880
  private readonly VOID_CX = MAP_W / 2
  private readonly VOID_CY = MAP_H / 2
  private voidGfx!: Phaser.GameObjects.Graphics
  private nextPhaseIdx = 0

  // ── HUD ──────────────────────────────────────────────
  private hpBarFill!: Phaser.GameObjects.Rectangle
  private hpText!: Phaser.GameObjects.Text
  private aliveText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private weaponSlotText!: Phaser.GameObjects.Text
  private phaseText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private minimap!: Phaser.GameObjects.Graphics

  // ── 统计 ─────────────────────────────────────────────
  private kills = 0
  private startTime = 0
  private playerPlacement = 0

  // ── 输入 ─────────────────────────────────────────────
  private keys!: {
    w: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    s: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
    f: Phaser.Input.Keyboard.Key
    q: Phaser.Input.Keyboard.Key
    tab: Phaser.Input.Keyboard.Key
    r: Phaser.Input.Keyboard.Key
    space: Phaser.Input.Keyboard.Key
  }
  private mouseDown = false

  constructor() {
    super('StormScene')
  }

  // ════════════════════════════════════════════════════
  //  init / create
  // ════════════════════════════════════════════════════

  init() {
    const charId = getRuntimeState().player.selectedCharacter ?? DEFAULT_CHARACTER
    const def = CHARACTER_DEFINITIONS[charId] ?? CHARACTER_DEFINITIONS[DEFAULT_CHARACTER]
    this.charSpriteKey = `char_${def.id}_sp`
    if (!this.textures.exists(this.charSpriteKey)) {
      this.charSpriteKey = 'player_idle'
    }
  }

  create() {
    this.playerHp = PLAYER_MAX_HP
    this.playerMaxHp = PLAYER_MAX_HP
    this.playerAlive = true
    this.finished = false
    this.kills = 0
    this.aiList = []
    this.floorPickups = []
    this.weaponSlots = [null, null]
    this.currentSlot = 0
    this.startTime = Date.now()
    this.currentRadius = 880
    this.targetRadius = 880
    this.nextPhaseIdx = 0
    this.playerLastShotAt = 0
    this.burstReadyAt = 0
    this.playerPlacement = 0
    this.mouseDown = false

    audioManager.startBattleBgm()
    this.cameras.main.setBackgroundColor('#06080d')
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H)

    // 地面
    this.add.tileSprite(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 'tile_cyber_a').setAlpha(0.55).setDepth(0)
    this.add.tileSprite(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 'tile_cyber_b').setAlpha(0.16).setDepth(1)

    // 风暴圈
    this.voidGfx = this.add.graphics().setDepth(4)

    // 子弹组
    this.playerBullets = this.physics.add.group()
    this.aiBullets = this.physics.add.group()
    this.floorGroup = this.physics.add.group()

    // 玩家
    this.player = this.physics.add.image(MAP_W / 2, MAP_H / 2, this.charSpriteKey)
    this.player.setScale(2).setDepth(20)
    this.player.setCollideWorldBounds(true)
    this.player.setDrag(1300, 1300)
    this.player.setMaxVelocity(220, 220)
    ;(this.player.body as Phaser.Physics.Arcade.Body).allowGravity = false
    ;(this.player.body as Phaser.Physics.Arcade.Body).setCircle(14, 2, 2)

    // 起始武器：脉冲手枪 + 60 弹药
    this.weaponSlots[0] = { def: WEAPON_DEFINITIONS.pulse_pistol, ammo: 60 }

    // 战利品散布
    this.spawnLoot()

    // AI（20）
    this.spawnAI(TOTAL_PLAYERS - 1)

    // 输入
    const kb = this.input.keyboard!
    this.keys = {
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      f: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      tab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
      r: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    }
    // 阻止 TAB 默认行为
    this.input.keyboard!.addCapture(['TAB', 'SPACE'])

    kb.on('keydown-TAB', () => this.swapWeapon())
    kb.on('keydown-Q',   () => this.swapWeapon())
    kb.on('keydown-F',   () => this.tryPickup())
    kb.on('keydown-R',   () => this.dropCurrentWeapon())
    kb.on('keydown-SPACE', () => this.tryEchoBurst())

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.mouseDown = true
    })
    this.input.on('pointerup', () => { this.mouseDown = false })

    // 摄像机
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setZoom(0.85)
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H)

    // 子弹碰撞
    this.physics.add.overlap(this.playerBullets, this.aiList.map(a => a.sprite), undefined, undefined, this)
    // 由于 AI 列表动态变化，这里不直接 overlap，改为在 update 中手动检测

    this.buildHUD()
    this.toast('降落成功 — 搜刮武器，活到最后', '#9be0ff', 2200)

    // 死亡时移除按键监听以避免重启时旧场景仍响应
    this.events.once('shutdown', () => {
      kb.removeAllListeners('keydown-TAB')
      kb.removeAllListeners('keydown-Q')
      kb.removeAllListeners('keydown-F')
      kb.removeAllListeners('keydown-R')
      kb.removeAllListeners('keydown-SPACE')
    })
  }

  // ════════════════════════════════════════════════════
  //  生成
  // ════════════════════════════════════════════════════

  private spawnLoot() {
    // 武器 24 把，覆盖整张图（稀有度按权重）
    for (let i = 0; i < 24; i++) {
      const x = 120 + Math.random() * (MAP_W - 240)
      const y = 120 + Math.random() * (MAP_H - 240)
      // 离玩家出生点远一些
      if (Phaser.Math.Distance.Between(x, y, MAP_W / 2, MAP_H / 2) < 200) continue
      this.spawnWeaponPickup(x, y, this.rollWeaponId())
    }
    // 弹药包 30 个
    for (let i = 0; i < 30; i++) {
      const x = 120 + Math.random() * (MAP_W - 240)
      const y = 120 + Math.random() * (MAP_H - 240)
      this.spawnAmmoPickup(x, y, 30)
    }
    // 医疗包 16 个
    for (let i = 0; i < 16; i++) {
      const x = 120 + Math.random() * (MAP_W - 240)
      const y = 120 + Math.random() * (MAP_H - 240)
      this.spawnMedkitPickup(x, y, 30)
    }
  }

  private rollWeaponId(): WeaponId {
    const r = Math.random()
    if (r < 0.05) return LEGENDARY_WEAPONS[Math.floor(Math.random() * LEGENDARY_WEAPONS.length)]
    if (r < 0.25) return RARE_WEAPONS[Math.floor(Math.random() * RARE_WEAPONS.length)]
    if (r < 0.65) return UNCOMMON_WEAPONS[Math.floor(Math.random() * UNCOMMON_WEAPONS.length)]
    return COMMON_WEAPONS[Math.floor(Math.random() * COMMON_WEAPONS.length)]
  }

  private rarityColor(def: WeaponDef): number {
    switch (def.rarity) {
      case 'legendary': return 0xffb040
      case 'rare':      return 0xc080ff
      case 'uncommon':  return 0x60d0ff
      default:          return 0xc8d0d8
    }
  }

  private spawnWeaponPickup(x: number, y: number, weaponId: WeaponId, ammo?: number) {
    const def = WEAPON_DEFINITIONS[weaponId]
    const tint = this.rarityColor(def)
    const sp = this.physics.add.image(x, y, def.spriteKey).setScale(1.6).setDepth(8)
    sp.setTint(tint)
    ;(sp.body as Phaser.Physics.Arcade.Body).allowGravity = false
    this.floorGroup.add(sp)
    const lbl = this.add.text(x, y - 22, def.name, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px',
      color: '#' + tint.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setDepth(9)
    const inst: WeaponInstance = { def, ammo: ammo ?? this.defaultAmmoFor(def) }
    this.floorPickups.push({ sprite: sp, label: lbl, kind: 'weapon', data: inst })
    this.tweens.add({ targets: sp, y: y - 4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
  }

  private defaultAmmoFor(def: WeaponDef): number {
    // 慢速高伤武器弹少；快速武器弹多
    if (def.fireRateMs >= 800) return 6     // 重力炮 / 虚空发射器
    if (def.fireRateMs >= 400) return 18    // 霰弹 / 狙
    if (def.fireRateMs >= 100) return 50    // 步枪 / 手枪
    return 80                                // SMG / 切割
  }

  private spawnAmmoPickup(x: number, y: number, amount: number) {
    const sp = this.physics.add.image(x, y, 'pickup').setScale(1.0).setDepth(8)
    sp.setTint(0xffe060)
    ;(sp.body as Phaser.Physics.Arcade.Body).allowGravity = false
    this.floorGroup.add(sp)
    this.floorPickups.push({ sprite: sp, kind: 'ammo', data: { ammo: amount } })
  }

  private spawnMedkitPickup(x: number, y: number, heal: number) {
    const sp = this.physics.add.image(x, y, 'effect_echo_ring').setScale(0.55).setDepth(8)
    sp.setTint(0x80ff90)
    ;(sp.body as Phaser.Physics.Arcade.Body).allowGravity = false
    this.floorGroup.add(sp)
    const lbl = this.add.text(x, y - 18, '+', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#80ff90',
    }).setOrigin(0.5).setDepth(9)
    this.floorPickups.push({ sprite: sp, label: lbl, kind: 'medkit', data: { heal } })
  }

  private spawnAI(count: number) {
    const spritePool = ['enemy_basic', 'enemy_drone', 'enemy_hunter', 'enemy_wraith', 'enemy_heavy']
    const tintPool = [0xff8040, 0xff40a0, 0x40e0ff, 0xa040ff, 0xffff40, 0x40ff80]
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3
      const r = 480 + Math.random() * 480
      const x = Phaser.Math.Clamp(MAP_W / 2 + Math.cos(angle) * r, 80, MAP_W - 80)
      const y = Phaser.Math.Clamp(MAP_H / 2 + Math.sin(angle) * r, 80, MAP_H - 80)

      const sprite = this.physics.add.image(x, y, spritePool[i % spritePool.length])
      sprite.setScale(2).setDepth(16).setTint(tintPool[i % tintPool.length])
      sprite.setCollideWorldBounds(true)
      sprite.setDrag(900, 900)
      sprite.setMaxVelocity(150, 150)
      ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false
      ;(sprite.body as Phaser.Physics.Arcade.Body).setCircle(13, 3, 3)

      const barBg = this.add.rectangle(x, y - 26, 32, 5, 0x200010).setDepth(17)
      const barFill = this.add.rectangle(x - 16, y - 26, 32, 5, 0xff5050)
        .setOrigin(0, 0.5).setDepth(18)
      const wlbl = this.add.text(x, y - 36, '', {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '8px', color: '#a0b0c8',
      }).setOrigin(0.5).setDepth(18)

      // 50% 出生时持有低级武器，其余空手
      let weapon: WeaponInstance | null = null
      if (Math.random() < 0.5) {
        const wid = Math.random() < 0.7
          ? COMMON_WEAPONS[Math.floor(Math.random() * COMMON_WEAPONS.length)]
          : UNCOMMON_WEAPONS[Math.floor(Math.random() * UNCOMMON_WEAPONS.length)]
        const def = WEAPON_DEFINITIONS[wid]
        weapon = { def, ammo: this.defaultAmmoFor(def) }
      }
      const ai: AIPlayer = {
        id: i + 1,
        sprite, hpBarBg: barBg, hpBarFill: barFill, weaponLabel: wlbl,
        hp: 100, maxHp: 100,
        isAlive: true,
        speed: 80 + Math.random() * 50,
        weapon,
        mode: 'wander',
        lastDecisionAt: 0,
        lastShotAt: 0,
        targetX: x, targetY: y,
        facing: 0,
      }
      this.aiList.push(ai)
    }
  }

  // ════════════════════════════════════════════════════
  //  HUD
  // ════════════════════════════════════════════════════

  private buildHUD() {
    const { width, height } = this.scale

    // HP 条
    this.add.rectangle(width / 2, height - 18, 260, 18, 0x10000a, 0.9)
      .setScrollFactor(0).setDepth(80).setStrokeStyle(1, 0x402030)
    this.hpBarFill = this.add.rectangle(width / 2 - 128, height - 18, 256, 12, 0xff5060)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(81)
    this.hpText = this.add.text(width / 2, height - 18, '100 / 100', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82)

    // 武器名 + 弹药
    this.weaponText = this.add.text(width / 2, height - 38,
      '脉冲手枪  60', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#c8e060',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(81)
    this.weaponSlotText = this.add.text(width / 2, height - 56,
      '[ 槽 1 / 空 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#5070a0',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(81)

    // 存活人数
    this.aliveText = this.add.text(width - 14, 10, `存活 ${TOTAL_PLAYERS} / ${TOTAL_PLAYERS}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#ff9050',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(81)

    // 阶段提示
    this.phaseText = this.add.text(14, 10, '虚空风暴 · 准备阶段', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#ff7050',
    }).setScrollFactor(0).setDepth(81)
    this.timerText = this.add.text(14, 28, '0:00', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#90a0b0',
    }).setScrollFactor(0).setDepth(81)

    // 操作提示
    this.hintText = this.add.text(14, height - 28,
      'WASD 移动 · 鼠标瞄准 · 左键开火 · F 拾取 · TAB/Q 换枪 · R 丢弃 · 空格 冲击', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#28323a',
    }).setScrollFactor(0).setDepth(81)

    // 小地图（右下角）
    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(83)

    // 返回
    const backTxt = this.add.text(width - 14, height - 14, '返回 →', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#304050',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(81)
    backTxt.setInteractive({ useHandCursor: true })
    backTxt.on('pointerover', () => backTxt.setColor('#6090b0'))
    backTxt.on('pointerout',  () => backTxt.setColor('#304050'))
    backTxt.on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }

  private toast(text: string, color: string, dur = 1600) {
    const { width } = this.scale
    const t = this.add.text(width / 2, 60, text, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(90)
    this.tweens.add({
      targets: t, alpha: 0, y: 44, duration: dur, delay: 400,
      onComplete: () => t.destroy(),
    })
  }

  // ════════════════════════════════════════════════════
  //  武器 / 拾取
  // ════════════════════════════════════════════════════

  private currentWeapon(): WeaponInstance | null {
    return this.weaponSlots[this.currentSlot]
  }

  private swapWeapon() {
    if (!this.playerAlive) return
    this.currentSlot = 1 - this.currentSlot
    audioManager.playClick()
    this.refreshWeaponHud()
  }

  private dropCurrentWeapon() {
    if (!this.playerAlive) return
    const w = this.currentWeapon()
    if (!w) return
    this.weaponSlots[this.currentSlot] = null
    this.spawnWeaponPickup(this.player.x, this.player.y, w.def.id, w.ammo)
    this.toast(`丢弃 ${w.def.name}`, '#a0a0a0', 1000)
    this.refreshWeaponHud()
  }

  private tryPickup() {
    if (!this.playerAlive) return
    // 找到最近的可拾取物（武器 / 医疗包），自动拾取弹药已在 update 中处理
    let nearest: FloorPickup | null = null
    let bestD = 50
    for (const fp of this.floorPickups) {
      if (!fp.sprite.active) continue
      if (fp.kind !== 'weapon') continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, fp.sprite.x, fp.sprite.y)
      if (d < bestD) { bestD = d; nearest = fp }
    }
    if (!nearest) return
    this.pickupWeapon(nearest)
  }

  private pickupWeapon(fp: FloorPickup) {
    const inst = fp.data as WeaponInstance
    // 找空槽
    let slot = this.weaponSlots.findIndex(s => s === null)
    if (slot < 0) {
      // 全满 → 替换当前
      const old = this.weaponSlots[this.currentSlot]
      if (old) this.spawnWeaponPickup(this.player.x, this.player.y, old.def.id, old.ammo)
      slot = this.currentSlot
    }
    this.weaponSlots[slot] = inst
    this.currentSlot = slot
    this.removeFloorPickup(fp)
    audioManager.playPickup()
    this.toast(`▸ ${inst.def.name}  (${inst.ammo} 发)`, '#' + this.rarityColor(inst.def).toString(16).padStart(6, '0'), 1400)
    this.refreshWeaponHud()
  }

  private removeFloorPickup(fp: FloorPickup) {
    fp.sprite.destroy()
    fp.label?.destroy()
    const i = this.floorPickups.indexOf(fp)
    if (i >= 0) this.floorPickups.splice(i, 1)
  }

  private refreshWeaponHud() {
    const w = this.currentWeapon()
    if (w) {
      const tintHex = this.rarityColor(w.def).toString(16).padStart(6, '0')
      this.weaponText.setText(`${w.def.name}  ${w.ammo}`).setColor('#' + tintHex)
    } else {
      this.weaponText.setText('— 空手 —').setColor('#606060')
    }
    const other = this.weaponSlots[1 - this.currentSlot]
    const otherStr = other ? `${other.def.name} ${other.ammo}` : '空'
    this.weaponSlotText.setText(`[ 槽 ${this.currentSlot + 1} / 备用：${otherStr} ]`)
  }

  // ════════════════════════════════════════════════════
  //  开火
  // ════════════════════════════════════════════════════

  private tryPlayerFire(now: number) {
    if (!this.playerAlive || this.finished) return
    if (!this.mouseDown) return
    const w = this.currentWeapon()
    if (!w || w.ammo <= 0) return
    if (now - this.playerLastShotAt < w.def.fireRateMs) return
    this.playerLastShotAt = now
    w.ammo--
    const pointer = this.input.activePointer
    const tx = pointer.worldX
    const ty = pointer.worldY
    this.spawnPlayerBullet(this.player.x, this.player.y, tx, ty, w.def)
    this.refreshWeaponHud()
    audioManager.playShoot()
    if (w.ammo === 0) this.toast(`${w.def.name} 弹药耗尽`, '#ff6040', 900)
  }

  private spawnPlayerBullet(x: number, y: number, tx: number, ty: number, def: WeaponDef) {
    const baseAngle = Math.atan2(ty - y, tx - x)
    const pellets = def.pellets ?? 1
    const spread = def.spreadAngle ?? 0
    const isCrit = Math.random() < def.baseCritChance
    const damage = def.baseDamage * (isCrit ? 2 : 1)
    for (let i = 0; i < pellets; i++) {
      let ang = baseAngle
      if (pellets > 1) {
        const t = (i - (pellets - 1) / 2) / Math.max(1, pellets - 1)
        ang = baseAngle + t * spread
      }
      const b = this.physics.add.image(x, y, 'bullet').setScale(1.3).setDepth(18)
      ;(b.body as Phaser.Physics.Arcade.Body).allowGravity = false
      b.setData('damage', damage)
      b.setData('crit', isCrit)
      b.rotation = ang
      this.playerBullets.add(b)
      const speed = def.fireRateMs >= 600 ? 720 : 560
      b.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed)
      this.time.delayedCall(900, () => { if (b.active) b.destroy() })
    }
    // 枪口闪光
    const mz = this.add.graphics().setDepth(50)
    mz.fillStyle(0xfff8c0, 0.85)
    mz.fillCircle(x + Math.cos(baseAngle) * 14, y + Math.sin(baseAngle) * 14, 5)
    this.tweens.add({ targets: mz, alpha: 0, duration: 80, onComplete: () => mz.destroy() })
  }

  private spawnAIBullet(ai: AIPlayer, tx: number, ty: number) {
    const def = ai.weapon!.def
    const ang = Math.atan2(ty - ai.sprite.y, tx - ai.sprite.x)
      + (Math.random() - 0.5) * 0.18 // AI 抖动
    const pellets = def.pellets ?? 1
    const spread = def.spreadAngle ?? 0
    // AI 造成的伤害打个折，避免被狙击秒杀
    const dmgScale = 0.55
    const isCrit = Math.random() < def.baseCritChance * 0.5
    const damage = def.baseDamage * dmgScale * (isCrit ? 1.5 : 1)
    for (let i = 0; i < pellets; i++) {
      let a = ang
      if (pellets > 1) {
        const t = (i - (pellets - 1) / 2) / Math.max(1, pellets - 1)
        a = ang + t * spread
      }
      const b = this.physics.add.image(ai.sprite.x, ai.sprite.y, 'bullet').setScale(1.1).setDepth(17)
      ;(b.body as Phaser.Physics.Arcade.Body).allowGravity = false
      b.setData('damage', damage)
      b.setData('owner', ai.id)
      b.setTint(0xff7060)
      b.rotation = a
      this.aiBullets.add(b)
      b.setVelocity(Math.cos(a) * 480, Math.sin(a) * 480)
      this.time.delayedCall(900, () => { if (b.active) b.destroy() })
    }
  }

  private tryEchoBurst() {
    if (!this.playerAlive || this.finished) return
    const now = this.time.now
    if (now < this.burstReadyAt) {
      this.toast(`回响冲击冷却中 ${Math.ceil((this.burstReadyAt - now) / 1000)}s`, '#806080', 800)
      return
    }
    this.burstReadyAt = now + 12000
    const px = this.player.x, py = this.player.y
    const ring = this.add.graphics().setDepth(60)
    ring.lineStyle(3, 0xc080ff, 0.9)
    ring.strokeCircle(px, py, 8)
    this.tweens.add({
      targets: ring, scaleX: 30, scaleY: 30, alpha: 0, duration: 480,
      ease: 'Quad.Out', onComplete: () => ring.destroy(),
    })
    const RADIUS = 220
    this.aiList.forEach(ai => {
      if (!ai.isAlive) return
      const d = Phaser.Math.Distance.Between(px, py, ai.sprite.x, ai.sprite.y)
      if (d < RADIUS) {
        const ang = Math.atan2(ai.sprite.y - py, ai.sprite.x - px)
        ai.sprite.setVelocity(Math.cos(ang) * 520, Math.sin(ang) * 520)
        this.applyDamageToAi(ai, 30, false)
      }
    })
    this.cameras.main.shake(180, 0.01)
    audioManager.playSkill()
    this.toast('◈ 回响冲击', '#c080ff', 800)
  }

  // ════════════════════════════════════════════════════
  //  伤害 / 死亡
  // ════════════════════════════════════════════════════

  private applyDamageToAi(ai: AIPlayer, dmg: number, fromBullet: boolean) {
    if (!ai.isAlive) return
    ai.hp -= dmg
    if (fromBullet) {
      // 受击闪烁
      ai.sprite.setTintFill(0xffffff)
      this.time.delayedCall(60, () => {
        if (ai.isAlive) ai.sprite.setTint(this.aiBaseTint(ai))
      })
    }
    if (ai.hp <= 0) this.killAI(ai)
  }

  private aiBaseTint(ai: AIPlayer): number {
    const tintPool = [0xff8040, 0xff40a0, 0x40e0ff, 0xa040ff, 0xffff40, 0x40ff80]
    return tintPool[(ai.id - 1) % tintPool.length]
  }

  private killAI(ai: AIPlayer) {
    if (!ai.isAlive) return
    ai.isAlive = false
    this.kills++
    const x = ai.sprite.x, y = ai.sprite.y

    // 死亡特效
    const ring = this.add.image(x, y, 'effect_echo_ring').setScale(0.8).setTint(0xffa040).setDepth(25)
    this.tweens.add({ targets: ring, alpha: 0, scaleX: 3, scaleY: 3, duration: 500,
      onComplete: () => ring.destroy() })

    // 掉落武器与少量弹药
    if (ai.weapon) {
      this.spawnWeaponPickup(x, y, ai.weapon.def.id, Math.max(8, Math.floor(ai.weapon.ammo)))
    }
    if (Math.random() < 0.4) this.spawnMedkitPickup(x + 18, y, 25)
    if (Math.random() < 0.6) this.spawnAmmoPickup(x - 18, y, 25)

    // 时砂奖励
    const sand = 25
    addTimeSand(sand)

    // 排名（活着的对手数 + 1，玩家此时还活着，所以击杀者排名 = aliveCount + 1）
    const aliveCount = this.aiList.filter(a => a.isAlive).length + (this.playerAlive ? 1 : 0)
    ai.placement = aliveCount + 1

    ai.sprite.destroy()
    ai.hpBarBg.destroy()
    ai.hpBarFill.destroy()
    ai.weaponLabel.destroy()
    audioManager.playEnemyDeath()
    this.cameras.main.shake(80, 0.005)

    this.toast(`击杀 #${ai.id}  +${sand} 时砂`, '#ffd060', 900)

    // 检查胜利
    if (this.aiList.every(a => !a.isAlive) && this.playerAlive && !this.finished) {
      this.finished = true
      this.playerPlacement = 1
      this.time.delayedCall(500, () => this.showResult(true))
    }
  }

  private killPlayer() {
    if (!this.playerAlive) return
    this.playerAlive = false
    this.finished = true
    this.playerPlacement = this.aiList.filter(a => a.isAlive).length + 1
    this.player.setTint(0xff2020)
    this.cameras.main.shake(400, 0.014)
    this.time.delayedCall(700, () => this.showResult(false))
  }

  // ════════════════════════════════════════════════════
  //  风暴圈
  // ════════════════════════════════════════════════════

  private updateStorm(elapsedSec: number, dt: number) {
    // 触发下个阶段
    while (this.nextPhaseIdx < STORM_PHASES.length
        && elapsedSec >= STORM_PHASES[this.nextPhaseIdx].at) {
      const ph = STORM_PHASES[this.nextPhaseIdx]
      this.targetRadius = ph.r
      this.toast(`⚠ ${ph.label}`, '#ff5040', 2400)
      audioManager.playEnemyDeath()
      this.nextPhaseIdx++
    }
    // 平滑收缩
    if (Math.abs(this.currentRadius - this.targetRadius) > 1) {
      const speed = 30 // px/sec
      const dir = this.currentRadius > this.targetRadius ? -1 : 1
      this.currentRadius += dir * speed * dt
      if (dir < 0 && this.currentRadius < this.targetRadius) this.currentRadius = this.targetRadius
      if (dir > 0 && this.currentRadius > this.targetRadius) this.currentRadius = this.targetRadius
    }
    this.drawVoidBorder()
  }

  private drawVoidBorder() {
    this.voidGfx.clear()
    for (let i = 0; i < 5; i++) {
      const r = this.currentRadius + i * 18
      const alpha = 0.07 + i * 0.02
      this.voidGfx.lineStyle(16, 0xff2010, alpha)
      this.voidGfx.strokeCircle(this.VOID_CX, this.VOID_CY, r)
    }
    this.voidGfx.lineStyle(3, 0xff4020, 0.95)
    this.voidGfx.strokeCircle(this.VOID_CX, this.VOID_CY, this.currentRadius)
    this.voidGfx.lineStyle(1, 0x4080ff, 0.25)
    this.voidGfx.strokeCircle(this.VOID_CX, this.VOID_CY, this.currentRadius - 14)
  }

  // ════════════════════════════════════════════════════
  //  结算
  // ════════════════════════════════════════════════════

  private showResult(win: boolean) {
    const { width, height } = this.scale
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    const placement = win ? 1 : this.playerPlacement
    const borderColor = win ? 0xffd060 : 0xff5040

    const bg = this.add.rectangle(width / 2, height / 2, 480, 260, 0x040810, 0.97)
      .setScrollFactor(0).setDepth(100)
    bg.setStrokeStyle(2, borderColor)

    this.add.text(width / 2, height / 2 - 92, win ? '✦ 大逃杀冠军 ✦' : '阵亡', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '24px',
      color: win ? '#ffd060' : '#ff5030',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    this.add.text(width / 2, height / 2 - 56, `排名   #${placement} / ${TOTAL_PLAYERS}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '17px', color: '#ffe080',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    this.add.text(width / 2, height / 2 - 26, `击杀   ${this.kills}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#ff8050',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    this.add.text(width / 2, height / 2 + 0, `存活时间   ${this.fmtTime(elapsed)}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#9090b0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    const sandReward = (win ? 200 : 0) + this.kills * 25 + Math.floor(elapsed / 3)
    this.add.text(width / 2, height / 2 + 26, `时砂收益   ${sandReward}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#c8e060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    if (win) addTimeSand(200)

    const retry = this.add.text(width / 2 - 96, height / 2 + 88, '[ 再开一局 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#40ff80',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    retry.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { audioManager.playClick(); this.scene.restart() })

    const back = this.add.text(width / 2 + 96, height / 2 + 88, '[ 返回大厅 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#607080',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
    back.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })
  }

  private fmtTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ════════════════════════════════════════════════════
  //  update
  // ════════════════════════════════════════════════════

  update(time: number, delta: number) {
    if (this.finished && !this.playerAlive) return
    const dt = delta / 1000
    const now = time

    if (this.playerAlive) {
      // 移动
      const vx = this.keys.a.isDown ? -220 : this.keys.d.isDown ? 220 : 0
      const vy = this.keys.w.isDown ? -220 : this.keys.s.isDown ? 220 : 0
      this.player.setVelocity(vx, vy)

      // 朝向（鼠标）
      const ptr = this.input.activePointer
      this.player.rotation = Phaser.Math.Angle.Between(
        this.player.x, this.player.y, ptr.worldX, ptr.worldY,
      )

      // 持续开火（自动连射）
      this.tryPlayerFire(now)

      // 弹药 / 医疗包自动拾取
      this.autoPickupNearby()

      // 风暴外掉血
      const distToCenter = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.VOID_CX, this.VOID_CY,
      )
      const inVoid = distToCenter > this.currentRadius
      if (inVoid) {
        this.playerHp = Math.max(0, this.playerHp - VOID_DPS * dt)
      }
      // HP HUD
      const ratio = this.playerHp / this.playerMaxHp
      this.hpBarFill.setDisplaySize(256 * ratio, 12)
      this.hpBarFill.setFillStyle(ratio > 0.5 ? 0x60e080 : ratio > 0.25 ? 0xe0a030 : 0xff4040)
      this.hpText.setText(`${Math.ceil(this.playerHp)} / ${this.playerMaxHp}`)
      // 颜色警告
      if (inVoid) this.player.setTint(0xff7050)
      else this.player.clearTint()

      if (this.playerHp <= 0) this.killPlayer()
    } else {
      this.player.setVelocity(0, 0)
    }

    // 玩家子弹 vs AI
    this.checkPlayerBulletHits()
    // AI 子弹 vs 玩家
    this.checkAIBulletHits()

    // AI 行为
    if (!this.finished) this.updateAI(now, dt)

    // 风暴
    const elapsedSec = (Date.now() - this.startTime) / 1000
    this.updateStorm(elapsedSec, dt)

    // HUD：存活、计时、阶段
    const aliveAI = this.aiList.filter(a => a.isAlive).length
    const aliveTotal = aliveAI + (this.playerAlive ? 1 : 0)
    this.aliveText.setText(`存活 ${aliveTotal} / ${TOTAL_PLAYERS}`)
    this.timerText.setText(this.fmtTime(Math.floor(elapsedSec)))
    const nextPh = STORM_PHASES[this.nextPhaseIdx]
    if (nextPh) {
      const remain = Math.max(0, Math.ceil(nextPh.at - elapsedSec))
      this.phaseText.setText(`下次缩圈 ${this.fmtTime(remain)}  →  半径 ${nextPh.r}`)
    } else {
      this.phaseText.setText('决战之圈')
    }

    // 小地图
    this.drawMinimap()
  }

  private autoPickupNearby() {
    const PICK_RANGE = 36
    for (let i = this.floorPickups.length - 1; i >= 0; i--) {
      const fp = this.floorPickups[i]
      if (!fp.sprite.active) continue
      if (fp.kind === 'weapon') continue // 武器需手动按 F
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, fp.sprite.x, fp.sprite.y,
      )
      if (d > PICK_RANGE) continue
      if (fp.kind === 'ammo') {
        const w = this.currentWeapon()
        if (!w) continue // 没枪不拾取
        const amt = (fp.data as { ammo: number }).ammo
        w.ammo += amt
        this.toast(`+${amt} 弹药`, '#ffe060', 700)
        this.refreshWeaponHud()
      } else if (fp.kind === 'medkit') {
        if (this.playerHp >= this.playerMaxHp) continue
        const heal = (fp.data as { heal: number }).heal
        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal)
        this.toast(`+${heal} HP`, '#80ff90', 700)
      }
      this.removeFloorPickup(fp)
      audioManager.playPickup()
    }
  }

  private checkPlayerBulletHits() {
    const bullets = this.playerBullets.getChildren() as Phaser.Physics.Arcade.Image[]
    for (const b of bullets) {
      if (!b.active) continue
      // 销毁出界
      if (b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) { b.destroy(); continue }
      for (const ai of this.aiList) {
        if (!ai.isAlive) continue
        const d = Phaser.Math.Distance.Between(b.x, b.y, ai.sprite.x, ai.sprite.y)
        if (d < 22) {
          const dmg = (b.getData('damage') as number) ?? 10
          const crit = b.getData('crit') as boolean
          this.applyDamageToAi(ai, dmg, true)
          // 浮动数字
          if (crit) this.popDamageText(ai.sprite.x, ai.sprite.y - 28, `${Math.round(dmg)}!`, '#ffe040')
          else      this.popDamageText(ai.sprite.x, ai.sprite.y - 28, `${Math.round(dmg)}`, '#ffffff')
          b.destroy()
          break
        }
      }
    }
  }

  private checkAIBulletHits() {
    if (!this.playerAlive) return
    const bullets = this.aiBullets.getChildren() as Phaser.Physics.Arcade.Image[]
    for (const b of bullets) {
      if (!b.active) continue
      if (b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) { b.destroy(); continue }
      const d = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y)
      if (d < 18) {
        const dmg = (b.getData('damage') as number) ?? 6
        this.playerHp = Math.max(0, this.playerHp - dmg)
        this.cameras.main.shake(70, 0.006)
        this.player.setTintFill(0xff8080)
        this.time.delayedCall(60, () => {
          if (this.playerAlive) this.player.clearTint()
        })
        b.destroy()
        if (this.playerHp <= 0) { this.killPlayer(); return }
      }
    }
  }

  private popDamageText(x: number, y: number, txt: string, color: string) {
    const t = this.add.text(x, y, txt, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color,
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(70)
    this.tweens.add({
      targets: t, y: y - 16, alpha: 0, duration: 600,
      onComplete: () => t.destroy(),
    })
  }

  // ════════════════════════════════════════════════════
  //  AI 行为
  // ════════════════════════════════════════════════════

  private updateAI(now: number, dt: number) {
    for (const ai of this.aiList) {
      if (!ai.isAlive) continue

      // 风暴外掉血
      const distVoid = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, this.VOID_CX, this.VOID_CY)
      const aiInVoid = distVoid > this.currentRadius
      if (aiInVoid) {
        ai.hp -= VOID_DPS * 1.2 * dt
        if (ai.hp <= 0) { this.killAI(ai); continue }
      }

      // 血条与武器名跟随
      ai.hpBarBg.setPosition(ai.sprite.x, ai.sprite.y - 26)
      ai.hpBarFill.setPosition(ai.sprite.x - 16, ai.sprite.y - 26)
      ai.hpBarFill.setDisplaySize(32 * Math.max(0, ai.hp / ai.maxHp), 5)
      ai.weaponLabel.setPosition(ai.sprite.x, ai.sprite.y - 36)
      ai.weaponLabel.setText(ai.weapon ? ai.weapon.def.name : '')

      // 决策
      if (now - ai.lastDecisionAt > 900 + Math.random() * 800) {
        ai.lastDecisionAt = now

        const distPlayer = Phaser.Math.Distance.Between(
          ai.sprite.x, ai.sprite.y, this.player.x, this.player.y,
        )

        // 模式选择
        if (ai.hp < 30 && Math.random() < 0.7) {
          ai.mode = 'flee'
        } else if (aiInVoid) {
          ai.mode = 'rotate' // 进圈
        } else if (ai.weapon && distPlayer < 480 && this.playerAlive) {
          ai.mode = 'engage'
        } else {
          // 寻找最近武器/物资
          const nearestLoot = this.findNearestLootForAI(ai)
          if (nearestLoot && Phaser.Math.Distance.Between(
            ai.sprite.x, ai.sprite.y, nearestLoot.sprite.x, nearestLoot.sprite.y) < 600) {
            ai.targetX = nearestLoot.sprite.x
            ai.targetY = nearestLoot.sprite.y
            ai.mode = 'wander'
          } else {
            ai.mode = 'wander'
            ai.targetX = ai.sprite.x + (Math.random() - 0.5) * 500
            ai.targetY = ai.sprite.y + (Math.random() - 0.5) * 500
          }
        }

        // 模式后处理
        if (ai.mode === 'engage') {
          // 维持 ~250 距离
          const want = 240
          const ang = Math.atan2(this.player.y - ai.sprite.y, this.player.x - ai.sprite.x)
          ai.targetX = this.player.x - Math.cos(ang) * want
          ai.targetY = this.player.y - Math.sin(ang) * want
        } else if (ai.mode === 'flee') {
          const ang = Math.atan2(ai.sprite.y - this.player.y, ai.sprite.x - this.player.x)
          ai.targetX = ai.sprite.x + Math.cos(ang) * 300
          ai.targetY = ai.sprite.y + Math.sin(ang) * 300
        } else if (ai.mode === 'rotate') {
          const ang = Math.atan2(this.VOID_CY - ai.sprite.y, this.VOID_CX - ai.sprite.x)
          ai.targetX = ai.sprite.x + Math.cos(ang) * 360
          ai.targetY = ai.sprite.y + Math.sin(ang) * 360
        }
        ai.targetX = Phaser.Math.Clamp(ai.targetX, 60, MAP_W - 60)
        ai.targetY = Phaser.Math.Clamp(ai.targetY, 60, MAP_H - 60)
      }

      // 移动
      const tdx = ai.targetX - ai.sprite.x
      const tdy = ai.targetY - ai.sprite.y
      const td = Math.sqrt(tdx * tdx + tdy * tdy)
      if (td > 12) {
        ai.sprite.setVelocity((tdx / td) * ai.speed, (tdy / td) * ai.speed)
        ai.facing = Math.atan2(tdy, tdx)
      } else if (ai.mode !== 'engage') {
        ai.sprite.setVelocity(0, 0)
      }

      // 拾取（自动）
      this.aiAutoPickup(ai)

      // 开火
      if (ai.mode === 'engage' && ai.weapon && ai.weapon.ammo > 0 && this.playerAlive) {
        const distP = Phaser.Math.Distance.Between(
          ai.sprite.x, ai.sprite.y, this.player.x, this.player.y,
        )
        if (distP < 460 && now - ai.lastShotAt > ai.weapon.def.fireRateMs * 1.4) {
          ai.lastShotAt = now
          ai.weapon.ammo--
          this.spawnAIBullet(ai, this.player.x, this.player.y)
        }
      }
    }

    // AI 之间偶尔交火（轻量化处理：仅当两个 AI 都有枪且距离<250时，每秒概率开一枪）
    // 跳过以节省性能；BR 中通常聚焦于玩家体验
  }

  private findNearestLootForAI(ai: AIPlayer): FloorPickup | null {
    let best: FloorPickup | null = null
    let bestD = Infinity
    for (const fp of this.floorPickups) {
      if (!fp.sprite.active) continue
      if (fp.kind === 'weapon' && ai.weapon && ai.weapon.ammo > 8) continue // 已有可用武器就不去找
      if (fp.kind === 'medkit' && ai.hp >= ai.maxHp - 10) continue
      const d = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, fp.sprite.x, fp.sprite.y)
      if (d < bestD) { bestD = d; best = fp }
    }
    return best
  }

  private aiAutoPickup(ai: AIPlayer) {
    const RANGE = 30
    for (let i = this.floorPickups.length - 1; i >= 0; i--) {
      const fp = this.floorPickups[i]
      if (!fp.sprite.active) continue
      const d = Phaser.Math.Distance.Between(
        ai.sprite.x, ai.sprite.y, fp.sprite.x, fp.sprite.y,
      )
      if (d > RANGE) continue
      if (fp.kind === 'weapon') {
        if (!ai.weapon || ai.weapon.ammo < 5) {
          ai.weapon = fp.data as WeaponInstance
          this.removeFloorPickup(fp)
        }
      } else if (fp.kind === 'ammo') {
        if (ai.weapon) {
          ai.weapon.ammo += (fp.data as { ammo: number }).ammo
          this.removeFloorPickup(fp)
        }
      } else if (fp.kind === 'medkit') {
        if (ai.hp < ai.maxHp) {
          ai.hp = Math.min(ai.maxHp, ai.hp + (fp.data as { heal: number }).heal)
          this.removeFloorPickup(fp)
        }
      }
    }
  }

  // ════════════════════════════════════════════════════
  //  小地图
  // ════════════════════════════════════════════════════

  private drawMinimap() {
    const W = 130, H = 100
    const { width, height } = this.scale
    const x0 = width - W - 10
    const y0 = height - H - 70
    const sx = W / MAP_W
    const sy = H / MAP_H
    const m = this.minimap
    m.clear()
    // 背景
    m.fillStyle(0x000810, 0.7)
    m.fillRect(x0, y0, W, H)
    m.lineStyle(1, 0x304050, 0.8)
    m.strokeRect(x0, y0, W, H)
    // 风暴圈
    m.lineStyle(1, 0xff4020, 0.9)
    m.strokeCircle(x0 + this.VOID_CX * sx, y0 + this.VOID_CY * sy, this.currentRadius * sx)
    // 目标圈
    if (this.targetRadius < this.currentRadius - 1) {
      m.lineStyle(1, 0xffff80, 0.6)
      m.strokeCircle(x0 + this.VOID_CX * sx, y0 + this.VOID_CY * sy, this.targetRadius * sx)
    }
    // AI
    m.fillStyle(0xff5050, 0.95)
    for (const ai of this.aiList) {
      if (!ai.isAlive) continue
      m.fillCircle(x0 + ai.sprite.x * sx, y0 + ai.sprite.y * sy, 1.6)
    }
    // 玩家
    if (this.playerAlive) {
      m.fillStyle(0x40ffff, 1)
      m.fillCircle(x0 + this.player.x * sx, y0 + this.player.y * sy, 2.4)
    }
  }
}
