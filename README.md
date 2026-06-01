# linuxaiimpact

`linuxaiimpact` 是一个 Node.js HTTP 服务，用于对 Git 分支相对指定 commit 的改动做影响面分析、业务功能测试清单和代码评审报告生成。运行目标环境为 Linux + Node.js v22.18.0 或更高版本。

## 功能

- HTTP 接收项目名称、Git 地址、分支和对比 commit。
- 内置队列，最多同时运行 2 个分析任务，其余请求排队等待。
- 每个任务先 clone 仓库并获取 `git diff`、变更文件和改动函数。
- Lua 改动通过 `tools/luals-mcp-wrapper.lua` 适配 LuaLS MCP 流程；非 Lua 改动通过 codegraph 适配器获取调用链，工具不可用时自动写入静态降级结果。
- 支持通过 API key 调用 OpenAI、Claude、MiniMax、Ollama 等模型，也支持离线规则引擎。
- 分析过程拆成多个 agent：diff、调用链、业务影响面、测试清单、代码评审。
- 支持项目业务知识和特殊说明：仓库内 `.aiimpact/business.md`、`.aiimpact/special-notes.md`、`.aiimpact/knowledge.md`，或服务仓库 `knowledge/projects/<项目名>.md`。
- 内置 Lua、C/C++ 代码评审标准。
- 影响面报告、测试清单、代码评审报告使用固定模板，保证每次生成格式一致。
- 产物固定写入 `/data/impact/<项目>/<项目>_<分支>_<时间戳>/`。

## 快速启动

```bash
git clone <this-repo-url> linuxaiimpact
cd linuxaiimpact
bash start.sh
```

默认监听：

```text
http://0.0.0.0:3000
```

检查服务：

```bash
curl http://127.0.0.1:3000/health
```

默认产物目录是 `/data/impact`。如果本地环境没有 `/data` 写权限，可以临时覆盖：

```bash
DATA_ROOT=/tmp/linuxaiimpact-data PORT=3000 bash start.sh
```

如果需要启动时拉取外部工具源码：

```bash
INSTALL_TOOLS=1 bash start.sh
```

外部工具会放在 `tools/vendor/`，该目录默认不提交到 Git。服务没有 npm 运行依赖，`npm start` 直接使用 Node 内置模块运行。

## 配置

默认配置在 `config/default.json`。可以用 `CONFIG_PATH` 覆盖：

```bash
CONFIG_PATH=config/ai-profiles.example.json bash start.sh
```

关键配置：

```json
{
  "port": 3000,
  "concurrency": 2,
  "dataRoot": "/data",
  "ai": {
    "defaultProfile": "openai",
    "profiles": {
      "openai": {
        "provider": "openai",
        "apiKeyEnv": "OPENAI_API_KEY",
        "model": "gpt-4.1"
      }
    },
    "agents": {
      "diff": "openai",
      "callGraph": "ollama",
      "businessImpact": "claude",
      "testChecklist": "openai",
      "review": "minimax"
    }
  }
}
```

支持的 provider 名称：

- `openai`
- `claude` 或 `anthropic`
- `minimax` 或 `minmax`
- `ollama` 或 `ollm`
- `offline`

API key 通过环境变量传入：

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export MINIMAX_API_KEY=...
```

## HTTP 协议

### 创建分析任务

`POST /api/analyze`

请求：

```json
{
  "projectName": "billing",
  "gitUrl": "https://github.com/example/billing.git",
  "branch": "feature/risk-check",
  "baseCommit": "abc123",
  "aiProfile": "openai",
  "metadata": {
    "requester": "qa"
  }
}
```

响应：

```json
{
  "jobId": "job_xxx",
  "status": "queued",
  "statusUrl": "/api/jobs/job_xxx",
  "queue": {
    "concurrency": 2,
    "active": 1,
    "pending": 0
  }
}
```

### 查询任务

`GET /api/jobs/<jobId>`

完成后响应中会包含：

```json
{
  "status": "completed",
  "result": {
    "runName": "billing_feature_risk-check_20260601T010203Z",
    "runDir": "/data/impact/billing/billing_feature_risk-check_20260601T010203Z",
    "impactReport": "/data/impact/billing/billing_feature_risk-check_20260601T010203Z/impact-report.md",
    "reviewReport": "/data/impact/billing/billing_feature_risk-check_20260601T010203Z/code-review.md",
    "testChecklist": "/data/impact/billing/billing_feature_risk-check_20260601T010203Z/test-checklist.md"
  }
}
```

### 列出任务

`GET /api/jobs`

### 健康检查

`GET /health`

## 产物

每次分析会生成：

- `diff.patch`
- `call-graph.json`
- `impact-report.md`
- `test-checklist.md`
- `code-review.md`
- `summary.json`

命名规则：

```text
/data/impact/<项目>/<项目>_<分支>_<时间戳>/
```

项目名和分支名会做路径安全转换，例如空格转 `_`，`feature/foo` 转 `feature_foo`。

## 项目业务知识

推荐在被分析项目中提交：

```text
.aiimpact/business.md
.aiimpact/special-notes.md
.aiimpact/knowledge.md
```

也可以在本服务仓库中创建：

```text
knowledge/projects/<项目名>.md
```

分析时会综合这些说明、改动函数和调用链生成业务影响面与测试清单。

## 代码评审标准

内置标准：

- `standards/lua.md`
- `standards/c_cpp.md`

服务会根据改动文件语言自动加载对应标准，并使用 `templates/code-review-template.md` 的固定结构生成报告。

## 本地测试

```bash
npm test
```

启动服务：

```bash
PORT=3000 bash start.sh
```
