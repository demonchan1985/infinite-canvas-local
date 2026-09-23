import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";

import { extractTextFromDocx, isSupportedTextNodeImportFileName, mergeTextNodeImportedContent, normalizeCanvasTextTags } from "../src/lib/canvas/canvas-text-node-import.ts";

const hoverToolbarSource = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

test("文本节点导入限制为可本地读取的文本和 DOCX 文件", () => {
    assert.equal(isSupportedTextNodeImportFileName("脚本.md"), true);
    assert.equal(isSupportedTextNodeImportFileName("素材.DOCX"), true);
    assert.equal(isSupportedTextNodeImportFileName("notes.vtt"), true);
    assert.equal(isSupportedTextNodeImportFileName("legacy.doc"), false);
    assert.equal(isSupportedTextNodeImportFileName("image.png"), false);
});

test("DOCX 导入保留段落、换行、制表符与 XML 实体", () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一段</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>第二段</w:t></w:r></w:p><w:p><w:r><w:t>第三段 &amp; 参考</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>续行</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(documentXml) });

    assert.equal(extractTextFromDocx(docx), "第一段\t第二段\n第三段 & 参考\n续行");
});

test("已有文本可明确选择替换或在末尾追加", () => {
    assert.equal(mergeTextNodeImportedContent("已有正文\n", "导入正文", "append"), "已有正文\n\n导入正文");
    assert.equal(mergeTextNodeImportedContent("已有正文", "导入正文", "replace"), "导入正文");
});

test("文本标签会过滤无效项、折叠同名标签，并保留合法颜色", () => {
    const tooLongLabel = "超".repeat(41);
    const tags = normalizeCanvasTextTags([
        { id: "character", label: "人物", color: "blue" },
        { id: "character-copy", label: " 人物 ", color: "rose" },
        { id: "scene", label: "场景", color: "green" },
        { id: "invalid", label: tooLongLabel, color: "amber" },
        { id: "bad-color", label: "道具", color: "purple" },
    ]);

    assert.deepEqual(tags, [
        { id: "character", label: "人物", color: "blue" },
        { id: "scene", label: "场景", color: "green" },
    ]);
});

test("文本节点工具条接入本地导入、标签和已有正文确认", () => {
    assert.match(hoverToolbarSource, /readTextNodeImportFile/);
    assert.match(hoverToolbarSource, /TEXT_NODE_IMPORT_ACCEPT/);
    assert.match(hoverToolbarSource, /<CanvasTextNodeTags/);
    assert.match(hoverToolbarSource, /importTextDialogTitle/);
    assert.match(projectSource, /onTextImport=\{handleTextNodeImport\}/);
    assert.match(projectSource, /onTextTagsChange=\{handleTextNodeTagsChange\}/);
    assert.match(projectSource, /textTags: normalizeCanvasTextTags\(textTags\)/);
});
