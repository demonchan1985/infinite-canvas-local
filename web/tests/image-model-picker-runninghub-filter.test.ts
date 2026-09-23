import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const configStoreSource = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");
const modelPickerSource = readFileSync(new URL("../src/components/model-picker.tsx", import.meta.url), "utf8");

test("图片模型候选不会混入 RunningHub AI 应用或工作流", () => {
    assert.match(configStoreSource, /isRunningHubApplicationOrWorkflow/);
    assert.match(configStoreSource, /model\.capability === capability && !\(capability === "image" && isRunningHubApplicationOrWorkflow\(model\)\)/);
    assert.match(modelPickerSource, /selectableModelsByCapability\(config, capability\)/);
});
