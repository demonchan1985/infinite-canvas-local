export type RunningHubCoverKind = "app" | "workflow";

/** 封面解析规则的版本号：规则变化时递增，可绕过浏览器里按旧规则缓存的封面。 */
export const RUNNINGHUB_COVER_VERSION = 2;

export function runningHubCoverUrl(kind: string | undefined, target: string | undefined) {
    const id = target?.trim() || "";
    if ((kind !== "app" && kind !== "workflow") || !/^\d+$/.test(id)) return undefined;
    return `/api/runninghub/cover?kind=${kind}&id=${id}&v=${RUNNINGHUB_COVER_VERSION}`;
}

/** 封面为附加展示资源，读取失败不影响项目导入或运行。 */
export async function warmRunningHubCover(kind: string | undefined, target: string | undefined) {
    const url = runningHubCoverUrl(kind, target);
    if (!url) return;
    await fetch(url).catch(() => undefined);
}

/**
 * 解析 Nuxt SSR 数据表（__NUXT_DATA__）。
 * 表内每个值都可能只是一个指向别处的下标，封面对象里的 url / thumbnailUri 同样是下标，
 * 所以必须逐层解引用，不能像正则那样在键名后面随便捞第一个图片地址（会捞到示例输出图）。
 */
function resolveNuxtEntry(data: unknown[], value: unknown, depth = 0): unknown {
    return typeof value === "number" && depth < 8 ? resolveNuxtEntry(data, data[value], depth + 1) : value;
}

function runningHubCoverSourceFromNuxtPayload(html: string) {
    const raw = /<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
    if (!raw) return undefined;
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (!Array.isArray(data)) return undefined;
    const container = data.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && "covers" in (entry as Record<string, unknown>) && ("name" in (entry as Record<string, unknown>) || "id" in (entry as Record<string, unknown>))) as Record<string, unknown> | undefined;
    if (!container) return undefined;
    for (const key of ["chineseCovers", "covers", "englishCovers"]) {
        const list = resolveNuxtEntry(data, container[key]);
        for (const item of Array.isArray(list) ? list : list ? [list] : []) {
            const entry = resolveNuxtEntry(data, item);
            if (typeof entry === "string" && entry) return entry;
            if (entry && typeof entry === "object" && !Array.isArray(entry)) {
                const record = entry as Record<string, unknown>;
                for (const field of ["thumbnailUri", "url"]) {
                    const candidate = resolveNuxtEntry(data, record[field]);
                    if (typeof candidate === "string" && candidate) return candidate;
                }
            }
        }
    }
    return undefined;
}

/** 提取 RunningHub 项目页的主图：优先项目自身的封面数据，其次页面上的封面区标记。 */
export function runningHubCoverSourceFromHtml(html: string) {
    const coverStage = /class=(['"])[^'"]*cover-stage[^'"]*\1[^>]*>[\s\S]{0,2400}?<(?:img|video)\b[^>]*\b(?:poster|src)=(['"])([^'"]+)\2/i.exec(html)?.[3];
    const apiCover = /["'](?:coverUrl|cover_url|coverImage|thumbnailUrl|thumbnail|webappCover|imageUrl)["']\s*[:=]\s*["'](https?:[^"']+)["']/i.exec(html)?.[1];
    return (runningHubCoverSourceFromNuxtPayload(html) || coverStage || apiCover || "").replace(/&amp;/g, "&").trim();
}
