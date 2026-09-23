import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const configSource = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");
const defaultConfigSource = configSource.slice(configSource.indexOf("export const defaultConfig"), configSource.indexOf("const defaultWebdavSyncConfig"));
const normalizeChannelsSource = configSource.slice(configSource.indexOf("function normalizeChannels"), configSource.indexOf("export function defaultBaseUrlForApiFormat"));

test("Codex 生图是可删除的可选渠道，刷新配置时不得重新创建", () => {
    assert.doesNotMatch(defaultConfigSource, /\bcodexImageChannel\(\)/);
    assert.doesNotMatch(normalizeChannelsSource, /channels\.push\(codexImageChannel\(\)\)/);
});
