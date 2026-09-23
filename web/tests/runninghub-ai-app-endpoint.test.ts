import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("AI 应用任务遵循 /openapi/v2/run/ai-app/{ID} 教程", () => {
    const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    assert.match(viteConfig, /openapi\/v2\/run\/ai-app\/\$\{runningHubNumericId\(target, "AI 应用 ID"\)\}/);
    assert.doesNotMatch(viteConfig, /task\/openapi\/ai-app\/run/);
    assert.match(viteConfig, /function runningHubAiAppTaskPayload/);
    assert.match(viteConfig, /usePersonalQueue/);
});
