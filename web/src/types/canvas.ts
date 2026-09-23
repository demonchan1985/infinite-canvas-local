export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

// Node types are open strings: built-ins use CanvasNodeType and plugins use "<pluginId>:<name>".
export type CanvasNodeTypeId = CanvasNodeType | (string & {});

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";

export type CanvasCreativePresetKind = "style" | "mj" | "motion" | "filter";

export type CanvasCreativePreset = {
    id: string;
    kind: CanvasCreativePresetKind;
    category: string;
    name: string;
    description: string;
    prompt: string;
    prefix?: string;
    preview?: string;
    poster?: string;
};

export type CanvasCreativePresetSelection = Partial<Record<CanvasCreativePresetKind, CanvasCreativePreset>>;

export type CanvasNodeImage = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
    storageKey?: string;
    naturalWidth: number;
    naturalHeight: number;
    bytes: number;
    mimeType: string;
};

export type CanvasNodeText = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
};

export const canvasTextTagColors = ["gray", "blue", "green", "amber", "rose", "violet"] as const;

export type CanvasTextTagColor = (typeof canvasTextTagColors)[number];

export type CanvasTextTag = {
    id: string;
    label: string;
    color: CanvasTextTagColor;
};

export type CanvasStoryboardRow = {
    id: string;
    duration: string;
    shotPrompt: string;
    dialogue: string;
    asset: string;
};

/** RunningHub 工作流 /openapi/v2/run/workflow 的任务层参数，不属于 nodeInfoList。 */
export type RunningHubWorkflowRunOptions = {
    addMetadata?: boolean;
    instanceType?: "default" | "plus" | "ultra";
    usePersonalQueue?: boolean;
    retainSeconds?: number;
    webhookUrl?: string;
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    /** AIFISHER 非商用预设库中的节点级创作选择，随画布项目保存。 */
    creativePresets?: CanvasCreativePresetSelection;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high" | "xhigh";
    size?: string;
    quality?: string;
    imageResolution?: string;
    background?: string;
    count?: number;
    textCount?: number;
    texts?: CanvasNodeText[];
    primaryTextId?: string;
    /** 文本节点的本地分类标签，随画布项目保存。 */
    textTags?: CanvasTextTag[];
    storyboardMode?: boolean;
    storyboardRows?: CanvasStoryboardRow[];
    seconds?: string;
    vquality?: string;
    videoMode?: string;
    generateAudio?: string;
    watermark?: string;
    /** 节点级 RunningHub 工作流参数，键为 nodeId.fieldName。 */
    runningHubWorkflowValues?: Record<string, string | number | boolean>;
    /** 当前画布节点显示的 RunningHub 参数键；未设置时显示工作流的全部参数。 */
    runningHubWorkflowVisibleFieldKeys?: string[];
    /** 是否手动展开 RunningHub 工作流的具名素材端口。 */
    runningHubWorkflowPortsOpen?: boolean;
    /** 当前画布节点启用的 RunningHub 素材槽位；为空数组表示本次不提交任何素材。未设置时按已连接素材自动启用。 */
    runningHubWorkflowEnabledPorts?: string[];
    /** 节点级 RunningHub 任务层选项，会和 nodeInfoList 一起提交。 */
    runningHubWorkflowRunOptions?: RunningHubWorkflowRunOptions;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    imageDisplayScale?: "standard-v2" | "primary-v1";
    freeResize?: boolean;
    images?: CanvasNodeImage[];
    primaryImageId?: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    videoTaskId?: string;
    videoTaskProvider?: "openai";
    groupId?: string;
    interactive?: boolean; // Plugin node interaction/move state; see CanvasNodeDefinition.interactionToggle.
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    /** 目标节点的具名输入端口；RunningHub 工作流用它保存真实素材槽位。 */
    toPort?: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    /** 同一节点内的具名端口。未指定时保留普通节点级连线。 */
    portId?: string;
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
