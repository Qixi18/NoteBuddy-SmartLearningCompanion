# Phase 02 基线报告

日期：2026-11-16  
分支：`feat/phase-02-domain-sqlite`  
基线提交：`8a3c7df63867e0b7dc2365bbba9f87d51f5c2b61`

## Git 状态

核验时工作区干净；当前分支为 `feat/phase-02-domain-sqlite`，远程为 `origin`。未在 main 上直接开发。

## 测试基线

| 范围 | 命令 | 结果 |
|---|---|---|
| 后端 | `python -m pytest`（`apps/backend`） | 22 passed |
| 前端 | `npm test`（`apps/web`） | 3 个文件、5 passed |
| 前端构建 | `npm run build`（`apps/web`） | TypeScript 与 Vite 成功，42 modules |

环境：Python 3.14.6、Node v24.20.0、npm 11.19.0。以上为 Phase 02 修改前记录；后续结果必须独立记录，不将基线结果冒充为改造后的验证。

## 数据基线摘要

本地 `data/` 有 5 个分析 JSON 快照及当前运行指针；各快照核心记录量相同（806 原始作答、799 选中作答、40 学生、9 学习目标、65 材料、2 节点、419 metrics）。历史字段逐步演进，最早快照缺 `observations`、`source_index`、`source_root` 和 `source_files`。当前运行 ID 为 `2f2622ce9170e5b1`，有 1 条教师复核历史。迁移前必须重新核对文件及 hash，备份整个数据目录；本摘要不替代正式迁移清单。

## 已知限制

基线测试只覆盖仓库现有测试；未将真实 DeepSeek API 调用作为基线。真实历史 JSON 迁移尚未执行。
