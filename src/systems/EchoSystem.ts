import { SkillType, EchoState } from '../types/game.types'
import { SKILL_DEFINITIONS } from '../config/skills'

/**
 * 回响系统状态机
 * 核心机制：记住上一个使用的技能，在下一个技能释放时同时复现
 */
export class EchoSystem {
  private state: EchoState
  private pendingEchoTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.state = {
      lastSkill: null,
      lastSkillTimestamp: 0,
      echoMultiplier: 1.0,
      phantomEchoChance: 0,
      secondToLastSkill: null,
      echoCount: 0,
    }
  }

  getState(): EchoState {
    return { ...this.state }
  }

  setState(patch: Partial<EchoState>) {
    this.state = { ...this.state, ...patch }
  }

  /**
   * 主入口：玩家使用技能时调用
   * 返回：需要触发的回响技能（若有），以及当前使用的技能
   */
  onSkillUsed(skillId: SkillType): {
    usedSkill: SkillType
    echoSkill: SkillType | null
    echoDelay: number
    isThirdEchoTransform: boolean
  } {
    const def = SKILL_DEFINITIONS[skillId]
    const prevSkill = this.state.lastSkill
    let echoSkill: SkillType | null = null
    let isThirdEchoTransform = false

    // 检测是否触发回响（上一个技能可被回响）
    if (prevSkill && SKILL_DEFINITIONS[prevSkill].canBeEchoed) {
      echoSkill = prevSkill

      // 检测第三次回响质变
      if (this.state.echoCount >= 2 && SKILL_DEFINITIONS[prevSkill].thirdEchoTransform) {
        echoSkill = SKILL_DEFINITIONS[prevSkill].thirdEchoTransform!
        isThirdEchoTransform = true
      }
    }

    // 虚空核心被动：有概率触发上上个技能
    if (
      !echoSkill &&
      this.state.secondToLastSkill &&
      Math.random() < this.state.phantomEchoChance
    ) {
      echoSkill = this.state.secondToLastSkill
    }

    // 更新状态
    this.state = {
      ...this.state,
      secondToLastSkill: this.state.lastSkill,
      lastSkill: skillId,
      lastSkillTimestamp: Date.now(),
      echoCount: echoSkill ? this.state.echoCount + 1 : 0,
    }

    return {
      usedSkill: skillId,
      echoSkill,
      echoDelay: def.echoDelay,
      isThirdEchoTransform,
    }
  }

  /**
   * 获取当前"预演"残影信息（用于高浓度时砂区域的信息博弈）
   */
  getPhantomInfo(): { skill: SkillType | null; confidence: number } {
    if (!this.state.lastSkill) return { skill: null, confidence: 0 }
    // 置信度随时间衰减
    const elapsed = Date.now() - this.state.lastSkillTimestamp
    const confidence = Math.max(0, 1 - elapsed / 3000)
    return { skill: this.state.lastSkill, confidence }
  }

  reset() {
    if (this.pendingEchoTimer) clearTimeout(this.pendingEchoTimer)
    this.state = {
      lastSkill: null,
      lastSkillTimestamp: 0,
      echoMultiplier: 1.0,
      phantomEchoChance: 0,
      secondToLastSkill: null,
      echoCount: 0,
    }
  }
}
