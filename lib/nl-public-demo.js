/* jshint esversion: 2020 */
'use strict';
/**
 * RackAtlas · 自然语言指令「抗脏输入」能力证明子集
 *
 * 【重要 · 公开边界】
 * 本文件只公开完整 AI 模块中「输入归一化 / 一字纠错 / 问句与写操作分界」
 * 三个阶段的极小片段与演示级最小映射，用于证明原创实现与版权归属、展示功能创新。
 * 它**不是**完整实现，也无法据其还原完整实现。以下内容明确未公开：
 *   - 完整错别字规则表（TYPO_FIXES 全量条目）、动作表 ACTIONS 与全部动作正则；
 *   - 实体纠错全量逻辑、计划生成 / 校验 / 批量执行、快照与整批撤销；
 *   - 大模型兜底（nl-ollama）、系统提示词（prompts/nl-system.md）、前端交互组件；
 *   - 端口范围/列表解析、机柜命名规则、电力词条等业务规则。
 * 完整实现（lib/nl.js，4294 行）及配套文件由私有全量仓库 RackAtlas-full 存证。
 *
 * 标注「逐字摘录」的代码来自全量工程 lib/nl.js；标注「演示级」的代码是
 * 为便于独立运行而写的最小等价片段，不代表完整工程实现。
 *
 * 本文件不含任何 UI、样式、静态资源、网络请求或真实机房数据。
 */

const MAX_TEXT = 200;

/* ---- 逐字摘录自 lib/nl.js ---- */
function normText(s) {
  try {
    return String(s || '').normalize('NFKC');
  } catch (e) {
    return String(s || '');
  }
}

/* ---- 逐字摘录自 lib/nl.js：编辑距离 1，用于柜名 / SN / 型号一字纠错 ---- */
function editDist1(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (la > lb) { i++; } else if (lb > la) { j++; } else { i++; j++; }
  }
  return true;
}

/* ---- 逐字摘录自 lib/nl.js：问句与写操作的分界 ---- */
const ASK_RE = /(是多少|是什么|多少|几台|几个|在哪|哪个|哪些|还有|剩余|够不够|有没有|怎么样|怎么改|吗[？?]?\s*$|呢\s*$)/;
const SET_VERB_RE = /(改成|改为|设为|设置成|设置|调整为|调整成|标记为|变成|写成|更新为|填成|修改为|换到|迁到|搬到|移到|挪到)/;

/* ---- 演示级最小映射：仅 8 条，完整规则表未公开 ---- */
const DEMO_TYPO_FIXES = [
  [/机\s*拒|机\s*贵/g, '机柜'],
  [/机\s*方|机\s*放/g, '机房'],
  [/端\s*囗/g, '端口'],
  [/备\s*住/g, '备注'],
  [/交\s*焕\s*机|交\s*换\s*机/g, '交换机'],
  [/型\s*好|形\s*号/g, '型号'],
  [/撤\s*消/g, '撤销'],
  [/品\s*排/g, '品牌'],
];

/**
 * 归一化阶段（逐字摘录 cleanTextDetailed 的处理骨架，规则表替换为演示级最小映射）。
 * 作用：全角标点 / 全角字母统一、空白折叠、常见错别字纠正，并记录改了哪些字。
 */
function cleanTextLite(s) {
  let out = normText(s)
    .replace(/[，。；；：、！？]/g, (c) => ({ '，': ',', '。': '.', '；': ';', '：': ':', '、': ',', '！': '!', '？': '?' }[c]))
    .replace(/[—–－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const corrections = [];
  for (const [re, rep] of DEMO_TYPO_FIXES) {
    out = out.replace(re, (m) => {
      const key = m.replace(/\s+/g, '');
      if (key !== rep) corrections.push(`${key}→${rep}`);
      return rep;
    });
  }
  return { text: out.slice(0, MAX_TEXT).trim(), corrections };
}

/** 演示级：口语客套话与语气词弱化（完整工程还有倒装改写等，未公开） */
function softenLite(s) {
  return String(s || '')
    .replace(/(?:麻烦(?:你|您)?|请(?:你|您)?|帮我|帮忙|劳驾)\s*/g, '')
    .replace(/(?:我想|我要|现在|马上|能不能|可不可以)\s*/g, '')
    .replace(/(?:吧|呢|啊|呀|嘛)(?=[,.;!?\s]|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 演示级：把「柜名 / 设备名 / SN」一字打错的写法对齐到给定词表。
 * 使用上面逐字摘录的 editDist1；完整工程还处理字母数字混淆、U 位粘连与指代消解，未公开。
 */
function alignEntitiesLite(text, vocab, corrections) {
  const dict = (vocab || []).map((v) => String(v)).filter((v) => v.length >= 3);
  return String(text).replace(/[A-Za-z][A-Za-z0-9_-]{2,23}/g, (tok) => {
    if (dict.includes(tok)) return tok;
    const hit = dict.find((v) => editDist1(tok.toLowerCase(), v.toLowerCase()));
    if (hit) {
      corrections.push(`${tok}→${hit}`);
      return hit;
    }
    return tok;
  });
}

/** 演示级：中文分号分隔的多条指令拆开（完整工程是三级上下文拆分，未公开） */
function splitSimpleCommands(text) {
  const parts = String(text || '')
    .replace(/；/g, ';')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text || '').trim()];
}

/** 演示级：只读 / 写入二分（完整工程有 29 类动作识别，未公开） */
function classifyIntent(text) {
  return ASK_RE.test(text) && !SET_VERB_RE.test(text) ? 'read' : 'write';
}

/** 串起公开的三段能力，返回可观测结果，供 examples/nl-demo.js 验证 */
function normalizeUtterance(input, vocab) {
  const c = cleanTextLite(input);
  const corrections = [...c.corrections];
  const aligned = alignEntitiesLite(softenLite(c.text), vocab, corrections);
  return {
    text: aligned,
    corrections: [...new Set(corrections)],
    commands: splitSimpleCommands(aligned),
    intent: classifyIntent(aligned),
  };
}

module.exports = {
  normText, editDist1, ASK_RE, SET_VERB_RE,
  cleanTextLite, softenLite, alignEntitiesLite, splitSimpleCommands,
  classifyIntent, normalizeUtterance,
};
