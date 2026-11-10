/* jshint esversion: 2020 */
'use strict';
/**
 * 最近变更 / 手动操作撤销 · 可运行自检
 *
 *   node examples/undo-demo.js
 *
 * 纯内存运行：不联网、不启动服务、不读写任何数据文件、不写磁盘。
 * 机房 / 机柜 / 设备 / SN / IP 全部为虚构示例（192.0.2.x 为文档保留地址段）。
 *
 * 覆盖：整库快照的深拷贝隔离 → LIFO 撤销 → 快照恢复 → 栈空 → 20 步上限
 *      → 最近变更按 updatedAt 倒序 → 机柜/机房关联补齐 → 孤儿记录丢弃
 *      → 撤销后最近变更同步回到历史状态。
 */
const assert = require('node:assert/strict');
const { createUndoStack, recentDevices, UNDO_KEEP } = require('../lib/undo-public-demo');

const log = (n, text) => console.log(`  ${n}. ${text}`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const T = (n) => `2026-11-10T12:0${n}:00.000Z`;

/* 虚构空库 + 两条设备记录 */
const room = { id: 'rm_demo1', name: '示例机房 101', code: 'DEMO-101' };
const rack = { id: 'rk_demo1', roomId: 'rm_demo1', name: 'A01', label: 'A', index: 1, totalU: 45 };
const dev1 = {
  id: 'dv_demo1', rackId: 'rk_demo1', name: 'DEMO-WEB-01', sn: 'DEMO-SN-9001',
  model: 'DEMO-M1', status: 'online', ip: '192.0.2.77', startU: 1, heightU: 1, updatedAt: T(1),
};
const dev2 = {
  id: 'dv_demo2', rackId: 'rk_demo1', name: 'DEMO-DB-01', sn: 'DEMO-SN-9002',
  model: 'DEMO-M2', status: 'online', ip: '192.0.2.78', startU: 3, heightU: 2, updatedAt: T(3),
};
let store = { version: 3, rooms: [room], racks: [rack], devices: [dev1], decommissions: [], roomTrash: [] };

/* 固定时间与 id，便于断言 */
let seq = 0;
const stack = createUndoStack({ now: () => T(9), makeId: () => `un_demo_${++seq}` });

/* 1. 空栈 */
assert.deepEqual(stack.status(), { count: 0, last: null });
assert.equal(stack.pop(), null, '空栈 pop 应返回 null');
log('1', '空栈：status.count=0、last=null、pop()=null');

/* 2. 操作前入栈 → 修改库 → 再次入栈（快照必须是入栈那一刻的深拷贝） */
stack.push(store, 'device.create', '新增设备「DEMO-DB-01」');
store.devices.push(clone(dev2));                       // 操作 1 落地
stack.push(store, 'device.update', '修改设备「DEMO-DB-01」');
store.devices[1].name = 'DEMO-DB-01（改名后）';       // 操作 2 落地
store.devices[1].updatedAt = T(5);
assert.equal(stack.status().count, 2);
assert.equal(stack.status().last.summary, '修改设备「DEMO-DB-01」', 'last 应是最近一步');
assert.equal(stack.status().last.store, undefined, 'status 不应外泄整库快照');
log('2', `两次操作入栈：count=${stack.status().count}，last="${stack.status().last.summary}"`);

/* 3. 深拷贝隔离：入栈后继续改库，快照不受影响 */
const s1 = stack.pop();
assert.equal(s1.action, 'device.update');
assert.equal(s1.store.devices[1].name, 'DEMO-DB-01', '快照应是改名前的深拷贝');
assert.equal(store.devices[1].name, 'DEMO-DB-01（改名后）', '当前库确实已改名');
store = clone(s1.store);
assert.equal(store.devices[1].name, 'DEMO-DB-01', '撤销后回到操作前状态');
log('3', '撤销上一步 → 整库快照恢复，入栈后的后续修改未污染快照');

/* 4. 再撤销一步 → 回到最初只有一台设备的状态；第三次 pop 为栈空 */
const s0 = stack.pop();
assert.equal(s0.store.devices.length, 1);
store = clone(s0.store);
assert.equal(stack.pop(), null);
assert.equal(stack.status().count, 0);
log('4', '连续撤销至初始状态 → 第三次 pop 返回 null，栈空');

/* 5. 20 步上限（逐字摘录的 UNDO_KEEP 行为） */
const cap = createUndoStack({ now: () => T(9), makeId: () => `cap_${++seq}` });
for (let i = 1; i <= 25; i += 1) cap.push({ step: i }, `step.${i}`, `第 ${i} 步`);
assert.equal(cap.status().count, UNDO_KEEP);
assert.equal(cap.status().last.summary, '第 25 步');
for (let i = 0; i < UNDO_KEEP; i += 1) assert.ok(cap.pop());
assert.equal(cap.pop(), null, '超出 20 步的最老记录应被丢弃');
log('5', `压入 25 步 → 只保留最近 ${UNDO_KEEP} 步，最老 5 步已淘汰`);

/* 6. 最近变更：倒序 + 关联补齐 + limit + 孤儿过滤 */
const s = {
  rooms: [room],
  racks: [rack],
  devices: [
    { ...dev1, updatedAt: T(1) },
    { ...dev2, updatedAt: T(3) },
    { id: 'dv_orphan', rackId: 'rk_gone', name: 'DEMO-ORPHAN', updatedAt: T(0) },
  ],
};
const recent = recentDevices(s);
assert.equal(recent.length, 2, '机柜不存在的孤儿设备应被丢弃');
assert.equal(recent[0].deviceId, 'dv_demo2', '应按 updatedAt 倒序');
assert.equal(recent[0].roomName, '示例机房 101');
assert.equal(recent[0].rackName, 'A01');
assert.equal(recent[0].roomCode, 'DEMO-101');
assert.equal(recentDevices(s, 1).length, 1, 'limit 应生效');
/* 与全量实现一致：先按时间截断，再丢弃机柜/机房已不存在的孤儿记录 */
assert.equal(recentDevices(s, 3).length, 2, '孤儿记录会占用截断名额，但不会出现在结果里');
log('6', `最近变更：${recent.map((x) => `${x.name}@${x.updatedAt}`).join(' > ')}，孤儿记录已丢弃`);

/* 7. 撤销与最近变更联动：把撤销快照作为当前库，列表回到历史状态 */
const undoneView = recentDevices(store);
assert.equal(undoneView.length, 1, '撤销后最近变更只剩 1 台设备');
assert.equal(undoneView[0].name, 'DEMO-WEB-01');
log('7', '撤销后重新聚合最近变更 → 列表同步回到历史状态');

console.log('\n全部断言通过：整库快照 / LIFO 撤销 / 20 步上限 / 最近变更聚合 / 孤儿过滤 / 撤销联动。');
console.log('注意：本演示不含撤销栈落盘、HTTP 路由、AI 批量撤销与任何前端界面，完整实现由私有仓库存证。');
