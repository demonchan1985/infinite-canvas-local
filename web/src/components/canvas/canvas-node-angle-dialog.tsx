import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, ConfigProvider, Slider } from "antd";
import { Camera, RotateCcw, WandSparkles, X } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
    preset?: "custom" | "front" | "left" | "right" | "back" | "top" | "low";
};

const defaultParams: CanvasImageAngleParams = { horizontalAngle: 0, pitchAngle: 0, cameraDistance: 4.8, wideAngle: false, preset: "custom" };
const presets = {
    custom: {},
    front: { horizontalAngle: 0, pitchAngle: 0 },
    left: { horizontalAngle: -90, pitchAngle: 0 },
    right: { horizontalAngle: 90, pitchAngle: 0 },
    back: { horizontalAngle: 180, pitchAngle: 0 },
    top: { horizontalAngle: 0, pitchAngle: 55 },
    low: { horizontalAngle: 0, pitchAngle: -45 },
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function ChoicePill({ selected, theme, children, onClick }: { selected: boolean; theme: CanvasTheme; children: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="h-9 rounded-lg border px-3 text-sm transition hover:opacity-85"
            style={{ background: selected ? theme.toolbar.activeBg : theme.node.fill, borderColor: selected ? theme.node.activeStroke : theme.node.stroke, color: selected ? theme.toolbar.activeText : theme.node.text }}
        >
            {children}
        </button>
    );
}

export function CanvasNodeAngleDialog({ anchorNodeId, canvasScale, canvasViewport, dataUrl, open, onClose, onConfirm }: { anchorNodeId: string; canvasScale: number; canvasViewport: { x: number; y: number; k: number }; dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageAngleParams) => void }) {
    const [params, setParams] = useState(defaultParams);
    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const dialogWidth = 700;
    const dialogHeight = 650;
    const visualScale = 0.6 + canvasScale * 0.4;
    const visualWidth = dialogWidth * visualScale;
    const visualHeight = dialogHeight * visualScale;
    const [placement, setPlacement] = useState({ left: 16, top: 16 });
    const dialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (open) setParams(defaultParams);
    }, [dataUrl, open]);
    useEffect(() => {
        if (!open) return;
        const positionDialog = () => {
            const node = document.querySelector<HTMLElement>(`[data-node-id="${anchorNodeId}"]`);
            if (!node) return;
            const imageRect = node.querySelector<HTMLImageElement>("img")?.getBoundingClientRect();
            const rect = imageRect ?? node.getBoundingClientRect();
            const dialogRect = dialogRef.current?.getBoundingClientRect();
            const actualWidth = dialogRect?.width || visualWidth;
            const actualHeight = dialogRect?.height || visualHeight;
            const edge = 32;
            const centeredLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - actualWidth / 2, window.innerWidth - actualWidth - 16));
            const below = rect.bottom + edge;
            const above = rect.top - actualHeight - edge;
            const sideTop = Math.max(16, Math.min(rect.top, window.innerHeight - actualHeight - 16));
            let left = centeredLeft;
            let top = below;

            if (below + actualHeight <= window.innerHeight - 16) {
                top = below;
            } else if (above >= 16) {
                top = above;
            } else if (rect.right + edge + actualWidth <= window.innerWidth - 16) {
                left = rect.right + edge;
                top = sideTop;
            } else if (rect.left - edge - actualWidth >= 16) {
                left = rect.left - edge - actualWidth;
                top = sideTop;
            } else {
                top = Math.max(16, window.innerHeight - actualHeight - 16);
            }
            setPlacement({ left, top });
        };
        positionDialog();
        const animationFrame = window.requestAnimationFrame(positionDialog);
        window.addEventListener("resize", positionDialog);
        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.removeEventListener("resize", positionDialog);
        };
    }, [anchorNodeId, canvasViewport.k, canvasViewport.x, canvasViewport.y, open, visualHeight, visualWidth]);
    const update = <Key extends keyof CanvasImageAngleParams>(key: Key, value: CanvasImageAngleParams[Key]) => setParams((current) => ({ ...current, [key]: value, ...(key !== "preset" ? { preset: "custom" } : {}) }));
    const updateCamera = (horizontalDelta: number, pitchDelta: number) =>
        setParams((current) => ({
            ...current,
            horizontalAngle: clamp(Math.round(current.horizontalAngle + horizontalDelta), -180, 180),
            pitchAngle: clamp(Math.round(current.pitchAngle + pitchDelta), -75, 75),
            preset: "custom",
        }));
    const applyPreset = (preset: NonNullable<CanvasImageAngleParams["preset"]>) => setParams((current) => ({ ...current, ...presets[preset], preset }));

    if (!open || !dataUrl || typeof document === "undefined") return null;
    return createPortal(
        <ConfigProvider
            theme={{
                token: {
                    colorBgContainer: theme.node.panel,
                    colorBgElevated: theme.node.panel,
                    colorBorder: theme.node.stroke,
                    colorText: theme.node.text,
                    colorTextSecondary: theme.node.muted,
                    colorPrimary: theme.node.activeStroke,
                    colorTextLightSolid: theme.node.panel,
                },
                components: {
                    Button: { defaultBg: theme.node.fill, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text, primaryColor: theme.node.panel, primaryShadow: "none" },
                    Slider: { railBg: theme.node.stroke, railHoverBg: theme.node.stroke, trackBg: theme.node.activeStroke, trackHoverBg: theme.node.activeStroke, handleColor: theme.node.activeStroke, handleActiveColor: theme.node.activeStroke },
                },
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-label="多角度编辑器"
                className="pointer-events-auto p-4"
                style={{ position: "fixed", zIndex: 1000, left: placement.left, top: placement.top, width: `min(${dialogWidth}px, calc(100vw - 32px))`, margin: 0, boxSizing: "border-box", transform: `scale(${visualScale})`, transformOrigin: "top left", color: theme.node.text, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 18, boxShadow: "0 24px 72px rgba(0,0,0,.46)", overflow: "hidden" }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">多角度编辑器</h2>
                            <p className="mt-1 text-xs opacity-60">拖动调整摄影机，或选择常用视角</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button type="text" size="small" icon={<RotateCcw className="size-4" />} onClick={() => setParams(defaultParams)}>
                                重置
                            </Button>
                            <Button type="text" size="small" icon={<X className="size-4" />} onClick={onClose} aria-label="关闭多角度编辑器" />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                        <div className="flex min-h-[290px] flex-col justify-between rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                            <div className="grid flex-1 place-items-center">
                                <div
                                    className="canvas-angle-camera-preview relative size-52 select-none touch-none cursor-grab active:cursor-grabbing"
                                    onPointerDown={(event) => {
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        dragRef.current = { x: event.clientX, y: event.clientY };
                                    }}
                                    onPointerMove={(event) => {
                                        if (!dragRef.current) return;
                                        const deltaX = event.clientX - dragRef.current.x;
                                        const deltaY = event.clientY - dragRef.current.y;
                                        dragRef.current = { x: event.clientX, y: event.clientY };
                                        updateCamera(deltaX * 1.15, -deltaY * 0.9);
                                    }}
                                    onPointerUp={() => {
                                        dragRef.current = null;
                                    }}
                                    onPointerCancel={() => {
                                        dragRef.current = null;
                                    }}
                                >
                                    <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed" style={{ borderColor: theme.node.stroke }} />
                                    <div className="pointer-events-none absolute inset-[12%] rounded-full border" style={{ borderColor: theme.node.stroke }} />
                                    <div className="pointer-events-none absolute inset-[12%] rounded-full border" style={{ borderColor: theme.node.stroke, transform: "rotateY(60deg)" }} />
                                    <div className="pointer-events-none absolute inset-[12%] rounded-full border" style={{ borderColor: theme.node.stroke, transform: "rotateY(-60deg)" }} />
                                    <div className="pointer-events-none absolute inset-[12%] rounded-full border" style={{ borderColor: theme.node.stroke, transform: "rotateX(60deg)" }} />
                                    <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2" style={{ background: theme.node.stroke }} />
                                    <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2" style={{ background: theme.node.stroke }} />
                                    <div className="absolute left-1/2 top-1/2 h-28 w-36 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border shadow-2xl" style={{ borderColor: theme.node.activeStroke, background: theme.node.panel }}>
                                        <img src={dataUrl} alt="角度参考" className="size-full object-cover" draggable={false} style={{ transform: previewTransform(params) }} />
                                    </div>
                                    <div
                                        className="pointer-events-none absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border"
                                        style={{ borderColor: theme.node.activeStroke, background: theme.toolbar.activeBg, color: theme.node.text }}
                                    >
                                        <Camera className="size-5" />
                                    </div>
                                </div>
                            </div>
                            <div className="text-center text-xs" style={{ color: theme.node.muted }}>
                                拖动调整摄影机
                            </div>
                        </div>
                        <div className="space-y-3 py-1">
                            <div className="grid grid-cols-4 gap-2">
                                {(Object.keys(presets) as NonNullable<CanvasImageAngleParams["preset"]>[]).map((preset) => (
                                    <ChoicePill key={preset} selected={params.preset === preset} theme={theme} onClick={() => applyPreset(preset)}>
                                        {presetLabel(preset)}
                                    </ChoicePill>
                                ))}
                            </div>
                            <AngleSlider theme={theme} label="水平环绕" value={params.horizontalAngle} min={-180} max={180} step={1} suffix="°" onChange={(value) => update("horizontalAngle", value)} />
                            <AngleSlider theme={theme} label="垂直俯仰" value={params.pitchAngle} min={-75} max={75} step={1} suffix="°" onChange={(value) => update("pitchAngle", value)} />
                            <AngleSlider theme={theme} label="景别缩放" value={params.cameraDistance} min={1} max={10} step={0.1} suffix={` · ${distanceLabel(params.cameraDistance)}`} onChange={(value) => update("cameraDistance", value)} />
                            <div className="grid grid-cols-[76px_1fr] items-center gap-3">
                                <span className="font-medium" style={{ color: theme.node.muted }}>
                                    镜头
                                </span>
                                <div className="flex gap-2">
                                    <ChoicePill selected={!params.wideAngle} theme={theme} onClick={() => update("wideAngle", false)}>
                                        标准
                                    </ChoicePill>
                                    <ChoicePill selected={params.wideAngle} theme={theme} onClick={() => update("wideAngle", true)}>
                                        广角
                                    </ChoicePill>
                                </div>
                            </div>
                            <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                                当前视角：{presetLabel(params.preset || "custom")} · {params.horizontalAngle}° / {params.pitchAngle}° · {params.cameraDistance.toFixed(1)} {distanceLabel(params.cameraDistance)}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="primary" icon={<WandSparkles className="size-4" />} onClick={() => onConfirm(params)}>
                            生成新角度
                        </Button>
                    </div>
                </div>
            </div>
        </ConfigProvider>,
        document.body,
    );
}

function AngleSlider({ theme, label, value, min, max, step, suffix, onChange }: { theme: CanvasTheme; label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
    return (
        <div className="grid grid-cols-[76px_1fr_auto] items-center gap-3">
            <span className="font-medium" style={{ color: theme.node.muted }}>
                {label}
            </span>
            <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
            <span className="whitespace-nowrap text-right font-semibold">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {suffix}
            </span>
        </div>
    );
}

function previewTransform(params: CanvasImageAngleParams) {
    const scale = 1.08 - params.cameraDistance * 0.035 + (params.wideAngle ? -0.08 : 0);
    return `perspective(520px) rotateY(${params.horizontalAngle * -0.45}deg) rotateX(${params.pitchAngle * 0.35}deg) scale(${Math.max(0.72, Math.min(1.08, scale))})`;
}

function presetLabel(preset: NonNullable<CanvasImageAngleParams["preset"]>) {
    return { custom: "自定义", front: "正面", left: "左侧", right: "右侧", back: "背面", top: "俯拍", low: "仰拍" }[preset];
}

function distanceLabel(value: number) {
    if (value < 3.5) return "特写";
    if (value < 6.5) return "中景";
    return "远景";
}
