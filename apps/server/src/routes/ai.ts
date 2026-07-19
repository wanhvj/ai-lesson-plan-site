import express from 'express';

export const aiRouter = express.Router();

type Provider = 'openai' | 'doubao' | 'deepseek' | 'qwen' | 'openai_next' | 'ai_codex';

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

type AgentChatBody = {
  model?: string;
  provider?: Provider;
  mode?: 'lesson_agent' | 'treehole';
  topic?: string;
  style?: '严谨' | '活泼';
  personaStyle?: '东北逗趣' | '温和共创';
  detailLevel?: 'brief' | 'normal' | 'rich';
  referenceContent?: string;
  messages?: Array<{
    role: 'assistant' | 'user';
    content: string;
  }>;
};

type PresentationSlide = {
  id?: string;
  title: string;
  subtitle: string;
  bullets: string[];
  visualBrief?: string;
  html?: string;
  imageTheme?: 'technology' | 'classroom' | 'teamwork' | 'science' | 'notes';
  layout?: 'cover' | 'route' | 'compare' | 'diagram' | 'process' | 'practice' | 'diagnose' | 'closing';
};

type PresentationBody = {
  model?: string;
  provider?: Provider;
  sourceContent?: string;
  topic?: string;
  instruction?: string;
  pageCount?: number;
  theme?: string;
};

type PresentationChatBody = {
  model?: string;
  provider?: Provider;
  sourceContent?: string;
  messages?: Array<{ role: 'assistant' | 'user'; content: string }>;
};

type PresentationRevisionBody = {
  model?: string;
  provider?: Provider;
  sourceContent?: string;
  instruction?: string;
  slide?: PresentationSlide;
};

type PresentationHtmlBody = {
  model?: string;
  provider?: Provider;
  sourceContent?: string;
  theme?: string;
  slides?: PresentationSlide[];
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
  qwen: {
    // 阿里云百炼提供的 OpenAI 兼容接口，用户可在界面中覆盖默认模型名称。
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    supportsJsonMode: false,
  },
  openai_next: {
    // OpenAI Next Credits 的 OpenAI 兼容 Chat Completions 接口，仅由 PPT 创作室的模型选项使用。
    endpoint: 'https://api.openai-next.com/v1/chat/completions',
    defaultModel: 'gpt-5.6-terra',
    supportsJsonMode: false,
  },
  ai_codex: {
    // Ai-Codex 提供的 /v1 OpenAI 兼容地址，仅由 PPT 创作室的模型选项使用。
    endpoint: 'https://codex.ai02.cn/v1/chat/completions',
    defaultModel: 'gpt-5.6-terra',
    supportsJsonMode: false,
  },
};

function providerLabel(provider: Provider) {
  if (provider === 'doubao') return '豆包';
  if (provider === 'deepseek') return 'DeepSeek';
  if (provider === 'qwen') return '通义千问';
  if (provider === 'openai_next') return 'GPT-5.6 Terra';
  if (provider === 'ai_codex') return 'Ai-Codex GPT-5.6 Terra';
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

function buildAgentChatSystemPrompt(body: AgentChatBody) {
  const mode = body.mode || 'lesson_agent';

  if (mode === 'treehole') {
    const personaPrompt =
      body.personaStyle === '东北逗趣'
        ? [
            '你现在是教师树洞里的“东北逗趣”回复风格。',
            '语气要接地气、爽快、有画面感，像一句轻松段子或网络热梗接梗，但不要油腻，不要刻意模仿具体名人，不要使用攻击性玩笑。',
            '只用一句话把用户的情绪接住并轻轻化解，不要给建议清单，不要讲大道理。',
            '可以使用“这波”“班味”“CPU干烧了”“人间真实”“先别急，咱把锅盖掀开透口气”这类轻松表达，但要自然。',
          ].join('\n')
        : [
            '你现在是教师树洞里的“温和共创”回复风格。',
            '语气要温柔、真诚、稳定，但表达要短，像一句轻松的朋友式回应。',
            '只用一句话接住用户情绪，可以带一点温柔幽默或网络口语，不要说教，不要展开分析。',
            '可以使用“先把自己从情绪锅里捞出来”“今天先允许自己下线两分钟”这类轻松表达，但要自然。',
          ].join('\n');

    return [
      '你在教师百宝箱的树洞页面回复用户。',
      '这里的目标不是写教案，而是帮助老师表达情绪、松一口气。',
      personaPrompt,
      '硬性要求：每次只回复一句话，最多35个中文字左右。',
      '回复要像一句幽默短评、段子接梗或网络热梗，不要超过一行半。',
      '不要输出列表、代码块、JSON、Markdown 表格，不要分段，不要标题。',
      '避免“以下是”“综上所述”“我理解你的感受”这类模板腔，也不要把回复写成鸡汤文章。',
    ].join('\n');
  }

  return [
    '你是“Agent小助手”，像一位坐在旁边一起备课的同事老师，温和、真诚、专业，但不要像系统说明书。',
    '你的沟通方式要像两个老师正常交流：先接住对方的想法，再顺着聊，给出启发、建议和可落地的课堂设计方向。',
    '不要直接粘贴一整段“模型输出”或完整教案，不要上来就列很多大纲。除非老师明确要求，否则每次回复控制在2到4个自然段，最多3个要点。',
    '优先使用“我觉得可以这样试试”“这个思路挺适合”“如果是我的话，我会先抓住……”这类自然表达。',
    '当老师想法还模糊时，先帮他归纳已有想法，再问1个关键问题；当信息足够时，给一段可以写进上方参考内容里的“教案思路草稿”。',
    '你的目标是帮助老师找到自己的教学特色，而不是替老师做决定。少用命令语气，多用商量、建议、共创的语气。',
    '不要输出 JSON、Markdown 表格、代码块，也不要使用“以下是”“综上所述”这种生硬模板腔。',
    body.topic ? `当前课程主题：${body.topic}` : '',
    body.style ? `偏好风格：${body.style}` : '',
    body.detailLevel ? `内容详略：${body.detailLevel}` : '',
    body.referenceContent ? `老师已写的参考内容：${body.referenceContent.slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n');
}

function keepTreeholeReplyShort(reply: string) {
  const normalized = reply.replace(/\s+/g, ' ').trim();
  if (!normalized) return '这事儿先别硬扛，咱把情绪放树洞里晾一晾。';

  const firstSentence = normalized.match(/^.+?[。！？!?]/)?.[0] || normalized;
  return firstSentence.length > 45 ? `${firstSentence.slice(0, 45)}……` : firstSentence;
}

aiRouter.post('/ai/agent-chat', async (req, res) => {
  try {
    const body = req.body as AgentChatBody;
    const auth = (req.headers.authorization as string | undefined) || '';
    const directKey = (req.headers['x-api-key'] as string | undefined) || '';
    const apiKey = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : directKey;
    if (!apiKey) {
      return res.status(401).json({ error: 'missing api key' });
    }

    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const model = body.model || config.defaultModel;
    const messages = (body.messages || []).slice(-12);
    if (!messages.length) {
      return res.status(400).json({ error: 'no messages provided' });
    }

    const system = buildAgentChatSystemPrompt(body);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...messages.map(message => ({
            role: message.role,
            content: message.content,
          })),
        ],
        temperature: 0.85,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: 'llm_error', detail: detail.slice(0, 500) });
    }

    const data = await response.json();
    const rawReply: string = data?.choices?.[0]?.message?.content || '我已经收到，我们可以继续一起梳理。';
    const reply = body.mode === 'treehole' ? keepTreeholeReplyShort(rawReply) : rawReply;
    return res.json({ reply, model, provider });
  } catch (error) {
    console.error(error);
    const provider = ((req.body as Partial<AgentChatBody>)?.provider || 'openai') as Provider;
    return res.status(502).json({
      error: 'agent_chat_failed',
      detail: describeNetworkError(error, provider),
    });
  }
});

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

function readApiKey(req: express.Request) {
  const authorization = (req.headers.authorization as string | undefined) || '';
  const directKey = (req.headers['x-api-key'] as string | undefined) || '';
  return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : directKey;
}

async function askPresentationModel(provider: Provider, model: string, apiKey: string, messages: Array<{ role: string; content: string }>, json = false) {
  const config = PROVIDER_CONFIG[provider];
  const body: Record<string, unknown> = { model, messages, temperature: 0.7 };
  if (json && config.supportsJsonMode) body.response_format = { type: 'json_object' };
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 500));
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '');
}

aiRouter.post('/ai/ppt-chat', async (req, res) => {
  try {
    const body = req.body as PresentationChatBody;
    const apiKey = readApiKey(req);
    if (!apiKey) return res.status(401).json({ error: 'missing api key' });
    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const conversation = (body.messages || []).slice(-10);
    if (!conversation.length) return res.status(400).json({ error: 'no messages provided' });
    const source = body.sourceContent?.slice(0, 6000);
    const reply = await askPresentationModel(provider, body.model || config.defaultModel, apiKey, [
      {
        role: 'system',
        content: '你是课堂PPT共创助手。和老师自然对话，帮助补足受众、目标、案例、练习和课堂节奏。每次只回答2到4句，不要生成PPT，不要使用Markdown表格。提醒老师：准备好后由老师主动点击生成页面计划。',
      },
      ...(source ? [{ role: 'system', content: `已上传教案摘要：\n${source}` }] : []),
      ...conversation,
    ]);
    return res.json({ reply, provider, model: body.model || config.defaultModel });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'ppt_chat_failed', detail: (error as Error).message });
  }
});

aiRouter.post('/ai/generate-presentation', async (req, res) => {
  try {
    const body = req.body as PresentationBody;
    const apiKey = readApiKey(req);
    if (!apiKey) return res.status(401).json({ error: 'missing api key' });
    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const count = Math.max(3, Math.min(20, Number(body.pageCount) || 8));
    const content = await askPresentationModel(provider, body.model || config.defaultModel, apiKey, [
      {
        role: 'system',
        content: '你是课堂PPT策划师，也是一名资深教学设计师。请只输出合法JSON：{"title":"","slides":[{"title":"","subtitle":"","bullets":["","",""],"visualBrief":""}]}。第二步只负责内容计划，不要规定版式、颜色、图片或 HTML 结构，这些会交给下一步的视觉设计师自由创作。每页只表达一个核心判断，所有文字以中文为主，每页最多4个短要点，避免长段落。不要机械安排目录页，要根据教案的教学节奏组织内容。visualBrief 用一句话说明这一页希望传达的画面感或讲述重点，例如“用清晰因果关系解释自锁”。',
      },
      {
        role: 'user',
        content: `课程主题：${body.topic || '未命名课程'}\n要求页数：${count}\n老师补充要求：${body.instruction || '无'}\n教案内容：${(body.sourceContent || '无').slice(0, 12000)}`,
      },
    ], true);
    const parsed = parseJsonContent(content) as { title?: string; slides?: PresentationSlide[] };
    return res.json({ title: parsed.title, slides: Array.isArray(parsed.slides) ? parsed.slides.slice(0, count) : [] });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'presentation_generation_failed', detail: (error as Error).message });
  }
});

function sanitizePresentationMarkup(value: string) {
  return value
    .replace(/<(script|iframe|object|embed|style|link)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|style|link)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*javascript:.*?\1/gi, '');
}

function sanitizeCreativeCss(value: string) {
  return value
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .slice(0, 50000);
}

function sanitizeCreativeSlideMarkup(value: string) {
  return sanitizePresentationMarkup(value)
    .replace(/\s(?:src|href)\s*=\s*(['"])(?!https:\/\/)[\s\S]*?\1/gi, '')
    .slice(0, 18000);
}

function safeFontUrl(value: unknown) {
  const url = String(value || '');
  return /^https:\/\/(?:fonts\.googleapis\.com|api\.fontshare\.com)\//.test(url) ? url : '';
}

aiRouter.post('/ai/generate-presentation-html-legacy', async (req, res) => {
  try {
    const body = req.body as PresentationHtmlBody;
    const apiKey = readApiKey(req);
    if (!apiKey) return res.status(401).json({ error: 'missing api key' });
    if (!body.slides?.length) return res.status(400).json({ error: 'missing slides' });
    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const content = await askPresentationModel(provider, body.model || config.defaultModel, apiKey, [
      {
        role: 'system',
        content: '你是一名世界级教学演示设计师，同时精通 HTML 与 CSS。请把老师给出的逐页内容设计为一整套具有统一艺术方向、但每页构图不同的高质量课堂课件。你可以自由决定色彩、字体、留白、照片位置、信息图、CSS 图形、流程关系和 CSS 动画；不要生成千篇一律的圆角卡片、默认渐变或仪表盘布局。只输出合法 JSON：{"fontUrl":"https://fonts.googleapis.com/css2?family=...","css":"...","slides":[{"html":"..."}]}。css 是整套课件的完整视觉样式；slides 数量必须与输入页面数量一致；每个 html 只写该页的内部语义 HTML，不包含 html/head/body/style/script 标签，也不包含外层 section。外层会由系统提供为固定 1920×1080 的 .slide，请不要给 .slide 写 display、position、visibility、opacity 或尺寸规则。可以使用任意有意义的 class 名和 CSS 动画；每页最多 4 个短要点、中文清晰可读、不能滚动或溢出。若需要照片，可使用 https 图片地址；若没有可靠图片地址，就用 CSS 图形、纹理、线条和构图完成视觉表达。禁止 script、iframe、表单和事件属性。',
      },
      {
        role: 'user',
        content: `教案摘要：${(body.sourceContent || '').slice(0, 4500)}\n需要设计的页面：${JSON.stringify(body.slides.map(({ title, subtitle, bullets, id, layout }) => ({ id, title, subtitle, bullets, layout })))}`,
      },
    ], true);
    const parsed = parseJsonContent(content) as { fontUrl?: string; css?: string; slides?: Array<{ html?: string }> };
    if (!Array.isArray(parsed.slides) || parsed.slides.length < body.slides.length) {
      return res.status(422).json({ error: 'creative_deck_incomplete', detail: '模型没有返回完整的 HTML 课件，请重试。' });
    }
    return res.json({ design: {
      fontUrl: safeFontUrl(parsed.fontUrl),
      css: sanitizeCreativeCss(String(parsed.css || '')),
      slides: body.slides.map((_, index) => ({ html: sanitizeCreativeSlideMarkup(String(parsed.slides?.[index]?.html || '')) })),
    } });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'presentation_html_generation_failed', detail: (error as Error).message });
  }
});

aiRouter.post('/ai/generate-presentation-html', async (req, res) => {
  try {
    const body = req.body as PresentationHtmlBody;
    const apiKey = readApiKey(req);
    if (!apiKey) return res.status(401).json({ error: 'missing api key' });
    if (!body.slides?.length) return res.status(400).json({ error: 'missing slides' });
    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const assetUrls = [
      'https://images.unsplash.com/photo-1581092160607-5c69a8ed9e09?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1581090760221-9c6c2a00f7a3?auto=format&fit=crop&w=1600&q=85',
    ];
    const directionContent = await askPresentationModel(provider, body.model || config.defaultModel, apiKey, [
      { role: 'system', content: '你是课程课件的视觉总监。先只制定整套课件的视觉系统，不写单页 HTML。课件必须像专业教学设计作品，不能只是文字卡片。根据主题选择有明确性格的艺术方向，形成深浅节奏、至少三种构图语言、统一而不单调的色彩体系。只输出合法 JSON：{"fontUrl":"https://fonts.googleapis.com/css2?family=...","css":"完整CSS","visualDirection":"一句设计说明","slideDirections":[{"composition":"","imageRole":"","visualFocus":""}]}。css 只定义模型内部 class；禁止给 .slide 写 display、position、visibility、opacity 或尺寸。至少提供 .model-photo、.model-image、.slide-title、.slide-kicker、.slide-number 的可用样式。' },
      { role: 'user', content: `教案摘要：${(body.sourceContent || '').slice(0, 6500)}\n逐页内容：${JSON.stringify(body.slides.map(({ title, subtitle, bullets, id }) => ({ id, title, subtitle, bullets })))}` },
    ], true);
    const direction = parseJsonContent(directionContent) as { fontUrl?: string; css?: string; visualDirection?: string; slideDirections?: Array<{ composition?: string; imageRole?: string; visualFocus?: string }> };
    if (!direction.css) return res.status(422).json({ error: 'creative_direction_incomplete', detail: '模型没有返回完整的视觉方案，请重试。' });
    const creativeSlides: Array<{ html: string }> = [];
    for (let start = 0; start < body.slides.length; start += 3) {
      const batch = body.slides.slice(start, start + 3);
      const batchContent = await askPresentationModel(provider, body.model || config.defaultModel, apiKey, [
        { role: 'system', content: '你是一名高级 HTML 课件设计师。根据已经确定的视觉系统，制作本批页面的内部 HTML。只输出合法 JSON：{"slides":[{"html":"..."}]}。每个 html 只写一个页面内部内容，不含 section、style、script、iframe、表单或事件属性。不要简单罗列要点：把概念转成比较、流程、关系图、实验任务、案例或问题引导。每批至少 2 页使用提供的图片 URL，并用 <img class="model-image"> 或 <figure class="model-photo"><img></figure> 融入布局；图片必须不是小图标，且同一 URL 不可重复。每页保持一个清晰主视觉、1 至 4 条短信息、不滚动、不溢出。' },
        { role: 'user', content: `整套视觉方向：${direction.visualDirection || '以内容为核心的教学杂志风'}\n整套CSS：${String(direction.css).slice(0, 18000)}\n本批页面：${JSON.stringify(batch.map((slide, index) => ({ ...slide, direction: direction.slideDirections?.[start + index], assetUrl: assetUrls[start + index] })))}` },
      ], true);
      const batchResult = parseJsonContent(batchContent) as { slides?: Array<{ html?: string }> };
      if (!Array.isArray(batchResult.slides) || batchResult.slides.length < batch.length) return res.status(422).json({ error: 'creative_slide_incomplete', detail: `第 ${start + 1} 至 ${Math.min(start + 3, body.slides.length)} 页没有生成完整，请重试。` });
      creativeSlides.push(...batch.map((_, index) => ({ html: sanitizeCreativeSlideMarkup(String(batchResult.slides?.[index]?.html || '')) })));
    }
    const slidesWithVisualFallback = creativeSlides.map((item, index) => {
      if (/<img\b/i.test(item.html)) return item;
      const fallback = `<figure class="model-photo model-photo-fallback"><img class="model-image" src="${assetUrls[index]}" alt="课程视觉素材"></figure>`;
      return { html: `${item.html}${fallback}` };
    });
    return res.json({ design: { fontUrl: safeFontUrl(direction.fontUrl), css: sanitizeCreativeCss(String(direction.css)), slides: slidesWithVisualFallback } });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'presentation_html_generation_failed', detail: (error as Error).message });
  }
});

aiRouter.post('/ai/revise-presentation-slide', async (req, res) => {
  try {
    const body = req.body as PresentationRevisionBody;
    const apiKey = readApiKey(req);
    if (!apiKey) return res.status(401).json({ error: 'missing api key' });
    if (!body.slide) return res.status(400).json({ error: 'missing slide' });
    const provider: Provider = body.provider || 'openai';
    const config = PROVIDER_CONFIG[provider];
    const content = await askPresentationModel(provider, body.model || config.defaultModel, apiKey, [
      { role: 'system', content: '你负责按老师意见重写一页课堂PPT。只输出合法JSON：{"title":"","subtitle":"","bullets":["","",""]}。中文简洁清晰，最多4个短要点。' },
      { role: 'user', content: `当前页面：${JSON.stringify(body.slide)}\n修改意见：${body.instruction}\n教案摘要：${(body.sourceContent || '').slice(0, 5000)}` },
    ], true);
    return res.json({ slide: parseJsonContent(content) });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'presentation_revision_failed', detail: (error as Error).message });
  }
});
