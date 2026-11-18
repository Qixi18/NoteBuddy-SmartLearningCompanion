# 模块边界

## 后端

| 模块 | 当前职责 | 不应承担 |
|---|---|---|
| `api/routes/` | 请求校验、调用应用能力、序列化响应 | 文件读写、统计计算、模型 HTTP |
| `schemas/http.py` | Pydantic HTTP 输入和已建模的稳定响应契约 | 持久化或业务决策 |
| `services/task01/source_index_service.py`、`source_service.py` | 来源索引及 PDF allowlist、定位、哈希 | 统计计算、HTTP 响应 |
| `services/task02/` | 版本选择、逐行质量处置、加权指标/节点观察、导入编排、当前节点案例候选 | HTTP 路由和持久化格式 |
| `services/task03/` | TR-01..TR-08 确定性草稿、节点范围/评分点校验、DeepSeek 输入输出证据校验 | HTTP 与文件格式 |
| `services/shared/export_service.py` | 从分析及复核快照生成兼容成果 ZIP、课程关系和节点摘要 | HTTP 响应发送 |
| `application/ports/` | Repository、UoW、FileStorage、LLM 的框架无关 Protocol | SQLAlchemy Session/ORM 和具体 adapter |
| `infrastructure/database/unit_of_work.py` | 绑定单个 Session 并拥有提交、回滚、关闭的 SQLAlchemy UoW | Domain 规则或 HTTP |
| `infrastructure/files/local_file_storage.py` | 当前 CSV/PDF 读取及 SHA-256 文件访问 adapter | 文件资产数据库或 ZIP 持久化 |
| `services/analysis.py`、`cases.py`、`recommendations.py`、`exports.py` | 兼容旧导入路径的轻量 re-export | 新业务逻辑 |
| `domain/` | 框架无关的教育对象、状态和值规则 | HTTP、ORM、文件 I/O 与统计算法编排 |
| `infrastructure/database/` | SQLAlchemy Engine、Session、ORM 映射和 SQLite 约束 | 教育业务判断与 API 契约 |
| `repositories/analysis_run_repository.py` | 保存不可变运行快照、关系投影与 current pointer | 质量分析或建议生成 |
| `repositories/review_repository.py` | 追加式复核历史及版本读取 | 证据业务校验、HTTP 或 ZIP 编排 |
| `infrastructure/ingestion/csv_reader.py` | 六类 CSV 编码、表头、行号和哈希读取 | 指标计算 |
| `infrastructure/llm/deepseek_client.py` | DeepSeek HTTP 请求与提供方响应读取 | 提示策略、教学判断 |
| `repositories/store.py` | 兼容门面，组织导入服务与两个 Repository | 长期新增持久化职责 |

TASK 依赖方向：TASK 01 课程数据 → TASK 02 质量/统计/案例 → TASK 03 证据/建议/复核；共享导出服务读取分析和复核输出。TASK02 保留旧跨节点聚合键，并增加带 `node_id` 的学生/班级指标和学生×节点×指标观察；质量报告逐原始行标记 scored/pending/unanswered/superseded/excluded。TASK03 使用 TR-01..TR-08，校验单节点、有效记录和评分点；跨节点不得合并，冲突优先于模型草稿。题目不是默认教学材料；无人工核验的指标级映射保持 pending，建议不虚构材料 ID。非正/非法或任意重复修订号会隔离整个事件，不回退旧版本。LLM Port 是轻量 `LLMClient`，仅由 DeepSeek Adapter 实现，业务服务不直接创建供应方客户端。TASK 能力已按实际职责落在相应目录中，顶层旧模块仅保留兼容导出。

## 前端

`App.tsx` 负责界面组合；`app/hooks/useWorkbench.ts` 管理工作台状态和 API 调用协调；`api/client.ts` 是唯一网络入口。目标/来源面板位于 TASK 01，质量/班级/学生/证据视图位于 TASK 02，复核位于 TASK 03；导入与导出保持独立 feature，共享 UI 控件放在 `components/`。学科知识用主题目录与指标详情核对来源；班级页先选节点，旧运行缺少节点班级指标时显示契约缺口。学生、指标和证据页面沿用已选节点；切换学生或指标清除旧草稿，切换运行清除节点、草稿和临时复核编辑。当前运行请求先于复核历史和案例候选请求；辅助请求失败时运行仍可显示。

## 持久化

SQLAlchemy Repository 通过 run-scoped 表保存核心对象、分析快照和复核历史；`app_state.current_run_id` 维护当前运行。Repository 不计算统计、不推断教学建议，也不向 API 暴露 ORM。事务由 UoW 拥有；Review 使用同一 SQLite 写事务读取最新版本并追加。旧 JSON 只由显式迁移工具读取，不作为双写运行时数据源。
