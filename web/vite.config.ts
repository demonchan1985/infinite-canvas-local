import { readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

import { parseChangelog } from "./src/lib/release";
import { runningHubCoverSourceFromHtml, type RunningHubCoverKind } from "./src/lib/runninghub-cover";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

type CodexImageAttachment = { name?: string; type?: string; dataUrl?: string };
type CodexImageRequest = { model?: string; prompt?: string; attachments?: CodexImageAttachment[]; size?: string; quality?: string };
type CodexTextRequest = { prompt?: string; model?: string };
type RunningHubModelsRequest = { apiKey?: string };
type RunningHubAccountStatusRequest = { apiKey?: string };
type RunningHubTaskRequest = {
    apiKey?: string;
    kind?: "standard" | "app" | "workflow";
    target?: string;
    body?: Record<string, unknown>;
    nodeInfoList?: unknown[];
    addMetadata?: boolean;
    instanceType?: "default" | "plus" | "ultra";
    usePersonalQueue?: boolean | "true" | "false";
    retainSeconds?: number;
    webhookUrl?: string;
};
type RunningHubQueryRequest = { apiKey?: string; taskId?: string; keyType?: "enterprise" | "consumer" };
type RunningHubInfoRequest = { apiKey?: string; id?: string };
type RunningHubTitleRequest = { id?: string };
type RunningHubUploadRequest = { apiKey?: string; dataUrl?: string; fileName?: string };
type RunningHubCatalogRequest = { apiKey?: string };
type RunningHubCatalogItem = { name: string; capability: "image" | "video" | "audio"; target: string };
const CODEX_IMAGE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_IMAGEGEN_BODY_BYTES = 32 * 1024 * 1024;
const CODEX_IMAGE_25_MODELS = new Set(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]);

function decodeHtmlEntities(value: string) {
    return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** 本地开发/预览服务直接执行 Codex CLI，不依赖 Canvas Agent。 */
function directCodexImagegen(): Plugin {
    const install = (server: Pick<ViteDevServer, "middlewares">) => {
        server.middlewares.use("/api/codex/models", async (_req, res) => {
            try {
                const runtimePath = resolve(webDir, "../canvas-agent/.runtime/canvas-agent.json");
                const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as { url?: string; token?: string };
                const endpoint = String(runtime.url || "http://127.0.0.1:17376").replace(/\/$/, "");
                const response = await fetch(`${endpoint}/agent/codex/models?token=${encodeURIComponent(String(runtime.token || ""))}`);
                const payload = await response.json().catch(() => ({}));
                res.statusCode = response.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(payload));
            } catch (error) {
                res.statusCode = 503;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "本机 Codex CLI 服务不可用" }));
            }
        });
        server.middlewares.use("/api/runninghub/models", async (req, res) => {
            if (req.method !== "POST") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
            }
            try {
                const body = (await readJsonBody(req)) as RunningHubModelsRequest;
                const apiKey = String(body.apiKey || "").trim();
                if (!apiKey) throw new Error("请填写 RunningHub 企业级-共享 API Key");
                const response = await fetch("https://llm.runninghub.cn/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
                const payload = await response.text();
                res.statusCode = response.status;
                res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
                res.end(payload);
            } catch (error) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "RunningHub 模型读取失败" }));
            }
        });
        server.middlewares.use("/api/runninghub/catalog", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubCatalogRequest;
                runningHubApiKey(body.apiKey);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ data: await runningHubModelCatalog() }));
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/account-status", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubAccountStatusRequest;
                const apiKey = String(body.apiKey || "").trim();
                if (!apiKey) throw new Error("请先绑定 RunningHub API Key");
                const response = await fetch("https://www.runninghub.cn/uc/openapi/accountStatus", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ apikey: apiKey }),
                });
                await forwardRunningHubResponse(response, res);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/cover", async (req, res) => {
            if (req.method !== "GET") return methodNotAllowed(res);
            try {
                const request = new URL(req.url || "", "http://127.0.0.1");
                const kind = request.searchParams.get("kind");
                const id = request.searchParams.get("id");
                if (kind !== "app" && kind !== "workflow") throw new Error("RunningHub 封面类型无效");
                const target = runningHubNumericId(id, kind === "app" ? "AI 应用 ID" : "工作流 ID");
                const cached = await readRunningHubCover(kind, target);
                const cover = cached || (await downloadRunningHubCover(kind, target));
                if (!cover) {
                    res.statusCode = 404;
                    // 避免浏览器把「暂时取不到封面」的 404 长期缓存住，修复后无需清缓存。
                    res.setHeader("Cache-Control", "no-store");
                    res.end("RunningHub 未提供可下载的项目封面");
                    return;
                }
                if (!cached) await writeRunningHubCover(kind, target, cover);
                // 封面可能因为解析规则修正而变化，所以用 ETag 每次校验，避免浏览器长期缓存旧图。
                const etag = `"${createHash("sha1").update(cover.data).digest("hex").slice(0, 16)}"`;
                res.setHeader("ETag", etag);
                res.setHeader("Cache-Control", "private, no-cache");
                if (req.headers["if-none-match"] === etag) {
                    res.statusCode = 304;
                    res.end();
                    return;
                }
                res.statusCode = 200;
                res.setHeader("Content-Type", cover.contentType);
                res.end(cover.data);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/task", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubTaskRequest;
                const kind = body.kind;
                const apiKey = runningHubApiKey(body.apiKey, kind === "app" || kind === "workflow" ? "consumer" : "enterprise");
                const target = String(body.target || "").trim();
                if (!kind || !target) throw new Error("请提供 RunningHub 资源类型和资源 ID");
                const url = runningHubTaskUrl(kind, target);
                const payload =
                    kind === "standard"
                        ? body.body || {}
                        : kind === "app"
                          ? runningHubAiAppTaskPayload(body)
                          : runningHubWorkflowTaskPayload(body);
                const response = await fetch(url, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                await forwardRunningHubResponse(response, res);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/query", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubQueryRequest;
                const apiKey = runningHubApiKey(body.apiKey, body.keyType === "consumer" ? "consumer" : "enterprise");
                const taskId = String(body.taskId || "").trim();
                if (!taskId) throw new Error("缺少 RunningHub taskId");
                const response = await fetch("https://www.runninghub.cn/openapi/v2/query", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ taskId }),
                });
                await forwardRunningHubResponse(response, res);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/app-info", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubInfoRequest;
                const apiKey = runningHubApiKey(body.apiKey, "consumer");
                const webappId = runningHubNumericId(body.id, "AI 应用 ID");
                const response = await fetch(`https://www.runninghub.cn/api/webapp/apiCallDemo?apiKey=${encodeURIComponent(apiKey)}&webappId=${encodeURIComponent(webappId)}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                await forwardRunningHubResponse(response, res);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/workflow-info", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubInfoRequest;
                const apiKey = runningHubApiKey(body.apiKey, "consumer");
                const workflowId = runningHubNumericId(body.id, "工作流 ID");
                const response = await fetch("https://www.runninghub.cn/api/openapi/getJsonApiFormat", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ apiKey, workflowId }),
                });
                await forwardRunningHubResponse(response, res);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/workflow-title", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubTitleRequest;
                const workflowId = runningHubNumericId(body.id, "工作流 ID");
                const response = await fetch(`https://www.runninghub.cn/post/${encodeURIComponent(workflowId)}`, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } });
                if (!response.ok) throw new Error("无法读取 RunningHub 工作流标题");
                const html = await response.text();
                const rawTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
                const title = decodeHtmlEntities(rawTitle).replace(/\s+-\s+RunningHub(?: ComfyUI)? Workflow\s*$/i, "").trim();
                if (!title) throw new Error("RunningHub 未返回工作流标题");
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ title }));
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/runninghub/upload", async (req, res) => {
            if (req.method !== "POST") return methodNotAllowed(res);
            try {
                const body = (await readJsonBody(req)) as RunningHubUploadRequest;
                const apiKey = runningHubApiKey(body.apiKey);
                const dataUrl = String(body.dataUrl || "");
                const matched = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (!matched) throw new Error("仅支持上传画布中的媒体数据");
                const formData = new FormData();
                formData.append("file", new Blob([Buffer.from(matched[2], "base64")], { type: matched[1] }), safeRunningHubFileName(body.fileName));
                const response = await fetch("https://www.runninghub.cn/openapi/v2/media/upload/binary", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });
                await forwardRunningHubResponse(response, res);
            } catch (error) {
                runningHubError(res, error);
            }
        });
        server.middlewares.use("/api/codex/imagegen", async (req, res) => {
            if (req.method !== "POST") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
            }
            try {
                const body = (await readJsonBody(req)) as CodexImageRequest;
                const prompt = String(body.prompt || "").trim();
                if (!prompt) throw new Error("请输入图片描述");
                if (CODEX_IMAGE_25_MODELS.has(String(body.model || "").trim().toLowerCase())) {
                    await forwardCodexImagegenToAgent(body, res);
                    return;
                }
                const dataUrl = await runDirectCodexImagegen(prompt, body.attachments || [], body.size, body.quality);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, images: [{ dataUrl }] }));
            } catch (error) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Codex 生图失败" }));
            }
        });
        server.middlewares.use("/api/codex/text", async (req, res) => {
            if (req.method !== "POST") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
            }
            try {
                const body = (await readJsonBody(req)) as CodexTextRequest;
                const prompt = String(body.prompt || "").trim();
                if (!prompt) throw new Error("请输入文本描述");
                const text = await runDirectCodexText(prompt, String(body.model || "").trim());
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, text }));
            } catch (error) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Codex CLI 文本生成失败" }));
            }
        });
    };
    return { name: "direct-codex-imagegen", configureServer: install, configurePreviewServer: install };
}

function methodNotAllowed(res: { statusCode: number; end: (body?: string) => void }) {
    res.statusCode = 405;
    res.end("Method Not Allowed");
}

/** GPT Image 2.5 需携带实际图片工具模型，由 Canvas Agent 通过本机 Codex 登录态提交。 */
async function forwardCodexImagegenToAgent(body: CodexImageRequest, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }) {
    const runtimePath = resolve(webDir, "../canvas-agent/.runtime/canvas-agent.json");
    const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as { url?: string; token?: string };
    const endpoint = String(runtime.url || "http://127.0.0.1:17376").replace(/\/$/, "");
    const response = await fetch(`${endpoint}/agent/codex/imagegen?token=${encodeURIComponent(String(runtime.token || ""))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    res.statusCode = response.status;
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
    res.end(await response.text());
}

function runningHubApiKey(value: unknown, keyType: "enterprise" | "consumer" = "enterprise") {
    const apiKey = String(value || "").trim();
    if (!apiKey) throw new Error(`请填写 RunningHub ${keyType === "consumer" ? "消费级 API Key" : "企业级-共享 API Key"}`);
    return apiKey;
}

function runningHubNumericId(value: unknown, label: string) {
    const id = String(value || "").trim();
    if (!/^\d+$/.test(id)) throw new Error(`${label} 必须是数字 ID`);
    return id;
}

function runningHubTaskUrl(kind: "standard" | "app" | "workflow", target: string) {
    if (kind === "app") return `https://www.runninghub.cn/openapi/v2/run/ai-app/${runningHubNumericId(target, "AI 应用 ID")}`;
    if (kind === "workflow") return `https://www.runninghub.cn/openapi/v2/run/workflow/${runningHubNumericId(target, "工作流 ID")}`;
    if (!/^\/openapi\/v2\/[a-z0-9./-]+$/i.test(target)) throw new Error("标准模型接口路径无效");
    return `https://www.runninghub.cn${target}`;
}

/** 仅构造 RunningHub API 手册公开列出的任务层字段。 */
function runningHubTaskOptions(body: RunningHubTaskRequest) {
    const instanceType = body.instanceType === "plus" || body.instanceType === "ultra" ? body.instanceType : "default";
    const retainSeconds = Number(body.retainSeconds);
    const webhookUrl = String(body.webhookUrl || "").trim();
    return {
        instanceType,
        usePersonalQueue: body.usePersonalQueue === true || body.usePersonalQueue === "true",
        ...(Number.isInteger(retainSeconds) && retainSeconds >= 10 && retainSeconds <= 180 ? { retainSeconds } : {}),
        ...(webhookUrl && /^https:\/\//i.test(webhookUrl) ? { webhookUrl } : {}),
    };
}

function runningHubAiAppTaskPayload(body: RunningHubTaskRequest) {
    return { nodeInfoList: Array.isArray(body.nodeInfoList) ? body.nodeInfoList : [], ...runningHubTaskOptions(body) };
}

function runningHubWorkflowTaskPayload(body: RunningHubTaskRequest) {
    return { addMetadata: body.addMetadata !== false, nodeInfoList: Array.isArray(body.nodeInfoList) ? body.nodeInfoList : [], ...runningHubTaskOptions(body) };
}

function safeRunningHubFileName(value: unknown) {
    const name = String(value || "reference.png").replace(/[^a-zA-Z0-9._-]/g, "_");
    return name || "reference.png";
}

const RUNNINGHUB_COVER_DIRECTORY = resolve(webDir, "../canvas-agent/.runtime/runninghub-covers");
const RUNNINGHUB_COVER_MAX_BYTES = 8 * 1024 * 1024;

type RunningHubCover = { data: Buffer; contentType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

function runningHubCoverFileName(kind: RunningHubCoverKind, id: string, extension: RunningHubCover["extension"]) {
    return `${kind}-${id}.${extension}`;
}

/** 内容类型不可靠时按扩展名兜底：RunningHub 部分封面以 application/octet-stream 返回。 */
function runningHubCoverFormat(contentType: string, source?: string | URL): Pick<RunningHubCover, "contentType" | "extension"> | undefined {
    const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
    if (normalized === "image/jpeg" || normalized === "image/jpg") return { contentType: "image/jpeg", extension: "jpg" };
    if (normalized === "image/png") return { contentType: "image/png", extension: "png" };
    if (normalized === "image/webp") return { contentType: "image/webp", extension: "webp" };
    const pathname = (() => {
        try {
            return (source instanceof URL ? source : new URL(String(source || ""))).pathname.toLowerCase();
        } catch {
            return String(source || "").toLowerCase();
        }
    })();
    if (pathname.endsWith(".png")) return { contentType: "image/png", extension: "png" };
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return { contentType: "image/jpeg", extension: "jpg" };
    if (pathname.endsWith(".webp")) return { contentType: "image/webp", extension: "webp" };
    return undefined;
}

async function readRunningHubCover(kind: RunningHubCoverKind, id: string): Promise<RunningHubCover | undefined> {
    for (const format of [
        { contentType: "image/jpeg" as const, extension: "jpg" as const },
        { contentType: "image/png" as const, extension: "png" as const },
        { contentType: "image/webp" as const, extension: "webp" as const },
    ]) {
        try {
            const data = await readFile(join(RUNNINGHUB_COVER_DIRECTORY, runningHubCoverFileName(kind, id, format.extension)));
            if (data.length && data.length <= RUNNINGHUB_COVER_MAX_BYTES) return { data, ...format };
        } catch {
            // 缓存尚未写入时继续尝试下载。
        }
    }
    return undefined;
}

async function writeRunningHubCover(kind: RunningHubCoverKind, id: string, cover: RunningHubCover) {
    await mkdir(RUNNINGHUB_COVER_DIRECTORY, { recursive: true });
    await writeFile(join(RUNNINGHUB_COVER_DIRECTORY, runningHubCoverFileName(kind, id, cover.extension)), cover.data);
}

function runningHubCoverImageUrl(value: string) {
    try {
        const url = new URL(value, "https://www.runninghub.cn");
        const trustedImageHost = url.hostname === "rh-images.xiaoyaoyou.com" || url.hostname.endsWith(".myqcloud.com");
        return url.protocol === "https:" && trustedImageHost ? url : undefined;
    } catch {
        return undefined;
    }
}

/** AI 应用封面优先走公开详情接口；不少应用详情页只是 SPA 外壳，HTML 里抓不到封面。 */
async function runningHubAppCoverSource(id: string) {
    const response = await fetch("https://www.runninghub.cn/api/webapp/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ webappId: id }),
    });
    if (!response.ok) return undefined;
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024) return undefined;
    const payload = (await response.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const data = payload?.data;
    for (const key of ["chineseCovers", "covers", "englishCovers"]) {
        const list = data?.[key];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const entry = typeof item === "string" ? undefined : (item as Record<string, unknown> | null);
            // thumbnailUri 是压缩后的 jpeg，比原始大图更适合卡片，优先使用。
            const candidate = (typeof item === "string" ? item : undefined) || entry?.thumbnailUri || entry?.url;
            if (typeof candidate === "string" && candidate) return candidate;
        }
    }
    return undefined;
}

/** 服务端渲染的详情页兜底：工作流以项目页（/post）为准，API 手册页作为后备。 */
async function runningHubCoverSourceFromPage(kind: RunningHubCoverKind, id: string) {
    const pageUrls = kind === "app" ? [`https://www.runninghub.cn/ai-detail/${id}`] : [`https://www.runninghub.cn/post/${id}`, `https://www.runninghub.cn/call-api/api-detail/${id}?apiType=5`];
    for (const pageUrl of pageUrls) {
        const page = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!page.ok) continue;
        const contentLength = Number(page.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024) continue;
        const source = runningHubCoverSourceFromHtml(await page.text());
        if (source) return source;
    }
    return undefined;
}

async function downloadRunningHubCover(kind: RunningHubCoverKind, id: string): Promise<RunningHubCover | undefined> {
    const source = runningHubCoverImageUrl(((kind === "app" ? await runningHubAppCoverSource(id) : undefined) || (await runningHubCoverSourceFromPage(kind, id)) || ""));
    if (!source) return undefined;
    const image = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!image.ok) return undefined;
    const format = runningHubCoverFormat(image.headers.get("content-type") || "", source);
    if (!format) return undefined;
    const data = Buffer.from(await image.arrayBuffer());
    return data.length && data.length <= RUNNINGHUB_COVER_MAX_BYTES ? { data, ...format } : undefined;
}

async function forwardRunningHubResponse(response: Response, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }) {
    res.statusCode = response.status;
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
    res.end(await response.text());
}

function runningHubError(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }, error: unknown) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "RunningHub 请求失败" }));
}

let runningHubCatalogCache: { expiresAt: number; items: RunningHubCatalogItem[] } | undefined;

/** 从 RunningHub 官方 API 文档目录提取标准图像、视频和音频模型接口，避免把 LLM / AI App 混为一类。 */
async function runningHubModelCatalog() {
    if (runningHubCatalogCache && runningHubCatalogCache.expiresAt > Date.now()) return runningHubCatalogCache.items;
    const indexResponse = await fetch("https://www.runninghub.cn/runninghub-api-doc-cn/");
    if (!indexResponse.ok) throw new Error(`无法读取 RunningHub 模型目录（${indexResponse.status}）`);
    const indexHtml = await indexResponse.text();
    const links = Array.from(indexHtml.matchAll(/href="(\/runninghub-api-doc-cn\/api-\d+)">([^<]+)<\/a>/g))
        .map((match) => ({ path: match[1], name: match[2].replace(/\0/g, "").trim() }))
        .filter((item) => item.name && runningHubCapability(item.name));
    const uniqueLinks = Array.from(new Map(links.map((item) => [item.path, item])).values());
    const items = (
        await mapWithConcurrency(uniqueLinks, 12, async (item) => {
            try {
                const detailResponse = await fetch(`https://www.runninghub.cn${item.path}`);
                if (!detailResponse.ok) return undefined;
                const detailHtml = await detailResponse.text();
                const target = detailHtml.match(/\/openapi\/v2\/[a-z0-9./-]+/i)?.[0];
                const capability = runningHubCapability(item.name);
                return target && capability ? { name: item.name, capability, target } : undefined;
            } catch {
                return undefined;
            }
        })
    ).filter((item): item is RunningHubCatalogItem => Boolean(item));
    const deduped = Array.from(new Map(items.map((item) => [`${item.capability}:${item.target}`, item])).values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    runningHubCatalogCache = { items: deduped, expiresAt: Date.now() + 10 * 60 * 1000 };
    return deduped;
}

function runningHubCapability(name: string): RunningHubCatalogItem["capability"] | undefined {
    const normalized = name.toLowerCase();
    if (/视频|video|vidu|可灵|海螺|seedance|veo|wan|sora|kling/.test(normalized)) return "video";
    if (/音频|audio|tts|音乐|music/.test(normalized)) return "audio";
    if (/图|image|seedream|imagen|flux|qwen-image|gpt-image/.test(normalized)) return "image";
    return undefined;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
    const results: R[] = [];
    let cursor = 0;
    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await mapper(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

async function readJsonBody(req: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += value.length;
        if (length > MAX_IMAGEGEN_BODY_BYTES) throw new Error("图片附件超过 30MB，请删减后再发送");
        chunks.push(value);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new Error("生图请求格式无效");
    }
}

async function runDirectCodexImagegen(prompt: string, attachments: CodexImageAttachment[], size?: string, quality?: string) {
    const temporaryDir = await mkdtemp(join(tmpdir(), "infinite-canvas-codex-imagegen-"));
    try {
        const references = await writeReferenceImages(temporaryDir, attachments);
        const instructions = [
            "Use the $imagegen skill to create exactly one image for the user request below.",
            "Do not modify project files and do not explain the result in text.",
            references.length ? "Use the attached image files as references for this request." : "",
            size ? `Requested canvas size: ${size}.` : "",
            quality ? `Requested image quality: ${quality}.` : "",
            "User request:",
            prompt,
        ]
            .filter(Boolean)
            .join("\n\n");
        const output = await runCodexCli(instructions, references);
        if (output.code !== 0) throw new Error(`Codex CLI 生图失败：${codexCliFailure(output.stdout, output.stderr, output.code)}`);
        const threadId = codexThreadId(output.stdout);
        if (!threadId) throw new Error("Codex CLI 未返回图片任务标识");
        const imagePath = await latestGeneratedImage(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images", threadId));
        if (!imagePath) throw new Error("Codex CLI 未返回生图文件");
        return `data:${imageMimeType(imagePath)};base64,${(await readFile(imagePath)).toString("base64")}`;
    } finally {
        await rm(temporaryDir, { recursive: true, force: true });
    }
}

async function runDirectCodexText(prompt: string, model: string) {
    const instructions = ["Answer the user's request directly. Return only the requested text; do not modify project files or explain your process.", "User request:", prompt].join("\n\n");
    const output = await runCodexCli(instructions, [], model);
    if (output.code !== 0) throw new Error(`Codex CLI 文本生成失败：${codexCliFailure(output.stdout, output.stderr, output.code)}`);
    const text = codexFinalText(output.stdout);
    if (!text) throw new Error("Codex CLI 未返回文本内容");
    return text;
}

async function writeReferenceImages(directory: string, attachments: CodexImageAttachment[]) {
    return await Promise.all(
        attachments
            .filter((attachment) => attachment.dataUrl?.startsWith("data:image/"))
            .map(async (attachment, index) => {
                const matched = attachment.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
                if (!matched) throw new Error(`参考图无效：${attachment.name || "未命名图片"}`);
                const extension = matched[1] === "image/jpeg" ? "jpg" : matched[1] === "image/webp" ? "webp" : "png";
                const filePath = join(directory, `reference-${index + 1}.${extension}`);
                await writeFile(filePath, Buffer.from(matched[2], "base64"));
                return filePath;
            }),
    );
}

function runCodexCli(prompt: string, references: string[], model = "") {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolveResult, reject) => {
        const child = spawn("codex", ["exec", "--ephemeral", "--json", "--cd", webDir, ...(model ? ["--model", model] : []), ...references.flatMap((filePath) => ["-i", filePath]), "-"], { cwd: webDir, detached: true, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
            try {
                process.kill(-child.pid!, "SIGKILL");
            } catch {
                child.kill("SIGKILL");
            }
            reject(new Error("Codex CLI 生图超过 3 分钟未完成，已停止本次任务"));
        }, CODEX_IMAGE_TIMEOUT_MS);
        child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
            stderr += chunk;
        });
        child.stdin.write(prompt);
        child.stdin.end();
        child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once("close", (code) => {
            clearTimeout(timeout);
            resolveResult({ code: code ?? 1, stdout, stderr });
        });
    });
}

function codexCliFailure(stdout: string, stderr: string, code: number) {
    const messages: string[] = [];
    for (const line of stdout.split("\n")) {
        try {
            const event = JSON.parse(line) as { type?: string; message?: string; error?: { message?: string } };
            if (event.type === "error" && event.message) messages.push(event.message);
            if (event.type === "turn.failed" && event.error?.message) messages.push(event.error.message);
        } catch {
            /* 忽略非 JSON 的进度输出。 */
        }
    }
    return (messages[0] || stderr || stdout || `exit=${code}`).slice(-1200);
}

function codexThreadId(stdout: string) {
    for (const line of stdout.split("\n")) {
        try {
            const event = JSON.parse(line) as { type?: string; thread_id?: string; threadId?: string };
            if (event.type === "thread.started") return event.thread_id || event.threadId;
        } catch {
            /* 忽略非 JSON 的进度输出。 */
        }
    }
    return "";
}

function codexFinalText(stdout: string) {
    let text = "";
    for (const line of stdout.split("\n")) {
        try {
            const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
            if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") text = event.item.text;
        } catch {
            /* 忽略非 JSON 的进度输出。 */
        }
    }
    return text.trim();
}

async function latestGeneratedImage(directory: string) {
    try {
        const candidates = (await readdir(directory)).filter((name) => /\.(?:png|jpe?g|webp)$/i.test(name));
        const entries = await Promise.all(candidates.map(async (name) => ({ path: join(directory, name), modified: (await stat(join(directory, name))).mtimeMs })));
        return entries.sort((a, b) => b.modified - a.modified)[0]?.path;
    } catch {
        return undefined;
    }
}

function imageMimeType(filePath: string) {
    const extension = extname(filePath).toLowerCase();
    return extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : "image/png";
}

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest(), directCodexImagegen()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
});
