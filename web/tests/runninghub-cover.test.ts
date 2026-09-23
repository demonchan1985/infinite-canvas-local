import assert from "node:assert/strict";
import test from "node:test";

import { RUNNINGHUB_COVER_VERSION, runningHubCoverSourceFromHtml, runningHubCoverUrl } from "../src/lib/runninghub-cover.ts";

test("RunningHub AI 应用和云端工作流使用各自的本地封面缓存地址", () => {
    assert.equal(runningHubCoverUrl("app", "1975951975441412098"), `/api/runninghub/cover?kind=app&id=1975951975441412098&v=${RUNNINGHUB_COVER_VERSION}`);
    assert.equal(runningHubCoverUrl("workflow", "2092878871120142337"), `/api/runninghub/cover?kind=workflow&id=2092878871120142337&v=${RUNNINGHUB_COVER_VERSION}`);
});

test("无效资源不生成封面请求地址", () => {
    assert.equal(runningHubCoverUrl("standard", "/openapi/v2/image"), undefined);
    assert.equal(runningHubCoverUrl("workflow", "not-an-id"), undefined);
});

/** 复刻 __NUXT_DATA__ 的下标引用结构：封面对象里的字段同样只是下标。 */
const nuxtHtml = (() => {
    const data = [
        ["ShallowReactive", 1],
        { data: 2 },
        ["ShallowReactive", 3],
        { "workflow-details-2092878871120142337": 4 },
        { detail: 5 },
        { id: 6, name: 7, covers: 8, chineseCovers: 8, englishCovers: 8 },
        "2092878871120142337",
        "示例工作流",
        [9],
        { id: 10, objName: 11, url: 12, thumbnailUri: 13, imageWidth: 14, imageHeight: 15 },
        "2087585157585915905",
        "cover/obj.png",
        "https://rh-images.xiaoyaoyou.com/owner/real-cover.png",
        "https://rh-images.xiaoyaoyou.com/owner/real-cover.jpg?imageMogr2/format/jpeg/ignore-error/1",
        "1086",
        "1448",
    ];
    return `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(data)}</script><div class="cover-stage"><img src="https://rh-images.xiaoyaoyou.com/owner/sample-output.png"></div>`;
})();

test("工作流项目页按 __NUXT_DATA__ 解引用取真实封面，而不是页面上的示例图", () => {
    assert.equal(runningHubCoverSourceFromHtml(nuxtHtml), "https://rh-images.xiaoyaoyou.com/owner/real-cover.jpg?imageMogr2/format/jpeg/ignore-error/1");
});

test("没有 SSR 数据表时回退到页面封面区标记", () => {
    const html = '<div class="cover-stage"><img src="https://rh-images.xiaoyaoyou.com/owner/app-cover.png?quality=60"></div>';
    assert.equal(runningHubCoverSourceFromHtml(html), "https://rh-images.xiaoyaoyou.com/owner/app-cover.png?quality=60");
});

test("SSR 数据表损坏时不会抛错，直接回退", () => {
    const html = '<script type="application/json" id="__NUXT_DATA__">{ not json }</script><img src="data:image/png;base64,AAAA">';
    assert.equal(runningHubCoverSourceFromHtml(html), "");
});

test("html 实体与空白被规范化", () => {
    const html = '<div class="cover-stage"><img src="https://rh-images.xiaoyaoyou.com/a.png?x=1&amp;y=2"></div>';
    assert.equal(runningHubCoverSourceFromHtml(html), "https://rh-images.xiaoyaoyou.com/a.png?x=1&y=2");
});
