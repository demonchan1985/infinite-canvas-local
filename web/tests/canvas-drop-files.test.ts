import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canvasDroppedMediaFiles, canvasDroppedMediaKind, normalizeCanvasDroppedFile } from "../src/lib/canvas/canvas-drop-files.ts";

const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const infiniteCanvasSource = readFileSync(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url), "utf8");

function file(name: string, type: string) {
    return { name, type } as File;
}

test("微信拖出的空 MIME 图片按文件名识别为图片", () => {
    assert.equal(canvasDroppedMediaKind(file("微信图片_20260920.jpg", "")), "image");
    assert.equal(canvasDroppedMediaKind(file("image.png", "application/octet-stream")), "image");
});

test("文件列表为空时从原生拖放项读取微信图片", () => {
    const wechatImage = file("微信图片_20260920.png", "");
    const media = canvasDroppedMediaFiles({
        files: [] as unknown as FileList,
        items: [{ kind: "file", getAsFile: () => wechatImage }] as unknown as DataTransferItemList,
    });
    assert.deepEqual(media.map((item) => ({ name: item.file.name, kind: item.kind })), [{ name: wechatImage.name, kind: "image" }]);
});

test("微信空 MIME 图片会在导入前恢复真实 PNG MIME", async () => {
    const wechatImage = new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "微信图片",
        { type: "application/octet-stream" },
    );

    const normalized = await normalizeCanvasDroppedFile(wechatImage, "image");

    assert.equal(normalized.type, "image/png");
    assert.equal(normalized.name, "微信图片");
});

test("微信错误标注的图片 MIME 以真实文件头为准，并创建独立副本", async () => {
    const wechatImage = new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "微信图片.jpg",
        { type: "image/jpeg" },
    );

    const normalized = await normalizeCanvasDroppedFile(wechatImage, "image");

    assert.equal(normalized.type, "image/png");
    assert.notEqual(normalized, wechatImage);
    assert.deepEqual(new Uint8Array(await normalized.arrayBuffer()), new Uint8Array(await wechatImage.arrayBuffer()));
});

test("画布拖放使用微信兼容的媒体提取，并明确复制外部文件", () => {
    assert.match(projectSource, /canvasDroppedMediaFiles\(event\.dataTransfer\)/);
    assert.match(projectSource, /const preparedFiles = files\.map/);
    assert.match(projectSource, /file: kind === "image" \? normalizeCanvasDroppedFile\(file, kind\)/);
    assert.match(infiniteCanvasSource, /event\.dataTransfer\.dropEffect = "copy"/);
});

test("微信临时文件被系统拒绝读取时提供可操作的中文提示", () => {
    assert.match(projectSource, /error\.name === "NotReadableError"/);
    assert.match(projectSource, /微信图片临时文件无法读取/);
    assert.match(projectSource, /⌘V/);
});
