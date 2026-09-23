import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const configSource = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");
const channelEditorSource = readFileSync(new URL("../src/components/layout/channel-editor-drawer.tsx", import.meta.url), "utf8");
const imageApiSource = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/image-settings-panel.tsx", import.meta.url), "utf8");
const viteSource = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("GPT Image 2.5 默认走 Sunburst，并保留 Flare 与 GPT Image 2 作为可选项", () => {
    assert.match(configSource, /gpt-image-2\.5-sunburst/);
    assert.match(configSource, /gpt-image-2\.5-flare/);
    assert.match(configSource, /imageModel:\s*"default::gpt-image-2\.5-sunburst"/);
    assert.match(configSource, /CODEX_IMAGE_MODELS = \[DEFAULT_OPENAI_IMAGE_MODEL, GPT_IMAGE_25_MODELS\[1\], CODEX_IMAGE_MODEL\]/);
});

test("仅 GPT Image 2.5 暴露 xhigh 与 max，并将其传递到图片 API", () => {
    assert.match(settingsSource, /value:\s*"xhigh"/);
    assert.match(settingsSource, /value:\s*"max"/);
    assert.match(imageApiSource, /isGptImage25Model/);
    assert.match(imageApiSource, /normalizeQuality\(config\.quality, requestConfig\.model\)/);
});

test("本机 Codex 渠道拉取并转发 GPT Image 2.5 的实际图片模型", () => {
    assert.match(configSource, /export const CODEX_IMAGE_MODELS = \[DEFAULT_OPENAI_IMAGE_MODEL, GPT_IMAGE_25_MODELS\[1\], CODEX_IMAGE_MODEL\] as const/);
    assert.match(configSource, /normalizeApiFormat\(channel\.apiFormat\) === "codex-cli"/);
    assert.match(channelEditorSource, /CODEX_IMAGE_MODELS\.map\(\(name\) => \(\{ name, capability: "image" as const \}\)\)/);
    assert.match(imageApiSource, /requestNativeCodexImages\([^\n]+\{ model: requestConfig\.model, size: requestSize, quality \}/);
    assert.match(viteSource, /const CODEX_IMAGE_25_MODELS = new Set\(\["gpt-image-2\.5-sunburst", "gpt-image-2\.5-flare"\]\)/);
    assert.match(viteSource, /forwardCodexImagegenToAgent\(body, res\)/);
});
