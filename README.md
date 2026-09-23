# 无限画布 · 独立版

这是基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 整理的本地独立版本，保留上游来源说明，并增加本地画布 Agent、图片与视频创作、RunningHub 工作流、技能库等功能。它运行在你的电脑上，不依赖本项目提供的云服务。

## 快速开始（macOS）

需要 Node.js 22.12+（建议使用 Node 22 LTS）和 npm。

```bash
git clone https://github.com/demonchan1985/infinite-canvas-local.git
cd infinite-canvas-local
npm install --prefix canvas-agent
npm install --prefix web
node scripts/start-local.mjs
```

也可以双击 `启动独立画布.command`。前端默认地址是 <http://127.0.0.1:3102/canvas>；Canvas Agent 监听 `127.0.0.1:17375`。按启动终端中的提示关闭服务。首次使用时，在应用配置中设置你自己的模型渠道；本地 Codex 功能需要先在本机完成 Codex 登录。

画布、素材和部分偏好保存在浏览器本地。Agent 的连接令牌与运行数据保存在 `canvas-agent/.runtime/`，该目录不会提交到 Git。

## 授权说明

本仓库是混合授权内容，不能把整个仓库笼统视为 MIT 开源项目：

- 上游项目保留其 [MIT 许可证](LICENSE)及原作者版权声明。
- 来自 AIFISHER 的特定目录与改编内容受 [AIFISHER 非商业源代码许可证](web/public/AIFISHER-NONCOMMERCIAL-LICENSE.txt)约束，范围见 [授权范围说明](web/public/AIFISHER-NONCOMMERCIAL-NOTICE.txt)。当前仓库包含这些内容，因此不得将此版本用于商业用途；商业使用需另行取得授权。
- 其他第三方依赖、素材、模型和服务各自遵循其许可证与服务条款。接入外部模型/API 时，请自行确认相关权利和费用。

`web/public/models/FaceCap.glb` 未随仓库发布，因为目前没有可核实的再分发许可。需要使用 3D 表情预览时，请自行放入已获得许可的兼容模型文件。

本项目不提供 API Key、模型额度、云端存储或第三方服务账户。使用者负责配置自己的渠道并遵守各提供方的规则。

## 项目说明

- 本地启动脚本：[`scripts/start-local.mjs`](scripts/start-local.mjs)
- 独立版运行说明：[`独立版说明.md`](独立版说明.md)
- 安全问题反馈：[`SECURITY.md`](SECURITY.md)
- 上游项目：<https://github.com/basketikun/infinite-canvas>

本项目与上游仓库独立维护；不会自动覆盖或同步上游改动。
