import type { ReactNode } from "react";
import { Dropdown, Popover, Segmented, Switch, Tooltip } from "antd";
import { Eraser, FolderOpen, Group, Hand, Image as ImageIcon, MousePointer2, Music2, Palette, Plus, Redo2, Settings2, Trash2, Type, Undo2, Upload, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canvasBackgroundPalette, canvasBackgroundToneOptions, canvasThemes, type CanvasBackgroundMode, type CanvasBackgroundTone } from "@/lib/canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAssetStore } from "@/stores/use-asset-store";
import type { CanvasViewMode } from "@/stores/canvas/use-canvas-workspace-store";

type CanvasToolbarProps = {
    selectedCount: number;
    canvasTool: "select" | "pan";
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    backgroundTone: CanvasBackgroundTone;
    showImageInfo: boolean;
    viewMode: CanvasViewMode;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onAddGroup: () => void;
    onAddExtensionNode: (type: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onOpenAssets: () => void;
    onDelete: () => void;
    onClear: () => void;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onBackgroundToneChange: (tone: CanvasBackgroundTone) => void;
    onShowImageInfoChange: (show: boolean) => void;
};

export function CanvasToolbar(props: CanvasToolbarProps) {
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const assetCount = useAssetStore((state) => state.assets.length);
    useNodeRegistryVersion();
    const extensions = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin");
    const createItems = [
        { key: "text", label: t("canvas.toolbar.text"), icon: <Type className="size-4" />, onClick: props.onAddText },
        { key: "image", label: t("canvas.toolbar.image"), icon: <ImageIcon className="size-4" />, onClick: props.onAddImage },
        { key: "video", label: t("canvas.toolbar.video"), icon: <Video className="size-4" />, onClick: props.onAddVideo },
        ...(props.viewMode === "professional" ? [{ key: "audio", label: t("canvas.toolbar.audio"), icon: <Music2 className="size-4" />, onClick: props.onAddAudio }] : []),
        { key: "group", label: t("canvas.toolbar.group"), icon: <Group className="size-4" />, onClick: props.onAddGroup },
        ...(props.viewMode === "professional"
            ? [
                  { key: "config", label: t("canvas.toolbar.config"), icon: <Settings2 className="size-4" />, onClick: props.onAddConfig },
                  ...extensions.map((def) => ({ key: def.type, label: def.title, icon: def.icon, onClick: () => props.onAddExtensionNode(def.type) })),
              ]
            : []),
        { key: "upload", label: t("canvas.toolbar.upload"), icon: <Upload className="size-4" />, onClick: props.onUpload },
    ];
    const panelStyle = { background: theme.toolbar.panel, color: theme.toolbar.item, boxShadow: "0 8px 28px rgba(0,0,0,.12)" };
    return (
        <>
            <div className="pointer-events-none absolute inset-x-3 bottom-1 z-50 flex justify-center" data-canvas-chrome>
                <div role="toolbar" aria-label="画布工具" className="pointer-events-auto flex h-11 max-w-full items-center gap-0.5 rounded-2xl px-1.5 backdrop-blur-xl" style={panelStyle}>
                    <DockButton label="移动与选择" active={props.canvasTool === "pan"} onClick={() => props.onCanvasToolChange("pan")}>
                        <Hand className="size-4" />
                    </DockButton>
                    <DockButton label="框选" active={props.canvasTool === "select"} onClick={() => props.onCanvasToolChange("select")}>
                        <MousePointer2 className="size-4" />
                    </DockButton>
                    <span className="mx-1 h-4 w-px opacity-60" style={{ background: theme.toolbar.border }} />
                    <DockButton label={t("canvas.undo")} disabled={!props.canUndo} onClick={props.onUndo}>
                        <Undo2 className="size-4" />
                    </DockButton>
                    <DockButton label={t("canvas.redo")} disabled={!props.canRedo} onClick={props.onRedo}>
                        <Redo2 className="size-4" />
                    </DockButton>
                    <Dropdown trigger={["click"]} placement="top" menu={{ items: createItems }}>
                        <button type="button" aria-label="添加节点" title="添加节点" className="grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10">
                            <Plus className="size-4" />
                        </button>
                    </Dropdown>
                    <DockButton label={`素材空间 · ${assetCount} 项`} onClick={props.onOpenAssets}>
                        <FolderOpen className="size-4" />
                    </DockButton>
                    <Popover
                        trigger="click"
                        placement="top"
                        title="画布外观"
                        content={
                            <div className="w-60 space-y-4 py-2" data-canvas-no-zoom>
                                <Segmented
                                    block
                                    value={colorTheme}
                                    options={[
                                        { value: "light", label: "浅色" },
                                        { value: "dark", label: "深色" },
                                    ]}
                                    onChange={setTheme}
                                />
                                <Segmented
                                    block
                                    value={props.backgroundMode}
                                    options={[
                                        { value: "lines", label: "网格" },
                                        { value: "dots", label: "点阵" },
                                        { value: "blank", label: "空白" },
                                    ]}
                                    onChange={(value) => props.onBackgroundModeChange(value as CanvasBackgroundMode)}
                                />
                                <div role="group" aria-label="色调" className="grid grid-cols-4 gap-1.5">
                                    {canvasBackgroundToneOptions.map((option) => {
                                        const palette = canvasBackgroundPalette(colorTheme, option.value);
                                        const selected = props.backgroundTone === option.value;
                                        return (
                                            <Tooltip key={option.value} title={option.label}>
                                                <button
                                                    type="button"
                                                    aria-label={option.label}
                                                    aria-pressed={selected}
                                                    className="h-9 flex-1 rounded-md border transition hover:brightness-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/60"
                                                    style={{
                                                        backgroundColor: palette.background,
                                                        backgroundImage: `radial-gradient(circle, ${palette.dot} .7px, transparent .8px)`,
                                                        backgroundSize: "6px 6px",
                                                        borderColor: selected ? theme.node.activeStroke : palette.swatch,
                                                        boxShadow: selected ? `0 0 0 1px ${theme.node.activeStroke}` : `inset 0 -3px 0 ${palette.swatch}`,
                                                    }}
                                                    onClick={() => props.onBackgroundToneChange(option.value)}
                                                />
                                            </Tooltip>
                                        );
                                    })}
                                </div>
                                {props.viewMode === "professional" ? (
                                    <div className="flex items-center justify-between text-xs">
                                        <span>图片尺寸与文件信息</span>
                                        <Switch size="small" checked={props.showImageInfo} onChange={props.onShowImageInfoChange} />
                                    </div>
                                ) : null}
                            </div>
                        }
                    >
                        <button type="button" aria-label="画布外观" title="画布外观" className="grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10">
                            <Palette className="size-4" />
                        </button>
                    </Popover>
                    {props.selectedCount ? (
                        <DockButton label={t("canvas.deleteSelected")} onClick={props.onDelete}>
                            <Trash2 className="size-4" />
                        </DockButton>
                    ) : null}
                    <DockButton label={t("canvas.toolbar.clear")} onClick={props.onClear}>
                        <Eraser className="size-4" />
                    </DockButton>
                </div>
            </div>
        </>
    );
}

function DockButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <Tooltip title={label}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={onClick}
                className="grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10"
                style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : undefined}
            >
                {children}
            </button>
        </Tooltip>
    );
}
