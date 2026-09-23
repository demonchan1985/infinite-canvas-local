import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflowNodeSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-node.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const canvasNodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const workflowSettingsSource = readFileSync(new URL("../src/components/canvas/canvas-runninghub-workflow-settings-popover.tsx", import.meta.url), "utf8");
const canvasThemeSource = readFileSync(new URL("../src/lib/canvas-theme.ts", import.meta.url), "utf8");
const configStoreSource = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");

test("拖入 RH 节点不会自动展开卡片，摘要卡保留分类自动分流", () => {
    assert.match(workflowNodeSource, /const portsOpen = manualPortsOpen;/);
    assert.doesNotMatch(workflowNodeSource, /activeConnection/);
    assert.match(projectSource, /runningHubWorkflowAutoPort\(runningHubResource, sourceNode\.type, connectionsRef\.current, node\.id\)/);
});

test("放到 RH 卡片任意位置时按来源类型自动选择真实空闲槽位", () => {
    assert.match(projectSource, /runningHubWorkflowAutoPort\(runningHubResource, sourceNode\.type, connectionsRef\.current, node\.id\)/);
    assert.doesNotMatch(projectSource, /请将连线放到工作流左侧对应的编号端口。/);
    assert.match(projectSource, /workflowPortsOpen=\{Boolean\(to\.metadata\?\.runningHubWorkflowPortsOpen\)\}/);
});

test("RH 输入项明确区分已接入与未接入状态", () => {
    assert.match(workflowNodeSource, /data-rh-input-state=\{promptConnected \? "connected" : "empty"\}/);
    assert.match(workflowNodeSource, /data-rh-input-state=\{connected \? "connected" : "empty"\}/);
    assert.match(workflowNodeSource, /function workflowInputStyle/);
    assert.match(workflowNodeSource, /未接入/);
    assert.match(workflowNodeSource, /已接入/);
});

test("RH AI 应用摘要只渲染 nodeInfoList 实际声明的输入，并可保存运行实例", () => {
    assert.match(workflowNodeSource, /const showPrompt = Boolean\(resource\.promptBinding\);/);
    assert.match(workflowNodeSource, /const summaries = \[/);
    assert.doesNotMatch(workflowNodeSource, /const showPrompt = true;/);
    assert.match(workflowNodeSource, /onRunOptionsChange=\{\(runningHubWorkflowRunOptions\) => onConfigChange\(node\.id, \{ runningHubWorkflowRunOptions \}\)\}/);
    assert.match(workflowNodeSource, /<CanvasRunningHubWorkflowSelect ariaLabel="运行实例"/);
    assert.match(workflowNodeSource, /instanceType as typeof runOptions\.instanceType/);
});

test("RH 卡片内的枚举参数使用画布内受控下拉，并保留真实数值类型", () => {
    assert.match(workflowSettingsSource, /export function CanvasRunningHubWorkflowSelect/);
    assert.match(workflowSettingsSource, /createPortal\(/);
    assert.match(workflowSettingsSource, /triggerRef\.current\?\.getBoundingClientRect\(\)/);
    assert.match(workflowSettingsSource, /position: "fixed"/);
    assert.doesNotMatch(workflowSettingsSource, /<select aria-label=\{ariaLabel\}/);
    assert.match(workflowSettingsSource, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
    assert.match(workflowSettingsSource, /field\.type === "select" && field\.options\?\.length \? <CanvasRunningHubWorkflowSelect/);
    assert.match(workflowSettingsSource, /optionLabels=\{field\.optionLabels\}/);
});

test("RH 点击运行直接提交，不显示阻塞式运行确认", () => {
    assert.doesNotMatch(workflowNodeSource, /<Modal/);
    assert.doesNotMatch(workflowNodeSource, /WorkflowRunDialog/);
    assert.doesNotMatch(workflowNodeSource, /runDialogOpen/);
    assert.match(workflowNodeSource, /else onGenerate\(node\.id\);/);
});

test("RH 卡片不显示普通创作框架，运行按钮保留独立且足够大的点击区", () => {
    assert.match(canvasNodeSource, /showPanel && !isGroup && !hasDedicatedInputPorts && !data\.metadata\?\.storyboardMode && renderPanel/);
    assert.match(workflowNodeSource, /const handleRunButtonClick = \(event: ReactMouseEvent<HTMLButtonElement>\)/);
    assert.match(workflowNodeSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
    assert.match(workflowNodeSource, /!h-10 !min-w-\[88px\].*!text-base/);
    assert.match(workflowNodeSource, /onClick=\{handleRunButtonClick\}/);
});

test("RH 的外侧连接头以接入素材图标替换加号，摘要卡不显示编号槽位", () => {
    assert.doesNotMatch(workflowNodeSource, /function SummarySlot/);
    assert.doesNotMatch(workflowNodeSource, /图片\$\{slot\.index \+ 1\}/);
    assert.match(canvasNodeSource, /function RunningHubWorkflowConnectionHead/);
    assert.match(canvasNodeSource, /head\.connected \? <Icon/);
    assert.match(canvasNodeSource, /runningHubPortHeads/);
});

test("专业模式的图片文件信息与 RH 卡片正文保留可读基础字号", () => {
    assert.match(canvasNodeSource, /data-canvas-image-info/);
    assert.match(canvasNodeSource, /data-canvas-image-resolution/);
    assert.match(canvasNodeSource, /data-canvas-image-info className="flex w-full min-w-0 items-center gap-1\.5 text-lg font-semibold opacity-75"/);
    assert.match(canvasNodeSource, /data-canvas-image-resolution className="shrink-0 whitespace-nowrap text-sm opacity-70"/);
    assert.match(workflowNodeSource, /text-base.*data-runninghub-workflow-node data-rh-workflow-primary/);
    assert.match(workflowNodeSource, /data-rh-workflow-primary/);
});

test("RH 参数可按当前画布节点勾选显示，隐藏后保留工作流默认值", () => {
    assert.match(workflowSettingsSource, /显示参数/);
    assert.match(workflowSettingsSource, /onVisibleFieldKeysChange/);
    assert.match(workflowSettingsSource, /if \(!visible\) clearField\(field\);/);
    assert.match(workflowNodeSource, /runningHubWorkflowVisibleFieldKeys/);
    assert.match(workflowNodeSource, /allWorkflowFields\.filter\(\(field\) => visibleFieldKeys\.has\(field\.key\)\)/);
});

test("深色画布标题和激活区域使用高饱和蓝色，而非沉灰色", () => {
    assert.match(canvasThemeSource, /activeBg: "#173f6b"/);
});

test("RH 卡片只由外层包住四角，标题只保留底部分隔", () => {
    assert.match(canvasNodeSource, /relative h-full w-full overflow-visible rounded-xl border/);
    assert.match(workflowNodeSource, /h-14 shrink-0 items-center gap-3 border-b px-4/);
    assert.doesNotMatch(workflowNodeSource, /h-14 shrink-0 items-center gap-3 border px-4 rounded-t-\[inherit\]/);
});

test("已保存的 AI 应用字段会合并公开选项标签", () => {
    assert.match(configStoreSource, /defaultRunningHubAiAppFields\(target\)/);
    assert.match(configStoreSource, /const optionLabels = \{ \.\.\.\(fallback\.optionLabels \|\| \{\}\), \.\.\.\(field\.optionLabels \|\| \{\}\) \};/);
});
