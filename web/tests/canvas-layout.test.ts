import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeCanvasNodes, fitCanvasViewport } from "../src/lib/canvas/canvas-layout.ts";
import type { CanvasNodeData } from "../src/types/canvas.ts";

const node = (id: string, x = 0, y = 0, groupId?: string): CanvasNodeData => ({ id, type: "text", title: id, position: { x, y }, width: 300, height: 180, metadata: { content: id, groupId } });

test("适应画布覆盖负坐标与不同尺寸，不超过原有缩放范围", () => {
    const nodes = [node("a", -1500, -700), node("b", 800, 900)];
    const view = fitCanvasViewport(nodes, { width: 1200, height: 800 });
    for (const item of nodes) {
        assert.ok(item.position.x * view.k + view.x >= 40);
        assert.ok(item.position.y * view.k + view.y >= 40);
        assert.ok((item.position.x + item.width) * view.k + view.x <= 1160);
        assert.ok((item.position.y + item.height) * view.k + view.y <= 760);
    }
    assert.deepEqual(fitCanvasViewport([], { width: 1200, height: 800 }), { x: 600, y: 400, k: 1 });
});

test("依赖关系从左到右排列，保留 ID、内容与输入对象", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const before = JSON.stringify(nodes);
    const result = arrangeCanvasNodes(nodes, [{ id: "ab", fromNodeId: "a", toNodeId: "b" }, { id: "bc", fromNodeId: "b", toNodeId: "c" }]);
    assert.equal(JSON.stringify(nodes), before);
    assert.ok(result[0].position.x + 300 < result[1].position.x);
    assert.ok(result[1].position.x + 300 < result[2].position.x);
    assert.deepEqual(result.map((item) => item.metadata), nodes.map((item) => item.metadata));
});

test("分组及嵌套成员整体移动，保留组内相对坐标", () => {
    const group = { ...node("group", 100, 200), type: "group", width: 800, height: 700 };
    const nested = { ...node("nested", 130, 260, "group"), type: "group" };
    const child = node("child", 150, 300, "nested");
    const result = arrangeCanvasNodes([group, nested, child, node("outside")], [{ id: "edge", fromNodeId: "child", toNodeId: "outside" }]);
    assert.equal(result[2].position.x - result[0].position.x, 50);
    assert.equal(result[2].position.y - result[0].position.y, 100);
    assert.ok(result[3].position.x > result[0].position.x + group.width);
});

test("环形连线和孤立节点也全部保留且不重叠", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const result = arrangeCanvasNodes(nodes, [{ id: "ab", fromNodeId: "a", toNodeId: "b" }, { id: "ba", fromNodeId: "b", toNodeId: "a" }]);
    assert.equal(result.length, 3);
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
        const a = result[i], b = result[j];
        assert.ok(a.position.x + a.width <= b.position.x || b.position.x + b.width <= a.position.x || a.position.y + a.height <= b.position.y || b.position.y + b.height <= a.position.y);
    }
});
