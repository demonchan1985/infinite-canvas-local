import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canvasBackgroundPalette, canvasGridStroke, canvasSurfacePalette, canvasTitleBackground } from "../src/lib/canvas-theme.ts";

const toolbarSource = readFileSync(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url), "utf8");
const canvasSource = readFileSync(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url), "utf8");
const canvasNodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const workflowNodeSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-node.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");

test("画布提供中性、蓝、绿、紫四种色调，并随浅深主题保持不同背景", () => {
    const tones = ["neutral", "blue", "green", "violet"] as const;
    assert.equal(new Set(tones.map((tone) => canvasBackgroundPalette("dark", tone).background)).size, tones.length);
    assert.notEqual(canvasBackgroundPalette("light", "blue").background, canvasBackgroundPalette("dark", "blue").background);
});

test("网格与点阵使用半像素线和小于一像素的点径", () => {
    assert.equal(canvasGridStroke.lineWidth, 0.5);
    assert.ok(canvasGridStroke.dotDiameter(1) < 1);
});

test("网格保持细线但使用更清晰的显示对比度", () => {
    assert.match(canvasSource, /mode === "dots" \? "opacity-60" : "opacity-75"/);
});

test("色调使用无文字的矩形色卡，并保留名称作为辅助提示", () => {
    assert.match(toolbarSource, /role="group" aria-label="色调"/);
    assert.match(toolbarSource, /h-9 flex-1 rounded-md border/);
    assert.doesNotMatch(toolbarSource, /value=\{props\.backgroundTone\}/);
});

test("浅色蓝绿紫色调与中性色具有可见的明度区分", () => {
    const neutral = canvasBackgroundPalette("light", "neutral").background;
    for (const tone of ["blue", "green", "violet"] as const) {
        assert.notEqual(canvasBackgroundPalette("light", tone).background, neutral);
        assert.notEqual(canvasBackgroundPalette("light", tone).swatch, canvasBackgroundPalette("light", "neutral").swatch);
    }
});

test("色卡同步画布表面与弹窗背景，而不只改变网格", () => {
    for (const theme of ["light", "dark"] as const) {
        const neutral = canvasSurfacePalette(theme, "neutral");
        for (const tone of ["neutral", "blue", "green", "violet"] as const) {
            const surface = canvasSurfacePalette(theme, tone);
            assert.equal(surface.background, canvasBackgroundPalette(theme, tone).background);
            assert.ok(surface.panel);
            assert.ok(surface.fill);
            assert.ok(surface.toolbarPanel);
            if (tone !== "neutral") {
                assert.notEqual(surface.panel, neutral.panel);
                assert.notEqual(surface.fill, neutral.fill);
                assert.notEqual(surface.toolbarPanel, neutral.toolbarPanel);
            }
        }
    }
    assert.match(projectSource, /canvasSurfacePalette\(colorTheme, backgroundTone\)/);
    assert.match(projectSource, /dataset\.canvasTone = backgroundTone/);
    assert.match(globalsSource, /html\[data-canvas-tone\]/);
    assert.match(globalsSource, /\.ant-modal-container/);
    assert.match(globalsSource, /\.ant-popover \.ant-popover-container/);
});

test("RH 标题背景与当前画布色卡使用同一颜色", () => {
    for (const theme of ["light", "dark"] as const) {
        for (const tone of ["neutral", "blue", "green", "violet"] as const) {
            assert.equal(canvasTitleBackground(theme, tone), canvasBackgroundPalette(theme, tone).background);
        }
    }
    assert.match(workflowNodeSource, /canvasTitleBackground\(colorTheme, backgroundTone\)/);
});

test("RH 标题条使用当前色卡作为底部分隔，外框完整包住卡片", () => {
    assert.match(workflowNodeSource, /const titleBorder = canvasBackgroundPalette\(colorTheme, backgroundTone\)\.swatch;/);
    assert.match(workflowNodeSource, /className="relative flex h-14 shrink-0 items-center gap-3 border-b px-4"/);
    assert.doesNotMatch(workflowNodeSource, /border px-4 rounded-t-\[inherit\]/);
    assert.match(workflowNodeSource, /borderColor: titleBorder/);
});

test("RH 标题栏隐藏工作流副标题并突出主标题", () => {
    assert.match(workflowNodeSource, /<div className="truncate text-xl font-semibold">/);
    assert.doesNotMatch(workflowNodeSource, /mt-0\.5 truncate text-sm opacity-60">\{connectionHint\}/);
});

test("RH 卡片仅保留卡内标题，不再渲染外置重复标题", () => {
    assert.match(canvasNodeSource, /const showExternalTitle = !referenceSelectionState && !hasDedicatedInputPorts && !isGroup;/);
    assert.match(canvasNodeSource, /\{showExternalTitle && \(/);
});
