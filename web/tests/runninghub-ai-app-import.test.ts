import assert from "node:assert/strict";
import { test } from "node:test";

import { createRunningHubAiAppModel, defaultRunningHubAiAppFields, findSeedVrUpscaleModel, parseRunningHubAiApp, RUNNING_HUB_SEEDVR_APP_ID, RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY, runningHubAiAppId, seedVrUpscaleImageBindings, seedVrUpscalePixelField } from "../src/lib/runninghub-model.ts";

test("AI 应用链接仅接受 AI 应用详情/API 手册，拒绝工作流 API", () => {
    assert.equal(runningHubAiAppId("2099999999999999999"), "2099999999999999999");
    assert.equal(runningHubAiAppId("https://www.runninghub.cn/ai-detail/2099999999999999999"), "2099999999999999999");
    assert.equal(runningHubAiAppId("https://www.runninghub.cn/call-api/api-detail/2099999999999999999?apiType=4"), "2099999999999999999");
    assert.equal(runningHubAiAppId("https://www.runninghub.cn/call-api/api-detail/2099999999999999999?apiType=5"), "");
    assert.equal(runningHubAiAppId("https://example.com/ai-detail/2099999999999999999"), "");
});

test("AI 应用按公开 nodeInfoList 创建编号素材槽、提示词与真实参数", () => {
    const app = parseRunningHubAiApp(
        {
            data: {
                appName: "多参考视频应用",
                categoryName: "视频生成",
                nodeInfoList: [
                    { nodeId: "10", fieldName: "prompt", label: "提示词", fieldType: "STRING", fieldValue: "" },
                    { nodeId: "11", fieldName: "first_image", label: "图片 1", fieldData: JSON.stringify(["IMAGEUPLOAD", { image_upload: true }]) },
                    { nodeId: "12", fieldName: "reference_video", label: "视频 1", fieldData: JSON.stringify(["VIDEOUPLOAD", { video_upload: true }]) },
                    { nodeId: "13", fieldName: "music", label: "音频 1", fieldData: JSON.stringify(["AUDIOUPLOAD", { audio_upload: true }]) },
                    { nodeId: "14", fieldName: "ratio", label: "画面比例", fieldType: "SWITCH", fieldValue: "1", fieldData: [{ index: 1, description: "横版" }, { index: 2, description: "竖版" }] },
                    { nodeId: "15", fieldName: "duration", label: "时长", fieldType: "INT", fieldValue: 5, min: 2, max: 15, step: 1 },
                    { nodeId: "16", fieldName: "enhance", label: "提示词增强", fieldType: "BOOLEAN", fieldValue: false },
                ],
            },
        },
        "2099999999999999999",
    );

    assert.equal(app.name, "多参考视频应用");
    assert.equal(app.capability, "video");
    assert.deepEqual(app.bindings.promptBinding, { nodeId: "10", fieldName: "prompt" });
    assert.deepEqual(app.bindings.imageBindings, [{ nodeId: "11", fieldName: "first_image" }]);
    assert.deepEqual(app.bindings.videoBindings, [{ nodeId: "12", fieldName: "reference_video" }]);
    assert.deepEqual(app.bindings.audioBindings, [{ nodeId: "13", fieldName: "music" }]);
    assert.deepEqual(app.bindings.workflowFields.map((field) => ({ key: field.key, type: field.type, defaultValue: field.defaultValue })), [
        { key: "14.ratio", type: "select", defaultValue: 1 },
        { key: "15.duration", type: "number", defaultValue: 5 },
        { key: "16.enhance", type: "boolean", defaultValue: false },
    ]);
    assert.deepEqual(app.bindings.workflowFields[1] && { min: app.bindings.workflowFields[1].min, max: app.bindings.workflowFields[1].max, step: app.bindings.workflowFields[1].step }, { min: 2, max: 15, step: 1 });

    const model = createRunningHubAiAppModel(app);
    assert.equal(model.runningHub?.kind, "app");
    assert.equal(model.runningHub?.target, "2099999999999999999");
    assert.match(model.script || "", /kind: resource.kind/);
    assert.match(model.script || "", /nodeInfoList/);
    assert.match(model.script || "", /instanceType/);
    assert.match(model.script || "", /resource\.kind === "app" \? field\.defaultValue/);
});

test("AI 应用枚举参数保留公开字段的显示名称，并继续提交原始数值", () => {
    const app = parseRunningHubAiApp(
        {
            data: {
                appName: "SeedVR2.5",
                nodeInfoList: [
                    { nodeId: "82", fieldName: "index", label: "像素选择", fieldType: "SWITCH", fieldValue: "2", fieldData: JSON.stringify([
                        { name: "value6", index: 6, description: "8k像素" },
                        { name: "value2", index: 2, description: "2k像素" },
                    ]) },
                ],
            },
        },
        "2051722999090434050",
    );

    const field = app.bindings.workflowFields[0];
    assert.deepEqual(field?.options, [6, 2]);
    assert.deepEqual(field?.optionLabels, { "6": "8k像素", "2": "2k像素" });
    assert.equal(field?.defaultValue, 2);
});

test("已保存的 SeedVR2.5 卡片会补齐公开像素标签", () => {
    const field = defaultRunningHubAiAppFields(RUNNING_HUB_SEEDVR_APP_ID)[0];
    assert.deepEqual(field?.options, [6, 5, 2, 1, 4, 3]);
    assert.equal(field?.key, RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY);
    assert.equal(field?.optionLabels?.["2"], "2k像素");
    assert.equal(field?.optionLabels?.["3"], "3k像素");
});

test("高清放大设置优先显示已导入 AI 应用的真实像素选项", () => {
    const field = seedVrUpscalePixelField({
        kind: "app",
        target: RUNNING_HUB_SEEDVR_APP_ID,
        workflowFields: [{
            nodeId: "82",
            fieldName: "index",
            key: RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY,
            label: "像素选择",
            type: "select",
            defaultValue: 3,
            options: [3, 2],
            optionLabels: { "3": "3k像素", "2": "2k像素" },
        }],
    });

    assert.deepEqual(field?.options, [3, 2]);
    assert.equal(field?.defaultValue, 3);
    assert.equal(field?.optionLabels?.["3"], "3k像素");
});

test("图片节点高清放大只复用已导入 SeedVR2.5 的真实图片端口", () => {
    const channels = [
        {
            id: "runninghub",
            name: "RunningHub",
            baseUrl: "https://www.runninghub.cn",
            apiKey: "",
            consumerApiKey: "consumer-key",
            apiFormat: "runninghub" as const,
            models: [
                {
                    name: "SeedVR2.5图片快速高清放大",
                    capability: "image" as const,
                    runningHub: {
                        kind: "app" as const,
                        target: RUNNING_HUB_SEEDVR_APP_ID,
                        imageBindings: [{ nodeId: "82", fieldName: "image" }],
                    },
                },
            ],
        },
    ];

    const found = findSeedVrUpscaleModel(channels);
    assert.equal(found?.channel.id, "runninghub");
    assert.equal(found?.model.name, "SeedVR2.5图片快速高清放大");
    assert.deepEqual(seedVrUpscaleImageBindings(found?.model.runningHub), [{ nodeId: "82", fieldName: "image" }]);
    assert.deepEqual(seedVrUpscaleImageBindings({ kind: "app", target: "other", imageBindings: [{ nodeId: "1", fieldName: "image" }] }), []);
});
