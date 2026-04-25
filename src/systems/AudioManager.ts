/**
 * AudioManager — 基于 Web Audio API 的程序化音效系统
 * 无需音频文件，动态合成游戏音效
 */
class AudioManager {
  private ctx: AudioContext | null = null
  private muted = localStorage.getItem('echoes.audio.muted') === '1'
  private _volume = parseFloat(localStorage.getItem('echoes.audio.volume') ?? '0.7')

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  setMuted(v: boolean) {
    this.muted = v
    localStorage.setItem('echoes.audio.muted', v ? '1' : '0')
  }

  isMuted() {
    return this.muted
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v))
    localStorage.setItem('echoes.audio.volume', String(this._volume))
  }

  getVolume() {
    return this._volume
  }

  private tone(
    freq: number,
    duration: number,
    volume = 0.12,
    type: OscillatorType = 'square',
    attack = 0.005,
    decay = 0.1,
    startOffset = 0,
  ) {
    if (this.muted) return
    const ctx = this.getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const vol = volume * this._volume
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset)

    gain.gain.setValueAtTime(0, ctx.currentTime + startOffset)
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startOffset + attack)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + startOffset + attack + Math.max(duration - attack, 0.001),
    )

    osc.start(ctx.currentTime + startOffset)
    osc.stop(ctx.currentTime + startOffset + duration + decay)
  }

  private noise(duration: number, volume = 0.06, startOffset = 0) {
    if (this.muted) return
    const ctx = this.getCtx()
    const bufSize = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1

    const source = ctx.createBufferSource()
    source.buffer = buf

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume * this._volume, ctx.currentTime + startOffset)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration)

    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(ctx.currentTime + startOffset)
  }

  /** 基础射击音效 */
  playShoot() {
    this.tone(440, 0.08, 0.1, 'square')
    this.tone(260, 0.06, 0.07, 'square', 0.005, 0.05, 0.05)
    this.noise(0.05, 0.04)
  }

  /** 命中敌人 */
  playHit() {
    this.tone(200, 0.07, 0.12, 'sawtooth')
    this.noise(0.07, 0.05)
  }

  /** 敌人死亡爆碎 */
  playEnemyDeath() {
    this.tone(160, 0.12, 0.14, 'sawtooth')
    this.tone(80, 0.18, 0.1, 'sawtooth', 0.005, 0.1, 0.06)
    this.noise(0.18, 0.08)
  }

  /** 拾取物品 */
  playPickup() {
    this.tone(520, 0.06, 0.1, 'sine')
    this.tone(780, 0.1, 0.1, 'sine', 0.005, 0.08, 0.06)
  }

  /** 普通技能施放 */
  playSkill() {
    this.tone(300, 0.12, 0.14, 'sine')
    this.tone(420, 0.1, 0.12, 'sine', 0.005, 0.08, 0.07)
    this.tone(560, 0.14, 0.1, 'sine', 0.005, 0.1, 0.14)
  }

  /** 回响触发（更空灵的音效） */
  playEcho() {
    this.tone(880, 0.08, 0.08, 'sine')
    this.tone(660, 0.12, 0.07, 'sine', 0.005, 0.1, 0.06)
    this.tone(440, 0.18, 0.06, 'sine', 0.005, 0.15, 0.12)
    this.tone(1320, 0.06, 0.05, 'sine', 0.005, 0.05, 0.08)
  }

  /** 成功撤离 */
  playExtract() {
    [330, 440, 550, 660, 880].forEach((f, i) => {
      this.tone(f, 0.18, 0.11, 'sine', 0.01, 0.14, i * 0.11)
    })
  }

  /** 玩家死亡 */
  playDeath() {
    this.tone(300, 0.4, 0.18, 'sawtooth')
    this.tone(150, 0.6, 0.15, 'sawtooth', 0.01, 0.4, 0.15)
    this.noise(0.6, 0.08, 0.1)
  }

  /** 温室收取时砂 */
  playHarvest() {
    [330, 440, 550, 660].forEach((f, i) => {
      this.tone(f, 0.14, 0.1, 'sine', 0.01, 0.1, i * 0.08)
    })
  }

  /** UI 点击 */
  playClick() {
    this.tone(560, 0.05, 0.07, 'square', 0.001, 0.04)
  }

  /** 场景切换 */
  playTransition() {
    this.tone(220, 0.3, 0.1, 'sine')
    this.tone(330, 0.3, 0.08, 'sine', 0.01, 0.2, 0.1)
  }

  // ─────────────── BGM ───────────────

  private bgmTimer: ReturnType<typeof setInterval> | null = null
  private bgmStep = 0

  stopBgm() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
    this.bgmStep = 0
  }

  /**
   * 菜单/圣所背景音乐 — 缓慢流动的琶音，Am-F-C-G 循环
   * 每 3 秒一个和弦
   */
  startMenuBgm() {
    this.stopBgm()
    const chords = [
      [220, 261.6, 329.6],   // Am
      [174.6, 220, 261.6],   // F
      [130.8, 164.8, 196],   // C
      [196, 246.9, 293.7],   // G
    ]
    const play = () => {
      if (this.muted) return
      const chord = chords[this.bgmStep % chords.length]
      // 高音琶音
      chord.forEach((f, i) => this.tone(f, 2.6, 0.025, 'sine', 0.15, 2.2, i * 0.18))
      // 低音根音
      this.tone(chord[0] / 2, 2.8, 0.045, 'sine', 0.12, 2.5)
      // 高八度泛音
      this.tone(chord[1] * 2, 1.8, 0.012, 'sine', 0.2, 1.4, 0.5)
      this.bgmStep++
    }
    play()
    this.bgmTimer = setInterval(play, 3000)
  }

  /**
   * 战斗背景音乐 — 140 BPM 驱动节奏，配合旋律线
   */
  startBattleBgm() {
    this.stopBgm()
    const beatMs = 214   // 140 BPM 的 eighth-note = 214ms
    // 低音线 (8拍循环)
    const bassLine  = [110,   0, 110, 130.8,  0, 146.8, 130.8,  98]
    // 旋律线 (8拍循环)
    const melodyLine = [440,  0, 523.2,   0, 493.8, 440,   0, 392]
    // 打击节奏 pattern：kick=1, snare=2, hihat=3
    const drumPat   = [  1,  3,   2,   3,   1,   3,   2,   3]

    const play = () => {
      if (this.muted) return
      const beat = this.bgmStep % 8

      if (bassLine[beat] > 0)
        this.tone(bassLine[beat], 0.17, 0.09, 'sawtooth', 0.008, 0.14)
      if (melodyLine[beat] > 0)
        this.tone(melodyLine[beat], 0.1, 0.038, 'square', 0.008, 0.09)

      const drum = drumPat[beat]
      if (drum === 1) {  // kick
        this.tone(55, 0.14, 0.14, 'sine', 0.001, 0.12)
        this.tone(80, 0.06, 0.08, 'sine', 0.001, 0.05)
      } else if (drum === 2) {  // snare
        this.noise(0.09, 0.09)
        this.tone(180, 0.07, 0.05, 'triangle', 0.001, 0.06)
      } else if (drum === 3) {  // hihat
        this.noise(0.04, 0.03)
      }

      this.bgmStep++
    }
    play()
    this.bgmTimer = setInterval(play, beatMs)
  }
}

export const audioManager = new AudioManager()

// 读取持久化静音状态
if (localStorage.getItem('echoes.audio.muted') === '1') {
  audioManager.setMuted(true)
}
