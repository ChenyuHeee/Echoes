import type { DialogueLine, LoreEntry } from '../types/game.types'

export const PROLOGUE_LINES: DialogueLine[] = [
  { speaker: '旁白', text: '时震之后，文明像玻璃一样裂开。你在碎片之间醒来。', emotion: 'mysterious' },
  { speaker: '导航员阿刻戎', text: '回响体，别发呆。时间深潜窗口只剩 90 秒。', emotion: 'urgent' },
  { speaker: '你', text: '我听见了另一个自己的枪声。', emotion: 'neutral' },
  { speaker: '导航员阿刻戎', text: '那不是幻觉，是你的上一个技能正在回响。', emotion: 'mysterious' },
]

export const SANCTUARY_LINES: DialogueLine[] = [
  { speaker: '庇护所核心', text: '欢迎回来，回响体。你的时砂温室已完成一轮收成。', emotion: 'neutral' },
  { speaker: '庇护所核心', text: '检测到新残响：一名修正者军官在蒸汽城失踪。', emotion: 'urgent' },
  { speaker: '你', text: '记录任务。下次深潜去蒸汽城旧电车库。', emotion: 'neutral' },
]

export const LORE_ENTRIES: LoreEntry[] = [
  {
    id: 'lore_steam_001',
    title: '齿轮城日报·末版',
    content:
      '今天下午 17:41，中央钟楼倒转。工厂区所有蒸汽阀门同时结晶。有人看见天空像被手指撕开，露出另一座城市的霓虹。',
    source: '蒸汽城行政厅废墟',
    fragmentId: 'steam_district',
  },
  {
    id: 'lore_forest_001',
    title: '林地守誓石碑',
    content:
      '我们不再祈祷时间复原。我们祈祷裂缝稳定，让孩子们至少拥有可以预测的明天。',
    source: '荧光森林北环祭坛',
    fragmentId: 'forest_arc',
  },
  {
    id: 'lore_cyber_001',
    title: '废网日志 #CE-77',
    content:
      '如果你读到这行字，说明缓存还在。记住：回响不是技能复制，是因果的二次结算。别在狭窄走廊里连放磁阱。',
    source: '赛博废土中继塔',
    fragmentId: 'cyber_sink',
  },
]
