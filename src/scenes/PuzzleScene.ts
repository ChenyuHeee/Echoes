/**
 * PuzzleScene — 时序密室
 *
 * 经典模式：30 solo + 5 co-op 关卡（原有 echo-pad 时序谜题）
 * 社区模式：读取 CommunityMap 格式，支持:
 *   wall / pad / door / teleporter / box / pressure_plate /
 *   switch / trap / elevator / timed_door / conveyor /
 *   key_item / key_door / portal_surface / label
 */

import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import { addTimeSand, getSpeedMultiplier, getRuntimeState } from '../state/gameState'
import { PUZZLE_LEVELS } from '../config/puzzleLevels'
import type { PuzzleLevel } from '../config/puzzleLevels'
import { COMMUNITY_MAPS } from '../config/communityMaps'
import type { CommunityMap } from '../config/communityMapSpec'

// ─── 运行时对象接口 ──────────────────────────────────────────────

interface PadObj {
  id: string
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  onPad: boolean
  activationTimes: number[]
  color: number
  isTrap: boolean
}

interface DoorObj {
  id?: string
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  open: boolean
  requiredPads: string[]
  windowMs: number
}

interface TeleporterObj {
  id: string
  pos: { x: number; y: number }
  targetId: string
  zone: Phaser.GameObjects.Zone
  cooldownUntil: number
  cooldownMs: number
  onZone: boolean
  color: number
  visual: Phaser.GameObjects.Graphics
}

interface TrapObj {
  id?: string
  zone: Phaser.GameObjects.Zone
  visual: Phaser.GameObjects.Rectangle
  active: boolean
}

interface SwitchObj {
  zone: Phaser.GameObjects.Zone
  visual: Phaser.GameObjects.Rectangle
  linksTo: string[]
  mode: string
  triggered: boolean
  onPad: boolean
  label: Phaser.GameObjects.Text
}

interface ElevatorObj {
  visual: Phaser.GameObjects.Rectangle
  physSprite: Phaser.Physics.Arcade.Sprite
  path: { x: number; y: number }[]
  speed: number
  segIdx: number
  segT: number
  dir: 1 | -1
  waitTimer: number
  waitMs: number
  w: number
  h: number
}

interface TimedDoorObj {
  id?: string
  visual: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  openMs: number
  closeMs: number
  open: boolean
  elapsed: number
  w: number
  h: number
}

interface ConveyorObj {
  zone: Phaser.GameObjects.Zone
  vx: number
  vy: number
}

interface BoxObj {
  sprite: Phaser.Physics.Arcade.Sprite
  id?: string
  w: number
  h: number
}

interface PressurePlateObj {
  id: string
  zone: Phaser.GameObjects.Zone
  visual: Phaser.GameObjects.Rectangle
  linksTo: string[]
  requireAll: boolean
  active: boolean
  label: Phaser.GameObjects.Text
}

interface KeyItemObj {
  id: string
  sprite: Phaser.Physics.Arcade.Image | null
  visual: Phaser.GameObjects.Graphics | null
  collected: boolean
}

interface KeyDoorObj {
  id?: string
  visual: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  keyId: string
  open: boolean
  w: number
  h: number
}

interface PortalSurfaceObj {
  id: string
  rect: { x: number; y: number; w: number; h: number }
  visual: Phaser.GameObjects.Rectangle
}

interface PortalSlot {
  x: number
  y: number
  visual: Phaser.GameObjects.Graphics
  surfaceId: string
  cooldownUntil: number
}

// ─── 场景 ───────────────────────────────────────────────────────

export class PuzzleScene extends Phaser.Scene {
  // ── 公用 ──────────────────────────────────────────────────────
  private player!: Phaser.Physics.Arcade.Image
  private player2: Phaser.Physics.Arcade.Image | null = null

  private pads: PadObj[] = []
  private doors: DoorObj[] = []
  private exitGfx!: Phaser.GameObjects.Graphics
  private exitTxt: Phaser.GameObjects.Text | null = null
  private exitActive = false
  private echoMemory: string | null = null
  private echoMemoryAt = 0
  private echo2Memory: string | null = null
  private echo2MemoryAt = 0
  private transitioning = false
  private finished = false
  private totalSand = 0
  private hintLevel = 0          // 当前关卡提示等级 0-3
  private hintBtn?: Phaser.GameObjects.Text
  private skipBtn?: Phaser.GameObjects.Text

  private hintText!: Phaser.GameObjects.Text
  private echoText!: Phaser.GameObjects.Text
  private echo2Text: Phaser.GameObjects.Text | null = null
  private roomTitle!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private levelCounter!: Phaser.GameObjects.Text

  private keys!: {
    w: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    s: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
  }
  private keys2: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  } | null = null

  // ── 经典模式专属 ───────────────────────────────────────────────
  private levelIndex = 0
  private currentLevel!: PuzzleLevel
  private isCoop = false

  // ── 社区模式专属 ───────────────────────────────────────────────
  private isCommunityMode = false
  private currentMapIdx = 0
  private currentMap: CommunityMap | null = null

  private wallGroup!: Phaser.Physics.Arcade.StaticGroup
  private boxGroup!: Phaser.Physics.Arcade.Group

  private teleporterObjs: TeleporterObj[] = []
  private trapObjs: TrapObj[] = []
  private switchObjs: SwitchObj[] = []
  private elevatorObjs: ElevatorObj[] = []
  private timedDoorObjs: TimedDoorObj[] = []
  private conveyorObjs: ConveyorObj[] = []
  private boxObjs: BoxObj[] = []
  private pressurePlateObjs: PressurePlateObj[] = []
  private keyItemObjs: KeyItemObj[] = []
  private keyDoorObjs: KeyDoorObj[] = []
  private portalSurfaces: PortalSurfaceObj[] = []
  private portals: [PortalSlot | null, PortalSlot | null] = [null, null]
  private nextPortalIdx = 0

  private collectedKeys = new Set<string>()
  private toggleables = new Map<string, { open: () => void; close: () => void; toggle: () => void; isOpen: () => boolean }>()

  private communityExit: { x: number; y: number } = { x: 900, y: 270 }
  private communityExitGfx!: Phaser.GameObjects.Graphics

  private keyDisplay!: Phaser.GameObjects.Text
  private portalHint!: Phaser.GameObjects.Text

  // ─────────────────────────────────────────────────────────────
  constructor() { super('PuzzleScene') }

  init(data: { coop?: boolean; startLevel?: number; community?: boolean; mapIdx?: number }) {
    this.isCommunityMode = data.community ?? false
    if (this.isCommunityMode) {
      this.currentMapIdx = data.mapIdx ?? 0
    } else {
      this.isCoop     = data.coop ?? false
      this.levelIndex = data.startLevel != null ? data.startLevel : (this.isCoop ? 30 : 0)
    }
  }

  create() {
    this.transitioning = false; this.finished = false; this.totalSand = 0
    this.echoMemory = null; this.echoMemoryAt = 0
    this.echo2Memory = null; this.echo2MemoryAt = 0
    this.pads = []; this.doors = []; this.player2 = null; this.keys2 = null; this.echo2Text = null

    this.collectedKeys = new Set(); this.toggleables = new Map()
    this.teleporterObjs = []; this.trapObjs = []; this.switchObjs = []; this.elevatorObjs = []
    this.timedDoorObjs = []; this.conveyorObjs = []; this.boxObjs = []; this.pressurePlateObjs = []
    this.keyItemObjs = []; this.keyDoorObjs = []; this.portalSurfaces = []; this.portals = [null, null]
    this.nextPortalIdx = 0; this.exitActive = false

    audioManager.startMenuBgm()
    this.cameras.main.setBackgroundColor('#06080e')
    this.physics.world.setBounds(0, 0, 960, 540)
    this.add.tileSprite(480, 270, 960, 540, 'tile_forest_a').setAlpha(0.45).setDepth(0)

    this.add.rectangle(480, 20, 960, 40, 0x040810, 0.96).setScrollFactor(0).setDepth(30)
    this.add.rectangle(480, 40, 960, 1, 0x304860, 0.5).setScrollFactor(0).setDepth(30)

    this.roomTitle    = this.add.text(480, 8,  '', { fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#50e8a0' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31)
    this.levelCounter = this.add.text(480, 27, '', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#304860' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31)

    const back = this.add.text(14, 8, '<- 返回', { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#304050' }).setOrigin(0, 0).setScrollFactor(0).setDepth(31)
    back.setInteractive({ useHandCursor: true })
    back.on('pointerover', () => back.setColor('#608090'))
    back.on('pointerout',  () => back.setColor('#304050'))
    back.on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })

    this.echoText = this.add.text(700, 8, 'P1回响：空', { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#384850' }).setOrigin(0, 0).setScrollFactor(0).setDepth(31)
    this.hintText = this.add.text(480, 510, '', { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#3a5868', wordWrap: { width: 920 }, align: 'center' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(31)
    this.statusText = this.add.text(480, 290, '', { fontFamily: '"Noto Sans SC", monospace', fontSize: '17px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(40).setAlpha(0)
    this.keyDisplay  = this.add.text(860, 8, '', { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#f0c060' }).setOrigin(1, 0).setScrollFactor(0).setDepth(31)
    this.portalHint  = this.add.text(480, 527, this.isCommunityMode ? 'Q键: 发射传送门  ·  WASD: 移动' : '', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#304050' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(31)

    // 提示按钮（3 级递进）
    this.hintBtn = this.add.text(820, 510, '[提示 0/3]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#7090b0',
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true })
    this.hintBtn.on('pointerover', () => this.hintBtn!.setColor('#a0c0e0'))
    this.hintBtn.on('pointerout',  () => this.hintBtn!.setColor('#7090b0'))
    this.hintBtn.on('pointerdown', () => this.useHint())

    // 跳过按钮（消耗 30 时砂，仅经典/社区单人可跳）
    this.skipBtn = this.add.text(900, 510, '[跳过 -30]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#a06060',
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true })
    this.skipBtn.on('pointerover', () => this.skipBtn!.setColor('#e08080'))
    this.skipBtn.on('pointerout',  () => this.skipBtn!.setColor('#a06060'))
    this.skipBtn.on('pointerdown', () => this.skipLevel())

    this.exitGfx          = this.add.graphics().setDepth(12)
    this.communityExitGfx = this.add.graphics().setDepth(12)

    this.wallGroup = this.physics.add.staticGroup()
    this.boxGroup  = this.physics.add.group()

    const kb = this.input.keyboard!
    this.keys = {
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    if (this.isCommunityMode) {
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q).on('down', () => {
        const ptr = this.input.activePointer
        this.firePortal(ptr.worldX, ptr.worldY)
      })
    }

    this.initTextures()

    this.player = this.physics.add.image(80, 270, 'player_idle')
    this.player.setScale(2.2).setDepth(20).setCollideWorldBounds(true).setTint(0x40ffff)
    ;(this.player.body as Phaser.Physics.Arcade.Body).allowGravity = false

    if (this.isCommunityMode) {
      this.buildCommunityLevel()
    } else {
      this.buildLevel()
    }
  }

  // ─── 贴图生成 ──────────────────────────────────────────────────
  private initTextures() {
    if (!this.textures.exists('cm_pixel')) {
      const g = this.add.graphics()
      g.fillStyle(0xffffff); g.fillRect(0, 0, 4, 4)
      g.generateTexture('cm_pixel', 4, 4); g.destroy()
    }
    if (!this.textures.exists('cm_box')) {
      const g = this.add.graphics()
      g.fillStyle(0x7a4a20); g.fillRect(0, 0, 36, 36)
      g.lineStyle(2, 0xc07030); g.strokeRect(1, 1, 34, 34)
      g.lineStyle(1, 0x906030, 0.5); g.lineBetween(0, 18, 36, 18); g.lineBetween(18, 0, 18, 36)
      g.generateTexture('cm_box', 36, 36); g.destroy()
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  经典模式
  // ══════════════════════════════════════════════════════════════

  private buildLevel() {
    this.pads.forEach(p => { p.sprite.destroy(); p.label.destroy() })
    this.doors.forEach(d => { d.sprite.destroy(); d.label.destroy() })
    this.pads = []; this.doors = []; this.exitActive = false
    this.exitGfx.clear(); this.exitTxt?.destroy(); this.exitTxt = null
    this.echoMemory = null; this.echoMemoryAt = 0
    this.echo2Memory = null; this.echo2MemoryAt = 0
    this.transitioning = false

    const level = PUZZLE_LEVELS[this.levelIndex]
    if (!level) { this.finished = true; this.showVictory(); return }
    this.currentLevel = level

    const maxIdx  = this.isCoop ? PUZZLE_LEVELS.length : 30
    const baseIdx = this.isCoop ? 30 : 0
    const stars = this.estimateClassicDifficulty(level)
    this.roomTitle.setText(level.name)
    this.levelCounter.setText(`${this.levelIndex - baseIdx + 1} / ${maxIdx - baseIdx}    难度 ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`)
    this.hintText.setText(level.hint)
    this.hintLevel = 0
    if (this.hintBtn) this.hintBtn.setText('[提示 0/3]').setColor('#7090b0')
    this.updateEchoDisplay()

    level.pads.forEach(p => {
      const col = Phaser.Display.Color.HexStringToColor(p.color).color
      const sprite = this.add.rectangle(p.x, p.y, 52, 52, col, 0.18).setDepth(5)
      sprite.setStrokeStyle(2, col, 0.65)
      const label = this.add.text(p.x, p.y, p.id, { fontFamily: '"Noto Sans SC", monospace', fontSize: '22px', color: p.color }).setOrigin(0.5).setDepth(6)
      this.pads.push({ id: p.id, sprite, label, onPad: false, activationTimes: [], color: col, isTrap: false })
    })

    level.doors.forEach(d => {
      const sprite = this.add.rectangle(d.x, d.y, d.w, d.h, 0x6820c0, 0.88).setDepth(8)
      sprite.setStrokeStyle(2, 0xa060ff, 0.9)
      const unique  = [...new Set(d.requiredPads)]
      const reqStr  = unique.map(id => { const cnt = d.requiredPads.filter(r => r === id).length; return cnt > 1 ? `${id}x${cnt}` : id }).join('+')
      const label   = this.add.text(d.x, d.y + d.h / 2 + 10, `${reqStr}\n${d.windowMs}ms`, { fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#8850d0', align: 'center' }).setOrigin(0.5, 0).setDepth(9)
      this.doors.push({ sprite, label, open: false, requiredPads: d.requiredPads, windowMs: d.windowMs })
    })

    this.player.setPosition(72, 270)
    if (level.coop && !this.player2) {
      this.setupPlayer2()
    } else if (!level.coop && this.player2) {
      this.player2.destroy(); this.player2 = null
      this.echo2Text?.destroy(); this.echo2Text = null; this.keys2 = null
    }
    if (this.player2) this.player2.setPosition(72, 330)
    this.showStatus(level.solution, '#50e8a0')
  }

  private setupPlayer2() {
    this.player2 = this.physics.add.image(80, 330, 'player_idle')
    this.player2.setScale(2.2).setDepth(20).setCollideWorldBounds(true).setTint(0xffb030)
    ;(this.player2.body as Phaser.Physics.Arcade.Body).allowGravity = false
    const kb = this.input.keyboard!
    this.keys2 = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    }
    this.echo2Text = this.add.text(700, 25, 'P2回响：空', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#7a6020' }).setOrigin(0, 0).setScrollFactor(0).setDepth(31)
  }

  // ══════════════════════════════════════════════════════════════
  //  社区模式：关卡构建
  // ══════════════════════════════════════════════════════════════

  private buildCommunityLevel() {
    this.clearCommunityObjects()
    this.pads.forEach(p => { p.sprite.destroy(); p.label.destroy() })
    this.doors.forEach(d => { d.sprite.destroy(); d.label.destroy() })
    this.pads = []; this.doors = []; this.exitActive = false
    this.exitGfx.clear(); this.exitTxt?.destroy(); this.exitTxt = null
    this.echoMemory = null; this.echoMemoryAt = 0; this.echo2Memory = null; this.echo2MemoryAt = 0
    this.transitioning = false

    const map = COMMUNITY_MAPS[this.currentMapIdx]
    if (!map) { this.finished = true; this.showVictory(); return }
    this.currentMap = map
    this.communityExit = map.exit
    this.collectedKeys = new Set(); this.toggleables = new Map()
    this.portals = [null, null]; this.nextPortalIdx = 0

    this.roomTitle.setText(map.name)
    this.levelCounter.setText(`社区地图  ${this.currentMapIdx + 1}/${COMMUNITY_MAPS.length}  ·  ${map.author}  ·  难度 ${'★'.repeat(map.difficulty)}${'☆'.repeat(Math.max(0, 5 - map.difficulty))}`)
    this.hintText.setText(map.hint)
    this.hintLevel = 0
    if (this.hintBtn) this.hintBtn.setText('[提示 0/3]').setColor('#7090b0')
    this.player.setPosition(map.spawn.x, map.spawn.y)

    for (const el of map.elements) {
      switch (el.type) {
        case 'wall':           this.addWall(el.x, el.y, el.w, el.h, el.color); break
        case 'pad':            this.addCommunityPad(el.id, el.x, el.y, el.color, el.trapPad ?? false); break
        case 'door':           this.addCommunityDoor(el); break
        case 'teleporter':     this.addTeleporter(el.id, el.x, el.y, el.targetId, el.cooldown ?? 1200, el.color ?? '#00e8ff'); break
        case 'box':            this.addBox(el.id, el.x, el.y, el.w ?? 36, el.h ?? 36); break
        case 'pressure_plate': this.addPressurePlate(el); break
        case 'switch':         this.addSwitch(el.x, el.y, el.linksTo, el.mode ?? 'toggle', el.color ?? '#c0e040'); break
        case 'trap':           this.addTrap(el.id, el.x, el.y, el.w, el.h, el.trapType, el.active ?? true); break
        case 'elevator':       this.addElevator(el); break
        case 'timed_door':     this.addTimedDoor(el); break
        case 'conveyor':       this.addConveyor(el.x, el.y, el.w, el.h, el.vx, el.vy, el.color ?? '#203848'); break
        case 'key_item':       this.addKeyItem(el.id, el.x, el.y, el.color ?? '#f0c840'); break
        case 'key_door':       this.addKeyDoor(el); break
        case 'portal_surface': this.addPortalSurface(el.id, el.x, el.y, el.w, el.h); break
        case 'label':          this.add.text(el.x, el.y, el.text, { fontFamily: '"Noto Sans SC", monospace', fontSize: `${el.fontSize ?? 11}px`, color: el.color ?? '#607080', wordWrap: { width: 280 } }).setOrigin(0.5).setDepth(7); break
      }
    }

    this.setupCommunityColliders()
    this.showCommunityExit()
    this.showStatus('✦ 关卡加载完毕', '#50e8a0')
    this.updateEchoDisplay()
    this.updateKeyDisplay()
    this.updatePortalHint()
  }

  private clearCommunityObjects() {
    this.wallGroup?.clear(true, true)
    this.boxGroup?.clear(true, true)
    this.teleporterObjs.forEach(t => { t.zone.destroy(); t.visual.destroy() })
    this.trapObjs.forEach(t => { t.zone.destroy(); t.visual.destroy() })
    this.switchObjs.forEach(s => { s.zone.destroy(); s.visual.destroy(); s.label.destroy() })
    this.elevatorObjs.forEach(e => { e.visual.destroy(); e.physSprite.destroy() })
    this.timedDoorObjs.forEach(d => { d.visual.destroy(); d.label.destroy() })
    this.conveyorObjs.forEach(c => c.zone.destroy())
    this.boxObjs.forEach(b => b.sprite.destroy())
    this.pressurePlateObjs.forEach(p => { p.zone.destroy(); p.visual.destroy(); p.label.destroy() })
    this.keyItemObjs.forEach(k => { k.sprite?.destroy(); k.visual?.destroy() })
    this.keyDoorObjs.forEach(k => { k.visual.destroy(); k.label.destroy() })
    this.portalSurfaces.forEach(s => s.visual.destroy())
    this.portals.forEach(p => p?.visual.destroy())
    this.teleporterObjs = []; this.trapObjs = []; this.switchObjs = []; this.elevatorObjs = []
    this.timedDoorObjs = []; this.conveyorObjs = []; this.boxObjs = []
    this.pressurePlateObjs = []; this.keyItemObjs = []; this.keyDoorObjs = []
    this.portalSurfaces = []; this.portals = [null, null]
    this.communityExitGfx?.clear()
    this.exitTxt?.destroy(); this.exitTxt = null
  }

  // ── 元素构建器 ────────────────────────────────────────────────

  private addWall(x: number, y: number, w: number, h: number, color?: string) {
    const col = color ? Phaser.Display.Color.HexStringToColor(color).color : 0x1e3040
    this.add.rectangle(x, y, w, h, col, 0.92).setStrokeStyle(1, 0x304050, 0.4).setDepth(6)
    const s = this.wallGroup.create(x, y, 'cm_pixel') as Phaser.Physics.Arcade.Sprite
    s.setDisplaySize(w, h).refreshBody().setAlpha(0)
  }

  private addCommunityPad(id: string, x: number, y: number, color: string, isTrap: boolean) {
    const col = Phaser.Display.Color.HexStringToColor(color).color
    const sprite = this.add.rectangle(x, y, 50, 50, col, 0.18).setDepth(5)
    sprite.setStrokeStyle(2, col, isTrap ? 1 : 0.65)
    const label = this.add.text(x, y, id, { fontFamily: '"Noto Sans SC", monospace', fontSize: '20px', color }).setOrigin(0.5).setDepth(6)
    if (isTrap) this.add.text(x, y + 28, '⚠', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#c05050' }).setOrigin(0.5).setDepth(6)
    this.pads.push({ id, sprite, label, onPad: false, activationTimes: [], color: col, isTrap })
  }

  private addCommunityDoor(el: { id?: string; x: number; y: number; w: number; h: number; requires: string[]; windowMs: number }) {
    const sprite  = this.add.rectangle(el.x, el.y, el.w, el.h, 0x6820c0, 0.88).setDepth(8)
    sprite.setStrokeStyle(2, 0xa060ff, 0.9)
    const reqStr  = el.requires.length ? el.requires.join('+') : '(联动)'
    const label   = this.add.text(el.x, el.y, reqStr, { fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#8850d0', align: 'center' }).setOrigin(0.5).setDepth(9)
    const doorObj: DoorObj = { id: el.id, sprite, label, open: false, requiredPads: el.requires, windowMs: el.windowMs }
    this.doors.push(doorObj)
    if (el.id) {
      this.toggleables.set(el.id, {
        open:   () => { if (!doorObj.open) this.openDoorDirect(doorObj) },
        close:  () => { doorObj.open = false; this.tweens.add({ targets: sprite, alpha: 0.88, scaleY: 1, duration: 300 }); label.setColor('#8850d0').setText(reqStr) },
        toggle: () => doorObj.open ? (doorObj.open = false, this.tweens.add({ targets: sprite, alpha: 0.88, scaleY: 1, duration: 300 }), label.setColor('#8850d0').setText(reqStr)) : this.openDoorDirect(doorObj),
        isOpen: () => doorObj.open,
      })
    }
  }

  private openDoorDirect(door: DoorObj) {
    door.open = true
    this.tweens.add({ targets: door.sprite, alpha: 0.08, scaleY: 0.08, duration: 400, ease: 'Power2' })
    door.label.setColor('#50e8a0').setText('✓')
    audioManager.playEcho()
  }

  private addTeleporter(id: string, x: number, y: number, targetId: string, cooldown: number, color: string) {
    const col    = Phaser.Display.Color.HexStringToColor(color).color
    const visual = this.add.graphics()
    for (let r = 28; r >= 12; r -= 8) {
      visual.lineStyle(2, col, (28 - r) / 20)
      visual.strokeCircle(x, y, r)
    }
    visual.fillStyle(col, 0.12); visual.fillCircle(x, y, 18)
    visual.setDepth(8)
    const zone = this.add.zone(x, y, 40, 40)
    this.physics.add.existing(zone, true)
    this.add.text(x, y + 28, '⇆', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color }).setOrigin(0.5).setDepth(7)
    this.teleporterObjs.push({ id, pos: { x, y }, targetId, zone, cooldownUntil: 0, cooldownMs: cooldown, onZone: false, color: col, visual })
  }

  private addBox(id: string | undefined, x: number, y: number, w: number, h: number) {
    const sprite = this.physics.add.sprite(x, y, 'cm_box') as Phaser.Physics.Arcade.Sprite
    sprite.setDisplaySize(w, h).setDepth(15)
    ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false
    // 降低箱子最大速度（原 160），增大阻尼，便于精细控制推到压力板上
    sprite.setDrag(1100, 1100).setMaxVelocity(80, 80)
    this.boxGroup.add(sprite)
    this.boxObjs.push({ sprite, id, w, h })
  }

  private addPressurePlate(el: { id: string; x: number; y: number; linksTo: string[]; requireAll?: boolean; color?: string }) {
    const col    = el.color ? Phaser.Display.Color.HexStringToColor(el.color).color : 0xff9040
    const hexCol = '#' + col.toString(16).padStart(6, '0')
    const visual = this.add.rectangle(el.x, el.y, 46, 10, col, 0.5).setDepth(5).setStrokeStyle(1, col, 0.9)
    const label  = this.add.text(el.x, el.y - 14, '▬', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: hexCol }).setOrigin(0.5).setDepth(6)
    const zone   = this.add.zone(el.x, el.y, 46, 14)
    this.physics.add.existing(zone, true)
    this.pressurePlateObjs.push({ id: el.id, zone, visual, linksTo: el.linksTo, requireAll: el.requireAll ?? false, active: false, label })
  }

  private addSwitch(x: number, y: number, linksTo: string[], mode: string, color: string) {
    const col    = Phaser.Display.Color.HexStringToColor(color).color
    const hexCol = '#' + col.toString(16).padStart(6, '0')
    const visual = this.add.rectangle(x, y, 38, 18, col, 0.35).setDepth(5).setStrokeStyle(2, col, 0.9)
    const label  = this.add.text(x, y - 18, '⚡', { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: hexCol }).setOrigin(0.5).setDepth(6)
    const zone   = this.add.zone(x, y, 38, 20)
    this.physics.add.existing(zone, true)
    this.switchObjs.push({ zone, visual, linksTo, mode, triggered: false, onPad: false, label })
  }

  private addTrap(id: string | undefined, x: number, y: number, w: number, h: number, trapType: string, active: boolean) {
    const colors: Record<string, number> = { spike: 0xe04040, void: 0x300080, laser: 0xff3080 }
    const col    = colors[trapType] ?? 0xe04040
    const visual = this.add.rectangle(x, y, w, h, col, active ? 0.75 : 0.2).setDepth(7).setStrokeStyle(1, col, 0.9)
    if (trapType === 'spike') {
      const n = Math.floor(w / 12)
      for (let i = 0; i < n; i++) {
        const tx = x - w / 2 + 6 + i * 12
        this.add.triangle(tx, y - h / 2, 0, 8, 5, -2, 10, 8, col, active ? 0.9 : 0.2).setDepth(8)
      }
    }
    const zone   = this.add.zone(x, y, w, h)
    this.physics.add.existing(zone, true)
    const trapObj: TrapObj = { id, zone, visual, active }
    this.trapObjs.push(trapObj)
    if (id) {
      this.toggleables.set(id, {
        open:   () => { trapObj.active = true;  visual.setAlpha(0.75) },
        close:  () => { trapObj.active = false; visual.setAlpha(0.15) },
        toggle: () => { trapObj.active = !trapObj.active; visual.setAlpha(trapObj.active ? 0.75 : 0.15) },
        isOpen: () => trapObj.active,
      })
    }
  }

  private addElevator(el: { id?: string; x: number; y: number; w: number; h: number; path: {x:number;y:number}[]; speed: number; waitMs?: number }) {
    const visual     = this.add.rectangle(el.x, el.y, el.w, el.h, 0x3050a0, 0.9).setDepth(10).setStrokeStyle(2, 0x6090f0, 0.9)
    const physSprite = this.wallGroup.create(el.x, el.y, 'cm_pixel') as Phaser.Physics.Arcade.Sprite
    physSprite.setDisplaySize(el.w, el.h).refreshBody().setAlpha(0)
    this.elevatorObjs.push({ visual, physSprite, path: el.path, speed: el.speed, segIdx: 0, segT: 0, dir: 1, waitTimer: 0, waitMs: el.waitMs ?? 500, w: el.w, h: el.h })
  }

  private addTimedDoor(el: { id?: string; x: number; y: number; w: number; h: number; openMs: number; closeMs: number; initialState?: string; phaseOffset?: number }) {
    const startOpen = el.initialState === 'open'
    const visual    = this.add.rectangle(el.x, el.y, el.w, el.h, 0xc05020, startOpen ? 0.12 : 0.85).setDepth(8).setStrokeStyle(2, 0xf08040, 0.9)
    const label     = this.add.text(el.x, el.y, startOpen ? '○' : '●', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#f08040' }).setOrigin(0.5).setDepth(9)
    const obj: TimedDoorObj = { id: el.id, visual, label, openMs: el.openMs, closeMs: el.closeMs, open: startOpen, elapsed: el.phaseOffset ?? 0, w: el.w, h: el.h }
    this.timedDoorObjs.push(obj)
    if (el.id) {
      this.toggleables.set(el.id, {
        open:   () => this.openTimedDoor(obj),
        close:  () => this.closeTimedDoor(obj),
        toggle: () => obj.open ? this.closeTimedDoor(obj) : this.openTimedDoor(obj),
        isOpen: () => obj.open,
      })
    }
  }
  private openTimedDoor(d: TimedDoorObj)  { d.open = true;  this.tweens.add({ targets: d.visual, alpha: 0.08, scaleY: 0.08, duration: 300 }); d.label.setText('○') }
  private closeTimedDoor(d: TimedDoorObj) { d.open = false; this.tweens.add({ targets: d.visual, alpha: 0.85, scaleY: 1,    duration: 300 }); d.label.setText('●') }

  private addConveyor(x: number, y: number, w: number, h: number, vx: number, vy: number, color: string) {
    const col    = Phaser.Display.Color.HexStringToColor(color).color
    this.add.rectangle(x, y, w, h, col, 0.7).setStrokeStyle(1, 0x304050, 0.4).setDepth(5)
    const arrow = vx > 0 ? '→→→' : vx < 0 ? '←←←' : vy > 0 ? '↓↓↓' : '↑↑↑'
    this.add.text(x, y, arrow, { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#506070' }).setOrigin(0.5).setDepth(6)
    const zone = this.add.zone(x, y, w, h)
    this.physics.add.existing(zone, true)
    this.conveyorObjs.push({ zone, vx, vy })
  }

  private addKeyItem(id: string, x: number, y: number, color: string) {
    const col    = Phaser.Display.Color.HexStringToColor(color).color
    const visual = this.add.graphics()
    visual.fillStyle(col, 0.9); visual.fillCircle(x, y, 10)
    visual.lineStyle(2, 0xffffff, 0.4); visual.strokeCircle(x, y, 10)
    visual.fillRect(x + 4, y - 3, 12, 5); visual.fillRect(x + 10, y + 2, 4, 5)
    visual.setDepth(14)
    this.tweens.add({ targets: visual, y: y - 5, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' })
    const sprite = this.physics.add.image(x, y, 'player_idle').setAlpha(0).setScale(0.1) as Phaser.Physics.Arcade.Image
    ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false
    this.keyItemObjs.push({ id, sprite, visual, collected: false })
  }

  private addKeyDoor(el: { id?: string; x: number; y: number; w: number; h: number; keyId: string; color?: string }) {
    const col    = el.color ? Phaser.Display.Color.HexStringToColor(el.color).color : 0xd0a020
    const hexCol = '#' + col.toString(16).padStart(6, '0')
    const visual = this.add.rectangle(el.x, el.y, el.w, el.h, col, 0.85).setDepth(8).setStrokeStyle(2, col, 0.9)
    const label  = this.add.text(el.x, el.y, '🔒', { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: hexCol }).setOrigin(0.5).setDepth(9)
    this.keyDoorObjs.push({ id: el.id, visual, label, keyId: el.keyId, open: false, w: el.w, h: el.h })
  }

  private addPortalSurface(id: string, x: number, y: number, w: number, h: number) {
    const visual = this.add.rectangle(x, y, w, h, 0x2040a0, 0.3).setStrokeStyle(1, 0x4060d0, 0.5).setDepth(5)
    this.add.text(x, y, '▨', { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#2050a0' }).setOrigin(0.5).setDepth(6)
    this.portalSurfaces.push({ id, rect: { x, y, w, h }, visual })
  }

  private setupCommunityColliders() {
    this.physics.add.collider(this.player, this.wallGroup)
    this.physics.add.collider(this.boxGroup, this.wallGroup)
    this.physics.add.collider(this.player, this.boxGroup)
    this.physics.add.collider(this.boxGroup, this.boxGroup)
  }

  private showCommunityExit() {
    const { x, y } = this.communityExit
    this.communityExitGfx.clear()
    for (let r = 36; r >= 18; r -= 5) {
      this.communityExitGfx.lineStyle(3, 0xffd060, (36 - r) / 22)
      this.communityExitGfx.strokeCircle(x, y, r)
    }
    this.communityExitGfx.fillStyle(0xffd060, 0.15); this.communityExitGfx.fillCircle(x, y, 22)
    this.exitTxt = this.add.text(x, y - 38, '出口', { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#ffd060' }).setOrigin(0.5, 1).setDepth(13)
    this.tweens.add({ targets: this.exitTxt, y: this.exitTxt.y - 6, duration: 800, yoyo: true, repeat: -1 })
  }

  // ══════════════════════════════════════════════════════════════
  //  update 主循环
  // ══════════════════════════════════════════════════════════════

  update(time: number, delta: number) {
    if (this.finished) return
    if (this.isCommunityMode) this.updateCommunity(time, delta)
    else                       this.updateClassic(time)
  }

  private updateClassic(time: number) {
    const spd = 200 * getSpeedMultiplier()
    const vx1 = this.keys.a.isDown ? -spd : this.keys.d.isDown ? spd : 0
    const vy1 = this.keys.w.isDown ? -spd : this.keys.s.isDown ? spd : 0
    this.player.setVelocity(vx1, vy1)
    if (this.player2 && this.keys2) {
      const vx2 = this.keys2.left.isDown ? -spd : this.keys2.right.isDown ? spd : 0
      const vy2 = this.keys2.up.isDown   ? -spd : this.keys2.down.isDown  ? spd : 0
      this.player2.setVelocity(vx2, vy2)
    }
    this.pads.forEach(pad => {
      if (!pad.sprite.active) return
      const d1 = Phaser.Math.Distance.Between(this.player.x, this.player.y, pad.sprite.x, pad.sprite.y)
      const d2 = this.player2 ? Phaser.Math.Distance.Between(this.player2.x, this.player2.y, pad.sprite.x, pad.sprite.y) : Infinity
      const anyOn = d1 < 28 || d2 < 28
      if (anyOn && !pad.onPad) {
        pad.onPad = true
        this.activatePad(pad, time, d2 < d1 && !!this.player2)
      } else if (!anyOn && pad.onPad) {
        pad.onPad = false; pad.sprite.setFillStyle(pad.color, 0.18)
      }
    })
    if (this.exitActive && !this.transitioning && this.currentLevel) {
      const d1 = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.currentLevel.exitX, this.currentLevel.exitY)
      const d2 = this.player2 ? Phaser.Math.Distance.Between(this.player2.x, this.player2.y, this.currentLevel.exitX, this.currentLevel.exitY) : Infinity
      if (d1 < 30 && (!this.player2 || d2 < 30)) this.onPassExit()
    }
    if (this.echoMemory  && time - this.echoMemoryAt  > 5000) { this.echoMemory  = null; this.updateEchoDisplay() }
    if (this.echo2Memory && time - this.echo2MemoryAt > 5000) { this.echo2Memory = null; this.updateEchoDisplay() }
    if (this.exitActive && this.currentLevel) this.drawExitPulse(time, this.currentLevel.exitX, this.currentLevel.exitY)
  }

  private updateCommunity(time: number, delta: number) {
    if (this.transitioning) return
    const spd = 200 * getSpeedMultiplier()
    const vx = this.keys.a.isDown ? -spd : this.keys.d.isDown ? spd : 0
    const vy = this.keys.w.isDown ? -spd : this.keys.s.isDown ? spd : 0
    this.player.setVelocity(vx, vy)
    this.updateEchoPads(time)
    this.updateElevators(delta)
    this.updateTimedDoors(delta)
    this.updateTeleporters()
    this.updateTraps()
    this.updateSwitches()
    this.checkPressurePlates()
    this.updateConveyors()
    this.collectKeys()
    this.checkKeyDoors()
    this.checkPortals()
    this.checkCommunityExit()
    if (this.echoMemory && time - this.echoMemoryAt > 5000) { this.echoMemory = null; this.updateEchoDisplay() }
    this.drawExitPulse(time, this.communityExit.x, this.communityExit.y)
  }

  // ── 社区各子系统 ─────────────────────────────────────────────

  private updateEchoPads(time: number) {
    this.pads.forEach(pad => {
      const d  = Phaser.Math.Distance.Between(this.player.x, this.player.y, pad.sprite.x, pad.sprite.y)
      const on = d < 28
      if (on && !pad.onPad) {
        pad.onPad = true
        if (pad.isTrap) {
          this.echoMemory = pad.id; this.echoMemoryAt = time; this.updateEchoDisplay()
          pad.sprite.setFillStyle(0xe05050, 0.5)
          this.showStatus(`⚠ 回响被 ${pad.id} 覆盖！`, '#e05050')
        } else {
          this.activatePad(pad, time, false)
        }
      } else if (!on && pad.onPad) {
        pad.onPad = false; pad.sprite.setFillStyle(pad.color, 0.18)
      }
    })
  }

  private updateElevators(delta: number) {
    for (const elev of this.elevatorObjs) {
      if (elev.waitTimer > 0) { elev.waitTimer -= delta; continue }
      const from    = elev.path[elev.segIdx]
      const nextIdx = elev.segIdx + elev.dir
      if (nextIdx < 0 || nextIdx >= elev.path.length) { elev.dir = -elev.dir as 1 | -1; elev.waitTimer = elev.waitMs; continue }
      const to       = elev.path[nextIdx]
      const segDist  = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y)
      if (segDist < 1) { elev.segIdx = nextIdx; continue }
      elev.segT += (elev.speed * delta) / (1000 * segDist)
      if (elev.segT >= 1) { elev.segT = 0; elev.segIdx = nextIdx; elev.waitTimer = elev.waitMs }
      const prevX = elev.visual.x, prevY = elev.visual.y
      const t     = Math.min(1, elev.segT)
      const newX  = Phaser.Math.Linear(from.x, to.x, t)
      const newY  = Phaser.Math.Linear(from.y, to.y, t)
      elev.visual.setPosition(newX, newY)
      elev.physSprite.setPosition(newX, newY)
      elev.physSprite.refreshBody()
      const dx = newX - prevX, dy = newY - prevY
      if (Math.abs(this.player.x - prevX) <= elev.w / 2 + 6 && Math.abs(this.player.y - prevY) <= elev.h / 2 + 12) {
        this.player.x += dx; this.player.y += dy
      }
    }
  }

  private updateTimedDoors(delta: number) {
    for (const d of this.timedDoorObjs) {
      d.elapsed += delta
      if (d.open)  { if (d.elapsed >= d.openMs)  { d.elapsed = 0; this.closeTimedDoor(d) } }
      else         { if (d.elapsed >= d.closeMs)  { d.elapsed = 0; this.openTimedDoor(d)  } }
    }
  }

  private updateTeleporters() {
    const now = this.time.now
    for (const tp of this.teleporterObjs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, tp.pos.x, tp.pos.y)
      const inZone = d < 24
      if (!inZone) { tp.onZone = false; continue }          // 玩家离开，重置入场状态
      if (tp.onZone) continue                               // 玩家仍在区域内，不重复触发
      if (now < tp.cooldownUntil) continue                  // 还在冷却中
      tp.onZone = true
      const target = this.teleporterObjs.find(t => t.id === tp.targetId)
      if (target) {
        this.player.setPosition(target.pos.x, target.pos.y)
        // 目标传送点也标记为已占用，玩家需走出再走入才能再次触发
        target.onZone = true
        tp.cooldownUntil     = now + tp.cooldownMs
        target.cooldownUntil = now + target.cooldownMs
        audioManager.playEcho(); this.cameras.main.flash(200, 0, 220, 200)
        this.showStatus('⇆ 时空传送', '#00e8ff')
      }
    }
  }

  private updateTraps() {
    for (const trap of this.trapObjs) {
      if (!trap.active) continue
      const hw = trap.visual.width / 2, hh = trap.visual.height / 2
      if (Math.abs(this.player.x - trap.zone.x) < hw + 6 && Math.abs(this.player.y - trap.zone.y) < hh + 6) {
        this.onPlayerDeath(); return
      }
    }
  }

  private updateSwitches() {
    for (const sw of this.switchObjs) {
      const d  = Phaser.Math.Distance.Between(this.player.x, this.player.y, sw.zone.x, sw.zone.y)
      const on = d < 24
      if (on && !sw.onPad) {
        sw.onPad = true
        if (sw.mode === 'once' && sw.triggered) continue
        sw.triggered = true
        sw.visual.setFillStyle(0xffffff, 0.6)
        this.time.delayedCall(200, () => { if (sw.visual.active) sw.visual.setFillStyle(sw.visual.fillColor, 0.35) })
        sw.linksTo.forEach(id => this.toggleables.get(id)?.toggle())
        audioManager.playPickup(); this.showStatus('⚡ 开关触发', '#c0e040')
      } else if (!on && sw.onPad) { sw.onPad = false }
    }
  }

  private checkPressurePlates() {
    for (const pp of this.pressurePlateObjs) {
      let activated = false
      for (const box of this.boxObjs) {
        if (Math.abs(box.sprite.x - pp.zone.x) < (box.w + 46) / 2 - 4 &&
            Math.abs(box.sprite.y - pp.zone.y) < (box.h + 14) / 2) {
          activated = true; break
        }
      }
      if (activated !== pp.active) {
        pp.active = activated; pp.visual.setAlpha(activated ? 1 : 0.5)
        pp.label.setText(activated ? '✓' : '▬')
        if (activated) {
          pp.linksTo.forEach(id => this.toggleables.get(id)?.open())
          audioManager.playPickup(); this.showStatus('✦ 压力板激活', '#ff9040')
        } else {
          pp.linksTo.forEach(id => this.toggleables.get(id)?.close())
        }
      }
    }
  }

  private updateConveyors() {
    for (const conv of this.conveyorObjs) {
      const zb  = conv.zone.body as Phaser.Physics.Arcade.StaticBody
      const hw  = zb.width / 2, hh = zb.height / 2
      if (Math.abs(this.player.x - conv.zone.x) < hw + 4 && Math.abs(this.player.y - conv.zone.y) < hh + 4) {
        const body = this.player.body as Phaser.Physics.Arcade.Body
        body.velocity.x += conv.vx * 0.06
        body.velocity.y += conv.vy * 0.06
      }
    }
  }

  private collectKeys() {
    for (const ki of this.keyItemObjs) {
      if (ki.collected || !ki.sprite) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, ki.sprite.x, ki.sprite.y)
      if (d < 28) {
        ki.collected = true; ki.sprite.destroy(); ki.sprite = null; ki.visual?.destroy(); ki.visual = null
        this.collectedKeys.add(ki.id); audioManager.playHarvest()
        this.cameras.main.flash(200, 240, 200, 80)
        this.showStatus(`🔑 获得钥匙 [${ki.id}]`, '#f0c840')
        this.updateKeyDisplay(); this.checkKeyDoors()
      }
    }
  }

  private checkKeyDoors() {
    for (const kd of this.keyDoorObjs) {
      if (kd.open || !this.collectedKeys.has(kd.keyId)) continue
      kd.open = true
      this.tweens.add({ targets: kd.visual, alpha: 0.08, scaleY: 0.08, duration: 400, ease: 'Power2' })
      kd.label.setText('🔓'); audioManager.playEcho()
    }
  }

  private checkPortals() {
    const now = this.time.now
    for (let i = 0; i < 2; i++) {
      const portal = this.portals[i]; const other = this.portals[1 - i]
      if (!portal || !other || now < portal.cooldownUntil) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, portal.x, portal.y)
      if (d < 22) {
        this.player.setPosition(other.x, other.y)
        portal.cooldownUntil = now + 1500; other.cooldownUntil = now + 1500
        audioManager.playEcho(); this.cameras.main.flash(250, 80, 120, 255)
        this.showStatus(i === 0 ? '○ 蓝门→橙门' : '○ 橙门→蓝门', i === 0 ? '#4080ff' : '#ff8030')
      }
    }
  }

  private checkCommunityExit() {
    if (this.transitioning) return
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.communityExit.x, this.communityExit.y)
    if (d < 30) this.onCommunityPassExit()
  }

  // ── 传送门炮 ──────────────────────────────────────────────────
  private firePortal(mx: number, my: number) {
    const px = this.player.x, py = this.player.y
    const angle = Math.atan2(my - py, mx - px)
    const endX  = px + Math.cos(angle) * 500
    const endY  = py + Math.sin(angle) * 500
    const ray   = new Phaser.Geom.Line(px, py, endX, endY)

    let nearestDist = Infinity
    let nearestPt: { x: number; y: number } = { x: 0, y: 0 }
    let nearestSurf: PortalSurfaceObj | null = null

    for (const surf of this.portalSurfaces) {
      const rect = new Phaser.Geom.Rectangle(surf.rect.x - surf.rect.w / 2, surf.rect.y - surf.rect.h / 2, surf.rect.w, surf.rect.h)
      if (Phaser.Geom.Intersects.LineToRectangle(ray, rect)) {
        // 以矩形中心到射线的最近点作为命中位置
        const closest = new Phaser.Geom.Point()
        Phaser.Geom.Line.GetNearestPoint(ray, new Phaser.Geom.Point(surf.rect.x, surf.rect.y), closest)
        const hitX = Phaser.Math.Clamp(closest.x, rect.left, rect.right)
        const hitY = Phaser.Math.Clamp(closest.y, rect.top, rect.bottom)
        const dist = Phaser.Math.Distance.Between(px, py, hitX, hitY)
        if (dist < nearestDist) { nearestDist = dist; nearestPt = { x: hitX, y: hitY }; nearestSurf = surf }
      }
    }

    if (!nearestSurf) { this.showStatus('传送门未击中有效表面', '#604050'); return }

    const idx    = this.nextPortalIdx % 2 as 0 | 1
    const color  = idx === 0 ? 0x4080ff : 0xff8030
    this.nextPortalIdx++
    this.portals[idx]?.visual.destroy()

    const visual = this.add.graphics().setDepth(18)
    visual.lineStyle(3, color, 1); visual.strokeEllipse(nearestPt.x, nearestPt.y, 22, 44)
    visual.fillStyle(color, 0.2);  visual.fillEllipse(nearestPt.x, nearestPt.y, 22, 44)
    this.tweens.add({ targets: visual, scaleX: 1.2, scaleY: 1.2, yoyo: true, duration: 200 })

    const bolt = this.add.graphics().setDepth(17)
    bolt.lineStyle(2, color, 0.8); bolt.lineBetween(px, py, nearestPt.x, nearestPt.y)
    this.tweens.add({ targets: bolt, alpha: 0, duration: 250, onComplete: () => bolt.destroy() })

    this.portals[idx] = { x: nearestPt.x, y: nearestPt.y, visual, surfaceId: nearestSurf.id, cooldownUntil: 0 }
    audioManager.playPickup()
    this.updatePortalHint()
  }

  // ── 玩家死亡 ──────────────────────────────────────────────────
  private onPlayerDeath() {
    if (this.transitioning) return
    this.transitioning = true
    this.cameras.main.shake(300, 0.02); this.cameras.main.flash(300, 255, 50, 50)
    audioManager.playHit(); this.showStatus('✕ 触发陷阱  -5 时砂', '#ff4040')
    addTimeSand(-5)
    this.time.delayedCall(700, () => {
      if (this.isCommunityMode) this.buildCommunityLevel(); else this.buildLevel()
    })
  }

  // ── HUD 更新 ──────────────────────────────────────────────────
  private updateKeyDisplay() {
    const keys = [...this.collectedKeys].join('  ')
    this.keyDisplay.setText(keys ? `🔑 ${keys}` : '')
  }

  private updatePortalHint() {
    if (!this.isCommunityMode || this.portalSurfaces.length === 0) { this.portalHint.setText(''); return }
    const b = this.portals[0] ? '●' : '○'
    const o = this.portals[1] ? '●' : '○'
    this.portalHint.setText(`Q: 发射传送门  蓝${b}  橙${o}  ·  WASD: 移动`)
  }

  // ══════════════════════════════════════════════════════════════
  //  共用：Echo 系统 / 门 / 出口
  // ══════════════════════════════════════════════════════════════

  private showExitPortal() {
    const { exitX, exitY } = this.currentLevel
    this.exitGfx.clear()
    for (let r = 38; r >= 20; r -= 5) {
      this.exitGfx.lineStyle(3, 0xffd060, (38 - r) / 22)
      this.exitGfx.strokeCircle(exitX, exitY, r)
    }
    this.exitGfx.fillStyle(0xffd060, 0.15); this.exitGfx.fillCircle(exitX, exitY, 24)
    this.exitGfx.lineStyle(2, 0xffd060, 0.9); this.exitGfx.strokeCircle(exitX, exitY, 26)
    this.exitTxt = this.add.text(exitX, exitY - 36, '出口', { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#ffd060' }).setOrigin(0.5, 1).setDepth(13)
    this.tweens.add({ targets: this.exitTxt, y: this.exitTxt.y - 6, duration: 800, yoyo: true, repeat: -1 })
    this.showStatus('✦ 出口已开启 — 走入金色传送门', '#ffd060')
  }

  private drawExitPulse(time: number, cx: number, cy: number) {
    const pulse = 0.14 + Math.sin(time * 0.004) * 0.1
    const gfx   = this.isCommunityMode ? this.communityExitGfx : this.exitGfx
    gfx.clear()
    for (let r = 40; r >= 20; r -= 5) {
      gfx.lineStyle(3, 0xffd060, ((40 - r) / 20) * pulse * 1.8)
      gfx.strokeCircle(cx, cy, r)
    }
    gfx.fillStyle(0xffd060, pulse * 0.85); gfx.fillCircle(cx, cy, 22)
    gfx.lineStyle(2, 0xffd060, 0.9);       gfx.strokeCircle(cx, cy, 27)
  }

  private checkDoors(now: number) {
    let anyJustOpened = false
    this.doors.forEach(door => {
      if (door.open || door.requiredPads.length === 0) return
      const required = new Map<string, number>()
      for (const id of door.requiredPads) required.set(id, (required.get(id) ?? 0) + 1)
      const chosenTimes: number[] = []; let feasible = true
      for (const [padId, count] of required.entries()) {
        const pad    = this.pads.find(p => p.id === padId)
        if (!pad) { feasible = false; break }
        const recent = pad.activationTimes.filter(t => now - t < door.windowMs * 3.5).sort((a, b) => b - a)
        if (recent.length < count) { feasible = false; break }
        chosenTimes.push(...recent.slice(0, count))
      }
      if (!feasible || chosenTimes.length === 0) return
      const span = Math.max(...chosenTimes) - Math.min(...chosenTimes)
      if (span <= door.windowMs) { this.openDoor(door); anyJustOpened = true }
    })

    if (!this.isCommunityMode && anyJustOpened && this.doors.every(d => d.open) && !this.exitActive) {
      this.exitActive = true; this.showExitPortal()
    }
  }

  private openDoor(door: DoorObj) {
    door.open = true
    this.tweens.add({ targets: door.sprite, alpha: 0.08, scaleY: 0.08, duration: 480, ease: 'Power2' })
    door.label.setColor('#50e8a0').setText('✓')
    audioManager.playEcho(); this.cameras.main.flash(280, 80, 220, 140)
    const gain = this.isCommunityMode
      ? Math.floor((this.currentMap?.sandReward ?? 30) * 0.25)
      : Math.floor(this.currentLevel.sandReward * 0.4)
    this.totalSand += gain; addTimeSand(gain)
    this.showStatus(`✦ 门已开启  +${gain} 时砂`, '#50e8a0')
  }

  private activatePad(pad: PadObj, time: number, _isP2 = false) {
    pad.activationTimes.push(time)
    if (pad.activationTimes.length > 8) pad.activationTimes.shift()
    pad.sprite.setFillStyle(0xffffff, 0.8)
    const flash = this.add.image(pad.sprite.x, pad.sprite.y, 'effect_echo_ring').setScale(0.55).setDepth(15)
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 340, onComplete: () => flash.destroy() })
    audioManager.playPickup()

    if (this.echoMemory && this.echoMemory !== pad.id) {
      const prevId   = this.echoMemory
      const echoTime = time + 120
      this.time.delayedCall(120, () => {
        const prev = this.pads.find(p => p.id === prevId)
        if (prev?.sprite.active) {
          prev.activationTimes.push(echoTime)
          if (prev.activationTimes.length > 8) prev.activationTimes.shift()
          prev.sprite.setFillStyle(0xffffff, 0.5)
          const ring = this.add.image(prev.sprite.x, prev.sprite.y, 'effect_echo_ring').setScale(0.4).setTint(0xc060ff).setDepth(15)
          this.tweens.add({ targets: ring, alpha: 0, scaleX: 2.4, scaleY: 2.4, duration: 380, onComplete: () => ring.destroy() })
          this.showStatus(`回响  ${prevId}`, '#c060ff')
          this.checkDoors(echoTime)
        }
      })
    }
    this.echoMemory = pad.id; this.echoMemoryAt = time
    this.updateEchoDisplay(); this.checkDoors(time)
  }

  private updateEchoDisplay() {
    this.echoText.setText(this.echoMemory ? `P1回响：${this.echoMemory}` : 'P1回响：空').setColor(this.echoMemory ? '#c060ff' : '#384850')
    if (this.echo2Text) {
      this.echo2Text.setText(this.echo2Memory ? `P2回响：${this.echo2Memory}` : 'P2回响：空').setColor(this.echo2Memory ? '#ffb030' : '#4a3818')
    }
  }

  private showStatus(msg: string, color: string) {
    this.tweens.killTweensOf(this.statusText)
    this.statusText.setText(msg).setColor(color).setAlpha(1)
    this.tweens.add({ targets: this.statusText, alpha: 0, delay: 2400, duration: 500 })
  }

  // ── 提示 / 跳关 / 难度评估 ──────────────────────────────────

  private estimateClassicDifficulty(level: { pads: { id: string }[]; doors: { requiredPads: string[]; windowMs: number }[] }): number {
    const padCount = level.pads.length
    const maxSeq = Math.max(0, ...level.doors.map(d => d.requiredPads.length))
    const tightWindow = level.doors.length ? Math.min(...level.doors.map(d => d.windowMs)) : 9999
    let s = 1
    if (padCount >= 3) s++
    if (maxSeq >= 3) s++
    if (tightWindow < 700) s++
    if (padCount >= 5 || maxSeq >= 4 || tightWindow < 450) s++
    return Math.min(5, Math.max(1, s))
  }

  private useHint() {
    if (this.finished || this.transitioning) return
    if (this.hintLevel >= 3) {
      this.showStatus('提示已耗尽', '#806060')
      return
    }
    this.hintLevel++
    if (this.hintBtn) this.hintBtn.setText(`[提示 ${this.hintLevel}/3]`).setColor(this.hintLevel >= 3 ? '#604848' : '#7090b0')

    if (this.isCommunityMode) {
      const map = this.currentMap
      if (!map) return
      if (this.hintLevel === 1) {
        const padIds = map.elements.filter((e: { type: string }) => e.type === 'pad').length
        this.showStatus(`提示 1/3：共 ${padIds} 个踏板`, '#a0c0e0')
      } else if (this.hintLevel === 2) {
        const doorReqs = (map.elements as Array<{ type: string; requires?: string[] }>)
          .filter(e => e.type === 'door')
          .map(e => (e.requires ?? []).join('+'))
          .filter(Boolean)
        this.showStatus(`提示 2/3：门需要 ${doorReqs.join(' / ') || '联动触发'}`, '#90c0ff')
      } else {
        this.showStatus(`提示 3/3：${map.hint}`, '#ffd060')
      }
    } else {
      const level = this.currentLevel
      if (!level) return
      if (this.hintLevel === 1) {
        const padIds = level.pads.map((p: { id: string }) => p.id).join(', ')
        this.showStatus(`提示 1/3：可用踏板—${padIds}`, '#a0c0e0')
      } else if (this.hintLevel === 2) {
        const seqs = level.doors.map((d: { requiredPads: string[]; windowMs: number }) => `${d.requiredPads.join('+')} (${d.windowMs}ms)`).join(' / ')
        this.showStatus(`提示 2/3：门需要—${seqs}`, '#90c0ff')
      } else {
        this.showStatus(`提示 3/3：${level.solution}`, '#ffd060')
      }
    }
  }

  private skipLevel() {
    if (this.finished || this.transitioning) return
    const COST = 30
    const sand = getRuntimeState().player.timeSand
    if (sand < COST) {
      this.showStatus(`需 ${COST} 时砂才能跳过（当前 ${sand}）`, '#e08080')
      return
    }
    addTimeSand(-COST)
    this.showStatus(`⭭ 跳过当前关卡　-${COST} 时砂`, '#ffa040')
    this.time.delayedCall(600, () => {
      if (this.isCommunityMode) this.onCommunityPassExit()
      else this.onPassExit()
    })
  }

  // ── 通关 ──────────────────────────────────────────────────────

  private onPassExit() {
    if (this.transitioning || this.finished) return
    this.transitioning = true; this.cameras.main.flash(300, 255, 230, 100)
    const gain = Math.floor(this.currentLevel.sandReward * 0.6)
    this.totalSand += gain; addTimeSand(gain)
    const maxIdx = this.isCoop ? PUZZLE_LEVELS.length : 30
    this.levelIndex++
    if (this.levelIndex >= maxIdx) {
      this.finished = true; this.time.delayedCall(500, () => this.showVictory())
    } else {
      this.showStatus(`进入 ${PUZZLE_LEVELS[this.levelIndex]?.name ?? '下一室'}`, '#ffd060')
      this.time.delayedCall(700, () => this.buildLevel())
    }
  }

  private onCommunityPassExit() {
    if (this.transitioning) return
    this.transitioning = true; this.cameras.main.flash(300, 255, 230, 100)
    const gain = Math.floor((this.currentMap?.sandReward ?? 30) * 0.75)
    this.totalSand += gain; addTimeSand(gain); audioManager.playHarvest()
    this.currentMapIdx++
    if (this.currentMapIdx >= COMMUNITY_MAPS.length) {
      this.finished = true; this.time.delayedCall(500, () => this.showVictory())
    } else {
      this.showStatus(`✦ 通关！进入 ${COMMUNITY_MAPS[this.currentMapIdx]?.name ?? '下一图'}`, '#ffd060')
      this.time.delayedCall(800, () => this.buildCommunityLevel())
    }
  }

  private showVictory() {
    const W = 960, H = 540, isCom = this.isCommunityMode
    this.add.rectangle(W / 2, H / 2, 560, 270, 0x040810, 0.97).setScrollFactor(0).setDepth(120).setStrokeStyle(2, 0x50e8a0)
    this.add.text(W / 2, H / 2 - 90, isCom ? '✦ 社区地图全部通关 ✦' : '✦ 时序密室全部破解 ✦', { fontFamily: '"Noto Sans SC", monospace', fontSize: '22px', color: '#50e8a0' }).setOrigin(0.5).setScrollFactor(0).setDepth(121)
    const total = isCom ? COMMUNITY_MAPS.length : (this.isCoop ? 5 : 30)
    this.add.text(W / 2, H / 2 - 52, `通关 ${total} 个关卡`, { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#507090' }).setOrigin(0.5).setScrollFactor(0).setDepth(121)
    this.add.text(W / 2, H / 2 - 20, `获得时砂  ${this.totalSand}`, { fontFamily: '"Noto Sans SC", monospace', fontSize: '18px', color: '#c8e060' }).setOrigin(0.5).setScrollFactor(0).setDepth(121)
    this.add.text(W / 2, H / 2 + 14, '回响不止于战斗——它是时间本身的语言', { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#384850' }).setOrigin(0.5).setScrollFactor(0).setDepth(121)
    const mkBtn = (cx: number, label: string, color: number, fn: () => void) => {
      const bg = this.add.rectangle(cx, H / 2 + 76, 160, 32, 0x040810).setScrollFactor(0).setDepth(121).setStrokeStyle(1, color, 0.9)
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerover', () => bg.setFillStyle(color, 0.12))
      bg.on('pointerout',  () => bg.setFillStyle(0x040810))
      bg.on('pointerdown', () => { audioManager.playClick(); fn() })
      this.add.text(cx, H / 2 + 76, label, { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#' + color.toString(16).padStart(6, '0') }).setOrigin(0.5).setScrollFactor(0).setDepth(122)
    }
    mkBtn(W / 2 - 100, '再次挑战', 0x50e8a0, () => this.scene.restart())
    mkBtn(W / 2 + 100, '返回大厅', 0x607080, () => this.scene.start('ModeSelectScene'))
  }
}
