/* jshint esversion: 2020 */
'use strict';
/**
 * 临时柜名识别格式（示例推断）· 可运行自检
 *
 *   node examples/rack-format-demo.js
 *
 * 纯内存运行：不联网、不写文件、不启动服务。
 * 覆盖：内置规则识别失败 → 输入一个真实柜名示例 → 整批柜名按该格式解析
 *      → 不符合示例格式时回退基础规则。
 *
 * 完整内置规则表、导入落库与前端交互由私有仓库 RackAtlas-full 存证，不在本仓库公开。
 */
const assert = require('node:assert/strict');
const {
  inferRackPattern, parseByPattern, parseRackNameEx, parseSimpleRack,
} = require('../lib/rack-format-public-demo');

const log = (n, text) => console.log(`  ${n}. ${text}`);

/* 1. 内置（演示级）规则识别不了带中文 / 特殊结构的柜名 */
assert.equal(parseSimpleRack('101机房A01'), null, '演示级规则不应认识「101机房A01」');
assert.equal(parseSimpleRack('A区01'), null, '演示级规则不应认识「A区01」');
assert.equal(parseSimpleRack('A01').index, 1, '基础格式 A01 仍应可解析');
log('1', '内置（演示级）规则：A01 可解析，101机房A01 / A区01 识别失败（原生痛点）');

/* 2. 输入示例后，系统学会该结构 */
const cases = [
  { sample: '101机房A01', tests: [['102机房B03', '102', 'B', 3], ['601机房A02', '601', 'A', 2]] },
  { sample: 'A区01', tests: [['B区05', '', 'B', 5], ['C区12', '', 'C', 12]] },
  { sample: '1F-A01', tests: [['2F-B12', '2F', 'B', 12]] },
  { sample: 'A栋01', tests: [['C栋08', '', 'C', 8]] },
];
for (const { sample, tests } of cases) {
  const pat = inferRackPattern(sample);
  assert.ok(pat, `示例「${sample}」应能推断出规则`);
  for (const [raw, room, col, pos] of tests) {
    const r = parseByPattern(raw, pat);
    assert.ok(r, `「${raw}」应能按「${sample}」解析`);
    assert.equal(r.prefix || '', room, `${raw} 房间号`);
    assert.equal(r.label, col, `${raw} 列`);
    assert.equal(r.index, pos, `${raw} 序号`);
  }
}
log('2', '示例推断：101机房A01 / A区01 / 1F-A01 / A栋01 四类结构全部解析正确');

/* 3. 示例只影响同结构柜名，不符合的不会被误读 */
const pat = inferRackPattern('101机房A01');
assert.equal(parseByPattern('A01', pat), null, 'A01 不符合示例结构，应返回 null');
log('3', '格式隔离：不符合示例结构的柜名不会被误解析');

/* 4. 回退：不带示例时退回基础规则 */
assert.equal(parseRackNameEx('A01').index, 1, '无示例时 A01 走基础规则');
assert.equal(parseRackNameEx('101机房A01'), null, '无示例时带中文柜名仍识别失败（符合预期）');
assert.equal(parseRackNameEx('101机房A01', '101机房A01').prefix, '101', '有示例时按示例解析');
log('4', '回退逻辑：无示例用基础规则，有示例优先按示例，失败自动回退');

/* 5. 推断结果带有可读描述，便于界面提示 */
assert.equal(inferRackPattern('101机房A01').desc, '房间号 + 列 + 序号');
assert.equal(inferRackPattern('A区01').desc, '列 + 序号');
log('5', `格式描述：${cases.map((c) => `${c.sample} → ${inferRackPattern(c.sample).desc}`).join('；')}`);

console.log('\n全部断言通过：示例推断 / 角色识别 / 格式隔离 / 回退逻辑 / 可读描述。');
console.log('注意：本演示不含完整内置规则表、导入落库与前端交互，完整实现由私有仓库存证。');
