// Keep generated and uploaded images visually comparable to the primary canvas image.
// The default frame is 16:9, while square/portrait images can use the full edge.
export const IMAGE_NODE_BASE_WIDTH = 640;
export const IMAGE_NODE_BASE_HEIGHT = 360;
export const IMAGE_NODE_MAX_EDGE = 640;

export function fitNodeSize(width: number, height: number, maxWidth = 640, maxHeight = 640) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(1, maxWidth / w, maxHeight / h);
    return { width: w * scale, height: h * scale };
}

export function fitImageNodeSize(width: number, height: number) {
    return fitNodeSize(width, height, IMAGE_NODE_MAX_EDGE, IMAGE_NODE_MAX_EDGE);
}

const CANVAS_CARD_MIN_VISUAL_SCALE = 0.72;
const CANVAS_CARD_MAX_VISUAL_SCALE = 1;

// Detached canvas UI (creation menus and prompt panels) remains readable when
// zoomed out and stops growing beyond its normal screen size when zoomed in.
// Do not use this for graph node content: node bounds and connection geometry
// must stay in the same canvas coordinate system.
export function canvasCardVisualScale(scale: number) {
    const safeScale = Math.max(0.05, scale);
    const visualScale = Math.min(CANVAS_CARD_MAX_VISUAL_SCALE, Math.max(CANVAS_CARD_MIN_VISUAL_SCALE, safeScale));
    return visualScale / safeScale;
}

export function canvasNodeReadableScale(scale: number) {
    // Keep controls legible around the common 35%–70% working range without
    // pinning entire nodes at a fixed screen size when users zoom far out.
    if (scale <= 0.2 || scale >= 0.72) return 1;
    const ramp = Math.min(1, (scale - 0.2) / 0.15);
    const target = Math.min(1.6, 0.72 / scale);
    return 1 + (target - 1) * ramp;
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    if (ratio < 0.25 || ratio > 4) return { width: baseWidth, height: baseHeight };
    return ratio >= baseWidth / baseHeight ? { width: baseWidth, height: baseWidth / ratio } : { width: baseHeight * ratio, height: baseHeight };
}
