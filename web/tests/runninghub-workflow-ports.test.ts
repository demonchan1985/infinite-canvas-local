import assert from "node:assert/strict";
import { test } from "node:test";

import { migrateUnambiguousRunningHubLegacyConnections, runningHubWorkflowAutoPort, runningHubWorkflowFirstAvailablePort, runningHubWorkflowPortHeads, runningHubWorkflowPortIdentity, runningHubWorkflowPortLabel, runningHubWorkflowPortY } from "../src/components/canvas/canvas-runninghub-workflow-ports.ts";
import type { RunningHubResource } from "../src/stores/use-config-store.ts";
import type { CanvasConnection, CanvasNodeData } from "../src/types/canvas.ts";

test("RunningHub 多参考端口在展开时按真实槽位顺序定位，收起时位于节点外侧连接头", () => {
    assert.equal(runningHubWorkflowPortY("prompt:0"), 76);
    assert.equal(runningHubWorkflowPortY("image:0:0:51.image"), 116);
    assert.equal(runningHubWorkflowPortY("video:0:6:27.video"), 356);
    assert.equal(runningHubWorkflowPortY("audio:0:7:15.audio"), 396);
    assert.equal(runningHubWorkflowPortY("image:3:43.image"), 236);
    assert.equal(runningHubWorkflowPortY("prompt:0", false), 94);
    assert.equal(runningHubWorkflowPortY("image:1:1:49.image", false), 178);
    assert.equal(runningHubWorkflowPortY("audio:0:7:15.audio", false), 382);
});

test("旧端口根据真实素材绑定恢复全局顺序，并与新端口视作同一个槽位", () => {
    const resource: RunningHubResource = {
        kind: "workflow",
        target: "2092878871120142337",
        imageBindings: ["51", "49", "50", "43", "19", "23"].map((nodeId) => ({ nodeId, fieldName: "image" })),
        videoBindings: [{ nodeId: "27", fieldName: "video" }],
        audioBindings: [{ nodeId: "15", fieldName: "audio" }],
    };

    assert.equal(runningHubWorkflowPortY("video:0:27.video", true, resource), 356);
    assert.equal(runningHubWorkflowPortY("audio:0:15.audio", true, resource), 396);
    assert.equal(runningHubWorkflowPortIdentity("video:0:6:27.video"), "video:0:27.video");
});

test("RH 连线标签从真实目标端口解析编号", () => {
    assert.equal(runningHubWorkflowPortLabel("prompt:0"), "提示词");
    assert.equal(runningHubWorkflowPortLabel("image:0:0:51.image"), "图片1");
    assert.equal(runningHubWorkflowPortLabel("image:5:5:23.image"), "图片6");
    assert.equal(runningHubWorkflowPortLabel("video:0:6:27.video"), "视频1");
    assert.equal(runningHubWorkflowPortLabel("audio:2:9:17.audio"), "音频3");
    assert.equal(runningHubWorkflowPortLabel(undefined), undefined);
});

test("仅把可唯一判定的旧工作流连线迁移到提示词和第一个真实素材端口", () => {
    const resource: RunningHubResource = {
        kind: "workflow",
        target: "h3",
        promptBinding: { nodeId: "9", fieldName: "prompt" },
        imageBindings: [{ nodeId: "51", fieldName: "image" }, { nodeId: "49", fieldName: "image" }],
        videoBindings: [{ nodeId: "27", fieldName: "video" }],
    };
    const nodes = [
        { id: "prompt", type: "text" },
        { id: "image", type: "image" },
        { id: "workflow", type: "config" },
    ] as CanvasNodeData[];
    const connections: CanvasConnection[] = [
        { id: "legacy-prompt", fromNodeId: "prompt", toNodeId: "workflow" },
        { id: "legacy-image", fromNodeId: "image", toNodeId: "workflow" },
    ];

    const result = migrateUnambiguousRunningHubLegacyConnections(connections, nodes, (node) => node.id === "workflow" ? resource : undefined);

    assert.deepEqual(result.map(({ id, toPort }) => ({ id, toPort })), [
        { id: "legacy-prompt", toPort: "prompt:0" },
        { id: "legacy-image", toPort: "image:0:0:51.image" },
    ]);
});

test("同类存在多条旧连线时不猜测素材槽位", () => {
    const resource: RunningHubResource = {
        kind: "workflow",
        target: "h3",
        imageBindings: [{ nodeId: "51", fieldName: "image" }, { nodeId: "49", fieldName: "image" }],
    };
    const nodes = [
        { id: "image-a", type: "image" },
        { id: "image-b", type: "image" },
        { id: "workflow", type: "config" },
    ] as CanvasNodeData[];
    const connections: CanvasConnection[] = [
        { id: "legacy-image-a", fromNodeId: "image-a", toNodeId: "workflow" },
        { id: "legacy-image-b", fromNodeId: "image-b", toNodeId: "workflow" },
    ];

    assert.equal(migrateUnambiguousRunningHubLegacyConnections(connections, nodes, (node) => node.id === "workflow" ? resource : undefined), connections);
});

test("拖入 RH 摘要卡时按来源种类归入首个空闲真实槽位", () => {
    const resource: RunningHubResource = {
        kind: "workflow",
        target: "h3",
        promptBinding: { nodeId: "9", fieldName: "prompt" },
        imageBindings: [{ nodeId: "51", fieldName: "image" }, { nodeId: "49", fieldName: "image" }],
        videoBindings: [{ nodeId: "27", fieldName: "video" }],
        audioBindings: [{ nodeId: "15", fieldName: "audio" }],
    };
    const connections: CanvasConnection[] = [{ id: "image-1", fromNodeId: "image-1", toNodeId: "workflow", toPort: "image:0:0:51.image" }];

    assert.equal(runningHubWorkflowAutoPort(resource, "text", connections, "workflow"), "prompt:0");
    assert.equal(runningHubWorkflowAutoPort(resource, "image", connections, "workflow"), "image:1:1:49.image");
    assert.equal(runningHubWorkflowAutoPort(resource, "video", connections, "workflow"), "video:0:2:27.video");
    assert.equal(runningHubWorkflowAutoPort(resource, "audio", connections, "workflow"), "audio:0:3:15.audio");
});

test("RH 摘要卡没有空闲同类槽位时不会覆盖已有连线", () => {
    const resource: RunningHubResource = { kind: "workflow", target: "h3", imageBindings: [{ nodeId: "51", fieldName: "image" }] };
    const connections: CanvasConnection[] = [{ id: "image-1", fromNodeId: "image-1", toNodeId: "workflow", toPort: "image:0:0:51.image" }];

    assert.equal(runningHubWorkflowFirstAvailablePort(resource, "image", connections, "workflow"), undefined);
});

test("RH 外侧连接头用已接入素材替换加号，并保留每类下一个空槽", () => {
    const resource: RunningHubResource = {
        kind: "workflow",
        target: "h3",
        promptBinding: { nodeId: "9", fieldName: "prompt" },
        imageBindings: [{ nodeId: "51", fieldName: "image" }, { nodeId: "49", fieldName: "image" }],
        videoBindings: [{ nodeId: "27", fieldName: "video" }],
    };
    const connections: CanvasConnection[] = [
        { id: "prompt", fromNodeId: "prompt", toNodeId: "workflow", toPort: "prompt:0" },
        { id: "image-1", fromNodeId: "image-1", toNodeId: "workflow", toPort: "image:0:0:51.image" },
    ];

    assert.deepEqual(runningHubWorkflowPortHeads(resource, connections, "workflow").map((head) => ({ kind: head.kind, index: head.index, connected: head.connected })), [
        { kind: "prompt", index: 0, connected: true },
        { kind: "image", index: 0, connected: true },
        { kind: "image", index: 1, connected: false },
        { kind: "video", index: 0, connected: false },
    ]);
});

test("仅图片 AI 应用不生成提示词、视频或音频连接头，并将图片头对齐到首个摘要项", () => {
    const resource: RunningHubResource = {
        kind: "app",
        target: "2051722999090434050",
        imageBindings: [{ nodeId: "82", fieldName: "index" }],
    };

    const heads = runningHubWorkflowPortHeads(resource, [], "workflow");

    assert.deepEqual(heads.map((head) => ({ kind: head.kind, index: head.index, summaryY: head.summaryY })), [
        { kind: "image", index: 0, summaryY: 94 },
    ]);
});
