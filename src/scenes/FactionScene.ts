import Phaser from 'phaser'
import { ALL_FACTIONS, type FactionId } from '../config/factions'
import { setFaction, addTimeSand, getRuntimeState } from '../state/gameState'
import { audioManager } from '../systems/AudioManager'
import type { SkillType } from '../types/game.types'

export class FactionScene extends Phaser.Scene {
  constructor() {
    super('FactionScene')
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#08080f')

    // 背景星空粒子
    for (let i = 0; i < 120; i++) {
      const s = this.add.rectangle(
        Math.random() * width,
        Math.random() * height,
        Math.random() > 0.8 ? 2 : 1,
        Math.random() > 0.8 ? 2 : 1,
        0xffffff,
        0.12 + Math.random() * 0.3,
      )
      this.tweens.add({
        targets: s,
        alpha: 0.05,
        duration: 1500 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
      })
    }

    // 标题
    this.add.text(width / 2, height * 0.1, '选择你的阵营', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '32px',
      color: '#c8a96e',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.17, '这将决定你的起始技能与世界观立场 · 之后可在庇护所修改世界观但不影响技能', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '11px',
      color: '#506070',
    }).setOrigin(0.5)

    // 三阵营卡片
    const cardW = 260
    const cardH = 280
    const positions = [
      width / 2 - cardW - 20,
      width / 2,
      width / 2 + cardW + 20,
    ]

    ALL_FACTIONS.forEach((faction, i) => {
      this.buildFactionCard(positions[i], height * 0.53, cardW, cardH, faction)
    })

    // 底部提示
    this.add.text(width / 2, height * 0.93, '每个阵营都可以学习全部技能 — 阵营只影响起点与被动特性', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '11px',
      color: '#405060',
    }).setOrigin(0.5)
  }

  private buildFactionCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    faction: (typeof ALL_FACTIONS)[0],
  ) {
    // 卡片背景
    const bg = this.add.rectangle(cx, cy, w, h, 0x0a0d1a, 0.9)
    const border = this.add.rectangle(cx, cy, w, h)
    border.setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(faction.color).color, 0.4)

    // 顶部色条
    this.add.rectangle(cx, cy - h / 2 + 4, w, 4,
      Phaser.Display.Color.HexStringToColor(faction.color).color, 1)

    // 阵营标志（用文字大图标代替）
    const sigils: Record<string, string> = {
      rectifiers: '⊕',
      weavers: '⚡',
      void_seekers: '◈',
    }

    this.add.text(cx, cy - h / 2 + 36, sigils[faction.id] || '✦', {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '28px',
      color: faction.color,
    }).setOrigin(0.5)

    this.add.text(cx, cy - h / 2 + 68, faction.name, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '18px',
      color: faction.accentColor,
    }).setOrigin(0.5)

    this.add.text(cx, cy - h / 2 + 86, faction.nameEn, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '10px',
      color: faction.color,
      }).setOrigin(0.5).setAlpha(0.7)

    this.add.text(cx, cy - h / 2 + 118, faction.description, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '11px',
      color: '#9ab0c8',
      wordWrap: { width: w - 32, useAdvancedWrap: true },
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5, 0)

    // 哲学语录
    this.add.text(cx, cy + 28, `「${faction.philosophy}」`, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '10px',
      color: faction.color,
      fontStyle: 'italic',
      wordWrap: { width: w - 32, useAdvancedWrap: true },
      align: 'center',
    }).setOrigin(0.5)

    // 起始奖励
    this.add.text(cx, cy + 56, `起始技能奖励：${faction.passiveName}`, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '10px',
      color: '#dce9ff',
    }).setOrigin(0.5)

    this.add.text(cx, cy + 70, faction.passiveDescription, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '9px',
      color: '#5a7090',
      wordWrap: { width: w - 32, useAdvancedWrap: true },
      align: 'center',
    }).setOrigin(0.5)

    // 选择按钮
    const btnY = cy + h / 2 - 28
    const btnBg = this.add.rectangle(cx, btnY, w - 40, 36, 0x0e1428, 1)
    btnBg.setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(faction.color).color, 0.6)
    const btnTxt = this.add.text(cx, btnY, `选择 ${faction.name}`, {
      fontFamily: '"Silkscreen", monospace',
      fontSize: '13px',
      color: faction.accentColor,
    }).setOrigin(0.5)

    // hover 效果
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => {
      border.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(faction.color).color, 1)
      btnBg.setFillStyle(
        Phaser.Display.Color.HexStringToColor(faction.color).color, 0.15)
      this.tweens.add({ targets: [bg, border], scaleY: 1.01, scaleX: 1.01, duration: 120 })
    })
    bg.on('pointerout', () => {
      border.setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(faction.color).color, 0.4)
      btnBg.setFillStyle(0x0e1428, 1)
      this.tweens.add({ targets: [bg, border], scaleY: 1, scaleX: 1, duration: 120 })
    })
    bg.on('pointerdown', () => {
      audioManager.playClick()
      this.chooseFaction(faction.id, faction.startingSkillBonus, faction.startingTimeSand)
    })

    // 同样让按钮区域可点击（视觉反馈）
    btnBg.setInteractive()
    btnBg.on('pointerdown', () => {
      audioManager.playClick()
      this.chooseFaction(faction.id, faction.startingSkillBonus, faction.startingTimeSand)
    })
  }

  private chooseFaction(factionId: FactionId, bonusSkill: SkillType, sandBonus: number) {
    setFaction(factionId, bonusSkill)
    addTimeSand(sandBonus)
    audioManager.playTransition()

    // 全屏过渡
    const { width, height } = this.scale
    const fade = this.add.rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0).setDepth(100)
    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 400,
      onComplete: () => {
        const rt = getRuntimeState()
        // 如果有已保存角色跳到庇护所，否则登录
        if (rt.player.id.startsWith('local_') || !rt.player.id) {
          this.scene.start('SanctuaryScene')
        } else {
          this.scene.start('SanctuaryScene')
        }
      },
    })
  }
}
