import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canvasNodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const geometrySource = readFileSync(new URL("../src/lib/canvas/canvas-node-geometry.ts", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

test("组节点采用 A 方案的完整顶部目录栏，而不是悬浮签或虚线内容框", () => {
    assert.match(canvasNodeSource, /data-canvas-group-node/);
    assert.match(canvasNodeSource, /data-canvas-group-header/);
    assert.match(canvasNodeSource, /className="absolute left-1\/2 top-3 grid h-10 -translate-x-1\/2 grid-cols-\[28px_minmax\(0,1fr\)_auto\] items-center gap-2 border px-1"/);
    assert.match(canvasNodeSource, /className="grid h-7 w-7 place-items-center rounded-lg"/);
    assert.match(canvasNodeSource, /className="min-w-0 truncate text-sm font-semibold leading-none"/);
    assert.match(canvasNodeSource, /className="flex h-7 items-center justify-center rounded-full px-2 text-\[11px\] font-semibold leading-none"/);
    assert.doesNotMatch(canvasNodeSource, /data-canvas-group-boundary/);
    assert.doesNotMatch(canvasNodeSource, /groupAccent|#4a93ff/);
});

test("组标题只在卡内目录栏显示，不重复渲染左上角外置标题", () => {
    assert.match(canvasNodeSource, /const showExternalTitle = !referenceSelectionState && !hasDedicatedInputPorts && !isGroup;/);
});

test("组容器使用与普通节点一致的中性色阶，并提高组内标题与成员 UI 的低倍率可读性", () => {
    assert.match(canvasNodeSource, /const groupContainerBackground = theme\.node\.fill;/);
    assert.match(canvasNodeSource, /background: isGroup \? groupContainerBackground/);
    assert.match(canvasNodeSource, /width: "calc\(100% - 24px\)", background: groupHeaderBackground, borderColor: groupHeaderBorder, color: theme\.node\.text/);
    assert.match(canvasNodeSource, /style=\{\{ background: theme\.node\.stroke, color: theme\.node\.text \}\}/);
    assert.match(canvasNodeSource, /const groupContentScale = Math\.min\(2\.6, Math\.max\(readableScale, 0\.8 \/ Math\.max\(scale, 0\.2\)\)\);/);
    assert.match(canvasNodeSource, /const groupMemberContentScale = readableScale;/);
    assert.match(canvasNodeSource, /: isGroup \? groupContentScale : isGroupMember \? groupMemberContentScale : readableScale;/);
    assert.match(geometrySource, /GROUP_WRAP_TOP_PADDING = 176/);
});

test("组目录栏在左右等距的固定容器内居中，并跟随当前画布色卡", () => {
    assert.match(canvasNodeSource, /backgroundTone: CanvasBackgroundTone;/);
    assert.match(canvasNodeSource, /const groupHeaderBackground = canvasTitleBackground\(colorTheme, backgroundTone\);/);
    assert.match(canvasNodeSource, /const groupHeaderBorder = canvasBackgroundPalette\(colorTheme, backgroundTone\)\.swatch;/);
    assert.match(canvasNodeSource, /className="pointer-events-none relative h-full w-full"/);
    assert.match(canvasNodeSource, /className="absolute left-1\/2 top-3 grid h-10 -translate-x-1\/2 grid-cols-\[28px_minmax\(0,1fr\)_auto\] items-center gap-2 border px-1"/);
    assert.match(canvasNodeSource, /width: "calc\(100% - 24px\)", background: groupHeaderBackground, borderColor: groupHeaderBorder, color: theme\.node\.text/);
    assert.match(projectSource, /<CanvasNode[\s\S]*?backgroundTone=\{backgroundTone\}/);
});

test("组容器仅在选中、关联或拖入时使用蓝色外框", () => {
    assert.match(canvasNodeSource, /const groupBorderColor = isGroupDropTarget \|\| isActive \? selectionBlue : theme\.node\.stroke;/);
    assert.match(canvasNodeSource, /const groupBorderWidth = isGroupDropTarget \|\| isActive \? 2 : 1;/);
    assert.match(canvasNodeSource, /borderColor: isGroup\s*\? groupBorderColor/);
    assert.match(canvasNodeSource, /borderWidth: isGroup \? groupBorderWidth : undefined/);
});
