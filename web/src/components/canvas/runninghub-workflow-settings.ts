import type { RunningHubWorkflowField } from "@/stores/use-config-store";
import type { RunningHubWorkflowRunOptions } from "@/types/canvas";

export type RunningHubWorkflowFieldControl = "duration" | "seed" | "default";

export const RUNNING_HUB_WORKFLOW_INSTANCE_TYPES = ["default", "plus", "ultra"] as const;
export type RunningHubWorkflowInstanceType = (typeof RUNNING_HUB_WORKFLOW_INSTANCE_TYPES)[number];
export type { RunningHubWorkflowRunOptions } from "@/types/canvas";

export function runningHubWorkflowInstanceLabel(instanceType: RunningHubWorkflowInstanceType) {
    return instanceType === "default" ? "24G" : instanceType === "plus" ? "48G" : "84G";
}

/**
 * 与 RunningHub /openapi/v2/run/workflow 的任务层字段对应；不混入 nodeInfoList。
 * 保留时长与 Webhook 是可选字段，当前画布默认不启用，以免意外增加费用或回调到未知地址。
 */
export function resolveRunningHubWorkflowRunOptions(options?: RunningHubWorkflowRunOptions) {
    const instanceType = RUNNING_HUB_WORKFLOW_INSTANCE_TYPES.includes(options?.instanceType as RunningHubWorkflowInstanceType) ? options?.instanceType as RunningHubWorkflowInstanceType : "default";
    const retainSeconds = Number(options?.retainSeconds);
    const webhookUrl = String(options?.webhookUrl || "").trim();
    return {
        addMetadata: options?.addMetadata !== false,
        instanceType,
        usePersonalQueue: Boolean(options?.usePersonalQueue),
        ...(Number.isInteger(retainSeconds) && retainSeconds >= 10 && retainSeconds <= 180 ? { retainSeconds } : {}),
        ...(webhookUrl && /^https:\/\//i.test(webhookUrl) ? { webhookUrl } : {}),
    };
}

export type RunningHubWorkflowMaterialSlot = {
    portId: string;
    kind: "image" | "video" | "audio";
    index: number;
    nodeId: string;
    fieldName: string;
    connected: boolean;
};

function materialPortId(portId: string) {
    const match = portId.match(/^(image|video|audio):(\d+):\d+:(.+)$/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : portId;
}

/**
 * 未手动配置时，连了什么就启用什么；没有素材时只预开图片 1，避免空节点无法开始连线。
 * 手动开关保存的是稳定的素材槽位标识，而不是画布节点或连线顺序。
 */
export function resolveRunningHubWorkflowMaterialEnabledPorts(slots: RunningHubWorkflowMaterialSlot[], saved?: string[]) {
    const known = new Set(slots.map((slot) => materialPortId(slot.portId)));
    if (saved) return [...new Set(saved.map(materialPortId).filter((portId) => known.has(portId)))];
    const connected = slots.filter((slot) => slot.connected).map((slot) => materialPortId(slot.portId));
    if (connected.length) return [...new Set(connected)];
    const firstImage = slots.find((slot) => slot.kind === "image") || slots[0];
    return firstImage ? [materialPortId(firstImage.portId)] : [];
}

export function toggleRunningHubWorkflowMaterialPort(current: string[], portId: string, enabled: boolean) {
    const normalized = materialPortId(portId);
    const next = new Set(current.map(materialPortId));
    if (enabled) next.add(normalized);
    else next.delete(normalized);
    return [...next];
}

export function runningHubWorkflowFieldControl(field: RunningHubWorkflowField): RunningHubWorkflowFieldControl {
    if (field.type !== "number") return "default";
    if (/^(noise_seed|seed)$/.test(field.fieldName)) return "seed";
    if (/时长/.test(field.label) && field.min !== undefined && field.max !== undefined) return "duration";
    return "default";
}

export function runningHubWorkflowNumberLimits(field: RunningHubWorkflowField) {
    return { min: field.min, max: field.max, step: field.step };
}
