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

    this.load.svg('player', 'assets/sprites/player.svg')
    this.load.svg('teammate', 'assets/sprites/teammate.svg')
    this.load.svg('player_idle', 'assets/sprites/player/player-idle.svg')
    this.load.svg('player_walk_1', 'assets/sprites/player/player-walk-1.svg')
    this.load.svg('player_walk_2', 'assets/sprites/player/player-walk-2.svg')
    this.load.svg('player_dash', 'assets/sprites/player/player-dash.svg')
    this.load.svg('bullet', 'assets/sprites/bullet-basic.svg')
    this.load.svg('bullet_echo', 'assets/sprites/bullet-echo.svg')
    this.load.svg('pickup', 'assets/sprites/pickup-timesand.svg')
    this.load.svg('effect_echo_ring', 'assets/sprites/effects/echo-ring.svg')
    this.load.svg('effect_gravity_well', 'assets/sprites/effects/gravity-well.svg')
    this.load.svg('effect_toxic_cloud', 'assets/sprites/effects/toxic-cloud.svg')
    this.load.svg('effect_teleport_flash', 'assets/sprites/effects/teleport-flash.svg')
    this.load.svg('effect_muzzle_flash', 'assets/sprites/effects/muzzle-flash.svg')
    this.load.svg('effect_pickup_shine', 'assets/sprites/effects/pickup-shine.svg')
    this.load.svg('tile', 'assets/sprites/tile-steam.svg')
    this.load.svg('tile_steam_a', 'assets/tiles/steam-floor-a.svg')
    this.load.svg('tile_steam_b', 'assets/tiles/steam-floor-b.svg')
    this.load.svg('tile_steam_c', 'assets/tiles/steam-floor-c.svg')
    this.load.svg('tile_cyber_a', 'assets/tiles/cyber-floor-a.svg')
    this.load.svg('tile_cyber_b', 'assets/tiles/cyber-floor-b.svg')
    this.load.svg('tile_cyber_c', 'assets/tiles/cyber-floor-c.svg')
    this.load.svg('tile_forest_a', 'assets/tiles/forest-floor-a.svg')
    this.load.svg('tile_forest_b', 'assets/tiles/forest-floor-b.svg')
    this.load.svg('tile_forest_c', 'assets/tiles/forest-floor-c.svg')
    this.load.svg('enemy_basic', 'assets/sprites/enemy-basic.svg')
    this.load.svg('enemy_heavy', 'assets/sprites/enemy-heavy.svg')
    this.load.svg('enemy_drone', 'assets/sprites/enemy-drone.svg')
    this.load.svg('enemy_hunter', 'assets/sprites/enemy-hunter.svg')
    this.load.svg('enemy_wraith', 'assets/sprites/enemy-wraith.svg')
    this.load.svg('enemy_boss', 'assets/sprites/enemy-boss.svg')
    this.load.svg('enemy_basic_a', 'assets/sprites/enemies/basic-a.svg')
    this.load.svg('enemy_basic_b', 'assets/sprites/enemies/basic-b.svg')
    this.load.svg('enemy_heavy_a', 'assets/sprites/enemies/heavy-a.svg')
    this.load.svg('enemy_heavy_b', 'assets/sprites/enemies/heavy-b.svg')
    this.load.svg('enemy_drone_a', 'assets/sprites/enemies/drone-a.svg')
    this.load.svg('enemy_drone_b', 'assets/sprites/enemies/drone-b.svg')
    this.load.svg('enemy_hunter_a', 'assets/sprites/enemies/hunter-a.svg')
    this.load.svg('enemy_hunter_b', 'assets/sprites/enemies/hunter-b.svg')
    this.load.svg('enemy_wraith_a', 'assets/sprites/enemies/wraith-a.svg')
    this.load.svg('enemy_wraith_b', 'assets/sprites/enemies/wraith-b.svg')
    this.load.svg('enemy_boss_a', 'assets/sprites/enemies/boss-a.svg')
    this.load.svg('enemy_boss_b', 'assets/sprites/enemies/boss-b.svg')
    this.load.svg('extract_beacon', 'assets/sprites/extract-beacon.svg')
    this.load.svg('title_sigil', 'assets/sprites/title-sigil.svg')
    this.load.svg('prop_crate_steel', 'assets/props/crate-steel.svg')
    this.load.svg('prop_pipe_column', 'assets/props/pipe-column.svg')
    this.load.svg('prop_lamp_post', 'assets/props/lamp-post.svg')
    this.load.svg('prop_terminal_broken', 'assets/props/terminal-broken.svg')
    this.load.svg('prop_steam_vent', 'assets/props/steam-vent.svg')
    this.load.svg('prop_time_crystal', 'assets/props/time-crystal.svg')
    this.load.svg('prop_neon_sign', 'assets/props/neon-sign.svg')
    this.load.svg('prop_fungal_tree', 'assets/props/fungal-tree.svg')
    this.load.svg('prop_guild_banner', 'assets/props/guild-banner.svg')
    this.load.svg('prop_crystal_pool', 'assets/props/crystal-pool.svg')
    this.load.svg('prop_hover_car', 'assets/props/hover-car.svg')
    this.load.svg('bg_menu', 'assets/backgrounds/menu-sky.svg')
    this.load.svg('bg_menu_hero', 'assets/backgrounds/menu-hero.svg')
    this.load.svg('bg_login', 'assets/backgrounds/login-terminal.svg')
    this.load.svg('bg_login_hero', 'assets/backgrounds/login-hero.svg')
    this.load.svg('bg_lobby', 'assets/backgrounds/lobby-grid.svg')
    this.load.svg('bg_lobby_hero', 'assets/backgrounds/lobby-hero.svg')
    this.load.svg('bg_sanctuary', 'assets/backgrounds/sanctuary-vault.svg')
    this.load.svg('bg_sanctuary_hero', 'assets/backgrounds/sanctuary-hero.svg')
    this.load.svg('bg_dive', 'assets/backgrounds/dive-foundry.svg')
    this.load.svg('bg_forest', 'assets/backgrounds/forest-canopy.svg')
    this.load.svg('bg_cyber', 'assets/backgrounds/cyber-sink.svg')
    this.load.svg('ui_button_long', 'assets/ui/button-long.svg')
    this.load.svg('ui_button_medium', 'assets/ui/button-medium.svg')
    this.load.svg('ui_panel_wide', 'assets/ui/panel-wide.svg')
    this.load.svg('ui_hud_box', 'assets/ui/hud-box.svg')

    // ─── 深潜装备图标 ───────────────────────────────────
    this.load.svg('item_rusty_blade',       'assets/sprites/items/rusty_blade.svg')
    this.load.svg('item_resonance_coil',    'assets/sprites/items/resonance_coil.svg')
    this.load.svg('item_void_shard',        'assets/sprites/items/void_shard.svg')
    this.load.svg('item_overclock_chip',    'assets/sprites/items/overclock_chip.svg')
    this.load.svg('item_time_weave_vest',   'assets/sprites/items/time_weave_vest.svg')
    this.load.svg('item_echo_shield',       'assets/sprites/items/echo_shield.svg')
    this.load.svg('item_nanite_patch',      'assets/sprites/items/nanite_patch.svg')
    this.load.svg('item_drift_boots',       'assets/sprites/items/drift_boots.svg')
    this.load.svg('item_chrono_lens',       'assets/sprites/items/chrono_lens.svg')
    this.load.svg('item_sand_magnet',       'assets/sprites/items/sand_magnet.svg')
    this.load.svg('item_echo_crystal_core', 'assets/sprites/items/echo_crystal_core.svg')
    this.load.svg('item_paradox_engine',    'assets/sprites/items/paradox_engine.svg')
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

    // 等待 Silkscreen 像素字体加载完毕，再启动场景
    // 否则 Phaser 会用系统 monospace 渲染文字（模糊），加载后不会自动重绘
    const startScenes = () => {
      this.time.delayedCall(200, () => {
        this.scene.launch('ChatScene')   // 聊天悬浮层：全局持久并行场景
        this.scene.start('MenuScene')
      })
    }

    Promise.race([
      document.fonts.load('16px "Silkscreen"'),
      new Promise<void>(resolve => window.setTimeout(resolve, 2500)), // 最多等 2.5s
    ]).then(startScenes).catch(startScenes)
  }
}
