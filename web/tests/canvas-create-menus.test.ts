import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/components/canvas/canvas-create-menus.tsx", import.meta.url), "utf8");

test("创建节点菜单使用紧凑尺寸，并与创作框共享可读性缩放边界", () => {
    assert.match(source, /w-\[272px\]/);
    assert.match(source, /compact/);
    assert.match(source, /import \{ canvasCardVisualScale \} from "@\/lib\/canvas\/canvas-node-size";/);
    assert.equal((source.match(/const visualScale = canvasCardVisualScale\(scale\);/g) || []).length, 2);
    assert.doesNotMatch(source, /function menuVisualScale/);
});

test("创建节点菜单的项目分隔线为无圆角的连续直线", () => {
    assert.match(source, /grid gap-0/);
    assert.match(source, /rounded-none/);
});

test("连接创建菜单将图片和视频生成排在文本生成之后", () => {
    const textIndex = source.indexOf('title={t("canvas.createMenu.text")}');
    const imageIndex = source.indexOf('title={t("canvas.createMenu.image")}');
    const videoIndex = source.indexOf('title={t("canvas.createMenu.video")}');
    const storyboardIndex = source.indexOf('title={t("canvas.createMenu.storyboard")}');

    assert.ok(textIndex >= 0);
    assert.ok(imageIndex >= 0);
    assert.ok(videoIndex >= 0);
    assert.ok(storyboardIndex >= 0);
    assert.ok(textIndex < imageIndex && imageIndex < videoIndex && videoIndex < storyboardIndex);
});
