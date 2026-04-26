import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { MenuScene } from './scenes/MenuScene'
import { ModeSelectScene } from './scenes/ModeSelectScene'
import { LoginScene } from './scenes/LoginScene'
import { LobbyScene } from './scenes/LobbyScene'
import { LoadoutScene } from './scenes/LoadoutScene'
import { DiveScene } from './scenes/DiveScene'
import { StormScene } from './scenes/StormScene'
import { RaceScene } from './scenes/RaceScene'
import { PuzzleScene } from './scenes/PuzzleScene'
import { SanctuaryScene } from './scenes/SanctuaryScene'
import { GachaScene } from './scenes/GachaScene'
import { HUDScene } from './scenes/HUDScene'
import { FactionScene } from './scenes/FactionScene'
import { ChatScene } from './scenes/ChatScene'

// 在 Phaser 构造前 patch text factory，使所有 add.text() 默认以物理像素密度渲染
// 这可将 Retina 屏上文字有效放大倍率从 ~3× 降至 ~1.5×，避免模糊
const _dpr = Math.max(window.devicePixelRatio || 1, 1)
if (_dpr > 1) {
  type TextFactory = (x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text
  const _origText = Phaser.GameObjects.GameObjectFactory.prototype.text as TextFactory
  ;(Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFactory }).text =
    function (x, y, text, style) {
      return _origText.call(this, x, y, text, { resolution: _dpr, ...(style ?? {}) })
    }
  // 同时 patch make.text()（GameObjectCreator），修复 Retina 屏模糊
  type TextCreator = (config: Phaser.Types.GameObjects.Text.TextConfig, addToScene?: boolean) => Phaser.GameObjects.Text
  const _origMake = Phaser.GameObjects.GameObjectCreator.prototype.text as TextCreator
  ;(Phaser.GameObjects.GameObjectCreator.prototype as unknown as { text: TextCreator }).text =
    function (config, addToScene) {
      const c = config as Phaser.Types.GameObjects.Text.TextConfig & { style?: Phaser.Types.GameObjects.Text.TextStyle }
      return _origMake.call(this, { ...c, style: { resolution: _dpr, ...(c.style ?? {}) } }, addToScene)
    }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'game-container',
  backgroundColor: '#0a0a14',
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  scene: [
    BootScene,
    MenuScene,
    ModeSelectScene,
    LoginScene,
    FactionScene,
    LobbyScene,
    LoadoutScene,
    DiveScene,
    StormScene,
    RaceScene,
    PuzzleScene,
    SanctuaryScene,
    GachaScene,
    HUDScene,
    ChatScene,
  ],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1,
  },
  render: { antialias: true, antialiasGL: true },
}

const game = new Phaser.Game(config)

;(window as Window & { __echoesGame?: Phaser.Game }).__echoesGame = game

// 隐藏HTML加载屏幕
game.events.on('ready', () => {
  const loadingScreen = document.getElementById('loading-screen')
  if (loadingScreen) {
    loadingScreen.style.transition = 'opacity 0.5s'
    loadingScreen.style.opacity = '0'
    setTimeout(() => loadingScreen.remove(), 500)
  }
})

export default game
