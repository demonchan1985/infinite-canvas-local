import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { App, Button, Modal, Popover, Segmented, Tooltip } from "antd";
import { ChevronDown, Download, Ellipsis, FolderPlus, Image as ImageIcon, Info, LoaderCircle, MessageSquare, Minus, Music2, Plus, RefreshCw, Settings2, SlidersHorizontal, Smile, Sparkles, Trash2, Upload, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { useCopyText } from "@/hooks/use-copy-text";
import { readTextNodeImportFile, TEXT_NODE_IMPORT_ACCEPT } from "@/lib/canvas/canvas-text-node-import";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasTextTag, type ViewportTransform } from "@/types/canvas";
import type { CanvasNodeToolbarItem } from "@/types/canvas-plugin";
import type { CanvasViewMode } from "@/stores/canvas/use-canvas-workspace-store";
import { ImageToolSettingsModal, type ImageToolbarSettingsTool } from "./canvas-image-toolbar-settings-modal";
import { IMAGE_QUICK_TOOLS_STORAGE_KEY, buildImageToolbarTools, defaultImageQuickToolIds, readImageQuickToolsConfig, type ImageQuickToolId } from "./canvas-image-toolbar-tools";
import { CanvasTextNodeTags } from "./canvas-text-node-tags";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onTextImport: (nodeId: string, content: string, mode: "replace" | "append") => void;
    onTextTagsChange: (nodeId: string, tags: CanvasTextTag[]) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onAnalyzeVideo: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    superResolveContent?: ReactNode;
    superResolveOpen?: boolean;
    onSuperResolveOpenChange?: (open: boolean) => void;
    onAngle: (node: CanvasNodeData) => void;
    onPersonAdjust: (node: CanvasNodeData, mode?: "emotion" | "texture") => void;
    onViewImage: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    viewMode: CanvasViewMode;
    extraTools?: CanvasNodeToolbarItem[];
};

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    suffix?: ReactNode;
    disabled?: boolean;
};

const professionalImageToolbarOrder = [
    "retry",
    "maskEdit",
    "personAdjust",
    "angle",
    "superResolve",
    "replace",
    "crop",
    "split",
    "upscale",
    "copyPrompt",
    "reversePrompt",
    "resize",
    "view",
    "download",
    "saveAsset",
    "info",
    "delete",
] as const;

const imageToolbarSeparatorBeforeIds = new Set(["replace", "copyPrompt", "view", "info"]);

function primaryTextContent(node: CanvasNodeData) {
    const texts = node.metadata?.texts || [];
    const primaryTextId = node.metadata?.primaryTextId || texts[0]?.id;
    return texts.find((text) => text.id === primaryTextId)?.content || node.metadata?.content || "";
}

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    onKeep,
    onLeave,
    onInfo,
    onDecreaseFont,
    onIncreaseFont,
    onTextImport,
    onTextTagsChange,
    onToggleDialog,
    onAnalyzeVideo,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onMaskEdit,
    onCrop,
    onSplit,
    onUpscale,
    onSuperResolve,
    superResolveContent,
    superResolveOpen = false,
    onSuperResolveOpenChange,
    onAngle,
    onPersonAdjust,
    onViewImage,
    onReversePrompt,
    onRetry,
    onToggleFreeResize,
    onDelete,
    viewMode,
    extraTools = [],
}: CanvasNodeHoverToolbarProps) {
    const [quickImageToolIds, setQuickImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [showImageToolLabels, setShowImageToolLabels] = useState(false);
    const [draftImageToolIds, setDraftImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [draftShowImageToolLabels, setDraftShowImageToolLabels] = useState(false);
    const [imageToolSettingsOpen, setImageToolSettingsOpen] = useState(false);
    const [imageMoreOpen, setImageMoreOpen] = useState(false);
    const [personAdjustOpen, setPersonAdjustOpen] = useState(false);
    const [textTagsOpen, setTextTagsOpen] = useState(false);
    const [isReadingTextImport, setIsReadingTextImport] = useState(false);
    const [pendingTextImport, setPendingTextImport] = useState<{ nodeId: string; name: string; text: string } | null>(null);
    const textImportInputRef = useRef<HTMLInputElement>(null);
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored) as unknown;
            const config = readImageQuickToolsConfig(parsed);
            setQuickImageToolIds(config.ids);
            setShowImageToolLabels(config.showLabels);
        } catch {
            window.localStorage.removeItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        setImageToolSettingsOpen(false);
        setImageMoreOpen(false);
        setPersonAdjustOpen(false);
        setTextTagsOpen(false);
        setIsReadingTextImport(false);
        setPendingTextImport(null);
    }, [node?.id]);

    if (!node) return null;

    const activeNode = node;
    const left = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    // 留出节点标题、类型图标和分辨率信息的独立区域，操作条不压住信息。
    const top = viewport.y + node.position.y * viewport.k - 32;
    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasVideo = isVideo && Boolean(node.metadata?.content);
    const hasAudio = isAudio && Boolean(node.metadata?.content);
    const isText = node.type === CanvasNodeType.Text;
    const isConfig = node.type === CanvasNodeType.Config;
    const isSimpleMode = viewMode === "simple";
    const canRetry = node.metadata?.status === "error";
    const quickImageToolIdSet = new Set(quickImageToolIds);
    const copyImagePrompt = (target: CanvasNodeData) => {
        const prompt = target.metadata?.prompt?.trim();
        if (!prompt) {
            message.warning(t("canvas.nodeToolbar.noPrompt"));
            return;
        }
        copyText(prompt, t("common.promptCopied"));
    };
    const imageTools = buildImageToolbarTools(node, { onUpload, onToggleFreeResize, onMaskEdit, onCrop, onSplit, onUpscale, onSuperResolve, onAngle, onPersonAdjust, onViewImage, onCopyPrompt: copyImagePrompt, onReversePrompt });

    const startTextImport = () => {
        onKeep(activeNode.id);
        textImportInputRef.current?.click();
    };

    const handleTextImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsReadingTextImport(true);
        try {
            const imported = await readTextNodeImportFile(file);
            if (primaryTextContent(activeNode).trim()) {
                setPendingTextImport({ nodeId: activeNode.id, name: imported.name, text: imported.text });
                onKeep(activeNode.id);
            } else {
                onTextImport(activeNode.id, imported.text, "replace");
                message.success(t("canvas.nodeToolbar.importTextSuccess"));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("apiErrors.unknown"));
        } finally {
            setIsReadingTextImport(false);
        }
    };

    function openImageToolSettings() {
        onKeep(activeNode.id);
        setDraftImageToolIds(quickImageToolIds);
        setDraftShowImageToolLabels(showImageToolLabels);
        setImageToolSettingsOpen(true);
    }

    const baseToolbarTools: ToolbarTool[] = [
        { id: "info", title: t("canvas.nodeToolbar.infoTitle"), label: t("canvas.nodeToolbar.info"), icon: <Info className="size-4" />, onClick: () => onInfo(node) },
        { id: "delete", title: t("canvas.nodeToolbar.removeTitle"), label: t("common.delete"), icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true },
    ];
    const nodeToolbarTools: ToolbarTool[] = [
        ...(canRetry ? [{ id: "retry", title: t("canvas.nodeToolbar.retryTitle"), label: t("canvas.node.retry"), icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(hasImage || hasVideo || isText ? [{ id: "saveAsset", title: t("common.addToAssets"), label: t("canvas.nodeToolbar.saveAsset"), icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) }] : []),
        ...(isText
            ? [
                  {
                      id: "importText",
                      title: t("canvas.nodeToolbar.importTextTitle"),
                      label: isReadingTextImport ? t("canvas.nodeToolbar.importTextReading") : t("canvas.nodeToolbar.importText"),
                      icon: isReadingTextImport ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />,
                      onClick: startTextImport,
                      disabled: isReadingTextImport,
                  },
                  { id: "textTags", title: t("canvas.nodeToolbar.tagsTitle"), label: t("canvas.nodeToolbar.tags"), icon: null, onClick: () => undefined },
              ]
            : []),
        ...(hasImage || hasVideo || hasAudio
            ? [
                  {
                      id: "download",
                      title: t(hasAudio ? "canvas.nodeToolbar.downloadAudio" : hasVideo ? "canvas.nodeToolbar.downloadVideo" : "canvas.nodeToolbar.downloadImage"),
                      label: t("common.download"),
                      icon: <Download className="size-4" />,
                      onClick: () => onDownload(node),
                  },
              ]
            : []),
        ...(isVideo ? [{ id: "edit", title: t("common.edit"), label: t("common.edit"), icon: <MessageSquare className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "analyzeVideo", title: t("canvas.nodeToolbar.analyzeVideoTitle"), label: t("canvas.nodeToolbar.analyzeVideo"), icon: <Sparkles className="size-4" />, onClick: () => onAnalyzeVideo(node) }] : []),
        ...(isText ? [{ id: "generateImage", title: t("canvas.node.generateImage"), label: t("canvas.node.generate"), icon: <ImageIcon className="size-4" />, onClick: () => onGenerateImage(node) }] : []),
        ...(isConfig ? [{ id: "config", title: t("canvas.configNode.title"), label: t("canvas.configNode.title"), icon: <Settings2 className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "decreaseFont", title: t("canvas.nodeToolbar.decreaseFont"), label: t("canvas.nodeToolbar.zoomOut"), icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText ? [{ id: "increaseFont", title: t("canvas.nodeToolbar.increaseFont"), label: t("canvas.nodeToolbar.zoomIn"), icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...(isImage && !hasImage ? [{ id: "uploadImage", title: t("canvas.nodeToolbar.uploadImage"), label: t("canvas.nodeToolbar.uploadImage"), icon: <Upload className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isVideo
            ? [
                  {
                      id: "uploadVideo",
                      title: t(hasVideo ? "canvas.nodeToolbar.replaceVideo" : "canvas.nodeToolbar.uploadVideo"),
                      label: t(hasVideo ? "canvas.nodeToolbar.replaceVideo" : "canvas.nodeToolbar.uploadVideo"),
                      icon: <Video className="size-4" />,
                      onClick: () => onUpload(node),
                  },
              ]
            : []),
        ...(isAudio
            ? [
                  {
                      id: "uploadAudio",
                      title: t(hasAudio ? "canvas.nodeToolbar.replaceAudio" : "canvas.nodeToolbar.uploadAudio"),
                      label: t(hasAudio ? "canvas.nodeToolbar.replaceAudio" : "canvas.nodeToolbar.uploadAudio"),
                      icon: <Music2 className="size-4" />,
                      onClick: () => onUpload(node),
                  },
              ]
            : []),
        ...(hasImage ? imageTools.map((tool) => ({ id: tool.id, title: tool.title, label: tool.label, icon: tool.icon, active: tool.active, onClick: tool.onClick })) : []),
    ];
    const modeFilteredNodeTools = nodeToolbarTools.filter((tool) => {
        if (!isSimpleMode) return true;
        return !["config", "decreaseFont", "increaseFont"].includes(tool.id);
    });
    const imageToolbarTools = [...baseToolbarTools, ...modeFilteredNodeTools];
    // 简洁模式只保留下载和更多；专业模式以固定顺序完整展示图片工具。
    const imagePrimaryToolIds = isSimpleMode ? new Set(["download"]) : new Set(["maskEdit", "personAdjust", "angle"]);
    const imagePrimaryTools = imageToolbarTools.filter((tool) => imagePrimaryToolIds.has(tool.id));
    const imageToolbarToolById = new Map(imageToolbarTools.map((tool) => [tool.id, tool]));
    const professionalImageToolbarTools = professionalImageToolbarOrder.map((id) => imageToolbarToolById.get(id)).filter((tool): tool is ToolbarTool => Boolean(tool));
    const toolbarTools = hasImage ? (isSimpleMode ? imagePrimaryTools : professionalImageToolbarTools) : [...baseToolbarTools, ...modeFilteredNodeTools, ...(isSimpleMode ? [] : extraTools)];
    const moreImageTools = isSimpleMode ? imageToolbarTools.filter((tool) => !imagePrimaryToolIds.has(tool.id) && quickImageToolIdSet.has(tool.id as ImageQuickToolId)) : [];
    const selectableImageToolbarTools = imageToolbarTools.filter((tool) => tool.id !== "retry") as ImageToolbarSettingsTool[];

    const closeImageToolSettings = () => {
        setImageToolSettingsOpen(false);
        setImageMoreOpen(false);
        onLeave();
    };

    const setDraftImageToolVisible = (id: ImageQuickToolId, visible: boolean) => {
        setDraftImageToolIds((current) => {
            const selected = new Set(current);
            if (visible) selected.add(id);
            else selected.delete(id);
            return selectableImageToolbarTools.filter((tool) => selected.has(tool.id)).map((tool) => tool.id);
        });
    };

    const saveImageToolSettings = () => {
        const config = { ids: draftImageToolIds, showLabels: draftShowImageToolLabels };
        setQuickImageToolIds(config.ids);
        setShowImageToolLabels(config.showLabels);
        window.localStorage.setItem(IMAGE_QUICK_TOOLS_STORAGE_KEY, JSON.stringify(config));
        closeImageToolSettings();
    };

    return (
        <>
            <div
                className="absolute z-[70] flex h-8 max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-full items-center overflow-x-auto rounded-lg border px-px text-xs shadow-[0_5px_14px_rgba(15,23,42,.12)]"
                style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                onMouseEnter={() => onKeep(node.id)}
                onMouseLeave={() => {
                    if (!imageToolSettingsOpen && !imageMoreOpen && !personAdjustOpen && !textTagsOpen && !superResolveOpen && !pendingTextImport) onLeave();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {toolbarTools.map((tool) => (
                    <Fragment key={tool.id}>
                        {hasImage && !isSimpleMode && imageToolbarSeparatorBeforeIds.has(tool.id) ? <span className="mx-1 h-5 w-px shrink-0" style={{ background: theme.toolbar.border }} /> : null}
                        {tool.id === "personAdjust" && hasImage ? (
                            <Popover
                                trigger="click"
                                placement="bottom"
                                open={personAdjustOpen}
                                onOpenChange={(open) => {
                                    setPersonAdjustOpen(open);
                                    if (open) onKeep(activeNode.id);
                                }}
                                content={
                                    <div className="w-64 space-y-1.5 p-1" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
                                        <div className="px-2 py-1 text-sm font-medium opacity-60">人物调整</div>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:opacity-80"
                                            style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                                            onClick={() => {
                                                setPersonAdjustOpen(false);
                                                onPersonAdjust(activeNode, "emotion");
                                            }}
                                        >
                                            <Smile className="size-5 shrink-0" />
                                            <span>
                                                <span className="block text-sm font-semibold">表情调整</span>
                                                <span className="mt-0.5 block text-xs opacity-65">调整人物表情，生成新图片</span>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:opacity-80"
                                            style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                                            onClick={() => {
                                                setPersonAdjustOpen(false);
                                                onPersonAdjust(activeNode, "texture");
                                            }}
                                        >
                                            <SlidersHorizontal className="size-5 shrink-0" />
                                            <span>
                                                <span className="block text-sm font-semibold">质感调整</span>
                                                <span className="mt-0.5 block text-xs opacity-65">设置肤质、光影与融合，再执行生成</span>
                                            </span>
                                        </button>
                                    </div>
                                }
                                overlayInnerStyle={{ background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, boxShadow: "0 18px 48px rgba(0,0,0,.28)" }}
                            >
                                <span>
                                    <ToolbarAction
                                        {...tool}
                                        onClick={() => undefined}
                                        active={personAdjustOpen}
                                        suffix={<ChevronDown className="size-3.5 opacity-65" />}
                                        showLabel={isImage ? isSimpleMode && showImageToolLabels : true}
                                    />
                                </span>
                            </Popover>
                        ) : tool.id === "textTags" && isText ? (
                            <CanvasTextNodeTags
                                value={activeNode.metadata?.textTags}
                                onChange={(tags) => onTextTagsChange(activeNode.id, tags)}
                                onOpenChange={(open) => {
                                    setTextTagsOpen(open);
                                    if (open) onKeep(activeNode.id);
                                }}
                            />
                        ) : tool.id === "superResolve" && hasImage && superResolveContent ? (
                            <Popover
                                trigger="click"
                                placement="top"
                                open={superResolveOpen}
                                onOpenChange={(open) => {
                                    if (open) {
                                        onKeep(activeNode.id);
                                        tool.onClick();
                                    }
                                    onSuperResolveOpenChange?.(open);
                                }}
                                content={superResolveContent}
                                overlayInnerStyle={{ padding: 0, background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, boxShadow: "0 18px 48px rgba(0,0,0,.28)" }}
                            >
                                <span>
                                    <ToolbarAction {...tool} onClick={() => undefined} active={superResolveOpen} showLabel={isImage ? isSimpleMode && showImageToolLabels : true} />
                                </span>
                            </Popover>
                        ) : (
                            <ToolbarAction {...tool} showLabel={isImage ? isSimpleMode && showImageToolLabels : true} />
                        )}
                    </Fragment>
                ))}
                {hasImage && isSimpleMode ? (
                    <Popover
                        trigger="click"
                        placement="bottom"
                        open={imageMoreOpen}
                        onOpenChange={(open) => {
                            setImageMoreOpen(open);
                            if (open) onKeep(activeNode.id);
                        }}
                        content={
                            <div className="grid w-52 grid-cols-2 gap-1 p-1" style={{ color: theme.node.text }}>
                                {moreImageTools.map((tool) => (
                                    <button
                                        key={tool.id}
                                        type="button"
                                        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:opacity-75"
                                        style={{ background: theme.toolbar.activeBg, color: tool.danger ? "#ef4444" : theme.toolbar.activeText }}
                                        onClick={() => {
                                            tool.onClick();
                                            setImageMoreOpen(false);
                                        }}
                                    >
                                        <span className="shrink-0">{tool.icon}</span>
                                        <span className="truncate">{tool.label}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className="col-span-2 flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:opacity-75"
                                    style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                                    onClick={() => {
                                        setImageMoreOpen(false);
                                        openImageToolSettings();
                                    }}
                                >
                                    <Settings2 className="size-4" />
                                    {t("canvas.imageTools.configure")}
                                </button>
                            </div>
                        }
                    >
                        <span>
                            <ToolbarAction
                                id="more"
                                title={t("canvas.imageTools.more")}
                                label={t("canvas.imageTools.more")}
                                icon={<Ellipsis className="size-4" />}
                                active={imageMoreOpen}
                                onClick={() => setImageMoreOpen((open) => !open)}
                                showLabel={showImageToolLabels}
                            />
                        </span>
                    </Popover>
                ) : null}
            </div>
            {hasImage ? (
                <ImageToolSettingsModal
                    open={imageToolSettingsOpen}
                    tools={selectableImageToolbarTools}
                    selectedIds={draftImageToolIds}
                    showLabels={draftShowImageToolLabels}
                    onToggle={setDraftImageToolVisible}
                    onShowLabelsChange={setDraftShowImageToolLabels}
                    onCancel={closeImageToolSettings}
                    onSave={saveImageToolSettings}
                />
            ) : null}
            <input ref={textImportInputRef} type="file" accept={TEXT_NODE_IMPORT_ACCEPT} className="hidden" tabIndex={-1} onChange={handleTextImportFile} />
            <Modal
                title={t("canvas.nodeToolbar.importTextDialogTitle")}
                open={Boolean(pendingTextImport)}
                centered
                onCancel={() => setPendingTextImport(null)}
                footer={
                    pendingTextImport
                        ? [
                              <Button key="cancel" onClick={() => setPendingTextImport(null)}>
                                  {t("common.cancel")}
                              </Button>,
                              <Button
                                  key="replace"
                                  onClick={() => {
                                      onTextImport(pendingTextImport.nodeId, pendingTextImport.text, "replace");
                                      setPendingTextImport(null);
                                      message.success(t("canvas.nodeToolbar.importTextSuccess"));
                                  }}
                              >
                                  {t("canvas.nodeToolbar.importTextReplace")}
                              </Button>,
                              <Button
                                  key="append"
                                  type="primary"
                                  onClick={() => {
                                      onTextImport(pendingTextImport.nodeId, pendingTextImport.text, "append");
                                      setPendingTextImport(null);
                                      message.success(t("canvas.nodeToolbar.importTextSuccess"));
                                  }}
                              >
                                  {t("canvas.nodeToolbar.importTextAppend")}
                              </Button>,
                          ]
                        : null
                }
            >
                {pendingTextImport ? (
                    <div className="text-sm leading-6 opacity-70" data-canvas-shortcuts-ignore>
                        {t("canvas.nodeToolbar.importTextDialogDescription", { name: pendingTextImport.name, count: [...pendingTextImport.text].length })}
                    </div>
                ) : null}
            </Modal>
        </>
    );
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = node?.type === CanvasNodeType.Image ? node.metadata?.images?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>{t("canvas.nodeToolbar.nodeInfo")}</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: t("canvas.nodeToolbar.info"), value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    return (
        <Modal className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
            {node ? (
                <div className="h-[56vh] min-h-[360px] select-text text-sm" data-canvas-shortcuts-ignore>
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label={t("canvas.nodeToolbar.name")} value={node.title || t("canvas.node.untitled")} />
                            <InfoRow
                                label={t("canvas.nodeToolbar.type")}
                                value={
                                    node.type === CanvasNodeType.Group
                                        ? t("canvas.node.group")
                                        : node.type === CanvasNodeType.Config
                                          ? t("canvas.configNode.title")
                                          : [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Text].includes(node.type as CanvasNodeType)
                                            ? t(`assets.kinds.${node.type}`)
                                            : getNodeDefinition(node.type)?.title || node.type
                                }
                            />
                            <InfoRow label={t("canvas.nodeToolbar.size")} value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label={t("canvas.nodeToolbar.position")} value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label={t("canvas.nodeToolbar.status")} value={node.metadata?.status || "idle"} />
                            {batchCount > 1 ? <InfoRow label={t("canvas.nodeToolbar.imageGroup")} value={t("canvas.configNode.images", { count: batchCount })} /> : null}
                            {node.metadata?.prompt ? <InfoRow label={t("canvas.configNode.prompt")} value={node.metadata.prompt} /> : null}
                            {imageBytes ? <InfoRow label={t("canvas.nodeToolbar.imageSize")} value={formatBytes(imageBytes)} /> : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function ToolbarAction({ title, label, icon, onClick, showLabel, active = false, danger = false, suffix, disabled = false }: ToolbarTool & { showLabel: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const hasText = showLabel && Boolean(label);
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color={theme.toolbar.panel} styles={{ root: { color: theme.node.text, boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button
                type="button"
                className={`relative flex h-8 shrink-0 items-center whitespace-nowrap px-px ${disabled ? "cursor-wait opacity-50" : ""}`}
                style={{ color: danger ? "#ef4444" : theme.toolbar.item }}
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                aria-label={title}
                disabled={disabled}
            >
                <span
                    className={`flex h-6 items-center ${hasText ? "gap-1 px-1" : "justify-center px-1"} rounded-md transition`}
                    style={{ background: active ? theme.toolbar.activeBg : hovered ? theme.toolbar.itemHover : "transparent", color: active ? theme.toolbar.activeText : undefined }}
                >
                    {icon}
                    {hasText ? <span>{label}</span> : null}
                    {suffix}
                </span>
            </button>
        </Tooltip>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
