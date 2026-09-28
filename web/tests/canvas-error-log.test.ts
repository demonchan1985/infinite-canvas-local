import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { formatCanvasErrorLogs, useCanvasErrorLogStore } from "../src/stores/canvas/use-canvas-error-log-store.ts";
import { createRunningHubWorkflowModel } from "../src/lib/runninghub-model.ts";

Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
const { runModelPlugin } = await import("../src/services/api/model-plugin.ts");
const { defaultConfig } = await import("../src/stores/use-config-store.ts");
const { default: axios } = await import("axios");

test("错误日志保留 RH 诊断字段，但不保存请求、Key、提示词或素材", () => {
    useCanvasErrorLogStore.getState().clear();
    const error = new Error("失败：private-key private-prompt data:image/png;base64,AAAA");
    Object.assign(error, { diagnostics: { stage: "查询任务", taskId: "task-1", status: "FAILED", errorCode: "805", nodeId: "130", exceptionMessage: "private-key private-prompt", request: { apiKey: "private-key", images: ["secret-image"] } } });
    useCanvasErrorLogStore.getState().record(error, { projectId: "canvas-1", nodeId: "card-1", nodeName: "RH", model: "H3" }, ["private-key", "private-prompt"]);
    const [entry] = useCanvasErrorLogStore.getState().entries;
    assert.equal(entry.diagnostics?.taskId, "task-1");
    assert.equal(entry.diagnostics?.nodeId, "130");
    const text = formatCanvasErrorLogs([entry]);
    for (const secret of ["private-key", "private-prompt", "secret-image", "base64,AAAA"]) assert.equal(text.includes(secret), false);
    assert.match(text, /已隐藏/);
});

test("错误日志按最新在前排列，并可按画布清空；取消任务不记录为失败", () => {
    useCanvasErrorLogStore.getState().clear();
    const store = useCanvasErrorLogStore.getState();
    store.record(new Error("first"), { projectId: "one", nodeId: "a" });
    store.record(new Error("second"), { projectId: "two", nodeId: "b" });
    store.record(new DOMException("Aborted", "AbortError"), { projectId: "one", nodeId: "a" });
    assert.deepEqual(useCanvasErrorLogStore.getState().entries.map((entry) => entry.message), ["second", "first"]);
    store.clear("one");
    assert.deepEqual(useCanvasErrorLogStore.getState().entries.map((entry) => entry.projectId), ["two"]);
});

test("错误响应中的 JSON 转义提示词和凭据同样脱敏", () => {
    useCanvasErrorLogStore.getState().clear();
    const prompt = 'private first line\nsecond "quoted" line';
    const encodedPrompt = JSON.stringify(prompt).slice(1, -1);
    const error = new Error(`失败：${encodedPrompt}; ${JSON.stringify({ prompt: "server echoed private content", authorization: "Bearer private-token" })}`);
    Object.assign(error, { diagnostics: { exceptionMessage: encodedPrompt } });
    useCanvasErrorLogStore.getState().record(error, { projectId: "one", nodeId: "card" }, [prompt]);
    const text = formatCanvasErrorLogs(useCanvasErrorLogStore.getState().entries);
    for (const secret of ["private first line", "server echoed private content", "private-token"]) assert.equal(text.includes(secret), false);
});

test("真实模型脚本包装不会丢掉错误日志所需的诊断上下文", async () => {
    const config = { ...defaultConfig, apiKey: "mock-key", model: "mock-model" };
    try {
        await runModelPlugin({ capability: "video", config, script: 'const error = new Error("failure"); error.diagnostics = { stage: "查询任务", taskId: "mock-task", nodeId: "130" }; throw error;' });
        assert.fail("应抛出失败");
    } catch (error) {
        useCanvasErrorLogStore.getState().clear();
        useCanvasErrorLogStore.getState().record(error, { projectId: "one", nodeId: "card" }, [config.apiKey]);
        assert.equal(useCanvasErrorLogStore.getState().entries[0].diagnostics?.taskId, "mock-task");
    }
});

test("生成的 RH 脚本保留 failedReason 节点诊断，而不是重复通用失败文案", async () => {
    const model = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [], apiFieldKeys: ["130.prompt"],
    });
    const runner = new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `return (async () => {\n${model.script}\n})();`);
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    const failure = { status: "FAILED", errorCode: "805", errorMessage: "工作流运行失败", failedReason: JSON.stringify({ node_id: "130", node_type: "MiniMaxH3IntegrationGH", exception_type: "ValueError", exception_message: "synthetic failure mock-key" }) };
    await assert.rejects(runner("", [], [], {}, "model", "http://test", "mock-key", "", "auto", {}, async () => ({ taskId: "mock-task" }), async (_request: unknown, extract: (state: unknown) => unknown) => extract(failure), async () => {}, undefined, () => {}), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /synthetic failure/);
        assert.equal(error.message.includes("mock-key"), false);
        useCanvasErrorLogStore.getState().clear();
        useCanvasErrorLogStore.getState().record(error, { projectId: "one", nodeId: "card" }, ["mock-key"]);
        const details = useCanvasErrorLogStore.getState().entries[0].diagnostics;
        assert.equal(details?.taskId, "mock-task");
        assert.equal(details?.nodeId, "130");
        assert.equal(details?.errorCode, "805");
        return true;
    });
});

test("已保存的旧 RH 脚本也能从真实请求边界取得任务 ID 和节点原因，不要求重导入", async (t) => {
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = originalAdapter; });
    axios.defaults.adapter = async (config) => ({ data: config.url?.endsWith("/query") ? { status: "FAILED", errorCode: "805", errorMessage: "工作流运行失败", failedReason: { node_id: "252", exception_message: "legacy synthetic failure" } } : { taskId: "legacy-task" }, status: 200, statusText: "OK", headers: {}, config });
    const config = { ...defaultConfig, apiFormat: "runninghub" as const, apiKey: "mock-key", model: "legacy-model" };
    const script = 'const task = await request({ url: "/api/runninghub/task", method: "post", data: { target: "1904136902449209346" } }); const state = await request({ url: "/api/runninghub/query", method: "post", data: { taskId: task.taskId } }); if (state.status === "FAILED") throw new Error("工作流运行失败");';
    await assert.rejects(runModelPlugin({ capability: "video", config, script }), (error: unknown) => {
        useCanvasErrorLogStore.getState().clear();
        useCanvasErrorLogStore.getState().record(error, { projectId: "one", nodeId: "card" }, [config.apiKey]);
        const details = useCanvasErrorLogStore.getState().entries[0].diagnostics;
        assert.equal(details?.taskId, "legacy-task");
        assert.equal(details?.nodeId, "252");
        assert.equal(details?.exceptionMessage, "legacy synthetic failure");
        return true;
    });
});

test("旧 RH 脚本返回纯文本 failedReason 时也保留实际失败原因", async (t) => {
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = originalAdapter; });
    axios.defaults.adapter = async (config) => ({ data: { taskId: "legacy-task", status: "FAILED", failedReason: "mock plain failure" }, status: 200, statusText: "OK", headers: {}, config });
    const config = { ...defaultConfig, apiFormat: "runninghub" as const, apiKey: "mock-key", model: "legacy-model" };
    await assert.rejects(runModelPlugin({ capability: "video", config, script: 'await request({ url: "/api/runninghub/query", method: "post", data: { taskId: "legacy-task" } }); throw new Error("工作流运行失败");' }), (error: unknown) => {
        useCanvasErrorLogStore.getState().clear();
        useCanvasErrorLogStore.getState().record(error, { projectId: "one", nodeId: "card" }, [config.apiKey]);
        assert.equal(useCanvasErrorLogStore.getState().entries[0].diagnostics?.exceptionMessage, "mock plain failure");
        return true;
    });
});

test("画布日志入口与面板文案统一使用日志名称", () => {
    const log = readFileSync(new URL("../src/components/canvas/canvas-error-log.tsx", import.meta.url), "utf8");
    assert.match(log, /aria-label="日志"/);
    assert.match(log, /title=\{`日志/);
    assert.match(log, /日志已复制/);
    assert.match(log, /该条日志已复制/);
    assert.match(log, /当前画布暂无日志/);
    assert.doesNotMatch(log, /错误日志/);
});

test("日志入口在画布右上工具栏，生成失败链路写入日志且不依赖重试", () => {
    const topBar = readFileSync(new URL("../src/components/canvas/canvas-top-bar.tsx", import.meta.url), "utf8");
    const rightBar = topBar.slice(topBar.indexOf("pointer-events-auto flex h-11 shrink-0"));
    assert.match(rightBar, /<CanvasErrorLogButton/);
    const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
    assert.match(project, /recordGenerationError\(error\)/);
    assert.match(project, /已有卡片错误/);
    assert.match(project, /sensitiveValues\.push\(effectivePrompt\)/);
    const retry = project.slice(project.indexOf("const handleRetryNode"), project.indexOf("const handleRetryNode") + 14000);
    assert.match(retry, /prepareRunningHubWorkflowConfig\(generationConfig, controller\.signal\)/);
    assert.match(retry, /useCanvasErrorLogStore\.getState\(\)\.record\(error/);
    assert.match(retry, /runningHubWorkflowBindings: context\?\.runningHubWorkflowBindings/);
});
