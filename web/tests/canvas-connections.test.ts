import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const connectionSource = readFileSync(new URL("../src/components/canvas/canvas-connections.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

test("连线悬停时在中点显示断开按钮，并将点击传递给删除回调", () => {
    assert.match(connectionSource, /const \[hovered, setHovered\] = useState\(false\)/);
    assert.match(connectionSource, /const hoverHideTimerRef = useRef/);
    assert.match(connectionSource, /const showHoverControls/);
    assert.match(connectionSource, /const hideHoverControls/);
    assert.match(connectionSource, /\}, 120\);/);
    assert.match(connectionSource, /onPointerEnter=\{showHoverControls\}/);
    assert.match(connectionSource, /onPointerLeave=\{hideHoverControls\}/);
    assert.match(connectionSource, /aria-label="断开连接"/);
    assert.match(connectionSource, /onDisconnect\?\.\(\)/);
});

test("画布将连线中点的断开操作接入既有删除连接逻辑", () => {
    assert.match(projectSource, /onDisconnect=\{\(\) => deleteConnection\(connection\.id\)\}/);
});

test("悬停 RH 连线时，中点显示由真实端口解析的槽位标签", () => {
    assert.match(connectionSource, /runningHubWorkflowPortLabel\(connection\.toPort\)/);
    assert.match(connectionSource, /当前 RH 槽位：\$\{portLabel\}/);
    assert.match(connectionSource, /hovered && portLabel/);
    assert.match(connectionSource, /midpointY - 26 \/ visualScale/);
    assert.match(connectionSource, /textAnchor="middle"/);
    assert.doesNotMatch(connectionSource, /selected && portLabel/);
});
