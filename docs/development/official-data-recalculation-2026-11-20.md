# 赛题模拟学情数据独立复算记录

**日期：** 2026-11-20  
**数据类型：** 赛事资料包提供的模拟学情CSV；不是隐藏评测集。  
**执行方式：** 只读打开原始文件，使用 `scripts/independent_data_check.py` 独立读取六张CSV；未调用产品导入、修订、质量或统计模块，未改写/复制原始CSV。

## 复算结果

| 项目 | 结果 |
|---|---:|
| 学生 / 班级 / 节点 | 40 / 2 / 2 |
| 指标 / 题目与材料条目 | 9 / 65 |
| 作答原始行 / 作答事件 | 806 / 799 |
| 计分记录 | 786 |
| 得分 / 满分 | 744 / 1304 |
| 处置 | 786 scored、5 unanswered、7 superseded、4 excluded、4 pending |

上述数据与本项目的赛事基线记录一致。独立复算中的每行只落入一个处置；旧版本不进入分数总和。

## 原件指纹

每张原始CSV的SHA-256已写入 [`official-baseline.json`](../../tests/fixtures/competition/official-baseline.json)。这使复算结果绑定到本地赛事资料版本，同时不把学生级原始资料加入代码仓库。

## 可复跑命令

```powershell
python scripts/independent_data_check.py `
  --source-dir "<赛题资料包>\4_赛题数据\模拟学情数据" `
  --expected tests/fixtures/competition/official-baseline.json `
  --output .local/evaluation/official-data-check.json
```

通过表示输入文件哈希、行数、修订选择的基本处置和汇总分数与冻结基线一致。这个检查不是对全部生产质量规则的独立形式化证明，也没有评估教材映射、数学解释或隐藏赛事数据；这些仍需专题回归和人工内容复核。
