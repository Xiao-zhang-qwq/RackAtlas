/* jshint esversion: 2020 */
'use strict';
/**
 * 设备 ↔ 网络设备接口联动 · 可运行自检
 *
 *   node examples/linkage-demo.js
 *
 * 纯内存运行：不启动服务、不读写数据文件、不联网、不依赖 npm 包。
 * 全部设备名 / SN / 机柜名 / VLAN 均为虚构示例，不含任何真实机房数据。
 * 仅演示 lib/linkage.js 的公开子集；完整 API 调用链不在本仓库。
 */
const assert = require('node:assert/strict');
const {
  LinkError, prepareUpstreamLink, applyUpstreamLink,
  syncUpstreamVlan, unlinkUpstreamSwitch,
} = require('../lib/linkage');

/* ---- 虚构示例数据 ---- */
const store = {
  racks: [{ id: 'rk_1', name: 'A01', roomId: 'rm_1' }],
  devices: [
    {
      id: 'dv_sw', rackId: 'rk_1', name: 'DEMO-SW-01', sn: 'DEMO-SN-9001',
      brand: '示例品牌', model: '示例 24 口交换机', startU: 40, heightU: 1,
      portCount: 24, ports: [],
    },
    {
      id: 'dv_1', rackId: 'rk_1', name: 'DEMO-WEB-01', startU: 12, heightU: 1,
      mgmtPort: '12', switchVlan: '', switchLoc: '',
    },
  ],
};
const sw = store.devices[0];
const dev = store.devices[1];
const port12 = () => sw.ports.find((p) => Number(p.n) === 12);
const log = (step, text) => console.log(`[${step}] ${text}`);

/* 1. 只填「上联交换机 SN + 端口号」，系统按 SN 找到交换机 */
const link = prepareUpstreamLink(store, 'DEMO-SN-9001', '12', dev.id, dev.name, false);
assert.ok(link && link.sw && link.n === 12, '应能按 SN 定位交换机并解析出端口号');
log('1', `按 SN 定位交换机 → ${link.sw.name}，端口 ${link.n}`);

/* 2. 保存后自动点亮端口，并回填对端设备位置 */
applyUpstreamLink(store, dev, link);
assert.equal(port12().status, 'on', '端口应自动点亮为 on');
assert.match(port12().peer, /DEMO-WEB-01/, '端口对端应回填设备名');
assert.match(dev.switchLoc, /^A01 U40 /, '设备应回写上联交换机位置文本');
log('2', `端口 12 点亮：status=${port12().status}，peer=${port12().peer}`);
log('2', `设备回写 switchLoc=${dev.switchLoc}`);

/* 3. 设备所属 VLAN 变更 → 联动同步到交换机端口（无需重填 SN） */
dev.switchVlan = '100';
const synced = syncUpstreamVlan(store, dev, false);
assert.ok(synced && synced.n === 12, '应命中已联动的端口');
assert.equal(port12().vlan, '100', 'VLAN 应同步到交换机端口');
log('3', `改设备 VLAN → 端口 12 vlan=${port12().vlan}`);

/* 4. 端口已被别的设备占用时拒绝覆盖（409），除非显式确认替换 */
const other = { id: 'dv_2', name: 'DEMO-WEB-02' };
assert.throws(
  () => prepareUpstreamLink(store, 'DEMO-SN-9001', '12', other.id, other.name, false),
  (e) => e instanceof LinkError && e.code === 409,
  '端口冲突应返回 409',
);
log('4', '另一台设备占用同一端口 → 409 端口冲突，未被静默覆盖');

/* 5. 设备下架 / 解除上联 → 仅熄灭本设备占用的那个端口 */
unlinkUpstreamSwitch(store, dev);
assert.equal(port12().status, 'off', '解除上联后端口应恢复未接入');
assert.equal(port12().peer, '', '解除上联后对端应清空');
log('5', `解除上联 → status=${port12().status}，peer="${port12().peer}"`);

console.log('\n全部断言通过：自动点亮 / VLAN 联动 / 冲突保护 / 下架回退 均已验证。');
