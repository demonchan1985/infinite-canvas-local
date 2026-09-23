import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { GROUP_IMAGE_ROW_GAP, GROUP_IMAGE_THUMBNAIL_MAX_EDGE, GROUP_IMAGE_TOP_PADDING, arrangeGroupImageNodes } from "../src/lib/canvas/canvas-layout.ts";
import type { CanvasNodeData } from "../src/types/canvas.ts";

const image = (id: string, x: number, y: number, width = 180, height = 120, groupId?: string): CanvasNodeData => ({
    id,
    type: "image",
    title: id,
    position: { x, y },
    width,
    height,
    metadata: { content: id, groupId },
});

const group = (id: string, x: number, y: number, width = 560, height = 420): CanvasNodeData => ({
    id,
    type: "group",
    title: id,
    position: { x, y },
    width,
    height,
    metadata: {},
});

test("从选区创建图片组后按阅读顺序自动排列并收紧边界", () => {
    const container = group("group", 100, 200);
    const result = arrangeGroupImageNodes(
        [container, image("bottom", 420, 580, 180, 120, "group"), image("left", 120, 220, 180, 120, "group"), image("right", 660, 220, 180, 120, "group")],
        container.id,
        { fit: true },
    );
    const byId = new Map(result.map((node) => [node.id, node]));

    assert.equal(GROUP_IMAGE_TOP_PADDING, 176);
    assert.equal(GROUP_IMAGE_ROW_GAP, 72);
    assert.deepEqual(byId.get("left")?.position, { x: 124, y: 376 });
    assert.deepEqual(byId.get("right")?.position, { x: 328, y: 376 });
    assert.deepEqual(byId.get("bottom")?.position, { x: 124, y: 568 });
    assert.equal(byId.get("group")?.width, 432);
    assert.equal(byId.get("group")?.height, 512);
});

test("图片拖入已有图片组后会重新排列全部图片且仅扩展边界", () => {
    const container = group("group", 100, 200, 560, 420);
    const result = arrangeGroupImageNodes([container, image("existing", 420, 390, 180, 120, "group"), image("incoming", 190, 250, 180, 120, "group")], container.id);
    const byId = new Map(result.map((node) => [node.id, node]));

    assert.deepEqual(byId.get("incoming")?.position, { x: 124, y: 376 });
    assert.deepEqual(byId.get("existing")?.position, { x: 328, y: 376 });
    assert.equal(byId.get("group")?.width, 560);
    assert.equal(byId.get("group")?.height, 420);
});

test("图片加入组后收敛为最大 220px 边的缩略图，并保留原始比例", () => {
    const container = group("group", 100, 200);
    const result = arrangeGroupImageNodes([container, image("wide", 120, 220, 1920, 1080, "group"), image("tall", 660, 220, 800, 1600, "group")], container.id, { fit: true });
    const byId = new Map(result.map((node) => [node.id, node]));

    assert.equal(GROUP_IMAGE_THUMBNAIL_MAX_EDGE, 220);
    assert.deepEqual({ width: byId.get("wide")?.width, height: byId.get("wide")?.height }, { width: 220, height: 124 });
    assert.deepEqual({ width: byId.get("tall")?.width, height: byId.get("tall")?.height }, { width: 110, height: 220 });
    assert.equal(byId.get("group")?.width, 402);
    assert.equal(byId.get("group")?.height, 420);
});

test("拖入与从选区建组都会接入图片整理", () => {
    const geometrySource = readFileSync(new URL("../src/lib/canvas/canvas-node-geometry.ts", import.meta.url), "utf8");
    assert.match(geometrySource, /arrangeGroupImageNodes\(joined, group\.id/);
    assert.match(geometrySource, /nodes: arrangeGroupImageNodes\(next\.nodes, group\.id/);
});

test("恢复已保存的画布时也会紧凑整理纯图片组", () => {
    const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
    assert.match(projectSource, /arrangeAllGroupImageNodes\(resetInterruptedGeneration\(project\.nodes\)/);
});
