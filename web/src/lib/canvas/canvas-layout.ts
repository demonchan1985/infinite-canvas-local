import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

function bounds(nodes: CanvasNodeData[]) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const node of nodes) {
        left = Math.min(left, node.position.x);
        top = Math.min(top, node.position.y);
        right = Math.max(right, node.position.x + node.width);
        bottom = Math.max(bottom, node.position.y + node.height);
    }
    return { left, top, width: right - left, height: bottom - top };
}

export function fitCanvasViewport(nodes: CanvasNodeData[], size: { width: number; height: number }): ViewportTransform {
    if (!nodes.length) return { x: size.width / 2, y: size.height / 2, k: 1 };
    const box = bounds(nodes);
    const k = Math.max(0.05, Math.min(1, Math.max(1, size.width - 160) / Math.max(1, box.width), Math.max(1, size.height - 200) / Math.max(1, box.height)));
    return { x: size.width / 2 - (box.left + box.width / 2) * k, y: size.height / 2 - (box.top + box.height / 2) * k, k };
}

type GroupImageLayoutOptions = {
    fit?: boolean;
    padding?: number;
    topPadding?: number;
    gap?: number;
    rowGap?: number;
};

export const GROUP_IMAGE_THUMBNAIL_MAX_EDGE = 220;
export const GROUP_IMAGE_TOP_PADDING = 176;
export const GROUP_IMAGE_ROW_GAP = 72;

/** 图片组按当前画布阅读顺序整理；混合内容组保持原有手动布局。 */
export function arrangeGroupImageNodes(nodes: CanvasNodeData[], groupId: string, options: GroupImageLayoutOptions = {}): CanvasNodeData[] {
    const group = nodes.find((node) => node.id === groupId && node.type === "group");
    if (!group) return nodes;
    const children = nodes.filter((node) => node.metadata?.groupId === groupId);
    if (!children.length || children.some((node) => node.type !== "image")) return nodes;

    const images = [...children]
        .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id))
        .map((node) => {
            const thumbnailScale = Math.min(1, GROUP_IMAGE_THUMBNAIL_MAX_EDGE / Math.max(node.width, node.height));
            return thumbnailScale === 1 ? node : { ...node, width: Math.max(1, Math.round(node.width * thumbnailScale)), height: Math.max(1, Math.round(node.height * thumbnailScale)) };
        });
    const columns = Math.ceil(Math.sqrt(images.length));
    const rows = Math.ceil(images.length / columns);
    const padding = options.padding ?? 24;
    const topPadding = options.topPadding ?? GROUP_IMAGE_TOP_PADDING;
    const gap = options.gap ?? 24;
    const rowGap = options.rowGap ?? GROUP_IMAGE_ROW_GAP;
    const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...images.filter((_, index) => index % columns === column).map((node) => node.width)));
    const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...images.slice(row * columns, (row + 1) * columns).map((node) => node.height)));
    const positions = new Map<string, { x: number; y: number }>();
    let y = group.position.y + topPadding;
    for (let row = 0; row < rows; row++) {
        let x = group.position.x + padding;
        for (let column = 0; column < columns; column++) {
            const image = images[row * columns + column];
            if (!image) break;
            positions.set(image.id, { x, y });
            x += columnWidths[column] + gap;
        }
        y += rowHeights[row] + rowGap;
    }
    const contentWidth = columnWidths.reduce((total, width) => total + width, 0) + gap * (columns - 1);
    const contentHeight = rowHeights.reduce((total, height) => total + height, 0) + rowGap * (rows - 1);
    const minWidth = contentWidth + padding * 2;
    const minHeight = contentHeight + topPadding + padding;
    const imagesById = new Map(images.map((image) => [image.id, image]));

    return nodes.map((node) => {
        if (node.id === group.id) {
            return { ...node, width: options.fit ? minWidth : Math.max(node.width, minWidth), height: options.fit ? minHeight : Math.max(node.height, minHeight) };
        }
        const position = positions.get(node.id);
        const image = imagesById.get(node.id);
        return position ? { ...node, width: image?.width || node.width, height: image?.height || node.height, position } : node;
    });
}

/** 恢复旧画布时，把纯图片组收敛到当前缩略图网格；混合内容组保持手动布局。 */
export function arrangeAllGroupImageNodes(nodes: CanvasNodeData[], options: GroupImageLayoutOptions = {}): CanvasNodeData[] {
    return nodes.filter((node) => node.type === "group").reduce((next, group) => arrangeGroupImageNodes(next, group.id, options), nodes);
}

/** 按依赖分列；分组保持内部布局，环形依赖放在最后一列，不修改节点内容。 */
export function arrangeCanvasNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    if (nodes.length < 2) return nodes;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const rootById = new Map<string, string>();
    const units = new Map<string, CanvasNodeData[]>();
    for (const node of nodes) {
        let root = node;
        const visited = new Set([node.id]);
        while (root.metadata?.groupId) {
            const parent = byId.get(root.metadata.groupId);
            if (!parent || parent.type !== "group" || visited.has(parent.id)) break;
            visited.add(parent.id);
            root = parent;
        }
        rootById.set(node.id, root.id);
        const members = units.get(root.id) || [];
        members.push(node);
        units.set(root.id, members);
    }
    const outgoing = new Map([...units.keys()].map((id) => [id, new Set<string>()]));
    const incoming = new Map([...units.keys()].map((id) => [id, 0]));
    const levels = new Map([...units.keys()].map((id) => [id, 0]));
    for (const edge of connections) {
        const from = rootById.get(edge.fromNodeId), to = rootById.get(edge.toNodeId);
        if (!from || !to || from === to || outgoing.get(from)!.has(to)) continue;
        outgoing.get(from)!.add(to);
        incoming.set(to, incoming.get(to)! + 1);
    }
    const queue = [...units.keys()].filter((id) => incoming.get(id) === 0);
    let lastLevel = 0;
    for (let i = 0; i < queue.length; i++) {
        const from = queue[i];
        for (const to of outgoing.get(from)!) {
            const level = Math.max(levels.get(to)!, levels.get(from)! + 1);
            levels.set(to, level);
            lastLevel = Math.max(lastLevel, level);
            incoming.set(to, incoming.get(to)! - 1);
            if (incoming.get(to) === 0) queue.push(to);
        }
    }
    const columns = new Map<number, string[]>();
    for (const id of units.keys()) {
        const level = incoming.get(id)! > 0 ? lastLevel + 1 : levels.get(id)!;
        columns.set(level, [...(columns.get(level) || []), id]);
    }
    const offsets = new Map<string, { x: number; y: number }>();
    let x = 0;
    for (const [, ids] of [...columns.entries()].sort(([a], [b]) => a - b)) {
        let y = 0, width = 0;
        for (const id of ids) {
            const box = bounds(units.get(id)!);
            offsets.set(id, { x: x - box.left, y: y - box.top });
            width = Math.max(width, box.width);
            y += box.height + 80;
        }
        x += width + 120;
    }
    return nodes.map((node) => {
        const offset = offsets.get(rootById.get(node.id)!)!;
        return { ...node, position: { x: node.position.x + offset.x, y: node.position.y + offset.y } };
    });
}
