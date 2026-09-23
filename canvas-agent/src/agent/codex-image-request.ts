import type { AgentAttachment } from "./types.js";

export const CODEX_IMAGE_MODELS = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"] as const;
export type CodexImageModel = (typeof CODEX_IMAGE_MODELS)[number];

type CodexImageToolOptions = {
    model: CodexImageModel;
    size?: string;
    quality?: string;
};

type CodexImageInput = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

/** 用 Codex 订阅认证调用 Responses 图片工具；实际图片模型必须位于工具字段，而不是顶层编排模型字段。 */
export function buildCodexImageToolRequest(prompt: string, attachments: AgentAttachment[], options: CodexImageToolOptions) {
    const content: CodexImageInput[] = [{ type: "input_text", text: prompt }];
    for (const attachment of attachments) {
        if (attachment.dataUrl?.startsWith("data:image/")) content.push({ type: "input_image", image_url: attachment.dataUrl });
    }
    return {
        // 顶层模型只负责编排；实际图片模型见 tools[0].model。
        model: "gpt-5.4",
        input: [{ role: "user" as const, content }],
        tools: [
            {
                type: "image_generation" as const,
                model: options.model,
                action: content.length > 1 ? ("edit" as const) : ("generate" as const),
                ...(options.size ? { size: options.size } : {}),
                ...(options.quality ? { quality: options.quality } : {}),
                output_format: "png",
            },
        ],
        tool_choice: { type: "image_generation" as const },
    };
}

export function isCodexImage25Model(model: CodexImageModel) {
    return model === "gpt-image-2.5-sunburst" || model === "gpt-image-2.5-flare";
}

export function normalizeCodexImageModel(value: unknown): CodexImageModel {
    const model = String(value || "").trim().toLowerCase();
    return (CODEX_IMAGE_MODELS as readonly string[]).includes(model) ? (model as CodexImageModel) : "gpt-image-2";
}
