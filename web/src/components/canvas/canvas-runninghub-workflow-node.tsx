import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Button, Switch } from "antd";
import { FileText, Image as ImageIcon, Link2, Music2, Play, Square, Upload, Video } from "lucide-react";

import { canvasBackgroundPalette, canvasThemes, canvasTitleBackground, type CanvasBackgroundTone } from "@/lib/canvas-theme";
import { CanvasRunningHubWorkflowParameterFields, CanvasRunningHubWorkflowSelect, CanvasRunningHubWorkflowSettingsPopover } from "@/components/canvas/canvas-runninghub-workflow-settings-popover";
import { runningHubWorkflowPortIdentity, type RunningHubWorkflowPortKind } from "@/components/canvas/canvas-runninghub-workflow-ports";
import { RUNNING_HUB_WORKFLOW_INSTANCE_TYPES, resolveRunningHubWorkflowMaterialEnabledPorts, resolveRunningHubWorkflowRunOptions, runningHubWorkflowInstanceLabel } from "@/components/canvas/runninghub-workflow-settings";
import { findChannelModel, type AiConfig, type RunningHubNodeBinding, type RunningHubResource, type RunningHubWorkflowField, type RunningHubWorkflowFieldValue } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type WorkflowNodeProps = {
    node: CanvasNodeData;
    backgroundTone: CanvasBackgroundTone;
    resource: RunningHubResource;
    config: AiConfig;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    isRunning: boolean;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onConnectStart: (event: ReactMouseEvent, portId: string) => void;
    onDisconnect: (portId: string) => void;
    onUpload: (file: File, portId: string, kind: "image" | "video" | "audio") => void;
};

type WorkflowSlot = { kind: "image" | "video" | "audio"; index: number; order: number; binding: RunningHubNodeBinding };
export const RUNNING_HUB_WORKFLOW_NODE_WIDTH = 720;

export function runningHubWorkflowCardHeight(resource?: RunningHubResource, portsOpen = false, visibleFieldKeys?: string[]) {
    const imageSlots = resource?.imageBindings?.length || (resource?.imageBinding ? 1 : 0);
    const videoSlots = resource?.videoBindings?.length || 0;
    const audioSlots = resource?.audioBindings?.length || 0;
    const slots = imageSlots + videoSlots + audioSlots;
    const hasPrompt = Boolean(resource?.promptBinding);
    const mediaKinds = [imageSlots, videoSlots, audioSlots].filter(Boolean).length;
    const fields = (resource?.workflowFields || []).filter((field) => !visibleFieldKeys || visibleFieldKeys.includes(field.key));
    const wideFields = fields.filter((field) => field.fieldName === "noise_seed" || /二采|倍数/i.test(field.label)).length;
    const parameterRows = Math.ceil((fields.length - wideFields) / 2) + wideFields;
    const materialHeight = portsOpen ? (slots + (hasPrompt ? 1 : 0)) * 40 : 24 + (hasPrompt ? 52 : 0) + (hasPrompt && mediaKinds ? 8 : 0) + (mediaKinds ? 56 : 0);
    const estimatedHeight = 56 + materialHeight + (fields.length ? 42 + parameterRows * 116 : 0) + 76;
    return Math.min(940, Math.max(520, estimatedHeight));
}

export function CanvasRunningHubWorkflowNode({ node, backgroundTone, resource, config, nodes, connections, isRunning, onConfigChange, onGenerate, onStop, onConnectStart, onDisconnect, onUpload }: WorkflowNodeProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleBackground = canvasTitleBackground(colorTheme, backgroundTone);
    const titleBorder = canvasBackgroundPalette(colorTheme, backgroundTone).swatch;
    const capability = findChannelModel(config, node.metadata?.model || config.model)?.model.capability || "video";
    const isApp = resource.kind === "app";
    const OutputIcon = capability === "image" ? ImageIcon : capability === "audio" ? Music2 : capability === "text" ? FileText : Video;
    const outputLabel = capability === "image" ? "图片结果" : capability === "audio" ? "音频结果" : capability === "text" ? "文本结果" : "视频结果";
    const imageBindings = resource.imageBindings?.length ? resource.imageBindings : resource.imageBinding ? [resource.imageBinding] : [];
    const videoBindings = resource.videoBindings || [];
    const audioBindings = resource.audioBindings || [];
    const slots = useMemo<WorkflowSlot[]>(() => [
        ...imageBindings.map((binding, index) => ({ kind: "image" as const, index, order: index, binding })),
        ...videoBindings.map((binding, index) => ({ kind: "video" as const, index, order: imageBindings.length + index, binding })),
        ...audioBindings.map((binding, index) => ({ kind: "audio" as const, index, order: imageBindings.length + videoBindings.length + index, binding })),
    ], [audioBindings, imageBindings, videoBindings]);
    const byNodeId = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
    const sourceByPort = useMemo(() => new Map(connections.filter((item) => item.toNodeId === node.id && item.toPort).flatMap((item) => {
        const source = byNodeId.get(item.fromNodeId);
        return source && item.toPort ? [[item.toPort, source] as const] : [];
    })), [byNodeId, connections, node.id]);
    const legacyInputCount = connections.filter((item) => item.toNodeId === node.id && !item.toPort).length;
    const promptSource = sourceByPort.get("prompt:0");
    const sourceForSlot = (slot: WorkflowSlot) => sourceByPort.get(slotPort(slot)) || sourceByPort.get(legacySlotPort(slot));
    const materialSlots = slots.map((slot) => ({ portId: slotPort(slot), kind: slot.kind, index: slot.index, nodeId: slot.binding.nodeId, fieldName: slot.binding.fieldName, connected: Boolean(sourceForSlot(slot)) }));
    const enabledMaterialPorts = resolveRunningHubWorkflowMaterialEnabledPorts(materialSlots, node.metadata?.runningHubWorkflowEnabledPorts);
    const materialPortEnabled = (slot: WorkflowSlot) => enabledMaterialPorts.includes(runningHubWorkflowPortIdentity(slotPort(slot)) || slotPort(slot));
    const allWorkflowFields = resource.workflowFields || [];
    const visibleFieldKeys = new Set(node.metadata?.runningHubWorkflowVisibleFieldKeys || allWorkflowFields.map((field) => field.key));
    const workflowFields = allWorkflowFields.filter((field) => visibleFieldKeys.has(field.key));
    const runOptions = resolveRunningHubWorkflowRunOptions(node.metadata?.runningHubWorkflowRunOptions);
    const manualPortsOpen = Boolean(node.metadata?.runningHubWorkflowPortsOpen);
    const portsOpen = manualPortsOpen;
    const visibleSlots = slots;
    const showPrompt = Boolean(resource.promptBinding);
    const connectedImages = slots.filter((slot) => slot.kind === "image" && materialPortEnabled(slot) && sourceForSlot(slot)).length;
    const connectedVideos = slots.filter((slot) => slot.kind === "video" && materialPortEnabled(slot) && sourceForSlot(slot)).length;
    const connectedAudios = slots.filter((slot) => slot.kind === "audio" && materialPortEnabled(slot) && sourceForSlot(slot)).length;
    const handleRunButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isRunning) onStop(node.id);
        else onGenerate(node.id);
    };
    const setWorkflowField = (field: RunningHubWorkflowField, value: RunningHubWorkflowFieldValue | null) => onConfigChange(node.id, { runningHubWorkflowValues: { ...(node.metadata?.runningHubWorkflowValues || {}), [field.key]: value ?? "" } });
    const clearWorkflowField = (field: RunningHubWorkflowField) => {
        const runningHubWorkflowValues = { ...(node.metadata?.runningHubWorkflowValues || {}) };
        delete runningHubWorkflowValues[field.key];
        onConfigChange(node.id, { runningHubWorkflowValues });
    };
    const setRunOptions = (patch: Partial<typeof runOptions>) => onConfigChange(node.id, { runningHubWorkflowRunOptions: { ...runOptions, ...patch } });
    const setMaterialEnabled = (slot: WorkflowSlot, enabled: boolean) => {
        const portId = runningHubWorkflowPortIdentity(slotPort(slot)) || slotPort(slot);
        const next = new Set(enabledMaterialPorts);
        if (enabled) next.add(portId);
        else next.delete(portId);
        onConfigChange(node.id, { runningHubWorkflowEnabledPorts: [...next] });
    };

    return <div className="flex h-full w-full flex-col overflow-hidden rounded-[inherit] text-base" style={{ background: theme.toolbar.panel, color: theme.node.text }} data-canvas-no-zoom data-runninghub-workflow-node data-rh-workflow-primary>
        <header className="relative flex h-14 shrink-0 items-center gap-3 border-b px-4" style={{ background: titleBackground, borderColor: titleBorder, boxShadow: `inset 0 -1px 0 color-mix(in srgb, ${theme.node.text} 24%, transparent)` }}>
            <span className="grid size-7 place-items-center rounded-md" style={{ background: theme.node.fill }}><OutputIcon className="size-4" /></span>
            <div className="min-w-0 flex-1"><div className="truncate text-xl font-semibold">{node.title || `RunningHub ${resource.kind === "app" ? "AI 应用" : "工作流"}`}</div></div>
            <span className="shrink-0 text-sm opacity-60">{isRunning ? "运行中" : legacyInputCount ? `待重连 ${legacyInputCount}` : "就绪"}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto" onWheel={(event) => event.stopPropagation()}>
            {portsOpen ? <div>
                {showPrompt ? <PromptRow source={promptSource} onConnectStart={onConnectStart} onDisconnect={onDisconnect} /> : null}
                {visibleSlots.map((slot) => <WorkflowSlotRow key={slotPort(slot)} slot={slot} source={sourceByPort.get(slotPort(slot))} legacySource={sourceByPort.get(legacySlotPort(slot))} enabled={materialPortEnabled(slot)} onMaterialEnabledChange={(enabled) => setMaterialEnabled(slot, enabled)} onConnectStart={onConnectStart} onDisconnect={onDisconnect} onUpload={onUpload} />)}
            </div> : <WorkflowSummary showPrompt={showPrompt} promptSource={promptSource} imageCount={connectedImages} imageSlots={imageBindings.length} videoCount={connectedVideos} videoSlots={videoBindings.length} audioCount={connectedAudios} audioSlots={audioBindings.length} />}
            {workflowFields.length ? <section className="border-t p-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="mb-2 flex items-center gap-2 text-sm"><span className="grid size-5 place-items-center rounded" style={{ background: theme.node.fill }}>#</span><b>生成参数</b><span className="ml-auto opacity-60">{workflowFields.length} 项 · 真实 nodeInfoList</span>{Object.keys(node.metadata?.runningHubWorkflowValues || {}).length ? <button type="button" className="opacity-60 hover:opacity-100" onMouseDown={(event) => event.stopPropagation()} onClick={() => onConfigChange(node.id, { runningHubWorkflowValues: {} })}>恢复默认</button> : null}</div>
                <CanvasRunningHubWorkflowParameterFields fields={workflowFields} values={node.metadata?.runningHubWorkflowValues} theme={theme} onChange={setWorkflowField} onClear={clearWorkflowField} className="grid grid-cols-2 gap-2" />
            </section> : null}
            <div className="relative flex h-9 items-center gap-2 border-t px-4 text-sm" style={{ borderColor: theme.toolbar.border }}><span className="ml-auto opacity-65">运行后创建输出节点</span><span className="grid size-5 place-items-center rounded" style={{ background: theme.node.fill }}><OutputIcon className="size-3.5" /></span><b>{outputLabel}</b><span className="absolute right-[-16px] top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full border-2" style={{ background: theme.toolbar.panel, borderColor: theme.node.activeStroke }} /></div>
        </div>
        <footer className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-t px-3 py-1.5" style={{ borderColor: theme.toolbar.border }}>
            <div className="flex items-center gap-1">
                <button type="button" className="inline-flex h-7 items-center gap-1 rounded px-2 text-sm opacity-75 transition hover:opacity-100" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onConfigChange(node.id, { runningHubWorkflowPortsOpen: !manualPortsOpen }); }}><Link2 className="size-3" />{manualPortsOpen ? "收起端口" : "连接素材"}</button>
                {node.metadata?.runningHubWorkflowEnabledPorts ? <button type="button" className="inline-flex h-7 items-center rounded px-2 text-sm opacity-60 hover:opacity-100" onMouseDown={(event) => event.stopPropagation()} onClick={() => onConfigChange(node.id, { runningHubWorkflowEnabledPorts: undefined })}>自动素材</button> : null}
                <CanvasRunningHubWorkflowSettingsPopover config={config} values={node.metadata?.runningHubWorkflowValues} runOptions={node.metadata?.runningHubWorkflowRunOptions} onRunOptionsChange={(runningHubWorkflowRunOptions) => onConfigChange(node.id, { runningHubWorkflowRunOptions })} visibleFieldKeys={node.metadata?.runningHubWorkflowVisibleFieldKeys} onVisibleFieldKeysChange={(runningHubWorkflowVisibleFieldKeys) => onConfigChange(node.id, { runningHubWorkflowVisibleFieldKeys })} placement="topLeft" buttonClassName="!h-7 !rounded-md !px-2 !text-sm" buttonLabel="映射" hideParameters hideMaterials onChange={(runningHubWorkflowValues) => onConfigChange(node.id, { runningHubWorkflowValues })} />
            </div>
            <div className="flex shrink-0 items-center gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                <CanvasRunningHubWorkflowSelect ariaLabel="运行实例" value={runOptions.instanceType} options={[...RUNNING_HUB_WORKFLOW_INSTANCE_TYPES]} optionLabels={Object.fromEntries(RUNNING_HUB_WORKFLOW_INSTANCE_TYPES.map((value) => [value, runningHubWorkflowInstanceLabel(value)]))} theme={theme} className="flex h-7 w-[118px] items-center justify-between rounded border px-2 text-left text-sm outline-none" menuMinWidth={118} onChange={(instanceType) => setRunOptions({ instanceType: instanceType as typeof runOptions.instanceType })} />
                <label className="inline-flex items-center gap-1 text-sm opacity-75" title="usePersonalQueue"><Switch aria-label="个人独占队列" size="small" checked={runOptions.usePersonalQueue} onChange={(usePersonalQueue) => setRunOptions({ usePersonalQueue })} />独占</label>
                {!isApp ? <label className="inline-flex items-center gap-1 text-sm opacity-75" title="addMetadata"><Switch aria-label="返回工作流元数据" size="small" checked={runOptions.addMetadata} onChange={(addMetadata) => setRunOptions({ addMetadata })} />元数据</label> : null}
                <Button type="primary" size="middle" className="!h-10 !min-w-[88px] !rounded-md !px-3 !text-base" danger={isRunning} icon={isRunning ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onClick={handleRunButtonClick}>{isRunning ? "停止" : "运行"}</Button>
            </div>
        </footer>
    </div>;
}

function WorkflowSummary({ showPrompt, promptSource, imageCount, imageSlots, videoCount, videoSlots, audioCount, audioSlots }: { showPrompt: boolean; promptSource?: CanvasNodeData; imageCount: number; imageSlots: number; videoCount: number; videoSlots: number; audioCount: number; audioSlots: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const promptConnected = Boolean(promptSource);
    const summaries = [
        imageSlots > 0 ? <SummaryCount key="image" kind="image" count={imageCount} total={imageSlots} /> : null,
        videoSlots > 0 ? <SummaryCount key="video" kind="video" count={videoCount} total={videoSlots} /> : null,
        audioSlots > 0 ? <SummaryCount key="audio" kind="audio" count={audioCount} total={audioSlots} /> : null,
    ].filter(Boolean);
    return <div className="border-b p-3" style={{ borderColor: theme.toolbar.border }}>
        {showPrompt ? <div className="flex h-[52px] items-center gap-3 rounded-lg border px-4" style={workflowInputStyle(theme, "prompt", promptConnected)} data-rh-input-state={promptConnected ? "connected" : "empty"}><span className="grid size-7 place-items-center rounded-md" style={{ background: `${portTone("prompt")}1d` }}><FileText className="size-4" style={{ color: portTone("prompt") }} /></span><div className="min-w-0"><div className="text-base font-semibold">提示词</div><div className="mt-0.5 truncate text-sm opacity-60">{promptSource?.title || "未连接"}</div></div><span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-sm" style={{ background: promptConnected ? `${portTone("prompt")}2e` : theme.node.fill, color: promptConnected ? portTone("prompt") : undefined }}>{promptConnected ? "已接入" : "未接入"}</span></div> : null}
        {summaries.length ? <div className={`${showPrompt ? "mt-2" : ""} grid gap-2`} style={{ gridTemplateColumns: `repeat(${summaries.length}, minmax(0, 1fr))` }}>{summaries}</div> : null}
    </div>;
}

function SummaryCount({ kind, count, total }: { kind: "image" | "video" | "audio"; count: number; total: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : Music2;
    const label = kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
    const connected = count > 0;
    return <div className="flex min-h-14 min-w-0 items-center gap-2 rounded-lg border px-3 py-2" style={workflowInputStyle(theme, kind, connected)} data-rh-summary-kind={kind} data-rh-input-state={connected ? "connected" : "empty"}>
        <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: `${portTone(kind)}1d` }}><Icon className="size-4" style={{ color: portTone(kind) }} /></span>
        <div className="min-w-0"><div className="text-base font-semibold">{label}</div><div className="mt-0.5 whitespace-nowrap text-sm" style={{ color: connected ? portTone(kind) : undefined, opacity: connected ? 0.9 : 0.6 }}>{connected ? `${count}/${total} 已接入` : "未接入"}</div></div>
    </div>;
}

function PromptRow({ source, onConnectStart, onDisconnect }: { source?: CanvasNodeData; onConnectStart: WorkflowNodeProps["onConnectStart"]; onDisconnect: (portId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const connected = Boolean(source);
    return <div className="relative flex h-10 items-center gap-2 border-b pl-8 pr-4 text-sm" style={workflowInputStyle(theme, "prompt", connected)} data-rh-input-state={connected ? "connected" : "empty"}><Port portId="prompt:0" kind="prompt" onConnectStart={onConnectStart} /><FileText className="size-3.5" style={{ color: portTone("prompt") }} /><b>提示词</b><span className="ml-auto max-w-28 truncate opacity-65">{source ? source.title : "未连接"}</span><span className="shrink-0 text-sm" style={{ color: connected ? portTone("prompt") : undefined, opacity: connected ? 0.95 : 0.6 }}>{connected ? "已接入" : "未接入"}</span>{source ? <button type="button" className="text-sm opacity-55 hover:opacity-100" onClick={() => onDisconnect("prompt:0")}>解除</button> : null}</div>;
}

function WorkflowSlotRow({ slot, source, legacySource, enabled, onMaterialEnabledChange, onConnectStart, onDisconnect, onUpload }: { slot: WorkflowSlot; source?: CanvasNodeData; legacySource?: CanvasNodeData; enabled: boolean; onMaterialEnabledChange: (enabled: boolean) => void; onConnectStart: WorkflowNodeProps["onConnectStart"]; onDisconnect: (portId: string) => void; onUpload: WorkflowNodeProps["onUpload"] }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const portId = slotPort(slot);
    const legacyPortId = legacySlotPort(slot);
    const connectedPortId = source ? portId : legacySource ? legacyPortId : portId;
    const connectedSource = source || legacySource;
    const Icon = slot.kind === "image" ? ImageIcon : slot.kind === "video" ? Video : Music2;
    const label = `${portLabel(slot.kind)} ${slot.index + 1}`;
    const accept = slot.kind === "image" ? "image/*" : slot.kind === "video" ? "video/*" : "audio/*";
    const connected = Boolean(connectedSource);
    return <div className="relative flex h-10 items-center gap-2 border-b pl-8 pr-4 text-sm" style={workflowInputStyle(theme, slot.kind, connected)} data-rh-port={portId} data-rh-port-kind={slot.kind} data-rh-input-state={connected ? "connected" : "empty"}><Port portId={portId} kind={slot.kind} onConnectStart={onConnectStart} /><Icon className="size-3.5" style={{ color: portTone(slot.kind) }} /><b>{label}</b><span className="font-mono text-xs opacity-45">#{slot.binding.nodeId}.{slot.binding.fieldName}</span><span className="ml-auto max-w-24 truncate opacity-65">{connectedSource?.title || "未连接"}</span><span className="shrink-0 text-sm" style={{ color: connected ? portTone(slot.kind) : undefined, opacity: connected ? 0.95 : 0.6 }}>{connected ? "已接入" : "未接入"}</span><span onMouseDown={(event) => event.stopPropagation()}><Switch aria-label={`${label} 开关`} size="small" checked={enabled} onChange={onMaterialEnabledChange} /></span>{connectedSource ? <button type="button" className="text-sm opacity-55 hover:opacity-100" onClick={() => onDisconnect(connectedPortId)}>解除</button> : <label className="cursor-pointer text-sm opacity-60 hover:opacity-100"><Upload className="inline size-3" /><input className="hidden" type="file" accept={accept} onClick={(event) => event.stopPropagation()} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, portId, slot.kind); event.currentTarget.value = ""; }} /></label>}</div>;
}

function slotPort(slot: WorkflowSlot) { return `${slot.kind}:${slot.index}:${slot.order}:${slot.binding.nodeId}.${slot.binding.fieldName}`; }
function legacySlotPort(slot: WorkflowSlot) { return `${slot.kind}:${slot.index}:${slot.binding.nodeId}.${slot.binding.fieldName}`; }

function portLabel(kind?: RunningHubWorkflowPortKind) {
    return kind === "prompt" ? "提示词" : kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "素材";
}

function portTone(kind: RunningHubWorkflowPortKind) {
    return kind === "prompt" ? "#b78cff" : kind === "image" ? "#f2ad45" : kind === "video" ? "#46c7ad" : "#7ea8ff";
}

function workflowInputStyle(theme: (typeof canvasThemes)[keyof typeof canvasThemes], kind: RunningHubWorkflowPortKind, connected: boolean) {
    if (!connected) return { background: theme.node.fill, borderColor: theme.toolbar.border };
    const color = portTone(kind);
    return { background: `linear-gradient(90deg, ${color}2b, ${color}10)`, borderColor: `${color}b3`, boxShadow: `inset 3px 0 0 ${color}` };
}

function Port({ portId, kind, auto = false, onConnectStart }: { portId: string; kind: RunningHubWorkflowPortKind; auto?: boolean; onConnectStart: WorkflowNodeProps["onConnectStart"] }) {
    const color = portTone(kind);
    const hitWidth = 40;
    const hitHeight = 40;
    const [marker, setMarker] = useState({ x: 0, y: 0 });
    const moveMarker = (event: ReactMouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setMarker({
            x: (event.clientX - rect.left - rect.width / 2) * (hitWidth / Math.max(rect.width, 1)),
            y: (event.clientY - rect.top - rect.height / 2) * (hitHeight / Math.max(rect.height, 1)),
        });
    };
    const clearMarker = () => setMarker({ x: 0, y: 0 });

    return <div data-canvas-connection-zone="runninghub-row" data-rh-port={portId} data-rh-port-kind={kind} data-rh-auto-port={auto ? "true" : undefined} className="absolute -left-2 top-0 z-10 flex h-full w-10 cursor-crosshair items-center justify-center" onMouseMove={moveMarker} onMouseLeave={clearMarker}>
        <button type="button" aria-label={`连接${portLabel(kind)}端口`} title={`拖拽连接${portLabel(kind)}端口`} data-rh-port={portId} data-rh-port-kind={kind} data-rh-auto-port={auto ? "true" : undefined} className="grid size-4 place-items-center rounded-full border-2 text-xs" style={{ background: "var(--canvas-port-bg, #171717)", borderColor: color, color, transform: `translate(${marker.x}px, ${marker.y}px)` }} onMouseDown={(event) => { if (event.button === 0) onConnectStart(event, portId); }} onClick={(event) => event.stopPropagation()}>+</button>
    </div>;
}
