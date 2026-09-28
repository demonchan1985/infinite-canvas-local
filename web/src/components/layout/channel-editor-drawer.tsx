import { Button, Drawer, Input, Segmented, Select, Space } from "antd";
import { ExternalLink, ListPlus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { fetchChannelModels } from "@/services/api/image";
import { RUNNINGHUB_SITES, runningHubSiteFromBaseUrl, switchRunningHubSiteDrafts, type RunningHubSite } from "@/lib/runninghub-site";
import { CODEX_IMAGE_MODELS, defaultBaseUrlForApiFormat, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

/** 与 3101 保持同一套渠道编辑结构；RunningHub 的资源发现统一收敛在“选择模型”。 */
export function ChannelEditorDrawer({ open, channel, channels, onSave, onClose }: { open: boolean; channel: ModelChannel | null; channels: ModelChannel[]; onSave: (channels: ModelChannel[]) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [otherDraft, setOtherDraft] = useState<ModelChannel | null>(null);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const [loadingCodexModels, setLoadingCodexModels] = useState(false);
    const [codexCliStatus, setCodexCliStatus] = useState("");
    const [codexCliError, setCodexCliError] = useState(false);
    const apiFormatOptions: Array<{ label: ReactNode; value: ApiCallFormat }> = [
        { label: <span className="inline-flex items-center gap-2"><img src="/icons/openai.svg" alt="" className="size-4 dark:invert" />OpenAI</span>, value: "openai" },
        { label: <span className="inline-flex items-center gap-2"><img src="/icons/gemini.svg" alt="" className="size-4" />Gemini</span>, value: "gemini" },
        { label: <span className="inline-flex items-center gap-2"><img src="/icons/openai.svg" alt="" className="size-4 dark:invert" />OpenAI CLI（Codex）</span>, value: "codex-cli" },
        { label: <span className="inline-flex items-center gap-2"><img src="/icons/runninghub.svg" alt="" className="size-4" />RunningHub</span>, value: "runninghub" },
    ];
    const capabilityOptions: Array<{ label: string; value: ModelCapability }> = ["image", "video", "text", "audio"].map((value) => ({ label: t(`config.channelEditor.capabilities.${value}`), value: value as ModelCapability }));

    useEffect(() => {
        if (open && channel) {
            setDraft(channel);
            setOtherDraft(null);
            setCodexCliStatus("");
            setCodexCliError(false);
        }
    }, [open, channel]);

    if (!draft) return null;
    const runningHubSite = runningHubSiteFromBaseUrl(draft.baseUrl);

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => (current ? { ...current, ...value } : current));
    const setModels = (models: ChannelModel[]) => patch({ models });
    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        const baseUrl = apiFormat === "runninghub" || apiFormat === "codex-cli" || draft.apiFormat === "runninghub" || !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        if (apiFormat !== "runninghub") setOtherDraft(null);
        patch({ apiFormat, baseUrl, ...(apiFormat === "codex-cli" ? { apiKey: "" } : {}) });
    };
    const changeRunningHubSite = (site: RunningHubSite) => {
        if (runningHubSiteFromBaseUrl(draft.baseUrl) === site) return;
        const next = switchRunningHubSiteDrafts(channels, draft, otherDraft, site);
        setDraft(next.draft);
        setOtherDraft(next.otherDraft);
    };
    const checkCodexCli = async (loadModels: boolean) => {
        setLoadingCodexModels(true);
        setCodexCliStatus("");
        setCodexCliError(false);
        try {
            const names = await fetchChannelModels(draft);
            if (loadModels) {
                const imageModels = new Set<string>(CODEX_IMAGE_MODELS);
                setModels(names.map((name) => ({ name, capability: imageModels.has(name) ? "image" : "text" })));
            }
            setCodexCliStatus(loadModels ? `连接正常，已读取 ${names.length} 个模型` : `连接正常，可读取 ${names.length} 个模型`);
        } catch (error) {
            setCodexCliStatus(error instanceof Error ? error.message : "本机 Codex CLI 连接失败");
            setCodexCliError(true);
        } finally {
            setLoadingCodexModels(false);
        }
    };
    const setCapability = (name: string, capability: ModelCapability) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capability } : model)));
    const setScript = (name: string, script: string) => setModels(draft.models.map((model) => (model.name === name ? { ...model, script: script || undefined } : model)));
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));
    const save = () => {
        const drafts = draft.apiFormat === "runninghub" && otherDraft ? [draft, otherDraft] : [draft];
        onSave(drafts.map((item) => ({ ...item, name: item.name.trim() || t("config.channels.unnamed"), models: normalizeChannelModels(item.models) })));
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={640}
            title={t("config.channelEditor.title")}
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" onClick={save}>
                        {t("common.save")}
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{draft.apiFormat === "codex-cli" ? "本地画布服务地址" : t("config.channelEditor.baseUrl")}</span>
                    <Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" disabled={draft.apiFormat === "codex-cli" || draft.apiFormat === "runninghub"} />
                </label>
                {draft.apiFormat === "codex-cli" ? (
                    <div className="rounded-lg border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-300 md:col-span-2">
                        <div className="font-medium">连接本机 Codex CLI</div>
                        <div className="mt-1 text-xs text-stone-500">无需 API Key。需保持“启动独立画布”窗口运行。</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button loading={loadingCodexModels} onClick={() => void checkCodexCli(false)}>验证连接</Button>
                            <Button icon={<RefreshCw className="size-4" />} loading={loadingCodexModels} onClick={() => void checkCodexCli(true)}>
                                拉取模型
                            </Button>
                            {codexCliStatus ? <span className={`text-xs ${codexCliError ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>{codexCliStatus}</span> : null}
                        </div>
                    </div>
                ) : draft.apiFormat === "runninghub" ? (
                    <div className="space-y-4 md:col-span-2">
                        <div>
                            <span className="mb-1 block text-sm font-medium">RunningHub 站点</span>
                            <Segmented block value={runningHubSite} onChange={(value) => changeRunningHubSite(value as RunningHubSite)} options={[{ label: "国内站 CN", value: "cn" }, { label: "国际站 AI", value: "ai" }]} />
                            <span className="mt-1 block text-xs text-stone-500">CN 与 AI 的 Key 和模型分别保存，切换不会清空。</span>
                        </div>
                        <div className="block">
                            <label htmlFor="runninghub-shared-key" className="mb-1 block text-sm font-medium">企业级-共享 API Key（按量付费）</label>
                            <Input.Password id="runninghub-shared-key" value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="用于标准模型与 LLM" />
                            <span className="mt-1 block text-xs text-stone-500">用于标准生图、视频、音频模型和 LLM。</span>
                            <span className="mt-1 flex text-xs"><a href={RUNNINGHUB_SITES[runningHubSite].sharedKeyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">获取{runningHubSite === "cn" ? "国内站" : "国际站"}企业 Key <ExternalLink aria-hidden="true" className="size-3" /></a></span>
                        </div>
                        <div className="block">
                            <label htmlFor="runninghub-consumer-key" className="mb-1 block text-sm font-medium">消费级 API Key（消耗 RH 币）</label>
                            <Input.Password id="runninghub-consumer-key" value={draft.consumerApiKey || ""} onChange={(event) => patch({ consumerApiKey: event.target.value })} placeholder="用于 AI 应用与工作流" />
                            <span className="mt-1 block text-xs text-stone-500">仅用于 AI 应用和工作流。</span>
                            <span className="mt-1 flex text-xs"><a href={RUNNINGHUB_SITES[runningHubSite].consumerKeyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">获取{runningHubSite === "cn" ? "国内站" : "国际站"}消费 Key <ExternalLink aria-hidden="true" className="size-3" /></a></span>
                        </div>
                    </div>
                ) : (
                    <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium">API Key</span>
                        <Input.Password value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." />
                    </label>
                )}
            </div>
            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">{t("config.channelEditor.models")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{draft.apiFormat === "runninghub" ? "点击“选择模型”后可一次拉取文本、生图、视频、音频模型。" : t("config.channelEditor.modelDescription", { count: draft.models.length })}</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>
                    {t("config.channelEditor.selectModels")}
                </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                {model.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                                <Segmented size="small" value={model.capability} options={capabilityOptions} onChange={(value) => setCapability(model.name, value as ModelCapability)} />
                                <Button size="small" type={model.script ? "primary" : "default"} ghost={Boolean(model.script)} onClick={() => setScriptTarget({ name: model.name, capability: model.capability, value: model.script || "" })}>
                                    {t(model.script ? "config.channelEditor.scriptReady" : "config.channelEditor.script")}
                                </Button>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">{t("config.channelEditor.empty")}</div>
                )}
            </div>
            <ModelSelectModal open={selectOpen} channel={draft} selectedModels={draft.models} onConfirm={setModels} onClose={() => setSelectOpen(false)} />
            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}
