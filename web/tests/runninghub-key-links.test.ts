import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/layout/channel-editor-drawer.tsx", import.meta.url), "utf8");

test("RunningHub 获取 Key 入口只指向当前选中的站点", () => {
    assert.match(source, /const runningHubSite = runningHubSiteFromBaseUrl\(draft\.baseUrl\)/);
    assert.match(source, /RUNNINGHUB_SITES\[runningHubSite\]\.sharedKeyUrl/);
    assert.match(source, /RUNNINGHUB_SITES\[runningHubSite\]\.consumerKeyUrl/);
    assert.doesNotMatch(source, /RUNNINGHUB_SITES\.(?:cn|ai)\.(?:sharedKeyUrl|consumerKeyUrl)/);
});
