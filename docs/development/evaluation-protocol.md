# 冻结评测协议（离线）

## 当前实现

`scripts/evaluate_competition.py` 读取冻结清单和候选输出，逐案例检查范围完全一致、引用证据属于当前允许集合、必需证据存在、材料属于审核白名单，以及必需/禁止结论是否出现。它不调用生产统计函数或模型，不联网，也不修改数据库。

```powershell
python scripts/evaluate_competition.py `
  --manifest tests/fixtures/competition/manifest.json `
  --candidate tests/fixtures/competition/candidate-reference.json `
  --output .local/evaluation/reference-report.json
```

清单用规范化 JSON 的 SHA-256 固定全部案例。改动清单中的一个事实，必须更新评测集版本并重新走冻结评审；不允许把修改过的案例伪装成原冻结集。报告绑定案例摘要、候选摘要、评测器版本和候选版本，并逐条保留失败原因。

赛事资料包中的六张模拟学情 CSV 可由独立复算器只读检查。该脚本不导入生产 ingestion、revision、quality 或 metrics 模块，按原始表重建修订与评分处置，输出所有输入文件的 SHA-256，并可对照冻结基线：

```powershell
python scripts/independent_data_check.py `
  --source-dir "<赛题资料包>\4_赛题数据\模拟学情数据" `
  --expected tests/fixtures/competition/official-baseline.json `
  --output .local/evaluation/official-data-check.json
```

2026-11-20 的本地复算与 SHA 绑定基线一致，摘要见[独立复算记录](official-data-recalculation-2026-11-20.md)。这个基线是赛事提供的模拟学情数据，不能称为隐藏独立评测集。

测试固件含36个合成组合案例（3主题×3需求×4变体）及9个合成异常场景。`candidate-reference.json` 仅验证契约解析和可复算运行，不代表真实产品输出质量。评价某个实际版本时，应将该版本在冻结输入上的候选结果保存为新文件，并记录生成代码、规则、模板和模型版本；不得覆盖官方原始数据。

## 结果解释

- `pass` 只表示结构、范围和显式允许/禁止项通过。
- `fail` 表示发生越界引用、使用未核验材料、缺少必需证据/结论，或包含明确禁止的结论。
- `missing` 表示该候选没有对应案例；未知案例也单独计数。
- 报告固定包含 `subject_matter_review: required`。学科准确性、数学解释、建议适切性、提示质量和教师修改量仍须由人工盲审，不可用本脚本自动签核。
- `official` 仅是数据清单的来源标签；只有对原件SHA、来源授权、官方口径和人工复核均有记录，才可发布官方评测结论。当前仓库的固件全部是 `synthetic`，744/1304 仍需在官方原件到位后独立复算。

## 仍需补齐

下一阶段要增加从实际应用导出的统计输入适配、独立处置复算、行级差异报告，以及规则版/模型版成对比较。新适配器必须独立实现计数逻辑，不能调用生产 `analysis` 结果作为唯一真值；真实模型请求另需确认费用和凭据授权。教师内容评审需单独记录盲审人、分歧和定稿理由。
