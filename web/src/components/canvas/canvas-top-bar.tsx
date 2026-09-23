import { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, Download, Home, Images, Menu, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Redo2, Scan, Search, Settings2, Trash2, Undo2, Upload, Workflow } from "lucide-react";
import { Dropdown, Modal, Popover, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { RunningHubAccountBalance } from "@/components/layout/runninghub-account-balance";
import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { DOCS_URL } from "@/constant/env";
import { useCanvasWorkspaceStore } from "@/stores/canvas/use-canvas-workspace-store";

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onExportProject,
    onImportImage,
    onOpenPlugins,
    onImportRunningHubWorkflow,
    onOpenWorkflowLibrary,
    onUndo,
    onRedo,
    agentOpen,
    compactAgentStatus,
    onToggleAgent,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onExportProject: () => void;
    onImportImage: () => void;
    onOpenPlugins: () => void;
    onImportRunningHubWorkflow: () => void;
    onOpenWorkflowLibrary: () => void;
    onUndo: () => void;
    onRedo: () => void;
    agentOpen: boolean;
    compactAgentStatus: { connected: boolean; enabled: boolean; activity: string };
    onToggleAgent: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);
    const setSearchOpen = useCanvasWorkspaceStore((state) => state.setSearchOpen);
    const setFocusMode = useCanvasWorkspaceStore((state) => state.setFocusMode);
    const panelStyle = { background: theme.toolbar.panel, color: theme.node.text, boxShadow: "0 8px 28px rgba(0,0,0,.12)" };

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div className="pointer-events-none absolute inset-x-3 top-3 z-50 flex items-start justify-between gap-2 @min-[600px]:inset-x-4" data-canvas-chrome>
                <div className="pointer-events-auto flex h-11 min-w-0 items-center gap-1 rounded-2xl px-2 backdrop-blur-xl" style={panelStyle}>
                    <Tooltip title={sidePanelOpen ? t("canvas.collapsePanel") : t("canvas.expandPanel")}>
                        <button
                            type="button"
                            onClick={toggleSidePanel}
                            aria-label={sidePanelOpen ? t("canvas.collapsePanel") : t("canvas.expandPanel")}
                            className="grid size-7 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                        >
                            {sidePanelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                        </button>
                    </Tooltip>
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "home", icon: <Home className="size-4" />, label: t("canvas.home"), onClick: onHome },
                                { key: "docs", icon: <BookOpen className="size-4" />, label: t("canvas.docs"), onClick: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer") },
                                { key: "projects", icon: <Images className="size-4" />, label: t("canvas.projects"), onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.deleteCurrent"), onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: t("canvas.importAsset"), onClick: onImportImage },
                                { key: "export", icon: <Download className="size-4" />, label: t("canvas.exportCurrent"), onClick: onExportProject },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvas.undo")} shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvas.redo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button type="button" className="grid size-7 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label={t("canvas.openMenu")}>
                            <Menu className="size-4" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="w-28 max-w-[200px] bg-transparent p-0 text-left text-sm font-medium outline-none @min-[600px]:w-48"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-24 truncate px-1 text-left text-sm font-medium transition hover:opacity-70 @min-[600px]:max-w-[200px]"
                                onClick={onStartTitleEditing}
                                title="点击修改画布名称"
                                style={{ overflow: "hidden" }}
                            >
                                {title}
                            </button>
                        )}
                    </div>
                    <button type="button" className="hidden size-7 place-items-center rounded-lg opacity-50 hover:opacity-100 @min-[600px]:grid" aria-label="重命名画布" onClick={onStartTitleEditing}><Pencil className="size-3.5" /></button>
                    <span className="hidden @min-[1000px]:block"><CompactAgentStatus status={compactAgentStatus} onClick={onToggleAgent} /></span>
                </div>

                <div className="pointer-events-auto flex h-11 shrink-0 items-center gap-0.5 rounded-2xl px-1.5 backdrop-blur-xl" style={panelStyle}>
                    <Tooltip title="搜索节点（⌘K）"><button type="button" aria-label="搜索画布节点" onClick={() => setSearchOpen(true)} className="grid size-8 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><Search className="size-4" /></button></Tooltip>
                    <Popover trigger="click" placement="bottomRight" title="画布设置" content={<UserStatusActions variant="canvas" onOpenShortcuts={() => setShortcutsOpen(true)} onOpenPlugins={onOpenPlugins} />}><button type="button" aria-label="画布设置" className="grid size-8 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><Settings2 className="size-4" /></button></Popover>
                    <Tooltip title="专注模式（⇧⌘F）"><button type="button" aria-label="进入专注模式" onClick={() => setFocusMode(true)} className="grid size-8 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><Scan className="size-4" /></button></Tooltip>
                    <Tooltip title="工作流节点库"><button type="button" aria-label="工作流节点库" onClick={onOpenWorkflowLibrary} className="grid size-8 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><Workflow className="size-4" /></button></Tooltip>
                    <Tooltip title="导入 RunningHub 工作流或 AI 应用"><button type="button" aria-label="导入 RunningHub 工作流或 AI 应用" onClick={onImportRunningHubWorkflow} className="grid size-8 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><Upload className="size-4" /></button></Tooltip>
                    <RunningHubAccountBalance />
                    <span className="mx-1 h-4 w-px" style={{ background: theme.toolbar.border }} />
                    <button type="button" aria-label="Agent" aria-pressed={agentOpen} onClick={onToggleAgent} className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10" style={agentOpen ? { background: theme.toolbar.activeBg } : undefined}><Bot className="size-4" /><span className="hidden @min-[600px]:inline">Agent</span></button>
                </div>
            </div>
            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["⌘ / Ctrl", "K"]} value="搜索节点" />
                    <Shortcut keys={["⌘ / Ctrl", "Shift", "F"]} value="切换专注模式" />
                    <Shortcut keys={["Shift", "1"]} value="适应全部节点" />
                    <Shortcut keys={["Ctrl / Space", t("canvas.shortcut.drag")]} value={t("canvas.shortcut.toggleTool")} />
                    <Shortcut keys={[t("canvas.shortcut.wheel")]} value={t("canvas.shortcut.zoom")} />
                    <Shortcut keys={[t("canvas.shortcut.zoomSlider")]} value={t("canvas.shortcut.preciseZoom")} />
                    <Shortcut keys={[t("canvas.shortcut.drag")]} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut keys={["Shift / Cmd", t("canvas.shortcut.click")]} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut keys={["Ctrl / Cmd", "A"]} value={t("canvas.shortcut.selectAll")} />
                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value={t("canvas.shortcut.copyPaste")} />
                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value={t("canvas.undo")} />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value={t("canvas.redo")} />
                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value={t("canvas.redo")} />
                    <Shortcut keys={["Delete / Backspace"]} value={t("canvas.shortcut.delete")} />
                    <Shortcut keys={["Esc"]} value={t("canvas.shortcut.escape")} />
                    <Shortcut keys={[t("canvas.shortcut.dropMedia")]} value={t("canvas.shortcut.upload")} />
                </div>
            </Modal>
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function CompactAgentStatus({ status, onClick }: { status: { connected: boolean; enabled: boolean; activity: string }; onClick: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { t } = useTranslation();
    const label = status.connected ? t("canvas.agentConnected") : status.enabled ? t("canvas.agentConnecting", { activity: status.activity || t("canvas.connecting") }) : t("canvas.agentDisconnected");
    const dotColor = status.connected ? "#22c55e" : status.enabled ? "#f59e0b" : theme.node.muted;
    return (
        <button type="button" className="flex h-8 items-center gap-1.5 text-xs transition hover:opacity-75" style={{ color: status.connected ? "#16a34a" : status.enabled ? "#d97706" : theme.node.muted }} onClick={onClick} title={t("canvas.openAgent")}>
            <span className="size-2 rounded-full" style={{ background: dotColor }} />
            <span className="max-w-[140px] truncate">{label}</span>
        </button>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: "rgba(120,113,108,.28)", background: "linear-gradient(#fff, rgba(245,245,244,.92))", color: "rgb(68,64,60)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}
