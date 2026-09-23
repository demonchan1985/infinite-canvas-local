import { useMemo, useState } from "react";
import { Button, Popover, Tooltip } from "antd";
import { Search, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type GenerationMode = "image" | "video" | "text" | "audio";

type PromptPreset = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    modes: GenerationMode[];
};

// 与参考画布一致的内置提示词模板；画布内不再读取原有提示词中心。
const BUILTIN_PROMPT_PRESETS: PromptPreset[] = [
    { id: "character-sheet", name: "角色设定图", description: "正面、侧面、背面与表情参考，锁定角色一致性", prompt: "生成角色设定图：保持同一角色身份、五官、发型、服装和体态一致，包含正面、侧面、背面和关键表情参考，背景简洁，便于后续镜头复用。", modes: ["image"] },
    { id: "multi-angle", name: "多机位视角", description: "围绕同一主体生成连续、可衔接的机位变化", prompt: "围绕同一主体设计多机位画面，保持人物、服装、场景和光线一致，分别给出远景、全景、中景、近景、特写、侧面、背面和俯拍视角，镜头之间具有连续性。", modes: ["image", "video"] },
    { id: "next-shot", name: "画面推演", description: "推演当前画面的前后动作与镜头衔接", prompt: "基于当前画面推演下一个连续镜头：保持角色和场景一致，明确主体接下来的动作、视线、环境变化、镜头运动和自然衔接方式，不要跳变构图或身份。", modes: ["image", "video"] },
    { id: "story-beats", name: "连续镜头", description: "将短剧情拆成可生成的连续镜头节拍", prompt: "把这段内容拆成连续镜头节拍。每个镜头写清主体动作、景别、构图、机位、运镜、光线、情绪和与前后镜头的衔接，并保持角色、场景和道具一致。", modes: ["text", "image", "video"] },
    { id: "cinematic-light", name: "电影光影优化", description: "保留内容，优化真实光线、层次和融合感", prompt: "保留主体身份、动作和原始构图，优化为真实电影摄影光线：明确主光方向、环境反射、阴影层次、肤色和背景融合，降低塑料感与过度锐化，不改变画面内容。", modes: ["image", "video"] },
    { id: "video-prompt", name: "视频提示词优化", description: "整理为模型更容易执行的时序化镜头指令", prompt: "将当前要求改写为结构化视频提示词，按时间顺序描述开场画面、主体动作、镜头运动、环境变化、声音和结束画面；消除冲突指令，保留所有关键约束。", modes: ["text", "video"] },
];

export function CanvasPromptLibrary({ onSelect, label, mode = "image" }: { onSelect: (prompt: string) => void; label?: string; mode?: GenerationMode }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const presets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return BUILTIN_PROMPT_PRESETS.filter((preset) => preset.modes.includes(mode) && (!query || `${preset.name} ${preset.description}`.toLowerCase().includes(query)));
    }, [keyword, mode]);

    const selectPreset = (prompt: string) => {
        onSelect(prompt);
        setOpen(false);
        setKeyword("");
    };

    const picker = (
        <div className="w-80 p-1" data-canvas-no-zoom onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <label className="mb-1.5 flex items-center gap-2 rounded-lg border px-2 py-1.5" style={{ background: theme.node.fill, borderColor: theme.toolbar.border }}>
                <Search className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                <input autoFocus value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索提示词模板或已加入技能" className="min-w-0 flex-1 bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
            </label>
            <div className="thin-scrollbar max-h-72 overflow-y-auto">
                {presets.map((preset) => (
                    <button key={preset.id} type="button" className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:opacity-80" onClick={() => selectPreset(preset.prompt)}>
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}><Wand2 className="size-3.5" /></span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: theme.node.text }}><span className="truncate">{preset.name}</span><span className="shrink-0 font-medium" style={{ color: theme.node.muted }}>提示词模板</span></span>
                            <span className="mt-0.5 block truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>{preset.description}</span>
                        </span>
                    </button>
                ))}
                {!presets.length ? <div className="py-8 text-center text-xs" style={{ color: theme.node.muted }}>没有匹配的提示词模板</div> : null}
            </div>
        </div>
    );

    return (
        <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft" content={picker} overlayInnerStyle={{ background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, boxShadow: "0 18px 48px rgba(0,0,0,.28)" }}>
            <Tooltip title="提示词模板">
                <Button type="text" className={label ? "!h-12 !shrink-0 !gap-2.5 !rounded-xl !px-5 !text-[18px] !font-semibold" : "!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0"} style={{ background: label ? theme.toolbar.activeBg : undefined, color: theme.node.text }} icon={<Wand2 className={label ? "size-5" : "size-4"} />} aria-label="提示词模板">
                    {label || t("canvas.promptPanel.preset")}
                </Button>
            </Tooltip>
        </Popover>
    );
}
