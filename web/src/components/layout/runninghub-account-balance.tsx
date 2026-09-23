import { RefreshCw } from "lucide-react";
import { Tooltip } from "antd";
import { useEffect, useState } from "react";

import { fetchRunningHubAccountStatus, runningHubAccountKey, type RunningHubAccountStatus } from "@/services/runninghub-account";
import { useConfigStore } from "@/stores/use-config-store";

const REFRESH_INTERVAL_MS = 60_000;

function coinsLabel(value: number) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function walletLabel(value: number) {
    return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function RunningHubAccountBalance() {
    const apiKey = useConfigStore((state) => runningHubAccountKey(state.config.channels));
    const [account, setAccount] = useState<RunningHubAccountStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const refresh = async () => {
        if (!apiKey) return;
        setLoading(true);
        try {
            setAccount(await fetchRunningHubAccountStatus(apiKey));
            setError("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "RunningHub 账户状态读取失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!apiKey) {
            setAccount(null);
            setError("");
            return;
        }
        void refresh();
        const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
        return () => window.clearInterval(timer);
        // refresh 仅依赖 apiKey，避免刷新状态变化重新创建定时器。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey]);

    if (!apiKey) return null;
    const title = error || (account ? `RH币余额：${coinsLabel(account.coins)}\n钱包余额：${walletLabel(account.wallet)} ${account.currency}\n运行任务：${account.runningTasks}` : "正在读取 RunningHub 账户余额");
    return (
        <Tooltip title={title} mouseEnterDelay={0.2}>
            <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10" onClick={() => void refresh()} aria-label="刷新 RunningHub RH币和钱包余额">
                <span className="font-black italic text-lime-400">R</span>
                <span className="tabular-nums text-stone-700 dark:text-stone-200">{account ? coinsLabel(account.coins) : "--"}</span>
                <span className="ml-1 font-black text-amber-400">¥</span>
                <span className="tabular-nums text-stone-700 dark:text-stone-200">{account ? walletLabel(account.wallet) : "--"}</span>
                <RefreshCw className={`ml-0.5 size-3 text-stone-400 ${loading ? "animate-spin" : ""}`} />
            </button>
        </Tooltip>
    );
}
