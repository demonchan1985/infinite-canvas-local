import { App, Button, Checkbox, Input, Modal, Segmented, Tabs } from "antd";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { createRunningHubStandardModel } from "@/lib/runninghub-model";
import { fetchChannelModels, fetchRunningHubCatalog } from "@/services/api/image";
import { guessCapability, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

// Channel model selector: fetch upstream models or add them manually, then include checked models in the channel list.
export function ModelSelectModal({ open, channel, selectedModels, onConfirm, onClose }: { open: boolean; channel: ModelChannel | null; selectedModels: ChannelModel[]; onConfirm: (models: ChannelModel[]) => void; onClose: () => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [existing, setExisting] = useState<ChannelModel[]>([]);
    const [fetched, setFetched] = useState<ChannelModel[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState("new");
    const [capability, setCapability] = useState<ModelCapability | "all">("all");
    const [search, setSearch] = useState("");
    const [manual, setManual] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setExisting(selectedModels);
        setFetched([]);
        setSelected(new Set(selectedModels.map((model) => model.name)));
        setActiveTab(selectedModels.length ? "existing" : "new");
        setCapability("all");
        setSearch("");
        setManual("");
    }, [open, selectedModels]);

    const currentList = activeTab === "new" ? fetched : existing;
    const capabilityCounts = useMemo(() => {
        const models = currentList;
        return {
            all: models.length,
            text: models.filter((model) => model.capability === "text").length,
            image: models.filter((model) => model.capability === "image").length,
            video: models.filter((model) => model.capability === "video").length,
            audio: models.filter((model) => model.capability === "audio").length,
        };
    }, [currentList]);
    const visibleList = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return currentList.filter((model) => (capability === "all" || model.capability === capability) && (!keyword || model.name.toLowerCase().includes(keyword)));
    }, [capability, currentList, search]);
    const visibleSelectedCount = visibleList.filter((model) => selected.has(model.name)).length;

    const toggle = (name: string, checked: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            if (checked) next.add(name);
            else next.delete(name);
            return next;
        });

    const selectVisible = (checked: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            visibleList.forEach((model) => (checked ? next.add(model.name) : next.delete(model.name)));
            return next;
        });

    const addManual = () => {
        const name = manual.trim();
        if (!name) return;
        if (!fetched.some((model) => model.name === name) && !existing.some((model) => model.name === name)) setFetched((current) => [{ name, capability: guessCapability(name) }, ...current]);
        setSelected((current) => new Set(current).add(name));
        setManual("");
        setActiveTab("new");
    };

    const fetchModels = async () => {
        if (!channel) return;
        if (channel.apiFormat !== "codex-cli" && (!channel.baseUrl.trim() || !channel.apiKey.trim())) {
            message.error(channel.apiFormat === "runninghub" ? "请先填写企业级-共享 API Key" : t("config.modelSelect.missingConfig"));
            return;
        }
        setLoading(true);
        try {
            let models: ChannelModel[];
            if (channel.apiFormat === "runninghub") {
                const [llmModels, catalog] = await Promise.all([fetchChannelModels(channel), fetchRunningHubCatalog(channel)]);
                models = [...llmModels.map((name) => ({ name, capability: "text" as const })), ...catalog.map((item) => createRunningHubStandardModel(item.name, item.capability, item.target))];
            } else {
                models = (await fetchChannelModels(channel)).map((name) => ({ name, capability: guessCapability(name) }));
            }
            const uniqueModels = Array.from(new Map(models.map((model) => [model.name, model])).values());
            setFetched(uniqueModels);
            setActiveTab("new");
            message.success(t("config.modelSelect.fetched", { count: uniqueModels.length }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.modelSelect.fetchFailed"));
        } finally {
            setLoading(false);
        }
    };

    const confirm = () => {
        const ordered = Array.from(new Map([...existing, ...fetched].map((model) => [model.name, model])).values()).filter((model) => selected.has(model.name));
        onConfirm(ordered);
        onClose();
    };

    return (
        <Modal
            open={open}
            width={880}
            centered
            onCancel={onClose}
            title={
                <span>
                    {t("config.modelSelect.title")} <span className="ml-2 text-xs font-normal text-stone-500">{t("config.modelSelect.selected", { selected: selected.size, total: new Set([...existing, ...fetched]).size })}</span>
                </span>
            }
            styles={{ body: { maxHeight: "62vh", overflowY: "auto" } }}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    {t("common.cancel")}
                </Button>,
                <Button key="confirm" type="primary" onClick={confirm}>
                    {t("config.modelSelect.confirm")}
                </Button>,
            ]}
        >
            <div className="flex flex-wrap items-center gap-3">
                <Input className="min-w-[200px] flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("config.modelSelect.search")} prefix={<Search className="size-4 text-stone-400" />} allowClear />
                <Input className="min-w-[180px] flex-1" value={manual} onChange={(event) => setManual(event.target.value)} onPressEnter={addManual} placeholder={t("config.modelSelect.modelName")} />
                <Button onClick={addManual}>{t("config.modelSelect.add")}</Button>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void fetchModels()}>
                    {channel?.apiFormat === "runninghub" ? "拉取全部模型" : t("config.modelSelect.fetch")}
                </Button>
            </div>
            <div className="mt-2 text-xs text-stone-500">{t("config.modelSelect.description")}</div>

            <Tabs
                className="mt-3"
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    { key: "new", label: t("config.modelSelect.fetchedTab", { count: fetched.length }) },
                    { key: "existing", label: t("config.modelSelect.existingTab", { count: existing.length }) },
                ]}
            />

            {channel?.apiFormat === "runninghub" ? (
                <Segmented
                    className="mb-3"
                    value={capability}
                    onChange={(value) => setCapability(value as ModelCapability | "all")}
                    options={[
                        { label: `全部 ${capabilityCounts.all}`, value: "all" },
                        { label: `文本 ${capabilityCounts.text}`, value: "text" },
                        { label: `生图 ${capabilityCounts.image}`, value: "image" },
                        { label: `视频 ${capabilityCounts.video}`, value: "video" },
                        { label: `音频 ${capabilityCounts.audio}`, value: "audio" },
                    ]}
                />
            ) : null}

            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-stone-500">{t("config.modelSelect.visibleSelected", { selected: visibleSelectedCount, total: visibleList.length })}</span>
                <div className="flex gap-2">
                    <Button size="small" disabled={!visibleList.length} onClick={() => selectVisible(true)}>
                        {t("config.modelSelect.selectVisible")}
                    </Button>
                    <Button size="small" disabled={!visibleSelectedCount} onClick={() => selectVisible(false)}>
                        {t("config.modelSelect.clearVisible")}
                    </Button>
                </div>
            </div>

            {visibleList.length ? (
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                    {visibleList.map((model) => (
                        <Checkbox key={model.name} checked={selected.has(model.name)} onChange={(event) => toggle(model.name, event.target.checked)}>
                            <span className="truncate" title={model.name}>
                                {model.name}
                            </span>
                        </Checkbox>
                    ))}
                </div>
            ) : (
                <div className="py-8 text-center text-sm text-stone-500">{t(activeTab === "new" ? "config.modelSelect.fetchedEmpty" : "config.modelSelect.existingEmpty")}</div>
            )}
        </Modal>
    );
}
