import assert from "node:assert/strict";
import test from "node:test";

import { buildCodexImageToolRequest, normalizeCodexImageModel } from "./codex-image-request.js";

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
    );

    assert.equal(request.model, "gpt-5.4");
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
