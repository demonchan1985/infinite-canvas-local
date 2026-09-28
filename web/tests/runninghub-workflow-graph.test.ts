import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createRunningHubWorkflowModel, mergeRunningHubWorkflowBindings, parseRunningHubWorkflowBindings, parseRunningHubWorkflowNodes, refreshRunningHubWorkflowModel } from "../src/lib/runninghub-model.ts";

test("API 响应含编辑器工作流副本时，仅 data.prompt 决定可提交字段", () => {
    const bindings = parseRunningHubWorkflowBindings({ data: {
        prompt: JSON.stringify({ "7": { class_type: "TextNode", inputs: { prompt: "hello" } } }),
        workflow: JSON.stringify({ "8": { class_type: "InternalNode", inputs: { secret_setting: 42 } } }),
    } });
    assert.deepEqual(bindings.apiFieldKeys, ["7.prompt"]);
    assert.equal(bindings.workflowFields.some((field) => field.key === "8.secret_setting"), false);
});

test("任意 API 格式工作流导入全部未连线的可编辑标量字段，而不依赖 H3 节点名", () => {
    const payload = { data: { prompt: JSON.stringify({
        "12": { class_type: "CLIPTextEncode", _meta: { title: "正向提示词" }, inputs: { text: "A landscape", clip: ["2", 1] } },
        "13": { class_type: "LoadImage", _meta: { title: "参考图片" }, inputs: { image: "reference.png", upload: "image" } },
        "24": { class_type: "KSampler", _meta: { title: "采样" }, inputs: { steps: 24, cfg: 7.5, seed: 123, denoise: 0.8, model: ["2", 0], positive: ["12", 0], latent_image: ["31", 0] } },
        "40": { class_type: "SaveImage", inputs: { images: ["24", 0], filename_prefix: "output" } },
    }) } };
    const bindings = parseRunningHubWorkflowBindings(payload);
    assert.deepEqual(bindings.promptBinding, { nodeId: "12", fieldName: "text" });
    assert.deepEqual(bindings.imageBindings, [{ nodeId: "13", fieldName: "image" }]);
    assert.deepEqual(bindings.workflowFields.map((field) => field.key), ["13.upload", "24.steps", "24.cfg", "24.seed", "24.denoise", "40.filename_prefix"]);
    assert.deepEqual(bindings.workflowFields.find((field) => field.key === "24.steps")?.defaultValue, 24);
    assert.equal(bindings.workflowFields.some((field) => field.key === "24.model"), false);
});

test("非 H3 自定义节点的直属图片、视频、音频槽位也按 API 字段创建端口", () => {
    const bindings = parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "7": { class_type: "MultiModalVideoGenerator", inputs: { prompt: "demo", first_frame: "start.png", last_frame: null, reference_video: "clip.mp4", drive_audio: "voice.wav", duration: 8, model: ["4", 0] } },
    }) } });
    assert.deepEqual(bindings.imageBindings.map((item) => item.fieldName), ["first_frame", "last_frame"]);
    assert.deepEqual(bindings.videoBindings.map((item) => item.fieldName), ["reference_video"]);
    assert.deepEqual(bindings.audioBindings.map((item) => item.fieldName), ["drive_audio"]);
    assert.deepEqual(bindings.workflowFields.map((item) => item.key), ["7.duration"]);
});

test("素材链路不能把中间节点的连线输入误当作可上传槽位", () => {
    const bindings = parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "10": { class_type: "LoadImage", inputs: { image: "source.png" } },
        "11": { class_type: "ImageCrop", inputs: { image: ["10", 0] } },
        "12": { class_type: "ReferenceGenerator", inputs: { reference_image: ["11", 0] } },
    }) } });
    assert.deepEqual(bindings.imageBindings, [{ nodeId: "10", fieldName: "image" }]);
    assert.equal(bindings.apiFieldKeys?.includes("11.image"), false);
});

test("完整编辑器 JSON 只补充诊断节点，不得把不在 API 格式里的字段或素材槽加到提交映射", () => {
    const api = parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "1": { class_type: "CLIPTextEncode", inputs: { text: "demo" } },
        "2": { class_type: "KSampler", inputs: { steps: 20, model: ["9", 0] } },
    }) } });
    const raw = parseRunningHubWorkflowBindings({ nodes: [
        { id: 1, type: "CLIPTextEncode", inputs: [{ name: "text", widget: { name: "text" } }, { name: "private_switch", widget: { name: "private_switch" } }], widgets_values: ["demo", true] },
        { id: 2, type: "KSampler", inputs: [{ name: "steps", widget: { name: "steps" } }], widgets_values: [20] },
        { id: 3, type: "LoadImage", inputs: [{ name: "image", widget: { name: "image" } }], widgets_values: ["unused.png"] },
    ], links: [] });
    const merged = mergeRunningHubWorkflowBindings(api, raw);
    assert.deepEqual(merged.workflowNodes?.map((node) => node.id), ["1", "2", "3"]);
    assert.deepEqual(merged.workflowFields.map((item) => item.key), ["2.steps"]);
    assert.deepEqual(merged.imageBindings, []);
});

test("任意旧工作流缺少 API 字段快照时，运行前阻止收费提交并提示刷新映射", async () => {
    const model = createRunningHubWorkflowModel("1904136902449209346", {
        promptBinding: { nodeId: "6", fieldName: "text" }, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [],
        workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 },
    });
    const runner = new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`) as (...args: unknown[]) => Promise<unknown>;
    let submitted = false;
    await assert.rejects(runner("demo", [], [], {}, "model", "http://test", "key", "", "auto", {}, async () => { submitted = true; }, async () => undefined, async () => undefined, undefined, () => undefined), /刷新映射/);
    assert.equal(submitted, false);
});

test("非 H3 工作流只提交用户覆盖的真实节点字段，链接输入和默认值不混进 nodeInfoList", async () => {
    const model = createRunningHubWorkflowModel("1904136902449209346", parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "6": { class_type: "CLIPTextEncode", inputs: { text: "old", clip: ["4", 1] } },
        "3": { class_type: "KSampler", inputs: { steps: 20, cfg: 8, model: ["4", 0] } },
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
    }) } }));
    const runner = new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    let body: { target?: string; nodeInfoList?: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }> } | undefined;
    const request = async (config: { url: string; data?: typeof body }) => {
        if (config.url.endsWith("/task")) { body = config.data; return { taskId: "task-1" }; }
        return { status: "SUCCESS", results: [{ url: "https://example.test/image.png" }] };
    };
    await runner("new prompt", [], [], { workflowValues: { "3.steps": 28 } }, "model", "http://test", "key", "", "auto", {}, request, async () => ["https://example.test/image.png"], async () => undefined, undefined, () => undefined);
    assert.equal(body?.target, "1904136902449209346");
    assert.deepEqual(body?.nodeInfoList, [
        { nodeId: "6", fieldName: "text", fieldValue: "new prompt" },
        { nodeId: "3", fieldName: "steps", fieldValue: 28 },
    ]);
});

test("导入工作流的输出类型由 API 图输出节点决定，而不是一律当作视频", () => {
    const image = createRunningHubWorkflowModel("1904136902449209346", parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "6": { class_type: "CLIPTextEncode", inputs: { text: "panda" } },
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "ComfyUI" } },
    }) } }));
    const audio = createRunningHubWorkflowModel("1904136902449209347", parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "4": { class_type: "SaveAudio", inputs: { audio: ["3", 0] } },
    }) } }));
    assert.equal(image.capability, "image");
    assert.equal(audio.capability, "audio");
});

test("完整编辑器 JSON 的额外节点不改写 API 图判定的输出类型，刷新映射同步纠正旧类型", () => {
    const apiPayload = { data: { prompt: JSON.stringify({
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
    }) } };
    const api = parseRunningHubWorkflowBindings(apiPayload);
    const raw = parseRunningHubWorkflowBindings({ nodes: [{ id: 22, type: "SaveVideo", inputs: [] }], links: [] });
    const model = createRunningHubWorkflowModel("1904136902449209346", mergeRunningHubWorkflowBindings(api, raw));
    assert.equal(model.capability, "image");
    assert.equal(refreshRunningHubWorkflowModel({ ...model, capability: "video" }, apiPayload).capability, "image");
});

test("自定义输出节点无法识别时，刷新映射保留用户手动选择的输出类型", () => {
    const payload = { data: { prompt: JSON.stringify({ "5": { class_type: "CustomFinalNode", inputs: { source: ["4", 0] } } }) } };
    const model = createRunningHubWorkflowModel("1904136902449209346", parseRunningHubWorkflowBindings(payload));
    assert.equal(model.capability, "video");
    assert.equal(refreshRunningHubWorkflowModel({ ...model, capability: "image" }, payload).capability, "image");
});

test("工作流 API 图包含多个节点时，导入模型保留完整节点清单而不只留下 #130", () => {
    const apiPayload = { data: { prompt: JSON.stringify({
        "130": { class_type: "MiniMaxH3IntegrationGH", _meta: { title: "H3 创作" }, inputs: { aspect: "adaptive", duration_seconds: 7 } },
        "142": { class_type: "KSampler", _meta: { title: "采样" }, inputs: { steps: 25, seed: 13, model: ["130", 0] } },
    }) } };
    const model = createRunningHubWorkflowModel("2103209695132602370", parseRunningHubWorkflowBindings(apiPayload));

    assert.deepEqual(model.runningHub?.workflowNodes?.map((node) => node.id), ["130", "142"]);
    assert.equal(model.runningHub?.workflowNodes?.find((node) => node.id === "142")?.title, "采样");
    assert.equal(model.runningHub?.workflowNodes?.find((node) => node.id === "142")?.inputs.includes("steps"), true);
    assert.deepEqual(model.runningHub?.workflowNodes?.find((node) => node.id === "142")?.links, [{ input: "model", fromNodeId: "130" }]);
    assert.deepEqual(model.runningHub?.workflowFields?.map((field) => field.key), ["130.aspect", "130.duration_seconds", "142.steps", "142.seed"]);
    assert.equal(JSON.stringify(model.runningHub?.workflowNodes).includes("adaptive"), false);
    assert.equal(model.script?.includes("workflowNodes"), false);
});

test("完整 ComfyUI JSON 保留非 API 覆盖节点及连线", () => {
    const api = parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({ "130": { class_type: "MiniMaxH3IntegrationGH", inputs: { aspect: "adaptive" } } }) } });
    const raw = parseRunningHubWorkflowBindings({ nodes: [
        { id: 130, type: "MiniMaxH3IntegrationGH", inputs: [{ name: "prompt", link: 7 }, { name: "aspect", widget: { name: "aspect" } }], widgets_values: ["adaptive"] },
        { id: 12, type: "CLIPTextEncode", title: "提示词", inputs: [{ name: "text" }] },
        { id: 20, type: "SaveVideo", title: "输出视频", inputs: [{ name: "video", link: 8 }] },
    ], links: [[7, 12, 0, 130, 0], [8, 130, 0, 20, 0]] });
    const merged = mergeRunningHubWorkflowBindings(api, raw);
    assert.deepEqual(merged.workflowNodes?.map((node) => node.id), ["130", "12", "20"]);
    assert.deepEqual(merged.workflowNodes?.find((node) => node.id === "20")?.links, [{ input: "video", fromNodeId: "130" }]);
    assert.deepEqual(parseRunningHubWorkflowNodes({ message: "ok" }), []);
});

test("旧卡片刷新映射后补齐 API 字段且保留原有参数与节点", () => {
    const oldModel = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [{ nodeId: "130", fieldName: "first_frame" }],
        videoBindings: [], audioBindings: [], workflowFields: [{ nodeId: "130", fieldName: "aspect", key: "130.aspect", label: "画面比例", type: "text", defaultValue: "adaptive" }],
        workflowPreview: { imageSlots: 1, videoSlots: 0, audioSlots: 0 },
    }, "MiniMax - H3 智能一体化视频创作");
    const apiPayload = { data: { prompt: JSON.stringify({
        "130": { class_type: "MiniMaxH3IntegrationGH", inputs: { prompt: "old prompt", first_frame: "image.png", aspect: "adaptive", audio_mode: "lock_source", gh_state_json: "{}" } },
        "142": { class_type: "SaveVideo", inputs: { video: ["130", 0] } },
    }) } };
    const refreshed = refreshRunningHubWorkflowModel(oldModel, apiPayload);
    assert.deepEqual(refreshed.runningHub?.workflowFields?.map((field) => field.key), ["130.aspect", "130.audio_mode"]);
    assert.deepEqual(refreshed.runningHub?.workflowNodes?.map((node) => node.id), ["130", "142"]);
    assert.equal(refreshed.runningHub?.imageBindings?.[0]?.fieldName, "first_frame");
    assert.match(refreshed.script || "", /integratedH3NodeId = "130"/);
});

test("旧分享页卡片可用任意真实工作流 ID 重新读取 API 图并纠正运行目标", () => {
    const old = createRunningHubWorkflowModel("2086579374731649025", {
        imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [], workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 },
    });
    const payload = { data: { prompt: JSON.stringify({ "8": { class_type: "SaveImage", inputs: { images: ["7", 0] } } }) } };
    const refreshed = refreshRunningHubWorkflowModel(old, payload, "2103209695132602370");
    assert.equal(refreshed.runningHub?.target, "2103209695132602370");
    assert.equal(refreshed.capability, "image");
    assert.match(refreshed.script || "", /"target":"2103209695132602370"/);
});

test("H3 刷新后只保留 API 可覆盖参数，不把编辑器内部控件当作提交字段", () => {
    const oldModel = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [], videoBindings: [], audioBindings: [],
        workflowFields: [{ nodeId: "130", fieldName: "frontend_only", key: "130.frontend_only", label: "界面状态", type: "text", defaultValue: "x" }],
        workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 },
    });
    const refreshed = refreshRunningHubWorkflowModel(oldModel, { data: { prompt: JSON.stringify({
        "130": { class_type: "MiniMaxH3IntegrationGH", inputs: { prompt: "demo", aspect: "adaptive" } },
    }) } });
    assert.deepEqual(refreshed.runningHub?.workflowFields?.map((field) => field.key), ["130.aspect"]);
});

test("诊断视图与提交参数分开，旧卡片可以重新读取完整图", () => {
    const popover = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-settings-popover.tsx", import.meta.url), "utf8");
    const importer = readFileSync(new URL("../src/components/layout/runninghub-workflow-import-modal.tsx", import.meta.url), "utf8");
    const store = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");
    assert.match(popover, /label: "节点诊断"/);
    assert.match(popover, /fetchRunningHubWorkflowInfo\(\{ baseUrl, consumerApiKey \}, target\)/);
    assert.match(popover, /refreshRunningHubWorkflowModel/);
    assert.match(popover, /刷新映射/);
    assert.match(popover, /读取本地完整 JSON/);
    assert.match(popover, /可覆盖字段涉及的节点/);
    assert.match(store, /workflowNodes: Array\.isArray\(resource\.workflowNodes\)/);
    assert.match(importer, /if \(!apiBindings\.workflowNodes\?\.length\) throw new Error/);
});
