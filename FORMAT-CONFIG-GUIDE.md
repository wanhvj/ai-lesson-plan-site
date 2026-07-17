# 📋 格式化配置指南

## 🎯 概述

本系统支持**配置驱动的格式化**,无需修改代码即可适配不同的教案模板格式需求。

---

## 🏗️ 核心概念

### 1. `aiStructure` - AI生成指导

告诉AI**如何生成结构化内容**。

```json
{
  "aiStructure": {
    "description": "三部分结构化教学内容",
    "parts": [
      {
        "label": "第一部分:复习并导入新课",
        "duration": "约30字"
      },
      {
        "label": "第二部分:新课",
        "duration": "约170字，包含知识点讲解、案例分析"
      }
    ]
  }
}
```

**作用**: AI会在Prompt中收到明确的结构要求,生成符合要求的分段内容。

---

### 2. `renderRules` - Word渲染规则

告诉后端**如何在Word中呈现样式**。

```json
{
  "renderRules": [
    {
      "pattern": "^第[一二三]+部分：",
      "styles": {
        "bold": true,
        "indent": 0
      }
    },
    {
      "pattern": "^  ",
      "styles": {
        "indent": 1
      }
    }
  ]
}
```

**支持的样式**:
- `bold`: 加粗 (true/false)
- `indent`: 缩进级别 (0, 1, 2... 每级=420twips≈0.7cm)
- `italic`: 斜体 (true/false)
- `underline`: 下划线 (true/false)

**匹配规则**:
- `pattern` 是**正则表达式**
- 按顺序匹配,第一个匹配的规则生效
- 常用模式:
  - `^` 开头匹配
  - `$` 结尾匹配
  - `.*` 任意字符
  - `[一二三]` 字符组

---

## 📝 完整示例

### 场景: "讲授新课"字段

**需求**:
1. AI生成三部分内容(复习+新课+总结)
2. Word中部分标题加粗
3. 子内容缩进

**配置**:

```json
{
  "fieldId": "讲授新课（字数控制在200字左右，分为三部分撰写...）",
  "position": { "t": 0, "r": 15, "c": 1 },
  "mode": "multiline",
  "split": "newline",
  "formatting": {
    "type": "structured",
    "aiStructure": {
      "description": "三部分结构化教学内容",
      "parts": [
        { "label": "第一部分：复习并导入新课", "duration": "约30字" },
        { "label": "第二部分：新课", "duration": "约170字" },
        { "label": "第三部分：总结", "duration": "约20字" }
      ]
    },
    "renderRules": [
      {
        "pattern": "^第[一二三]+部分：",
        "styles": { "bold": true }
      },
      {
        "pattern": "^  ",
        "styles": { "indent": 1 }
      }
    ]
  }
}
```

---

## 🔄 工作流程

```
用户操作                系统处理
────────              ────────
导入mapping.json  →   前端读取formatting配置
                      
填写课程主题      →   前端调用AI接口
                      并传入mappings(含aiStructure)
                      ↓
                      后端读取aiStructure
                      动态构建Prompt:
                      "字段X的格式要求:
                       - 必须包含以下部分:
                         * 第一部分:...
                         * 第二部分:..."
                      ↓
                      AI按结构生成内容
                      ↓
点击生成Word      →   后端读取renderRules
                      应用样式规则
                      生成格式化的Word
```

---

## 🛠️ 高级用法

### 1. 多规则组合

```json
{
  "renderRules": [
    {
      "pattern": "^【.*?】",
      "styles": { "bold": true }
    },
    {
      "pattern": "：$",
      "styles": { "bold": true }
    },
    {
      "pattern": "^    ",
      "styles": { "indent": 2 }
    }
  ]
}
```

### 2. 嵌套结构

```json
{
  "aiStructure": {
    "description": "分层教学设计",
    "parts": [
      {
        "label": "一、导入环节",
        "duration": "5分钟"
      },
      {
        "label": "二、新课讲授",
        "duration": "25分钟，包含:\n  1. 理论讲解\n  2. 案例分析\n  3. 实操演示"
      }
    ]
  }
}
```

### 3. 列表格式

```json
{
  "aiStructure": {
    "parts": [
      { "label": "知识基础", "duration": "学生已掌握的知识" },
      { "label": "能力基础", "duration": "学生已具备的能力" }
    ]
  },
  "renderRules": [
    {
      "pattern": "^(知识|能力|情感)基础：",
      "styles": { "bold": true }
    }
  ]
}
```

---

## ⚠️ 注意事项

1. **正则表达式语法**: 使用JavaScript正则,特殊字符需转义(`\\.` `\\(` `\\[`)
2. **规则顺序**: 先匹配的规则优先,合理安排顺序
3. **测试验证**: 配置后务必测试生成效果
4. **编码格式**: JSON文件保存为UTF-8编码

---

## 📚 常见模式

| 需求 | Pattern | Styles |
|------|---------|--------|
| 一级标题加粗 | `^一、.*` | `{ "bold": true }` |
| 二级缩进 | `^    ` (4空格) | `{ "indent": 1 }` |
| 关键词加粗 | `【.*?】` | `{ "bold": true }` |
| 列表项 | `^[0-9]+\\. ` | `{ "indent": 1 }` |
| 冒号结尾加粗 | `：$` | `{ "bold": true }` |

---

## 🎉 总结

**一次配置,永久生效**:
- ✅ 无需修改代码
- ✅ 支持任意格式
- ✅ 可视化效果可控
- ✅ 易于维护和扩展

有任何问题,请参考 `mapping-example-with-formatting.json` 示例文件!

