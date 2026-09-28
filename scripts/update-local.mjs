import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const statusFile = path.join(root, "canvas-agent/.runtime/local-update.json");
const officialRemote = /^https:\/\/github\.com\/demonchan1985\/infinite-canvas-local(?:\.git)?$|^git@github\.com:demonchan1985\/infinite-canvas-local(?:\.git)?$/;
const gitTimeout = 10 * 60 * 1000;
const installTimeout = 10 * 60 * 1000;
const stopTimeout = 30 * 1000;

function command(file, args, cwd, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(file, args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, windowsHide: true, detached: Boolean(timeoutMs), shell: process.platform === "win32" && file === "npm.cmd", stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        let timedOut = false;
        const collect = (chunk) => { output = (output + chunk.toString()).slice(-2048); };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        const timer = timeoutMs ? setTimeout(() => {
            timedOut = true;
            if (process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
            else if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
        }, timeoutMs) : null;
        child.once("error", reject);
        child.once("close", (code) => {
            if (timer) clearTimeout(timer);
            if (timedOut) return reject(new Error(`${file} 超过 10 分钟，已停止；请检查网络后重试。`));
            if (code !== 0) return reject(new Error(`${file} 退出码 ${code}：${output.trim().slice(-500)}`));
            resolve(output.trim());
        });
    });
}

function git(cwd, ...args) {
    return command("git", args, cwd);
}

export async function checkGitRepository(repoRoot, expectedRemote = officialRemote) {
    try {
        const actualRoot = await git(repoRoot, "rev-parse", "--show-toplevel");
        const normalize = (value) => process.platform === "win32" ? path.normalize(value).toLowerCase() : path.normalize(value);
        if (normalize(await realpath(actualRoot)) !== normalize(await realpath(repoRoot)))
            return { ok: false, error: "当前目录不是独立画布的 Git 克隆根目录，请用 Git 克隆版启动。" };
        const remote = await git(repoRoot, "remote", "get-url", "origin").catch(() => "");
        if (typeof expectedRemote === "string" ? remote !== expectedRemote : !expectedRemote.test(remote))
            return { ok: false, error: "origin 不是独立画布仓库，已拒绝更新以保护当前项目。" };
        const branch = await git(repoRoot, "symbolic-ref", "--quiet", "--short", "HEAD").catch(() => "");
        if (branch !== "main") return { ok: false, error: "仅支持 main 分支的一键更新，请先自行处理当前分支。" };
        if (await git(repoRoot, "status", "--porcelain", "--untracked-files=all"))
            return { ok: false, error: "Git 工作区有本地改动或未跟踪文件；请先提交或备份，不会覆盖它们。" };
        return { ok: true, error: "" };
    } catch (error) {
        if (error?.code === "ENOENT") return { ok: false, error: "未找到 Git 命令；请先安装 Git 并重新启动画布。" };
        return { ok: false, error: "当前目录不是可用的 Git 克隆，ZIP 下载目录暂不支持一键更新。" };
    }
}

export async function ensureFastForward(repoRoot) {
    try { await git(repoRoot, "merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"); }
    catch { throw new Error("远程 main 不能快进到当前提交；未覆盖本地历史，请手动处理分支。"); }
}

async function status(phase, error = "") {
    await mkdir(path.dirname(statusFile), { recursive: true });
    const temp = `${statusFile}.tmp`;
    await writeFile(temp, JSON.stringify({ phase, error, updatedAt: Date.now() }));
    await rename(temp, statusFile);
}

function portOpen(port) {
    return new Promise((resolve) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolve(true); });
        socket.once("error", () => { socket.destroy(); resolve(false); });
    });
}

async function waitForOldServices() {
    const deadline = Date.now() + stopTimeout;
    while (Date.now() < deadline) {
        if (!(await portOpen(3102)) && !(await portOpen(17376))) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("旧画布服务在 30 秒内未退出；未拉取代码，请关闭占用进程后重试。");
}

async function restartCanvas() {
    const child = spawn(process.execPath, [path.join(root, "scripts/start-local.mjs"), "--no-open"], { cwd: root, detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    let exitCode = null;
    child.once("exit", (code) => { exitCode = code ?? 1; });
    for (;;) {
        if (exitCode !== null) throw new Error(`画布重启失败（退出码 ${exitCode}），请运行本地启动器查看原因。`);
        if (await portOpen(3102) && await portOpen(17376)) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

async function applyUpdate() {
    let restartAttempted = false;
    let codeUpdated = false;
    try {
        await status("stopping");
        await waitForOldServices();
        const check = await checkGitRepository(root);
        if (!check.ok) throw new Error(check.error);
        const before = await git(root, "rev-parse", "HEAD");
        await status("fetching");
        const gitDeadline = Date.now() + gitTimeout;
        await command("git", ["fetch", "--no-tags", "origin", "main"], root, gitTimeout);
        await ensureFastForward(root);
        const gitRemaining = gitDeadline - Date.now();
        if (gitRemaining <= 0) throw new Error("Git 更新超过 10 分钟，已停止；请检查网络后重试。");
        await command("git", ["merge", "--ff-only", "FETCH_HEAD"], root, gitRemaining);
        codeUpdated = before !== await git(root, "rev-parse", "HEAD");
        const changed = (await git(root, "diff", "--name-only", before, "HEAD")).split("\n");
        const packages = ["canvas-agent", "web"].filter((item) => changed.includes(`${item}/package-lock.json`) || changed.includes(`${item}/package.json`));
        if (packages.length) {
            await status("installing");
            const deadline = Date.now() + installTimeout;
            for (const item of packages) {
                const remaining = deadline - Date.now();
                if (remaining <= 0) throw new Error("依赖安装超过 10 分钟，已停止；请检查网络后重试。");
                await command(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--include=dev", "--no-audit", "--no-fund"], path.join(root, item), remaining);
            }
            if (await git(root, "status", "--porcelain", "--untracked-files=all"))
                throw new Error("依赖安装后 Git 工作区出现改动；文件已保留，请检查后再更新。");
        }
        await status("restarting");
        restartAttempted = true;
        await restartCanvas();
        await status("done");
    } catch (error) {
        const reason = `${error instanceof Error ? error.message : String(error)}${codeUpdated ? "；代码已快进但依赖可能未安装完成，请检查依赖并重新运行独立启动器。" : ""}`;
        await status("failed", reason);
        if (!restartAttempted) {
            try { await restartCanvas(); }
            catch (restartError) {
                await status("failed", `${reason}；${restartError instanceof Error ? restartError.message : String(restartError)}`);
            }
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv[2] === "--check") {
        const result = await checkGitRepository(root);
        process.stdout.write(JSON.stringify(result));
    } else if (process.argv[2] === "--apply") {
        await applyUpdate();
    }
}
