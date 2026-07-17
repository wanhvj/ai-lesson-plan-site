import express from 'express';

export const aiRouter = express.Router();

type Provider = 'openai' | 'doubao' | 'deepseek';

type CellContext = {
  position: { t: number; r: number; c: number };
  leftLabel?: string;
  cellText?: string;
  aboveLabel?: string;
};

type AutoMapBody = {
  cells: CellContext[];
  provider?: Provider;
  model?: string;
};

type AIStructure = {
  description?: string;
  parts?: Array<{
    label: string;
    duration?: string;
  }>;
};

type FormattingConfig = {
  type?: 'structured' | 'plain' | 'list' | 'table';
  aiStructure?: AIStructure;
  renderRules?: any[];
};

type ExampleCellFormat = {
  position: { t: number; r: number; c: number };
  paragraphs: Array<{
    segments: Array<{ text: string; bold: boolean }>;
    fullText: string;
  }>;
  combinedText: string;
};

type MappingItem = {
  fieldId: string;
  position: any;
  mode: 'replace' | 'multiline';
  split?: 'newline' | 'blankline';
  formatting?: FormattingConfig;
};

type GenerateBody = {
  model?: string;
  topic: string;
  fields: string[];
  provider?: Provider;
  params?: {
    detailLevel?: 'brief' | 'normal' | 'rich';
    style?: '严谨' | '活泼';
  };
  mappings?: MappingItem[];
  exampleContent?: string;
  referenceContent?: string;
  exampleFormats?: ExampleCellFormat[];
  fieldRequirements?: Record<string, string>;
  feedbackMap?: Record<string, string>;
};

const PROVIDER_CONFIG: Record<Provider, { endpoint: string; defaultModel: string; supportsJsonMode: boolean }> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    supportsJsonMode: true,
  },
  doubao: {
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'ep-20241012124107-xxxxx',
    supportsJsonMode: false,
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    supportsJsonMode: false,
  },
};

function providerLabel(provider: Provider) {
  if (provider === 'doubao') return '豆包';
  if (provider === 'deepseek') return 'DeepSeek';
  return 'OpenAI';
}

function describeNetworkError(err: unknown, provider: Provider) {
  const e = err as { code?: string; message?: string; cause?: { code?: string; address?: string; port?: number } };
  const code = e?.cause?.code || e?.code;
  const label = providerLabel(provider);

  if (code === 'EACCES') {
    return `${label}服务器当前无法连接，请检查本机网络、代理或防火墙设置`;
  }
  if (code === 'ENOTFOUND') {
    return `${label}域名解析失败，请检查网络或 DNS 设置`;
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return `${label}服务器连接被中断，请稍后再试`;
  }
  if (code === 'ETIMEDOUT') {
    return `${label}服务器连接超时，请检查网络后重试`;
  }
  if (e?.cause?.address && e?.cause?.port) {
    return `${label}连接失败（${e.cause.address}:${e.cause.port}）`;
  }
  return e?.message || `${label}调用失败`;
}

function cleanFieldName(text: string) {
  return text.replace(/[（(].*?[)）]/g, '').trim();
}

function inferStructureGuidance(field: string, mappings?: MappingItem[], exampleFormats?: ExampleCellFormat[]) {
  const mapping = mappings?.find(item => item.fieldId === field);
  const aiStructure = mapping?.formatting?.aiStructure;
  let text = '';

  if (aiStructure) {
    text += `\n\n【字段“${field}”的格式要求】`;
    if (aiStructure.description) {
      text += `\n- 结构说明：${aiStructure.description}`;
    }
    if (aiStructure.parts?.length) {
      text += `\n- 必须包含以下部分：`;
      for (const part of aiStructure.parts) {
        text += `\n  * ${part.label}${part.duration ? `（${part.duration}）` : ''}`;
      }
    }
  }

  if (!exampleFormats?.length) return text;

  const clean = cleanFieldName(field);
  const match = exampleFormats.find(fmt => fmt.combinedText.replace(/\s/g, '').includes(clean));
  if (!match) return text;

  if (match.paragraphs.length >= 2) {
    text += `\n- 参考示例显示：该字段适合分成 ${match.paragraphs.length} 段来写`;
  }

  const boldHeads = match.paragraphs
    .map(p => p.segments.find(seg => seg.bold)?.text?.trim())
    .filter(Boolean) as string[];

  if (boldHeads.length >= 2) {
    text += `\n- 可参考以下段落开头：${boldHeads.join('、')}`;
  }

  return text;
}

function buildPrompt(
  topic: string,
  fields: string[],
  params?: GenerateBody['params'],
  mappings?: MappingItem[],
  exampleContent?: string,
  referenceContent?: string,
  exampleFormats?: ExampleCellFormat[],
  fieldRequirements?: Record<string, string>,
  feedbackMap?: Record<string, string>,
) {
  const style = params?.style ?? '严谨';
  const detail = params?.detailLevel ?? 'normal';
  const detailHint =
    detail === 'brief'
      ? '尽量精炼，控制在 2 到 4 行'
      : detail === 'rich'
        ? '内容充分，分段清晰，每项 4 到 8 行'
        : '适中，控制在 3 到 6 行';

  const fieldsList = fields
    .map(field => {
      const requirement = fieldRequirements?.[field]?.trim();
      return requirement ? `- ${field}（要求：${requirement}）` : `- ${field}`;
    })
    .join('\n');

  const structureHints = fields
    .map(field => inferStructureGuidance(field, mappings, exampleFormats))
    .filter(Boolean)
    .join('');

  const xueqingHint = fields.some(field => field.includes('学情分析'))
    ? `\n\n【特别注意】如果字段名包含“学情分析”，请优先按“知识基础、能力基础、情感基础”的结构来写。`
    : '';

  const feedbackHints = feedbackMap
    ? Object.entries(feedbackMap)
        .filter(([, value]) => value && value.trim())
        .map(([field, value]) => `- ${field}：${value.trim()}`)
        .join('\n')
    : '';

  const exampleSection = exampleContent?.trim()
    ? `【风格参考】\n以下是一份已填写好的教案内容，请模仿它的语言节奏、细致程度和组织方式，但不要照抄具体内容：\n${exampleContent.trim()}\n\n`
    : '';

  const referenceSection = referenceContent?.trim()
    ? `【内容参考】\n以下是一段整体参考内容，可借鉴其主题表达、知识点组织或措辞方式：\n${referenceContent.trim()}\n\n`
    : '';

  const feedbackSection = feedbackHints ? `\n\n【修改要求】\n${feedbackHints}` : '';

  const user = `${exampleSection}${referenceSection}请围绕课程主题“${topic}”，为下列字段分别撰写内容：
${fieldsList}

【重要要求】
1. 语言风格：${style}
2. 详细程度：${detailHint}
3. JSON 的键名必须与上述字段名完全一致，不能改名、简写或遗漏
4. 只输出 JSON 对象，不要输出额外解释、标题或 Markdown
5. 每个值都是字符串；如果需要分段，请用 \\n 表示换行${structureHints}${xueqingHint}${feedbackSection}

示例格式：
{
  "字段名1": "内容1",
  "字段名2": "内容2"
}`;

  return {
    system: '你是一名资深教研员，负责生成结构化教案内容。你必须严格按字段名返回 JSON。',
    user,
  };
}

function normalizeValues(expectedFields: string[], rawValues: Record<string, unknown>) {
  const values: Record<string, string> = {};
  const aiKeys = Object.keys(rawValues);
  const fieldMapping: Record<string, string> = {};

  for (const expectedField of expectedFields) {
    if (expectedField in rawValues) continue;
    const simplifiedExpected = cleanFieldName(expectedField);
    const matchedKey = aiKeys.find(key => {
      if (key === expectedField) return false;
      const simplifiedKey = cleanFieldName(key);
      return (
        simplifiedKey === simplifiedExpected ||
        simplifiedExpected.includes(simplifiedKey) ||
        simplifiedKey.includes(simplifiedExpected)
      );
    });
    if (matchedKey) {
      fieldMapping[matchedKey] = expectedField;
    }
  }

  for (const [key, target] of Object.entries(fieldMapping)) {
    if (!(target in rawValues)) {
      rawValues[target] = rawValues[key];
    }
  }

  for (const field of expectedFields) {
    const value = rawValues[field];
    values[field] = typeof value === 'string' ? value : String(value ?? '');
  }

  return values;
}

function parseJsonContent(content: string) {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
  return JSON.parse(jsonStr);
}

aiRouter.post('/ai/generate-content', async (req, res) => {
  try {
    const body = req.body as GenerateBody;
    if (!body?.topic || !Array.isArray(body.fields) || body.fields.length === 0) {
      return res.status(400).json({ error: 'invalid params' });
    }

    const auth = (req.headers.authorization as string | undefined) || '';
    const directKey = (req.headers['x-api-key'] as string | undefined) || '';
    const apiKey = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : directKey;
    if (!apiKey) {
      return res.status(401).json({ error: 'missing api key' });
    }

    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const model = body.model || config.defaultModel;
    const { system, user } = buildPrompt(
      body.topic,
      body.fields,
      body.params,
      body.mappings,
      body.exampleContent,
      body.referenceContent,
      body.exampleFormats,
      body.fieldRequirements,
      body.feedbackMap,
    );

    const requestBody: any = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    };

    if (config.supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: 'llm_error', detail: detail.slice(0, 500) });
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content || '{}';

    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonContent(content);
    } catch {
      parsed = { 生成内容: content };
    }

    const values = normalizeValues(body.fields, parsed);
    return res.json({ values, model, provider });
  } catch (error) {
    console.error(error);
    const provider = ((req.body as Partial<GenerateBody>)?.provider || 'openai') as Provider;
    return res.status(502).json({
      error: 'ai_generate_failed',
      detail: describeNetworkError(error, provider),
    });
  }
});

aiRouter.post('/ai/auto-map', async (req, res) => {
  try {
    const body = req.body as AutoMapBody;
    const auth = (req.headers.authorization as string | undefined) || '';
    const directKey = (req.headers['x-api-key'] as string | undefined) || '';
    const apiKey = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : directKey;
    if (!apiKey) {
      return res.status(401).json({ error: 'missing api key' });
    }

    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const model = body.model || config.defaultModel;

    if (!body.cells?.length) {
      return res.status(400).json({ error: 'no cells provided' });
    }

    const needsAI = body.cells.filter(cell => !cell.leftLabel);
    const labeled = body.cells.filter(cell => cell.leftLabel);

    const suggestions = labeled.map(cell => ({
      position: cell.position,
      description: cell.leftLabel!,
      mode: cell.cellText && /知识基础|能力基础|情感基础|复习提问|导入新课|讲授新课|课堂总结/.test(cell.cellText)
        ? 'multiline'
        : 'replace',
    }));

    if (!needsAI.length) {
      return res.json({ suggestions });
    }

    const cellList = needsAI
      .map((cell, index) => {
        const parts = [
          `单元格${index + 1}: 第${cell.position.t + 1}个表格`,
          `第${cell.position.r + 1}行`,
          `第${cell.position.c + 1}列`,
        ];
        if (cell.aboveLabel) parts.push(`上方文字: "${cell.aboveLabel}"`);
        if (cell.cellText) parts.push(`已有文字: "${cell.cellText}"`);
        return parts.join('，');
      })
      .join('\n');

    const requestBody: any = {
      model,
      messages: [
        {
          role: 'system',
          content: '你是一名教案模板分析助手。请只输出 JSON 数组，每项包含 position 和 description。',
        },
        {
          role: 'user',
          content: `请分析以下教案模板中的空白单元格，并判断每个单元格应该填写什么内容。\n\n${cellList}\n\n返回格式示例：\n[{ "position": { "t": 0, "r": 1, "c": 1 }, "description": "教学目标" }]`,
        },
      ],
      temperature: 0.3,
    };

    if (config.supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.json({ suggestions, aiError: `llm_error: ${detail.slice(0, 200)}` });
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content || '[]';

    let aiSuggestions: Array<{ position: { t: number; r: number; c: number }; description: string }> = [];
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const parsed = JSON.parse(jsonStr);
      aiSuggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
    } catch {
      aiSuggestions = [];
    }

    for (const item of aiSuggestions) {
      const exists = suggestions.some(
        suggestion =>
          suggestion.position.t === item.position.t &&
          suggestion.position.r === item.position.r &&
          suggestion.position.c === item.position.c,
      );
      if (exists) continue;

      const original = needsAI.find(
        cell =>
          cell.position.t === item.position.t &&
          cell.position.r === item.position.r &&
          cell.position.c === item.position.c,
      );
      if (!original) continue;

      suggestions.push({
        position: item.position,
        description: item.description,
        mode: original.cellText && /知识基础|能力基础|情感基础|复习提问|导入新课|讲授新课|课堂总结/.test(original.cellText)
          ? 'multiline'
          : 'replace',
      });
    }

    return res.json({ suggestions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'auto_map_failed' });
  }
});
