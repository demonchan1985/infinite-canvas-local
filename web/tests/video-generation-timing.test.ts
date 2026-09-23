import assert from "node:assert/strict";
import { test } from "node:test";

import { generationDurationMs } from "../src/lib/video-generation-timing.ts";

test("生成用时从任务提交时开始计算，而非从结果下载时开始", () => {
    assert.equal(generationDurationMs(1_000, 97_000), 96_000);
    assert.equal(generationDurationMs(97_000, 1_000), 0);
});
