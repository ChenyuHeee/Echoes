import Phaser from 'phaser'
import { SANCTUARY_LINES, LORE_ENTRIES } from '../config/lore'
import {
  addTimeSand,
  getRuntimeState,
  setLastHarvestAt,
  unlockSkill,
  setEquippedSkills,
} from '../state/gameState'
import { audioManager } from '../systems/AudioManager'
import { SKILL_DEFINITIONS } from '../config/skills'
import { FACTION_DEFINITIONS } from '../config/factions'
import type { SkillType } from '../types/game.types'

type TabId = 'overview' | 'workshop' | 'character' | 'lore'

export class SanctuaryScene extends Phaser.Scene {
  private tipText!: Phaser.GameObjects.Text
  private contentLayer!: Phaser.GameObjects.Container
  private activeTab: TabId = 'overview'
  private tabBtns: Map<TabId, { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text }> = new Map()

  constructor() {
    super('SanctuaryScene')
  }

  create() {
    const rt = getRuntimeState()

    // ── 检查是否需要选择阵营 ──────────────────────────────
    if (!rt.player.faction) {
      this.scene.start('FactionScene')
      return
    }

    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#0b0d18')
    audioManager.startMenuBgm()

    // 背景
    this.add.image(width / 2, height / 2, 'bg_sanctuary')
      .setDisplaySize(width, height).setAlpha(0.22)

    // 标题栏
    this.add.rectangle(width / 2, 28, width, 56, 0x060810, 0.95).setDepth(5)
    this.add.rectangle(width / 2, 56, width, 1, 0x406080, 0.3).setDepth(5)
    this.add.text(width / 2, 18, '✦  回响庇护所', {
      fontFamily: 'monospace', fontSize: '22px', color: '#7ce0bc',
    }).setOrigin(0.5, 0).setDepth(6)
    const faction = FACTION_DEFINITIONS[rt.player.faction]
    this.add.text(width / 2, 40, `${faction?.name || ''}  ·  Lv.${rt.player.level}  ·  ${rt.player.username}`, {
      fontFamily: 'monospace', fontSize: '11px', color: faction?.color || '#7090b0',
    }).setOrigin(0.5, 0).setDepth(6)

    // 标签页按钮
    const TABS: Array<{ id: TabId; label: string }> = [
      { id: 'overview', label: '概览' },
      { id: 'workshop', label: '技能工坊' },
      { id: 'character', label: '角色档案' },
      { id: 'lore', label: '残响档案' },
    ]
    const tabW = 130
    const tabStartX = width / 2 - (tabW * TABS.length) / 2 + tabW / 2
    TABS.forEach((tab, i) => {
      const tx = tabStartX + i * tabW
      const bg = this.add.rectangle(tx, 82, tabW - 6, 32, 0x0c1020, 1)
        .setDepth(6)
      bg.setStrokeStyle(1, 0x304050, 0.6)
      const txt = this.add.text(tx, 82, tab.label, {
        fontFamily: 'monospace', fontSize: '13px', color: '#6080a0',
      }).setOrigin(0.5).setDepth(7)

      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerdown', () => { audioManager.playClick(); this.switchTab(tab.id) })
      bg.on('pointerover', () => { bg.setFillStyle(0x14203a, 1) })
      bg.on('pointerout', () => {
        bg.setFillStyle(this.activeTab === tab.id ? 0x162238 : 0x0c1020, 1)
      })
      this.tabBtns.set(tab.id, { bg, txt })
    })
    this.add.rectangle(width / 2, 98, width, 1, 0x304050, 0.4).setDepth(5)

    // 内容区容器
    this.contentLayer = this.add.container(0, 108).setDepth(4)

    // 底部提示
    this.tipText = this.add.text(width / 2, height - 14, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#f0d48a',
    }).setOrigin(0.5, 1).setDepth(8)

    this.switchTab('overview')
  }

  // ─────────────────────────────────────────────────────
  private switchTab(tab: TabId) {
    this.activeTab = tab
    this.contentLayer.removeAll(true)
    this.tipText.setText('')

    // 更新标签样式
    this.tabBtns.forEach((btn, id) => {
      const active = id === tab
      btn.bg.setFillStyle(active ? 0x162238 : 0x0c1020, 1)
      btn.bg.setStrokeStyle(1, active ? 0x4080c0 : 0x304050, active ? 0.8 : 0.5)
      btn.txt.setColor(active ? '#c8e0ff' : '#6080a0')
    })

    switch (tab) {
      case 'overview': this.buildOverview(); break
      case 'workshop': this.buildWorkshop(); break
      case 'character': this.buildCharacter(); break
      case 'lore': this.buildLore(); break
    }
  }

  // ─────────────────── TAB: 概览 ───────────────────────
  private buildOverview() {
    const { width, height } = this.scale
    const rt = getRuntimeState()
    const cy = (height - 108) / 2  // 内容区中心

    // NPC 对话
    const dialogue = SANCTUARY_LINES
      .map(l => `${l.speaker}：${l.text}`)
      .join('\n\n')
    this.contentLayer.add(this.make.text({
      x: width / 2,
      y: cy - 110,
      text: dialogue,
      style: {
        fontFamily: 'monospace', fontSize: '13px', color: '#b8d0e8',
        wordWrap: { width: 700 }, lineSpacing: 5, align: 'center',
      },
      add: false,
    }).setOrigin(0.5))

    // 温室收取按钮
    this.contentLayer.add(this.makeBtn(width / 2 - 160, cy + 40, '收取温室时砂 +20', 200, () => {
      const now = Date.now()
      const state = getRuntimeState()
      const COOLDOWN = 4 * 60 * 60 * 1000
      if (state.player.lastHarvestAt && now - state.player.lastHarvestAt < COOLDOWN) {
        const rem = COOLDOWN - (now - state.player.lastHarvestAt)
        const h = Math.floor(rem / 3600000)
        const m = Math.floor((rem % 3600000) / 60000)
        this.tipText.setText(`温室正在生长中 — ${h}h ${m}m 后可再次收取`)
        return
      }
      addTimeSand(20)
      setLastHarvestAt(now)
      audioManager.playHarvest()
      this.tipText.setText(`✦ +20 时砂  当前：${getRuntimeState().player.timeSand}`)
    }))

    // 当前时砂
    const sandTxt = this.make.text({
      x: width / 2,
      y: cy + 90,
      text: `当前时砂：${rt.player.timeSand}`,
      style: { fontFamily: 'monospace', fontSize: '14px', color: '#e8d080' },
      add: false,
    }).setOrigin(0.5)
    this.contentLayer.add(sandTxt)

    // 前往深潜
    this.contentLayer.add(this.makeBtn(width / 2 + 160, cy + 40, '选择游戏模式', 200, () => {
      audioManager.playClick()
      this.scene.start('ModeSelectScene')
    }))

    // 返回菜单
    this.contentLayer.add(this.makeBtn(width / 2, cy + 130, '返回主菜单', 180, () => {
      audioManager.playClick()
      this.scene.start('MenuScene')
    }))
  }

  // ─────────────────── TAB: 技能工坊 ──────────────────
  private buildWorkshop() {
    const { width } = this.scale
    const rt = getRuntimeState()
    // 4 列 × 3 行 = 12 格，恰好容纳全部技能且不超出可见区域
    const COLS = 4
    const CARD_W = 210
    const CARD_H = 90
    const GAP_X = 10
    const GAP_Y = 8
    const totalW = COLS * CARD_W + (COLS - 1) * GAP_X
    const startX = width / 2 - totalW / 2 + CARD_W / 2
    const startY = 30

    const allSkills = Object.values(SKILL_DEFINITIONS)

    // 装备提示
    this.contentLayer.add(this.make.text({
      x: width / 2, y: 8,
      text: '点击已解锁技能可装备到 [1][2][3] 槽 · 橙色 = 已装备',
      style: { fontFamily: 'monospace', fontSize: '11px', color: '#506070' },
      add: false,
    }).setOrigin(0.5))

    allSkills.forEach((skill, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const cx = startX + col * (CARD_W + GAP_X)
      const cy = startY + row * (CARD_H + GAP_Y) + CARD_H / 2

      const isUnlocked = rt.player.unlockedSkills.includes(skill.id)
      const isEquipped = rt.player.skills.includes(skill.id)
      const colorVal = Phaser.Display.Color.HexStringToColor(skill.elementColor).color

      const bg = this.add.rectangle(cx, cy, CARD_W, CARD_H,
        isEquipped ? 0x162030 : isUnlocked ? 0x0c1520 : 0x080c12)
      bg.setStrokeStyle(1, isEquipped ? 0xd07830 : isUnlocked ? colorVal : 0x202830,
        isEquipped ? 1 : isUnlocked ? 0.6 : 0.3)
      this.contentLayer.add(bg)

      // 顶部元素色条
      this.contentLayer.add(this.add.rectangle(cx, cy - CARD_H / 2 + 2, CARD_W, 3,
        colorVal, isUnlocked ? 0.7 : 0.15))

      // 技能名
      this.contentLayer.add(this.make.text({
        x: cx, y: cy - 24,
        text: skill.name,
        style: {
          fontFamily: 'monospace', fontSize: '13px',
          color: isEquipped ? '#f0c060' : isUnlocked ? '#dce9ff' : '#384858',
        },
        add: false,
      }).setOrigin(0.5))

      // 元素/冷却/状态
      this.contentLayer.add(this.make.text({
        x: cx, y: cy - 10,
        text: `${skill.element}  CD:${(skill.cooldown / 1000).toFixed(1)}s  ${isUnlocked ? (isEquipped ? '✦已装备' : '已解锁') : `${skill.unlockCost}时砂`}`,
        style: { fontFamily: 'monospace', fontSize: '9px', color: isUnlocked ? skill.elementColor : '#384858' },
        add: false,
      }).setOrigin(0.5))

      // 技能描述（wordWrap 防溢出）
      this.contentLayer.add(this.make.text({
        x: cx, y: cy + 2,
        text: skill.description,
        style: {
          fontFamily: 'monospace', fontSize: '9px',
          color: isUnlocked ? '#8090a8' : '#2a3038',
          wordWrap: { width: CARD_W - 16 }, align: 'center',
        },
        add: false,
      }).setOrigin(0.5, 0))

      // 动作按钮（cy + 32，离卡片底部有余量）
      const btnY = cy + 32
      if (!isUnlocked && skill.unlockCost > 0) {
        const btnBg = this.add.rectangle(cx, btnY, CARD_W - 30, 20, 0x0a0e16)
        btnBg.setStrokeStyle(1, 0x305060, 0.5)
        this.contentLayer.add(btnBg)
        this.contentLayer.add(this.make.text({
          x: cx, y: btnY, text: `解锁 (${skill.unlockCost}时砂)`,
          style: { fontFamily: 'monospace', fontSize: '10px', color: '#5090b0' },
          add: false,
        }).setOrigin(0.5))
        btnBg.setInteractive({ useHandCursor: true })
        btnBg.on('pointerdown', () => {
          audioManager.playClick()
          const state = getRuntimeState()
          if (state.player.timeSand < skill.unlockCost) {
            this.tipText.setText(`时砂不足！需要 ${skill.unlockCost}，当前 ${state.player.timeSand}`)
            return
          }
          addTimeSand(-skill.unlockCost)
          unlockSkill(skill.id)
          this.tipText.setText(`✦ 已解锁 ${skill.name}`)
          audioManager.playPickup()
          this.buildWorkshop()
        })
      } else if (isUnlocked && !isEquipped) {
        const btnBg = this.add.rectangle(cx, btnY, CARD_W - 30, 20, 0x0a1016)
        btnBg.setStrokeStyle(1, colorVal, 0.4)
        this.contentLayer.add(btnBg)
        this.contentLayer.add(this.make.text({
          x: cx, y: btnY, text: '装备',
          style: { fontFamily: 'monospace', fontSize: '10px', color: skill.elementColor },
          add: false,
        }).setOrigin(0.5))
        btnBg.setInteractive({ useHandCursor: true })
        btnBg.on('pointerdown', () => {
          audioManager.playClick()
          const state = getRuntimeState()
          const equipped = [...state.player.skills]
          const emptyIdx = equipped.findIndex(s => !s)
          const targetIdx = emptyIdx >= 0 ? emptyIdx : 2
          equipped[targetIdx] = skill.id
          setEquippedSkills(equipped as SkillType[])
          this.tipText.setText(`✦ ${skill.name} 已装备到槽 ${targetIdx + 1}`)
          this.buildWorkshop()
        })
      } else if (isEquipped) {
        const btnBg = this.add.rectangle(cx, btnY, CARD_W - 30, 20, 0x1a1208)
        btnBg.setStrokeStyle(1, 0xd07030, 0.5)
        this.contentLayer.add(btnBg)
        this.contentLayer.add(this.make.text({
          x: cx, y: btnY, text: '卸下',
          style: { fontFamily: 'monospace', fontSize: '10px', color: '#c07030' },
          add: false,
        }).setOrigin(0.5))
        btnBg.setInteractive({ useHandCursor: true })
        btnBg.on('pointerdown', () => {
          audioManager.playClick()
          const state = getRuntimeState()
          const equipped = state.player.skills.filter(s => s !== skill.id) as SkillType[]
          setEquippedSkills(equipped)
          this.tipText.setText(`${skill.name} 已卸下`)
          this.buildWorkshop()
        })
      }

      bg.setInteractive()
      bg.on('pointerover', () => {
        if (isUnlocked) bg.setFillStyle(isEquipped ? 0x1e2a3c : 0x10182a, 1)
      })
      bg.on('pointerout', () => {
        bg.setFillStyle(isEquipped ? 0x162030 : isUnlocked ? 0x0c1520 : 0x080c12, 1)
      })
    })
  }

  // ─────────────────── TAB: 角色档案 ──────────────────
  private buildCharacter() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const cx = width / 2
    let y = 30

    const faction = rt.player.faction ? FACTION_DEFINITIONS[rt.player.faction] : null
    const fColor = faction?.color || '#7090b0'

    // 阵营卡
    this.contentLayer.add(this.add.rectangle(cx, y + 60, 500, 120, 0x0c1020))

    const fBorder = this.add.rectangle(cx, y + 60, 500, 120)
    fBorder.setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(fColor).color, 0.5)
    this.contentLayer.add(fBorder)

    this.contentLayer.add(this.make.text({
      x: cx, y: y + 10,
      text: faction ? `${faction.name}  ${faction.nameEn}` : '未选择阵营',
      style: { fontFamily: 'monospace', fontSize: '18px', color: fColor },
      add: false,
    }).setOrigin(0.5))

    if (faction) {
      this.contentLayer.add(this.make.text({
        x: cx, y: y + 34,
        text: `${faction.passiveName}：${faction.passiveDescription}`,
        style: {
          fontFamily: 'monospace', fontSize: '11px', color: '#8090a8',
          wordWrap: { width: 460 }, align: 'center',
        },
        add: false,
      }).setOrigin(0.5))

      this.contentLayer.add(this.make.text({
        x: cx, y: y + 56,
        text: `「${faction.philosophy}」`,
        style: {
          fontFamily: 'monospace', fontSize: '11px', color: fColor, fontStyle: 'italic',
          wordWrap: { width: 460 }, align: 'center',
        },
        add: false,
      }).setOrigin(0.5))
    }

    y += 150
    // 角色统计
    const stats = [
      [`等级`, `${rt.player.level}`],
      [`总深潜次数`, `${rt.player.totalDives}`],
      [`总击杀`, `${rt.player.totalKills}`],
      [`时砂`, `${rt.player.timeSand}`],
      [`HP`, `${rt.player.hp} / ${rt.player.maxHp}`],
      [`稳定度`, `${rt.player.stability} / ${rt.player.maxStability}`],
      [`回响水晶`, `${rt.player.crystalsFound?.length || 0} 枚`],
      [`收集残响`, `${rt.player.loreCollected?.length || 0} 条`],
    ]

    const COL = 2
    const ROW_H = 34
    const colW = 240
    stats.forEach(([k, v], idx) => {
      const col = idx % COL
      const row = Math.floor(idx / COL)
      const sx = cx + (col === 0 ? -colW / 2 - 8 : colW / 2 + 8)
      const sy = y + row * ROW_H

      this.contentLayer.add(this.make.text({
        x: sx - colW / 2 + 12, y: sy,
        text: k, style: { fontFamily: 'monospace', fontSize: '12px', color: '#506070' }, add: false,
      }).setOrigin(0))

      this.contentLayer.add(this.make.text({
        x: sx + colW / 2 - 12, y: sy,
        text: v, style: { fontFamily: 'monospace', fontSize: '12px', color: '#c8d8f0' }, add: false,
      }).setOrigin(1, 0))

      this.contentLayer.add(this.add.rectangle(
        sx, sy + 18, colW, 1, 0x304050, 0.4))
    })
  }

  // ─────────────────── TAB: 残响档案 ──────────────────
  private buildLore() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const cx = width / 2
    let y = 20

    if (!rt.player.loreCollected || rt.player.loreCollected.length === 0) {
      this.contentLayer.add(this.make.text({
        x: cx, y: 80,
        text: '尚无残响记录。在深潜中拾取发光碎片以收集。',
        style: { fontFamily: 'monospace', fontSize: '14px', color: '#304050' },
        add: false,
      }).setOrigin(0.5))
      return
    }

    for (const loreId of rt.player.loreCollected) {
      const entry = LORE_ENTRIES.find(e => e.id === loreId)
      if (!entry) continue

      // 条目背景
      const cardH = 80
      this.contentLayer.add(this.add.rectangle(cx, y + cardH / 2, 680, cardH, 0x0c1020))

      const border = this.add.rectangle(cx, y + cardH / 2, 680, cardH)
      border.setStrokeStyle(1, 0x304858, 0.5)
      this.contentLayer.add(border)

      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 10,
        text: entry.title,
        style: { fontFamily: 'monospace', fontSize: '13px', color: '#c8a96e' }, add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 28,
        text: `— ${entry.source}`,
        style: { fontFamily: 'monospace', fontSize: '10px', color: '#405060' }, add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 44,
        text: entry.content,
        style: { fontFamily: 'monospace', fontSize: '11px', color: '#8090a8', wordWrap: { width: 660 } },
        add: false,
      }))

      y += cardH + 10
    }
  }

  // ─────────────────── 辅助：创建按钮 ─────────────────
  private makeBtn(x: number, y: number, label: string, w: number, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, 38, 0x0c1426)
    bg.setStrokeStyle(1, 0x4080b0, 0.55)

    const txt = this.make.text({
      x, y, text: label,
      style: { fontFamily: 'monospace', fontSize: '13px', color: '#90b8d8' },
      add: false,
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => { bg.setFillStyle(0x14253a, 1); txt.setColor('#c8e0ff') })
    bg.on('pointerout', () => { bg.setFillStyle(0x0c1426, 1); txt.setColor('#90b8d8') })
    bg.on('pointerdown', () => { audioManager.playClick(); onClick() })

    const c = this.add.container(0, 0, [bg, txt])
    return c
  }
}

