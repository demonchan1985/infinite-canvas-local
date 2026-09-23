import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const nodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");

test("图片信息开关只控制图片标题栏的原图尺寸，不渲染图内右下角浮层", () => {
    assert.match(nodeSource, /showProfessionalImageInfo && imageResolution/);
    assert.doesNotMatch(nodeSource, /function ImageInfoBar/);
});
