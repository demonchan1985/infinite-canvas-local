export type CanvasDroppedMediaKind = "image" | "video" | "audio";
export type CanvasDroppedMedia = { file: File; kind: CanvasDroppedMediaKind };

const IMAGE_FILE_NAME = /\.(avif|bmp|gif|heic|jpe?g|png|svg|tiff?|webp)$/i;
const VIDEO_FILE_NAME = /\.(avi|m4v|mkv|mov|mp4|webm)$/i;
const AUDIO_FILE_NAME = /\.(aac|flac|m4a|mp3|ogg|wav)$/i;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    webp: "image/webp",
};

function imageMimeFromName(name: string): string | null {
    const extension = name.split(".").pop()?.toLowerCase();
    return extension ? IMAGE_MIME_BY_EXTENSION[extension] ?? null : null;
}

function bytesMatch(bytes: Uint8Array, expected: number[], offset = 0) {
    return expected.every((value, index) => bytes[offset + index] === value);
}

function imageMimeFromHeader(bytes: Uint8Array): string | null {
    if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (bytesMatch(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
    if (bytesMatch(bytes, [0x42, 0x4d])) return "image/bmp";
    if (bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
    if (bytesMatch(bytes, [0x49, 0x49, 0x2a, 0x00]) || bytesMatch(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";

    if (bytesMatch(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
        const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
        if (brand.startsWith("avi")) return "image/avif";
        if (brand.startsWith("hei") || brand.startsWith("hev") || brand === "mif1") return "image/heic";
    }

    return null;
}

export function canvasDroppedMediaKind(file: Pick<File, "name" | "type">): CanvasDroppedMediaKind | null {
    const type = file.type.toLowerCase();
    if (type.startsWith("audio/") || AUDIO_FILE_NAME.test(file.name)) return "audio";
    if (type.startsWith("video/") || VIDEO_FILE_NAME.test(file.name)) return "video";
    if (type.startsWith("image/") || IMAGE_FILE_NAME.test(file.name) || !type || type === "application/octet-stream") return "image";
    return null;
}

export function canvasDroppedMediaFiles(dataTransfer: Pick<DataTransfer, "files" | "items">): CanvasDroppedMedia[] {
    const directFiles = Array.from(dataTransfer.files);
    const files = directFiles.length
        ? directFiles
        : Array.from(dataTransfer.items).flatMap((item) => (item.kind === "file" ? [item.getAsFile()] : [])).filter((file): file is File => Boolean(file));

    return files.flatMap((file) => {
        const kind = canvasDroppedMediaKind(file);
        return kind ? [{ file, kind }] : [];
    });
}

export async function normalizeCanvasDroppedFile(file: File, kind: CanvasDroppedMediaKind): Promise<File> {
    if (kind !== "image") return file;

    // 微信等原生应用可能在 drop 结束后释放临时文件，因此在事件仍有效时读入内存副本。
    const bytes = await file.arrayBuffer();
    const type = imageMimeFromHeader(new Uint8Array(bytes)) ?? imageMimeFromName(file.name) ?? file.type;
    return new File([bytes], file.name, { type, lastModified: file.lastModified });
}
