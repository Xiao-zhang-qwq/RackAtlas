/* jshint esversion: 2020 */
'use strict';
/**
 * IDC3D-core · 最近变更 / 手动操作撤销（核心逻辑公开子集）
 *
 * 逐字摘录自全量工程 server.js 的两段实现：
 *   1. 手动操作撤销栈（全量 server.js:748-805）；
 *   2. 「最近变更的设备」聚合（全量 server.js:1679-1698）。
 *
 * 为了让模块脱离 HTTP 与文件系统独立运行，做了两处机械处理：
 *   1. 撤销栈由「写 manual-undo.json 文件」改为「内存数组」，LIFO / 整库快照 /
 *      20 步上限 / 栈空返回 null 的行为逐字保留；
 *   2. 时间戳与 id 由可注入函数提供，便于自检断言。
 *
 * 公开目的：证明「按更新时间倒序的最近变更」与「任何手动修改前保存整库快照、
 * 一键回到上一步」这两项原创功能的实现与版权归属。
 *
 * 未公开（由私有全量仓库 IDC3D-full 存证）：
 *   - 撤销栈的原子落盘（临时文件 + rename 回退）、文件路径与 UNDO_FILE 常量；
 *   - 全部 pushUndo 调用点（机房 / 机柜 / 设备 / 下架 / 各类导入 / 重置）；
 *   - GET /api/undo/status、POST /api/undo/last 两个 HTTP 路由与写请求串行队列；
 *   - AI 自然语言指令的快照历史、单条撤销与整批撤销（undoItem / undoLastEntry /
 *     undoBatch）；
 *   - 首页「最近变更的设备」列表的全部 UI 与前端交互。
 *
 * 本文件不含任何 UI、样式、静态资源、前端交互或真实机房数据。
 */

const UNDO_KEEP = 20;

/**
 * 内存版撤销栈。
 * push 保存的是整库深拷贝快照：调用方随后怎么改 store，都不会污染已入栈的状态。
 */
function createUndoStack(options = {}) {
  const keep = Number.isFinite(options.keep) ? options.keep : UNDO_KEEP;
  const now = options.now || (() => new Date().toISOString());
  const makeId = options.makeId || (() => `un_${Math.random().toString(36).slice(2, 10)}`);
  const items = [];

  function push(store, action, summary) {
    items.unshift({
      id: makeId(),
      at: now(),
      action,
      summary,
      store: JSON.parse(JSON.stringify(store)),
    });
    /* 逐字摘录：超出上限时丢弃最老的一步 */
    items.splice(Math.max(0, keep), items.length);
    return status();
  }

  function pop() {
    if (!items.length) return null;
    const item = items.shift();
    return item;
  }

  /* 逐字摘录：只对外暴露 action / summary / at，不暴露整库快照 */
  function status() {
    return {
      count: items.length,
      last: items.length
        ? { action: items[0].action, summary: items[0].summary, at: items[0].at }
        : null,
    };
  }

  return { push, pop, status };
}

/**
 * 最近变更聚合：按 updatedAt 倒序取前 limit 条，并补齐所属机柜 / 机房。
 * 机柜或机房已被删除的孤儿设备会被丢弃，避免首页出现悬空记录。
 * 排序、字段选择与过滤逻辑逐字摘录自 GET /api/state。
 */
function recentDevices(store, limit = 200) {
  const roomById = new Map(store.rooms.map((r) => [r.id, r]));
  const rackById = new Map(store.racks.map((r) => [r.id, r]));
  return [...store.devices]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit)
    .map((d) => {
      const rack = rackById.get(d.rackId);
      const room = rack ? roomById.get(rack.roomId) : null;
      if (!rack || !room) return null;
      return {
        deviceId: d.id, name: d.name, sn: d.sn, model: d.model,
        ip: d.ip, owner: d.owner, brand: d.brand, bmcMac: d.bmcMac,
        switchLoc: d.switchLoc, mgmtPort: d.mgmtPort, cableType: d.cableType,
        status: d.status,
        startU: d.startU, heightU: d.heightU, updatedAt: d.updatedAt,
        rackId: rack.id, rackName: rack.name, roomName: room.name, roomCode: room.code,
      };
    })
    .filter(Boolean);
}

module.exports = { createUndoStack, recentDevices, UNDO_KEEP };
