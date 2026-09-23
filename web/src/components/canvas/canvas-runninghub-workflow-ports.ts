import type { RunningHubResource } from "@/stores/use-config-store";
import type { CanvasConnection, CanvasNodeData, CanvasNodeTypeId } from "@/types/canvas";

export type RunningHubWorkflowPortKind = "prompt" | "image" | "video" | "audio";
export type RunningHubWorkflowPortHead = { kind: RunningHubWorkflowPortKind; index: number; portId: string; connected: boolean; summaryY: number };

const WORKFLOW_HEADER_HEIGHT = 56;
const WORKFLOW_ROW_HEIGHT = 40;
// 收起状态的实际输入头位于 RH 节点左侧，按真实槽位顺序排列，不占用设置卡内容。
const WORKFLOW_SUMMARY_PROMPT_Y = 94;
const WORKFLOW_SUMMARY_MEDIA_START_Y = 144;
const WORKFLOW_SUMMARY_PORT_GAP = 34;
// RH 输入头位于节点左侧，连线不再穿入设置卡内部。
export const RUNNING_HUB_WORKFLOW_PORT_X = -14;

/** RH 卡片拉伸时，内部内容和外侧素材端口使用同一个等比缩放系数。 */
export function runningHubWorkflowContentScale(node: Pick<CanvasNodeData, "width">) {
    return Math.max(0.25, node.width / 720);
}

/**
 * 紧凑工作流卡片的输入端口中心点。端口顺序与 nodeInfoList 的素材顺序一致：
 * 图片 1…N → 视频 1…N → 音频 1…N。
 */
/**
 * 同一真实素材槽位的稳定标识。新格式携带全局 order，旧格式没有；二者必须视作同一槽位。
 */
export function runningHubWorkflowPortIdentity(portId?: string) {
    const match = portId?.match(/^(image|video|audio):(\d+):\d+:(.+)$/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : portId;
}

/** 用于画布连线的槽位名称，始终从实际目标端口解析，不依赖节点位置。 */
export function runningHubWorkflowPortLabel(portId?: string) {
    const match = portId?.match(/^(prompt|image|video|audio):(\d+)/);
    if (!match) return undefined;
    if (match[1] === "prompt") return "提示词";
    const label = match[1] === "image" ? "图片" : match[1] === "video" ? "视频" : "音频";
    return `${label}${Number(match[2]) + 1}`;
}

function bindingsForPortKind(resource: RunningHubResource, kind: Exclude<RunningHubWorkflowPortKind, "prompt">) {
    if (kind === "image") return resource.imageBindings?.length ? resource.imageBindings : resource.imageBinding ? [resource.imageBinding] : [];
    return kind === "video" ? resource.videoBindings || [] : resource.audioBindings || [];
}

/** 生成新连线使用的完整端口 ID，确保素材序号与 RunningHub 的真实节点绑定一致。 */
export function runningHubWorkflowPortId(resource: RunningHubResource, kind: RunningHubWorkflowPortKind, index = 0) {
    if (kind === "prompt") return resource.promptBinding ? "prompt:0" : undefined;
    const bindings = bindingsForPortKind(resource, kind);
    const binding = bindings[index];
    if (!binding) return undefined;
    const imageCount = bindingsForPortKind(resource, "image").length;
    const videoCount = bindingsForPortKind(resource, "video").length;
    const order = kind === "image" ? index : kind === "video" ? imageCount + index : imageCount + videoCount + index;
    return `${kind}:${index}:${order}:${binding.nodeId}.${binding.fieldName}`;
}

/**
 * 保持 RH 摘要卡不展开时，直接拖入节点会按节点种类占用首个空闲的真实输入槽位。
 * 所有同类槽位已占用时返回 undefined，避免隐式覆盖已有连接。
 */
export function runningHubWorkflowFirstAvailablePort(resource: RunningHubResource, kind: RunningHubWorkflowPortKind, connections: CanvasConnection[], targetNodeId: string) {
    const candidates = kind === "prompt"
        ? resource.promptBinding ? ["prompt:0"] : []
        : bindingsForPortKind(resource, kind).map((_, index) => runningHubWorkflowPortId(resource, kind, index)).filter((port): port is string => Boolean(port));
    const occupied = new Set(
        connections
            .filter((connection) => connection.toNodeId === targetNodeId && Boolean(connection.toPort))
            .map((connection) => runningHubWorkflowPortIdentity(connection.toPort) || connection.toPort!),
    );
    return candidates.find((port) => !occupied.has(runningHubWorkflowPortIdentity(port) || port));
}

/** RH 节点外侧输入头：已接入的真实槽位保留为媒体图标，下一个空槽才显示加号。 */
export function runningHubWorkflowPortHeads(resource: RunningHubResource, connections: CanvasConnection[], targetNodeId: string): RunningHubWorkflowPortHead[] {
    const occupied = new Set(
        connections
            .filter((connection) => connection.toNodeId === targetNodeId && Boolean(connection.toPort))
            .map((connection) => runningHubWorkflowPortIdentity(connection.toPort) || connection.toPort!),
    );
    return (["prompt", "image", "video", "audio"] as const).flatMap((kind) => {
        const candidates = kind === "prompt"
            ? resource.promptBinding ? ["prompt:0"] : []
            : bindingsForPortKind(resource, kind).map((_, index) => runningHubWorkflowPortId(resource, kind, index)).filter((port): port is string => Boolean(port));
        const firstAvailable = candidates.find((port) => !occupied.has(runningHubWorkflowPortIdentity(port) || port));
        return candidates.flatMap((port, index) => {
            const connected = occupied.has(runningHubWorkflowPortIdentity(port) || port);
            const summaryY = runningHubWorkflowPortY(port, false, resource);
            return connected || port === firstAvailable ? summaryY === undefined ? [] : [{ kind, index, portId: port, connected, summaryY }] : [];
        });
    });
}

export function runningHubWorkflowAutoPort(resource: RunningHubResource, sourceType: CanvasNodeTypeId, connections: CanvasConnection[], targetNodeId: string) {
    const kind = sourceType === "text" ? "prompt" : sourceType === "image" ? "image" : sourceType === "video" ? "video" : sourceType === "audio" ? "audio" : undefined;
    return kind ? runningHubWorkflowFirstAvailablePort(resource, kind, connections, targetNodeId) : undefined;
}

/**
 * 老画布曾只保存“连到这个工作流节点”，没有保存目标素材槽位。
 * 仅在每种素材恰好只有一条旧连线时，才安全补到第一个未占用的真实端口；
 * 多条同类旧连线仍保留给用户手动指定，绝不按历史顺序猜测。
 */
export function migrateUnambiguousRunningHubLegacyConnections(
    connections: CanvasConnection[],
    nodes: CanvasNodeData[],
    resourceForNode: (node: CanvasNodeData) => RunningHubResource | undefined,
) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pendingByTarget = new Map<string, Map<RunningHubWorkflowPortKind, CanvasConnection[]>>();
    const occupiedByTarget = new Map<string, Set<string>>();

    for (const connection of connections) {
        if (connection.toPort) {
            const occupied = occupiedByTarget.get(connection.toNodeId) || new Set<string>();
            occupied.add(runningHubWorkflowPortIdentity(connection.toPort) || connection.toPort);
            occupiedByTarget.set(connection.toNodeId, occupied);
            continue;
        }
        const source = nodeById.get(connection.fromNodeId);
        const target = nodeById.get(connection.toNodeId);
        const kind = source?.type === "text" ? "prompt" : source?.type === "image" ? "image" : source?.type === "video" ? "video" : source?.type === "audio" ? "audio" : undefined;
        if (!kind || !target || !resourceForNode(target)) continue;
        const byKind = pendingByTarget.get(target.id) || new Map<RunningHubWorkflowPortKind, CanvasConnection[]>();
        byKind.set(kind, [...(byKind.get(kind) || []), connection]);
        pendingByTarget.set(target.id, byKind);
    }

    const migratedPorts = new Map<string, string>();
    for (const [targetId, byKind] of pendingByTarget) {
        const target = nodeById.get(targetId);
        if (!target) continue;
        const resource = resourceForNode(target);
        if (!resource) continue;
        const occupied = occupiedByTarget.get(targetId) || new Set<string>();
        for (const kind of ["prompt", "image", "video", "audio"] as const) {
            const pending = byKind.get(kind) || [];
            if (pending.length !== 1) continue;
            const bindings = kind === "prompt" ? [undefined] : bindingsForPortKind(resource, kind);
            const portId = bindings.map((_, index) => runningHubWorkflowPortId(resource, kind, index)).find((port): port is string => Boolean(port) && !occupied.has(runningHubWorkflowPortIdentity(port) || ""));
            if (!portId) continue;
            migratedPorts.set(pending[0].id, portId);
            occupied.add(runningHubWorkflowPortIdentity(portId) || portId);
        }
    }

    return migratedPorts.size ? connections.map((connection) => migratedPorts.has(connection.id) ? { ...connection, toPort: migratedPorts.get(connection.id) } : connection) : connections;
}

export function runningHubWorkflowPortY(portId?: string, expanded = true, resource?: RunningHubResource) {
    // 完整格式：image:<index>:<order>:<nodeId>.<field>；旧格式缺少 order，
    // 因此不能把旧格式里的 nodeId 误读为 order。
    const match = portId?.match(/^(prompt|image|video|audio):(\d+)(?::(\d+):\d+\.)?/);
    if (!match) return undefined;
    if (match[1] === "prompt") return expanded ? WORKFLOW_HEADER_HEIGHT + WORKFLOW_ROW_HEIGHT / 2 : WORKFLOW_SUMMARY_PROMPT_Y;

    // 新端口保存全局 order。旧端口没有 order 时，根据已导入的真实绑定恢复它，
    // 否则视频/音频会错误地落到图片行。
    const index = Number(match[2]);
    const imageSlots = resource?.imageBindings?.length || (resource?.imageBinding ? 1 : 0);
    const videoSlots = resource?.videoBindings?.length || 0;
    const order = match[3] !== undefined
        ? Number(match[3])
        : match[1] === "video"
          ? imageSlots + index
          : match[1] === "audio"
            ? imageSlots + videoSlots + index
            : index;
    const summaryMediaStart = resource && !resource.promptBinding ? WORKFLOW_SUMMARY_PROMPT_Y : WORKFLOW_SUMMARY_MEDIA_START_Y;
    return expanded ? WORKFLOW_HEADER_HEIGHT + WORKFLOW_ROW_HEIGHT * (order + 1.5) : summaryMediaStart + WORKFLOW_SUMMARY_PORT_GAP * order;
}
