import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveVideoMode } from "../src/lib/video-mode.ts";

test("视频模式保留用户选择，三张以上图片强制使用多参考语义", () => {
    assert.equal(resolveVideoMode("frames", 0), "frames");
    assert.equal(resolveVideoMode("frames", 2), "frames");
    assert.equal(resolveVideoMode("reference", 1), "reference");
    assert.equal(resolveVideoMode("frames", 3), "reference");
});
