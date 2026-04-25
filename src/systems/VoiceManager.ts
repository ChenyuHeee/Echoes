/**
 * VoiceManager — 基于 Web Speech API 的英文配音系统
 * 使用浏览器内置 TTS 为游戏对话配音（免费，无需外部服务）
 *
 * 如需更高质量的配音，可集成：
 * - ElevenLabs API (https://elevenlabs.io) — 高质量 AI 配音，有免费额度
 * - OpenAI TTS (https://platform.openai.com/docs/guides/text-to-speech) — 多种声音
 * - Murf AI — 适合游戏旁白风格
 */
class VoiceManager {
  private enabled: boolean
  private voicesLoaded = false
  private cachedVoices: SpeechSynthesisVoice[] = []

  constructor() {
    this.enabled = localStorage.getItem('echoes.voice.enabled') === '1'
    // 预加载声音列表（某些浏览器需要延迟）
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.cachedVoices = window.speechSynthesis.getVoices()
        this.voicesLoaded = true
      }
      this.cachedVoices = window.speechSynthesis.getVoices()
      if (this.cachedVoices.length > 0) this.voicesLoaded = true
    }
  }

  setEnabled(v: boolean) {
    this.enabled = v
    localStorage.setItem('echoes.voice.enabled', v ? '1' : '0')
    if (!v) this.cancel()
  }

  isEnabled() {
    return this.enabled
  }

  toggle() {
    this.setEnabled(!this.enabled)
    return this.enabled
  }

  /**
   * 朗读英文文本
   * @param text 英文文本
   * @param speakerRole 'narrator' | 'navigator' | 'player' — 不同角色使用不同声音参数
   */
  speak(text: string, speakerRole: 'narrator' | 'navigator' | 'player' = 'narrator') {
    if (!this.enabled || !window.speechSynthesis || !text) return

    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-US'

    const voices = this.voicesLoaded ? this.cachedVoices : window.speechSynthesis.getVoices()

    switch (speakerRole) {
      case 'narrator': {
        // 旁白：深沉、神秘
        const voice =
          voices.find(v => v.name === 'Daniel') ||
          voices.find(v => v.name === 'Alex') ||
          voices.find(v => v.name.includes('Male') && v.lang.startsWith('en')) ||
          voices.find(v => v.lang.startsWith('en')) ||
          null
        if (voice) utt.voice = voice
        utt.rate = 0.82
        utt.pitch = 0.85
        utt.volume = 0.9
        break
      }
      case 'navigator': {
        // 导航员阿刻戎：紧促、机械感
        const voice =
          voices.find(v => v.name === 'Samantha') ||
          voices.find(v => v.name === 'Karen') ||
          voices.find(v => v.lang.startsWith('en')) ||
          null
        if (voice) utt.voice = voice
        utt.rate = 1.05
        utt.pitch = 1.1
        utt.volume = 0.85
        break
      }
      case 'player': {
        // 玩家角色：平静、内敛
        const voice =
          voices.find(v => v.name === 'Tom') ||
          voices.find(v => v.name.includes('Male') && v.lang.startsWith('en')) ||
          null
        if (voice) utt.voice = voice
        utt.rate = 0.9
        utt.pitch = 0.95
        utt.volume = 0.8
        break
      }
    }

    window.speechSynthesis.speak(utt)
  }

  cancel() {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }
}

export const voiceManager = new VoiceManager()

/**
 * 配音角色映射
 * 根据说话者名称返回配音角色类型
 */
export function getSpeakerRole(speaker: string): 'narrator' | 'navigator' | 'player' {
  if (speaker === '旁白' || speaker === 'Narrator') return 'narrator'
  if (speaker.includes('导航') || speaker.includes('阿刻戎')) return 'navigator'
  return 'player'
}
