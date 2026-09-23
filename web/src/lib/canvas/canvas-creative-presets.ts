import aifisherCreativeCatalog from "./aifisher-creative-catalog.json" with { type: "json" };
import aifisherMjStyleCatalog from "./aifisher-mj-style-catalog.json" with { type: "json" };
import type { CanvasCreativePreset, CanvasCreativePresetKind, CanvasCreativePresetSelection, CanvasGenerationMode } from "@/types/canvas";

export type { CanvasCreativePreset, CanvasCreativePresetKind, CanvasCreativePresetSelection } from "@/types/canvas";

export type MjInsertMode = "style" | "parameters" | "full" | "vibe";

export type AifisherMjStyle = {
    id: string;
    group: string;
    category: string;
    name: string;
    mixed: boolean;
    medium: string;
    codes: string;
    parameters: string;
    prompt: string;
    vibe: string;
    thumbnail: string;
    preview: string;
};

export const mjCategoryGroups = [
    { name: "东方古风", categories: ["东方古风·武侠", "东方神话·仙侠奇观", "东方古装·史诗", "古风室内·殿堂楼阁", "古镇村落·俯瞰", "仙侠天宫·奇观", "古建·祠庙宫殿"] },
    { name: "现代影像", categories: ["现代都市·电影人文", "现代写实人像·生活流", "时尚编辑·商业广告", "日韩系·影像", "现代都市·街景", "现代室内·生活空间"] },
    { name: "科幻幻想", categories: ["科幻·机甲", "游戏CG·动漫角色", "东方赛博·武侠朋克", "西方奇幻·神话史诗", "科幻·未来场景", "西幻·城堡秘境"] },
    { name: "自然氛围", categories: ["自然奇观·山水云海", "光影空镜·氛围", "风格化与实验"] },
    { name: "暗黑废墟", categories: ["国风暗黑·志怪恐怖", "废墟·古代战场", "废墟末世·战场", "暗黑异兽·克苏鲁"] },
    { name: "巨物传说", categories: ["巨物·尺度压迫", "巨型机甲·超级机器人", "怪兽特摄·哥斯拉系", "超尺度奇观·巨物崇拜", "东方神龙·仙兽", "西方巨龙·翼兽", "深海巨兽·海怪", "上古神祇·泰坦巨人"] },
] as const;

export const mjInsertModes: ReadonlyArray<{ value: MjInsertMode; label: string }> = [
    { value: "style", label: "风格码" },
    { value: "parameters", label: "风格＋参数" },
    { value: "full", label: "完整提示词" },
    { value: "vibe", label: "色调描述" },
];

const imageCreativeKinds: CanvasCreativePresetKind[] = ["style", "mj", "filter"];
const videoCreativeKinds: CanvasCreativePresetKind[] = ["style", "motion", "filter"];
const creativeKinds = new Set<CanvasCreativePresetKind>(["style", "motion", "filter"]);
const directCatalog = (aifisherCreativeCatalog as unknown as CanvasCreativePreset[]).filter((preset) => creativeKinds.has(preset.kind));
const mjCatalog = aifisherMjStyleCatalog as unknown as AifisherMjStyle[];

export function creativePresetKindsForMode(mode: CanvasGenerationMode): CanvasCreativePresetKind[] {
    if (mode === "image") return [...imageCreativeKinds];
    if (mode === "video") return [...videoCreativeKinds];
    return [];
}

export function canvasCreativePresetsForKind(kind: Exclude<CanvasCreativePresetKind, "mj">) {
    return directCatalog.filter((preset) => preset.kind === kind);
}

export function aifisherMjStyles() {
    return mjCatalog;
}

export function filterAifisherMjStyles(items: AifisherMjStyle[], group: string, category: string, query: string, codeKind: string) {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(
        (item) =>
            (group === "all" || item.group === group) &&
            (category === "全部" || item.category === category) &&
            (codeKind === "all" || item.mixed === (codeKind === "mixed")) &&
            words.every((word) => [item.id, item.name, item.category, item.codes, item.vibe, item.medium, item.prompt].join(" ").toLowerCase().includes(word)),
    );
}

export function mjStyleText(item: AifisherMjStyle, mode: MjInsertMode) {
    const text = mode === "full" ? item.prompt : mode === "vibe" ? item.vibe : [item.vibe, mode === "parameters" ? item.parameters : item.codes].filter(Boolean).join("\n");
    return text.replace(/(?:^|\s)--preview(?=\s|$)/gi, "").trim();
}

export function mjStylePreset(item: AifisherMjStyle, mode: MjInsertMode): CanvasCreativePreset {
    return {
        id: `mj-${item.id}-${mode}`,
        kind: "mj",
        category: item.category,
        name: `MJ · ${item.name}`,
        description: item.vibe,
        prompt: mjStyleText(item, mode),
        preview: item.thumbnail,
        poster: item.preview,
    };
}

export function findCanvasCreativePreset(kind: CanvasCreativePresetKind, id: string) {
    if (kind !== "mj") return directCatalog.find((preset) => preset.kind === kind && preset.id === id);
    const matched = /^mj-(.+)-(style|parameters|full|vibe)$/.exec(id);
    const source = mjCatalog.find((item) => item.id === matched?.[1]);
    return source && matched ? mjStylePreset(source, matched[2] as MjInsertMode) : undefined;
}

export function normalizeCanvasCreativeSelection(selection: CanvasCreativePresetSelection | undefined, mode: CanvasGenerationMode): CanvasCreativePresetSelection {
    return creativePresetKindsForMode(mode).reduce<CanvasCreativePresetSelection>((result, kind) => {
        const candidate = selection?.[kind];
        const preset = candidate ? findCanvasCreativePreset(kind, candidate.id) : undefined;
        if (preset) result[kind] = preset;
        return result;
    }, {});
}

/** 复用 AIFISHER 的参数归位规则：所有 MJ -- 参数始终位于正文最后。 */
export function normalizeMidjourneyPrompt(value: string) {
    const text = String(value || "");
    const flags = [...text.matchAll(/(?:^|\s)--([a-z][a-z-]*)(?=\s|$)/gi)];
    if (!flags.length) return text.trim();
    const parameters = new Map<string, string>();
    for (let index = 0; index < flags.length; index += 1) {
        const flag = flags[index];
        let name = flag[1].toLowerCase();
        if (name === "preview") continue;
        if (name === "p" || name === "personalize") name = "profile";
        const nextIndex = flags[index + 1]?.index ?? text.length;
        const flagIndex = flag.index ?? 0;
        const parameterValue = text.slice(flagIndex + flag[0].length, nextIndex).trim();
        if (name === "sref" || name === "profile") {
            const previous = parameters.get(name) || "";
            parameters.set(name, [...new Set(`${previous} ${parameterValue}`.split(/\s+/).filter(Boolean))].join(" "));
        } else {
            parameters.set(name, parameterValue);
        }
    }
    const suffix = [...parameters].map(([name, parameterValue]) => `--${name}${parameterValue ? ` ${parameterValue}` : ""}`).join(" ");
    return [text.slice(0, flags[0].index).trim(), suffix].filter(Boolean).join("\n");
}

export function composeCanvasCreativePrompt(prompt: string, selection: CanvasCreativePresetSelection | undefined, mode: CanvasGenerationMode) {
    const resolved = normalizeCanvasCreativeSelection(selection, mode);
    const order: CanvasCreativePresetKind[] = mode === "image" ? ["style", "filter", "mj"] : mode === "video" ? ["style", "motion", "filter"] : [];
    const parts = [...order.map((kind) => resolved[kind]?.prefix || ""), prompt.trim(), ...order.map((kind) => resolved[kind]?.prompt || "")].filter(Boolean);
    const composed = parts.filter((part, index) => parts.indexOf(part) === index).join("\n");
    return mode === "image" && resolved.mj ? normalizeMidjourneyPrompt(composed) : composed;
}
