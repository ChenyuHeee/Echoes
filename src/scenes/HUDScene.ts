import Phaser from 'phaser'
import { getRuntimeState } from '../state/gameState'
import { SKILL_DEFINITIONS } from '../config/skills'
import type { SkillType } from '../types/game.types'

interface HudPayload {
  hp: number
  maxHp: number
  stability: number
  maxStability: number
  timeSand: number
  roomCode?: string
  echoSkill?: string
  hint?: string
  skillCooldowns?: Record<string, number>   // skill -> cooldownUntil timestamp
}

export class HUDScene extends Phaser.Scene {
  private hudText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private echoText!: Phaser.GameObjects.Text
  private echoPanel!: Phaser.GameObjects.Rectangle
  private echoIcon!: Phaser.GameObjects.Text
  private echoElementBar!: Phaser.GameObjects.Rectangle

  // HP / Stability 条
  private hpBar!: Phaser.GameObjects.Rectangle
  private stabilityBar!: Phaser.GameObjects.Rectangle

  // 技能槽对象
  private skillSlots: Array<{
    label: Phaser.GameObjects.Text
    cdFill: Phaser.GameObjects.Rectangle
    cdText: Phaser.GameObjects.Text
  }> = []

  // 最新 payload（用于 update() 逐帧刷新冷却）
  private lastPayload: HudPayload | null = null

  constructor() {
    super('HUDScene')
  }

  create() {
    const rt = getRuntimeState()
    const { width, height } = this.scale

    // ─── 左上：状态面板 ─────────────────────────────────────────
    const panelW = 316
    const panelH = 82

    this.add.rectangle(panelW / 2, panelH / 2, panelW, panelH, 0x060810, 0.86)
      .setScrollFactor(0).setDepth(9)
    this.add.rectangle(panelW / 2, panelH - 0.5, panelW, 1, 0x5080c0, 0.22)
      .setScrollFactor(0).setDepth(9)
    this.add.rectangle(panelW, panelH / 2, 1, panelH, 0x5080c0, 0.18)
      .setScrollFactor(0).setDepth(9)

    // HP 条
    this.add.text(8, 8, 'HP', { fontFamily: 'monospace', fontSize: '10px', color: '#e06060' })
      .setScrollFactor(0).setDepth(10)
    const barW = 200
    this.add.rectangle(80 + barW / 2, 14, barW, 10, 0x280a0a, 1)
      .setScrollFactor(0).setDepth(10)
    this.hpBar = this.add.rectangle(80, 14, barW, 10, 0xcc3333, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(11)

    // Stability 条
    this.add.text(8, 26, 'STB', { fontFamily: 'monospace', fontSize: '10px', color: '#5090e0' })
      .setScrollFactor(0).setDepth(10)
    this.add.rectangle(80 + barW / 2, 32, barW, 10, 0x0a1828, 1)
      .setScrollFactor(0).setDepth(10)
    this.stabilityBar = this.add.rectangle(80, 32, barW, 10, 0x3366cc, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(11)

    // 数值文字
    this.hudText = this.add.text(8, 46, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#c8d8f0',
      lineSpacing: 2,
    }).setScrollFactor(0).setDepth(10)

    // ─── 右上：提示区 ─────────────────────────────────────────
    this.add.rectangle(width - 200, 14, 392, 28, 0x060810, 0.78)
      .setScrollFactor(0).setDepth(9)
    this.hintText = this.add.text(width - 8, 5, 'WASD移动  1/2/3装填模块  左键开枪  E撤离', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#4a6080',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(10)

    // ─── 底部：技能槽 ─────────────────────────────────────────
    this.buildSkillBar(width, height)

    // ─── 回响指示器（技能槽正上方，显著展示时砂内存储的技能） ─────────────
    const echoPanelY = height - 80
    this.echoPanel = this.add.rectangle(width / 2, echoPanelY, 240, 30, 0x0a0612, 0.9)
      .setScrollFactor(0).setDepth(9)
    this.echoPanel.setStrokeStyle(1, 0x3a1860, 0.6)
    this.echoElementBar = this.add.rectangle(width / 2 - 120, echoPanelY - 14, 0, 2, 0x8a50e0, 0.8)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10)

    this.echoIcon = this.add.text(width / 2 - 105, echoPanelY, '↩', {
      fontFamily: 'monospace', fontSize: '14px', color: '#4a3060',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10)

    this.echoText = this.add.text(width / 2 - 82, echoPanelY, '时砂未记忆任何技能', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#2a1840',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10)

    this.updateHud({
      hp: rt.player.hp,
      maxHp: rt.player.maxHp,
      stability: rt.player.stability,
      maxStability: rt.player.maxStability,
      timeSand: rt.player.timeSand,
      roomCode: rt.room?.code,
    })

    this.game.events.on('hud:update', this.updateHud, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this)
  }

  private buildSkillBar(width: number, height: number) {
    const skills = getRuntimeState().player.skills
    const slotW = 128
    const slotH = 54
    const gap = 12
    const totalW = slotW * 3 + gap * 2
    const barY = height - 28

    // 背景板
    this.add.rectangle(width / 2, barY, totalW + 20, slotH + 14, 0x060810, 0.88)
      .setScrollFactor(0).setDepth(9)
    this.add.rectangle(width / 2, barY - (slotH / 2) - 7, totalW + 20, 1, 0x5080c0, 0.22)
      .setScrollFactor(0).setDepth(9)

    const startX = width / 2 - totalW / 2

    for (let i = 0; i < 3; i++) {
      const skillId = skills[i] as SkillType | undefined
      const def = skillId ? SKILL_DEFINITIONS[skillId] : null
      const x = startX + i * (slotW + gap) + slotW / 2
      const y = barY
      const colorVal = def
        ? Phaser.Display.Color.HexStringToColor(def.elementColor).color
        : 0x304050

      // 槽背景
      this.add.rectangle(x, y, slotW, slotH, 0x0c1020, 1)
        .setScrollFactor(0).setDepth(10)
      // 槽边框
      this.add.rectangle(x, y, slotW, slotH)
        .setStrokeStyle(1, colorVal, 0.55)
        .setScrollFactor(0).setDepth(10)
      // 顶部元素颜色条
      this.add.rectangle(x, y - slotH / 2 + 2, slotW, 3, colorVal, 0.75)
        .setScrollFactor(0).setDepth(11)
      // 按键编号
      this.add.text(x - slotW / 2 + 6, y - slotH / 2 + 6, `${i + 1}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#384858',
      }).setScrollFactor(0).setDepth(11)

      // 装填提示
      this.add.text(x + slotW / 2 - 6, y - slotH / 2 + 6, '装填', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#2a3a4a',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(11)

      // 技能名
      const label = this.add.text(x, y - 6, def ? def.name : '—', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: def ? '#dce9ff' : '#304050',
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11)

      // 元素类型
      if (def) {
        this.add.text(x, y + 11, def.element, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: def.elementColor,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(11).setAlpha(0.7)
      }

      // 冷却遮罩（从左到右消耗）
      const cdFill = this.add.rectangle(x - slotW / 2, y, 0, slotH - 2, 0x000010, 0.72)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(12)

      // 冷却剩余时间文字
      const cdText = this.add.text(x, y, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#a0c0ff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(13)

      this.skillSlots.push({ label, cdFill, cdText })
    }
  }

  shutdown() {
    this.game.events.off('hud:update', this.updateHud, this)
  }

  private updateHud(payload: HudPayload) {
    if (!this.hudText?.active) return
    this.lastPayload = payload

    // ─ 血条 ─
    const hpPct = Math.max(0, Math.min(1, payload.hp / payload.maxHp))
    const stbPct = Math.max(0, Math.min(1, payload.stability / payload.maxStability))
    const barW = 200
    this.hpBar.setDisplaySize(Math.max(2, barW * hpPct), 10)
    this.stabilityBar.setDisplaySize(Math.max(2, barW * stbPct), 10)
    this.hpBar.setFillStyle(hpPct > 0.6 ? 0x3a9a40 : hpPct > 0.3 ? 0xd09020 : 0xcc2222)

    // ─ 数值文字 ─
    const room = payload.roomCode || 'OFFLINE'
    this.hudText.setText(
      `HP ${Math.ceil(payload.hp)}/${payload.maxHp}  STB ${Math.ceil(payload.stability)}/${payload.maxStability}\n` +
      `时砂 ${Math.floor(payload.timeSand)}  |  ${room}`,
    )

    // ─ 提示 ─
    if (payload.hint) {
      this.hintText.setText(payload.hint)
      this.hintText.setColor('#c8e0ff')
      this.time.delayedCall(2400, () => {
        if (this.hintText?.active) {
          this.hintText.setText('WASD移动  鼠标瞄准  左键射击  1/2/3技能  E撤离')
          this.hintText.setColor('#4a6080')
        }
      })
    }

    // ─ 回响指示器 ─
    if (this.echoText?.active) {
      if (payload.echoSkill) {
        const def = SKILL_DEFINITIONS[payload.echoSkill as SkillType]
        const colorVal = def ? Phaser.Display.Color.HexStringToColor(def.elementColor).color : 0x8a50e0

        this.echoText.setText(def?.name || payload.echoSkill)
        this.echoText.setColor(def?.elementColor || '#8a50e0')
        this.echoIcon.setText('↩').setColor(def?.elementColor || '#8a50e0')
        this.echoPanel.setFillStyle(0x0a0612, 0.92)
        this.echoPanel.setStrokeStyle(1, colorVal, 0.75)
        this.echoElementBar.setDisplaySize(240, 2).setFillStyle(colorVal, 0.9)

        // 光晒闪烁
        this.tweens.killTweensOf(this.echoText)
        this.tweens.add({
          targets: [this.echoText, this.echoIcon],
          alpha: { from: 0.4, to: 1 },
          duration: 300,
          ease: 'Sine.easeOut',
        })
        this.tweens.add({
          targets: this.echoPanel,
          scaleX: { from: 1.04, to: 1 },
          scaleY: { from: 1.1, to: 1 },
          duration: 300,
          ease: 'Back.easeOut',
        })
      } else {
        this.echoText.setText('时砂未记忆任何技能').setColor('#2a1840')
        this.echoIcon.setText('↩').setColor('#2a1840')
        this.echoPanel.setStrokeStyle(1, 0x3a1860, 0.4)
        this.echoElementBar.setDisplaySize(0, 2)
      }
    }

    this.updateSkillCooldowns(payload.skillCooldowns)
  }

  private updateSkillCooldowns(cooldowns?: Record<string, number>) {
    const skills = getRuntimeState().player.skills
    const now = Date.now()

    this.skillSlots.forEach((slot, i) => {
      if (!slot.cdFill?.active) return
      const skillId = skills[i] as SkillType | undefined
      if (!skillId) return
      const def = SKILL_DEFINITIONS[skillId]
      if (!def) return

      const until = cooldowns?.[skillId] || 0
      const remaining = Math.max(0, until - now)
      const pct = remaining / def.cooldown
      const slotW = 128
      slot.cdFill.setDisplaySize(Math.max(0, slotW * pct), 52)

      if (remaining > 0) {
        slot.cdText.setText(`${(remaining / 1000).toFixed(1)}`)
        slot.label.setColor('#3a5070')
      } else {
        slot.cdText.setText('')
        slot.label.setColor('#dce9ff')
      }
    })
  }

  update() {
    if (this.lastPayload?.skillCooldowns) {
      this.updateSkillCooldowns(this.lastPayload.skillCooldowns)
    }
  }
}
