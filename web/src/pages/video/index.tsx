import { ArrowLeft, ArrowRight, CheckSquare, ClipboardPaste, Download, Eraser, FolderPlus, History, ImagePlus, Layers3, LoaderCircle, PanelRightClose, PanelRightOpen, Plus, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Upload, VideoIcon, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { App, Button, Checkbox, Drawer, Empty, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { RUNNING_HUB_WORKFLOW_INSTANCE_TYPES, runningHubWorkflowInstanceLabel, type RunningHubWorkflowInstanceType } from "@/components/canvas/runninghub-workflow-settings";
import { ModelPicker } from "@/components/model-picker";
import { VideoSettingsPanel, normalizeVideoResolutionValue, normalizeVideoSizeValue, videoSizeLabel } from "@/components/video-settings-panel";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { generationDurationMs } from "@/lib/video-generation-timing";
import { createPromptMentions, getPromptMentionTrigger, replacePromptMentions, type PromptMention, type PromptMentionTrigger } from "@/lib/video-prompt-mentions";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { deleteStoredMedia, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { boolConfig, encodeChannelModel, findChannelModel, modelOptionLabel, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { requestImageQuestion } from "@/services/api/image";
import { buildH3OptimizationRequest, cleanH3PromptOutput, getH3PromptMode, isValidH3Prompt } from "@/lib/h3-prompt-optimization";
import i18n from "@/i18n";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    startedAt?: number;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    frameSlots?: FrameSlots;
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
    instanceType?: RunningHubWorkflowInstanceType;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoMode">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
type FrameSlots = { first?: ReferenceImage; last?: ReferenceImage };
type FrameTarget = keyof FrameSlots;

const LOG_STORE_KEY = "infinite-canvas:video_generation_logs";
const LOG_PANEL_COLLAPSED_KEY = "infinite-canvas:video_log_panel_collapsed";
const H3_INSTANCE_TYPE_KEY = "infinite-canvas:video_h3_instance_type";
const H3_PROMPT_MESSAGE_STYLE = { marginTop: 72 };
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
// 复用配置中心已导入的 MiniMax H3 工作流；不在前端伪造 RH 的应用字段。
const MINIMAX_H3_WORKFLOW_TARGET = "2092878871120142337";
const MINIMAX_H3_INTEGRATED_WORKFLOW_TARGET = "2086579374731649025";
const MINIMAX_H3_WORKFLOW_TARGETS = new Set([MINIMAX_H3_WORKFLOW_TARGET, MINIMAX_H3_INTEGRATED_WORKFLOW_TARGET]);

export default function VideoPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const frameFileInputRef = useRef<HTMLInputElement>(null);
    const frameTargetRef = useRef<FrameTarget>("first");
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [promptBeforeOptimize, setPromptBeforeOptimize] = useState("");
    const [optimizingPrompt, setOptimizingPrompt] = useState(false);
    const [promptMentionTrigger, setPromptMentionTrigger] = useState<PromptMentionTrigger | null>(null);
    const [promptMentionIndex, setPromptMentionIndex] = useState(0);
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [frameSlots, setFrameSlots] = useState<FrameSlots>({});
    const [referenceVideos, setReferenceVideos] = useState<ReferenceVideo[]>([]);
    const [referenceAudios, setReferenceAudios] = useState<ReferenceAudio[]>([]);
    const [quantity, setQuantity] = useState("1");
    const [h3InstanceType, setH3InstanceType] = useState<RunningHubWorkflowInstanceType>(() => {
        const stored = typeof window === "undefined" ? null : window.localStorage.getItem(H3_INSTANCE_TYPE_KEY);
        return RUNNING_HUB_WORKFLOW_INSTANCE_TYPES.find((value) => value === stored) || "default";
    });
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [logsCollapsed, setLogsCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(LOG_PANEL_COLLAPSED_KEY) === "true");
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isReferenceMode = effectiveConfig.videoMode === "reference";

    const configuredModel = effectiveConfig.videoModel || effectiveConfig.model;
    const miniMaxH3Model = effectiveConfig.channels
        .flatMap((channel) => channel.models.map((item) => encodeChannelModel(channel.id, item.name)))
        .find((value) => MINIMAX_H3_WORKFLOW_TARGETS.has(findChannelModel(effectiveConfig, value)?.model.runningHub?.target || ""));
    const [modelOverride, setModelOverride] = useState("");
    const model = modelOverride || miniMaxH3Model || configuredModel;
    const isMiniMaxH3 = MINIMAX_H3_WORKFLOW_TARGETS.has(findChannelModel(effectiveConfig, model)?.model.runningHub?.target || "");
    const canGenerate = Boolean(prompt.trim());
    const frameReferences = [frameSlots.first, frameSlots.last].filter((item): item is ReferenceImage => Boolean(item));
    const promptMentions = createPromptMentions({
        isReferenceMode,
        images: references.map((item) => ({ id: item.id, name: item.name, previewUrl: item.dataUrl })),
        videos: referenceVideos,
        audios: referenceAudios,
        hasFirstFrame: Boolean(frameSlots.first),
        hasLastFrame: Boolean(frameSlots.last),
    });
    const promptMentionMatches = promptMentionTrigger
        ? promptMentions.filter((item) => {
            const query = promptMentionTrigger.query.toLocaleLowerCase();
            return !query || [item.token, item.label, item.detail].some((value) => value.toLocaleLowerCase().includes(query));
        })
        : [];

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    useEffect(() => {
        window.localStorage.setItem(LOG_PANEL_COLLAPSED_KEY, String(logsCollapsed));
    }, [logsCollapsed]);

    useEffect(() => {
        window.localStorage.setItem(H3_INSTANCE_TYPE_KEY, h3InstanceType);
    }, [h3InstanceType]);

    const addReferences = async (files?: FileList | File[] | null) => {
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/"));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, (isReferenceMode ? 9 : 2) - references.length);
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, isReferenceMode ? 9 : 2));
    };

    const addFrameFiles = async (files?: FileList | File[] | Blob[] | null, target: FrameTarget = frameSlots.first ? "last" : "first") => {
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/"));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, target === "first" && !frameSlots.last ? 2 : 1);
        if (!imageFiles.length) return;
        const nextFrames = await Promise.all(imageFiles.map(async (file, index) => {
            const image = await uploadImage(file);
            const fileName = "name" in file && typeof file.name === "string" && file.name ? file.name : `frame-${index + 1}.png`;
            return { id: nanoid(), name: fileName, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
        }));
        setFrameSlots((current) => {
            const next = { ...current };
            let cursor: FrameTarget = target;
            for (const frame of nextFrames) {
                if (cursor === "first") {
                    next.first = frame;
                    cursor = "last";
                } else {
                    next.last = frame;
                    cursor = "first";
                }
            }
            return next;
        });
    };

    const addReferenceMedia = async (files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/") && file.size <= 30 * 1024 * 1024);
        const videoFiles = selectedFiles.filter((file) => /^(video\/mp4|video\/quicktime)$/i.test(file.type) && file.size <= 200 * 1024 * 1024);
        const audioFiles = selectedFiles.filter((file) => /^(audio\/mpeg|audio\/wav|audio\/x-wav)$/i.test(file.type) && file.size <= 15 * 1024 * 1024);
        if (selectedFiles.some((file) => file.type.startsWith("image/") && file.size > 30 * 1024 * 1024)) message.warning(t("videoWorkbench.imageTooLarge"));
        if (selectedFiles.some((file) => file.type.startsWith("video/") && file.size > 200 * 1024 * 1024)) message.warning(t("videoWorkbench.videoTooLarge"));
        if (selectedFiles.some((file) => file.type.startsWith("audio/") && file.size > 15 * 1024 * 1024)) message.warning(t("videoWorkbench.audioTooLarge"));
        if (imageFiles.length) await addReferences(imageFiles);
        const upload = async (file: File, prefix: string) => {
            const stored = await uploadMediaFile(file, prefix);
            return { id: nanoid(), name: file.name, type: stored.mimeType, url: stored.url, storageKey: stored.storageKey, bytes: stored.bytes, width: stored.width, height: stored.height, durationMs: stored.durationMs };
        };
        const nextVideos = await Promise.all(videoFiles.slice(0, 3 - referenceVideos.length).map((file) => upload(file, "video-reference")));
        const nextAudios = await Promise.all(audioFiles.slice(0, 3 - referenceAudios.length).map((file) => upload(file, "audio-reference")));
        setReferenceVideos((value) => [...value, ...nextVideos].slice(0, 3));
        setReferenceAudios((value) => [...value, ...nextAudios].slice(0, 3));
        if (selectedFiles.length && !imageFiles.length && !videoFiles.length && !audioFiles.length) message.warning(t("videoWorkbench.unsupportedFiles"));
    };

    const optimizePrompt = async () => {
        if (optimizingPrompt) return;
        if (!prompt.trim()) {
            message.warning(t("videoWorkbench.promptRequired"));
            return;
        }
        const textModel = resolveModelForCapability(effectiveConfig, effectiveConfig.textModel, "text");
        const textConfig = { ...effectiveConfig, model: textModel };
        if (!isAiConfigReady(textConfig, textConfig.model)) {
            message.warning("请先在配置中选择可用的文本模型，再优化提示词");
            openConfigDialog(true);
            return;
        }
        const originalPrompt = prompt;
        const promptMode = getH3PromptMode({ isReferenceMode, hasFirstFrame: Boolean(frameSlots.first), hasLastFrame: Boolean(frameSlots.last) });
        const messageKey = "h3-prompt-optimization";
        setPromptBeforeOptimize(originalPrompt);
        setOptimizingPrompt(true);
        message.loading({ content: `正在按 MiniMax H3 ${promptMode} 结构优化提示词…`, key: messageKey, duration: 0, style: H3_PROMPT_MESSAGE_STYLE });
        try {
            const duration = normalizeVideoSeconds(effectiveConfig.videoSeconds);
            const optimized = await requestImageQuestion(
                textConfig,
                [{ role: "user", content: buildH3OptimizationRequest({ prompt: replacePromptMentions(prompt, promptMentions), mode: promptMode, duration, referenceCount: isReferenceMode ? references.length : frameReferences.length, referenceVideoCount: referenceVideos.length, referenceAudioCount: referenceAudios.length }) }],
                (partial) => {
                    const nextPrompt = cleanH3PromptOutput(partial);
                    if (nextPrompt) setPrompt(nextPrompt);
                },
            );
            const cleaned = cleanH3PromptOutput(optimized);
            if (!isValidH3Prompt(cleaned, promptMode)) {
                setPrompt(originalPrompt);
                message.error({ content: "优化结果未符合 MiniMax H3 结构，已保留原提示词", key: messageKey, duration: 4, style: H3_PROMPT_MESSAGE_STYLE });
                return;
            }
            setPrompt(cleaned);
            message.success({ content: `已按 MiniMax H3 ${promptMode} 结构优化提示词`, key: messageKey, duration: 3, style: H3_PROMPT_MESSAGE_STYLE });
        } catch (error) {
            setPrompt(originalPrompt);
            message.error({ content: error instanceof Error ? error.message : t("workbench.generationFailed"), key: messageKey, duration: 4, style: H3_PROMPT_MESSAGE_STYLE });
        } finally {
            setOptimizingPrompt(false);
        }
    };

    const clearPrompt = () => {
        if (prompt.trim()) setPromptBeforeOptimize(prompt);
        setPrompt("");
        setPromptMentionTrigger(null);
    };

    const updatePromptMentionTrigger = (value: string, caret: number) => {
        const trigger = getPromptMentionTrigger(value, caret);
        setPromptMentionTrigger(trigger);
        if (!trigger) return;
        setPromptMentionIndex(0);
    };

    const handlePromptChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        const value = event.target.value;
        setPrompt(value);
        updatePromptMentionTrigger(value, event.target.selectionStart ?? value.length);
    };

    const insertPromptMention = (mention: PromptMention) => {
        if (!promptMentionTrigger) return;
        const before = prompt.slice(0, promptMentionTrigger.start);
        const after = prompt.slice(promptMentionTrigger.end);
        const spacer = after && /^[\s,，.。!?！？;；:：)]/.test(after) ? "" : " ";
        const nextPrompt = `${before}${mention.token}${spacer}${after}`;
        const caret = before.length + mention.token.length + spacer.length;
        setPrompt(nextPrompt);
        setPromptMentionTrigger(null);
        setPromptMentionIndex(0);
        window.requestAnimationFrame(() => {
            const element = document.getElementById("video-prompt-textarea") as HTMLTextAreaElement | null;
            element?.focus();
            element?.setSelectionRange(caret, caret);
        });
    };

    const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!promptMentionTrigger) return;
        if (event.key === "Escape") {
            event.preventDefault();
            setPromptMentionTrigger(null);
            return;
        }
        if (!promptMentionMatches.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const offset = event.key === "ArrowDown" ? 1 : -1;
            setPromptMentionIndex((index) => (index + offset + promptMentionMatches.length) % promptMentionMatches.length);
            return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const mention = promptMentionMatches[Math.min(promptMentionIndex, promptMentionMatches.length - 1)];
            if (mention) insertPromptMention(mention);
        }
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(true);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(false);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(false);
        void (isReferenceMode ? addReferenceMedia(event.dataTransfer.files) : addFrameFiles(event.dataTransfer.files));
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("videoWorkbench.clipboardEmpty"));
                return;
            }
            if (!isReferenceMode) {
                await addFrameFiles(blobs);
                message.success(t("videoWorkbench.clipboardAdded", { count: Math.min(blobs.length, frameReferences.length ? 1 : 2) }));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, 9 - references.length).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, 9));
            message.success(t("videoWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("videoWorkbench.clipboardEmpty"));
        }
    };
    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        const batchStartedAt = performance.now();
        const batchSubmittedAt = Date.now();
        setResults([]);
        setStartedAt(batchStartedAt);
        try {
            const pendingLogs: GenerationLog[] = [];
            for (let index = 0; index < snapshot.quantity; index += 1) {
                const submittedAt = Date.now();
                const pendingResult = { id: nanoid(), status: "pending" as const, startedAt: performance.now() };
                setResults((items) => [...items, pendingResult]);
                const task = await createVideoGenerationTask(snapshot.config, snapshot.text, snapshot.references, { referenceVideos: snapshot.referenceVideos, referenceAudios: snapshot.referenceAudios, videoFrameSlots: isReferenceMode ? undefined : { first: Boolean(frameSlots.first), last: Boolean(frameSlots.last) }, runningHubWorkflowRunOptions: snapshot.runningHubWorkflowRunOptions });
                const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, frameSlots: isReferenceMode ? undefined : frameSlots, referenceVideos: snapshot.referenceVideos, referenceAudios: snapshot.referenceAudios, durationMs: 0, status: "pending", task, createdAt: submittedAt, instanceType: snapshot.instanceType });
                pendingLogs.push(log);
                await saveLog(log, false);
                setResults((items) => items.map((item) => item.id === pendingResult.id ? { ...item, id: log.id } : item));
            }
            pendingLogs.forEach((log, index) => void pollGenerationLog(log, snapshot.config, index === 0 ? agentTaskId : undefined));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults((items) => items.map((item) => item.status === "pending" ? { ...item, status: "failed", error: errorMessage } : item));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog(buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, frameSlots: isReferenceMode ? undefined : frameSlots, referenceVideos: snapshot.referenceVideos, referenceAudios: snapshot.referenceAudios, durationMs: generationDurationMs(batchSubmittedAt), status: "failed", error: errorMessage, createdAt: batchSubmittedAt, instanceType: snapshot.instanceType }));
            message.error(errorMessage);
            setRunning(false);
        }
    };

    // Handle video-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: t("videoWorkbench.busy") });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = replacePromptMentions(prompt, promptMentions).trim();
        if (!text) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: isReferenceMode ? [...references] : frameReferences, referenceVideos: [...referenceVideos], referenceAudios: [...referenceAudios], instanceType: isMiniMaxH3 ? h3InstanceType : undefined, runningHubWorkflowRunOptions: isMiniMaxH3 ? { instanceType: h3InstanceType } : undefined, quantity: Number(quantity) || 1 };
    };

    const retryResult = () => {
        void generate();
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (video: GeneratedVideo) => {
        addAsset({
            kind: "video",
            title: t("videoWorkbench.resultTitle"),
            coverUrl: "",
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            const item = { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey };
            if (isReferenceMode) setReferences((value) => [...value, item].slice(0, 9));
            else setFrameSlots((value) => value.first ? { ...value, last: item } : { ...value, first: item });
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setPromptBeforeOptimize("");
        setReferences([]);
        setFrameSlots({});
        setReferenceVideos([]);
        setReferenceAudios([]);
        setQuantity("1");
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const mediaKeys = logs
            .filter((log) => selectedLogIds.includes(log.id))
            .map((log) => log.video?.storageKey)
            .filter((key): key is string => Boolean(key));
        void Promise.all([deleteStoredMedia(mediaKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(() => refreshLogs());
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        await logStore.setItem(log.id, serializeLog(log));
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true) => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        if (resumePending) resumePendingLogs(nextLogs);
        return nextLogs;
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if (log.status === "pending" && log.task) void pollGenerationLog(log);
        }
    };

    const pollGenerationLog = async (log: GenerationLog, configOverride?: AiConfig, agentTaskId?: string) => {
        if (!log.task || activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        setRunning(true);
        const elapsedFromSubmission = generationDurationMs(log.createdAt);
        setElapsedMs((value) => Math.max(value, elapsedFromSubmission));
        setStartedAt((value) => value || performance.now() - elapsedFromSubmission);
        setResults((value) => (value.length ? value : [{ id: log.id, status: "pending", startedAt: performance.now() - elapsedFromSubmission }]));
        const taskConfig = buildVideoConfig({ ...effectiveConfig, ...log.config }, log.task.model || log.model);
        try {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const state = await pollVideoGenerationTask(configOverride || taskConfig, log.task);
                if (state.status === "completed") {
                    const stored = await storeGeneratedVideo(state.result);
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: stored.durationMs || Number(log.seconds) * 1000 || 0,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults((items) => {
                        const next = items.map((item) => item.id === log.id ? { id: nextVideo.id, status: "success" as const, video: nextVideo } : item);
                        return next.some((item) => item.id === nextVideo.id) ? next : [...next, { id: nextVideo.id, status: "success" as const, video: nextVideo }];
                    });
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog({ ...log, status: "success", durationMs: generationDurationMs(log.createdAt), video: nextVideo, error: undefined });
                    message.success(t("videoWorkbench.generated"));
                    return;
                }
                if (state.status === "failed") throw new Error(state.error);
                if (attempt === 119) throw new Error(t("videoWorkbench.timeout"));
                await delay(2500);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults((items) => {
                const next = items.map((item) => item.id === log.id ? { id: log.id, status: "failed" as const, error: errorMessage } : item);
                return next.some((item) => item.id === log.id) ? next : [...next, { id: log.id, status: "failed" as const, error: errorMessage }];
            });
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog({ ...log, status: "failed", durationMs: generationDurationMs(log.createdAt), error: errorMessage });
            message.error(errorMessage);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            if (!activeLogIdsRef.current.size) {
                setRunning(false);
                setStartedAt(0);
            }
        }
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        if (log.config.videoMode === "reference") {
            setReferences(log.references || []);
            setFrameSlots({});
        } else {
            setReferences([]);
            setFrameSlots(log.frameSlots || { first: log.references?.[0], last: log.references?.[1] });
        }
        setReferenceVideos(log.referenceVideos || []);
        setReferenceAudios(log.referenceAudios || []);
        updateConfig("videoMode", log.config.videoMode || "frames");
        setModelOverride(log.config.videoModel || log.model || "");
        if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        setResults(log.status === "pending" ? [{ id: log.id, status: "pending" }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed") }]);
    };

    return (
        <div className="video-workbench-shell flex h-full flex-col overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <main className={`relative grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden ${logsCollapsed ? "" : "lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]"}`}>
                {logsCollapsed ? <button type="button" className="absolute right-3 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border shadow-sm lg:flex" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }} onClick={() => setLogsCollapsed(false)} aria-label={t("workbench.showLogs")} title={t("workbench.showLogs")}>
                    <PanelRightOpen className="size-4" />
                </button> : null}
                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[440px_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-2xl border p-4 shadow-sm lg:min-h-0 lg:overflow-y-auto" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}><VideoIcon className="size-4" /></span>
                                    <h1 className="truncate text-xl font-semibold">{isMiniMaxH3 ? "MiniMax H3 视频创作" : t("videoWorkbench.title")}</h1>
                                </div>
                                {isMiniMaxH3 ? <span className="mt-1 block pl-10 text-xs font-medium tracking-[0.18em]" style={{ color: theme.node.muted }}>RUNNINGHUB · MINIMAX H3</span> : null}
                            </div>
                            <div className="flex shrink-0 gap-2 lg:hidden">
                                <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                    {t("workbench.logs")}
                                </Button>
                                <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    {t("workbench.settings")}
                                </Button>
                            </div>
                        </div>

                        <div className="mt-5 space-y-4">
                            <VideoModeToggle value={effectiveConfig.videoMode} onChange={(value) => updateConfig("videoMode", value)} theme={theme} />
                            <div className="min-w-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{isReferenceMode ? "参考素材" : "首尾帧 / 文生视频"}</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()}>
                                            {t("workbench.clipboard")}
                                        </Button>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => {
                                            if (isReferenceMode) fileInputRef.current?.click();
                                            else {
                                                frameTargetRef.current = frameSlots.first ? "last" : "first";
                                                frameFileInputRef.current?.click();
                                            }
                                        }}>
                                            {t("workbench.upload")}
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    className={`hover-scrollbar hover-scrollbar-hint min-h-24 w-full min-w-0 max-w-full gap-2 overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${isReferenceMode ? "flex overflow-x-scroll" : "grid grid-cols-2"}`}
                                    style={{ borderColor: referenceDragTarget ? theme.node.text : theme.node.stroke, background: referenceDragTarget ? theme.node.fill : "transparent" }}
                                    onDragEnter={handleReferenceDragEnter}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDragLeave={handleReferenceDragLeave}
                                    onDrop={handleReferenceDrop}
                                >
                                    {isReferenceMode ? references.map((item, index) => (
                                        <div key={item.id} className="group relative size-20 shrink-0 overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke }}>
                                            <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                                            <span className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: theme.node.text, color: theme.node.panel }}>{isReferenceMode ? index + 1 : index === 0 ? "首帧" : "尾帧"}</span>
                                            <ReferenceOrderButtons index={index} total={references.length} theme={theme} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                            <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded group-hover:flex" style={{ background: theme.node.text, color: theme.node.panel }} onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))} aria-label={t("videoWorkbench.removeImage")}>
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    )) : <>
                                        <FrameSlot item={frameSlots.first} label="首帧 · 可选" hint="留空则从文字开始" theme={theme} onChoose={() => { frameTargetRef.current = "first"; frameFileInputRef.current?.click(); }} onRemove={() => setFrameSlots((value) => ({ ...value, first: undefined }))} />
                                        <FrameSlot item={frameSlots.last} label="尾帧 · 可选" hint="留空则不约束结尾" theme={theme} onChoose={() => { frameTargetRef.current = "last"; frameFileInputRef.current?.click(); }} onRemove={() => setFrameSlots((value) => ({ ...value, last: undefined }))} />
                                    </>}
                                    {isReferenceMode && referenceVideos.map((item) => <MediaReferenceCard key={item.id} item={item} icon={<VideoIcon className="size-4" />} theme={theme} onRemove={() => setReferenceVideos((value) => value.filter((media) => media.id !== item.id))} />)}
                                    {isReferenceMode && referenceAudios.map((item) => <MediaReferenceCard key={item.id} item={item} icon={<Volume2 className="size-4" />} theme={theme} onRemove={() => setReferenceAudios((value) => value.filter((media) => media.id !== item.id))} />)}
                                    {isReferenceMode && !references.length && !referenceVideos.length && !referenceAudios.length ? <div className="flex min-w-full items-center justify-center text-sm" style={{ color: theme.node.muted }}>{referenceDragTarget ? t("videoWorkbench.dropReferences") : "支持视频×3、图片×9、音频×3 · MP4/MOV · MP3/WAV"}</div> : null}
                                </div>
                                {isReferenceMode ? <div className="mt-2 flex flex-wrap gap-x-2 text-xs" style={{ color: theme.node.muted }}><span>图片 {references.length}/9 · 视频 {referenceVideos.length}/3 · 音频 {referenceAudios.length}/3</span><span>输入 @ 引用素材</span></div> : <div className="mt-2 flex flex-wrap gap-x-2 text-xs" style={{ color: theme.node.muted }}><span>首帧和尾帧都可以留空；两者都空时按 T2VA 文生视频生成。</span>{promptMentions.length ? <span>输入 @ 引用已上传帧</span> : null}</div>}
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{t("workbench.prompt")}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs" style={{ color: theme.node.muted }}>{prompt.length} 字</span>
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            {t("workbench.viewAssets")}
                                        </Button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <Input.TextArea id="video-prompt-textarea" value={prompt} onChange={handlePromptChange} onKeyDown={handlePromptKeyDown} rows={7} placeholder={`${t("videoWorkbench.promptPlaceholder")}；输入 @ 引用素材`} />
                                    {promptMentionTrigger ? <div className="absolute inset-x-2 bottom-2 z-20 max-h-44 overflow-y-auto rounded-lg border p-1 shadow-lg" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                        {promptMentionMatches.length ? promptMentionMatches.map((mention, index) => <button key={mention.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs" style={{ background: index === Math.min(promptMentionIndex, promptMentionMatches.length - 1) ? theme.node.fill : "transparent", color: theme.node.text }} onMouseDown={(event) => event.preventDefault()} onClick={() => insertPromptMention(mention)}>
                                            {mention.thumbnailUrl ? <img src={mention.thumbnailUrl} alt={mention.label} className="size-10 shrink-0 rounded border object-cover" style={{ borderColor: theme.node.stroke }} /> : null}
                                            <span className="shrink-0 font-medium">{mention.token}</span>
                                            <span className="shrink-0" style={{ color: theme.node.muted }}>{mention.label}</span>
                                            <span className="min-w-0 truncate" style={{ color: theme.node.muted }}>{mention.detail}</span>
                                            <span className="ml-auto shrink-0 font-mono" style={{ color: theme.node.muted }}>{mention.h3Reference}</span>
                                        </button>) : <div className="px-2 py-2 text-xs" style={{ color: theme.node.muted }}>暂无可引用素材，请先上传图片、视频或音频。</div>}
                                    </div> : null}
                                </div>
                                <div className="mt-2 flex items-center justify-end gap-2">
                                    <Button size="small" icon={<Sparkles className="size-3.5" />} loading={optimizingPrompt} disabled={!prompt.trim()} onClick={() => void optimizePrompt()}>{optimizingPrompt ? "正在按 H3 规范优化…" : "优化提示词"}</Button>
                                    <Button size="small" icon={<Eraser className="size-3.5" />} onClick={clearPrompt}>清空</Button>
                                    <Button size="small" icon={<RotateCcw className="size-3.5" />} disabled={!promptBeforeOptimize} onClick={() => setPrompt(promptBeforeOptimize)}>恢复优化前</Button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm sm:hidden" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                <span className="truncate" style={{ color: theme.node.muted }}>
                                    {modelOptionLabel(effectiveConfig, model)} · {normalizeResolution(effectiveConfig.vquality)}p · {videoSizeLabel(effectiveConfig.size)} · {normalizeVideoSeconds(effectiveConfig.videoSeconds)}s
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    {t("workbench.adjust")}
                                </Button>
                            </div>

                            <div className="hidden gap-4 sm:grid sm:grid-cols-2">
                                <GenerationSettings config={effectiveConfig} model={model} isMiniMaxH3={isMiniMaxH3} h3InstanceType={h3InstanceType} onH3InstanceTypeChange={setH3InstanceType} quantity={quantity} onQuantityChange={setQuantity} updateConfig={updateConfig} onModelChange={(value) => { setModelOverride(value); updateConfig("videoModel", value); }} openConfigDialog={openConfigDialog} />
                            </div>
                        </div>

                        <div className="mt-auto pt-6">
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()} className="!h-12 !rounded-xl !font-semibold" style={{ background: theme.node.text, borderColor: theme.node.text, color: theme.node.panel }}>
                                {isMiniMaxH3 ? "生成 MiniMax H3 视频" : t("workbench.generate")}
                            </Button>
                        </div>
                    </div>

                    <div className="thin-scrollbar min-h-0 overflow-y-auto rounded-2xl border p-4 shadow-sm lg:p-5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold">{t("workbench.results")}</h2>
                        </div>
                        {results.length ? (
                            <div className="grid gap-4">
                                {results.map((result) => (result.status === "success" && result.video ? <ResultVideoCard key={result.id} video={result.video} theme={theme} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} /> : result.status === "failed" ? <FailedVideoCard key={result.id} theme={theme} error={result.error || t("workbench.generationFailed")} onRetry={retryResult} /> : <PendingVideoCard key={result.id} theme={theme} elapsedMs={Math.max(0, elapsedMs - ((result.startedAt || startedAt) - startedAt))} />))}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed text-center lg:min-h-[560px]" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                <VideoIcon className="mb-4 size-12" style={{ color: theme.node.muted }} />
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: theme.node.muted }}>{t("videoWorkbench.empty")}</span>} />
                            </div>
                        )}
                    </div>
                </section>
                {!logsCollapsed ? <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-2xl border p-4 shadow-sm lg:block" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <LogPanel theme={theme} logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} onCollapse={() => setLogsCollapsed(true)} />
                </aside> : null}
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept={isReferenceMode ? "image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav" : "image/*"}
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferenceMedia(event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={frameFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addFrameFiles(event.target.files, frameTargetRef.current);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel theme={theme} logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" height="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} isMiniMaxH3={isMiniMaxH3} h3InstanceType={h3InstanceType} onH3InstanceTypeChange={setH3InstanceType} quantity={quantity} onQuantityChange={setQuantity} updateConfig={updateConfig} onModelChange={(value) => { setModelOverride(value); updateConfig("videoModel", value); }} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function VideoModeToggle({ value, onChange, theme }: { value: string; onChange: (value: "frames" | "reference") => void; theme: CanvasTheme }) {
    const selected = value === "reference" ? "reference" : "frames";
    return (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border p-1" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <button type="button" className="flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition hover:opacity-80" style={{ background: selected === "frames" ? theme.node.text : "transparent", color: selected === "frames" ? theme.node.panel : theme.node.text }} onClick={() => onChange("frames")}>
                <ImagePlus className="size-4" />
                首尾帧 / 文生视频
            </button>
            <button type="button" className="flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition hover:opacity-80" style={{ background: selected === "reference" ? theme.node.text : "transparent", color: selected === "reference" ? theme.node.panel : theme.node.text }} onClick={() => onChange("reference")}>
                <Layers3 className="size-4" />
                全能参考
            </button>
        </div>
    );
}

function FrameSlot({ item, label, hint, theme, onChoose, onRemove }: { item?: ReferenceImage; label: string; hint: string; theme: CanvasTheme; onChoose: () => void; onRemove: () => void }) {
    if (!item) {
        return <button type="button" className="flex h-28 w-full min-w-0 flex-col items-center justify-center rounded-md border border-dashed px-4 text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onChoose}><Upload className="mb-1 size-4" />{label}<span className="text-xs">{hint}</span></button>;
    }
    return <div className="group relative h-28 w-full min-w-0 overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke }}>
        <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
        <span className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: theme.node.text, color: theme.node.panel }}>{label.split(" · ")[0]}</span>
        <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded group-hover:flex" style={{ background: theme.node.text, color: theme.node.panel }} onClick={onRemove} aria-label="移除帧">
            <Trash2 className="size-3.5" />
        </button>
        <div className="absolute inset-x-0 bottom-0 truncate px-2 py-1 text-[10px]" style={{ background: `${theme.node.panel}CC`, color: theme.node.text }}>{item.name}</div>
    </div>;
}

function GenerationSettings({ config, model, isMiniMaxH3, h3InstanceType, onH3InstanceTypeChange, quantity, onQuantityChange, updateConfig, onModelChange, openConfigDialog }: { config: AiConfig; model: string; isMiniMaxH3: boolean; h3InstanceType: RunningHubWorkflowInstanceType; onH3InstanceTypeChange: (value: RunningHubWorkflowInstanceType) => void; quantity: string; onQuantityChange: (value: string) => void; updateConfig: UpdateAiConfig; onModelChange: (value: string) => void; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const h3TooltipStyle = { color: theme.node.text, styles: { root: { color: theme.node.panel, boxShadow: "0 8px 24px rgba(0,0,0,.24)", fontSize: 13, fontWeight: 500 } } };

    return (
        <>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">{t("workbench.model")}</span>
                {isMiniMaxH3 ? <Tooltip title="已连接 RunningHub MiniMax H3 工作流" placement="top" mouseEnterDelay={0.15} {...h3TooltipStyle}><span className="block"><ModelPicker config={config} value={model} onChange={onModelChange} capability="video" fullWidth onMissingConfig={() => openConfigDialog(false)} /></span></Tooltip> : <ModelPicker config={config} value={model} onChange={onModelChange} capability="video" fullWidth onMissingConfig={() => openConfigDialog(false)} />}
            </label>
            {isMiniMaxH3 ? <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">运行实例</span>
                <Tooltip title="提交时写入 RunningHub instanceType" placement="top" mouseEnterDelay={0.15} {...h3TooltipStyle}><span className="block"><select aria-label="运行实例" value={h3InstanceType} onChange={(event) => onH3InstanceTypeChange(event.target.value as RunningHubWorkflowInstanceType)} className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>
                    {RUNNING_HUB_WORKFLOW_INSTANCE_TYPES.map((value) => <option key={value} value={value}>{runningHubWorkflowInstanceLabel(value)}</option>)}
                </select></span></Tooltip>
            </label> : null}
            <div className="col-span-2">
                {isMiniMaxH3 ? <H3OutputSettings config={config} quantity={quantity} onQuantityChange={onQuantityChange} updateConfig={updateConfig} theme={theme} /> : <VideoSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" />}
            </div>
        </>
    );
}

function H3OutputSettings({ config, quantity, onQuantityChange, updateConfig, theme }: { config: AiConfig; quantity: string; onQuantityChange: (value: string) => void; updateConfig: UpdateAiConfig; theme: CanvasTheme }) {
    const fields = [
        { label: "画幅", value: config.size === "auto" ? "adaptive" : config.size, options: [{ value: "adaptive", label: "自适应" }, { value: "1792x768", label: "21:9" }, { value: "1280x720", label: "16:9" }, { value: "1024x768", label: "4:3" }, { value: "1024x1024", label: "1:1" }, { value: "768x1024", label: "3:4" }, { value: "720x1280", label: "9:16" }], onChange: (value: string) => updateConfig("size", value === "adaptive" ? "auto" : value) },
        { label: "时长 / 秒", value: config.videoSeconds || "5", options: Array.from({ length: 11 }, (_, index) => ({ value: String(index + 5), label: String(index + 5) })), onChange: (value: string) => updateConfig("videoSeconds", value) },
        { label: "清晰度", value: config.vquality === "768" ? "768P" : "2K", options: [{ value: "768P", label: "768P" }, { value: "2K", label: "2K" }], onChange: (value: string) => updateConfig("vquality", value) },
        { label: "生成数量", value: quantity, options: ["1", "2", "3"].map((value) => ({ value, label: value })), onChange: onQuantityChange },
    ];
    return <div className="grid grid-cols-2 gap-3" style={{ color: theme.node.text }}>
        {fields.map((field) => <label key={field.label} className="min-w-0"><span className="mb-1.5 block text-xs" style={{ color: theme.node.muted }}>{field.label}</span><select value={field.value} onChange={(event) => field.onChange(event.target.value)} className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    </div>;
}

function MediaReferenceCard({ item, icon, theme, onRemove }: { item: ReferenceVideo | ReferenceAudio; icon: ReactNode; theme: CanvasTheme; onRemove: () => void }) {
    return <div className="flex h-20 min-w-40 shrink-0 items-center gap-2 rounded-md border px-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><span className="grid size-8 place-items-center rounded" style={{ background: theme.node.panel }}>{icon}</span><span className="min-w-0 flex-1 truncate text-xs">{item.name}</span><button type="button" className="rounded p-1 opacity-70 hover:opacity-100" onClick={onRemove}><Trash2 className="size-3.5" /></button></div>;
}

function ResultVideoCard({ video, theme, onDownload, onSaveAsset }: { video: GeneratedVideo; theme: CanvasTheme; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <video src={video.url} controls className="aspect-video w-full bg-black object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-3 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs" style={{ color: theme.node.muted }}>
                    <span>
                        {video.width}x{video.height}
                    </span>
                    <span>{formatBytes(video.bytes)}</span>
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        {t("common.addToAssets")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PendingVideoCard({ theme, elapsedMs }: { theme: CanvasTheme; elapsedMs: number }) {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="absolute inset-x-0 top-0 h-1/2 animate-pulse bg-gradient-to-b from-white/5 to-transparent" />
            <div className="relative z-10 flex size-full flex-col items-center justify-center gap-3 text-sm" style={{ color: theme.node.muted }}>
                <div className="relative grid size-16 place-items-center">
                    <span className="absolute inset-0 rounded-full border animate-ping" style={{ borderColor: theme.node.text, opacity: 0.18 }} />
                    <span className="grid size-11 place-items-center rounded-full border shadow-sm" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}>
                        <VideoIcon className="size-5 animate-pulse" />
                    </span>
                </div>
                <span className="font-medium" style={{ color: theme.node.text }}>{t("workbench.generating")}</span>
                <Tag className="m-0 px-2 py-1 text-sm tabular-nums" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}>
                    {t("workbench.waiting", { time: formatDuration(elapsedMs) })}
                </Tag>
                <div className="flex gap-1.5" aria-label="生成中">
                    {[0, 180, 360].map((delay) => <span key={delay} className="size-1.5 animate-bounce rounded-full" style={{ background: theme.node.text, animationDelay: `${delay}ms` }} />)}
                </div>
            </div>
        </div>
    );
}

function FailedVideoCard({ error, theme, onRetry }: { error: string; theme: CanvasTheme; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium" style={{ color: theme.node.text }}>{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs" style={{ color: theme.node.muted }}>
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t p-3" style={{ borderColor: theme.node.stroke }}>
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </div>
    );
}

function LogPanel({
    theme,
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
    onCollapse,
}: {
    theme: CanvasTheme;
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
    onCollapse?: () => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                {onCollapse ? <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<PanelRightClose className="size-4" />} onClick={onCollapse} aria-label={t("workbench.hideLogs")} title={t("workbench.hideLogs")} /> : null}
                <div className="flex min-w-0 items-center gap-2">
                    <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                    <Tag className="m-0">{logs.length}</Tag>
                </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard key={log.id} theme={theme} log={log} selected={selectedLogIds.includes(log.id)} active={activeLogId === log.id} onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))} onClick={() => onPreviewLog(log)} />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-center text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, theme, selected, active, onSelectedChange, onClick }: { log: GenerationLog; theme: CanvasTheme; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    const statusLabel = t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`);
    return (
        <div role="button" tabIndex={0} className="block w-full rounded-lg border p-2 text-left transition hover:opacity-80" style={{ borderColor: active ? theme.node.text : theme.node.stroke, background: active ? theme.node.fill : theme.node.panel, color: theme.node.text }} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}>
            <LogPreview log={log} theme={theme} statusLabel={statusLabel} />
            <div className="flex items-start gap-2">
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-sm font-semibold leading-5">{log.title}</div>
                        <Tag className="m-0 shrink-0 rounded-md px-1.5 py-0.5 text-xs leading-none" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>
                        {statusLabel}
                        </Tag>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" style={{ color: theme.node.muted }}>
                        <LogInfo label="画幅" value={log.size || "—"} />
                        <LogInfo label="清晰度" value={formatLogResolution(log.resolution)} />
                        <LogInfo label="视频时长" value={log.seconds ? `${log.seconds} 秒` : "—"} />
                        <LogInfo label="生成用时" value={formatGenerationTime(log.durationMs, log.status)} />
                        <LogInfo label="模式" value={generationModeLabel(log)} />
                        {log.instanceType ? <LogInfo label="运行实例" value={runningHubWorkflowInstanceLabel(log.instanceType)} /> : null}
                        <LogInfo className="col-span-2" label="提交时间" value={log.time} />
                        {log.task?.id ? <LogInfo className="col-span-2" label="任务 ID" value={log.task.id} truncate /> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LogInfo({ label, value, className = "", truncate = false }: { label: string; value: string; className?: string; truncate?: boolean }) {
    return <div className={`min-w-0 ${className}`}><span>{label}：</span><span className={truncate ? "inline-block max-w-[calc(100%-4em)] align-bottom truncate" : ""} title={truncate ? value : undefined} style={{ color: "inherit" }}>{value}</span></div>;
}

function formatLogResolution(value: string) {
    const normalized = value.replace(/p$/i, "");
    return normalized ? `${normalized}p` : "—";
}

function generationModeLabel(log: GenerationLog) {
    if (log.config.videoMode === "reference") return "全能参考";
    if (log.frameSlots?.first && log.frameSlots.last) return "首尾帧";
    if (log.frameSlots?.first) return "首帧图生";
    if (log.frameSlots?.last) return "尾帧图生";
    return "文生视频";
}

function LogPreview({ log, theme, statusLabel }: { log: GenerationLog; theme: CanvasTheme; statusLabel: string }) {
    if (log.video?.url) {
        return <div className="mx-auto mb-2 aspect-video max-h-48 w-full overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <video src={log.video.url} controls preload="metadata" className="size-full bg-black object-contain" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} />
        </div>;
    }
    return <div className="mx-auto mb-2 flex aspect-video max-h-48 w-full items-center justify-center gap-2 rounded-md border border-dashed text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
        {log.status === "pending" ? <LoaderCircle className="size-4 animate-spin" /> : <VideoIcon className="size-4" />}
        <span>{statusLabel}</span>
    </div>;
}

function formatGenerationTime(durationMs: number, status: GenerationLog["status"]) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return status === "pending" ? i18n.t("workbench.timing") : i18n.t("workbench.durationUnknown");
    if (status !== "pending" && durationMs < 2_000) return "历史记录未统计";
    const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return i18n.t("workbench.durationHours", { hours, minutes, seconds });
    if (minutes) return i18n.t("workbench.durationMinutes", { minutes, seconds });
    return i18n.t("workbench.durationSeconds", { seconds });
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const logs: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            logs.push(value);
        });
        return (await Promise.all(logs.map(normalizeLog))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const video = log.video?.storageKey ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : log.video;
    const resolveReference = async (item: ReferenceImage) => ({ ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) });
    const references = await Promise.all((log.references || []).map(resolveReference));
    const frameSlots = log.frameSlots
        ? { first: log.frameSlots.first ? await resolveReference(log.frameSlots.first) : undefined, last: log.frameSlots.last ? await resolveReference(log.frameSlots.last) : undefined }
        : undefined;
    const referenceVideos = await Promise.all((log.referenceVideos || []).map(async (item) => ({ ...item, url: await resolveMediaUrl(item.storageKey, item.url) })));
    const referenceAudios = await Promise.all((log.referenceAudios || []).map(async (item) => ({ ...item, url: await resolveMediaUrl(item.storageKey, item.url) })));
    const config = normalizeLogConfig(log);
    const modelValue = log.model || config.videoModel || "";
    const runningHubTitle = /^runninghub::/i.test(modelValue) ? modelValue.replace(/^runninghub::/i, "").trim() : "";
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: runningHubTitle || log.title || modelValue || i18n.t("workbench.untitled"),
        prompt: log.prompt || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.videoModel || "",
        config,
        references,
        frameSlots,
        referenceVideos,
        referenceAudios,
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: normalizeResolution(log.resolution || config.vquality || ""),
        seconds: log.seconds || config.videoSeconds || "",
        status: log.status || "success",
        task: log.task,
        video,
        error: log.error,
        instanceType: log.instanceType,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        frameSlots: log.frameSlots ? {
            first: log.frameSlots.first ? { ...log.frameSlots.first, dataUrl: log.frameSlots.first.storageKey ? "" : log.frameSlots.first.dataUrl } : undefined,
            last: log.frameSlots.last ? { ...log.frameSlots.last, dataUrl: log.frameSlots.last.storageKey ? "" : log.frameSlots.last.dataUrl } : undefined,
        } : undefined,
        referenceVideos: (log.referenceVideos || []).map((item) => ({ ...item, url: item.storageKey ? "" : item.url })),
        referenceAudios: (log.referenceAudios || []).map((item) => ({ ...item, url: item.storageKey ? "" : item.url })),
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, theme, onMove }: { index: number; total: number; theme: CanvasTheme; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !p-0 !shadow-sm" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }} icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !p-0 !shadow-sm" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }} icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoGenerateAudio: log.config?.videoGenerateAudio || "true",
        videoWatermark: log.config?.videoWatermark || "false",
        videoMode: log.config?.videoMode || "frames",
    };
}

function buildLog({ prompt, model, config, references, frameSlots, referenceVideos, referenceAudios, durationMs, status, task, video, error, createdAt = Date.now(), instanceType }: { prompt: string; model: string; config: AiConfig; references: ReferenceImage[]; frameSlots?: FrameSlots; referenceVideos: ReferenceVideo[]; referenceAudios: ReferenceAudio[]; durationMs: number; status: GenerationLog["status"]; task?: VideoGenerationTask; video?: GeneratedVideo; error?: string; createdAt?: number; instanceType?: RunningHubWorkflowInstanceType }): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoMode: config.videoMode,
    };
    const configuredModel = findChannelModel(config, model)?.model;
    const runningHubTitle = configuredModel?.runningHub?.title?.trim();
    const title = runningHubTitle || (configuredModel?.runningHub ? modelOptionLabel(config, model) : prompt.slice(0, 12)) || i18n.t("workbench.untitled");
    return {
        id: nanoid(),
        createdAt,
        title,
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        frameSlots,
        referenceVideos,
        referenceAudios,
        durationMs,
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
        instanceType,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    const next = {
        ...config,
        model,
        videoModel: model,
        size: normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
    };
    const resource = findChannelModel(config, model)?.model.runningHub;
    if (!MINIMAX_H3_WORKFLOW_TARGETS.has(resource?.target || "")) return next;
    const isIntegratedH3 = resource?.target === MINIMAX_H3_INTEGRATED_WORKFLOW_TARGET;
    // H3 工作流没有通用 /videos 接口，必须把工作台控件写回真实工作流字段。
    return {
        ...next,
        runningHubWorkflowValues: {
            ...(config.runningHubWorkflowValues || {}),
            [isIntegratedH3 ? "130.aspect" : "252.aspect_ratio"]: isIntegratedH3 ? h3IntegratedAspectRatio(next.size) : h3AspectRatio(next.size),
            [isIntegratedH3 ? "130.megapixels" : "252.megapixels"]: h3Megapixels(next.vquality),
            [isIntegratedH3 ? "130.duration_seconds" : "259.value"]: Math.max(2, Math.min(15, Number(next.videoSeconds) || 10)),
        },
    };
}

function h3AspectRatio(size: string) {
    return ({
        "720x1280": "9:16 (Portrait Widescreen)",
        "1024x1024": "1:1 (Square)",
        "1792x1024": "16:9 (Widescreen)",
        "1792x768": "21:9 (Widescreen)",
        "1024x768": "4:3",
        "768x1024": "3:4",
        "1024x1792": "9:16 (Portrait Widescreen)",
    } as Record<string, string>)[size] || "16:9 (Widescreen)";
}

function h3IntegratedAspectRatio(size: string) {
    return ({ "1280x720": "16:9", "720x1280": "9:16", "1024x1024": "1:1", "1792x1024": "16:9", "1792x768": "21:9", "1024x768": "4:3", "768x1024": "3:4", "1024x1792": "9:16" } as Record<string, string>)[size] || "adaptive";
}

function h3Megapixels(resolution: string) {
    if (resolution.toUpperCase() === "2K") return 2;
    if (resolution.toUpperCase() === "768P") return 1;
    const value = Number.parseInt(resolution.replace(/p$/i, ""), 10);
    if (value <= 480) return 0.5;
    if (value >= 1080) return 2;
    return 1;
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
