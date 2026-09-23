export type VideoMode = "frames" | "reference";

export function normalizeVideoMode(value: string | undefined): VideoMode {
    return value === "reference" ? "reference" : "frames";
}

/** 三张及以上图片不能表达为单一首尾帧，改按多参考素材提交。 */
export function resolveVideoMode(value: string | undefined, imageCount: number): VideoMode {
    return imageCount > 2 ? "reference" : normalizeVideoMode(value);
}
