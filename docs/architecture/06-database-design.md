# 06 — SQLite 数据库设计

## 技术与生命周期

SQLite + SQLAlchemy 2.x + Alembic。Domain、ORM 和 Pydantic API schema 分离。数据库 URL 由 `SMART_LEARNING_DATABASE_URL` 配置；未设置时固定为仓库根目录 `data/smart_learning.db`，不随 `SMART_LEARNING_DATA_DIR` 改变。相对配置路径以仓库根目录为基准，与进程 CWD 无关。Windows 绝对路径示例：`sqlite:///D:/workspace/project/data/smart_learning.db`。

应用不自动建表或升级 schema。首次启动前在后端目录执行 `python -m app.cli db-upgrade`。SQLite 每个连接执行 `PRAGMA foreign_keys=ON` 和 `PRAGMA busy_timeout=5000`；本阶段未启用 WAL。开发及用户数据各自使用本地文件，不支持多用户高并发写入。

## ER 图

```mermaid
erDiagram
    ANALYSIS_RUNS ||--o{ CLASSES : scopes
    ANALYSIS_RUNS ||--o{ STUDENTS : scopes
    CLASSES ||--o{ STUDENTS : contains
    ANALYSIS_RUNS ||--o{ LEARNING_OBJECTIVES : scopes
    ANALYSIS_RUNS ||--o{ LEARNING_ITEMS : scopes
    LEARNING_ITEMS ||--o{ LEARNING_ITEM_OBJECTIVES : maps
    LEARNING_OBJECTIVES ||--o{ LEARNING_ITEM_OBJECTIVES : maps
    ANALYSIS_RUNS ||--o{ ASSESSMENT_NODES : scopes
    ANALYSIS_RUNS ||--o{ RESPONSE_EVENTS : scopes
    RESPONSE_EVENTS ||--o{ RESPONSES : groups
    ANALYSIS_RUNS ||--o{ RESPONSES : scopes
    ANALYSIS_RUNS ||--o{ TEACHER_REVIEWS : scopes
    ANALYSIS_RUNS {
      string run_id PK
      string created_at
      string rule_version
      string input_fingerprint
      text snapshot_json
    }
    CLASSES {
      string run_id PK
      string class_id PK
    }
    STUDENTS {
      string run_id PK,FK
      string student_id PK
      string class_id FK
      text data_json
    }
    LEARNING_OBJECTIVES {
      string run_id PK,FK
      string indicator_id PK
      string topic_id
      text data_json
    }
    LEARNING_ITEMS {
      string run_id PK,FK
      string material_id PK
      string item_type
      text data_json
    }
    LEARNING_ITEM_OBJECTIVES {
      string run_id PK,FK
      string material_id PK,FK
      string indicator_id PK,FK
    }
    ASSESSMENT_NODES {
      string run_id PK,FK
      string node_id PK
      text data_json
    }
    RESPONSE_EVENTS {
      string run_id PK,FK
      string event_key PK
      string event_id
    }
    RESPONSES {
      string run_id PK,FK
      string record_id PK
      string event_key FK
      boolean is_selected
      string student_id FK
      string material_id FK
      string node_id FK
      int source_line
      text data_json
    }
    TEACHER_REVIEWS {
      string run_id PK,FK
      string student_id PK
      string indicator_id PK
      int version PK
      string status
      text payload_json
    }
    APP_STATE {
      string key PK
      text value
    }
```

复合主键以 `(run_id, entity_id)` 隔离跨运行的相同赛事 ID。作答事件与原始作答分表；`responses.is_selected` 由当前分析结果投影，历史原始字段保存在 data_json。`learning_item_objectives` 支持多对多。对可能含无效上游引用的源作答，记录保留在快照和 responses，不强制学生/材料外键；有效核心实体和事件关系仍受约束。

`analysis_runs.snapshot_json` 保存原分析结果全文作为不可变兼容和恢复载体；学生、班级、目标、材料、节点、作答和复核仍有可查询关系表。尚未独立持久化的 Diagnosis/Evidence/Recommendation 不建空表，它们从分析快照和建议服务即时派生；教师实际复核保存在追加式 `teacher_reviews`。

## 事务及 Repository

`AnalysisRunRepository` 原子保存 run 元信息、规范化投影与当前指针；run ID 已存在且快照不同会拒绝覆盖。导入失败不会切换当前指针。`SaveReview` Application Use Case 通过 UoW，在同一写事务中读取运行与历史、校验学生/目标/允许证据并追加新版本。SQLite 在读最新 Review 版本前取得 `BEGIN IMMEDIATE` 写锁；唯一键仍作为最终冲突保护。Repository 返回当前服务需要的 dict 兼容投影，不将 ORM 暴露给 API；业务统计仍由 TASK services 负责。

`SessionFactory` 管理 Session 生命周期，FastAPI shutdown 会 dispose Engine。SQLite 一致性备份使用 SQLite backup API，恢复拒绝覆盖已有目标并校验 integrity、foreign keys、schema revision 与表计数。恢复演练覆盖多个 run 的同名实体、多版本 Review、current pointer、快照 hash，并在恢复库上执行成果 ZIP 导出。Alembic 是正式 schema 初始化和升级入口；应用启动不自动建表/迁移。

Repository 文件：`analysis_run_repository.py`、`review_repository.py` 等保留在兼容目录；接口在 `application/ports/repositories.py` 与 `unit_of_work.py`，SQLAlchemy adapter 经 `infrastructure/database/unit_of_work.py` 注入共享 Session。`Store` 是 CLI/兼容调用的组合根，不承担新的业务事务。Domain/ORM 映射集中于 `infrastructure/database/mappers.py`。schema 初始版本在 `apps/backend/alembic/versions/`。数据库约束、跨连接读写和事务失败用临时 SQLite 测试。
