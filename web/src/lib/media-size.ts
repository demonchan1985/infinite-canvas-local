export const imageResolutionOptions = ["auto", "1k", "2k", "4k"] as const;
export type ImageResolution = (typeof imageResolutionOptions)[number];

/** gpt-image-2/Codex 原生生图服务的公开尺寸边界。 */
export const GPT_IMAGE_2_MAX_EDGE = 3840;
export const GPT_IMAGE_2_MAX_PIXELS = 8_294_400;
export const GPT_IMAGE_2_MAX_RATIO = 3;

export const imageAspectRatios = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "21:9"] as const;
export type ImageAspectRatio = (typeof imageAspectRatios)[number];

export const imageSizePresets: Record<Exclude<ImageResolution, "auto">, Record<ImageAspectRatio, string>> = {
    "1k": { "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536", "4:3": "1024x768", "3:4": "768x1024", "4:5": "1024x1280", "5:4": "1280x1024", "16:9": "1536x864", "9:16": "864x1536", "21:9": "2016x864" },
    "2k": { "1:1": "2048x2048", "3:2": "2048x1360", "2:3": "1360x2048", "4:3": "2048x1536", "3:4": "1536x2048", "4:5": "1632x2048", "5:4": "2048x1632", "16:9": "2048x1152", "9:16": "1152x2048", "21:9": "2688x1152" },
    "4k": { "1:1": "2880x2880", "3:2": "3520x2336", "2:3": "2336x3520", "4:3": "3312x2480", "3:4": "2480x3312", "4:5": "2576x3216", "5:4": "3216x2576", "16:9": "3840x2160", "9:16": "2160x3840", "21:9": "3840x1648" },
};

export function normalizeImageResolution(value: string | undefined): ImageResolution {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    return imageResolutionOptions.includes(normalized as ImageResolution) ? (normalized as ImageResolution) : "auto";
}

export function imageSizeForResolution(resolution: string | undefined, ratio: string | undefined) {
    const normalizedResolution = normalizeImageResolution(resolution);
    if (normalizedResolution === "auto" || !imageAspectRatios.includes(ratio as ImageAspectRatio)) return undefined;
    return imageSizePresets[normalizedResolution][ratio as ImageAspectRatio];
}

export function inferImageResolution(size: string | undefined): ImageResolution {
    const normalizedSize = String(size || "")
        .trim()
        .toLowerCase();
    for (const resolution of ["1k", "2k", "4k"] as const) {
        if (Object.values(imageSizePresets[resolution]).includes(normalizedSize)) return resolution;
    }
    return "auto";
}

/**
 * 将已输入的像素尺寸等比收敛到 Codex 生图可接受的范围。
 * 无法解析或超出比例限制的输入保留给调用方的原有校验。
 */
export function fitGptImage2Size(size: string) {
    const match = size.trim().match(/^(\d+)x(\d+)$/i);
    if (!match) return undefined;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return undefined;
    if (Math.max(width, height) / Math.min(width, height) > GPT_IMAGE_2_MAX_RATIO) return undefined;

    // Codex 的尺寸必须是 16 的倍数；向下取整也确保不会再越过上限。
    const scale = Math.min(1, GPT_IMAGE_2_MAX_EDGE / Math.max(width, height), Math.sqrt(GPT_IMAGE_2_MAX_PIXELS / (width * height)));
    const nextWidth = Math.max(16, Math.floor((width * scale) / 16) * 16);
    const nextHeight = Math.max(16, Math.floor((height * scale) / 16) * 16);
    return `${nextWidth}x${nextHeight}`;
}
