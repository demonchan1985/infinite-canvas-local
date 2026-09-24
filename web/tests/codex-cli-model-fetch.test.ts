import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const modalSource = readFileSync(new URL("../src/components/layout/model-select-modal.tsx", import.meta.url), "utf8");
const modelFetchSource = modalSource.slice(modalSource.indexOf("const fetchModels = async () => {"), modalSource.indexOf("const confirm = () => {"));
const imageApiSource = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");
const channelFetchSource = imageApiSource.slice(imageApiSource.indexOf("export async function fetchChannelModels"), imageApiSource.indexOf("export type RunningHubCatalogModel"));
const channelEditorSource = readFileSync(new URL("../src/components/layout/channel-editor-drawer.tsx", import.meta.url), "utf8");
const viteSource = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("摘取模型直接查询 Codex CLI，不依赖旧 Canvas Agent 端口", async () => {
    const source = viteSource.slice(viteSource.indexOf("function directCodexImagegen"), viteSource.indexOf("function methodNotAllowed"));
    const compiled = ts.transpileModule(`${source}\nexports.directCodexImagegen = directCodexImagegen;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let modelRoute: ((req: unknown, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }) => Promise<void>) | undefined;
    const context = {
        exports: {} as { directCodexImagegen?: () => { configureServer: (server: unknown) => void } },
        webDir: "/unused",
        resolve: () => "/missing-canvas-agent.json",
        readFile: async () => { throw new Error("旧 Agent 未运行"); },
        listCodexModels: async () => ({ data: [{ model: "gpt-6-sol" }] }),
    };
    runInNewContext(compiled, context);
    context.exports.directCodexImagegen?.().configureServer({ middlewares: { use: (path: string, handler: typeof modelRoute) => {
        if (path === "/api/codex/models") modelRoute = handler;
    } } });
    assert.ok(modelRoute);
    const response = { statusCode: 200, setHeader: () => undefined, end: (body: string) => { payload = JSON.parse(body); } };
    let payload: { ok?: boolean; data?: Array<{ model: string }> } = {};
    await modelRoute({}, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(Array.from(payload.data || [], (item) => item.model), ["gpt-6-sol"]);
});

test("本机 Codex CLI 拉取模型不要求 API Key，也不走通用 /models 接口", () => {
    assert.match(modelFetchSource, /channel\.apiFormat !== "codex-cli" && \(!channel\.baseUrl\.trim\(\) \|\| !channel\.apiKey\.trim\(\)\)/);
    assert.match(channelFetchSource, /channel\.apiFormat === "codex-cli"/);
    assert.match(channelFetchSource, /fetch\("\/api\/codex\/models"\)/);
    assert.match(channelFetchSource, /CODEX_IMAGE_MODELS/);
});

test("Codex CLI 无 API Key 时从本机接口取得文本及生图模型", async () => {
    const requestedUrls: string[] = [];
    const context = {
        exports: {} as { fetchChannelModels?: (channel: { apiFormat: string; baseUrl: string; apiKey: string }) => Promise<string[]> },
        CODEX_IMAGE_MODELS: ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"],
        fetch: async (url: string) => {
            requestedUrls.push(url);
            return { ok: true, json: async () => ({ data: [{ model: "gpt-6-sol" }] }) };
        },
        fetchImageModels: () => {
            throw new Error("误走需要 API Key 的通用模型接口");
        },
    };
    const compiled = ts.transpileModule(channelFetchSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, context);

    const models = await context.exports.fetchChannelModels?.({ apiFormat: "codex-cli", baseUrl: "http://127.0.0.1:3102", apiKey: "" });
    assert.deepEqual(requestedUrls, ["/api/codex/models"]);
    assert.deepEqual(Array.from(models || []), ["gpt-6-sol", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]);
});

test("本机服务断开时不透传 Failed to fetch，而是提示如何恢复连接", async () => {
    const context = {
        exports: {} as { fetchChannelModels?: (channel: { apiFormat: string; baseUrl: string; apiKey: string }) => Promise<string[]> },
        fetch: async () => {
            throw new TypeError("Failed to fetch");
        },
    };
    const compiled = ts.transpileModule(channelFetchSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, context);

    await assert.rejects(context.exports.fetchChannelModels?.({ apiFormat: "codex-cli", baseUrl: "http://127.0.0.1:3102", apiKey: "" }), /启动独立画布/);
});

test("Codex CLI 不可用时展示实际错误，而不误指向旧 Agent", async () => {
    const context = {
        exports: {} as { fetchChannelModels?: (channel: { apiFormat: string; baseUrl: string; apiKey: string }) => Promise<string[]> },
        fetch: async () => ({ ok: false, status: 503, json: async () => ({ error: "fetch failed" }) }),
    };
    const compiled = ts.transpileModule(channelFetchSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, context);

    await assert.rejects(context.exports.fetchChannelModels?.({ apiFormat: "codex-cli", baseUrl: "http://127.0.0.1:3102", apiKey: "" }), /Codex CLI 连接失败：fetch failed/);
});

test("本机 Codex CLI 渠道提供独立的验证连接入口", () => {
    assert.ok(channelEditorSource.includes(">验证连接</Button>"));
    assert.ok(channelEditorSource.includes("await fetchChannelModels(draft)"));
});

test("验证连接只检查模型可读，拉取模型才写入渠道", async () => {
    const actionSource = channelEditorSource.slice(channelEditorSource.indexOf("const checkCodexCli = async"), channelEditorSource.indexOf("const setCapability ="));
    const compiled = ts.transpileModule(actionSource.replace("const checkCodexCli =", "exports.checkCodexCli ="), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const updates: Array<Array<{ name: string; capability: string }>> = [];
    const statuses: string[] = [];
    const context = {
        exports: {} as { checkCodexCli?: (loadModels: boolean) => Promise<void> },
        draft: { apiFormat: "codex-cli", baseUrl: "http://127.0.0.1:3102", apiKey: "" },
        CODEX_IMAGE_MODELS: ["gpt-image-2.5-sunburst"],
        fetchChannelModels: async () => ["gpt-6-sol", "gpt-image-2.5-sunburst"],
        setLoadingCodexModels: () => undefined,
        setCodexCliStatus: (status: string) => statuses.push(status),
        setCodexCliError: () => undefined,
        setModels: (models: Array<{ name: string; capability: string }>) => updates.push(JSON.parse(JSON.stringify(models))),
    };
    runInNewContext(compiled, context);

    await context.exports.checkCodexCli?.(false);
    assert.equal(updates.length, 0);
    assert.match(statuses.at(-1) || "", /连接正常/);

    await context.exports.checkCodexCli?.(true);
    assert.deepEqual(updates, [[{ name: "gpt-6-sol", capability: "text" }, { name: "gpt-image-2.5-sunburst", capability: "image" }]]);
});
