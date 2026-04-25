import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    const loadingBar = document.getElementById('loading-bar')
    if (loadingBar) {
      loadingBar.style.width = '10%'
    }

    this.load.on('progress', (value: number) => {
      if (loadingBar) {
        loadingBar.style.width = `${Math.round(10 + value * 90)}%`
      }
    })

    this.load.image('player', 'assets/sprites/player.svg')
    this.load.image('teammate', 'assets/sprites/teammate.svg')
    this.load.image('player_idle', 'assets/sprites/player/player-idle.svg')
    this.load.image('player_walk_1', 'assets/sprites/player/player-walk-1.svg')
    this.load.image('player_walk_2', 'assets/sprites/player/player-walk-2.svg')
    this.load.image('player_dash', 'assets/sprites/player/player-dash.svg')
    this.load.image('bullet', 'assets/sprites/bullet-basic.svg')
    this.load.image('bullet_echo', 'assets/sprites/bullet-echo.svg')
    this.load.image('pickup', 'assets/sprites/pickup-timesand.svg')
    this.load.image('effect_echo_ring', 'assets/sprites/effects/echo-ring.svg')
    this.load.image('effect_gravity_well', 'assets/sprites/effects/gravity-well.svg')
    this.load.image('effect_toxic_cloud', 'assets/sprites/effects/toxic-cloud.svg')
    this.load.image('effect_teleport_flash', 'assets/sprites/effects/teleport-flash.svg')
    this.load.image('effect_muzzle_flash', 'assets/sprites/effects/muzzle-flash.svg')
    this.load.image('effect_pickup_shine', 'assets/sprites/effects/pickup-shine.svg')
    this.load.image('tile', 'assets/sprites/tile-steam.svg')
    this.load.image('tile_steam_a', 'assets/tiles/steam-floor-a.svg')
    this.load.image('tile_steam_b', 'assets/tiles/steam-floor-b.svg')
    this.load.image('tile_steam_c', 'assets/tiles/steam-floor-c.svg')
    this.load.image('tile_cyber_a', 'assets/tiles/cyber-floor-a.svg')
    this.load.image('tile_cyber_b', 'assets/tiles/cyber-floor-b.svg')
    this.load.image('tile_cyber_c', 'assets/tiles/cyber-floor-c.svg')
    this.load.image('tile_forest_a', 'assets/tiles/forest-floor-a.svg')
    this.load.image('tile_forest_b', 'assets/tiles/forest-floor-b.svg')
    this.load.image('tile_forest_c', 'assets/tiles/forest-floor-c.svg')
    this.load.image('enemy_basic', 'assets/sprites/enemy-basic.svg')
    this.load.image('enemy_heavy', 'assets/sprites/enemy-heavy.svg')
    this.load.image('enemy_drone', 'assets/sprites/enemy-drone.svg')
    this.load.image('enemy_hunter', 'assets/sprites/enemy-hunter.svg')
    this.load.image('enemy_wraith', 'assets/sprites/enemy-wraith.svg')
    this.load.image('enemy_boss', 'assets/sprites/enemy-boss.svg')
    this.load.image('enemy_basic_a', 'assets/sprites/enemies/basic-a.svg')
    this.load.image('enemy_basic_b', 'assets/sprites/enemies/basic-b.svg')
    this.load.image('enemy_heavy_a', 'assets/sprites/enemies/heavy-a.svg')
    this.load.image('enemy_heavy_b', 'assets/sprites/enemies/heavy-b.svg')
    this.load.image('enemy_drone_a', 'assets/sprites/enemies/drone-a.svg')
    this.load.image('enemy_drone_b', 'assets/sprites/enemies/drone-b.svg')
    this.load.image('enemy_hunter_a', 'assets/sprites/enemies/hunter-a.svg')
    this.load.image('enemy_hunter_b', 'assets/sprites/enemies/hunter-b.svg')
    this.load.image('enemy_wraith_a', 'assets/sprites/enemies/wraith-a.svg')
    this.load.image('enemy_wraith_b', 'assets/sprites/enemies/wraith-b.svg')
    this.load.image('enemy_boss_a', 'assets/sprites/enemies/boss-a.svg')
    this.load.image('enemy_boss_b', 'assets/sprites/enemies/boss-b.svg')
    this.load.image('extract_beacon', 'assets/sprites/extract-beacon.svg')
    this.load.image('title_sigil', 'assets/sprites/title-sigil.svg')
    this.load.image('prop_crate_steel', 'assets/props/crate-steel.svg')
    this.load.image('prop_pipe_column', 'assets/props/pipe-column.svg')
    this.load.image('prop_lamp_post', 'assets/props/lamp-post.svg')
    this.load.image('prop_terminal_broken', 'assets/props/terminal-broken.svg')
    this.load.image('prop_steam_vent', 'assets/props/steam-vent.svg')
    this.load.image('prop_time_crystal', 'assets/props/time-crystal.svg')
    this.load.image('prop_neon_sign', 'assets/props/neon-sign.svg')
    this.load.image('prop_fungal_tree', 'assets/props/fungal-tree.svg')
    this.load.image('prop_guild_banner', 'assets/props/guild-banner.svg')
    this.load.image('prop_crystal_pool', 'assets/props/crystal-pool.svg')
    this.load.image('prop_hover_car', 'assets/props/hover-car.svg')
    this.load.image('bg_menu', 'assets/backgrounds/menu-sky.svg')
    this.load.image('bg_menu_hero', 'assets/backgrounds/menu-hero.svg')
    this.load.image('bg_login', 'assets/backgrounds/login-terminal.svg')
    this.load.image('bg_login_hero', 'assets/backgrounds/login-hero.svg')
    this.load.image('bg_lobby', 'assets/backgrounds/lobby-grid.svg')
    this.load.image('bg_lobby_hero', 'assets/backgrounds/lobby-hero.svg')
    this.load.image('bg_sanctuary', 'assets/backgrounds/sanctuary-vault.svg')
    this.load.image('bg_sanctuary_hero', 'assets/backgrounds/sanctuary-hero.svg')
    this.load.image('bg_dive', 'assets/backgrounds/dive-foundry.svg')
    this.load.image('bg_forest', 'assets/backgrounds/forest-canopy.svg')
    this.load.image('bg_cyber', 'assets/backgrounds/cyber-sink.svg')
    this.load.image('ui_button_long', 'assets/ui/button-long.svg')
    this.load.image('ui_button_medium', 'assets/ui/button-medium.svg')
    this.load.image('ui_panel_wide', 'assets/ui/panel-wide.svg')
    this.load.image('ui_hud_box', 'assets/ui/hud-box.svg')
  }

  create() {
    const loadingBar = document.getElementById('loading-bar')
    if (loadingBar) {
      loadingBar.style.width = '100%'
    }

    const loadingScreen = document.getElementById('loading-screen')
    if (loadingScreen) {
      loadingScreen.style.transition = 'opacity 0.35s ease'
      loadingScreen.style.opacity = '0'
      window.setTimeout(() => loadingScreen.remove(), 350)
    }

    this.time.delayedCall(200, () => {
      this.scene.launch('ChatScene')   // 聊天悬浮层：全局持久并行场景
      this.scene.start('MenuScene')
    })
  }
}
