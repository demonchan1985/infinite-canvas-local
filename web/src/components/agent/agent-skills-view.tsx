import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Collapse, Dropdown, Form, Input, Modal, Select, Switch, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { BookOpenText, Check, ChevronDown, CircleAlert, FilePenLine, Heart, LoaderCircle, LockKeyhole, MessageSquareText, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { localizeSkillDisplay } from "@/lib/skill-library-localization";
import { createCodexSkill, createCodexSkillDraft, deleteCodexSkill, fetchCodexSkill, fetchCodexSkillContent, importCodexSkill, postState, setCodexSkillEnabled, updateCodexSkill, type AgentSkillDetail, type AgentSkillDraft, type AgentSkillInterface, type AgentSkillScope, type AgentSkillSummary } from "@/services/api/canvas-agent";
import { useAgentSkillStore } from "@/stores/use-agent-skill-store";
import { useAgentStore, type AgentChatItem } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

type ScopeFilter = "all" | AgentSkillScope;
type SkillDraftSource = "conversation" | "canvas";
type SkillEditor = { mode: "create"; values?: SkillFormValues } | { mode: "edit"; detail: AgentSkillDetail };
type SkillFormValues = { name: string; description: string; instructions: string; displayName?: string; shortDescription?: string; defaultPrompt?: string };
type LibraryTab = "market" | "mine" | "created" | "favorites";
type SkillEnabledFilter = "all" | "enabled" | "disabled";

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const favoritesStorageKey = "topapis-inspired-canvas.skill-favorites";

export function AgentSkillsView({ clientId, presentation = "panel" }: { clientId: string; presentation?: "panel" | "library" }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { message, modal } = App.useApp();
    const connected = useAgentStore((state) => state.connected);
    const url = useAgentStore((state) => state.url);
    const token = useAgentStore((state) => state.token);
    const activeThreadId = useAgentStore((state) => state.activeThreadId);
    const hasConversation = useAgentStore((state) => hasSettledConversation(state.messages, state.activeThreadId));
    const hasCanvas = useAgentStore((state) => Boolean(state.canvasContext));
    const sending = useAgentStore((state) => state.sending);
    const waiting = useAgentStore((state) => state.waiting);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const skills = useAgentSkillStore((state) => state.skills);
    const selectedSkill = useAgentSkillStore((state) => state.selectedSkill);
    const loading = useAgentSkillStore((state) => state.loading);
    const loaded = useAgentSkillStore((state) => state.loaded);
    const errors = useAgentSkillStore((state) => state.errors);
    const draft = useAgentSkillStore((state) => state.draft);
    const generatingSource = useAgentSkillStore((state) => state.generatingSource);
    const loadSkills = useAgentSkillStore((state) => state.loadSkills);
    const selectSkill = useAgentSkillStore((state) => state.selectSkill);
    const clearSelection = useAgentSkillStore((state) => state.clearSelection);
    const setDraft = useAgentSkillStore((state) => state.setDraft);
    const setGeneratingSource = useAgentSkillStore((state) => state.setGeneratingSource);
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState<ScopeFilter>("all");
    const [editor, setEditor] = useState<SkillEditor | null>(null);
    const [saving, setSaving] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [createMenuOpen, setCreateMenuOpen] = useState(false);
    const [busySkill, setBusySkill] = useState("");
    const [errorsOpen, setErrorsOpen] = useState(false);
    const [libraryTab, setLibraryTab] = useState<LibraryTab>("market");
    const [enabledFilter, setEnabledFilter] = useState<SkillEnabledFilter>("all");
    const [favoritePaths, setFavoritePaths] = useState<string[]>(() => {
        try { return JSON.parse(window.localStorage.getItem(favoritesStorageKey) || "[]") as string[]; } catch { return []; }
    });
    const [importOpen, setImportOpen] = useState(false);
    const [importSource, setImportSource] = useState<"markdown" | "zip" | "github">("markdown");
    const [importUrl, setImportUrl] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [viewingSkill, setViewingSkill] = useState<AgentSkillSummary | null>(null);
    const [skillContent, setSkillContent] = useState("");
    const [contentLoading, setContentLoading] = useState(false);
    const confirmRef = useRef<{ destroy: () => void } | null>(null);
    const [form] = Form.useForm<SkillFormValues>();
    const endpoint = url.trim().replace(/\/$/, "");
    const filteredSkills = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return skills.filter((skill) => {
            if (scope !== "all" && skill.scope !== scope) return false;
            if (enabledFilter === "enabled" && !skill.enabled) return false;
            if (enabledFilter === "disabled" && skill.enabled) return false;
            if (libraryTab === "mine" && !skill.enabled) return false;
            if (libraryTab === "created" && !skill.managed) return false;
            if (libraryTab === "favorites" && !favoritePaths.includes(skill.path)) return false;
            return !keyword || [skill.name, skill.description, skill.interface?.displayName, skill.interface?.shortDescription, skill.shortDescription].some((value) => value?.toLowerCase().includes(keyword));
        });
    }, [enabledFilter, favoritePaths, libraryTab, query, scope, skills]);
    const enabledCount = skills.filter((skill) => skill.enabled).length;
    const disabledCount = skills.length - enabledCount;

    useEffect(() => { window.localStorage.setItem(favoritesStorageKey, JSON.stringify(favoritePaths)); }, [favoritePaths]);

    const editorValues = editor?.mode === "edit" ? skillFormValues(editor.detail) : editor?.values;

    const refresh = (forceReload = true) => loadSkills(endpoint, token, forceReload);
    const connectionIsCurrent = (revision: number) => {
        const agent = useAgentStore.getState();
        const skillsState = useAgentSkillStore.getState();
        return skillsState.connectionRevision === revision && agent.connected && agent.url.trim().replace(/\/$/, "") === endpoint && agent.token === token;
    };
    useEffect(() => {
        if (draft) setEditor((current) => current || { mode: "create", values: draftFormValues(draft) });
    }, [draft]);
    useEffect(() => {
        if (connected) return;
        confirmRef.current?.destroy();
        confirmRef.current = null;
        setEditor(null);
        setSaving(false);
        setAdvancedOpen(false);
        setCreateMenuOpen(false);
        setBusySkill("");
        setErrorsOpen(false);
        setViewingSkill(null);
        setSkillContent("");
        form.resetFields();
    }, [connected, form]);
    const useSkill = (skill: AgentSkillSummary) => {
        selectSkill(skill);
        setAgentState({ activeTab: "chat" });
    };
    const generateDraft = async (source: SkillDraftSource) => {
        const agent = useAgentStore.getState();
        if (agent.sending || agent.waiting) return message.warning(t("agent.skillManager.codexBusy"));
        if (source === "conversation" && !hasSettledConversation(agent.messages, agent.activeThreadId)) return message.warning(t("agent.skillManager.noConversation"));
        if (source === "canvas" && !agent.canvasContext) return message.warning(t("agent.skillManager.noCanvas"));
        if (!clientId) return message.warning(t("agent.skillManager.connecting"));
        const connectionRevision = useAgentSkillStore.getState().connectionRevision;
        setGeneratingSource(source);
        try {
            if (source === "canvas") {
                const synced = await postState(endpoint, token, clientId, agent.canvasContext?.snapshot || null);
                if (!synced) throw new Error(t("agent.skillManager.syncFailed"));
            }
            if (!connectionIsCurrent(connectionRevision)) return;
            const response = await createCodexSkillDraft(endpoint, token, {
                source,
                threadId: agent.activeThreadId,
                clientId,
                ...(agent.model ? { model: agent.model } : {}),
                ...(agent.reasoningEffort ? { effort: agent.reasoningEffort } : {}),
            });
            if (!connectionIsCurrent(connectionRevision)) return;
            if (!response.data) throw new Error(t("agent.skillManager.noDraft"));
            setDraft(response.data);
            message.success(t("agent.skillManager.draftCreated"));
        } catch (error) {
            if (connectionIsCurrent(connectionRevision)) message.error(error instanceof Error ? error.message : t("agent.skillManager.draftFailed"));
        } finally {
            if (connectionIsCurrent(connectionRevision)) setGeneratingSource(null);
        }
    };
    const openEdit = async (skill: AgentSkillSummary) => {
        if (!skill.managed || busySkill || useAgentSkillStore.getState().generatingSource) return;
        const connectionRevision = useAgentSkillStore.getState().connectionRevision;
        setBusySkill(skill.path);
        try {
            const response = await fetchCodexSkill(endpoint, token, skill.name);
            if (!connectionIsCurrent(connectionRevision)) return;
            if (!response.data) throw new Error(t("agent.skillManager.contentMissing"));
            setEditor({ mode: "edit", detail: response.data });
        } catch (error) {
            if (connectionIsCurrent(connectionRevision)) message.error(error instanceof Error ? error.message : t("agent.skillManager.readFailed"));
        } finally {
            if (connectionIsCurrent(connectionRevision)) setBusySkill("");
        }
    };
    const saveSkill = async () => {
        if (!editor) return;
        let values: SkillFormValues;
        try {
            values = await form.validateFields();
        } catch {
            const firstError = form.getFieldsError().find((field) => field.errors.length);
            if (firstError?.name.some((name) => name === "shortDescription" || name === "defaultPrompt")) setAdvancedOpen(true);
            if (firstError) requestAnimationFrame(() => form.scrollToField(firstError.name, { block: "center" }));
            return;
        }
        const name = editor.mode === "edit" ? editor.detail.name : values.name.trim();
        const skillInterface = compactInterface(values);
        if (skillInterface?.defaultPrompt && !mentionsSkill(skillInterface.defaultPrompt, name)) {
            form.setFields([{ name: "defaultPrompt", errors: [t("agent.skillManager.defaultPromptMention", { name })] }]);
            setAdvancedOpen(true);
            requestAnimationFrame(() => form.scrollToField("defaultPrompt", { block: "center" }));
            return;
        }
        const connectionRevision = useAgentSkillStore.getState().connectionRevision;
        if (!connectionIsCurrent(connectionRevision)) return;
        setSaving(true);
        try {
            const input = { description: values.description.trim(), instructions: values.instructions.trim(), interface: skillInterface || null };
            if (editor.mode === "create") await createCodexSkill(endpoint, token, { name, ...input });
            else await updateCodexSkill(endpoint, token, name, { ...input, expectedRevision: editor.detail.revision });
            if (!connectionIsCurrent(connectionRevision)) return;
            setDraft(null);
            setEditor(null);
            setAdvancedOpen(false);
            await refresh();
            if (!connectionIsCurrent(connectionRevision)) return;
            message.success(t(editor.mode === "create" ? "agent.skillManager.created" : "agent.skillManager.updated"));
        } catch (error) {
            if (connectionIsCurrent(connectionRevision)) message.error(error instanceof Error ? error.message : t("agent.skillManager.saveFailed"));
        } finally {
            if (connectionIsCurrent(connectionRevision)) setSaving(false);
        }
    };
    const confirmDelete = (skill: AgentSkillSummary) => {
        const connectionRevision = useAgentSkillStore.getState().connectionRevision;
        confirmRef.current = modal.confirm({
            title: t("agent.skillManager.deleteTitle", { name: skill.interface?.displayName || skill.name }),
            content: t("agent.skillManager.deleteDescription"),
            okText: t("agent.skillManager.delete"),
            okType: "danger",
            cancelText: t("common.cancel"),
            onOk: async () => {
                if (!connectionIsCurrent(connectionRevision)) return;
                setBusySkill(skill.path);
                try {
                    const response = await fetchCodexSkill(endpoint, token, skill.name);
                    if (!connectionIsCurrent(connectionRevision)) return;
                    if (!response.data) throw new Error(t("agent.skillManager.contentMissing"));
                    await deleteCodexSkill(endpoint, token, skill.name, response.data.revision);
                    if (!connectionIsCurrent(connectionRevision)) return;
                    if (selectedSkill?.name === skill.name && selectedSkill.path === skill.path) clearSelection();
                    await refresh();
                    if (!connectionIsCurrent(connectionRevision)) return;
                    message.success(t("agent.skillManager.deleted"));
                } catch (error) {
                    if (!connectionIsCurrent(connectionRevision)) return;
                    message.error(error instanceof Error ? error.message : t("agent.skillManager.deleteFailed"));
                    throw error;
                } finally {
                    if (connectionIsCurrent(connectionRevision)) setBusySkill("");
                }
            },
            afterClose: () => {
                confirmRef.current = null;
            },
        });
    };
    const toggleEnabled = async (skill: AgentSkillSummary, enabled: boolean) => {
        const connectionRevision = useAgentSkillStore.getState().connectionRevision;
        if (!connectionIsCurrent(connectionRevision)) return;
        setBusySkill(skill.path);
        try {
            await setCodexSkillEnabled(endpoint, token, skill, enabled);
            if (!connectionIsCurrent(connectionRevision)) return;
            if (!enabled && selectedSkill?.name === skill.name && selectedSkill.path === skill.path) clearSelection();
            await refresh();
        } catch (error) {
            if (connectionIsCurrent(connectionRevision)) message.error(error instanceof Error ? error.message : t("agent.skillManager.statusFailed"));
        } finally {
            if (connectionIsCurrent(connectionRevision)) setBusySkill("");
        }
    };
    const toggleFavorite = (skill: AgentSkillSummary) => setFavoritePaths((paths) => paths.includes(skill.path) ? paths.filter((path) => path !== skill.path) : [...paths, skill.path]);
    const viewSkillContent = async (skill: AgentSkillSummary) => {
        if (!connected) return message.warning(t("agent.skillManager.connectToView"));
        setViewingSkill(skill);
        setContentLoading(true);
        setSkillContent("");
        try {
            const response = await fetchCodexSkillContent(endpoint, token, skill.path);
            if (!response.data) throw new Error("Skill 内容为空");
            setSkillContent(response.data.content);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取 Skill 内容失败");
        } finally {
            setContentLoading(false);
        }
    };
    const importSkill = async () => {
        if (!connected) return;
        setImporting(true);
        try {
            const input = importSource === "github"
                ? { source: "github" as const, url: importUrl }
                : importFile
                    ? { source: importSource, fileName: importFile.name, contentBase64: await readFileBase64(importFile) }
                    : null;
            if (!input) return message.warning("请选择要导入的文件");
            await importCodexSkill(endpoint, token, input);
            setImportOpen(false);
            setImportFile(null);
            setImportUrl("");
            await refresh();
            message.success("技能已导入本机技能库");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "技能导入失败");
        } finally {
            setImporting(false);
        }
    };
    const codexBusy = sending || waiting;
    const createMenu: MenuProps = {
        items: [
            {
                key: "conversation",
                icon: <MessageSquareText className="size-4" />,
                disabled: codexBusy || !hasConversation,
                label: (
                    <div className="py-0.5">
                        <div className="text-sm">{t("agent.skillManager.fromConversation")}</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>{t(codexBusy ? "agent.skillManager.availableAfterRun" : hasConversation ? "agent.skillManager.conversationDescription" : activeThreadId ? "agent.skillManager.noCompletedContent" : "agent.skillManager.startConversation")}</div>
                    </div>
                ),
            },
            {
                key: "canvas",
                icon: <Workflow className="size-4" />,
                disabled: codexBusy || !hasCanvas,
                label: (
                    <div className="py-0.5">
                        <div className="text-sm">{t("agent.skillManager.fromCanvas")}</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>{t(codexBusy ? "agent.skillManager.availableAfterRun" : hasCanvas ? "agent.skillManager.canvasDescription" : "agent.skillManager.canvasUnavailable")}</div>
                    </div>
                ),
            },
            { type: "divider" as const },
            {
                key: "manual",
                icon: <FilePenLine className="size-4" />,
                label: (
                    <div className="py-0.5">
                        <div className="text-sm">{t("agent.skillManager.blankCreate")}</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>{t("agent.skillManager.blankDescription")}</div>
                    </div>
                ),
            },
        ],
        onClick: ({ key }) => {
            if (key === "manual") {
                setDraft(null);
                setEditor({ mode: "create" });
            }
            else void generateDraft(key as SkillDraftSource);
        },
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold">{t("agent.skillManager.localSkills")}</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>{t("agent.skillManager.localDescription")}</div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Tooltip title="安装技能">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" aria-label="安装技能" disabled={!connected} icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)} />
                        </Tooltip>
                        <Tooltip title={t("agent.skillManager.reload")}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" aria-label={t("agent.skillManager.reloadSkill")} disabled={!connected || loading} icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />} onClick={() => void refresh()} />
                        </Tooltip>
                        <Dropdown trigger={["click"]} placement="bottomRight" open={createMenuOpen} onOpenChange={setCreateMenuOpen} disabled={!connected || !clientId || Boolean(generatingSource)} menu={createMenu}>
                            <Button type="text" className="!h-8 !px-2" aria-haspopup="menu" aria-expanded={createMenuOpen} disabled={!connected || !clientId} loading={Boolean(generatingSource)} icon={<Plus className="size-4" />}>
                                {t("agent.skillManager.createSkill")} <ChevronDown className="size-3.5 opacity-60" />
                            </Button>
                        </Dropdown>
                    </div>
                </div>
                <div className="mt-3 flex gap-1 overflow-x-auto pb-0.5">
                    {([ ["market", "技能广场"], ["mine", "我的技能"], ["created", "我创建的"], ["favorites", "我的收藏"] ] as const).map(([value, text]) => (
                        <Button key={value} type={libraryTab === value ? "primary" : "text"} size="small" className="!shrink-0 !rounded-lg" onClick={() => setLibraryTab(value)}>{text}{value === "market" ? ` ${skills.length}` : ""}</Button>
                    ))}
                    <span className="mx-1 h-5 w-px shrink-0 self-center bg-stone-200 dark:bg-stone-700" />
                    <Button type={enabledFilter === "enabled" ? "primary" : "text"} size="small" className="!shrink-0 !rounded-lg" onClick={() => setEnabledFilter((value) => value === "enabled" ? "all" : "enabled")}>已启用 {enabledCount}</Button>
                    <Button type={enabledFilter === "disabled" ? "primary" : "text"} size="small" className="!shrink-0 !rounded-lg" onClick={() => setEnabledFilter((value) => value === "disabled" ? "all" : "disabled")}>未启用 {disabledCount}</Button>
                </div>
                <div className="mt-3 flex gap-2">
                    <Input aria-label={t("agent.skills.search")} className="min-w-0 flex-1" allowClear disabled={!connected} value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search className="size-3.5" />} placeholder={t("agent.skills.search")} />
                    <Select<ScopeFilter>
                        size="small"
                        variant="borderless"
                        aria-label={t("agent.skillManager.filterBySource")}
                        className="w-28 shrink-0"
                        disabled={!connected}
                        value={scope}
                        onChange={setScope}
                        options={[{ value: "all", label: t("agent.skillManager.scopes.all") }, ...(["repo", "user", "system", "admin"] as AgentSkillScope[]).map((value) => ({ value, label: t(`agent.skillManager.scopes.${value}`) }))]}
                    />
                </div>
                {errors.length ? (
                    <Button danger type="text" size="small" className="!mt-1 !h-7 !px-1 text-xs" icon={<CircleAlert className="size-3.5" />} onClick={() => setErrorsOpen(true)}>{t("agent.skillManager.loadErrors", { count: errors.length })}</Button>
                ) : null}
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4">
                {loading && !loaded ? (
                    <div className="flex h-40 items-center justify-center gap-2 text-sm" style={{ color: theme.node.muted }}><LoaderCircle className="size-4 animate-spin" />{t("agent.skills.loading")}</div>
                ) : presentation === "library" ? (
                    <SkillLibraryGrid
                        skills={filteredSkills}
                        libraryTab={libraryTab}
                        connected={connected}
                        busySkill={busySkill}
                        favoritePaths={favoritePaths}
                        onInstall={() => setImportOpen(true)}
                        onToggleFavorite={toggleFavorite}
                        onToggleEnabled={toggleEnabled}
                        onView={viewSkillContent}
                    />
                ) : filteredSkills.length ? (
                    <div className="divide-y" style={{ borderColor: theme.node.stroke }}>
                        {filteredSkills.map((skill) => {
                            const selected = selectedSkill?.name === skill.name && selectedSkill.path === skill.path;
                            const busy = busySkill === skill.path;
                            return (
                                <div key={`${skill.name}:${skill.path}`} className={`py-3 transition-opacity ${skill.enabled ? "" : "opacity-55"}`} style={{ borderColor: theme.node.stroke }}>
                                    <div className="flex items-start gap-3">
                                        <Sparkles className="mt-0.5 size-4 shrink-0" style={{ color: selected ? theme.node.text : theme.node.muted }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="truncate text-sm font-medium">{skill.interface?.displayName || skill.name}</span>
                                                {!skill.managed ? <Tooltip title={t("agent.skillManager.externalReadonly")}><LockKeyhole className="size-3.5 shrink-0" style={{ color: theme.node.faint }} /></Tooltip> : null}
                                            </div>
                                            <div className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: theme.node.muted }}>{skill.interface?.shortDescription || skill.shortDescription || skill.description || t("agent.skillManager.noDescription")}</div>
                                            <Tooltip title={skill.path}>
                                                <div className="mt-1.5 truncate text-[11px]" style={{ color: theme.node.faint }}>{t(`agent.skillManager.scopes.${skill.scope}`)} · {skill.name}</div>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2 pl-7">
                                        <label className="inline-flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                                            <Switch size="small" checked={skill.enabled} loading={busy} disabled={!connected || Boolean(busySkill) || Boolean(generatingSource)} onChange={(enabled) => void toggleEnabled(skill, enabled)} />
                                            {t(skill.enabled ? "agent.skillManager.enabled" : "agent.skillManager.disabled")}
                                        </label>
                                        <div className="flex items-center gap-0.5">
                                            <Tooltip title={favoritePaths.includes(skill.path) ? "取消收藏" : "收藏"}><Button type="text" shape="circle" size="small" aria-label={favoritePaths.includes(skill.path) ? "取消收藏" : "收藏"} icon={<Heart className={`size-3.5 ${favoritePaths.includes(skill.path) ? "fill-current" : ""}`} />} onClick={() => toggleFavorite(skill)} /></Tooltip>
                                            <Button type="text" size="small" disabled={!connected || !skill.enabled || Boolean(busySkill)} icon={selected ? <Check className="size-3.5" /> : <Sparkles className="size-3.5" />} onClick={() => useSkill(skill)}>{t(selected ? "agent.skillManager.selected" : "agent.skillManager.use")}</Button>
                                            {skill.managed ? (
                                                <>
                                                    <Tooltip title={t("common.edit")}><Button type="text" shape="circle" size="small" aria-label={t("agent.skillManager.editNamed", { name: skill.interface?.displayName || skill.name })} disabled={!connected || Boolean(busySkill) || Boolean(generatingSource)} icon={<FilePenLine className="size-3.5" />} onClick={() => void openEdit(skill)} /></Tooltip>
                                                    <Tooltip title={t("common.delete")}><Button danger type="text" shape="circle" size="small" aria-label={t("agent.skillManager.deleteNamed", { name: skill.interface?.displayName || skill.name })} disabled={!connected || Boolean(busySkill) || Boolean(generatingSource)} icon={<Trash2 className="size-3.5" />} onClick={() => confirmDelete(skill)} /></Tooltip>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex h-48 flex-col items-center justify-center text-center">
                        <Sparkles className="size-5" style={{ color: theme.node.faint }} />
                        <div className="mt-3 text-sm font-medium">{t(!connected ? "agent.skillManager.connectToView" : skills.length ? "agent.skillManager.noMatch" : "agent.skillManager.none")}</div>
                        <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>{t(!connected ? "agent.skillManager.connectDescription" : skills.length ? "agent.skillManager.tryAnotherFilter" : "agent.skillManager.createOrInstall")}</div>
                    </div>
                )}
            </div>

            <Modal title={t("agent.skillManager.loadErrors", { count: errors.length })} open={errorsOpen} footer={null} width={720} onCancel={() => setErrorsOpen(false)}>
                <div className="thin-scrollbar mt-4 max-h-[60vh] overflow-y-auto rounded-md border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke }}>
                    {errors.map((error, index) => <div key={`${index}:${error}`} className="break-all py-1" style={{ color: theme.node.muted }}>{error}</div>)}
                </div>
            </Modal>

            <Modal
                title={viewingSkill ? localizeSkillDisplay(viewingSkill).title : "技能内容"}
                open={Boolean(viewingSkill)}
                width={920}
                footer={viewingSkill ? <Button type="primary" disabled={!viewingSkill.enabled} icon={<Sparkles className="size-4" />} onClick={() => { useSkill(viewingSkill); setViewingSkill(null); }}>使用技能</Button> : null}
                onCancel={() => setViewingSkill(null)}
            >
                {viewingSkill ? <div className="space-y-4">
                    <div className="text-sm leading-6" style={{ color: theme.node.muted }}>{localizeSkillDisplay(viewingSkill).description}</div>
                    <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.faint }}>{t(`agent.skillManager.scopes.${viewingSkill.scope}`)} · 本机已安装</div>
                    {contentLoading ? <div className="flex h-48 items-center justify-center"><LoaderCircle className="size-5 animate-spin" /></div> : <pre className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border p-4 text-xs leading-6" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}>{skillContent || "暂无可预览的 Skill 内容"}</pre>}
                </div> : null}
            </Modal>

            <Modal title="安装技能" open={importOpen} okText="导入" cancelText={t("common.cancel")} confirmLoading={importing} onCancel={() => !importing && setImportOpen(false)} onOk={() => void importSkill()}>
                <div className="space-y-4">
                    <Select value={importSource} onChange={(value) => { setImportSource(value); setImportFile(null); }} options={[{ value: "markdown", label: "上传 SKILL.md" }, { value: "zip", label: "上传 ZIP" }, { value: "github", label: "GitHub SKILL.md 链接" }]} className="w-full" />
                    {importSource === "github" ? <Input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://github.com/owner/repo/blob/main/path/SKILL.md" /> : <input type="file" accept={importSource === "zip" ? ".zip,application/zip" : ".md,text/markdown,text/plain"} onChange={(event) => setImportFile(event.target.files?.[0] || null)} />}
                    <div className="text-xs leading-5" style={{ color: theme.node.muted }}>导入后会写入本机 `.agents/skills`，并立即出现在可调用技能列表中。ZIP 必须包含 `SKILL.md`；GitHub 请使用文件链接。</div>
                </div>
            </Modal>

            <Modal
                title={editor?.mode === "edit" ? t("agent.skillManager.editNamed", { name: editor.detail.interface?.displayName || editor.detail.name }) : t("agent.skillManager.createSkill")}
                open={Boolean(editor)}
                okText={t(editor?.mode === "edit" ? "agent.skillManager.saveChanges" : "agent.skillManager.createSkill")}
                cancelText={t("common.cancel")}
                confirmLoading={saving}
                width={680}
                centered
                destroyOnHidden
                styles={{ body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto" } }}
                onCancel={() => {
                    if (saving) return;
                    setDraft(null);
                    setEditor(null);
                    setAdvancedOpen(false);
                }}
                onOk={() => void saveSkill()}
            >
                <div className="mb-5 text-xs" style={{ color: theme.node.muted }}>{t("agent.skillManager.saveLocation")} · <span className="font-mono">.agents/skills</span></div>
                <Form key={editor?.mode === "edit" ? editor.detail.revision : `create:${editor?.values?.name || "blank"}`} form={form} initialValues={editorValues} layout="vertical" requiredMark="optional" preserve={false}>
                    <div className="mb-3 text-xs font-medium" style={{ color: theme.node.muted }}>{t("agent.skillManager.basicInfo")}</div>
                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        <Form.Item name="name" label={t("agent.skillManager.identifier")} extra={t("agent.skillManager.identifierExtra")} rules={[{ required: true, message: t("agent.skillManager.identifierRequired") }, { max: 64, message: t("agent.skillManager.identifierMax") }, { pattern: skillNamePattern, message: t("agent.skillManager.identifierPattern") }]}>
                            <Input maxLength={64} disabled={editor?.mode === "edit"} placeholder={t("agent.skillManager.identifierPlaceholder")} />
                        </Form.Item>
                        <Form.Item name="displayName" label={t("agent.skillManager.displayName")} rules={[{ max: 64, message: t("agent.skillManager.displayNameMax") }]}><Input maxLength={64} placeholder={t("agent.skillManager.displayNamePlaceholder")} /></Form.Item>
                    </div>
                    <Form.Item name="description" label={t("agent.skillManager.whenToUse")} extra={t("agent.skillManager.whenToUseExtra")} rules={[{ required: true, message: t("agent.skillManager.whenToUseRequired") }, { max: 1024, message: t("agent.skillManager.whenToUseMax") }, { validator: (_, value) => typeof value === "string" && /[<>]/.test(value) ? Promise.reject(new Error(t("agent.skillManager.noAngleBrackets"))) : Promise.resolve() }]}><Input.TextArea maxLength={1024} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("agent.skillManager.whenToUsePlaceholder")} /></Form.Item>
                    <Form.Item name="instructions" label={t("agent.skillManager.instructions")} extra={t("agent.skillManager.instructionsExtra")} rules={[{ required: true, message: t("agent.skillManager.instructionsRequired") }]}><Input.TextArea className="!leading-6" autoSize={{ minRows: 6, maxRows: 10 }} placeholder={t("agent.skillManager.instructionsPlaceholder")} /></Form.Item>
                    <Collapse
                        ghost
                        size="small"
                        activeKey={advancedOpen ? ["advanced"] : []}
                        expandIconPlacement="end"
                        onChange={(keys) => setAdvancedOpen((Array.isArray(keys) ? keys : [keys]).includes("advanced"))}
                        items={[{
                            key: "advanced",
                            forceRender: true,
                            label: <span className="text-sm font-medium">{t("agent.skillManager.advanced")}</span>,
                            children: (
                                <>
                                    <Form.Item name="shortDescription" label={t("agent.skillManager.shortDescription")} extra={t("agent.skillManager.shortDescriptionExtra")} rules={[{ min: 25, message: t("agent.skillManager.shortDescriptionMin") }, { max: 64, message: t("agent.skillManager.shortDescriptionMax") }]}><Input maxLength={64} showCount placeholder={t("agent.skillManager.shortDescriptionPlaceholder")} /></Form.Item>
                                    <Form.Item name="defaultPrompt" label={t("agent.skillManager.defaultPrompt")} extra={t("agent.skillManager.defaultPromptExtra")} rules={[{ max: 1024, message: t("agent.skillManager.defaultPromptMax") }]}><Input.TextArea maxLength={1024} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("agent.skillManager.defaultPromptPlaceholder")} /></Form.Item>
                                </>
                            ),
                        }]}
                    />
                </Form>
            </Modal>
        </div>
    );
}

function SkillLibraryGrid({
    skills,
    libraryTab,
    connected,
    busySkill,
    favoritePaths,
    onInstall,
    onToggleFavorite,
    onToggleEnabled,
    onView,
}: {
    skills: AgentSkillSummary[];
    libraryTab: LibraryTab;
    connected: boolean;
    busySkill: string;
    favoritePaths: string[];
    onInstall: () => void;
    onToggleFavorite: (skill: AgentSkillSummary) => void;
    onToggleEnabled: (skill: AgentSkillSummary, enabled: boolean) => void;
    onView: (skill: AgentSkillSummary) => void;
}) {
    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
            {libraryTab === "market" ? (
                <button type="button" className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/60 p-6 text-left transition hover:border-stone-500 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900/35 dark:hover:border-stone-500 dark:hover:bg-stone-800/60" onClick={onInstall}>
                    <Upload className="size-8 text-stone-500 dark:text-stone-400" />
                    <div className="mt-5 text-base font-semibold">安装技能</div>
                    <div className="mt-2 text-center text-xs leading-5 text-stone-500 dark:text-stone-400">上传 SKILL.md、ZIP，或连接 GitHub Skill</div>
                </button>
            ) : null}
            {skills.map((skill) => {
                const favorite = favoritePaths.includes(skill.path);
                const busy = busySkill === skill.path;
                const { title, description } = localizeSkillDisplay(skill);
                return (
                    <article
                        key={`${skill.name}:${skill.path}`}
                        role="button"
                        tabIndex={0}
                        className={`group flex min-h-60 cursor-pointer flex-col rounded-2xl border border-stone-200 bg-stone-50/80 p-5 transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-lg dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-stone-600 ${skill.enabled ? "" : "opacity-55"}`}
                        onClick={() => onView(skill)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onView(skill); } }}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200"><BookOpenText className="size-5" /></div>
                            <button type="button" className={`rounded-full p-1.5 transition hover:bg-stone-200 dark:hover:bg-stone-800 ${favorite ? "text-rose-500" : "text-stone-400"}`} aria-label={favorite ? "取消收藏" : "收藏"} onClick={(event) => { event.stopPropagation(); onToggleFavorite(skill); }}><Heart className={`size-4 ${favorite ? "fill-current" : ""}`} /></button>
                        </div>
                        <div className="mt-5 line-clamp-2 text-base font-semibold leading-6">{title}</div>
                        <div className="mt-2 line-clamp-4 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
                        <div className="mt-auto pt-4">
                            <div className="mb-3 flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400">
                                <span className="truncate">{skill.scope === "repo" ? "项目" : skill.scope === "user" ? "个人" : skill.scope === "system" ? "系统" : "管理"} · 本机已安装</span>
                                {!skill.managed ? <LockKeyhole className="size-3.5 shrink-0" /> : null}
                            </div>
                            <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-stone-500 dark:text-stone-400"><Switch size="small" checked={skill.enabled} loading={busy} disabled={!connected || Boolean(busySkill)} onChange={(enabled) => void onToggleEnabled(skill, enabled)} /><span>{skill.enabled ? "已启用" : "已停用"}</span></label>
                                <Button size="small" type="primary" icon={<BookOpenText className="size-3.5" />} onClick={() => onView(skill)}>查看内容</Button>
                            </div>
                        </div>
                    </article>
                );
            })}
            {!skills.length && libraryTab !== "market" ? <div className="col-span-full py-20 text-center text-sm text-stone-500 dark:text-stone-400">这个分类中还没有 Skill</div> : null}
        </div>
    );
}

function readFileBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("读取文件失败"));
        reader.readAsDataURL(file);
    });
}

function skillFormValues(detail: AgentSkillDetail): SkillFormValues {
    return {
        name: detail.name,
        description: detail.description,
        instructions: detail.instructions,
        displayName: detail.interface?.displayName || undefined,
        shortDescription: detail.interface?.shortDescription || undefined,
        defaultPrompt: detail.interface?.defaultPrompt || undefined,
    };
}

function draftFormValues(draft: AgentSkillDraft): SkillFormValues {
    return {
        name: draft.name,
        description: draft.description,
        instructions: draft.instructions,
        displayName: draft.displayName || undefined,
        shortDescription: draft.shortDescription || undefined,
        defaultPrompt: draft.defaultPrompt || undefined,
    };
}

function hasSettledConversation(messages: AgentChatItem[], threadId: string) {
    return Boolean(threadId && messages.some((item) => item.role === "user" && item.threadId === threadId && item.turnId));
}

function compactInterface(values: SkillFormValues): AgentSkillInterface | undefined {
    const skillInterface = {
        displayName: values.displayName?.trim() || undefined,
        shortDescription: values.shortDescription?.trim() || undefined,
        defaultPrompt: values.defaultPrompt?.trim() || undefined,
    };
    return Object.values(skillInterface).some(Boolean) ? skillInterface : undefined;
}

function mentionsSkill(prompt: string, name: string) {
    return new RegExp(`\\$${name}(?![A-Za-z0-9_-]|:[A-Za-z0-9_-])`).test(prompt);
}
