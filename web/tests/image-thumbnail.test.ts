import assert from "node:assert/strict";
import { test } from "node:test";

import { getThumbnailDimensions, pickImageSource } from "../src/lib/image-thumbnail.ts";

test("缩略图不放大小图，并将长边限制在本地预览上限", () => {
    assert.deepEqual(getThumbnailDimensions(400, 300), { width: 400, height: 300 });
    assert.deepEqual(getThumbnailDimensions(2400, 1200), { width: 768, height: 384 });
});

test("常规缩放使用 WebP 预览，高倍率时回退到原图", () => {
    const source = {
        previewUrl: "blob:preview",
        originalUrl: "blob:original",
        naturalWidth: 4096,
        naturalHeight: 4096,
        renderedWidth: 320,
        renderedHeight: 320,
        devicePixelRatio: 2,
    };

    assert.equal(pickImageSource({ ...source, scale: 1 }), "blob:preview");
    assert.equal(pickImageSource({ ...source, scale: 1.3 }), "blob:original");
});
