import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const workflowNodeSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-node.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");

test("连接点在低缩放时使用独立的固定屏幕感应区和可见视觉尺寸", () => {
    assert.match(source, /const screenScale = Math\.max\(scale, 0\.1\)/);
    assert.match(source, /const markerSize = 20 \/ screenScale/);
    assert.match(source, /const hitSize = 84 \/ screenScale/);
    assert.match(source, /sideOffset/);
});

test("连接点靠近即可浮到鼠标下方开始拉线，而非要求命中小图标", () => {
    assert.match(source, /data-canvas-connection-zone/);
    assert.match(source, /onMouseMove=\{moveMarker\}/);
    assert.match(source, /onMouseLeave=\{clearMarker\}/);
    assert.match(source, /cursor-crosshair/);
    assert.match(source, /transform: `translate\(\$\{marker\.x\}px, \$\{marker\.y\}px\)`/);
    assert.doesNotMatch(source, /visible \? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"/);
});

test("普通卡片的连接点从卡片外侧磁吸到靠近的鼠标位置", () => {
    assert.match(source, /const markerSize = 20 \/ screenScale/);
    assert.match(source, /const magneticOffset = 20 \/ screenScale/);
    assert.match(source, /const sideOffset = `-\$\{hitSize \/ 2 \+ magneticOffset\}px`/);
    assert.match(source, /transition: marker\.active \? "none" : "opacity 120ms ease-out, transform 120ms ease-out"/);
});

test("RH 摘要端口使用横向扩展感应区，避免相邻真实槽位互相抢占", () => {
    assert.match(source, /const hitWidth = 56 \/ screenScale/);
    assert.match(source, /const hitHeight = 28 \/ screenScale/);
    assert.match(source, /data-canvas-connection-zone="runninghub-summary"/);
});

test("展开的 RH 真实端口也能在整行左侧感应区直接开始拉线", () => {
    assert.match(workflowNodeSource, /data-canvas-connection-zone="runninghub-row"/);
    assert.match(workflowNodeSource, /const hitWidth = 40/);
    assert.match(workflowNodeSource, /onMouseMove=\{moveMarker\}/);
    assert.match(workflowNodeSource, /cursor-crosshair/);
});

test("连接点不再使用与外层固定尺寸失配的旧尺寸", () => {
    assert.doesNotMatch(source, /top-1\/2 z-30 flex size-12/);
    assert.doesNotMatch(source, /18 \/ scale/);
    assert.doesNotMatch(source, /10 \/ scale/);
});

test("连接感应区优先显示十字光标，不被画布平移抓手覆盖", () => {
    assert.match(globalStyles, /\[data-canvas-tool="pan"\]\s+\[data-canvas-connection-zone\],\s*\[data-canvas-tool="pan"\]\s+\[data-canvas-connection-zone\] \*\s*\{\s*cursor: crosshair !important;/);
});
