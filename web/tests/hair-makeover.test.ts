import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { canvasCreativePresetsForKind, canvasHairReferenceError, composeCanvasCreativePrompt, findCanvasCreativePreset, normalizeCanvasCreativeSelection } from "../src/lib/canvas/canvas-creative-presets.ts";

const hairstyle = findCanvasCreativePreset("hairstyle", "hair-54");
const haircolor = findCanvasCreativePreset("haircolor", "color-89");
assert.ok(hairstyle && haircolor);

test("收集的款式数量、ID与137款独立预览完整", () => {
    const styles = canvasCreativePresetsForKind("hairstyle");
    const colors = canvasCreativePresetsForKind("haircolor");
    const all = [...styles, ...colors];
    assert.equal(styles.length, 99);
    assert.equal(colors.length, 38);
    assert.equal(new Set(all.map((x) => x.id)).size, 137);
    assert.equal(all.filter((x) => x.preview).length, 137);
    assert.equal(styles.filter((x) => !x.preview).length, 0);
    assert.equal(styles.findIndex((x) => !x.preview), -1);
    assert.equal(new Set(all.map((x) => x.preview)).size, 137);
    for (const item of all.filter((x) => x.preview)) assert.ok(existsSync(new URL(`../public${item.preview}`, import.meta.url)), item.id);
});

test("单选发型保留发色，单选发色保留发型，组合选择不带冲突限制", () => {
    const styleOnly = composeCanvasCreativePrompt("", { hairstyle }, "image");
    const colorOnly = composeCanvasCreativePrompt("", { haircolor }, "image");
    const both = composeCanvasCreativePrompt("正视上半身", { hairstyle, haircolor }, "image");
    assert.match(styleOnly, /保留人物参考图的原有发色/);
    assert.match(colorOnly, /保留人物参考图的发长、分缝/);
    assert.doesNotMatch(both, /保留人物参考图的原有发色|保留人物参考图的发长、分缝/);
    assert.ok(both.includes(hairstyle.prompt) && both.includes(haircolor.prompt));
    assert.equal(both.split(hairstyle.prefix!).length - 1, 1);
});

test("人物参考校验只作用于有效图片换发预设，旧生图和视频不受影响", () => {
    assert.ok(canvasHairReferenceError({ hairstyle }, "image", 0));
    assert.ok(canvasHairReferenceError({ haircolor }, "image", 0));
    assert.equal(canvasHairReferenceError({ hairstyle, haircolor }, "image", 1), undefined);
    assert.equal(canvasHairReferenceError(undefined, "image", 0), undefined);
    assert.equal(canvasHairReferenceError({ hairstyle }, "video", 0), undefined);
});

test("刷新后的选择从目录恢复，切换视频模式不保留换发预设", () => {
    const persisted = JSON.parse(JSON.stringify({ hairstyle, haircolor }));
    assert.deepEqual(normalizeCanvasCreativeSelection(persisted, "image"), { hairstyle, haircolor });
    assert.deepEqual(normalizeCanvasCreativeSelection(persisted, "video"), {});
    assert.deepEqual(normalizeCanvasCreativeSelection({ hairstyle: { ...hairstyle, id: "missing" } }, "image"), {});
});

test("原本同时烫染的参考款式已分离发色要求，不覆盖组合选择", () => {
    for (const id of ["hair-08", "hair-20", "hair-46", "hair-47", "hair-52"]) {
        const preset = findCanvasCreativePreset("hairstyle", id);
        assert.ok(preset);
        assert.doesNotMatch(preset.prompt, /发色|染成|棕色|银灰|米棕|黑色/);
    }
});
