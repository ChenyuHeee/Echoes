/**
 * AudioManager — 基于 Web Audio API 的程序化音效系统
 * 无需音频文件，动态合成游戏音效
 */
class AudioManager {
  private ctx: AudioContext | null = null
  private muted = false

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

    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset)

    gain.gain.setValueAtTime(0, ctx.currentTime + startOffset)
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startOffset + attack)
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
    gain.gain.setValueAtTime(volume, ctx.currentTime + startOffset)
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
}

export const audioManager = new AudioManager()

// 读取持久化静音状态
if (localStorage.getItem('echoes.audio.muted') === '1') {
  audioManager.setMuted(true)
}
