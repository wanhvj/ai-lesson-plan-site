import { useState, useRef, useEffect } from 'react'
import './App.css'
import { renderAsync } from 'docx-preview'

type CellInfo = {
  posKey: string
  position: { t: number; r: number; c: number }
  description: string
  autoDetected: boolean
  locked: boolean
  requirement: string
  mode: 'replace' | 'multiline'
  split: 'newline' | 'blankline'
}

type TableStruct = { rows: number; colsPerRow: number[] }

type Candidate = {
  id: string
  labelHint?: string
  confidence: number
  modeHints?: Array<'replace' | 'multiline'>
  position: { t: number; r: number; c: number }
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [tables, setTables] = useState<TableStruct[]>([])
  const [cells, setCells] = useState<CellInfo[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [exampleFile, setExampleFile] = useState<File | null>(null)
  const [exampleContent, setExampleContent] = useState<string>('')
  const [showDocxPreview, setShowDocxPreview] = useState(false)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const docxPreviewRef = useRef<HTMLDivElement>(null)

  // AI 设置
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState<'严谨' | '活泼'>('严谨')
  const [detail, setDetail] = useState<'brief' | 'normal' | 'rich'>('normal')
  const [provider, setProvider] = useState<'openai' | 'doubao' | 'deepseek'>(() => (localStorage.getItem('AI_PROVIDER') as any) || 'openai')
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('AI_API_KEY') || '')
  const [modelId, setModelId] = useState<string>(() => localStorage.getItem('AI_MODEL_ID') || '')
  const [referenceContent, setReferenceContent] = useState<string>('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [fileName, setFileName] = useState('')
  // 🔥 参考文档的格式信息
  const [exampleCellFormats, setExampleCellFormats] = useState<Record<string, any>>({})

  // 编辑状态
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingDesc, setEditingDesc] = useState('')

  // 修改意见对话框
  const [feedbackCell, setFeedbackCell] = useState<CellInfo | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [showWorkspace, setShowWorkspace] = useState(false)

  // === 文件选择 ===
  const onChoose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setCells([])
    setValues({})
    setMsg('')
  }

  // === 选择示例文件（已填好的教案，作为风格参考）===
  const onChooseExample = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setExampleFile(f)
    setMsg('正在分析示例文档...')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const resp = await fetch('/api/analyze-example', { method: 'POST', body: fd })
      if (!resp.ok) throw new Error('分析示例失败')
      const data = await resp.json()
      const cellTexts: string[] = (data.cells ?? []).map((c: any) => c.text)
      // 组装成可读的文本段落
      const text = cellTexts.join('\n---\n')
      setExampleContent(text)
      setMsg(`示例已加载：${cellTexts.length} 个单元格内容`)

      // 同时深度解析示例文档的格式（段落结构、加粗信息）
      const fd2 = new FormData()
      fd2.append('file', f)
      const fmtResp = await fetch('/api/analyze-example-format', { method: 'POST', body: fd2 })
      if (fmtResp.ok) {
        const fmtData = await fmtResp.json()
        const formatsByKey: Record<string, any> = {}
        for (const cf of (fmtData.cellFormats ?? [])) {
          const key = `${cf.position.t}-${cf.position.r}-${cf.position.c}`
          formatsByKey[key] = cf
        }
        setExampleCellFormats(formatsByKey)
        const withFormat = Object.values(formatsByKey).filter((f: any) => f.autoRenderRules?.length > 0).length
        if (withFormat > 0) {
          setMsg(`示例已加载：${cellTexts.length} 个单元格内容（其中 ${withFormat} 个含格式参考）`)
        }
      }
    } catch (err: any) {
      setMsg(`示例分析失败：${err?.message ?? '未知错误'}`)
    }
  }

  // === 分析模板 ===
  const analyze = async () => {
    if (!file) { setMsg('请选择 .docx 文件'); return }
    if (!file.name.toLowerCase().endsWith('.docx')) { setMsg('只支持 .docx 文件'); return }
    const fd = new FormData()
    fd.append('file', file)
    setLoading(true)
    setMsg('解析中...')
    try {
      const resp = await fetch('/api/analyze-template', { method: 'POST', body: fd })
      if (!resp.ok) throw new Error('解析接口失败')
      const data = await resp.json()
      const candidates: Candidate[] = data?.candidates ?? []
      const tbls: TableStruct[] = (data?.tables?.structure ?? [])
      setTables(tbls)
      // 从 candidates 构建 cells（按位置去重）
      const cellMap = new Map<string, { labelHint?: string; confidence: number; modeHints?: string[] }>()
      for (const c of candidates) {
        const key = `${c.position.t}-${c.position.r}-${c.position.c}`
        const existing = cellMap.get(key)
        if (!existing || (c.labelHint && !existing.labelHint) || c.confidence > existing.confidence) {
          cellMap.set(key, {
            labelHint: c.labelHint ?? existing?.labelHint,
            confidence: c.confidence,
            modeHints: [...new Set([...(existing?.modeHints ?? []), ...(c.modeHints ?? [])])]
          })
        }
      }
      const newCells: CellInfo[] = Array.from(cellMap.entries()).map(([key, val]) => {
        const [t, r, c] = key.split('-').map(Number)
        const isMulti = (val.modeHints ?? []).includes('multiline')
        return {
          posKey: key,
          position: { t, r, c },
          description: val.labelHint ?? '',
          autoDetected: !!val.labelHint,
          locked: false,
          requirement: '',
          mode: isMulti ? 'multiline' : 'replace',
          split: 'newline' as const,
        }
      })
      // 按位置排序
      newCells.sort((a, b) => {
        if (a.position.t !== b.position.t) return a.position.t - b.position.t
        if (a.position.r !== b.position.r) return a.position.r - b.position.r
        return a.position.c - b.position.c
      })
      setCells(newCells)
      setMsg(`解析成功：${tbls.length} 个表格，${newCells.length} 个待填字段（其中 ${newCells.filter(c => c.autoDetected).length} 个已自动识别）`)
    } catch (e: any) {
      setMsg(`解析失败：${e?.message ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // === AI 自动识别字段 ===
  const autoMap = async () => {
    const needAI = cells.filter(c => !c.autoDetected && !c.description.trim())
    const hasLabel = cells.filter(c => c.autoDetected || c.description.trim())
    if (needAI.length === 0) {
      setMsg('所有字段已有描述，无需 AI 识别')
      return
    }
    if (!apiKey) { setMsg('请先填写 API Key'); return }
    setLoading(true)
    setMsg(`正在 AI 识别 ${needAI.length} 个字段...`)
    try {
      // 构建上下文：对每个要猜的格子，找它左边的标签
      const cellsForAI = needAI.map(c => {
        // 找同行左侧是否有自动识别的标签
        const left = hasLabel.find(l =>
          l.position.t === c.position.t &&
          l.position.r === c.position.r &&
          l.position.c < c.position.c
        )
        return {
          position: c.position,
          leftLabel: left?.description,
          cellText: '',
          aboveLabel: '',
        }
      })
      // 也带上有标签的作为参考
      const allCells = [
        ...hasLabel.map(c => ({ position: c.position, leftLabel: c.description, cellText: '', aboveLabel: '' })),
        ...cellsForAI,
      ]
      const resp = await fetch('/api/ai/auto-map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ cells: allCells, provider, model: modelId || undefined }),
      })
      if (!resp.ok) throw new Error(`AI 识别失败: HTTP ${resp.status}`)
      const data = await resp.json()
      const suggestions: Array<{ position: { t: number; r: number; c: number }; description: string; mode: string }> = data?.suggestions ?? []
      setCells(prev => prev.map(c => {
        const match = suggestions.find(s =>
          s.position.t === c.position.t &&
          s.position.r === c.position.r &&
          s.position.c === c.position.c
        )
        if (match && !c.description.trim()) {
          return { ...c, description: match.description, autoDetected: true }
        }
        return c
      }))
      const matched = suggestions.filter(s =>
        cells.some(c =>
          c.position.t === s.position.t &&
          c.position.r === s.position.r &&
          c.position.c === s.position.c &&
          !c.description.trim()
        )
      ).length
      setMsg(`AI 识别完成：成功识别 ${matched} 个字段`)
    } catch (e: any) {
      setMsg(`AI 识别失败：${e?.message ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // === 编辑格子描述 ===
  const startEdit = (cell: CellInfo) => {
    setEditingKey(cell.posKey)
    setEditingDesc(cell.description)
  }

  const saveEdit = (posKey: string) => {
    setCells(prev => prev.map(c =>
      c.posKey === posKey ? { ...c, description: editingDesc, autoDetected: false } : c
    ))
    setEditingKey(null)
  }

  const cancelEdit = () => {
    setEditingKey(null)
  }

  const onEditKeyDown = (e: React.KeyboardEvent, posKey: string) => {
    if (e.key === 'Enter') saveEdit(posKey)
    if (e.key === 'Escape') cancelEdit()
  }

  // === 删除格子 ===
  const removeCell = (posKey: string) => {
    setCells(prev => prev.filter(c => c.posKey !== posKey))
    setValues(prev => {
      const next = { ...prev }
      delete next[posKey]
      return next
    })
  }

  // === 锁定/解锁字段 ===
  const toggleLock = (posKey: string) => {
    setCells(prev => prev.map(c =>
      c.posKey === posKey ? { ...c, locked: !c.locked } : c
    ))
  }

  // === 打开修改意见对话框 ===
  const openFeedback = (cell: CellInfo) => {
    setFeedbackCell(cell)
    setFeedbackText('')
  }

  // === 提交修改意见并重新生成 ===
  const submitFeedback = async () => {
    const cell = feedbackCell
    if (!cell) return
    setFeedbackCell(null)
    if (!topic.trim()) { setMsg('请先填写课程主题'); return }
    if (!apiKey) { setMsg('请先填写 API Key'); return }
    setLoading(true)
    setMsg(`正在重新生成「${cell.description}」...`)
    try {
      const requestBody: any = {
        topic,
        fields: [cell.description.trim()],
        provider,
        params: { style, detailLevel: detail },
        exampleContent: exampleContent || undefined,
        referenceContent: referenceContent || undefined,
        exampleFormats: Object.values(exampleCellFormats).length > 0 ? Object.values(exampleCellFormats) : undefined,
        fieldRequirements: cell.requirement ? { [cell.description.trim()]: cell.requirement } : undefined,
        feedbackMap: feedbackText.trim() ? { [cell.description.trim()]: feedbackText.trim() } : undefined,
        mappings: [{
          fieldId: cell.description.trim(),
          position: cell.position,
          mode: cell.mode,
          split: cell.mode === 'multiline' ? cell.split : undefined,
        }],
      }
      if (modelId) requestBody.model = modelId
      const resp = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
      })
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        const errMsg = errData?.detail || errData?.error || `HTTP ${resp.status}`
        throw new Error(`AI接口失败: ${errMsg}`)
      }
      const data = await resp.json()
      const v = (data?.values ?? {}) as Record<string, string>
      const content = v[cell.description.trim()]
      if (content) {
        setValues(prev => ({ ...prev, [cell.posKey]: content }))
        setMsg(feedbackText.trim()
          ? `「${cell.description}」已按意见重新生成`
          : `「${cell.description}」已重新生成`)
      } else {
        setMsg(`AI 未返回「${cell.description}」的内容，请重试`)
      }
    } catch (e: any) {
      setMsg(`重新生成失败：${e?.message ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // === 内容修改 ===
  const onChangeValue = (posKey: string, v: string) => {
    setValues(prev => ({ ...prev, [posKey]: v }))
  }

  const onChangeRequirement = (posKey: string, v: string) => {
    setCells(prev => prev.map(c =>
      c.posKey === posKey ? { ...c, requirement: v } : c
    ))
  }

  // === Word 预览渲染 ===
  useEffect(() => {
    if (showDocxPreview && previewBlob && docxPreviewRef.current) {
      docxPreviewRef.current.innerHTML = ''
      renderAsync(previewBlob, docxPreviewRef.current, undefined, {
        className: 'docx-preview-container',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      }).then(() => {
        setMsg('预览加载完成！您可以下载或继续编辑')
      }).catch((err) => {
        console.error('预览渲染失败:', err)
        setMsg('预览加载失败，但文档已生成，您可以直接下载')
      })
    }
  }, [showDocxPreview, previewBlob])

  // === 生成 Word ===
  const generateDocx = async () => {
    if (!file) { setMsg('请先上传模板文件'); return }
    const validCells = cells.filter(c => c.description.trim())
    if (!validCells.length) { setMsg('请先设置至少一个字段的描述'); return }
    // 自动编号处理重复字段名
    const descCount = new Map<string, number>()
    const fieldMapping: Array<{ cell: CellInfo; fieldId: string }> = []
    for (const c of validCells) {
      const base = c.description.trim()
      const count = descCount.get(base) ?? 0
      descCount.set(base, count + 1)
      const fieldId = count > 0 ? `${base}_${count}` : base
      fieldMapping.push({ cell: c, fieldId })
    }
    if (fieldMapping.length !== new Set(fieldMapping.map(f => f.fieldId)).size) {
      // 保险：如果还有重复就加时间戳后缀
      const ts = Date.now().toString(36)
      fieldMapping.forEach((f, i) => { f.fieldId = `${f.fieldId}_${ts}_${i}` })
    }
    setLoading(true)
    setMsg('正在生成...')
    try {
      const mappings = fieldMapping.map(f => ({
        fieldId: f.fieldId,
        position: f.cell.position,
        mode: f.cell.mode,
        split: f.cell.mode === 'multiline' ? f.cell.split : undefined,
        // 如果有参考格式里的渲染规则，自动附加
        formatting: exampleCellFormats[f.cell.posKey]?.autoRenderRules?.length > 0 ? {
          renderRules: exampleCellFormats[f.cell.posKey].autoRenderRules,
        } : undefined,
      }))
      const vals: Record<string, string> = {}
      fieldMapping.forEach(f => { vals[f.fieldId] = values[f.cell.posKey] ?? '' })
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mapping', JSON.stringify({ mappings }))
      fd.append('values', JSON.stringify(vals))
      const resp = await fetch('/api/generate-one', { method: 'POST', body: fd })
      if (!resp.ok) throw new Error('生成接口失败')
      const blob = await resp.blob()
      setPreviewBlob(blob)
      setShowDocxPreview(true)
      setMsg('生成成功！正在加载预览...')
    } catch (e: any) {
      setMsg(`生成失败：${e?.message ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // === 下载 Word ===
  const downloadDocx = () => {
    if (!previewBlob) return
    const url = URL.createObjectURL(previewBlob)
    const a = document.createElement('a')
    const today = new Date()
    const y = today.getFullYear().toString()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    a.href = url
    a.download = fileName.trim() ? `${fileName.trim()}.docx` : `教案_生成_${y}${m}${d}.docx`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('下载已开始')
  }

  // === AI 生成内容（跳过锁定字段） ===
  const callAI = async () => {
    if (!topic.trim()) { setMsg('请填写课程主题'); return }
    const validCells = cells.filter(c => c.description.trim() && !c.locked)
    if (validCells.length === 0) {
      const allLocked = cells.every(c => c.locked)
      setMsg(allLocked ? '所有字段已锁定，无需 AI 生成' : '请先完成字段描述')
      return
    }
    if (!apiKey) { setMsg('请先填写 API Key'); return }
    setLoading(true)
    setMsg(`正在调用${provider === 'doubao' ? '豆包' : provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'} AI生成内容...`)
    try {
      // 去重：相同描述的字段只发一次给AI
      const uniqueFields = [...new Set(validCells.map(c => c.description.trim()))]
      const requestBody: any = {
        topic,
        fields: uniqueFields,
        provider,
        params: { style, detailLevel: detail },
        exampleContent: exampleContent || undefined,
        referenceContent: referenceContent || undefined,
        exampleFormats: Object.values(exampleCellFormats).length > 0 ? Object.values(exampleCellFormats) : undefined,
        fieldRequirements: Object.fromEntries(
          uniqueFields.map(f => {
            const cell = validCells.find(c => c.description.trim() === f)!
            return [f, cell.requirement || undefined]
          }).filter(([_, v]) => v)
        ),
        // 传字段映射时用去重后的唯一名
        mappings: uniqueFields.map(f => {
          const cell = validCells.find(c => c.description.trim() === f)!
          return {
            fieldId: f,
            position: cell.position,
            mode: cell.mode,
            split: cell.mode === 'multiline' ? cell.split : undefined,
          }
        }),
      }
      if (modelId) requestBody.model = modelId
      const resp = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
      })
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        const errMsg = errData?.detail || errData?.error || `HTTP ${resp.status}`
        throw new Error(`AI接口失败: ${errMsg}`)
      }
      const data = await resp.json()
      const v = (data?.values ?? {}) as Record<string, string>
      // 按描述匹配填回 values（相同描述的格子填入相同内容）
      setValues(prev => {
        const next = { ...prev }
        validCells.forEach(c => {
          const desc = c.description.trim()
          if (v[desc]) next[c.posKey] = v[desc]
        })
        return next
      })
      const filled = uniqueFields.filter(f => v[f]).length
      setMsg(`AI 内容已生成（使用${data.provider === 'doubao' ? '豆包' : data.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'}）：${filled}/${uniqueFields.length} 个字段已填充`)
    } catch (e: any) {
      setMsg(`AI生成失败：${e?.message ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // === 单独重新生成某个字段（打开修改意见对话框）===
  const regenerateField = async (cell: CellInfo) => {
    openFeedback(cell)
  }

  const filledCount = Object.values(values).filter(v => v && v.trim() !== '').length

  if (!showWorkspace) {
    return (
      <main className="landing-page">
        <section className="landing-hero">
          <div className="landing-copy">
            <div className="landing-kicker">Lesson Plan Studio</div>
            <h1>AI教案自动填写网站</h1>
            <p>上传教案模板，参考示例风格，快速生成规范、完整、可下载的 Word 教案。</p>
            <button className="landing-start" onClick={() => setShowWorkspace(true)}>
              开始制作
            </button>
          </div>
          <div className="landing-visual" aria-hidden="true">
            <div className="doc-sheet">
              <div className="doc-bar" />
              <div className="doc-title-line" />
              <div className="doc-grid">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="doc-lines">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="floating-card card-one">模板识别</div>
            <div className="floating-card card-two">AI生成</div>
            <div className="floating-card card-three">Word预览</div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="lesson-app lesson-v2" style={{ maxWidth: 960, margin: '40px auto', padding: 16 }}>
      <h2>AI教案自动填写网站</h2>

      {/* === 上传 & 分析 === */}
      <div className="top-upload-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <input type="file" accept=".docx" onChange={onChoose} />
        <button onClick={analyze} disabled={loading}>开始解析</button>
      </div>
      {/* === 示例文件上传 === */}
      <div className="reference-upload-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '4px 0' }}>
        <span style={{ fontSize: 13, color: '#666' }}>风格参考：</span>
        <input type="file" accept=".docx" onChange={onChooseExample} style={{ fontSize: 13 }} />
        {exampleFile && (
          <span style={{ fontSize: 12, color: '#4caf50' }}>✓ {exampleFile.name}</span>
        )}
        {exampleContent && !exampleFile && (
          <span style={{ fontSize: 12, color: '#999' }}>未选择</span>
        )}
      </div>
      {msg && (
        <div className="status-message" style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 4, fontSize: 13,
          background: msg.includes('失败') || msg.includes('重复') ? '#fff3e0' : '#e8f5e9',
          color: msg.includes('失败') || msg.includes('重复') ? '#e65100' : '#2e7d32',
        }}>
          {msg}
        </div>
      )}

      {/* === AI 设置 === */}
      <div className="settings-panel" style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>AI 设置</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={provider} onChange={e => { const p = e.target.value as any; setProvider(p); localStorage.setItem('AI_PROVIDER', p) }}>
            <option value="openai">OpenAI</option>
            <option value="doubao">豆包</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          <input placeholder="课程主题（必填）" value={topic} onChange={e => setTopic(e.target.value)} style={{ minWidth: 200 }} />
          <input placeholder="下载文件名（可选）" value={fileName} onChange={e => setFileName(e.target.value)} style={{ minWidth: 150 }} />
          <select value={style} onChange={e => setStyle(e.target.value as any)}>
            <option value="严谨">严谨</option>
            <option value="活泼">活泼</option>
          </select>
          <select value={detail} onChange={e => setDetail(e.target.value as any)}>
            <option value="brief">简略</option>
            <option value="normal">适中</option>
            <option value="rich">详细</option>
          </select>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder={`${provider === 'doubao' ? '豆包' : provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'} API Key`}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); localStorage.setItem('AI_API_KEY', e.target.value) }}
              style={{ minWidth: 220 }}
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {showApiKey ? '隐藏' : '显示'}
            </button>
          </div>
          {provider === 'doubao' && <input placeholder="推理接入点ID (ep-xxx)" value={modelId} onChange={e => { setModelId(e.target.value); localStorage.setItem('AI_MODEL_ID', e.target.value) }} style={{ minWidth: 200 }} />}
          {provider === 'deepseek' && <input placeholder="模型名（可选，默认 deepseek-chat）" value={modelId} onChange={e => { setModelId(e.target.value); localStorage.setItem('AI_MODEL_ID', e.target.value) }} style={{ minWidth: 220 }} />}
        </div>
        {/* 参考内容 */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>参考内容（可选）— 粘贴整段参考文字，AI 生成时会参考其内容和风格</div>
          <textarea
            value={referenceContent}
            onChange={e => setReferenceContent(e.target.value)}
            placeholder="可以粘贴一段已写好的教案内容、教学大纲或其它参考材料，AI 生成时会模仿其风格和表达方式..."
            style={{ width: '100%', minHeight: 60, boxSizing: 'border-box', fontSize: 13, resize: 'vertical' }}
          />
        </div>
      </div>

      {/* === 表格字段（可视化映射） === */}
      {cells.length > 0 && (
        <div className="fields-workspace" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>表格字段</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={autoMap} disabled={loading || !apiKey} style={{ background: '#7c4dff', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
                AI 智能识别
              </button>
              <span style={{ fontSize: 12, color: '#666', alignSelf: 'center' }}>
                {cells.filter(c => c.description.trim()).length}/{cells.length} 已描述
                {cells.some(c => c.locked) ? ` · ${cells.filter(c => c.locked).length} 已锁定` : ''}
              </span>
            </div>
          </div>

          {/* 表格可视化网格 */}
          {tables.map((t, ti) => (
            <div className="template-grid-panel" key={ti} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>表格 {ti + 1}（{t.rows} 行）</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {Array.from({ length: t.rows }).map((_, ri) => (
                    <tr key={ri}>
                      {Array.from({ length: t.colsPerRow[ri] ?? 0 }).map((__, ci) => {
                        const posKey = `${ti}-${ri}-${ci}`
                        const cell = cells.find(c => c.posKey === posKey)
                        const isEditing = editingKey === posKey
                        const isFilled = cell && values[posKey] && values[posKey].trim() !== ''
                        return (
                          <td
                            key={ci}
                            style={{
                              border: cell ? '2px solid #7c4dff' : '1px solid #e0e0e0',
                              padding: 6, minWidth: 80, minHeight: 32,
                              background: isFilled ? '#f3e5f5' : cell ? '#f3e5f5' : '#fafafa',
                              cursor: cell ? 'pointer' : 'default',
                              position: 'relative',
                            }}
                          >
                            {cell ? (
                              isEditing ? (
                                <div style={{ display: 'flex', gap: 2 }}>
                                  <input
                                    value={editingDesc}
                                    onChange={e => setEditingDesc(e.target.value)}
                                    onKeyDown={e => onEditKeyDown(e, posKey)}
                                    style={{ width: '100%', fontSize: 12, padding: '2px 4px' }}
                                    autoFocus
                                    onBlur={() => saveEdit(posKey)}
                                  />
                                </div>
                              ) : (
                                <div onClick={() => startEdit(cell)} style={{ fontSize: 12, lineHeight: 1.3 }}>
                                  {cell.description ? (
                                    <span style={{ fontWeight: 600, color: '#4a148c' }}>{cell.description}</span>
                                  ) : (
                                    <span style={{ color: '#bdbdbd', fontStyle: 'italic' }}>点击描述</span>
                                  )}
                                  {cell.autoDetected && cell.description && (
                                    <span style={{ fontSize: 10, color: '#9e9e9e', marginLeft: 4 }}>自动</span>
                                  )}
                                </div>
                              )
                            ) : (
                              <span style={{ fontSize: 11, color: '#e0e0e0' }}>-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* 字段列表 + 内容填写 */}
          <div className="content-editor-panel" style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>
              填写内容
              <span style={{ fontSize: 12, color: '#666', marginLeft: 8, fontWeight: 400 }}>
                已填写 {filledCount}/{cells.filter(c => c.description.trim()).length}
              </span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cells.filter(c => c.description.trim()).map(cell => {
                const hasContent = values[cell.posKey] && values[cell.posKey].trim() !== ''
                const isLocked = cell.locked
                return (
                  <div className="field-card" key={cell.posKey} style={{
                    border: isLocked ? '1px solid #ff9800' : hasContent ? '1px solid #4caf50' : '1px solid #e0e0e0',
                    padding: 10, borderRadius: 6,
                    background: isLocked ? '#fff8e1' : 'white',
                    opacity: isLocked ? 0.85 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{cell.description}</span>
                        <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>
                          [表{cell.position.t + 1} 行{cell.position.r + 1} 列{cell.position.c + 1}]
                          {cell.mode === 'multiline' ? ' 多行' : ''}
                          {isLocked ? ' 🔒 已锁定' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!isLocked && (
                          <button
                            onClick={() => regenerateField(cell)}
                            disabled={loading || !apiKey || !topic.trim()}
                            style={{ background: '#7c4dff', color: 'white', border: 'none', padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11, opacity: (loading || !apiKey || !topic.trim()) ? 0.5 : 1 }}
                            title="AI 重新生成此字段"
                          >
                            AI 重生成
                          </button>
                        )}
                        <button
                          onClick={() => toggleLock(cell.posKey)}
                          style={{ background: isLocked ? '#ff9800' : 'transparent', color: isLocked ? 'white' : '#ff9800', border: '1px solid #ff9800', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                          title={isLocked ? '点击解锁' : '锁定此字段，AI 生成时跳过'}
                        >
                          {isLocked ? '解锁' : '锁定'}
                        </button>
                        <button
                          onClick={() => removeCell(cell.posKey)}
                          style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}
                          title="移除这个字段"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    <textarea
                      style={{ width: '100%', minHeight: 80, fontSize: 13, boxSizing: 'border-box', background: isLocked ? '#fff8e1' : 'white' }}
                      value={values[cell.posKey] ?? ''}
                      onChange={e => onChangeValue(cell.posKey, e.target.value)}
                      placeholder={isLocked ? '已锁定，AI 生成时跳过此字段' : `请输入 ${cell.description} 的内容...`}
                      readOnly={isLocked}
                    />
                    {!isLocked && (
                      <div style={{ marginTop: 4 }}>
                        <input
                          value={cell.requirement}
                          onChange={e => onChangeRequirement(cell.posKey, e.target.value)}
                          placeholder="额外要求（可选）— 例如：总共90分钟，括号内标注各部分用时"
                          style={{ width: '100%', fontSize: 12, padding: '4px 6px', boxSizing: 'border-box', color: '#7c4dff', borderColor: '#e0e0e0' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 待描述字段提示 */}
            {cells.filter(c => !c.description.trim()).length > 0 && (
              <div style={{ marginTop: 8, padding: 8, background: '#fff8e1', borderRadius: 4, fontSize: 12, color: '#f57f17' }}>
                还有 {cells.filter(c => !c.description.trim()).length} 个字段未描述。
                点击上面表格中的紫色格子添加描述，或使用「AI 智能识别」自动识别。
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="action-bar" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={callAI} disabled={loading || !apiKey || cells.filter(c => c.description.trim()).length === 0}
              style={{ background: '#7c4dff', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
              AI 生成内容
            </button>
            <button onClick={generateDocx} disabled={loading || cells.filter(c => c.description.trim()).length === 0}
              style={{ background: '#4caf50', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
              生成 Word 预览
            </button>
          </div>
        </div>
      )}

      {/* === 操作指引 === */}
      {cells.length === 0 && !loading && (
        <div className="empty-guide" style={{ marginTop: 24, padding: 20, background: '#f5f5f5', borderRadius: 8, fontSize: 14, lineHeight: 1.8, color: '#555' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#333' }}>使用流程</div>
          <div>1. 上传一个 .docx 教案模板文件</div>
          <div>2. 点击「开始解析」，系统自动检测模板中的待填字段</div>
          <div>3. （可选）上传一个已填好的教案作为「风格参考」，AI 会模仿它的写法</div>
          <div>4. 在「AI 设置」中填写课程主题和 API Key</div>
          <div>5. 点击「AI 智能识别」让 AI 自动识别字段用途，或点击表格中的紫色格手动输入</div>
          <div>6. 点击「AI 生成内容」自动填充所有字段（如有示例，会模仿示例风格）</div>
          <div>7. 点击「生成 Word 预览」查看效果，满意后下载</div>
        </div>
      )}

      {/* === Word 预览 === */}
      {showDocxPreview && previewBlob && (
        <div className="preview-panel" style={{ marginTop: 16, padding: 16, border: '2px solid #4caf50', borderRadius: 8, background: '#f1f8f4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Word 预览</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={downloadDocx}
                style={{ background: '#4caf50', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                下载 Word 文档
              </button>
              <button onClick={() => { setShowDocxPreview(false); setPreviewBlob(null) }}
                style={{ background: 'transparent', border: '1px solid #999', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}>
                关闭
              </button>
            </div>
          </div>
          <div
            ref={docxPreviewRef}
            style={{
              maxHeight: 800, overflowY: 'auto', background: 'white', padding: 16,
              borderRadius: 4, border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          />
        </div>
      )}

      {/* === 修改意见对话框 === */}
      {feedbackCell && (
        <div
          onClick={() => setFeedbackCell(null)}
          className="feedback-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="feedback-dialog"
            style={{
              background: 'white', padding: 24, borderRadius: 8, minWidth: 400,
              maxWidth: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              修改「{feedbackCell.description}」
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              请输入对当前内容的修改意见，AI 将根据您的意见重新生成：
            </div>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="例如：内容太简略，请扩充到 5 行以上&#10;例如：增加具体案例说明&#10;例如：语言风格要更正式一些"
              style={{
                width: '100%', minHeight: 100, fontSize: 13, boxSizing: 'border-box',
                border: '1px solid #ddd', borderRadius: 4, padding: 8,
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={() => { setFeedbackCell(null); setFeedbackText('') }}
                style={{
                  background: 'transparent', border: '1px solid #999', padding: '8px 16px',
                  borderRadius: 4, cursor: 'pointer', fontSize: 13,
                }}
              >
                取消
              </button>
              <button
                onClick={submitFeedback}
                disabled={loading}
                style={{
                  background: '#7c4dff', color: 'white', border: 'none', padding: '8px 16px',
                  borderRadius: 4, cursor: 'pointer', fontSize: 13,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                继续生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
