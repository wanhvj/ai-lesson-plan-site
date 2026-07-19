import { useMemo, useRef, useState } from 'react'
import './App.css'
import LessonWorkbench from './LessonWorkbench'
import PptStudio from './PptStudio'
import treeholeCoverImage from './assets/treehole-cover-mobile.webp'
import toolboxCoverImage from './assets/toolbox-cover-mobile.webp'

type ToolKey = 'home' | 'lesson' | 'ppt' | 'care' | 'treehole'
type Provider = 'openai' | 'doubao' | 'deepseek' | 'qwen' | 'openai_next' | 'ai_codex'
type TreeholeStyle = '东北逗趣' | '温和共创'
type TreeholeMessage = {
  role: 'assistant' | 'user'
  content: string
}
type FollowUpStatus = 'today' | 'soon' | 'late'
type FollowUpAction = '发消息' | '打电话' | '约面谈' | '提醒材料'
type FollowUpStudent = {
  id: string
  name: string
  group: string
  status: FollowUpStatus
  statusText: string
  action: FollowUpAction
  due: string
  reason: string
  lastContact: string
  nextNode: string
  contact: string
  note: string
}

type ToolCard = {
  key: Exclude<ToolKey, 'home'>
  title: string
  summary: string
}

const toolCards: ToolCard[] = [
  {
    key: 'lesson',
    title: '教案',
    summary: '备课与教案生成',
  },
  {
    key: 'ppt',
    title: 'PPT',
    summary: '课件与展示内容整理',
  },
  {
    key: 'care',
    title: '信息提醒助手',
    summary: '提醒跟进与常用话术',
  },
  {
    key: 'treehole',
    title: '树洞',
    summary: '吐槽、放松和情绪出口',
  },
]

const treeholeStyleMeta: Record<TreeholeStyle, { title: string; note: string; intro: string }> = {
  东北逗趣: {
    title: '东北逗趣',
    note: '更接地气，带一点东北式包袱和化解压力的劲儿。',
    intro: '我走的是接地气、带点笑劲儿的安慰路子。你尽管说，我帮你把那口闷气松一松。',
  },
  温和共创: {
    title: '温和共创',
    note: '更像陪你理顺思路的同伴老师，温柔接住，再慢慢帮你往前走。',
    intro: '我会先接住你的情绪，再陪你把事情理顺一点。你不用整理得很完整，直接说就行。',
  },
}

const initialTreeholeGreeting = (style: TreeholeStyle): TreeholeMessage => ({
  role: 'assistant',
  content: treeholeStyleMeta[style].intro,
})

const northeastAssets = {
  tea: 'https://www.svgrepo.com/show/524178/tea-cup.svg',
  bubble: 'https://www.svgrepo.com/show/475381/speech-bubble.svg',
}

function providerName(provider: Provider) {
  if (provider === 'doubao') return '豆包'
  if (provider === 'deepseek') return 'DeepSeek'
  if (provider === 'qwen') return '通义千问'
  if (provider === 'openai_next') return 'GPT-5.6 Terra'
  if (provider === 'ai_codex') return 'Ai-Codex GPT-5.6 Terra'
  return 'OpenAI'
}

function defaultModelForProvider(provider: Provider) {
  if (provider === 'qwen') return 'qwen-plus'
  if (provider === 'openai_next' || provider === 'ai_codex') return 'gpt-5.6-terra'
  return ''
}

function TearAwayCover({ imageSrc, label, onEntered }: { imageSrc: string; label: string; onEntered: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [isTearing, setIsTearing] = useState(false)

  const startTearAnimation = () => {
    if (isTearing) return

    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) {
      onEntered()
      return
    }

    const rect = image.getBoundingClientRect()
    const scale = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * scale))
    canvas.height = Math.max(1, Math.round(rect.height * scale))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      onEntered()
      return
    }

    setIsTearing(true)

    const columns = 14
    const rows = 8
    const pieceWidth = canvas.width / columns
    const pieceHeight = canvas.height / rows
    const sourceScaleX = image.naturalWidth / canvas.width
    const sourceScaleY = image.naturalHeight / canvas.height
    const centerX = canvas.width * 0.42
    const centerY = canvas.height * 0.48

    const pieces = Array.from({ length: columns * rows }, (_, index) => {
      const col = index % columns
      const row = Math.floor(index / columns)
      const x = col * pieceWidth
      const y = row * pieceHeight
      const jagged = ((col + row) % 3) * scale * 4
      const dx = x + pieceWidth / 2 - centerX
      const dy = y + pieceHeight / 2 - centerY
      const distance = Math.hypot(dx, dy) || 1
      const force = 90 + Math.random() * 220

      return {
        sx: x,
        sy: y,
        sw: pieceWidth + jagged,
        sh: pieceHeight + jagged,
        x,
        y,
        vx: (dx / distance) * force + (Math.random() - 0.5) * 160,
        vy: (dy / distance) * force + (Math.random() - 0.5) * 120,
        rotate: (Math.random() - 0.5) * 1.8,
        spin: (Math.random() - 0.5) * 3.4,
      }
    })

    const start = performance.now()
    const duration = 980

    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const ease = 1 - Math.pow(1 - progress, 3)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      pieces.forEach((piece) => {
        const px = piece.x + piece.vx * ease
        const py = piece.y + piece.vy * ease + 70 * scale * progress * progress
        const alpha = 1 - progress * 0.95

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(px + piece.sw / 2, py + piece.sh / 2)
        ctx.rotate(piece.rotate + piece.spin * ease)
        ctx.drawImage(
          image,
          piece.sx * sourceScaleX,
          piece.sy * sourceScaleY,
          piece.sw * sourceScaleX,
          piece.sh * sourceScaleY,
          -piece.sw / 2,
          -piece.sh / 2,
          piece.sw,
          piece.sh,
        )
        ctx.restore()
      })

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        onEntered()
      }
    }

    requestAnimationFrame(animate)
  }

  return (
    <div className={`tear-cover ${isTearing ? 'tearing' : ''}`}>
      <button type="button" className="tear-cover-card" aria-label={label} onClick={startTearAnimation}>
        <img ref={imageRef} src={imageSrc} alt="" />
        <canvas ref={canvasRef} className="tear-cover-canvas" />
      </button>
    </div>
  )
}

const followUpStudents: FollowUpStudent[] = [
  {
    id: 'zhang-ran',
    name: '张然',
    group: '毕业设计',
    status: 'today',
    statusText: '今天',
    action: '发消息',
    due: '今天 16:00',
    reason: '开题报告还差修改版，需要确认是否已经提交给指导老师。',
    lastContact: '3 天前提醒过一次，学生说晚上会补齐。',
    nextNode: '周五前完成开题报告终稿',
    contact: '学生本人',
    note: '语气可以直接一点，但不要让学生觉得被责备。',
  },
  {
    id: 'li-meng',
    name: '李萌',
    group: '心理指导',
    status: 'late',
    statusText: '逾期 2 天',
    action: '打电话',
    due: '原定周三回访',
    reason: '上次谈到近期睡眠不好，需要做一次温和回访。',
    lastContact: '上周面谈 20 分钟，建议先降低作业压力。',
    nextNode: '本周内确认状态，必要时约下一次面谈',
    contact: '学生本人',
    note: '不要追问太猛，先确认安全感和近期状态。',
  },
  {
    id: 'wang-yu',
    name: '王宇',
    group: '就业帮扶',
    status: 'soon',
    statusText: '明天',
    action: '约面谈',
    due: '明天 10:00',
    reason: '简历已经改过一版，需要确认投递岗位和面试准备。',
    lastContact: '昨天发过简历修改建议，学生已回复收到。',
    nextNode: '下周前完成 3 个岗位投递',
    contact: '学生本人',
    note: '可以先肯定行动，再推进下一步。',
  },
  {
    id: 'chen-xi',
    name: '陈曦',
    group: '家校沟通',
    status: 'today',
    statusText: '今天',
    action: '发消息',
    due: '今天 18:30',
    reason: '最近课堂参与度下降，需要向家长同步观察并了解家里情况。',
    lastContact: '两周前和家长沟通过作业拖延问题。',
    nextNode: '今晚先发短信，明天根据反馈决定是否电话沟通',
    contact: '家长',
    note: '先说观察，不下结论，给家长留出说明空间。',
  },
]

function CareAssistant({ onBack }: { onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [audience, setAudience] = useState<'学生' | '家长'>('学生')
  const [tone, setTone] = useState<'温和' | '直接' | '鼓励'>('温和')
  const [doneItems, setDoneItems] = useState<string[]>([])
  const [activity, setActivity] = useState('今天还没有处理记录。')

  const selected = followUpStudents.find((item) => item.id === selectedId) ?? null
  const taskItems = followUpStudents.filter((item) => item.status !== 'late')
  const lateItems = followUpStudents.filter((item) => item.status === 'late')

  const script = useMemo(() => {
    if (!selected) return ''

    if (audience === '家长') {
      return tone === '直接'
        ? `您好，我想和您同步一下${selected.name}最近的情况：${selected.reason}。想了解一下孩子在家里的状态，我们一起看看下一步怎么支持会更合适。`
        : `您好，打扰您一下。我最近在关注${selected.name}的学习和状态，想和您简单同步：${selected.reason}。如果方便，也想听听孩子在家里的情况，我们一起配合帮助孩子往前走。`
    }

    if (tone === '鼓励') {
      return `${selected.name}，你前面已经有行动了。今天我们先把下一步确认清楚：${selected.nextNode}。不用一下子全部做完，先把最关键的一步完成。`
    }

    return tone === '直接'
      ? `${selected.name}，今天需要确认一下：${selected.reason}。请你在${selected.due}前给我一个明确反馈，方便我继续帮你推进。`
      : `${selected.name}，我想跟进一下你这边的情况：${selected.reason}。你先不用紧张，看到后简单回复一下现在进展，我们一起把下一步理清楚。`
  }, [audience, selected, tone])

  const markDone = (label: string) => {
    if (!selected) return

    setDoneItems((current) => [...new Set([...current, selected.id])])
    setActivity(`${selected.name}：${label}。已建议 3 天后再次回访。`)
  }

  const renderFollowUpRow = (item: FollowUpStudent, mode: 'task' | 'late') => {
    const isDone = doneItems.includes(item.id)

    return (
      <button
        key={item.id}
        type="button"
        className={`care-inbox-row ${mode} ${isDone ? 'done' : ''}`}
        onClick={() => setSelectedId(item.id)}
      >
        <div>
          <strong>{item.name}</strong>
          <span>{item.group}</span>
        </div>
        <p>{mode === 'late' ? item.reason : item.nextNode}</p>
        <em>{mode === 'late' ? item.statusText : item.due}</em>
      </button>
    )
  }

  return (
    <div className="care-page">
      <header className="care-topbar">
        <button type="button" className="tool-shell-back" onClick={onBack}>
          返回首页
        </button>
        <div>
          <h2>沟通跟进助手</h2>
          <p>每天打开 3 分钟，把今天要联系的人处理完。</p>
        </div>
      </header>

      <section className="care-summary-strip">
        <div>
          <strong>{taskItems.length}</strong>
          <span>需要布置任务</span>
        </div>
        <div>
          <strong>{lateItems.length}</strong>
          <span>逾期需要提醒</span>
        </div>
        <div>
          <strong>{doneItems.length}</strong>
          <span>今天已处理</span>
        </div>
      </section>

      <main className="care-inbox">
        <section className="care-inbox-column task">
          <header>
            <h3>需要布置任务</h3>
            <span>先把下一步交代清楚</span>
          </header>
          <div className="care-inbox-list">
            {taskItems.map((item) => renderFollowUpRow(item, 'task'))}
          </div>
        </section>

        <section className="care-inbox-column late">
          <header>
            <h3>逾期需要提醒</h3>
            <span>先把已经拖住的事拉回来</span>
          </header>
          <div className="care-inbox-list">
            {lateItems.map((item) => renderFollowUpRow(item, 'late'))}
          </div>
        </section>
      </main>

      {selected ? (
        <div className="care-detail-overlay" onClick={() => setSelectedId(null)}>
          <section className="care-detail-drawer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="care-close-button" onClick={() => setSelectedId(null)}>
              关闭
            </button>

            <div className="care-student-head">
              <div>
                <span>{selected.group}</span>
                <h3>{selected.name}</h3>
              </div>
              <strong className={`care-pill ${selected.status}`}>{selected.statusText}</strong>
            </div>

            <div className="care-info-grid">
              <div>
                <span>为什么联系</span>
                <p>{selected.reason}</p>
              </div>
              <div>
                <span>上次记录</span>
                <p>{selected.lastContact}</p>
              </div>
              <div>
                <span>时间节点</span>
                <p>{selected.nextNode}</p>
              </div>
              <div>
                <span>联系对象</span>
                <p>{selected.contact}</p>
              </div>
            </div>

            <div className="care-script-panel compact">
              <div className="care-section-head">
                <h3>沟通助手</h3>
                <span>先生成，再确认</span>
              </div>

              <div className="care-toggle-row">
                {(['学生', '家长'] as const).map((item) => (
                  <button key={item} type="button" className={audience === item ? 'active' : ''} onClick={() => setAudience(item)}>
                    {item}
                  </button>
                ))}
              </div>

              <div className="care-toggle-row">
                {(['温和', '直接', '鼓励'] as const).map((item) => (
                  <button key={item} type="button" className={tone === item ? 'active' : ''} onClick={() => setTone(item)}>
                    {item}
                  </button>
                ))}
              </div>

              <div className="care-script-box">
                <span>{audience}话术</span>
                <p>{script}</p>
              </div>

              <div className="care-note-box">
                <span>提醒</span>
                <p>{selected.note}</p>
              </div>
            </div>

            <div className="care-action-row">
              <button type="button" onClick={() => markDone('短信草稿已生成，等待老师确认发送')}>
                生成短信
              </button>
              <button type="button" onClick={() => markDone('电话提醒已加入待办')}>
                电话提醒
              </button>
              <button type="button" onClick={() => markDone('已记录本次沟通结果')}>
                标记完成
              </button>
            </div>

            <div className="care-activity">
              <span>处理记录</span>
              <p>{activity}</p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function TeacherToolbox() {
  const [activeView, setActiveView] = useState<ToolKey>('home')
  const [treeholeStyle, setTreeholeStyle] = useState<TreeholeStyle>('温和共创')
  const [treeholeInput, setTreeholeInput] = useState('')
  const [treeholeBusy, setTreeholeBusy] = useState(false)
  const [treeholeStatus, setTreeholeStatus] = useState('')
  const [provider, setProvider] = useState<Provider>(() => (localStorage.getItem('AI_PROVIDER') as Provider) || 'openai')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('AI_API_KEY') || '')
  const [modelId, setModelId] = useState(() => localStorage.getItem('AI_MODEL_ID') || '')
  const [treeholeMessages, setTreeholeMessages] = useState<TreeholeMessage[]>([initialTreeholeGreeting('温和共创')])
  const [showHomeCover, setShowHomeCover] = useState(true)
  const [showTreeholeCover, setShowTreeholeCover] = useState(true)
  const [isDroppingNote, setIsDroppingNote] = useState(false)

  const latestTreeholeReply =
    [...treeholeMessages].reverse().find((message) => message.role === 'assistant')?.content ?? treeholeStyleMeta[treeholeStyle].intro

  const updateProvider = (value: Provider) => {
    setProvider(value)
    localStorage.setItem('AI_PROVIDER', value)
    const nextModel = defaultModelForProvider(value)
    if (nextModel) {
      setModelId(nextModel)
      localStorage.setItem('AI_MODEL_ID', nextModel)
    }
  }

  const updateApiKey = (value: string) => {
    setApiKey(value)
    localStorage.setItem('AI_API_KEY', value)
  }

  const updateModelId = (value: string) => {
    setModelId(value)
    localStorage.setItem('AI_MODEL_ID', value)
  }

  const switchTreeholeStyle = (style: TreeholeStyle) => {
    setTreeholeStyle(style)
    setTreeholeStatus(`已切换到“${style}”风格。`)
    setTreeholeMessages([initialTreeholeGreeting(style)])
  }

  const clearTreeholeChat = () => {
    setTreeholeInput('')
    setTreeholeStatus('已清空当前对话。')
    setTreeholeMessages([initialTreeholeGreeting(treeholeStyle)])
  }

  const sendTreeholeMessage = async () => {
    const content = treeholeInput.trim()
    if (!content || treeholeBusy) return
    if (!apiKey.trim()) {
      setTreeholeStatus('先填好大模型密钥，树洞才能真的回复你。')
      return
    }

    const nextMessages: TreeholeMessage[] = [...treeholeMessages, { role: 'user', content }]
    setTreeholeMessages(nextMessages)
    setTreeholeInput('')
    setTreeholeBusy(true)
    setIsDroppingNote(true)
    setTreeholeStatus('纸条投进树洞了，正在等它回信……')

    await new Promise((resolve) => window.setTimeout(resolve, 760))
    setIsDroppingNote(false)

    try {
      const response = await fetch('/api/ai/agent-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          provider,
          model: modelId || undefined,
          mode: 'treehole',
          personaStyle: treeholeStyle,
          messages: nextMessages,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || 'treehole_chat_failed')
      }

      setTreeholeMessages((current) => [...current, { role: 'assistant', content: data.reply || '我在呢，你继续说。' }])
      setTreeholeStatus(`已使用${providerName(provider)}回复。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : '回复失败，请稍后再试。'
      setTreeholeStatus(detail)
      setTreeholeMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: '我这次没能顺利回上来，但我还在。你可以再发一次，或者先检查一下上面的连接设置。',
        },
      ])
    } finally {
      setTreeholeBusy(false)
    }
  }

  if (activeView === 'lesson') {
    return (
      <div className="tool-shell">
        <div className="tool-shell-backdrop" />
        <div className="tool-shell-bar simple">
          <button type="button" className="tool-shell-back" onClick={() => setActiveView('home')}>
            返回首页
          </button>
        </div>
        <LessonWorkbench />
      </div>
    )
  }

  if (activeView === 'ppt') {
    return <PptStudio onBack={() => setActiveView('home')} />
  }

  if (activeView === 'care') {
    return <CareAssistant onBack={() => setActiveView('home')} />
  }

  if (activeView === 'treehole') {
    return (
      <div className="simple-tool-page treehole-page">
        {showTreeholeCover ? <TearAwayCover imageSrc={treeholeCoverImage} label="进入树洞" onEntered={() => setShowTreeholeCover(false)} /> : null}
        <div className="simple-tool-card wide treehole-paper-shell">
          <button type="button" className="tool-shell-back" onClick={() => setActiveView('home')}>
            返回首页
          </button>
          <h2>树洞</h2>
          <p>不只是安慰两句，而是真的按你选的说话风格来回你。</p>

          <div className="simple-tone-row">
            {(Object.keys(treeholeStyleMeta) as TreeholeStyle[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`simple-tone-chip ${treeholeStyle === item ? 'active' : ''}`}
                onClick={() => switchTreeholeStyle(item)}
              >
                <strong>{treeholeStyleMeta[item].title}</strong>
                <span>{treeholeStyleMeta[item].note}</span>
              </button>
            ))}
          </div>

          <div className="treehole-settings-grid">
            <label>
              回复服务
              <select value={provider} onChange={(event) => updateProvider(event.target.value as Provider)}>
                <option value="openai">OpenAI</option>
                <option value="doubao">豆包</option>
                <option value="deepseek">DeepSeek</option>
                <option value="qwen">通义千问（阿里云百炼）</option>
                <option value="openai_next">GPT-5.6 Terra（OpenAI Next Credits）</option>
                <option value="ai_codex">GPT-5.6 Terra（Ai-Codex）</option>
              </select>
            </label>
            <label>
              密钥
              <input
                type="password"
                value={apiKey}
                onChange={(event) => updateApiKey(event.target.value)}
                placeholder="只保存在这台设备"
              />
            </label>
            <label>
              模型名（可选）
              <input
                value={modelId}
                onChange={(event) => updateModelId(event.target.value)}
                placeholder={provider === 'doubao' ? '例如 ep-xxx' : provider === 'qwen' ? '默认 qwen-plus，也可填 qwen-max 等' : provider === 'openai_next' || provider === 'ai_codex' ? '默认 gpt-5.6-terra' : '留空则使用默认模型'}
              />
            </label>
          </div>

          <section className={`treehole-experience ritual ${treeholeStyle === '东北逗趣' ? 'northeast' : 'gentle'} ${isDroppingNote ? 'dropping' : ''} ${treeholeBusy ? 'thinking' : ''}`}>
            <div className="treehole-ritual-stage">
              <div className="treehole-collage-strip">
                <span>烦心事</span>
                <span>先丢进去</span>
                <span>{treeholeStyle}</span>
              </div>

              <div className="tree-illustration" aria-hidden="true">
                <div className="tree-crown" />
                <div className="tree-trunk">
                  <div className="tree-hole-mouth">
                    <span />
                  </div>
                </div>
                <div className="tree-ground" />
              </div>

              <div className={`flying-note ${isDroppingNote ? 'active' : ''}`}>
                {treeholeInput.trim() || '今天这事儿真让人上头'}
              </div>

              <article className={`treehole-return-note ${treeholeBusy ? 'thinking' : 'ready'}`}>
                <span>{treeholeBusy ? '树洞正在回信' : '树洞回信'}</span>
                <p>{treeholeBusy ? '纸条已经收下了，等它把情绪嚼一嚼。' : latestTreeholeReply}</p>
              </article>
            </div>

            <aside className="treehole-note-desk">
              <div className="treehole-style-card">
                <strong>{treeholeStyleMeta[treeholeStyle].title}</strong>
                <p>{treeholeStyleMeta[treeholeStyle].note}</p>
              </div>

              <label className="treehole-note-paper">
                <span>写下今天讨厌的事</span>
                <textarea
                  className="simple-treehole-input"
                  value={treeholeInput}
                  onChange={(event) => setTreeholeInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendTreeholeMessage()
                    }
                  }}
                  placeholder="比如：今天刚安静两分钟，后排又开始表演了。"
                />
              </label>

              <div className="simple-tool-actions">
                <button type="button" className="hero-primary" onClick={() => void sendTreeholeMessage()} disabled={treeholeBusy || !treeholeInput.trim()}>
                  {treeholeBusy ? '树洞正在回信…' : '投进树洞'}
                </button>
                <button type="button" className="hero-secondary" onClick={clearTreeholeChat}>
                  重新开始
                </button>
              </div>

              <div className="treehole-mini-companion" aria-hidden={treeholeStyle !== '东北逗趣'}>
                <img src={northeastAssets.tea} alt="" />
                <span>{treeholeStyle === '东北逗趣' ? '先整口热乎的' : '慢慢说'}</span>
              </div>
            </aside>
          </section>

          {treeholeStatus ? <div className="treehole-status">{treeholeStatus}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="simple-homepage toolbox-homepage">
      {showHomeCover ? <TearAwayCover imageSrc={toolboxCoverImage} label="进入教师百宝箱" onEntered={() => setShowHomeCover(false)} /> : null}
      <div className="simple-home-shell">
        <header className="simple-home-header">
          <div className="simple-home-badge">教师百宝箱</div>
          <h1>老师常用的四个工具，一页直达。</h1>
        </header>

        <section className="simple-tool-grid">
          {toolCards.map((item) => (
            <button
              key={item.key}
              type="button"
              className="simple-tool-entry"
              onClick={() => {
                if (item.key === 'treehole') setShowTreeholeCover(true)
                setActiveView(item.key)
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.summary}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}

export default TeacherToolbox
