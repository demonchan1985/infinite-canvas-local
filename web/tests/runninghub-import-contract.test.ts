import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createRunningHubWorkflowModel, parseRunningHubAiApp, parseRunningHubWorkflowBindings } from "../src/lib/runninghub-model.ts";

test("公开参数保留 RH 原说明、原选项提交值和显式范围，不把提交状态当注释", () => {
    const description = "原工作流说明：选择输出比例。\n全景仅适用于此应用。";
    const app = parseRunningHubAiApp({ data: { appName: "测试应用", nodeInfoList: [
        { nodeId: "7", fieldName: "aspect_ratio", label: "输出比例", fieldType: "LIST", fieldValue: "panoramic", description, fieldData: JSON.stringify([
            { name: "横版", index: "wide", description: "原横版说明" },
            { name: "全景", index: "panoramic", description: "原全景说明" },
            { default: "panoramic", description: "不是选项" },
        ]) },
        { nodeId: "8", fieldName: "megapixels", label: "像素", fieldType: "FLOAT", fieldValue: 4, min: 0.5, max: 8, step: 0.5 },
    ] } }, "2099999999999999999");
    const [ratio, pixels] = app.bindings.workflowFields;
    assert.equal(ratio.description, description);
    assert.deepEqual(ratio.options, ["wide", "panoramic"]);
    assert.deepEqual(ratio.optionLabels, { wide: "原横版说明", panoramic: "原全景说明" });
    assert.equal(ratio.defaultValue, "panoramic");
    assert.deepEqual({ min: pixels.min, max: pixels.max, step: pixels.step }, { min: 0.5, max: 8, step: 0.5 });
    assert.equal(pixels.description, undefined);
});

test("图中只有当前值时，不给 H3 或同名自定义字段编造可选值与范围", () => {
    const bindings = parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "130": { class_type: "MiniMaxH3IntegrationGH", inputs: { aspect: "custom", ref_image_size: "original", megapixels: 4 } },
        "8": { class_type: "OtherGenerator", inputs: { aspect_ratio: "cinema", megapixels: 8 } },
    }) } });
    const raw = parseRunningHubWorkflowBindings({ nodes: [{ id: 130, type: "MiniMaxH3IntegrationGH", inputs: [
        { name: "ref_image_1" }, { name: "megapixels", widget: { name: "megapixels" } },
    ], widgets_values: [4] }], links: [] });
    for (const field of [...bindings.workflowFields, ...raw.workflowFields]) {
        assert.equal(field.options, undefined);
        assert.equal(field.min, undefined);
        assert.equal(field.max, undefined);
        assert.equal(field.step, undefined);
        assert.equal(field.description, undefined);
    }
});

test("导入不会把未知枚举默认值换成首项，也不会舍入字符串大整数", () => {
    const app = parseRunningHubAiApp({ nodeInfoList: [
        { nodeId: "7", fieldName: "model", fieldType: "LIST", fieldValue: "saved-model", fieldData: ["new-model", "other-model"] },
        { nodeId: "8", fieldName: "noise_seed", fieldType: "INT", fieldValue: "18446744073709551614" },
    ] }, "2099999999999999999");
    assert.equal(app.bindings.workflowFields[0].defaultValue, "saved-model");
    assert.equal(app.bindings.workflowFields[1].defaultValue, "18446744073709551614");
});

test("参数名带 image、video、audio 时，仍以公开字段类型区分参数和素材端口", () => {
    const app = parseRunningHubAiApp({ nodeInfoList: [
        { nodeId: "7", fieldName: "image_resolution", fieldType: "LIST", fieldValue: "4k", fieldData: ["2k", "4k"] },
        { nodeId: "7", fieldName: "video_duration", fieldType: "INT", fieldValue: 20 },
        { nodeId: "7", fieldName: "audio_mode", fieldType: "STRING", fieldValue: "keep" },
        { nodeId: "8", fieldName: "source", fieldType: "IMAGE", fieldValue: "input.png" },
        { nodeId: "9", fieldName: "image_size", fieldValue: "original" },
    ] }, "2099999999999999999");
    assert.deepEqual(app.bindings.workflowFields.map((field) => field.key), ["7.image_resolution", "7.video_duration", "7.audio_mode", "9.image_size"]);
    assert.deepEqual(app.bindings.imageBindings, [{ nodeId: "8", fieldName: "source" }]);
    assert.deepEqual(app.bindings.videoBindings, []);
    assert.deepEqual(app.bindings.audioBindings, []);
});

test("实际参数组件展示原说明与独立提交状态，缺失说明明确标注且不套用 H3 控件", async () => {
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
    const { CanvasRunningHubWorkflowParameterFields } = await import("../src/components/canvas/canvas-runninghub-workflow-settings-popover.tsx");
    const { canvasThemes } = await import("../src/lib/canvas-theme.ts");
    const app = parseRunningHubAiApp({ nodeInfoList: [
        { nodeId: "7", fieldName: "aspect_ratio", label: "输出比例", fieldType: "LIST", fieldValue: "cinema", description: "作者原说明", fieldData: ["cinema", "custom"] },
        { nodeId: "8", fieldName: "megapixels", label: "像素", fieldType: "FLOAT", fieldValue: 4, min: 0.5, max: 8, step: 0.5 },
        { nodeId: "9", fieldName: "value", label: "二采倍数", fieldType: "FLOAT", fieldValue: 1.5 },
    ] }, "2099999999999999999");
    const html = renderToStaticMarkup(createElement(CanvasRunningHubWorkflowParameterFields, {
        fields: app.bindings.workflowFields, values: { "7.aspect_ratio": "cinema" }, theme: canvasThemes.dark,
        onChange: () => {}, onClear: () => {},
    }));
    assert.match(html, /RH 原说明/);
    assert.match(html, /作者原说明/);
    assert.match(html, /API 未返回原说明/);
    assert.match(html, /提交状态：本次覆盖/);
    assert.match(html, /max="8"/);
    assert.doesNotMatch(html, /启用二采|可自定义 2–15|真实节点字段/);
});

test("真实脚本执行从导入到提交保留空文本、零、关闭状态和大种子，只覆盖用户编辑字段", async (t) => {
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    const { runModelPlugin } = await import("../src/services/api/model-plugin.ts");
    const { defaultConfig } = await import("../src/stores/use-config-store.ts");
    const { default: axios } = await import("axios");
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = originalAdapter; });
    const model = createRunningHubWorkflowModel("2099999999999999999", parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "7": { class_type: "OtherGenerator", inputs: { prompt: "default prompt", negative_prompt: "old negative", strength: 1, enhance: true, seed: "123", untouched: 42, model: ["9", 0] } },
        "8": { class_type: "SaveImage", inputs: { images: ["7", 0] } },
    }) } }));
    let submitted: { target: string; nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }> } | undefined;
    axios.defaults.adapter = async (config) => {
        if (config.url?.endsWith("/task")) submitted = JSON.parse(config.data);
        else assert.ok(config.url?.endsWith("/query"), "所有外部请求必须被模拟");
        return { data: config.url?.endsWith("/task") ? { taskId: "mock-task" } : { status: "SUCCESS", results: [{ url: "https://example.test/result.png" }] }, status: 200, statusText: "OK", headers: {}, config };
    };
    const result = await runModelPlugin({ capability: model.capability, script: model.script!, config: { ...defaultConfig, apiFormat: "runninghub", apiKey: "mock-key" }, prompt: "new prompt", params: {
        workflowValues: { "7.negative_prompt": "", "7.strength": 0, "7.enhance": false, "7.seed": "18446744073709551614" },
    } });
    assert.deepEqual(result, ["https://example.test/result.png"]);
    assert.equal(submitted?.target, "2099999999999999999");
    assert.deepEqual(submitted?.nodeInfoList, [
        { nodeId: "7", fieldName: "prompt", fieldValue: "new prompt" },
        { nodeId: "7", fieldName: "negative_prompt", fieldValue: "" },
        { nodeId: "7", fieldName: "strength", fieldValue: 0 },
        { nodeId: "7", fieldName: "enhance", fieldValue: false },
        { nodeId: "7", fieldName: "seed", fieldValue: "18446744073709551614" },
    ]);
});

test("成功状态没有输出时明确报错，不把输入图片当结果或继续轮询到超时", async (t) => {
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    const { runModelPlugin } = await import("../src/services/api/model-plugin.ts");
    const { defaultConfig } = await import("../src/stores/use-config-store.ts");
    const { default: axios } = await import("axios");
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = originalAdapter; });
    const model = createRunningHubWorkflowModel("2099999999999999999", parseRunningHubWorkflowBindings({ "8": { class_type: "SaveImage", inputs: { filename_prefix: "result" } } }));
    for (const result of [{ status: "SUCCESS", results: [] }, { status: "SUCCESS", input_image_url: "https://example.test/input.png" }]) {
        const controller = new AbortController();
        let queryCount = 0;
        axios.defaults.adapter = async (config) => {
            if (config.url?.endsWith("/query")) {
                queryCount++;
                // 仅防止错误旧实现在空结果上持续等待，不改变产品轮询策略。
                setImmediate(() => controller.abort());
            } else assert.ok(config.url?.endsWith("/task"));
            return { data: config.url?.endsWith("/task") ? { taskId: "mock-empty-task" } : result, status: 200, statusText: "OK", headers: {}, config };
        };
        await assert.rejects(runModelPlugin({ capability: model.capability, script: model.script!, config: { ...defaultConfig, apiFormat: "runninghub", apiKey: "mock-key" }, signal: controller.signal }), /任务成功但未返回输出/);
        assert.equal(queryCount, 1);
    }
});

test("真实查询边界保留不同格式失败原因，并解析 promptTips 中的节点校验错误", async (t) => {
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    const { runModelPlugin } = await import("../src/services/api/model-plugin.ts");
    const { defaultConfig } = await import("../src/stores/use-config-store.ts");
    const { useCanvasErrorLogStore } = await import("../src/stores/canvas/use-canvas-error-log-store.ts");
    const { default: axios } = await import("axios");
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = originalAdapter; useCanvasErrorLogStore.getState().clear(); });
    const model = createRunningHubWorkflowModel("2099999999999999999", parseRunningHubWorkflowBindings({ "7": { class_type: "OtherGenerator", inputs: { steps: 20 } } }));
    const failure = { node_id: "7", node_type: "OtherGenerator", exception_type: "ValueError", exception_message: "mock specific failure" };
    const cases = [
        { failedReason: failure },
        { data: { failedReason: JSON.stringify(failure) } },
        { failedReason: "mock specific failure" },
        { promptTips: JSON.stringify({ result: false, node_errors: { "7": { class_type: "OtherGenerator", errors: [{ type: "value_not_in_list", message: "mock specific failure", details: "mock allowed option" }] } } }) },
    ];
    for (const response of cases) {
        axios.defaults.adapter = async (config) => {
            assert.ok(config.url?.endsWith("/task") || config.url?.endsWith("/query"));
            return { data: config.url?.endsWith("/task") ? { taskId: "mock-failed-task" } : { status: "FAILED", errorCode: "805", errorMessage: "工作流运行失败", ...response }, status: 200, statusText: "OK", headers: {}, config };
        };
        await assert.rejects(runModelPlugin({ capability: model.capability, script: model.script!, config: { ...defaultConfig, apiFormat: "runninghub", apiKey: "mock-key" } }), (error: unknown) => {
            assert.match((error as Error).message, /mock specific failure/);
            useCanvasErrorLogStore.getState().clear();
            useCanvasErrorLogStore.getState().record(error, { projectId: "test", nodeId: "card" });
            const details = useCanvasErrorLogStore.getState().entries[0].diagnostics;
            assert.equal(details?.taskId, "mock-failed-task");
            assert.equal(details?.errorCode, "805");
            assert.match(details?.exceptionMessage || "", /mock specific failure/);
            if (typeof response.failedReason !== "string") assert.equal(details?.nodeId, "7");
            return true;
        });
    }
});

test("提交响应已经失败时立即报告节点原因，不再用任务 ID 继续查询", async (t) => {
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    const { runModelPlugin } = await import("../src/services/api/model-plugin.ts");
    const { defaultConfig } = await import("../src/stores/use-config-store.ts");
    const { default: axios } = await import("axios");
    const originalAdapter = axios.defaults.adapter;
    t.after(() => { axios.defaults.adapter = originalAdapter; });
    const model = createRunningHubWorkflowModel("2099999999999999999", parseRunningHubWorkflowBindings({ "7": { class_type: "OtherGenerator", inputs: { steps: 20 } } }));
    const calls: string[] = [];
    axios.defaults.adapter = async (config) => {
        calls.push(config.url || "");
        return { data: config.url?.endsWith("/task") ? { taskId: "mock-rejected-task", status: "FAILED", failedReason: { node_id: "7", exception_message: "mock rejected field" } } : { status: "SUCCESS", results: [{ url: "https://example.test/unrelated.png" }] }, status: 200, statusText: "OK", headers: {}, config };
    };
    await assert.rejects(runModelPlugin({ capability: model.capability, script: model.script!, config: { ...defaultConfig, apiFormat: "runninghub", apiKey: "mock-key" } }), /mock rejected field/);
    assert.deepEqual(calls, ["http://test/api/runninghub/task"]);
});
