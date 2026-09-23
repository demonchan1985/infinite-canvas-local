import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL("../", import.meta.url));
const url = "http://127.0.0.1:3102/canvas";

// 端口冲突时停止，不终止原版或其他进程，也不自动改用别的端口。
async function checkPort(port) {
    await new Promise((resolve, reject) => {
        const server = createServer();
        server.once("error", () => reject(new Error(`端口 ${port} 已被占用。若独立版已经运行，请直接打开 ${url}；否则请先检查占用程序。`)));
        server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
}

try {
    await checkPort(3102);
    await checkPort(17375);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

const agent = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/index.ts"], { cwd: path.join(root, "canvas-agent"), env: { ...process.env, PORT: "17375" }, stdio: ["ignore", "pipe", "inherit"] });
const web = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "3102", "--strictPort"], { cwd: path.join(root, "web"), stdio: ["ignore", "pipe", "inherit"] });
let stopping = false;
let opened = false;
let agentReady = false;
let webReady = false;
function openWhenReady() {
    if (opened || !agentReady || !webReady) return;
    opened = true;
    const config = JSON.parse(readFileSync(path.join(root, "canvas-agent/.runtime/canvas-agent.json"), "utf8"));
    const fragment = new URLSearchParams({ agentUrl: config.url, agentToken: config.token });
    console.log(`独立画布：${url}\n原版 3101 未改动；按 Ctrl+C 停止本次启动的独立服务。`);
    if (!process.argv.includes("--no-open")) spawn("open", [`${url}#${fragment}`], { stdio: "ignore" }).on("error", () => console.log(`请手动打开 ${url}`));
}
function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    agent.kill("SIGTERM");
    web.kill("SIGTERM");
    process.exitCode = code;
}
for (const child of [agent, web]) {
    child.once("error", (error) => { console.error(error.message); stop(1); });
    child.once("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
web.stdout.on("data", (data) => {
    process.stdout.write(data);
    if (data.toString().includes("http://127.0.0.1:3102")) webReady = true;
    openWhenReady();
});
agent.stdout.on("data", (data) => {
    process.stdout.write(data);
    if (data.toString().includes("Canvas Agent started")) agentReady = true;
    openWhenReady();
});
