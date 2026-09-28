import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { checkGitRepository, ensureFastForward } from "./update-local.mjs";

function git(cwd, ...args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("只允许干净、处于 main 且指向指定 origin 的 Git 克隆更新", async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "canvas-update-test-"));
    try {
        const remote = path.join(temp, "remote.git");
        const clone = path.join(temp, "clone");
        git(temp, "init", "--bare", remote);
        git(temp, "clone", remote, clone);
        git(clone, "config", "user.name", "Canvas Test");
        git(clone, "config", "user.email", "canvas-test@example.invalid");
        git(clone, "checkout", "-b", "main");
        writeFileSync(path.join(clone, "VERSION"), "test");
        git(clone, "add", "VERSION");
        git(clone, "commit", "-m", "initial");
        git(clone, "push", "-u", "origin", "main");

        assert.equal((await checkGitRepository(clone, remote)).ok, true);
        assert.match((await checkGitRepository(clone)).error, /独立画布仓库/);
        const untracked = path.join(clone, "my-notes.txt");
        writeFileSync(untracked, "keep");
        assert.match((await checkGitRepository(clone, remote)).error, /本地改动/);
        rmSync(untracked);
        writeFileSync(path.join(clone, "VERSION"), "changed");
        assert.match((await checkGitRepository(clone, remote)).error, /本地改动/);
        git(clone, "restore", "VERSION");
        git(clone, "checkout", "-b", "feature");
        assert.match((await checkGitRepository(clone, remote)).error, /main/);
        assert.match((await checkGitRepository(temp, remote)).error, /Git 克隆/);
        git(clone, "checkout", "main");
        git(clone, "fetch", "origin", "main");
        await ensureFastForward(clone);
        writeFileSync(path.join(clone, "VERSION"), "local");
        git(clone, "add", "VERSION");
        git(clone, "commit", "-m", "local commit");
        git(clone, "fetch", "origin", "main");
        await assert.rejects(() => ensureFastForward(clone), /快进/);
    } finally {
        rmSync(temp, { recursive: true, force: true });
    }
});
