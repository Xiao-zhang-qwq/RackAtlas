/* jshint esversion: 2020 */
'use strict';
/**
 * 自然语言指令「抗脏输入」· 能力证明演示
 *
 *   node examples/nl-demo.js
 *
 * 纯内存运行：不联网、不调用任何大模型、不读写数据文件、不执行任何写操作。
 * 全部语句与设备名 / SN / 机柜名均为虚构示例，不含任何真实机房数据。
 *
 * 本演示仅覆盖全量 AI 模块中「输入归一化 / 一字纠错 / 问句与写操作分界」
 * 的公开子集，用于证明原创实现与功能创新；完整实现未在本仓库公开。
 */
const assert = require('node:assert/strict');
const { normalizeUtterance, editDist1 } = require('../lib/nl-public-demo');

/* 演示用虚构词表：真实工程从数据库动态构建，此处仅作示例 */
const VOCAB = ['DEMO-WEB-01', 'DEMO-SW-01', 'DEMO-SN-9001', 'A01', 'A02'];

/* 刻意混入全角字符、错别字、空格、口语、中文分号、问句的脏输入 */
const CASES = [
  '麻烦帮我把 AＯ1 机柜的 DEMO-WEB-0l 备住改成巡检',
  '把 DEMO-SW-01 的 1-8 口划到 VLAN 100；再把 12 号端口停用吧',
  'A01 的 SN 是多少？',
  '示例机房 101 还有多少剩余功率',
  '交 焕 机 有哪些端口空闲？',
  'DEMO-SW-01 哪些端口空闲',
  '把 A01 的 SN 设为 DEMO-SN-9001',
  'A02U20 改成运行中',
  '帮我把 机 拒 的 型 好 改一下',
  '1-8 口划到 VLAN 100；3 号口停用',
];

console.log('公开能力证明子集 · 抗脏输入演示（完整实现未公开）\n');
const results = CASES.map((text, i) => {
  const r = normalizeUtterance(text, VOCAB);
  console.log(`[${String(i + 1).padStart(2, '0')}] 原句：${text}`);
  console.log(`     归一：${r.text}`);
  console.log(`     纠错：${r.corrections.length ? r.corrections.join('，') : '—'} | 指令数：${r.commands.length} | 意图：${r.intent === 'read' ? '只读' : '写入'}`);
  return { text, ...r };
});

/* ---- 断言：证明公开片段确实具备所声明的能力 ---- */
const at = (n) => results[n - 1];

/* 1. NFKC 全角归一 + 错别字 + SN 一字纠错 */
assert.ok(!at(1).text.includes('Ｏ'), '全角字母应归一');
assert.match(at(1).text, /DEMO-WEB-01/, 'SN 一字打错应对齐到词表');
assert.match(at(1).text, /备注/, '「备住」应纠正为「备注」');
assert.equal(at(1).intent, 'write', '带写动词应判为写入');

/* 2 / 10. 中文分号分隔的多条指令不会被吞掉 */
assert.equal(at(2).commands.length, 2, '中文分号应拆成两条指令');
assert.equal(at(10).commands.length, 2, '另一组中文分号也应拆成两条');

/* 3 / 4 / 5 / 6. 问句不误判为写操作 */
for (const n of [3, 4, 5, 6]) {
  assert.equal(at(n).intent, 'read', `第 ${n} 条是问句，应判为只读`);
}
assert.ok(at(5).corrections.some((c) => c.includes('交换机')), '「交 焕 机」应纠正为「交换机」');

/* 7. 带「设为」时按写入处理，不被「SN」里的词带偏 */
assert.equal(at(7).intent, 'write');

/* 9. 带空格的错别字也能纠正 */
assert.ok(at(9).corrections.some((c) => c.includes('机柜')));
assert.ok(at(9).corrections.some((c) => c.includes('型号')));

/* 逐字摘录的编辑距离 1 算法本身 */
assert.equal(editDist1('DEMO-WEB-0l', 'DEMO-WEB-01'), true);
assert.equal(editDist1('DEMO-WEB-999', 'DEMO-WEB-01'), false);

console.log('\n全部断言通过：全角归一 / 错别字纠正 / SN 一字纠错 / 多指令拆分 / 问句不误判写操作。');
console.log('注意：本演示不做计划生成、不执行任何数据变更，完整 AI 实现未在本仓库公开。');
