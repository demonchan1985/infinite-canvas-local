import assert from "node:assert/strict";
import { test } from "node:test";

import { createRunningHubStandardModel, createRunningHubWorkflowModel } from "../src/lib/runninghub-model.ts";
import { RUNNINGHUB_SITES, mergeRunningHubSiteDrafts, runningHubApiBaseUrl, runningHubSiteFromBaseUrl, switchRunningHubSiteDrafts, visibleChannelGroups } from "../src/lib/runninghub-site.ts";

test("RunningHub 国内与国际站使用各自的官网、LLM 和 Key 入口", () => {
    assert.equal(runningHubSiteFromBaseUrl(RUNNINGHUB_SITES.cn.baseUrl), "cn");
    assert.equal(runningHubSiteFromBaseUrl(RUNNINGHUB_SITES.ai.baseUrl), "ai");
    assert.equal(runningHubSiteFromBaseUrl(RUNNINGHUB_SITES.ai.llmBaseUrl), "ai");
    assert.match(RUNNINGHUB_SITES.cn.sharedKeyUrl, /^https:\/\/www\.runninghub\.cn\//);
    assert.match(RUNNINGHUB_SITES.ai.sharedKeyUrl, /^https:\/\/www\.runninghub\.ai\//);
    assert.match(RUNNINGHUB_SITES.cn.consumerKeyUrl, /type=consumer$/);
    assert.match(RUNNINGHUB_SITES.ai.consumerKeyUrl, /type=consumer$/);
});

test("本地代理仅接受 RunningHub 两个官方域名，不向其他地址发送 Key", () => {
    assert.equal(runningHubApiBaseUrl(undefined), RUNNINGHUB_SITES.cn.baseUrl);
    assert.equal(runningHubApiBaseUrl(`${RUNNINGHUB_SITES.ai.baseUrl}/`), RUNNINGHUB_SITES.ai.baseUrl);
    assert.throws(() => runningHubApiBaseUrl("https://www.runninghub.ai.evil.example"), /仅支持国内站/);
    assert.throws(() => runningHubApiBaseUrl("http://www.runninghub.ai"), /仅支持国内站/);
});

test("标准模型与工作流的上传、创建任务和查询均携带所选站点", () => {
    const standard = createRunningHubStandardModel("测试生图", "image", "/openapi/v2/example").script || "";
    const workflow = createRunningHubWorkflowModel("2092878871120142337", { imageBindings: [], videoBindings: [], audioBindings: [], workflowFields: [], workflowPreview: { imageSlots: 0, videoSlots: 0, audioSlots: 0 } }).script || "";
    for (const script of [standard, workflow]) {
        assert.match(script, /\/api\/runninghub\/upload[\s\S]*?data: \{ apiKey, baseUrl,/);
        assert.match(script, /\/api\/runninghub\/task[\s\S]*?baseUrl/);
        assert.match(script, /\/api\/runninghub\/query[\s\S]*?data: \{ apiKey, baseUrl,/);
    }
});

test("切换国内与国际站保留各自的 Key 和模型，保存后同时可用", () => {
    const cn = { id: "runninghub", name: "RunningHub", baseUrl: RUNNINGHUB_SITES.cn.baseUrl, apiFormat: "runninghub" as const, apiKey: "cn-shared", consumerApiKey: "cn-consumer", models: [{ name: "图片模型", capability: "image" as const }] };
    const first = switchRunningHubSiteDrafts([cn], cn, null, "ai");
    assert.equal(first.draft.baseUrl, RUNNINGHUB_SITES.ai.baseUrl);
    assert.equal(first.draft.apiKey, "");
    assert.deepEqual(first.otherDraft, cn);

    const ai = { ...first.draft, apiKey: "ai-shared", consumerApiKey: "ai-consumer", models: [{ name: "视频模型", capability: "video" as const }] };
    const back = switchRunningHubSiteDrafts([cn], ai, first.otherDraft, "cn");
    assert.deepEqual(back.draft, cn);
    assert.deepEqual(back.otherDraft, ai);

    const saved = mergeRunningHubSiteDrafts([cn], [back.draft, back.otherDraft]);
    assert.equal(saved.length, 2);
    assert.equal(saved.find((item) => item.id === "runninghub")?.apiKey, "cn-shared");
    assert.equal(saved.find((item) => item.id === "runninghub:ai")?.apiKey, "ai-shared");
    assert.deepEqual(saved.find((item) => item.id === "runninghub")?.models, cn.models);
    assert.deepEqual(saved.find((item) => item.id === "runninghub:ai")?.models, ai.models);
    assert.deepEqual(visibleChannelGroups(saved).map((item) => item.id), ["runninghub"]);
});
