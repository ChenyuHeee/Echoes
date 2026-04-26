import Phaser from 'phaser'
import { SANCTUARY_LINES, LORE_ENTRIES } from '../config/lore'
import {
  addTimeSand,
  getRuntimeState,
  setLastHarvestAt,
  unlockSkill,
  setEquippedSkills,
  upgradeAttribute,
  claimDailyQuest,
  setSelectedCharacter,
  UPGRADE_MAX_LEVEL,
  UPGRADE_COST_PER_LEVEL,
} from '../state/gameState'
import { audioManager } from '../systems/AudioManager'
import { SKILL_DEFINITIONS } from '../config/skills'
import { CHARACTER_DEFINITIONS, CHARACTER_LIST } from '../config/characters'
import type { CharacterId } from '../config/characters'
import { FACTION_DEFINITIONS } from '../config/factions'
import type { SkillType } from '../types/game.types'
import { ITEM_DEFINITIONS } from '../config/items'
import type { PlayerUpgrades } from '../state/gameState'

type TabId = 'overview' | 'workshop' | 'upgrade' | 'character' | 'lore'

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
      fontFamily: '"Silkscreen", monospace', fontSize: '22px', color: '#7ce0bc',
    }).setOrigin(0.5, 0).setDepth(6)
    const faction = FACTION_DEFINITIONS[rt.player.faction]
    this.add.text(width / 2, 40, `${faction?.name || ''}  ·  Lv.${rt.player.level}  ·  ${rt.player.username}`, {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: faction?.color || '#7090b0',
    }).setOrigin(0.5, 0).setDepth(6)

    // 标签页按钮
    const TABS: Array<{ id: TabId; label: string }> = [
      { id: 'overview', label: '概览' },
      { id: 'workshop', label: '技能工坊' },
      { id: 'upgrade', label: '属性强化' },
      { id: 'character', label: '选择角色' },
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
        fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#6080a0',
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
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#f0d48a',
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
      case 'upgrade': this.buildUpgrade(); break
      case 'character': this.buildCharacter(); break
      case 'lore': this.buildLore(); break
    }
  }

  // ─────────────────── TAB: 概览 ───────────────────────
  private buildOverview() {
    const { width, height } = this.scale
    const rt = getRuntimeState()
    const cw = 700
    const leftX = width / 2 - cw / 2

    let y = 12

    // ── NPC 对话（精简，只显示一条） ─────────────────────────
    const line = SANCTUARY_LINES[0]
    this.contentLayer.add(this.make.text({
      x: width / 2, y,
      text: `${line.speaker}：${line.text}`,
      style: {
        fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#7090a8',
        wordWrap: { width: cw }, align: 'center',
      },
      add: false,
    }).setOrigin(0.5, 0))
    y += 30

    // ── 等级 & 经验条 ─────────────────────────────────────
    const { level, exp } = rt.player
    const expNeeded = level * 150
    const expFrac = Math.min(1, exp / expNeeded)
    const BAR_W = cw
    const BAR_H = 18

    // 背景板
    const levelBg = this.add.rectangle(width / 2, y + 28, cw + 16, 66, 0x0a1020)
    levelBg.setStrokeStyle(1, 0x2a4060, 0.5)
    this.contentLayer.add(levelBg)

    this.contentLayer.add(this.make.text({
      x: leftX, y: y + 6,
      text: `Lv.${level}`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '20px', color: '#c8d8ff' },
      add: false,
    }))
    this.contentLayer.add(this.make.text({
      x: leftX + 70, y: y + 10,
      text: `${exp} / ${expNeeded} XP`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#6080a0' },
      add: false,
    }))
    // 经验条轨道
    this.contentLayer.add(this.add.rectangle(width / 2, y + 38, BAR_W, BAR_H, 0x0c1828))
    const xpFill = this.add.rectangle(leftX + BAR_W * expFrac / 2, y + 38, BAR_W * expFrac, BAR_H, 0x3060c0)
    this.contentLayer.add(xpFill)
    this.contentLayer.add(this.make.text({
      x: width / 2, y: y + 38,
      text: `${Math.round(expFrac * 100)}%`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#90b8e0' },
      add: false,
    }).setOrigin(0.5))
    y += 76

    // ── 每日任务 ──────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10)
    const dp = rt.player.dailyProgress
    const isToday = dp.date === today
    const QUESTS = [
      { key: 'kills' as const,      label: '今日击杀 20 敌人',    goal: 20,  progress: isToday ? dp.kills : 0,      rewarded: isToday && dp.killsRewarded,      reward: 20 },
      { key: 'dives' as const,      label: '今日深潜 2 次',        goal: 2,   progress: isToday ? dp.dives : 0,       rewarded: isToday && dp.divesRewarded,       reward: 25 },
      { key: 'extractions' as const, label: '今日成功撤离 1 次',   goal: 1,   progress: isToday ? dp.extractions : 0, rewarded: isToday && dp.extractionsRewarded, reward: 30 },
    ]

    this.contentLayer.add(this.make.text({
      x: leftX, y,
      text: '每日任务',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#c8a850' },
      add: false,
    }))
    y += 18

    QUESTS.forEach(q => {
      const done = q.progress >= q.goal
      const cardH = 40
      const bg = this.add.rectangle(width / 2, y + cardH / 2, cw, cardH, q.rewarded ? 0x0a1808 : 0x080e1a)
      bg.setStrokeStyle(1, q.rewarded ? 0x1a4020 : (done ? 0x405020 : 0x1a2838), 0.7)
      this.contentLayer.add(bg)

      // 任务名
      this.contentLayer.add(this.make.text({
        x: leftX + 10, y: y + 12,
        text: q.label,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: q.rewarded ? '#3a6030' : '#8090a8' },
        add: false,
      }))
      // 进度
      this.contentLayer.add(this.make.text({
        x: leftX + 10, y: y + 24,
        text: `${Math.min(q.progress, q.goal)} / ${q.goal}`,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: done ? '#a0c840' : '#405060' },
        add: false,
      }))

      // 奖励按钮 / 状态
      if (q.rewarded) {
        this.contentLayer.add(this.make.text({
          x: width / 2 + cw / 2 - 80, y: y + cardH / 2,
          text: '✦ 已领取',
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#3a6030' },
          add: false,
        }).setOrigin(0.5))
      } else if (done) {
        const claimBg = this.add.rectangle(width / 2 + cw / 2 - 80, y + cardH / 2, 120, 26, 0x1a3010)
        claimBg.setStrokeStyle(1, 0x60a030, 0.7)
        claimBg.setInteractive({ useHandCursor: true })
        this.contentLayer.add(claimBg)
        this.contentLayer.add(this.make.text({
          x: width / 2 + cw / 2 - 80, y: y + cardH / 2,
          text: `领取 +${q.reward}时砂`,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#90d040' },
          add: false,
        }).setOrigin(0.5))
        claimBg.on('pointerdown', () => {
          audioManager.playHarvest()
          const gained = claimDailyQuest(q.key)
          if (gained > 0) {
            this.tipText.setText(`✦ 任务完成 +${gained} 时砂！`)
            this.switchTab('overview')
          }
        })
        claimBg.on('pointerover', () => claimBg.setFillStyle(0x243a18, 1))
        claimBg.on('pointerout', () => claimBg.setFillStyle(0x1a3010, 1))
      } else {
        // 进度条
        const PW = 120
        this.contentLayer.add(this.add.rectangle(width / 2 + cw / 2 - 80, y + cardH / 2, PW, 8, 0x0c1828))
        const pFrac = q.goal > 0 ? q.progress / q.goal : 0
        if (pFrac > 0) {
          this.contentLayer.add(this.add.rectangle(
            width / 2 + cw / 2 - 80 - PW / 2 + PW * pFrac / 2, y + cardH / 2,
            PW * pFrac, 8, 0x205040))
        }
      }
      y += cardH + 6
    })

    y += 10

    // ── 温室收取 & 时砂 ─────────────────────────────────
    const harvestBg = this.add.rectangle(width / 2 - 180, y + 19, 220, 38, 0x080e1a)
    harvestBg.setStrokeStyle(1, 0x305060, 0.55)
    harvestBg.setInteractive({ useHandCursor: true })
    this.contentLayer.add(harvestBg)
    this.contentLayer.add(this.make.text({
      x: width / 2 - 180, y: y + 19,
      text: '收取温室时砂  +20',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#70a0c0' },
      add: false,
    }).setOrigin(0.5))
    harvestBg.on('pointerover', () => harvestBg.setFillStyle(0x0c1828, 1))
    harvestBg.on('pointerout', () => harvestBg.setFillStyle(0x080e1a, 1))
    harvestBg.on('pointerdown', () => {
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
      this.switchTab('overview')
    })

    // 时砂显示
    this.contentLayer.add(this.make.text({
      x: width / 2, y: y + 19,
      text: `⌛ ${rt.player.timeSand} 时砂`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: '#e8d080' },
      add: false,
    }).setOrigin(0.5))

    // 选择模式
    this.contentLayer.add(this.makeBtn(width / 2 + 180, y + 19, '▶ 选择游戏模式', 200, () => {
      audioManager.playClick()
      this.scene.start('ModeSelectScene')
    }))
    y += 54

    // 返回菜单
    this.contentLayer.add(this.makeBtn(width / 2, y + 10, '返回主菜单', 180, () => {
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
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#506070' },
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
          fontFamily: '"Silkscreen", monospace', fontSize: '13px',
          color: isEquipped ? '#f0c060' : isUnlocked ? '#dce9ff' : '#384858',
        },
        add: false,
      }).setOrigin(0.5))

      // 元素/冷却/状态
      this.contentLayer.add(this.make.text({
        x: cx, y: cy - 10,
        text: `${skill.element}  CD:${(skill.cooldown / 1000).toFixed(1)}s  ${isUnlocked ? (isEquipped ? '✦已装备' : '已解锁') : `${skill.unlockCost}时砂`}`,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: isUnlocked ? skill.elementColor : '#384858' },
        add: false,
      }).setOrigin(0.5))

      // 技能描述（wordWrap 防溢出）
      this.contentLayer.add(this.make.text({
        x: cx, y: cy + 2,
        text: skill.description,
        style: {
          fontFamily: '"Silkscreen", monospace', fontSize: '9px',
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
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#5090b0' },
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
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: skill.elementColor },
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
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#c07030' },
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

  // ─────────────────── TAB: 属性强化 ──────────────────
  private buildUpgrade() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const cx = width / 2
    let y = 8

    // 顶部说明
    this.contentLayer.add(this.make.text({
      x: cx, y,
      text: '消耗时砂强化基础属性，永久生效并作用于所有深潜',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#506070' },
      add: false,
    }).setOrigin(0.5, 0))
    y += 22

    const ATTRS: Array<{
      key: keyof PlayerUpgrades
      name: string
      desc: string
      perLevelText: (lv: number) => string
      color: string
    }> = [
      { key: 'maxHp',     name: '生命上限',  desc: '增加最大 HP',          perLevelText: lv => `+${lv * 15} HP（当前 +${rt.player.upgrades.maxHp * 15}）`,    color: '#d06060' },
      { key: 'stability', name: '稳定度上限', desc: '增加最大时间稳定度',   perLevelText: lv => `+${lv * 10} 稳（当前 +${rt.player.upgrades.stability * 10}）`,  color: '#60a0d0' },
      { key: 'damage',    name: '伤害加成',   desc: '提升所有技能/子弹伤害', perLevelText: lv => `+${lv * 5}%（当前 +${rt.player.upgrades.damage * 5}%）`,       color: '#d08030' },
      { key: 'speed',     name: '移动速度',   desc: '提升角色移动速度',      perLevelText: lv => `+${lv * 5}%（当前 +${rt.player.upgrades.speed * 5}%）`,        color: '#60c080' },
    ]

    const CARD_W = 640
    const CARD_H = 70
    const GAP = 10

    ATTRS.forEach(attr => {
      const curLv = rt.player.upgrades[attr.key]
      const maxed = curLv >= UPGRADE_MAX_LEVEL
      const cost = (curLv + 1) * UPGRADE_COST_PER_LEVEL
      const canAfford = !maxed && rt.player.timeSand >= cost
      const attrColor = Phaser.Display.Color.HexStringToColor(attr.color).color

      // 卡片背景
      const bg = this.add.rectangle(cx, y + CARD_H / 2, CARD_W, CARD_H, 0x080e1a)
      bg.setStrokeStyle(1, maxed ? 0x302808 : 0x1a2838, 0.8)
      this.contentLayer.add(bg)

      // 左色条
      this.contentLayer.add(this.add.rectangle(cx - CARD_W / 2 + 3, y + CARD_H / 2, 4, CARD_H - 4, attrColor, maxed ? 0.4 : 0.8))

      // 名称
      this.contentLayer.add(this.make.text({
        x: cx - CARD_W / 2 + 16, y: y + 8,
        text: attr.name,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '15px', color: maxed ? '#706040' : attr.color },
        add: false,
      }))
      // 描述
      this.contentLayer.add(this.make.text({
        x: cx - CARD_W / 2 + 16, y: y + 28,
        text: attr.desc + '  ' + attr.perLevelText(UPGRADE_MAX_LEVEL),
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#405060' },
        add: false,
      }))

      // 等级进度格（8格）
      for (let i = 0; i < UPGRADE_MAX_LEVEL; i++) {
        const filled = i < curLv
        const bx = cx - CARD_W / 2 + 16 + i * 28
        const by = y + CARD_H - 14
        this.contentLayer.add(this.add.rectangle(bx, by, 24, 10, filled ? attrColor : 0x0c1828, filled ? 0.8 : 1)
          .setStrokeStyle(1, filled ? attrColor : 0x1a2838, filled ? 0.3 : 0.6))
      }

      // 升级按钮 / 状态
      const btnX = cx + CARD_W / 2 - 80
      const btnY = y + CARD_H / 2
      if (maxed) {
        this.contentLayer.add(this.make.text({
          x: btnX, y: btnY,
          text: '★ MAX',
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#806030' },
          add: false,
        }).setOrigin(0.5))
      } else {
        const btnBg = this.add.rectangle(btnX, btnY, 140, 36, canAfford ? 0x0c1828 : 0x080a10)
        btnBg.setStrokeStyle(1, canAfford ? attrColor : 0x1a2030, canAfford ? 0.7 : 0.3)
        this.contentLayer.add(btnBg)
        this.contentLayer.add(this.make.text({
          x: btnX, y: btnY - 8,
          text: `Lv.${curLv} → Lv.${curLv + 1}`,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: canAfford ? attr.color : '#2a3840' },
          add: false,
        }).setOrigin(0.5))
        this.contentLayer.add(this.make.text({
          x: btnX, y: btnY + 6,
          text: `${cost} 时砂`,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: canAfford ? '#e8d060' : '#2a3038' },
          add: false,
        }).setOrigin(0.5))
        if (canAfford) {
          btnBg.setInteractive({ useHandCursor: true })
          btnBg.on('pointerover', () => btnBg.setFillStyle(0x142030, 1))
          btnBg.on('pointerout', () => btnBg.setFillStyle(0x0c1828, 1))
          btnBg.on('pointerdown', () => {
            audioManager.playPickup()
            const success = upgradeAttribute(attr.key)
            if (success) {
              this.tipText.setText(`✦ ${attr.name} 强化至 Lv.${getRuntimeState().player.upgrades[attr.key]}`)
              this.buildUpgrade()
            } else {
              this.tipText.setText('时砂不足！')
            }
          })
        } else if (!maxed) {
          this.contentLayer.add(this.make.text({
            x: btnX, y: btnY + 20,
            text: `差 ${cost - rt.player.timeSand} 时砂`,
            style: { fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#3a4858' },
            add: false,
          }).setOrigin(0.5))
        }
      }

      y += CARD_H + GAP
    })

    // 当前时砂
    this.contentLayer.add(this.make.text({
      x: cx, y: y + 8,
      text: `当前时砂：${rt.player.timeSand}`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#e8d080' },
      add: false,
    }).setOrigin(0.5))

    // 快捷提示：选择角色
    const charDef = CHARACTER_DEFINITIONS[rt.player.selectedCharacter ?? 'echo_ranger']
    this.contentLayer.add(this.make.text({
      x: cx, y: y + 34,
      text: `当前角色：${charDef?.name ?? '时间游侠'}  [${charDef?.role ?? '均衡'}]  — 点击上方「选择角色」可更换`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#4a7090' },
      add: false,
    }).setOrigin(0.5))

    // ── 已带回装备（持久化物品） ──────────────────────────
    const savedIds = rt.player.persistentItems ?? []
    if (savedIds.length > 0) {
      y += 60
      this.contentLayer.add(this.make.text({
        x: cx - CARD_W / 2, y,
        text: '✦ 携带装备（上次撤离带回，下次深潜生效）',
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#7ce0bc' },
        add: false,
      }))
      y += 18
      const rowH = 36
      savedIds.forEach((id, idx) => {
        const item = (ITEM_DEFINITIONS as Record<string, import('../config/items').ItemDef | undefined>)[id]
        if (!item) return
        const itemBg = this.add.rectangle(cx, y + rowH / 2, CARD_W, rowH, 0x080f1e)
        itemBg.setStrokeStyle(1, 0x2a4060, 0.6)
        this.contentLayer.add(itemBg)
        this.contentLayer.add(this.make.text({
          x: cx - CARD_W / 2 + 10, y: y + 8,
          text: `[${idx + 1}] ${item.name}`,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#c0c8e8' },
          add: false,
        }))
        this.contentLayer.add(this.make.text({
          x: cx - CARD_W / 2 + 10, y: y + 22,
          text: item.desc,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#4a6080' },
          add: false,
        }))
        y += rowH + 4
      })
    }
  }

  // ─────────────────── TAB: 角色档案 ──────────────────
  private buildCharacter() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const unlocked: CharacterId[] = rt.player.unlockedCharacters ?? ['echo_ranger']
    let selected: CharacterId = rt.player.selectedCharacter ?? 'echo_ranger'

    // 布局常量（相对于 contentLayer 本地坐标，contentLayer 位于屏幕 y=108）
    const LIST_LEFT = 20      // 左侧列表区起始 x
    const CARD_W = 190
    const CARD_H = 52
    const DETAIL_X = 240      // 右侧详情区起始 x
    const DETAIL_W = width - DETAIL_X - 20

    // ── 标题 ────────────────────────────────────────────
    this.contentLayer.add(
      this.make.text({ x: width / 2, y: 8,
        text: '选择角色', add: false,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: '#5090b0' },
      }).setOrigin(0.5)
    )

    // 分割线
    this.contentLayer.add(this.add.rectangle(width / 2, 26, width - 20, 1, 0x304050, 0.4))

    // ── 追踪所有可重建对象 ─────────────────────────────
    const allObjs: Phaser.GameObjects.GameObject[] = []

    const clearAll = () => {
      allObjs.forEach(o => { if ((o as Phaser.GameObjects.GameObject).active !== false) o.destroy() })
      allObjs.length = 0
    }

    const addTo = (go: Phaser.GameObjects.GameObject) => {
      this.contentLayer.add(go)
      allObjs.push(go)
      return go
    }

    const makeText = (x: number, y: number, text: string, style: object, originX = 0, originY = 0) => {
      const t = this.make.text({ x, y, text, style, add: false } as Phaser.Types.GameObjects.Text.TextConfig)
        .setOrigin(originX, originY)
      return addTo(t) as Phaser.GameObjects.Text
    }

    const makeRect = (x: number, y: number, w: number, h: number, fill: number, alpha = 1) => {
      const r = this.add.rectangle(x, y, w, h, fill, alpha)
      return addTo(r) as Phaser.GameObjects.Rectangle
    }

    // ── 绘制右侧详情 ─────────────────────────────────────
    const drawDetail = (id: CharacterId) => {
      // 只清除右侧详情区对象（通过 tag 区分）
      // 实际做法：重建全部，因为 clearAll + rebuildList + rebuildDetail
    }

    const rebuild = () => {
      clearAll()

      // ── 左侧角色卡片列表 ─────────────────────────────
      let ly = 34
      for (const def of CHARACTER_LIST) {
        const id = def.id
        const isUnlocked = unlocked.includes(id)
        const isSel = selected === id

        // 卡片背景
        const cardBg = this.add.rectangle(LIST_LEFT + CARD_W / 2, ly + CARD_H / 2, CARD_W, CARD_H,
          isSel ? 0x143050 : 0x0c1820)
        cardBg.setStrokeStyle(1, isSel ? 0x5090d0 : 0x203040, 1)
        addTo(cardBg)

        // 角色头像
        const portrait = this.add.image(LIST_LEFT + 24, ly + CARD_H / 2, `char_${id}`)
          .setDisplaySize(36, 36).setAlpha(isUnlocked ? 1 : 0.25)
        addTo(portrait)

        // 角色名
        makeText(LIST_LEFT + 48, ly + 8, def.name,
          { fontFamily: '"Silkscreen", monospace', fontSize: '12px',
            color: isUnlocked ? (isSel ? '#c8e8ff' : '#a0b8c8') : '#384858' })

        // 定位标签
        makeText(LIST_LEFT + 48, ly + 26, isUnlocked ? `[${def.role}]` : `🔒 ${def.role}`,
          { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: isSel ? '#6090d0' : '#4a6070' })

        // 当前选中徽标
        if (isSel) {
          makeText(LIST_LEFT + CARD_W - 10, ly + CARD_H / 2 - 7, '◀',
            { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#5090d0' }, 1, 0)
        }

        // 点击切换
        cardBg.setInteractive({ useHandCursor: true })
        const capturedId = id
        cardBg.on('pointerdown', () => {
          audioManager.playClick()
          selected = capturedId
          rebuild()
        })

        ly += CARD_H + 6
      }

      // 分隔竖线
      makeRect(DETAIL_X - 8, 34 + (CARD_H + 6) * 5 / 2, 1, (CARD_H + 6) * 5, 0x304050, 0.5)

      // ── 右侧详情区 ───────────────────────────────────
      const def = CHARACTER_DEFINITIONS[selected]
      if (!def) return
      const isUnlocked = unlocked.includes(selected)

      let dy = 34

      // 角色大头像
      const bigPortrait = this.add.image(DETAIL_X + 36, dy + 36, `char_${selected}`)
        .setDisplaySize(72, 72).setAlpha(isUnlocked ? 1 : 0.3)
      addTo(bigPortrait)

      // 名字
      makeText(DETAIL_X + 82, dy + 6, def.name,
        { fontFamily: '"Silkscreen", monospace', fontSize: '17px',
          color: isUnlocked ? '#e8d8a0' : '#405060' })

      // 定位标签
      makeText(DETAIL_X + 82, dy + 28, `[${def.role}]  ${def.nameEn}`,
        { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#6090b0' })

      // lore 一句话
      makeText(DETAIL_X + 82, dy + 44, def.lore,
        { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#506070',
          wordWrap: { width: DETAIL_W - 90 } })

      // 未解锁提示
      if (!isUnlocked && def.unlockRequirement) {
        makeText(DETAIL_X + 82, dy + 60, `🔒 ${def.unlockRequirement}`,
          { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#806050',
            wordWrap: { width: DETAIL_W - 90 } })
      }

      dy += 86

      // 属性条
      const ATTRS: Array<[string, number, string]> = [
        ['HP',   Math.min(100, def.baseHp / 1.8 * 100), `${def.baseHp}`],
        ['速度', Math.min(100, (def.baseSpeed - 0.75) / 0.65 * 100), `×${def.baseSpeed.toFixed(2)}`],
        ['伤害', Math.min(100, (def.baseDamage - 0.75) / 0.65 * 100), `×${def.baseDamage.toFixed(2)}`],
      ]
      const BAR_W = Math.min(200, DETAIL_W - 80)
      for (const [label, pct, val] of ATTRS) {
        makeText(DETAIL_X, dy, label,
          { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#607080' })
        makeRect(DETAIL_X + 44 + BAR_W / 2, dy + 6, BAR_W, 8, 0x1a2a30)
        const fillW = Math.max(4, Math.round(pct / 100 * BAR_W))
        makeRect(DETAIL_X + 44 + fillW / 2, dy + 6, fillW, 8, isUnlocked ? 0x3a8aaa : 0x3a4a50)
        makeText(DETAIL_X + 44 + BAR_W + 6, dy, val,
          { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#a0c0d0' })
        dy += 20
      }

      // 初始武器
      makeText(DETAIL_X, dy + 4, `初始武器：${def.startWeapon.replace(/_/g, ' ')}`,
        { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#90a868' })
      dy += 24

      // 分隔线
      makeRect(DETAIL_X + DETAIL_W / 2, dy, DETAIL_W, 1, 0x304050, 0.4)
      dy += 10

      // 被动
      makeText(DETAIL_X, dy, `被动  ${def.passiveName}`,
        { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#c8a060' })
      dy += 16
      makeText(DETAIL_X, dy, def.passiveDesc,
        { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#708090',
          wordWrap: { width: DETAIL_W } })
      dy += 28

      // Q 技能
      const sk = def.uniqueSkill
      makeText(DETAIL_X, dy, `Q  ${sk.name}   CD ${sk.cooldownMs / 1000}s`,
        { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#80c0e0' })
      dy += 16
      makeText(DETAIL_X, dy, sk.desc,
        { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#708090',
          wordWrap: { width: DETAIL_W } })
      dy += 32

      // 选择按钮
      if (isUnlocked) {
        const isCurrent = selected === rt.player.selectedCharacter
        const btnX = DETAIL_X + 100
        const btnBg = this.add.rectangle(btnX, dy, 200, 32,
          isCurrent ? 0x1a4060 : 0x0c1a2a)
        btnBg.setStrokeStyle(1, isCurrent ? 0x60c0ff : 0x305070, 1)
        addTo(btnBg)

        const btnTxt = this.make.text({
          x: btnX, y: dy,
          text: isCurrent ? '✓ 当前角色' : '选择此角色',
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px',
            color: isCurrent ? '#80e0ff' : '#a0c8e8' },
          add: false,
        }).setOrigin(0.5)
        addTo(btnTxt)

        if (!isCurrent) {
          btnBg.setInteractive({ useHandCursor: true })
          btnBg.on('pointerover',  () => { btnBg.setFillStyle(0x1a2a40); (btnTxt as Phaser.GameObjects.Text).setColor('#c8e8ff') })
          btnBg.on('pointerout',   () => { btnBg.setFillStyle(0x0c1a2a); (btnTxt as Phaser.GameObjects.Text).setColor('#a0c8e8') })
          btnBg.on('pointerdown',  () => {
            audioManager.playClick()
            setSelectedCharacter(selected)
            rebuild()
          })
        }
      } else if (def.unlockRequirement) {
        makeText(DETAIL_X + 100, dy, `🔒 ${def.unlockRequirement}`,
          { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#806050',
            wordWrap: { width: DETAIL_W } }, 0.5, 0)
      }
    }

    rebuild()
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
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: '#304050' },
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
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#c8a96e' }, add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 28,
        text: `— ${entry.source}`,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#405060' }, add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 44,
        text: entry.content,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#8090a8', wordWrap: { width: 660 } },
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
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#90b8d8' },
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

