import assert from "node:assert/strict";
import { test } from "node:test";

import { createRunningHubWorkflowModel, parseRunningHubWorkflowBindings, runningHubWorkflowId } from "../src/lib/runninghub-model.ts";

test("MiniMax H3 IntegrationGH 工作流映射首尾帧、参考素材和输出参数", () => {
    const input = (name: string, widget = true) => ({ name, ...(widget ? { widget: { name } } : {}) });
    const names = ["main_mode", "clip_name", "video_vae_name", "audio_vae_name", "aspect", "megapixels", "duration_seconds", "prompt", "task_type", "audio_mode", "audio_denoise_strength", "drive_audio_ordinal", "strict_prompt_tags", "ref_image_size", "first_frame", "last_frame", "hybrid_audio", "ref_image_1", "ref_image_2", "ref_video_1", "ref_audio_1"];
    const workflow = {
        nodes: [{ id: 130, type: "MiniMaxH3IntegrationGH", inputs: names.map((name) => input(name)), widgets_values: ["auto", "clip", "video", "audio", "adaptive", 1, 7, "prompt", "auto", "lock_source", 0, 0, true, "match"] }],
        links: [],
    };
    const bindings = parseRunningHubWorkflowBindings(workflow);
    assert.deepEqual(bindings.promptBinding, { nodeId: "130", fieldName: "prompt" });
    assert.deepEqual(bindings.imageBindings.map((binding) => binding.fieldName), ["first_frame", "last_frame", "ref_image_1", "ref_image_2"]);
    assert.deepEqual(bindings.videoBindings.map((binding) => binding.fieldName), ["ref_video_1"]);
    assert.deepEqual(bindings.audioBindings.map((binding) => binding.fieldName), ["ref_audio_1"]);
    assert.equal(bindings.workflowFields.find((field) => field.key === "130.aspect")?.defaultValue, "adaptive");
    assert.equal(bindings.workflowFields.find((field) => field.key === "130.duration_seconds")?.defaultValue, 7);
    assert.equal(bindings.workflowNodes?.find((node) => node.id === "130")?.inputs.includes("main_mode"), true);
});

test("H3 API 格式中可覆盖的 #130 标量输入也显示为画布参数", () => {
    const payload = { data: { prompt: JSON.stringify({
        "130": { class_type: "MiniMaxH3IntegrationGH", inputs: {
            main_mode: "text_keyframes", aspect: "adaptive", megapixels: 1, duration_seconds: 7,
            task_type: "auto", audio_mode: "lock_source", strict_prompt_tags: true,
            ref_image_size: "match", prompt: "示例提示词", first_frame: "sample.png",
            ref_image_1: "reference.png", ref_video_1: "reference.mp4", ref_audio_1: "reference.wav", gh_state_json: "{}",
        } },
    }) } };
    const bindings = parseRunningHubWorkflowBindings(payload);
    assert.deepEqual(bindings.workflowFields.map((field) => field.key), [
        "130.main_mode", "130.aspect", "130.megapixels", "130.duration_seconds",
        "130.task_type", "130.audio_mode", "130.strict_prompt_tags", "130.ref_image_size",
    ]);
    assert.equal(bindings.workflowFields.find((field) => field.key === "130.strict_prompt_tags")?.type, "boolean");
    assert.deepEqual(bindings.promptBinding, { nodeId: "130", fieldName: "prompt" });
    assert.deepEqual(bindings.imageBindings.map((field) => field.fieldName), ["first_frame", "ref_image_1"]);
    assert.deepEqual(bindings.videoBindings.map((field) => field.fieldName), ["ref_video_1"]);
    assert.deepEqual(bindings.audioBindings.map((field) => field.fieldName), ["ref_audio_1"]);
    assert.equal(bindings.apiFieldKeys?.includes("130.gh_state_json"), true);
});

test("分享页 ID 原样交给 API 验证，不猜成另一个工作流 ID", () => {
    assert.equal(runningHubWorkflowId("https://www.runninghub.cn/post/2086579374731649025"), "2086579374731649025");
    assert.equal(runningHubWorkflowId("https://www.runninghub.cn/workflow/2103209695132602370"), "2103209695132602370");
    assert.equal(runningHubWorkflowId("https://www.runninghub.ai/call-api/api-detail/1904136902449209346?apiType=5"), "1904136902449209346");
    assert.equal(runningHubWorkflowId("https://www.runninghub.cn/call-api/api-detail/1904136902449209346"), "1904136902449209346");
    assert.equal(runningHubWorkflowId("https://www.runninghub.cn/call-api/api-detail/1904136902449209346?apiType=4"), "");
    assert.equal(runningHubWorkflowId("https://example.com/workflow/2103209695132602370"), "");
});

test("缺少 API 图时不为某个工作流猜测端口或参数", () => {
    const model = createRunningHubWorkflowModel(
        "2103209695132602370",
        { promptBinding: undefined, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [], workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 } },
        "MiniMax - H3 智能一体化视频创作",
    );
    assert.equal(model.runningHub?.promptBinding, undefined);
    assert.deepEqual(model.runningHub?.imageBindings, []);
    assert.deepEqual(model.runningHub?.videoBindings, []);
    assert.deepEqual(model.runningHub?.audioBindings, []);
    assert.deepEqual(model.runningHub?.workflowFields, []);
    assert.match(model.script || "", /刷新映射/);
    assert.ok(model.script?.includes("/^https?:\\/\\//i"));
    assert.doesNotThrow(() => new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`));
});

test("整合工作流提交时同步更新 gh_state_json，避免使用 RH 默认图片和提示词", async () => {
    const model = createRunningHubWorkflowModel(
        "2103209695132602370",
        { promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [{ nodeId: "130", fieldName: "first_frame" }], videoBindings: [], audioBindings: [], workflowFields: [{ nodeId: "130", fieldName: "duration_seconds", key: "130.duration_seconds", label: "视频时长（秒）", type: "number", defaultValue: 7 }], apiFieldKeys: ["130.prompt", "130.first_frame", "130.main_mode", "130.gh_state_json", "130.duration_seconds"], workflowNodes: [{ id: "130", classType: "MiniMaxH3IntegrationGH", title: "H3", inputs: ["prompt", "first_frame", "main_mode", "gh_state_json", "duration_seconds"], links: [] }], workflowPreview: { imageSlots: 1, videoSlots: 0, audioSlots: 0 } },
        "MiniMax - H3 智能一体化视频创作",
    );
    const calls: Array<{ url: string; data?: Record<string, unknown> }> = [];
    const request = async (config: { url: string; data?: Record<string, unknown> }) => {
        calls.push(config);
        if (config.url.endsWith("/upload")) return { fileName: "uploaded-first-frame.png" };
        if (config.url.endsWith("/task")) return { taskId: "task-1" };
        return { status: "SUCCESS", results: [{ url: "https://example.test/video.mp4" }] };
    };
    const poll = async <T, R>(_request: () => Promise<T>, extract: (value: T) => R | null) => extract({ status: "SUCCESS", results: [{ url: "https://example.test/video.mp4" }] } as T) as R;
    const runner = new Function(
        "prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta",
        `"use strict"; return (async () => {\n${model.script || ""}\n})();`,
    ) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    await runner(
        "A new mountain-road video prompt",
        ["data:image/png;base64,AA=="],
        [],
        { videoMode: "frames", videoFrameSlots: { first: true, last: false }, workflowValues: { "130.duration_seconds": 5 }, runningHubWorkflowRunOptions: { instanceType: "plus" } },
        "model",
        "http://test",
        "key",
        "",
        "auto",
        {},
        request,
        poll,
        async () => undefined,
        undefined,
        () => undefined,
    );
    const task = calls.find((call) => call.url.endsWith("/task"))?.data as { instanceType: string; nodeInfoList: Array<{ fieldName: string; fieldValue: unknown }> };
    assert.ok(task);
    assert.equal(task.instanceType, "plus");
    assert.equal(task.nodeInfoList.find((item) => item.fieldName === "first_frame")?.fieldValue, "uploaded-first-frame.png");
    const stateValue = task.nodeInfoList.find((item) => item.fieldName === "gh_state_json")?.fieldValue;
    assert.equal(typeof stateValue, "string");
    const state = JSON.parse(stateValue as string) as { mode: string; prompt: string; media: Array<[string, { name: string }]> };
    assert.equal(state.mode, "text_keyframes");
    assert.equal(state.prompt, "A new mountain-road video prompt");
    assert.deepEqual(state.media, [["first_frame", { name: "uploaded-first-frame.png", kind: "image" }]]);
    assert.equal(task.nodeInfoList.find((item) => item.fieldName === "duration_seconds")?.fieldValue, 5);
});

test("画布已连接的 H3 图片槽位按原绑定提交，不要求额外首尾帧标记", async () => {
    const model = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [{ nodeId: "130", fieldName: "first_frame" }, { nodeId: "130", fieldName: "ref_image_1" }], videoBindings: [], audioBindings: [], workflowFields: [],
        apiFieldKeys: ["130.prompt", "130.first_frame", "130.ref_image_1", "130.main_mode", "130.gh_state_json"],
        workflowNodes: [{ id: "130", classType: "MiniMaxH3IntegrationGH", title: "H3", inputs: ["prompt", "first_frame", "ref_image_1", "main_mode", "gh_state_json"], links: [] }],
        workflowPreview: { imageSlots: 2, videoSlots: 0, audioSlots: 0 },
    });
    const runner = new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    let body: { target?: string; nodeInfoList?: Array<{ fieldName: string; fieldValue: unknown }> } | undefined;
    const request = async (config: { url: string; data?: typeof body }) => {
        if (config.url.endsWith("/upload")) return { fileName: "uploaded.png" };
        if (config.url.endsWith("/task")) { body = config.data; return { taskId: "task-1" }; }
        return { status: "SUCCESS", results: [{ url: "https://example.test/video.mp4" }] };
    };
    const poll = async () => ["https://example.test/video.mp4"];
    await runner("prompt", ["data:image/png;base64,AA=="], [], { runningHubWorkflowBindings: { image: [{ nodeId: "130", fieldName: "first_frame" }], video: [], audio: [] } }, "model", "http://test", "key", "", "auto", {}, request, poll, async () => undefined, undefined, () => undefined);
    assert.equal(body?.target, "2103209695132602370");
    assert.equal(body?.nodeInfoList?.find((item) => item.fieldName === "first_frame")?.fieldValue, "uploaded.png");
    assert.equal(body?.nodeInfoList?.find((item) => item.fieldName === "ref_image_1"), undefined);
});

test("#130 旧卡片未验证 API 字段时先提示刷新，不发起收费请求", async () => {
    const model = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [],
        workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 },
    });
    const runner = new Function(
        "prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta",
        `"use strict"; return (async () => {\n${model.script || ""}\n})();`,
    ) as (...args: unknown[]) => Promise<unknown>;
    let requests = 0;
    const request = async () => { requests += 1; return { taskId: "unexpected" }; };
    await assert.rejects(runner("prompt", [], [], {}, "model", "http://test", "key", "", "auto", {}, request, async () => undefined, async () => undefined, undefined, () => undefined), /刷新映射/);
    assert.equal(requests, 0);
});

test("API 未公开 gh_state_json 时不会盲目提交该内部状态字段", async () => {
    const model = createRunningHubWorkflowModel("2103209695132602370", parseRunningHubWorkflowBindings({ data: { prompt: JSON.stringify({
        "130": { class_type: "MiniMaxH3IntegrationGH", inputs: { prompt: "demo", first_frame: "image.png", aspect: "adaptive" } },
    }) } }));
    const runner = new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    let fields: Array<{ fieldName: string }> = [];
    const request = async (config: { url: string; data?: { nodeInfoList?: Array<{ fieldName: string }> } }) => {
        if (config.url.endsWith("/upload")) return { fileName: "uploaded.png" };
        if (config.url.endsWith("/task")) { fields = config.data?.nodeInfoList || []; return { taskId: "task-1" }; }
        return { status: "SUCCESS", results: [{ url: "https://example.test/video.mp4" }] };
    };
    await runner("prompt", ["data:image/png;base64,AA=="], [], { runningHubWorkflowBindings: { image: [{ nodeId: "130", fieldName: "first_frame" }], video: [], audio: [] } }, "model", "http://test", "key", "", "auto", {}, request, async () => ["https://example.test/video.mp4"], async () => undefined, undefined, () => undefined);
    assert.deepEqual(fields.map((field) => field.fieldName), ["prompt", "first_frame"]);
});

test("RH 提交失败时保留请求阶段、HTTP 状态和 RH 错误原因", async () => {
    const model = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [],
        apiFieldKeys: ["130.prompt"],
        workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 },
    });
    const runner = new Function(
        "prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta",
        `"use strict"; return (async () => {\n${model.script || ""}\n})();`,
    ) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    const request = async () => { throw { response: { status: 400, data: { code: 4403, msg: "节点字段无效" } }, message: "Request failed with status code 400" }; };
    await assert.rejects(
        runner("prompt", [], [], {}, "model", "http://test", "secret-key", "", "auto", {}, request, async () => undefined, async () => undefined, undefined, () => undefined),
        /RunningHub 提交任务.*HTTP 400.*节点字段无效/,
    );
});

test("RH 已接受任务但远端运行失败时显示 RH 返回原因", async () => {
    const model = createRunningHubWorkflowModel("2103209695132602370", {
        promptBinding: { nodeId: "130", fieldName: "prompt" }, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [],
        apiFieldKeys: ["130.prompt"], workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 },
    });
    const runner = new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`) as (...args: unknown[]) => Promise<unknown>;
    Object.defineProperty(globalThis, "location", { value: { origin: "http://test" }, configurable: true });
    await assert.rejects(runner("prompt", [], [], {}, "model", "http://test", "key", "", "auto", {}, async () => ({ taskId: "task-1" }), async (_request: unknown, extract: (state: unknown) => unknown) => extract({ status: "FAILED", data: { msg: "插件池超时" } }), async () => undefined, undefined, () => undefined), /RunningHub 工作流运行失败.*插件池超时/);
});
