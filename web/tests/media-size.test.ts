import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fitGptImage2Size } from "../src/lib/media-size.ts";

test("Codex 图片请求超过服务上限时按原比例收敛到可用尺寸", () => {
    assert.equal(fitGptImage2Size("4096x2304"), "3840x2160");
    assert.equal(fitGptImage2Size("4096x4096"), "2880x2880");
    assert.equal(fitGptImage2Size("2048x1152"), "2048x1152");
    assert.equal(fitGptImage2Size("3841x2160"), "3840x2144");
});

test("RH 应用和工作流不继承画布的通用生图尺寸校验", () => {
    const source = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");
    assert.match(source, /if \(isRunningHubWorkflowOrApp\(config, model\)\) return undefined;/);
    assert.match(source, /fitGptImage2Size\(config\.size\) \|\| config\.size/);
});
