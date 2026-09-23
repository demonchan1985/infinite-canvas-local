import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { defaultRunningHubAiAppFields, defaultRunningHubWorkflowFields, runningHubWorkflowScript } from "@/lib/runninghub-model";

export type ApiCallFormat = "openai" | "gemini" | "codex-cli" | "runninghub";
export type ModelCapability = "image" | "video" | "text" | "audio";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";
export type RunningHubResourceKind = "standard" | "app" | "workflow";

export type RunningHubNodeBinding = {
    nodeId: string;
    fieldName: string;
};

export type RunningHubWorkflowFieldValue = string | number | boolean;

export type RunningHubWorkflowField = RunningHubNodeBinding & {
    /** 在画布中显示的字段标题；值会原样写入 RunningHub nodeInfoList。 */
    key: string;
    label: string;
    type: "text" | "number" | "select" | "boolean";
    defaultValue: RunningHubWorkflowFieldValue;
    options?: Array<string | number>;
    /** 选项提交值对应的 RunningHub 公开显示名称，例如 6 -> 8k像素。 */
    optionLabels?: Record<string, string>;
    min?: number;
    max?: number;
    step?: number;
};

export type RunningHubWorkflowPreview = {
    imageSlots: number;
    videoSlots: number;
    audioSlots: number;
    /** 二采为工作流节点字段时才可由 API 覆盖；网页分组开关不属于 nodeInfoList。 */
    secondPassFieldKey?: string;
};

export type RunningHubResource = {
    kind: RunningHubResourceKind;
    /** RunningHub 标准模型路径，或 AI 应用 / 工作流 ID。 */
    target: string;
    /** RunningHub 项目公开标题；工作流节点库优先显示该标题。 */
    title?: string;
    /** 任务提交后用于将画布输入写入 nodeInfoList 的字段。 */
    promptBinding?: RunningHubNodeBinding;
    imageBinding?: RunningHubNodeBinding;
    /** AI 应用 / 工作流可按连接顺序接收多张参考图。 */
    imageBindings?: RunningHubNodeBinding[];
    videoBindings?: RunningHubNodeBinding[];
    audioBindings?: RunningHubNodeBinding[];
    /** 从已发布工作流读取的可覆盖字段。 */
    workflowFields?: RunningHubWorkflowField[];
    workflowPreview?: RunningHubWorkflowPreview;
    accessPassword?: string;
};

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    script?: string;
    runningHub?: RunningHubResource;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    /** RunningHub AI 应用 / 工作流使用的消费级 Key。 */
    consumerApiKey?: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: ChannelModel[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoMode: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    /** 仅用于节点级 RunningHub 工作流字段，不写入全局渠道配置。 */
    runningHubWorkflowValues?: Record<string, RunningHubWorkflowFieldValue>;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    models: string[];
    quality: string;
    imageResolution: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
    canvasImageCountCustomized: boolean;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "preferences" | "prompt-sources" | "webdav" | "local-storage";

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const RUNNINGHUB_BASE_URL = "https://www.runninghub.cn";
const RUNNINGHUB_LLM_BASE_URL = "https://llm.runninghub.cn";
export const CODEX_IMAGE_CHANNEL_ID = "codex-image";
export const CODEX_IMAGE_MODEL = "gpt-image-2";
export const GPT_IMAGE_25_MODELS = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"] as const;
export const DEFAULT_OPENAI_IMAGE_MODEL = GPT_IMAGE_25_MODELS[0];
export const CODEX_IMAGE_MODELS = [DEFAULT_OPENAI_IMAGE_MODEL, GPT_IMAGE_25_MODELS[1], CODEX_IMAGE_MODEL] as const;
export const CODEX_TEXT_CHANNEL_ID = "codex-text";
export const CODEX_TEXT_MODEL = "gpt-5.5";

function defaultGptImageModels(): ChannelModel[] {
    return CODEX_IMAGE_MODELS.map((name) => ({ name, capability: "image" as const }));
}

function mergeDefaultGptImageModels(models: Array<string | ChannelModel> | undefined) {
    const existing = normalizeChannelModels(models);
    const defaults = defaultGptImageModels();
    const defaultNames = new Set(defaults.map((item) => item.name));
    return [
        ...defaults.map((item) => ({ ...(existing.find((saved) => saved.name === item.name) || item), name: item.name, capability: "image" as const })),
        ...existing.filter((item) => !defaultNames.has(item.name)),
    ];
}

function runningHubChannel(): ModelChannel {
    return {
        id: "runninghub",
        name: "RunningHub",
        baseUrl: RUNNINGHUB_BASE_URL,
        apiKey: "",
        consumerApiKey: "",
        apiFormat: "runninghub",
        models: [],
    };
}

function codexTextChannel(): ModelChannel {
    return {
        id: CODEX_TEXT_CHANNEL_ID,
        name: "本机 Codex CLI",
        // 此地址仅作为模型通道标识；请求会发往当前 3102 本地服务并由 Codex CLI 执行。
        baseUrl: "http://127.0.0.1:3102",
        apiKey: "",
        apiFormat: "codex-cli",
        models: [{ name: CODEX_TEXT_MODEL, capability: "text" }],
    };
}

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: i18n.t("config.channels.defaultName"),
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: [
                ...defaultGptImageModels(),
                { name: "grok-imagine-video", capability: "video" },
                { name: "gpt-5.5", capability: "text" },
                { name: "gpt-4o-mini-tts", capability: "audio" },
            ],
        },
        codexTextChannel(),
        runningHubChannel(),
    ],
    model: "default::gpt-image-2.5-sunburst",
    imageModel: "default::gpt-image-2.5-sunburst",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoMode: "frames",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    reasoningEffort: "auto",
    models: ["default::gpt-image-2.5-sunburst", "default::gpt-image-2.5-flare", "default::gpt-image-2", "default::grok-imagine-video", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    quality: "auto",
    imageResolution: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "1",
    canvasImageCountCustomized: false,
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["video", "sora", "veo", "kling", "wan", "hailuo"];

export function boolConfig(value: string, fallback: boolean) {
    return value ? value === "true" : fallback;
}
const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound"];
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

export function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return findChannelModel(config, value)?.model.capability;
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilityOf(config, value) === capability;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const defaultModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : capability === "audio" ? config.audioModel : config.textModel;
    const fallbackModel = capability === "image" ? defaultConfig.imageModel : capability === "video" ? defaultConfig.videoModel : capability === "audio" ? defaultConfig.audioModel : defaultConfig.textModel;
    if (currentModel && modelMatchesCapability(config, currentModel, capability)) return currentModel;
    if (defaultModel && modelMatchesCapability(config, defaultModel, capability)) return defaultModel;
    return fallbackModel;
}

function isRunningHubApplicationOrWorkflow(model: ChannelModel) {
    return model.runningHub?.kind === "app" || model.runningHub?.kind === "workflow";
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models
        .filter((model) => model.capability === capability && !(capability === "image" && isRunningHubApplicationOrWorkflow(model)))
        .map((model) => encodeChannelModel(channel.id, model.name)));
}

/** The user script (if any) attached to a model; empty string means use the system default call. */
export function resolveModelScript(config: AiConfig, value: string) {
    const model = findChannelModel(config, value)?.model;
    if (model?.runningHub?.kind === "workflow" || model?.runningHub?.kind === "app") return runningHubWorkflowScript(model.runningHub);
    return model?.script?.trim() || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    if (channel.id === CODEX_IMAGE_CHANNEL_ID || channel.id === CODEX_TEXT_CHANNEL_ID) return Boolean(model.trim());
    const resource = findChannelModel(config, model)?.model.runningHub;
    if (channel.apiFormat === "runninghub" && (resource?.kind === "app" || resource?.kind === "workflow")) return Boolean(model.trim() && channel.consumerApiKey?.trim());
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                        ...(key === "canvasImageCount" ? { canvasImageCountCustomized: true } : {}),
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                const migratedCanvasImageCount = persistedConfig.canvasImageCount === "3" && !persistedConfig.canvasImageCountCustomized ? "1" : config.canvasImageCount;
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
                        videoModel: normalizeModelOptionValue(config.videoModel, channels),
                        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        reasoningEffort: config.reasoningEffort || "auto",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoMode: config.videoMode === "reference" ? "reference" : "frames",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: migratedCanvasImageCount || "1",
                        canvasImageCountCustomized: Boolean(persistedConfig.canvasImageCountCustomized),
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const capability = typeof item === "string" ? guessCapability(name) : item.capability || guessCapability(name);
        const runningHub = typeof item === "string" ? undefined : normalizeRunningHubResource(item.runningHub);
        const script =
            runningHub?.kind === "workflow" || runningHub?.kind === "app"
                ? runningHubWorkflowScript(runningHub)
                : typeof item === "string"
                  ? undefined
                  : item.script?.trim() || undefined;
        result.push({ name, capability, script, runningHub });
    }
    return result;
}

function normalizeRunningHubBinding(binding: RunningHubNodeBinding | undefined) {
    const nodeId = binding?.nodeId?.trim() || "";
    const fieldName = binding?.fieldName?.trim() || "";
    return nodeId && fieldName ? { nodeId, fieldName } : undefined;
}

function normalizeRunningHubResource(resource: RunningHubResource | undefined): RunningHubResource | undefined {
    if (!resource || !["standard", "app", "workflow"].includes(resource.kind)) return undefined;
    const target = resource.target?.trim() || "";
    if (!target) return undefined;
    const imageBindings = (resource.imageBindings || []).map(normalizeRunningHubBinding).filter((binding): binding is RunningHubNodeBinding => Boolean(binding));
    const videoBindings = (resource.videoBindings || []).map(normalizeRunningHubBinding).filter((binding): binding is RunningHubNodeBinding => Boolean(binding));
    const audioBindings = (resource.audioBindings || []).map(normalizeRunningHubBinding).filter((binding): binding is RunningHubNodeBinding => Boolean(binding));
    // 迁移此前已导入的 H3 工作流：旧版本按节点编号排序，必须恢复工作流 ref_image_0..5 的顺序。
    const legacyH3Order = target === "2092878871120142337" ? ["51", "49", "50", "43", "19", "23"] : [];
    const orderedImageBindings = legacyH3Order.length
        ? [...legacyH3Order.flatMap((nodeId) => imageBindings.filter((binding) => binding.nodeId === nodeId)), ...imageBindings.filter((binding) => !legacyH3Order.includes(binding.nodeId))]
        : imageBindings;
    const workflowFields: RunningHubWorkflowField[] = (resource.workflowFields || []).flatMap((field) => {
            const binding = normalizeRunningHubBinding(field);
            const key = field?.key?.trim() || (binding ? `${binding.nodeId}.${binding.fieldName}` : "");
            const label = field?.label?.trim() || field?.fieldName?.trim() || "";
            if (!binding || !key || !label || !["text", "number", "select", "boolean"].includes(field.type)) return [];
            const defaultValue = typeof field.defaultValue === "number" || typeof field.defaultValue === "boolean" ? field.defaultValue : String(field.defaultValue ?? "");
            const optionLabels = Object.fromEntries(Object.entries(field.optionLabels || {}).flatMap(([value, optionLabel]) => typeof optionLabel === "string" && optionLabel.trim() ? [[value, optionLabel.trim()]] : []));
            return [{ ...binding, key, label, type: field.type, defaultValue, options: (field.options || []).filter((option) => option !== "" && option !== null && option !== undefined), ...(Object.keys(optionLabels).length ? { optionLabels } : {}), min: typeof field.min === "number" ? field.min : undefined, max: typeof field.max === "number" ? field.max : undefined, step: typeof field.step === "number" ? field.step : undefined }];
        });
    const defaultWorkflowFields = [...defaultRunningHubWorkflowFields(target), ...(resource.kind === "app" ? defaultRunningHubAiAppFields(target) : [])];
    const mergedWorkflowFields = [
        ...workflowFields.map((field) => {
            const fallback = defaultWorkflowFields.find((candidate) => candidate.key === field.key);
            if (!fallback) return field;
            const optionLabels = { ...(fallback.optionLabels || {}), ...(field.optionLabels || {}) };
            return {
                ...fallback,
                ...field,
                options: field.options?.length ? field.options : fallback.options,
                ...(Object.keys(optionLabels).length ? { optionLabels } : {}),
            };
        }),
        ...defaultWorkflowFields.filter((fallback) => !workflowFields.some((field) => field.key === fallback.key)),
    ];
    const preview = resource.workflowPreview;
    const workflowPreview = preview
        ? {
              imageSlots: Math.max(0, Number(preview.imageSlots) || 0),
              videoSlots: Math.max(0, Number(preview.videoSlots) || 0),
              audioSlots: Math.max(0, Number(preview.audioSlots) || 0),
              secondPassFieldKey: preview.secondPassFieldKey?.trim() || undefined,
          }
        : { imageSlots: orderedImageBindings.length, videoSlots: videoBindings.length, audioSlots: audioBindings.length };
    return {
        kind: resource.kind,
        target,
        title: resource.title?.trim() || undefined,
        promptBinding: normalizeRunningHubBinding(resource.promptBinding),
        imageBinding: normalizeRunningHubBinding(resource.imageBinding),
        imageBindings: orderedImageBindings,
        videoBindings,
        audioBindings,
        workflowFields: mergedWorkflowFields,
        workflowPreview,
        accessPassword: resource.accessPassword?.trim() || undefined,
    };
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        consumerApiKey: channel?.consumerApiKey || "",
        apiFormat,
        models: normalizeChannelModels(channel?.models),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function isGptImage25Model(value: string) {
    const model = (decodeChannelModel(value)?.model || value).trim().toLowerCase();
    return (GPT_IMAGE_25_MODELS as readonly string[]).includes(model);
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    return (
        matched ||
        config.channels[0] ||
        createModelChannel({
            id: "default",
            name: i18n.t("config.channels.defaultName"),
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            apiFormat: config.apiFormat,
            models: config.models.map(modelOptionName).map((name) => ({ name, capability: guessCapability(name) })),
        })
    );
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    const model = modelOptionName(value || config.model);
    const selectedModel = channel.models.find((item) => item.name === model);
    const usesRunningHubConsumerKey = channel.apiFormat === "runninghub" && (selectedModel?.runningHub?.kind === "app" || selectedModel?.runningHub?.kind === "workflow");
    return {
        ...config,
        model,
        // RunningHub 的标准模型请求官网任务 API；只有文本 LLM 使用兼容接口。
        baseUrl: channel.apiFormat === "runninghub" && selectedModel?.capability === "text" ? RUNNINGHUB_LLM_BASE_URL : channel.baseUrl,
        apiKey: usesRunningHubConsumerKey ? channel.consumerApiKey || "" : channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) => {
        const channelId = channel.id || (index === 0 ? "default" : `channel-${index + 1}`);
        const legacyRunningHubLlmBase = channel.apiFormat === "runninghub" && channel.baseUrl?.trim().replace(/\/+$/, "") === RUNNINGHUB_LLM_BASE_URL;
        return createModelChannel({
            ...channel,
            ...(channel.id === CODEX_TEXT_CHANNEL_ID ? { apiFormat: "codex-cli" as const, apiKey: "" } : {}),
            ...(legacyRunningHubLlmBase ? { baseUrl: RUNNINGHUB_BASE_URL } : {}),
            id: channelId,
            name: channel.name || (index === 0 ? i18n.t("config.channels.defaultName") : i18n.t("config.channels.indexedName", { index: index + 1 })),
            models: channelId === CODEX_IMAGE_CHANNEL_ID || normalizeApiFormat(channel.apiFormat) === "codex-cli" || (channelId === "default" && normalizeApiFormat(channel.apiFormat) === "openai") ? mergeDefaultGptImageModels(channel.models) : normalizeChannelModels(channel.models),
        });
    });
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: i18n.t("config.channels.defaultName"),
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models:
                    normalizeApiFormat(config.apiFormat) === "openai"
                        ? mergeDefaultGptImageModels([config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel].map(modelOptionName))
                        : normalizeChannelModels([config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel].map(modelOptionName)),
            }),
        );
    }
    if (!channels.some((channel) => channel.id === CODEX_TEXT_CHANNEL_ID)) channels.push(codexTextChannel());
    if (!channels.some((channel) => channel.id === "runninghub")) channels.push(runningHubChannel());
    return channels;
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    if (apiFormat === "codex-cli") return "http://127.0.0.1:3102";
    if (apiFormat === "runninghub") return RUNNINGHUB_BASE_URL;
    return OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" || apiFormat === "codex-cli" || apiFormat === "runninghub" ? apiFormat : "openai";
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}
