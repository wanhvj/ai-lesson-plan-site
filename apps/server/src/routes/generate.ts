import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';

type Position = { t: number; r: number; c: number };

// 格式化配置类型
type RenderRule = {
  pattern: string;           // 正则表达式字符串
  styles: {
    bold?: boolean;          // 加粗
    indent?: number;         // 缩进级别(1级=420)
    italic?: boolean;        // 斜体
    underline?: boolean;     // 下划线
  };
  partialBold?: boolean;     // 🔥 新增:是否只加粗匹配的部分(而非整行)
};

type AIStructure = {
  description?: string;      // 结构描述
  parts?: Array<{            // 分部信息
    label: string;           // 部分标签
    duration?: string;       // 时长/字数要求
  }>;
};

type FormattingConfig = {
  type?: 'structured' | 'plain' | 'list' | 'table';
  aiStructure?: AIStructure;     // AI生成时的结构指导
  renderRules?: RenderRule[];    // Word渲染时的样式规则
};

type MappingItem = { 
  fieldId: string; 
  position: Position; 
  mode: 'replace' | 'multiline'; 
  split?: 'newline' | 'blankline';
  formatting?: FormattingConfig;  // 新增格式化配置
};

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
export const generateRouter = express.Router();

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 🔥 从文本内容中自动检测渲染规则
function autoDetectRenderRules(text: string, mode: 'replace' | 'multiline'): RenderRule[] {
  const rules: RenderRule[] = [];
  if (mode !== 'multiline') return rules; // 单行模式不需要自动检测
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return rules; // 少于两行，没有结构可检测

  // 检测模式1：每行以 "xxx：" 开头，且至少2行有不同的标签
  const labelLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([^，。,\.\s]{1,12})[：:]/);
    if (m) labelLines.push(m[0]); // 包含标签和冒号
  }
  if (labelLines.length >= 2 && labelLines.length >= lines.length * 0.5) {
    // 收集唯一的标签前缀（去掉冒号）
    const uniquePrefixes = [...new Set(labelLines.map(l => l.replace(/[：:]$/, '')))];
    if (uniquePrefixes.length >= 2) {
      const escaped = uniquePrefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      rules.push({ pattern: `^(${escaped})[：:]`, styles: { bold: true }, partialBold: true });
      return rules; // 最精确的匹配，直接返回
    }
  }

  // 检测模式2：多行以 "第X部分" 开头
  const partLines = lines.filter(l => /^第[一二三四五六七八九十]+[部分节篇章][、：:，]?/.test(l));
  if (partLines.length >= 2) {
    rules.push({ pattern: '^(第[一二三四五六七八九十]+[部分节篇章][、：:，]?)', styles: { bold: true }, partialBold: true });
    return rules;
  }

  // 检测模式3：每行以中文字序号开头（一、 二、 三、）
  const ordinalLines = lines.filter(l => /^[一二三四五六七八九十]+[、.．]/.test(l));
  if (ordinalLines.length >= 2) {
    rules.push({ pattern: '^[一二三四五六七八九十]+[、.．]', styles: { bold: true }, partialBold: true });
    return rules;
  }

  return rules;
}

function buildParagraphsXml(
  text: string,
  mode: 'replace' | 'multiline',
  split: 'newline' | 'blankline' = 'newline',
  rPrXml = '',
  renderRules?: RenderRule[],
  cellPPrXml?: string  // 🔥 模板单元格的段落属性（继承行间距等）
): string {
  // 🔥 自动检测：如果内容含换行但模式为 replace，自动切换为 multiline
  let processedText = text;
  let effectiveMode = (mode === 'replace' && text.includes('\n')) ? 'multiline' : mode;

  // 🔥 🔥 即使没有换行符，也尝试从内容中检测结构标记并自动分段
  if (effectiveMode === 'replace') {
    // 检测模式：第X部分、第X章、第X节等
    const partPattern = /第[一二三四五六七八九十]+[部分节篇章][、：:，]?/g;
    // 检测模式：中文序号 X、 X. 等
    const ordPattern = /[一二三四五六七八九十]+[、.．]/g;
    // 检测模式：短标签： pattern
    const labelPattern = /[^，。,\.\s]{2,10}[：:]/g;

    // 看文本是否以结构标记开头（说明整段都有结构）
    const partMatches = text.match(partPattern);
    if (partMatches && text.indexOf(partMatches[0]) <= 3) {
      processedText = text.replace(partPattern, '\n$&').replace(/^\n/, '');
      effectiveMode = 'multiline';
    } else {
      const ordMatches = text.match(ordPattern);
      if (ordMatches && text.indexOf(ordMatches[0]) <= 3) {
        processedText = text.replace(ordPattern, '\n$&').replace(/^\n/, '');
        effectiveMode = 'multiline';
      } else {
        const labelMatches = text.match(labelPattern);
        if (labelMatches && labelMatches.length >= 2) {
          processedText = text.replace(labelPattern, '\n$&').replace(/^\n/, '');
          effectiveMode = 'multiline';
        }
      }
    }
  }

  const lines = effectiveMode === 'multiline'
    ? (split === 'blankline' ? processedText.split(/\n\s*\n/g) : processedText.split(/\n/g))
    : [processedText];

  // 🔥 如果没有显式规则，自动从内容检测
  const effectiveRules = (renderRules && renderRules.length > 0) ? renderRules : autoDetectRenderRules(processedText, effectiveMode);

  return lines.map(line => {
    // 应用渲染规则
    let appliedStyles = { bold: false, indent: 0, italic: false, underline: false };
    let partialBoldRule: RenderRule | null = null;

    if (effectiveRules) {
      for (const rule of effectiveRules) {
        try {
          const regex = new RegExp(rule.pattern);
          if (regex.test(line)) {
            if (rule.partialBold && rule.styles.bold) {
              // 记录部分加粗规则,稍后特殊处理
              partialBoldRule = rule;
              appliedStyles = { ...appliedStyles, ...rule.styles, bold: false }; // 不应用整行加粗
            } else {
              appliedStyles = { ...appliedStyles, ...rule.styles };
            }
            break; // 应用第一个匹配的规则
          }
        } catch (e) {
          console.warn('[渲染规则警告] 无效的正则表达式:', rule.pattern);
        }
      }
    }
    
    // 🔥 构建段落属性 <w:pPr>（继承模板的行间距 + 渲染规则的缩进）
    let finalPPrXml = '';
    const indentXml = appliedStyles.indent && appliedStyles.indent > 0
      ? `<w:ind w:left="${appliedStyles.indent * 420}"/>`
      : '';

    if (cellPPrXml) {
      // 以模板的段落属性为基础，插入缩进（如果需要）
      if (indentXml) {
        // 替换或追加缩进
        if (/<w:ind\b/.test(cellPPrXml)) {
          finalPPrXml = cellPPrXml.replace(/<w:ind\b[^>]*\/>/, indentXml);
        } else {
          finalPPrXml = cellPPrXml.replace('</w:pPr>', `${indentXml}</w:pPr>`);
        }
      } else {
        finalPPrXml = cellPPrXml;
      }
    } else if (indentXml) {
      finalPPrXml = `<w:pPr>${indentXml}</w:pPr>`;
    }
    // 如果没有模板pPr且不需要缩进，留空
    
    // 🔥 处理部分加粗
    if (partialBoldRule) {
      try {
        const regex = new RegExp(partialBoldRule.pattern);
        const match = line.match(regex);
        
        if (match && match[0]) {
          const matchedText = match[0]; // 匹配到的部分(如"知识基础:")
          const restText = line.slice(matchedText.length); // 剩余部分
          
          // 加粗部分的样式
          const boldRPrXml = rPrXml.includes('</w:rPr>') 
            ? rPrXml.replace('</w:rPr>', '<w:b/><w:bCs/></w:rPr>')
            : `<w:rPr><w:b/><w:bCs/></w:rPr>`;
          
          // 普通部分的样式(必须剥离默认的加粗样式)
          let normalRPrXml = rPrXml;
          normalRPrXml = normalRPrXml.replace(/<w:b\s*\/>/g, '');
          normalRPrXml = normalRPrXml.replace(/<w:bCs\s*\/>/g, '');
          normalRPrXml = normalRPrXml.replace(/<w:b>[\s\S]*?<\/w:b>/g, '');
          normalRPrXml = normalRPrXml.replace(/<w:bCs>[\s\S]*?<\/w:bCs>/g, '');
          
          // 返回包含两个<w:r>的段落:一个加粗,一个不加粗
          return `\n<w:p>${finalPPrXml}<w:r>${boldRPrXml}<w:t xml:space="preserve">${escapeXml(matchedText)}</w:t></w:r><w:r>${normalRPrXml}<w:t xml:space="preserve">${escapeXml(restText)}</w:t></w:r></w:p>`;
        }
      } catch (e) {
        console.warn('[部分加粗警告] 处理失败:', e);
      }
    }

    // 常规处理(整行应用样式)
    let boldXml = appliedStyles.bold ? '<w:b/><w:bCs/>' : '';
    let italicXml = appliedStyles.italic ? '<w:i/><w:iCs/>' : '';
    let underlineXml = appliedStyles.underline ? '<w:u w:val="single"/>' : '';

    let enhancedRPrXml = rPrXml;
    const styleXml = boldXml + italicXml + underlineXml;

    if (styleXml) {
      if (rPrXml.includes('</w:rPr>')) {
        enhancedRPrXml = rPrXml.replace('</w:rPr>', `${styleXml}</w:rPr>`);
      } else {
        enhancedRPrXml = `<w:rPr>${styleXml}</w:rPr>`;
      }
    }

    return `\n<w:p>${finalPPrXml}<w:r>${enhancedRPrXml}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
  }).join('') + '\n';
}

// Find <w:tc> blocks structure for addressing by [t-r-c]
function enumerateCells(xml: string) {
  const tables: Array<{ start: number; end: number; rows: Array<{ start: number; end: number; cells: Array<{ start: number; end: number; openEnd: number; closeStart: number; insertStart: number; pPrXml: string; rPrXml: string }> }> }> = [];
  const tblRe = /<w:tbl[\s\S]*?<\/w:tbl>/g;
  const trRe = /<w:tr[\s\S]*?<\/w:tr>/g;
  const tcRe = /<w:tc[\s\S]*?<\/w:tc>/g;
  let m: RegExpExecArray | null;
  const tbls = xml.match(tblRe) || [];
  let offset = 0;
  for (let ti = 0; ti < tbls.length; ti++) {
    const tblStr = tbls[ti];
    const tblStart = xml.indexOf(tblStr, offset);
    const tblEnd = tblStart + tblStr.length;
    offset = tblEnd;
    const rows: any[] = [];
    const rowMatches = tblStr.match(trRe) || [];
    let rowOffset = 0;
    for (let ri = 0; ri < rowMatches.length; ri++) {
      const rowStr = rowMatches[ri];
      const rowStart = tblStr.indexOf(rowStr, rowOffset) + tblStart;
      const rowEnd = rowStart + rowStr.length;
      rowOffset = rowStart - tblStart + rowStr.length;
      const cells: any[] = [];
      const cellMatches = rowStr.match(tcRe) || [];
      let cellOffset = 0;
      for (let ci = 0; ci < cellMatches.length; ci++) {
        const cellStr = cellMatches[ci];
        const cStart = rowStr.indexOf(cellStr, cellOffset) + rowStart;
        const cEnd = cStart + cellStr.length;
        cellOffset = cStart - rowStart + cellStr.length;
        // find the end of opening tag to replace inner content only
        const openEndRel = cellStr.indexOf('>');
        const openEnd = cStart + (openEndRel >= 0 ? openEndRel + 1 : 0);
        const closeRel = cellStr.lastIndexOf('</w:tc>');
        const closeStart = closeRel >= 0 ? (cStart + closeRel) : (cEnd - '</w:tc>'.length);
        // prefer insert after <w:tcPr> if exists, so we keep cell properties (gridSpan/vMerge etc.)
        let insertStart = openEnd;
        const tcPrMatch = cellStr.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
        if (tcPrMatch && typeof tcPrMatch.index === 'number') {
          insertStart = cStart + tcPrMatch.index + tcPrMatch[0].length;
        }
        // capture first paragraph properties to inherit spacing/indent
        let pPrXml = '';
        const pPrMatch = cellStr.match(/<w:pPr[\s\S]*?<\/w:pPr>/);
        if (pPrMatch) pPrXml = pPrMatch[0];
        // capture first run properties to inherit text style
        let rPrXml = '';
        const rPrMatch = cellStr.match(/<w:rPr[\s\S]*?<\/w:rPr>/);
        if (rPrMatch) rPrXml = rPrMatch[0];
        cells.push({ start: cStart, end: cEnd, openEnd, closeStart, insertStart, pPrXml, rPrXml });
      }
      rows.push({ start: rowStart, end: rowEnd, cells });
    }
    tables.push({ start: tblStart, end: tblEnd, rows });
  }
  return tables;
}

generateRouter.post('/generate-one', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const mappingRaw = (req.body?.mapping as string) || '';
    const valuesRaw = (req.body?.values as string) || '';
    let mappings: MappingItem[] = [];
    let values: Record<string, string> = {};
    try {
      const parsed = JSON.parse(mappingRaw || '{}');
      mappings = Array.isArray(parsed) ? parsed as MappingItem[] : (parsed.mappings as MappingItem[]) || [];
    } catch { /* ignore parse error */ }
    try {
      values = JSON.parse(valuesRaw || '{}') as Record<string, string>;
    } catch { values = {}; }
    if (!mappings.length) return res.status(400).json({ error: 'empty mappings' });

    const zip = new AdmZip(req.file.buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return res.status(400).json({ error: 'invalid docx' });
    let xml = entry.getData().toString('utf-8');

    const tables = enumerateCells(xml);

    // To avoid index shifting during string replacement, operate from later positions to earlier
    type Replacement = { start: number; end: number; xmlFrag: string };
    const replacements: Replacement[] = [];
    for (const mItem of mappings) {
      const content = values[mItem.fieldId] ?? '';
      const pos = mItem.position;
      const tbl = tables[pos.t];
      if (!tbl) continue;
      const row = tbl.rows[pos.r];
      if (!row) continue;
      const cell = row.cells[pos.c];
      if (!cell) continue;
      // 传入渲染规则(如果配置中有)
      const xmlFrag = buildParagraphsXml(
        content,
        mItem.mode,
        mItem.split || 'newline',
        cell.rPrXml,
        mItem.formatting?.renderRules,
        cell.pPrXml  // 🔥 传入模板的段落间距
      );
      replacements.push({ start: cell.insertStart, end: cell.closeStart, xmlFrag });
    }

    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      xml = xml.slice(0, r.start) + r.xmlFrag + xml.slice(r.end);
    }

    // 将更新写入一个新的 zip 实例，避免历史条目损坏
    const outZip = new AdmZip();
    // 复制原有所有条目
    for (const e of zip.getEntries()) {
      if (e.entryName === 'word/document.xml') {
        outZip.addFile(e.entryName, Buffer.from(xml, 'utf-8'));
      } else {
        outZip.addFile(e.entryName, e.getData());
      }
    }
    const out = outZip.toBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="generated.docx"');
    return res.send(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'generate failed' });
  }
});


