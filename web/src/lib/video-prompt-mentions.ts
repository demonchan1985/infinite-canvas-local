type PromptMentionAsset = { id: string; name: string; previewUrl?: string };

export type PromptMention = {
    id: string;
    token: string;
    label: string;
    detail: string;
    h3Reference: string;
    thumbnailUrl?: string;
};

export type PromptMentionTrigger = { start: number; end: number; query: string };

export function createPromptMentions({ isReferenceMode, images, videos, audios, hasFirstFrame = false, hasLastFrame = false }: { isReferenceMode: boolean; images: PromptMentionAsset[]; videos: PromptMentionAsset[]; audios: PromptMentionAsset[]; hasFirstFrame?: boolean; hasLastFrame?: boolean }): PromptMention[] {
    if (!isReferenceMode) {
        return [
            ...(hasFirstFrame ? [{ id: "first-frame", token: "@首帧", label: "首帧", detail: "引用上传的首帧图片", h3Reference: "<Picture 1>" }] : []),
            ...(hasLastFrame ? [{ id: "last-frame", token: "@尾帧", label: "尾帧", detail: "引用上传的尾帧图片", h3Reference: hasFirstFrame ? "<Picture 2>" : "<Picture 1>" }] : []),
        ];
    }
    const create = (items: PromptMentionAsset[], prefix: "图片" | "视频" | "音频", h3Prefix: "Picture" | "Video" | "Audio") => items.map((item, index) => ({
        id: item.id,
        token: `@${prefix}${index + 1}`,
        label: `${prefix} ${index + 1}`,
        detail: item.name,
        h3Reference: `<${h3Prefix} ${index + 1}>`,
        thumbnailUrl: h3Prefix === "Picture" ? item.previewUrl : undefined,
    }));
    return [...create(images, "图片", "Picture"), ...create(videos, "视频", "Video"), ...create(audios, "音频", "Audio")];
}

export function replacePromptMentions(prompt: string, mentions: PromptMention[]) {
    return [...mentions]
        .sort((left, right) => right.token.length - left.token.length)
        .reduce((value, mention) => value.split(mention.token).join(mention.h3Reference), prompt);
}

export function getPromptMentionTrigger(prompt: string, caret: number): PromptMentionTrigger | null {
    const beforeCaret = prompt.slice(0, caret);
    const start = beforeCaret.lastIndexOf("@");
    const query = start < 0 ? "" : beforeCaret.slice(start + 1);
    return start < 0 || !/^[\p{L}\p{N}]*$/u.test(query) ? null : { start, end: caret, query };
}
