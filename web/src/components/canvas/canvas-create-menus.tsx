import { useEffect, useRef } from "react";
import { ImageIcon, List, Music2, PenLine, Sparkles, Video, WandSparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { canvasCardVisualScale } from "@/lib/canvas/canvas-node-size";
import { useThemeStore } from "@/stores/use-theme-store";
import { listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type ConnectionHandle, type Position } from "@/types/canvas";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

export type ConnectionCreateRequest = {
    type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio;
    initialPrompt?: string;
    title?: string;
    storyboardMode?: boolean;
};

export function ConnectionCreateMenu({
    pending,
    scale,
    onCreate,
    onClose,
}: {
    pending: PendingConnectionCreate;
    scale: number;
    onCreate: (request: ConnectionCreateRequest) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const visualScale = canvasCardVisualScale(scale);
    return (
        <div
            className="absolute z-[120] w-[400px] overflow-hidden rounded-[18px] border p-2 shadow-2xl backdrop-blur"
            data-connection-create-menu
            data-canvas-no-zoom
            style={{ left: pending.position.x, top: pending.position.y, transform: `scale(${visualScale})`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between border-b px-2 pb-2" style={{ borderColor: theme.node.stroke }}>
                <div>
                    <div className="flex items-center gap-3">
                        <span className="grid size-12 place-items-center rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}><WandSparkles className="size-6" /></span>
                        <div>
                            <div className="text-xl font-semibold">{t("canvas.createMenu.createNext")}</div>
                            <div className="mt-2 text-lg" style={{ color: theme.node.muted }}>{t("canvas.createMenu.fromNode")}</div>
                        </div>
                    </div>
                </div>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    ×
                </button>
            </div>
            <div className="grid">
                <ConnectionCreateOption showDivider theme={theme} icon={<List className="size-6" />} title={t("canvas.createMenu.text")} description={t("canvas.createMenu.textDescription")} onClick={() => onCreate({ type: CanvasNodeType.Text })} />
                <ConnectionCreateOption showDivider theme={theme} icon={<ImageIcon className="size-6" />} title={t("canvas.createMenu.image")} onClick={() => onCreate({ type: CanvasNodeType.Image })} />
                <ConnectionCreateOption showDivider theme={theme} icon={<Video className="size-6" />} title={t("canvas.createMenu.video")} onClick={() => onCreate({ type: CanvasNodeType.Video })} />
                <ConnectionCreateOption showDivider theme={theme} icon={<Sparkles className="size-6" />} title={t("canvas.createMenu.storyboard")} description={t("canvas.createMenu.storyboardDescription")} onClick={() => onCreate({ type: CanvasNodeType.Text, title: t("canvas.createMenu.storyboard"), initialPrompt: t("canvas.createMenu.storyboardPrompt"), storyboardMode: true })} />
                <ConnectionCreateOption showDivider theme={theme} icon={<PenLine className="size-6" />} title={t("canvas.createMenu.drawing")} description={t("canvas.createMenu.drawingDescription")} onClick={() => onCreate({ type: CanvasNodeType.Image })} />
                <ConnectionCreateOption showDivider theme={theme} icon={<Music2 className="size-6" />} title={t("canvas.createMenu.audio")} onClick={() => onCreate({ type: CanvasNodeType.Audio })} />
                <ConnectionCreateOption theme={theme} icon={<WandSparkles className="size-6" />} title={t("canvas.createMenu.config")} description={t("canvas.createMenu.configDescription")} onClick={() => onCreate({ type: CanvasNodeType.Config })} />
            </div>
        </div>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, showDivider = false, compact = false, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; showDivider?: boolean; compact?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            className={`flex w-full min-w-0 cursor-pointer overflow-hidden rounded-none text-left transition ${compact ? "gap-2 px-1.5" : "gap-3 px-2"} ${compact ? (description ? "min-h-[60px] items-start py-2" : "h-14 items-center") : (description ? "h-[88px] items-start py-3" : "h-20 items-center")} ${showDivider ? "border-b" : ""}`}
            style={{ color: theme.node.text, borderColor: showDivider ? theme.node.stroke : undefined }}
            onClick={onClick}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        >
            <span className={`grid shrink-0 place-items-center border ${compact ? "size-8 rounded-lg [&_svg]:size-4" : "size-12 rounded-xl"}`} style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1 overflow-hidden">
                <span className={`flex items-center gap-2 truncate ${compact ? "text-base font-medium leading-5" : "text-xl font-semibold leading-7"}`}>{title}</span>
                {description ? (
                        <span className={`block truncate ${compact ? "mt-1 text-xs leading-4" : "mt-2 text-lg leading-6"}`} style={{ color: theme.node.muted }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

export function NodeCreateMenu({ position, scale, onCreate, onClose }: { position: Position; scale: number; onCreate: (type: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useNodeRegistryVersion();
    const menuRef = useRef<HTMLDivElement>(null);
    const definitions = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false);
    const visualScale = canvasCardVisualScale(scale);
    // Close automatically when clicking outside the menu.
    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [onClose]);
    return (
        <div
            ref={menuRef}
            className="absolute z-[120] max-h-[70vh] w-[272px] overflow-y-auto rounded-[14px] border p-2 shadow-2xl backdrop-blur thin-scrollbar"
            data-canvas-no-zoom
            style={{ left: position.x, top: position.y, transform: `scale(${visualScale})`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {t("canvas.createMenu.select")}
                </span>
                <button type="button" className="grid size-6 place-items-center rounded-md opacity-55 transition hover:opacity-100" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    <X className="size-4" />
                </button>
            </div>
            <div className="grid gap-0">
                {definitions.map((def, index) => (
                    <ConnectionCreateOption key={def.type} compact showDivider={index < definitions.length - 1} theme={theme} icon={def.icon} title={def.title} description={def.description} onClick={() => onCreate(def.type)} />
                ))}
            </div>
        </div>
    );
}
