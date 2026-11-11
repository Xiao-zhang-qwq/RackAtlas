/* jshint esversion: 2020 */
'use strict';
/**
 * RackAtlas · 导出选项解析（核心逻辑公开子集）
 *
 * 逐字摘录自全量工程 server.js:1061-1085 的 parseExportOptions / parseColorMap，
 * 仅补齐其依赖的最小 str() 工具函数；其余为演示级的范围描述函数。
 *
 * 公开目的：证明「导出支持台账 / 机柜布局 / 机柜矩阵 / 双格式、按状态 / 客户 /
 * 类型着色、自定义颜色映射与白名单校验、按机房范围过滤、自定义文件名」这一
 * 原创导出设计。本模块自包含、可独立运行，不依赖任何完整 xlsx 引擎。
 *
 * 未公开（由私有全量仓库 RackAtlas-full 存证）：
 *   - /api/export.xlsx、/api/export/excel、/api/rooms/:id/export.xlsx、
 *     /api/racks/:id/export.xlsx、/api/export（JSON 备份）等全部 HTTP 下载路由、
 *     Content-Disposition 响应头与 sendXlsx；
 *   - 导出弹窗 UI、二级设置面板、前端下载交互与三维视图入口；
 *   - 图例着色表的完整业务规则、超链接回跳地址拼接与部署侧备份策略。
 *
 * 本文件不含任何 UI、样式、静态资源、前端交互或真实机房数据。
 */

/* 最小字符串归一化：数字也要接住（VLAN、端口号常以数字传进来） */
const str = (v, max) => {
  if (typeof v === 'string') return v.trim().slice(0, max);
  if (typeof v === 'number') return String(v).slice(0, max);
  return '';
};

/* ------------------------- 以下两段为逐字摘录 ------------------------- */
/* 解析导出配置参数：format / colorBy / hyperlink / roomIds / name / stamp / kind */
function parseExportOptions(query) {
  const f = query.get('format');
  const format = f === 'ledger' || f === 'matrix' || f === 'both' ? f : 'layout';
  const cb = query.get('colorBy');
  const colorBy = cb === 'status' || cb === 'client' || cb === 'category' ? cb : 'none';
  const hyperlink = query.get('hyperlink') !== '0' && query.get('hyperlink') !== 'false';
  const roomIds = (query.get('roomIds') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const custom = (query.get('name') || '').trim();
  const stamp = (query.get('stamp') || '').trim();
  const kind = query.get('kind') === 'detail' ? 'detail' : 'main';
  return { format, colorBy, colorMap: parseColorMap(query.get('colorMap')), hyperlink, roomIds, custom, stamp, kind };
}

/* 弹窗自定义着色：{ 取值: '#RRGGBB' }，只接受 6 位十六进制 */
function parseColorMap(raw) {
  const out = {};
  if (!raw) return out;
  let data = null;
  try { data = JSON.parse(String(raw)); } catch (e) { return out; }
  if (!data || typeof data !== 'object') return out;
  for (const k of Object.keys(data).slice(0, 300)) {
    const key = str(k, 80);
    const hex = String(data[k] == null ? '' : data[k]).replace('#', '').trim().toUpperCase();
    if (!key || !/^[0-9A-F]{6}$/.test(hex)) continue;
    out[key] = hex;
  }
  return out;
}
/* ------------------------- 逐字摘录结束 ------------------------- */

/**
 * 演示级范围描述：把解析出的白名单选项换算成「将要导出哪些机房 / 多少设备」。
 * 仅用于自检与说明，不含任何文件写入或 HTTP 响应逻辑。
 */
function describeExport(store, options) {
  const scopeIds = options.roomIds.length ? options.roomIds : null;
  const rooms = scopeIds
    ? store.rooms.filter((r) => scopeIds.includes(r.id))
    : store.rooms;
  const rackIds = new Set(store.racks
    .filter((rk) => rooms.some((r) => r.id === rk.roomId))
    .map((rk) => rk.id));
  const devices = store.devices.filter((d) => rackIds.has(d.rackId));
  return {
    format: options.format,
    colorBy: options.colorBy,
    hyperlink: options.hyperlink,
    kind: options.kind,
    roomCount: rooms.length,
    deviceCount: devices.length,
    colorKeys: Object.keys(options.colorMap).length,
  };
}

module.exports = { parseExportOptions, parseColorMap, describeExport };
