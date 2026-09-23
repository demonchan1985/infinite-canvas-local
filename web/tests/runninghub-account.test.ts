import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRunningHubAccountStatus, runningHubAccountKey } from "../src/services/runninghub-account.ts";

test("RunningHub 账户状态同时读取 RH 币与钱包余额", () => {
    assert.deepEqual(
        parseRunningHubAccountStatus({ code: 0, data: { remainCoins: "45804", remainMoney: "11.47", currency: "CNY", currentTaskCounts: 2 } }),
        { coins: 45804, wallet: 11.47, currency: "CNY", runningTasks: 2 },
    );
});

test("RunningHub 返回异常时不把错误响应当余额显示", () => {
    assert.throws(() => parseRunningHubAccountStatus({ code: 400, msg: "API Key 无效" }), /API Key 无效/);
});

test("工作流使用的消费级 Key 优先读取账户状态", () => {
    assert.equal(
        runningHubAccountKey([{ id: "rh", name: "RunningHub", baseUrl: "https://www.runninghub.cn", apiKey: "enterprise-key", consumerApiKey: "consumer-key", apiFormat: "runninghub", models: [] }]),
        "consumer-key",
    );
});
