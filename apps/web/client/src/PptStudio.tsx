import { useEffect, useState } from 'react'
import './App.css'

type Provider = 'openai' | 'doubao' | 'deepseek' | 'qwen' | 'openai_next' | 'ai_codex'
type Message = { role: 'assistant' | 'user'; content: string }
type SlideLayout = 'cover' | 'route' | 'compare' | 'diagram' | 'process' | 'practice' | 'diagnose' | 'closing'
type Slide = { id: string; title: string; subtitle: string; bullets: string[]; html?: string; imageTheme?: string; layout?: SlideLayout }
type Deck = { title: string; slides: Slide[] }
type CreativeDeckDesign = { fontUrl?: string; css: string; slides: Array<{ html: string }> }

const seedSlides: Omit<Slide, 'id'>[] = [
  { title: '课程主题', subtitle: '用一个问题打开今天的学习', bullets: ['认识这节课要解决的问题'], imageTheme: 'technology', layout: 'cover' },
  { title: '今天学什么', subtitle: '先建立完整的学习路线', bullets: ['为什么要学', '核心概念', '课堂练习', '课后应用'], imageTheme: 'classroom', layout: 'route' },
  { title: '从真实场景开始', subtitle: '把抽象知识放进看得见的生活里', bullets: ['一个熟悉的场景', '一个关键问题', '一次共同判断'], imageTheme: 'teamwork', layout: 'compare' },
  { title: '核心知识拆解', subtitle: '抓住最重要的三个关键词', bullets: ['概念是什么', '为什么这样做', '什么时候能用'], imageTheme: 'science', layout: 'diagram' },
  { title: '一步一步来', subtitle: '把方法变成可跟着做的路径', bullets: ['观察与提问', '分析与选择', '动手与验证'], imageTheme: 'notes', layout: 'process' },
  { title: '课堂小练习', subtitle: '用一个任务检验理解', bullets: ['读懂场景', '作出判断', '说出理由'], imageTheme: 'classroom', layout: 'practice' },
  { title: '举一反三', subtitle: '把今天的方法带到新的问题中', bullets: ['换一个生活情境', '找到相同规律', '尝试独立解决'], imageTheme: 'teamwork', layout: 'diagnose' },
  { title: '带走三个收获', subtitle: '把今天的学习变成下一次行动', bullets: ['记住一个概念', '掌握一条方法', '完成一个小行动'], imageTheme: 'technology', layout: 'closing' },
]

const photoLibrary: Record<string, string> = {
  technology: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=85',
  classroom: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1600&q=85',
  teamwork: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=85',
  science: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1600&q=85',
  notes: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1600&q=85',
}

function fallbackDeck(topic: string, count: number, request: string): Deck {
  const title = topic.trim() || '我的课堂课件'
  return {
    title,
    slides: Array.from({ length: count }, (_, index) => {
      const seed = seedSlides[index] || { title: `学习延伸 ${index - 7}`, subtitle: '留给学生继续思考与练习的空间', bullets: ['回到真实问题', '尝试新的方法', '分享自己的发现'], imageTheme: 'notes' }
      return { ...seed, id: String(index + 1).padStart(2, '0'), title: index === 0 ? title : seed.title, subtitle: index === 0 && request ? request.slice(0, 32) : seed.subtitle, bullets: [...seed.bullets] }
    }),
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cleanHtml(value: string) {
  return value
    .replace(/<\/?(?:script|iframe|object|embed|link|style)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*javascript:.*?\1/gi, '')
}

async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { detail?: unknown; error?: unknown } | null
  const message = body?.detail || body?.error
  return String(message || `${fallback}（HTTP ${response.status}）`).replace(/\s+/g, ' ').slice(0, 260)
}

function modelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'missing key') return '请先在“对话服务设置”中填写并保存 API Key。'
  if (message === 'incomplete outline') return '模型返回的页面计划不完整，请点击重试。'
  if (message === 'missing layouts') return '模型没有返回页面版式，请点击重试。'
  if (message === 'missing creative deck') return '模型没有返回完整的 HTML 设计，请点击重试。'
  return `模型调用未成功：${message || '请检查 API Key、模型名称或网络后重试。'}`
}

function fallbackMarkup(slide: Slide) {
  const cards = slide.bullets.map((item, index) => `<article class="card"><b>0${index + 1}</b><strong>${escapeHtml(item)}</strong></article>`).join('')
  return `<section class="slide ${slide.bullets.length <= 1 ? 'cover' : 'content'}"><div class="orb one"></div><div class="orb two"></div><header><span>课堂展示 · 学习时刻</span><i>${slide.id}</i></header><main><p class="kicker">LEARN · EXPLORE · CREATE</p><h1>${escapeHtml(slide.title)}</h1><p class="subtitle">${escapeHtml(slide.subtitle)}</p><div class="cards">${cards}</div></main><div class="photo"><span>真实课堂场景</span></div><footer><span>Teaching Studio</span><span>${slide.id}</span></footer></section>`
}

function markupForSlide(slide: Slide) {
  const markup = cleanHtml(slide.html || fallbackMarkup(slide))
  const withPhoto = markup.includes('class="photo"') ? markup : markup.replace('</section>', '<div class="photo"><span>真实课堂场景</span></div></section>')
  const photo = photoLibrary[slide.imageTheme || 'technology'] || photoLibrary.technology
  return withPhoto.replace('class="photo"', `class="photo" style="background-image:linear-gradient(180deg,transparent 45%,rgba(4,15,30,.72)),url('${photo}')"`)
}

function slideDocument(slide: Slide, theme: string) {
  const palette = theme === 'warm'
    ? ['#8e420e', '#f6a73a', '#fff5df', '#3b1905']
    : theme === 'playful'
      ? ['#5620a5', '#ec4899', '#f8edff', '#240a4a']
      : ['#0e4f87', '#17b8a6', '#e6fbf7', '#062a4a']
  const markupWithPhoto = markupForSlide(slide)
  const photo = photoLibrary[slide.imageTheme || 'technology'] || photoLibrary.technology
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:"Microsoft YaHei","PingFang SC",sans-serif}.slide{position:relative;overflow:hidden;width:100%;height:100%;padding:8.5% 9%;color:#fff;background:linear-gradient(130deg,${palette[0]} 0%,${palette[3]} 100%)}.slide:before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.06),transparent 42%);pointer-events:none}.orb{position:absolute;border-radius:50%;filter:blur(1px);opacity:.7}.orb.one{width:43%;aspect-ratio:1;right:-11%;top:-23%;border:1px solid rgba(255,255,255,.3);box-shadow:0 0 0 34px rgba(255,255,255,.05),0 0 0 68px rgba(255,255,255,.035)}.orb.two{width:20%;aspect-ratio:1;left:-9%;bottom:-10%;background:${palette[1]};opacity:.26;filter:blur(28px)}header,footer{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;font-size:clamp(10px,1.15vw,18px);letter-spacing:.12em}header span{color:${palette[2]};font-weight:800}header i{font-style:normal;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:.35em .65em}main{position:relative;z-index:2;margin-top:11%;max-width:66%}.kicker{margin:0 0 1.2em;color:${palette[2]};font-size:clamp(9px,1vw,16px);letter-spacing:.2em}h1{margin:0;font-size:clamp(34px,6.2vw,88px);line-height:1.08;letter-spacing:-.06em}.subtitle{margin:1.1em 0 0;color:rgba(255,255,255,.83);font-size:clamp(15px,1.8vw,29px);line-height:1.55}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.3vw;margin-top:5.5%}.card{display:flex;align-items:center;gap:1em;padding:1.15em 1.25em;border:1px solid rgba(255,255,255,.22);border-radius:13px;background:rgba(255,255,255,.09);backdrop-filter:blur(8px);font-size:clamp(13px,1.45vw,23px)}.card b{color:${palette[2]};font-size:.74em;letter-spacing:.08em}.card strong{line-height:1.35}.photo{position:absolute;right:7%;bottom:13%;width:28%;height:50%;z-index:1;border:8px solid rgba(255,255,255,.14);border-radius:18px;background:linear-gradient(180deg,transparent 45%,rgba(4,15,30,.72)),url('${photo}') center/cover;box-shadow:0 20px 50px rgba(0,0,0,.28);transform:rotate(3deg)}.photo span{position:absolute;left:15px;bottom:14px;font-size:clamp(10px,.9vw,14px);letter-spacing:.08em}footer{position:absolute;left:9%;right:9%;bottom:7%;color:rgba(255,255,255,.55);font-size:clamp(8px,.85vw,13px);letter-spacing:.14em}.cover main{margin-top:14%;max-width:62%}.cover h1{font-size:clamp(44px,7.4vw,106px)}.cover .cards{grid-template-columns:1fr;max-width:78%;margin-top:4%}.cover .card{background:${palette[1]};border-color:transparent}.cover .photo{right:6%;bottom:10%;width:33%;height:62%;transform:rotate(5deg)}.quote{margin-top:5%;padding:1.3em 1.5em;border-left:4px solid ${palette[1]};background:rgba(255,255,255,.08);font-size:clamp(15px,1.6vw,25px);line-height:1.6}.timeline{display:flex;gap:1.6em;margin-top:6%}.timeline article{flex:1;padding-top:1em;border-top:2px solid ${palette[1]}.timeline b{display:block;color:${palette[2]};font-size:.85em}.timeline strong{display:block;margin-top:.5em;font-size:clamp(15px,1.55vw,24px)}
  </style></head><body>${markupWithPhoto}</body></html>`
}

// 单页预览模板保留为后续局部导出入口；当前主流程使用整套独立 HTML。
void slideDocument

function deckDocument(deck: Deck, theme: string, startAt = 0) {
  const palette = theme === 'warm'
    ? ['#8e420e', '#f6a73a', '#fff5df', '#3b1905']
    : theme === 'playful'
      ? ['#5620a5', '#ec4899', '#f8edff', '#240a4a']
      : ['#0e4f87', '#17b8a6', '#e6fbf7', '#062a4a']
  const slides = deck.slides.map((slide, index) => markupForSlide(slide).replace('<section ', `<section data-index="${index}" `)).join('\n')
  const photoRules = deck.slides.map((slide, index) => `.slide[data-index="${index}"] .photo{background-image:linear-gradient(180deg,transparent 45%,rgba(4,15,30,.72)),url('${photoLibrary[slide.imageTheme || 'technology'] || photoLibrary.technology}')}`).join('\n')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(deck.title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Playfair+Display:wght@500;700&display=swap" rel="stylesheet"><style>
/* === 固定 16:9 舞台：1920×1080 按比例缩放 === */
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#061426}.deck-viewport{position:fixed;inset:0;overflow:hidden;background:#061426}.deck-stage{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;transform-origin:0 0}.slide{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;visibility:hidden;opacity:0;pointer-events:none;background:linear-gradient(128deg,${palette[0]},${palette[3]});transition:opacity .62s cubic-bezier(.16,1,.3,1)}.slide.active,.slide.visible{visibility:visible;opacity:1;pointer-events:auto;z-index:1}
/* === 教学杂志视觉系统 === */
.slide{padding:92px 118px;color:#fff;font-family:"Noto Sans SC",sans-serif}.slide:before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.07),transparent 42%);pointer-events:none}.orb{position:absolute;border-radius:50%;opacity:.7}.orb.one{width:700px;height:700px;right:-160px;top:-270px;border:1px solid rgba(255,255,255,.3);box-shadow:0 0 0 54px rgba(255,255,255,.05),0 0 0 108px rgba(255,255,255,.03)}.orb.two{width:360px;height:360px;left:-130px;bottom:-140px;background:${palette[1]};filter:blur(45px);opacity:.28}.slide header,.slide footer{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;font-size:20px;letter-spacing:.14em}.slide header span{color:${palette[2]};font-weight:900}.slide header i{font-style:normal;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 14px}.slide main{position:relative;z-index:2;max-width:1180px;margin-top:110px}.kicker{margin:0 0 24px;color:${palette[2]};font-size:18px;letter-spacing:.24em}.slide h1{max-width:1050px;margin:0;font-family:"Playfair Display","Noto Sans SC",serif;font-size:110px;line-height:1.06;letter-spacing:-.06em}.subtitle{max-width:880px;margin:30px 0 0;color:rgba(255,255,255,.86);font-size:32px;line-height:1.55}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:22px;max-width:1060px;margin-top:58px}.card{display:flex;align-items:center;gap:20px;min-height:92px;padding:21px 26px;border:1px solid rgba(255,255,255,.23);border-radius:16px;background:rgba(255,255,255,.09);font-size:26px}.card b{color:${palette[2]};font-size:17px;letter-spacing:.1em}.photo{position:absolute;right:130px;bottom:145px;width:500px;height:545px;z-index:1;border:9px solid rgba(255,255,255,.15);border-radius:22px;background-position:center;background-size:cover;box-shadow:0 28px 70px rgba(0,0,0,.32);transform:rotate(3deg)}.photo span{position:absolute;left:24px;bottom:22px;font-size:16px;letter-spacing:.1em}.slide footer{position:absolute;left:118px;right:118px;bottom:72px;color:rgba(255,255,255,.58);font-size:15px}.cover main{margin-top:155px;max-width:1050px}.cover h1{font-size:132px}.cover .cards{grid-template-columns:1fr;max-width:580px;margin-top:42px}.cover .card{background:${palette[1]};border-color:transparent}.cover .photo{width:590px;height:650px;right:105px;bottom:120px;transform:rotate(5deg)}.quote{max-width:880px;margin-top:60px;padding:28px 35px;border-left:6px solid ${palette[1]};background:rgba(255,255,255,.08);font-size:32px;line-height:1.6}.timeline{display:flex;gap:32px;margin-top:72px;max-width:1120px}.timeline article{flex:1;padding-top:22px;border-top:3px solid ${palette[1]}.timeline b{display:block;color:${palette[2]};font-size:19px}.timeline strong{display:block;margin-top:14px;font-size:27px}.deck-controls{position:fixed;left:50%;bottom:26px;z-index:20;display:flex;align-items:center;gap:12px;transform:translateX(-50%);padding:9px 12px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(3,12,24,.68);backdrop-filter:blur(12px);color:#fff;font:500 14px "Noto Sans SC",sans-serif}.deck-controls button{border:0;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer}.deck-controls button:hover{background:${palette[1]};color:#062a4a}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.2ms!important}}@media print{html,body{width:1920px;height:auto;overflow:visible;background:#fff}.deck-viewport{position:static;overflow:visible}.deck-stage{position:static;width:auto;height:auto;transform:none!important}.slide{position:relative;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:1920px;height:1080px;break-after:page}.deck-controls{display:none!important}}${photoRules}
</style></head><body><div class="deck-viewport"><main class="deck-stage" id="deckStage">${slides}</main></div><nav class="deck-controls" aria-label="课件控制"><button id="prev" aria-label="上一页" onclick="move(-1)">←</button><span id="counter">1 / ${deck.slides.length}</span><button id="next" aria-label="下一页" onclick="move(1)">→</button></nav><script>
/* === 翻页与固定画布缩放 === */
const slides=[...document.querySelectorAll('.slide')],stage=document.getElementById('deckStage'),counter=document.getElementById('counter');let index=${startAt};function scale(){const s=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform='translate('+((innerWidth-1920*s)/2)+'px,'+((innerHeight-1080*s)/2)+'px) scale('+s+')'}function show(next){index=Math.max(0,Math.min(next,slides.length-1));slides.forEach((slide,i)=>slide.classList.toggle('active',i===index));counter.textContent=(index+1)+' / '+slides.length}function move(step){show(index+step)}addEventListener('resize',scale);addEventListener('keydown',e=>{if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();move(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();move(-1)}if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1)});let startX=0;addEventListener('touchstart',e=>startX=e.changedTouches[0].screenX,{passive:true});addEventListener('touchend',e=>{const d=e.changedTouches[0].screenX-startX;if(Math.abs(d)>45)move(d<0?1:-1)},{passive:true});document.getElementById('prev').onclick=()=>move(-1);document.getElementById('next').onclick=()=>move(1);scale();show(index);
</script></body></html>`
}

// 旧版模板保留在源文件中，便于后续迁移已有课件；当前页面使用下方自适应课件。
void deckDocument

// 这套排版不是“套一张卡片”。模型为每页选择叙事结构，前端再将其稳定地渲染成 16:9 课件。
const layoutCycle: SlideLayout[] = ['cover', 'route', 'compare', 'diagram', 'process', 'practice', 'diagnose', 'closing']
const presentationPhotos = [
  'https://images.unsplash.com/photo-1581092160607-5c69a8ed9e09?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1565043666747-69f6646db940?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1800&q=85',
]

function renderAdaptiveSlide(slide: Slide, index: number, total: number) {
  const layout = slide.layout || layoutCycle[index % layoutCycle.length]
  const title = escapeHtml(slide.title || '课堂学习')
  const subtitle = escapeHtml(slide.subtitle || '')
  const bullets = (slide.bullets || []).filter(Boolean).slice(0, 4).map((item, itemIndex) => `<li data-edit><b>0${itemIndex + 1}</b><span>${escapeHtml(item)}</span></li>`).join('')
  const first = escapeHtml(slide.bullets?.[0] || '观察现象，提出自己的判断')
  const rest = (slide.bullets || []).slice(1, 4).map((item, itemIndex) => `<p data-edit><b>0${itemIndex + 2}</b>${escapeHtml(item)}</p>`).join('')
  const photo = presentationPhotos[index % presentationPhotos.length]
  const chrome = `<header class="deck-chrome"><span>课堂课件 · ${String(index + 1).padStart(2, '0')}</span><i>${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</i></header>`
  const footer = `<footer><span>Teaching Studio</span><span>← / → 翻页</span></footer>`
  const heading = `<p class="eyebrow">LEARN · UNDERSTAND · APPLY</p><h1 data-edit>${title}</h1><p class="deck-subtitle" data-edit>${subtitle}</p>`

  let body = ''
  if (layout === 'cover') body = `<div class="cover-image" style="background-image:url('${photo}')"></div><main class="cover-copy">${heading}<div class="cover-rule"></div><p class="cover-note" data-edit>${first}</p></main>`
  if (layout === 'route') body = `<main class="route-copy">${heading}<ol class="learning-route">${bullets}</ol></main><aside class="route-mark"><span>从问题出发</span><b>${String(index + 1).padStart(2, '0')}</b></aside>`
  if (layout === 'compare') body = `<main class="compare-copy">${heading}<div class="compare-board"><article><small>先看</small><strong data-edit>${first}</strong></article><article><small>再想</small>${rest || '<p data-edit><b>02</b>用证据支撑判断</p>'}</article></div></main><div class="side-photo" style="background-image:url('${photo}')"></div>`
  if (layout === 'diagram') body = `<main class="diagram-copy">${heading}<div class="blueprint"><div class="wire horizontal"></div><div class="wire vertical one"></div><div class="wire vertical two"></div><article data-edit><b>输入</b><span>${first}</span></article><article data-edit><b>过程</b><span>${escapeHtml(slide.bullets?.[1] || '连接关键概念')}</span></article><article data-edit><b>结果</b><span>${escapeHtml(slide.bullets?.[2] || '得到可验证的结论')}</span></article><em>用图示读懂关系</em></div></main>`
  if (layout === 'process') body = `<main class="process-copy">${heading}<div class="process-line">${bullets}</div></main><div class="process-orb"></div>`
  if (layout === 'practice') body = `<div class="practice-image" style="background-image:url('${photo}')"><span>课堂任务</span></div><main class="practice-copy">${heading}<ul class="check-list">${bullets}</ul><p class="craft-note">先观察，再操作；每一步都留下可检查的依据。</p></main>`
  if (layout === 'diagnose') body = `<main class="diagnose-copy">${heading}<div class="diagnose-grid"><article><small>现象 / 问题</small><strong data-edit>${first}</strong></article><article><small>排查路径</small>${rest || '<p data-edit><b>02</b>从条件、过程与结果逐项核对</p>'}</article></div></main><aside class="warning-mark">!</aside>`
  if (layout === 'closing') body = `<div class="closing-image" style="background-image:url('${photo}')"></div><main class="closing-copy">${heading}<ul class="closing-list">${bullets}</ul><p class="closing-question" data-edit>带着这个问题，完成下一次练习。</p></main>`
  return `<section class="slide layout-${layout}" data-index="${index}">${chrome}${body}${footer}</section>`
}

function adaptiveDeckDocument(deck: Deck, startAt = 0) {
  const slides = deck.slides.map((slide, index) => renderAdaptiveSlide(slide, index, deck.slides.length)).join('\n')
  const storageKey = JSON.stringify(`ppt-edits:${deck.title}`)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(deck.title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;800;900&family=Noto+Serif+SC:wght@700;900&display=swap" rel="stylesheet"><style>
/* === 视觉变量：工业蓝图 × 教学杂志 === */
:root{--stage-bg:#071a2f;--slide-bg:#f5f1e8;--ink:#09233c;--blue:#07569d;--cyan:#59d4e7;--orange:#f05a28;--paper:#f5f1e8;--muted:#557082;--ease:cubic-bezier(.16,1,.3,1)}*{box-sizing:border-box}body{font-family:"Noto Sans SC",sans-serif;color:var(--ink)}
/* === 固定 16:9 舞台：所有内容按 1920×1080 绘制 === */
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--stage-bg)}.deck-viewport{position:fixed;inset:0;overflow:hidden;background:var(--stage-bg)}.deck-stage{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;transform-origin:0 0;background:var(--slide-bg)}.slide{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;display:block;visibility:hidden;opacity:0;pointer-events:none;background:var(--slide-bg);transition:opacity .55s var(--ease)}.slide.active,.slide.visible{visibility:visible;opacity:1;pointer-events:auto;z-index:1}img,video,canvas,svg{max-width:100%;max-height:100%}.deck-controls{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1000}@media print{html,body{width:1920px;height:auto;overflow:visible;background:#fff}.deck-viewport{position:static;overflow:visible;background:#fff}.deck-stage{position:static;width:auto;height:auto;transform:none!important;background:none}.slide{position:relative;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:1920px;height:1080px;break-after:page;page-break-after:always}.slide:last-child{break-after:auto;page-break-after:auto}.deck-controls{display:none!important}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.2ms!important}}
/* === 共用排版与进入动画 === */
.slide:before{content:"";position:absolute;inset:0;background-image:linear-gradient(#07569d0e 1px,transparent 1px),linear-gradient(90deg,#07569d0e 1px,transparent 1px);background-size:54px 54px;pointer-events:none}.deck-chrome{position:absolute;left:108px;right:108px;top:66px;z-index:4;display:flex;justify-content:space-between;align-items:center;color:var(--blue);font-size:18px;font-weight:800;letter-spacing:.16em}.deck-chrome i{padding:8px 13px;border:1px solid #07569d55;border-radius:999px;font-style:normal;font-size:15px}.slide footer{position:absolute;left:108px;right:108px;bottom:58px;z-index:4;display:flex;justify-content:space-between;color:#547080;font-size:15px;letter-spacing:.12em}.eyebrow{margin:0 0 20px;color:var(--orange);font-size:18px;font-weight:900;letter-spacing:.2em}.slide h1{max-width:1120px;margin:0;font-family:"Noto Serif SC",serif;font-size:96px;line-height:1.1;letter-spacing:-.06em}.deck-subtitle{max-width:900px;margin:26px 0 0;color:#466275;font-size:29px;line-height:1.55}.slide.active [data-edit],.slide.active .deck-chrome,.slide.active footer{animation:rise .65s var(--ease) both}.slide.active .deck-subtitle{animation-delay:.1s}.slide.active li:nth-child(1),.slide.active article:nth-child(1){animation-delay:.16s}.slide.active li:nth-child(2),.slide.active article:nth-child(2){animation-delay:.25s}.slide.active li:nth-child(3),.slide.active article:nth-child(3){animation-delay:.34s}.slide.active li:nth-child(4){animation-delay:.42s}@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
/* === 封面：大图与高对比标题 === */
.layout-cover{color:#fff;background:#061a30}.layout-cover:before{background:linear-gradient(90deg,#061a30 5%,#061a30e8 43%,#061a3060 100%)}.cover-image{position:absolute;inset:0;background-position:center;background-size:cover;filter:saturate(.75)}.cover-copy{position:relative;z-index:2;padding:252px 130px;width:1260px}.layout-cover .deck-chrome,.layout-cover footer{color:#a5eefa}.layout-cover .eyebrow{color:#8beaf8}.layout-cover h1{font-size:124px;text-shadow:0 3px 0 #0005}.layout-cover .deck-subtitle{color:#d4f8ff}.cover-rule{width:170px;height:12px;margin:52px 0 28px;background:var(--orange)}.cover-note{max-width:700px;font-size:29px;line-height:1.55;color:#d9f8ff}
/* === 学习路线：不使用通用卡片，使用一条课堂路径 === */
.route-copy{padding:220px 130px}.learning-route{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;max-width:1460px;margin:80px 0 0;padding:0;list-style:none}.learning-route:before{content:"";position:absolute;top:43px;left:35px;right:35px;height:5px;background:#78bdca}.learning-route li{position:relative;padding:110px 22px 24px;background:#fff;border-top:9px solid var(--blue);box-shadow:15px 15px 0 #07569d12;font-size:24px;line-height:1.45}.learning-route li b{position:absolute;top:0;left:22px;font-family:"Noto Serif SC";font-size:74px;line-height:1;color:#d7eaf0}.learning-route li span{position:relative}.route-mark{position:absolute;right:130px;top:235px;width:250px;height:250px;display:grid;align-content:center;justify-items:center;border:2px solid var(--orange);border-radius:50%;color:var(--orange);transform:rotate(8deg)}.route-mark span{font-size:18px;font-weight:800;letter-spacing:.12em}.route-mark b{font-family:"Noto Serif SC";font-size:76px;line-height:1}
/* === 对比页：两种判断放在同一观察框中 === */
.compare-copy{padding:205px 700px 0 130px}.compare-board{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:60px}.compare-board article{min-height:270px;padding:34px;border:1px solid #b7cdd2;background:#fff}.compare-board article:first-child{background:#dff3f5;border-top:10px solid var(--blue)}.compare-board small,.diagnose-grid small{display:block;margin-bottom:24px;color:var(--blue);font-size:17px;font-weight:900;letter-spacing:.13em}.compare-board strong{display:block;font-family:"Noto Serif SC";font-size:36px;line-height:1.4}.compare-board p,.diagnose-grid p{display:flex;gap:14px;margin:13px 0;color:#38576b;font-size:21px;line-height:1.45}.compare-board p b,.diagnose-grid p b{color:var(--orange)}.side-photo{position:absolute;right:100px;top:195px;width:500px;height:680px;background-position:center;background-size:cover;box-shadow:28px 28px 0 var(--orange);transform:rotate(3deg)}
/* === 原理图页：用蓝图关系替代文字堆砌 === */
.diagram-copy{padding:200px 130px}.blueprint{position:relative;width:1500px;height:500px;margin-top:56px;overflow:hidden;padding:120px 100px;background:#064d8e;background-image:linear-gradient(#8feafa33 1px,transparent 1px),linear-gradient(90deg,#8feafa33 1px,transparent 1px);background-size:42px 42px}.blueprint .wire{position:absolute;background:#9ceff8}.blueprint .horizontal{left:148px;right:148px;top:230px;height:5px}.blueprint .vertical{top:130px;bottom:130px;width:5px}.blueprint .one{left:330px}.blueprint .two{right:330px}.blueprint article{position:relative;z-index:2;display:inline-grid;width:360px;min-height:160px;margin-right:120px;padding:22px;background:#063963;border:2px solid #b5f5fa;color:#fff}.blueprint article:last-of-type{margin-right:0}.blueprint article b{color:#9ceff8;font-size:16px;letter-spacing:.14em}.blueprint article span{margin-top:20px;font-size:25px;line-height:1.35}.blueprint em{position:absolute;right:44px;bottom:27px;color:#b5f5fa;font-size:17px;font-style:normal;letter-spacing:.15em}
/* === 流程页：让因果关系成为视觉主角 === */
.layout-process{color:#fff;background:#071b33}.layout-process:before{background:radial-gradient(circle at 80% 30%,#0877a488,transparent 30%),linear-gradient(125deg,#071b33,#0b385d)}.process-copy{position:relative;z-index:2;padding:215px 130px}.layout-process .deck-chrome,.layout-process footer{color:#9ceff8}.layout-process .deck-subtitle{color:#c7e9ef}.process-line{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:80px}.process-line:before{content:"";position:absolute;left:80px;right:80px;top:47px;height:6px;background:#78ddea}.process-line li{position:relative;min-height:240px;padding:105px 24px 25px;list-style:none;background:#ffffff12;border:1px solid #99eaf455;font-size:25px;line-height:1.45}.process-line li b{position:absolute;top:18px;left:24px;width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:var(--orange);font-family:"Noto Serif SC";font-size:27px}.process-orb{position:absolute;right:-110px;bottom:-160px;width:580px;height:580px;border:1px solid #8beaf899;border-radius:50%;box-shadow:0 0 0 50px #8beaf811,0 0 0 100px #8beaf80c}
/* === 实训页：照片、清单与工艺提示并置 === */
.practice-image{position:absolute;left:0;top:0;bottom:0;width:760px;background-position:center;background-size:cover}.practice-image:after,.closing-image:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#071b3322,#071b33aa)}.practice-image span{position:absolute;left:80px;bottom:120px;z-index:2;padding:15px 20px;background:var(--orange);color:#fff;font-size:20px;font-weight:800;letter-spacing:.1em}.practice-copy{padding:205px 130px 0 890px}.check-list{margin:55px 0 0;padding:0;list-style:none}.check-list li{display:flex;gap:20px;padding:17px 0;border-top:1px solid #b9cbd0;font-size:25px;line-height:1.45}.check-list b{color:var(--orange);font-family:"Noto Serif SC"}.craft-note{margin-top:38px;padding:18px 22px;border-left:8px solid var(--orange);background:#fff;color:#35576a;font-size:20px}
/* === 排故页：把问题、路径和警示分开阅读 === */
.diagnose-copy{padding:205px 130px}.diagnose-grid{display:grid;grid-template-columns:460px 1fr;gap:22px;margin-top:62px;max-width:1460px}.diagnose-grid article{min-height:300px;padding:42px;background:#fff;border:1px solid #b9cbd0}.diagnose-grid article:first-child{color:#fff;background:#0b4e86;border:0}.diagnose-grid article:first-child small{color:#a9eff7}.diagnose-grid strong{display:block;font-family:"Noto Serif SC";font-size:39px;line-height:1.4}.diagnose-grid article:first-child strong{color:#fff}.warning-mark{position:absolute;right:120px;bottom:-120px;font-family:"Noto Serif SC";font-size:600px;line-height:1;color:#f05a2818}
/* === 收束页：回到一个清晰的行动问题 === */
.layout-closing{color:#fff;background:#061a30}.closing-image{position:absolute;inset:0;background-position:center;background-size:cover;opacity:.42}.layout-closing:before{z-index:1;background:linear-gradient(90deg,#061a30 16%,#061a30d4 62%,#061a3050)}.closing-copy{position:relative;z-index:2;padding:210px 130px;width:1260px}.layout-closing .deck-chrome,.layout-closing footer{color:#9ceff8}.layout-closing .deck-subtitle{color:#d1f3f7}.closing-list{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:62px 0 0;padding:0;list-style:none}.closing-list li{min-height:145px;padding:26px;background:#ffffff14;border:1px solid #9ceff866;font-size:23px;line-height:1.45}.closing-list b{display:block;margin-bottom:15px;color:#9ceff8;font-size:16px}.closing-question{margin-top:43px;padding:20px 24px;border-left:8px solid var(--orange);background:#ffffff14;font-size:27px}
/* === 翻页与轻量编辑 === */
.deck-controls{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:999px;background:#061a30db;color:#fff;font:700 14px "Noto Sans SC",sans-serif}.deck-controls button,.edit-toggle{border:0;border-radius:999px;padding:9px 15px;background:#ffffff18;color:#fff;cursor:pointer}.deck-controls button:hover,.edit-toggle:hover{background:var(--orange)}.edit-hotzone{position:fixed;left:0;top:0;z-index:10001;width:78px;height:78px}.edit-toggle{position:fixed;top:22px;left:22px;z-index:10002;opacity:0;pointer-events:none;transition:opacity .25s}.edit-toggle.show,.edit-toggle.active{opacity:1;pointer-events:auto}[contenteditable="true"]{outline:2px dashed var(--orange);outline-offset:6px;background:#fff2}
</style></head><body><div class="deck-viewport"><main class="deck-stage" id="deckStage">${slides}</main></div><div class="edit-hotzone" id="editHotzone" title="编辑"></div><button class="edit-toggle" id="editToggle" title="编辑模式（E）">编辑</button><nav class="deck-controls" aria-label="翻页控制"><button id="prev" aria-label="上一页">←</button><span id="counter">1 / ${deck.slides.length}</span><button id="next" aria-label="下一页">→</button></nav><script>
/* === 固定画布、键盘、鼠标滚轮与触屏翻页 === */
class SlidePresentation{constructor(){this.slides=[...document.querySelectorAll('.slide')];this.stage=document.getElementById('deckStage');this.counter=document.getElementById('counter');this.index=${startAt};this.editing=false;this.scale=this.scale.bind(this);addEventListener('resize',this.scale);this.scale();this.restore();this.show(this.index);this.bind()}scale(){const factor=Math.min(innerWidth/1920,innerHeight/1080);this.stage.style.transform='translate('+((innerWidth-1920*factor)/2)+'px,'+((innerHeight-1080*factor)/2)+'px) scale('+factor+')'}show(index){this.index=Math.max(0,Math.min(index,this.slides.length-1));this.slides.forEach((slide,i)=>{slide.classList.toggle('active',i===this.index);slide.classList.toggle('visible',i===this.index)});this.counter.textContent=(this.index+1)+' / '+this.slides.length}move(step){this.show(this.index+step)}bind(){document.getElementById('prev').onclick=()=>this.move(-1);document.getElementById('next').onclick=()=>this.move(1);addEventListener('keydown',e=>{if(e.target.getAttribute('contenteditable'))return;if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();this.move(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();this.move(-1)}if(e.key==='e'||e.key==='E')this.toggleEdit()});let y=0,locked=false;addEventListener('wheel',e=>{if(locked||Math.abs(e.deltaY)<12)return;locked=true;this.move(e.deltaY>0?1:-1);setTimeout(()=>locked=false,550)},{passive:true});let x=0;addEventListener('touchstart',e=>x=e.changedTouches[0].screenX,{passive:true});addEventListener('touchend',e=>{const d=e.changedTouches[0].screenX-x;if(Math.abs(d)>45)this.move(d<0?1:-1)},{passive:true});const hot=document.getElementById('editHotzone'),toggle=document.getElementById('editToggle');let hide;const reveal=()=>{clearTimeout(hide);toggle.classList.add('show')},conceal=()=>{hide=setTimeout(()=>{if(!this.editing)toggle.classList.remove('show')},400)};hot.onmouseenter=reveal;hot.onmouseleave=conceal;toggle.onmouseenter=reveal;toggle.onmouseleave=conceal;hot.onclick=()=>this.toggleEdit();toggle.onclick=()=>this.toggleEdit()}toggleEdit(){this.editing=!this.editing;document.getElementById('editToggle').classList.toggle('active',this.editing);document.querySelectorAll('[data-edit]').forEach(el=>el.contentEditable=this.editing?'true':'false');if(!this.editing)this.save()}save(){const values=[...document.querySelectorAll('[data-edit]')].map(el=>el.innerHTML);localStorage.setItem(${storageKey},JSON.stringify(values))}restore(){try{const values=JSON.parse(localStorage.getItem(${storageKey})||'[]');document.querySelectorAll('[data-edit]').forEach((el,i)=>{if(values[i])el.innerHTML=values[i]})}catch(e){}}}new SlidePresentation();
</script></body></html>`
}

void adaptiveDeckDocument

// 模型直接提供整套视觉 CSS 与每页 HTML；这里仅提供固定画布、翻页和导出所需的外壳。
function creativeDeckDocument(deck: Deck, design: CreativeDeckDesign, startAt = 0) {
  const slides = deck.slides.map((slide, index) => `<section class="slide generated-slide generated-slide-${index}">${design.slides[index]?.html || `<div class="missing-slide"><h1>${escapeHtml(slide.title)}</h1></div>`}</section>`).join('\n')
  const font = design.fontUrl ? `<link rel="stylesheet" href="${design.fontUrl}">` : ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(deck.title)}</title>${font}<style>
/* === 固定 16:9 舞台：由播放器负责，不限制模型内部视觉 === */
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--stage-bg,#071a2f)}.deck-viewport{position:fixed;inset:0;overflow:hidden;background:var(--stage-bg,#071a2f)}.deck-stage{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;transform-origin:0 0;background:var(--slide-bg,#fff)}.slide{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;display:block;visibility:hidden;opacity:0;pointer-events:none;background:var(--slide-bg,#fff)}.slide.active,.slide.visible{visibility:visible;opacity:1;pointer-events:auto;z-index:1}img,video,canvas,svg{max-width:100%;max-height:100%}.deck-controls{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1000}@media print{html,body{width:1920px;height:auto;overflow:visible;background:#fff}.deck-viewport{position:static;overflow:visible;background:#fff}.deck-stage{position:static;width:auto;height:auto;transform:none!important;background:none}.slide{position:relative;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:1920px;height:1080px;break-after:page;page-break-after:always}.slide:last-child{break-after:auto;page-break-after:auto}.deck-controls{display:none!important}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.2ms!important}}
/* === 模型为本套课件创作的视觉系统 === */
${design.css}
/* === 播放器控件 === */
.deck-controls{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #ffffff22;border-radius:999px;background:#061426d9;color:#fff;font:700 14px "Noto Sans SC",sans-serif;backdrop-filter:blur(10px)}.deck-controls button{border:0;border-radius:999px;padding:8px 14px;background:#ffffff18;color:#fff;cursor:pointer}.deck-controls button:hover{background:#ffffff38}.edit-hotzone{position:fixed;left:0;top:0;width:76px;height:76px;z-index:1100}.edit-toggle{position:fixed;left:18px;top:18px;z-index:1101;opacity:0;pointer-events:none;border:0;border-radius:999px;padding:9px 13px;background:#061426d9;color:#fff;transition:opacity .2s}.edit-toggle.show,.edit-toggle.active{opacity:1;pointer-events:auto}[contenteditable="true"]{outline:2px dashed #f05a28;outline-offset:5px}
</style></head><body><div class="deck-viewport"><main class="deck-stage" id="deckStage">${slides}</main></div><div class="edit-hotzone" id="editHotzone"></div><button class="edit-toggle" id="editToggle">编辑</button><nav class="deck-controls" aria-label="翻页控制"><button id="prev">←</button><span id="counter">1 / ${deck.slides.length}</span><button id="next">→</button></nav><script>
/* === 统一播放控制：方向键、空格、滚轮、触屏 === */
class SlidePresentation{constructor(){this.slides=[...document.querySelectorAll('.slide')];this.stage=document.getElementById('deckStage');this.counter=document.getElementById('counter');this.index=${startAt};this.editing=false;this.scale=this.scale.bind(this);addEventListener('resize',this.scale);this.scale();this.show(this.index);this.bind()}scale(){const s=Math.min(innerWidth/1920,innerHeight/1080);this.stage.style.transform='translate('+((innerWidth-1920*s)/2)+'px,'+((innerHeight-1080*s)/2)+'px) scale('+s+')'}show(i){this.index=Math.max(0,Math.min(i,this.slides.length-1));this.slides.forEach((slide,n)=>{slide.classList.toggle('active',n===this.index);slide.classList.toggle('visible',n===this.index)});this.counter.textContent=(this.index+1)+' / '+this.slides.length}move(n){this.show(this.index+n)}bind(){document.getElementById('prev').onclick=()=>this.move(-1);document.getElementById('next').onclick=()=>this.move(1);addEventListener('keydown',e=>{if(e.target.getAttribute('contenteditable'))return;if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();this.move(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();this.move(-1)}if(e.key==='e'||e.key==='E')this.toggleEdit()});let x=0,locked=false;addEventListener('touchstart',e=>x=e.changedTouches[0].screenX,{passive:true});addEventListener('touchend',e=>{const d=e.changedTouches[0].screenX-x;if(Math.abs(d)>45)this.move(d<0?1:-1)},{passive:true});addEventListener('wheel',e=>{if(locked||Math.abs(e.deltaY)<18)return;locked=true;this.move(e.deltaY>0?1:-1);setTimeout(()=>locked=false,500)},{passive:true});const hot=document.getElementById('editHotzone'),toggle=document.getElementById('editToggle');let hide;const show=()=>{clearTimeout(hide);toggle.classList.add('show')},conceal=()=>{hide=setTimeout(()=>{if(!this.editing)toggle.classList.remove('show')},400)};hot.onmouseenter=show;hot.onmouseleave=conceal;toggle.onmouseenter=show;toggle.onmouseleave=conceal;hot.onclick=()=>this.toggleEdit();toggle.onclick=()=>this.toggleEdit()}toggleEdit(){this.editing=!this.editing;document.getElementById('editToggle').classList.toggle('active',this.editing);document.querySelectorAll('.generated-slide h1,.generated-slide h2,.generated-slide h3,.generated-slide p,.generated-slide li,.generated-slide span,.generated-slide strong').forEach(el=>el.contentEditable=this.editing?'true':'false')}}new SlidePresentation();
</script></body></html>`
}

export default function PptStudio({ onBack }: { onBack: () => void }) {
  const [stage, setStage] = useState<'create' | 'outline' | 'preview'>('create')
  const [file, setFile] = useState<File | null>(null)
  const [sourceText, setSourceText] = useState('')
  const [topic, setTopic] = useState('')
  const [pageCount, setPageCount] = useState(8)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '你好，先告诉我这节课希望学生学会什么。我会先整理页面计划，再由你决定是否生成。' },
  ])
  const [chatInput, setChatInput] = useState('')
  const [deck, setDeck] = useState<Deck | null>(null)
  const [hasGeneratedHtml, setHasGeneratedHtml] = useState(false)
  const [creativeDeck, setCreativeDeck] = useState<CreativeDeckDesign | null>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [revision, setRevision] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [provider, setProvider] = useState<Provider>(() => (localStorage.getItem('AI_PROVIDER') as Provider) || 'qwen')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('AI_API_KEY') || '')
  const [model, setModel] = useState(() => localStorage.getItem('AI_MODEL_ID') || '')

  const requestText = messages.filter((item) => item.role === 'user').map((item) => item.content).join('\n')
  const slide = deck?.slides[activeSlide]
  const updateSlide = (index: number, patch: Partial<Slide>) => {
    setCreativeDeck(null); setHasGeneratedHtml(false)
    setDeck((value) => value ? { ...value, slides: value.slides.map((item, current) => current === index ? { ...item, ...patch } : item) } : value)
  }

  useEffect(() => {
    if (!presenting) return
    const keyboard = (event: KeyboardEvent) => {
      if (!deck) return
      if (event.key === 'Escape') setPresenting(false)
      if (event.key === 'ArrowLeft') setActiveSlide((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight') setActiveSlide((value) => Math.min(deck.slides.length - 1, value + 1))
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [presenting, deck])

  const uploadWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.docx')) { setStatus('第一版只支持 Word 教案，请选择 .docx 文件。'); return }
    setFile(selected); setBusy(true); setStatus('正在读取教案内容…')
    try {
      const form = new FormData(); form.append('file', selected)
      const response = await fetch('/api/analyze-presentation-source', { method: 'POST', body: form })
      if (!response.ok) throw new Error('read failed')
      const data = await response.json()
      setSourceText(String(data.content || ''))
      if (!topic && data.title) setTopic(String(data.title))
      setStatus(`已读入《${selected.name}》，现在可以继续补充课堂要求。`)
    } catch { setStatus('暂时没有读出文件内容。你仍可以通过对话说明课程需求后继续制作。') } finally { setBusy(false) }
  }

  const sendMessage = async () => {
    const content = chatInput.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next); setChatInput(''); setBusy(true)
    try {
      if (!apiKey) throw new Error('local reply')
      const response = await fetch('/api/ai/ppt-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ provider, model: model || undefined, sourceContent: sourceText, messages: next }),
      })
      if (!response.ok) throw new Error('chat failed')
      const data = await response.json()
      setMessages((items) => [...items, { role: 'assistant', content: String(data.reply || '我已经记下这条要求。') }])
    } catch {
      setMessages((items) => [...items, { role: 'assistant', content: sourceText ? '我已经把这条要求和你的 Word 教案放在一起，生成前还可以继续补充。' : '这个方向很清楚。我会按目标、讲解、案例、练习、总结的课堂节奏来安排页面。' }])
    } finally { setBusy(false) }
  }

  const generateOutline = async () => {
    if ((!sourceText && !requestText) || busy) { setStatus('请先上传 Word 教案，或通过对话告诉我课程需求。'); return }
    setBusy(true); setStatus('正在整理页面计划…')
    try {
      if (!apiKey) throw new Error('missing key')
      const response = await fetch('/api/ai/generate-presentation', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ provider, model: model || undefined, sourceContent: sourceText, topic, instruction: requestText, pageCount }),
      })
      if (!response.ok) throw new Error(await readApiError(response, '页面计划生成失败'))
      const data = await response.json()
      if (!Array.isArray(data.slides) || data.slides.length < 3) throw new Error('incomplete outline')
      const backup = fallbackDeck(topic || file?.name.replace(/\.docx$/i, '') || '课堂课件', pageCount, requestText)
      setDeck({ title: String(data.title || backup.title), slides: backup.slides.map((item, index) => ({ ...item, ...(data.slides?.[index] || {}), id: item.id, bullets: data.slides?.[index]?.bullets?.slice(0, 4) || item.bullets })) })
      setHasGeneratedHtml(false)
      setCreativeDeck(null)
      setStatus('页面计划已生成。你可以逐页修改，再进入展示页。')
      setActiveSlide(0); setStage('outline')
    } catch (error) {
      setStatus(`页面计划暂未生成。${modelErrorMessage(error)}`)
    } finally { setBusy(false) }
  }

  const generateHtml = async () => {
    if (!deck || busy) return
    setBusy(true); setStatus('正在确定整套视觉方案、编排素材并分批制作 HTML 课件…')
    try {
      if (!apiKey) throw new Error('missing key')
      const response = await fetch('/api/ai/generate-presentation-html', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ provider, model: model || undefined, sourceContent: sourceText, slides: deck.slides }),
      })
      if (!response.ok) throw new Error(await readApiError(response, '网页课件生成失败'))
      const data = await response.json()
      if (!data.design?.css || !Array.isArray(data.design?.slides) || data.design.slides.length < deck.slides.length) throw new Error('missing creative deck')
      setCreativeDeck({ fontUrl: String(data.design.fontUrl || ''), css: String(data.design.css), slides: data.design.slides.map((item: { html?: string }) => ({ html: String(item.html || '') })) })
      setStatus('模型已完成整套 HTML 的视觉设计，正在展示同一份课件。')
      setHasGeneratedHtml(true)
      setStage('preview')
    } catch (error) {
      setStatus(`网页课件暂未生成。${modelErrorMessage(error)}`)
    } finally { setBusy(false) }
  }

  const revise = async () => {
    if (!slide || !revision.trim() || busy) return
    setBusy(true)
    try {
      if (!apiKey) throw new Error('demo')
      const response = await fetch('/api/ai/revise-presentation-slide', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ provider, model: model || undefined, sourceContent: sourceText, instruction: revision, slide }),
      })
      if (!response.ok) throw new Error('revision failed')
      const data = await response.json(); const result = data.slide || {}
      updateSlide(activeSlide, { title: result.title || slide.title, subtitle: result.subtitle || slide.subtitle, bullets: result.bullets?.slice(0, 4) || slide.bullets })
      setCreativeDeck(null); setHasGeneratedHtml(false)
      setStatus(`第 ${activeSlide + 1} 页已按意见更新。`)
    } catch {
      updateSlide(activeSlide, { subtitle: `${slide.subtitle} · 已按“${revision.slice(0, 18)}”调整` })
      setCreativeDeck(null); setHasGeneratedHtml(false)
      setStatus(`第 ${activeSlide + 1} 页已标记为新版。连接对话服务后可自动重写整页内容。`)
    } finally { setRevision(''); setBusy(false) }
  }

  const openHtmlDeck = () => {
    if (!deck) return
    if (!creativeDeck) return
    const url = URL.createObjectURL(new Blob([creativeDeckDocument(deck, creativeDeck, activeSlide)], { type: 'text/html;charset=utf-8' }))
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const downloadHtmlDeck = () => {
    if (!deck) return
    if (!creativeDeck) return
    const url = URL.createObjectURL(new Blob([creativeDeckDocument(deck, creativeDeck)], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${deck.title.replace(/[\\/:*?"<>|]/g, '-') || '课堂课件'}.html`
    link.click()
    URL.revokeObjectURL(url)
  }

  const goToStep = (next: 'create' | 'outline' | 'preview') => {
    if (next === 'create') { setStage('create'); if (deck) setStatus('已保留当前页面计划和课件，可随时回到后续步骤继续查看。'); return }
    if (!deck) { setStatus('请先在第一步生成页面计划。'); return }
    if (next === 'preview' && !hasGeneratedHtml) { setStage('outline'); setStatus('请先在第二步点击“生成网页课件”，完成后即可查看第三步。'); return }
    setStage(next)
    setStatus(next === 'outline' ? '已回到页面计划。修改后可再次生成网页课件。' : '已打开刚刚生成的网页课件。')
  }

  return <main className="ppt-studio">
    <header className="ppt-topbar"><div><button type="button" className="tool-shell-back" onClick={onBack}>返回百宝箱</button><span>PPT 创作室 · 网页演示版</span><h1>把教案变成一套能直接展示的课件</h1></div><div><button type="button" className="ppt-text-button" onClick={() => setShowSettings((value) => !value)}>对话服务设置</button>{deck && hasGeneratedHtml && <button type="button" className="ppt-primary-button" onClick={() => { setStage('preview'); setPresenting(true) }}>全屏播放</button>}</div></header>
    {showSettings && <section className="ppt-model-settings"><label>对话服务<select value={provider} onChange={(event) => { const next = event.target.value as Provider; setProvider(next); if (next === 'qwen') setModel('qwen-plus'); if (next === 'openai_next' || next === 'ai_codex') setModel('gpt-5.6-terra') }}><option value="openai">OpenAI</option><option value="doubao">豆包</option><option value="deepseek">DeepSeek</option><option value="qwen">通义千问（阿里云百炼）</option><option value="openai_next">GPT-5.6 Terra（OpenAI Next Credits）</option><option value="ai_codex">GPT-5.6 Terra（Ai-Codex）</option></select></label><label>访问密钥<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={provider === 'qwen' ? '粘贴你的百炼 API Key' : provider === 'openai_next' ? '粘贴 OpenAI Next Credits 的 API Key' : provider === 'ai_codex' ? '粘贴 Ai-Codex 的 API Key' : '仅保存在这台设备'} /></label><label>模型名称（可选）<input value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider === 'qwen' ? '默认 qwen-plus，也可填 qwen-max 等' : provider === 'openai_next' || provider === 'ai_codex' ? '默认 gpt-5.6-terra' : ''} /></label>{provider === 'qwen' && <p>已接入通义千问。填入百炼 API Key 后，聊天、页面计划、网页视觉与逐页修改都会使用千问生成。</p>}{provider === 'openai_next' && <p>已接入 GPT-5.6 Terra。填入 OpenAI Next Credits 的 API Key 后，PPT 创作室的聊天、页面计划、网页课件与逐页修改都会使用此模型。</p>}{provider === 'ai_codex' && <p>已接入 Ai-Codex 的 GPT-5.6 Terra。填入 Ai-Codex 的 API Key 后，PPT 创作室的聊天、页面计划、网页课件与逐页修改都会使用此模型。</p>}<button type="button" className="ppt-primary-button" onClick={() => { localStorage.setItem('AI_PROVIDER', provider); localStorage.setItem('AI_API_KEY', apiKey); localStorage.setItem('AI_MODEL_ID', model); setShowSettings(false); setStatus('对话服务设置已保存在这台设备。') }}>保存</button></section>}
    <nav className="ppt-stepper" aria-label="课件制作步骤">{(['create', 'outline', 'preview'] as const).map((item, index) => { const locked = item === 'outline' ? !deck : item === 'preview' ? !deck || !hasGeneratedHtml : false; return <button key={item} type="button" disabled={locked} className={stage === item ? 'active' : ''} onClick={() => goToStep(item)}><b>{index + 1}</b><span>{['准备内容', '确认页面计划', '预览与修改'][index]}</span>{index > 0 && !locked && <em>可返回</em>}</button> })}</nav>{status && <p className="ppt-status">{status}</p>}
    {stage === 'create' && <section className="ppt-create-layout"><div className="ppt-create-main"><section className="ppt-upload-card"><b>W</b><h2>{file ? file.name : '上传你的 Word 教案'}</h2><p>支持 .docx 格式。上传后可继续补充课堂要求，再由所选模型按内容生成课件。</p><label className="ppt-file-button">{busy ? '正在读取…' : '选择 Word 教案'}<input type="file" accept=".docx" onChange={uploadWord} /></label>{sourceText && <details><summary>已读取的教案摘要</summary><p>{sourceText.slice(0, 460)}{sourceText.length > 460 ? '…' : ''}</p></details>}</section><section className="ppt-setup-card"><label>课程主题<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：机器视觉的基本原理" /></label><label>页面数量<input type="number" min="3" max="20" value={pageCount} onChange={(event) => setPageCount(Math.max(3, Math.min(20, Number(event.target.value) || 8)))} /><small>默认 8 页，可改为 3–20 页</small></label></section><section className="ppt-auto-design-card"><span>自动版式</span><h2>不选模板，按教案自己长出结构</h2><p>所选模型会为每页选择适合的讲述方式：封面、路线、对比、原理图、流程、实训、排故或收束页。它们会在同一套课堂视觉中自然衔接。</p></section></div><aside className="ppt-chat-card"><header><span>课程共创对话</span><strong>先聊清楚，再主动生成</strong></header><div>{messages.map((item, index) => <p key={index} className={item.role}>{item.content}</p>)}</div><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder="补充课堂要求，例如：加入一页小组讨论" /><button type="button" onClick={sendMessage} disabled={!chatInput.trim() || busy}>发送</button><button type="button" className="ppt-generate-button" onClick={generateOutline} disabled={busy}>生成页面计划</button></aside></section>}
    {stage === 'outline' && deck && <section className="ppt-outline-page"><header><div><span>页面计划</span><h2>{deck.title}</h2><p>确认每页内容后，由 AI 生成网页视觉并进入展示页。</p></div><div><button type="button" className="ppt-text-button" onClick={() => goToStep('create')}>返回调整要求</button>{hasGeneratedHtml && <button type="button" className="ppt-text-button" onClick={() => goToStep('preview')}>查看已生成课件</button>}<button type="button" className="ppt-primary-button" onClick={generateHtml} disabled={busy}>{busy ? '正在设计网页视觉…' : hasGeneratedHtml ? '重新生成网页课件' : '生成网页课件'}</button></div></header><div className="ppt-outline-grid">{deck.slides.map((item, index) => <article key={item.id}><header><span>{item.id}</span><button type="button" onClick={() => setDeck((value) => value && value.slides.length > 3 ? { ...value, slides: value.slides.filter((_, current) => current !== index) } : value)}>×</button></header><input value={item.title} onChange={(event) => updateSlide(index, { title: event.target.value })} /><input value={item.subtitle} onChange={(event) => updateSlide(index, { subtitle: event.target.value })} />{item.bullets.map((bullet, bulletIndex) => <input key={bulletIndex} value={bullet} onChange={(event) => updateSlide(index, { bullets: item.bullets.map((value, current) => current === bulletIndex ? event.target.value : value) })} />)}</article>)}<button type="button" className="ppt-add-slide" onClick={() => setDeck((value) => value ? { ...value, slides: [...value.slides, { id: String(value.slides.length + 1).padStart(2, '0'), title: '新的课堂页面', subtitle: '在这里补充这一页要讲清的内容', bullets: ['第一个要点', '第二个要点', '第三个要点'] }] } : value)}>+ 添加一页</button></div></section>}
    {stage === 'preview' && deck && slide && creativeDeck && <section className="ppt-preview-page"><aside>{deck.slides.map((item, index) => <button key={item.id} type="button" className={index === activeSlide ? 'selected' : ''} onClick={() => setActiveSlide(index)}><span>{item.id}</span><strong>{item.title}</strong><small>{item.subtitle}</small></button>)}</aside><div><header><span>{slide.id} / {String(deck.slides.length).padStart(2, '0')}</span><div><button type="button" className="ppt-text-button" onClick={() => goToStep('create')}>返回上传与要求</button><button type="button" className="ppt-text-button" onClick={() => goToStep('outline')}>编辑页面计划</button><button type="button" className="ppt-text-button" onClick={openHtmlDeck}>打开独立 HTML</button><button type="button" className="ppt-primary-button" onClick={downloadHtmlDeck}>下载 HTML</button></div></header><SlideView deck={deck} design={creativeDeck} startAt={activeSlide} /><section className="ppt-edit-card"><h3>只修改第 {activeSlide + 1} 页</h3><textarea value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="例如：把这页改成更贴近生活的案例，文字少一点" /><button type="button" className="ppt-primary-button" onClick={revise} disabled={!revision.trim() || busy}>按意见修改</button></section></div></section>}
    {presenting && deck && slide && creativeDeck && <div className="ppt-present-overlay"><button type="button" className="ppt-present-close" onClick={() => setPresenting(false)}>退出全屏</button><button type="button" className="ppt-present-nav" onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}>‹</button><SlideView deck={deck} design={creativeDeck} startAt={activeSlide} present /><button type="button" className="ppt-present-nav" onClick={() => setActiveSlide(Math.min(deck.slides.length - 1, activeSlide + 1))}>›</button></div>}
  </main>
}

function SlideView({ deck, design, startAt, present = false }: { deck: Deck; design: CreativeDeckDesign; startAt: number; present?: boolean }) {
  return <iframe className={`ppt-html-frame ${present ? 'present' : ''}`} title={deck.title} sandbox="allow-same-origin allow-scripts" srcDoc={creativeDeckDocument(deck, design, startAt)} />
}
