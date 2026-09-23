import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const geometrySource = readFileSync(new URL("../src/lib/canvas/canvas-node-geometry.ts", import.meta.url), "utf8");
const imageSource = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");
const imageStorageSource = readFileSync(new URL("../src/services/image-storage.ts", import.meta.url), "utf8");
const nodeSource = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const zhSource = readFileSync(new URL("../src/i18n/locales/zh-CN.ts", import.meta.url), "utf8");

test("拖拽位置与分组命中同在动画帧内计算，避免逐鼠标事件刷新", () => {
    assert.match(projectSource, /initialSelectedNodes: Map<string, \{ x: number; y: number \}>/);
    assert.match(projectSource, /initialPositions\.get\(node\.id\)/);
    assert.match(projectSource, /rafRef\.current = requestAnimationFrame\(\(\) => \{/);
    assert.match(projectSource, /setDropTargetGroupId\(findGroupDropTarget\(movedIds, previewNodes\)\?\.id \|\| null\)/);
    assert.doesNotMatch(projectSource, /initialSelectedNodes\.find/);
});

test("缩略图层独立保存在本地，并按实际画布倍率选择原图或 WebP", () => {
    assert.match(imageStorageSource, /storeName: "image_previews"/);
    assert.match(imageStorageSource, /createImageThumbnail/);
    assert.match(imageStorageSource, /缩略图仅保存在 IndexedDB，不进入节点数据、导出文件或远端同步/);
    assert.match(nodeSource, /pickImageSource\(\{/);
    assert.match(nodeSource, /previewUrlFor\(primaryImage\?\.storageKey \|\| node\.metadata\?\.storageKey\)/);
});

test("连线按曲线包络裁剪，端点均在视口外时仍可保留穿过视区的线", () => {
    assert.match(geometrySource, /export function connectionIntersectsViewBounds/);
    assert.match(geometrySource, /const curvature = Math\.max\(Math\.abs\(end\.x - start\.x\) \* 0\.5, 50\)/);
    assert.match(projectSource, /const viewBounds = useMemo/);
    assert.match(projectSource, /connectionIntersectsViewBounds\(/);
    assert.doesNotMatch(projectSource, /const visibleNodeIds/);
    assert.doesNotMatch(geometrySource, /\[\.\.\.nodes\]\.reverse\(\)/);
});

test("图片生成统一采用十分钟超时，Codex 本机生图也返回明确提示", () => {
    assert.match(imageSource, /const IMAGE_REQUEST_TIMEOUT_MS = 10 \* 60_000/);
    assert.match(imageSource, /const IMAGE_REQUEST_TIMEOUT_ERROR = "ImageRequestTimeoutError"/);
    assert.match(imageSource, /fetchImageRequest\("\/api\/codex\/imagegen"/);
    assert.match(imageSource, /timeout: IMAGE_REQUEST_TIMEOUT_MS/);
    assert.match(imageSource, /error\.code === "ECONNABORTED" \|\| error\.code === "ETIMEDOUT"/);
    assert.match(zhSource, /imageTimeout: "图片生成请求超时，请稍后重试"/);
});

test("图片卡片内部操作默认收起，但鼠标和键盘焦点都能显示", () => {
    assert.match(nodeSource, /group-hover\/image:opacity-100/);
    assert.match(nodeSource, /group-focus-within\/image:opacity-100/);
    assert.match(nodeSource, /group-hover\/batch-image:opacity-100/);
    assert.match(nodeSource, /group-focus-within\/batch-image:opacity-100/);
});
