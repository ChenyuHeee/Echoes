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
  discardFromStash,
  sellFromStash,
  addToStash,
  spendItemFragments,
  UPGRADE_MAX_LEVEL,
  UPGRADE_COST_PER_LEVEL,
  tickLoginStreak,
  canClaimDailyLogin,
  claimDailyLogin,
  checkAndClaimAchievements,
  ACHIEVEMENTS,
} from '../state/gameState'
import { audioManager } from '../systems/AudioManager'
import { SKILL_DEFINITIONS } from '../config/skills'
import { CHARACTER_DEFINITIONS, CHARACTER_LIST } from '../config/characters'
import type { CharacterId } from '../config/characters'
import { FACTION_DEFINITIONS } from '../config/factions'
import type { SkillType } from '../types/game.types'
import {
  ITEM_DEFINITIONS, WEAPON_DEFINITIONS, ATTACHMENT_DEFINITIONS, ATTACHMENT_SLOTS,
  RARITY_COLORS, RARITY_NAMES,
  type ItemRarity,
} from '../config/items'
import type { PlayerUpgrades } from '../state/gameState'

type TabId = 'overview' | 'workshop' | 'upgrade' | 'character' | 'lore' | 'stash' | 'forge' | 'achieve'

// 碎片兑换价格（需与 GachaScene FRAG_COST 一致）
const FRAG_COST: Record<ItemRarity, number> = {
  common: 5, uncommon: 10, rare: 15, legendary: 25,
}

export class SanctuaryScene extends Phaser.Scene {
  private tipText!: Phaser.GameObjects.Text
  private contentLayer!: Phaser.GameObjects.Container
  private activeTab: TabId = 'overview'
  private tabBtns: Map<TabId, { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text }> = new Map()
  private contentBaseY = 108
  private scrollOffset = 0
  private scrollMax = 0

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
      fontFamily: '"Noto Sans SC", monospace', fontSize: '22px', color: '#7ce0bc',
    }).setOrigin(0.5, 0).setDepth(6)
    const faction = FACTION_DEFINITIONS[rt.player.faction]
    this.add.text(width / 2, 40, `${faction?.name || ''}  ·  Lv.${rt.player.level}  ·  ${rt.player.username}`, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: faction?.color || '#7090b0',
    }).setOrigin(0.5, 0).setDepth(6)

    // 标签页按钮
    const TABS: Array<{ id: TabId; label: string }> = [
      { id: 'overview', label: '概览' },
      { id: 'workshop', label: '技能工坊' },
      { id: 'upgrade', label: '属性强化' },
      { id: 'stash', label: '仓库' },
      { id: 'achieve', label: '成就' },
      { id: 'character', label: '选择角色' },
      { id: 'lore', label: '残响档案' },
    ]
    const tabW = 116
    const tabStartX = width / 2 - (tabW * TABS.length) / 2 + tabW / 2
    TABS.forEach((tab, i) => {
      const tx = tabStartX + i * tabW
      const bg = this.add.rectangle(tx, 82, tabW - 6, 32, 0x0c1020, 1)
        .setDepth(6)
      bg.setStrokeStyle(1, 0x304050, 0.6)
      const txt = this.add.text(tx, 82, tab.label, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#6080a0',
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
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#f0d48a',
    }).setOrigin(0.5, 1).setDepth(8)

    this.switchTab('overview')

    // 鼠标滚轮：仅在内容超出可见区时（如仓库/成就页）允许上下滚动
    this.input.on('wheel', (_p: unknown, _go: unknown, _dx: number, dy: number) => {
      if (this.scrollMax <= 0) return
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + dy * 0.5, 0, this.scrollMax)
      if (this.contentLayer) this.contentLayer.y = this.contentBaseY - this.scrollOffset
    })
  }

  // ─────────────────────────────────────────────────────
  private switchTab(tab: TabId) {
    this.activeTab = tab
    this.contentLayer.removeAll(true)
    this.tipText.setText('')
    // 重置滚动状态
    this.scrollOffset = 0
    this.scrollMax = 0
    this.contentLayer.y = this.contentBaseY

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
      case 'stash': this.buildStash(); break
      case 'forge': this.buildForge(); break
      case 'achieve': this.buildAchievements(); break
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
        fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#7090a8',
        wordWrap: { width: cw }, align: 'center',
      },
      add: false,
    }).setOrigin(0.5, 0))
    y += 30

    // ── 连续登录奖励卡片 ──────────────────────────────────
    tickLoginStreak()  // 自动刷新连胜
    const streak = rt.player.loginStreak
    const canClaim = canClaimDailyLogin()
    const STREAK_H = 50
    const streakBg = this.add.rectangle(width / 2, y + STREAK_H / 2, cw, STREAK_H, canClaim ? 0x1a1408 : 0x0a1018)
    streakBg.setStrokeStyle(1, canClaim ? 0xc8a850 : 0x304050, canClaim ? 0.9 : 0.4)
    this.contentLayer.add(streakBg)
    this.contentLayer.add(this.make.text({
      x: leftX + 14, y: y + 8,
      text: `✦ 连续登录 ${streak} 天`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: canClaim ? '#f0d480' : '#506880' },
      add: false,
    }))
    const nextMilestone = streak < 3 ? 3 : streak < 7 ? 7 : streak < 15 ? 15 : streak < 30 ? 30 : null
    const milestoneTxt = nextMilestone ? `下一里程碑：${nextMilestone} 天 → 加成 ${(nextMilestone === 3 ? '×1.2' : nextMilestone === 7 ? '×1.5' : nextMilestone === 15 ? '×2.0' : '×2.5')}` : '已达最高加成 ×2.5'
    this.contentLayer.add(this.make.text({
      x: leftX + 14, y: y + 28,
      text: milestoneTxt,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#506880' },
      add: false,
    }))
    if (canClaim) {
      const claimBg = this.add.rectangle(width / 2 + cw / 2 - 80, y + STREAK_H / 2, 130, 30, 0x2a2010)
      claimBg.setStrokeStyle(1, 0xc8a850, 0.85)
      claimBg.setInteractive({ useHandCursor: true })
      this.contentLayer.add(claimBg)
      this.contentLayer.add(this.make.text({
        x: width / 2 + cw / 2 - 80, y: y + STREAK_H / 2,
        text: '领取今日登录奖励',
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#f0d480' },
        add: false,
      }).setOrigin(0.5))
      claimBg.on('pointerdown', () => {
        audioManager.playHarvest()
        const reward = claimDailyLogin()
        this.tipText.setText(`✦ 登录奖励 +${reward} 时砂　（连续 ${getRuntimeState().player.loginStreak} 天）`)
        // 同时检查成就解锁
        const newAch = checkAndClaimAchievements()
        if (newAch.length > 0) {
          this.tipText.setText(`✦ 登录奖励 +${reward} 时砂　·　解锁 ${newAch.length} 项成就！`)
        }
        this.switchTab('overview')
      })
      claimBg.on('pointerover', () => claimBg.setFillStyle(0x3a2c14, 1))
      claimBg.on('pointerout', () => claimBg.setFillStyle(0x2a2010, 1))
    } else {
      this.contentLayer.add(this.make.text({
        x: width / 2 + cw / 2 - 80, y: y + STREAK_H / 2,
        text: '✦ 今日已领取',
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#3a6030' },
        add: false,
      }).setOrigin(0.5))
    }
    y += STREAK_H + 14

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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '20px', color: '#c8d8ff' },
      add: false,
    }))
    this.contentLayer.add(this.make.text({
      x: leftX + 70, y: y + 10,
      text: `${exp} / ${expNeeded} XP`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#6080a0' },
      add: false,
    }))
    // 经验条轨道
    this.contentLayer.add(this.add.rectangle(width / 2, y + 38, BAR_W, BAR_H, 0x0c1828))
    const xpFill = this.add.rectangle(leftX + BAR_W * expFrac / 2, y + 38, BAR_W * expFrac, BAR_H, 0x3060c0)
    this.contentLayer.add(xpFill)
    this.contentLayer.add(this.make.text({
      x: width / 2, y: y + 38,
      text: `${Math.round(expFrac * 100)}%`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#90b8e0' },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#c8a850' },
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
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: q.rewarded ? '#3a6030' : '#8090a8' },
        add: false,
      }))
      // 进度
      this.contentLayer.add(this.make.text({
        x: leftX + 10, y: y + 24,
        text: `${Math.min(q.progress, q.goal)} / ${q.goal}`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: done ? '#a0c840' : '#405060' },
        add: false,
      }))

      // 奖励按钮 / 状态
      if (q.rewarded) {
        this.contentLayer.add(this.make.text({
          x: width / 2 + cw / 2 - 80, y: y + cardH / 2,
          text: '✦ 已领取',
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#3a6030' },
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
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#90d040' },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#70a0c0' },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#e8d080' },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#506070' },
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
          fontFamily: '"Noto Sans SC", monospace', fontSize: '13px',
          color: isEquipped ? '#f0c060' : isUnlocked ? '#dce9ff' : '#384858',
        },
        add: false,
      }).setOrigin(0.5))

      // 元素/冷却/状态
      this.contentLayer.add(this.make.text({
        x: cx, y: cy - 10,
        text: `${skill.element}  CD:${(skill.cooldown / 1000).toFixed(1)}s  ${isUnlocked ? (isEquipped ? '✦已装备' : '已解锁') : `${skill.unlockCost}时砂`}`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: isUnlocked ? skill.elementColor : '#384858' },
        add: false,
      }).setOrigin(0.5))

      // 技能描述（wordWrap 防溢出）
      this.contentLayer.add(this.make.text({
        x: cx, y: cy + 2,
        text: skill.description,
        style: {
          fontFamily: '"Noto Sans SC", monospace', fontSize: '9px',
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
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#5090b0' },
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
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: skill.elementColor },
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
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#c07030' },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#506070' },
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
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: maxed ? '#706040' : attr.color },
        add: false,
      }))
      // 描述
      this.contentLayer.add(this.make.text({
        x: cx - CARD_W / 2 + 16, y: y + 28,
        text: attr.desc + '  ' + attr.perLevelText(UPGRADE_MAX_LEVEL),
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#405060' },
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
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#806030' },
          add: false,
        }).setOrigin(0.5))
      } else {
        const btnBg = this.add.rectangle(btnX, btnY, 140, 36, canAfford ? 0x0c1828 : 0x080a10)
        btnBg.setStrokeStyle(1, canAfford ? attrColor : 0x1a2030, canAfford ? 0.7 : 0.3)
        this.contentLayer.add(btnBg)
        this.contentLayer.add(this.make.text({
          x: btnX, y: btnY - 8,
          text: `Lv.${curLv} → Lv.${curLv + 1}`,
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: canAfford ? attr.color : '#2a3840' },
          add: false,
        }).setOrigin(0.5))
        this.contentLayer.add(this.make.text({
          x: btnX, y: btnY + 6,
          text: `${cost} 时砂`,
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: canAfford ? '#e8d060' : '#2a3038' },
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
            style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#3a4858' },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#e8d080' },
      add: false,
    }).setOrigin(0.5))

    // 快捷提示：选择角色
    const charDef = CHARACTER_DEFINITIONS[rt.player.selectedCharacter ?? 'echo_ranger']
    this.contentLayer.add(this.make.text({
      x: cx, y: y + 34,
      text: `当前角色：${charDef?.name ?? '时间游侠'}  [${charDef?.role ?? '均衡'}]  — 点击「仓库」查看携带装备`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#4a7090' },
      add: false,
    }).setOrigin(0.5))
  }

  // ─────────────────── TAB: 仓库 ──────────────────────
  private buildStash() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const stash = rt.player.stash ?? { weaponIds: [], attachmentIds: [], itemIds: [] }
    const W = 700, leftX = width / 2 - W / 2
    let y = 8

    this.contentLayer.add(this.make.text({
      x: width / 2, y,
      text: '仓库  ─  无限容量，撤离后自动追加，战前准备时选取携带',
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#506070' },
      add: false,
    }).setOrigin(0.5, 0))
    y += 24

    // 所有配件 def 列表
    const attDefs = stash.attachmentIds
      .map(id => (ATTACHMENT_DEFINITIONS as Record<string, import('../config/items').AttachmentDef | undefined>)[id])
      .filter(Boolean) as import('../config/items').AttachmentDef[]
    const itemDefs = stash.itemIds
      .map(id => (ITEM_DEFINITIONS as Record<string, import('../config/items').ItemDef | undefined>)[id])
      .filter(Boolean) as import('../config/items').ItemDef[]
    const weapDefs = stash.weaponIds
      .map(id => (WEAPON_DEFINITIONS as Record<string, import('../config/items').WeaponDef | undefined>)[id])
      .filter(Boolean) as import('../config/items').WeaponDef[]

    // 计算总价值
    const totalValue = weapDefs.reduce((s, w) => s + w.sandValue, 0)
      + attDefs.reduce((s, a) => s + a.sandValue, 0)
      + itemDefs.reduce((s, i) => s + i.sandValue, 0)

    this.contentLayer.add(this.make.text({
      x: leftX, y,
      text: `总估值：${totalValue} 碎片  |  武器 ${weapDefs.length}  配件 ${attDefs.length}  物品 ${itemDefs.length}  ·  当前碎片 ${rt.player.echoShards ?? 0}◆  时砂 ${rt.player.timeSand}⌛`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#e8d060' },
      add: false,
    }))
    y += 22

    // 一键出售全部按钮
    if (totalValue > 0) {
      const sellAllBg = this.add.rectangle(leftX + W - 60, y - 8, 110, 22, 0x1a2810).setStrokeStyle(1, 0x60a040, 0.8).setInteractive({ useHandCursor: true })
      const sellAllTxt = this.make.text({
        x: leftX + W - 60, y: y - 8,
        text: `[ 一键出售全部 +${totalValue} ]`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#80c060' },
        add: false,
      }).setOrigin(0.5)
      this.contentLayer.add(sellAllBg)
      this.contentLayer.add(sellAllTxt)
      sellAllBg.on('pointerdown', () => {
        weapDefs.forEach(w => sellFromStash('weapon', w.id, w.sandValue))
        attDefs.forEach(a => sellFromStash('attachment', a.id, a.sandValue))
        itemDefs.forEach(i => sellFromStash('item', i.id, i.sandValue))
        audioManager.playClick()
        this.tipText.setText(`出售完成，+${totalValue} 回响碎片`)
        this.buildStash()
      })
    }

    const addRow = (
      label: string, sub: string, color: number,
      onSell: () => void, onDiscard: () => void,
    ) => {
      const colorHex = `#${color.toString(16).padStart(6, '0')}`
      const bg = this.add.rectangle(width / 2, y + 22, W, 44, 0x0a1828)
      bg.setStrokeStyle(1, color, 0.7)
      this.contentLayer.add(bg)
      this.contentLayer.add(this.make.text({
        x: leftX + 8, y: y + 6,
        text: label,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: colorHex },
        add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: leftX + 8, y: y + 24,
        text: sub,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#5080a0' },
        add: false,
      }))
      // 出售按钮
      const sellBtn = this.add.rectangle(leftX + W - 100, y + 22, 60, 28, 0x10241a)
      sellBtn.setStrokeStyle(1, 0x60a040, 0.7).setInteractive({ useHandCursor: true })
      sellBtn.on('pointerdown', onSell)
      this.contentLayer.add(sellBtn)
      this.contentLayer.add(this.make.text({
        x: leftX + W - 100, y: y + 22,
        text: '出售', style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#80c060' },
        add: false,
      }).setOrigin(0.5))
      // 丢弃按钮
      const btn = this.add.rectangle(leftX + W - 36, y + 22, 60, 28, 0x180808)
      btn.setStrokeStyle(1, 0x603030, 0.7).setInteractive({ useHandCursor: true })
      btn.on('pointerdown', onDiscard)
      this.contentLayer.add(btn)
      this.contentLayer.add(this.make.text({
        x: leftX + W - 36, y: y + 22,
        text: '丢弃', style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#804040' },
        add: false,
      }).setOrigin(0.5))
      y += 50
    }

    const addEmpty = (msg: string) => {
      this.contentLayer.add(this.make.text({
        x: leftX + 8, y: y + 4,
        text: msg,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#2a3848' },
        add: false,
      }))
      y += 24
    }

    const sectionTitle = (txt: string) => {
      this.contentLayer.add(this.make.text({
        x: leftX, y,
        text: txt,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#446688' },
        add: false,
      }))
      y += 18
    }

    // ── 武器 ─────────────────────────────────────────────
    sectionTitle(`── 武器  (${weapDefs.length}) ──`)
    if (weapDefs.length === 0) {
      addEmpty('（空  —  深潜撤离后自动存入）')
    } else {
      weapDefs.forEach(wd => {
        const wRef = wd
        addRow(
          `[${RARITY_NAMES[wd.rarity]}] ${wd.name}  —  ${wd.desc}`,
          `伤害 ${wd.baseDamage}${wd.pellets ? ` ×${wd.pellets}弹` : ''}  射速 ${wd.fireRateMs}ms  暴击 ${Math.round(wd.baseCritChance * 100)}%  估值 ${wd.sandValue}◆`,
          RARITY_COLORS[wd.rarity],
          () => { sellFromStash('weapon', wRef.id, wRef.sandValue); audioManager.playClick(); this.buildStash(); this.tipText.setText(`出售：${wRef.name}  +${wRef.sandValue}碎片`) },
          () => { discardFromStash('weapon', wRef.id); audioManager.playClick(); this.buildStash(); this.tipText.setText(`已丢弃：${wRef.name}`) },
        )
      })
    }
    y += 4

    // ── 配件 ─────────────────────────────────────────────
    const slotNames: Record<string, string> = { barrel: '枪管', scope: '瞄准镜', magazine: '弹匣', stock: '枪托', underbarrel: '下挂', enhancement: '强化核' }
    sectionTitle(`── 配件  (${attDefs.length}) ──`)
    if (attDefs.length === 0) {
      addEmpty('（空  —  深潜结束后自动存入配件）')
    } else {
      attDefs.forEach(att => {
        const aRef = att
        addRow(
          `[${slotNames[att.slotType]}] [${RARITY_NAMES[att.rarity]}] ${att.name}  —  ${att.desc}`,
          `估值 ${att.sandValue}◆`,
          RARITY_COLORS[att.rarity],
          () => { sellFromStash('attachment', aRef.id, aRef.sandValue); audioManager.playClick(); this.buildStash(); this.tipText.setText(`出售：${aRef.name}  +${aRef.sandValue}碎片`) },
          () => { discardFromStash('attachment', aRef.id); audioManager.playClick(); this.buildStash(); this.tipText.setText(`已丢弃：${aRef.name}`) },
        )
      })
    }
    y += 4

    // ── 物品 ─────────────────────────────────────────────
    sectionTitle(`── 物品  (${itemDefs.length}) ──`)
    if (itemDefs.length === 0) {
      addEmpty('（空  —  深潜中拾取并成功撤离后存入）')
    } else {
      itemDefs.forEach(item => {
        const iRef = item
        addRow(
          `[${RARITY_NAMES[item.rarity]}] ${item.name}  —  ${item.desc}`,
          `估值 ${item.sandValue}◆`,
          RARITY_COLORS[item.rarity],
          () => { sellFromStash('item', iRef.id, iRef.sandValue); audioManager.playClick(); this.buildStash(); this.tipText.setText(`出售：${iRef.name}  +${iRef.sandValue}碎片`) },
          () => { discardFromStash('item', iRef.id); audioManager.playClick(); this.buildStash(); this.tipText.setText(`已丢弃：${iRef.name}`) },
        )
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
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#5090b0' },
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
      // ── rebuild 时重新读取最新状态 ────────────────────
      const currentRt = getRuntimeState()
      const currentUnlocked: CharacterId[] = currentRt.player.unlockedCharacters ?? ['echo_ranger']

      let ly = 34
      for (const def of CHARACTER_LIST) {
        const id = def.id
        const isUnlocked = currentUnlocked.includes(id)
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
          { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px',
            color: isUnlocked ? (isSel ? '#c8e8ff' : '#a0b8c8') : '#384858' })

        // 定位标签
        makeText(LIST_LEFT + 48, ly + 26, isUnlocked ? `[${def.role}]` : `🔒 ${def.role}`,
          { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: isSel ? '#6090d0' : '#4a6070' })

        // 当前选中徽标
        if (isSel) {
          makeText(LIST_LEFT + CARD_W - 10, ly + CARD_H / 2 - 7, '◀',
            { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#5090d0' }, 1, 0)
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
      const isUnlocked = currentUnlocked.includes(selected)

      let dy = 34

      // 角色大头像
      const bigPortrait = this.add.image(DETAIL_X + 36, dy + 36, `char_${selected}`)
        .setDisplaySize(72, 72).setAlpha(isUnlocked ? 1 : 0.3)
      addTo(bigPortrait)

      // 名字
      makeText(DETAIL_X + 82, dy + 6, def.name,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '17px',
          color: isUnlocked ? '#e8d8a0' : '#405060' })

      // 定位标签
      makeText(DETAIL_X + 82, dy + 28, `[${def.role}]  ${def.nameEn}`,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#6090b0' })

      // lore 一句话
      makeText(DETAIL_X + 82, dy + 44, def.lore,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#506070',
          wordWrap: { width: DETAIL_W - 90 } })

      // 未解锁提示 + 实时进度
      if (!isUnlocked && def.unlockRequirement) {
        // 计算实时进度文字
        let progressText = ''
        if (selected === 'void_breaker') {
          const cur = currentRt.player.totalExtractions ?? 0
          progressText = cur >= 5 ? '条件已达成（重新打开页面生效）' : `撤离 ${cur}/5 次`
        } else if (selected === 'chrono_sentinel') {
          const cur = currentRt.player.crystalsFound.length
          progressText = cur >= 3 ? '条件已达成' : `回响水晶 ${cur}/3 枚`
        } else if (selected === 'echo_phantom') {
          const cur = currentRt.player.totalKills
          progressText = cur >= 100 ? '条件已达成' : `击杀 ${cur}/100`
        } else if (selected === 'iron_warden') {
          const cur = currentRt.player.totalDives
          progressText = cur >= 10 ? '条件已达成' : `深潜 ${cur}/10 次`
        }
        makeText(DETAIL_X + 82, dy + 60, `🔒 ${def.unlockRequirement}`,
          { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#806050',
            wordWrap: { width: DETAIL_W - 90 } })
        if (progressText) {
          makeText(DETAIL_X + 82, dy + 74, `▸ ${progressText}`,
            { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#a07840' })
        }
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
          { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#607080' })
        makeRect(DETAIL_X + 44 + BAR_W / 2, dy + 6, BAR_W, 8, 0x1a2a30)
        const fillW = Math.max(4, Math.round(pct / 100 * BAR_W))
        makeRect(DETAIL_X + 44 + fillW / 2, dy + 6, fillW, 8, isUnlocked ? 0x3a8aaa : 0x3a4a50)
        makeText(DETAIL_X + 44 + BAR_W + 6, dy, val,
          { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#a0c0d0' })
        dy += 20
      }

      // 初始武器
      makeText(DETAIL_X, dy + 4, `初始武器：${def.startWeapon.replace(/_/g, ' ')}`,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#90a868' })
      dy += 24

      // 分隔线
      makeRect(DETAIL_X + DETAIL_W / 2, dy, DETAIL_W, 1, 0x304050, 0.4)
      dy += 10

      // 被动
      makeText(DETAIL_X, dy, `被动  ${def.passiveName}`,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#c8a060' })
      dy += 16
      makeText(DETAIL_X, dy, def.passiveDesc,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#708090',
          wordWrap: { width: DETAIL_W } })
      dy += 28

      // Q 技能
      const sk = def.uniqueSkill
      makeText(DETAIL_X, dy, `Q  ${sk.name}   CD ${sk.cooldownMs / 1000}s`,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#80c0e0' })
      dy += 16
      makeText(DETAIL_X, dy, sk.desc,
        { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#708090',
          wordWrap: { width: DETAIL_W } })
      dy += 32

      // 选择按钮
      if (isUnlocked) {
        const isCurrent = selected === currentRt.player.selectedCharacter
        const btnX = DETAIL_X + 100
        const btnBg = this.add.rectangle(btnX, dy, 200, 32,
          isCurrent ? 0x1a4060 : 0x0c1a2a)
        btnBg.setStrokeStyle(1, isCurrent ? 0x60c0ff : 0x305070, 1)
        addTo(btnBg)

        const btnTxt = this.make.text({
          x: btnX, y: dy,
          text: isCurrent ? '✓ 当前角色' : '选择此角色',
          style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '13px',
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
          { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#806050',
            wordWrap: { width: DETAIL_W } }, 0.5, 0)
      }
    }

    rebuild()
  }

  // ─────────────────── TAB: 碎片兑换 ──────────────────
  private buildForge() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const fragments = rt.player.itemFragments ?? {}
    const W = 720, leftX = width / 2 - W / 2
    let y = 8

    this.contentLayer.add(this.make.text({
      x: width / 2, y,
      text: '碎片兑换  ─  集齐装备碎片，可兑换为完整装备入库',
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#506070' },
      add: false,
    }).setOrigin(0.5, 0))
    y += 22

    this.contentLayer.add(this.make.text({
      x: leftX, y,
      text: `兑换价：常规 ${FRAG_COST.common} 片  ·  非凡 ${FRAG_COST.uncommon} 片  ·  稀有 ${FRAG_COST.rare} 片  ·  传说 ${FRAG_COST.legendary} 片`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#80a0c0' },
      add: false,
    }))
    y += 24

    type Entry = { key: string; type: 'weapon' | 'attachment' | 'item'; id: string; name: string; rarity: ItemRarity; have: number; need: number }
    const entries: Entry[] = []
    for (const [key, have] of Object.entries(fragments)) {
      if (!have || have <= 0) continue
      const [t, id] = key.split(':') as [Entry['type'], string]
      const def =
        t === 'weapon' ? WEAPON_DEFINITIONS[id as keyof typeof WEAPON_DEFINITIONS]
        : t === 'attachment' ? ATTACHMENT_DEFINITIONS[id as keyof typeof ATTACHMENT_DEFINITIONS]
        : ITEM_DEFINITIONS[id as keyof typeof ITEM_DEFINITIONS]
      if (!def) continue
      entries.push({ key, type: t, id, name: def.name, rarity: def.rarity as ItemRarity, have, need: FRAG_COST[def.rarity as ItemRarity] })
    }
    // 排序：可兑换在前，按稀有度 → 类型 → 名字
    const RARITY_ORDER: Record<ItemRarity, number> = { legendary: 0, rare: 1, uncommon: 2, common: 3 }
    entries.sort((a, b) => {
      const ar = a.have >= a.need ? 0 : 1, br = b.have >= b.need ? 0 : 1
      if (ar !== br) return ar - br
      if (RARITY_ORDER[a.rarity] !== RARITY_ORDER[b.rarity]) return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]
      return a.name.localeCompare(b.name)
    })

    if (entries.length === 0) {
      this.contentLayer.add(this.make.text({
        x: width / 2, y: y + 30,
        text: '（暂无装备碎片，前往「召唤所」抽卡获得）',
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#404858' },
        add: false,
      }).setOrigin(0.5, 0))
      this.scrollMax = 0
      return
    }

    const TYPE_LABEL: Record<Entry['type'], string> = { weapon: '武器', attachment: '配件', item: '物品' }

    entries.forEach(e => {
      const colorN = RARITY_COLORS[e.rarity]
      const colorHex = `#${colorN.toString(16).padStart(6, '0')}`
      const ready = e.have >= e.need
      const bg = this.add.rectangle(width / 2, y + 22, W, 44, ready ? 0x0a2018 : 0x0a1828)
      bg.setStrokeStyle(1, ready ? 0x60a040 : colorN, 0.7)
      this.contentLayer.add(bg)

      this.contentLayer.add(this.make.text({
        x: leftX + 8, y: y + 6,
        text: `[${RARITY_NAMES[e.rarity]}] [${TYPE_LABEL[e.type]}] ${e.name}`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: colorHex },
        add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: leftX + 8, y: y + 24,
        text: `碎片：${e.have} / ${e.need}${ready ? '   ✦ 可兑换' : ''}`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: ready ? '#80ff80' : '#5080a0' },
        add: false,
      }))

      // 兑换按钮
      const btnColor = ready ? 0x60a040 : 0x303848
      const btnFill = ready ? 0x10241a : 0x0a0e18
      const btnTxtColor = ready ? '#a0ff80' : '#404858'
      const btn = this.add.rectangle(leftX + W - 60, y + 22, 100, 28, btnFill)
      btn.setStrokeStyle(1, btnColor, ready ? 0.9 : 0.4)
      if (ready) btn.setInteractive({ useHandCursor: true })
      this.contentLayer.add(btn)
      this.contentLayer.add(this.make.text({
        x: leftX + W - 60, y: y + 22,
        text: ready ? `[ 兑换 -${e.need} ]` : `差 ${e.need - e.have} 片`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: btnTxtColor },
        add: false,
      }).setOrigin(0.5))
      if (ready) {
        btn.on('pointerdown', () => {
          if (spendItemFragments(e.key, e.need)) {
            addToStash(e.type, e.id)
            audioManager.playClick()
            this.tipText.setText(`✦ 兑换成功：${e.name}  已加入仓库`)
            this.buildForge()
          }
        })
      }
      y += 50
    })

    this.scrollMax = Math.max(0, y - (this.scale.height - 160))
  }

  // ─────────────────── TAB: 成就 ──────────────────
  private buildAchievements() {
    const { width } = this.scale
    const rt = getRuntimeState()
    const cw = 760
    const leftX = width / 2 - cw / 2
    let y = 16

    // 主动检查解锁
    const newly = checkAndClaimAchievements()
    if (newly.length > 0) this.tipText.setText(`✦ 解锁 ${newly.length} 项成就！奖励已自动发放`)

    const claimed = new Set(getRuntimeState().player.achievements)
    const unlockedCount = ACHIEVEMENTS.filter(a => claimed.has(a.id)).length
    this.contentLayer.add(this.make.text({
      x: width / 2, y,
      text: `成就进度  ${unlockedCount} / ${ACHIEVEMENTS.length}`,
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '15px', color: '#c8a850' },
      add: false,
    }).setOrigin(0.5, 0))
    y += 26
    this.contentLayer.add(this.make.text({
      x: width / 2, y,
      text: '满足条件后切换到此页即可自动领取奖励',
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#506880' },
      add: false,
    }).setOrigin(0.5, 0))
    y += 22

    ACHIEVEMENTS.forEach(a => {
      const done = claimed.has(a.id)
      const close = !done && a.check(rt.player)
      const cardH = 40
      const bg = this.add.rectangle(width / 2, y + cardH / 2, cw, cardH, done ? 0x0a1808 : 0x080e1a)
      bg.setStrokeStyle(1, done ? 0x607030 : 0x1a2838, done ? 0.7 : 0.4)
      this.contentLayer.add(bg)
      this.contentLayer.add(this.make.text({
        x: leftX + 12, y: y + 8,
        text: `${done ? '✦' : '○'}  ${a.name}`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: done ? '#a0c840' : '#90a0c0' },
        add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: leftX + 12, y: y + 24,
        text: a.desc,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: done ? '#608028' : '#506070' },
        add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: width / 2 + cw / 2 - 14, y: y + cardH / 2,
        text: done ? `+${a.reward} 已领取` : `奖励 +${a.reward} 时砂`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: done ? '#608030' : (close ? '#c0a040' : '#506880') },
        add: false,
      }).setOrigin(1, 0.5))
      y += cardH + 6
    })

    // 设置滚动范围
    const visibleH = this.scale.height - this.contentBaseY - 30
    this.scrollMax = Math.max(0, y - visibleH + 20)
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
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#304050' },
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
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#c8a96e' }, add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 28,
        text: `— ${entry.source}`,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#405060' }, add: false,
      }))
      this.contentLayer.add(this.make.text({
        x: cx - 328, y: y + 44,
        text: entry.content,
        style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#8090a8', wordWrap: { width: 660 } },
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
      style: { fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#90b8d8' },
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

