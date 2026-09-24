import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const toolbarSource = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const nodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");

test("图片节点悬停工具条直接显示添加到资产库按钮", () => {
    assert.match(toolbarSource, /isSimpleMode \? new Set\(\["download", "saveAsset"\]\)/);
    assert.match(toolbarSource, /id: "saveAsset", title: t\(isImage \? "canvas\.nodeToolbar\.addImageToAssets"/);
    assert.match(toolbarSource, /label: t\(isImage \? "canvas\.nodeToolbar\.addImageToAssets"/);
    assert.match(toolbarSource, /onClick: \(\) => onSaveAsset\(node\)/);
    assert.match(toolbarSource, /showLabel=\{hasImage && tool\.id === "saveAsset" \? false : isImage \? isSimpleMode && showImageToolLabels : true\}/);
    assert.match(toolbarSource, /<Tooltip title=\{title\} placement="top"/);
    assert.doesNotMatch(nodeSource, /onSaveAsset\(data\)/);
});

test("专业模式将图片节点工具按固定顺序展示在主工具条", () => {
    assert.match(toolbarSource, /const professionalImageToolbarOrder = \[/);
    for (const id of ["maskEdit", "personAdjust", "angle", "replace", "crop", "split", "upscale", "superResolve", "copyPrompt", "reversePrompt", "resize", "view", "download", "saveAsset", "info", "delete"]) {
        assert.match(toolbarSource, new RegExp(`"${id}"`));
    }
    assert.match(toolbarSource, /const professionalImageToolbarTools = professionalImageToolbarOrder/);
    assert.match(toolbarSource, /hasImage \? \(isSimpleMode \? imagePrimaryTools : professionalImageToolbarTools\)/);
    assert.match(toolbarSource, /showLabel=\{isImage \? isSimpleMode && showImageToolLabels : true\}/);
    assert.match(toolbarSource, /<Tooltip title=\{title\} placement="top"/);
});

test("图片工具与更多菜单只保留给简洁模式，专业模式不显示省略号折叠", () => {
    assert.doesNotMatch(toolbarSource, /imageToolMenuTools/);
    assert.match(toolbarSource, /\{hasImage && isSimpleMode \? \(/);
    assert.match(toolbarSource, /const imageToolbarSeparatorBeforeIds = new Set\(\["replace", "copyPrompt", "view", "info"\]\);/);
});
