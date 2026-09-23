import type { ReactNode } from "react";
import { Check, Compass, Focus, HelpCircle, LayoutGrid, Minus, Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, InputNumber, Modal, Popover, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasViewMode } from "@/stores/canvas/use-canvas-workspace-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    miniMap?: ReactNode;
    onArrange: () => void;
    canArrange: boolean;
    viewMode: CanvasViewMode;
    onViewModeChange: (mode: CanvasViewMode) => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap, miniMap, onArrange, canArrange, viewMode, onViewModeChange }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const toolbarTooltipProps = { color: theme.node.panel, styles: { container: { background: theme.node.panel, border: `1px solid ${theme.toolbar.border}`, color: theme.node.text } } };
    const viewModeLabel = viewMode === "professional" ? "专业模式" : "简洁模式";

    return (
        <>
            <div className="absolute bottom-1 right-8 z-50 flex flex-col items-center gap-1 @min-[600px]:right-10" data-canvas-chrome onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                {miniMap ? <div className="shrink-0">{miniMap}</div> : null}
                <div role="toolbar" aria-label="画布视图控制" className="flex h-11 items-center rounded-2xl px-1.5 backdrop-blur-xl" style={dockStyle}>
                    <Tooltip {...toolbarTooltipProps} title={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}>
                        <Button
                            type="text"
                            className="!h-7 !w-7 !min-w-7 !p-0"
                            style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                            icon={<Compass className="size-4" />}
                            onClick={onToggleMiniMap}
                            aria-label={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}
                        />
                    </Tooltip>
                    <Tooltip {...toolbarTooltipProps} title="适应画布（Shift+1）">
                        <Button type="text" className="!h-7 !w-7 !min-w-7 !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label="适应画布" />
                    </Tooltip>
                    <Tooltip {...toolbarTooltipProps} title="自动整理节点（可撤销）">
                        <Button type="text" className="!h-7 !w-7 !min-w-7 !p-0" disabled={!canArrange} icon={<LayoutGrid className="size-4" />} onClick={onArrange} aria-label="自动整理节点" />
                    </Tooltip>
                    <Tooltip {...toolbarTooltipProps} title="缩小画布">
                        <Button type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Minus className="size-4" />} onClick={() => onScaleChange(scale / 1.2)} aria-label="缩小画布" />
                    </Tooltip>
                    <Popover
                        trigger="click"
                        placement="top"
                        title="精确缩放"
                        content={
                            <div className="w-44 space-y-3" data-canvas-no-zoom>
                                <InputNumber
                                    aria-label="缩放百分比"
                                    min={5}
                                    max={500}
                                    value={Math.round(scale * 100)}
                                    suffix="%"
                                    onChange={(value) => {
                                        if (value !== null) onScaleChange(value / 100);
                                    }}
                                />
                                <div className="flex gap-2">
                                    {[25, 50, 100].map((value) => (
                                        <Button key={value} size="small" onClick={() => onScaleChange(value / 100)}>
                                            {value}%
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        }
                    >
                        <Tooltip {...toolbarTooltipProps} title="精确缩放">
                            <button type="button" aria-label="精确缩放" className="h-7 w-11 rounded-md text-center text-xs tabular-nums hover:bg-black/5 dark:hover:bg-white/10">
                                {Math.round(scale * 100)}%
                            </button>
                        </Tooltip>
                    </Popover>
                    <Tooltip {...toolbarTooltipProps} title="放大画布">
                        <Button type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Plus className="size-4" />} onClick={() => onScaleChange(scale * 1.2)} aria-label="放大画布" />
                    </Tooltip>
                    <Tooltip {...toolbarTooltipProps} title={t("canvas.shortcuts")}>
                        <Button
                            type="text"
                            className="!h-7 !w-7 !min-w-7 !p-0"
                            style={shortcutsOpen ? activeStyle : { color: theme.toolbar.item }}
                            icon={<HelpCircle className="size-4" />}
                            onClick={() => setShortcutsOpen(true)}
                            aria-label={t("canvas.shortcuts")}
                        />
                    </Tooltip>
                    <span className="mx-1 h-5 w-px" style={{ background: theme.toolbar.border }} />
                    <Popover
                        trigger="click"
                        placement="topRight"
                        content={
                            <div className="w-72 space-y-1" data-canvas-no-zoom>
                                <ModeOption active={viewMode === "simple"} icon={<Sparkles className="size-4" />} title="简洁模式" description="保留核心创作路径，降低参数密度" onClick={() => onViewModeChange("simple")} />
                                <ModeOption active={viewMode === "professional"} icon={<SlidersHorizontal className="size-4" />} title="专业模式" description="显示完整节点、导演台与生成控制" onClick={() => onViewModeChange("professional")} />
                            </div>
                        }
                    >
                        <Tooltip {...toolbarTooltipProps} title={`切换视图模式（当前：${viewModeLabel}）`}>
                            <button type="button" aria-label={`切换视图模式，当前${viewModeLabel}`} className="grid size-7 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.toolbar.item }}>
                                <SlidersHorizontal className="size-4" />
                            </button>
                        </Tooltip>
                    </Popover>
                </div>
            </div>
            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut label="⌘ / Ctrl + K" value="搜索节点" />
                    <Shortcut label="⇧ + ⌘ / Ctrl + F" value="专注模式" />
                    <Shortcut label="Shift + 1" value="适应画布" />
                    <Shortcut label={`Ctrl / Space + ${t("canvas.shortcut.drag")}`} value={t("canvas.shortcut.toggleTool")} />
                    <Shortcut label={t("canvas.shortcut.wheel")} value={t("canvas.shortcut.zoom")} />
                    <Shortcut label={t("canvas.shortcut.drag")} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut label={`Shift / Cmd + ${t("canvas.shortcut.click")}`} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut label="Ctrl / Cmd + C / V" value={t("canvas.shortcut.copyPasteNodes")} />
                    <Shortcut label="Delete / Backspace" value={t("canvas.shortcut.delete")} />
                </div>
            </Modal>
        </>
    );
}

function ModeOption({ active, icon, title, description, onClick }: { active: boolean; icon: ReactNode; title: string; description: string; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button type="button" className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10" style={active ? { background: theme.toolbar.activeBg } : undefined} onClick={onClick}>
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: theme.toolbar.panel, color: theme.toolbar.item }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.node.text }}>
                    {title}
                    {active ? <Check className="ml-auto size-4" /> : null}
                </span>
                <span className="mt-0.5 block text-xs leading-5 opacity-60" style={{ color: theme.node.text }}>
                    {description}
                </span>
            </span>
        </button>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
