import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");

test("图片节点高清放大先打开 SeedVR2.5 设置，再由设置框提交应用", () => {
    assert.match(projectSource, /findSeedVrUpscaleModel\(config\.channels\)/);
    assert.match(projectSource, /const \[seedVrUpscaleNodeId, setSeedVrUpscaleNodeId\] = useState<string \| null>\(null\)/);
    assert.match(projectSource, /const \[seedVrUpscaleInstanceType, setSeedVrUpscaleInstanceType\] = useState<RunningHubWorkflowInstanceType>\("plus"\)/);
    assert.match(projectSource, /setSeedVrUpscaleInstanceType\("plus"\)/);
    assert.match(projectSource, /const openSeedVrUpscale = useCallback/);
    assert.match(projectSource, /setSeedVrUpscaleNodeId\(node\.id\)/);
    assert.match(projectSource, /const runSeedVrUpscale = useCallback/);
    assert.match(projectSource, /runningHubWorkflowValues: \{ \[RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY\]: pixel \}/);
    assert.match(projectSource, /runningHubWorkflowBindings: \{ image: imageBindings, video: \[\], audio: \[\] \}/);
    assert.match(projectSource, /runningHubWorkflowRunOptions: \{ instanceType \}/);
    assert.match(projectSource, /onSuperResolve=\{\(node\) => openSeedVrUpscale\(node\)\}/);
    assert.match(projectSource, /superResolveOpen=\{Boolean\(seedVrUpscaleNode\?\.metadata\?\.content\)\}/);
    assert.match(projectSource, /superResolveContent=\{/);
    assert.match(projectSource, /w-\[280px\]/);
    assert.match(projectSource, /menuPlacement="top"/);
    assert.match(projectSource, /menuPortalContainer=\{\(\) => document\.getElementById\("canvas-seedvr-upscale-settings"\)\}/);
    assert.match(projectSource, /void runSeedVrUpscale\(seedVrUpscaleNode, seedVrUpscalePixel, seedVrUpscaleInstanceType\)/);
    assert.doesNotMatch(projectSource, /onSuperResolve=\{\(node\) => void runSeedVrUpscale\(node\)\}/);
    assert.doesNotMatch(projectSource, /setSuperResolveNodeId/);
});

test("高清放大设置从工具按钮正上方以紧凑浮层展开", () => {
    assert.match(toolbarSource, /tool\.id === "superResolve" && hasImage/);
    assert.match(toolbarSource, /placement="top"/);
    assert.match(toolbarSource, /superResolveOpen/);
    assert.match(toolbarSource, /superResolveContent/);
});

test("高清放大浮层内的下拉菜单可留在浮层中并向上展开", () => {
    const selectSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-settings-popover.tsx", import.meta.url), "utf8");
    assert.match(selectSource, /menuPlacement\?: "auto" \| "top" \| "bottom"/);
    assert.match(selectSource, /menuPortalContainer\?: \(\) => HTMLElement \| null/);
    assert.match(selectSource, /const openAbove = menuPlacement === "top"/);
    assert.match(selectSource, /menuPortalContainer\?\.\(\) \|\| document\.body/);
});

test("高清放大图标放在多角度之后、图片替换之前", () => {
    const orderBlock = toolbarSource.match(/const professionalImageToolbarOrder = \[(.*?)\] as const;/s)?.[1] || "";
    const order = [...orderBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(order.slice(1, 6), ["maskEdit", "personAdjust", "angle", "superResolve", "replace"]);
});
