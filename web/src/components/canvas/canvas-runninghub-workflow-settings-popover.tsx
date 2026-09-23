import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Image as ImageIcon, Link2, Music2, PanelsTopLeft, Settings2, Video } from "lucide-react";
import { Button, Checkbox, Input, InputNumber, Segmented, Select, Slider, Switch } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { runningHubWorkflowPortId } from "@/components/canvas/canvas-runninghub-workflow-ports";
import { findChannelModel, type AiConfig, type RunningHubResource, type RunningHubWorkflowField, type RunningHubWorkflowFieldValue } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { RUNNING_HUB_ASPECT_RATIO_OPTIONS, RUNNING_HUB_WORKFLOW_INSTANCE_TYPES, resolveRunningHubWorkflowMaterialEnabledPorts, resolveRunningHubWorkflowRunOptions, runningHubWorkflowFieldControl, runningHubWorkflowInstanceLabel, runningHubWorkflowNumberLimits, toggleRunningHubWorkflowMaterialPort, type RunningHubWorkflowMaterialSlot, type RunningHubWorkflowRunOptions } from "@/components/canvas/runninghub-workflow-settings";

type CanvasRunningHubWorkflowSettingsPopoverProps = {
    config: AiConfig;
    values?: Record<string, RunningHubWorkflowFieldValue>;
    onChange: (values: Record<string, RunningHubWorkflowFieldValue>) => void;
    runOptions?: RunningHubWorkflowRunOptions;
    onRunOptionsChange?: (options: RunningHubWorkflowRunOptions) => void;
    materialSlots?: RunningHubWorkflowMaterialSlot[];
    enabledMaterialPorts?: string[];
    onMaterialEnabledPortsChange?: (ports?: string[]) => void;
    visibleFieldKeys?: string[];
    onVisibleFieldKeysChange?: (keys?: string[]) => void;
    buttonClassName?: string;
    buttonLabel?: string;
    hideParameters?: boolean;
    hideMaterials?: boolean;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

export function hasRunningHubWorkflowSettings(config: AiConfig) {
    const resource = findChannelModel(config, config.model)?.model.runningHub;
    return (resource?.kind === "workflow" || resource?.kind === "app") && Boolean(resource.workflowFields?.length);
}

export function CanvasRunningHubWorkflowSettingsPopover({ config, values, onChange, runOptions, onRunOptionsChange, materialSlots, enabledMaterialPorts, onMaterialEnabledPortsChange, visibleFieldKeys, onVisibleFieldKeysChange, buttonClassName, buttonLabel, hideParameters = false, hideMaterials = false, placement = "topLeft" }: CanvasRunningHubWorkflowSettingsPopoverProps) {
    const resource = findChannelModel(config, config.model)?.model.runningHub;
    const fields = resource?.kind === "workflow" || resource?.kind === "app" ? resource.workflowFields || [] : [];
    const preview = resource?.kind === "workflow" || resource?.kind === "app" ? resource.workflowPreview : undefined;
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    if (!fields.length) return null;
    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} onClick={() => setOpen((current) => !current)}>
                    <span className="truncate">{buttonLabel || `工作流设置 · ${fields.length} 项`}</span>
                </Button>
            </span>
            {open && buttonRect ? <WorkflowSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} fields={fields} preview={preview} resource={resource} values={values} onChange={onChange} runOptions={runOptions} onRunOptionsChange={onRunOptionsChange} materialSlots={materialSlots} enabledMaterialPorts={enabledMaterialPorts} onMaterialEnabledPortsChange={onMaterialEnabledPortsChange} visibleFieldKeys={visibleFieldKeys} onVisibleFieldKeysChange={onVisibleFieldKeysChange} hideParameters={hideParameters} hideMaterials={hideMaterials} /> : null}
        </>
    );
}

function WorkflowSettingsPortal({ buttonRect, panelRef, placement, theme, fields, preview, resource, values, onChange, runOptions, onRunOptionsChange, materialSlots, enabledMaterialPorts, onMaterialEnabledPortsChange, visibleFieldKeys, onVisibleFieldKeysChange, hideParameters, hideMaterials }: { buttonRect: DOMRect; panelRef: RefObject<HTMLDivElement | null>; placement: CanvasRunningHubWorkflowSettingsPopoverProps["placement"]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; fields: RunningHubWorkflowField[]; preview?: { imageSlots: number; videoSlots: number; audioSlots: number }; resource?: RunningHubResource; values?: Record<string, RunningHubWorkflowFieldValue>; onChange: (values: Record<string, RunningHubWorkflowFieldValue>) => void; runOptions?: RunningHubWorkflowRunOptions; onRunOptionsChange?: (options: RunningHubWorkflowRunOptions) => void; materialSlots?: RunningHubWorkflowMaterialSlot[]; enabledMaterialPorts?: string[]; onMaterialEnabledPortsChange?: (ports?: string[]) => void; visibleFieldKeys?: string[]; onVisibleFieldKeysChange?: (keys?: string[]) => void; hideParameters: boolean; hideMaterials: boolean }) {
    const margin = 12;
    const gap = 8;
    const width = Math.min(520, window.innerWidth - margin * 2);
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const requestedLeft = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, requestedLeft));
    const availableAbove = buttonRect.top - gap - margin;
    const availableBelow = window.innerHeight - buttonRect.bottom - gap - margin;
    const prefersTop = placement?.startsWith("top");
    const openAbove = prefersTop ? availableAbove < 180 && availableBelow > availableAbove : availableBelow < 180 && availableAbove > availableBelow;
    const availableHeight = Math.max(180, Math.min(520, openAbove ? availableAbove : availableBelow));
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(openAbove ? { bottom: window.innerHeight - buttonRect.top + gap } : { top: buttonRect.bottom + gap }),
        maxHeight: availableHeight,
        background: theme.toolbar.panel,
        borderRadius: 14,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 14,
        overflowY: "auto",
        color: theme.node.text,
    } as const;
    const [tab, setTab] = useState<"materials" | "params" | "mapping" | "canvas">(hideParameters ? (hideMaterials ? "mapping" : "materials") : "params");
    const taskOptions = resolveRunningHubWorkflowRunOptions(runOptions);
    const setField = (field: RunningHubWorkflowField, raw: RunningHubWorkflowFieldValue | null) => onChange({ ...(values || {}), [field.key]: raw ?? "" });
    const clearField = (field: RunningHubWorkflowField) => {
        const next = { ...(values || {}) };
        delete next[field.key];
        onChange(next);
    };
    const setTaskOptions = (patch: Partial<RunningHubWorkflowRunOptions>) => onRunOptionsChange?.({ ...taskOptions, ...patch });
    const reset = () => {
        onChange({});
        onRunOptionsChange?.({});
    };
    const nodeIds = [...new Set(fields.map((field) => field.nodeId))];
    const visibleFieldSet = new Set(visibleFieldKeys || fields.map((field) => field.key));
    const setFieldVisible = (field: RunningHubWorkflowField, visible: boolean) => {
        const nextKeys = new Set(visibleFieldSet);
        if (visible) nextKeys.add(field.key);
        else nextKeys.delete(field.key);
        onVisibleFieldKeysChange?.(nextKeys.size === fields.length ? undefined : [...nextKeys]);
        if (!visible) clearField(field);
    };

    return createPortal(
        <div ref={panelRef} className="canvas-image-settings-popover" style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between gap-3">
                <div>
                    <div className="text-base font-semibold">{hideParameters ? "工作流详情" : "工作流参数"}</div>
                    <div className="mt-1 text-xs opacity-60">{hideParameters ? "参数与任务选项已直接显示在多参节点中；可在“画布节点”选择要显示的参数。" : "仅覆盖当前画布节点；参数按真实 nodeInfoList 提交，任务选项单独提交"}</div>
                </div>
                {!hideParameters ? <Button size="small" type="text" onClick={reset}>恢复默认</Button> : null}
            </div>
            <Segmented
                className="mt-4 w-full"
                size="small"
                value={tab}
                onChange={(value) => setTab(value as typeof tab)}
                options={[
                    ...(!hideParameters ? [{ value: "params", label: "参数" }] : []),
                    ...(!hideMaterials ? [{ value: "materials", label: "素材" }] : []),
                    { value: "mapping", label: "提交映射" },
                    { value: "canvas", label: "画布节点" },
                ]}
            />
            <div className="mt-4">
                {tab === "materials" && !hideMaterials ? <WorkflowMaterialSummary preview={preview} resource={resource} slots={materialSlots} enabledPorts={enabledMaterialPorts} onEnabledPortsChange={onMaterialEnabledPortsChange} theme={theme} /> : null}
                {tab === "params" && !hideParameters ? (
                    <WorkflowParameterFields fields={fields} values={values} theme={theme} taskOptions={taskOptions} resource={resource} onTaskOptionsChange={setTaskOptions} onChange={setField} onClear={clearField} />
                ) : null}
                {tab === "mapping" ? (
                    <div className="space-y-2">
                        <WorkflowTaskRequestSummary resource={resource} options={taskOptions} theme={theme} />
                        {fields.map((field) => (
                            <div key={field.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke }}>
                                <span className="font-mono opacity-60">#{field.nodeId}</span>
                                <div className="min-w-0"><div className="truncate font-medium">{field.label}</div><div className="mt-0.5 truncate opacity-55">{field.fieldName} → {Object.prototype.hasOwnProperty.call(values || {}, field.key) ? String(values?.[field.key]) : "使用工作流默认值（不提交）"}</div></div>
                            </div>
                        ))}
                    </div>
                ) : null}
                {tab === "canvas" ? (
                    <div className="space-y-3 text-sm">
                        <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}><div className="flex items-center gap-2 font-medium"><PanelsTopLeft className="size-4" />当前工作流节点</div><p className="mb-0 mt-1 text-xs opacity-60">提示词、图片 1、图片 2、视频 1、音频 1 等素材请在“连接素材”中逐槽位连接；这里不再把素材作为参数设置。</p></div>
                        {onVisibleFieldKeysChange ? <section className="overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke }}><div className="border-b px-3 py-2.5 text-sm font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>显示参数 <span className="ml-1 text-xs font-normal opacity-55">{visibleFieldSet.size}/{fields.length}</span></div>{fields.map((field) => <label key={field.key} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: theme.node.stroke }}><Checkbox checked={visibleFieldSet.has(field.key)} onChange={(event) => setFieldVisible(field, event.target.checked)} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{field.label}</span><span className="block truncate font-mono text-[11px] opacity-50">#{field.nodeId}.{field.fieldName}</span></span></label>)}</section> : null}
                        <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}><div className="flex items-center gap-2 font-medium"><Link2 className="size-4" />已识别 API 节点</div><div className="mt-2 flex flex-wrap gap-1.5">{nodeIds.map((id) => <span key={id} className="rounded-md border px-2 py-1 font-mono text-xs" style={{ borderColor: theme.node.stroke }}>#{id}</span>)}</div></div>
                    </div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

function WorkflowParameterFields({ fields, values, theme, taskOptions, resource, onTaskOptionsChange, onChange, onClear }: { fields: RunningHubWorkflowField[]; values?: Record<string, RunningHubWorkflowFieldValue>; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; taskOptions: ReturnType<typeof resolveRunningHubWorkflowRunOptions>; resource?: RunningHubResource; onTaskOptionsChange: (patch: Partial<RunningHubWorkflowRunOptions>) => void; onChange: (field: RunningHubWorkflowField, value: RunningHubWorkflowFieldValue | null) => void; onClear: (field: RunningHubWorkflowField) => void }) {
    return <div className="grid grid-cols-2 gap-3"><WorkflowTaskOptionsCard options={taskOptions} resource={resource} onChange={onTaskOptionsChange} theme={theme} />{fields.map((field) => <WorkflowFieldCard key={field.key} field={field} values={values} theme={theme} onChange={onChange} onClear={onClear} />)}</div>;
}

export function CanvasRunningHubWorkflowParameterFields({ fields, values, theme, onChange, onClear, className }: { fields: RunningHubWorkflowField[]; values?: Record<string, RunningHubWorkflowFieldValue>; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (field: RunningHubWorkflowField, value: RunningHubWorkflowFieldValue | null) => void; onClear: (field: RunningHubWorkflowField) => void; className?: string }) {
    return <div className={className || "grid grid-cols-2 gap-3"}>{fields.map((field) => <WorkflowFieldCard key={field.key} field={field} values={values} theme={theme} onChange={onChange} onClear={onClear} />)}</div>;
}

function WorkflowTaskOptionsCard({ options, resource, onChange, theme }: { options: ReturnType<typeof resolveRunningHubWorkflowRunOptions>; resource?: RunningHubResource; onChange: (patch: Partial<RunningHubWorkflowRunOptions>) => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const isApp = resource?.kind === "app";
    return <section className="col-span-2 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
        <div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-sm font-medium">任务运行</div><div className="mt-1 text-[11px] opacity-55">{isApp ? `POST /openapi/v2/run/ai-app/${resource?.target || "{AI 应用 ID}"}` : "POST /openapi/v2/run/workflow/{工作流 ID}"}</div></div><span className="font-mono text-[11px] opacity-45">任务请求</span></div>
        <div className={`grid gap-3 ${isApp ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            <label className="block text-xs"><span className="mb-1.5 block font-medium">运行实例</span><Select aria-label="运行实例" getPopupContainer={workflowDropdownContainer} className="w-full" value={options.instanceType} options={RUNNING_HUB_WORKFLOW_INSTANCE_TYPES.map((value) => ({ value, label: runningHubWorkflowInstanceLabel(value) }))} onChange={(instanceType) => onChange({ instanceType })} /></label>
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">个人独占队列</span><Switch aria-label="个人独占队列" size="small" checked={options.usePersonalQueue} onChange={(usePersonalQueue) => onChange({ usePersonalQueue })} /></div><div className="mt-1 text-[11px] opacity-55">usePersonalQueue</div></div>
            {!isApp ? <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">返回工作流元数据</span><Switch aria-label="返回工作流元数据" size="small" checked={options.addMetadata} onChange={(addMetadata) => onChange({ addMetadata })} /></div><div className="mt-1 text-[11px] opacity-55">addMetadata</div></div> : null}
        </div>
    </section>;
}

function WorkflowTaskRequestSummary({ resource, options, theme }: { resource?: RunningHubResource; options: ReturnType<typeof resolveRunningHubWorkflowRunOptions>; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const isApp = resource?.kind === "app";
    return <div className="rounded-xl border p-3 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><div className="font-medium">任务请求</div><div className="mt-1 font-mono opacity-60">{isApp ? `POST /openapi/v2/run/ai-app/${resource?.target || "{AI 应用 ID}"}` : `POST /openapi/v2/run/workflow/${resource?.target || "{工作流 ID}"}`}</div><div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">{!isApp ? <><span className="font-mono opacity-55">addMetadata</span><span>{String(options.addMetadata)}</span></> : null}<span className="font-mono opacity-55">nodeInfoList</span><span>下方真实节点字段与已启用素材槽位</span><span className="font-mono opacity-55">instanceType</span><span>{options.instanceType}</span><span className="font-mono opacity-55">usePersonalQueue</span><span>{String(options.usePersonalQueue)}</span></div></div>;
}

function WorkflowFieldCard({ field, values, theme, onChange, onClear }: { field: RunningHubWorkflowField; values?: Record<string, RunningHubWorkflowFieldValue>; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (field: RunningHubWorkflowField, value: RunningHubWorkflowFieldValue | null) => void; onClear: (field: RunningHubWorkflowField) => void }) {
    const control = runningHubWorkflowFieldControl(field);
    const limits = runningHubWorkflowNumberLimits(field);
    const overridden = Object.prototype.hasOwnProperty.call(values || {}, field.key);
    const value = values?.[field.key] ?? field.defaultValue;
    const wide = control === "seed" || control === "second-pass";
    const numberInput = <InputNumber aria-label={field.label} className="w-full" value={Number(value)} min={limits.min} max={limits.max} step={limits.step} onChange={(next) => onChange(field, next)} />;

    return <div className={`rounded-xl border p-3 ${wide ? "col-span-2" : ""}`} style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
        <div className="mb-2 flex items-start justify-between gap-2"><div className="text-base font-medium">{field.label}</div><span className="shrink-0 font-mono text-xs opacity-45">#{field.nodeId}.{field.fieldName}</span></div>
        {control === "aspect-ratio" ? <CanvasRunningHubWorkflowSelect ariaLabel={field.label} value={value} options={[...new Set([...RUNNING_HUB_ASPECT_RATIO_OPTIONS, String(value)])]} theme={theme} onChange={(next) => onChange(field, next)} /> : null}
        {control === "megapixels" ? numberInput : null}
        {control === "duration" ? <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3"><Slider aria-label={field.label} min={limits.min} max={limits.max} step={limits.step} value={Number(value)} onChange={(next) => onChange(field, Array.isArray(next) ? next[0] : next)} />{numberInput}</div> : null}
        {control === "seed" ? <div className="space-y-2"><div className="flex flex-wrap gap-2"><Button size="small" type={!overridden ? "primary" : "default"} onClick={() => onClear(field)}>每次随机</Button><Button size="small" type={overridden ? "primary" : "default"} onClick={() => { if (!overridden) onChange(field, Number(field.defaultValue)); }}>固定种子</Button></div><div className="flex gap-2"><InputNumber aria-label="固定随机种子" className="min-w-0 flex-1" disabled={!overridden} value={Number(value)} min={limits.min} step={limits.step} precision={0} onChange={(next) => onChange(field, next)} /><Button disabled={!overridden} onClick={() => onChange(field, Math.floor(Math.random() * 2_147_483_647))}>⚄</Button></div></div> : null}
        {control === "second-pass" ? <div className="flex items-center gap-3"><Switch checked={overridden} onChange={(enabled) => enabled ? onChange(field, Number(field.defaultValue)) : onClear(field)} /><span className="text-base">启用二采</span><div className="ml-auto w-32">{numberInput}</div></div> : null}
        {control === "default" && (field.type === "select" && field.options?.length ? <CanvasRunningHubWorkflowSelect ariaLabel={field.label} value={value} options={field.options} optionLabels={field.optionLabels} theme={theme} onChange={(next) => onChange(field, next)} /> : field.type === "number" ? numberInput : field.type === "boolean" ? <Switch aria-label={field.label} checked={Boolean(value)} onChange={(next) => onChange(field, next)} /> : <Input aria-label={field.label} value={String(value)} onChange={(event) => onChange(field, event.target.value)} className="!h-9 !rounded-lg" />)}
        <div className="mt-2 text-xs leading-4 opacity-55">{control === "duration" ? "可自定义 2–15 秒。" : control === "seed" ? (!overridden ? "随机模式不会提交该节点字段。" : "固定模式会提交该种子。") : control === "second-pass" ? "关闭时不覆盖该工作流字段。" : `真实节点字段 · ${overridden ? "本次覆盖" : "保持工作流默认"}`}</div>
    </div>;
}

export function CanvasRunningHubWorkflowSelect({ ariaLabel, value, options, optionLabels, theme, onChange, className, menuMinWidth = 208, menuPlacement = "auto", menuPortalContainer }: { ariaLabel: string; value: RunningHubWorkflowFieldValue; options: Array<string | number>; optionLabels?: Record<string, string>; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (value: string | number) => void; className?: string; menuMinWidth?: number; menuPlacement?: "auto" | "top" | "bottom"; menuPortalContainer?: () => HTMLElement | null }) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
    const selected = options.find((option) => String(option) === String(value)) ?? options[0];
    const menuHeight = Math.min(260, options.length * 42 + 16);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setTriggerRect(triggerRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    const openMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setTriggerRect(triggerRef.current?.getBoundingClientRect() || null);
        setOpen((current) => !current);
    };
    const choose = (option: string | number) => {
        onChange(option);
        setOpen(false);
    };
    const menu = open && triggerRect && typeof document !== "undefined"
        ? (() => {
            const width = Math.max(menuMinWidth, triggerRect.width);
            const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - width - 8));
            const fitsBelow = triggerRect.bottom + menuHeight + 8 <= window.innerHeight;
            const openAbove = menuPlacement === "top" || (menuPlacement === "auto" && !fitsBelow);
            const top = openAbove ? Math.max(8, triggerRect.top - menuHeight - 6) : triggerRect.bottom + 6;
            return createPortal(
                <div ref={menuRef} role="listbox" aria-label={`${ariaLabel}选项`} className="overflow-y-auto rounded-xl border p-1.5 shadow-2xl" style={{ position: "fixed", zIndex: 1300, left, top, width, maxHeight: menuHeight, background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                    {options.map((option) => {
                        const active = String(option) === String(value);
                        return <button key={`${typeof option}:${option}`} type="button" role="option" aria-selected={active} className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium transition" style={{ background: active ? theme.toolbar.activeBg : "transparent", color: active ? theme.toolbar.activeText : theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={() => choose(option)}>{workflowOptionLabel(option, optionLabels)}</button>;
                    })}
                </div>,
                menuPortalContainer?.() || document.body,
            );
        })()
        : null;

    return <><button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} className={className || "flex h-9 w-full items-center justify-between rounded-lg border px-3 text-left text-sm outline-none"} style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={openMenu}><span className="truncate">{workflowOptionLabel(selected, optionLabels)}</span><ChevronDown className="ml-2 size-4 shrink-0 opacity-65" /></button>{menu}</>;
}

function workflowOptionLabel(option: string | number | undefined, optionLabels?: Record<string, string>) {
    return (optionLabels?.[String(option)] || String(option ?? "")).replace(/^(\d+)k(?=像素$)/i, "$1K");
}

function workflowDropdownContainer(trigger: HTMLElement) {
    // 节点和详情面板本身都可滚动；把下拉层放在 body，避免被内部滚动容器裁掉。
    void trigger;
    return document.body;
}

function WorkflowMaterialSummary({ preview, resource, slots, enabledPorts, onEnabledPortsChange, theme }: { preview?: { imageSlots: number; videoSlots: number; audioSlots: number }; resource?: RunningHubResource; slots?: RunningHubWorkflowMaterialSlot[]; enabledPorts?: string[]; onEnabledPortsChange?: (ports?: string[]) => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const defaultSlots = resource?.kind === "workflow" || resource?.kind === "app" ? workflowMaterialSlots(resource) : [];
    const materialSlots = slots || defaultSlots;
    const enabled = resolveRunningHubWorkflowMaterialEnabledPorts(materialSlots, enabledPorts);
    const grouped = [
        { kind: "image" as const, label: "参考图", icon: ImageIcon, limit: preview?.imageSlots || materialSlots.filter((slot) => slot.kind === "image").length },
        { kind: "video" as const, label: "参考视频", icon: Video, limit: preview?.videoSlots || materialSlots.filter((slot) => slot.kind === "video").length },
        { kind: "audio" as const, label: "参考音频", icon: Music2, limit: preview?.audioSlots || materialSlots.filter((slot) => slot.kind === "audio").length },
    ];
    return <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs opacity-65"><span>每个开关对应一个真实素材槽位；关闭后不会上传或提交该槽位。</span>{enabledPorts ? <Button size="small" type="text" onClick={() => onEnabledPortsChange?.(undefined)}>恢复自动</Button> : <span>自动：已连接的素材</span>}</div>
        {grouped.map(({ kind, label, icon: Icon, limit }) => {
            const items = materialSlots.filter((slot) => slot.kind === kind);
            const activeCount = items.filter((slot) => enabled.includes(slot.portId.replace(/^(image|video|audio):(\d+):\d+:/, "$1:$2:"))).length;
            return <section key={kind} className="overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><span className="inline-flex items-center gap-2 text-sm font-medium"><Icon className="size-4" />{label}</span><span className="text-xs opacity-60">已启用 {activeCount}/{limit}</span></div>
                {items.length ? items.map((slot) => {
                    const normalized = slot.portId.replace(/^(image|video|audio):(\d+):\d+:/, "$1:$2:");
                    const isEnabled = enabled.includes(normalized);
                    const slotLabel = `${kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"} ${slot.index + 1}`;
                    return <div key={slot.portId} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: theme.node.stroke }}><Switch aria-label={`${slotLabel} 开关`} size="small" disabled={!onEnabledPortsChange} checked={isEnabled} onChange={(checked) => onEnabledPortsChange?.(toggleRunningHubWorkflowMaterialPort(enabled, slot.portId, checked))} /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{slotLabel}</div><div className="truncate font-mono text-[11px] opacity-50">#{slot.nodeId}.{slot.fieldName}</div></div><span className="shrink-0 text-xs opacity-55">{slot.connected ? "已连接" : "未连接"}</span></div>;
                }) : <div className="px-3 py-3 text-xs opacity-55">未导入可用槽位（上限 {limit}）。</div>}
            </section>;
        })}
    </div>;
}

function workflowMaterialSlots(resource: RunningHubResource): RunningHubWorkflowMaterialSlot[] {
    const bindings = {
        image: resource.imageBindings?.length ? resource.imageBindings : resource.imageBinding ? [resource.imageBinding] : [],
        video: resource.videoBindings || [],
        audio: resource.audioBindings || [],
    };
    return (["image", "video", "audio"] as const).flatMap((kind) => bindings[kind].flatMap((binding, index) => {
        const portId = runningHubWorkflowPortId(resource, kind, index);
        return portId ? [{ portId, kind, index, nodeId: binding.nodeId, fieldName: binding.fieldName, connected: false }] : [];
    }));
}
