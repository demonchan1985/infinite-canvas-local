import { useEffect, useState, type CSSProperties } from "react";
import { Alert, App, Button, Modal, Tag, Timeline } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_VERSION } from "@/constant/env";
import { checkLocalUpdate, fetchLocalUpdateStatus, startLocalUpdate, type LocalUpdateStatus } from "@/services/api/canvas-agent";
import { useAgentStore } from "@/stores/use-agent-store";

function getTagColor(type: string) {
    if (type === "新增" || type === "Added") return "green";
    if (type === "修复" || type === "Fixed") return "red";
    if (type === "调整" || type === "Changed") return "blue";
    if (type === "文档" || type === "Docs") return "purple";
    return "default";
}

function releaseTypeLabel(type: string, t: TFunction) {
    const key = ({ 新增: "added", 修复: "fixed", 调整: "changed", 优化: "optimized", 文档: "docs" } as Record<string, string>)[type];
    return key ? t(`version.types.${key}`) : type;
}

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
};

export function VersionReleaseModal({ className, style }: VersionReleaseModalProps) {
    const { t } = useTranslation();
    const { modal } = App.useApp();
    const agentUrl = useAgentStore((state) => state.url);
    const agentToken = useAgentStore((state) => state.token);
    const agentConnected = useAgentStore((state) => state.connected);
    const [updateRunning, setUpdateRunning] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<LocalUpdateStatus | null>(null);
    const [updateError, setUpdateError] = useState("");
    const { open, setOpen, openReleaseModal, latestVersion, releases, checking, hasNewVersion, checkLatestRelease } = useVersionCheck();

    useEffect(() => {
        if (!updateRunning) return;
        let active = true;
        const poll = async () => {
            try {
                const next = await fetchLocalUpdateStatus(agentUrl, agentToken);
                if (!active) return;
                setUpdateStatus(next);
                if (next.phase === "done") window.location.reload();
                if (next.phase === "failed") {
                    setUpdateError(next.error || t("version.updatePhases.failed"));
                    setUpdateRunning(false);
                }
            } catch { /* Agent 退出与重启期间连接暂不可用。 */ }
        };
        void poll();
        const timer = window.setInterval(() => void poll(), 1500);
        return () => { active = false; window.clearInterval(timer); };
    }, [agentToken, agentUrl, t, updateRunning]);

    const requestUpdate = async () => {
        setUpdateError("");
        if (!agentConnected || !agentToken) return void setUpdateError(t("version.updateUnavailable"));
        try {
            const check = await checkLocalUpdate(agentUrl, agentToken);
            if (!check.ok) return void setUpdateError(check.error || t("version.updateUnavailable"));
        } catch (error) {
            return void setUpdateError(error instanceof Error ? error.message : t("version.updateUnavailable"));
        }
        modal.confirm({
            title: t("version.confirmUpdate"),
            content: t("version.updateWarning"),
            okText: t("version.installUpdate"),
            onOk: async () => {
                try {
                    await startLocalUpdate(agentUrl, agentToken);
                    setUpdateStatus({ phase: "stopping" });
                    setUpdateRunning(true);
                } catch (error) {
                    setUpdateError(error instanceof Error ? error.message : t("version.updateFailed"));
                }
            },
        });
    };

    return (
        <>
            <button
                type="button"
                className={className || "shrink-0 cursor-pointer text-xs font-medium text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"}
                style={style}
                onClick={openReleaseModal}
                title={t("version.viewUpdates")}
            >
                <span className="relative inline-flex">
                    {APP_VERSION}
                    {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-green-500" /> : null}
                </span>
            </button>
            <Modal title={t("version.title")} open={open} width={680} centered footer={null} onCancel={() => setOpen(false)}>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-xs text-stone-500 dark:text-stone-400">{t("version.currentVersion")}</div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{APP_VERSION}</div>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-stone-500 dark:text-stone-400">{t("version.latestVersion")}</div>
                            <button
                                type="button"
                                className="cursor-pointer bg-transparent p-0 text-[11px] font-normal text-stone-400 underline-offset-2 transition hover:text-stone-700 hover:underline dark:text-stone-500 dark:hover:text-stone-300"
                                onClick={() => void checkLatestRelease(true)}
                            >
                                {t(checking ? "version.checking" : "version.checkUpdates")}
                            </button>
                        </div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{latestVersion}</div>
                    </div>
                </div>
                <div className="mb-5 space-y-3">
                    <Button type="primary" onClick={() => void requestUpdate()} loading={updateRunning} disabled={updateRunning}>
                        {t("version.installUpdate")}
                    </Button>
                    {updateRunning ? <Alert type="info" showIcon message={updateStatus ? t(`version.updatePhases.${updateStatus.phase}`) : t("version.updateProgress")} description={t("version.updateProgress")} role="status" /> : null}
                    {updateError ? <Alert type="error" showIcon message={updateError} role="alert" /> : null}
                </div>
                <div className="max-h-[56vh] overflow-y-auto pr-2">
                    <Timeline
                        items={releases.map((release) => ({
                            content: (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-stone-950 dark:text-stone-100">{release.version === "Unreleased" ? t("version.unreleased") : release.version}</span>
                                        <span className="text-xs text-stone-500 dark:text-stone-400">{release.date}</span>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {release.version === latestVersion ? <Tag color="green">{t("version.latest")}</Tag> : null}
                                            {release.version === APP_VERSION ? <Tag>{t("version.current")}</Tag> : null}
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {release.items.map((item, index) => (
                                            <div key={`${release.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                                                <Tag color={getTagColor(item.type)} className="m-0 mt-0.5 shrink-0 whitespace-nowrap">
                                                    {releaseTypeLabel(item.type, t)}
                                                </Tag>
                                                <span className="min-w-0 flex-1">{item.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </Modal>
        </>
    );
}
