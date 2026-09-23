import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { ArrowUp, ChevronRight, Clapperboard, Copy, Download, FileText, Group, Image as ImageIcon, LoaderCircle, Music2, Plus, Puzzle, RefreshCw, Square, Star, Trash2, Video } from "lucide-react";

import { canvasBackgroundPalette, canvasThemes, canvasTitleBackground, type CanvasBackgroundTone } from "@/lib/canvas-theme";
import { pickImageSource } from "@/lib/image-thumbnail";
import { canvasCardVisualScale, canvasNodeReadableScale } from "@/lib/canvas/canvas-node-size";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { buildNodeContext } from "@/lib/canvas/plugin-node-context";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { RUNNING_HUB_WORKFLOW_PORT_X, runningHubWorkflowContentScale, runningHubWorkflowPortY, type RunningHubWorkflowPortHead } from "./canvas-runninghub-workflow-ports";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeImage, type CanvasNodeText, type CanvasStoryboardRow, type Position } from "@/types/canvas";
import type { CanvasNodeContext, CanvasPluginHost } from "@/types/canvas-plugin";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { CanvasViewMode } from "@/stores/canvas/use-canvas-workspace-store";
import { useTranslation } from "react-i18next";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const selectionBlue = "#2f80ff";

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    hasDedicatedInputPorts?: boolean;
    runningHubPortHeads?: RunningHubWorkflowPortHead[];
    runningHubWorkflowPortsOpen?: boolean;
    referenceSelectionState?: "target" | "disabled" | "available";
    showPanel: boolean;
    showImageInfo: boolean;
    backgroundTone: CanvasBackgroundTone;
    viewMode: CanvasViewMode;
    mentionReferences?: CanvasResourceReference[];
    pluginHost?: CanvasPluginHost;
    registryVersion?: number;
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData, controls: { onConnectStart: (event: React.MouseEvent, portId: string) => void }) => ReactNode;
    groupChildCount?: number;
    isGroupDropTarget?: boolean;
    batchExpanded?: boolean;
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onSelectCapture?: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target", portId?: string) => void;
    onResizeStart: (nodeId: string) => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
    onResizeEnd: (nodeId: string) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onStoryboardChange?: (nodeId: string, rows: CanvasStoryboardRow[]) => void;
    onPromptChange?: (nodeId: string, prompt: string) => void;
    onGenerate?: (nodeId: string, prompt: string) => void;
    onStop?: (nodeId: string) => void;
    isRunning?: boolean;
    onTitleChange: (nodeId: string, title: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (nodeId: string, itemId: string) => void;
    onDuplicateBatchImage?: (node: CanvasNodeData, imageId: string) => void;
    onDownloadBatchImage?: (node: CanvasNodeData, imageId: string) => void;
    onRetryBatchImage?: (node: CanvasNodeData, imageId: string) => void;
    onDeleteBatchImage?: (nodeId: string, imageId: string) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData, imageId?: string) => void;
    onSelectReference?: (nodeId: string) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    scale: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    renderNodeContent?: (node: CanvasNodeData, controls: { onConnectStart: (event: React.MouseEvent, portId: string) => void }) => ReactNode;
    pluginContext?: CanvasNodeContext | null;
    onContentChange: (nodeId: string, content: string) => void;
    onStoryboardChange?: (nodeId: string, rows: CanvasStoryboardRow[]) => void;
    onPromptChange?: (nodeId: string, prompt: string) => void;
    onGenerate?: (nodeId: string, prompt: string) => void;
    onStop?: (nodeId: string) => void;
    isRunning?: boolean;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: (itemId: string) => void;
    onDuplicateBatchImage?: (imageId: string) => void;
    onDownloadBatchImage?: (imageId: string) => void;
    onRetryBatchImage?: (imageId: string) => void;
    onDeleteBatchImage?: (imageId: string) => void;
    onViewBatchImage?: (imageId: string) => void;
    groupChildCount: number;
    groupHeaderBackground: string;
    groupHeaderBorder: string;
    onConnectStart: (event: React.MouseEvent, portId: string) => void;
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    hasDedicatedInputPorts = false,
    runningHubPortHeads = [],
    runningHubWorkflowPortsOpen = false,
    referenceSelectionState,
    showPanel,
    showImageInfo,
    backgroundTone,
    viewMode,
    mentionReferences = [],
    pluginHost,
    renderPanel,
    renderNodeContent,
    groupChildCount = 0,
    isGroupDropTarget = false,
    batchExpanded = false,
    onMouseDown,
    onSelectCapture,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResizeStart,
    onResize,
    onResizeEnd,
    onContentChange,
    onStoryboardChange,
    onPromptChange,
    onGenerate,
    onStop,
    isRunning = false,
    onTitleChange,
    onToggleBatch,
    onSetBatchPrimary,
    onDuplicateBatchImage,
    onDownloadBatchImage,
    onRetryBatchImage,
    onDeleteBatchImage,
    onRetry,
    onViewImage,
    onSelectReference,
    onContextMenu,
}: CanvasNodeProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const definition = getNodeDefinition(data.type);
    const pluginContext = useMemo<CanvasNodeContext | null>(() => (pluginHost ? buildNodeContext(pluginHost, data, theme, scale, isSelected) : null), [pluginHost, data, theme, scale, isSelected]);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(data.title || "");
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content);
    const isGroup = data.type === CanvasNodeType.Group;
    const isGroupMember = Boolean(data.metadata?.groupId);
    const imageResolution = data.type === CanvasNodeType.Image && data.metadata?.naturalWidth && data.metadata?.naturalHeight ? `${Math.round(data.metadata.naturalWidth)}×${Math.round(data.metadata.naturalHeight)}` : null;
    const showProfessionalImageInfo = viewMode === "professional" && showImageInfo;
    const promptPanelScale = canvasCardVisualScale(scale);
    const creativeFrameWidth = 820;
    const readableScale = data.type === CanvasNodeType.Config || data.type === CanvasNodeType.Text ? 1 : canvasNodeReadableScale(scale);
    const groupContentScale = Math.min(2.6, Math.max(readableScale, 0.8 / Math.max(scale, 0.2)));
    const groupMemberContentScale = readableScale;
    const contentScale = hasDedicatedInputPorts ? runningHubWorkflowContentScale(data) : isGroup ? groupContentScale : isGroupMember ? groupMemberContentScale : readableScale;
    const showExternalTitle = !referenceSelectionState && !hasDedicatedInputPorts && !isGroup;
    const batchCount = data.type === CanvasNodeType.Image ? data.metadata?.images?.length || 0 : data.type === CanvasNodeType.Text ? data.metadata?.texts?.length || 0 : 0;
    const isBatchRoot = batchCount > 1;
    // Nodes with the interaction/move toggle ignore content pointer events in move mode and allow interaction in interactive mode.
    // forceInteractive states such as editing stay interactive, as do empty nodes so their upload and generation actions remain usable.
    const supportsInteractionToggle = Boolean(definition?.interactionToggle);
    const forceInteractive = supportsInteractionToggle ? Boolean(definition?.forceInteractive?.(data)) : false;
    const contentInteractive = !supportsInteractionToggle || forceInteractive || !data.metadata?.content ? true : Boolean(data.metadata?.interactive);
    // Transparent nodes such as SVGs blend into the canvas while retaining outlines for selected or related states.
    const transparentBg = Boolean(definition?.transparentBackground);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const displayHeight = data.height;
    const imageBorderColor = isActive ? selectionBlue : isRelated ? theme.node.muted : "transparent";
    const groupContainerBackground = theme.node.fill;
    const groupBorderColor = isGroupDropTarget || isActive ? selectionBlue : theme.node.stroke;
    const groupBorderWidth = isGroupDropTarget || isActive ? 2 : 1;
    const groupHeaderBackground = canvasTitleBackground(colorTheme, backgroundTone);
    const groupHeaderBorder = canvasBackgroundPalette(colorTheme, backgroundTone).swatch;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });

    useEffect(() => {
        setTitleDraft(data.title || "");
    }, [data.title]);

    useEffect(() => {
        if (!isEditingTitle) return;
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
    }, [isEditingTitle]);

    const finishTitleEditing = useCallback(() => {
        const title = titleDraft.trim() || data.title || t("canvas.node.untitled");
        setTitleDraft(title);
        setIsEditingTitle(false);
        if (title !== data.title) onTitleChange(data.id, title);
    }, [data.id, data.title, onTitleChange, t, titleDraft]);

    useEffect(() => {
        if (!isEditingTitle) return;
        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && titleInputRef.current?.contains(target)) return;
            finishTitleEditing();
        };
        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [finishTitleEditing, isEditingTitle]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            onResize(data.id, width, height, {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            });
        },
        [data.id, onResize, scale],
    );

    const handleResizeUp = useCallback(() => {
        resizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeUp);
        onResizeEnd(data.id);
    }, [data.id, handleResizeMove, onResizeEnd]);

    const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        onResizeStart(data.id);
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: hasDedicatedInputPorts || (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video || Boolean(definition?.keepAspectRatio?.(data)),
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleResizeMove);
            window.removeEventListener("mouseup", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    return (
        <div
            data-node-id={data.id}
            className={`node-element absolute flex select-none flex-col transition-shadow duration-200 ${isGroup ? "z-[5]" : isSelected ? "z-50" : "z-10"} ${referenceSelectionState === "available" ? "cursor-pointer" : referenceSelectionState ? "cursor-not-allowed" : ""}`}
            style={{
                transform: `translate(${data.position.x}px, ${data.position.y}px)`,
                width: data.width,
                height: displayHeight,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onMouseDownCapture={(event) => {
                if (!referenceSelectionState) onSelectCapture?.(event, data.id);
            }}
            onContextMenu={(event) => {
                if (referenceSelectionState) event.preventDefault();
                else onContextMenu(event, data.id);
            }}
        >
            {showExternalTitle && (
                <div
                    className="absolute z-[80]"
                    style={{
                        left: 8,
                        top: data.type === CanvasNodeType.Image ? -18 : -26,
                        width: contentScale === 1 ? Math.max(24, data.width - 16) : `calc((100% - 16px) / ${contentScale})`,
                        maxWidth: "calc(100vw - 16px)",
                        transform: contentScale === 1 ? undefined : `scale(${contentScale})`,
                        transformOrigin: "left bottom",
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={titleDraft}
                            maxLength={64}
                            className="h-7 max-w-full border-0 border-b border-dashed bg-transparent px-0 text-left text-lg font-semibold outline-none"
                            style={{ borderColor: theme.node.muted, color: theme.node.text }}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={finishTitleEditing}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") finishTitleEditing();
                                if (event.key === "Escape") {
                                    setTitleDraft(data.title || "");
                                    setIsEditingTitle(false);
                                }
                            }}
                        />
                    ) : (
                        <div data-canvas-image-info className="flex w-full min-w-0 items-center gap-1.5 text-lg font-semibold opacity-75">
                            {data.type === CanvasNodeType.Image ? <ImageIcon className="size-3.5 shrink-0" /> : null}
                            <button
                                type="button"
                                className="block min-w-0 flex-1 truncate overflow-hidden border-b border-dashed border-transparent px-0 py-0.5 text-left transition hover:border-current hover:opacity-100"
                                style={{ color: theme.node.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                title={t("canvas.node.renameHint")}
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    setIsEditingTitle(true);
                                }}
                            >
                                {data.title || t("canvas.node.untitled")}
                            </button>
                            {data.type === CanvasNodeType.Image && showProfessionalImageInfo && imageResolution ? <span data-canvas-image-resolution className="shrink-0 whitespace-nowrap text-sm opacity-70">{imageResolution}</span> : null}
                        </div>
                    )}
                </div>
            )}

            <div
                className="relative h-full w-full overflow-visible rounded-xl border"
                style={{
                    background: isGroup ? groupContainerBackground : hasImageContent || hasVideoContent || transparentBg ? "transparent" : theme.node.fill,
                    borderColor: isGroup
                        ? groupBorderColor
                        : hasImageContent
                          ? imageBorderColor
                          : isActive
                            ? selectionBlue
                            : isRelated
                              ? theme.node.muted
                              : transparentBg
                                ? "transparent"
                                : theme.node.stroke,
                    borderStyle: "solid",
                    borderWidth: isGroup ? groupBorderWidth : undefined,
                    boxShadow: isGroup
                        ? isGroupDropTarget
                            ? `0 0 0 2px ${selectionBlue}66, inset 0 0 0 999px ${selectionBlue}10`
                            : isActive
                              ? `0 0 0 2px ${selectionBlue}55, inset 0 0 0 1px ${selectionBlue}66`
                            : undefined
                        : isGroupDropTarget
                          ? `0 0 0 2px ${selectionBlue}66, inset 0 0 0 999px ${selectionBlue}10`
                          : isActive
                            ? `0 0 0 1px ${selectionBlue}55`
                            : isRelated
                              ? `0 0 0 1px ${theme.node.muted}55, 0 18px 48px rgba(0,0,0,.14)`
                              : undefined,
                }}
                onMouseDown={(event) => {
                    if (!referenceSelectionState) onMouseDown(event, data.id);
                    else if (event.button === 0 && referenceSelectionState === "available") {
                        event.stopPropagation();
                        onSelectReference?.(data.id);
                    }
                }}
                onDoubleClick={(event) => {
                    if (referenceSelectionState) {
                        event.stopPropagation();
                        return;
                    }
                    if (definition?.onDoubleClick && pluginContext) {
                        if (definition.onDoubleClick(pluginContext)) event.stopPropagation();
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    className={`relative h-full w-full rounded-[inherit] ${isBatchRoot || hasDedicatedInputPorts ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: isGroup ? "transparent" : hasImageContent || hasVideoContent || transparentBg ? "transparent" : theme.node.fill,
                            pointerEvents: contentInteractive ? undefined : "none",
                        } as React.CSSProperties
                    }
                >
                    <div
                        className="absolute left-0 top-0 flex items-center justify-center"
                        data-canvas-readable-content
                        style={{ width: `${100 / contentScale}%`, height: `${100 / contentScale}%`, transform: `scale(${contentScale})`, transformOrigin: "top left" }}
                    >
                        <NodeContent
                            node={data}
                            scale={scale}
                            theme={theme}
                            isEditingContent={isEditingContent}
                            textareaRef={textareaRef}
                            isBatchRoot={isBatchRoot}
                            batchCount={batchCount}
                            batchExpanded={batchExpanded}
                            renderNodeContent={renderNodeContent}
                            onConnectStart={(event, portId) => onConnectStart(event, data.id, "target", portId)}
                            pluginContext={pluginContext}
                            mentionReferences={mentionReferences}
                            onContentChange={onContentChange}
                            onStoryboardChange={onStoryboardChange}
                            onPromptChange={onPromptChange}
                            onGenerate={onGenerate}
                            onStop={onStop}
                            isRunning={isRunning}
                            onStopEditing={() => setIsEditingContent(false)}
                            onRetry={onRetry}
                            onToggleBatch={() => onToggleBatch?.(data.id)}
                            onSetBatchPrimary={(itemId) => onSetBatchPrimary?.(data.id, itemId)}
                            onDuplicateBatchImage={(imageId) => onDuplicateBatchImage?.(data, imageId)}
                            onDownloadBatchImage={(imageId) => onDownloadBatchImage?.(data, imageId)}
                            onRetryBatchImage={(imageId) => onRetryBatchImage?.(data, imageId)}
                            onDeleteBatchImage={(imageId) => onDeleteBatchImage?.(data.id, imageId)}
                            onViewBatchImage={(imageId) => onViewImage?.(data, imageId)}
                            groupChildCount={groupChildCount}
                            groupHeaderBackground={groupHeaderBackground}
                            groupHeaderBorder={groupHeaderBorder}
                        />
                    </div>
                </div>

                {!isGroup && !hasImageContent && !hasVideoContent && !hasAudioContent ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} />
                ) : null}

                {referenceSelectionState && (referenceSelectionState !== "available" || hovered) ? (
                    <div
                        className="pointer-events-none absolute inset-0 z-[60] grid place-items-center rounded-[inherit]"
                        style={{
                            background: `color-mix(in srgb, ${theme.canvas.background} ${referenceSelectionState === "target" ? 78 : referenceSelectionState === "disabled" ? 60 : 34}%, transparent)`,
                            boxShadow: referenceSelectionState === "available" ? `inset 0 0 0 2px ${selectionBlue}` : undefined,
                        }}
                    >
                        {referenceSelectionState !== "disabled" ? (
                            <span className="rounded-lg px-3 py-2 text-sm font-medium shadow-sm" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
                                {t(referenceSelectionState === "target" ? "canvas.references.selecting" : "canvas.references.choose")}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {!referenceSelectionState ? <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} /> : null}
                {!referenceSelectionState ? <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} /> : null}
                {!referenceSelectionState ? <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} /> : null}
                {!referenceSelectionState ? <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} /> : null}
            </div>

            {!referenceSelectionState && hasDedicatedInputPorts && !runningHubWorkflowPortsOpen ? <RunningHubWorkflowConnectionHeads heads={runningHubPortHeads} scale={scale} workflowScale={contentScale} visible={hovered} onMouseDown={(event, portId) => onConnectStart(event, data.id, "target", portId)} /> : null}
            {!referenceSelectionState && !isGroup && !hasDedicatedInputPorts ? <ConnectionHandleDot side="left" scale={scale} visible={hovered} onMouseDown={(event) => onConnectStart(event, data.id, "target")} /> : null}
            {!referenceSelectionState && (definition?.hasSourceHandle ?? true) && data.type !== CanvasNodeType.Config ? <ConnectionHandleDot side="right" scale={scale} visible={hovered} onMouseDown={(event) => onConnectStart(event, data.id, "source")} /> : null}

            {showPanel && !isGroup && !hasDedicatedInputPorts && !data.metadata?.storyboardMode && renderPanel ? (
                <div className="absolute left-1/2 top-full z-[70]" style={{ marginLeft: -creativeFrameWidth / 2 * promptPanelScale, paddingTop: 16 }}>
                    <div style={{ width: creativeFrameWidth, transform: `scale(${promptPanelScale})`, transformOrigin: "top left" }}>{renderPanel(data)}</div>
                </div>
            ) : null}
        </div>
    );
});

function NodeContent(props: NodeContentRendererProps) {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return props.renderNodeContent(props.node, { onConnectStart: props.onConnectStart });
    if (props.node.type === CanvasNodeType.Text && props.node.metadata?.storyboardMode) return <StoryboardNodeContent {...props} />;
    if (props.isBatchRoot && props.node.type === CanvasNodeType.Image) return <ImageNodeContent {...props} />;
    if (props.node.type === CanvasNodeType.Text && props.node.metadata?.texts?.length && (props.node.metadata.status !== "error" || props.node.metadata.texts.some((text) => text.content))) return <TextContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type as CanvasNodeType];
    if (Renderer) return <Renderer {...props} />;

    // Render plugin nodes with their registered renderer, or show the missing-plugin placeholder.
    const definition = getNodeDefinition(props.node.type);
    if (definition?.Content && props.pluginContext) {
        const PluginContent = definition.Content;
        return <PluginContent ctx={props.pluginContext} />;
    }
    return <MissingPluginContent theme={props.theme} type={props.node.type} />;
}

function StoryboardNodeContent({ node, theme, onStoryboardChange, onPromptChange, onGenerate, onStop, isRunning = false }: NodeContentRendererProps) {
    const { t } = useTranslation();
    const rows = node.metadata?.storyboardRows || [];
    const updateRow = (rowId: string, key: keyof Omit<CanvasStoryboardRow, "id">, value: string) => {
        onStoryboardChange?.(
            node.id,
            rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
        );
    };
    const addRow = () => onStoryboardChange?.(node.id, [...rows, { id: `shot-${Date.now()}`, duration: "6", shotPrompt: "", dialogue: "", asset: "未关联" }]);
    const totalSeconds = rows.reduce((sum, row) => sum + (Number(row.duration) || 0), 0);
    const inputClass = "w-full min-w-0 border-0 bg-transparent px-2 py-1 text-sm outline-none";
    const prompt = node.metadata?.prompt || "";
    return (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-[inherit]" style={{ background: theme.toolbar.panel, color: theme.node.text }} data-canvas-no-zoom>
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center gap-2 text-base font-semibold">
                    <Clapperboard className="size-5" style={{ color: theme.node.muted }} />
                    {t("canvas.createMenu.storyboard")}
                </div>
                <div className="flex items-center gap-3 text-sm" style={{ color: theme.node.muted }}>
                    <span>
                        {rows.length} 镜 · {totalSeconds}s
                    </span>
                    <span>⌗</span>
                    <span>⋯</span>
                </div>
            </div>
            <div className="flex h-10 shrink-0 items-center justify-center gap-8 border-b px-3 text-sm" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}>
                <span className="font-semibold" style={{ color: theme.node.text }}>
                    ● 分镜
                </span>
                <span>● 分镜图（可选）</span>
                <span>● 视频</span>
                <span className="opacity-45">● 合并成片</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto thin-scrollbar">
                <div className="grid grid-cols-[58px_72px_minmax(260px,1.5fr)_minmax(190px,1fr)_120px] border-b text-sm" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}>
                    <div className="border-r px-2 py-2">序号</div>
                    <div className="border-r px-2 py-2">时长</div>
                    <div className="border-r px-2 py-2">视频提示词</div>
                    <div className="border-r px-2 py-2">台词/旁白</div>
                    <div className="px-2 py-2">关联资产</div>
                </div>
                {rows.map((row, index) => (
                    <div key={row.id} className="grid grid-cols-[58px_72px_minmax(260px,1.5fr)_minmax(190px,1fr)_120px] border-b text-sm" style={{ borderColor: theme.toolbar.border }}>
                        <div className="border-r px-2 py-2" style={{ color: theme.node.muted }}>
                            {index + 1} …
                        </div>
                        <div className="border-r">
                            <input className={inputClass} value={row.duration} aria-label={`镜头${index + 1}时长`} onChange={(event) => updateRow(row.id, "duration", event.target.value)} />
                        </div>
                        <div className="border-r">
                            <input className={inputClass} placeholder="描述视频运动、镜头和动作" value={row.shotPrompt} aria-label={`镜头${index + 1}提示词`} onChange={(event) => updateRow(row.id, "shotPrompt", event.target.value)} />
                        </div>
                        <div className="border-r">
                            <input className={inputClass} placeholder="台词或旁白" value={row.dialogue} aria-label={`镜头${index + 1}台词`} onChange={(event) => updateRow(row.id, "dialogue", event.target.value)} />
                        </div>
                        <div>
                            <input className={inputClass} value={row.asset} aria-label={`镜头${index + 1}资产`} onChange={(event) => updateRow(row.id, "asset", event.target.value)} />
                        </div>
                    </div>
                ))}
                <button type="button" className="flex h-9 w-full items-center justify-center gap-1 text-sm transition hover:bg-white/5" style={{ color: theme.node.muted }} onClick={addRow}>
                    <Plus className="size-3.5" />
                    添加行
                </button>
            </div>
            <div className="shrink-0 border-t p-2" style={{ borderColor: theme.toolbar.border }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                <textarea
                    value={prompt}
                    onChange={(event) => onPromptChange?.(node.id, event.target.value)}
                    placeholder="描述想生成的脚本或视频内容"
                    className="h-14 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: theme.node.muted }}>
                        自动拆分 · 时长自动
                    </span>
                    <button
                        type="button"
                        className="relative grid size-7 place-items-center rounded-full transition disabled:opacity-40"
                        style={{ background: theme.toolbar.activeBg, color: theme.node.text }}
                        disabled={!isRunning && !prompt.trim()}
                        onClick={() => (isRunning ? onStop?.(node.id) : onGenerate?.(node.id, prompt))}
                        aria-label={isRunning ? "停止生成" : "生成分镜脚本"}
                    >
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-3.5 animate-spin" />
                                <Square className="absolute size-2 fill-current" />
                            </>
                        ) : (
                            <ArrowUp className="size-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Group]: GroupNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function GroupNodeContent({ node, theme, groupChildCount, groupHeaderBackground, groupHeaderBorder }: NodeContentRendererProps) {
    const { t } = useTranslation();
    return (
        <div data-canvas-group-node className="pointer-events-none relative h-full w-full">
            <div
                data-canvas-group-header
                className="absolute left-1/2 top-3 grid h-10 -translate-x-1/2 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 border px-1"
                style={{ width: "calc(100% - 24px)", background: groupHeaderBackground, borderColor: groupHeaderBorder, color: theme.node.text }}
            >
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: theme.node.stroke, color: theme.node.text }}>
                    <Group className="size-4" />
                </span>
                <span className="min-w-0 truncate text-sm font-semibold leading-none">{node.title || t("canvas.node.group")}</span>
                <span className="flex h-7 items-center justify-center rounded-full px-2 text-[11px] font-semibold leading-none" style={{ background: theme.node.stroke, color: theme.node.text }}>
                    {t("canvas.node.nodeCount", { count: groupChildCount })}
                </span>
            </div>
        </div>
    );
}

function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.activeStroke }}>
            <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            <span className="text-[10px] tracking-[0.2em]">{t("canvas.node.generating")}</span>
        </div>
    );
}

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    const { t } = useTranslation();
    return (
        <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || t("canvas.node.failed")}</div>
            <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                {t("canvas.node.retry")}
            </button>
        </div>
    );
}

function MissingPluginContent({ theme, type }: Pick<NodeContentRendererProps, "theme"> & { type: string }) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: theme.node.placeholder }}>
            <Puzzle className="size-7 opacity-40" />
            <span className="text-sm">{t("canvas.node.missingPlugin")}</span>
            <span className="text-[11px] opacity-70">{t("canvas.node.missingPluginDescription", { type })}</span>
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, batchExpanded, onContentChange, onStopEditing, onToggleBatch, onSetBatchPrimary }: NodeContentRendererProps) {
    const { t } = useTranslation();
    const fontSize = node.metadata?.fontSize || 26;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;
    const texts = node.metadata?.texts || [];
    const batchCount = texts.length;
    const isBatchRoot = batchCount > 1;
    const primaryTextId = node.metadata?.primaryTextId || texts[0]?.id;
    const primaryText = texts.find((text) => text.id === primaryTextId);
    const content = primaryText?.content || node.metadata?.content || "";
    const paddingClass = isBatchRoot ? "px-5 pb-5 pt-14" : "p-5";

    return (
        <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded}>
            {batchExpanded ? texts.filter((text) => text.id !== primaryTextId).map((text, index) => <ExpandedTextCard key={text.id} node={node} text={text} index={index} onSetPrimary={() => onSetBatchPrimary?.(text.id)} />) : null}
            <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl">
                {isEditingContent ? (
                    <CanvasResourceMentionTextarea
                        ref={textareaRef}
                        className={`thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent m-0 font-mono outline-none select-text appearance-none ${paddingClass}`}
                        style={textStyle}
                        value={content}
                        references={mentionReferences}
                        highlightLabels={false}
                        onChange={(value) => onContentChange(node.id, value)}
                        onBlur={onStopEditing}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") onStopEditing();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                    />
                ) : content ? (
                    <div className={`thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent font-mono ${paddingClass}`} style={textStyle} onWheel={(event) => event.stopPropagation()}>
                        {content}
                    </div>
                ) : primaryText ? (
                    <TextSlotStatus text={primaryText} />
                ) : (
                    <div className="p-4 font-mono" style={{ color: theme.node.placeholder }}>
                        {t("canvas.node.editText")}
                    </div>
                )}
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-[0_6px_18px_rgba(28,25,23,.12)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                    aria-label={batchExpanded ? t("canvas.node.textBatchExpanded") : t("canvas.node.textBatchCollapsed")}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none">{t("canvas.controls.texts", { count: batchCount })}</span>
                    <ChevronRight className={`size-3.5 opacity-80 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
        </BatchFrame>
    );
}

function ExpandedTextCard({ node, text, index, onSetPrimary }: { node: CanvasNodeData; text: CanvasNodeText; index: number; onSetPrimary: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const count = node.metadata?.texts?.length || 0;
    const columns = Math.min(count, 4);
    const rows = Math.ceil(count / columns);
    const rootSlot = (rows - 1) * columns;
    const slot = index >= rootSlot ? index + 1 : index;
    const x = (slot % columns) * (node.width + 18);
    const y = (Math.floor(slot / columns) - rows + 1) * (node.height + 18);

    return (
        <div
            className="absolute z-20 overflow-hidden rounded-3xl border shadow-[0_18px_50px_rgba(28,25,23,.14)]"
            style={
                {
                    left: x,
                    top: y,
                    width: node.width,
                    height: node.height,
                    background: theme.node.panel,
                    borderColor: theme.node.stroke,
                    "--batch-from-x": `${-x}px`,
                    "--batch-from-y": `${-y}px`,
                    "--batch-from-rotate": `${4 + index * 2}deg`,
                    animation: `canvas-batch-child-in 320ms ${index * 35}ms cubic-bezier(.2,.85,.18,1) both`,
                } as React.CSSProperties
            }
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {text.content ? (
                <>
                    <div className="thin-scrollbar h-full overflow-y-auto whitespace-pre-wrap break-words px-4 pb-4 pt-14 font-mono text-sm leading-6" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
                        {text.content}
                    </div>
                    <button
                        type="button"
                        className="absolute right-2.5 top-2.5 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: theme.node.text }}
                        onClick={(event) => (event.stopPropagation(), onSetPrimary())}
                    >
                        <Star className="size-3.5" style={{ color: selectionBlue }} />
                        {t("canvas.node.setPrimaryText")}
                    </button>
                </>
            ) : (
                <TextSlotStatus text={text} />
            )}
        </div>
    );
}

function TextSlotStatus({ text }: { text: CanvasNodeText }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const failed = text.status === "error";
    const loading = text.status === "loading";
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: theme.node.fill, color: failed ? theme.node.text : theme.node.activeStroke }}>
            {failed ? (
                <span className="text-xs leading-5">{text.errorDetails || t("canvas.node.failed")}</span>
            ) : loading ? (
                <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            ) : (
                <span className="text-xs">{t("apiErrors.noContent")}</span>
            )}
            {loading ? <span className="text-[10px] tracking-[0.2em]">{t("canvas.node.generating")}</span> : null}
        </div>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && !props.isBatchRoot) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            scale={props.scale}
            batchExpanded={props.batchExpanded}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
            onDuplicateBatchImage={props.onDuplicateBatchImage}
            onDownloadBatchImage={props.onDownloadBatchImage}
            onRetryBatchImage={props.onRetryBatchImage}
            onDeleteBatchImage={props.onDeleteBatchImage}
            onViewBatchImage={props.onViewBatchImage}
        />
    );
}

function EmptyImageContent({ theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: theme.toolbar.activeBg }}>
                <ImageIcon className="size-6 opacity-30" />
            </div>
            <span className="text-[10px] tracking-[0.18em] opacity-50">{t("canvas.node.emptyImage")}</span>
        </div>
    );
}

function VideoNodeContent({ node, theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
                <Video className="size-7 opacity-35" />
                <span className="text-sm">{t("canvas.node.emptyVideo")}</span>
            </div>
        );
    return <video src={node.metadata.content} controls className="h-full w-full rounded-[18px] bg-black object-contain" data-canvas-video={node.id} data-canvas-no-zoom />;
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">{t("canvas.node.emptyAudio")}</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{t("canvas.node.audio")}</span>
            </div>
            <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function ImageContent({
    node,
    scale,
    batchExpanded,
    onToggleBatch,
    onSetBatchPrimary,
    onDuplicateBatchImage,
    onDownloadBatchImage,
    onRetryBatchImage,
    onDeleteBatchImage,
    onViewBatchImage,
}: {
    node: CanvasNodeData;
    scale: number;
    batchExpanded: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: (imageId: string) => void;
    onDuplicateBatchImage?: (imageId: string) => void;
    onDownloadBatchImage?: (imageId: string) => void;
    onRetryBatchImage?: (imageId: string) => void;
    onDeleteBatchImage?: (imageId: string) => void;
    onViewBatchImage?: (imageId: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision, getImagePreviewRevision);
    const images = node.metadata?.images || [];
    const batchCount = images.length;
    const isBatchRoot = batchCount > 1;
    const primaryImageId = node.metadata?.primaryImageId || images[0]?.id;
    const primaryImage = images.find((image) => image.id === primaryImageId);
    const primaryContent = primaryImage?.content || node.metadata?.content;
    const primarySource = primaryContent
        ? pickImageSource({
              previewUrl: previewUrlFor(primaryImage?.storageKey || node.metadata?.storageKey),
              originalUrl: primaryContent,
              naturalWidth: primaryImage?.naturalWidth || node.metadata?.naturalWidth,
              naturalHeight: primaryImage?.naturalHeight || node.metadata?.naturalHeight,
              renderedWidth: node.width,
              renderedHeight: node.height,
              scale,
          })
        : "";

    return (
        <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded}>
            {batchExpanded
                ? images
                      .filter((image) => image.id !== primaryImageId)
                      .map((image, index) => (
                          <ExpandedImageCard
                              key={image.id}
                              node={node}
                              image={image}
                              index={index}
                              scale={scale}
                              onView={() => onViewBatchImage?.(image.id)}
                              onSetPrimary={() => onSetBatchPrimary?.(image.id)}
                              onDuplicate={() => onDuplicateBatchImage?.(image.id)}
                              onDownload={() => onDownloadBatchImage?.(image.id)}
                              onRetry={() => onRetryBatchImage?.(image.id)}
                              onDelete={() => onDeleteBatchImage?.(image.id)}
                          />
                      ))
                : null}
            <div className="group/image relative h-full w-full overflow-hidden rounded-3xl">
                {primaryContent ? (
                    <img
                        src={primarySource}
                        alt={node.title}
                        draggable={false}
                        onDragStart={(event) => event.preventDefault()}
                        className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                    />
                ) : (
                    <ImageSlotStatus image={primaryImage} />
                )}
            </div>
            {primaryImage?.status === "error" ? <BatchImageFailureActions placement="left" onRetry={() => onRetryBatchImage?.(primaryImage.id)} onDelete={() => onDeleteBatchImage?.(primaryImage.id)} /> : null}
            {primaryImage?.content ? (
                <button
                    type="button"
                    className="pointer-events-none absolute left-2.5 top-2.5 z-30 flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium opacity-0 shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition duration-150 hover:scale-[1.02] group-hover/image:pointer-events-auto group-hover/image:opacity-100 group-focus-within/image:pointer-events-auto group-focus-within/image:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                    title={t("common.download")}
                    onClick={(event) => (event.stopPropagation(), onDownloadBatchImage?.(primaryImage.id))}
                >
                    <Download className="size-3" />
                    {t("common.download")}
                </button>
            ) : null}
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-[0_6px_18px_rgba(28,25,23,.16)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                    aria-label={batchExpanded ? t("canvas.node.batchExpanded") : t("canvas.node.batchCollapsed")}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none">{t("canvas.controls.images", { count: batchCount })}</span>
                    <ChevronRight className={`size-3.5 opacity-80 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
        </BatchFrame>
    );
}

function ExpandedImageCard({
    node,
    image,
    index,
    scale,
    onView,
    onSetPrimary,
    onDuplicate,
    onDownload,
    onRetry,
    onDelete,
}: {
    node: CanvasNodeData;
    image: CanvasNodeImage;
    index: number;
    scale: number;
    onView: () => void;
    onSetPrimary: () => void;
    onDuplicate: () => void;
    onDownload: () => void;
    onRetry: () => void;
    onDelete: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const count = node.metadata?.images?.length || 0;
    const columns = Math.min(count, 4);
    const rows = Math.ceil(count / columns);
    const rootSlot = (rows - 1) * columns;
    const slot = index >= rootSlot ? index + 1 : index;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const x = column * (node.width + 18);
    const y = (row - rows + 1) * (node.height + 18);
    const imageSource = image.content
        ? pickImageSource({
              previewUrl: previewUrlFor(image.storageKey),
              originalUrl: image.content,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              renderedWidth: node.width,
              renderedHeight: node.height,
              scale,
          })
        : "";

    return (
        <div
            className={`group/batch-image absolute z-20 overflow-hidden rounded-3xl ${image.content ? "" : "border shadow-[0_18px_50px_rgba(28,25,23,.18)]"}`}
            style={
                {
                    left: x,
                    top: y,
                    width: node.width,
                    height: node.height,
                    background: "transparent",
                    borderColor: theme.node.stroke,
                    "--batch-from-x": `${-x}px`,
                    "--batch-from-y": `${-y}px`,
                    "--batch-from-rotate": `${4 + index * 2}deg`,
                    animation: `canvas-batch-child-in 320ms ${index * 35}ms cubic-bezier(.2,.85,.18,1) both`,
                } as React.CSSProperties
            }
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => {
                if (!image.content || (event.target instanceof Element && event.target.closest("button"))) return;
                event.stopPropagation();
                onView();
            }}
        >
            {image.content ? <img src={imageSource} alt={node.title} draggable={false} className="pointer-events-none h-full w-full select-none object-contain" /> : <ImageSlotStatus image={image} />}
            {image.content ? (
                <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/batch-image:pointer-events-auto group-hover/batch-image:opacity-100 group-focus-within/batch-image:pointer-events-auto group-focus-within/batch-image:opacity-100">
                    <button
                        type="button"
                        className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-medium shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition hover:scale-[1.02]"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                        title={t("common.download")}
                        onClick={(event) => (event.stopPropagation(), onDownload())}
                    >
                        <Download className="size-3 shrink-0" />
                        <span className="truncate">{t("common.download")}</span>
                    </button>
                    <button
                        type="button"
                        className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-medium shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition hover:scale-[1.02]"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                        title={t("canvas.node.createCopy")}
                        onClick={(event) => (event.stopPropagation(), onDuplicate())}
                    >
                        <Copy className="size-3 shrink-0" />
                        <span className="truncate">{t("canvas.node.createCopy")}</span>
                    </button>
                    <button
                        type="button"
                        className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-medium shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition hover:scale-[1.02]"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                        title={t("canvas.node.setPrimary")}
                        onClick={(event) => (event.stopPropagation(), onSetPrimary())}
                    >
                        <Star className="size-3 shrink-0" style={{ color: selectionBlue }} />
                        <span className="truncate">{t("canvas.node.setPrimary")}</span>
                    </button>
                </div>
            ) : null}
            {image.status === "error" ? <BatchImageFailureActions placement="right" onRetry={onRetry} onDelete={onDelete} /> : null}
        </div>
    );
}

function BatchImageFailureActions({ placement, onRetry, onDelete }: { placement: "left" | "right"; onRetry: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    return (
        <div className={`absolute top-3 z-30 flex items-center gap-1.5 ${placement === "left" ? "left-3" : "right-3"}`}>
            <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-sm transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => (event.stopPropagation(), onRetry())}
            >
                <RefreshCw className="size-3.5" />
                {t("canvas.node.retry")}
            </button>
            <button
                type="button"
                className="grid size-8 place-items-center rounded-lg border shadow-sm transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => (event.stopPropagation(), onDelete())}
                aria-label={t("common.delete")}
                title={t("common.delete")}
            >
                <Trash2 className="size-3.5" />
            </button>
        </div>
    );
}

function ImageSlotStatus({ image }: { image?: CanvasNodeImage }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const failed = image?.status === "error";
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: theme.node.fill, color: failed ? theme.node.text : theme.node.activeStroke }}>
            {failed ? (
                <span className="text-xs leading-5">{image.errorDetails || t("canvas.node.failed")}</span>
            ) : (
                <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            )}
            {!failed ? <span className="text-[10px] tracking-[0.2em]">{t("canvas.node.generating")}</span> : null}
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, children }: { batchCount: number; batchExpanded: boolean; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div className="group/batch relative h-full w-full overflow-visible">
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 3) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_10px_24px_rgba(68,64,60,.12)] transition-all duration-300 group-hover/batch:translate-x-1"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded ? 0 : 1,
                                transform: `translate(${10 + index * 6}px, ${4 + index * 3}px) rotate(${1.5 + index}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

type ConnectionMarker = { x: number; y: number; active: boolean };

function connectionMarkerFromEvent(event: React.MouseEvent<HTMLElement>, hitWidth: number, hitHeight: number, circular = false): ConnectionMarker {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const radiusX = Math.max(1, rect.width / 2);
    const radiusY = Math.max(1, rect.height / 2);
    const active = !circular || x * x / (radiusX * radiusX) + y * y / (radiusY * radiusY) <= 1;
    if (!active) return { x: 0, y: 0, active: false };
    return {
        x: x * (hitWidth / Math.max(rect.width, 1)),
        y: y * (hitHeight / Math.max(rect.height, 1)),
        active: true,
    };
}

function ConnectionHandleDot({ side, scale, visible, onMouseDown }: { side: "left" | "right"; scale: number; visible: boolean; onMouseDown: (event: React.MouseEvent) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    // 保留 84px 的屏幕感应区；连接点默认位于卡片外侧，进入后会即时吸附到鼠标位置。
    const screenScale = Math.max(scale, 0.1);
    const markerSize = 20 / screenScale;
    const markerBorder = 1.5 / screenScale;
    const markerIcon = 11 / screenScale;
    const hitSize = 84 / screenScale;
    const magneticOffset = 20 / screenScale;
    const sideOffset = `-${hitSize / 2 + magneticOffset}px`;
    const [marker, setMarker] = useState<ConnectionMarker>({ x: 0, y: 0, active: false });
    const moveMarker = (event: React.MouseEvent<HTMLDivElement>) => setMarker(connectionMarkerFromEvent(event, hitSize, hitSize, true));
    const clearMarker = () => setMarker({ x: 0, y: 0, active: false });

    return (
        <div
            data-canvas-connection-zone={side}
            className="absolute top-1/2 z-30 flex -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full pointer-events-auto"
            style={{
                width: `${hitSize}px`,
                height: `${hitSize}px`,
                ...(side === "left" ? { left: sideOffset } : { right: sideOffset }),
            }}
            onMouseMove={moveMarker}
            onMouseLeave={clearMarker}
        >
            <button
                type="button"
                aria-label={side === "left" ? "开始输入连接" : "开始输出连接"}
                title={side === "left" ? "拖拽连接输入" : "拖拽连接输出"}
                tabIndex={visible || marker.active ? 0 : -1}
                className={`flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${visible || marker.active ? "opacity-100" : "opacity-0"}`}
                style={{
                    width: `${markerSize}px`,
                    height: `${markerSize}px`,
                    borderWidth: `${markerBorder}px`,
                    background: theme.node.panel,
                    borderColor: theme.node.activeStroke,
                    borderStyle: "solid",
                    boxShadow: `0 0 ${3 / screenScale}px ${theme.node.activeStroke}66`,
                    transform: `translate(${marker.x}px, ${marker.y}px)`,
                    transition: marker.active ? "none" : "opacity 120ms ease-out, transform 120ms ease-out",
                }}
                onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    onMouseDown(event);
                }}
            >
                <Plus style={{ width: `${markerIcon}px`, height: `${markerIcon}px`, strokeWidth: 2.5, color: theme.node.activeStroke }} />
            </button>
        </div>
    );
}

function RunningHubWorkflowConnectionHeads({ heads, scale, workflowScale, visible, onMouseDown }: { heads: RunningHubWorkflowPortHead[]; scale: number; workflowScale: number; visible: boolean; onMouseDown: (event: React.MouseEvent, portId: string) => void }) {
    return <>{heads.map((head) => <RunningHubWorkflowConnectionHead key={head.portId} head={head} scale={scale} workflowScale={workflowScale} visible={visible} onMouseDown={onMouseDown} />)}</>;
}

function RunningHubWorkflowConnectionHead({ head, scale, workflowScale, visible, onMouseDown }: { head: RunningHubWorkflowPortHead; scale: number; workflowScale: number; visible: boolean; onMouseDown: (event: React.MouseEvent, portId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const portY = head.summaryY ?? runningHubWorkflowPortY(head.portId, false);
    if (portY === undefined) return null;
    const screenScale = Math.max(scale, 0.1);
    const markerSize = 15 / screenScale;
    const markerBorder = 1.5 / screenScale;
    const markerIcon = 8 / screenScale;
    // Summary heads can stack 34px apart, so widen only their horizontal approach area.
    const hitWidth = 56 / screenScale;
    const hitHeight = 28 / screenScale;
    const color = head.kind === "prompt" ? "#b78cff" : head.kind === "image" ? "#f2ad45" : head.kind === "video" ? "#46c7ad" : "#7ea8ff";
    const Icon = head.kind === "prompt" ? FileText : head.kind === "image" ? ImageIcon : head.kind === "video" ? Video : Music2;
    const label = head.kind === "prompt" ? "提示词" : `${head.kind === "image" ? "图片" : head.kind === "video" ? "视频" : "音频"}${head.index + 1}`;
    const [marker, setMarker] = useState<ConnectionMarker>({ x: 0, y: 0, active: false });
    const moveMarker = (event: React.MouseEvent<HTMLDivElement>) => setMarker(connectionMarkerFromEvent(event, hitWidth, hitHeight));
    const clearMarker = () => setMarker({ x: 0, y: 0, active: false });

    return <div data-canvas-connection-zone="runninghub-summary" data-rh-port={head.portId} data-rh-port-kind={head.kind} className="absolute z-30 flex cursor-crosshair items-center justify-center pointer-events-auto" style={{ width: hitWidth, height: hitHeight, left: RUNNING_HUB_WORKFLOW_PORT_X * workflowScale - hitWidth / 2, top: portY * workflowScale - hitHeight / 2 }} onMouseMove={moveMarker} onMouseLeave={clearMarker}>
        <button type="button" aria-label={`连接${label}端口`} title={head.connected ? `${label} 已接入` : `连接${label}`} data-rh-port={head.portId} data-rh-port-kind={head.kind} tabIndex={visible || marker.active ? 0 : -1} className={`relative flex items-center justify-center rounded-full transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${visible || marker.active ? "opacity-100" : "opacity-0"}`} style={{ width: markerSize, height: markerSize, borderWidth: markerBorder, background: head.connected ? `${color}2d` : theme.node.panel, borderColor: head.connected ? color : theme.node.activeStroke, borderStyle: "solid", boxShadow: `0 0 ${3 / screenScale}px ${head.connected ? `${color}88` : `${theme.node.activeStroke}66`}`, transform: `translate(${marker.x}px, ${marker.y}px)` }} onMouseDown={(event) => { if (event.button === 0) onMouseDown(event, head.portId); }} onClick={(event) => event.stopPropagation()}>
            {head.connected ? <Icon style={{ width: markerIcon, height: markerIcon, strokeWidth: 2.5, color }} /> : <Plus style={{ width: markerIcon, height: markerIcon, strokeWidth: 2.5, color: theme.node.activeStroke }} />}
            {head.connected && head.kind !== "prompt" ? <span className="absolute -right-1.5 -top-1 grid min-w-2.5 size-2.5 place-items-center rounded-full px-px text-[7px] leading-none" style={{ background: color, color: "#171717" }}>{head.index + 1}</span> : null}
        </button>
    </div>;
}
