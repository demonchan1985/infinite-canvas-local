import type { ChannelModel, ModelCapability, ModelChannel, RunningHubNodeBinding, RunningHubResource, RunningHubWorkflowField, RunningHubWorkflowPreview } from "@/stores/use-config-store";

export const RUNNING_HUB_SEEDVR_APP_ID = "2051722999090434050";
export const RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY = "82.index";
export const RUNNING_HUB_SEEDVR_DEFAULT_PIXEL = 2;

type WorkflowNode = { id: string; classType: string; title: string; inputs: Record<string, unknown> };
type WorkflowBindings = {
    promptBinding?: RunningHubNodeBinding;
    imageBindings: RunningHubNodeBinding[];
    videoBindings: RunningHubNodeBinding[];
    audioBindings: RunningHubNodeBinding[];
    workflowFields: RunningHubWorkflowField[];
    workflowPreview: RunningHubWorkflowPreview;
};

type RawWorkflowInput = { name?: string; link?: number | null; widget?: { name?: string } };
type RawWorkflowNode = { id?: number | string; type?: string; title?: string; inputs?: RawWorkflowInput[]; widgets_values?: unknown[]; properties?: Record<string, unknown> };
type RawWorkflow = { nodes?: RawWorkflowNode[]; links?: Array<[number, number, number, number, number]> };
type RawRunningHubAppField = Record<string, unknown>;

export type RunningHubAiAppImport = {
    appId: string;
    name: string;
    capability: Extract<ModelCapability, "image" | "video" | "audio">;
    bindings: WorkflowBindings;
};

/** 图片节点快捷高清放大只复用用户已导入的 SeedVR2.5 应用，避免猜测其公开素材字段。 */
export function findSeedVrUpscaleModel(channels: ModelChannel[]) {
    for (const channel of channels) {
        if (channel.apiFormat !== "runninghub") continue;
        const model = channel.models.find((item) => item.capability === "image" && item.runningHub?.kind === "app" && item.runningHub.target === RUNNING_HUB_SEEDVR_APP_ID);
        if (model) return { channel, model };
    }
    return null;
}

/** SeedVR2.5 当前仅接收一张源图；绑定来自已导入应用的真实 nodeInfoList。 */
export function seedVrUpscaleImageBindings(resource: RunningHubResource | undefined) {
    if (resource?.target !== RUNNING_HUB_SEEDVR_APP_ID) return [];
    const bindings = resource.imageBindings?.length ? resource.imageBindings : resource.imageBinding ? [resource.imageBinding] : [];
    return bindings.slice(0, 1);
}

/** 优先使用已导入应用的真实像素字段；早期保存的数据缺失时再回退公开默认值。 */
export function seedVrUpscalePixelField(resource: RunningHubResource | undefined) {
    if (resource?.target !== RUNNING_HUB_SEEDVR_APP_ID) return undefined;
    const savedField = resource.workflowFields?.find((field) => field.key === RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY);
    if (savedField?.options?.length) return savedField;
    return defaultRunningHubAiAppFields(resource.target).find((field) => field.key === RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY);
}

function workflowNodeList(value: unknown, nodes = new Map<string, WorkflowNode>()): WorkflowNode[] {
    if (typeof value === "string") {
        try {
            return workflowNodeList(JSON.parse(value), nodes);
        } catch {
            return [...nodes.values()];
        }
    }
    if (!value || typeof value !== "object") return [...nodes.values()];
    if (Array.isArray(value)) {
        value.forEach((item) => workflowNodeList(item, nodes));
        return [...nodes.values()];
    }
    const record = value as Record<string, unknown>;
    const inputs = record.inputs;
    const nodeId = String(record.id || record.nodeId || "").trim();
    if (nodeId && inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
        nodes.set(nodeId, { id: nodeId, classType: String(record.class_type || record.classType || record.type || ""), title: String((record._meta as Record<string, unknown> | undefined)?.title || record.title || ""), inputs: inputs as Record<string, unknown> });
    }
    Object.entries(record).forEach(([key, item]) => {
        if (item && typeof item === "object" && !Array.isArray(item) && "inputs" in (item as Record<string, unknown>)) {
            const node = item as Record<string, unknown>;
            nodes.set(key, { id: key, classType: String(node.class_type || node.classType || node.type || ""), title: String((node._meta as Record<string, unknown> | undefined)?.title || node.title || ""), inputs: (node.inputs || {}) as Record<string, unknown> });
        }
        workflowNodeList(item, nodes);
    });
    return [...nodes.values()];
}

function firstBinding(nodes: WorkflowNode[], matcher: (node: WorkflowNode, fieldName: string) => boolean): RunningHubNodeBinding | undefined {
    for (const node of nodes) {
        const fieldName = Object.keys(node.inputs).find((field) => matcher(node, field));
        if (fieldName) return { nodeId: node.id, fieldName };
    }
    return undefined;
}

function imageInputField(node: WorkflowNode) {
    return Object.keys(node.inputs).find((field) => /^(image|image\d*|image_\d+|imageurl|image_url|reference_image|source_image)$/i.test(field));
}

function mediaInputField(node: WorkflowNode, kind: "video" | "audio") {
    return Object.keys(node.inputs).find((field) => new RegExp(`^(${kind}|${kind}[_\\d]+|${kind}_url|${kind}file|file)$`, "i").test(field));
}

function linkedNode(node: WorkflowNode | undefined, fieldName: string, nodes: Map<string, WorkflowNode>) {
    const value = node?.inputs[fieldName];
    return Array.isArray(value) && typeof value[0] === "string" ? nodes.get(value[0]) : undefined;
}

function findLinkedSource(node: WorkflowNode | undefined, nodes: Map<string, WorkflowNode>, predicate: (candidate: WorkflowNode) => boolean, visited = new Set<string>()): WorkflowNode | undefined {
    if (!node || visited.has(node.id)) return undefined;
    visited.add(node.id);
    if (predicate(node)) return node;
    for (const value of Object.values(node.inputs)) {
        if (!Array.isArray(value) || typeof value[0] !== "string") continue;
        const found = findLinkedSource(nodes.get(value[0]), nodes, predicate, visited);
        if (found) return found;
    }
    return undefined;
}

function workflowField(node: WorkflowNode, fieldName: string, label: string, type: RunningHubWorkflowField["type"], options?: string[], step?: number): RunningHubWorkflowField | null {
    const value = node.inputs[fieldName];
    if (Array.isArray(value) || value === undefined || value === null) return null;
    if (typeof value !== "string" && typeof value !== "number") return null;
    return { nodeId: node.id, fieldName, key: `${node.id}.${fieldName}`, label, type, defaultValue: value, options, step };
}

function rawWorkflow(value: unknown): RawWorkflow | null {
    if (typeof value === "string") {
        try {
            return rawWorkflow(JSON.parse(value));
        } catch {
            return null;
        }
    }
    if (!value || typeof value !== "object") return null;
    const record = value as RawWorkflow;
    return Array.isArray(record.nodes) && Array.isArray(record.links) ? record : null;
}

function parseRawWorkflowBindings(raw: RawWorkflow): WorkflowBindings | null {
    const nodes = new Map((raw.nodes || []).flatMap((node) => (node.id === undefined ? [] : [[String(node.id), node] as const])));
    const linkById = new Map((raw.links || []).map((link) => [link[0], link]));
    const nodeInputs = (node: RawWorkflowNode | undefined) => node?.inputs || [];
    const sourceFromInput = (input: RawWorkflowInput | undefined) => {
        const link = typeof input?.link === "number" ? linkById.get(input.link) : undefined;
        return link ? nodes.get(String(link[1])) : undefined;
    };
    const namedSetNode = new Map(
        [...nodes.values()]
            .filter((node) => node.type === "SetNode" && typeof node.widgets_values?.[0] === "string")
            .map((node) => [String(node.widgets_values![0]), node]),
    );
    const resolveSource = (node: RawWorkflowNode | undefined, visited = new Set<string>()): RawWorkflowNode | undefined => {
        const id = String(node?.id || "");
        if (!node || visited.has(id)) return node;
        visited.add(id);
        if (node.type !== "GetNode") return node;
        const name = typeof node.widgets_values?.[0] === "string" ? node.widgets_values[0] : "";
        const setNode = namedSetNode.get(name);
        return resolveSource(sourceFromInput(nodeInputs(setNode)[0]), visited);
    };
    const h3 = [...nodes.values()].find((node) => /^(?:MiniMaxH3ReferenceToVideo|MiniMaxH3IntegrationGH)$/i.test(node.type || ""));
    if (!h3) return null;
    const directIntegratedH3 = /MiniMaxH3Integration/i.test(h3.type || "") && nodeInputs(h3).some((input) => input.name === "ref_image_1");
    const sourceFor = (name: string) => resolveSource(sourceFromInput(nodeInputs(h3).find((input) => input.name === name)));
    const bindingFor = (name: string, expected: RegExp): RunningHubNodeBinding | null => {
        const source = sourceFor(name);
        const fieldName = nodeInputs(source).find((input) => expected.test(input.name || ""))?.name;
        return source?.id !== undefined && fieldName ? { nodeId: String(source.id), fieldName } : null;
    };
    const bindingsFor = (prefix: string, expected: RegExp) =>
        nodeInputs(h3)
            .filter((input) => input.name?.startsWith(prefix))
            .map((input) => bindingFor(input.name || "", expected))
            .filter((binding): binding is RunningHubNodeBinding => Boolean(binding));
    const fieldValue = (node: RawWorkflowNode | undefined, fieldName: string) => {
        if (!node) return undefined;
        const widgetIndex = nodeInputs(node).filter((input) => input.widget).findIndex((input) => input.name === fieldName);
        return widgetIndex >= 0 ? node.widgets_values?.[widgetIndex] : undefined;
    };
    const field = (node: RawWorkflowNode | undefined, fieldName: string, label: string, type: RunningHubWorkflowField["type"], options?: Array<string | number>, step?: number): RunningHubWorkflowField | null => {
        const value = fieldValue(node, fieldName);
        return node?.id !== undefined && (typeof value === "string" || typeof value === "number") ? { nodeId: String(node.id), fieldName, key: `${node.id}.${fieldName}`, label, type, defaultValue: value, options, step } : null;
    };
    const findRaw = (matcher: (node: RawWorkflowNode) => boolean) => [...nodes.values()].find(matcher);
    const resolution = sourceFor("width") || sourceFor("height");
    const duration = findRaw((node) => node.type === "PrimitiveFloat" && /视频时长/.test(node.title || ""));
    const sampler = findRaw((node) => node.type === "KSamplerSelect");
    const seed = findRaw((node) => node.type === "RandomNoise");
    const secondPass = findRaw((node) => node.type === "easy float" && String(node.properties?.["Node name for S&R"] || "") === "easy float");
    const fields = directIntegratedH3 ? [
        field(h3, "aspect", "画面比例", "select", ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
        field(h3, "megapixels", "画面像素（MP）", "number", undefined, 0.1),
        field(h3, "duration_seconds", "视频时长（秒）", "number", undefined, 1),
        field(h3, "ref_image_size", "参考图尺寸", "select", ["match", "max", "min"]),
    ].filter((item): item is RunningHubWorkflowField => Boolean(item)) : [
        field(resolution, "aspect_ratio", "画面比例", "text"),
        field(resolution, "megapixels", "画面像素（MP）", "number", undefined, 0.1),
        field(duration, "value", duration?.title || "视频时长（秒）", "number", undefined, 1),
        field(h3, "ref_image_size", "参考图尺寸", "text"),
        field(sampler, "sampler_name", sampler?.title || "采样器", "text"),
        field(seed, "noise_seed", seed?.title || "随机种子", "number", undefined, 1),
        field(secondPass, "value", "二采倍数", "number", undefined, 0.1),
    ].filter((item): item is RunningHubWorkflowField => Boolean(item));
    const directBinding = (fieldName: string): RunningHubNodeBinding => ({ nodeId: String(h3.id), fieldName });
    const directBindings = (prefix: string) => nodeInputs(h3).filter((input) => input.name?.startsWith(prefix)).map((input) => directBinding(input.name || ""));
    const promptBinding = directIntegratedH3 ? directBinding("prompt") : bindingFor("prompt", /^(text|prompt)$/i) || undefined;
    const imageBindings = directIntegratedH3 ? ["first_frame", "last_frame", ...Array.from({ length: 9 }, (_, index) => `ref_image_${index + 1}`)].filter((name) => nodeInputs(h3).some((input) => input.name === name)).map(directBinding) : bindingsFor("ref_images.", /^image$/i);
    const videoBindings = directIntegratedH3 ? directBindings("ref_video_") : bindingsFor("ref_videos.", /^video$/i);
    const audioBindings = directIntegratedH3 ? directBindings("ref_audio_") : bindingsFor("ref_audios.", /^audio$/i);
    return {
        promptBinding,
        imageBindings,
        videoBindings,
        audioBindings,
        workflowFields: fields,
        workflowPreview: { imageSlots: imageBindings.length, videoSlots: videoBindings.length, audioSlots: audioBindings.length, secondPassFieldKey: fields.find((item) => item.label === "二采倍数")?.key },
    };
}

function imageBindingOrder(fieldName: string, fallback: number) {
    const indexed = fieldName.match(/(?:ref[_\.]?images?|images?)[_\.]?(?:ref[_\.]?)?image[_\.]?(\d+)/i)?.[1];
    return indexed ? Number(indexed) : 100000 + fallback;
}

/** 从 RunningHub 的工作流 JSON 中提取可由画布覆盖的提示词和参考图节点。 */
export function parseRunningHubWorkflowBindings(payload: unknown): WorkflowBindings {
    const raw = rawWorkflow(payload);
    const parsedRaw = raw ? parseRawWorkflowBindings(raw) : null;
    if (parsedRaw) return parsedRaw;
    const nodes = workflowNodeList(payload);
    const promptBinding = firstBinding(nodes, (node, field) => /^(text|prompt|positive|description)$/i.test(field) && /(text|prompt|clip|encode)/i.test(node.classType));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const linkedImageBindings = nodes.flatMap((consumer, consumerIndex) =>
        Object.entries(consumer.inputs).flatMap(([parameter, value], parameterIndex) => {
            if (!Array.isArray(value) || typeof value[0] !== "string") return [];
            const source = byId.get(value[0]);
            const fieldName = source && imageInputField(source);
            if (!source || !fieldName || !/(image|load|reference|upload)/i.test(`${source.classType} ${parameter}`)) return [];
            return [{ nodeId: source.id, fieldName, sort: imageBindingOrder(parameter, consumerIndex * 100 + parameterIndex) }];
        }),
    )
        .sort((a, b) => a.sort - b.sort)
        .filter((binding, index, all) => all.findIndex((item) => item.nodeId === binding.nodeId && item.fieldName === binding.fieldName) === index)
        .map(({ nodeId, fieldName }) => ({ nodeId, fieldName }));
    const imageBindings = linkedImageBindings.length
        ? linkedImageBindings
        : nodes
              .flatMap((node) => (/(image|load|reference|upload)/i.test(node.classType) && imageInputField(node) ? [{ nodeId: node.id, fieldName: imageInputField(node)! }] : []))
              .filter((binding, index, all) => all.findIndex((item) => item.nodeId === binding.nodeId && item.fieldName === binding.fieldName) === index);
    const mediaBindings = (kind: "video" | "audio") =>
        nodes
            .flatMap((consumer) =>
                Object.entries(consumer.inputs).flatMap(([parameter, value]) => {
                    if (!new RegExp(`ref_${kind}s?\\.|${kind}s?[_\\d]`, "i").test(parameter) || !Array.isArray(value) || typeof value[0] !== "string") return [];
                    const source = byId.get(value[0]);
                    const fieldName = source && mediaInputField(source, kind);
                    return source && fieldName ? [{ nodeId: source.id, fieldName }] : [];
                }),
            )
            .filter((binding, index, all) => all.findIndex((item) => item.nodeId === binding.nodeId && item.fieldName === binding.fieldName) === index);

    const workflowFields: RunningHubWorkflowField[] = [];
    const h3Node = nodes.find((node) => /MiniMaxH3ReferenceToVideo/i.test(node.classType));
    if (h3Node) {
        const resolution = linkedNode(h3Node, "width", byId) || linkedNode(h3Node, "height", byId);
        const duration = findLinkedSource(linkedNode(h3Node, "length", byId), byId, (node) => /Primitive(Float|Int)/i.test(node.classType) && (typeof node.inputs.value === "number" || typeof node.inputs.value === "string"));
        const add = (field: RunningHubWorkflowField | null) => {
            if (field && !workflowFields.some((item) => item.key === field.key)) workflowFields.push(field);
        };
        if (resolution) {
            add(workflowField(resolution, "aspect_ratio", "画面比例", "text"));
            add(workflowField(resolution, "megapixels", "画面像素（MP）", "number", undefined, 0.1));
        }
        if (duration) add(workflowField(duration, "value", duration.title || "视频时长（秒）", "number", undefined, 1));
        add(workflowField(h3Node, "ref_image_size", "参考图尺寸", "text"));
        const sampler = nodes.find((node) => /KSamplerSelect/i.test(node.classType));
        if (sampler) add(workflowField(sampler, "sampler_name", sampler.title || "采样器", "text"));
        const seed = nodes.find((node) => /RandomNoise/i.test(node.classType));
        if (seed) add(workflowField(seed, "noise_seed", seed.title || "随机种子", "number", undefined, 1));
        const secondPass = nodes.find((node) => /easy float/i.test(node.classType) && /二采|倍数/i.test(node.title));
        if (secondPass) add(workflowField(secondPass, "value", secondPass.title, "number", undefined, 0.1));
    }
    const videoBindings = mediaBindings("video");
    const audioBindings = mediaBindings("audio");
    return { promptBinding, imageBindings, videoBindings, audioBindings, workflowFields, workflowPreview: { imageSlots: imageBindings.length, videoSlots: videoBindings.length, audioSlots: audioBindings.length, secondPassFieldKey: workflowFields.find((item) => /二采/.test(item.label))?.key } };
}

/** API-format 负责可执行字段，完整 workflow JSON 负责保留所有素材槽位与界面预览。 */
export function mergeRunningHubWorkflowBindings(api: WorkflowBindings, workflow: WorkflowBindings | null): WorkflowBindings {
    if (!workflow) return api;
    const fields = [...workflow.workflowFields, ...api.workflowFields.filter((field) => !workflow.workflowFields.some((item) => item.key === field.key))];
    const imageBindings = workflow.imageBindings.length >= api.imageBindings.length ? workflow.imageBindings : api.imageBindings;
    const videoBindings = workflow.videoBindings.length >= api.videoBindings.length ? workflow.videoBindings : api.videoBindings;
    const audioBindings = workflow.audioBindings.length >= api.audioBindings.length ? workflow.audioBindings : api.audioBindings;
    return {
        promptBinding: api.promptBinding || workflow.promptBinding,
        imageBindings,
        videoBindings,
        audioBindings,
        workflowFields: fields,
        workflowPreview: {
            imageSlots: imageBindings.length,
            videoSlots: videoBindings.length,
            audioSlots: audioBindings.length,
            secondPassFieldKey: fields.find((field) => /二采/.test(field.label))?.key,
        },
    };
}

export function runningHubWorkflowId(value: string) {
    const detailId = value.match(/api-detail\/(\d{12,})/i)?.[1];
    return detailId || value.match(/\d{12,}/)?.[0] || "";
}

/** AI 应用只接受其详情页、API 手册或数字 ID；工作流链接不能误导入为 AI 应用。 */
export function runningHubAiAppId(value: string) {
    const source = value.trim();
    if (/^\d{12,}$/.test(source)) return source;
    try {
        const url = new URL(source);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        if (host !== "runninghub.cn" && host !== "runninghub.ai") return "";
        const path = url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, "");
        const detailId = path.match(/^\/ai-detail\/(\d{12,})\/?$/i)?.[1];
        const apiId = path.match(/^\/call-api\/api-detail\/(\d{12,})\/?$/i)?.[1];
        return detailId || (url.searchParams.get("apiType") === "4" ? apiId || "" : "");
    } catch {
        return "";
    }
}

function appPayloadData(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.nodeInfoList)) return record;
    const data = record.data;
    return data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>).nodeInfoList)
        ? data as Record<string, unknown>
        : null;
}

function decodeAppFieldData(value: unknown) {
    if (typeof value !== "string" || value.length > 64 * 1024 || !/^\s*[\[{]/.test(value)) return value;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return undefined;
    }
}

function appFieldSettings(field: RawRunningHubAppField) {
    const decoded = decodeAppFieldData(field.fieldData);
    return Array.isArray(decoded) ? decoded[1] : decoded;
}

type RunningHubAppFieldOption = { value: string | number; label?: string };

function appFieldOptions(field: RawRunningHubAppField): RunningHubAppFieldOption[] {
    const decoded = decodeAppFieldData(field.fieldData);
    const settings = appFieldSettings(field);
    const candidate = [
        field.options,
        field.choices,
        field.values,
        field.list,
        settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).options : undefined,
        Array.isArray(settings) ? settings : undefined,
        Array.isArray(decoded) ? decoded : undefined,
    ].find(Array.isArray);
    if (!Array.isArray(candidate)) return [];
    const options = candidate.flatMap((value) => {
        if (typeof value === "string" || typeof value === "number") return [{ value }];
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const item = value as Record<string, unknown>;
        const resolved = item.value ?? item.id ?? item.index ?? item.fastIndex ?? item.label ?? item.name;
        const label = item.description ?? item.descriptionCn ?? item.label ?? item.name;
        return typeof resolved === "string" || typeof resolved === "number" ? [{ value: resolved, ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}) }] : [];
    });
    return [...options.reduce((result, option) => {
        const key = JSON.stringify(option.value);
        const previous = result.get(key);
        if (!previous || !previous.label && option.label) result.set(key, option);
        return result;
    }, new Map<string, RunningHubAppFieldOption>()).values()];
}

function appMediaKind(field: RawRunningHubAppField) {
    const settings = appFieldSettings(field);
    const setting = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : undefined;
    for (const kind of ["image", "video", "audio"] as const) {
        if (field[`${kind}_upload`] === true || setting?.[`${kind}_upload`] === true) return kind;
    }
    const declared = `${field.fieldType || ""} ${field.valueType || ""}`.toLowerCase();
    const name = String(field.fieldName || "").toLowerCase();
    if (/image|picture|photo|mask/.test(declared) || /image|picture|photo|mask/.test(name)) return "image";
    if (/video|movie/.test(declared) || /video|movie/.test(name)) return "video";
    if (/audio|sound|voice|music/.test(declared) || /audio|sound|voice|music/.test(name)) return "audio";
    return undefined;
}

function appFieldValue(field: RawRunningHubAppField, type: RunningHubWorkflowField["type"], options: Array<string | number>) {
    const raw = field.fieldValue ?? field.defaultValue ?? field.value;
    if (type === "boolean") return typeof raw === "boolean" ? raw : String(raw).toLowerCase() === "true";
    if (type === "number") return Number.isFinite(Number(raw)) ? Number(raw) : 0;
    if (type === "select") return options.find((option) => String(option) === String(raw)) ?? options[0] ?? "";
    return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
}

function appFieldType(field: RawRunningHubAppField, options: Array<string | number>): RunningHubWorkflowField["type"] {
    const declared = `${field.fieldType || ""} ${field.valueType || ""}`.toLowerCase();
    if (/boolean|bool|toggle/.test(declared) || typeof (field.fieldValue ?? field.defaultValue ?? field.value) === "boolean") return "boolean";
    if (/int|integer|float|double|number/.test(declared) || typeof (field.fieldValue ?? field.defaultValue ?? field.value) === "number") return "number";
    if (/combo|select|list|enum|switch/.test(declared) || options.length) return "select";
    return "text";
}

function appCapability(info: Record<string, unknown>, fields: RawRunningHubAppField[]): Extract<ModelCapability, "image" | "video" | "audio"> {
    const describe = (value: unknown): string => Array.isArray(value) ? value.map(describe).join(" ") : value && typeof value === "object" ? describe((value as Record<string, unknown>).name ?? (value as Record<string, unknown>).label ?? (value as Record<string, unknown>).value) : String(value || "");
    const explicit = [info.category, info.categoryName, info.appCategory, info.appType, info.type, info.tags, info.labels].map(describe).join(" ").toLowerCase();
    const fallback = `${info.appName || info.webappName || info.name || info.title || ""} ${fields.map((field) => `${field.fieldName || ""} ${field.fieldType || ""} ${field.label || ""}`).join(" ")}`.toLowerCase();
    const source = explicit || fallback;
    if (/video|movie|film|视频|影片|成片|图生视频|文生视频/.test(source)) return "video";
    if (/audio|sound|voice|speech|music|音频|声音|语音|配音|音乐/.test(source)) return "audio";
    return "image";
}

/** 从 RunningHub AI 应用实际开放的 nodeInfoList 创建端口与参数，绝不根据应用名称虚构字段。 */
export function parseRunningHubAiApp(payload: unknown, appId: string): RunningHubAiAppImport {
    if (!/^\d{12,}$/.test(appId)) throw new Error("AI 应用 ID 必须是数字 ID");
    const info = appPayloadData(payload);
    if (!info) throw new Error("RunningHub 未返回 AI 应用公开字段");
    const rawFields = info.nodeInfoList as RawRunningHubAppField[];
    if (rawFields.length > 256) throw new Error("RunningHub AI 应用开放字段超过 256 项");
    const seen = new Set<string>();
    const imageBindings: RunningHubNodeBinding[] = [];
    const videoBindings: RunningHubNodeBinding[] = [];
    const audioBindings: RunningHubNodeBinding[] = [];
    const workflowFields: RunningHubWorkflowField[] = [];
    let promptBinding: RunningHubNodeBinding | undefined;

    for (const field of rawFields) {
        const nodeId = String(field.nodeId || "").trim();
        const fieldName = String(field.fieldName || "").trim();
        if (!/^\d{1,128}$/.test(nodeId) || !/^[A-Za-z][A-Za-z0-9._-]{0,159}$/.test(fieldName)) continue;
        const identity = `${nodeId}.${fieldName}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const binding = { nodeId, fieldName };
        const media = appMediaKind(field);
        if (media === "image") {
            imageBindings.push(binding);
            continue;
        }
        if (media === "video") {
            videoBindings.push(binding);
            continue;
        }
        if (media === "audio") {
            audioBindings.push(binding);
            continue;
        }
        if (!promptBinding && /^(prompt|text|positive_prompt|positive|description)$/i.test(fieldName)) {
            promptBinding = binding;
            continue;
        }
        const optionItems = appFieldOptions(field);
        const options = optionItems.map((option) => option.value);
        const optionLabels = Object.fromEntries(optionItems.flatMap((option) => option.label ? [[String(option.value), option.label]] : []));
        const type = appFieldType(field, options);
        const value = appFieldValue(field, type, options);
        const min = Number(field.min ?? (appFieldSettings(field) as Record<string, unknown> | undefined)?.min);
        const max = Number(field.max ?? (appFieldSettings(field) as Record<string, unknown> | undefined)?.max);
        const step = Number(field.step ?? (appFieldSettings(field) as Record<string, unknown> | undefined)?.step);
        workflowFields.push({
            ...binding,
            key: identity,
            label: String(field.label || field.name || field.description || fieldName).trim().slice(0, 120) || fieldName,
            type,
            defaultValue: value,
            ...(options.length ? { options } : {}),
            ...(Object.keys(optionLabels).length ? { optionLabels } : {}),
            ...(Number.isFinite(min) ? { min } : {}),
            ...(Number.isFinite(max) ? { max } : {}),
            ...(Number.isFinite(step) && step > 0 ? { step } : {}),
        });
    }
    if (!seen.size) throw new Error("RunningHub AI 应用没有返回可用字段");
    const name = String(info.appName || info.webappName || info.name || info.title || `AI 应用 ${appId}`).trim().slice(0, 120) || `AI 应用 ${appId}`;
    return {
        appId,
        name,
        capability: appCapability(info, rawFields),
        bindings: {
            promptBinding,
            imageBindings,
            videoBindings,
            audioBindings,
            workflowFields,
            workflowPreview: { imageSlots: imageBindings.length, videoSlots: videoBindings.length, audioSlots: audioBindings.length },
        },
    };
}

/** 已经保存到本地的旧版 H3 导入项没有字段快照；用其已发布 API 的真实节点恢复设置面板。 */
export function defaultRunningHubWorkflowFields(target: string): RunningHubWorkflowField[] {
    if (target === "2086579374731649025") {
        return [
            { nodeId: "130", fieldName: "aspect", key: "130.aspect", label: "画面比例", type: "select", defaultValue: "adaptive", options: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] },
            { nodeId: "130", fieldName: "megapixels", key: "130.megapixels", label: "画面像素（MP）", type: "number", defaultValue: 1, step: 0.1 },
            { nodeId: "130", fieldName: "duration_seconds", key: "130.duration_seconds", label: "视频时长（秒）", type: "number", defaultValue: 7, step: 1 },
            { nodeId: "130", fieldName: "ref_image_size", key: "130.ref_image_size", label: "参考图尺寸", type: "select", defaultValue: "match", options: ["match", "max", "min"] },
        ];
    }
    if (target !== "2092878871120142337") return [];
    return [
        { nodeId: "252", fieldName: "aspect_ratio", key: "252.aspect_ratio", label: "画面比例", type: "text", defaultValue: "16:9 (Widescreen)" },
        { nodeId: "252", fieldName: "megapixels", key: "252.megapixels", label: "画面像素（MP）", type: "number", defaultValue: 0.5, step: 0.1 },
        { nodeId: "259", fieldName: "value", key: "259.value", label: "视频时长（秒）", type: "number", defaultValue: 10, step: 1 },
        { nodeId: "265", fieldName: "ref_image_size", key: "265.ref_image_size", label: "参考图尺寸", type: "text", defaultValue: "max" },
        { nodeId: "255", fieldName: "sampler_name", key: "255.sampler_name", label: "采样器", type: "text", defaultValue: "euler" },
        { nodeId: "256", fieldName: "noise_seed", key: "256.noise_seed", label: "随机种子", type: "number", defaultValue: 629900698231524, step: 1 },
        { nodeId: "283", fieldName: "value", key: "283.value", label: "二采倍数", type: "number", defaultValue: 1.5, step: 0.1 },
    ];
}

/** 已保存的 SeedVR2.5 AI 应用早期未存储 fieldData 的显示名；补齐公开像素标签但仍提交原始 index。 */
export function defaultRunningHubAiAppFields(target: string): RunningHubWorkflowField[] {
    if (target !== RUNNING_HUB_SEEDVR_APP_ID) return [];
    return [{
        nodeId: "82",
        fieldName: "index",
        key: RUNNING_HUB_SEEDVR_PIXEL_FIELD_KEY,
        label: "像素选择",
        type: "select",
        defaultValue: RUNNING_HUB_SEEDVR_DEFAULT_PIXEL,
        options: [6, 5, 2, 1, 4, 3],
        optionLabels: { "6": "8k像素", "5": "6k像素", "2": "2k像素", "1": "1k像素", "4": "4k像素", "3": "3k像素" },
    }];
}

function defaultRunningHubWorkflowBindings(target: string): WorkflowBindings | null {
    if (target !== "2086579374731649025") return null;
    const imageBindings = ["first_frame", "last_frame", ...Array.from({ length: 9 }, (_, index) => `ref_image_${index + 1}`)].map((fieldName) => ({ nodeId: "130", fieldName }));
    const videoBindings = Array.from({ length: 3 }, (_, index) => ({ nodeId: "130", fieldName: `ref_video_${index + 1}` }));
    const audioBindings = Array.from({ length: 3 }, (_, index) => ({ nodeId: "130", fieldName: `ref_audio_${index + 1}` }));
    return {
        promptBinding: { nodeId: "130", fieldName: "prompt" },
        imageBindings,
        videoBindings,
        audioBindings,
        workflowFields: defaultRunningHubWorkflowFields(target),
        workflowPreview: { imageSlots: imageBindings.length, videoSlots: videoBindings.length, audioSlots: audioBindings.length },
    };
}

function runningHubTaskScript(resource: RunningHubResource, capability: "image" | "video" | "audio") {
    const resourceJson = JSON.stringify(resource);
    const imageField = capability === "video" ? "firstFrameUrl" : "imageUrls";
    const standardBody =
        capability === "audio"
            ? `{ prompt }`
            : resource.target.includes("text-to-image")
              ? `{ prompt, aspectRatio: imageAspectRatio }`
              : resource.target.includes("image-to-image")
                ? `{ prompt, imageUrls, aspectRatio: imageAspectRatio, resolution: "1k" }`
                : resource.target.includes("text-to-video")
                  ? `{ prompt, duration: Number(params.seconds) || 6, ratio: params.ratio === "auto" ? "16:9" : params.ratio, resolution: params.resolution, generateAudio: Boolean(params.generateAudio) }`
                  : `{ prompt, ${imageField}: imageUrls[0], duration: Number(params.seconds) || 6, ratio: params.ratio === "auto" ? "16:9" : params.ratio, resolution: params.resolution, generateAudio: Boolean(params.generateAudio) }`;
    return `const resource = ${resourceJson};
const local = globalThis.location.origin;
const imageAspectRatio = ({ "1024x1024": "1:1", "1024x1536": "2:3", "1536x1024": "3:2", "1024x1365": "3:4", "1365x1024": "4:3", "1024x1792": "9:16", "1792x1024": "16:9" })[params.size] || "1:1";
const upload = async (dataUrl, index) => {
  const uploaded = await request({ method: "post", url: local + "/api/runninghub/upload", headers: { "Content-Type": "application/json" }, data: { apiKey, dataUrl, fileName: "reference-" + (index + 1) + ".png" } });
  const url = uploaded.download_url || uploaded.data?.download_url || uploaded.url || uploaded.data?.url;
  if (!url) throw new Error("RunningHub 未返回已上传图片地址");
  return url;
};
const imageUrls = await Promise.all(images.map(upload));
const task = await request({ method: "post", url: local + "/api/runninghub/task", headers: { "Content-Type": "application/json" }, data: { apiKey, kind: resource.kind, target: resource.target, body: ${standardBody} } });
const taskId = task.taskId || task.data?.taskId;
if (!taskId) throw new Error(task.errorMessage || task.message || "RunningHub 未返回任务 ID");
const collectUrls = (value, urls = []) => {
  if (typeof value === "string" && /^https?:/i.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => { if (/url|file|image|video|audio|result/i.test(key)) collectUrls(item, urls); });
  return [...new Set(urls)];
};
return await poll(
  () => request({ method: "post", url: local + "/api/runninghub/query", headers: { "Content-Type": "application/json" }, data: { apiKey, taskId, keyType: resource.kind === "standard" ? "enterprise" : "consumer" } }),
  (state) => {
    const status = String(state.status || state.data?.status || "").toUpperCase();
    if (status === "FAILED" || status === "ERROR" || status === "CANCELLED") throw new Error(state.errorMessage || state.data?.errorMessage || state.message || "RunningHub 任务失败");
    if (status !== "SUCCESS" && status !== "COMPLETED") return null;
    const urls = collectUrls(state.results || state.data?.results || state);
    return urls.length ? urls : null;
  },
  { intervalMs: 2500, timeoutMs: 300000 },
);`;
}

export function createRunningHubStandardModel(name: string, capability: Extract<ModelCapability, "image" | "video" | "audio">, target: string): ChannelModel {
    const runningHub: RunningHubResource = { kind: "standard", target };
    return { name, capability, runningHub, script: runningHubTaskScript(runningHub, capability) };
}

export function runningHubWorkflowScript(resource: RunningHubResource) {
    const resourceJson = JSON.stringify(resource);
    return `const resource = ${resourceJson};
const local = globalThis.location.origin;
const uploadMedia = async (dataUrl, fileName) => {
  const uploaded = await request({ method: "post", url: local + "/api/runninghub/upload", headers: { "Content-Type": "application/json" }, data: { apiKey, dataUrl, fileName } });
  const fileNameResult = uploaded.fileName || uploaded.data?.fileName || uploaded.filename || uploaded.data?.filename;
  if (!fileNameResult) throw new Error(uploaded.message || uploaded.msg || "RunningHub 未返回上传文件路径");
  return fileNameResult;
};
const uploadedImages = await Promise.all(images.map((dataUrl, index) => uploadMedia(dataUrl, "reference-image-" + (index + 1) + ".png")));
const uploadedVideos = await Promise.all((params.referenceVideos || []).map((dataUrl, index) => uploadMedia(dataUrl, "reference-video-" + (index + 1) + ".mp4")));
const uploadedAudios = await Promise.all((params.referenceAudios || []).map((dataUrl, index) => uploadMedia(dataUrl, "reference-audio-" + (index + 1) + ".mp3")));
const nodeInfoList = [];
if (resource.promptBinding && prompt) nodeInfoList.push({ nodeId: resource.promptBinding.nodeId, fieldName: resource.promptBinding.fieldName, fieldValue: prompt });
const imageBindings = params.runningHubWorkflowBindings?.image || (resource.imageBindings?.length ? resource.imageBindings : resource.imageBinding ? [resource.imageBinding] : []);
const frameBindings = imageBindings.filter((binding) => /^(first_frame|last_frame)$/i.test(binding.fieldName));
const referenceImageBindings = imageBindings.filter((binding) => /^ref_image_\\d+$/i.test(binding.fieldName));
const frameMode = params.videoMode !== "reference" && uploadedImages.length <= 2;
const frameSlots = params.videoFrameSlots || {};
const orderedImageBindings = frameMode && frameBindings.length
  ? [frameSlots.first ? frameBindings.find((binding) => binding.fieldName === "first_frame") : undefined, frameSlots.last ? frameBindings.find((binding) => binding.fieldName === "last_frame") : undefined].filter(Boolean)
  : referenceImageBindings.length ? referenceImageBindings : imageBindings;
orderedImageBindings.forEach((binding, index) => {
  const fileName = uploadedImages[index];
  if (fileName) nodeInfoList.push({ nodeId: binding.nodeId, fieldName: binding.fieldName, fieldValue: fileName });
});
const videoBindings = params.runningHubWorkflowBindings?.video || resource.videoBindings || [];
videoBindings.forEach((binding, index) => {
  if (uploadedVideos[index]) nodeInfoList.push({ nodeId: binding.nodeId, fieldName: binding.fieldName, fieldValue: uploadedVideos[index] });
});
const audioBindings = params.runningHubWorkflowBindings?.audio || resource.audioBindings || [];
audioBindings.forEach((binding, index) => {
  if (uploadedAudios[index]) nodeInfoList.push({ nodeId: binding.nodeId, fieldName: binding.fieldName, fieldValue: uploadedAudios[index] });
});
if (resource.target === "2086579374731649025") {
  const media = [];
  const addStateMedia = (fieldName, fileName, kind) => {
    if (!fileName) return;
    media.push([fieldName, { name: fileName, kind, ...(kind === "audio" ? { trimStart: 0, trimEnd: null } : {}) }]);
  };
  orderedImageBindings.forEach((binding, index) => addStateMedia(binding.fieldName, uploadedImages[index], "image"));
  videoBindings.forEach((binding, index) => addStateMedia(binding.fieldName, uploadedVideos[index], "video"));
  audioBindings.forEach((binding, index) => addStateMedia(binding.fieldName, uploadedAudios[index], "audio"));
  const mode = params.videoMode === "reference" ? "all_reference" : "text_keyframes";
  nodeInfoList.push({ nodeId: "130", fieldName: "main_mode", fieldValue: mode });
  nodeInfoList.push({
    nodeId: "130",
    fieldName: "gh_state_json",
    fieldValue: JSON.stringify({ mode, media, prompt, prompts: { [mode]: prompt, ...(mode === "text_keyframes" ? { all_reference: "" } : {}) }, advanced: false }),
  });
}
for (const field of resource.workflowFields || []) {
  const hasOverride = Object.prototype.hasOwnProperty.call(params.workflowValues || {}, field.key);
  const value = hasOverride ? params.workflowValues[field.key] : resource.kind === "app" ? field.defaultValue : undefined;
  if (value !== undefined && value !== null && value !== "") nodeInfoList.push({ nodeId: field.nodeId, fieldName: field.fieldName, fieldValue: value });
}
const rawRunOptions = params.runningHubWorkflowRunOptions || {};
const instanceType = ["default", "plus", "ultra"].includes(rawRunOptions.instanceType) ? rawRunOptions.instanceType : "default";
const retainSeconds = Number(rawRunOptions.retainSeconds);
const webhookUrl = String(rawRunOptions.webhookUrl || "").trim();
const task = await request({ method: "post", url: local + "/api/runninghub/task", headers: { "Content-Type": "application/json" }, data: {
  apiKey,
  kind: resource.kind,
  target: resource.target,
  nodeInfoList,
  addMetadata: rawRunOptions.addMetadata !== false,
  instanceType,
  usePersonalQueue: Boolean(rawRunOptions.usePersonalQueue),
  ...(Number.isInteger(retainSeconds) && retainSeconds >= 10 && retainSeconds <= 180 ? { retainSeconds } : {}),
  ...(webhookUrl && /^https?:\\/\\//i.test(webhookUrl) ? { webhookUrl } : {}),
} });
const taskId = task.taskId || task.data?.taskId;
if (!taskId) throw new Error(task.errorMessage || task.message || task.msg || "RunningHub 未返回任务 ID");
const collectUrls = (value, urls = []) => {
  if (typeof value === "string" && /^https?:/i.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => { if (/url|file|image|video|audio|result/i.test(key)) collectUrls(item, urls); });
  return [...new Set(urls)];
};
return await poll(
  () => request({ method: "post", url: local + "/api/runninghub/query", headers: { "Content-Type": "application/json" }, data: { apiKey, taskId, keyType: "consumer" } }),
  (state) => {
    const status = String(state.status || state.data?.status || "").toUpperCase();
    if (status === "FAILED" || status === "ERROR" || status === "CANCELLED") throw new Error(state.errorMessage || state.data?.errorMessage || state.message || "RunningHub 任务失败");
    if (status !== "SUCCESS" && status !== "COMPLETED") return null;
    const urls = collectUrls(state.results || state.data?.results || state);
    return urls.length ? urls : null;
  },
  { intervalMs: 2500, timeoutMs: 300000 },
);`;
}

export function createRunningHubWorkflowModel(target: string, bindings: WorkflowBindings, name = `工作流 ${target}`, title = name): ChannelModel {
    const knownWorkflow = defaultRunningHubWorkflowBindings(target);
    const resolvedBindings = knownWorkflow ? mergeRunningHubWorkflowBindings(knownWorkflow, bindings) : bindings;
    const runningHub: RunningHubResource = {
        kind: "workflow",
        target,
        title: title.trim() || name,
        promptBinding: resolvedBindings.promptBinding,
        imageBindings: resolvedBindings.imageBindings,
        videoBindings: resolvedBindings.videoBindings,
        audioBindings: resolvedBindings.audioBindings,
        workflowFields: [...resolvedBindings.workflowFields, ...defaultRunningHubWorkflowFields(target).filter((fallback) => !resolvedBindings.workflowFields.some((field) => field.key === fallback.key))],
        workflowPreview: resolvedBindings.workflowPreview,
    };
    return { name, capability: "video", runningHub, script: runningHubWorkflowScript(runningHub) };
}

export function createRunningHubAiAppModel(app: RunningHubAiAppImport, name = app.name): ChannelModel {
    const runningHub: RunningHubResource = {
        kind: "app",
        target: app.appId,
        title: name.trim() || app.name,
        promptBinding: app.bindings.promptBinding,
        imageBindings: app.bindings.imageBindings,
        videoBindings: app.bindings.videoBindings,
        audioBindings: app.bindings.audioBindings,
        workflowFields: app.bindings.workflowFields,
        workflowPreview: app.bindings.workflowPreview,
    };
    return { name, capability: app.capability, runningHub, script: runningHubWorkflowScript(runningHub) };
}
