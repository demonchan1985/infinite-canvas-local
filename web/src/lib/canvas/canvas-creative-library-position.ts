export type CanvasCreativeLibraryRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

export type CanvasCreativeLibraryViewport = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type CanvasCreativeLibraryPlacement = {
    left: number;
    top: number;
    width: number;
    maxHeight: number;
};

const viewportMargin = 12;
const frameGap = 16;
const maxPanelHeight = 680;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export function resolveCreativeLibraryPlacement(frame: CanvasCreativeLibraryRect, viewport: CanvasCreativeLibraryViewport, preferredWidth: number, contentHeight: number): CanvasCreativeLibraryPlacement {
    const viewportRight = viewport.left + viewport.width;
    const viewportBottom = viewport.top + viewport.height;
    const width = Math.max(0, Math.min(preferredWidth, viewport.width - viewportMargin * 2));
    const maxHeight = Math.max(0, Math.min(maxPanelHeight, viewport.height - viewportMargin * 2));
    const visibleHeight = Math.min(Math.max(0, contentHeight), maxHeight);
    const rightSpace = viewportRight - frame.right - frameGap - viewportMargin;
    const leftSpace = frame.left - viewport.left - frameGap - viewportMargin;
    const preferRight = rightSpace >= width || rightSpace >= leftSpace;
    const anchoredLeft = preferRight ? frame.right + frameGap : frame.left - frameGap - width;
    const left = clamp(anchoredLeft, viewport.left + viewportMargin, viewportRight - viewportMargin - width);
    const targetTop = frame.top + frame.height / 2 - visibleHeight / 2;
    const top = clamp(targetTop, viewport.top + viewportMargin, viewportBottom - viewportMargin - visibleHeight);

    return { left, top, width, maxHeight };
}
