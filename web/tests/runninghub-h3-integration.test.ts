import assert from "node:assert/strict";
import { test } from "node:test";

import { createRunningHubWorkflowModel, parseRunningHubWorkflowBindings } from "../src/lib/runninghub-model.ts";

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
});

test("2086579374731649025 无完整 JSON 时仍使用已核验的整合节点兜底映射", () => {
    const model = createRunningHubWorkflowModel(
        "2086579374731649025",
        { promptBinding: undefined, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [], workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 } },
        "MiniMax - H3 智能一体化视频创作",
    );
    assert.equal(model.runningHub?.promptBinding?.fieldName, "prompt");
    assert.deepEqual(model.runningHub?.imageBindings?.map((binding) => binding.fieldName), ["first_frame", "last_frame", "ref_image_1", "ref_image_2", "ref_image_3", "ref_image_4", "ref_image_5", "ref_image_6", "ref_image_7", "ref_image_8", "ref_image_9"]);
    assert.equal(model.runningHub?.videoBindings?.length, 3);
    assert.equal(model.runningHub?.audioBindings?.length, 3);
    assert.deepEqual(model.runningHub?.workflowFields?.map((field) => field.key), ["130.aspect", "130.megapixels", "130.duration_seconds", "130.ref_image_size"]);
    assert.ok(model.script?.includes("ref_image_\\d+"));
    assert.ok(model.script?.includes("/^https?:\\/\\//i"));
    assert.doesNotThrow(() => new Function("prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "reasoningEffort", "http", "request", "poll", "sleep", "signal", "onDelta", `"use strict"; return (async () => {\n${model.script || ""}\n})();`));
});

test("整合工作流提交时同步更新 gh_state_json，避免使用 RH 默认图片和提示词", async () => {
    const model = createRunningHubWorkflowModel(
        "2086579374731649025",
        { promptBinding: undefined, imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [], workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 } },
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
