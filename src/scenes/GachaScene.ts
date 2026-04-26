import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'
import {
  CHARACTER_DEFINITIONS,
  LIMITED_CHARACTER_IDS,
  LIMITED_CHARACTER_WEIGHTS,
  type CharacterId,
} from '../config/characters'
import {
  getRuntimeState,
  spendTimeSand,
  unlockCharacter,
  recordGachaPull,
  addTimeSand,
} from '../state/gameState'

/**
 * 限定角色抽卡场景
 *
 * 规则：
 * - 单抽消耗 100 时砂；十连消耗 900 时砂（省 100）
 * - 仅可抽到 3 个限定角色（shard_oracle / temporal_exile / echo_singularity）
 * - 加权抽卡：先知 50 / 放逐者 35 / 奇点 15
 * - 保底：累计 30 抽未出"奇点（传说）"则下次必出
 * - 重复抽到的限定角色：返还 60 时砂（碎片折算）
 */

const COST_SINGLE = 100
const COST_TEN = 900
const PITY_THRESHOLD = 30          // 30 抽内必出传说
const DUPLICATE_REFUND = 60        // 重复返还时砂

const RARITY_LABEL: Record<CharacterId, string> = {
  echo_ranger: '', void_breaker: '', chrono_sentinel: '', echo_phantom: '', iron_warden: '',
  shard_oracle:     'R',
  temporal_exile:   'SR',
  echo_singularity: 'SSR',
}

const RARITY_COLOR: Record<CharacterId, number> = {
  echo_ranger: 0xffffff, void_breaker: 0xffffff, chrono_sentinel: 0xffffff, echo_phantom: 0xffffff, iron_warden: 0xffffff,
  shard_oracle:     0xff60c0,
  temporal_exile:   0xffaa20,
  echo_singularity: 0x80ffe0,
}

export class GachaScene extends Phaser.Scene {
  private sandText!: Phaser.GameObjects.Text
  private pityText!: Phaser.GameObjects.Text
  private historyContainer!: Phaser.GameObjects.Container
  private overlayLayer!: Phaser.GameObjects.Container

  constructor() {
    super('GachaScene')
  }

  create() {
    const { width, height } = this.scale
    audioManager.startMenuBgm()

    // 背景
    this.cameras.main.setBackgroundColor('#0a0612')
    this.add.image(width / 2, height / 2, 'bg_menu').setDisplaySize(width, height).setAlpha(0.18)

    // 顶栏
    this.add.rectangle(width / 2, 26, width, 52, 0x05030c, 0.96)
    this.add.text(width / 2, 8, '✦ 限定回响召唤 ✦', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '22px', color: '#ff80d0',
    }).setOrigin(0.5, 0)
    this.add.text(width / 2, 36, 'GACHA  ·  从时空裂隙中召唤限定回响体', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#705080',
    }).setOrigin(0.5, 0)

    // 返回按钮
    const back = this.add.text(16, height - 12, '← 返回模式选择', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#506070',
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true })
    back.on('pointerover', () => back.setColor('#a080c0'))
    back.on('pointerout', () => back.setColor('#506070'))
    back.on('pointerdown', () => { audioManager.playClick(); this.scene.start('ModeSelectScene') })

    // 时砂余额
    this.sandText = this.add.text(width - 14, 60, '', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#f0d870',
    }).setOrigin(1, 0)
    this.refreshSand()

    // 保底进度
    this.pityText = this.add.text(width - 14, 84, '', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#a08070',
    }).setOrigin(1, 0)
    this.refreshPity()

    // 卡池展示区（左侧）
    this.drawPoolPreview()

    // 抽卡按钮（中间偏下）
    this.drawPullButtons()

    // 历史抽卡列表（右侧）
    this.historyContainer = this.add.container(0, 0)
    this.refreshHistory()

    // Debug：补充时砂（开发期便利）
    const dbg = this.add.text(14, 60, '[ +500时砂 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#304050',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true })
    dbg.on('pointerover', () => dbg.setColor('#7090a0'))
    dbg.on('pointerout', () => dbg.setColor('#304050'))
    dbg.on('pointerdown', () => { addTimeSand(500); this.refreshSand() })
  }

  // ── 卡池预览 ───────────────────────────────────────────
  private drawPoolPreview() {
    const baseX = 70, baseY = 110
    this.add.text(baseX, baseY - 18, '◆ 限定卡池', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#ff80d0',
    }).setOrigin(0, 0)

    LIMITED_CHARACTER_IDS.forEach((id, i) => {
      const def = CHARACTER_DEFINITIONS[id]
      const cy = baseY + 8 + i * 110
      const cw = 280, ch = 100
      const colorN = RARITY_COLOR[id]

      // 卡片背景
      this.add.rectangle(baseX, cy, cw, ch, 0x100818, 0.95).setOrigin(0, 0).setStrokeStyle(2, colorN, 0.7)
      // 立绘
      this.add.image(baseX + 50, cy + ch / 2, def.spriteKey).setScale(2.0)
      // 名字 + 稀有度
      this.add.text(baseX + 100, cy + 10, def.name, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '14px',
        color: `#${colorN.toString(16).padStart(6, '0')}`,
      })
      this.add.text(baseX + 100, cy + 28, `[${RARITY_LABEL[id]}]  ${def.role}`, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#a09080',
      })
      this.add.text(baseX + 100, cy + 44, def.passiveName, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '11px', color: '#e0c0a0',
      })
      this.add.text(baseX + 100, cy + 58, def.passiveDesc, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#807060', wordWrap: { width: 175 },
      })
      // 概率
      const weight = LIMITED_CHARACTER_WEIGHTS[id]
      const total = LIMITED_CHARACTER_IDS.reduce((s, x) => s + LIMITED_CHARACTER_WEIGHTS[x], 0)
      const pct = (weight / total * 100).toFixed(1)
      this.add.text(baseX + cw - 8, cy + 8, `${pct}%`, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '11px',
        color: `#${colorN.toString(16).padStart(6, '0')}`,
      }).setOrigin(1, 0)
    })
  }

  // ── 抽卡按钮 ───────────────────────────────────────────
  private drawPullButtons() {
    const cx = 480
    const baseY = 360

    this.add.text(cx, baseY - 30, '✦ 召唤 ✦', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '16px', color: '#ff80d0',
    }).setOrigin(0.5, 0)

    // 单抽
    const singleBg = this.add.rectangle(cx - 70, baseY + 20, 120, 56, 0x180828, 1).setStrokeStyle(2, 0xff60c0, 0.8).setInteractive({ useHandCursor: true })
    this.add.text(cx - 70, baseY + 8, '单抽', { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#ff80d0' }).setOrigin(0.5)
    this.add.text(cx - 70, baseY + 28, `${COST_SINGLE}⌛`, { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#f0d870' }).setOrigin(0.5)
    singleBg.on('pointerover', () => singleBg.setFillStyle(0x2a1040))
    singleBg.on('pointerout', () => singleBg.setFillStyle(0x180828))
    singleBg.on('pointerdown', () => this.pullCards(1))

    // 十连
    const tenBg = this.add.rectangle(cx + 70, baseY + 20, 120, 56, 0x281020, 1).setStrokeStyle(2, 0xffaa40, 0.9).setInteractive({ useHandCursor: true })
    this.add.text(cx + 70, baseY + 8, '十连', { fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#ffaa40' }).setOrigin(0.5)
    this.add.text(cx + 70, baseY + 28, `${COST_TEN}⌛`, { fontFamily: '"Noto Sans SC", monospace', fontSize: '12px', color: '#f0d870' }).setOrigin(0.5)
    tenBg.on('pointerover', () => tenBg.setFillStyle(0x401a30))
    tenBg.on('pointerout', () => tenBg.setFillStyle(0x281020))
    tenBg.on('pointerdown', () => this.pullCards(10))

    this.add.text(cx, baseY + 60, '保底机制：30 抽内未出 SSR 必出  ·  重复角色返还 60⌛', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '9px', color: '#605070',
    }).setOrigin(0.5)
  }

  // ── 抽卡逻辑 ───────────────────────────────────────────
  private rollOne(): { id: CharacterId; isLegendary: boolean } {
    const p = getRuntimeState().player
    // 保底：累计 PITY_THRESHOLD-1 后下一抽必出 SSR
    if (p.gachaPityCounter >= PITY_THRESHOLD - 1) {
      return { id: 'echo_singularity', isLegendary: true }
    }
    const total = LIMITED_CHARACTER_IDS.reduce((s, id) => s + LIMITED_CHARACTER_WEIGHTS[id], 0)
    let roll = Math.random() * total
    for (const id of LIMITED_CHARACTER_IDS) {
      roll -= LIMITED_CHARACTER_WEIGHTS[id]
      if (roll <= 0) return { id, isLegendary: id === 'echo_singularity' }
    }
    return { id: 'shard_oracle', isLegendary: false }
  }

  private pullCards(count: number) {
    const cost = count === 10 ? COST_TEN : COST_SINGLE * count
    if (!spendTimeSand(cost)) {
      this.showToast('时砂不足！', '#ff6060')
      return
    }
    audioManager.playClick()

    const results: Array<{ id: CharacterId; isLegendary: boolean; isDuplicate: boolean }> = []
    for (let i = 0; i < count; i++) {
      const r = this.rollOne()
      const wasUnlocked = getRuntimeState().player.unlockedCharacters.includes(r.id)
      const isDuplicate = wasUnlocked
      if (isDuplicate) {
        addTimeSand(DUPLICATE_REFUND)
      } else {
        unlockCharacter(r.id)
      }
      recordGachaPull(r.id, r.isLegendary)
      results.push({ ...r, isDuplicate })
    }

    this.refreshSand()
    this.refreshPity()
    this.refreshHistory()
    this.showResults(results)
  }

  // ── 结果展示 ───────────────────────────────────────────
  private showResults(results: Array<{ id: CharacterId; isLegendary: boolean; isDuplicate: boolean }>) {
    const { width, height } = this.scale
    if (this.overlayLayer) this.overlayLayer.destroy()
    this.overlayLayer = this.add.container(0, 0).setDepth(200)

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85).setInteractive()
    this.overlayLayer.add(dim)

    const title = this.add.text(width / 2, 50, '✦ 召唤结果 ✦', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '24px', color: '#ff80d0',
    }).setOrigin(0.5)
    this.overlayLayer.add(title)

    // 网格布局
    const cols = results.length === 1 ? 1 : 5
    const rows = Math.ceil(results.length / cols)
    const cardW = 140, cardH = 170
    const gx = 12, gy = 12
    const totalW = cols * cardW + (cols - 1) * gx
    const startX = width / 2 - totalW / 2 + cardW / 2
    const startY = 110 + (rows === 1 ? 60 : 0)

    results.forEach((r, i) => {
      const cx = startX + (i % cols) * (cardW + gx)
      const cy = startY + Math.floor(i / cols) * (cardH + gy)
      const def = CHARACTER_DEFINITIONS[r.id]
      const colorN = RARITY_COLOR[r.id]

      const bg = this.add.rectangle(cx, cy, cardW, cardH, 0x100818, 1).setStrokeStyle(2, colorN, 0.95)
      this.overlayLayer.add(bg)

      const portrait = this.add.image(cx, cy - 30, def.spriteKey).setScale(2.4)
      this.overlayLayer.add(portrait)

      // 稀有度标签
      const rarityTxt = this.add.text(cx, cy + 22, RARITY_LABEL[r.id], {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '14px',
        color: `#${colorN.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5)
      this.overlayLayer.add(rarityTxt)

      // 名字
      const nameTxt = this.add.text(cx, cy + 42, def.name, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '13px',
        color: `#${colorN.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5)
      this.overlayLayer.add(nameTxt)

      // 重复标记
      if (r.isDuplicate) {
        const dupTxt = this.add.text(cx, cy + 60, `[ 重复  +${DUPLICATE_REFUND}⌛ ]`, {
          fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#7090a0',
        }).setOrigin(0.5)
        this.overlayLayer.add(dupTxt)
      } else {
        const newTxt = this.add.text(cx, cy + 60, '★ NEW! 解锁 ★', {
          fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#ffd070',
        }).setOrigin(0.5)
        this.overlayLayer.add(newTxt)
      }

      // SSR 闪光特效
      if (r.isLegendary && !r.isDuplicate) {
        const glow = this.add.graphics().lineStyle(3, colorN, 0.9).strokeRect(cx - cardW / 2 - 2, cy - cardH / 2 - 2, cardW + 4, cardH + 4)
        this.overlayLayer.add(glow)
        this.tweens.add({ targets: glow, alpha: { from: 1, to: 0.3 }, duration: 500, yoyo: true, repeat: -1 })
      }

      // 入场动画
      bg.setAlpha(0)
      portrait.setAlpha(0); portrait.setScale(0.5)
      this.tweens.add({ targets: [bg, rarityTxt, nameTxt], alpha: 1, duration: 300, delay: i * 80 })
      this.tweens.add({ targets: portrait, alpha: 1, scale: 2.4, duration: 400, delay: i * 80, ease: 'Back.easeOut' })
    })

    // 关闭按钮
    const closeBtn = this.add.rectangle(width / 2, height - 30, 200, 36, 0x180828, 1).setStrokeStyle(2, 0xff60c0, 0.8).setInteractive({ useHandCursor: true })
    const closeTxt = this.add.text(width / 2, height - 30, '[ 确认 ]', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '14px', color: '#ff80d0',
    }).setOrigin(0.5)
    this.overlayLayer.add(closeBtn); this.overlayLayer.add(closeTxt)
    closeBtn.on('pointerdown', () => { audioManager.playClick(); this.overlayLayer.destroy() })
  }

  // ── 历史 ──────────────────────────────────────────────
  private refreshHistory() {
    if (this.historyContainer) this.historyContainer.removeAll(true)
    const baseX = 720, baseY = 110
    const title = this.add.text(baseX, baseY - 18, '◆ 最近抽卡', {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '13px', color: '#ff80d0',
    }).setOrigin(0, 0)
    this.historyContainer.add(title)

    const history = getRuntimeState().player.gachaHistory.slice(0, 12)
    if (history.length === 0) {
      const empty = this.add.text(baseX, baseY + 10, '（暂无记录）', {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '10px', color: '#404858',
      })
      this.historyContainer.add(empty)
      return
    }
    history.forEach((entry, i) => {
      const [cidStr] = entry.split(':')
      const cid = cidStr as CharacterId
      const def = CHARACTER_DEFINITIONS[cid]
      if (!def) return
      const cy = baseY + 8 + i * 26
      const colorN = RARITY_COLOR[cid] ?? 0xa0a0a0
      const bg = this.add.rectangle(baseX, cy, 200, 22, 0x10081a, 0.9).setOrigin(0, 0).setStrokeStyle(1, colorN, 0.5)
      const dot = this.add.image(baseX + 14, cy + 11, def.spriteKey).setScale(0.8)
      const tag = this.add.text(baseX + 32, cy + 11, `[${RARITY_LABEL[cid]}] ${def.name}`, {
        fontFamily: '"Noto Sans SC", monospace', fontSize: '10px',
        color: `#${colorN.toString(16).padStart(6, '0')}`,
      }).setOrigin(0, 0.5)
      this.historyContainer.add([bg, dot, tag])
    })
  }

  // ── 工具 ──────────────────────────────────────────────
  private refreshSand() {
    const sand = getRuntimeState().player.timeSand
    this.sandText.setText(`时砂  ${sand} ⌛`)
  }

  private refreshPity() {
    const p = getRuntimeState().player
    const remaining = PITY_THRESHOLD - p.gachaPityCounter
    this.pityText.setText(`SSR 保底：${remaining} 抽内必出  (累计 ${p.gachaPullsTotal} 抽)`)
  }

  private showToast(msg: string, color: string) {
    const { width, height } = this.scale
    const t = this.add.text(width / 2, height / 2, msg, {
      fontFamily: '"Noto Sans SC", monospace', fontSize: '20px', color,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(300)
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, duration: 1200, onComplete: () => t.destroy() })
  }
}
