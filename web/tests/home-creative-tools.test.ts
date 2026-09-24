import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { composeCanvasCreativePrompt, creativePresetKindsForMode, findCanvasCreativePreset } from "../src/lib/canvas/canvas-creative-presets.ts";
import { recentCanvasBackgroundTone } from "../src/lib/canvas-theme.ts";

const homeSource = readFileSync(new URL("../src/pages/home/index.tsx", import.meta.url), "utf8");
const homeStyles = readFileSync(new URL("../src/pages/home/home.css", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/constant/navigation-tools.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const configModalSource = readFileSync(new URL("../src/components/layout/app-config-modal.tsx", import.meta.url), "utf8");
const rootInitSource = readFileSync(new URL("../src/components/layout/client-root-init.tsx", import.meta.url), "utf8");
const imageWorkbenchSource = readFileSync(new URL("../src/pages/image/index.tsx", import.meta.url), "utf8");
const videoWorkbenchSource = readFileSync(new URL("../src/pages/video/index.tsx", import.meta.url), "utf8");
const canvasPromptPanelSource = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const canvasCreativeToolsSource = readFileSync(new URL("../src/components/canvas/canvas-creative-tools.tsx", import.meta.url), "utf8");
const creativePresetBrowserSource = canvasCreativeToolsSource.slice(canvasCreativeToolsSource.indexOf("function CreativePresetBrowser"), canvasCreativeToolsSource.indexOf("function MjPresetPicker"));
const mjPresetBrowserSource = canvasCreativeToolsSource.slice(canvasCreativeToolsSource.indexOf("function MjPresetBrowser"), canvasCreativeToolsSource.indexOf("function CreativePresetCard"));
const logoOptionsSource = readFileSync(new URL("../public/logo-options.html", import.meta.url), "utf8");
const logoSource = readFileSync(new URL("../public/logo.svg", import.meta.url), "utf8");
const appTopNavSource = readFileSync(new URL("../src/components/layout/app-top-nav.tsx", import.meta.url), "utf8");
const siteToolsSource = readFileSync(new URL("../src/lib/agent/agent-site-tools.ts", import.meta.url), "utf8");
const canvasAgentSchemaSource = readFileSync(new URL("../../canvas-agent/src/canvas/schemas.ts", import.meta.url), "utf8");

test("A1 首页使用画布色卡与三幕节点舞台，不加载旧提示词库或点状背景", () => {
    assert.doesNotMatch(homeSource, /fetchPrompts/);
    assert.doesNotMatch(homeStyles, /radial-gradient/);
    assert.match(homeSource, /recentCanvasBackgroundTone/);
    assert.match(homeSource, /canvasBackgroundPalette/);
    assert.match(homeSource, /home-workspace/);
    assert.match(homeSource, /sceneImages = \["style-538\.webp", "style-580\.webp", "style-611\.webp"\]/);
    assert.match(homeSource, /6500/);
    assert.match(homeSource, /prefers-reduced-motion/);
    assert.match(homeSource, /visibilitychange/);
    assert.match(homeSource, /home\.stage\.pause/);
    assert.match(appTopNavSource, /!isHome/);
    for (const name of ["538", "580", "611"]) {
        assert.ok(existsSync(new URL(`../public/creative-presets/style-${name}.webp`, import.meta.url)));
    }
    assert.equal(recentCanvasBackgroundTone([]), "neutral");
    assert.equal(
        recentCanvasBackgroundTone([
            { updatedAt: "2026-01-01", backgroundTone: "blue" },
            { updatedAt: "2026-02-01", backgroundTone: "green" },
        ]),
        "green",
    );
});

test("旧提示词库从导航、路由、配置和工作台入口退场", () => {
    assert.doesNotMatch(navigationSource, /slug: "prompts"/);
    assert.doesNotMatch(routerSource, /PromptsPage|path: "\/prompts"/);
    assert.doesNotMatch(configModalSource, /ConfigPromptSources|key: "prompt-sources"/);
    assert.doesNotMatch(rootInitSource, /usePromptSourceScheduler/);
    assert.doesNotMatch(imageWorkbenchSource, /PromptSelectDialog|promptDialogOpen/);
    assert.doesNotMatch(videoWorkbenchSource, /PromptSelectDialog|promptDialogOpen/);
    assert.doesNotMatch(siteToolsSource, /prompts_search|fetchPrompts/);
    assert.doesNotMatch(canvasAgentSchemaSource, /prompts_search/);
});

test("Logo 选择页提供三个 CY 节点点元素演变，并可按 URL 预览顶栏效果", () => {
    for (const option of ["E3P1", "E3P2", "E3P3"]) {
        assert.match(logoOptionsSource, new RegExp(`data-option="${option}"`));
    }
    assert.match(logoOptionsSource, /<svg/);
    assert.match(logoOptionsSource, /CY 节点点元素/);
    assert.match(logoOptionsSource, /id="nav-mark"/);
    assert.match(logoOptionsSource, /\?variant=E3P1…E3P3/);
    assert.match(logoOptionsSource, /navMark\.replaceChildren/);
});

test("正式 Logo 采用 E3 P2 的负形 C、核心节点和 Y", () => {
    assert.match(logoSource, /fill-rule="evenodd"/);
    assert.match(logoSource, /<circle cx="33" cy="32" r="4"/);
    assert.match(logoSource, /M36 14L45 29L54 14/);
    assert.doesNotMatch(logoSource, /M32 8L58 54/);
    assert.match(logoOptionsSource, /get\('variant'\) \|\| 'E3P2'/);
});

test("正式 Logo 在顶栏以更大的粗体轮廓显示", () => {
    assert.match(logoSource, /translate\(-6\.4 -6\.4\) scale\(1\.2\)/);
    assert.match(appTopNavSource, /className="size-7 shrink-0 bg-current"/);
});

test("图片节点提供风格、MJ 码图和滤镜；视频节点提供风格、运镜和滤镜", () => {
    assert.deepEqual(creativePresetKindsForMode("image"), ["style", "mj", "filter"]);
    assert.deepEqual(creativePresetKindsForMode("video"), ["style", "motion", "filter"]);
    assert.match(canvasPromptPanelSource, /CanvasCreativeTools/);
    assert.doesNotMatch(canvasPromptPanelSource, /CanvasPromptLibrary/);
});

test("创作技能库优先与创作框架右侧对齐，并按可视区域自适应收纳", () => {
    assert.match(canvasPromptPanelSource, /data-canvas-creative-frame/);
    assert.match(canvasCreativeToolsSource, /closest\("\[data-canvas-creative-frame\]"\)/);
    assert.match(canvasCreativeToolsSource, /resolveCreativeLibraryPlacement/);
    assert.match(canvasCreativeToolsSource, /window\.visualViewport/);
    assert.match(canvasCreativeToolsSource, /ResizeObserver/);
    assert.match(canvasCreativeToolsSource, /overflowY: "auto"/);
    assert.doesNotMatch(canvasCreativeToolsSource, /transform: "translateY\(-50%\)"/);
    assert.doesNotMatch(canvasCreativeToolsSource, /placement="bottomLeft"/);
});

test("常规创作技能库以三列四行宫格显示，超出项目在库内滚动", () => {
    assert.match(canvasCreativeToolsSource, /width=\{440\}/);
    assert.match(creativePresetBrowserSource, /w-\[min\(27\.5rem,calc\(100vw-2rem\)\)\]/);
    assert.match(creativePresetBrowserSource, /max-h-\[34rem\] grid-cols-3 gap-2 overflow-y-auto/);
    assert.doesNotMatch(creativePresetBrowserSource, /grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3/);
});

test("画布创作技能库不显示 AIFISHER 来源文字", () => {
    assert.doesNotMatch(creativePresetBrowserSource, /AIFISHER/);
    assert.doesNotMatch(mjPresetBrowserSource, /AIFISHER/);
    assert.match(creativePresetBrowserSource, /\{items\.length\} 项/);
    assert.match(mjPresetBrowserSource, /\{items\.length\} 组/);
});

test("节点创作预设进入最终提示词，MJ 码图始终放在末尾", () => {
    const style = findCanvasCreativePreset("style", "style-643");
    const filter = findCanvasCreativePreset("filter", "filter-714");
    const mj = findCanvasCreativePreset("mj", "mj-char1-style");
    assert.ok(style && filter && mj);

    const prompt = composeCanvasCreativePrompt("一只白色运动鞋", { style, filter, mj }, "image");
    assert.match(prompt, /^一只白色运动鞋/);
    assert.ok(prompt.indexOf(style.prompt) < prompt.indexOf(filter.prompt));
    assert.ok(prompt.indexOf(mj.prompt.split("\n").at(-1) || "") > prompt.indexOf(filter.prompt));
});
