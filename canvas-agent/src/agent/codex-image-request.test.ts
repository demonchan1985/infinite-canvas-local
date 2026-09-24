import assert from "node:assert/strict";
import test from "node:test";

import { buildCodexImageToolRequest, normalizeCodexImageModel, selectCodexImageOrchestrator } from "./codex-image-request.js";

test("Codex 图片模型只接受已支持的 GPT Image ID", () => {
    assert.equal(normalizeCodexImageModel("gpt-image-2.5-sunburst"), "gpt-image-2.5-sunburst");
    assert.equal(normalizeCodexImageModel("gpt-image-2.5-flare"), "gpt-image-2.5-flare");
    assert.equal(normalizeCodexImageModel("unknown-image-model"), "gpt-image-2");
});

test("Codex 图片请求将 2.5 选项传给 image_generation 工具", () => {
    const request = buildCodexImageToolRequest(
        "把参考图改成水彩插画",
        [{ name: "reference.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" }],
        { model: "gpt-image-2.5-sunburst", size: "1536x1024", quality: "max" },
        "gpt-6-sol",
    );

    assert.equal(request.model, "gpt-6-sol");
    assert.equal(request.store, false);
    assert.equal(request.stream, true);
    assert.deepEqual(request.tool_choice, { type: "image_generation" });
    assert.deepEqual(request.tools, [
        {
            type: "image_generation",
            model: "gpt-image-2.5-sunburst",
            action: "edit",
            size: "1536x1024",
            quality: "max",
            output_format: "png",
        },
    ]);
    assert.deepEqual(request.input, [
        {
            role: "user",
            content: [
                { type: "input_text", text: "把参考图改成水彩插画" },
                { type: "input_image", image_url: "data:image/png;base64,AAAA" },
            ],
        },
    ]);
});

test("Codex 图片编排模型取当前账号默认值，不固定旧模型", () => {
    assert.equal(selectCodexImageOrchestrator([
        { model: "gpt-5.4" },
        { model: "gpt-6-sol", isDefault: true },
    ]), "gpt-6-sol");
    assert.throws(() => selectCodexImageOrchestrator([]), /没有可用模型/);
});
