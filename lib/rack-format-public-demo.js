/* jshint esversion: 2020 */
'use strict';
/**
 * IDC3D-core · 临时柜名识别格式（示例推断）· 能力证明子集
 *
 * 公开目的：证明「用户输入一个真实柜名示例，系统按该示例的字符结构临时推断
 * 房间号 / 列 / 序号，并据此解析整批柜名」这一原创设计的实现与版权归属。
 *
 * 本文件只保留示例推断的核心算法。**未公开**（由私有仓库 IDC3D-full 存证）：
 *   - 完整内置规则表（A01 / A1 / 机柜A01 / A01柜 / 1号柜 / 第3柜 / 101 A14 /
 *     101A14 / 101-A14 / A01-A02 范围等全部写法）；
 *   - 导入落库、区域切分、U 位推断、设备列识别、批量处理与服务端路由；
 *   - 前端交互（示例输入框、实时提示、识别结果展示）与全部 UI。
 *
 * 本文件不含任何 UI、样式、静态资源或真实机房数据。
 * 运行示例见 examples/rack-format-demo.js。
 */

/** 归一化：全角字母数字转半角、全角空格转空格；保留中文与符号 */
function normFormatText(raw) {
  return String(raw || '')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * 从示例柜名推断解析规则。
 * 思路：把示例切成「数字段 / 字母段 / 固定文本段」，然后按位置判定角色——
 *   最后一个数字段 = 序号；序号之前最近的字母段 = 列；
 *   列之前的所有字母 / 数字段 = 房间号前缀。
 * 再据此生成带捕获组的正则，供整批柜名复用。
 *
 * 例：'101机房A01' → 房间号 + 列 + 序号
 *     'A区01'      → 列 + 序号（无房间号）
 *     '1F-A01'     → 房间号(1F) + 列 + 序号
 * 返回 { sample, re, roles, desc } 或 null
 */
function inferRackPattern(sample) {
  const raw = String(sample || '').trim();
  if (!raw || raw.length > 24) return null;
  const s = normFormatText(raw);
  const tokens = [];
  const seg = /(\d+)|([A-Za-z]+)|([^0-9A-Za-z]+)/g;
  let m;
  while ((m = seg.exec(s))) {
    if (m[1]) tokens.push({ type: 'num', text: m[1] });
    else if (m[2]) tokens.push({ type: 'alpha', text: m[2] });
    else tokens.push({ type: 'lit', text: m[3] });
  }
  if (!tokens.length) return null;

  /* 最后一个数字段 = 序号 */
  let posIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === 'num') { posIdx = i; break; }
  }
  if (posIdx < 0) return null;

  /* 序号之前最近的字母段 = 列 */
  let colIdx = -1;
  for (let i = posIdx - 1; i >= 0; i--) {
    if (tokens[i].type === 'alpha') { colIdx = i; break; }
  }

  /* 列之前（无列则序号之前）的字母 / 数字段 = 房间号前缀 */
  const roomTo = colIdx >= 0 ? colIdx : posIdx;
  let hasRoom = false;
  for (let i = 0; i < roomTo; i++) {
    if (tokens[i].type === 'num' || tokens[i].type === 'alpha') { hasRoom = true; break; }
  }

  /* 构造正则 + 记录每个捕获组角色 */
  let src = '^';
  const roles = [];
  tokens.forEach((tk, i) => {
    if (tk.type === 'num') {
      src += '(\\d{1,4})';
      roles.push(i === posIdx ? 'pos' : 'room');
    } else if (tk.type === 'alpha') {
      src += '([A-Za-z]{1,4})';
      roles.push(i === colIdx ? 'col' : 'room');
    } else {
      const lit = tk.text.replace(/\s+/g, '');
      if (!lit) src += '\\s*';
      else src += lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  });
  src += '$';

  let re;
  try { re = new RegExp(src); } catch (e) { return null; }

  const parts = [];
  if (hasRoom) parts.push('房间号');
  if (colIdx >= 0) parts.push('列');
  parts.push('序号');
  return { sample: raw, re, roles, desc: parts.join(' + ') };
}

/** 按推断出的规则解析单个柜名；不符合示例格式时返回 null */
function parseByPattern(raw, pattern) {
  if (!pattern || !pattern.re) return null;
  const s = normFormatText(raw);
  if (!s || s.length > 24) return null;
  const m = pattern.re.exec(s);
  if (!m) return null;
  const out = { text: String(raw).trim(), label: '', index: 0, digits: 0, endIndex: 0 };
  for (let i = 0; i < pattern.roles.length; i++) {
    const role = pattern.roles[i];
    const val = m[i + 1];
    if (val == null) continue;
    if (role === 'room') out.prefix = String(out.prefix || '') + val;
    else if (role === 'col') out.label = String(val).toUpperCase();
    else if (role === 'pos') { out.index = Number(val); out.digits = String(val).length; out.endIndex = Number(val); }
  }
  if (!out.index || out.index < 1 || out.index > 9999) return null;
  return out;
}

/**
 * 演示级回退解析：只认最基础的「字母 + 数字」（如 A01）。
 * 完整内置规则表（1号柜 / 机柜A01 / 101 A14 / 范围等）未公开，由私有仓库存证。
 */
function parseSimpleRack(raw) {
  const s = normFormatText(raw).replace(/\s+/g, '').toUpperCase();
  const m = /^([A-Z]{1,3})[-_]?(\d{1,4})$/.exec(s);
  if (!m) return null;
  const idx = Number(m[2]);
  if (idx < 1 || idx > 9999) return null;
  return { text: String(raw).trim(), label: m[1], index: idx, digits: m[2].length, endIndex: idx };
}

/**
 * 带「临时识别格式」的柜名解析：
 * 传了示例就先按示例推断的规则解析，解析不了自动回退基础规则（不会比原来更差）。
 */
function parseRackNameEx(raw, sample) {
  if (sample) {
    const pat = inferRackPattern(sample);
    if (pat) {
      const r = parseByPattern(raw, pat);
      if (r) return r;
    }
  }
  return parseSimpleRack(raw);
}

module.exports = { inferRackPattern, parseByPattern, parseRackNameEx, parseSimpleRack, normFormatText };
