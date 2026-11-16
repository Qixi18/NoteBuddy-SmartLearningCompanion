# 模块边界

## 后端

| 模块 | 当前职责 | 不应承担 |
|---|---|---|
| `api/routes/` | 请求校验、调用应用能力、序列化响应 | 文件读写、统计计算、模型 HTTP |
| `schemas/http.py` | Pydantic HTTP 输入和已建模的稳定响应契约 | 持久化或业务决策 |
| `services/task01/source_index_service.py`、`source_service.py` | 来源索引及 PDF allowlist、定位、哈希 | 统计计算、HTTP 响应 |
| `services/task02/` | 版本选择、质量校验、指标与观察、导入编排、案例筛选 | HTTP 路由和持久化格式 |
| `services/task03/` | 规则/DeepSeek 草稿、证据校验、教师复核规则 | HTTP 与文件格式 |
| `services/shared/export_service.py` | 从分析及复核快照生成成果 ZIP | HTTP 响应发送 |
| `services/analysis.py`、`cases.py`、`recommendations.py`、`exports.py` | 兼容旧导入路径的轻量 re-export | 新业务逻辑 |
| `repositories/analysis_run_repository.py` | 保存/读取 JSON 快照及当前指针 | 质量分析或建议生成 |
| `repositories/review_repository.py` | 追加复核版本、原子替换历史文件 | 业务校验、HTTP 或 ZIP 编排 |
| `infrastructure/ingestion/csv_reader.py` | 六类 CSV 编码、表头、行号和哈希读取 | 指标计算 |
| `infrastructure/llm/deepseek_client.py` | DeepSeek HTTP 请求与提供方响应读取 | 提示策略、教学判断 |
| `repositories/store.py` | 兼容门面，组织导入服务与两个 Repository | 长期新增持久化职责 |

TASK 依赖方向：TASK 01 课程数据 → TASK 02 质量/统计/案例 → TASK 03 证据/建议/复核；共享导出服务读取分析和复核输出。TASK 能力已按实际职责落在相应目录中，顶层旧模块仅保留兼容导出。

## 前端

`App.tsx` 负责界面组合；`app/hooks/useWorkbench.ts` 管理工作台状态和 API 调用协调；`api/client.ts` 是唯一网络入口。目标/来源面板位于 TASK 01，质量/班级/学生/证据视图位于 TASK 02，复核位于 TASK 03；导入与导出保持独立 feature，共享 UI 控件放在 `components/`。

## 持久化

AnalysisRunRepository 处理 `analysis.json` 与 `current.txt`；ReviewRepository 单独追加 `reviews.json` 版本。写入用临时文件再替换。Repository 不计算统计、不推断教学建议。文件存储适用于当前离线单用户范围。
