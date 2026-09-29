import assert from "node:assert/strict";
import { test } from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas.ts";
import type { RunningHubResource } from "../src/stores/use-config-store.ts";

Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
const { buildNodeGenerationContext, buildRunningHubWorkflowGenerationContext } = await import("../src/components/canvas/canvas-node-generation.ts");
const nodes = [
    { id: "image", type: CanvasNodeType.Image, title: "参考图片", metadata: { content: "data:image/png;base64,aGVsbG8=" } },
    { id: "text", type: CanvasNodeType.Text, title: "H3 视频提示词", metadata: { content: "超市购物视频提示词" } },
    { id: "workflow", type: CanvasNodeType.Config, title: "普通配置节点" },
] as CanvasNodeData[];
const connections = [
    { id: "image-workflow", fromNodeId: "image", toNodeId: "workflow", toPort: "image:0:0:130.ref_image_1" },
    { id: "text-workflow", fromNodeId: "text", toNodeId: "workflow", toPort: "prompt:0" },
] as CanvasConnection[];

test("图片独立生成不吸收共同连接到下游配置卡的文本", () => {
    const context = buildNodeGenerationContext("image", nodes, connections, "按风格生成");

    assert.equal(context.prompt, "按风格生成");
    assert.equal(context.textCount, 0);
    assert.equal(context.imageCount, 0);
});

test("连接普通图片节点不会把该节点的其他输入带回源图片", () => {
    const ordinaryNodes = [
        ...nodes.filter((node) => node.id !== "workflow"),
        { id: "next-image", type: CanvasNodeType.Image, title: "普通图片", metadata: { content: "data:image/png;base64,aGVsbG8=" } },
    ] as CanvasNodeData[];
    const ordinaryConnections = [
        { id: "image-next", fromNodeId: "image", toNodeId: "next-image" },
        { id: "text-next", fromNodeId: "text", toNodeId: "next-image" },
    ] as CanvasConnection[];

    const sourceContext = buildNodeGenerationContext("image", ordinaryNodes, ordinaryConnections, "按风格生成");
    const targetContext = buildNodeGenerationContext("next-image", ordinaryNodes, ordinaryConnections, "修改画面");

    assert.equal(sourceContext.prompt, "按风格生成");
    assert.equal(sourceContext.textCount, 0);
    assert.equal(targetContext.textCount, 1);
    assert.equal(targetContext.imageCount, 1);
});

test("普通节点只读取直接输入，不递归带入输入图片自身的上游文本", () => {
    const ordinaryNodes = [
        ...nodes.filter((node) => node.id !== "workflow"),
        { id: "next-image", type: CanvasNodeType.Image, title: "普通图片", metadata: { content: "data:image/png;base64,aGVsbG8=" } },
    ] as CanvasNodeData[];
    const chain = [
        { id: "text-image", fromNodeId: "text", toNodeId: "image" },
        { id: "image-next", fromNodeId: "image", toNodeId: "next-image" },
    ] as CanvasConnection[];

    const context = buildNodeGenerationContext("next-image", ordinaryNodes, chain, "修改画面");

    assert.equal(context.prompt, "修改画面");
    assert.equal(context.textCount, 0);
    assert.equal(context.imageCount, 1);
});

test("直接连入图片节点的文本仍参与该图片生成", () => {
    const context = buildNodeGenerationContext("image", nodes, [
        ...connections,
        { id: "text-image", fromNodeId: "text", toNodeId: "image" },
    ], "按风格生成");

    assert.equal(context.prompt, "按风格生成\n\n【文本1】\n超市购物视频提示词");
    assert.equal(context.textCount, 1);
});

test("RH 工作流卡继续读取直接连入的提示词和图片", () => {
    const resource: RunningHubResource = {
        kind: "workflow",
        target: "2103209695132602370",
        imageBindings: [{ nodeId: "130", fieldName: "ref_image_1" }],
    };
    const context = buildRunningHubWorkflowGenerationContext("workflow", nodes, connections, "卡片默认提示词", resource);

    assert.equal(context.prompt, "超市购物视频提示词");
    assert.equal(context.textCount, 1);
    assert.equal(context.imageCount, 1);
    assert.deepEqual(context.runningHubWorkflowBindings?.image, resource.imageBindings);
});
