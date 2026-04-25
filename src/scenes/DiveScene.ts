import Phaser from 'phaser'
import { FRAGMENT_THEMES, type FragmentId, type FragmentTheme } from '../config/fragments'
import { EchoSystem } from '../systems/EchoSystem'
import { SKILL_DEFINITIONS } from '../config/skills'
import { ENEMY_DEFINITIONS } from '../config/enemies'
import { PROLOGUE_LINES } from '../config/lore'
import { getCurrentUser, saveDiveRecord } from '../lib/supabase'
import { audioManager } from '../systems/AudioManager'
import { voiceManager, getSpeakerRole } from '../systems/VoiceManager'
import { RoomRealtime } from '../net/realtime'
import {
  addTimeSand,
  getRuntimeState,
  patchRuntimeState,
  resetDiveVitals,
  recordDiveComplete,
  addCrystal,
  addLoreEntry,
} from '../state/gameState'
import { LORE_ENTRIES } from '../config/lore'
import type { SkillType } from '../types/game.types'

type DiveInit = {
  offline?: boolean
  roomCode?: string
  mapFragment?: FragmentId
}

type EnemyBody = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  hp: number
  maxHp: number
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
  private roomRealtime: RoomRealtime | null = null

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

  constructor() {
    super('DiveScene')
  }

  init(data: DiveInit) {
    this.offline = data.offline ?? true
    this.roomCode = data.roomCode || ''
    const runtime = getRuntimeState()
    this.currentFragmentId = data.mapFragment || runtime.room?.mapFragment || runtime.selectedFragment
    this.currentTheme = FRAGMENT_THEMES[this.currentFragmentId]
  }

  create() {
    const rt = getRuntimeState()
    resetDiveVitals()

    this.hp = rt.player.maxHp
    this.maxHp = rt.player.maxHp
    this.stability = rt.player.maxStability
    this.maxStability = rt.player.maxStability
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
    this.echoAuraGraphics = this.add.graphics().setDepth(30)
    this.setupCombat()
    this.spawnPickupsAndExtraction()
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
    }

    patchRuntimeState({ diveStartAt: Date.now() })
    this.emitHud('潜入进行中')
    audioManager.startBattleBgm()
  }

  update(time: number) {
    this.movePlayer()
    this.updateEnemies(time)
    this.updateDots()
    this.updateVisuals(time)
    this.updateMinimap()

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

    if (this.hp <= 0 && !this.diveFinished) {
      void this.finishDive('death')
    }

    // 波次清空检测
    if (this.waveInProgress && this.enemies.countActive() === 0) {
      this.waveInProgress = false
      this.bossAlive = false
      this.time.delayedCall(2500, () => this.startNextWave())
    }

    this.emitHud(undefined)
  }

  private spawnMapTiles() {
    const tileTextures = this.currentTheme.tileKeys

    for (let x = 0; x < 1800; x += 32) {
      for (let y = 0; y < 1200; y += 32) {
        const tileKey = Phaser.Utils.Array.GetRandom(tileTextures)
        const tile = this.add.image(x + 16, y + 16, tileKey).setOrigin(0.5)
        tile.setAlpha((x + y) % 64 === 0 ? 0.95 : 0.88)
      }
    }

    this.spawnEnvironmentProps()

    this.add.text(120, 90, this.currentTheme.name, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: this.currentTheme.ambientColor,
    })
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

    const isBossWave = this.waveNumber % 3 === 0
    const count = isBossWave ? 4 : 6 + this.waveNumber * 2
    const eliteChance = Math.min(0.4, 0.1 + this.waveNumber * 0.05)

    // 波次提示
    const { width } = this.scale
    const label = isBossWave
      ? `⚠ 第 ${this.waveNumber} 波  —  精英遭遇`
      : `第 ${this.waveNumber} 波`
    const waveTxt = this.add.text(width / 2, 56, label, {
      fontFamily: 'monospace', fontSize: '18px',
      color: isBossWave ? '#ff9050' : '#7ce0bc',
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
      const isElite = !isBossWave && Math.random() < eliteChance
      const isBoss = isBossWave && i === 0

      let enemyType: string
      if (isBoss) {
        enemyType = 'ancient_guardian'
      } else if (isElite) {
        enemyType = Math.random() < 0.5 ? 'time_construct_heavy' : 'echo_hunter'
      } else {
        enemyType = enemyTypes[i % enemyTypes.length]
      }

      const region = spawnRegions[i % spawnRegions.length]
      const x = region.x + (Math.random() - 0.5) * 160
      const y = region.y + (Math.random() - 0.5) * 160

      this.spawnEnemy(enemyType, x, y, isBoss, isElite)
    }

    if (isBossWave) this.bossAlive = true
  }

  private spawnEnemy(enemyType: string, x: number, y: number, isBoss: boolean, isElite: boolean) {
    const typeDef = ENEMY_DEFINITIONS[enemyType as keyof typeof ENEMY_DEFINITIONS]
    if (!typeDef) return

    const hpMult = isBoss ? 3.5 : isElite ? 1.8 : 1 + this.waveNumber * 0.12
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
    e.setData('wanderAngle', Math.random() * Math.PI * 2)

    if (isBoss) {
      e.setTint(0xff6040)
      // Boss 血条
      this.spawnBossHpBar(e)
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
      fontFamily: 'monospace', fontSize: '11px', color: '#ff8060',
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
      fontFamily: 'monospace',
      fontSize: '14px',
      color: this.currentTheme.ambientColor,
    }).setOrigin(0.5)

    // 叙事碎片拾取物（3-4 个）
    this.spawnLorePickups()
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
        fontFamily: 'monospace', fontSize: '11px', color: '#80c8ff',
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
      fontFamily: 'monospace', fontSize: '8px', color: '#304050',
    }).setScrollFactor(0).setDepth(62)
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
      fontFamily: 'monospace', fontSize: '16px', color: '#c8a96e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    const srcTxt = this.add.text(width / 2, height / 2 - 38, `— ${source}`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#405060',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    const bodyTxt = this.add.text(width / 2, height / 2 - 18, content, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9090b0',
      wordWrap: { width: 520 }, align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(151)

    const closeTxt = this.add.text(width / 2, height / 2 + 66, '[ 任意键关闭 ]', {
      fontFamily: 'monospace', fontSize: '11px', color: '#304050',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151)

    this.input.keyboard!.once('keydown', () => {
      bg.destroy(); titleTxt.destroy(); srcTxt.destroy(); bodyTxt.destroy(); closeTxt.destroy()
    })
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = {
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      digit1: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      digit2: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      digit3: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      extract: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.tutorialActive) return
      this.fireBasicShot(p.worldX, p.worldY)
    })
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

    this.physics.add.overlap(this.bullets, this.enemies, (a, b) => {
      const bullet = a as Phaser.Physics.Arcade.Image
      const enemy = b as EnemyBody
      const damage = Number(bullet.getData('damage') || 12)
      const isChain = bullet.getData('chain') === true
      if (isChain) {
        enemy.setData('chainTarget', true)
      }
      this.damageEnemy(enemy, damage)
      bullet.destroy()
    })

    this.physics.add.overlap(this.player, this.enemies, (_, enemyObj) => {
      const enemy = enemyObj as EnemyBody
      if (this.player.getData('invincible')) return

      this.hp = Math.max(0, this.hp - 12)
      this.stability = Math.max(0, this.stability - 8)
      this.player.setData('invincible', true)
      this.player.setAlpha(0.5)
      this.time.delayedCall(450, () => {
        this.player.setData('invincible', false)
        this.player.setAlpha(1)
      })

      enemy.setVelocity((enemy.x - this.player.x) * 2, (enemy.y - this.player.y) * 2)
    })

    this.physics.add.overlap(this.player, this.pickups, (_, p) => {
      p.destroy()
      const gain = 18 + Math.floor(Math.random() * 12)
      this.timeSand += gain
      addTimeSand(gain)
      audioManager.playPickup()
      this.emitHud(`拾取时砂 +${gain}`)
    })
  }

  private movePlayer() {
    const move = new Phaser.Math.Vector2(0, 0)

    if (this.keys.w.isDown || this.cursors.up.isDown) move.y -= 1
    if (this.keys.s.isDown || this.cursors.down.isDown) move.y += 1
    if (this.keys.a.isDown || this.cursors.left.isDown) move.x -= 1
    if (this.keys.d.isDown || this.cursors.right.isDown) move.x += 1

    move.normalize().scale(210)
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
  }

  private updateEnemies(time: number) {
    this.enemies.children.each((child) => {
      const enemy = child as EnemyBody
      if (!enemy.active) return true

      const baseSpeed = Number(enemy.getData('speed') || 70)
      const slowed = this.slowUntil.get(enemy) ? Date.now() < this.slowUntil.get(enemy)! : false
      const speed = slowed ? baseSpeed * 0.35 : baseSpeed
      const aiMode = String(enemy.getData('aiMode') || 'chase')
      const isBoss = enemy.getData('isBoss') === true
      const enemyType = String(enemy.getData('enemyType') || 'time_construct_basic')

      const dx = this.player.x - enemy.x
      const dy = this.player.y - enemy.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      switch (aiMode) {
        case 'kite': {
          // 游击：距离 220+ 绕行，距离 < 120 撤退
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
          break
        }
        case 'hunter': {
          // 猎手：预判玩家运动方向
          const pVel = this.player.body?.velocity || { x: 0, y: 0 }
          const predictX = this.player.x + pVel.x * 0.4
          const predictY = this.player.y + pVel.y * 0.4
          this.physics.moveTo(enemy, predictX, predictY, speed)
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

  private fireBasicShot(targetX: number, targetY: number) {
    const b = this.physics.add.image(this.player.x, this.player.y, 'bullet')
    b.setScale(1.4)
    b.setData('damage', 12)
    b.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)

    const flash = this.add.image(this.player.x, this.player.y, 'effect_muzzle_flash').setScale(1.2)
    flash.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 120,
      onComplete: () => flash.destroy(),
    })

    this.bullets.add(b)
    this.physics.moveTo(b, targetX, targetY, 500)
    audioManager.playShoot()

    this.time.delayedCall(1200, () => b.destroy())
  }

  private tryCast(slotIndex: number) {
    const skills = getRuntimeState().player.skills
    const skill = skills[slotIndex]
    if (!skill) return

    const now = Date.now()
    const cooldown = this.cooldownUntil[skill] || 0
    if (now < cooldown) {
      this.emitHud(`${SKILL_DEFINITIONS[skill].name} 冷却中`) 
      return
    }

    const result = this.echoSystem.onSkillUsed(skill)
    this.castSkill(result.usedSkill, false)

    if (result.echoSkill) {
      this.time.delayedCall(result.echoDelay, () => {
        this.castSkill(result.echoSkill as SkillType, true)
      })
    }

    this.cooldownUntil[skill] = now + SKILL_DEFINITIONS[skill].cooldown
  }

  private castSkill(skill: SkillType, isEcho: boolean) {
    const pointer = this.input.activePointer
    const def = SKILL_DEFINITIONS[skill]

    switch (skill) {
      case 'dash':
      case 'teleport': {
        const maxRange = def.range || 260
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY)
        const dist = Math.min(maxRange, Phaser.Math.Distance.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY))
        const flash = this.add.image(this.player.x, this.player.y, 'effect_teleport_flash').setScale(1.5)
        this.tweens.add({
          targets: flash,
          alpha: 0,
          duration: 260,
          onComplete: () => flash.destroy(),
        })
        this.player.x += Math.cos(angle) * dist
        this.player.y += Math.sin(angle) * dist
        this.dashVisualUntil = Date.now() + 180
        break
      }
      case 'gravity_well':
      case 'toxic_fog':
      case 'plague_module':
      case 'cryo_field':
      case 'magnet_module': {
        this.spawnAreaDamage(pointer.worldX, pointer.worldY, skill)
        // cryo_field 额外冻结效果
        if (skill === 'cryo_field') {
          this.enemies.children.each(child => {
            const enemy = child as EnemyBody
            if (!enemy.active) return true
            const d = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, enemy.x, enemy.y)
            if (d < (SKILL_DEFINITIONS[skill].range || 200) * 0.4) {
              this.applySlow(enemy, 3000)
            }
            return true
          })
        }
        break
      }
      case 'lightning_bolt': {
        // 闪电：主目标 + 链式传导至3个最近敌人
        const def = SKILL_DEFINITIONS[skill]
        const b = this.physics.add.image(this.player.x, this.player.y, isEcho ? 'bullet_echo' : 'bullet')
        b.setTint(0xf0e040)
        b.setScale(1.6)
        b.setData('damage', (def.damage || 45) * (isEcho ? 0.8 : 1))
        b.setData('chain', true)
        b.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY)
        this.bullets.add(b)
        this.physics.moveTo(b, pointer.worldX, pointer.worldY, 700)
        this.time.delayedCall(1400, () => b.destroy())
        break
      }
      case 'shadow_clone': {
        const clone = this.add.image(this.player.x, this.player.y, 'player_idle').setTint(0x7a84ff).setAlpha(0.6)
        this.tweens.add({
          targets: clone,
          alpha: 0,
          duration: 1800,
          onComplete: () => clone.destroy(),
        })
        break
      }
      default: {
        const texture = isEcho ? 'bullet_echo' : 'bullet'
        const b = this.physics.add.image(this.player.x, this.player.y, texture)
        b.setScale(1.55)
        b.setData('damage', (def.damage || 22) * (isEcho ? 0.8 : 1))
        b.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY)
        this.bullets.add(b)
        this.physics.moveTo(b, pointer.worldX, pointer.worldY, 600)
        this.time.delayedCall(1300, () => b.destroy())
      }
    }

    if (!this.offline && this.roomRealtime) {
      const rt = getRuntimeState()
      this.roomRealtime.sendSkill({
        id: rt.player.id,
        skillId: skill,
        x: this.player.x,
        y: this.player.y,
        isEcho,
        t: Date.now(),
      })
    }

    const ring = this.add.image(this.player.x, this.player.y, 'effect_echo_ring').setScale(isEcho ? 0.9 : 0.7)
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: isEcho ? 1.8 : 1.4,
      scaleY: isEcho ? 1.8 : 1.4,
      duration: isEcho ? 480 : 320,
      onComplete: () => ring.destroy(),
    })

    // 回响激活时检查技能组合
    if (isEcho) {
      this.checkEchoCombo(skill)
    }

    this.emitHud(`${isEcho ? '回响' : '施放'}：${def.name}`)
    if (isEcho) {
      audioManager.playEcho()
    } else {
      audioManager.playSkill()
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
      fontFamily: 'monospace',
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
    enemy.hp -= amount
    if (showNumber) {
      this.spawnDamageNumber(enemy.x, enemy.y - 20, amount, '#f0e050')
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

    enemy.destroy()
    audioManager.playEnemyDeath()
    this.diveKills += 1

    // 小屏幕震动
    this.cameras.main.shake(80, 0.004)

    // Boss / 精英 掉落
    const isBoss = enemy.getData('isBoss') === true
    const isElite = enemy.getData('isElite') === true
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
            enemy.x + (Math.random() - 0.5) * 80,
            enemy.y + (Math.random() - 0.5) * 80,
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

    const dropChance = isBoss ? 1 : isElite ? 0.9 : 0.55
    if (Math.random() < dropChance) {
      const dropCount = isBoss ? 3 : isElite ? 2 : 1
      for (let i = 0; i < dropCount; i++) {
        const ox = (Math.random() - 0.5) * 60
        const oy = (Math.random() - 0.5) * 60
        const p = this.physics.add.image(enemy.x + ox, enemy.y + oy, 'pickup')
        p.setScale(1.5)
        this.pickups.add(p)
        const shine = this.add.image(enemy.x + ox, enemy.y + oy, 'effect_pickup_shine').setScale(1.1)
        this.tweens.add({ targets: shine, alpha: 0, duration: 550, onComplete: () => shine.destroy() })
        this.tweens.add({ targets: p, y: p.y - 6, duration: 700, yoyo: true, repeat: -1 })
      }
    }
  }

  // 飘字伤害数字
  private spawnDamageNumber(x: number, y: number, amount: number, color: string) {
    const txt = this.add.text(x, y, `-${amount}`, {
      fontFamily: 'monospace', fontSize: '13px', color,
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

    try {
      await this.roomRealtime.connect(this.roomCode)
      this.roomRealtime.onRemoteMove((p) => {
        const rt = getRuntimeState()
        if (p.id === rt.player.id) return

        let sprite = this.remotePlayers.get(p.id)
        if (!sprite) {
          sprite = this.add.image(p.x, p.y, 'teammate').setScale(2)
          this.remotePlayers.set(p.id, sprite)
        }

        sprite.x = Phaser.Math.Linear(sprite.x, p.x, 0.8)
        sprite.y = Phaser.Math.Linear(sprite.y, p.y, 0.8)
      })

      this.roomRealtime.onRemoteSkill((evt) => {
        const rt = getRuntimeState()
        if (evt.id === rt.player.id) return

        const pulse = this.add.circle(evt.x, evt.y, evt.isEcho ? 24 : 16, evt.isEcho ? 0x7fffd1 : 0xffcd8a, 0.35)
        this.tweens.add({
          targets: pulse,
          alpha: 0,
          scaleX: 2,
          scaleY: 2,
          duration: 500,
          onComplete: () => pulse.destroy(),
        })
      })

      this.emitHud(`在线同步已连接：${this.roomCode}`)
    } catch {
      this.emitHud('Realtime 连接失败，回落到离线')
      this.offline = true
    }
  }

  private showPrologue() {
    const { width } = this.scale
    const lines = PROLOGUE_LINES.slice(0, 3).map((l) => `${l.speaker}: ${l.text}`).join('\n')
    const box = this.add.rectangle(width / 2, 76, width - 80, 92, 0x000000, 0.52)
      .setScrollFactor(0).setDepth(50)
    const text = this.add.text(40, 32, lines, {
      fontFamily: 'monospace',
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
    })
  }

  private async finishDive(result: 'success' | 'death') {
    if (this.diveFinished) return
    this.diveFinished = true

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
    recordDiveComplete(this.diveKills)

    this.roomRealtime?.disconnect()
    this.roomRealtime = null

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

    this.showDiveResult(result, duration, this.diveKills, this.timeSand)
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
      fontFamily: 'monospace',
      fontSize: '34px',
      color: isSuccess ? '#7ce0bc' : '#e07c7c',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    this.add.text(width / 2, height * 0.46,
      `耗时 ${duration}s    ·    击杀 ${kills}    ·    带回时砂 ${sand}`, {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#a0c4e8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)

    let sec = 4
    const cntText = this.add.text(width / 2, height * 0.62, `${sec} 秒后返回庇护所…`, {
      fontFamily: 'monospace',
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
        icon: '◆ 射击',
        body: '鼠标左键 发射子弹\n枪口指向鼠标光标',
      },
      {
        icon: '◆ 技能与回响',
        body: '按 1 / 2 / 3 使用技能槽\n\n连续使用不同技能将触发「回响」\n前一个技能的因果残余将再次结算\n这就是你的核心战术',
      },
      {
        icon: '◆ 撤离',
        body: '找到地图上的金色撤离信标\n进入范围内按 E 键安全撤出\n\n带着时砂平安回家！',
      },
    ]

    let step = 0

    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.74)
      .setOrigin(0).setScrollFactor(0).setDepth(100).setInteractive()

    const iconTxt = this.add.text(width / 2, height * 0.27, '', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#c8a96e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const bodyTxt = this.add.text(width / 2, height * 0.48, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#dce9ff',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const promptTxt = this.add.text(width / 2, height * 0.74, '[ 点击继续 ]', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#7090b0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const counterTxt = this.add.text(width / 2, height * 0.82, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#40506a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101)

    const skipTxt = this.add.text(width - 14, height - 14, '跳过教程', {
      fontFamily: 'monospace',
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
}
