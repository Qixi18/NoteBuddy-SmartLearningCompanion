# 第一阶段基线报告

基线核验时间：2026-11-16。基线提交为 `96b1be626ba38c2d6731063cf315827658d1effe`，开发分支 `codex/phase-01-foundation`。核验时工作区干净，HEAD 等于 spec 记录的基准提交；没有拉取或改写远程 main。

## 基线命令和结果

- `python -m pytest -q`：10 passed。公共赛事数据测试会在预期夹具路径不存在时提前跳过；当时项目中未检查到随仓库提供的赛事原始数据。
- `cd apps/web; npm run build`：TypeScript 项目构建和 Vite 生产构建通过。
- Node/npm 基线版本依据实施 spec 记录为 Node 24.20.0、npm 11.19.0；前端初始依赖清单为 React 19、React DOM 19、TypeScript 5.7、Vite 6。
- Python 基线版本依据实施 spec 记录为 Python 3.14.6。初始 `pyproject.toml` 没有运行时依赖；测试由本地环境提供。

## 初始架构

- 后端用标准库 `ThreadingHTTPServer` 和自定义 Handler。路由通过对象属性复制关联 Store，错误响应不统一，缺少模型化参数校验和健康端点。
- `services/analysis.py` 同时处理 CSV 读取、版本/质量规则、统计和来源索引；`repositories/store.py` 兼管运行、来源定位和复核数据。
- 前端有 API client，但业务类型集中在一个文件；App 管理所有工作流状态；前端没有测试运行器。
- CI workflow 尚不存在。README 描述现有功能和 PowerShell 启动，但未给出完整 `.env` 环境变量配置说明。

## 基线已有业务

六类 CSV 导入；作答事件最高修订选择与同最高版本冲突隔离；质量 finding 和原始行号；学生、班级、主题、指标统计及观察；三类案例候选；规则草稿与可选 DeepSeek 草稿；DeepSeek 证据引用校验；教师复核追加版本；来源 PDF allowlist；按当前快照、复核记录生成 ZIP。

## 限制

没有真实赛事数据时，无法对全部公开数据行进行核对。未执行真实付费 DeepSeek 调用。基线只验证原有十项后端测试和 Web 构建，前端交互没有自动化测试。
