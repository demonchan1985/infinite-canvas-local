import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canvasSource = readFileSync(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");

test("移动与选择模式由画布统一保持抓手，拖动画布时统一保持闭合抓手", () => {
    assert.match(canvasSource, /data-canvas-tool=\{activeTool\}/);
    assert.match(canvasSource, /data-canvas-panning=\{isPanning \|\| undefined\}/);
    assert.doesNotMatch(canvasSource, /document\.body\.style\.cursor/);
    assert.match(stylesSource, /\[data-canvas-tool="pan"\],\s+\[data-canvas-tool="pan"\] \*/);
    assert.match(stylesSource, /cursor: grab !important/);
    assert.match(stylesSource, /\[data-canvas-panning="true"\],\s+\[data-canvas-panning="true"\] \*/);
    assert.match(stylesSource, /cursor: grabbing !important/);
});

test("移动与选择模式保留文本输入、按钮和缩放手柄的明确光标", () => {
    assert.match(stylesSource, /:is\(input, textarea, select, \[contenteditable="true"\]\)/);
    assert.match(stylesSource, /:is\(button, \[role="button"\], a, label\)/);
    assert.match(stylesSource, /\.cursor-nwse-resize/);
});
