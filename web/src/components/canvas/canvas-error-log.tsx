import { useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, Empty, Modal, Tooltip } from "antd";
import { Copy, ScrollText, Trash2 } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { formatCanvasErrorLogs, useCanvasErrorLogStore } from "@/stores/canvas/use-canvas-error-log-store";

export function CanvasErrorLogButton() {
    const projectId = useParams<{ id: string }>().id || "";
    const count = useCanvasErrorLogStore((state) => state.entries.filter((entry) => entry.projectId === projectId).length);
    const [open, setOpen] = useState(false);
    return <>
        <Tooltip title={`日志${count ? `（${count}）` : ""}`}>
            <button type="button" aria-label="日志" onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
                <Badge dot={count > 0}><ScrollText className="size-4" /></Badge>
            </button>
        </Tooltip>
        {open ? <CanvasErrorLogDialog projectId={projectId} onClose={() => setOpen(false)} /> : null}
    </>;
}

function CanvasErrorLogDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
    const entries = useCanvasErrorLogStore((state) => state.entries).filter((entry) => entry.projectId === projectId);
    const clear = useCanvasErrorLogStore((state) => state.clear);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const copyText = useCopyText();
    return <Modal title={`日志 · ${entries.length} 条`} open onCancel={onClose} footer={null} width={800} centered>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs" style={{ color: theme.node.muted }}>诊断仅保留在当前会话；刷新可重新收集卡片已有错误。不保存 Key、请求正文和素材。</span>
            <div className="flex gap-1">
                <Button type="text" icon={<Copy className="size-4" />} disabled={!entries.length} onClick={() => copyText(formatCanvasErrorLogs(entries), "日志已复制")}>复制全部</Button>
                <Button type="text" icon={<Trash2 className="size-4" />} disabled={!entries.length} onClick={() => clear(projectId)}>清空</Button>
            </div>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto">
            {entries.length ? entries.map((entry) => <section key={entry.id} className="rounded-xl border p-3" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-medium">{entry.nodeName || entry.nodeId} · {entry.stage}</div>
                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(formatCanvasErrorLogs([entry]), "该条日志已复制")}>复制</Button>
                </div>
                <div className="mb-2 text-xs" style={{ color: theme.node.muted }}>{new Date(entry.timestamp).toLocaleString()} · {entry.model || "未记录模型"}</div>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">{entry.message}</pre>
                {entry.diagnostics ? <pre className="mt-2 whitespace-pre-wrap break-words border-t pt-2 text-xs leading-relaxed" style={{ borderColor: theme.node.stroke }}>{JSON.stringify(entry.diagnostics, null, 2)}</pre> : null}
            </section>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前画布暂无日志" />}
        </div>
    </Modal>;
}
