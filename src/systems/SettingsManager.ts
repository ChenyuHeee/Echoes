/**
 * SettingsManager — 键位配置 + 设置面板
 */
import Phaser from 'phaser'
import { supabase } from '../lib/supabase'
import { audioManager } from './AudioManager'

// ─── 键位类型 ────────────────────────────────────────────────────────────────

export interface Keybindings {
  moveUp: string    // Phaser KeyCode 字符串，如 'W'
  moveDown: string
  moveLeft: string
  moveRight: string
  skill1: string    // 'ONE'
  skill2: string    // 'TWO'
  skill3: string    // 'THREE'
  extract: string   // 'E'
}

const KB_DEFAULTS: Keybindings = {
  moveUp: 'W', moveDown: 'S', moveLeft: 'A', moveRight: 'D',
  skill1: 'ONE', skill2: 'TWO', skill3: 'THREE', extract: 'E',
}

export function getKeybindings(): Keybindings {
  try {
    const s = localStorage.getItem('echoes.keybindings')
    if (s) return { ...KB_DEFAULTS, ...JSON.parse(s) as Partial<Keybindings> }
  } catch { /* ignore */ }
  return { ...KB_DEFAULTS }
}

export function saveKeybindings(kb: Keybindings): void {
  localStorage.setItem('echoes.keybindings', JSON.stringify(kb))
}

/** 将 Phaser KeyCode 字符串转换为数字 KeyCode */
export function keyCodeFromStr(str: string): number {
  return (Phaser.Input.Keyboard.KeyCodes as Record<string, number>)[str]
    ?? Phaser.Input.Keyboard.KeyCodes.W
}

// ─── 显示标签映射 ──────────────────────────────────────────────────────────

const KEY_LABELS: Record<string, string> = {
  W: 'W', A: 'A', S: 'S', D: 'D', E: 'E', R: 'R', F: 'F', G: 'G',
  H: 'H', I: 'I', J: 'J', K: 'K', L: 'L', M: 'M', N: 'N', O: 'O',
  P: 'P', Q: 'Q', T: 'T', U: 'U', V: 'V', X: 'X', Y: 'Y', Z: 'Z',
  ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5',
  SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', ZERO: '0',
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→',
  SPACE: 'Space', SHIFT: 'Shift',
}

/** 将浏览器 e.code 转换为 Phaser KeyCode 字符串 */
function domCodeToPhaserKey(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3)  // 'KeyW' → 'W'
  if (code === 'ArrowUp') return 'UP'
  if (code === 'ArrowDown') return 'DOWN'
  if (code === 'ArrowLeft') return 'LEFT'
  if (code === 'ArrowRight') return 'RIGHT'
  if (code === 'Space') return 'SPACE'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT'
  const digitMap: Record<string, string> = {
    Digit1: 'ONE', Digit2: 'TWO', Digit3: 'THREE', Digit4: 'FOUR', Digit5: 'FIVE',
    Digit6: 'SIX', Digit7: 'SEVEN', Digit8: 'EIGHT', Digit9: 'NINE', Digit0: 'ZERO',
  }
  return digitMap[code] ?? null
}

// ─── 设置面板 ──────────────────────────────────────────────────────────────

export function showSettingsPanel(options?: { onLogout?: () => void; onClose?: () => void }): void {
  if (document.getElementById('echoes-settings-panel')) return

  const overlay = document.createElement('div')
  overlay.id = 'echoes-settings-panel'
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:rgba(4,6,14,0.92)', 'display:flex', 'align-items:center',
    'justify-content:center', 'z-index:9999', 'font-family:"DotGothic16",monospace',
  ].join(';')

  const panel = document.createElement('div')
  panel.style.cssText = [
    'background:#090d1a', 'border:1px solid #2a4060', 'width:520px',
    'max-height:90vh', 'overflow-y:auto', 'display:flex', 'flex-direction:column',
  ].join(';')

  // 标题栏
  const hdr = document.createElement('div')
  hdr.style.cssText = [
    'display:flex', 'justify-content:space-between', 'align-items:center',
    'padding:14px 22px', 'border-bottom:1px solid #1a2a3a',
    'position:sticky', 'top:0', 'background:#090d1a', 'z-index:1',
  ].join(';')
  const hdrTitle = document.createElement('span')
  hdrTitle.textContent = '// 设置'
  hdrTitle.style.cssText = 'color:#c8a96e;font-size:18px;letter-spacing:2px'
  const xBtn = document.createElement('button')
  xBtn.textContent = '×'
  xBtn.style.cssText = 'background:none;border:none;color:#405060;font-size:22px;cursor:pointer;padding:0 4px'
  xBtn.onmouseenter = () => { xBtn.style.color = '#c8d8f0' }
  xBtn.onmouseleave = () => { xBtn.style.color = '#405060' }
  xBtn.onclick = cleanup
  hdr.appendChild(hdrTitle)
  hdr.appendChild(xBtn)
  panel.appendChild(hdr)

  const body = document.createElement('div')
  body.style.cssText = 'padding:18px 22px;display:flex;flex-direction:column;gap:0'

  const section = (title: string) => {
    const el = document.createElement('div')
    el.style.cssText = 'color:#7090b0;font-size:12px;letter-spacing:1px;margin:14px 0 8px'
    el.textContent = `─ ${title}`
    return el
  }
  const sep = () => {
    const el = document.createElement('hr')
    el.style.cssText = 'border:none;border-top:1px solid #141e2c;margin:10px 0'
    return el
  }

  // ── 音效音量 ─────────────────────────────────────────────────────────────
  body.appendChild(section('音效音量'))

  const volRow = document.createElement('div')
  volRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:8px'
  const volSlider = document.createElement('input')
  volSlider.type = 'range'
  volSlider.min = '0'
  volSlider.max = '100'
  volSlider.value = String(Math.round(audioManager.getVolume() * 100))
  volSlider.style.cssText = 'flex:1;accent-color:#5a8cb0;cursor:pointer'
  const volVal = document.createElement('span')
  volVal.style.cssText = 'color:#c8d8f0;font-size:13px;width:40px;text-align:right'
  volVal.textContent = `${volSlider.value}%`
  volSlider.oninput = () => {
    audioManager.setVolume(parseInt(volSlider.value) / 100)
    volVal.textContent = `${volSlider.value}%`
  }
  volRow.appendChild(volSlider)
  volRow.appendChild(volVal)
  body.appendChild(volRow)

  const muteLabel = document.createElement('label')
  muteLabel.style.cssText = 'display:flex;align-items:center;gap:8px;color:#405060;font-size:12px;cursor:pointer'
  const muteChk = document.createElement('input')
  muteChk.type = 'checkbox'
  muteChk.checked = audioManager.isMuted()
  muteChk.style.accentColor = '#5a8cb0'
  muteChk.onchange = () => audioManager.setMuted(muteChk.checked)
  muteLabel.appendChild(muteChk)
  muteLabel.appendChild(document.createTextNode('静音'))
  body.appendChild(muteLabel)

  body.appendChild(sep())

  // ── 键位设置 ─────────────────────────────────────────────────────────────
  body.appendChild(section('键位设置'))

  const KB_ITEMS: Array<{ key: keyof Keybindings; label: string }> = [
    { key: 'moveUp', label: '向上移动' },
    { key: 'moveDown', label: '向下移动' },
    { key: 'moveLeft', label: '向左移动' },
    { key: 'moveRight', label: '向右移动' },
    { key: 'skill1', label: '技能槽 1' },
    { key: 'skill2', label: '技能槽 2' },
    { key: 'skill3', label: '技能槽 3' },
    { key: 'extract', label: '撤离' },
  ]

  let kb = getKeybindings()
  let listeningFor: keyof Keybindings | null = null
  const keyBtns: Partial<Record<keyof Keybindings, HTMLButtonElement>> = {}

  const grid = document.createElement('div')
  grid.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center'

  for (const item of KB_ITEMS) {
    const lbl = document.createElement('span')
    lbl.style.cssText = 'color:#4a6a8a;font-size:12px'
    lbl.textContent = item.label

    const btn = document.createElement('button')
    btn.textContent = KEY_LABELS[kb[item.key]] ?? kb[item.key]
    btn.style.cssText = [
      'background:#060b16', 'border:1px solid #2a4060',
      'color:#90c8e8', 'font-family:"DotGothic16",monospace', 'font-size:12px',
      'padding:4px 12px', 'cursor:pointer', 'min-width:60px',
    ].join(';')
    keyBtns[item.key] = btn

    btn.onclick = () => {
      if (listeningFor) {
        const prev = keyBtns[listeningFor]
        if (prev) { prev.textContent = KEY_LABELS[kb[listeningFor]] ?? kb[listeningFor]; prev.style.borderColor = '#2a4060'; prev.style.color = '#90c8e8' }
      }
      listeningFor = item.key
      btn.textContent = '等待按键...'
      btn.style.borderColor = '#c8a96e'
      btn.style.color = '#c8a96e'
    }

    grid.appendChild(lbl)
    grid.appendChild(btn)
  }
  body.appendChild(grid)

  const kbHint = document.createElement('div')
  kbHint.style.cssText = 'color:#2a3a4a;font-size:11px;margin-top:6px'
  kbHint.textContent = '注：移动同时支持方向键 ↑↓←→，鼠标左键射击不可更改'
  body.appendChild(kbHint)

  const keyListener = (e: KeyboardEvent) => {
    if (!listeningFor) return
    e.preventDefault()
    e.stopPropagation()
    if (e.code === 'Escape') {
      const btn = keyBtns[listeningFor]!
      btn.textContent = KEY_LABELS[kb[listeningFor]] ?? kb[listeningFor]
      btn.style.borderColor = '#2a4060'
      btn.style.color = '#90c8e8'
      listeningFor = null
      return
    }
    const pkey = domCodeToPhaserKey(e.code)
    if (!pkey) return
    kb = { ...kb, [listeningFor]: pkey }
    saveKeybindings(kb)
    const btn = keyBtns[listeningFor]!
    btn.textContent = KEY_LABELS[pkey] ?? pkey
    btn.style.borderColor = '#2a4060'
    btn.style.color = '#90c8e8'
    listeningFor = null
  }
  document.addEventListener('keydown', keyListener, true)

  body.appendChild(sep())

  // ── 账户 ─────────────────────────────────────────────────────────────────
  body.appendChild(section('账户'))

  const usernameInfo = document.createElement('div')
  const savedName = localStorage.getItem('echoes.player.username') ?? '—'
  usernameInfo.style.cssText = 'color:#405060;font-size:12px;margin-bottom:8px'
  usernameInfo.textContent = `当前账户：${savedName}`
  body.appendChild(usernameInfo)

  let subpanel: HTMLDivElement | null = null
  const removeSubpanel = () => { subpanel?.remove(); subpanel = null }

  const makeBtn = (label: string, borderColor: string, color: string, onClick: () => void) => {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.style.cssText = [
      'background:#060810', `border:1px solid ${borderColor}`, `color:${color}`,
      'font-family:"DotGothic16",monospace', 'font-size:12px', 'padding:6px 14px', 'cursor:pointer',
    ].join(';')
    btn.onclick = onClick
    return btn
  }

  const showChangeUsername = () => {
    removeSubpanel()
    subpanel = document.createElement('div')
    subpanel.style.cssText = 'display:flex;flex-direction:column;gap:8px;background:#060b16;border:1px solid #2a4060;padding:12px;margin-top:8px'
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.placeholder = '新用户名（2-20字符）'
    inp.maxLength = 20
    inp.style.cssText = 'background:#060b16;border:1px solid #2a4060;color:#c8d8f0;padding:6px 10px;font-family:"DotGothic16",monospace;font-size:13px;outline:none'
    const msgEl = document.createElement('div')
    msgEl.style.cssText = 'font-size:11px;min-height:16px;color:#c06060'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px'
    const confirmBtn = makeBtn('确认', '#4a9a6a', '#7aca9a', async () => {
      const name = inp.value.trim()
      if (name.length < 2) { msgEl.textContent = '用户名至少2个字符'; return }
      confirmBtn.disabled = true
      msgEl.textContent = '更新中...'
      msgEl.style.color = '#405060'
      const { error } = await supabase.auth.updateUser({ data: { display_name: name } })
      if (error) { msgEl.textContent = error.message; msgEl.style.color = '#c06060'; confirmBtn.disabled = false; return }
      localStorage.setItem('echoes.player.username', name)
      usernameInfo.textContent = `当前账户：${name}`
      msgEl.textContent = '✓ 已更新（重启游戏后完全生效）'
      msgEl.style.color = '#5adc9a'
      setTimeout(removeSubpanel, 2000)
    })
    row.appendChild(confirmBtn)
    row.appendChild(makeBtn('取消', '#404050', '#606070', removeSubpanel))
    subpanel.appendChild(inp)
    subpanel.appendChild(msgEl)
    subpanel.appendChild(row)
    body.appendChild(subpanel)
    setTimeout(() => inp.focus(), 60)
  }

  const showChangePassword = () => {
    removeSubpanel()
    subpanel = document.createElement('div')
    subpanel.style.cssText = 'display:flex;flex-direction:column;gap:8px;background:#060b16;border:1px solid #2a4060;padding:12px;margin-top:8px'
    const mkInp = (ph: string) => {
      const i = document.createElement('input')
      i.type = 'password'
      i.placeholder = ph
      i.style.cssText = 'background:#060b16;border:1px solid #2a4060;color:#c8d8f0;padding:6px 10px;font-family:"DotGothic16",monospace;font-size:13px;outline:none'
      return i
    }
    const pw1 = mkInp('新密码（至少6位）')
    const pw2 = mkInp('确认新密码')
    const msgEl = document.createElement('div')
    msgEl.style.cssText = 'font-size:11px;min-height:16px;color:#c06060'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px'
    const confirmBtn = makeBtn('确认', '#4a9a6a', '#7aca9a', async () => {
      if (pw1.value.length < 6) { msgEl.textContent = '密码至少6位'; return }
      if (pw1.value !== pw2.value) { msgEl.textContent = '两次密码不一致'; return }
      confirmBtn.disabled = true
      msgEl.textContent = '更新中...'
      msgEl.style.color = '#405060'
      const { error } = await supabase.auth.updateUser({ password: pw1.value })
      if (error) { msgEl.textContent = error.message; msgEl.style.color = '#c06060'; confirmBtn.disabled = false; return }
      msgEl.textContent = '✓ 密码已更新'
      msgEl.style.color = '#5adc9a'
      setTimeout(removeSubpanel, 2000)
    })
    row.appendChild(confirmBtn)
    row.appendChild(makeBtn('取消', '#404050', '#606070', removeSubpanel))
    subpanel.appendChild(pw1)
    subpanel.appendChild(pw2)
    subpanel.appendChild(msgEl)
    subpanel.appendChild(row)
    body.appendChild(subpanel)
    setTimeout(() => pw1.focus(), 60)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    cleanup()
    options?.onLogout?.()
  }

  const acctRow = document.createElement('div')
  acctRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'
  acctRow.appendChild(makeBtn('修改用户名', '#2a5070', '#4a8ab0', showChangeUsername))
  acctRow.appendChild(makeBtn('修改密码', '#2a5070', '#4a8ab0', showChangePassword))
  acctRow.appendChild(makeBtn('退出登录', '#602020', '#a04040', handleLogout))
  body.appendChild(acctRow)

  panel.appendChild(body)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  function cleanup() {
    document.removeEventListener('keydown', keyListener, true)
    overlay.remove()
    options?.onClose?.()
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup() })
}

// ─── 关于对话框 ────────────────────────────────────────────────────────────

export function showAboutPanel(): void {
  if (document.getElementById('echoes-about-panel')) return

  const overlay = document.createElement('div')
  overlay.id = 'echoes-about-panel'
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:rgba(4,6,14,0.88)', 'display:flex', 'align-items:center',
    'justify-content:center', 'z-index:9999', 'font-family:"DotGothic16",monospace',
  ].join(';')

  const panel = document.createElement('div')
  panel.style.cssText = [
    'background:#090d1a', 'border:1px solid #2a4060',
    'padding:28px 36px', 'width:420px', 'display:flex', 'flex-direction:column', 'gap:16px',
  ].join(';')

  const title = document.createElement('div')
  title.style.cssText = 'color:#c8a96e;font-size:20px;letter-spacing:2px;border-bottom:1px solid #1a2a3a;padding-bottom:12px'
  title.textContent = '// 关于 Echoes'
  panel.appendChild(title)

  const rows: Array<[string, string]> = [
    ['作者', 'Chenyu He'],
    ['机构', 'Zhejiang University (ZJU)'],
    ['邮箱', 'hechenyu@zju.edu.cn'],
    ['GitHub', 'ChenyuHeee'],
    ['项目仓库', 'ChenyuHeee/Echoes'],
  ]

  for (const [label, value] of rows) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:12px;align-items:baseline'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'color:#4a6a8a;font-size:12px;min-width:70px'
    lbl.textContent = label
    const val = document.createElement('span')
    val.style.cssText = 'color:#c8d8f0;font-size:13px'
    val.textContent = value
    row.appendChild(lbl)
    row.appendChild(val)
    panel.appendChild(row)
  }

  const note = document.createElement('div')
  note.style.cssText = 'color:#2a3a4a;font-size:11px;margin-top:4px;border-top:1px solid #141e2c;padding-top:10px'
  note.textContent = '回响：破碎时间  ·  ECHOES: FRACTURED TIME'
  panel.appendChild(note)

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '关闭'
  closeBtn.style.cssText = [
    'background:#060810', 'border:1px solid #2a4060',
    'color:#4a7a9a', 'font-family:"DotGothic16",monospace', 'font-size:13px',
    'padding:8px', 'cursor:pointer', 'margin-top:4px',
  ].join(';')
  closeBtn.onclick = () => overlay.remove()
  panel.appendChild(closeBtn)

  overlay.appendChild(panel)
  document.body.appendChild(overlay)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })

  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove() })
}
