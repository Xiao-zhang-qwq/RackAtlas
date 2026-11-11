/* jshint esversion: 2020 */
'use strict';
/**
 * RackAtlas · 设备 ↔ 网络设备接口联动（核心逻辑公开子集）
 *
 * 本文件逐字摘录自全量工程 server.js 的「上联交换机」实现段落
 * （全量工程 server.js:441-547）。为让模块能脱离 HTTP 层独立运行，
 * 仅做了两处机械替换，业务逻辑与错误码完全不变：
 *   1. HttpError(422/409, ...) → LinkError(422/409, ...)；
 *   2. 补齐 normPorts / str / int / nowISO 四个本仓库已有的工具函数。
 *
 * 公开目的：证明「按上联交换机 SN 自动点亮接口、设备与交换机端口
 * 双向联动」这一原创功能的实现与版权归属。
 *
 * 完整调用链（设备新增 / 编辑 / 下架的 API 分支、批量执行、整批撤销）
 * 不在本仓库公开，由私有全量仓库 RackAtlas-full 存证。
 *
 * 本文件不含任何 UI、样式、静态资源、前端交互或真实机房数据。
 */

const PORT_STATUS = ['off', 'on', 'idle', 'disabled'];
const nowISO = () => new Date().toISOString();
/* 字符串字段归一化：数字也要接住（资产编号、VLAN、端口号常以数字传进来，直接丢会静默变成空） */
const str = (v, max) => {
  if (typeof v === 'string') return v.trim().slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).slice(0, max);
  return '';
};
const int = (v, d) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : d;
};

/** 与全量工程 HttpError 等价的错误类型，code 取值保持一致 */
class LinkError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail || null;
  }
}

/* 网络设备接口：off 未接入 / on 正常使用（绿） / idle 接入未使用（黄） / disabled 禁用 */
function normPorts(raw) {
  const out = [];
  const seen = new Set();
  for (const p of Array.isArray(raw) ? raw.slice(0, 512) : []) {
    if (!p || typeof p !== 'object') continue;
    const n = int(p.n, 0);
    if (n < 1 || n > 512 || seen.has(n)) continue;
    seen.add(n);
    out.push({
      n,
      status: PORT_STATUS.includes(p.status) ? p.status : 'off',
      vlan: str(p.vlan, 60),
      peer: str(p.peer, 120),
      media: str(p.media, 20),
      cableLabel: str(p.cableLabel, 60),
      sfpModel: str(p.sfpModel, 80),
      sfpSpeed: str(p.sfpSpeed, 40),
      note: str(p.note, 200),
    });
  }
  return out.sort((a, b) => a.n - b.n);
}

/* ---------------------------------------------------------- 上联交换机
   按 SN 识别上联交换机：生成「机柜 U位 品牌 型号」文本，并把交换机对应端口点亮 */
function switchLocText(store, sw) {
  const rack = store.racks.find((r) => r.id === sw.rackId);
  return [rack ? rack.name : '', sw.startU ? `U${sw.startU}` : '', sw.brand, sw.model]
    .filter(Boolean).join(' ').trim();
}

function findSwitchBySn(store, sn, selfId) {
  const key = String(sn || '').trim().toLowerCase();
  if (!key) return null;
  return store.devices.find((d) => d.id !== selfId && String(d.sn || '').trim().toLowerCase() === key) || null;
}

function findSwitchByLoc(store, loc, selfId) {
  const key = String(loc || '').trim();
  if (!key) return null;
  for (const d of store.devices) {
    if (d.id === selfId) continue;
    if (switchLocText(store, d) === key) return d;
  }
  return null;
}

function portNumber(v) {
  const m = String(v == null ? '' : v).match(/\d+/);
  const n = m ? Number(m[0]) : 0;
  return n >= 1 && n <= 512 ? n : 0;
}

function writeSwitchPort(sw, n, patch) {
  const ports = Array.isArray(sw.ports) ? sw.ports.map((p) => ({ ...p })) : [];
  const idx = ports.findIndex((p) => Number(p.n) === n);
  const base = idx >= 0 ? ports[idx] : {
    n, status: 'off', vlan: '', peer: '', media: '', cableLabel: '', sfpModel: '', sfpSpeed: '', note: '',
  };
  Object.assign(base, patch);
  if (idx >= 0) ports[idx] = base; else ports.push(base);
  sw.ports = normPorts(ports);
  sw.portCount = Math.max(Number(sw.portCount) || 0, n);
  sw.updatedAt = nowISO();
}

/* 保存前解析上联：返回 { sw, n }；端口已被别的设备占用且未确认替换时抛 409 */
function prepareUpstreamLink(store, snRaw, portRaw, selfId, selfName, force) {
  const sn = String(snRaw || '').trim();
  if (!sn) return null;                             // 没填 SN 就不动已有上联
  const sw = findSwitchBySn(store, sn, selfId);
  if (!sw) throw new LinkError(422, `未找到 SN 为「${sn}」的交换机`);
  const n = portNumber(portRaw);
  if (!n) return { sw, n: 0 };
  const p = (Array.isArray(sw.ports) ? sw.ports : []).find((x) => Number(x.n) === n);
  const mine = p && String(p.peer || '').includes(String(selfName || ''));
  if (!force && p && p.status === 'on' && p.peer && !mine) {
    throw new LinkError(409, `交换机 ${switchLocText(store, sw)} 的端口 ${n} 已被「${p.peer}」占用`, {
      conflict: { switchSn: sw.sn, switchLoc: switchLocText(store, sw), port: n, peer: p.peer },
    });
  }
  return { sw, n };
}

/* 保存后落库：按 SN 把上联交换机写进 switchLoc，并点亮其端口 */
function applyUpstreamLink(store, dev, link) {
  if (!link || !link.sw) return;
  dev.switchLoc = switchLocText(store, link.sw);
  if (!link.n) return;
  const rack = store.racks.find((r) => r.id === dev.rackId);
  const patch = {
    status: 'on',
    peer: [rack ? rack.name : '', dev.startU ? `U${dev.startU}` : '', dev.name].filter(Boolean).join(' '),
    cableLabel: String(dev.mgmtPort || ''),
  };
  if (dev.switchVlan) patch.vlan = String(dev.switchVlan).slice(0, 60);   // 所属 VLAN 同步到端口
  writeSwitchPort(link.sw, link.n, patch);
}

/* 解除旧上联：仅当该端口确实由本设备占用时恢复为未接入 */
function unlinkUpstreamSwitch(store, dev) {
  const n = portNumber(dev.mgmtPort);
  if (!n || !dev.switchLoc) return;
  const sw = findSwitchByLoc(store, dev.switchLoc, dev.id);
  if (!sw) return;
  const ports = Array.isArray(sw.ports) ? sw.ports : [];
  const p = ports.find((x) => Number(x.n) === n);
  if (!p || p.status !== 'on') return;
  if (String(p.peer || '').includes(dev.name)) {
    p.status = 'off';
    p.peer = '';
    p.cableLabel = '';
    sw.updatedAt = nowISO();
  }
}

/* 所属 VLAN 同步到交换机端口：编辑设备时没重新填 SN 也能生效 */
function syncUpstreamVlan(store, dev, createIfMissing) {
  const n = portNumber(dev.mgmtPort);
  if (!n || !dev.switchLoc) return null;
  let sw = findSwitchByLoc(store, dev.switchLoc, dev.id);
  if (!sw) {
    /* 兼容手工填写的交换机名称 / SN（标准 switchLoc 是「机柜 U位 品牌 型号」） */
    const key = String(dev.switchLoc || '').trim().toLowerCase();
    sw = store.devices.find((d) => d.id !== dev.id && [d.name, d.sn].some((v) => String(v || '').trim().toLowerCase() === key)) || null;
  }
  if (!sw) return null;
  const ports = Array.isArray(sw.ports) ? sw.ports : [];
  const p = ports.find((x) => Number(x.n) === n);
  if (!p && !createIfMissing) return null;
  const before = p ? { ...p } : null;
  writeSwitchPort(sw, n, { vlan: String(dev.switchVlan || '') });
  return { switchId: sw.id, n, entry: before };
}

module.exports = {
  LinkError, normPorts, switchLocText, findSwitchBySn, findSwitchByLoc, portNumber,
  writeSwitchPort, prepareUpstreamLink, applyUpstreamLink, unlinkUpstreamSwitch, syncUpstreamVlan,
};
