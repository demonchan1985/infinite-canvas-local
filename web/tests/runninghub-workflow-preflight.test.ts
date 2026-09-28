import assert from "node:assert/strict";
import { test } from "node:test";

import { createRunningHubWorkflowModel } from "../src/lib/runninghub-model.ts";

Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
const { prepareRunningHubWorkflowConfig } = await import("../src/services/api/image.ts");
const { createModelChannel, defaultConfig, encodeChannelModel } = await import("../src/stores/use-config-store.ts");
const { createVideoGenerationTask } = await import("../src/services/api/video.ts");
const { default: axios } = await import("axios");

function legacyConfig() {
    const model = createRunningHubWorkflowModel("1904136902449209346", { promptBinding: { nodeId: "6", fieldName: "text" }, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [] }, "之前可用的工作流");
    const channel = createModelChannel({ id: "rh", apiFormat: "runninghub", baseUrl: "https://www.runninghub.cn", consumerApiKey: "mock-consumer-key", models: [model] });
    return { ...defaultConfig, model: encodeChannelModel(channel.id, model.name), channels: [channel], runningHubWorkflowValues: { "3.steps": 28 } };
}

test("旧工作流自动只读核对映射，保留用户参数、原配置和收费提交保护", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const calls: string[] = [];
    globalThis.fetch = (async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ data: { prompt: JSON.stringify({ "6": { class_type: "CLIPTextEncode", inputs: { text: "old", clip: ["4", 1] } }, "3": { class_type: "KSampler", inputs: { steps: 20 } } }) } }), { status: 200 });
    }) as typeof fetch;
    const config = legacyConfig();
    const ready = await prepareRunningHubWorkflowConfig(config);
    assert.deepEqual(calls, ["/api/runninghub/workflow-info"]);
    assert.deepEqual(ready.runningHubWorkflowValues, { "3.steps": 28 });
    assert.deepEqual(ready.channels[0].models[0].runningHub?.apiFieldKeys?.slice().sort(), ["3.steps", "6.text"]);
    assert.equal(config.channels[0].models[0].runningHub?.apiFieldKeys, undefined);
    assert.notEqual(ready.channels[0].models[0].script, config.channels[0].models[0].script);
    await prepareRunningHubWorkflowConfig(ready);
    assert.equal(calls.length, 1);
});

test("只读核对失败时保留旧配置，不创建收费任务，并注明失败阶段", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const calls: string[] = [];
    globalThis.fetch = (async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ error: "mapping unavailable" }), { status: 503 }); }) as typeof fetch;
    const config = legacyConfig();
    await assert.rejects(prepareRunningHubWorkflowConfig(config), /核对映射.*mapping unavailable/);
    assert.deepEqual(calls, ["/api/runninghub/workflow-info"]);
    assert.equal(config.channels[0].models[0].runningHub?.apiFieldKeys, undefined);
});

test("旧卡片核对后的配置可穿过真实视频脚本边界，不再被缺少快照拦截", async (t) => {
    const originalFetch = globalThis.fetch;
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { globalThis.fetch = originalFetch; axios.defaults.adapter = originalAdapter; });
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: { prompt: JSON.stringify({ "6": { class_type: "CLIPTextEncode", inputs: { text: "old" } }, "3": { class_type: "KSampler", inputs: { steps: 20 } } }) } }), { status: 200 })) as typeof fetch;
    const requests: { url?: string; data?: string }[] = [];
    axios.defaults.adapter = async (config) => {
        requests.push({ url: config.url, data: config.data });
        return { data: config.url?.endsWith("/query") ? { status: "FAILED", failedReason: { node_id: "3", exception_message: "mock remote failure" } } : { taskId: "mock-task" }, status: 200, statusText: "OK", headers: {}, config };
    };
    const ready = await prepareRunningHubWorkflowConfig(legacyConfig());
    await assert.rejects(createVideoGenerationTask(ready, "mock prompt"), /mock remote failure/);
    assert.equal(requests.length, 2);
    const task = JSON.parse(requests[0].data || "{}");
    assert.equal(task.target, "1904136902449209346");
    assert.ok(task.nodeInfoList.some((item: { nodeId: string; fieldName: string; fieldValue: unknown }) => item.nodeId === "3" && item.fieldName === "steps" && item.fieldValue === 28));
});
