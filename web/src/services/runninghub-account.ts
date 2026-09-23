import type { ModelChannel } from "@/stores/use-config-store";

export type RunningHubAccountStatus = {
    coins: number;
    wallet: number;
    currency: string;
    runningTasks: number;
};

type RunningHubAccountPayload = {
    code?: number | string;
    msg?: string;
    message?: string;
    error?: { message?: string };
    data?: Record<string, unknown>;
};

function numberValue(value: unknown, label: string) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`RunningHub 未返回有效${label}`);
    return number;
}

export function runningHubAccountKey(channels: ModelChannel[]) {
    const channel = channels.find((item) => item.apiFormat === "runninghub" && (item.consumerApiKey?.trim() || item.apiKey.trim()));
    return (channel?.consumerApiKey || channel?.apiKey || "").trim();
}

export function parseRunningHubAccountStatus(value: unknown): RunningHubAccountStatus {
    const payload = value && typeof value === "object" ? value as RunningHubAccountPayload : {};
    if (Number(payload.code) !== 0 || !payload.data) throw new Error(payload.msg || payload.message || payload.error?.message || "RunningHub 账户状态读取失败");
    return {
        coins: numberValue(payload.data.remainCoins, "RH 币余额"),
        wallet: numberValue(payload.data.remainMoney, "钱包余额"),
        currency: String(payload.data.currency || "CNY"),
        runningTasks: numberValue(payload.data.currentTaskCounts ?? 0, "运行任务数"),
    };
}

export async function fetchRunningHubAccountStatus(apiKey: string, signal?: AbortSignal) {
    const response = await fetch("/api/runninghub/account-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
        signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error || "RunningHub 账户状态读取失败");
    return parseRunningHubAccountStatus(payload);
}
