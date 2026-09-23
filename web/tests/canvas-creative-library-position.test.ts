import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCreativeLibraryPlacement } from "../src/lib/canvas/canvas-creative-library-position.ts";

test("创作技能库在靠近画布底部的创作框旁打开时向上收纳，完整留在可视区域", () => {
    const placement = resolveCreativeLibraryPlacement(
        { left: 207, top: 823, right: 900, bottom: 1123, width: 693, height: 300 },
        { left: 0, top: 0, width: 1964, height: 1218 },
        440,
        672,
    );

    assert.equal(placement.left, 916);
    assert.equal(placement.top, 534);
    assert.equal(placement.maxHeight, 680);
    assert.ok(placement.top + 672 <= 1206);
});

test("创作技能库空间充足时保持与创作框中线对齐", () => {
    const placement = resolveCreativeLibraryPlacement(
        { left: 300, top: 300, right: 900, bottom: 600, width: 600, height: 300 },
        { left: 0, top: 0, width: 1600, height: 1500 },
        440,
        672,
    );

    assert.equal(placement.top, 114);
    assert.equal(placement.top + 672 / 2, 450);
});

test("右侧空间不足时，创作技能库翻到创作框左侧，并始终限制在可视区域内", () => {
    const placement = resolveCreativeLibraryPlacement(
        { left: 1450, top: 640, right: 1700, bottom: 940, width: 250, height: 300 },
        { left: 0, top: 0, width: 1964, height: 1000 },
        440,
        672,
    );

    assert.equal(placement.left, 994);
    assert.ok(placement.top >= 12);
    assert.ok(placement.top + Math.min(672, placement.maxHeight) <= 988);
});
