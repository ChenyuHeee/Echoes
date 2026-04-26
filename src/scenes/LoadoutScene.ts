import Phaser from 'phaser'
import { getRuntimeState } from '../state/gameState'
import { audioManager } from '../systems/AudioManager'
import type { FragmentId } from '../config/fragments'
import {
  type ItemDef,
  type WeaponDef,
  type AttachmentDef,
  ITEM_DEFINITIONS,
  WEAPON_DEFINITIONS,
  ATTACHMENT_DEFINITIONS,
  ATTACHMENT_SLOTS,
  RARITY_COLORS,
  RARITY_NAMES,
  BAG_CAPACITY,
} from '../config/items'

type LoadoutInit = {
  offline?: boolean
  roomCode?: string
  mapFragment?: FragmentId
}

export class LoadoutScene extends Phaser.Scene {
  private selectedWeapon: WeaponDef | null = null
  private selectedAttachments: Set<string> = new Set()
  private selectedItems: string[] = []
  private diveParams!: LoadoutInit
  private container!: Phaser.GameObjects.Container

  constructor() {
    super({ key: 'LoadoutScene' })
  }

  init(data: LoadoutInit) {
    this.diveParams = data

    // 默认全选仓库装备（武器取第一把，配件每槽取第一个，物品全选但不超过背包容量）
    const stash = getRuntimeState().player.stash ?? { weaponIds: [], attachmentIds: [], itemIds: [] }

    // 武器默认选第一把
    const firstWeaponId = stash.weaponIds[0] ?? null
    this.selectedWeapon = firstWeaponId
      ? ((WEAPON_DEFINITIONS as Record<string, WeaponDef | undefined>)[firstWeaponId] ?? null)
      : null

    // 配件默认每槽位取第一个（一槽只带一个）
    this.selectedAttachments = new Set<string>()
    const stashAtts = stash.attachmentIds
      .map(id => (ATTACHMENT_DEFINITIONS as Record<string, AttachmentDef | undefined>)[id])
      .filter(Boolean) as AttachmentDef[]
    ATTACHMENT_SLOTS.forEach(slot => {
      const first = stashAtts.find(a => a.slotType === slot)
      if (first) this.selectedAttachments.add(first.id)
    })

    this.selectedItems = [...stash.itemIds].slice(0, BAG_CAPACITY)
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#080e1c')
    this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height).setAlpha(0.12)
    audioManager.startMenuBgm()
    this.buildUI()
  }

  private buildUI() {
    const { width, height } = this.scale
    if (this.container) this.container.destroy()

    this.container = this.add.container(0, 0).setDepth(1)

    // ── 标题 ──────────────────────────────────────────────
    this.container.add(this.make.text({
      x: width / 2, y: 18,
      text: '战前准备',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '20px', color: '#c0d8f0', stroke: '#000', strokeThickness: 3 },
      add: false,
    }).setOrigin(0.5, 0))
    this.container.add(this.make.text({
      x: width / 2, y: 44,
      text: '选择本次深潜携带的装备（勾选/取消），未选装备留在仓库',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#405070' },
      add: false,
    }).setOrigin(0.5, 0))

    // ── 分栏 ──────────────────────────────────────────────
    const LEFT_W = 420
    const RIGHT_W = 280
    const GAP = 20
    const lx = (width - LEFT_W - GAP - RIGHT_W) / 2
    const rx = lx + LEFT_W + GAP
    let ly = 68
    const stash = getRuntimeState().player.stash ?? { weaponIds: [], attachmentIds: [], itemIds: [] }
    const slotNames: Record<string, string> = { barrel: '枪管', scope: '瞄准镜', magazine: '弹匣', stock: '枪托', underbarrel: '下挂', enhancement: '强化核' }

    // ════ 左栏：仓库物品（可选择） ═══════════════════════
    // 武器（多把，单选）
    this.container.add(this.make.text({
      x: lx, y: ly,
      text: `── 武器  (仓库 ${stash.weaponIds.length}) ──`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#446688' },
      add: false,
    }))
    ly += 18

    const stashWeapDefs = stash.weaponIds
      .map(id => (WEAPON_DEFINITIONS as Record<string, WeaponDef | undefined>)[id])
      .filter(Boolean) as WeaponDef[]
    if (stashWeapDefs.length === 0) {
      this.container.add(this.make.text({
        x: lx + 8, y: ly,
        text: '（仓库中无武器，深潜中从地图拾取）',
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#2a3848' },
        add: false,
      }))
      ly += 24
    } else {
      stashWeapDefs.forEach(weapDef => {
        this.addToggleRow(
          lx, ly, LEFT_W, weapDef,
          () => this.selectedWeapon?.id === weapDef.id,
          () => {
            // 单选：点击切换，已选则取消
            this.selectedWeapon = this.selectedWeapon?.id === weapDef.id ? null : weapDef
            this.buildUI()
          },
          `${weapDef.name}  [${RARITY_NAMES[weapDef.rarity]}]`,
          `伤害 ${weapDef.baseDamage}${weapDef.pellets ? ` ×${weapDef.pellets}` : ''}  射速 ${weapDef.fireRateMs}ms  暴击 ${Math.round(weapDef.baseCritChance * 100)}%  估值 ${weapDef.sandValue}⌛`,
          RARITY_COLORS[weapDef.rarity],
        )
        ly += 46
      })
    }

    // 配件（按槽位分组，每槽单选）
    ly += 6
    this.container.add(this.make.text({
      x: lx, y: ly,
      text: `── 配件  (仓库 ${stash.attachmentIds.length}) ──`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#446688' },
      add: false,
    }))
    ly += 18

    const stashAttDefs = stash.attachmentIds
      .map(id => (ATTACHMENT_DEFINITIONS as Record<string, AttachmentDef | undefined>)[id])
      .filter(Boolean) as AttachmentDef[]

    if (stashAttDefs.length === 0) {
      this.container.add(this.make.text({
        x: lx + 8, y: ly,
        text: '（仓库中无配件）',
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#2a3848' },
        add: false,
      }))
      ly += 24
    } else {
      ATTACHMENT_SLOTS.forEach(slot => {
        const slotAtts = stashAttDefs.filter(a => a.slotType === slot)
        if (slotAtts.length === 0) return
        // 槽位标题
        this.container.add(this.make.text({
          x: lx + 4, y: ly,
          text: `[${slotNames[slot]}]`,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#3a5878' },
          add: false,
        }))
        ly += 14
        slotAtts.forEach(att => {
          const isSelThisSlot = this.selectedAttachments.has(att.id)
          this.addToggleRow(
            lx + 12, ly, LEFT_W - 12, att,
            () => isSelThisSlot,
            () => {
              // 同槽位单选：先清除同槽已选
              slotAtts.forEach(a => this.selectedAttachments.delete(a.id))
              if (!isSelThisSlot) this.selectedAttachments.add(att.id)
              this.buildUI()
            },
            `${att.name}  [${RARITY_NAMES[att.rarity]}]`,
            `${att.desc}  估值 ${att.sandValue}⌛`,
            RARITY_COLORS[att.rarity],
          )
          ly += 40
        })
      })
    }

    // 物品
    ly += 6
    const stashItemDefs = stash.itemIds
      .map(id => (ITEM_DEFINITIONS as Record<string, ItemDef | undefined>)[id])
      .filter(Boolean) as ItemDef[]

    this.container.add(this.make.text({
      x: lx, y: ly,
      text: `── 物品  (${this.selectedItems.length}/${BAG_CAPACITY} 格) ──`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#446688' },
      add: false,
    }))
    ly += 18

    if (stashItemDefs.length === 0) {
      this.container.add(this.make.text({
        x: lx + 8, y: ly,
        text: '（仓库中无物品）',
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: '#2a3848' },
        add: false,
      }))
      ly += 24
    } else {
      stashItemDefs.forEach(item => {
        const selected = this.selectedItems.includes(item.id)
        const atCapacity = this.selectedItems.length >= BAG_CAPACITY
        const canSelect = selected || !atCapacity
        this.addToggleRow(
          lx, ly, LEFT_W, item,
          () => selected,
          () => {
            if (selected) {
              this.selectedItems = this.selectedItems.filter(x => x !== item.id)
            } else if (!atCapacity) {
              this.selectedItems.push(item.id)
            }
            this.buildUI()
          },
          `${item.name}  [${RARITY_NAMES[item.rarity]}]`,
          `${item.desc}  估值 ${item.sandValue}⌛`,
          RARITY_COLORS[item.rarity],
          !canSelect,
        )
        ly += 42
      })
    }

    // ════ 右栏：已选装备预览 ════════════════════════════════
    let ry = 68
    this.container.add(this.make.text({
      x: rx, y: ry,
      text: '本次携带',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#7ce0bc' },
      add: false,
    }))
    ry += 24

    // 武器预览
    const bg0 = this.add.rectangle(rx + RIGHT_W / 2, ry + 22, RIGHT_W, 44,
      this.selectedWeapon ? 0x0a1828 : 0x060c14)
    bg0.setStrokeStyle(1, this.selectedWeapon ? 0x2a7090 : 0x1a2830, 0.7)
    this.container.add(bg0)
    this.container.add(this.make.text({
      x: rx + 8, y: ry + 6,
      text: this.selectedWeapon ? `🔫 ${this.selectedWeapon.name}` : '🔫 徒手',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: this.selectedWeapon ? '#c8e0ff' : '#2a3848' },
      add: false,
    }))
    if (this.selectedWeapon) {
      this.container.add(this.make.text({
        x: rx + 8, y: ry + 22,
        text: `伤害 ${this.selectedWeapon.baseDamage}  射速 ${this.selectedWeapon.fireRateMs}ms`,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: '#4a7090' },
        add: false,
      }))
    }
    ry += 52

    // 配件预览（6槽）
    const selAtts = Array.from(this.selectedAttachments)
      .map(id => (ATTACHMENT_DEFINITIONS as Record<string, AttachmentDef | undefined>)[id])
      .filter(Boolean) as AttachmentDef[]

    this.container.add(this.make.text({
      x: rx, y: ry,
      text: `配件 ${selAtts.length}/${ATTACHMENT_SLOTS.length}`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: selAtts.length > 0 ? '#7090b0' : '#2a3848' },
      add: false,
    }))
    ry += 16

    const slotNamesR: Record<string, string> = { barrel: '枪管', scope: '瞄准镜', magazine: '弹匣', stock: '枪托', underbarrel: '下挂', enhancement: '强化' }
    ATTACHMENT_SLOTS.forEach(slot => {
      const att = selAtts.find(a => a.slotType === slot)
      const slotBg = this.add.rectangle(rx + RIGHT_W / 2, ry + 12, RIGHT_W, 24, att ? 0x0a1520 : 0x060c12)
      slotBg.setStrokeStyle(1, att ? RARITY_COLORS[att.rarity] : 0x1a2830, att ? 0.6 : 0.3)
      this.container.add(slotBg)
      this.container.add(this.make.text({
        x: rx + 6, y: ry + 5,
        text: att ? `[${slotNamesR[slot]}] ${att.name}` : `[${slotNamesR[slot]}] 空`,
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: att ? '#8090c0' : '#1e2838' },
        add: false,
      }))
      ry += 28
    })
    ry += 8

    // 物品预览
    this.container.add(this.make.text({
      x: rx, y: ry,
      text: `背包 ${this.selectedItems.length}/${BAG_CAPACITY}`,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: this.selectedItems.length > 0 ? '#7090b0' : '#2a3848' },
      add: false,
    }))
    ry += 16

    const selItemDefs = this.selectedItems
      .map(id => (ITEM_DEFINITIONS as Record<string, ItemDef | undefined>)[id])
      .filter(Boolean) as ItemDef[]
    if (selItemDefs.length === 0) {
      this.container.add(this.make.text({
        x: rx + 6, y: ry,
        text: '（空背包出发）',
        style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#1e2838' },
        add: false,
      }))
      ry += 20
    } else {
      selItemDefs.forEach(item => {
        const iColor = RARITY_COLORS[item.rarity]
        const iBg = this.add.rectangle(rx + RIGHT_W / 2, ry + 12, RIGHT_W, 24, 0x0a1020)
        iBg.setStrokeStyle(1, iColor, 0.5)
        this.container.add(iBg)
        this.container.add(this.make.text({
          x: rx + 6, y: ry + 5,
          text: item.name,
          style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: `#${iColor.toString(16).padStart(6, '0')}` },
          add: false,
        }))
        ry += 28
      })
    }

    // ── 底部按钮 ───────────────────────────────────────────
    const btnY = height - 38

    // 返回按钮
    const backBg = this.add.rectangle(width / 2 - 130, btnY, 180, 36, 0x0c1828)
    backBg.setStrokeStyle(1, 0x304050, 0.8).setInteractive({ useHandCursor: true })
    backBg.on('pointerover', () => backBg.setFillStyle(0x162030, 1))
    backBg.on('pointerout', () => backBg.setFillStyle(0x0c1828, 1))
    backBg.on('pointerdown', () => {
      audioManager.playClick()
      this.scene.start('LobbyScene')
    })
    this.container.add(backBg)
    this.container.add(this.make.text({
      x: width / 2 - 130, y: btnY,
      text: '← 返回大厅',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '13px', color: '#506070' },
      add: false,
    }).setOrigin(0.5))

    // 出发按钮
    const goBg = this.add.rectangle(width / 2 + 80, btnY, 220, 36, 0x0a2418)
    goBg.setStrokeStyle(2, 0x2a7050, 0.9).setInteractive({ useHandCursor: true })
    goBg.on('pointerover', () => goBg.setFillStyle(0x123020, 1))
    goBg.on('pointerout', () => goBg.setFillStyle(0x0a2418, 1))
    goBg.on('pointerdown', () => this.startDive())
    this.container.add(goBg)
    this.container.add(this.make.text({
      x: width / 2 + 80, y: btnY,
      text: '▶  确认出发',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '14px', color: '#4ce09c', stroke: '#000', strokeThickness: 2 },
      add: false,
    }).setOrigin(0.5))
  }

  private addToggleRow(
    x: number, y: number, w: number,
    _def: { rarity: string },
    isSelected: () => boolean,
    onToggle: () => void,
    label: string,
    sublabel: string,
    color: number,
    disabled = false,
  ) {
    const selected = isSelected()
    const alpha = disabled && !selected ? 0.35 : 1
    const bg = this.add.rectangle(x + w / 2, y + 19, w, 38, selected ? 0x0c2030 : 0x080c14)
    bg.setStrokeStyle(1, selected ? color : 0x1e2a38, selected ? 0.8 : 0.4)
    bg.setAlpha(alpha)
    this.container.add(bg)

    if (!disabled) {
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerover', () => bg.setFillStyle(selected ? 0x102840 : 0x0e1828, 1))
      bg.on('pointerout', () => bg.setFillStyle(selected ? 0x0c2030 : 0x080c14, 1))
      bg.on('pointerdown', () => { audioManager.playClick(); onToggle() })
    }

    // 勾选框
    const checkBg = this.add.rectangle(x + 14, y + 19, 16, 16, selected ? 0x1a5030 : 0x0a1020)
    checkBg.setStrokeStyle(1, selected ? 0x4ce09c : 0x2a3848, 0.9)
    checkBg.setAlpha(alpha)
    this.container.add(checkBg)
    const checkMark = this.make.text({
      x: x + 14, y: y + 19,
      text: selected ? '✓' : '',
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#4ce09c' },
      add: false,
    }).setOrigin(0.5).setAlpha(alpha)
    this.container.add(checkMark)

    // 标签
    const colorHex = `#${color.toString(16).padStart(6, '0')}`
    this.container.add(this.make.text({
      x: x + 28, y: y + 5,
      text: label,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '11px', color: selected ? colorHex : '#3a5060' },
      add: false,
    }).setAlpha(alpha))
    this.container.add(this.make.text({
      x: x + 28, y: y + 20,
      text: sublabel,
      style: { fontFamily: '"Silkscreen", monospace', fontSize: '9px', color: selected ? '#4a6080' : '#1e2838' },
      add: false,
    }).setAlpha(alpha))
  }

  private startDive() {
    audioManager.playClick()
    const loadout = {
      weaponId: this.selectedWeapon?.id ?? null,
      attachmentIds: Array.from(this.selectedAttachments),
      itemIds: [...this.selectedItems],
    }
    this.scene.start('DiveScene', {
      ...this.diveParams,
      loadout,
    })
    if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene')
  }
}
