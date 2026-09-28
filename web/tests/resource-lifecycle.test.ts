import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import { test } from "node:test";

import localforage from "localforage";

// 只替换浏览器存储边界；服务与 Blob URL 使用真实实现，不访问用户的 IndexedDB。
const databases = new Map<string, Map<string, unknown>>();
const pausedReads = new Map<string, { entered: () => void; released: Promise<void> }>();
const readFailures = new Map<string, Error>();

function pauseRead(storeName: string, key: string) {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    pausedReads.set(`${storeName}/${key}`, { entered, released });
    return { started, release };
}

function records(instance: LocalForage) {
    const name = `${instance.config("name")}/${instance.config("storeName")}`;
    let database = databases.get(name);
    if (!database) {
        database = new Map();
        databases.set(name, database);
    }
    return database;
}

await localforage.defineDriver({
    _driver: localforage.INDEXEDDB,
    _support: true,
    async _initStorage() {},
    async getItem<T>(key: string) {
        const readKey = `${this.config("storeName")}/${key}`;
        const failure = readFailures.get(readKey);
        if (failure) {
            readFailures.delete(readKey);
            throw failure;
        }
        const value = structuredClone(records(this).get(key) ?? null) as T | null;
        const paused = pausedReads.get(readKey);
        if (paused) {
            pausedReads.delete(readKey);
            paused.entered();
            await paused.released;
        }
        return value;
    },
    async setItem<T>(key: string, value: T) {
        records(this).set(key, structuredClone(value));
        return value;
    },
    async removeItem(key: string) {
        records(this).delete(key);
    },
    async clear() {
        records(this).clear();
    },
    async keys() {
        return [...records(this).keys()];
    },
    async key(index: number) {
        return [...records(this).keys()][index] ?? null;
    },
    async length() {
        return records(this).size;
    },
    async iterate<T>(iterator: (value: unknown, key: string, iterationNumber: number) => T) {
        for (const [index, [key, value]] of [...records(this)].entries()) {
            const result = iterator(value, key, index + 1);
            if (result !== undefined) return result;
        }
    },
});

Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true });

const images = await import("../src/services/image-storage.ts");
const media = await import("../src/services/file-storage.ts");
const imageStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const mediaStore = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });

test("同一图片并发读取复用一个 URL，删除后释放且不改变原图字节", async (t) => {
    const key = "image:concurrent";
    const original = new Blob([new Uint8Array([137, 80, 78, 71, 0, 255])], { type: "image/png" });
    await imageStore.setItem(key, original);

    const urls = await Promise.all(Array.from({ length: 12 }, () => images.resolveImageUrl(key)));
    t.after(async () => {
        await images.deleteStoredImages([key]);
        urls.forEach((url) => URL.revokeObjectURL(url));
    });

    assert.equal(new Set(urls).size, 1);
    const restored = await (await fetch(urls[0])).blob();
    assert.equal(restored.type, original.type);
    assert.deepEqual(await restored.arrayBuffer(), await original.arrayBuffer());

    await images.deleteStoredImages([key]);
    assert.ok(urls.every((url) => resolveObjectURL(url) === undefined));
    assert.equal(await images.getImageBlob(key), null);
});

test("图片替换只保留当前资源，旧 URL 及时释放", async (t) => {
    const key = "image:replacement";
    const urls: string[] = [];
    t.after(async () => {
        await images.deleteStoredImages([key]);
        urls.forEach((url) => URL.revokeObjectURL(url));
    });

    for (let index = 0; index < 12; index += 1) {
        urls.push(await images.setImageBlob(key, new Blob([`original-${index}`], { type: "image/png" })));
    }

    assert.equal(urls.slice(0, -1).filter((url) => resolveObjectURL(url)).length, 0);
    assert.equal(await images.resolveImageUrl(key), urls.at(-1));
    assert.equal(await (await fetch(urls.at(-1)!)).text(), "original-11");
    assert.equal(await (await images.getImageBlob(key))?.text(), "original-11");

    await images.deleteStoredImages([key]);
    assert.ok(urls.every((url) => resolveObjectURL(url) === undefined));
});

test("同一媒体并发读取复用一个 URL，删除后释放且不改变原始字节", async (t) => {
    const key = "video:concurrent";
    const original = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], { type: "video/mp4" });
    await mediaStore.setItem(key, original);

    const urls = await Promise.all(Array.from({ length: 12 }, () => media.resolveMediaUrl(key)));
    t.after(async () => {
        await media.deleteStoredMedia([key]);
        urls.forEach((url) => URL.revokeObjectURL(url));
    });

    assert.equal(new Set(urls).size, 1);
    const restored = await (await fetch(urls[0])).blob();
    assert.equal(restored.type, original.type);
    assert.deepEqual(await restored.arrayBuffer(), await original.arrayBuffer());

    await media.deleteStoredMedia([key]);
    assert.ok(urls.every((url) => resolveObjectURL(url) === undefined));
    assert.equal(await media.getMediaBlob(key), null);
});

test("媒体替换只保留当前资源，旧 URL 及时释放", async (t) => {
    const key = "audio:replacement";
    const urls: string[] = [];
    t.after(async () => {
        await media.deleteStoredMedia([key]);
        urls.forEach((url) => URL.revokeObjectURL(url));
    });

    for (let index = 0; index < 12; index += 1) {
        urls.push(await media.setMediaBlob(key, new Blob([`audio-${index}`], { type: "audio/wav" })));
    }

    assert.equal(urls.slice(0, -1).filter((url) => resolveObjectURL(url)).length, 0);
    assert.equal(await media.resolveMediaUrl(key), urls.at(-1));
    assert.equal(await (await fetch(urls.at(-1)!)).text(), "audio-11");
    assert.equal(await (await media.getMediaBlob(key))?.text(), "audio-11");

    await media.deleteStoredMedia([key]);
    assert.ok(urls.every((url) => resolveObjectURL(url) === undefined));
});

test("清理未使用媒体释放 URL，但保留仍被节点引用的资源", async (t) => {
    const usedKey = "video:used";
    const unusedKey = "audio:unused";
    const usedUrl = await media.setMediaBlob(usedKey, new Blob(["keep"]));
    const unusedUrl = await media.setMediaBlob(unusedKey, new Blob(["remove"]));
    t.after(async () => {
        await media.deleteStoredMedia([usedKey, unusedKey]);
        [usedUrl, unusedUrl].forEach((url) => URL.revokeObjectURL(url));
    });

    await media.cleanupUnusedMedia({ nodes: [{ data: { storageKey: usedKey } }] });

    assert.equal(await media.getMediaBlob(unusedKey), null);
    assert.equal(resolveObjectURL(unusedUrl), undefined);
    assert.ok(resolveObjectURL(usedUrl));
    assert.equal(await media.resolveMediaUrl(usedKey), usedUrl);
    assert.equal(await (await fetch(usedUrl)).text(), "keep");
});

const resources = [
    { name: "图片", prefix: "image", store: imageStore, resolve: images.resolveImageUrl, get: images.getImageBlob, set: images.setImageBlob, remove: images.deleteStoredImages },
    { name: "媒体", prefix: "audio", store: mediaStore, resolve: media.resolveMediaUrl, get: media.getMediaBlob, set: media.setMediaBlob, remove: media.deleteStoredMedia },
];

for (const resource of resources) {
    test(`${resource.name}删除后，尚未完成的读取不能重新创建资源`, async (t) => {
        const key = `${resource.prefix}:delete-during-read`;
        await resource.store.setItem(key, new Blob(["old"]));
        const paused = pauseRead(resource.store.config("storeName") as string, key);
        const pending = resource.resolve(key, "fallback");
        t.after(async () => {
            paused.release();
            const url = await pending;
            await resource.remove([key]);
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        });

        await paused.started;
        await resource.remove([key]);
        paused.release();

        assert.equal(await pending, "fallback");
        assert.equal(await resource.get(key), null);
        assert.equal(await resource.resolve(key, "fallback"), "fallback");
    });

    test(`${resource.name}替换时，旧读取返回当前资源而不是旧字节`, async (t) => {
        const key = `${resource.prefix}:replace-during-read`;
        await resource.store.setItem(key, new Blob(["old"]));
        const paused = pauseRead(resource.store.config("storeName") as string, key);
        const pending = resource.resolve(key);
        t.after(async () => {
            paused.release();
            const url = await pending;
            await resource.remove([key]);
            URL.revokeObjectURL(url);
        });

        await paused.started;
        const replacement = await resource.set(key, new Blob(["new"]));
        paused.release();

        assert.equal(await pending, replacement);
        assert.equal(await resource.resolve(key), replacement);
        assert.equal(await (await fetch(replacement)).text(), "new");
        assert.equal(await (await resource.get(key))?.text(), "new");
    });

    test(`${resource.name}不存在时保留各自的回退地址，并允许稍后重新读取`, async (t) => {
        const key = `${resource.prefix}:missing`;
        t.after(() => resource.remove([key]));

        assert.deepEqual(await Promise.all([resource.resolve(key, "first"), resource.resolve(key, "second")]), ["first", "second"]);
        assert.equal(await resource.resolve(undefined, "fallback"), "fallback");

        await resource.store.setItem(key, new Blob(["added"]));
        const url = await resource.resolve(key);
        assert.ok(resolveObjectURL(url));
        assert.equal(await (await fetch(url)).text(), "added");
    });

    test(`${resource.name}存储读取失败后可以重试，不保留失败的并发请求`, async (t) => {
        const key = `${resource.prefix}:retry`;
        await resource.store.setItem(key, new Blob(["retry"]));
        readFailures.set(`${resource.store.config("storeName")}/${key}`, new Error("storage read failed"));
        t.after(() => resource.remove([key]));

        const failures = await Promise.allSettled([resource.resolve(key), resource.resolve(key)]);
        assert.ok(failures.every((result) => result.status === "rejected" && /storage read failed/.test(result.reason.message)));

        const url = await resource.resolve(key);
        assert.ok(resolveObjectURL(url));
        assert.equal(await (await fetch(url)).text(), "retry");
    });
}
