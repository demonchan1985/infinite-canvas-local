import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveRunningHubWorkflowMaterialEnabledPorts, resolveRunningHubWorkflowRunOptions, runningHubWorkflowFieldControl, runningHubWorkflowInstanceLabel, runningHubWorkflowNumberLimits, toggleRunningHubWorkflowMaterialPort, type RunningHubWorkflowMaterialSlot } from "../src/components/canvas/runninghub-workflow-settings.ts";
import { resolveCreativeLibraryPlacement } from "../src/lib/canvas/canvas-creative-library-position.ts";
import type { RunningHubWorkflowField } from "../src/stores/use-config-store.ts";

const workflowPopoverSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-settings-popover.tsx", import.meta.url), "utf8");
const promptPanelSource = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const configNodePanelSource = readFileSync(new URL("../src/components/canvas/canvas-config-node-panel.tsx", import.meta.url), "utf8");
const creativeToolsSource = readFileSync(new URL("../src/components/canvas/canvas-creative-tools.tsx", import.meta.url), "utf8");
const workflowNodeSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-node.tsx", import.meta.url), "utf8");

const field = (fieldName: string, label: string, type: RunningHubWorkflowField["type"] = "number"): RunningHubWorkflowField => ({ nodeId: "1", fieldName, key: `1.${fieldName}`, label, type, defaultValue: type === "number" ? 1 : "" });

test("参数控件不按字段名虚构比例列表、数值范围或二采流程开关", () => {
    assert.equal(runningHubWorkflowFieldControl(field("aspect_ratio", "画面比例", "text")), "default");
    assert.equal(runningHubWorkflowFieldControl(field("megapixels", "画面像素（MP）")), "default");
    assert.equal(runningHubWorkflowFieldControl(field("value", "视频时长（秒）")), "default");
    assert.equal(runningHubWorkflowFieldControl({ ...field("value", "视频时长（秒）"), min: 1, max: 120 }), "duration");
    assert.equal(runningHubWorkflowFieldControl(field("noise_seed", "随机种子")), "seed");
    assert.equal(runningHubWorkflowFieldControl(field("value", "二采倍数")), "default");
});

test("范围只使用接口元数据，缺失时不以 H3 范围兜底", () => {
    assert.deepEqual(runningHubWorkflowNumberLimits(field("value", "视频时长（秒）")), { min: undefined, max: undefined, step: undefined });
    assert.deepEqual(runningHubWorkflowNumberLimits({ ...field("megapixels", "画面像素（MP）"), min: 0.5, max: 8, step: 0.5 }), { min: 0.5, max: 8, step: 0.5 });
});

const materialSlots: RunningHubWorkflowMaterialSlot[] = [
    { portId: "image:0:0:51.image", kind: "image", index: 0, nodeId: "51", fieldName: "image", connected: true },
    { portId: "image:1:1:49.image", kind: "image", index: 1, nodeId: "49", fieldName: "image", connected: false },
    { portId: "video:0:2:27.video", kind: "video", index: 0, nodeId: "27", fieldName: "video", connected: false },
];

test("素材开关默认只启用已连接的真实槽位，未连接时保留首个可连接图片槽", () => {
    assert.deepEqual(resolveRunningHubWorkflowMaterialEnabledPorts(materialSlots), ["image:0:51.image"]);
    assert.deepEqual(resolveRunningHubWorkflowMaterialEnabledPorts(materialSlots.map((slot) => ({ ...slot, connected: false }))), ["image:0:51.image"]);
});

test("素材开关按真实槽位独立保存，并兼容完整端口格式", () => {
    const initial = resolveRunningHubWorkflowMaterialEnabledPorts(materialSlots);
    const withSecondImage = toggleRunningHubWorkflowMaterialPort(initial, materialSlots[1].portId, true);
    assert.deepEqual(withSecondImage, ["image:0:51.image", "image:1:49.image"]);
    assert.deepEqual(toggleRunningHubWorkflowMaterialPort(withSecondImage, materialSlots[0].portId, false), ["image:1:49.image"]);
});

test("工作流任务选项遵循 /openapi/v2/run/workflow 的实例字段与范围", () => {
    assert.equal(runningHubWorkflowInstanceLabel("default"), "24G");
    assert.equal(runningHubWorkflowInstanceLabel("plus"), "48G");
    assert.equal(runningHubWorkflowInstanceLabel("ultra"), "84G");
    assert.deepEqual(resolveRunningHubWorkflowRunOptions(), { addMetadata: true, instanceType: "default", usePersonalQueue: false });
    assert.deepEqual(resolveRunningHubWorkflowRunOptions({ addMetadata: false, instanceType: "ultra", usePersonalQueue: true, retainSeconds: 30, webhookUrl: " https://example.com/runninghub " }), {
        addMetadata: false,
        instanceType: "ultra",
        usePersonalQueue: true,
        retainSeconds: 30,
        webhookUrl: "https://example.com/runninghub",
    });
    assert.deepEqual(resolveRunningHubWorkflowRunOptions({ instanceType: "invalid" as never, retainSeconds: 9, webhookUrl: "not-a-url" }), { addMetadata: true, instanceType: "default", usePersonalQueue: false });
});

test("视频工作流设置以紧凑浮层从创作框架下方展开，而非固定居中遮挡节点", () => {
    assert.match(workflowPopoverSource, /const width = Math\.min\(520, window\.innerWidth - margin \* 2\)/);
    assert.doesNotMatch(workflowPopoverSource, /left: "50%"/);
    assert.doesNotMatch(workflowPopoverSource, /top: "50%"/);
    assert.match(workflowPopoverSource, /buttonRect\.bottom \+ gap/);

    const videoWorkflowStart = promptPanelSource.indexOf("hasRunningHubWorkflowSettings(config) ?");
    const videoWorkflowTrigger = promptPanelSource.slice(videoWorkflowStart, promptPanelSource.indexOf("CanvasVideoSettingsPopover", videoWorkflowStart));
    assert.match(videoWorkflowTrigger, /placement="bottomLeft"/);

    const configNodeWorkflowStart = configNodePanelSource.indexOf("mode === \"video\" && hasRunningHubWorkflowSettings(config)");
    const configNodeWorkflowTrigger = configNodePanelSource.slice(configNodeWorkflowStart, configNodePanelSource.indexOf("CanvasVideoSettingsPopover", configNodeWorkflowStart));
    assert.match(configNodeWorkflowTrigger, /placement="bottomRight"/);
});

test("工作流卡片的映射详情贴在卡片侧边，右侧不足时翻边并保持在可视区域", () => {
    assert.match(workflowNodeSource, /placement="nodeRight"/);
    assert.match(workflowPopoverSource, /closest\("\[data-rh-workflow-primary\]"\)/);
    assert.match(workflowPopoverSource, /resolveCreativeLibraryPlacement/);
    assert.match(workflowPopoverSource, /requestAnimationFrame\(trackCanvasPosition\)/);
    assert.match(workflowPopoverSource, /Math\.min\(520, sidePlacement\.maxHeight\)/);

    const viewport = { left: 0, top: 0, width: 1852, height: 1150 };
    const beside = resolveCreativeLibraryPlacement({ left: 250, top: 245, right: 1078, bottom: 874, width: 828, height: 629 }, viewport, 520, 520);
    assert.equal(beside.left, 1094);
    assert.ok(beside.top >= 12 && beside.top + 520 <= 1138);

    const flipped = resolveCreativeLibraryPlacement({ left: 1080, top: 650, right: 1750, bottom: 1050, width: 670, height: 400 }, viewport, 520, 520);
    assert.equal(flipped.left, 544);
    assert.ok(flipped.top >= 12 && flipped.top + 520 <= 1138);

    const narrow = resolveCreativeLibraryPlacement({ left: 24, top: 100, right: 351, bottom: 600, width: 327, height: 500 }, { left: 0, top: 0, width: 375, height: 667 }, 520, 520);
    assert.ok(narrow.left >= 12 && narrow.left + narrow.width <= 363);
    assert.ok(narrow.top >= 12 && narrow.top + 520 <= 655);
});

test("创作框架的预设图标使用 44px 命中区，并在按钮级阻止画布拖拽", () => {
    assert.match(creativeToolsSource, /!h-11 !w-11 !min-w-11/);
    assert.ok((creativeToolsSource.match(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/g) || []).length >= 3);
});
