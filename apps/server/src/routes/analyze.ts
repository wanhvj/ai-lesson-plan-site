import type { AnalyzeResult, CandidateField, TablePosition } from '../types';
import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
export const analyzeRouter = express.Router();

function textOf(xml: string): string {
  // \b 防止匹配到 <w:tcW> <w:tcPr> 等非文本标签
  const tMatches = Array.from(xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g));
  return tMatches.map(m => m[1]).join('');
}

function count(regex: RegExp, s: string): number { return (s.match(regex) || []).length; }

function stripXmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

analyzeRouter.post('/analyze-template', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'no file' });
    }
    const zip = new AdmZip(req.file.buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) {
      return res.status(400).json({ error: 'invalid docx: missing document.xml' });
    }
    const xml = entry.getData().toString('utf-8');
    const tables = count(/<w:tbl/g, xml);

    // 粗略候选：标题（以：结尾）的单元格右邻为空白/下划线
    const candidates: CandidateField[] = [];
    const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;

    let tableIndex = -1;
    const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const tbls = xml.match(tblRegex) || [];
    const structure: Array<{ rows: number; colsPerRow: number[] }> = [];
    tbls.forEach((tblXml: string, ti: number) => {
      tableIndex = ti;
      const rows = tblXml.match(rowRegex) || [];
      const colsPerRow: number[] = [];
      rows.forEach((rowXml: string, ri: number) => {
        const cells = rowXml.match(cellRegex) || [];
        colsPerRow.push(cells.length);
        cells.forEach((cellXml: string, ci: number) => {
          const text = textOf(cellXml).replace(/\s+/g, '');
          // 标题检测：带冒号结尾的（如"教学目标："）
          const isLabel = /[:：]$/.test(text) && text.length <= 20;
          // 新增：无冒号的纯中文短文本（2-8字），右边是空白 → 也视为标签（如"课程名称"）
          const hasBlankRight = ci + 1 < cells.length && (() => {
            const rightText = textOf(cells[ci + 1]).trim();
            return rightText === '' || /^[_—\-\s（）()]*$/.test(rightText);
          })();
          const isShortLabel = !isLabel && text.length >= 2 && text.length <= 8 && hasBlankRight && ci + 1 < cells.length
            && /^[一-鿿⺀-⻿⼀-⿟　-〿]+$/.test(text); // 仅中文字符

          if (isLabel && ci + 1 < cells.length) {
            const rightText = textOf(cells[ci + 1]).trim();
            const isBlank = rightText === '' || /[_—\-]{3,}/.test(rightText) || /（\s*）|\(\s*\)/.test(rightText);
            if (isBlank) {
              const pos: TablePosition = { t: ti, r: ri, c: ci + 1 };
              candidates.push({
                id: `cand_${ti}_${ri}_${ci + 1}`,
                labelHint: stripXmlTags(text.replace(/[:：]$/, '')),
                position: pos,
                confidence: 0.85,
                modeHints: ['replace']
              });
            }
          }
          // 新增：无冒号标签检测（如"课程名称"右边是空白格）
          if (isShortLabel) {
            const pos: TablePosition = { t: ti, r: ri, c: ci + 1 };
            candidates.push({
              id: `cand_sl_${ti}_${ri}_${ci + 1}`,
              labelHint: stripXmlTags(text),
              position: pos,
              confidence: 0.8,
              modeHints: ['replace']
            });
          }
          // 空白格检测
          const onlyBlank = text === '' || /^[_—\-\s（）()]*$/.test(text);
          if (onlyBlank) {
            candidates.push({
              id: `cand_${ti}_${ri}_${ci}`,
              position: { t: ti, r: ri, c: ci },
              confidence: 0.5,
              modeHints: ['replace']
            });
          }
          // 同格多行提示：检测有实际内容的长文本（>8字），避免把第一列短标签误识别
          if (/知识基础|能力基础|情感基础|复习提问|导入新课|讲授新课|课堂总结/.test(text) && text.length > 8) {
            candidates.push({
              id: `cand_ml_${ti}_${ri}_${ci}`,
              labelHint: stripXmlTags(text),
              position: { t: ti, r: ri, c: ci },
              confidence: 0.7,
              modeHints: ['multiline']
            });
          }
        });
      });
      structure.push({ rows: rows.length, colsPerRow });
    });

    const result: AnalyzeResult = {
      tables: { count: tables, structure },
      candidates
    };
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'analyze failed' });
  }
});

// ===== 深度解析示例文档格式：提取段落结构、加粗信息 =====
analyzeRouter.post('/analyze-example-format', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const zip = new AdmZip(req.file.buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return res.status(400).json({ error: 'invalid docx' });
    const xml = entry.getData().toString('utf-8');

    const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const trRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
    const pRegex = /<w:p[\s\S]*?<\/w:p>/g;
    const rRegex = /<w:r[\s\S]*?<\/w:r>/g;

    const tbls = xml.match(tblRegex) || [];
    const cellFormats: Array<{
      position: { t: number; r: number; c: number };
      paragraphs: Array<{
        segments: Array<{ text: string; bold: boolean }>;
        fullText: string;
      }>;
      combinedText: string;
      // 🔥 自动生成的渲染规则和AI结构
      autoRenderRules: Array<{ pattern: string; styles: { bold: boolean }; partialBold: boolean }>;
      autoAIStructure: { description: string; parts: Array<{ label: string }> } | null;
    }> = [];

    tbls.forEach((tblXml, ti) => {
      const rows = tblXml.match(trRegex) || [];
      rows.forEach((rowXml, ri) => {
        const cells = rowXml.match(tcRegex) || [];
        cells.forEach((cellXml, ci) => {
          const ps = cellXml.match(pRegex) || [];
          const paragraphs: Array<{ segments: Array<{ text: string; bold: boolean }>; fullText: string }> = [];

          ps.forEach(pXml => {
            const runs = pXml.match(rRegex) || [];
            const segments: Array<{ text: string; bold: boolean }> = [];

            runs.forEach(rXml => {
              // 提取文本
              const tMatch = rXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
              const text = tMatch ? tMatch[1] : '';
              if (!text) return;

              // 检测是否加粗
              const hasBold = /<w:b[\s/]/.test(rXml) || /<w:bCs[\s/]/.test(rXml);
              segments.push({ text, bold: hasBold });
            });

            if (segments.length > 0) {
              paragraphs.push({
                segments,
                fullText: segments.map(s => s.text).join(''),
              });
            }
          });

          if (paragraphs.length === 0) return;

          const combinedText = paragraphs.map(p => p.fullText).join('\n');

          // 🔥 自动分析：识别每段开头的加粗标签
          const boldLabels: string[] = [];
          let allLabelsAtStart = true;
          let allFirstSegmentBold = true;

          for (const p of paragraphs) {
            const firstSeg = p.segments[0];
            if (firstSeg && firstSeg.bold) {
              // 收集加粗的标签文字（去掉末尾冒号等标点）
              const label = firstSeg.text.replace(/[:：\s]+$/, '').trim();
              if (label) boldLabels.push(firstSeg.text);
            } else {
              allFirstSegmentBold = false;
              if (p.segments.length === 0 || !firstSeg?.bold) {
                allLabelsAtStart = false;
              }
            }
          }

          // 🔥 生成渲染规则
          const autoRenderRules: Array<{ pattern: string; styles: { bold: boolean }; partialBold: boolean }> = [];

          if (allFirstSegmentBold && boldLabels.length >= 2) {
            // 多个段落都以加粗开头 → 生成"标签加粗"规则
            // 对每个加粗标签生成独立规则
            for (const label of boldLabels) {
              const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              autoRenderRules.push({
                pattern: `^${escaped}`,
                styles: { bold: true },
                partialBold: true,
              });
            }
          } else if (paragraphs.length >= 2) {
            // 多段落但非标签加粗：对每段第一段文字尝试生成规则
            for (const p of paragraphs) {
              const firstSeg = p.segments[0];
              if (firstSeg && firstSeg.bold) {
                const escaped = firstSeg.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                autoRenderRules.push({
                  pattern: `^${escaped}`,
                  styles: { bold: true },
                  partialBold: true,
                });
              }
            }
          }

          // 🔥 生成AI结构提示
          let autoAIStructure: { description: string; parts: Array<{ label: string }> } | null = null;

          if (paragraphs.length >= 2) {
            const parts = paragraphs.map(p => {
              const firstSeg = p.segments[0];
              const label = firstSeg ? firstSeg.text : '';
              return { label };
            });
            const desc = `必须分为${paragraphs.length}段，每段单独一行。`;
            autoAIStructure = { description: desc, parts };
          } else if (paragraphs.length === 1 && boldLabels.length >= 2) {
            // 单段落中有多个加粗标签
            const parts = boldLabels.map(l => ({ label: l }));
            autoAIStructure = {
              description: `内容包含以下部分，每部分单独成段：`,
              parts,
            };
          }

          cellFormats.push({
            position: { t: ti, r: ri, c: ci },
            paragraphs,
            combinedText,
            autoRenderRules,
            autoAIStructure,
          });
        });
      });
    });

    return res.json({ cellFormats });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'analyze example format failed' });
  }
});



analyzeRouter.post('/analyze-example', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const zip = new AdmZip(req.file.buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return res.status(400).json({ error: 'invalid docx' });
    const xml = entry.getData().toString('utf-8');

    const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
    const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const tbls = xml.match(tblRegex) || [];

    const cells: Array<{ t: number; r: number; c: number; text: string }> = [];

    tbls.forEach((tblXml, ti) => {
      const rows = tblXml.match(rowRegex) || [];
      rows.forEach((rowXml, ri) => {
        const matchCells = rowXml.match(cellRegex) || [];
        matchCells.forEach((cellXml, ci) => {
          const text = textOf(cellXml).replace(/\s+/g, '').trim();
          if (text) {
            cells.push({ t: ti, r: ri, c: ci, text });
          }
        });
      });
    });

    res.json({ cells });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'analyze example failed' });
  }
});

// PPT 创作室只需读取教案正文。第一版限定 Word，避免把多种格式的差异带进制作流程。
analyzeRouter.post('/analyze-presentation-source', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({ error: 'only docx is supported' });
    }
    const zip = new AdmZip(req.file.buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return res.status(400).json({ error: 'invalid docx' });
    const xml = entry.getData().toString('utf-8');
    const paragraphs = Array.from(xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g))
      .map(match => textOf(match[0]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const content = Array.from(new Set(paragraphs)).join('\n').slice(0, 18000);
    const title = paragraphs.find(item => item.length >= 4 && item.length <= 40)
      || req.file.originalname.replace(/\.docx$/i, '');
    return res.json({ title, content });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'presentation source analysis failed' });
  }
});

