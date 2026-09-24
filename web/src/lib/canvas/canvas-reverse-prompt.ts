import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function isReversePromptConfigNode(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Config && (node.metadata?.reversePromptConfig === true || (node.metadata?.generationMode === "text" && ["反推提示词配置", "Reverse prompt configuration"].includes(node.title)));
}
