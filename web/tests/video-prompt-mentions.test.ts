import assert from "node:assert/strict";
import { test } from "node:test";

import { createPromptMentions, getPromptMentionTrigger, replacePromptMentions } from "../src/lib/video-prompt-mentions.ts";

test("中文手写提示词中的 @ 会打开素材引用菜单", () => {
    assert.deepEqual(getPromptMentionTrigger("让@图", 3), { start: 1, end: 3, query: "图" });
    assert.equal(getPromptMentionTrigger("让@图 完成动作", 4), null);
});

test("全能参考素材以 @ 图片、视频和音频插入，并在提交时转为 H3 引用标签", () => {
    const mentions = createPromptMentions({
        isReferenceMode: true,
        images: [{ id: "image-1", name: "model.png", previewUrl: "data:image/png;base64,test" }],
        videos: [{ id: "video-1", name: "motion.mp4" }],
        audios: [{ id: "audio-1", name: "music.mp3" }],
    });
    assert.deepEqual(mentions.map((item) => item.token), ["@图片1", "@视频1", "@音频1"]);
    assert.equal(mentions[0]?.thumbnailUrl, "data:image/png;base64,test");
    assert.equal(replacePromptMentions("让@图片1跟随@视频1的镜头节奏，采用@音频1的鼓点。", mentions), "让<Picture 1>跟随<Video 1>的镜头节奏，采用<Audio 1>的鼓点。");
});

test("首尾帧模式提供首帧与尾帧引用", () => {
    const mentions = createPromptMentions({
        isReferenceMode: false,
        images: [],
        videos: [],
        audios: [],
        hasFirstFrame: true,
        hasLastFrame: true,
    });
    assert.deepEqual(mentions.map((item) => item.token), ["@首帧", "@尾帧"]);
    assert.equal(replacePromptMentions("从@首帧平滑过渡至@尾帧。", mentions), "从<Picture 1>平滑过渡至<Picture 2>。");
});
