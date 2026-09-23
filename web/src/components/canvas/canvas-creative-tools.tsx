import { Button, Input, Segmented, Tooltip } from "antd";
import { Clapperboard, Palette, Search, SlidersHorizontal, Sparkles, X, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { canvasThemes } from "@/lib/canvas-theme";
import { resolveCreativeLibraryPlacement } from "@/lib/canvas/canvas-creative-library-position";
import {
    aifisherMjStyles,
    canvasCreativePresetsForKind,
    creativePresetKindsForMode,
    filterAifisherMjStyles,
    mjInsertModes,
    mjStylePreset,
    normalizeCanvasCreativeSelection,
    type AifisherMjStyle,
    type MjInsertMode,
} from "@/lib/canvas/canvas-creative-presets";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasCreativePreset, CanvasCreativePresetKind, CanvasCreativePresetSelection, CanvasGenerationMode } from "@/types/canvas";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

type CanvasCreativeToolsProps = {
    mode: CanvasGenerationMode;
    value?: CanvasCreativePresetSelection;
    disabled?: boolean;
    onChange: (value: CanvasCreativePresetSelection) => void;
};

type CreativeToolMeta = {
    icon: LucideIcon;
    label: string;
    description: string;
};

const creativeToolMeta: Record<CanvasCreativePresetKind, CreativeToolMeta> = {
    style: { icon: Palette, label: "风格", description: "选择画面整体风格" },
    mj: { icon: Sparkles, label: "MJ 码图", description: "选择 Midjourney 风格码与参数" },
    motion: { icon: Clapperboard, label: "运镜", description: "选择视频镜头运动" },
    filter: { icon: SlidersHorizontal, label: "滤镜", description: "选择色彩与质感处理" },
};

export function CanvasCreativeTools({ mode, value, disabled = false, onChange }: CanvasCreativeToolsProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const toolsRef = useRef<HTMLDivElement>(null);
    const selection = normalizeCanvasCreativeSelection(value, mode);
    const kinds = creativePresetKindsForMode(mode);

    const selectPreset = (kind: CanvasCreativePresetKind, preset: CanvasCreativePreset) => onChange({ ...selection, [kind]: preset });
    const clearPreset = (kind: CanvasCreativePresetKind) => {
        const next = { ...selection };
        delete next[kind];
        onChange(next);
    };

    return (
        <div ref={toolsRef} className="flex min-w-0 flex-wrap items-center gap-1.5" data-canvas-no-zoom onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            {kinds.map((kind) => (
                kind === "mj" ? (
                    <MjPresetPicker key={kind} selected={selection.mj} disabled={disabled} onSelect={(preset) => selectPreset("mj", preset)} theme={theme} frameRef={toolsRef} />
                ) : (
                    <CreativePresetPicker key={kind} kind={kind} selected={selection[kind]} disabled={disabled} onSelect={(preset) => selectPreset(kind, preset)} theme={theme} frameRef={toolsRef} />
                )
            ))}
            {kinds.flatMap((kind) => {
                const preset = selection[kind];
                return preset ? [
                    <button
                        key={`${kind}-${preset.id}`}
                        type="button"
                        className="inline-flex h-8 max-w-44 items-center gap-1 rounded-full border px-2 text-xs font-medium transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                        style={{ borderColor: theme.toolbar.border, background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                        onClick={() => clearPreset(kind)}
                        disabled={disabled}
                        aria-label={`移除${creativeToolMeta[kind].label}：${preset.name}`}
                    >
                        <span className="truncate">{preset.name}</span>
                        <X className="size-3 shrink-0" aria-hidden="true" />
                    </button>,
                ] : [];
            })}
        </div>
    );
}

function CreativePresetPicker({ kind, selected, disabled, onSelect, theme, frameRef }: { kind: Exclude<CanvasCreativePresetKind, "mj">; selected?: CanvasCreativePreset; disabled: boolean; onSelect: (preset: CanvasCreativePreset) => void; theme: CanvasTheme; frameRef: RefObject<HTMLDivElement | null> }) {
    const [open, setOpen] = useState(false);
    const meta = creativeToolMeta[kind];
    const Icon = meta.icon;
    return (
        <CreativeLibraryPopover open={open} onOpenChange={setOpen} frameRef={frameRef} width={440} theme={theme} content={<CreativePresetBrowser kind={kind} selected={selected} theme={theme} onSelect={(preset) => { onSelect(preset); setOpen(false); }} />}>
            <Tooltip title={meta.label}>
                <Button
                    type="text"
                    disabled={disabled}
                    className="!h-11 !w-11 !min-w-11 shrink-0 !rounded-xl !bg-transparent !p-0"
                    style={{ background: selected ? theme.toolbar.activeBg : undefined, color: theme.node.text }}
                    icon={<Icon className="size-[18px]" />}
                    aria-label={meta.description}
                    aria-pressed={Boolean(selected)}
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                />
            </Tooltip>
        </CreativeLibraryPopover>
    );
}

function CreativeLibraryPopover({ open, onOpenChange, frameRef, width, theme, content, children }: { open: boolean; onOpenChange: (open: boolean) => void; frameRef: RefObject<HTMLDivElement | null>; width: number; theme: CanvasTheme; content: ReactNode; children: ReactNode }) {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }
        const syncPosition = () => {
            const frame = frameRef.current?.closest("[data-canvas-creative-frame]");
            const frameRect = frame?.getBoundingClientRect() || triggerRef.current?.getBoundingClientRect();
            if (!frameRect) return;

            const visualViewport = window.visualViewport;
            const nextPosition = resolveCreativeLibraryPlacement(
                frameRect,
                {
                    left: visualViewport?.offsetLeft ?? 0,
                    top: visualViewport?.offsetTop ?? 0,
                    width: visualViewport?.width ?? window.innerWidth,
                    height: visualViewport?.height ?? window.innerHeight,
                },
                width,
                panelRef.current?.scrollHeight ?? 680,
            );
            setPosition((current) => current?.left === nextPosition.left && current.top === nextPosition.top && current.width === nextPosition.width && current.maxHeight === nextPosition.maxHeight ? current : nextPosition);
        };
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            onOpenChange(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onOpenChange(false);
        };

        syncPosition();
        const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncPosition);
        const animationFrame = window.requestAnimationFrame(() => {
            syncPosition();
            if (panelRef.current) resizeObserver?.observe(panelRef.current);
        });
        const visualViewport = window.visualViewport;
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        visualViewport?.addEventListener("resize", syncPosition);
        visualViewport?.addEventListener("scroll", syncPosition);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.cancelAnimationFrame(animationFrame);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            visualViewport?.removeEventListener("resize", syncPosition);
            visualViewport?.removeEventListener("scroll", syncPosition);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [frameRef, onOpenChange, open, width]);

    return (
        <>
            <span ref={triggerRef} className="inline-flex min-w-0">{children}</span>
            {open && position ? createPortal(
                <div ref={panelRef} className="canvas-creative-library-popover" role="dialog" aria-label="创作技能库" data-canvas-no-zoom style={{ position: "fixed", zIndex: 1200, width: position.width, left: position.left, top: position.top, maxHeight: position.maxHeight, overflowY: "auto", overflowX: "hidden", background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, borderRadius: 18, boxShadow: "0 18px 48px rgba(0,0,0,.28)", color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                    {content}
                </div>,
                document.body,
            ) : null}
        </>
    );
}

function CreativePresetBrowser({ kind, selected, theme, onSelect }: { kind: Exclude<CanvasCreativePresetKind, "mj">; selected?: CanvasCreativePreset; theme: CanvasTheme; onSelect: (preset: CanvasCreativePreset) => void }) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("全部");
    const presets = canvasCreativePresetsForKind(kind);
    const categories = useMemo(() => ["全部", ...new Set(presets.map((preset) => preset.category))], [presets]);
    const items = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return presets.filter((preset) => (category === "全部" || preset.category === category) && (!normalized || `${preset.name} ${preset.description}`.toLowerCase().includes(normalized)));
    }, [category, presets, query]);
    const meta = creativeToolMeta[kind];

    return (
        <div className="w-[min(27.5rem,calc(100vw-2rem))] p-2" data-canvas-no-zoom onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <span className="text-sm font-semibold" style={{ color: theme.node.text }}>{meta.label}</span>
                <span className="text-[11px]" style={{ color: theme.node.muted }}>{items.length} 项</span>
            </div>
            <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border px-2" style={{ background: theme.node.fill, borderColor: theme.toolbar.border }}>
                <Search className="size-3.5 shrink-0" style={{ color: theme.node.muted }} aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} variant="borderless" className="!min-w-0 !flex-1 !p-0 !text-xs" placeholder={`搜索${meta.label}`} aria-label={`搜索${meta.label}`} />
            </label>
            <div className="thin-scrollbar mb-2 flex max-w-full gap-1 overflow-x-auto pb-1" aria-label={`${meta.label}分类`}>
                {categories.map((item) => (
                    <button key={item} type="button" className="h-7 shrink-0 rounded-full border px-2 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: theme.toolbar.border, background: category === item ? theme.toolbar.activeBg : "transparent", color: category === item ? theme.toolbar.activeText : theme.node.muted }} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>
                ))}
            </div>
            <div className="thin-scrollbar grid max-h-[34rem] grid-cols-3 gap-2 overflow-y-auto pr-1">
                {items.map((preset) => <CreativePresetCard key={preset.id} preset={preset} active={selected?.id === preset.id} theme={theme} onClick={() => onSelect(preset)} />)}
                {!items.length ? <div className="col-span-full py-10 text-center text-xs" style={{ color: theme.node.muted }}>没有匹配的预设，请换个关键词。</div> : null}
            </div>
        </div>
    );
}

function MjPresetPicker({ selected, disabled, onSelect, theme, frameRef }: { selected?: CanvasCreativePreset; disabled: boolean; onSelect: (preset: CanvasCreativePreset) => void; theme: CanvasTheme; frameRef: RefObject<HTMLDivElement | null> }) {
    const [open, setOpen] = useState(false);
    return (
        <CreativeLibraryPopover open={open} onOpenChange={setOpen} frameRef={frameRef} width={512} theme={theme} content={<MjPresetBrowser selected={selected} theme={theme} onSelect={(preset) => { onSelect(preset); setOpen(false); }} />}>
            <Tooltip title="MJ 码图">
                <Button type="text" disabled={disabled} className="!h-11 !w-11 !min-w-11 shrink-0 !rounded-xl !bg-transparent !p-0" style={{ background: selected ? theme.toolbar.activeBg : undefined, color: theme.node.text }} icon={<Sparkles className="size-[18px]" />} aria-label="选择 Midjourney 风格码与参数" aria-pressed={Boolean(selected)} aria-expanded={open} onClick={() => setOpen((current) => !current)} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} />
            </Tooltip>
        </CreativeLibraryPopover>
    );
}

function MjPresetBrowser({ selected, theme, onSelect }: { selected?: CanvasCreativePreset; theme: CanvasTheme; onSelect: (preset: CanvasCreativePreset) => void }) {
    const [query, setQuery] = useState("");
    const [group, setGroup] = useState("all");
    const [category, setCategory] = useState("全部");
    const [codeKind, setCodeKind] = useState("all");
    const [detail, setDetail] = useState<AifisherMjStyle | null>(null);
    const [mode, setMode] = useState<MjInsertMode>("style");
    const allItems = aifisherMjStyles();
    const categories = useMemo(() => ["全部", ...new Set(allItems.filter((item) => group === "all" || item.group === group).map((item) => item.category))], [allItems, group]);
    const items = useMemo(() => filterAifisherMjStyles(allItems, group, category, query, codeKind), [allItems, category, codeKind, group, query]);
    const applyDetail = () => detail && onSelect(mjStylePreset(detail, mode));

    if (detail) {
        const draft = mjStylePreset(detail, mode);
        return (
            <div className="w-[min(30rem,calc(100vw-2rem))] p-2" data-canvas-no-zoom onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                <button type="button" className="mb-2 inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium hover:opacity-80" style={{ color: theme.node.text }} onClick={() => setDetail(null)}>← 返回码图</button>
                <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <img src={detail.preview} alt={detail.name} className="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
                    <div className="min-w-0">
                        <div className="text-sm font-semibold" style={{ color: theme.node.text }}>{detail.name}</div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>{detail.vibe}</div>
                        <Segmented className="mt-3 max-w-full" size="small" value={mode} options={mjInsertModes.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setMode(value as MjInsertMode)} />
                    </div>
                </div>
                <textarea readOnly value={draft.prompt} className="mt-3 h-24 w-full resize-none rounded-lg border p-2 text-xs leading-5 outline-none" style={{ background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text }} aria-label="将要加入的 MJ 提示词" />
                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>插入后会随节点保存；MJ 参数会自动归位到末尾。</span>
                    <Button type="primary" size="small" onClick={applyDetail}>应用</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-[min(32rem,calc(100vw-2rem))] p-2" data-canvas-no-zoom onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 px-1"><span className="text-sm font-semibold" style={{ color: theme.node.text }}>MJ 码图</span><span className="text-[11px]" style={{ color: theme.node.muted }}>{items.length} 组</span></div>
            <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border px-2" style={{ background: theme.node.fill, borderColor: theme.toolbar.border }}><Search className="size-3.5 shrink-0" style={{ color: theme.node.muted }} aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} variant="borderless" className="!min-w-0 !flex-1 !p-0 !text-xs" placeholder="搜索风格、色调或代码" aria-label="搜索 MJ 码图" /></label>
            <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <select className="h-8 min-w-0 rounded-lg border px-2 text-xs outline-none" style={{ background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text }} value={group} onChange={(event) => { setGroup(event.target.value); setCategory("全部"); }} aria-label="MJ 主题分组">
                    <option value="all">全部主题</option><option value="char">角色人像</option><option value="scene">场景环境</option><option value="juwu">巨物怪兽</option>
                </select>
                <select className="h-8 min-w-0 rounded-lg border px-2 text-xs outline-none" style={{ background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text }} value={codeKind} onChange={(event) => setCodeKind(event.target.value)} aria-label="MJ 代码组合类型"><option value="all">全部代码</option><option value="solo">单码</option><option value="mixed">混码组合</option></select>
            </div>
            <div className="thin-scrollbar mb-2 flex max-w-full gap-1 overflow-x-auto pb-1" aria-label="MJ 风格分类">
                {categories.map((item) => <button key={item} type="button" className="h-7 shrink-0 rounded-full border px-2 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: theme.toolbar.border, background: category === item ? theme.toolbar.activeBg : "transparent", color: category === item ? theme.toolbar.activeText : theme.node.muted }} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}
            </div>
            <div className="thin-scrollbar grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {items.map((item) => <button key={item.id} type="button" className="group overflow-hidden rounded-xl border text-left transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: selected?.id.startsWith(`mj-${item.id}-`) ? theme.toolbar.activeText : theme.toolbar.border, background: theme.node.fill, color: theme.node.text }} onClick={() => setDetail(item)} aria-label={`查看 ${item.name}`}><img src={item.thumbnail} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" /><span className="block truncate px-2 py-1.5 text-[11px] font-medium">{item.name}</span></button>)}
                {!items.length ? <div className="col-span-full py-10 text-center text-xs" style={{ color: theme.node.muted }}>没有匹配的码图，请换个关键词或分类。</div> : null}
            </div>
        </div>
    );
}

function CreativePresetCard({ preset, active, theme, onClick }: { preset: CanvasCreativePreset; active: boolean; theme: CanvasTheme; onClick: () => void }) {
    return (
        <button type="button" className="group overflow-hidden rounded-xl border text-left transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: active ? theme.toolbar.activeText : theme.toolbar.border, background: theme.node.fill, color: theme.node.text }} onClick={onClick} aria-pressed={active} aria-label={`应用${preset.name}`}>
            {preset.poster || preset.preview ? <img src={preset.poster || preset.preview} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" /> : <span className="grid aspect-[4/3] place-items-center" style={{ background: theme.toolbar.activeBg }}><Palette className="size-5" /></span>}
            <span className="block truncate px-2 py-1.5 text-[11px] font-medium">{preset.name}</span>
        </button>
    );
}
