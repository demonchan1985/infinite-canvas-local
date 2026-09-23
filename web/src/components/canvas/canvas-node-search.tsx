import { useDeferredValue, useMemo, useState } from "react";
import { Empty, Input, Modal } from "antd";
import { Search } from "lucide-react";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { useCanvasWorkspaceStore } from "@/stores/canvas/use-canvas-workspace-store";
import type { CanvasNodeData } from "@/types/canvas";

export function CanvasNodeSearch({ nodes, onFocusNode }: { nodes: CanvasNodeData[]; onFocusNode: (id: string) => void }) {
    const open = useCanvasWorkspaceStore((state) => state.searchOpen);
    const setOpen = useCanvasWorkspaceStore((state) => state.setSearchOpen);
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query).trim().toLocaleLowerCase();
    const results = useMemo(() => nodes.filter((node) => !deferredQuery || [node.title, node.metadata?.prompt, node.type === "text" ? node.metadata?.content : ""].join(" ").toLocaleLowerCase().includes(deferredQuery)), [nodes, deferredQuery]);
    const select = (node: CanvasNodeData) => {
        onFocusNode(node.id);
        setOpen(false);
    };
    return (
        <Modal title="搜索画布节点" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden afterOpenChange={(visible) => { if (!visible) setQuery(""); }}>
            <div data-canvas-shortcuts-ignore>
                <Input autoFocus aria-label="搜索节点名称或文字" prefix={<Search className="size-4 opacity-50" />} placeholder="搜索节点名称、提示词或文字…" value={query} onChange={(event) => setQuery(event.target.value)} onPressEnter={() => { if (results[0]) select(results[0]); }} allowClear />
                <p className="my-3 text-xs opacity-50">{results.length} 个节点 · 点击定位，Enter 打开首项</p>
                <div className="thin-scrollbar max-h-[55vh] space-y-1 overflow-y-auto" aria-label="节点搜索结果">
                    {results.map((node) => (
                        <button key={node.id} type="button" className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition hover:bg-black/5 focus-visible:outline-2 dark:hover:bg-white/10" onClick={() => select(node)}>
                            <span className="grid size-7 shrink-0 place-items-center opacity-60">{getNodeDefinition(node.type)?.icon}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{node.title || "未命名节点"}</span><span className="block truncate text-xs opacity-50">{getNodeDefinition(node.type)?.title || node.type}</span></span>
                        </button>
                    ))}
                    {!results.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的节点" /> : null}
                </div>
            </div>
        </Modal>
    );
}
