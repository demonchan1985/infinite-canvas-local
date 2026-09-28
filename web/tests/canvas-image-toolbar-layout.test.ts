import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const toolbarSource = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const imageToolsSource = readFileSync(new URL("../src/components/canvas/canvas-image-toolbar-tools.tsx", import.meta.url), "utf8");
const nodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const textTagsSource = readFileSync(new URL("../src/components/canvas/canvas-text-node-tags.tsx", import.meta.url), "utf8");

test("所有非图片卡片的悬停工具条只显示图标，文字保留在提示和无障碍名称中", () => {
    assert.match(toolbarSource, /const showToolbarLabels = hasImage && isSimpleMode && showImageToolLabels;/);
    assert.match(toolbarSource, /showLabel=\{hasImage && tool\.id === "saveAsset" \? false : showToolbarLabels\}/);
    assert.doesNotMatch(toolbarSource, /showLabel=\{[^}]*:\s*true\}/);
    assert.doesNotMatch(textTagsSource, /<span>\{t\("canvas\.nodeToolbar\.tags"\)\}<\/span>/);
    assert.match(toolbarSource, /<Tooltip title=\{title\} placement="top"/);
    assert.match(toolbarSource, /aria-label=\{title\}/);
    assert.match(textTagsSource, /aria-label=\{t\("canvas\.nodeToolbar\.tagsTitle"\)\}/);
});

test("图片节点悬停工具条直接显示添加到资产库按钮", () => {
    assert.match(toolbarSource, /isSimpleMode \? new Set\(\["download", "saveAsset"\]\)/);
    assert.match(toolbarSource, /id: "saveAsset", title: t\(isImage \? "canvas\.nodeToolbar\.addImageToAssets"/);
    assert.match(toolbarSource, /label: t\(isImage \? "canvas\.nodeToolbar\.addImageToAssets"/);
    assert.match(toolbarSource, /onClick: \(\) => onSaveAsset\(node\)/);
    assert.match(toolbarSource, /showLabel=\{hasImage && tool\.id === "saveAsset" \? false : showToolbarLabels\}/);
    assert.match(toolbarSource, /<Tooltip title=\{title\} placement="top"/);
    assert.doesNotMatch(nodeSource, /onSaveAsset\(data\)/);
});

test("专业模式将图片节点工具按固定顺序展示在主工具条", () => {
    assert.match(toolbarSource, /const professionalImageToolbarOrder = \[/);
    for (const id of ["maskEdit", "personAdjust", "angle", "replace", "crop", "split", "upscale", "superResolve", "copyPrompt", "reversePrompt", "view", "download", "saveAsset", "info", "delete"]) {
        assert.match(toolbarSource, new RegExp(`"${id}"`));
    }
    assert.doesNotMatch(toolbarSource, /"resize"/);
    assert.doesNotMatch(imageToolsSource, /id: "resize"|onToggleFreeResize/);
    assert.doesNotMatch(projectSource, /freeResize|onToggleFreeResize/);
    assert.match(toolbarSource, /const professionalImageToolbarTools = professionalImageToolbarOrder/);
    assert.match(toolbarSource, /hasImage \? \(isSimpleMode \? imagePrimaryTools : professionalImageToolbarTools\)/);
    assert.match(toolbarSource, /showLabel=\{showToolbarLabels\}/);
    assert.match(toolbarSource, /<Tooltip title=\{title\} placement="top"/);
});

test("图片工具与更多菜单只保留给简洁模式，专业模式不显示省略号折叠", () => {
    assert.doesNotMatch(toolbarSource, /imageToolMenuTools/);
    assert.match(toolbarSource, /\{hasImage && isSimpleMode \? \(/);
    assert.match(toolbarSource, /const imageToolbarSeparatorBeforeIds = new Set\(\["replace", "copyPrompt", "view", "info"\]\);/);
});

test("图片悬停菜单贴近图片信息且随缩放保留间距", () => {
    assert.match(toolbarSource, /const infoTopOffset = node\.type === CanvasNodeType\.Image \? 2 \+ 24 \* canvasNodeReadableScale\(viewport\.k\) \* viewport\.k \+ 6 : 32;/);
    assert.match(toolbarSource, /const top = viewport\.y \+ node\.position\.y \* viewport\.k - infoTopOffset;/);
    assert.match(nodeSource, /bottom: data\.type === CanvasNodeType\.Image \? `calc\(100% \+ \$\{2 \/ Math\.max\(scale, 0\.1\)\}px\)` : undefined/);
    assert.match(nodeSource, /data-canvas-image-info className=\{`[^`]*\$\{data\.type === CanvasNodeType\.Image \? "leading-tight" : ""\}`\}/);
    assert.match(nodeSource, /data\.type === CanvasNodeType\.Image \? "py-0 leading-tight" : "py-0\.5"/);
    assert.match(nodeSource, /data\.type === CanvasNodeType\.Image \? "h-6 leading-tight" : "h-7"/);
    assert.doesNotMatch(nodeSource, /top: data\.type === CanvasNodeType\.Image \? -18/);
});

test("图片节点始终等比缩放，选中后右下角显示圆角拖拽提示", () => {
    assert.match(nodeSource, /keepRatio: hasDedicatedInputPorts \|\| data\.type === CanvasNodeType\.Image \|\| data\.type === CanvasNodeType\.Video/);
    assert.match(nodeSource, /className="pointer-events-none block h-full w-full select-none object-contain"/);
    assert.match(nodeSource, /showIndicator=\{isSelected && data\.type === CanvasNodeType\.Image\}/);
    assert.match(nodeSource, /rounded-br-\[10px\] border-b-2 border-r-2/);
    assert.match(nodeSource, /transform: `scale\(\$\{1 \/ Math\.max\(scale, 0\.1\)\}\)`/);
    assert.doesNotMatch(nodeSource, /freeResize/);
});

test("图片卡片选中框贴合图片裁切圆角，缩小时不留下外扩阴影空隙", () => {
    assert.match(nodeSource, /className={`relative h-full w-full overflow-visible border \$\{hasImageContent \? "rounded-3xl" : "rounded-xl"\}`}/);
    assert.match(nodeSource, /const imageBorderColor = isSelected \? "transparent" : isActive \? selectionBlue/);
    assert.match(nodeSource, /hasImageContent \? "rounded-\[calc\(1\.5rem-1px\)\]" : "rounded-\[inherit\]"/);
    assert.match(nodeSource, /className="group\/image relative h-full w-full overflow-hidden rounded-\[calc\(1\.5rem-1px\)\]"/);
    assert.match(nodeSource, /hasImageContent && isSelected \? \(\s*<div className="pointer-events-none absolute inset-0 z-40 rounded-\[calc\(1\.5rem-1px\)\] border-solid" style=\{\{ borderColor: selectionBlue, borderWidth: 2 \/ Math\.max\(scale, 0\.1\) \}\} \/>/);
    assert.doesNotMatch(nodeSource, /hasImageContent && isSelected\s*\? `0 0 0 \$\{2 \/ Math\.max\(scale, 0\.1\)\}px \$\{selectionBlue\}`/);
});

test("图片创作框留出更多间距，左右连接点更贴近卡片", () => {
    assert.match(nodeSource, /paddingTop: hasImageContent \? 24 : 16/);
    assert.match(nodeSource, /const hitSize = 64 \/ screenScale;/);
    assert.match(nodeSource, /const magneticOffset = 8 \/ screenScale;/);
});
