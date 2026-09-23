import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const helpersSource = readFileSync(new URL("../src/lib/canvas/canvas-generation-helpers.ts", import.meta.url), "utf8");

test("项目恢复不会等待媒体迁移才完成首屏画布", () => {
    assert.match(projectSource, /setProjectLoaded\(true\);\s+void hydrateCanvasImages/);
    assert.doesNotMatch(projectSource, /const restoredNodes = \(await hydrateCanvasImages/);
    assert.match(projectSource, /current === restoredNodes \? normalizedNodes : current/);
});

test("单个画布媒体或会话媒体恢复失败时保留原始记录", () => {
    assert.match(helpersSource, /catch \{\s+return node;\s+\}/);
    assert.match(helpersSource, /catch \{\s+return item;\s+\}/);
});
