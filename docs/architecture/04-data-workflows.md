# 数据工作流

## 导入和运行

1. 前端 `ImportPanel` 把本机目录发往 `POST /api/import`。
2. Import 路由调用 Store 门面；CSV Reader 校验六类文件、UTF-8 编码、表头和源行号。
3. 现有确定性分析服务检查事件修订、关联、评分范围、质量 findings，生成 metrics/observations/source index。
4. SourceService 计算允许来源文件元数据；导入 Service 生成兼容 run_id，AnalysisRunRepository 通过同目录唯一临时文件原子替换 `analysis.json`，再原子更新 `current.txt`。
5. 返回 `run_id` 和质量报告。导入失败不会切换当前运行。

## 建议与教师复核

1. 前端选择学生和指标，请求规则草稿或 DeepSeek 草稿。
2. 规则服务从当前快照生成诊断。模型模式将允许证据传至可选 DeepSeek 客户端；模型输出须通过结构和证据 ID 校验。
3. 前端展示草稿，用户核对作答证据后提交复核。
4. ReviewRepository 检查学生、指标、引用范围并追加版本；用临时文件原子替换 `reviews.json`。
5. 模型超时或供应方响应结构异常时，API 返回不含供应方细节的 502；前端仍可显式请求规则草稿，不自动接受或静默覆盖草稿。

## 导出

1. `/api/export` 验证三个不同且有效的案例学生。
2. Export Service 读取当前分析快照和复核版本，生成统计、证据、原始作答、候选、已复核/待复核建议及字段说明。
3. 返回内存中的 ZIP 字节流；不将 ZIP 写入仓库。

## 安全数据流

浏览器只向本地 API 发送目录路径和业务 ID，不读取本地文件、不持有模型密钥。来源 API 对 PDF 文件名做 allowlist 校验。使用 DeepSeek 会向外部 API 发送所选学生的模拟作答证据；是否使用该能力由操作者决定。
