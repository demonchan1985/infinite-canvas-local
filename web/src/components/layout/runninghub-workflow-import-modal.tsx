import { App, Button, Input, InputNumber, Modal, Segmented, Select, Switch, Upload, type UploadFile } from "antd";
import { AppWindow, Download, FileJson, UploadCloud, Workflow } from "lucide-react";
import { useEffect, useState } from "react";

import { createRunningHubAiAppModel, createRunningHubWorkflowModel, mergeRunningHubWorkflowBindings, parseRunningHubAiApp, parseRunningHubWorkflowBindings, runningHubAiAppId, runningHubWorkflowId } from "@/lib/runninghub-model";
import { warmRunningHubCover } from "@/lib/runninghub-cover";
import { RUNNINGHUB_SITES, runningHubSiteFromBaseUrl } from "@/lib/runninghub-site";
import { fetchRunningHubAiAppInfo, fetchRunningHubWorkflowInfo, fetchRunningHubWorkflowTitle } from "@/services/api/image";
import type { ChannelModel, ModelChannel, RunningHubWorkflowField, RunningHubWorkflowFieldValue } from "@/stores/use-config-store";

type ImportKind = "workflow" | "app";
type WorkflowDraft = { kind: ImportKind; target: string; name: string; model: ChannelModel; fromJson: boolean; channelId: string };

export function RunningHubWorkflowImportModal({ open, channels, onClose, onImported }: { open: boolean; channels: ModelChannel[]; onClose: () => void; onImported: (model: ChannelModel, channelId: string) => void }) {
    const { message } = App.useApp();
    const [source, setSource] = useState("");
    const [workflowFile, setWorkflowFile] = useState<UploadFile | null>(null);
    const [reading, setReading] = useState(false);
    const [draft, setDraft] = useState<WorkflowDraft | null>(null);
    const [kind, setKind] = useState<ImportKind>("workflow");
    const [channelId, setChannelId] = useState("");
    const runningHubChannels = channels.filter((item) => item.apiFormat === "runninghub");
    const channel = runningHubChannels.find((item) => item.id === channelId) || runningHubChannels[0] || null;

    useEffect(() => {
        if (!open) return;
        setSource("");
        setWorkflowFile(null);
        setDraft(null);
        setKind("workflow");
        setChannelId(runningHubChannels[0]?.id || "");
    }, [open]);

    const readImport = async () => {
        const target = kind === "app" ? runningHubAiAppId(source) : runningHubWorkflowId(source.trim());
        if (!target) return message.error(kind === "app" ? "请输入 AI 应用详情链接、AI 应用 API 手册链接或数字 ID" : "请输入 RunningHub 工作流页、分享页、API 手册链接或数字 ID");
        if (!channel) return message.error("请先在渠道设置新增 RunningHub 渠道");
        try {
            const sourceHost = new URL(source.trim()).hostname.replace(/^www\./, "");
            if ((sourceHost === "runninghub.cn" || sourceHost === "runninghub.ai") && sourceHost !== `runninghub.${runningHubSiteFromBaseUrl(channel.baseUrl)}`) return message.error("链接站点与所选渠道不一致，请切换渠道后重试");
        } catch { /* 纯数字 ID 无需验证域名。 */ }
        if (!channel?.consumerApiKey?.trim()) return message.error("请先在渠道设置填写 RunningHub 消费级 API Key");
        setReading(true);
        try {
            if (kind === "app") {
                const imported = parseRunningHubAiApp(await fetchRunningHubAiAppInfo(channel, target), target);
                setDraft({ kind, target, name: imported.name, model: createRunningHubAiAppModel(imported), fromJson: false, channelId: channel.id });
            } else {
                const apiPayload = await fetchRunningHubWorkflowInfo(channel, target);
                const apiBindings = parseRunningHubWorkflowBindings(apiPayload);
                if (!apiBindings.workflowNodes?.length) throw new Error("RunningHub 未返回可识别的工作流 API 图，未保存空映射");
                const uploadedJson = workflowFile?.originFileObj || (workflowFile && typeof (workflowFile as unknown as File).text === "function" ? (workflowFile as unknown as File) : null);
                const rawPayload = uploadedJson ? JSON.parse(await uploadedJson.text()) : null;
                const bindings = mergeRunningHubWorkflowBindings(apiBindings, rawPayload ? parseRunningHubWorkflowBindings(rawPayload) : null);
                const fileName = workflowFile?.name?.replace(/\.json$/i, "").trim();
                const rhTitle = await fetchRunningHubWorkflowTitle(target, channel.baseUrl).catch(() => "");
                const name = rhTitle || fileName || `工作流 ${target}`;
                setDraft({ kind, target, name, model: createRunningHubWorkflowModel(target, bindings, name, rhTitle || name), fromJson: Boolean(rawPayload), channelId: channel.id });
            }
            void warmRunningHubCover(kind, target, channel.baseUrl);
        } catch (error) {
            message.error(error instanceof Error ? error.message : kind === "app" ? "读取 AI 应用失败" : "读取工作流失败");
        } finally {
            setReading(false);
        }
    };

    const updateDraftName = (name: string) => setDraft((current) => (current ? { ...current, name, model: { ...current.model, name } } : current));
    const updateDraftCapability = (capability: "image" | "video" | "audio") => setDraft((current) => current ? { ...current, model: { ...current.model, capability } } : current);
    const updateDraftField = (key: string, value: RunningHubWorkflowFieldValue) =>
        setDraft((current) => {
            if (!current?.model.runningHub) return current;
            const workflowFields = (current.model.runningHub.workflowFields || []).map((field) => (field.key === key ? { ...field, defaultValue: field.type === "number" && value !== "" && Number.isFinite(Number(value)) ? Number(value) : value } : field));
            return { ...current, model: { ...current.model, runningHub: { ...current.model.runningHub, workflowFields } } };
        });
    const applyDraft = () => {
        if (!draft) return;
        onImported(draft.model, draft.channelId);
        message.success(`已保存 ${draft.kind === "app" ? "AI 应用" : "工作流"}：${draft.name}`);
        onClose();
    };

    const resource = draft?.model.runningHub;
    const fields = resource?.workflowFields || [];
    const preview = resource?.workflowPreview || { imageSlots: resource?.imageBindings?.length || 0, videoSlots: resource?.videoBindings?.length || 0, audioSlots: resource?.audioBindings?.length || 0 };

    return (
        <Modal
            open={open}
            centered
            width={820}
            title={draft ? `预览 RunningHub ${draft.kind === "app" ? "AI 应用" : "工作流"}` : "导入 RunningHub"}
            onCancel={onClose}
            footer={
                draft
                    ? [
                          <Button key="back" onClick={() => setDraft(null)}>重新读取</Button>,
                          <Button key="cancel" onClick={onClose}>取消</Button>,
                          <Button key="apply" type="primary" onClick={applyDraft}>保存并应用</Button>,
                      ]
                    : [
                          <Button key="cancel" onClick={onClose}>取消</Button>,
                          <Button key="read" type="primary" icon={<Download className="size-4" />} loading={reading} onClick={() => void readImport()}>读取并预览</Button>,
                      ]
            }
        >
            {draft ? (
                <WorkflowPreview draft={draft} fields={fields} preview={preview} onNameChange={updateDraftName} onCapabilityChange={updateDraftCapability} onFieldChange={updateDraftField} />
            ) : (
                <div className="space-y-4">
                    <label className="block"><span className="mb-1 block text-sm font-medium">RunningHub 站点与渠道</span><Select className="w-full" value={channel?.id} onChange={setChannelId} disabled={reading} options={runningHubChannels.map((item) => ({ value: item.id, label: `${runningHubSiteFromBaseUrl(item.baseUrl) === "ai" ? "国际站 AI" : "国内站 CN"} · ${item.name}` }))} placeholder="先添加 RunningHub 渠道" /></label>
                    <Segmented block value={kind} onChange={(value) => { setKind(value as ImportKind); setSource(""); setWorkflowFile(null); }} options={[{ value: "workflow", label: <span className="inline-flex items-center gap-1.5"><Workflow className="size-4" />云端工作流</span> }, { value: "app", label: <span className="inline-flex items-center gap-1.5"><AppWindow className="size-4" />AI 应用</span> }]} />
                    <p className="m-0 text-sm text-stone-500">{kind === "app" ? "读取 AI 应用实际公开的 nodeInfoList，生成精确的提示词、图片、视频、音频端口与参数预览；不会创建任务或改动渠道。" : "以 RH 返回的 API 图建立可提交端口与参数；完整工作流 JSON 只补充节点诊断。读取不会创建任务。"}</p>
                    <Input value={source} onChange={(event) => setSource(event.target.value)} onPressEnter={() => void readImport()} placeholder={kind === "app" ? `${RUNNINGHUB_SITES[runningHubSiteFromBaseUrl(channel?.baseUrl || "")].baseUrl}/ai-detail/… 或 AI 应用 API 手册链接` : `${RUNNINGHUB_SITES[runningHubSiteFromBaseUrl(channel?.baseUrl || "")].baseUrl}/call-api/api-detail/…`} />
                    {kind === "workflow" ? <><Upload accept="application/json,.json" maxCount={1} fileList={workflowFile ? [workflowFile] : []} beforeUpload={() => false} onChange={({ file }) => setWorkflowFile(file)} onRemove={() => { setWorkflowFile(null); return true; }}>
                        <Button icon={<UploadCloud className="size-4" />}>上传完整工作流 JSON（补充节点诊断）</Button>
                    </Upload>
                    <div className="rounded-lg border border-dashed p-3 text-xs text-stone-500">可上传从 RH 导出的完整 JSON 查看更多节点和连线；只有 API 图中存在的字段会成为可提交参数或素材槽。</div></> : <div className="rounded-lg border border-dashed p-3 text-xs text-stone-500">AI 应用不上传工作流 JSON。只以 RunningHub 返回的公开字段建立节点，不把应用名称或网页表单猜成 API 参数。</div>}
                </div>
            )}
        </Modal>
    );
}

function WorkflowPreview({ draft, fields, preview, onNameChange, onCapabilityChange, onFieldChange }: { draft: WorkflowDraft; fields: RunningHubWorkflowField[]; preview: { imageSlots: number; videoSlots: number; audioSlots: number; secondPassFieldKey?: string }; onNameChange: (name: string) => void; onCapabilityChange: (capability: "image" | "video" | "audio") => void; onFieldChange: (key: string, value: RunningHubWorkflowFieldValue) => void }) {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <label className="block"><span className="mb-1.5 block text-sm font-medium">{draft.kind === "app" ? "AI 应用名称" : "工作流名称"}</span><Input value={draft.name} onChange={(event) => onNameChange(event.target.value)} /></label>
                <span className="mb-2 inline-flex items-center gap-1 text-xs text-stone-500">{draft.kind === "app" ? <AppWindow className="size-4" /> : <FileJson className="size-4" />}{draft.kind === "app" ? `${draft.model.capability === "video" ? "视频" : draft.model.capability === "audio" ? "音频" : "图像"}应用 · ${draft.target}` : draft.fromJson ? "完整 JSON 预览" : "API 格式预览"}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <SlotSummary label="参考图槽位" count={preview.imageSlots} />
                <SlotSummary label="参考视频槽位" count={preview.videoSlots} />
                <SlotSummary label="参考音频槽位" count={preview.audioSlots} />
            </div>
            {draft.kind === "workflow" ? <label className="block text-sm"><span className="mb-1 block font-medium">输出类型</span><Select className="w-full" value={draft.model.capability === "text" ? "video" : draft.model.capability} onChange={onCapabilityChange} options={[{ value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "audio", label: "音频" }]} /><span className="mt-1 block text-xs text-stone-500">根据 API 图自动识别；自定义输出节点未识别时可在保存前手动更正。</span></label> : null}
            <div className="rounded-xl border bg-stone-50/60 p-4 dark:bg-white/[0.03]">
                <div className="mb-1 font-medium">{draft.kind === "app" ? "AI 应用参数预览" : "工作流参数预览"}</div>
                <p className="mb-3 text-xs text-stone-500">这里改的是导入后的默认值；保存后仍可在画布节点中按次覆盖。素材字段在画布里按编号连接，不与参数混在一起。</p>
                <div className="grid grid-cols-2 gap-3">
                    {fields.map((field) => <label key={field.key} className="block"><span className="mb-1 block text-xs font-medium">{field.label}</span>{field.type === "boolean" ? <Switch aria-label={field.label} checked={Boolean(field.defaultValue)} onChange={(value) => onFieldChange(field.key, value)} /> : field.type === "select" && field.options?.length ? <Select aria-label={field.label} className="w-full" value={field.defaultValue as string | number} options={field.options.map((value) => ({ value, label: field.optionLabels?.[String(value)] || String(value) }))} onChange={(value) => onFieldChange(field.key, value)} /> : field.type === "number" ? <InputNumber aria-label={field.label} className="w-full" value={Number(field.defaultValue)} min={field.min} max={field.max} step={field.step} onChange={(value) => onFieldChange(field.key, value ?? field.defaultValue)} /> : <Input value={String(field.defaultValue)} onChange={(event) => onFieldChange(field.key, event.target.value)} />}</label>)}
                </div>
            </div>
            {draft.kind === "workflow" ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-stone-600 dark:text-stone-300">二采倍数是可提交的节点参数。若工作流网页中的“二采开关”属于分组/前端逻辑，RunningHub API 不支持直接切换；只有 API-format 明确暴露的字段才会随保存后的任务提交。</div> : <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-stone-600 dark:text-stone-300">仅保存 AI 应用实际开放的字段。保存后会出现在画布的“工作流节点库 → AI 应用”中，连接素材后再运行。</div>}
        </div>
    );
}

function SlotSummary({ label, count }: { label: string; count: number }) {
    return <div className="rounded-xl border p-3"><div className="text-xs text-stone-500">{label}</div><div className="mt-1 text-2xl font-semibold">{count}</div></div>;
}
