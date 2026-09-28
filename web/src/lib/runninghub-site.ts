import type { ModelChannel } from "../stores/use-config-store";

export const RUNNINGHUB_SITES = {
    cn: { baseUrl: "https://www.runninghub.cn", llmBaseUrl: "https://llm.runninghub.cn", sharedKeyUrl: "https://www.runninghub.cn/call-api/bill-task?tab=keys&type=shared", consumerKeyUrl: "https://www.runninghub.cn/call-api/bill-task?tab=keys&type=consumer" },
    ai: { baseUrl: "https://www.runninghub.ai", llmBaseUrl: "https://llm.runninghub.ai", sharedKeyUrl: "https://www.runninghub.ai/call-api/bill-task?tab=keys&type=shared", consumerKeyUrl: "https://www.runninghub.ai/call-api/bill-task?tab=keys&type=consumer" },
} as const;

export type RunningHubSite = keyof typeof RUNNINGHUB_SITES;

export function runningHubSiteFromBaseUrl(baseUrl: string): RunningHubSite {
    return /^https:\/\/(?:www|llm)\.runninghub\.ai\/?$/i.test(baseUrl.trim()) ? "ai" : "cn";
}

/** 本地代理只允许官方两个站点，避免把 API Key 发往自定义地址。 */
export function runningHubApiBaseUrl(baseUrl: unknown) {
    const value = String(baseUrl || RUNNINGHUB_SITES.cn.baseUrl).trim().replace(/\/+$/, "");
    if (value === RUNNINGHUB_SITES.cn.baseUrl || value === RUNNINGHUB_SITES.ai.baseUrl) return value;
    throw new Error("RunningHub 站点仅支持国内站 runninghub.cn 或国际站 runninghub.ai");
}

export function switchRunningHubSiteDrafts(channels: ModelChannel[], current: ModelChannel, otherDraft: ModelChannel | null, site: RunningHubSite) {
    const rootId = current.id.replace(/:(?:cn|ai)$/, "");
    const existing = otherDraft?.apiFormat === "runninghub" && runningHubSiteFromBaseUrl(otherDraft.baseUrl) === site
        ? otherDraft
        : channels.find((channel) => channel.apiFormat === "runninghub" && (channel.id === rootId || channel.id === `${rootId}:${site}`) && runningHubSiteFromBaseUrl(channel.baseUrl) === site);
    const name = current.name.replace(/ · (?:国内|国际)站$/, "");
    return {
        draft: existing || { id: `${rootId}:${site}`, name: `${name} · ${site === "cn" ? "国内" : "国际"}站`, baseUrl: RUNNINGHUB_SITES[site].baseUrl, apiFormat: "runninghub" as const, apiKey: "", consumerApiKey: "", models: [] },
        otherDraft: current,
    };
}

export function mergeRunningHubSiteDrafts(channels: ModelChannel[], drafts: ModelChannel[]) {
    const updates = new Map(drafts.map((channel) => [channel.id, channel]));
    return [...channels.map((channel) => updates.get(channel.id) || channel), ...drafts.filter((channel) => !channels.some((saved) => saved.id === channel.id))];
}

export function visibleChannelGroups(channels: ModelChannel[]) {
    return channels.filter((channel) => {
        const rootId = channel.id.replace(/:(?:cn|ai)$/, "");
        return channel.apiFormat !== "runninghub" || rootId === channel.id || !channels.some((root) => root.id === rootId && root.apiFormat === "runninghub");
    });
}
