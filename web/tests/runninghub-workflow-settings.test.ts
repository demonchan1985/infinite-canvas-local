import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { RUNNING_HUB_ASPECT_RATIO_OPTIONS, resolveRunningHubWorkflowMaterialEnabledPorts, resolveRunningHubWorkflowRunOptions, runningHubWorkflowFieldControl, runningHubWorkflowInstanceLabel, runningHubWorkflowNumberLimits, toggleRunningHubWorkflowMaterialPort, type RunningHubWorkflowMaterialSlot } from "../src/components/canvas/runninghub-workflow-settings.ts";
import type { RunningHubWorkflowField } from "../src/stores/use-config-store.ts";

const workflowPopoverSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-settings-popover.tsx", import.meta.url), "utf8");
const promptPanelSource = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const configNodePanelSource = readFileSync(new URL("../src/components/canvas/canvas-config-node-panel.tsx", import.meta.url), "utf8");
const creativeToolsSource = readFileSync(new URL("../src/components/canvas/canvas-creative-tools.tsx", import.meta.url), "utf8");

const field = (fieldName: string, label: string, type: RunningHubWorkflowField["type"] = "number"): RunningHubWorkflowField => ({ nodeId: "1", fieldName, key: `1.${fieldName}`, label, type, defaultValue: type === "number" ? 1 : "" });

test("MiniMax H3 的真实字段使用对应参数控件", () => {
    assert.equal(runningHubWorkflowFieldControl(field("aspect_ratio", "画面比例", "text")), "aspect-ratio");
    assert.equal(runningHubWorkflowFieldControl(field("megapixels", "画面像素（MP）")), "megapixels");
    assert.equal(runningHubWorkflowFieldControl(field("value", "视频时长（秒）")), "duration");
    assert.equal(runningHubWorkflowFieldControl(field("noise_seed", "随机种子")), "seed");
    assert.equal(runningHubWorkflowFieldControl(field("value", "二采倍数")), "second-pass");
});

test("时长和像素范围遵循 H3 评审定义", () => {
    assert.deepEqual(runningHubWorkflowNumberLimits(field("value", "视频时长（秒）")), { min: 2, max: 15, step: 1 });
    assert.deepEqual(runningHubWorkflowNumberLimits(field("megapixels", "画面像素（MP）")), { min: 0.2, max: 2, step: 0.1 });
    assert.ok(RUNNING_HUB_ASPECT_RATIO_OPTIONS.includes("16:9 (Widescreen)"));
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

test("创作框架的预设图标使用 44px 命中区，并在按钮级阻止画布拖拽", () => {
    assert.match(creativeToolsSource, /!h-11 !w-11 !min-w-11/);
    assert.ok((creativeToolsSource.match(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/g) || []).length >= 3);
});
