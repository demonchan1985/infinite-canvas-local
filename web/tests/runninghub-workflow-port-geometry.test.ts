import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { RUNNING_HUB_WORKFLOW_PORT_X, runningHubWorkflowPortHeads, runningHubWorkflowPortId, runningHubWorkflowPortX, runningHubWorkflowPortY } from "../src/components/canvas/canvas-runninghub-workflow-ports.ts";

test("紧凑 RH 卡片的素材端口始终贴在卡片侧边内，不因前面有多个图片槽而掉到卡片下方", () => {
    const resource = {
        promptBinding: { nodeId: "prompt", fieldName: "text" },
        imageBindings: Array.from({ length: 11 }, (_, index) => ({ nodeId: String(index), fieldName: "image" })),
        videoBindings: [{ nodeId: "video", fieldName: "video" }],
        audioBindings: [{ nodeId: "audio", fieldName: "audio" }],
    };
    const imagePort = runningHubWorkflowPortId(resource, "image", 0)!;
    const connections = [
        { id: "prompt", fromNodeId: "text", toNodeId: "workflow", toPort: "prompt:0" },
        { id: "image", fromNodeId: "image", toNodeId: "workflow", toPort: imagePort },
    ];
    const cardHeight = 520;
    const heads = runningHubWorkflowPortHeads(resource, connections, "workflow", cardHeight);

    assert.deepEqual(heads.map((head) => [head.kind, head.index, head.connected]), [
        ["prompt", 0, true], ["image", 0, true], ["image", 1, false], ["video", 0, false], ["audio", 0, false],
    ]);
    assert.deepEqual(heads.map((head) => head.summaryY), [94, 144, 178, 212, 246]);
    assert.ok(heads.every((head) => head.summaryY >= 20 && head.summaryY <= cardHeight - 20), JSON.stringify(heads));
    assert.ok(RUNNING_HUB_WORKFLOW_PORT_X >= -8, "连接点中心不应离开卡片边缘超过 8px");
    assert.ok(heads.every((head) => runningHubWorkflowPortY(head.portId, false, resource, heads) === head.summaryY), "连线端点和图标应使用同一坐标");
});

test("RH 输入头到卡片侧边的屏幕距离在不同画布倍率下保持一致", () => {
    for (const zoom of [0.25, 0.5, 1, 2]) {
        assert.equal(runningHubWorkflowPortX(zoom) * zoom, RUNNING_HUB_WORKFLOW_PORT_X);
    }
});

test("接入全部 11 个图片槽时，剩余类型的端口仍在卡片内且不互相覆盖", () => {
    const resource = {
        promptBinding: { nodeId: "prompt", fieldName: "text" },
        imageBindings: Array.from({ length: 11 }, (_, index) => ({ nodeId: String(index), fieldName: "image" })),
        videoBindings: [{ nodeId: "video", fieldName: "video" }],
        audioBindings: [{ nodeId: "audio", fieldName: "audio" }],
    };
    const connections = resource.imageBindings.map((_, index) => ({ id: String(index), fromNodeId: String(index), toNodeId: "workflow", toPort: runningHubWorkflowPortId(resource, "image", index)! }));
    const heads = runningHubWorkflowPortHeads(resource, connections, "workflow", 520);
    const mediaY = heads.filter((head) => head.kind !== "prompt").map((head) => head.summaryY);

    assert.ok(mediaY.every((y) => y <= 500));
    assert.ok(mediaY.slice(1).every((y, index) => y - mediaY[index] >= 28));
});

test("RH 感应区固定连接图标并负责整区点击，连线使用同一组端口坐标", () => {
    const nodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
    const connectionSource = readFileSync(new URL("../src/components/canvas/canvas-connections.tsx", import.meta.url), "utf8");
    const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
    const summaryHead = nodeSource.slice(nodeSource.indexOf("function RunningHubWorkflowConnectionHead("));

    assert.match(summaryHead, /data-canvas-connection-zone="runninghub-summary"[^\n]+onMouseDown=\{\(event\) => \{ if \(event\.button === 0\) onMouseDown\(event, head\.portId\); \}\}/);
    assert.doesNotMatch(summaryHead, /transform: `translate\(\$\{marker\.x\}px, \$\{marker\.y\}px\)`/);
    assert.match(summaryHead, /left: runningHubWorkflowPortX\(scale\) - hitWidth \/ 2/);
    assert.match(projectSource, /workflowPortHeads=\{runningHubPortHeadsByNodeId\.get\(to\.id\)\}/);
    assert.match(projectSource, /runningHubWorkflowPortX\(viewport\.k\)/);
    assert.match(connectionSource, /runningHubWorkflowPortY\(connection\.toPort, [^\n]+workflowPortHeads\)/);
    assert.match(connectionSource, /endX = workflowPortY === undefined \? to\.position\.x : to\.position\.x \+ runningHubWorkflowPortX\(scale\)/);
});
