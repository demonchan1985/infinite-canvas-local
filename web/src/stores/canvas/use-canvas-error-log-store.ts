import { create } from "zustand";
import { nanoid } from "nanoid";

type ErrorContext = { projectId: string; nodeId: string; nodeName?: string; model?: string; stage?: string };
export type CanvasErrorLogEntry = ErrorContext & { id: string; timestamp: string; status: "success" | "error"; message: string; resultCount?: number; diagnostics?: Record<string, string> };

const diagnosticFields = ["stage", "taskId", "workflowId", "status", "httpStatus", "errorCode", "nodeId", "nodeType", "exceptionType", "exceptionMessage"];

function redact(value: string, sensitiveValues: string[]) {
    let text = value;
    const secrets = sensitiveValues.filter(Boolean).flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1)]);
    for (const secret of [...new Set(secrets)].sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, "[已隐藏]");
    return text.replace(/data:[\w/+.-]+;base64,[\w+/=]+/gi, "[素材已隐藏]")
        .replace(/("(?:prompt|systemPrompt|system_prompt|apiKey|api_key|token|authorization|password|secret)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, '$1"[已隐藏]"')
        .replace(/Bearer\s+[^\s"']+/gi, "Bearer [已隐藏]")
        .replace(/((?:api[_-]?key|token|authorization|password|secret)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, "$1[已隐藏]");
}

function createEntry(error: unknown, context: ErrorContext, sensitiveValues: string[]): CanvasErrorLogEntry {
    const diagnostics: Record<string, string> = {};
    const seen = new Set<unknown>();
    let cause = error;
    while (cause && typeof cause === "object" && !seen.has(cause)) {
        seen.add(cause);
        const item = cause as { diagnostics?: Record<string, unknown>; cause?: unknown };
        for (const field of diagnosticFields) {
            const value = item.diagnostics?.[field];
            if (typeof value === "string" || typeof value === "number") diagnostics[field] = redact(String(value), sensitiveValues);
        }
        cause = item.cause;
    }
    return {
        id: nanoid(), timestamp: new Date().toISOString(), status: "error", projectId: context.projectId, nodeId: context.nodeId,
        nodeName: context.nodeName ? redact(context.nodeName, sensitiveValues) : undefined,
        model: context.model ? redact(context.model, sensitiveValues) : undefined,
        stage: diagnostics.stage || context.stage || "生成",
        message: redact(error instanceof Error ? error.message : String(error), sensitiveValues),
        ...(Object.keys(diagnostics).length ? { diagnostics } : {}),
    };
}

export function formatCanvasErrorLogs(entries: CanvasErrorLogEntry[]) {
    return JSON.stringify(entries, null, 2);
}

// 日志只存在当前页面内存中，不写入画布数据或浏览器持久化存储。
export const useCanvasErrorLogStore = create<{
    entries: CanvasErrorLogEntry[];
    record: (error: unknown, context: ErrorContext, sensitiveValues?: string[]) => void;
    recordSuccess: (context: ErrorContext, resultCount: number) => void;
    clear: (projectId?: string) => void;
}>((set) => ({
    entries: [],
    record: (error, context, sensitiveValues = []) => {
        const canceled = error as { name?: string; code?: string } | null;
        if (canceled?.name === "AbortError" || canceled?.name === "CanceledError" || canceled?.code === "ERR_CANCELED") return;
        const entry = createEntry(error, context, sensitiveValues);
        set((state) => ({ entries: [entry, ...state.entries] }));
    },
    recordSuccess: (context, resultCount) => {
        if (resultCount <= 0) return;
        set((state) => ({ entries: [{
            id: nanoid(), timestamp: new Date().toISOString(), status: "success", projectId: context.projectId, nodeId: context.nodeId,
            model: context.model, stage: context.stage || "生成", resultCount, message: `已写入 ${resultCount} 项结果`,
        }, ...state.entries] }));
    },
    clear: (projectId) => set((state) => ({ entries: projectId ? state.entries.filter((entry) => entry.projectId !== projectId) : [] })),
}));
