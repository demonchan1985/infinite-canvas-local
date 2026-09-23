import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, ConfigProvider } from "antd";
import { ScanFace, WandSparkles, X } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const emotionGrid = [
    ["欣喜若狂", "兴高采烈", "惊喜", "震惊", "惊恐"],
    ["开怀", "期待", "专注", "警觉", "紧张"],
    ["温柔", "浅然莞尔", "中性克制", "隐忍", "疏离"],
    ["安心", "释然", "疲惫", "失落", "悲伤"],
    ["满足", "平静", "冷淡", "隐忍心伤", "绝望"],
] as const;
const textureGroups = {
    sceneBlend: ["轻度对齐", "自然融合", "深度融合"],
    lightBlend: ["柔和补光", "自然匹配", "氛围强化"],
    skin: ["清透修饰", "自然肤质", "真实肌理"],
    texture: ["柔和纹理", "自然纹理", "颗粒质感"],
    sharpness: ["柔焦", "标准清晰", "高清锐化"],
} as const;

export type CanvasImagePersonAdjustParams = {
    mode: "emotion" | "texture";
    faceIndex: number;
    emotion: string;
    intensity: number;
    texture: Record<keyof typeof textureGroups, string>;
};

const defaults: CanvasImagePersonAdjustParams = {
    mode: "emotion",
    faceIndex: 0,
    emotion: "浅然莞尔",
    intensity: 50,
    texture: { sceneBlend: "自然融合", lightBlend: "自然匹配", skin: "自然肤质", texture: "自然纹理", sharpness: "标准清晰" },
};

type FaceRegion = { left: number; top: number; width: number; height: number };
type FaceDetectorLike = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect: (image: HTMLImageElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> };

function dialogToken(theme: CanvasTheme) {
    return {
        token: {
            colorBgBase: theme.canvas.background,
            colorBgContainer: theme.node.panel,
            colorBgElevated: theme.node.panel,
            colorBorder: theme.node.stroke,
            colorText: theme.node.text,
            colorTextSecondary: theme.node.muted,
            colorPrimary: theme.node.activeStroke,
            colorTextLightSolid: theme.node.panel,
        },
        components: {
            Button: {
                defaultBg: theme.node.fill,
                defaultBorderColor: theme.node.stroke,
                defaultColor: theme.node.text,
                primaryColor: theme.node.panel,
                primaryShadow: "none",
            },
        },
    };
}

function ChoicePill({ selected, theme, children, onClick, className = "" }: { selected: boolean; theme: CanvasTheme; children: ReactNode; onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg border px-3 py-1.5 text-sm transition hover:opacity-85 ${className}`}
            style={{ background: selected ? theme.toolbar.activeBg : theme.node.fill, borderColor: selected ? theme.node.activeStroke : theme.node.stroke, color: selected ? theme.toolbar.activeText : theme.node.text }}
        >
            {children}
        </button>
    );
}

async function detectFaceRegions(dataUrl: string): Promise<FaceRegion[]> {
    const image = new Image();
    image.src = dataUrl;
    await new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
    });
    if (!image.naturalWidth || !image.naturalHeight) return [];
    const detector = (window as unknown as { FaceDetector?: FaceDetectorLike }).FaceDetector;
    if (detector) {
        try {
            const faces = await new detector({ fastMode: true, maxDetectedFaces: 10 }).detect(image);
            if (faces.length)
                return faces.map(({ boundingBox }) => ({
                    left: (boundingBox.x / image.naturalWidth) * 100,
                    top: (boundingBox.y / image.naturalHeight) * 100,
                    width: (boundingBox.width / image.naturalWidth) * 100,
                    height: (boundingBox.height / image.naturalHeight) * 100,
                }));
        } catch {
            // Fall back to the canvas portrait layout when the browser detector is unavailable.
        }
    }
    return image.naturalWidth / image.naturalHeight > 1.35
        ? [
              // The canvas portrait layout places the close-up face near the
              // upper-left, with the two smaller front/side faces across the
              // upper middle. Keep these boxes around the face rather than
              // covering the full head/torso when FaceDetector is unavailable.
              { left: 6, top: 7, width: 27, height: 36 },
              { left: 47, top: 6, width: 12, height: 18 },
              { left: 65, top: 6, width: 12, height: 18 },
          ]
        : [{ left: 28, top: 10, width: 44, height: 48 }];
}

export function CanvasNodePersonAdjustDialog({
    anchorNodeId,
    canvasScale,
    canvasViewport,
    dataUrl,
    open,
    initialStep = "menu",
    onClose,
    onConfirm,
}: {
    anchorNodeId: string;
    canvasScale: number;
    canvasViewport: { x: number; y: number; k: number };
    dataUrl: string;
    open: boolean;
    initialStep?: "menu" | "emotion" | "texture";
    onClose: () => void;
    onConfirm: (params: CanvasImagePersonAdjustParams) => void;
}) {
    const [step, setStep] = useState<"menu" | "emotion" | "texture">(initialStep);
    const [params, setParams] = useState(defaults);
    const dialogWidth = step === "emotion" ? 760 : step === "texture" ? 640 : 480;
    const dialogHeight = step === "emotion" ? 500 : step === "texture" ? 430 : 300;
    // Keep the panel readable at low canvas zoom while still scaling smoothly
    // with the canvas at every zoom level.
    const visualScale = 0.6 + canvasScale * 0.4;
    const visualWidth = dialogWidth * visualScale;
    const visualHeight = dialogHeight * visualScale;
    const [placement, setPlacement] = useState({ left: 16, top: 16 });
    const dialogRef = useRef<HTMLDivElement>(null);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useEffect(() => {
        if (open) {
            setStep(initialStep);
            setParams(defaults);
        }
    }, [dataUrl, initialStep, open]);
    useEffect(() => {
        if (!open) return;
        const positionDialog = () => {
            const node = document.querySelector<HTMLElement>(`[data-node-id="${anchorNodeId}"]`);
            if (!node) return;
            const rect = node.querySelector<HTMLImageElement>("img")?.getBoundingClientRect() ?? node.getBoundingClientRect();
            const dialogRect = dialogRef.current?.getBoundingClientRect();
            const actualWidth = dialogRect?.width || visualWidth;
            const actualHeight = dialogRect?.height || visualHeight;
            const edge = 32;
            const anchorX = rect.left + rect.width / 2;
            const centeredLeft = Math.max(16, Math.min(anchorX - actualWidth / 2, window.innerWidth - actualWidth - 16));
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
    }, [anchorNodeId, canvasViewport.k, canvasViewport.x, canvasViewport.y, dialogHeight, dialogWidth, open, visualHeight, visualWidth]);
    const updateTexture = (key: keyof typeof textureGroups, value: string) => setParams((current) => ({ ...current, texture: { ...current.texture, [key]: value } }));
    if (!open || !dataUrl || typeof document === "undefined") return null;
    return createPortal(
        <ConfigProvider theme={dialogToken(theme)}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-label="人像调整"
                className="pointer-events-auto p-4"
                style={{ position: "fixed", zIndex: 1000, left: placement.left, top: placement.top, width: `min(${dialogWidth}px, calc(100vw - 32px))`, margin: 0, boxSizing: "border-box", transform: `scale(${visualScale})`, transformOrigin: "top left", color: theme.node.text, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 18, boxShadow: "0 24px 72px rgba(0,0,0,.46)", overflow: "hidden" }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="space-y-4">
                    {step !== "emotion" ? (
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                                <span className="grid size-8 place-items-center rounded-lg" style={{ background: theme.node.fill, color: theme.node.text }}>
                                    <ScanFace className="size-4" />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold">人像调整</h2>
                                    <p className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>
                                        选择调整类型，再生成新图片
                                    </p>
                                </div>
                            </div>
                            <Button type="text" size="small" icon={<X className="size-4" />} onClick={onClose} aria-label="关闭人像调整" />
                        </div>
                    ) : null}
                    {step === "menu" ? (
                        <div className="grid gap-2">
                            {[
                                ["emotion", "表情调整", "调整人物表情，生成新图片"],
                                ["texture", "质感调整", "设置肤质、光影与融合，再执行生成"],
                            ].map(([value, label, description]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className="flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition hover:opacity-85"
                                    style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                                    onClick={() => {
                                        const mode = value as "emotion" | "texture";
                                        setParams((current) => ({ ...current, mode }));
                                        setStep(mode);
                                    }}
                                >
                                    <span className="grid size-9 place-items-center rounded-lg" style={{ background: theme.toolbar.activeBg }}>
                                        <WandSparkles className="size-4" />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold">{label}</span>
                                        <span className="mt-0.5 block text-xs" style={{ color: theme.node.muted }}>
                                            {description}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {step === "emotion" ? (
                        <EmotionEditor
                            dataUrl={dataUrl}
                            params={params}
                            theme={theme}
                            onFace={(faceIndex) => setParams((current) => ({ ...current, faceIndex }))}
                            onEmotion={(emotion) => setParams((current) => ({ ...current, emotion }))}
                            onIntensity={(intensity) => setParams((current) => ({ ...current, intensity }))}
                            onBack={() => setStep("menu")}
                            onClose={onClose}
                            onConfirm={() => onConfirm(params)}
                        />
                    ) : null}
                    {step === "texture" ? <TextureEditor params={params} theme={theme} onChange={updateTexture} onBack={() => setStep("menu")} onConfirm={() => onConfirm(params)} /> : null}
                </div>
            </div>
        </ConfigProvider>,
        document.body,
    );
}

function EmotionEditor({
    dataUrl,
    params,
    theme,
    onFace,
    onEmotion,
    onIntensity,
    onBack,
    onClose,
    onConfirm,
}: {
    dataUrl: string;
    params: CanvasImagePersonAdjustParams;
    theme: CanvasTheme;
    onFace: (value: number) => void;
    onEmotion: (value: string) => void;
    onIntensity: (value: number) => void;
    onBack: () => void;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const [ready, setReady] = useState(false);
    const [faceRegions, setFaceRegions] = useState<FaceRegion[]>([]);
    const [manualMode, setManualMode] = useState(false);
    const [selection, setSelection] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const manualDragRef = useRef<{ x: number; y: number } | null>(null);
    useEffect(() => {
        setReady(false);
        const timer = window.setTimeout(() => setReady(true), 450);
        return () => window.clearTimeout(timer);
    }, [dataUrl]);
    useEffect(() => {
        let disposed = false;
        setFaceRegions([]);
        void detectFaceRegions(dataUrl).then((regions) => {
            if (!disposed) setFaceRegions(regions);
        });
        return () => {
            disposed = true;
        };
    }, [dataUrl]);
    if (!ready || !faceRegions.length) return <div className="grid min-h-48 place-items-center text-sm opacity-70">正在识别人脸</div>;
    const handleEmotionDot = (row: number, column: number) => {
        const emotion = emotionGrid[row][column];
        const distance = Math.hypot(column - 2, row - 2) / Math.SQRT2;
        onEmotion(emotion);
        onIntensity(Math.round(50 + distance * 50));
    };
    const emotionPosition = emotionGrid.reduce<{ row: number; column: number } | null>(
        (found, row, rowIndex) => found || row.reduce<{ row: number; column: number } | null>((match, emotion, columnIndex) => match || (emotion === params.emotion ? { row: rowIndex, column: columnIndex } : null), null),
        null,
    );
    const expressionRow = emotionPosition?.row ?? 2;
    const expressionColumn = emotionPosition?.column ?? 2;
    const expressionDescription = expressionRow <= 1 ? (expressionColumn >= 3 ? "明亮而警觉" : "嘴角上扬") : expressionRow >= 3 ? (expressionColumn <= 1 ? "柔和低落" : "眉眼收紧") : expressionColumn >= 3 ? "克制疏离" : "自然放松";
    const eyeHeight = expressionRow === 0 ? 7 : expressionRow >= 4 ? 3 : expressionRow === 3 ? 4 : 5;
    const eyeTilt = expressionColumn >= 3 ? -5 : expressionColumn <= 1 ? 4 : 0;
    const browY = expressionRow <= 1 ? 39 : expressionRow >= 3 ? 35 : 37;
    const mouthPath = expressionRow <= 1 ? `M52 78 Q80 ${96 + Math.round(params.intensity * 0.08)} 108 78` : expressionRow >= 3 ? "M52 94 Q80 77 108 94" : "M55 86 Q80 88 105 86";
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: theme.node.stroke }}>
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                    {faceRegions.map((region, face) => (
                        <button
                            key={face}
                            type="button"
                            aria-label={`选择角色${face + 1}`}
                            onClick={() => {
                                setManualMode(false);
                                setSelection(null);
                                onFace(face);
                            }}
                            className="flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition hover:opacity-85"
                            style={{
                                background: params.faceIndex === face && !manualMode ? theme.toolbar.activeBg : theme.node.fill,
                                borderColor: params.faceIndex === face && !manualMode ? theme.node.activeStroke : theme.node.stroke,
                                color: theme.node.text,
                            }}
                        >
                            <span className="size-8 overflow-hidden rounded-md">
                                <img src={dataUrl} alt="" className="size-full object-cover" style={{ objectPosition: `${region.left + region.width / 2}% ${region.top + region.height / 2}%` }} />
                            </span>
                            角色{face + 1}
                        </button>
                    ))}
                    <ChoicePill
                        selected={manualMode}
                        theme={theme}
                        onClick={() => {
                            setManualMode((current) => !current);
                            setSelection(null);
                        }}
                    >
                        {manualMode ? "取消框选" : "手动框选"}
                    </ChoicePill>
                </div>
                <Button type="text" size="small" icon={<X className="size-4" />} onClick={onClose} aria-label="关闭人像调整" />
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(300px,1.3fr)_minmax(240px,.8fr)]">
                <div
                    className={`relative min-h-[280px] overflow-hidden rounded-2xl border ${manualMode ? "cursor-crosshair ring-1" : ""}`}
                    style={{ background: theme.node.fill, borderColor: manualMode ? theme.node.activeStroke : theme.node.stroke, boxShadow: manualMode ? `0 0 0 1px ${theme.node.activeStroke}` : undefined }}
                    onPointerDown={(event) => {
                        if (!manualMode) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        manualDragRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
                        setSelection({ left: (manualDragRef.current.x / rect.width) * 100, top: (manualDragRef.current.y / rect.height) * 100, width: 0, height: 0 });
                    }}
                    onPointerMove={(event) => {
                        if (!manualDragRef.current) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                        const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                        const start = manualDragRef.current;
                        setSelection({ left: (Math.min(start.x, x) / rect.width) * 100, top: (Math.min(start.y, y) / rect.height) * 100, width: (Math.abs(x - start.x) / rect.width) * 100, height: (Math.abs(y - start.y) / rect.height) * 100 });
                    }}
                    onPointerUp={(event) => {
                        if (!manualDragRef.current) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const endX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                        const endY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                        const start = manualDragRef.current;
                        const region = { left: (Math.min(start.x, endX) / rect.width) * 100, top: (Math.min(start.y, endY) / rect.height) * 100, width: (Math.abs(endX - start.x) / rect.width) * 100, height: (Math.abs(endY - start.y) / rect.height) * 100 };
                        if (region.width > 3 && region.height > 3) {
                            setFaceRegions((current) => [...current, region]);
                            onFace(faceRegions.length);
                            setSelection(region);
                        }
                        manualDragRef.current = null;
                        setManualMode(false);
                    }}
                    onPointerCancel={() => {
                        manualDragRef.current = null;
                    }}
                >
                    {manualMode ? (
                        <>
                            <img src={dataUrl} alt="人脸识别参考" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                            {faceRegions.map((region, index) => (
                                <button key={index} type="button" aria-label={`选择角色${index + 1}`} className="pointer-events-none absolute rounded border-2 text-xs" style={{ left: `${region.left}%`, top: `${region.top}%`, width: `${region.width}%`, height: `${region.height}%`, borderColor: params.faceIndex === index ? theme.node.activeStroke : theme.node.text, background: params.faceIndex === index ? "rgba(255,255,255,.08)" : "transparent", color: theme.node.text }}>
                                    角色{index + 1}
                                </button>
                            ))}
                            {selection ? <div className="pointer-events-none absolute rounded border-2" style={{ left: `${selection.left}%`, top: `${selection.top}%`, width: `${selection.width}%`, height: `${selection.height}%`, borderColor: theme.node.activeStroke, background: "rgba(255,255,255,.08)" }} /> : null}
                        </>
                    ) : (
                        <LiveExpressionPreview emotion={params.emotion} intensity={params.intensity} />
                    )}
                    <div className="absolute bottom-4 left-5 text-lg font-medium" style={{ color: theme.node.text }}>
                        {manualMode ? "在图片上拖动以框选人物" : `实时预览 · ${params.emotion}`}
                    </div>
                </div>
                <div className="space-y-3">
                    <div className="flex min-h-[280px] items-center rounded-2xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                        <div className="relative mx-auto grid w-full max-w-[280px] grid-cols-5 gap-2 px-8 py-7">
                            <span className="absolute left-1/2 top-0 -translate-x-1/2 text-sm opacity-70">激动</span>
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-sm opacity-70 [writing-mode:vertical-rl]">亲近</span>
                            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-sm opacity-70 [writing-mode:vertical-rl]">疏离</span>
                            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-sm opacity-70">平静</span>
                            {emotionGrid.map((row, rowIndex) =>
                                row.map((emotion, columnIndex) => {
                                    const selected = params.emotion === emotion;
                                    return (
                                        <button
                                            key={emotion}
                                            type="button"
                                            aria-label={emotion}
                                            title={emotion}
                                            onClick={() => handleEmotionDot(rowIndex, columnIndex)}
                                            className="relative grid aspect-square place-items-center rounded-full hover:opacity-80"
                                            style={{ background: selected ? theme.toolbar.activeBg : "transparent", boxShadow: selected ? `0 0 0 8px ${theme.toolbar.itemHover}` : undefined }}
                                        >
                                            <span className="size-3 rounded-full" style={{ background: selected ? theme.node.activeStroke : theme.node.faint, boxShadow: selected ? `0 0 0 4px ${theme.toolbar.activeBg}` : undefined }} />
                                        </button>
                                    );
                                }),
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: theme.node.stroke }}>
                <span className="text-sm" style={{ color: theme.node.muted }}>
                    情绪定位：<span className="font-semibold" style={{ color: theme.node.text }}>{params.emotion}</span>
                </span>
                <Button size="small" onClick={onBack}>
                    返回
                </Button>
                <Button type="primary" icon={<WandSparkles className="size-4" />} onClick={onConfirm}>
                    生成
                </Button>
            </div>
        </div>
    );
}

function getExpressionWeights(emotion: string, intensity: number) {
    const amount = 0.35 + (intensity / 100) * 0.55;
    const both = (name: string, value: number) => ({ [`${name}_L`]: value, [`${name}_R`]: value });

    if (["欣喜若狂", "兴高采烈", "开怀"].includes(emotion)) return { ...both("mouthSmile", amount), ...both("cheekSquint", amount * 0.3), ...both("eyeSquint", amount * 0.14), jawOpen: amount * 0.2 };
    if (["惊喜", "震惊"].includes(emotion)) return { browInnerUp: amount * 0.55, ...both("browOuterUp", amount * 0.5), ...both("eyeWide", amount * 0.6), jawOpen: amount * 0.48 };
    if (["惊恐", "紧张", "警觉"].includes(emotion)) return { browInnerUp: amount * 0.5, ...both("browDown", amount * 0.25), ...both("eyeWide", amount * 0.55), ...both("mouthStretch", amount * 0.4), jawOpen: amount * 0.15 };
    if (["失落", "悲伤", "绝望", "隐忍心伤", "疲惫"].includes(emotion)) return { browInnerUp: amount * 0.42, ...both("browDown", amount * 0.18), ...both("mouthFrown", amount * 0.58), ...both("eyeLookDown", amount * 0.32) };
    if (["疏离", "冷淡", "隐忍", "中性克制"].includes(emotion)) return { ...both("mouthPress", amount * 0.48), ...both("browDown", amount * 0.28), ...both("eyeLookOut", amount * 0.15) };
    if (["期待", "专注"].includes(emotion)) return { ...both("eyeWide", amount * 0.22), ...both("browOuterUp", amount * 0.16), ...both("mouthSmile", amount * 0.16) };
    return { ...both("mouthSmile", amount * 0.16), ...both("cheekSquint", amount * 0.07) };
}

function LiveExpressionPreview({ emotion, intensity }: { emotion: string; intensity: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<THREE.Mesh | null>(null);
    const rotationRef = useRef({ x: 0, y: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
        camera.position.set(0, 0.04, 5.8);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
        container.appendChild(renderer.domElement);
        const resize = () => {
            const { width, height } = container.getBoundingClientRect();
            renderer.setSize(width, height);
            camera.aspect = width / Math.max(height, 1);
            camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        scene.add(new THREE.HemisphereLight(0xf8f9ff, 0x272a31, 2.8));
        const key = new THREE.DirectionalLight(0xffffff, 3.6);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x8694b8, 2.2);
        rim.position.set(4, 1, -3);
        scene.add(rim);
        const model = new THREE.Group();
        scene.add(model);
        const ktx2Loader = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer);
        let disposed = false;
        new GLTFLoader().setKTX2Loader(ktx2Loader).setMeshoptDecoder(MeshoptDecoder).load(
            "/models/FaceCap.glb",
            (gltf) => {
                if (disposed) return;
                const head = gltf.scene;
                const bounds = new THREE.Box3().setFromObject(head);
                const size = bounds.getSize(new THREE.Vector3());
                const center = bounds.getCenter(new THREE.Vector3());
                const scale = 2.1 / Math.max(size.x, size.y, size.z);
                head.scale.setScalar(scale);
                head.position.set(-center.x * scale, -center.y * scale - 0.18, -center.z * scale);
                head.traverse((object) => {
                    if (!(object instanceof THREE.Mesh)) return;
                    if (object.morphTargetDictionary && object.morphTargetInfluences) faceRef.current = object;
                    object.material = new THREE.MeshStandardMaterial({ color: 0xc7c8cc, roughness: 0.82, metalness: 0 });
                });
                model.add(head);
                setLoading(false);
            },
            undefined,
            () => setLoading(false),
        );
        let frame = 0;
        const render = () => {
            frame = requestAnimationFrame(render);
            model.rotation.x += (rotationRef.current.x * Math.PI / 180 - model.rotation.x) * 0.08;
            model.rotation.y += (rotationRef.current.y * Math.PI / 180 - model.rotation.y) * 0.08;
            renderer.render(scene, camera);
        };
        render();
        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            observer.disconnect();
            ktx2Loader.dispose();
            renderer.dispose();
            renderer.domElement.remove();
            scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    object.geometry.dispose();
                    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
                    else object.material.dispose();
                }
            });
        };
    }, []);

    useEffect(() => {
        const face = faceRef.current;
        if (!face?.morphTargetDictionary || !face.morphTargetInfluences) return;
        Object.values(face.morphTargetDictionary).forEach((index) => {
            face.morphTargetInfluences![index] = 0;
        });
        Object.entries(getExpressionWeights(emotion, intensity)).forEach(([name, weight]) => {
            const index = face.morphTargetDictionary![name];
            if (index !== undefined) face.morphTargetInfluences![index] = weight;
        });
    }, [emotion, intensity, loading]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,.12),transparent_42%),linear-gradient(145deg,rgba(255,255,255,.04),rgba(0,0,0,.16))]"
            role="img"
            aria-label={`真实 3D 人头预览：${emotion}`}
            onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                rotationRef.current = { x: ((event.clientY - rect.top) / rect.height - 0.5) * -6, y: ((event.clientX - rect.left) / rect.width - 0.5) * 9 };
            }}
            onPointerLeave={() => {
                rotationRef.current = { x: 0, y: 0 };
            }}
        >
            {loading ? <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm" style={{ color: "rgba(255,255,255,.65)" }}>正在载入真实头模</span> : null}
        </div>
    );
}

function TextureEditor({ params, theme, onChange, onBack, onConfirm }: { params: CanvasImagePersonAdjustParams; theme: CanvasTheme; onChange: (key: keyof typeof textureGroups, value: string) => void; onBack: () => void; onConfirm: () => void }) {
    const labels: Record<keyof typeof textureGroups, string> = { sceneBlend: "人景融合", lightBlend: "光影融合", skin: "皮肤", texture: "纹理", sharpness: "锐度" };
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                {(Object.keys(textureGroups) as (keyof typeof textureGroups)[]).map((key) => (
                    <div key={key}>
                        <div className="mb-2 text-sm font-medium" style={{ color: theme.node.muted }}>
                            {labels[key]}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {textureGroups[key].map((value) => (
                                <ChoicePill key={value} selected={params.texture[key] === value} theme={theme} onClick={() => onChange(key, value)}>
                                    {value}
                                </ChoicePill>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-between border-t pt-3" style={{ borderColor: theme.node.stroke }}>
                <Button size="small" onClick={onBack}>
                    返回
                </Button>
                <Button size="small" type="primary" icon={<WandSparkles className="size-4" />} onClick={onConfirm}>
                    生成
                </Button>
            </div>
        </div>
    );
}
