import { useId, useMemo, useState } from "react";
import { Popover, Tooltip } from "antd";
import { Plus, Tag, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { canvasTextTagLabelKey, canvasTextTagPresets, createCanvasTextTag, MAX_CANVAS_TEXT_TAG_LABEL_LENGTH, MAX_CANVAS_TEXT_TAGS, normalizeCanvasTextTags } from "@/lib/canvas/canvas-text-node-import";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasTextTag, CanvasTextTagColor } from "@/types/canvas";

type CanvasTextNodeTagsProps = {
    value?: CanvasTextTag[];
    onChange: (tags: CanvasTextTag[]) => void;
    onOpenChange?: (open: boolean) => void;
};

const tagColorStyles: Record<CanvasTextTagColor, { background: string; border: string; dot: string }> = {
    gray: { background: "rgba(148,163,184,.14)", border: "rgba(148,163,184,.34)", dot: "#94a3b8" },
    blue: { background: "rgba(96,165,250,.14)", border: "rgba(96,165,250,.36)", dot: "#60a5fa" },
    green: { background: "rgba(52,211,153,.14)", border: "rgba(52,211,153,.36)", dot: "#34d399" },
    amber: { background: "rgba(251,191,36,.14)", border: "rgba(251,191,36,.36)", dot: "#fbbf24" },
    rose: { background: "rgba(251,113,133,.14)", border: "rgba(251,113,133,.36)", dot: "#fb7185" },
    violet: { background: "rgba(167,139,250,.14)", border: "rgba(167,139,250,.36)", dot: "#a78bfa" },
};

const tagColorLabels: Record<CanvasTextTagColor, string> = {
    gray: "gray",
    blue: "blue",
    green: "green",
    amber: "amber",
    rose: "rose",
    violet: "violet",
};

export function CanvasTextNodeTags({ value, onChange, onOpenChange }: CanvasTextNodeTagsProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const inputId = useId();
    const [open, setOpen] = useState(false);
    const [draftLabel, setDraftLabel] = useState("");
    const [draftColor, setDraftColor] = useState<CanvasTextTagColor>("blue");
    const [draftError, setDraftError] = useState("");
    const tags = useMemo(() => normalizeCanvasTextTags(value), [value]);

    const updateTags = (next: CanvasTextTag[]) => onChange(normalizeCanvasTextTags(next));
    const hasLabel = (label: string) => tags.some((tag) => canvasTextTagLabelKey(tag.label) === canvasTextTagLabelKey(label));

    const togglePreset = (preset: CanvasTextTag) => {
        if (hasLabel(preset.label)) {
            updateTags(tags.filter((tag) => canvasTextTagLabelKey(tag.label) !== canvasTextTagLabelKey(preset.label)));
            return;
        }
        if (tags.length >= MAX_CANVAS_TEXT_TAGS) {
            setDraftError(t("canvas.nodeToolbar.tagsLimit", { max: MAX_CANVAS_TEXT_TAGS }));
            return;
        }
        updateTags([...tags, preset]);
    };

    const addCustomTag = () => {
        const tag = createCanvasTextTag(draftLabel, draftColor);
        if (!tag) {
            setDraftError(t("canvas.nodeToolbar.tagsInvalid", { max: MAX_CANVAS_TEXT_TAG_LABEL_LENGTH }));
            return;
        }
        if (hasLabel(tag.label)) {
            setDraftError(t("canvas.nodeToolbar.tagsDuplicate"));
            return;
        }
        if (tags.length >= MAX_CANVAS_TEXT_TAGS) {
            setDraftError(t("canvas.nodeToolbar.tagsLimit", { max: MAX_CANVAS_TEXT_TAGS }));
            return;
        }
        updateTags([...tags, tag]);
        setDraftLabel("");
        setDraftError("");
    };

    const content = (
        <div className="w-72 space-y-3 p-2" style={{ color: theme.node.text }} data-canvas-shortcuts-ignore onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-sm font-semibold">{t("canvas.nodeToolbar.tagsTitle")}</span>
                <span className="text-xs opacity-60">{t("canvas.nodeToolbar.tagsCount", { count: tags.length, max: MAX_CANVAS_TEXT_TAGS })}</span>
            </div>

            <section className="space-y-1.5">
                <div className="px-1 text-xs font-medium opacity-60">{t("canvas.nodeToolbar.tagsPresets")}</div>
                <div className="flex flex-wrap gap-1.5">
                    {canvasTextTagPresets.map((preset) => {
                        const active = hasLabel(preset.label);
                        const color = tagColorStyles[preset.color];
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition hover:brightness-110"
                                style={{ background: active ? color.background : theme.toolbar.activeBg, borderColor: active ? color.border : theme.toolbar.border, color: theme.toolbar.activeText }}
                                aria-pressed={active}
                                onClick={() => togglePreset(preset)}
                            >
                                <span className="size-1.5 rounded-full" style={{ background: color.dot }} />
                                {preset.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-1.5">
                <div className="px-1 text-xs font-medium opacity-60">{t("canvas.nodeToolbar.tagsAdded")}</div>
                {tags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => {
                            const color = tagColorStyles[tag.color];
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    className="flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-xs font-medium transition hover:brightness-110"
                                    style={{ background: color.background, borderColor: color.border, color: theme.toolbar.activeText }}
                                    aria-label={`${t("canvas.nodeToolbar.removeTag")} ${tag.label}`}
                                    onClick={() => updateTags(tags.filter((candidate) => candidate.id !== tag.id))}
                                >
                                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: color.dot }} />
                                    <span className="truncate">{tag.label}</span>
                                    <X className="size-3 shrink-0 opacity-70" />
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-md border px-2.5 py-2 text-xs opacity-55" style={{ borderColor: theme.toolbar.border }}>
                        {t("canvas.nodeToolbar.tagsEmpty")}
                    </div>
                )}
            </section>

            <section className="space-y-2 border-t pt-3" style={{ borderColor: theme.toolbar.border }}>
                <label htmlFor={inputId} className="block px-1 text-xs font-medium opacity-60">
                    {t("canvas.nodeToolbar.tagsCustom")}
                </label>
                <div className="flex gap-1.5">
                    <input
                        id={inputId}
                        value={draftLabel}
                        maxLength={MAX_CANVAS_TEXT_TAG_LABEL_LENGTH}
                        className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2.5 text-xs outline-none transition focus:ring-2"
                        style={{ borderColor: theme.toolbar.border, color: theme.node.text, "--tw-ring-color": theme.node.activeStroke } as React.CSSProperties}
                        placeholder={t("canvas.nodeToolbar.tagsInputPlaceholder")}
                        onChange={(event) => {
                            setDraftLabel(event.target.value);
                            setDraftError("");
                        }}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addCustomTag();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-md border transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45"
                        style={{ background: theme.toolbar.activeBg, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                        aria-label={t("canvas.nodeToolbar.tagsAdd")}
                        disabled={!draftLabel.trim() || tags.length >= MAX_CANVAS_TEXT_TAGS}
                        onClick={addCustomTag}
                    >
                        <Plus className="size-4" />
                    </button>
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label={t("canvas.nodeToolbar.tagColor")}>
                    {(Object.keys(tagColorStyles) as CanvasTextTagColor[]).map((color) => {
                        const style = tagColorStyles[color];
                        const selected = draftColor === color;
                        return (
                            <button
                                key={color}
                                type="button"
                                className="grid size-6 place-items-center rounded-full border transition hover:scale-105"
                                style={{ borderColor: selected ? style.dot : "transparent", background: selected ? style.background : "transparent" }}
                                aria-label={`${t("canvas.nodeToolbar.tagColor")}: ${t(`canvas.nodeToolbar.tagColor${tagColorLabels[color][0].toUpperCase()}${tagColorLabels[color].slice(1)}`)}`}
                                aria-pressed={selected}
                                onClick={() => setDraftColor(color)}
                            >
                                <span className="size-2.5 rounded-full" style={{ background: style.dot }} />
                            </button>
                        );
                    })}
                </div>
                {draftError ? (
                    <div role="alert" className="px-1 text-xs text-red-400">
                        {draftError}
                    </div>
                ) : null}
            </section>
        </div>
    );

    return (
        <Popover
            trigger="click"
            placement="bottomLeft"
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                onOpenChange?.(nextOpen);
            }}
            content={content}
            overlayInnerStyle={{ padding: 0, background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, boxShadow: "0 18px 48px rgba(0,0,0,.28)" }}
        >
            <span>
                <Tooltip title={t("canvas.nodeToolbar.tagsTitle")} placement="top" mouseEnterDelay={0.2} color={theme.toolbar.panel} styles={{ root: { color: theme.node.text, boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
                    <button
                        type="button"
                        className="relative flex h-8 shrink-0 items-center gap-1 whitespace-nowrap px-1"
                        style={{ color: theme.toolbar.item }}
                        aria-label={t("canvas.nodeToolbar.tagsTitle")}
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <span className="flex h-6 items-center gap-1 rounded-md px-1 transition" style={{ background: open ? theme.toolbar.activeBg : "transparent", color: open ? theme.toolbar.activeText : undefined }}>
                            <Tag className="size-4" />
                            <span>{t("canvas.nodeToolbar.tags")}</span>
                            {tags.length ? (
                                <span className="ml-0.5 rounded-full px-1 text-[10px] leading-4" style={{ background: theme.toolbar.activeBg }}>
                                    {tags.length}
                                </span>
                            ) : null}
                        </span>
                    </button>
                </Tooltip>
            </span>
        </Popover>
    );
}
