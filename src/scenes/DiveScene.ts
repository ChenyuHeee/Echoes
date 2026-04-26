import Phaser from 'phaser'
import { FRAGMENT_THEMES, type FragmentId, type FragmentTheme } from '../config/fragments'
import { EchoSystem } from '../systems/EchoSystem'
import { SKILL_DEFINITIONS } from '../config/skills'
import { ENEMY_DEFINITIONS } from '../config/enemies'
import { PROLOGUE_LINES } from '../config/lore'
import { closeRoomBeacon, getCurrentUser, saveDiveRecord } from '../lib/supabase'
import { audioManager } from '../systems/AudioManager'
import { getKeybindings, keyCodeFromStr } from '../systems/SettingsManager'
import { voiceManager, getSpeakerRole } from '../systems/VoiceManager'
import { RoomRealtime, type NetEnemyDeath, type NetDiveResult, type NetEnemyState, type NetDropSpawn, type NetPickup } from '../net/realtime'
import {
  addTimeSand,
  getRuntimeState,
  patchRuntimeState,
  resetDiveVitals,
  recordDiveComplete,
  addCrystal,
  addLoreEntry,
  getDamageMultiplier,
  getSpeedMultiplier,
  saveStash,
  mergeIntoStash,
  setRoom,
  type Stash,
} from '../state/gameState'
import { LORE_ENTRIES } from '../config/lore'
import type { SkillType } from '../types/game.types'
import { CHARACTER_DEFINITIONS, DEFAULT_CHARACTER } from '../config/characters'
import type { CharacterDef } from '../config/characters'
import {
  type ItemDef,
  type ItemId,
  type WeaponDef,
  type AttachmentDef,
  type AttachmentSlot,
  ITEM_DEFINITIONS,
  WEAPON_DEFINITIONS,
  ATTACHMENT_DEFINITIONS,
  ATTACHMENT_SLOTS,
  RARITY_COLORS,
  RARITY_NAMES,
  BAG_CAPACITY,
  rollItemDrop,
  rollWeaponDrop,
  rollAttachmentDrop,
} from '../config/items'

type DiveInit = {
  offline?: boolean
  roomCode?: string
  mapFragment?: FragmentId
  loadout?: {
    weaponId: string | null
    attachmentIds: string[]
    itemIds: string[]
  }
}

type EnemyBody = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  hp: number
  maxHp: number
}

// 波次升级殿
interface ShrineOption {
  id: string
  name: string
  desc: string
  icon: string
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  apply: () => void
}
interface ShrineBuffs {
  damageMult: number
  speedMult: number
  critBonus: number
  critDamageMult: number
  cooldownReduct: number
  echoMult: number
  magnetMult: number
  regenPerSec: number
  freeShields: number
  lifesteal: number
  berserk: boolean
}

export class DiveScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private bullets!: Phaser.Physics.Arcade.Group
  private enemies!: Phaser.Physics.Arcade.Group
  private pickups!: Phaser.Physics.Arcade.Group
  private extractionZone!: Phaser.GameObjects.Zone
  private extractionHint!: Phaser.GameObjects.Text
  private extractionBeacon!: Phaser.GameObjects.Image

  private readonly echoSystem = new EchoSystem()
  private cooldownUntil: Record<string, number> = {}
  private remotePlayers = new Map<string, Phaser.GameObjects.Image>()
  private remotePlayerLabels = new Map<string, Phaser.GameObjects.Text>()
  private roomRealtime: RoomRealtime | null = null

  // 多人同步
  private isHost = false
  private enemyIdCounter = 0
  private killedEnemyIds = new Set<number>()
  // 确定性伪随机（用 roomCode 作种子，保证所有玩家怪物 ID 一致）
  private _rngState = 0
  private seededRandom(): number {
    // mulberry32
    this._rngState = (this._rngState + 0x6D2B79F5) >>> 0
    let t = Math.imul(this._rngState ^ (this._rngState >>> 15), 1 | this._rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 0xFFFFFFFF
  }
  private onlineDiveResults: NetDiveResult[] = []
  private lastHpSyncAt = 0
  private lastEnemySyncAt = 0                         // Host 敌人广播时间戳
  private dropRegistry = new Map<string, Phaser.GameObjects.GameObject>() // dropId → sprite

  private offline = true
  private roomCode = ''
  private hp = 120
  private maxHp = 120
  private stability = 100
  private maxStability = 100
  private timeSand = 0
  private diveKills = 0
  private diveStart = 0
  private lastMoveSyncAt = 0
  private dashVisualUntil = 0
  private tutorialActive = false
  private diveFinished = false
  private currentFragmentId: FragmentId = 'steam_district'
  private currentTheme: FragmentTheme = FRAGMENT_THEMES.steam_district
  /** 关闭浏览器时自动关闭在线房间 */
  private _unloadHandler: (() => void) | null = null

  // 波次系统
  private waveNumber = 0
  private waveInProgress = false
  private bossAlive = false
  private waveText!: Phaser.GameObjects.Text

  // DOT 持续伤害状态
  private burnDots = new Map<EnemyBody, { damage: number; until: number; nextTick: number }>()
  private slowUntil = new Map<EnemyBody, number>()

  // 小地图
  private minimap!: Phaser.GameObjects.Graphics

  // 回响系统 — 追踪活跃的AOE效果区域（用于技能组合协同）
  private activeEffectZones: Array<{skill: SkillType; x: number; y: number; radius: number; expireAt: number}> = []
  // 玩家身上的「时砂印记」光环（显示当前记忆中的技能）
  private echoAuraGraphics!: Phaser.GameObjects.Graphics

  // ✦ 枪械系统 — 核心：技能以装弹方式进入枪，扣动扳机才真正释放
  private loadedSkill: SkillType | null = null  // 当前装填的模块
  private loadedSkillExpire = 0                 // 装填过期时间（6秒后自动退出）
  private muzzleGraphics!: Phaser.GameObjects.Graphics  // 枪口元素颜色指示器

  // 时序谜题状态
  private echoPuzzleSolved = false

  // ✦ 装备背包系统
  private itemDropGroup!: Phaser.Physics.Arcade.Group
  private diveInventory: ItemDef[] = []
  private bagOpen = false
  private bagObjects: Array<Phaser.GameObjects.GameObject | Phaser.Input.Keyboard.Key> = []
  private bagKey!: Phaser.Input.Keyboard.Key
  private shieldBlockedUntil = 0   // 回响盾：下次可格挡时间
  private lastRegenAt = 0           // 纳米胶布：上次回血时间
  private autoFireCooldownUntil = 0 // 持续按住左键时的射击冷却

  // ✦ 武器系统
  private equippedWeapon!: WeaponDef
  private weaponAttachments: AttachmentDef[] = []
  private weaponDropGroup!: Phaser.Physics.Arcade.Group
  private attachmentDropGroup!: Phaser.Physics.Arcade.Group

  // ✦ 角色系统
  private charDef!: CharacterDef
  private charSkillCooldownUntil = 0
  private charSkillActive = false   // 技能激活中（部分技能有持续时间）
  private charSkillExpire = 0       // 技能持续结束时间
  private charSpeedBoostUntil = 0   // 幻影步速度加成结束时间
  private charDefBoostUntil = 0     // 铁甲堡垒减伤结束时间
  private voidStacks = 0            // 虚空破碎者 — 虚空侵蚀叠层数（最多5层）
  private charSkillKey!: Phaser.Input.Keyboard.Key
  private pickupKey!: Phaser.Input.Keyboard.Key  // F键拾取武器/配件

  // 连击系统
  private comboCount = 0
  private comboResetAt = 0

  // 敌人子弹
  private enemyBullets!: Phaser.Physics.Arcade.Group

  // ✦ 新玩法系统
  private enemyHpGraphics!: Phaser.GameObjects.Graphics  // 敌人血条
  private hitVignette!: Phaser.GameObjects.Rectangle     // 受击红边
  private hitVignetteUntil = 0                            // 红边结束时间
  private shrineActive = false                            // 升级殿是否已激活
  private shrineObjects: Phaser.GameObjects.GameObject[] = [] // 升级殿 UI 对象
  private waveKillCount = 0                               // 本波击杀计数
  private bestCombo = 0                                   // 本次深潜最高连击
  private totalDamageDealt = 0                            // 本次深潜总伤害

  constructor() {
    super('DiveScene')
  }

  init(data: DiveInit) {
    this.offline = data.offline ?? true
    this.roomCode = data.roomCode || ''
    // 用 roomCode 的字符编码初始化种子，离线时用固定值
    let seed = 0x12345678
    const rc = this.roomCode || 'offline'
    for (let i = 0; i < rc.length; i++) seed = (seed * 31 + rc.charCodeAt(i)) >>> 0
    this._rngState = seed
    this.onlineDiveResults = []
    this.lastHpSyncAt = 0
    this.lastEnemySyncAt = 0
    this.dropRegistry.clear()
    this.diveFinished = false
    this.waveNumber = 0
    this.waveInProgress = false
    this.bossAlive = false
    this.enemyIdCounter = 0
    this.killedEnemyIds.clear()
    this.loadedSkill = null
    this.loadedSkillExpire = 0
    this.comboCount = 0
    this.comboResetAt = 0
    this.activeEffectZones = []
    this.burnDots.clear()
    this.slowUntil.clear()
    this.diveInventory = []
    this.bagOpen = false
    this.bagObjects = []
    this.shieldBlockedUntil = 0
    this.lastRegenAt = 0
    this.autoFireCooldownUntil = 0
    this.shrineActive = false
    this.shrineObjects = []
    this.waveKillCount = 0
    this.bestCombo = 0
    this.totalDamageDealt = 0
    this.hitVignetteUntil = 0
    this._shrineBuffs = {
      damageMult: 1, speedMult: 1, critBonus: 0, critDamageMult: 2,
      cooldownReduct: 0, echoMult: 1, magnetMult: 1, regenPerSec: 0,
      freeShields: 0, lifesteal: 0, berserk: false,
    }
    const charId = getRuntimeState().player.selectedCharacter ?? DEFAULT_CHARACTER
    this.charDef = CHARACTER_DEFINITIONS[charId] ?? CHARACTER_DEFINITIONS[DEFAULT_CHARACTER]
    this.equippedWeapon = WEAPON_DEFINITIONS[this.charDef.startWeapon] ?? WEAPON_DEFINITIONS.pulse_pistol
    this.weaponAttachments = []
    this.charSkillCooldownUntil = 0
    this.charSkillActive = false
    this.charSkillExpire = 0
    this.charSpeedBoostUntil = 0
    this.charDefBoostUntil = 0
    this.voidStacks = 0
    const runtime = getRuntimeState()
    this.currentFragmentId = data.mapFragment || runtime.room?.mapFragment || runtime.selectedFragment
    this.currentTheme = FRAGMENT_THEMES[this.currentFragmentId]
    this.isHost = !this.offline && (runtime.player.id === (runtime.room?.hostId || ''))

    // 从战前准备选择的装备（或仓库全部）加载
    const stash = runtime.player.stash ?? { weaponIds: [], attachmentIds: [], itemIds: [] }
    const loadout = data.loadout ?? { weaponId: stash.weaponIds[0] ?? null, attachmentIds: stash.attachmentIds, itemIds: stash.itemIds }
    if (loadout.weaponId) {
      const w = (WEAPON_DEFINITIONS as Record<string, WeaponDef | undefined>)[loadout.weaponId]
      if (w) this.equippedWeapon = w
    }
    this.weaponAttachments = loadout.attachmentIds
      .map(id => (ATTACHMENT_DEFINITIONS as Record<string, AttachmentDef | undefined>)[id])
      .filter((a): a is AttachmentDef => a !== undefined)
    this.diveInventory = loadout.itemIds
      .map(id => (ITEM_DEFINITIONS as Record<string, ItemDef | undefined>)[id])
      .filter((i): i is ItemDef => i !== undefined)
      .slice(0, BAG_CAPACITY)
  }

  create() {
    const rt = getRuntimeState()
    resetDiveVitals()

    // 角色基础 HP（charDef 在 init() 中已读取）
    const charHpBonus = Math.round((this.charDef.baseHp - 120) * 1)
    this.hp = rt.player.maxHp + charHpBonus
    this.maxHp = rt.player.maxHp + charHpBonus
    this.stability = rt.player.maxStability
    this.maxStability = rt.player.maxStability

    // 将持久物品中的 maxHpBonus 追加到初始 HP
    for (const item of this.diveInventory) {
      if (item.maxHpBonus) {
        this.maxHp += item.maxHpBonus
        this.hp += item.maxHpBonus
      }
    }

    this.timeSand = 0
    this.diveKills = 0
    this.diveStart = Date.now()

    this.scene.bringToTop('HUDScene')
    this.cameras.main.setBackgroundColor(this.currentTheme.biome === 'magic_forest' ? '#122116' : this.currentTheme.biome === 'cyber_wasteland' ? '#120f22' : '#0b1222')
    this.physics.world.setBounds(0, 0, 1800, 1200)

    this.add.image(480, 270, this.currentTheme.backgroundKey).setDisplaySize(960, 540).setScrollFactor(0.15)
    this.add.image(1320, 270, this.currentTheme.backgroundKey).setDisplaySize(960, 540).setScrollFactor(0.15)
    this.add.image(480, 810, this.currentTheme.backgroundKey).setDisplaySize(960, 540).setScrollFactor(0.15)
    this.add.image(1320, 810, this.currentTheme.backgroundKey).setDisplaySize(960, 540).setScrollFactor(0.15)

    this.spawnMapTiles()
    this.spawnPlayer()
    this.spawnEnemies()
    this.echoAuraGraphics = this.add.graphics().setDepth(30)
    this.muzzleGraphics = this.add.graphics().setDepth(31)
    this.enemyHpGraphics = this.add.graphics().setDepth(32)

    // 受击红边遮罩（全屏，固定在摄像机）
    const { width, height } = this.scale
    this.hitVignette = this.add.rectangle(width / 2, height / 2, width, height, 0xff0000, 0)
      .setScrollFactor(0).setDepth(200).setBlendMode('NORMAL')
    this.spawnPickupsAndExtraction()  // 必须在 setupCombat() 之前，确保 this.pickups 已初始化
    this.setupCombat()
    this.spawnEchoPuzzle()            // 必须在 setupCombat() 之后，因为依赖 this.bullets
    this.setupInput()
    this.setupMinimap()
    if (!localStorage.getItem('echoes.tutorial.v1')) {
      this.showTutorial(() => this.showPrologue())
    } else {
      this.showPrologue()
    }

    // 启动第一波
    this.time.delayedCall(3000, () => this.startNextWave())

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)

    if (!this.offline && this.roomCode) {
      void this.setupRealtime()
      // 关闭浏览器时自动关闭房间
      const rt2 = getRuntimeState()
      if (rt2.room?.id) {
        const roomId = rt2.room.id
        this._unloadHandler = () => closeRoomBeacon(roomId)
        window.addEventListener('beforeunload', this._unloadHandler)
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          if (this._unloadHandler) {
            window.removeEventListener('beforeunload', this._unloadHandler)
            this._unloadHandler = null
          }
        })
      }
    }

    patchRuntimeState({ diveStartAt: Date.now() })
    this.emitHud('潜入进行中')
    audioManager.startBattleBgm()
  }

  update(time: number) {
    if (this.diveFinished) return
    this.movePlayer()
    this.updateEnemies(time)
    this.updateDots()
    this.cleanEnemyBullets()
    this.checkNearbyPickups()
    this.updateVisuals(time)
    this.updateMinimap()
    this.updatePickupMagnet()

    if (!this.offline && this.roomRealtime && time - this.lastMoveSyncAt > 100) {
      this.lastMoveSyncAt = time
      const rt = getRuntimeState()
      this.roomRealtime.sendMove({
        id: rt.player.id,
        username: rt.player.username,
        x: this.player.x,
        y: this.player.y,
        hp: this.hp,
        t: Date.now(),
      })
    }

    // Host 每 150ms 广播所有存活敌人状态
    if (!this.offline && this.isHost && this.roomRealtime && time - this.lastEnemySyncAt > 150) {
      this.lastEnemySyncAt = time
      const states: NetEnemyState[] = []
      this.enemies.children.each(child => {
        const e = child as EnemyBody
        if (!e.active) return true
        states.push({
          id: e.getData('enemyId') as number,
          x: e.x, y: e.y,
          hp: e.hp, maxHp: e.maxHp,
        })
        return true
      })
      if (states.length > 0) this.roomRealtime.sendEnemyStates(states)
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.digit1)) {
      this.tryCast(0)
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.digit2)) {
      this.tryCast(1)
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.digit3)) {
      this.tryCast(2)
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.extract) && !this.diveFinished) {
      const inZone = Phaser.Geom.Intersects.RectangleToRectangle(
        this.player.getBounds(),
        this.extractionZone.getBounds()
      )
      if (inZone) {
        void this.finishDive('success')
      }
    }

    // B 键开/关背包
    if (Phaser.Input.Keyboard.JustDown(this.bagKey)) {
      this.toggleBag()
    }

    // Q 键 — 角色专属技能
    if (
      !this.diveFinished &&
      !this.bagOpen &&
      Phaser.Input.Keyboard.JustDown(this.charSkillKey) &&
      time >= this.charSkillCooldownUntil
    ) {
      this.activateCharSkill(time)
    }

    // ── 持续按住左键自动射击（普通弹 120ms/发；装载技能时单发触发） ──
    if (
      !this.tutorialActive &&
      !this.bagOpen &&
      !this.diveFinished &&
      this.input.activePointer.leftButtonDown() &&
      time >= this.autoFireCooldownUntil
    ) {
      const p = this.input.activePointer
      const wp = this.cameras.main.getWorldPoint(p.x, p.y)
      this.fireGun(wp.x, wp.y)
      // 装载了技能时单发即释放，普通弹保持 weapon fire rate
      this.autoFireCooldownUntil = time + (this.loadedSkill ? 400 : this.getWeaponFireRateMs())
    }

    // 被动回血（纳米胶布 + 方尖碑纳米修复核）
    const regenRate = this.diveInventory.reduce((s, i) => s + (i.regenPerSec ?? 0), 0) + this._shrineBuffs.regenPerSec
    if (regenRate > 0 && time - this.lastRegenAt >= 1000) {
      this.lastRegenAt = time
      this.hp = Math.min(this.maxHp, this.hp + regenRate)
    }

    if (this.hp <= 0 && !this.diveFinished) {
      void this.finishDive('death')
    }

    // 波次清空检测（只有 Host 或离线模式才自行调度下一波）
    if (this.waveInProgress && this.enemies.countActive() === 0 && (this.offline || this.isHost)) {
      this.waveInProgress = false
      this.bossAlive = false
      // 每完成一波，弹出升级殿（波次 >= 1 且非正在显示）
      if (this.waveNumber >= 1 && !this.shrineActive) {
        this.time.delayedCall(800, () => this.spawnUpgradeShrine())
      } else {
        this.time.delayedCall(2500, () => this.startNextWave())
      }
    }

    this.emitHud(undefined)
  }

  private spawnMapTiles() {
    const tileTextures = this.currentTheme.tileKeys

    // ✦ TileSprite 替代逐格 image — 从 2166 个对象降到 2-3 个，消除卡顿
    // 底层地砖：覆盖整个世界
    this.add.tileSprite(900, 600, 1800, 1200, tileTextures[0])
      .setAlpha(0.88).setDepth(0)
    // 第二层：叠加第二种地砖纹理增加变化感（半透明叠加）
    if (tileTextures[1]) {
      this.add.tileSprite(900, 600, 1800, 1200, tileTextures[1])
        .setAlpha(0.22).setDepth(1)
    }
    // 第三层：稀疏的亮斑（每 64px 一格，仅 28×19 = 532 个小点用 Graphics 绘制一次）
    const accentGfx = this.add.graphics().setDepth(2)
    accentGfx.fillStyle(0xffffff, 0.06)
    for (let x = 32; x < 1800; x += 64) {
      for (let y = 32; y < 1200; y += 64) {
        accentGfx.fillRect(x, y, 4, 4)
      }
    }

    this.spawnEnvironmentProps()

    this.add.text(120, 90, this.currentTheme.name, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '22px',
      color: this.currentTheme.ambientColor,
    }).setDepth(3)
  }

  private spawnPlayer() {
    this.player = this.physics.add.sprite(240, 220, 'player_idle')
    this.player.setScale(2)
    this.player.setCollideWorldBounds(true)
    this.player.setDrag(1000, 1000)
    this.player.setMaxVelocity(220, 220)
  }

  private spawnEnemies() {
    this.enemies = this.physics.add.group()
  }

  // ─────────────────── 波次系统 ───────────────────────
  private startNextWave() {
    if (this.diveFinished) return
    this.waveNumber++
    this.waveInProgress = true

    const isBossWave = this.waveNumber % 5 === 0
    // 难度曲线：波次越高敌人越多，波5+后大幅提速
    const baseCount = isBossWave ? 5 : Math.min(4 + this.waveNumber * 3, 22)
    const count = baseCount
    const eliteChance = Math.min(0.6, 0.05 + this.waveNumber * 0.08)

    // 波次提示
    const { width } = this.scale
    const label = isBossWave
      ? `⚠ 第 ${this.waveNumber} 波  —  守护者现身`
      : this.waveNumber >= 4 ? `☠ 第 ${this.waveNumber} 波  [含狙击手]`
      : this.waveNumber >= 2 ? `⚡ 第 ${this.waveNumber} 波  [远程敌人出现]`
      : `第 ${this.waveNumber} 波`
    const waveTxt = this.add.text(width / 2, 56, label, {
      fontFamily: '"Silkscreen", monospace', fontSize: '18px',
      color: isBossWave ? '#ff9050' : this.waveNumber >= 4 ? '#ff6060' : this.waveNumber >= 2 ? '#ffcc40' : '#7ce0bc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(60)
    this.tweens.add({
      targets: waveTxt, alpha: 0, y: waveTxt.y - 20,
      duration: 2200, delay: 1200,
      onComplete: () => waveTxt.destroy(),
    })

    const enemyTypes = this.currentTheme.enemyPool
    const spawnRegions = [
      { x: 100, y: 100 }, { x: 1700, y: 100 },
      { x: 100, y: 1100 }, { x: 1700, y: 1100 },
      { x: 900, y: 100 }, { x: 900, y: 1100 },
    ]

    for (let i = 0; i < count; i++) {
      const isElite = !isBossWave && this.seededRandom() < eliteChance
      const isBoss = isBossWave && i === 0

      let enemyType: string
      if (isBoss) {
        enemyType = 'ancient_guardian'
      } else if (isElite) {
        const r = this.seededRandom()
        // 第1波精英不出远程型
        enemyType = this.waveNumber <= 1
          ? (r < 0.5 ? 'time_construct_heavy' : 'echo_hunter')
          : r < 0.33 ? 'time_construct_heavy' : r < 0.66 ? 'echo_hunter' : 'void_sniper'
      } else {
        // 波次2+开始混入远程敌人；波次4+开始混入狙击者
        const pool = [...enemyTypes]
        if (this.waveNumber >= 2) pool.push('void_drone', 'void_drone')
        if (this.waveNumber >= 4) pool.push('void_sniper')
        if (this.waveNumber >= 6) pool.push('void_sniper', 'void_sniper')
        enemyType = pool[i % pool.length]
      }

      const region = spawnRegions[i % spawnRegions.length]
      const x = region.x + (this.seededRandom() - 0.5) * 160
      const y = region.y + (this.seededRandom() - 0.5) * 160

      this.spawnEnemy(enemyType, x, y, isBoss, isElite)
    }

    if (isBossWave) this.bossAlive = true

    // Host 广播波次开始，让非 Host 保持波次状态同步
    if (!this.offline && this.isHost && this.roomRealtime) {
      this.roomRealtime.sendWaveStart({ waveNumber: this.waveNumber })
    }
  }

  private spawnEnemy(enemyType: string, x: number, y: number, isBoss: boolean, isElite: boolean) {
    const typeDef = ENEMY_DEFINITIONS[enemyType as keyof typeof ENEMY_DEFINITIONS]
    if (!typeDef) return

    // HP随波次加速提升：前3波温和，之后每波+25%
    const waveMult = this.waveNumber <= 3
      ? 1 + this.waveNumber * 0.15
      : 1.45 + (this.waveNumber - 3) * 0.25
    const hpMult = isBoss ? 5 : isElite ? 2.2 : waveMult
    const e = this.physics.add.sprite(x, y, typeDef.spriteKey) as EnemyBody
    e.hp = Math.floor(typeDef.hp * hpMult)
    e.maxHp = e.hp
    e.setScale(isBoss ? 2.6 : isElite ? 2.2 : 2)
    e.setData('speed', typeDef.speed * (isElite ? 1.2 : 1))
    e.setData('enemyType', enemyType)
    e.setData('isBoss', isBoss)
    e.setData('isElite', isElite)
    e.setData('aiMode', this.pickAiMode(enemyType))
    e.setData('lastShot', 0)
    e.setData('wanderAngle', this.seededRandom() * Math.PI * 2)
    e.setData('enemyId', ++this.enemyIdCounter)

    if (isBoss) {
      e.setTint(0xff6040)
      // Boss 血条
      this.spawnBossHpBar(e)
    } else if (enemyType === 'void_sniper') {
      e.setTint(0xff2040)  // 狙击手：鲜红色，视觉警示
    } else if (isElite) {
      e.setTint(this.currentTheme.biome === 'magic_forest' ? 0xd4ff50 : 0xffa840)
    } else if (this.currentTheme.biome === 'magic_forest') {
      e.setTint(typeDef.isBoss ? 0xa6ffd8 : 0x8ed6a2)
    } else if (this.currentTheme.biome === 'cyber_wasteland') {
      e.setTint(typeDef.isBoss ? 0xff8cf1 : 0xb195ff)
    }

    this.enemies.add(e)
  }

  private pickAiMode(enemyType: string): string {
    switch (enemyType) {
      case 'void_drone':    return 'kite'     // 游击：保持距离，绕行射击
      case 'void_sniper':   return 'sniper'   // 狙击：远距离静止蓄力射击
      case 'echo_hunter':   return 'hunter'   // 猎手：预判玩家位置
      case 'time_wraith':   return 'flank'    // 侧翼包抄
      default:              return 'chase'    // 直线追逐
    }
  }

  private spawnBossHpBar(boss: EnemyBody) {
    const { width } = this.scale
    const barBg = this.add.rectangle(width / 2, 30, 400, 14, 0x200810, 1).setScrollFactor(0).setDepth(55)
    barBg.setStrokeStyle(1, 0x804040, 1)
    const barFill = this.add.rectangle(width / 2 - 200, 30, 400, 10, 0xe05030, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(56)
    this.add.text(width / 2, 14, '时砂守护者', {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#ff8060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56)

    // 每帧更新 Boss 血条
    const update = this.time.addEvent({
      delay: 50, repeat: -1,
      callback: () => {
        if (!boss.active) { barBg.destroy(); barFill.destroy(); update.remove(); return }
        const pct = Math.max(0, boss.hp / boss.maxHp)
        barFill.setDisplaySize(400 * pct, 10)
      },
    })
  }

  private spawnPickupsAndExtraction() {
    this.pickups = this.physics.add.group()
    this.itemDropGroup = this.physics.add.group()
    this.weaponDropGroup = this.physics.add.group()
    this.attachmentDropGroup = this.physics.add.group()

    this.extractionZone = this.add.zone(1650, 1040, 120, 120)
    this.physics.add.existing(this.extractionZone, true)

    this.extractionBeacon = this.add.image(1650, 1040, 'extract_beacon').setScale(2.4)
    this.tweens.add({
      targets: this.extractionBeacon,
      alpha: 0.7,
      yoyo: true,
      duration: 900,
      repeat: -1,
    })
    this.extractionHint = this.add.text(1650, 1115, this.currentTheme.extractionLabel, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '14px',
      color: this.currentTheme.ambientColor,
    }).setOrigin(0.5)

    // 叙事碎片拾取物（3-4 个）
    this.spawnLorePickups()
    // 注意：spawnEchoPuzzle() 依赖 this.bullets，必须在 setupCombat() 之后调用
  }

  private spawnLorePickups() {
    const rt = getRuntimeState()
    const collected = rt.player.loreCollected || []
    const available = LORE_ENTRIES.filter(e => !collected.includes(e.id))
    const toSpawn = available.slice(0, Math.min(3, available.length))
    const KEY_F = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F)

    const lorePosPool = [
      { x: 450, y: 600 }, { x: 900, y: 350 }, { x: 1300, y: 700 },
      { x: 600, y: 900 }, { x: 1100, y: 500 },
    ]

    toSpawn.forEach((entry, idx) => {
      const pos = lorePosPool[idx % lorePosPool.length]
      const crystal = this.add.image(pos.x, pos.y, 'prop_time_crystal').setScale(1.4).setAlpha(0.9)
      this.tweens.add({
        targets: crystal,
        y: pos.y - 8,
        alpha: 0.6,
        duration: 1100 + idx * 200,
        yoyo: true,
        repeat: -1,
      })

      // 光晕
      const glow = this.add.rectangle(pos.x, pos.y, 36, 36, 0x80d0ff, 0.12).setBlendMode('ADD')
      this.tweens.add({ targets: glow, alpha: 0.04, duration: 900, yoyo: true, repeat: -1 })

      // F 键拾取提示（靠近时显示）
      const hint = this.add.text(pos.x, pos.y - 28, `[F] ${entry.title}`, {
        fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#80c8ff',
      }).setOrigin(0.5).setAlpha(0)

      // 注册为可交互拾取物（通过定时检测距离 + F 键）
      const checkInterval = this.time.addEvent({
        delay: 100,
        repeat: -1,
        callback: () => {
          if (!crystal.active) return
          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pos.x, pos.y)
          if (dist < 90) {
            hint.setAlpha(1)
            if (Phaser.Input.Keyboard.JustDown(KEY_F)) {
              crystal.destroy()
              glow.destroy()
              hint.destroy()
              checkInterval.remove()
              addLoreEntry(entry.id)
              audioManager.playPickup()
              this.showLorePanel(entry.title, entry.source, entry.content)
            }
          } else {
            hint.setAlpha(0)
          }
        },
      })
    })
  }

  // ─────────────────── 时序共鸣之门 ────────────────────────
  // 第4.6章：此谜题要求回响系统在1.5秒内击中两个感应器
  // 回响的工作方式（A→B，B触发时A复现）天然满足条件
  private spawnEchoPuzzle() {
    if (this.echoPuzzleSolved) return

    const doorX = 780, doorY = 480

    // 门体
    const doorImg = this.add.image(doorX, doorY, 'prop_terminal_broken')
      .setScale(2.4).setAlpha(0.9).setTint(0x8040ff)
    this.tweens.add({ targets: doorImg, alpha: 0.6, duration: 1100, yoyo: true, repeat: -1 })

    // 说明文字
    const label = this.add.text(doorX, doorY - 70, '时序共鸣之门', {
      fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#a060ff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5)
    const subLabel = this.add.text(doorX, doorY - 52, '装填模块后开枪 — 回响将同时触发感应器', {
      fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#604880',
    }).setOrigin(0.5)

    // 两个感应器（左右各一）
    const s1Pos = { x: doorX - 55, y: doorY + 5 }
    const s2Pos = { x: doorX + 55, y: doorY + 5 }

    const s1 = this.add.rectangle(s1Pos.x, s1Pos.y, 22, 22, 0x6020c0, 0.75).setDepth(5)
    const s2 = this.add.rectangle(s2Pos.x, s2Pos.y, 22, 22, 0x6020c0, 0.75).setDepth(5)
    s1.setStrokeStyle(1.5, 0xb080ff, 0.9)
    s2.setStrokeStyle(1.5, 0xb080ff, 0.9)

    const s1Hint = this.add.text(s1Pos.x, s1Pos.y - 18, 'α', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#8050d0',
    }).setOrigin(0.5)
    const s2Hint = this.add.text(s2Pos.x, s2Pos.y - 18, 'β', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#8050d0',
    }).setOrigin(0.5)

    // 物理感应区
    const zone1 = this.add.zone(s1Pos.x, s1Pos.y, 30, 30)
    const zone2 = this.add.zone(s2Pos.x, s2Pos.y, 30, 30)
    this.physics.add.existing(zone1, true)
    this.physics.add.existing(zone2, true)

    let s1HitAt = 0, s2HitAt = 0
    const WINDOW = 1500 // 1.5秒时间窗口

    const checkActivate = () => {
      const now2 = Date.now()
      if (s1HitAt > 0 && s2HitAt > 0 && Math.abs(s1HitAt - s2HitAt) <= WINDOW) {
        this.openEchoDoor(doorImg, s1, s2, label, subLabel, s1Hint, s2Hint, doorX, doorY)
      }
    }

    this.physics.add.overlap(this.bullets, zone1, () => {
      s1HitAt = Date.now()
      s1.setFillStyle(0xb060ff, 0.95)
      this.tweens.add({ targets: s1, scaleX: 1.3, scaleY: 1.3, duration: 120, yoyo: true })
      checkActivate()
      this.time.delayedCall(WINDOW + 50, () => {
        if (!this.echoPuzzleSolved) {
          s1HitAt = 0
          s1.setFillStyle(0x6020c0, 0.75)
        }
      })
    })

    this.physics.add.overlap(this.bullets, zone2, () => {
      s2HitAt = Date.now()
      s2.setFillStyle(0xb060ff, 0.95)
      this.tweens.add({ targets: s2, scaleX: 1.3, scaleY: 1.3, duration: 120, yoyo: true })
      checkActivate()
      this.time.delayedCall(WINDOW + 50, () => {
        if (!this.echoPuzzleSolved) {
          s2HitAt = 0
          s2.setFillStyle(0x6020c0, 0.75)
        }
      })
    })
  }

  private openEchoDoor(
    doorImg: Phaser.GameObjects.Image,
    s1: Phaser.GameObjects.Rectangle, s2: Phaser.GameObjects.Rectangle,
    label: Phaser.GameObjects.Text, subLabel: Phaser.GameObjects.Text,
    s1Hint: Phaser.GameObjects.Text, s2Hint: Phaser.GameObjects.Text,
    doorX: number, doorY: number,
  ) {
    if (this.echoPuzzleSolved) return
    this.echoPuzzleSolved = true

    s1.setFillStyle(0x40ffb0, 1)
    s2.setFillStyle(0x40ffb0, 1)

    const { width, height } = this.scale
    const txt = this.add.text(width / 2, height / 2 - 55, '✦ 时序共鸣 ✦', {
      fontFamily: '"Silkscreen", monospace', fontSize: '28px', color: '#b080ff',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    const sub = this.add.text(width / 2, height / 2 - 20, '回响的因果在此刻交汇，门锁应声而开', {
      fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#9060cc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    this.tweens.add({
      targets: [txt, sub], y: '-=40', alpha: 0,
      duration: 2500, delay: 800,
      onComplete: () => { txt.destroy(); sub.destroy() },
    })

    // 门开动画
    this.tweens.add({
      targets: doorImg, scaleX: 0, alpha: 0, duration: 600, ease: 'Back.easeIn',
      onComplete: () => {
        doorImg.destroy()
        label.destroy(); subLabel.destroy(); s1Hint.destroy(); s2Hint.destroy()

        // 奖励：完美回响水晶
        const reward = this.add.image(doorX, doorY, 'prop_time_crystal').setScale(2).setTint(0xb080ff)
        this.tweens.add({ targets: reward, y: doorY - 12, alpha: 0.7, duration: 900, yoyo: true, repeat: -1 })
        const rewardHint = this.add.text(doorX, doorY - 48, '[F] 汲取完美回响', {
          fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#b080ff',
        }).setOrigin(0.5).setAlpha(0)

        const KEY_F2 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F)
        const checkInterval2 = this.time.addEvent({
          delay: 100, repeat: -1,
          callback: () => {
            if (!reward.active) return
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, doorX, doorY)
            if (dist < 80) {
              rewardHint.setAlpha(1)
              if (Phaser.Input.Keyboard.JustDown(KEY_F2)) {
                reward.destroy(); rewardHint.destroy(); checkInterval2.remove()
                const crystalId = `echo_puzzle_${this.currentFragmentId}`
                addCrystal(crystalId)
                const gain = 80
                addTimeSand(gain)
                this.timeSand += gain
                audioManager.playPickup()
                this.emitHud(`✦ 完美回响水晶 已汲取 +${gain} 时砂`)
              }
            } else {
              rewardHint.setAlpha(0)
            }
          },
        })
      },
    })
    this.cameras.main.shake(240, 0.01)
    audioManager.playEcho()
  }

  private setupMinimap() {
    const { width, height } = this.scale
    const mmW = 110, mmH = 74
    const mmX = width - mmW - 8
    const mmY = height - mmH - 8

    const bg = this.add.rectangle(mmX + mmW / 2, mmY + mmH / 2, mmW + 2, mmH + 2, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(60)
    bg.setStrokeStyle(1, 0x304050, 0.8)

    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(61)
    this.add.text(mmX + 2, mmY + 2, '地图', {
      fontFamily: '"Silkscreen", monospace', fontSize: '8px', color: '#304050',
    }).setScrollFactor(0).setDepth(62)
  }


  /** 检测附近武器/配件掉落物，提示 [F] 拾取，按 F 时执行拾取 */
  private checkNearbyPickups() {
    const PICKUP_RADIUS = 60
    const px = this.player.x; const py = this.player.y
    const justPressedF = Phaser.Input.Keyboard.JustDown(this.pickupKey)

    let nearestWeapon: Phaser.Physics.Arcade.Image | null = null
    let nearestWeaponDist = PICKUP_RADIUS + 1

    this.weaponDropGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const drop = child as Phaser.Physics.Arcade.Image
      if (!drop.active) return true
      const d = Phaser.Math.Distance.Between(px, py, drop.x, drop.y)
      if (d < nearestWeaponDist) { nearestWeaponDist = d; nearestWeapon = drop }
      return true
    })

    let nearestAtt: Phaser.Physics.Arcade.Image | null = null
    let nearestAttDist = PICKUP_RADIUS + 1

    this.attachmentDropGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const drop = child as Phaser.Physics.Arcade.Image
      if (!drop.active) return true
      const d = Phaser.Math.Distance.Between(px, py, drop.x, drop.y)
      if (d < nearestAttDist) { nearestAttDist = d; nearestAtt = drop }
      return true
    })

    // 优先拾取武器（距离相近时），F键触发
    const nw = nearestWeapon as Phaser.Physics.Arcade.Image | null
    if (nw && nearestWeaponDist <= PICKUP_RADIUS) {
      const w = nw.getData('weaponDef') as WeaponDef
      if (w && !this._pickupHintShown) {
        this.emitHud(`[F] 拾取武器：${w.name}  [${RARITY_NAMES[w.rarity]}]`)
        this._pickupHintShown = true
      }
      if (justPressedF) {
        this.tryEquipWeapon(w, nw.x, nw.y)
        const dropId = nw.getData('dropId') as string | undefined
        nw.destroy()
        if (dropId) {
          this.dropRegistry.delete(dropId)
          if (!this.offline) this.roomRealtime?.sendPickup({ dropId, playerId: getRuntimeState().player.id })
        }
        if (!this.offline) this.roomRealtime?.sendSound({ type: 'pickup', x: px, y: py })
        this._pickupHintShown = false
      }
    } else {
      const na = nearestAtt as Phaser.Physics.Arcade.Image | null
      if (na && nearestAttDist <= PICKUP_RADIUS) {
        const att = na.getData('attDef') as AttachmentDef
        if (att && !this._pickupHintShown) {
          this.emitHud(`[F] 拾取配件：${att.name}  [${RARITY_NAMES[att.rarity]}]`)
          this._pickupHintShown = true
        }
        if (justPressedF) {
          if (this.tryPickupAttachment(att, na.x, na.y)) {
            const dropId = na.getData('dropId') as string | undefined
            na.destroy()
            if (dropId) {
              this.dropRegistry.delete(dropId)
              if (!this.offline) this.roomRealtime?.sendPickup({ dropId, playerId: getRuntimeState().player.id })
            }
          }
          this._pickupHintShown = false
        }
      } else {
        this._pickupHintShown = false
      }
    }
  }
  private _pickupHintShown = false

  /** 磁吸拾取：120px 内时砂自动向玩家飞 */
  private updatePickupMagnet() {
    const magnetMult = this.diveInventory.reduce((s, i) => s * (i.magnetRadiusMult ?? 1), 1) * this._shrineBuffs.magnetMult
    const MAGNET_RADIUS = 120 * magnetMult
    const MAGNET_SPEED = 280
    this.pickups.children.each(child => {
      const p = child as Phaser.Physics.Arcade.Image
      if (!p.active) return true
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y)
      if (dist < MAGNET_RADIUS) {
        this.physics.moveToObject(p, this.player, MAGNET_SPEED)
      } else {
        // 超出范围：停止磁吸速度（悬浮动画仍由 tween 控制）
        const body = p.body as Phaser.Physics.Arcade.Body
        if (body) body.setVelocity(0, 0)
      }
      return true
    })
  }

  private updateMinimap() {
    if (!this.minimap) return
    const { width, height } = this.scale
    const mmW = 110, mmH = 74
    const mmX = width - mmW - 8
    const mmY = height - mmH - 8
    const scaleX = mmW / 1800
    const scaleY = mmH / 1200

    this.minimap.clear()

    // 撤离点（金色）
    this.minimap.fillStyle(0xf0c040, 0.9)
    this.minimap.fillCircle(mmX + 1650 * scaleX, mmY + 1040 * scaleY, 3)

    // 时砂拾取物（蓝色）
    this.minimap.fillStyle(0x60b0ff, 0.6)
    this.pickups.children.each(p => {
      const img = p as Phaser.Physics.Arcade.Image
      if (img.active) {
        this.minimap.fillCircle(mmX + img.x * scaleX, mmY + img.y * scaleY, 1.5)
      }
      return true
    })

    // 敌人（红色，Boss 更大）
    this.minimap.fillStyle(0xff4040, 0.8)
    this.enemies.children.each(e => {
      const enemy = e as EnemyBody
      if (enemy.active) {
        const r = enemy.getData('isBoss') ? 3.5 : enemy.getData('isElite') ? 2.5 : 1.8
        this.minimap.fillCircle(mmX + enemy.x * scaleX, mmY + enemy.y * scaleY, r)
      }
      return true
    })

    // 玩家（白色）
    this.minimap.fillStyle(0xffffff, 1)
    this.minimap.fillCircle(mmX + this.player.x * scaleX, mmY + this.player.y * scaleY, 2.5)
  }

  private showLorePanel(title: string, source: string, content: string) {
    const { width, height } = this.scale
    const bg = this.add.rectangle(width / 2, height / 2, 560, 180, 0x060810, 0.96)
      .setScrollFactor(0).setDepth(150)
    bg.setStrokeStyle(1, 0x4080c0, 0.6)

    const titleTxt = this.add.text(width / 2, height / 2 - 60, title, {
      fontFamily: '"Silkscreen", monospace', fontSize: '16px', color: '#c8a96e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    const srcTxt = this.add.text(width / 2, height / 2 - 38, `— ${source}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#405060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    const bodyTxt = this.add.text(width / 2, height / 2 - 18, content, {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#9090b0',
      wordWrap: { width: 520 }, align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(151)

    const closeTxt = this.add.text(width / 2, height / 2 + 66, '[ 任意键关闭 ]', {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#304050',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    this.input.keyboard!.once('keydown', () => {
      bg.destroy(); titleTxt.destroy(); srcTxt.destroy(); bodyTxt.destroy(); closeTxt.destroy()
    })
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = {
      w: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().moveUp)),
      a: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().moveLeft)),
      s: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().moveDown)),
      d: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().moveRight)),
      digit1: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().skill1)),
      digit2: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().skill2)),
      digit3: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().skill3)),
      extract: this.input.keyboard!.addKey(keyCodeFromStr(getKeybindings().extract)),
    }
    this.charSkillKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q)
    this.bagKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B)
    this.pickupKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F)

    // 射击统一由 update() 的 leftButtonDown 轮询处理，无需 pointerdown 事件
  }

  private spawnEnvironmentProps() {
    const propScaleMap: Record<string, number> = {
      prop_crate_steel: 1.15,
      prop_terminal_broken: 1.15,
      prop_steam_vent: 1.1,
      prop_lamp_post: 1.2,
      prop_pipe_column: 1.15,
      prop_neon_sign: 1.05,
      prop_time_crystal: 1.1,
      prop_guild_banner: 1.1,
      prop_fungal_tree: 1.2,
      prop_crystal_pool: 1.15,
      prop_hover_car: 1.0,
    }

    const propCount = this.currentTheme.biome === 'steampunk' ? 12 : 10

    for (let i = 0; i < propCount; i++) {
      const key = Phaser.Utils.Array.GetRandom(this.currentTheme.propKeys)
      const x = 200 + Math.random() * 1360
      const y = 180 + Math.random() * 760

      if (Phaser.Math.Distance.Between(x, y, 240, 220) < 220) {
        continue
      }

      if (Phaser.Math.Distance.Between(x, y, 1650, 1040) < 180) {
        continue
      }

      const prop = this.add.image(x, y, key)
      prop.setScale((propScaleMap[key] || 1.1) * (0.92 + Math.random() * 0.16))
      prop.setDepth(y - 6)
      prop.setAlpha(0.82)

      if (key === 'prop_lamp_post' || key === 'prop_pipe_column' || key === 'prop_guild_banner' || key === 'prop_fungal_tree') {
        prop.setOrigin(0.5, 1)
      }

      if (key === 'prop_time_crystal' || key === 'prop_neon_sign' || key === 'prop_crystal_pool' || key === 'prop_hover_car') {
        this.tweens.add({
          targets: prop,
          alpha: 0.55,
          duration: 1100 + i * 15,
          yoyo: true,
          repeat: -1,
        })
      }
    }
  }

  private setupCombat() {
    this.bullets = this.physics.add.group({
      allowGravity: false,
      maxSize: 80,
    })

    // 敌人子弹组
    this.enemyBullets = this.physics.add.group({ allowGravity: false, maxSize: 120 })
    this.physics.add.overlap(this.enemyBullets, this.player, (_p, b) => {
      const bullet = b as Phaser.Physics.Arcade.Image
      if (!bullet.active) return
      bullet.setActive(false).setVisible(false)
      const dmg = Number(bullet.getData('damage') || 12)
      this.hitVignetteUntil = Date.now() + 400
      this.cameras.main.shake(50, 0.005)
      this.hp -= dmg
      this.emitHud()
    })

    this.physics.add.overlap(this.bullets, this.enemies, (a, b) => {
      const bullet = a as Phaser.Physics.Arcade.Image
      const enemy = b as EnemyBody
      const damage = Number(bullet.getData('damage') || 12)
      const isChain = bullet.getData('chain') === true
      const burnOnHit = bullet.getData('burnOnHit') === true
      if (isChain) enemy.setData('chainTarget', true)
      if (burnOnHit) this.applyBurnDot(enemy, 12)

      // ── 命中爆炸特效 ─────────────────────────────
      const tint = bullet.getData('elementTint') as number | undefined
      const hitColor = tint ?? 0xfff4cc
      // 主爆炸圆
      const burst = this.add.graphics().setDepth(75)
      burst.fillStyle(hitColor, 0.65)
      burst.fillCircle(bullet.x, bullet.y, 7)
      this.tweens.add({
        targets: burst, alpha: 0, scaleX: 3, scaleY: 3, duration: 180,
        onComplete: () => burst.destroy(),
      })
      // 碎片：4 条短线向外飞散
      for (let i = 0; i < 4; i++) {
        const ang = (Math.PI / 2) * i + Math.random() * 0.4
        const shard = this.add.graphics().setDepth(75)
        shard.lineStyle(2, hitColor, 0.9)
        shard.lineBetween(0, 0, Math.cos(ang) * 9, Math.sin(ang) * 9)
        shard.x = bullet.x; shard.y = bullet.y
        this.tweens.add({
          targets: shard,
          x: bullet.x + Math.cos(ang) * 22,
          y: bullet.y + Math.sin(ang) * 22,
          alpha: 0, duration: 220,
          onComplete: () => shard.destroy(),
        })
      }

      this.damageEnemy(enemy, damage)
      bullet.destroy()
    })

    this.physics.add.overlap(this.player, this.enemies, (_, enemyObj) => {
      const enemy = enemyObj as EnemyBody
      if (this.player.getData('invincible')) return

      // 回响盾格挡（物品 + 方尖碑免疫护盾）
      const shieldCd = this.diveInventory.reduce((s, i) => s + (i.shieldCooldownMs ? 1 : 0), 0)
      const hasFreeShield = this._shrineBuffs.freeShields > 0
      if (shieldCd > 0 || hasFreeShield) {
        const shieldItem = this.diveInventory.find(i => i.shieldCooldownMs)
        const canBlockItem = shieldItem && Date.now() > this.shieldBlockedUntil
        if (canBlockItem || hasFreeShield) {
          if (hasFreeShield) {
            this._shrineBuffs.freeShields--
          } else if (canBlockItem) {
            this.shieldBlockedUntil = Date.now() + shieldItem!.shieldCooldownMs!
          }
          // 格挡特效
          const shieldFx = this.add.graphics().setDepth(80)
          shieldFx.lineStyle(3, 0x4090e0, 0.9)
          shieldFx.strokeCircle(this.player.x, this.player.y, 24)
          this.tweens.add({ targets: shieldFx, alpha: 0, scaleX: 2, scaleY: 2, duration: 350, onComplete: () => shieldFx.destroy() })
          this.emitHud('✦ 回响盾 — 格挡')
          return
        }
      }

      const rawDmg = 12
      const wardenReduct = Date.now() < this.charDefBoostUntil ? 0.4 : 1.0
      this.hp = Math.max(0, this.hp - Math.round(rawDmg * wardenReduct))
      this.stability = Math.max(0, this.stability - Math.round(8 * wardenReduct))
      // 受击红边反馈
      this.hitVignetteUntil = Date.now() + 400
      this.cameras.main.shake(60, 0.006)
      this.player.setData('invincible', true)
      this.player.setAlpha(0.5)
      this.time.delayedCall(450, () => {
        this.player.setData('invincible', false)
        this.player.setAlpha(1)
      })

      enemy.setVelocity((enemy.x - this.player.x) * 2, (enemy.y - this.player.y) * 2)
    })

    this.physics.add.overlap(this.player, this.pickups, (_, p) => {
      const pickup = p as Phaser.Physics.Arcade.Image
      const baseGain: number = pickup.getData('sandValue') ?? (18 + Math.floor(Math.random() * 12))
      const comboMult = this.comboCount >= 10 ? 2.0 : this.comboCount >= 6 ? 1.6 : this.comboCount >= 3 ? 1.25 : 1.0
      const gain = Math.floor(baseGain * comboMult)
      const dropId = pickup.getData('dropId') as string | undefined
      pickup.destroy()
      if (dropId) {
        this.dropRegistry.delete(dropId)
        if (!this.offline) this.roomRealtime?.sendPickup({ dropId, playerId: getRuntimeState().player.id })
      }
      this.timeSand += gain
      addTimeSand(gain)
      audioManager.playPickup()
      if (!this.offline) this.roomRealtime?.sendSound({ type: 'pickup', x: this.player.x, y: this.player.y })
      const label = comboMult > 1 ? `时砂 +${gain}  ×${comboMult.toFixed(2)}` : `时砂 +${gain}`
      this.emitHud(label)
    })

    // ─── 装备拾取 ───────────────────────────────────
    this.physics.add.overlap(this.player, this.itemDropGroup, (_, drop) => {
      const dropImg = drop as Phaser.Physics.Arcade.Image
      if (!dropImg.active) return
      const itemId = dropImg.getData('itemId') as ItemId
      if (!itemId) return
      if (this.tryPickupItem(ITEM_DEFINITIONS[itemId], dropImg.x, dropImg.y)) {
        const dropId = dropImg.getData('dropId') as string | undefined
        dropImg.destroy()
        if (dropId) {
          this.dropRegistry.delete(dropId)
          if (!this.offline) this.roomRealtime?.sendPickup({ dropId, playerId: getRuntimeState().player.id })
        }
      }
    })

    // ─── 武器/配件拾取：靠近时显示提示，按F拾取 ───────────────────
    // （不再自动 overlap，改为 update() 中 checkNearbyPickups 轮询处理）
  }

  private movePlayer() {
    const move = new Phaser.Math.Vector2(0, 0)

    if (this.keys.w.isDown || this.cursors.up.isDown) move.y -= 1
    if (this.keys.s.isDown || this.cursors.down.isDown) move.y += 1
    if (this.keys.a.isDown || this.cursors.left.isDown) move.x -= 1
    if (this.keys.d.isDown || this.cursors.right.isDown) move.x += 1

    move.normalize().scale(210 * getSpeedMultiplier() * this.getDiveSpeedBonus())
    this.player.setVelocity(move.x, move.y)

    this.player.setRotation(0)
    this.player.setFlipX(this.input.activePointer.worldX < this.player.x)
  }

  private updateVisuals(time: number) {
    const speed = this.player.body ? this.player.body.velocity.length() : 0
    if (Date.now() < this.dashVisualUntil) {
      this.player.setTexture('player_dash')
    } else if (speed > 10) {
      this.player.setTexture(Math.floor(time / 140) % 2 === 0 ? 'player_walk_1' : 'player_walk_2')
    } else {
      this.player.setTexture('player_idle')
    }

    this.extractionHint.setAlpha(Math.floor(time / 400) % 2 === 0 ? 1 : 0.6)

    // 时砂印记光环 — 显示当前存储在时砂中的技能
    this.echoAuraGraphics.clear()
    const storedSkill = this.echoSystem.getState().lastSkill
    if (storedSkill) {
      const def = SKILL_DEFINITIONS[storedSkill]
      const colorHex = Phaser.Display.Color.HexStringToColor(def.elementColor).color
      const pulse = 0.25 + 0.2 * Math.sin(time / 260)
      this.echoAuraGraphics.lineStyle(2.5, colorHex, 0.5 + pulse)
      this.echoAuraGraphics.strokeCircle(this.player.x, this.player.y, 26 + pulse * 10)
      this.echoAuraGraphics.lineStyle(1, colorHex, pulse * 0.5)
      this.echoAuraGraphics.strokeCircle(this.player.x, this.player.y, 36 + pulse * 14)
    }

    // 枪口颜色指示器 — 显示装填的技能模块
    this.muzzleGraphics.clear()
    const now = Date.now()
    if (this.loadedSkill && now < this.loadedSkillExpire) {
      const def2 = SKILL_DEFINITIONS[this.loadedSkill]
      const loadColor = Phaser.Display.Color.HexStringToColor(def2.elementColor).color
      const expire = this.loadedSkillExpire
      const remaining = (expire - now) / 6000
      // 拄机圆弧 — 随时间消退
      this.muzzleGraphics.lineStyle(3, loadColor, 0.85)
      this.muzzleGraphics.beginPath()
      this.muzzleGraphics.arc(this.player.x, this.player.y, 18, 0, Math.PI * 2 * remaining, false)
      this.muzzleGraphics.strokePath()
      // 中心亮点
      this.muzzleGraphics.fillStyle(loadColor, 0.7)
      this.muzzleGraphics.fillCircle(this.player.x, this.player.y, 4)
    }

    // ── 敌人头顶血条 ──────────────────────────────────────
    this.enemyHpGraphics.clear()
    this.enemies.children.each(child => {
      const e = child as EnemyBody
      if (!e.active || !e.body) return true
      const pct = Math.max(0, e.hp / e.maxHp)
      const barW = e.getData('isBoss') ? 52 : 28
      const barH = 3
      const bx = e.x - barW / 2
      const by = e.y - e.displayHeight / 2 - 6
      // 背景
      this.enemyHpGraphics.fillStyle(0x200808, 0.8)
      this.enemyHpGraphics.fillRect(bx, by, barW, barH)
      // 前景
      const col = pct > 0.6 ? 0x50cc50 : pct > 0.3 ? 0xe08020 : 0xee2020
      this.enemyHpGraphics.fillStyle(col, 0.95)
      this.enemyHpGraphics.fillRect(bx, by, barW * pct, barH)
      return true
    })

    // ── 受击红边淡出 ─────────────────────────────────────
    const vigAlpha = Math.max(0, (this.hitVignetteUntil - now) / 400) * 0.45
    this.hitVignette.setAlpha(vigAlpha)
  }

  private updateEnemies(time: number) {
    // 非 Host 客户端：不运行本地 AI，位置完全由 Host 广播驱动
    if (!this.offline && !this.isHost) {
      this.enemies.children.each((child) => {
        const enemy = child as EnemyBody
        if (enemy.active) (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0)
        return true
      })
      return
    }

    this.enemies.children.each((child) => {
      const enemy = child as EnemyBody
      if (!enemy.active) return true

      const baseSpeed = Number(enemy.getData('speed') || 70)
      const slowed = this.slowUntil.get(enemy) ? Date.now() < this.slowUntil.get(enemy)! : false
      const aiMode = String(enemy.getData('aiMode') || 'chase')
      const isBoss = enemy.getData('isBoss') === true
      const enemyType = String(enemy.getData('enemyType') || 'time_construct_basic')
      // 近战敌人狂暴：基础+10%，血量越低越快，最高180%
      const isMelee = aiMode === 'chase' || aiMode === 'flank' || aiMode === 'hunter'
      const hpPct = isMelee ? Math.max(0, enemy.hp / enemy.maxHp) : 1
      const berserkMult = isMelee ? (1.1 + (1 - hpPct) * 0.7) : 1
      const speed = slowed ? baseSpeed * berserkMult * 0.35 : baseSpeed * berserkMult

      const dx = this.player.x - enemy.x
      const dy = this.player.y - enemy.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      switch (aiMode) {
        case 'kite': {
          // 游击：距离 220+ 接近，< 120 撤退，中间绕行射击
          if (dist > 220) {
            this.physics.moveToObject(enemy, this.player, speed)
          } else if (dist < 120) {
            enemy.setVelocity(-dx / dist * speed, -dy / dist * speed)
          } else {
            // 绕行
            const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
            const strafe = angle + Math.PI / 2
            enemy.setVelocity(Math.cos(strafe) * speed * 0.8, Math.sin(strafe) * speed * 0.8)
          }
          // 在有效射程内发射子弹
          if (dist < 260) this.tryEnemyRangedAttack(enemy, 900, 10)
          break
        }
        case 'sniper': {
          // 狙击手：保持 300-500 距离，完全静止蓄力后射击重型弹
          if (dist < 280) {
            // 太近：快速后退
            enemy.setVelocity(-dx / dist * speed * 0.9, -dy / dist * speed * 0.9)
          } else if (dist > 520) {
            // 太远：靠近
            this.physics.moveToObject(enemy, this.player, speed * 0.6)
          } else {
            // 理想射程：停止移动，专心射击
            enemy.setVelocity(0, 0)
            this.tryEnemyRangedAttack(enemy, 2800, 28)
          }
          break
        }
        case 'hunter': {
          // 猎手：预判玩家运动方向，近战时偶尔射击
          const pVel = this.player.body?.velocity || { x: 0, y: 0 }
          const predictX = this.player.x + pVel.x * 0.4
          const predictY = this.player.y + pVel.y * 0.4
          this.physics.moveTo(enemy, predictX, predictY, speed)
          if (dist < 180) this.tryEnemyRangedAttack(enemy, 1600, 18)
          break
        }
        case 'flank': {
          // 侧翼：从玩家侧面靠近
          const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
          const flankAngle = angle + (enemy.x > this.player.x ? Math.PI / 3 : -Math.PI / 3)
          enemy.setVelocity(Math.cos(flankAngle) * speed, Math.sin(flankAngle) * speed)
          break
        }
        case 'chase':
        default: {
          if (isBoss && dist < 350) {
            // Boss 特殊行为：周期性冲锋
            const dashPhase = Math.floor(time / 2200) % 2
            if (dashPhase === 0) {
              this.physics.moveToObject(enemy, this.player, speed * 2.2)
            } else {
              enemy.setVelocity(0, 0)
            }
          } else {
            this.physics.moveToObject(enemy, this.player, speed)
          }
          break
        }
      }

      enemy.setTexture(this.getEnemyTexture(enemyType, this.time.now))
      enemy.setDepth(enemy.y)
      return true
    })
  }

  /** 敌人远程攻击：向玩家发射子弹，cooldownMs 控制射速 */
  private tryEnemyRangedAttack(enemy: EnemyBody, cooldownMs: number, damage: number) {
    const now = Date.now()
    const lastShot = Number(enemy.getData('lastShot') || 0)
    if (now - lastShot < cooldownMs) return
    enemy.setData('lastShot', now)

    const isSniperType = enemy.getData('aiMode') === 'sniper'

    // 蓄力/发光提示
    const chargeColor = isSniperType ? 0xff3020 : 0xe04060
    const chargeDot = this.add.graphics().setDepth(31)
    chargeDot.fillStyle(chargeColor, 0.85)
    chargeDot.fillCircle(0, 0, isSniperType ? 7 : 4)
    chargeDot.setPosition(enemy.x, enemy.y)
    const chargeDelay = isSniperType ? 600 : 150
    this.tweens.add({ targets: chargeDot, alpha: 0, duration: chargeDelay, onComplete: () => chargeDot.destroy() })

    this.time.delayedCall(chargeDelay, () => {
      if (!enemy.active || this.diveFinished) return
      // 狙击手：预判位置；其他：直线射向当前位置
      let tx = this.player.x
      let ty = this.player.y
      if (isSniperType) {
        const pv = this.player.body?.velocity || { x: 0, y: 0 }
        tx += pv.x * 0.35
        ty += pv.y * 0.35
      }
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, tx, ty)
      const bulletSpeed = isSniperType ? 420 : 280
      const b = this.physics.add.image(enemy.x, enemy.y, 'bullet')
        .setScale(isSniperType ? 1.8 : 1.1)
        .setTint(chargeColor)
        .setDepth(30)
        .setData('damage', damage)
      // 先加入组，再设置速度（加入组会重置物理体，必须之后再赋速度）
      this.enemyBullets.add(b)
      ;(b.body as Phaser.Physics.Arcade.Body).allowGravity = false
      b.setVelocity(Math.cos(angle) * bulletSpeed, Math.sin(angle) * bulletSpeed)
      b.rotation = angle

      // 超出地图边界自动销毁
      this.time.delayedCall(3000, () => { if (b.active) b.destroy() })
    })
  }

  /** 清理飞出地图边界的敌人子弹 */
  private cleanEnemyBullets() {
    const { width, height } = this.scale
    // 用相机滚动偏移获取世界边界
    const cam = this.cameras.main
    const margin = 200
    this.enemyBullets.children.each((child) => {
      const b = child as Phaser.Physics.Arcade.Image
      if (!b.active) return true
      const wx = b.x; const wy = b.y
      if (wx < -margin || wx > 1920 + margin || wy < -margin || wy > 1280 + margin) {
        b.setActive(false).setVisible(false)
      }
      return true
    })
    void cam  // suppress unused warning
  }

  // DOT 持续伤害更新
  private updateDots() {
    const now = Date.now()
    this.burnDots.forEach((dot, enemy) => {
      if (!enemy.active) { this.burnDots.delete(enemy); return }
      if (now > dot.until) { this.burnDots.delete(enemy); return }
      if (now >= dot.nextTick) {
        this.damageEnemy(enemy, dot.damage, false)
        this.spawnDamageNumber(enemy.x, enemy.y - 16, dot.damage, '#ff7730')
        dot.nextTick = now + 600
      }
    })
  }

  private getEnemyTexture(enemyType: string, time: number) {
    const frame = Math.floor(time / 180) % 2 === 0 ? 'a' : 'b'
    switch (enemyType) {
      case 'time_construct_basic':
        return frame === 'a' ? 'enemy_basic_a' : 'enemy_basic_b'
      case 'time_construct_heavy':
        return frame === 'a' ? 'enemy_heavy_a' : 'enemy_heavy_b'
      case 'void_drone':
        return frame === 'a' ? 'enemy_drone_a' : 'enemy_drone_b'
      case 'void_sniper':
        return frame === 'a' ? 'enemy_sniper_a' : 'enemy_sniper_b'
      case 'echo_hunter':
        return frame === 'a' ? 'enemy_hunter_a' : 'enemy_hunter_b'
      case 'time_wraith':
        return frame === 'a' ? 'enemy_wraith_a' : 'enemy_wraith_b'
      case 'ancient_guardian':
        return frame === 'a' ? 'enemy_boss_a' : 'enemy_boss_b'
      default:
        return 'enemy_basic_a'
    }
  }

  private tryCast(slotIndex: number) {
    const skills = getRuntimeState().player.skills
    const skill = skills[slotIndex] as SkillType | undefined
    if (!skill) return

    const now = Date.now()
    const cooldown = this.cooldownUntil[skill] || 0
    if (now < cooldown) {
      const remaining = ((cooldown - now) / 1000).toFixed(1)
      this.emitHud(`${SKILL_DEFINITIONS[skill].name} 冷却中 ${remaining}s`)
      return
    }

    const def = SKILL_DEFINITIONS[skill]

    // ── 即时技能（移动/功能型）直接施放 ──────────────────
    if (skill === 'dash' || skill === 'teleport' || skill === 'shadow_clone' || skill === 'void_pulse') {
      const result = this.echoSystem.onSkillUsed(skill)
      this.castInstantSkill(skill, false)
      if (result.echoSkill) {
        this.time.delayedCall(result.echoDelay, () => {
          if (SKILL_DEFINITIONS[result.echoSkill as SkillType]) {
            this.castInstantSkill(result.echoSkill as SkillType, true)
          }
        })
        this.emitHud(`${def.name}  ↩  回响：${SKILL_DEFINITIONS[result.echoSkill].name}`)
      } else {
        this.emitHud(`◈ ${def.name}`)
      }
      const effectiveCd1 = Math.round(def.cooldown * (1 - this._shrineBuffs.cooldownReduct))
      this.cooldownUntil[skill] = now + effectiveCd1
      audioManager.playSkill()
      return
    }

    // ── 武器模块：装填进枪，等待左键射击 ────────────────
    this.loadedSkill = skill
    this.loadedSkillExpire = now + 6000

    const colorHex = Phaser.Display.Color.HexStringToColor(def.elementColor).color
    this.player.setTint(colorHex)
    this.time.delayedCall(140, () => { if (this.player.active) this.player.clearTint() })

    // 显示时砂中存储的技能（回响预告）
    const echoState = this.echoSystem.getState()
    if (echoState.lastSkill) {
      const echoDef = SKILL_DEFINITIONS[echoState.lastSkill]
      this.emitHud(`◈ ${def.name} 已装填  ↩ 回响将复现：${echoDef.name}`)
    } else {
      this.emitHud(`◈ ${def.name} 已装填  ─  开枪触发`)
    }
    audioManager.playClick()
  }

  // ── 统一开枪入口 ─────────────────────────────────────
  private fireGun(targetX: number, targetY: number) {
    const now = Date.now()

    if (this.loadedSkill && now < this.loadedSkillExpire) {
      // ── 发射装填的技能模块 ─────────────────────────
      const skill = this.loadedSkill
      const def = SKILL_DEFINITIONS[skill]

      const result = this.echoSystem.onSkillUsed(skill)
      this.fireSkillBullet(skill, false, targetX, targetY)

      if (result.echoSkill) {
        const echoSk = result.echoSkill as SkillType
        this.time.delayedCall(result.echoDelay, () => {
          this.fireSkillBullet(echoSk, true, targetX, targetY)
        })
        // 延迟检查组合（让回响先落地）
        this.time.delayedCall(result.echoDelay + 60, () => {
          this.checkEchoCombo(echoSk)
        })
        this.emitHud(`◈ ${def.name}  ↩  回响：${SKILL_DEFINITIONS[echoSk].name}`)
        audioManager.playEcho()
      } else {
        this.emitHud(`◈ ${def.name}`)
        audioManager.playSkill()
      }

      const effectiveCd2 = Math.round(def.cooldown * (1 - this._shrineBuffs.cooldownReduct))
      this.cooldownUntil[skill] = now + effectiveCd2
      this.loadedSkill = null

    } else {
      // ── 普通弹 ─────────────────────────────────────
      this.loadedSkill = null
      const b = this.physics.add.image(this.player.x, this.player.y, 'bullet')
      b.setScale(1.4)
      b.setData('damage', this.getWeaponBaseDamage())
      b.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)

      // 枪口闪光：亮斑 + 十字光芒
      const muzzleGfx = this.add.graphics().setDepth(50)
      muzzleGfx.fillStyle(0xfff8c0, 0.9)
      muzzleGfx.fillCircle(this.player.x, this.player.y, 6)
      muzzleGfx.lineStyle(2, 0xfff8c0, 0.8)
      const cos = Math.cos(b.rotation), sin = Math.sin(b.rotation)
      muzzleGfx.lineBetween(
        this.player.x - sin * 8, this.player.y + cos * 8,
        this.player.x + sin * 8, this.player.y - cos * 8,
      )
      this.tweens.add({ targets: muzzleGfx, alpha: 0, duration: 90, onComplete: () => muzzleGfx.destroy() })

      // 子弹拖尾（每 40ms 记录一次位置，画淡出线段）
      const trail: { x: number; y: number }[] = []
      const trailEvent = this.time.addEvent({
        delay: 40, repeat: -1,
        callback: () => {
          if (!b.active) { trailEvent.remove(); return }
          trail.push({ x: b.x, y: b.y })
          if (trail.length > 4) trail.shift()
          if (trail.length >= 2) {
            const tg = this.add.graphics().setDepth(18)
            tg.lineStyle(2, 0xfff8c0, 0.45)
            tg.lineBetween(trail[0].x, trail[0].y, trail[trail.length - 1].x, trail[trail.length - 1].y)
            this.tweens.add({ targets: tg, alpha: 0, duration: 100, onComplete: () => tg.destroy() })
          }
        },
      })

      this.bullets.add(b)
      this.physics.moveTo(b, targetX, targetY, 540)
      audioManager.playShoot()
      this.time.delayedCall(1100, () => { trailEvent.remove(); b.destroy() })

      // 霸弹枪额外散射弹片
      const pellets = this.equippedWeapon?.pellets ?? 1
      if (pellets > 1) {
        const spread = this.equippedWeapon!.spreadAngle ?? 0.35
        const baseAngle = b.rotation
        for (let pi = 1; pi < pellets; pi++) {
          const side = pi % 2 === 1 ? 1 : -1
          const offset = Math.ceil(pi / 2) * (spread / Math.max(1, pellets - 1))
          const angle = baseAngle + side * offset
          const pellet = this.physics.add.image(this.player.x, this.player.y, 'bullet').setScale(1.1).setDepth(18)
          pellet.setData('damage', this.getWeaponBaseDamage())
          pellet.rotation = angle
          this.bullets.add(pellet)
          pellet.setVelocity(Math.cos(angle) * 510, Math.sin(angle) * 510)
          this.time.delayedCall(900, () => { if (pellet.active) pellet.destroy() })
        }
      }

      if (!this.offline && this.roomRealtime) {
        const rt = getRuntimeState()
        this.roomRealtime.sendSkill({
          id: rt.player.id, skillId: 'gun',
          x: this.player.x, y: this.player.y,
          tx: targetX, ty: targetY,
          isEcho: false, t: Date.now(),
        })
        this.roomRealtime.sendSound({ type: 'shot', x: this.player.x, y: this.player.y })
      }
    }
  }

  // ── 技能弹：从枪口发射带元素特性的子弹或落地AOE ──────
  private fireSkillBullet(skill: SkillType, isEcho: boolean, targetX: number, targetY: number) {
    const def = SKILL_DEFINITIONS[skill]
    const pointer = { worldX: targetX, worldY: targetY }

    // 枪口特效
    const ring = this.add.image(this.player.x, this.player.y, 'effect_echo_ring')
      .setScale(isEcho ? 0.9 : 0.7)
      .setTint(Phaser.Display.Color.HexStringToColor(def.elementColor).color)
    this.tweens.add({
      targets: ring, alpha: 0,
      scaleX: isEcho ? 1.8 : 1.4, scaleY: isEcho ? 1.8 : 1.4,
      duration: isEcho ? 480 : 320,
      onComplete: () => ring.destroy(),
    })

    switch (skill) {
      // ─ 抛射型技能：以子弹形式飞向目标 ─
      case 'burn_module':
      case 'headshot':
      case 'lightning_bolt': {
        const texture = isEcho ? 'bullet_echo' : 'bullet'
        const b = this.physics.add.image(this.player.x, this.player.y, texture)
        const elementTints: Record<string, number> = {
          burn_module: 0xff6030,
          headshot: 0xf8e860,
          lightning_bolt: 0xd0e8ff,
        }
        const elemColor = elementTints[skill] || 0xffffff
        b.setTint(elemColor)
        b.setData('elementTint', elemColor)
        b.setScale(skill === 'headshot' ? 1.8 : skill === 'lightning_bolt' ? 1.6 : 1.5)
        b.setData('damage', (def.damage || 22) * (isEcho ? 0.85 : 1) * (isEcho ? this.getDiveEchoBonus() : 1))
        if (skill === 'burn_module') b.setData('burnOnHit', true)
        if (skill === 'lightning_bolt') b.setData('chain', true)
        b.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)
        this.bullets.add(b)
        const speed = skill === 'headshot' ? 800 : 600
        this.physics.moveTo(b, targetX, targetY, speed)

        // 技能弹拖尾
        const trailColor = isEcho ? 0x7fffd1 : elemColor
        const trailEvt = this.time.addEvent({
          delay: 35, repeat: -1,
          callback: () => {
            if (!b.active) { trailEvt.remove(); return }
            const tg = this.add.graphics().setDepth(18)
            tg.fillStyle(trailColor, 0.5)
            tg.fillCircle(b.x, b.y, skill === 'headshot' ? 4 : 3)
            this.tweens.add({ targets: tg, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 140, onComplete: () => tg.destroy() })
          },
        })
        this.time.delayedCall(1400, () => { trailEvt.remove(); b.destroy() })
        break
      }

      // ─ 落地型技能：飞到目标后在落点产生效果 ─
      case 'plague_module':
      case 'magnet_module':
      case 'gravity_well':
      case 'toxic_fog':
      case 'cryo_field': {
        const projColor = Phaser.Display.Color.HexStringToColor(def.elementColor).color
        const proj = this.add.image(this.player.x, this.player.y, 'bullet')
        proj.setTint(projColor)
        proj.setScale(2.0)
        proj.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)
        proj.setDepth(20)

        // 飞行拖尾
        const aoeTrail = this.time.addEvent({
          delay: 40, repeat: -1,
          callback: () => {
            if (!proj.active) { aoeTrail.remove(); return }
            const tg = this.add.graphics().setDepth(18)
            tg.fillStyle(projColor, 0.4)
            tg.fillCircle(proj.x, proj.y, 5)
            this.tweens.add({ targets: tg, alpha: 0, scaleX: 2, scaleY: 2, duration: 200, onComplete: () => tg.destroy() })
          },
        })

        const travelTime = Phaser.Math.Distance.Between(this.player.x, this.player.y, targetX, targetY) / 0.55
        this.tweens.add({
          targets: proj,
          x: targetX, y: targetY,
          duration: Math.min(travelTime, 600),
          ease: 'Linear',
          onComplete: () => {
            aoeTrail.remove()
            proj.destroy()
            // 落地冲击波
            for (let w = 0; w < 3; w++) {
              this.time.delayedCall(w * 70, () => {
                const wave = this.add.graphics().setDepth(25)
                wave.lineStyle(2 - w * 0.5, projColor, 0.7 - w * 0.2)
                wave.strokeCircle(targetX, targetY, 8)
                this.tweens.add({
                  targets: wave, alpha: 0,
                  scaleX: 5 + w * 2, scaleY: 5 + w * 2,
                  duration: 320, ease: 'Quad.Out',
                  onComplete: () => wave.destroy(),
                })
              })
            }
            this.spawnAreaDamage(targetX, targetY, skill)
            if (skill === 'cryo_field') {
              this.enemies.children.each(child => {
                const enemy = child as EnemyBody
                if (!enemy.active) return true
                const d = Phaser.Math.Distance.Between(targetX, targetY, enemy.x, enemy.y)
                if (d < (def.range || 200) * 0.4) this.applySlow(enemy, 3000)
                return true
              })
            }
          },
        })
        break
      }

      default: {
        const texture2 = isEcho ? 'bullet_echo' : 'bullet'
        const b2 = this.physics.add.image(this.player.x, this.player.y, texture2)
        b2.setScale(1.55)
        b2.setData('damage', (def.damage || 22) * (isEcho ? 0.85 : 1))
        b2.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)
        this.bullets.add(b2)
        this.physics.moveTo(b2, targetX, targetY, 600)
        this.time.delayedCall(1300, () => b2.destroy())
      }
    }

    if (!this.offline && this.roomRealtime) {
      const rt = getRuntimeState()
      this.roomRealtime.sendSkill({
        id: rt.player.id, skillId: skill,
        x: this.player.x, y: this.player.y,
        tx: targetX, ty: targetY,
        isEcho, t: Date.now(),
      })
    }
  }

  // ── 即时技能（冲刺/瞬移/分身/虚空脉冲）─────────────────
  private castInstantSkill(skill: SkillType, isEcho: boolean) {
    const def = SKILL_DEFINITIONS[skill]
    const pointer = this.input.activePointer
    // pointer.worldX/worldY 只在指针移动时更新；摄像机滚动后需手动折算
    const cam = this.cameras.main
    const targetX = pointer.x / cam.zoom + cam.scrollX
    const targetY = pointer.y / cam.zoom + cam.scrollY

    const ring = this.add.image(this.player.x, this.player.y, 'effect_echo_ring')
      .setScale(isEcho ? 0.9 : 0.7)
      .setTint(Phaser.Display.Color.HexStringToColor(def.elementColor).color)
    this.tweens.add({
      targets: ring, alpha: 0,
      scaleX: isEcho ? 1.8 : 1.4, scaleY: isEcho ? 1.8 : 1.4,
      duration: isEcho ? 480 : 320,
      onComplete: () => ring.destroy(),
    })

    switch (skill) {
      case 'dash':
      case 'teleport': {
        const maxRange = def.range || 260
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)
        const dist = Math.min(maxRange, Phaser.Math.Distance.Between(this.player.x, this.player.y, targetX, targetY))
        const fromX = this.player.x, fromY = this.player.y

        // 出发点：残影
        const shadow = this.add.image(fromX, fromY, 'player_dash')
          .setAlpha(0.55).setScale(2).setTint(0x8060ff)
        this.tweens.add({ targets: shadow, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 380, onComplete: () => shadow.destroy() })

        // 运动轨迹虚线
        const trailGfx = this.add.graphics().setDepth(20)
        trailGfx.lineStyle(1.5, 0xa080ff, 0.5)
        trailGfx.lineBetween(fromX, fromY, fromX + Math.cos(angle) * dist, fromY + Math.sin(angle) * dist)
        this.tweens.add({ targets: trailGfx, alpha: 0, duration: 320, onComplete: () => trailGfx.destroy() })

        this.player.x += Math.cos(angle) * dist
        this.player.y += Math.sin(angle) * dist

        // 到达点：冲击环
        const arrX = this.player.x, arrY = this.player.y
        for (let r = 0; r < 2; r++) {
          this.time.delayedCall(r * 60, () => {
            const ring2 = this.add.graphics().setDepth(22)
            ring2.lineStyle(2 - r, 0xc0a0ff, 0.8 - r * 0.3)
            ring2.strokeCircle(arrX, arrY, 6)
            this.tweens.add({
              targets: ring2, alpha: 0, scaleX: 5 + r * 2, scaleY: 5 + r * 2,
              duration: 280, ease: 'Quad.Out', onComplete: () => ring2.destroy(),
            })
          })
        }

        const flash = this.add.image(fromX, fromY, 'effect_teleport_flash').setScale(1.5)
        this.tweens.add({ targets: flash, alpha: 0, duration: 220, onComplete: () => flash.destroy() })
        this.dashVisualUntil = Date.now() + 200
        break
      }
      case 'shadow_clone': {
        const clone = this.add.image(this.player.x, this.player.y, 'player_idle')
          .setTint(0x7a84ff).setAlpha(0.65).setScale(2)
        // 分身缓慢漂移吸引敌人
        const driftAngle = Math.random() * Math.PI * 2
        this.tweens.add({
          targets: clone,
          x: clone.x + Math.cos(driftAngle) * 80,
          y: clone.y + Math.sin(driftAngle) * 80,
          alpha: 0,
          duration: def.duration || 3500,
          onComplete: () => clone.destroy(),
        })
        break
      }
      case 'void_pulse': {
        // 以自身为圆心向四周推开所有敌人
        const pulseX = this.player.x, pulseY = this.player.y
        this.enemies.children.each(child => {
          const e = child as EnemyBody
          if (!e.active) return true
          const d = Phaser.Math.Distance.Between(pulseX, pulseY, e.x, e.y)
          if (d < (def.range || 300)) {
            const angle2 = Phaser.Math.Angle.Between(pulseX, pulseY, e.x, e.y)
            e.setVelocity(Math.cos(angle2) * 500, Math.sin(angle2) * 500)
            this.damageEnemy(e, def.damage || 60)
          }
          return true
        })
        this.cameras.main.shake(200, 0.014)
        // 多层扩散环
        const ringColors = isEcho ? [0x7fffd1, 0x40e8b0, 0xa0f8e0] : [0xd060ff, 0xb840ff, 0x8020c0]
        for (let r = 0; r < 3; r++) {
          this.time.delayedCall(r * 80, () => {
            const vring = this.add.graphics().setDepth(60)
            vring.lineStyle(3 - r, ringColors[r], 0.85 - r * 0.2)
            vring.strokeCircle(pulseX, pulseY, 8)
            this.tweens.add({
              targets: vring,
              scaleX: 9 + r * 3, scaleY: 9 + r * 3, alpha: 0,
              duration: 420 + r * 60, ease: 'Quad.Out',
              onComplete: () => vring.destroy(),
            })
          })
        }
        // 中心爆光
        const coreFlash = this.add.graphics().setDepth(61)
        coreFlash.fillStyle(isEcho ? 0x7fffd1 : 0xe080ff, 0.7)
        coreFlash.fillCircle(pulseX, pulseY, 18)
        this.tweens.add({ targets: coreFlash, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 200, onComplete: () => coreFlash.destroy() })
        break
      }
    }

    if (!this.offline && this.roomRealtime) {
      const rt = getRuntimeState()
      this.roomRealtime.sendSkill({
        id: rt.player.id, skillId: skill,
        x: this.player.x, y: this.player.y,
        tx: targetX, ty: targetY,
        isEcho, t: Date.now(),
      })
    }
  }

  // ── 已废弃的旧方法保留兼容 ───────────────────────────
  private fireBasicShot(targetX: number, targetY: number) {
    this.fireGun(targetX, targetY)
  }

  private castSkill(skill: SkillType, isEcho: boolean) {
    const pointer = this.input.activePointer
    if (skill === 'dash' || skill === 'teleport' || skill === 'shadow_clone' || skill === 'void_pulse') {
      this.castInstantSkill(skill, isEcho)
    } else {
      this.fireSkillBullet(skill, isEcho, pointer.worldX, pointer.worldY)
    }
  }

  private spawnAreaDamage(x: number, y: number, skill: SkillType) {
    const def = SKILL_DEFINITIONS[skill]
    const radius = (def.range || 220) * 0.4
    const duration = def.duration || 650

    // 注册活跃区域（保证它能被回响捕捉到）
    this.activeEffectZones.push({ skill, x, y, radius, expireAt: Date.now() + Math.max(duration, 2000) })

    const effectTexture = skill === 'gravity_well' ? 'effect_gravity_well' : 'effect_toxic_cloud'
    const fx = this.add.image(x, y, effectTexture).setDisplaySize(radius * 2, radius * 2)
    fx.setAlpha(skill === 'gravity_well' ? 0.85 : 0.78)

    // gravity_well：持续吸引敌人
    if (skill === 'gravity_well') {
      const pullInterval = this.time.addEvent({
        delay: 120,
        repeat: Math.floor(duration / 120),
        callback: () => {
          this.enemies.children.each(child => {
            const enemy = child as EnemyBody
            if (!enemy.active) return true
            const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y)
            if (d < radius * 2.2) {
              const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, x, y)
              enemy.setVelocity(
                (enemy.body?.velocity.x || 0) + Math.cos(angle) * 160,
                (enemy.body?.velocity.y || 0) + Math.sin(angle) * 160,
              )
              this.damageEnemy(enemy, 4, false)
            }
            return true
          })
        },
      })
      this.time.delayedCall(duration, () => pullInterval.remove())
    }

    // toxic_fog / plague_module：AOE + 燃烧DOT
    if (skill === 'toxic_fog' || skill === 'plague_module') {
      const dmgInterval = this.time.addEvent({
        delay: 600,
        repeat: Math.floor(duration / 600),
        callback: () => {
          this.enemies.children.each(child => {
            const enemy = child as EnemyBody
            if (!enemy.active) return true
            const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y)
            if (d <= radius) {
              this.applyBurnDot(enemy, def.damage || 10)
            }
            return true
          })
        },
      })
      this.time.delayedCall(duration, () => dmgInterval.remove())
    } else {
      // 即时AOE伤害
      this.enemies.children.each((child) => {
        const enemy = child as EnemyBody
        if (!enemy.active) return true
        const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y)
        if (dist <= radius) {
          this.damageEnemy(enemy, def.damage || 18)
        }
        return true
      })
    }

    this.tweens.add({
      targets: fx,
      alpha: 0.2,
      scaleX: 1.15,
      scaleY: 1.15,
      duration,
      onComplete: () => fx.destroy(),
    })
  }

  private applyBurnDot(enemy: EnemyBody, damage: number) {
    const existing = this.burnDots.get(enemy)
    const now = Date.now()
    if (existing) {
      existing.until = now + 4000
      existing.damage = Math.max(existing.damage, damage)
    } else {
      this.burnDots.set(enemy, { damage, until: now + 4000, nextTick: now + 300 })
    }
    enemy.setTint(0x50ff50)
    this.time.delayedCall(300, () => { if (enemy.active) enemy.clearTint() })
  }

  private applySlow(enemy: EnemyBody, duration: number) {
    this.slowUntil.set(enemy, Date.now() + duration)
    enemy.setTint(0x80d4ff)
    this.time.delayedCall(duration, () => {
      if (enemy.active) enemy.clearTint()
      this.slowUntil.delete(enemy)
    })
  }

  // ─────────────────── 回响协同系统 ─────────────────────────────
  private checkEchoCombo(echoSkill: SkillType) {
    const now = Date.now()
    // 清理过期区域
    this.activeEffectZones = this.activeEffectZones.filter(z => z.expireAt > now)

    // ✦ 组合1：毒爆炎浪 ── 回响灼烧 × 活跃毒云
    // "火焰弹 → 瘟疫弹 → 回响的火焰弹引爆瘟疫，造成持续高伤"
    if (echoSkill === 'burn_module') {
      const toxicZones = this.activeEffectZones.filter(
        z => z.skill === 'toxic_fog' || z.skill === 'plague_module',
      )
      if (toxicZones.length > 0) {
        toxicZones.forEach(zone => {
          this.triggerCombo('toxic_inferno', zone.x, zone.y, zone.radius * 1.5)
        })
        this.activeEffectZones = this.activeEffectZones.filter(
          z => z.skill !== 'toxic_fog' && z.skill !== 'plague_module',
        )
        return
      }
    }

    // ✦ 组合2：电磁涡流 ── 回响闪电/引力 × 另一个存在
    // "引力阱 → 闪电弹 → 回响的引力阱将敌人再次拽入雷击中心"
    if (echoSkill === 'gravity_well') {
      const gravZones = this.activeEffectZones.filter(z => z.skill === 'gravity_well')
      if (gravZones.length > 0) {
        // 双重引力共鸣 → 磁场暴走
        this.triggerCombo('electro_vortex', gravZones[0].x, gravZones[0].y, gravZones[0].radius * 2)
        return
      }
    }
    if (echoSkill === 'lightning_bolt') {
      const gravZones = this.activeEffectZones.filter(z => z.skill === 'gravity_well')
      if (gravZones.length > 0) {
        // 回响闪电打进引力阱
        this.triggerCombo('electro_vortex', gravZones[0].x, gravZones[0].y, gravZones[0].radius * 1.8)
        return
      }
    }

    // ✦ 组合3：寒冰炙化 ── 回响冰场 × 燃烧中的敌人
    if (echoSkill === 'cryo_field') {
      const burningList: EnemyBody[] = []
      this.enemies.children.each(child => {
        const e = child as EnemyBody
        if (e.active && this.burnDots.has(e)) burningList.push(e)
        return true
      })
      if (burningList.length > 0) {
        burningList.forEach(e => {
          this.triggerCombo('steam_burst', e.x, e.y, 100)
          this.burnDots.delete(e)
        })
        return
      }
    }

    // ✦ 组合4：时砂共鸣 ── 连续3次回响触发大爆发
    if (this.echoSystem.getState().echoCount >= 3) {
      this.triggerCombo('resonance', this.player.x, this.player.y, 220)
    }
  }

  private triggerCombo(
    type: 'toxic_inferno' | 'electro_vortex' | 'steam_burst' | 'resonance',
    x: number, y: number, radius: number,
  ) {
    const cfg = {
      toxic_inferno: { name: '✦ 毒爆炎浪 ✦', color: '#50ff80', tint: 0x30ff60, damage: 80 },
      electro_vortex: { name: '✦ 电磁涡流 ✦', color: '#f0f040', tint: 0xf0d820, damage: 70 },
      steam_burst:    { name: '✦ 寒冰炙化 ✦', color: '#80d4ff', tint: 0x60c8ff, damage: 65 },
      resonance:      { name: '✦ 时砂共鸣 ✦', color: '#d0a8ff', tint: 0xb870ff, damage: 55 },
    }[type]

    const { width, height } = this.scale

    // 大型组合名称文字
    const txt = this.add.text(width / 2, height / 2 - 55, cfg.name, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '28px',
      color: cfg.color,
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    this.tweens.add({
      targets: txt,
      y: height / 2 - 100,
      alpha: 0,
      duration: 1600,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })

    // 爆炸波环（3层叠加）
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 90, () => {
        const ring = this.add.image(x, y, 'effect_echo_ring')
          .setScale(0.2)
          .setTint(cfg.tint)
          .setAlpha(0.95)
          .setDepth(85)
        this.tweens.add({
          targets: ring,
          scaleX: radius / 32,
          scaleY: radius / 32,
          alpha: 0,
          duration: 700,
          ease: 'Power2',
          onComplete: () => ring.destroy(),
        })
      })
    }

    // 粒子辉光（电磁涡流：先吸后炸）
    if (type === 'electro_vortex') {
      this.enemies.children.each(child => {
        const e = child as EnemyBody
        if (!e.active) return true
        if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius) {
          // 先吸引到中心
          const angle = Phaser.Math.Angle.Between(e.x, e.y, x, y)
          e.setVelocity(Math.cos(angle) * 600, Math.sin(angle) * 600)
        }
        return true
      })
      // 延迟后在中心爆炸
      this.time.delayedCall(250, () => {
        this.enemies.children.each(child => {
          const e = child as EnemyBody
          if (!e.active) return true
          if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius * 0.7) {
            this.damageEnemy(e, cfg.damage)
          }
          return true
        })
      })
    } else {
      // 即时范围伤害
      this.enemies.children.each(child => {
        const e = child as EnemyBody
        if (!e.active) return true
        if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius) {
          this.damageEnemy(e, cfg.damage)
        }
        return true
      })
    }

    this.cameras.main.shake(180, 0.01)
    audioManager.playEcho()
  }

  private damageEnemy(enemy: EnemyBody, amount: number, showNumber = true) {
    // 暴击检测（武器暴击率 + 时相镜 + 配件加成）
    const critChance = this.getWeaponCritChance()
    const isCrit = Math.random() < critChance
    const critDmgMult = this._shrineBuffs.critDamageMult
    const critMult = isCrit ? critDmgMult : 1.0
    const finalAmount = Math.round(amount * getDamageMultiplier() * this.getDiveDamageBonus() * critMult)
    enemy.hp -= finalAmount
    this.totalDamageDealt += finalAmount
    if (showNumber) {
      const color = isCrit ? '#ffee22' : '#f0e050'
      this.spawnDamageNumber(enemy.x, enemy.y - 20, finalAmount, color)
      if (isCrit) {
        const critTxt = this.add.text(enemy.x, enemy.y - 36, 'CRIT!', {
          fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#ffee22',
          stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(91)
        this.tweens.add({ targets: critTxt, y: critTxt.y - 14, alpha: 0, duration: 600, onComplete: () => critTxt.destroy() })
      }
    }

    // 吸血（虚空碎片 + 方尖碑生命汲取）
    const lifesteal = this.diveInventory.reduce((s, i) => s + (i.lifesteal ?? 0), 0) + this._shrineBuffs.lifesteal
    if (lifesteal > 0 && finalAmount > 0) {
      this.hp = Math.min(this.maxHp, this.hp + Math.ceil(finalAmount * lifesteal))
    }

    if (enemy.hp > 0) {
      // 击退
      const dx = enemy.x - this.player.x
      const dy = enemy.y - this.player.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      enemy.setVelocity(
        (enemy.body?.velocity.x || 0) + (dx / len) * 180,
        (enemy.body?.velocity.y || 0) + (dy / len) * 180,
      )
      enemy.setTintFill(0xffffff)
      this.time.delayedCall(70, () => { if (enemy.active) enemy.clearTint() })
      enemy.setTint(0xd56d6d)
      audioManager.playHit()
      return
    }

    // 死亡
    // 链式闪电传导
    if (enemy.getData('chainTarget')) {
      const nearby = this.getNearestEnemies(enemy.x, enemy.y, 2, 200)
      nearby.forEach(next => {
        if (!next.getData('chainTarget')) {
          next.setData('chainTarget', true)
          this.time.delayedCall(80, () => {
            if (next.active) {
              this.damageEnemy(next, Math.floor(amount * 0.5))
              // 链式电弧特效
              const arc = this.add.line(0, 0, enemy.x, enemy.y, next.x, next.y, 0xf0e040, 0.8)
              arc.setDepth(80)
              this.tweens.add({ targets: arc, alpha: 0, duration: 280, onComplete: () => arc.destroy() })
            }
          })
        }
      })
    }

    // 先读取所有数据，再 destroy（destroy 后 x/y/getData 会失效）
    const isBoss = enemy.getData('isBoss') === true
    const isElite = enemy.getData('isElite') === true
    const dropX = enemy.x
    const dropY = enemy.y
    const enemyId = enemy.getData('enemyId') as number

    // 联机：广播敌人死亡 + 音效
    if (!this.offline && this.roomRealtime && enemyId) {
      if (!this.killedEnemyIds.has(enemyId)) {
        this.killedEnemyIds.add(enemyId)
        this.roomRealtime.sendEnemyDeath({ enemyId, killerId: getRuntimeState().player.id })
        this.roomRealtime.sendSound({ type: 'enemyDeath', x: dropX, y: dropY })
      }
    }

    enemy.destroy()
    audioManager.playEnemyDeath()
    this.diveKills += 1
    this.addVoidStack()  // void_breaker 被动：击杀积累虚空叠层

    // 悖论引擎：触发免费链式闪电
    const paradoxChance = this.diveInventory.reduce((s, i) => s + (i.paradoxChainChance ?? 0), 0)
    if (paradoxChance > 0 && Math.random() < paradoxChance) {
      const chains = this.getNearestEnemies(dropX, dropY, 3, 280)
      chains.forEach((target, idx) => {
        this.time.delayedCall(idx * 80, () => {
          if (target.active) {
            const arc = this.add.line(0, 0, dropX, dropY, target.x, target.y, 0xf0e040, 0.85).setDepth(80)
            this.tweens.add({ targets: arc, alpha: 0, duration: 280, onComplete: () => arc.destroy() })
            this.damageEnemy(target, 40, true)
          }
        })
      })
      if (chains.length > 0) this.emitHud('✦ 悖论引擎 — 链式闪电！')
    }

    // 连击系统：3 秒内连杀叠加倍率
    const now = Date.now()
    if (now < this.comboResetAt) {
      this.comboCount++
    } else {
      this.comboCount = 1
    }
    this.comboResetAt = now + 3000
    this.waveKillCount++
    if (this.comboCount > this.bestCombo) this.bestCombo = this.comboCount
    if (this.comboCount >= 3) {
      const bonusTxt = this.comboCount >= 6 ? `连击 ×${this.comboCount}！` : `连击 ×${this.comboCount}`
      this.emitHud(bonusTxt)
    }

    // 小屏幕震动
    this.cameras.main.shake(80, 0.004)
    // Boss / 精英 掉落
    if (isBoss) {
      const crystalId = `crystal_${this.currentFragmentId}_${Date.now()}`
      addCrystal(crystalId)
      audioManager.playPickup()
      this.emitHud('✦ 回响水晶 已获得')
      this.cameras.main.shake(200, 0.012)
      // Boss 大爆炸特效
      for (let i = 0; i < 8; i++) {
        this.time.delayedCall(i * 60, () => {
          const ex = this.add.image(
            dropX + (Math.random() - 0.5) * 80,
            dropY + (Math.random() - 0.5) * 80,
            'effect_echo_ring'
          ).setScale(0.5 + Math.random() * 0.8).setTint(0xff6030)
          this.tweens.add({ targets: ex, alpha: 0, scaleX: 2, scaleY: 2, duration: 400, onComplete: () => ex.destroy() })
        })
      }
    } else if (isElite && Math.random() < 0.3) {
      const crystalId = `crystal_elite_${Date.now()}`
      addCrystal(crystalId)
      this.emitHud('✦ 精英水晶')
    }

    // 掉落物由 Host（或离线玩家）统一生成并广播
    this.spawnEnemyDrops(dropX, dropY, isBoss, isElite)
  }

  // ─────────────────── 时间方尖碑（波次通关升级殿）───────────────────
  /**
   * 每波结束后弹出升级选择界面：3 张随机卡牌，玩家选一个获得本次深潜内的增益。
   * 选择后延迟 2.5s 开始下一波。
   */
  private spawnUpgradeShrine() {
    if (this.shrineActive || this.diveFinished) return
    this.shrineActive = true
    this.waveKillCount = 0 // 重置本波计数

    const { width, height } = this.scale

    // 暗化遮罩
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
      .setScrollFactor(0).setDepth(150)

    // 标题
    const title = this.add.text(width / 2, height / 2 - 115, '✦ 时间方尖碑 — 选择强化', {
      fontFamily: '"Silkscreen", monospace', fontSize: '18px', color: '#7ce0bc',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
    const subtitle = this.add.text(width / 2, height / 2 - 92, `第 ${this.waveNumber} 波完成  ·  本波击杀 ${this.diveKills}  ·  选择一项强化`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#406060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    this.shrineObjects.push(overlay, title, subtitle)

    // 生成 3 张随机卡牌
    const options = this.rollShrineOptions()
    const cardW = 160, cardH = 110, gap = 24
    const totalW = cardW * 3 + gap * 2
    const startX = width / 2 - totalW / 2 + cardW / 2

    options.forEach((opt, i) => {
      const cx = startX + i * (cardW + gap)
      const cy = height / 2

      const rarityColor = opt.rarity === 'legendary' ? 0xc09020
        : opt.rarity === 'rare' ? 0x8030c0
        : opt.rarity === 'uncommon' ? 0x2060c0
        : 0x405060

      const cardBg = this.add.rectangle(cx, cy, cardW, cardH, 0x08101a, 0.97)
        .setScrollFactor(0).setDepth(151)
      cardBg.setStrokeStyle(2, rarityColor, 0.85)

      // 顶部色条
      const topBar = this.add.rectangle(cx, cy - cardH / 2 + 3, cardW, 5, rarityColor, 0.9)
        .setScrollFactor(0).setDepth(152)

      // 图标
      const iconTxt = this.add.text(cx, cy - 24, opt.icon, {
        fontFamily: '"Silkscreen", monospace', fontSize: '22px', color: `#${rarityColor.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(152)

      // 名称
      const nameTxt = this.add.text(cx, cy + 8, opt.name, {
        fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#dce9ff',
        wordWrap: { width: cardW - 12 }, align: 'center',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(152)

      // 描述
      const descTxt = this.add.text(cx, cy + 30, opt.desc, {
        fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#6080a0',
        wordWrap: { width: cardW - 12 }, align: 'center',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(152)

      // 选择按钮
      const btn = this.add.rectangle(cx, cy + cardH / 2 - 14, cardW - 16, 20, rarityColor, 0.18)
        .setScrollFactor(0).setDepth(152).setInteractive({ useHandCursor: true })
      btn.setStrokeStyle(1, rarityColor, 0.6)
      const btnTxt = this.add.text(cx, cy + cardH / 2 - 14, '选择', {
        fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#c0d8f0',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(153)

      btn.on('pointerover', () => {
        cardBg.setFillStyle(0x0e1c30, 0.98)
        btn.setFillStyle(rarityColor, 0.45)
        this.tweens.add({ targets: [cardBg], scaleX: 1.03, scaleY: 1.03, duration: 100, ease: 'Sine.easeOut' })
      })
      btn.on('pointerout', () => {
        cardBg.setFillStyle(0x08101a, 0.97)
        btn.setFillStyle(rarityColor, 0.18)
        this.tweens.add({ targets: [cardBg], scaleX: 1, scaleY: 1, duration: 100 })
      })
      btn.on('pointerdown', () => {
        audioManager.playPickup()
        this.applyShrineOption(opt)
        this.closeShrineUI()
        this.emitHud(`✦ 方尖碑：${opt.name}`)
        this.time.delayedCall(2500, () => this.startNextWave())
      })

      this.shrineObjects.push(cardBg, topBar, iconTxt, nameTxt, descTxt, btn, btnTxt)
    })

    // 跳过按钮
    const skipBtn = this.add.text(width / 2, height / 2 + cardH / 2 + 22, '[ 跳过 — 直接进入下一波 ]', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#2a3a4a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151).setInteractive({ useHandCursor: true })
    skipBtn.on('pointerover', () => skipBtn.setColor('#5a7a9a'))
    skipBtn.on('pointerout', () => skipBtn.setColor('#2a3a4a'))
    skipBtn.on('pointerdown', () => {
      this.closeShrineUI()
      this.time.delayedCall(2500, () => this.startNextWave())
    })
    this.shrineObjects.push(skipBtn)
  }

  private closeShrineUI() {
    this.shrineObjects.forEach(o => {
      if (o && (o as Phaser.GameObjects.GameObject).active) {
        (o as Phaser.GameObjects.GameObject).destroy()
      }
    })
    this.shrineObjects = []
    this.shrineActive = false
  }

  // 升级殿选项定义
  private rollShrineOptions(): ShrineOption[] {
    const all: ShrineOption[] = [
      // ── 伤害类 ──────────────────────────────────────────────────
      { id: 'dmg_boost_sm', name: '战术强化', desc: '本次深潜伤害 +12%', icon: '⚔', rarity: 'common',
        apply: () => { this._shrineBuffs.damageMult *= 1.12 } },
      { id: 'dmg_boost_lg', name: '超频打击', desc: '本次深潜伤害 +25%', icon: '💥', rarity: 'uncommon',
        apply: () => { this._shrineBuffs.damageMult *= 1.25 } },
      { id: 'crit_boost', name: '精准视镜', desc: '暴击率 +15%', icon: '🎯', rarity: 'uncommon',
        apply: () => { this._shrineBuffs.critBonus += 0.15 } },
      { id: 'double_crit', name: '致命弱点', desc: '暴击伤害 ×2.5（原 ×2）', icon: '☠', rarity: 'rare',
        apply: () => { this._shrineBuffs.critDamageMult = 2.5 } },
      // ── 防御类 ──────────────────────────────────────────────────
      { id: 'hp_restore', name: '应急修复', desc: '立即恢复 40 HP', icon: '💊', rarity: 'common',
        apply: () => { this.hp = Math.min(this.maxHp, this.hp + 40) } },
      { id: 'max_hp_up', name: '强化装甲', desc: '最大 HP +30', icon: '🛡', rarity: 'uncommon',
        apply: () => { this.maxHp += 30; this.hp = Math.min(this.maxHp, this.hp + 30) } },
      { id: 'regen', name: '纳米修复核', desc: '每秒额外回血 5 HP', icon: '🧬', rarity: 'rare',
        apply: () => { this._shrineBuffs.regenPerSec += 5 } },
      { id: 'shield_recharge', name: '回响护盾', desc: '获得一次免疫伤害（可叠加）', icon: '🔵', rarity: 'uncommon',
        apply: () => { this._shrineBuffs.freeShields += 1 } },
      // ── 速度/工具类 ─────────────────────────────────────────────
      { id: 'speed_up', name: '时砂助推', desc: '移动速度 +18%', icon: '⚡', rarity: 'common',
        apply: () => { this._shrineBuffs.speedMult *= 1.18 } },
      { id: 'skill_haste', name: '量子加速', desc: '所有技能冷却缩短 25%', icon: '⏩', rarity: 'rare',
        apply: () => { this._shrineBuffs.cooldownReduct += 0.25 } },
      { id: 'sand_magnet', name: '磁吸波动', desc: '时砂吸取范围 ×3', icon: '🧲', rarity: 'common',
        apply: () => { this._shrineBuffs.magnetMult *= 3 } },
      { id: 'echo_amp', name: '回响扩幅', desc: '回响技能伤害 +40%', icon: '🔊', rarity: 'uncommon',
        apply: () => { this._shrineBuffs.echoMult *= 1.40 } },
      // ── 传奇类 ─────────────────────────────────────────────────
      { id: 'berserker', name: '虚空狂怒', desc: 'HP 越低伤害越高（最高 +60%）', icon: '🌑', rarity: 'legendary',
        apply: () => { this._shrineBuffs.berserk = true } },
      { id: 'lifedrain', name: '生命汲取', desc: '每次伤害回血 12%', icon: '🩸', rarity: 'legendary',
        apply: () => { this._shrineBuffs.lifesteal += 0.12 } },
      { id: 'sand_bonus', name: '时砂涌现', desc: '立即获得 120 时砂', icon: '⏳', rarity: 'uncommon',
        apply: () => { addTimeSand(120); this.timeSand += 120 } },
    ]

    // 按稀有度分组，weighted sample
    const buckets = { common: all.filter(o => o.rarity === 'common'), uncommon: all.filter(o => o.rarity === 'uncommon'), rare: all.filter(o => o.rarity === 'rare'), legendary: all.filter(o => o.rarity === 'legendary') }
    const roll = () => {
      const r = Math.random()
      let pool: ShrineOption[]
      if (r < 0.05) pool = buckets.legendary
      else if (r < 0.25) pool = buckets.rare
      else if (r < 0.55) pool = buckets.uncommon
      else pool = buckets.common
      if (pool.length === 0) pool = all
      return pool[Math.floor(Math.random() * pool.length)]
    }

    // 选 3 个不重复
    const chosen: ShrineOption[] = []
    const usedIds = new Set<string>()
    let tries = 0
    while (chosen.length < 3 && tries < 30) {
      const opt = roll()
      if (!usedIds.has(opt.id)) { usedIds.add(opt.id); chosen.push(opt) }
      tries++
    }
    return chosen
  }

  private applyShrineOption(opt: ShrineOption) {
    opt.apply()
  }

  /** 升级殿Buff 状态（在同一次深潜内累计） */
  private _shrineBuffs: ShrineBuffs = {
    damageMult: 1, speedMult: 1, critBonus: 0, critDamageMult: 2,
    cooldownReduct: 0, echoMult: 1, magnetMult: 1, regenPerSec: 0,
    freeShields: 0, lifesteal: 0, berserk: false,
  }

  /** 生成敌人掉落物（仅 Host 或离线执行，并广播给非 Host） */
  private spawnEnemyDrops(dropX: number, dropY: number, isBoss: boolean, isElite: boolean) {
    if (!this.offline && !this.isHost) return

    const dropChance = isBoss ? 1 : isElite ? 0.9 : 0.55
    const netDrops: NetDropSpawn[] = []

    if (Math.random() < dropChance) {
      const dropCount = isBoss ? 3 : isElite ? 2 : 1
      const baseValue = isBoss
        ? 80 + Math.floor(Math.random() * 20)
        : isElite
          ? 35 + Math.floor(Math.random() * 15)
          : 18 + Math.floor(Math.random() * 12)
      for (let i = 0; i < dropCount; i++) {
        const ox = (Math.random() - 0.5) * 60
        const oy = (Math.random() - 0.5) * 60
        const sid = crypto.randomUUID()
        const p = this.physics.add.image(dropX + ox, dropY + oy, 'pickup')
        p.setScale(isBoss ? 2.2 : isElite ? 1.8 : 1.5)
        p.setData('sandValue', baseValue)
        p.setData('dropId', sid)
        this.pickups.add(p)
        this.dropRegistry.set(sid, p)
        const shine = this.add.image(dropX + ox, dropY + oy, 'effect_pickup_shine').setScale(isBoss ? 1.8 : 1.1)
        this.tweens.add({ targets: shine, alpha: 0, duration: 550, onComplete: () => shine.destroy() })
        this.tweens.add({ targets: p, y: p.y - 6, duration: 700, yoyo: true, repeat: -1 })
        if (!this.offline) netDrops.push({ dropId: sid, type: 'sand', refId: '', sandValue: baseValue, x: dropX + ox, y: dropY + oy })
      }
    }

    // ─── 掉落：物品 / 武器 / 配件 ─────────────────────
    const itemDef = rollItemDrop(isBoss, isElite)
    if (itemDef) {
      const ix = dropX + (Math.random() - 0.5) * 40, iy = dropY + (Math.random() - 0.5) * 40
      const did = crypto.randomUUID()
      this.spawnItemDrop(itemDef, ix, iy, did)
      if (!this.offline) netDrops.push({ dropId: did, type: 'item', refId: itemDef.id, x: ix, y: iy })
    }
    const weaponDef = rollWeaponDrop(isBoss, isElite)
    if (weaponDef) {
      const wx = dropX + 30, wy = dropY + (Math.random() - 0.5) * 30
      const did = crypto.randomUUID()
      this.spawnWeaponDrop(weaponDef, wx, wy, did)
      if (!this.offline) netDrops.push({ dropId: did, type: 'weapon', refId: weaponDef.id, x: wx, y: wy })
    }
    const attDef = rollAttachmentDrop(isBoss, isElite)
    if (attDef) {
      const ax = dropX - 30, ay = dropY + (Math.random() - 0.5) * 30
      const did = crypto.randomUUID()
      this.spawnAttachmentDrop(attDef, ax, ay, did)
      if (!this.offline) netDrops.push({ dropId: did, type: 'attachment', refId: attDef.id, x: ax, y: ay })
    }

    if (!this.offline && netDrops.length > 0) {
      this.roomRealtime?.sendDropSpawn(netDrops)
    }
  }

  // 飘字伤害数字
  private spawnDamageNumber(x: number, y: number, amount: number, color: string) {
    const txt = this.add.text(x, y, `-${amount}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '13px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(90)
    this.tweens.add({
      targets: txt,
      y: y - 28,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  // 获取最近的 N 个敌人
  private getNearestEnemies(x: number, y: number, count: number, maxDist: number): EnemyBody[] {
    const result: { enemy: EnemyBody; dist: number }[] = []
    this.enemies.children.each(child => {
      const e = child as EnemyBody
      if (!e.active) return true
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y)
      if (d <= maxDist) result.push({ enemy: e, dist: d })
      return true
    })
    return result.sort((a, b) => a.dist - b.dist).slice(0, count).map(r => r.enemy)
  }

  private async setupRealtime() {
    this.roomRealtime = new RoomRealtime()

    const registerHandlers = () => {
      this.roomRealtime!.onRemoteMove((p) => {
        const rt = getRuntimeState()
        if (p.id === rt.player.id) return

        let sprite = this.remotePlayers.get(p.id)
        if (!sprite) {
          sprite = this.add.image(p.x, p.y, 'teammate').setScale(2).setDepth(25)
          this.remotePlayers.set(p.id, sprite)
          // 创建名字+血量标签
          const label = this.add.text(p.x, p.y - 28, '', {
            fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#7ce0bc',
            stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5).setDepth(26)
          this.remotePlayerLabels.set(p.id, label)
        }

        sprite.x = Phaser.Math.Linear(sprite.x, p.x, 0.8)
        sprite.y = Phaser.Math.Linear(sprite.y, p.y, 0.8)

        const label = this.remotePlayerLabels.get(p.id)
        if (label) {
          label.setText(`${p.username}  HP:${p.hp}`)
          label.x = sprite.x
          label.y = sprite.y - 28
        }
      })

      this.roomRealtime!.onRemoteSkill((evt) => {
        const rt = getRuntimeState()
        if (evt.id === rt.player.id) return

        const sx = evt.x, sy = evt.y
        const tx2 = evt.tx ?? sx, ty2 = evt.ty ?? sy
        const isInstant = evt.skillId === 'dash' || evt.skillId === 'teleport'
          || evt.skillId === 'shadow_clone' || evt.skillId === 'void_pulse'

        // ── 枪口闪光（所有技能都有）
        const mfGfx = this.add.graphics().setDepth(50)
        mfGfx.fillStyle(evt.isEcho ? 0x7fffd1 : 0xfff8c0, 0.8)
        mfGfx.fillCircle(sx, sy, 5)
        this.tweens.add({ targets: mfGfx, alpha: 0, duration: 100, onComplete: () => mfGfx.destroy() })

        if (isInstant) {
          // 即时技能：保留原来的脉冲圆
          const pulse = this.add.circle(sx, sy, evt.isEcho ? 24 : 16, evt.isEcho ? 0x7fffd1 : 0xffcd8a, 0.35)
          this.tweens.add({ targets: pulse, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 500, onComplete: () => pulse.destroy() })
          return
        }

        // ── 投射物：从 (sx,sy) 飞向 (tx2,ty2)
        const skillDefs: Record<string, { color: number; size: number; speed: number }> = {
          gun:           { color: 0xfff8c0, size: 5,  speed: 540 },
          burn_module:   { color: 0xff6030, size: 6,  speed: 600 },
          headshot:      { color: 0xf8e860, size: 7,  speed: 800 },
          lightning_bolt:{ color: 0xd0e8ff, size: 6,  speed: 600 },
        }
        const sd = skillDefs[evt.skillId] ?? { color: evt.isEcho ? 0x7fffd1 : 0xffcd8a, size: 7, speed: 500 }
        const bulletColor = sd.color

        // 用 graphics 模拟一颗移动子弹
        const bGfx = this.add.graphics().setDepth(22)
        bGfx.fillStyle(bulletColor, 0.9)
        bGfx.fillCircle(0, 0, sd.size / 2 + 1)
        bGfx.x = sx; bGfx.y = sy

        const dist = Phaser.Math.Distance.Between(sx, sy, tx2, ty2)
        const duration = Math.max(80, Math.min(dist / sd.speed * 1000, 1200))

        // 飞行拖尾
        const trailEvt = this.time.addEvent({
          delay: 38, repeat: -1,
          callback: () => {
            if (!bGfx.active) { trailEvt.remove(); return }
            const tg = this.add.graphics().setDepth(19)
            tg.fillStyle(bulletColor, 0.4)
            tg.fillCircle(bGfx.x, bGfx.y, sd.size / 2)
            this.tweens.add({ targets: tg, alpha: 0, duration: 120, onComplete: () => tg.destroy() })
          },
        })

        this.tweens.add({
          targets: bGfx, x: tx2, y: ty2,
          duration, ease: 'Linear',
          onComplete: () => {
            trailEvt.remove()
            bGfx.destroy()
            // 命中特效
            const hitGfx = this.add.graphics().setDepth(75)
            hitGfx.fillStyle(bulletColor, 0.6)
            hitGfx.fillCircle(tx2, ty2, 7)
            this.tweens.add({ targets: hitGfx, alpha: 0, scaleX: 3, scaleY: 3, duration: 180, onComplete: () => hitGfx.destroy() })
          },
        })
      })

      this.roomRealtime!.onEnemyDeath(({ enemyId, killerId }) => {
        const rt = getRuntimeState()
        if (killerId === rt.player.id) return
        if (this.killedEnemyIds.has(enemyId)) return
        this.killedEnemyIds.add(enemyId)
        this.enemies.children.each(child => {
          const e = child as EnemyBody
          if (e.active && (e.getData('enemyId') as number) === enemyId) {
            // Host: 为远程击杀生成掉落物（非 Host 击杀 → Host 负责掉落）
            this.spawnEnemyDrops(e.x, e.y, e.getData('isBoss') === true, e.getData('isElite') === true)
            const fx = this.add.circle(e.x, e.y, 18, 0xff6040, 0.5)
            this.tweens.add({ targets: fx, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 300, onComplete: () => fx.destroy() })
            e.destroy()
            audioManager.playEnemyDeath()
          }
          return true
        })
      })

      this.roomRealtime!.onDiveResult((res) => {
        const rt = getRuntimeState()
        if (res.id === rt.player.id) return
        if (!this.onlineDiveResults.find(r => r.id === res.id)) {
          this.onlineDiveResults.push(res)
        }
      })

      // ── 敌人状态（非 Host 接收，直接更新敌人位置/HP）─────
      if (!this.isHost) {
        this.roomRealtime!.onEnemyStates((states) => {
          states.forEach(state => {
            this.enemies.children.each(child => {
              const e = child as EnemyBody
              if (!e.active) return true
              if ((e.getData('enemyId') as number) === state.id) {
                // 必须通过 body.reset() 更新 ArcadePhysics body 位置，
                // 直接设置 e.x/e.y 会在下一帧被 physics preUpdate 覆写。
                const body = e.body as Phaser.Physics.Arcade.Body
                body.reset(state.x, state.y)
                e.hp = state.hp
                e.maxHp = state.maxHp
              }
              return true
            })
          })
        })

        // ── 波次开始（非 Host 同步波次状态）─────────────
        this.roomRealtime!.onWaveStart(({ waveNumber }) => {
          // 只有当波次序号超前时才触发（避免重复）
          if (waveNumber > this.waveNumber) {
            this.waveNumber = waveNumber - 1  // startNextWave 会 ++ 一次
            this.startNextWave()
          }
          // 同步 waveInProgress 状态
          this.waveInProgress = true
        })
      }

      // ── 掉落物生成（非 Host 接收 Host 广播的掉落）────
      if (!this.isHost) {
        this.roomRealtime!.onDropSpawn((drops) => {
          drops.forEach(d => {
            if (this.dropRegistry.has(d.dropId)) return // 已存在
            if (d.type === 'sand') {
              const p = this.physics.add.image(d.x, d.y, 'pickup')
              p.setScale(1.5)
              p.setData('sandValue', d.sandValue ?? 20)
              p.setData('dropId', d.dropId)
              this.pickups.add(p)
              this.dropRegistry.set(d.dropId, p)
              this.tweens.add({ targets: p, y: p.y - 6, duration: 700, yoyo: true, repeat: -1 })
            } else if (d.type === 'item') {
              const item = (ITEM_DEFINITIONS as Record<string, ItemDef | undefined>)[d.refId]
              if (item) this.spawnItemDrop(item, d.x, d.y, d.dropId)
            } else if (d.type === 'weapon') {
              const weapon = (WEAPON_DEFINITIONS as Record<string, WeaponDef | undefined>)[d.refId]
              if (weapon) this.spawnWeaponDrop(weapon, d.x, d.y, d.dropId)
            } else if (d.type === 'attachment') {
              const att = (ATTACHMENT_DEFINITIONS as Record<string, AttachmentDef | undefined>)[d.refId]
              if (att) this.spawnAttachmentDrop(att, d.x, d.y, d.dropId)
            }
          })
        })
      }

      // ── 拾取同步（任意玩家拾取 → 所有客户端删除）───
      this.roomRealtime!.onPickup(({ dropId, playerId }) => {
        const rt = getRuntimeState()
        if (playerId === rt.player.id) return // 自己的拾取已在本地处理
        const obj = this.dropRegistry.get(dropId)
        if (obj && (obj as Phaser.GameObjects.Image).active) {
          (obj as Phaser.GameObjects.Image).destroy()
        }
        this.dropRegistry.delete(dropId)
      })

      // ── 远程音效 ──────────────────────────────────────
      this.roomRealtime!.onSound((evt) => {
        // 根据距离决定音量（可选：距离越远越小，目前直接播放）
        if (evt.type === 'shot') audioManager.playShoot()
        else if (evt.type === 'pickup') audioManager.playPickup()
        else if (evt.type === 'enemyDeath') audioManager.playEnemyDeath()
      })
    }

    // 尝试连接，失败时等 1.5 秒重试一次
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.roomRealtime.prepare(this.roomCode)
        registerHandlers()
        await this.roomRealtime.subscribe()
        this.emitHud(`在线同步已连接：${this.roomCode}`)
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[Realtime] 第${attempt}次连接失败:`, msg)
        if (attempt < 2) {
          this.emitHud(`同步连接中 (${attempt}/2)…`)
          await new Promise(r => setTimeout(r, 1500))
        } else {
          this.emitHud(`Realtime 失败 [${msg}]，离线模式`)
          this.offline = true
        }
      }
    }
  }

  private showPrologue() {
    const { width } = this.scale
    const lines = PROLOGUE_LINES.slice(0, 3).map((l) => `${l.speaker}: ${l.text}`).join('\n')
    const box = this.add.rectangle(width / 2, 76, width - 80, 92, 0x000000, 0.52)
      .setScrollFactor(0).setDepth(50)
    const text = this.add.text(40, 32, lines, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '13px',
      color: '#dce9ff',
      wordWrap: { width: width - 120 },
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(51)

    // TTS 配音 — 朗读第一条旁白（需玩家手动开启配音后生效）
    const firstLine = PROLOGUE_LINES[0]
    if (firstLine.textEn) {
      voiceManager.speak(firstLine.textEn, getSpeakerRole(firstLine.speaker))
    }

    this.time.delayedCall(6500, () => {
      box.destroy()
      text.destroy()
      voiceManager.cancel()
    })
  }

  private emitHud(hint?: string) {
    const enemiesLeft = this.waveInProgress ? this.enemies.countActive(true) : 0
    const waveInfo = this.waveInProgress
      ? `第 ${this.waveNumber} 波  ·  剩余 ${enemiesLeft} 敌`
      : (this.waveNumber > 0 ? `第 ${this.waveNumber} 波 — 清场！` : '')
    this.game.events.emit('hud:update', {
      hp: this.hp,
      maxHp: this.maxHp,
      stability: this.stability,
      maxStability: this.maxStability,
      timeSand: getRuntimeState().player.timeSand,
      roomCode: this.offline ? undefined : this.roomCode,
      echoSkill: this.echoSystem.getState().lastSkill || undefined,
      hint,
      skillCooldowns: { ...this.cooldownUntil },
      waveInfo,
    })
  }

  private async finishDive(result: 'success' | 'death') {
    if (this.diveFinished) return
    this.diveFinished = true

    // 关闭背包 UI（如果打开）
    if (this.bagOpen) {
      this.destroyBagUI()
      this.bagOpen = false
    }

    // 立即冻结玩家和敌人
    this.player.setVelocity(0, 0)
    this.player.setActive(false)
    this.physics.world.pause()
    if (result === 'death') {
      this.player.setAlpha(0.3)
    }

    const duration = Math.floor((Date.now() - this.diveStart) / 1000)
    const rt = getRuntimeState()

    patchRuntimeState({
      player: {
        ...rt.player,
        hp: this.hp,
        stability: this.stability,
      },
      diveStartAt: null,
    })
    recordDiveComplete(this.diveKills, result === 'success')

    // 成功撤离时持久化背包物品到仓库；死亡时枪械和配件全部丢失
    if (result === 'success') {
      mergeIntoStash({
        weaponId: this.equippedWeapon.id,
        attachmentIds: this.weaponAttachments.map(a => a.id),
        itemIds: this.diveInventory.map(i => i.id),
      })
    } else {
      // 死亡：只保留背包物资，枪械/配件全部丢失
      mergeIntoStash({
        weaponId: null,
        attachmentIds: [],
        itemIds: this.diveInventory.map(i => i.id),
      })
    }

    // 保存引用以供后续广播结算使用
    const liveRealtime = this.roomRealtime
    this.roomRealtime?.disconnect()
    this.roomRealtime = null

    // 正常结束深潜时关闭在线房间，并反注册 beforeunload
    if (!this.offline) {
      const rt2 = getRuntimeState()
      if (rt2.room?.id) {
        void import('../lib/supabase').then(m => m.closeRoom(rt2.room!.id))
      }
      if (this._unloadHandler) {
        window.removeEventListener('beforeunload', this._unloadHandler)
        this._unloadHandler = null
      }
      // 清除本地房间状态，防止返回大厅时读到旧数据
      setRoom(null)
    }

    const user = await getCurrentUser()
    if (user) {
      await saveDiveRecord({
        player_id: user.id,
        map_fragment: this.currentFragmentId,
        result,
        time_sand_gained: this.timeSand,
        crystals_found: [],
        duration,
        kills: this.diveKills,
        echo_sequence: [this.echoSystem.getState().lastSkill].filter(Boolean),
        death_cause: result === 'death' ? 'time_construct_basic' : undefined,
      })
    }

    // 联机：广播结算并等待其他玩家
    if (!this.offline && liveRealtime) {
      const rt = getRuntimeState()
      const myResult: NetDiveResult = {
        id: rt.player.id,
        username: rt.player.username,
        result,
        kills: this.diveKills,
        sand: this.timeSand,
        duration,
      }
      // 保留已收到的队友结果，只替换/插入自己的条目
      this.onlineDiveResults = this.onlineDiveResults.filter(r => r.id !== myResult.id)
      this.onlineDiveResults.unshift(myResult)
      liveRealtime.sendDiveResult(myResult)
      // 等待最多 6 秒收集其他玩家结果
      this.time.delayedCall(6000, () => {
        if (this.scene.isActive()) this.showMultiplayerSettlement(this.onlineDiveResults)
      })
    } else {
      this.showDiveResult(result, duration, this.diveKills, this.timeSand)
    }
  }

  private showMultiplayerSettlement(results: NetDiveResult[]) {
    const { width, height } = this.scale
    audioManager.stopBgm()
    const hasSuccess = results.some(r => r.result === 'success')
    if (hasSuccess) audioManager.playExtract()
    else audioManager.playDeath()

    this.add.rectangle(0, 0, width, height, 0x000000, 0.88)
      .setOrigin(0).setScrollFactor(0).setDepth(200)

    this.add.text(width / 2, 50, '✦  小队结算  ✦', {
      fontFamily: '"Silkscreen", monospace', fontSize: '28px', color: '#c8a96e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    // 标题行
    const COL = [width / 2 - 180, width / 2 - 40, width / 2 + 60, width / 2 + 140, width / 2 + 200]
    const HEADER_Y = 100
    const HEADERS = ['玩家', '结果', '击杀', '时砂', '耗时']
    HEADERS.forEach((h, i) => {
      this.add.text(COL[i], HEADER_Y, h, {
        fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#4a6a8a',
      }).setOrigin(i === 0 ? 0 : 0.5).setScrollFactor(0).setDepth(201)
    })
    this.add.rectangle(width / 2, HEADER_Y + 16, 420, 1, 0x2a4060, 0.6)
      .setScrollFactor(0).setDepth(201)

    const sorted = [...results].sort((a, b) => b.sand - a.sand)
    const selfId = getRuntimeState().player.id

    sorted.forEach((r, i) => {
      const rowY = 135 + i * 52
      const isMe = r.id === selfId
      const isSuccess = r.result === 'success'
      const rowBg = this.add.rectangle(width / 2, rowY + 10, 440, 44,
        isMe ? 0x0c1828 : 0x060c18, 1)
      if (isMe) rowBg.setStrokeStyle(1, 0x3a6090, 0.6)
      rowBg.setScrollFactor(0).setDepth(200)

      // 名次
      const rankColors = ['#f0c040', '#c0c8d8', '#c08050']
      this.add.text(width / 2 - 215, rowY + 10,
        i < 3 ? ['①', '②', '③'][i] : `${i + 1}`, {
        fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: rankColors[i] || '#506070',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

      // 玩家名
      this.add.text(COL[0], rowY + 10, `${r.username}${isMe ? ' ★' : ''}`, {
        fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: isMe ? '#e8f0ff' : '#8090a8',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(201)

      // 结果
      this.add.text(COL[1], rowY + 10, isSuccess ? '撤离' : '阵亡', {
        fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: isSuccess ? '#7ce0bc' : '#e07c7c',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

      // 击杀
      this.add.text(COL[2], rowY + 10, String(r.kills), {
        fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#d8c880',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

      // 时砂
      this.add.text(COL[3], rowY + 10, String(r.sand), {
        fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#80c8f0',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

      // 耗时
      this.add.text(COL[4], rowY + 10, `${r.duration}s`, {
        fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#506070',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    })

    const returnY = 135 + Math.max(sorted.length, 1) * 52 + 40
    let sec = 8
    const cntText = this.add.text(width / 2, returnY, `${sec} 秒后返回庇护所…`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#405060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    this.time.addEvent({
      delay: 1000, repeat: 7,
      callback: () => { sec--; if (cntText.active) cntText.setText(`${Math.max(0, sec)} 秒后返回庇护所…`) },
    })

    const backBtn = this.add.rectangle(width / 2, returnY + 36, 180, 32, 0x0c1828, 1)
    backBtn.setStrokeStyle(1, 0x3a5878, 0.7).setScrollFactor(0).setDepth(201)
    backBtn.setInteractive({ useHandCursor: true })
    backBtn.on('pointerdown', () => { this.scene.stop('HUDScene'); this.scene.start('SanctuaryScene') })
    this.add.text(width / 2, returnY + 36, '返回庇护所', {
      fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#7090b8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202)

    this.time.delayedCall(8200, () => {
      this.scene.stop('HUDScene')
      this.scene.start('SanctuaryScene')
    })
  }

  private showDiveResult(result: 'success' | 'death', duration: number, kills: number, sand: number) {
    const { width, height } = this.scale
    const isSuccess = result === 'success'

    audioManager.stopBgm()
    if (isSuccess) audioManager.playExtract()
    else audioManager.playDeath()

    this.add.rectangle(0, 0, width, height, 0x000000, 0.78)
      .setOrigin(0).setScrollFactor(0).setDepth(200)

    this.add.text(width / 2, height * 0.28, isSuccess ? '✦  深潜成功  ✦' : '✦  深潜失败  ✦', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '34px',
      color: isSuccess ? '#7ce0bc' : '#e07c7c',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    this.add.text(width / 2, height * 0.46,
      `耗时 ${duration}s    ·    击杀 ${kills}    ·    带回时砂 ${sand}`, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '15px',
      color: '#a0c4e8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    // 本次找到的装备
    if (this.diveInventory.length > 0 || this.weaponAttachments.length > 0) {
      const totalValue = this.diveInventory.reduce((s, i) => s + (i.sandValue ?? 0), 0)
        + (isSuccess ? (this.equippedWeapon?.sandValue ?? 0) : 0)
        + this.weaponAttachments.reduce((s, a) => s + (a.sandValue ?? 0), 0)

      this.add.text(width / 2, height * 0.56,
        isSuccess ? `✦ 带回物资总估值：${totalValue} 时砂` : '✦ 背包已损失：', {
        fontFamily: '"Silkscreen", monospace', fontSize: '12px',
        color: isSuccess ? '#f0d060' : '#e07c7c',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

      const parts: string[] = []
      if (isSuccess) parts.push(`[武器] ${this.equippedWeapon.name}`)
      if (this.weaponAttachments.length) parts.push(this.weaponAttachments.map(a => a.name).join(' · '))
      if (this.diveInventory.length) parts.push(this.diveInventory.map(i => i.name).join(' · '))
      this.add.text(width / 2, height * 0.63, parts.join('  |  '), {
        fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#9090c0',
        wordWrap: { width: 520 }, align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    }

    let sec = 4
    const cntText = this.add.text(width / 2, height * 0.76, `${sec} 秒后返回庇护所…`, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '12px',
      color: '#506080',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        sec--
        if (cntText.active) cntText.setText(`${Math.max(0, sec)} 秒后返回庇护所…`)
      },
    })

    this.time.delayedCall(4200, () => {
      this.scene.stop('HUDScene')
      this.scene.start('SanctuaryScene')
    })
  }

  private showTutorial(onDone?: () => void) {
    this.tutorialActive = true
    const { width, height } = this.scale

    const steps = [
      {
        icon: '◆ 移动',
        body: 'WASD 键控制方向\n鼠标方向决定角色朝向',
      },
      {
        icon: '◆ 枪即是你的一切',
        body: '鼠标左键 开枪\n\n普通弹道，基础伤害\n枪法即你战术执行的精准度',
      },
      {
        icon: '◆ 装填技能模块',
        body: '按 1 / 2 / 3 将技能模块装填入枪\n枪口出现元素光环\n\n然后左键开枪 —— 发射该模块\n枪口就是技能的落点',
      },
      {
        icon: '◆ 回响 —— 时砂的记忆',
        body: '时砂会「记住」你上一次装填的模块\n\n当你开枪发射新模块时\n时砂自动将上一个模块「复现」\n两个效果在同一瞬间同时生效\n\n这就是「回响」— 次序与节奏的艺术',
      },
      {
        icon: '◆ 技能组合',
        body: '灼烧弹 → 瘟疫弹 → 开枪\n回响的灼烧引爆毒云 ✦ 毒爆炎浪\n\n引力阱 → 闪电弹 → 开枪\n回响的引力将敌人再拽入电击中心 ✦ 电磁涡流\n\n你的战术签名，由你定义',
      },
      {
        icon: '◆ 撤离',
        body: '找到地图上的金色撤离信标\n进入范围内按 E 键安全撤出\n\n【隐藏】地图中有时序共鸣之门\n用回响同时击中两个感应器可以打开它',
      },
    ]

    let step = 0

    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.74)
      .setOrigin(0).setScrollFactor(0).setDepth(100).setInteractive()

    const iconTxt = this.add.text(width / 2, height * 0.27, '', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '22px',
      color: '#c8a96e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const bodyTxt = this.add.text(width / 2, height * 0.48, '', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '14px',
      color: '#dce9ff',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const promptTxt = this.add.text(width / 2, height * 0.74, '[ 点击继续 ]', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '12px',
      color: '#7090b0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const counterTxt = this.add.text(width / 2, height * 0.82, '', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '11px',
      color: '#40506a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const skipTxt = this.add.text(width - 14, height - 14, '跳过教程', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '11px',
      color: '#405060',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(102).setInteractive()
    skipTxt.on('pointerover', () => skipTxt.setStyle({ color: '#7090b0' }))
    skipTxt.on('pointerout', () => skipTxt.setStyle({ color: '#405060' }))

    const allObjs = [dim, iconTxt, bodyTxt, promptTxt, counterTxt, skipTxt]

    const closeTutorial = () => {
      allObjs.forEach(o => { if (o.active) o.destroy() })
      this.tutorialActive = false
      localStorage.setItem('echoes.tutorial.v1', 'done')
      audioManager.playClick()
      onDone?.()
    }

    const showStep = (i: number) => {
      if (i >= steps.length) { closeTutorial(); return }
      audioManager.playClick()
      iconTxt.setText(steps[i].icon)
      bodyTxt.setText(steps[i].body)
      counterTxt.setText(`${i + 1} / ${steps.length}`)
      promptTxt.setText(i === steps.length - 1 ? '[ 点击开始深潜 ]' : '[ 点击继续 ]')
    }

    showStep(0)
    dim.on('pointerdown', () => { step++; showStep(step) })
    skipTxt.on('pointerdown', closeTutorial)
  }

  // ─────────────────── 装备系统 ────────────────────────────────────

  /** 在指定位置生成装备掉落物 */
  private spawnItemDrop(item: ItemDef, x: number, y: number, dropId?: string) {
    const id = dropId ?? crypto.randomUUID()
    const drop = this.physics.add.image(x, y, item.spriteKey)
    drop.setScale(2)
    drop.setData('itemId', item.id)
    drop.setData('dropId', id)
    drop.setDepth(15)
    this.itemDropGroup.add(drop)
    this.dropRegistry.set(id, drop)

    // 稀有度光晕边框色
    const rarityColor = RARITY_COLORS[item.rarity]

    // 浮动动画
    this.tweens.add({
      targets: drop, y: y - 8,
      duration: 900 + Math.random() * 200,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // 光晕
    const glowGfx = this.add.graphics().setDepth(14)
    const glowTween = this.tweens.add({
      targets: { v: 0 }, v: 1,
      duration: 800, yoyo: true, repeat: -1,
      onUpdate: (_, target) => {
        if (!drop.active) { glowGfx.destroy(); glowTween.destroy(); return }
        glowGfx.clear()
        glowGfx.lineStyle(2, rarityColor, 0.4 + (target.v as number) * 0.4)
        glowGfx.strokeCircle(drop.x, drop.y, 14)
      },
    })

    // 名称悬浮文字
    const label = this.add.text(x, y - 22, item.name, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(16)
    this.tweens.add({ targets: label, y: y - 30, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    // 当 drop 被拾取/销毁时同步清除装饰
    this.time.addEvent({
      delay: 100, repeat: -1,
      callback: () => {
        if (!drop.active) { glowGfx.destroy(); label.destroy() }
      },
    })
  }

  /** 尝试拾取装备到背包 */
  private tryPickupItem(item: ItemDef, x: number, y: number): boolean {
    if (this.diveInventory.length >= BAG_CAPACITY) {
      // 背包满：物品留在地上，仅提示
      this.emitHud('背包已满！(B 键查看)')
      const fullTxt = this.add.text(x, y - 30, '背包已满', {
        fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#ff8060',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(92)
      this.tweens.add({ targets: fullTxt, y: fullTxt.y - 20, alpha: 0, duration: 800, onComplete: () => fullTxt.destroy() })
      return false
    }

    this.diveInventory.push(item)

    // 应用最大 HP 加成（立即生效）
    if (item.maxHpBonus) {
      this.maxHp += item.maxHpBonus
      this.hp = Math.min(this.maxHp, this.hp + item.maxHpBonus)
    }

    audioManager.playPickup()

    const rarityColor = RARITY_COLORS[item.rarity]
    const rarityColorHex = `#${rarityColor.toString(16).padStart(6, '0')}`
    this.emitHud(`✦ 拾取：${item.name}  [${RARITY_NAMES[item.rarity]}]  — ${item.desc}`)

    // 拾取特效
    const pickupFx = this.add.text(x, y - 18, `+${item.name}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: rarityColorHex,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(92)
    this.tweens.add({ targets: pickupFx, y: pickupFx.y - 28, alpha: 0, duration: 900, onComplete: () => pickupFx.destroy() })

    // 背包已满提示
    if (this.diveInventory.length >= BAG_CAPACITY) {
      this.emitHud('背包已满 (B 键查看)')
    }
    return true
  }

  /** B 键 — 切换背包界面 */
  private toggleBag() {
    if (this.bagOpen) {
      this.destroyBagUI()
    } else {
      this.buildBagUI()
    }
    this.bagOpen = !this.bagOpen
    audioManager.playClick()
  }

  /** 构建背包 UI（Phaser 原生对象） */
  private buildBagUI() {
    const { width, height } = this.scale
    const objs: Array<Phaser.GameObjects.GameObject | Phaser.Input.Keyboard.Key> = []

    // 半透明背景
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.76)
      .setScrollFactor(0).setDepth(300).setInteractive()
    objs.push(dim)

    // 面板背景
    const panelW = 580, panelH = 430
    const panelX = width / 2, panelY = height / 2

    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x060c18, 1)
      .setScrollFactor(0).setDepth(301)
    panel.setStrokeStyle(1, 0x3a6090, 0.8)
    objs.push(panel)

    // 标题
    objs.push(this.add.text(panelX, panelY - panelH / 2 + 16, '✦  背包  (B 关闭)', {
      fontFamily: '"Silkscreen", monospace', fontSize: '15px', color: '#c8a96e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(302))

    // ── 武器区域 ─────────────────────────────────────────
    const weapSectionY = panelY - 148
    objs.push(this.add.text(panelX - panelW / 2 + 10, panelY - panelH / 2 + 40, '── 武器 ──', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#446688',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302))

    const weapBg = this.add.rectangle(panelX, weapSectionY, panelW - 20, 72, 0x0a1828, 1)
      .setScrollFactor(0).setDepth(302)
    const weapRarityColor = RARITY_COLORS[this.equippedWeapon.rarity]
    weapBg.setStrokeStyle(1, weapRarityColor, 0.7)
    objs.push(weapBg)

    const weapIconX = panelX - 255
    objs.push(this.add.image(weapIconX, weapSectionY, this.equippedWeapon.spriteKey)
      .setScale(3).setScrollFactor(0).setDepth(303))

    const weapColorHex = `#${weapRarityColor.toString(16).padStart(6, '0')}`
    objs.push(this.add.text(weapIconX + 26, weapSectionY - 18, this.equippedWeapon.name, {
      fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: weapColorHex,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(303))

    objs.push(this.add.text(weapIconX + 26, weapSectionY - 4,
      `[${RARITY_NAMES[this.equippedWeapon.rarity]}]  ${this.equippedWeapon.desc}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#607080',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(303))

    const finalDmg = this.getWeaponBaseDamage()
    const finalRate = this.getWeaponFireRateMs()
    const finalCrit = Math.round(this.getWeaponCritChance() * 100)
    const pelletStr = this.equippedWeapon.pellets ? ` ×${this.equippedWeapon.pellets}弹` : ''
    objs.push(this.add.text(weapIconX + 26, weapSectionY + 12,
      `伤害 ${finalDmg}${pelletStr}   射速 ${finalRate}ms   暴击 ${finalCrit}%`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#88aacc',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(303))

    // 武器估值
    objs.push(this.add.text(weapIconX + 26, weapSectionY + 26,
      `估值 ${this.equippedWeapon.sandValue} ⌛`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#906030',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(303))

    // ── 4 槽位配件（每槽一格：枪管/瞄准镜/弹匣/枪托）────────────
    const slotNames: Record<AttachmentSlot, string> = { barrel: '枪管', scope: '镜', magazine: '弹匣', stock: '枪托', underbarrel: '下挂', enhancement: '强化' }
    const attSlotW = 56, attSlotH = 64, attSlotGap = 6
    const attStartX = panelX + 35
    ATTACHMENT_SLOTS.forEach((slotType, ai) => {
      const ax = attStartX + ai * (attSlotW + attSlotGap)
      const ay = weapSectionY
      const att = this.weaponAttachments.find(a => a.slotType === slotType)
      const slotBg = this.add.rectangle(ax, ay, attSlotW, attSlotH, 0x0c1c30, 1)
        .setScrollFactor(0).setDepth(302)
      objs.push(slotBg)
      if (att) {
        slotBg.setStrokeStyle(2, RARITY_COLORS[att.rarity], 0.8)
        objs.push(this.add.image(ax, ay - 14, att.spriteKey).setScale(2.4).setScrollFactor(0).setDepth(303))
        objs.push(this.add.text(ax, ay + 4, att.name, {
          fontFamily: '"Silkscreen", monospace', fontSize: '7px',
          color: `#${RARITY_COLORS[att.rarity].toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
        objs.push(this.add.text(ax, ay + 16, `${att.sandValue}⌛`, {
          fontFamily: '"Silkscreen", monospace', fontSize: '7px', color: '#806030',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
      } else {
        slotBg.setStrokeStyle(1, 0x1e3050, 0.5)
        objs.push(this.add.text(ax, ay - 6, slotNames[slotType], {
          fontFamily: '"Silkscreen", monospace', fontSize: '8px', color: '#2a4060',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
        objs.push(this.add.text(ax, ay + 8, '空', {
          fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#1e3050',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
      }
    })

    // ── 物品区域 ─────────────────────────────────────────
    objs.push(this.add.text(panelX - panelW / 2 + 10, panelY - 67, '── 物品 ──', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#446688',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302))

    const SLOT_SIZE = 56, SLOT_GAP = 8, COLS = 5
    const ROWS = Math.ceil(BAG_CAPACITY / COLS)  // 9格→2行(5+4)
    const gridW = COLS * SLOT_SIZE + (COLS - 1) * SLOT_GAP
    const gridX = panelX - gridW / 2
    const gridY = panelY - 44

    for (let i = 0; i < BAG_CAPACITY; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const sx = gridX + col * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2
      const sy = gridY + row * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2
      const slotBg = this.add.rectangle(sx, sy, SLOT_SIZE, SLOT_SIZE, 0x0a1020, 1)
        .setScrollFactor(0).setDepth(302)
      objs.push(slotBg)

      if (i < this.diveInventory.length) {
        const item = this.diveInventory[i]
        const rarityColor = RARITY_COLORS[item.rarity]
        const rcHex = `#${rarityColor.toString(16).padStart(6, '0')}`
        slotBg.setStrokeStyle(2, rarityColor, 0.9)
        objs.push(this.add.image(sx, sy - 8, item.spriteKey).setScale(2.6).setScrollFactor(0).setDepth(303))
        objs.push(this.add.text(sx, sy + 14, item.name, {
          fontFamily: '"Silkscreen", monospace', fontSize: '7px', color: rcHex,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
        objs.push(this.add.text(sx, sy + 23, `${item.sandValue}⌛`, {
          fontFamily: '"Silkscreen", monospace', fontSize: '7px', color: '#906030',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
      } else {
        slotBg.setStrokeStyle(1, 0x1e3050, 0.5)
        objs.push(this.add.text(sx, sy, '空', {
          fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#1e3050',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(303))
      }
    }

    // ── 效果汇总 & 总估值 ─────────────────────────────────
    const effectLines: string[] = []
    const dmgBonus = this.getDiveDamageBonus()
    const spdBonus = this.getDiveSpeedBonus()
    const echoBonus = this.getDiveEchoBonus()
    const totalRegen = this.diveInventory.reduce((s, i) => s + (i.regenPerSec ?? 0), 0)
    const magnetMult = this.diveInventory.reduce((s, i) => s * (i.magnetRadiusMult ?? 1), 1)
    const attDmgMult = this.weaponAttachments.reduce((acc, a) => acc * (a.damageMult ?? 1), 1)
    const attRateMult = this.weaponAttachments.reduce((acc, a) => acc * (a.fireRateMult ?? 1), 1)
    const attCrit = this.weaponAttachments.reduce((s, a) => s + (a.critBonus ?? 0), 0)
    if (dmgBonus > 1) effectLines.push(`物品伤害 ×${dmgBonus.toFixed(2)}`)
    if (attDmgMult > 1) effectLines.push(`配件伤害 ×${attDmgMult.toFixed(2)}`)
    if (attRateMult < 1) effectLines.push(`配件射速 +${Math.round((1 - attRateMult) * 100)}%`)
    if (attCrit > 0) effectLines.push(`配件暴击 +${Math.round(attCrit * 100)}%`)
    if (spdBonus > 1) effectLines.push(`速度 ×${spdBonus.toFixed(2)}`)
    if (echoBonus > 1) effectLines.push(`回响 ×${echoBonus.toFixed(2)}`)
    if (totalRegen > 0) effectLines.push(`回血 +${totalRegen}/s`)
    if (magnetMult > 1) effectLines.push(`磁吸 ×${magnetMult.toFixed(1)}`)
    if (this.diveInventory.some(i => i.shieldCooldownMs)) effectLines.push('回响盾 已激活')
    if (this.diveInventory.some(i => i.paradoxChainChance)) effectLines.push('悖论引擎 已激活')

    const effectStr = effectLines.length > 0 ? effectLines.join('  ') : '暂无加成'
    objs.push(this.add.text(panelX, panelY + 140, `加成：${effectStr}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#6090b0',
      wordWrap: { width: panelW - 30 }, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(302))

    const totalValue = this.diveInventory.reduce((s, i) => s + (i.sandValue ?? 0), 0)
      + (this.equippedWeapon?.sandValue ?? 0)
      + this.weaponAttachments.reduce((s, a) => s + (a.sandValue ?? 0), 0)
    objs.push(this.add.text(panelX, panelY + 158,
      `${this.diveInventory.length}/${BAG_CAPACITY} 格物品  ·  配件 ${this.weaponAttachments.length}/${ATTACHMENT_SLOTS.length}  ·  总估值 ${totalValue} ⌛  —  撤离后存入仓库`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#304050',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(302))

    // ESC 关闭
    const escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    escKey.once('down', () => { if (this.bagOpen) this.toggleBag() })
    objs.push(escKey)

    this.bagObjects = objs
  }

  private destroyBagUI() {
    for (const o of this.bagObjects) {
      if (o instanceof Phaser.Input.Keyboard.Key) {
        this.input.keyboard!.removeKey(o as Phaser.Input.Keyboard.Key)
      } else {
        const go = o as Phaser.GameObjects.GameObject
        if (go && go.active !== undefined) go.destroy()
      }
    }
    this.bagObjects = []
  }

  /** 计算当前背包装备的伤害倍率 */
  private getDiveDamageBonus(): number {
    const invBonus = this.diveInventory.reduce((acc, i) => acc * (i.damageMult ?? 1), 1)
    // 虚空狂怒：HP 越低伤害越高
    const berserkMult = this._shrineBuffs.berserk
      ? 1 + (1 - Math.max(0.1, this.hp / this.maxHp)) * 0.6
      : 1
    return invBonus * this._shrineBuffs.damageMult * berserkMult
  }

  /** 计算当前背包装备的速度倍率 */
  private getDiveSpeedBonus(): number {
    const itemBonus = this.diveInventory.reduce((acc, i) => acc * (i.speedMult ?? 1), 1)
    const charBonus = this.charDef?.baseSpeed ?? 1.0
    const phantomBonus = Date.now() < this.charSpeedBoostUntil ? 1.6 : 1.0
    return itemBonus * charBonus * phantomBonus * this._shrineBuffs.speedMult
  }

  /** 计算回响技能额外倍率 */
  private getDiveEchoBonus(): number {
    return this.diveInventory.reduce((acc, i) => acc * (i.echoSkillMult ?? 1), 1) * this._shrineBuffs.echoMult
  }

  // ── 角色专属 Q 技能 ────────────────────────────────────────────

  private activateCharSkill(now: number) {
    if (!this.charDef) return
    const cd = (this.charDef.uniqueSkill.cooldownMs ?? 10000)
    this.charSkillCooldownUntil = now + cd

    const id = this.charDef.id
    const showMsg = (msg: string, color = '#80e0ff') => {
      const { width, height } = this.scale
      const txt = this.add.text(width / 2, height * 0.28, msg, {
        fontFamily: '"Silkscreen", monospace', fontSize: '16px', color,
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(300)
      this.tweens.add({ targets: txt, alpha: 0, y: txt.y - 30, delay: 1200, duration: 600, onComplete: () => txt.destroy() })
    }

    if (id === 'echo_ranger') {
      // 时间回溯：回复 35% 最大 HP
      const heal = Math.round(this.maxHp * 0.35)
      this.hp = Math.min(this.maxHp, this.hp + heal)
      showMsg(`⟳ 时间回溯！恢复 ${heal} HP`, '#7ce0bc')

    } else if (id === 'void_breaker') {
      // 虚空爆裂：在玩家位置制造 AOE 伤害，清除叠层→全释放
      const baseDmg = 30 + this.voidStacks * 20
      this.enemies.getChildren().forEach(go => {
        const enemy = go as EnemyBody
        if (!enemy.active) return
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y)
        if (dist < 180) {
          const dealt = Math.round(baseDmg * (1 - dist / 360))
          this.damageEnemy(enemy, dealt)
        }
      })
      this.voidStacks = 0
      showMsg(`💥 虚空爆裂！${baseDmg} AOE 伤害`, '#cc44ff')

    } else if (id === 'chrono_sentinel') {
      // 时序冻结：冻结全部敌人 2.5s
      const freezeUntil = now + 2500
      this.enemies.getChildren().forEach(go => {
        const enemy = go as EnemyBody
        if (!enemy.active) return
        this.slowUntil.set(enemy, Math.max(this.slowUntil.get(enemy) ?? 0, freezeUntil))
      })
      showMsg(`❄ 时序冻结！敌人停止 2.5s`, '#44ccff')

    } else if (id === 'echo_phantom') {
      // 幻影步：急速冲刺 + 留下残影
      const ghostX = this.player.x
      const ghostY = this.player.y
      const ghost = this.add.image(ghostX, ghostY, 'player_idle')
        .setAlpha(0.5).setTint(0xf0e040).setDepth(2)
      this.tweens.add({ targets: ghost, alpha: 0, duration: 700, onComplete: () => ghost.destroy() })
      this.charSpeedBoostUntil = now + 2200
      showMsg(`⚡ 幻影步！速度+60% 2.2s`, '#f0e040')

    } else if (id === 'iron_warden') {
      // 铁甲堡垒：3s 内受到伤害-60%（charDefBoostUntil 在 takeDamage 读取）
      this.charDefBoostUntil = now + 3000
      showMsg(`🛡 铁甲堡垒！3s 减伤 60%`, '#ddaa44')
    }
  }

  /** void_breaker 被动：击杀敌人积攒虚空叠层 */
  private addVoidStack() {
    if (this.charDef?.id !== 'void_breaker') return
    this.voidStacks = Math.min(5, this.voidStacks + 1)
  }

  // ── 武器属性计算 ────────────────────────────────────────────────

  /** 当前武器单发基础伤害（含配件加成 + 角色伤害加成） */
  private getWeaponBaseDamage(): number {
    const base = this.equippedWeapon?.baseDamage ?? 12
    const attMult = this.weaponAttachments.reduce((acc, a) => acc * (a.damageMult ?? 1), 1)
    const charMult = this.charDef?.baseDamage ?? 1.0
    const voidMult = 1 + this.voidStacks * 0.08  // void_breaker 被动：每叠层 +8% 伤害
    return Math.max(1, Math.round(base * attMult * charMult * voidMult))
  }

  /** 当前武器射击间隔 ms（含配件加成） */
  private getWeaponFireRateMs(): number {
    const base = this.equippedWeapon?.fireRateMs ?? 150
    const attMult = this.weaponAttachments.reduce((acc, a) => acc * (a.fireRateMult ?? 1), 1)
    return Math.max(50, Math.round(base * attMult))
  }

  /** 当前总暴击率（武器基础 + 物品加成 + 配件加成 + 方尖碑加成） */
  private getWeaponCritChance(): number {
    const base = this.equippedWeapon?.baseCritChance ?? 0.08
    const fromItems = this.diveInventory.reduce((s, i) => s + (i.critChance ?? 0), 0)
    const fromAtts  = this.weaponAttachments.reduce((s, a) => s + (a.critBonus ?? 0), 0)
    return Math.min(base + fromItems + fromAtts + this._shrineBuffs.critBonus, 0.95)
  }

  // ── 武器 / 配件掉落物 ─────────────────────────────────────────

  private spawnWeaponDrop(weapon: WeaponDef, x: number, y: number, dropId?: string) {
    const id = dropId ?? crypto.randomUUID()
    const drop = this.physics.add.image(x, y, weapon.spriteKey).setScale(2.5).setDepth(15)
    drop.setData('weaponDef', weapon)
    drop.setData('dropId', id)
    this.weaponDropGroup.add(drop)
    this.dropRegistry.set(id, drop)
    this.tweens.add({ targets: drop, y: y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    const color = RARITY_COLORS[weapon.rarity]
    const glow = this.add.graphics().setDepth(14)
    glow.fillStyle(color, 0.25)
    glow.fillCircle(x, y, 18)

    const label = this.add.text(x, y - 22, `🔫 ${weapon.name}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(16)
    this.tweens.add({ targets: label, y: y - 30, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this.time.addEvent({ delay: 100, repeat: -1, callback: () => { if (!drop.active) { glow.destroy(); label.destroy() } } })
  }

  private tryEquipWeapon(weapon: WeaponDef, x: number, y: number) {
    const old = this.equippedWeapon
    this.equippedWeapon = weapon
    // 换武器保留所有配件（配件按槽位类型绑定，不受武器限制）

    // 旧武器掉落到地上，不丢失
    if (old) {
      this.spawnWeaponDrop(old, x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30)
    }

    audioManager.playPickup()
    const msg = old
      ? `换装：${old.name} → ${weapon.name}  [${RARITY_NAMES[weapon.rarity]}]`
      : `装备：${weapon.name}  [${RARITY_NAMES[weapon.rarity]}]`
    this.emitHud(`🔫 ${msg}`)

    const color = `#${RARITY_COLORS[weapon.rarity].toString(16).padStart(6, '0')}`
    const fx = this.add.text(x, y - 20, `+ ${weapon.name}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color,
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(92)
    this.tweens.add({ targets: fx, y: fx.y - 32, alpha: 0, duration: 1000, onComplete: () => fx.destroy() })
  }

  private spawnAttachmentDrop(att: AttachmentDef, x: number, y: number, dropId?: string) {
    const id = dropId ?? crypto.randomUUID()
    const drop = this.physics.add.image(x, y, att.spriteKey).setScale(2.2).setDepth(15)
    drop.setData('attDef', att)
    drop.setData('dropId', id)
    this.attachmentDropGroup.add(drop)
    this.dropRegistry.set(id, drop)
    this.tweens.add({ targets: drop, y: y - 7, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    const color = RARITY_COLORS[att.rarity]
    const glow = this.add.graphics().setDepth(14)
    glow.fillStyle(color, 0.20)
    glow.fillCircle(x, y, 14)

    const label = this.add.text(x, y - 20, att.name, {
      fontFamily: '"Silkscreen", monospace', fontSize: '9px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(16)
    this.tweens.add({ targets: label, y: y - 28, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this.time.addEvent({ delay: 100, repeat: -1, callback: () => { if (!drop.active) { glow.destroy(); label.destroy() } } })
  }

  private tryPickupAttachment(att: AttachmentDef, x: number, y: number): boolean {
    // 每种槽位只能装一个配件；若拾取同 ID 配件则叠加属性，否则替换
    const existingIdx = this.weaponAttachments.findIndex(a => a.slotType === att.slotType)
    const slotNames: Record<AttachmentSlot, string> = { barrel: '枪管', scope: '瞄准镜', magazine: '弹匣', stock: '枪托', underbarrel: '下挂', enhancement: '强化核' }

    if (existingIdx >= 0) {
      const old = this.weaponAttachments[existingIdx]
      if (old.id === att.id) {
        // 相同配件：叠加效果（加法叠加加成，即 ×N 倍加成）
        const prev = old as AttachmentDef & { _stackCount?: number }
        const stackCount = (prev._stackCount ?? 1) + 1
        const stacked: AttachmentDef & { _stackCount: number } = {
          ...att,
          name: `${att.name} ×${stackCount}`,
          damageMult:   att.damageMult   !== undefined ? 1 + (att.damageMult   - 1) * stackCount : undefined,
          fireRateMult: att.fireRateMult !== undefined ? 1 + (att.fireRateMult - 1) * stackCount : undefined,
          critBonus:    att.critBonus    !== undefined ? att.critBonus    * stackCount : undefined,
          sandValue:    (att.sandValue ?? 0) * stackCount,
          _stackCount: stackCount,
        }
        this.weaponAttachments[existingIdx] = stacked
        const bonusDesc = att.damageMult ? `伤害+${Math.round((att.damageMult - 1) * 100 * stackCount)}%` : att.critBonus ? `暴击+${Math.round(att.critBonus * 100 * stackCount)}%` : att.desc
        this.emitHud(`🔧 叠加 [${slotNames[att.slotType]}] ${stacked.name}  — ${bonusDesc}`)
      } else {
        this.weaponAttachments[existingIdx] = att
        this.emitHud(`🔧 替换 [${slotNames[att.slotType]}]：${old.name} → ${att.name}  — ${att.desc}`)
      }
    } else {
      this.weaponAttachments.push(att)
      this.emitHud(`🔧 安装配件 [${slotNames[att.slotType]}]：${att.name}  — ${att.desc}`)
    }

    audioManager.playPickup()

    const color = `#${RARITY_COLORS[att.rarity].toString(16).padStart(6, '0')}`
    const fx = this.add.text(x, y - 18, `+${att.name}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color,
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(92)
    this.tweens.add({ targets: fx, y: fx.y - 28, alpha: 0, duration: 900, onComplete: () => fx.destroy() })
    return true
  }
}

