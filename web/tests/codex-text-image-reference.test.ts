import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const imageApiSource = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");
const nativeTextSource = imageApiSource.slice(imageApiSource.indexOf("async function requestNativeCodexText"), imageApiSource.indexOf("function geminiBaseUrl"));
const viteSource = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const imageDataUrl = "data:image/png;base64,aGVsbG8=";

test("反推提示词传给本机 Codex CLI 时保留已连接的图片", async () => {
    let requestBody: { prompt?: string; attachments?: Array<{ dataUrl?: string }> } = {};
    const context = {
        exports: {} as { requestNativeCodexText?: (model: string, messages: unknown[]) => Promise<string> },
        fetch: async (_url: string, init: { body: string }) => {
            requestBody = JSON.parse(init.body);
            return { ok: true, json: async () => ({ text: "一位女性的角色三视图" }) };
        },
    };
    const compiled = ts.transpileModule(`${nativeTextSource}\nexports.requestNativeCodexText = requestNativeCodexText;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, context);

    await context.exports.requestNativeCodexText?.("gpt-6-sol", [{ role: "user", content: [{ type: "text", text: "请反推参考图的提示词" }, { type: "image_url", image_url: { url: imageDataUrl } }] }]);
    assert.deepEqual(Array.from(requestBody.attachments || [], (item) => item.dataUrl), [imageDataUrl]);
});

test("本机文本接口把图片附件转交给 Codex 文本运行器", async () => {
    const source = viteSource.slice(viteSource.indexOf("function directCodexImagegen"), viteSource.indexOf("function methodNotAllowed"));
    const compiled = ts.transpileModule(`${source}\nexports.directCodexImagegen = directCodexImagegen;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let textRoute: ((req: { method: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }) => Promise<void>) | undefined;
    let receivedAttachments: Array<{ dataUrl?: string }> | undefined;
    const context = {
        exports: {} as { directCodexImagegen?: () => { configureServer: (server: unknown) => void } },
        readJsonBody: async () => ({ prompt: "请反推提示词", model: "gpt-6-sol", attachments: [{ dataUrl: imageDataUrl }] }),
        runDirectCodexText: async (_prompt: string, _model: string, attachments?: Array<{ dataUrl?: string }>) => {
            receivedAttachments = attachments;
            return "角色三视图";
        },
    };
    runInNewContext(compiled, context);
    context.exports.directCodexImagegen?.().configureServer({ middlewares: { use: (path: string, handler: typeof textRoute) => {
        if (path === "/api/codex/text") textRoute = handler;
    } } });
    assert.ok(textRoute);
    await textRoute({ method: "POST" }, { statusCode: 200, setHeader: () => undefined, end: () => undefined });
    assert.deepEqual(Array.from(receivedAttachments || [], (item) => item.dataUrl), [imageDataUrl]);
});

test("Codex 文本运行器把图片作为 -i 参考图交给 CLI", async () => {
    const source = viteSource.slice(viteSource.indexOf("async function runDirectCodexText"), viteSource.indexOf("async function writeReferenceImages"));
    const compiled = ts.transpileModule(`${source}\nexports.runDirectCodexText = runDirectCodexText;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let cliReferences: string[] = [];
    const context = {
        exports: {} as { runDirectCodexText?: (prompt: string, model: string, attachments: Array<{ dataUrl: string }>) => Promise<string> },
        mkdtemp: async () => "/tmp/codex-text-image-test",
        join: (...parts: string[]) => parts.join("/"),
        tmpdir: () => "/tmp",
        writeReferenceImages: async () => ["/tmp/codex-text-image-test/reference-1.png"],
        runCodexCli: async (_prompt: string, references: string[]) => {
            cliReferences = references;
            return { code: 0, stdout: "ok", stderr: "" };
        },
        codexFinalText: () => "角色三视图",
        rm: async () => undefined,
    };
    runInNewContext(compiled, context);
    await context.exports.runDirectCodexText?.("请反推提示词", "gpt-6-sol", [{ dataUrl: imageDataUrl }]);
    assert.deepEqual(Array.from(cliReferences), ["/tmp/codex-text-image-test/reference-1.png"]);
});

test("没有参考图的 Codex 文本请求不创建图片临时目录", async () => {
    const source = viteSource.slice(viteSource.indexOf("async function runDirectCodexText"), viteSource.indexOf("async function writeReferenceImages"));
    const compiled = ts.transpileModule(`${source}\nexports.runDirectCodexText = runDirectCodexText;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let cliReferences: string[] | undefined;
    const context = {
        exports: {} as { runDirectCodexText?: (prompt: string, model: string) => Promise<string> },
        mkdtemp: async () => { throw new Error("纯文本请求不应创建临时目录"); },
        runCodexCli: async (_prompt: string, references: string[]) => {
            cliReferences = references;
            return { code: 0, stdout: "ok", stderr: "" };
        },
        codexFinalText: () => "文本结果",
    };
    runInNewContext(compiled, context);
    assert.equal(await context.exports.runDirectCodexText?.("写一段文案", "gpt-6-sol"), "文本结果");
    assert.deepEqual(Array.from(cliReferences || []), []);
});

test("图片不可读取时明确报错，不静默降为纯文本", async () => {
    const source = viteSource.slice(viteSource.indexOf("async function runDirectCodexText"), viteSource.indexOf("async function writeReferenceImages"));
    const compiled = ts.transpileModule(`${source}\nexports.runDirectCodexText = runDirectCodexText;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let cliCalled = false;
    let temporaryDirRemoved = false;
    const context = {
        exports: {} as { runDirectCodexText?: (prompt: string, model: string, attachments: Array<{ dataUrl: string }>) => Promise<string> },
        mkdtemp: async () => "/tmp/codex-text-image-test",
        join: (...parts: string[]) => parts.join("/"),
        tmpdir: () => "/tmp",
        writeReferenceImages: async () => [],
        runCodexCli: async () => { cliCalled = true; return { code: 0, stdout: "ok", stderr: "" }; },
        rm: async () => { temporaryDirRemoved = true; },
    };
    runInNewContext(compiled, context);
    await assert.rejects(context.exports.runDirectCodexText?.("请反推提示词", "gpt-6-sol", [{ dataUrl: "broken-image" }]), /参考图片不可读取/);
    assert.equal(cliCalled, false);
    assert.equal(temporaryDirRemoved, true);
});
