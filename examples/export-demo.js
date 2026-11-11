/* jshint esversion: 2020 */
'use strict';
/**
 * 导出功能 · 可运行自检（最小证明子集）
 *
 *   node examples/export-demo.js
 *
 * 纯内存运行：不联网、不启动服务、不写任何文件。
 * 覆盖：导出选项白名单解析 → 自定义颜色映射校验 → 按机房范围过滤
 *      → 演示级导出结果渲染（CSV 文本）。
 *
 * 完整 xlsx 生成引擎、HTTP 下载路由、导出弹窗 UI 仅由私有全量仓库
 * RackAtlas-full 存证，不在本仓库公开。
 */
const assert = require('node:assert/strict');
const { parseExportOptions, parseColorMap, describeExport } = require('../lib/export-public-demo');

const log = (n, text) => console.log(`  ${n}. ${text}`);
const T = '2026-11-10T12:00:00.000Z';

/* 虚构示例数据（192.0.2.x 为文档保留地址段） */
const room1 = { id: 'rm_demo1', name: '示例机房 101', code: 'DEMO-101' };
const room2 = { id: 'rm_demo2', name: '示例机房 102', code: 'DEMO-102' };
const rack1 = { id: 'rk_demo1', roomId: 'rm_demo1', name: 'A01' };
const rack2 = { id: 'rk_demo2', roomId: 'rm_demo2', name: 'B02' };
const mkDev = (id, rackId, name, sn, powerW) => ({
  id, rackId, name, sn, model: 'DEMO-M1', category: 'server', status: 'online',
  ip: '192.0.2.77', owner: '示例客户甲', powerW, updatedAt: T,
});
const store = {
  version: 3,
  rooms: [room1, room2],
  racks: [rack1, rack2],
  devices: [
    mkDev('dv_demo1', 'rk_demo1', 'DEMO-WEB-01', 'DEMO-SN-9001', 350),
    mkDev('dv_demo2', 'rk_demo1', 'DEMO-DB-01', 'DEMO-SN-9002', 420),
    mkDev('dv_demo3', 'rk_demo2', 'DEMO-APP-01', 'DEMO-SN-9003', 280),
  ],
  decommissions: [], roomTrash: [],
};

/* 1. format / colorBy / hyperlink / roomIds / kind 白名单解析 */
const q = (s) => new URLSearchParams(s);
assert.equal(parseExportOptions(q('format=ledger')).format, 'ledger');
assert.equal(parseExportOptions(q('format=matrix')).format, 'matrix');
assert.equal(parseExportOptions(q('format=both')).format, 'both');
assert.equal(parseExportOptions(q('format=unsafe_value')).format, 'layout', '非法 format 应回退 layout');
assert.equal(parseExportOptions(q('colorBy=client')).colorBy, 'client');
assert.equal(parseExportOptions(q('colorBy=unsafe')).colorBy, 'none', '非法 colorBy 应回退 none');
assert.equal(parseExportOptions(q('hyperlink=0')).hyperlink, false);
assert.equal(parseExportOptions(q('')).hyperlink, true, '默认带超链接');
assert.deepEqual(parseExportOptions(q('roomIds=rm_demo2, rm_demo1 ,,')).roomIds, ['rm_demo2', 'rm_demo1']);
assert.equal(parseExportOptions(q('kind=detail')).kind, 'detail');
log('1', '选项解析：format/colorBy 白名单回退、hyperlink、roomIds 拆分、kind=detail 全部正确');

/* 2. 自定义颜色映射只接受 6 位十六进制 */
assert.deepEqual(parseColorMap('{"示例客户甲":"#37c07a","非法":"red"}'), { '示例客户甲': '37C07A' });
assert.deepEqual(parseColorMap('不是 JSON'), {});
assert.deepEqual(parseColorMap('null'), {});
const many = JSON.stringify(Object.fromEntries(Array.from({ length: 305 }, (_, i) => [`k${i}`, 'AABBCC'])));
assert.equal(Object.keys(parseColorMap(many)).length, 300, '颜色映射上限 300 条');
log('2', '颜色映射：大小写归一、非法值丢弃、非法 JSON 兜底、300 条上限');

/* 3. 范围描述（全量 / 指定机房） */
const optAll = parseExportOptions(q('format=ledger&hyperlink=0'));
assert.equal(describeExport(store, optAll).roomCount, 2);
assert.equal(describeExport(store, optAll).deviceCount, 3);
const optOne = parseExportOptions(q('format=ledger&hyperlink=0&roomIds=rm_demo2'));
assert.equal(describeExport(store, optOne).roomCount, 1);
assert.equal(describeExport(store, optOne).deviceCount, 1);
log('3', '范围过滤：全部 2 机房 / 3 设备 → 指定机房 1 机房 / 1 设备');

/* 4. 演示级导出结果渲染（CSV 文本，证明导出会产生结构化输出） */
function renderExport(store, options) {
  const scopeIds = options.roomIds.length ? options.roomIds : null;
  const rooms = scopeIds ? store.rooms.filter((r) => scopeIds.includes(r.id)) : store.rooms;
  const rackIds = new Set(store.racks.filter((rk) => rooms.some((r) => r.id === rk.roomId)).map((rk) => rk.id));
  const devices = store.devices.filter((d) => rackIds.has(d.rackId));
  const header = ['设备名', 'SN', '型号', '状态', 'IP', '功耗(W)'];
  const rows = devices.map((d) => [d.name, d.sn, d.model, d.status, d.ip, String(d.powerW)].join(','));
  return { csv: [header.join(',')].concat(rows).join('\n'), lines: 1 + rows.length };
}
const outAll = renderExport(store, optAll);
assert.ok(outAll.csv.startsWith('设备名,SN,型号,状态,IP,功耗(W)'), '应含表头');
assert.equal(outAll.lines, 4, '1 行表头 + 3 台设备');
assert.ok(outAll.csv.includes('DEMO-WEB-01'));
log('4', `导出渲染：CSV ${outAll.lines} 行，含表头与 3 台设备记录`);

/* 5. 范围过滤落到渲染结果：只导出指定机房 */
const outOne = renderExport(store, optOne);
assert.equal(outOne.lines, 2, '范围过滤后只剩 1 台设备');
assert.ok(outOne.csv.includes('DEMO-APP-01'));
assert.ok(!outOne.csv.includes('DEMO-WEB-01'), '过滤后的结果不应含其他机房设备');
log('5', `按机房导出：${outOne.lines - 1} 行，仅示例机房 102 的设备`);

console.log('\n全部断言通过：选项白名单 / 颜色校验 / 范围过滤 / 导出结果渲染。');
console.log('注意：本演示不含 xlsx 生成引擎、HTTP 下载路由与导出弹窗 UI，完整实现由私有仓库存证。');
