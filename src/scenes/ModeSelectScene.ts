import Phaser from 'phaser'
import { audioManager } from '../systems/AudioManager'

interface ModeCard {
  title: string
  sub: string
  desc: string
  color: string
  bg: string
  tag: string
  locked: boolean
  action: () => void
}

export class ModeSelectScene extends Phaser.Scene {
  constructor() {
    super('ModeSelectScene')
  }

  create() {
    const { width, height } = this.scale
    audioManager.startMenuBgm()
    this.cameras.main.setBackgroundColor('#06080f')
    this.add.image(width / 2, height / 2, 'bg_menu').setDisplaySize(width, height).setAlpha(0.28)

    // 顶栏
    this.add.rectangle(width / 2, 26, width, 52, 0x040810, 0.96)
    this.add.text(width / 2, 10, '选择游戏模式', {
      fontFamily: '"Silkscreen", monospace', fontSize: '24px', color: '#c8a96e',
    }).setOrigin(0.5, 0)
    this.add.text(width / 2, 36, 'ECHOES: FRACTURED TIME  ·  六种回响，六种宿命', {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#506878',
    }).setOrigin(0.5, 0)

    const back = this.add.text(16, height - 12, '← 返回主菜单', {
      fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: '#405060',
    }).setOrigin(0, 1)
    back.setInteractive({ useHandCursor: true })
    back.on('pointerover', () => back.setColor('#7090b0'))
    back.on('pointerout', () => back.setColor('#405060'))
    back.on('pointerdown', () => { audioManager.playClick(); this.scene.start('MenuScene') })

    const modes: ModeCard[] = [
      {
        title: '时间深潜',
        sub: '搜打撤  ·  1-3 人',
        desc: '潜入废弃的时空碎片\n击败时砂构造体，搜寻回响水晶\n在时间崩解前活着撤离',
        color: '#7ce0bc',
        bg: 'bg_dive',
        tag: '可游玩',
        locked: false,
        action: () => {
          this.scene.start('LobbyScene')
        },
      },
      {
        title: '虚空风暴',
        sub: '战术竞技  ·  单人 vs AI',
        desc: '碎片岛屿正被虚空吞噬\n搜刮时砂维持时间稳定度\n击杀对手夺取其回响，最后存活者胜',
        color: '#ff9050',
        bg: 'bg_cyber',
        tag: '可游玩',
        locked: false,
        action: () => this.scene.start('StormScene'),
      },
      {
        title: '时间流拉锯战',
        sub: 'MOBA  ·  5v5（联机开发中）',
        desc: '将时间流的走向导向己方矩阵\n团战回响序列的博弈与破坏\n持续引导触发最终时间共振',
        color: '#5878a0',
        bg: 'bg_lobby',
        tag: '开发中',
        locked: true,
        action: () => {},
      },
      {
        title: '回响庇护所',
        sub: '模拟经营  ·  单人',
        desc: '建造你的私有时空碎片\n种植时砂作物，解析回响水晶\n技能工坊、角色档案、残响日志',
        color: '#a0c8ff',
        bg: 'bg_sanctuary',
        tag: '可游玩',
        locked: false,
        action: () => this.scene.start('SanctuaryScene'),
      },
      {
        title: '时隙穿越',
        sub: '竞速  ·  单人',
        desc: '驾驭超空间赛道穿越不稳定时隙\n闪避时间碎片残骸\n3000m内不被摧毁，回响技能清路',
        color: '#c060ff',
        bg: 'bg_menu',
        tag: '可游玩',
        locked: false,
        action: () => this.scene.start('RaceScene'),
      },
      {
        title: '时序密室',
        sub: '动作冒险  ·  单人',
        desc: '以回响系统破解上古时序逻辑\n踏板 + 回响 + 机关的优雅博弈\n纯谜题，无战斗，极致智力享受',
        color: '#50e8a0',
        bg: 'bg_forest',
        tag: '可游玩',
        locked: false,
        action: () => this.scene.start('PuzzleScene'),
      },
    ]

    const cols = 3
    const cw = 286, ch = 148, gx = 12, gy = 10
    const sx = width / 2 - (cols * cw + (cols - 1) * gx) / 2 + cw / 2
    const sy = 116

    modes.forEach((m, i) => {
      const cx = sx + (i % cols) * (cw + gx)
      const cy = sy + Math.floor(i / cols) * (ch + gy)
      this.makeCard(cx, cy, cw, ch, m)
    })
  }

  private makeCard(
    x: number, y: number, w: number, h: number,
    m: ModeCard,
  ) {
    const col = Phaser.Display.Color.HexStringToColor(m.color).color
    const alpha = m.locked ? 0.3 : 0.8

    // 背景
    this.add.rectangle(x, y, w, h, 0x080e1c, 1).setDepth(2)
      .setStrokeStyle(1, col, alpha)
    this.add.image(x, y, m.bg).setDisplaySize(w, h).setAlpha(m.locked ? 0.05 : 0.16).setDepth(1)

    const lx = x - w / 2 + 12

    // 标签
    const tagColor = m.locked ? '#303840' : m.color
    this.add.text(x + w / 2 - 8, y - h / 2 + 8, m.tag, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: tagColor,
    }).setOrigin(1, 0).setDepth(3)

    // 标题
    this.add.text(lx, y - h / 2 + 8, m.title, {
      fontFamily: '"Silkscreen", monospace', fontSize: '16px',
      color: m.locked ? '#3a4a58' : m.color,
    }).setOrigin(0, 0).setDepth(3)

    // 副标题
    this.add.text(lx, y - h / 2 + 28, m.sub, {
      fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#5a7088',
    }).setOrigin(0, 0).setDepth(3)

    // 描述
    this.add.text(lx, y - h / 2 + 46, m.desc, {
      fontFamily: '"Silkscreen", monospace', fontSize: '11px',
      color: m.locked ? '#28353f' : '#8aA0b8',
      lineSpacing: 4,
    }).setOrigin(0, 0).setDepth(3)

    if (!m.locked) {
      const btnX = x + w / 2 - 50
      const btnY = y + h / 2 - 16
      const btn = this.add.rectangle(btnX, btnY, 82, 24, 0x101e2c).setDepth(3)
      btn.setStrokeStyle(1, col, 0.8)
      this.add.text(btnX, btnY, '进入模式', {
        fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: m.color,
      }).setOrigin(0.5).setDepth(4)

      btn.setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => btn.setFillStyle(0x1a3040))
      btn.on('pointerout', () => btn.setFillStyle(0x101e2c))
      btn.on('pointerdown', () => { audioManager.playClick(); m.action() })
    } else {
      this.add.text(x + w / 2 - 50, y + h / 2 - 16, '联机功能开发中', {
        fontFamily: '"Silkscreen", monospace', fontSize: '10px', color: '#2a3840',
      }).setOrigin(0.5).setDepth(3)
    }
  }
}
