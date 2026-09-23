# 无限画布 · 独立版

这是基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 整理的本地独立版本，保留上游来源说明，并增加本地画布 Agent、图片与视频创作、RunningHub 工作流、技能库等功能。它运行在你的电脑上，不依赖本项目提供的云服务。

## 快速开始（macOS / Windows）

需要 Node.js 22.12+（建议使用 Node 22 LTS）和 npm。Windows 从 ZIP 导入 Skill 时需要系统提供 `tar.exe`（Windows 10 1803+ / Windows 11 通常自带）。

```bash
git clone https://github.com/demonchan1985/infinite-canvas-local.git
cd infinite-canvas-local
npm install --prefix canvas-agent
npm install --prefix web
node scripts/start-local.mjs
```

也可以双击启动器：macOS 使用 `启动独立画布.command`，Windows 使用 `启动独立画布.bat`。启动器会启动前端和本地 Agent，并打开带连接信息的画布页面。前端默认地址是 <http://127.0.0.1:3102/canvas>；Canvas Agent 监听 `127.0.0.1:17376`。按 Ctrl+C 停止服务。首次使用时，在应用配置中设置你自己的模型渠道；本地 Codex 功能需要先在本机完成 Codex 登录。

画布、素材和部分偏好保存在浏览器本地。Agent 的连接令牌与运行数据保存在 `canvas-agent/.runtime/`，该目录不会提交到 Git。

## 项目来源与授权

这是一个基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 独立发展的画布项目，不是 AIFISHER 的魔改版。风格、MJ 码图等相关功能是从 AIFISHER 移植并适配到本画布的部分功能；这不代表画布主体或其他独立功能来自 AIFISHER。

- 上游代码保留 [MIT 许可证](LICENSE)及原作者版权声明。
- 移植功能中列明的风格/MJ 目录数据、预览素材及目录适配代码受 [AIFISHER 非商业源代码许可证](web/public/AIFISHER-NONCOMMERCIAL-LICENSE.txt)约束；范围见[授权范围说明](web/public/AIFISHER-NONCOMMERCIAL-NOTICE.txt)。该限制不覆盖画布主体及无关代码。使用或分发所列内容须遵循其许可证；商业用途需移除/替换这些内容或另行取得授权。
- 其他第三方依赖、素材、模型和服务各自遵循其许可证与服务条款。接入外部模型/API 时，请自行确认相关权利和费用。

`web/public/models/FaceCap.glb` 未随仓库发布，因为目前没有可核实的再分发许可。需要使用 3D 表情预览时，请自行放入已获得许可的兼容模型文件。

本项目不提供 API Key、模型额度、云端存储或第三方服务账户。使用者负责配置自己的渠道并遵守各提供方的规则。

## 项目说明

- 本地启动脚本：[`scripts/start-local.mjs`](scripts/start-local.mjs)
- 独立版运行说明：[`独立版说明.md`](独立版说明.md)
- 安全问题反馈：[`SECURITY.md`](SECURITY.md)
- 上游项目：<https://github.com/basketikun/infinite-canvas>

本项目与上游仓库独立维护；不会自动覆盖或同步上游改动。
