import type { CSSProperties } from "react";
import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Square, Video } from "lucide-react";
import { Button, Segmented } from "antd";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, findChannelModel, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes, type CanvasBackgroundTone } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasRunningHubWorkflowSettingsPopover, hasRunningHubWorkflowSettings } from "./canvas-runninghub-workflow-settings-popover";
import { CanvasRunningHubWorkflowNode } from "./canvas-runninghub-workflow-node";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import type { CanvasConnection, CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    backgroundTone: CanvasBackgroundTone;
    isRunning: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
    nodes?: CanvasNodeData[];
    connections?: CanvasConnection[];
    onConnectStart?: (event: React.MouseEvent, portId: string) => void;
    onDisconnectPort?: (portId: string) => void;
    onUploadToPort?: (file: File, portId: string, kind: "image" | "video" | "audio") => void;
};

export function CanvasConfigNodePanel({ node, backgroundTone, isRunning, inputSummary, onConfigChange, onGenerate, onStop, onComposerToggle, nodes = [], connections = [], onConnectStart, onDisconnectPort, onUploadToPort }: CanvasConfigNodePanelProps) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const config = buildNodeConfig(globalConfig, node, mode);
    const selectedResource = findChannelModel(config, config.model)?.model.runningHub;
    const workflow = selectedResource?.kind === "workflow" || selectedResource?.kind === "app" ? selectedResource : undefined;
    const isRunningHubWorkflow = Boolean(workflow);
    const workflowPreview = workflow?.workflowPreview;
    const workflowNodeId = workflow?.workflowFields?.find((field) => field.fieldName === "ref_image_size")?.nodeId || workflow?.workflowFields?.[0]?.nodeId;
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const canGenerate = hasComposerContent || (mode === "audio" ? inputSummary.textCount > 0 : hasAnyInput);

    if (isRunningHubWorkflow && workflow) {
        return <CanvasRunningHubWorkflowNode
            node={node}
            backgroundTone={backgroundTone}
            resource={workflow}
            config={config}
            nodes={nodes}
            connections={connections}
            isRunning={isRunning}
            onConfigChange={onConfigChange}
            onGenerate={onGenerate}
            onStop={onStop}
            onConnectStart={onConnectStart || (() => {})}
            onDisconnect={onDisconnectPort || (() => {})}
            onUpload={onUploadToPort || (() => {})}
        />;
    }

    return (
        <div className="canvas-config-node-panel flex h-full w-full cursor-move flex-col px-4 pb-5 pt-8 text-[26px]" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0 shrink">
                    <div className="truncate text-[32px] font-semibold">{isRunningHubWorkflow ? node.title || "RunningHub 工作流" : t("canvas.configNode.title")}</div>
                    {isRunningHubWorkflow ? <div className="mt-1 text-sm opacity-55">{workflowNodeId ? `真实工作流节点 #${workflowNodeId}` : "RunningHub 工作流"} · {workflow?.workflowFields?.length || 0} 个可提交参数</div> : null}
                </div>
                <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        size="middle"
                        className="canvas-config-mode !h-11 !rounded-md !p-1"
                        value={mode}
                        onChange={(value) => onConfigChange(node.id, { generationMode: value as CanvasGenerationMode })}
                        options={[
                            {
                                value: "image",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <ImageIcon className="size-4" />
                                        {t("canvas.configNode.image")}
                                    </span>
                                ),
                            },
                            {
                                value: "text",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <MessageSquare className="size-4" />
                                        {t("canvas.configNode.text")}
                                    </span>
                                ),
                            },
                            {
                                value: "video",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Video className="size-4" />
                                        {t("canvas.configNode.video")}
                                    </span>
                                ),
                            },
                            {
                                value: "audio",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Music2 className="size-4" />
                                        {t("canvas.configNode.audio")}
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
                <InputChip label={t("canvas.configNode.prompt")} value={t("canvas.configNode.items", { count: inputSummary.textCount })} style={chipStyle} />
                <InputChip label={t("canvas.configNode.references")} value={isRunningHubWorkflow ? `${inputSummary.imageCount}/${workflowPreview?.imageSlots || 0}` : t("canvas.configNode.images", { count: inputSummary.imageCount })} style={chipStyle} />
                <InputChip label={t("canvas.configNode.videoReferences")} value={isRunningHubWorkflow ? `${inputSummary.videoCount}/${workflowPreview?.videoSlots || 0}` : t("canvas.configNode.items", { count: inputSummary.videoCount })} style={chipStyle} />
                <InputChip label={t("canvas.configNode.audioReferences")} value={isRunningHubWorkflow ? `${inputSummary.audioCount}/${workflowPreview?.audioSlots || 0}` : t("canvas.configNode.items", { count: inputSummary.audioCount })} style={chipStyle} />
                <button type="button" className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xl" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle}>
                    <Settings2 className="size-4" />
                    {t("canvas.configNode.compose")}
                </button>
            </div>

            <div className="mb-4 grid min-w-0 cursor-default grid-cols-[minmax(0,1fr)_180px] items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
                <ModelPicker className="canvas-compact-control h-11" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} fullWidth />
                {mode === "video" && hasRunningHubWorkflowSettings(config) ? (
                    <CanvasRunningHubWorkflowSettingsPopover
                        config={config}
                        values={node.metadata?.runningHubWorkflowValues}
                        placement="bottomRight"
                        buttonClassName="canvas-compact-control !h-11 !w-full !justify-start !rounded-lg !px-3"
                        onChange={(runningHubWorkflowValues) => onConfigChange(node.id, { runningHubWorkflowValues })}
                    />
                ) : mode === "video" ? (
                    <CanvasVideoSettingsPopover
                        config={config}
                        placement="topRight"
                        buttonClassName="canvas-compact-control !h-11 !w-full !justify-start !rounded-lg !px-3"
                        onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                    />
                ) : mode === "image" ? (
                    <CanvasImageSettingsPopover
                        config={config}
                        placement="topRight"
                        autoAdjustOverflow={false}
                        buttonClassName="canvas-compact-control !h-11 !w-full !justify-start !rounded-lg !px-3"
                        onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                    />
                ) : mode === "audio" ? (
                    <CanvasAudioSettingsPopover
                        config={config}
                        placement="topRight"
                        buttonClassName="canvas-compact-control !h-11 !w-full !justify-start !rounded-lg !px-3"
                        onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))}
                    />
                ) : (
                    <CanvasTextSettingsPopover
                        config={config}
                        count={node.metadata?.textCount || 1}
                        placement="topRight"
                        buttonClassName="canvas-compact-control !h-11 !w-full !justify-start !rounded-lg !px-3"
                        onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })}
                        onCountChange={(textCount) => onConfigChange(node.id, { textCount })}
                    />
                )}
            </div>

            <Button
                type="primary"
                className="mt-auto !h-11 !w-full !cursor-pointer !rounded-lg"
                danger={isRunning}
                disabled={!isRunning && !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id))}
            >
                <span className="inline-flex items-center gap-1.5">
                    {isRunning ? (
                        <>
                            <LoaderCircle className="size-4 animate-spin" />
                            <Square className="size-3.5 fill-current" />
                            <span>{t("canvas.configNode.stop")}</span>
                        </>
                    ) : (
                        <>
                            <Play className="size-4" />
                            <span>{t("canvas.configNode.generate")}</span>
                        </>
                    )}
                </span>
            </Button>
        </div>
    );
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-xl" style={style}>
            <span>{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    return {
        ...globalConfig,
        model: resolveModelForCapability(globalConfig, node.metadata?.model, mode),
        reasoningEffort: node.metadata?.reasoningEffort || globalConfig.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        imageResolution: node.metadata?.imageResolution || globalConfig.imageResolution || defaultConfig.imageResolution,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        background: node.metadata?.background ?? globalConfig.background ?? defaultConfig.background,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoMode: node.metadata?.videoMode || globalConfig.videoMode || defaultConfig.videoMode,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        runningHubWorkflowValues: node.metadata?.runningHubWorkflowValues,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
