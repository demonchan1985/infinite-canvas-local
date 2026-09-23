import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canvasCardVisualScale, canvasNodeReadableScale } from "../src/lib/canvas/canvas-node-size.ts";

const nodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const connectionSource = readFileSync(new URL("../src/components/canvas/canvas-connections.tsx", import.meta.url), "utf8");
const zoomControlsSource = readFileSync(new URL("../src/components/canvas/canvas-zoom-controls.tsx", import.meta.url), "utf8");
const miniMapSource = readFileSync(new URL("../src/components/canvas/canvas-mini-map.tsx", import.meta.url), "utf8");
const promptPanelSource = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const canvasConstantSource = readFileSync(new URL("../src/constant/canvas.ts", import.meta.url), "utf8");

test("连接点只在鼠标悬停当前节点时显示", () => {
    assert.match(nodeSource, /<ConnectionHandleDot side="left" scale=\{scale\} visible=\{hovered\}/);
    assert.match(nodeSource, /<ConnectionHandleDot side="right" scale=\{scale\} visible=\{hovered\}/);
});

test("节点标题仍随画布缩放，创作框使用可读性视觉比例", () => {
    assert.doesNotMatch(nodeSource, /const titleScale = 1 \/ scale/);
    assert.doesNotMatch(nodeSource, /const promptPanelScale = 1 \/ Math\.sqrt\(scale\)/);
    assert.doesNotMatch(nodeSource, /left: 8 \/ scale/);
    assert.doesNotMatch(nodeSource, /paddingTop: 20 \/ scale/);
    assert.match(nodeSource, /const promptPanelScale = canvasCardVisualScale\(scale\);/);
});

test("创作框以紧凑宽度显示，缩短空白输入区但不缩小预设命中区", () => {
    assert.match(nodeSource, /const creativeFrameWidth = 820;/);
    assert.match(nodeSource, /marginLeft: -creativeFrameWidth \/ 2 \* promptPanelScale, paddingTop: 16/);
    assert.match(nodeSource, /style=\{\{ width: creativeFrameWidth, transform: `scale\(\$\{promptPanelScale\}\)`/);
    assert.match(promptPanelSource, /rounded-\[24px\] border p-4/);
    assert.match(promptPanelSource, /h-36 w-full cursor-text/);
});

test("新建空视频节点使用更易识别的 720×405 画幅", () => {
    assert.match(canvasConstantSource, /\[CanvasNodeType\.Video\]: \{\s*width: 720,\s*height: 405,/);
    assert.match(canvasConstantSource, /\[CanvasNodeType\.Video\]: \{\s*width: NODE_DEFAULT_SIZE\[CanvasNodeType\.Video\]\.width,\s*height: NODE_DEFAULT_SIZE\[CanvasNodeType\.Video\]\.height,/);
});

test("创作浮层保持可读性，连线节点不单独反向缩放内部内容", () => {
    assert.ok(Math.abs(canvasCardVisualScale(0.2) - 3.6) < 0.001);
    assert.equal(canvasCardVisualScale(0.72), 1);
    assert.equal(canvasCardVisualScale(2), 0.5);
    assert.equal(0.2 * canvasCardVisualScale(0.2), 0.72);
    assert.equal(2 * canvasCardVisualScale(2), 1);
    assert.equal(canvasNodeReadableScale(0.1), 1);
    assert.ok(Math.abs(canvasNodeReadableScale(0.45) - 1.6) < 0.001);
    assert.match(nodeSource, /const readableScale = data\.type === CanvasNodeType\.Config \|\| data\.type === CanvasNodeType\.Text \? 1 : canvasNodeReadableScale\(scale\);/);
    assert.doesNotMatch(nodeSource, /const readableScale = [^;]*canvasCardVisualScale\(scale\);/);
    assert.match(nodeSource, /width: `\$\{100 \/ contentScale\}%`/);
});

test("文本、配置和分组节点保持与自身外框相同的坐标系", () => {
    assert.match(nodeSource, /const groupContentScale = Math\.min\(2\.6, Math\.max\(readableScale, 0\.8 \/ Math\.max\(scale, 0\.2\)\)\);/);
    assert.match(nodeSource, /transformOrigin: "top left"/);
});

test("节点外部标题使用提升后的基础字号，避免在画布缩小后过小", () => {
    assert.match(nodeSource, /data-canvas-image-info className="flex w-full min-w-0 items-center gap-1\.5 text-lg font-semibold opacity-75"/);
    assert.match(nodeSource, /className="h-7 max-w-full border-0 border-b border-dashed bg-transparent px-0 text-left text-lg font-semibold outline-none"/);
});

test("拉伸 RH 卡片时，内容、端口与连线使用同一节点坐标系", () => {
    assert.match(nodeSource, /const contentScale = hasDedicatedInputPorts \? runningHubWorkflowContentScale\(data\) : isGroup \? groupContentScale : isGroupMember \? groupMemberContentScale : readableScale/);
    assert.match(nodeSource, /keepRatio: hasDedicatedInputPorts \|\| \(data\.type === CanvasNodeType\.Image/);
    assert.match(projectSource, /const workflowScale = runningHubWorkflowContentScale\(node\);/);
    assert.match(projectSource, /width = RUNNING_HUB_WORKFLOW_NODE_WIDTH \* workflowScale/);
    assert.match(connectionSource, /runningHubWorkflowContentScale\(to\)/);
    assert.doesNotMatch(connectionSource, /runningHubWorkflowContentScale\(to\) \* canvasCardVisualScale\(scale\)/);
});

test("画布缩略图默认显示", () => {
    assert.match(projectSource, /const \[isMiniMapOpen, setIsMiniMapOpen\] = useState\(true\)/);
    assert.match(projectSource, /\{isMiniMapOpen && !focusMode \? <Minimap/);
});

test("小地图与工具条在右下角紧凑对齐，工具条与悬停提示使用统一面板色", () => {
    assert.match(zoomControlsSource, /miniMap\?: ReactNode;/);
    assert.match(zoomControlsSource, /className="absolute bottom-1 right-8 z-50 flex flex-col items-center gap-1 @min-\[600px\]:right-10"/);
    assert.match(zoomControlsSource, /\{miniMap \? <div className="shrink-0">\{miniMap\}<\/div> : null\}/);
    assert.match(projectSource, /miniMap=\{isMiniMapOpen && !focusMode \? <Minimap/);
    assert.match(miniMapSource, /className="overflow-hidden rounded-lg border shadow-2xl backdrop-blur-sm"/);
    assert.match(miniMapSource, /background: theme\.node\.panel/);
    assert.doesNotMatch(miniMapSource, /absolute bottom-/);
    assert.match(zoomControlsSource, /const viewModeLabel = viewMode === "professional" \? "专业模式" : "简洁模式";/);
    assert.match(zoomControlsSource, /const toolbarTooltipProps = \{ color: theme\.node\.panel,/);
    assert.match(zoomControlsSource, /background: theme\.node\.panel/);
    assert.equal((zoomControlsSource.match(/<Tooltip \{\.\.\.toolbarTooltipProps\}/g) || []).length, 8);
    assert.match(zoomControlsSource, /<Tooltip \{\.\.\.toolbarTooltipProps\} title=\{`切换视图模式（当前：\$\{viewModeLabel\}）`\}>/);
    assert.match(zoomControlsSource, /className="grid size-7 place-items-center rounded-md [^"]*"/);
    assert.doesNotMatch(zoomControlsSource, /style=\{viewMode === "professional" \? activeStyle : \{ color: theme\.toolbar\.item \}\}/);
    assert.doesNotMatch(zoomControlsSource, /<span>\{viewMode === "professional" \? "专业模式" : "简洁模式"\}<\/span>/);
});
