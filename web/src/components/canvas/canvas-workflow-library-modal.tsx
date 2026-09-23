import { useEffect, useMemo, useRef, useState } from "react";
import { App, Empty, Input, Modal, Segmented } from "antd";
import { AppWindow, Cloud, Search, Trash2, Workflow } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { runningHubCoverUrl } from "@/lib/runninghub-cover";
import { useThemeStore } from "@/stores/use-theme-store";
import { encodeChannelModel, useConfigStore, useEffectiveConfig, type ChannelModel } from "@/stores/use-config-store";
import { fetchRunningHubWorkflowTitle } from "@/services/api/image";

export type CanvasWorkflowLibraryItem = {
    id: string;
    title: string;
    channelName: string;
    model: ChannelModel;
};

type LibraryTab = "all" | "workflow" | "app";
type MediaTab = "all" | "video" | "image";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

export function CanvasWorkflowLibraryModal({ open, onClose, onAdd, onDelete }: { open: boolean; onClose: () => void; onAdd: (item: CanvasWorkflowLibraryItem) => void; onDelete: (item: CanvasWorkflowLibraryItem) => void }) {
    const { modal, message } = App.useApp();
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [tab, setTab] = useState<LibraryTab>("all");
    const [mediaTab, setMediaTab] = useState<MediaTab>("all");
    const [search, setSearch] = useState("");
    const items = useMemo<CanvasWorkflowLibraryItem[]>(
        () =>
            config.channels.flatMap((channel) =>
                channel.models.flatMap((model) => {
                    const kind = model.runningHub?.kind;
                    if (channel.apiFormat !== "runninghub" || (kind !== "workflow" && kind !== "app")) return [];
                    return [{ id: encodeChannelModel(channel.id, model.name), title: model.runningHub?.title || model.name, channelName: channel.name, model }];
                }),
            ),
        [config.channels],
    );
    const refreshedTitlesRef = useRef(new Set<string>());
    useEffect(() => {
        if (!open) return;
        const pending = items.filter((item) => item.model.runningHub?.kind === "workflow" && !item.model.runningHub.title && /^工作流\s+\d+$/.test(item.model.name) && !refreshedTitlesRef.current.has(item.model.runningHub.target));
        pending.forEach((item) => refreshedTitlesRef.current.add(item.model.runningHub!.target));
        if (!pending.length) return;
        void Promise.all(pending.map(async (item) => ({ item, title: await fetchRunningHubWorkflowTitle(item.model.runningHub!.target).catch(() => "") }))).then((resolved) => {
            const updates = new Map(resolved.filter((entry) => entry.title).map((entry) => [entry.item.model.runningHub!.target, entry.title]));
            if (!updates.size) return;
            updateConfig("channels", config.channels.map((channel) => ({ ...channel, models: channel.models.map((model) => {
                const title = model.runningHub?.target ? updates.get(model.runningHub.target) : undefined;
                return title && model.runningHub?.kind === "workflow" ? { ...model, runningHub: { ...model.runningHub, title } } : model;
            }) })));
        });
    }, [config.channels, items, open, updateConfig]);
    const visible = items.filter(
        (item) =>
            (tab === "all" || item.model.runningHub?.kind === tab) &&
            (mediaTab === "all" || item.model.capability === mediaTab) &&
            `${item.title} ${item.channelName}`.toLowerCase().includes(search.trim().toLowerCase()),
    );
    const confirmDelete = (item: CanvasWorkflowLibraryItem) => {
        modal.confirm({
            title: `删除${item.model.runningHub?.kind === "app" ? " AI 应用" : "工作流"}`,
            content: `确定从工作流节点库中删除“${item.title}”？删除后不会影响已经添加到画布的节点。`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                onDelete(item);
                message.success(`已删除：${item.title}`);
            },
        });
    };

    return (
        <Modal open={open} centered width={820} footer={null} onCancel={onClose} title={<span className="inline-flex items-center gap-2"><Workflow className="size-5" />工作流节点库</span>}>
            <p className="mt-0 text-sm opacity-60">选择工作流添加到画布；首次运行时才会校验消费级 Key，不会重新拉取模型。</p>
            <div className="mt-5 border-b pb-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="text-lg font-semibold">我的云端工作流</div>
                <div className="mt-1 text-sm opacity-60">来自渠道设置中已经保存的 RunningHub AI 应用和工作流。</div>
            </div>
            <Segmented className="mt-4" value={tab} onChange={(value) => setTab(value as typeof tab)} options={[{ value: "all", label: "全部" }, { value: "workflow", label: "工作流" }, { value: "app", label: "AI 应用" }]} />
            <Segmented className="mt-3" value={mediaTab} onChange={(value) => setMediaTab(value as MediaTab)} options={[{ value: "all", label: "全部类型" }, { value: "video", label: "视频" }, { value: "image", label: "图片" }]} />
            <Input className="mt-4" value={search} onChange={(event) => setSearch(event.target.value)} allowClear placeholder="搜索已添加的云端工作流或 AI 应用" prefix={<Search className="size-4 opacity-50" />} />
            <div className="mt-4 grid max-h-[52vh] grid-cols-[repeat(auto-fill,minmax(184px,1fr))] items-start gap-3 overflow-y-auto pr-1 thin-scrollbar">
                {visible.map((item) => <WorkflowLibraryCard key={item.id} item={item} onClick={() => onAdd(item)} onDelete={() => confirmDelete(item)} />)}
            </div>
            {!visible.length ? <Empty className="py-10" image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === "app" ? "尚未添加 RunningHub AI 应用" : tab === "workflow" ? "尚未添加 RunningHub 云端工作流" : "尚未添加 RunningHub 云端项目"}><span className="text-xs opacity-60">请先在渠道设置中导入并保存。</span></Empty> : null}
            <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs opacity-55" style={{ borderColor: theme.toolbar.border }}><Cloud className="size-3.5" />仅列出当前渠道设置中已保存的 RunningHub 项目</div>
        </Modal>
    );
}

function WorkflowLibraryCard({ item, onClick, onDelete }: { item: CanvasWorkflowLibraryItem; onClick: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const resource = item.model.runningHub!;
    const isWorkflow = resource.kind === "workflow";
    const inputs = (resource.promptBinding ? 1 : 0) + (resource.imageBindings?.length || 0) + (resource.videoBindings?.length || 0) + (resource.audioBindings?.length || 0);
    return <div className="group relative overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-lg" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
        <button type="button" onClick={onClick} title={`添加 ${item.title} 到画布`} className="block w-full text-left">
            <RunningHubCoverCard url={runningHubCoverUrl(resource.kind, resource.target)} title={item.title} icon={isWorkflow ? Workflow : AppWindow} theme={theme} />
            <div className="p-3"><div className="truncate pr-8 text-sm font-semibold">{item.title}</div><div className="mt-1 truncate text-xs opacity-55">{item.channelName} · {isWorkflow ? "云端工作流" : "AI 应用"}</div><div className="mt-3 flex items-center justify-between text-xs"><span>{resource.workflowFields?.length || 0} 个参数</span><span>{inputs} 个输入</span></div></div>
        </button>
        <button type="button" aria-label={`删除 ${item.title}`} title="从节点库删除" onClick={onDelete} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white opacity-80 transition hover:bg-red-600 hover:opacity-100">
            <Trash2 className="size-4" />
        </button>
    </div>;
}

/**
 * 统一的 3:4 竖版封面框，与 RunningHub 应用广场一致：
 * 竖版素材原样铺满，非竖版素材居中裁切补齐，避免出现黑边或高度参差。
 * 首次取不到封面时追加时间戳重试一次，绕过浏览器缓存的旧 404。
 */
function RunningHubCoverCard({ url, title, icon: Icon, theme }: { url?: string; title: string; icon: typeof Workflow; theme: CanvasTheme }) {
    const [cover, setCover] = useState<{ src?: string; retried: boolean }>({ src: url, retried: false });
    useEffect(() => setCover({ src: url, retried: false }), [url]);
    return <div className="relative w-full overflow-hidden" style={{ background: theme.node.fill, aspectRatio: "3 / 4" }}>
        <span className="absolute inset-0 grid place-items-center"><Icon className="size-8 opacity-45" /></span>
        {cover.src ? (
            <img
                src={cover.src}
                alt={`${title} 封面`}
                loading="lazy"
                className="absolute inset-0 size-full object-cover object-center transition duration-500 group-hover:scale-[1.03]"
                onError={() =>
                    setCover((prev) => (prev.retried || !url ? { src: undefined, retried: true } : { src: `${url}${url.includes("?") ? "&" : "?"}retry=${Date.now()}`, retried: true }))
                }
            />
        ) : null}
    </div>;
}
