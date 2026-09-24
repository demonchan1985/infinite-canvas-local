import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const configPanelSource = readFileSync(new URL("../src/components/canvas/canvas-config-node-panel.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const reversePromptSource = readFileSync(new URL("../src/lib/canvas/canvas-reverse-prompt.ts", import.meta.url), "utf8");

test("仅反推配置卡片隐藏创作框，已保存的反推卡片也能识别", () => {
    const context = {
        exports: {} as { isReversePromptConfigNode?: (node: unknown) => boolean },
        require: () => ({ CanvasNodeType: { Config: "config" } }),
    };
    const compiled = ts.transpileModule(reversePromptSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, context);
    const isReversePromptConfigNode = context.exports.isReversePromptConfigNode;
    assert.ok(isReversePromptConfigNode);
    assert.equal(isReversePromptConfigNode({ type: "config", title: "自定义名称", metadata: { reversePromptConfig: true } }), true);
    assert.equal(isReversePromptConfigNode({ type: "config", title: "反推提示词配置", metadata: { generationMode: "text" } }), true);
    assert.equal(isReversePromptConfigNode({ type: "config", title: "Reverse prompt configuration", metadata: { generationMode: "text" } }), true);
    assert.equal(isReversePromptConfigNode({ type: "config", title: "生成配置", metadata: { generationMode: "text" } }), false);
    assert.equal(isReversePromptConfigNode({ type: "text", title: "反推提示词配置", metadata: { reversePromptConfig: true } }), false);
});

test("反推提示词配置创建后只选中卡片，不自动打开创作框", () => {
    const source = projectSource.slice(projectSource.indexOf("const createImageReversePromptNodes"), projectSource.indexOf("const analyzeVideoWithSkill"));
    assert.match(source, /reversePromptConfig: true/);
    assert.match(source, /setDialogNodeId\(null\)/);
    assert.doesNotMatch(source, /setDialogNodeId\(configNode\.id\)/);
});

test("再次选中反推配置卡片也不会显示下方创作框", () => {
    assert.match(projectSource, /showPanel=\{[^\n]*!isReversePromptConfigNode\(node\)/);
});

test("反推配置卡片不显示组装提示词入口，普通配置仍保留入口", () => {
    assert.match(configPanelSource, /!isReversePromptConfigNode\(node\) \? \(/);
    assert.match(toolbarSource, /isConfig && !isReversePromptConfigNode\(node\)/);
});
