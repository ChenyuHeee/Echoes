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
    this.spawnEnemies()
    this.spawnPickupsAndExtraction()
    this.setupInput()
    this.setupCombat()
    if (!localStorage.getItem('echoes.tutorial.v1')) {
      this.showTutorial(() => this.showPrologue())
    } else {
      this.showPrologue()
    }

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
    this.updateEnemies()
    this.updateVisuals(time)

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
    const enemyTypes = this.currentTheme.enemyPool

    for (let i = 0; i < 12; i++) {
      const enemyType = enemyTypes[i % enemyTypes.length]
      const type = ENEMY_DEFINITIONS[enemyType]
      const e = this.physics.add.sprite(
        400 + Math.random() * 1200,
        200 + Math.random() * 900,
        type.spriteKey
      ) as EnemyBody
      e.hp = type.hp
      e.maxHp = type.hp
      e.setScale(type.isBoss ? 2.2 : enemyType === 'void_drone' ? 1.8 : 2)
      e.setData('speed', Math.min(140, type.speed * 0.8))
      e.setData('enemyType', enemyType)
      if (this.currentTheme.biome === 'magic_forest') {
        e.setTint(type.isBoss ? 0xa6ffd8 : 0x8ed6a2)
      } else if (this.currentTheme.biome === 'cyber_wasteland') {
        e.setTint(type.isBoss ? 0xff8cf1 : 0xb195ff)
      }
      this.enemies.add(e)
    }
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
  }

  private updateEnemies() {
    this.enemies.children.each((child) => {
      const enemy = child as EnemyBody
      if (!enemy.active) return true

      const speed = Number(enemy.getData('speed') || 70)
      const enemyType = String(enemy.getData('enemyType') || 'time_construct_basic')
      this.physics.moveToObject(enemy, this.player, speed)
      enemy.setTexture(this.getEnemyTexture(enemyType, this.time.now))
      enemy.setDepth(enemy.y)
      return true
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
      case 'plague_module': {
        this.spawnAreaDamage(pointer.worldX, pointer.worldY, skill)
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

    const effectTexture = skill === 'gravity_well' ? 'effect_gravity_well' : 'effect_toxic_cloud'
    const fx = this.add.image(x, y, effectTexture).setDisplaySize(radius * 2, radius * 2)
    fx.setAlpha(skill === 'gravity_well' ? 0.85 : 0.78)

    this.enemies.children.each((child) => {
      const enemy = child as EnemyBody
      if (!enemy.active) return true
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y)
      if (dist <= radius) {
        this.damageEnemy(enemy, def.damage || 18)
      }
      return true
    })

    this.tweens.add({
      targets: fx,
      alpha: 0.2,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: def.duration || 650,
      onComplete: () => fx.destroy(),
    })
  }

  private damageEnemy(enemy: EnemyBody, amount: number) {
    enemy.hp -= amount
    if (enemy.hp > 0) {
      enemy.setTintFill(0xffffff)
      this.time.delayedCall(70, () => enemy.clearTint())
      enemy.setTint(0xd56d6d)
      audioManager.playHit()
      return
    }

    enemy.destroy()
    audioManager.playEnemyDeath()
    this.diveKills += 1

    // Boss 死亡 20% 掉落回响水晶
    const isBoss = enemy.getData('isBoss') === true
    if (isBoss && Math.random() < 0.20) {
      const crystalId = `crystal_${this.currentFragmentId}_${Date.now()}`
      addCrystal(crystalId)
      audioManager.playPickup()
      this.emitHud('✦ 回响水晶')
    }

    if (Math.random() < 0.6) {
      const p = this.physics.add.image(enemy.x, enemy.y, 'pickup')
      p.setScale(1.5)
      this.pickups.add(p)

      const shine = this.add.image(enemy.x, enemy.y, 'effect_pickup_shine').setScale(1.1)
      this.tweens.add({
        targets: shine,
        alpha: 0,
        duration: 550,
        onComplete: () => shine.destroy(),
      })

      this.tweens.add({
        targets: p,
        y: p.y - 6,
        duration: 700,
        yoyo: true,
        repeat: -1,
      })
    }
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
