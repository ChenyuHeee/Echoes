import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { MenuScene } from './scenes/MenuScene'
import { ModeSelectScene } from './scenes/ModeSelectScene'
import { LoginScene } from './scenes/LoginScene'
import { LobbyScene } from './scenes/LobbyScene'
import { DiveScene } from './scenes/DiveScene'
import { StormScene } from './scenes/StormScene'
import { RaceScene } from './scenes/RaceScene'
import { PuzzleScene } from './scenes/PuzzleScene'
import { SanctuaryScene } from './scenes/SanctuaryScene'
import { HUDScene } from './scenes/HUDScene'
import { FactionScene } from './scenes/FactionScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'game-container',
  backgroundColor: '#0a0a14',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scene: [
    BootScene,
    MenuScene,
    ModeSelectScene,
    LoginScene,
    FactionScene,
    LobbyScene,
    DiveScene,
    StormScene,
    RaceScene,
    PuzzleScene,
    SanctuaryScene,
    HUDScene,
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
  },
  render: {
    pixelArt: true,
    antialias: false,
  }
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
