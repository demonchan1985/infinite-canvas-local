import type { AiTextMessage } from "@/services/api/image";
import i18n from "@/i18n";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type RunningHubWorkflowRunOptions } from "@/types/canvas";
import { getGenerationResourceNodes, getGroupResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { runningHubWorkflowPortIdentity } from "@/components/canvas/canvas-runninghub-workflow-ports";
import type { RunningHubNodeBinding, RunningHubResource } from "@/stores/use-config-store";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
    /** RunningHub 素材按真实 nodeId/fieldName 保留，不按上传后的数组位置猜测。 */
    runningHubWorkflowBindings?: {
        image: RunningHubNodeBinding[];
        video: RunningHubNodeBinding[];
        audio: RunningHubNodeBinding[];
    };
    /** RunningHub 任务层字段，和真实 nodeInfoList 槽位映射分开透传。 */
    runningHubWorkflowRunOptions?: RunningHubWorkflowRunOptions;
};

type NodeGenerationResourceInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

type NodeGenerationGroupInput = {
    nodeId: string;
    type: "group";
    title: string;
    children: NodeGenerationResourceInput[];
};

export type NodeGenerationInput = NodeGenerationResourceInput | NodeGenerationGroupInput;

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if (sourceNode?.type === CanvasNodeType.Config && Boolean(sourceNode.metadata?.composerContent?.trim())) {
        return buildComposerGenerationContext(inputs, prompt);
    }

    const resourceInputs = flattenGenerationInputs(inputs);
    let textIndex = 0;
    const upstreamText = resourceInputs.flatMap((input) => (input.text ? [`【${generationLabel("text", textIndex++)}】\n${input.text}`] : [])).join("\n\n");
    const referenceImages = resourceInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = resourceInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = resourceInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: resourceInputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

/**
 * RunningHub workflow inputs are addressed by real imported bindings, not by the
 * visual order of generic canvas connections. This keeps ref_image_2 and video_1
 * stable even when users move nodes around the canvas.
 */
export function buildRunningHubWorkflowGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string, resource: RunningHubResource): NodeGenerationContext {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const workflowNode = nodeById.get(nodeId);
    const manuallyEnabledPorts = workflowNode?.metadata?.runningHubWorkflowEnabledPorts;
    const sourceFor = (portId: string) => {
        const connection = connections.find((item) => item.toNodeId === nodeId && item.toPort === portId);
        return connection ? nodeById.get(connection.fromNodeId) : undefined;
    };
    const resourceFor = (portId: string, legacyPortId?: string) => {
        const source = sourceFor(portId) || (legacyPortId ? sourceFor(legacyPortId) : undefined);
        return source ? readNodeGenerationResource(source).at(0) : undefined;
    };
    const port = (kind: "image" | "video" | "audio", index: number, order: number, binding: { nodeId: string; fieldName: string }) => `${kind}:${index}:${order}:${binding.nodeId}.${binding.fieldName}`;
    const legacyPort = (kind: "image" | "video" | "audio", index: number, binding: { nodeId: string; fieldName: string }) => `${kind}:${index}:${binding.nodeId}.${binding.fieldName}`;
    const textSource = resourceFor("prompt:0");
    const resourcesFor = (kind: "image" | "video" | "audio", bindings: RunningHubNodeBinding[], offset: number) => bindings.flatMap((binding, index) => {
        const fullPort = port(kind, index, offset + index, binding);
        const normalizedPort = runningHubWorkflowPortIdentity(fullPort) || fullPort;
        if (manuallyEnabledPorts && !manuallyEnabledPorts.some((item) => (runningHubWorkflowPortIdentity(item) || item) === normalizedPort)) return [];
        const input = resourceFor(fullPort, legacyPort(kind, index, binding));
        return input ? [{ binding, input }] : [];
    });
    const imageBindings = resource.imageBindings?.length ? resource.imageBindings : resource.imageBinding ? [resource.imageBinding] : [];
    const videoBindings = resource.videoBindings || [];
    const audioBindings = resource.audioBindings || [];
    const imageInputs = resourcesFor("image", imageBindings, 0).filter((item) => item.input.type === "image" && Boolean(item.input.image));
    const videoInputs = resourcesFor("video", videoBindings, imageBindings.length).filter((item) => item.input.type === "video" && Boolean(item.input.video));
    const audioInputs = resourcesFor("audio", audioBindings, imageBindings.length + videoBindings.length).filter((item) => item.input.type === "audio" && Boolean(item.input.audio));
    const referenceImages = imageInputs.flatMap((item) => item.input.image ? [item.input.image] : []);
    const referenceVideos = videoInputs.flatMap((item) => item.input.video ? [item.input.video] : []);
    const referenceAudios = audioInputs.flatMap((item) => item.input.audio ? [item.input.audio] : []);
    const connectedPrompt = textSource?.type === "text" ? textSource.text?.trim() : "";
    return {
        prompt: connectedPrompt || prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: connectedPrompt ? 1 : 0,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
        runningHubWorkflowBindings: { image: imageInputs.map((item) => item.binding), video: videoInputs.map((item) => item.binding), audio: audioInputs.map((item) => item.binding) },
        runningHubWorkflowRunOptions: workflowNode?.metadata?.runningHubWorkflowRunOptions,
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationResourceInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        hasToken = true;
        nextPrompt += prompt.slice(lastIndex, match.index);
        const input = inputByNodeId.get(match[1]);
        if (input) {
            const labels = flattenGenerationInputs([input]).map((resource) => {
                let label = labelByNodeId.get(resource.nodeId);
                if (!label) {
                    label = generationLabel(resource.type, counts[resource.type]++);
                    labelByNodeId.set(resource.nodeId, label);
                    if (resource.type === "text") textBlocks.push(`【${label}】\n${resource.text || ""}`);
                    else selectedInputs.push(resource);
                }
                return resource.type === "text" ? `【${label}】` : label;
            });
            nextPrompt += labels.join("、");
        }
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += prompt.slice(lastIndex);
    if (textBlocks.length) nextPrompt = `${nextPrompt.trim()}\n\n${textBlocks.join("\n\n")}`;
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    if (!hasToken) {
        return {
            prompt,
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            textCount: 0,
            imageCount: 0,
            videoCount: 0,
            audioCount: 0,
        };
    }

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return getGenerationResourceNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] => {
        if (node.type === CanvasNodeType.Group) {
            const children = getGroupResourceNodes(node.id, nodes).flatMap(readNodeGenerationResource);
            return children.length ? [{ nodeId: node.id, type: "group", title: node.title, children }] : [];
        }
        return readNodeGenerationResource(node);
    });
}

function flattenGenerationInputs(inputs: NodeGenerationInput[]) {
    const resources = inputs.flatMap((input) => (input.type === "group" ? input.children : [input]));
    return [...new Map(resources.map((input) => [input.nodeId, input])).values()];
}

function readNodeGenerationResource(node: CanvasNodeData): NodeGenerationResourceInput[] {
    const image = readReferenceImage(node);
    if (image) return [{ nodeId: node.id, type: "image", title: node.title, image }];
    const video = readReferenceVideo(node);
    if (video) return [{ nodeId: node.id, type: "video", title: node.title, video }];
    const audio = readReferenceAudio(node);
    if (audio) return [{ nodeId: node.id, type: "audio", title: node.title, audio }];
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if (resource?.kind === "image" && resource.url) return [{ nodeId: node.id, type: "image", title: node.title, image: { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata?.mimeType || "image/png", dataUrl: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "video" && resource.url) return [{ nodeId: node.id, type: "video", title: node.title, video: { id: node.id, name: `${node.title || node.id}.mp4`, type: node.metadata?.mimeType || "video/mp4", url: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "audio" && resource.url) return [{ nodeId: node.id, type: "audio", title: node.title, audio: { id: node.id, name: `${node.title || node.id}.mp3`, type: node.metadata?.mimeType || "audio/mpeg", url: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "text" && resource.text) return [{ nodeId: node.id, type: "text", title: node.title, text: resource.text }];
    const text = readNodeTextInput(node);
    return text ? [{ nodeId: node.id, type: "text", title: node.title, text }] : [];
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function generationLabel(type: NodeGenerationResourceInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return i18n.t("canvas.configNode.videoReferences") + ` ${index + 1}`;
    if (type === "audio") return i18n.t("canvas.configNode.audioReferences") + ` ${index + 1}`;
    return i18n.t("canvas.composer.resources.text", { index: index + 1 });
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}
