import { strFromU8, unzipSync } from "fflate";

import type { CanvasTextTag, CanvasTextTagColor } from "@/types/canvas";

const TEXT_NODE_IMPORT_EXTENSIONS = ["txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "log", "srt", "vtt", "docx"] as const;
const textTagColors = ["gray", "blue", "green", "amber", "rose", "violet"] as const satisfies readonly CanvasTextTagColor[];
const TEXT_NODE_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const DOCX_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const TEXT_NODE_IMPORT_MAX_CHARACTERS = 1_000_000;

export const TEXT_NODE_IMPORT_ACCEPT = TEXT_NODE_IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(",");
export const MAX_CANVAS_TEXT_TAGS = 16;
export const MAX_CANVAS_TEXT_TAG_LABEL_LENGTH = 40;

export const canvasTextTagPresets: CanvasTextTag[] = [
    { id: "preset:character", label: "人物", color: "blue" },
    { id: "preset:scene", label: "场景", color: "green" },
    { id: "preset:prop", label: "道具", color: "amber" },
    { id: "preset:style-reference", label: "风格参考", color: "violet" },
    { id: "preset:storyboard", label: "分镜图", color: "rose" },
    { id: "preset:reference-image", label: "参考图", color: "blue" },
    { id: "preset:other", label: "其他", color: "gray" },
];

export type CanvasTextImportResult = {
    name: string;
    text: string;
};

export function isSupportedTextNodeImportFileName(name: string) {
    const extension = name.trim().split(".").pop()?.toLowerCase();
    return Boolean(extension && TEXT_NODE_IMPORT_EXTENSIONS.includes(extension as (typeof TEXT_NODE_IMPORT_EXTENSIONS)[number]));
}

export async function readTextNodeImportFile(file: File): Promise<CanvasTextImportResult> {
    if (!isSupportedTextNodeImportFileName(file.name)) {
        throw new Error("仅支持 DOCX、TXT、Markdown、CSV、TSV、JSON、YAML、XML、LOG、SRT 和 VTT 文件。");
    }
    if (!file.size) throw new Error("所选文件为空，无法导入文本。");
    if (file.size > TEXT_NODE_IMPORT_MAX_BYTES) throw new Error("文本文件不能超过 20 MB。");

    const extension = file.name.trim().split(".").pop()?.toLowerCase();
    const text = extension === "docx" ? extractTextFromDocx(new Uint8Array(await file.arrayBuffer())) : await file.text();
    const normalizedText = normalizeImportedText(text);

    if (!normalizedText.trim()) throw new Error("文件中没有可导入的文本内容。");
    if ([...normalizedText].length > TEXT_NODE_IMPORT_MAX_CHARACTERS) throw new Error("文本内容不能超过 100 万个字符。");

    return { name: file.name, text: normalizedText };
}

export function mergeTextNodeImportedContent(currentContent: string, importedContent: string, mode: "replace" | "append") {
    return mode === "append" && currentContent.trim() ? `${currentContent.trimEnd()}\n\n${importedContent}` : importedContent;
}

export function extractTextFromDocx(data: Uint8Array): string {
    let documentXml: Uint8Array | undefined;
    try {
        const files = unzipSync(data, {
            filter: (file) => file.name === "word/document.xml" && file.originalSize <= DOCX_DOCUMENT_MAX_BYTES,
        });
        documentXml = files["word/document.xml"];
    } catch {
        throw new Error("无法读取 DOCX 文件，请确认文件未损坏。");
    }

    if (!documentXml) throw new Error("DOCX 正文不存在或超过 10 MB，无法导入。");

    const xml = strFromU8(documentXml);
    let text = "";
    const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/?>|<\/w:p>/gi;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(xml))) {
        if (match[1] !== undefined) {
            text += decodeXmlEntities(match[1].replace(/<[^>]+>/g, ""));
        } else if (match[2]?.toLowerCase() === "tab") {
            text += "\t";
        } else {
            text += "\n";
        }
    }

    return normalizeImportedText(text);
}

export function normalizeCanvasTextTags(value: unknown): CanvasTextTag[] {
    if (!Array.isArray(value)) return [];

    const seenLabels = new Set<string>();
    const tags: CanvasTextTag[] = [];
    for (const valueItem of value) {
        if (!isRecord(valueItem) || typeof valueItem.id !== "string" || !isCanvasTextTagColor(valueItem.color)) continue;
        const label = normalizeCanvasTextTagLabel(valueItem.label);
        if (!label || !valueItem.id.trim()) continue;

        const labelKey = canvasTextTagLabelKey(label);
        if (seenLabels.has(labelKey)) continue;

        seenLabels.add(labelKey);
        tags.push({ id: valueItem.id, label, color: valueItem.color });
        if (tags.length === MAX_CANVAS_TEXT_TAGS) break;
    }
    return tags;
}

export function createCanvasTextTag(label: string, color: CanvasTextTagColor): CanvasTextTag | null {
    const normalizedLabel = normalizeCanvasTextTagLabel(label);
    if (!normalizedLabel) return null;

    return {
        id: globalThis.crypto?.randomUUID?.() || `text-tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: normalizedLabel,
        color,
    };
}

export function normalizeCanvasTextTagLabel(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const label = value.trim().normalize("NFKC");
    if (!label || [...label].length > MAX_CANVAS_TEXT_TAG_LABEL_LENGTH || /[\u0000-\u001F\u007F-\u009F]/.test(label)) return null;
    return label;
}

export function canvasTextTagLabelKey(label: string) {
    return label.trim().normalize("NFKC").toLowerCase();
}

export function isCanvasTextTagColor(value: unknown): value is CanvasTextTagColor {
    return typeof value === "string" && (textTagColors as readonly string[]).includes(value);
}

function normalizeImportedText(value: string) {
    return value
        .replace(/\r\n?/g, "\n")
        .replace(/\u0000/g, "")
        .trimEnd();
}

function decodeXmlEntities(value: string) {
    return value.replace(/&(?:#x([\da-f]+)|#(\d+)|amp|apos|gt|lt|quot);/gi, (entity, hexadecimal, decimal) => {
        if (hexadecimal || decimal) {
            const codePoint = Number.parseInt(hexadecimal || decimal, hexadecimal ? 16 : 10);
            return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
        }
        return { "&amp;": "&", "&apos;": "'", "&gt;": ">", "&lt;": "<", "&quot;": '"' }[entity.toLowerCase()] || entity;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}
