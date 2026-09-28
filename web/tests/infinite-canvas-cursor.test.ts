import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canvasSource = readFileSync(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-node.tsx", import.meta.url), "utf8");
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
    assert.match(stylesSource, /:where\(button, \[role="button"\], a, label\)/);
    assert.match(stylesSource, /\.cursor-nwse-resize/);
});

test("移动与选择模式下开关内部图形也显示可点击光标", () => {
    assert.match(stylesSource, /\[data-canvas-tool="pan"\] :where\(button, \[role="button"\], a, label\) :where\(:not\(input, textarea, select, \[contenteditable="true"\]\)\)/);
});

test("点击卡片内的表单控件不启动节点拖动", () => {
    const start = projectSource.indexOf("const handleNodeMouseDown =");
    const dragStart = projectSource.slice(start, projectSource.indexOf("const currentNodes =", start));
    assert.match(dragStart, /event\.target instanceof Element/);
    assert.match(dragStart, /\.closest\([^\n]+button[^\n]+input[^\n]+label[^\n]+ant-slider/);
    assert.match(dragStart, /pendingSelectionRef\.current = null;\s*return;/);
});

test("RunningHub 页脚开关可点击文字且有足够的命中高度", () => {
    const footer = workflowSource.slice(workflowSource.indexOf("<footer"), workflowSource.indexOf("</footer>"));
    assert.ok((footer.match(/<label[^>]+min-h-10/g) || []).length >= 2);
    assert.ok((footer.match(/htmlFor=/g) || []).length >= 2);
});
