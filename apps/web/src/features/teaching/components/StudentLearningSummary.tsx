import { ClipboardCheck, UserRound } from 'lucide-react';
import { Panel } from '../../../components/PageBits';
import type { RunData } from '../../../types/api';
import type { Draft } from '../types';
import { EVIDENCE_KIND_LABELS } from '../types';
import { str } from '../../shared/workbenchTypes';
import styles from '../pages/StudentTeachingPage.module.css';

/**
 * 只展示当前运行和规则草稿实际提供的四项事实。
 * 不添加能力分、掌握度、风险等级这类没有数据支持的指标。
 */
export function StudentLearningSummary({ run, studentId, indicatorId, nodeId, objectiveName, draft, stateLabel, stateTone = 'amber' }: {
  run: RunData;
  studentId: string;
  indicatorId: string;
  nodeId: string;
  objectiveName: string;
  draft?: Draft;
  stateLabel: string;
  stateTone?: 'green' | 'amber';
}) {
  const student = run.students.find(row => String(row['学生编号'] ?? '') === studentId);
  const node = run.nodes.find(row => String(row['节点编号'] ?? '') === nodeId);
  return <div className={styles.summaryPanel}>
    <Panel
      title="学生当前学习情况"
      icon={<UserRound size={18}/>}
      action={<span className={styles.summaryBadge} data-tone={stateTone}>
        <ClipboardCheck size={13}/>{stateLabel}
      </span>}
    >
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>学生</span>
          <strong className={styles.summaryValue}>{studentId}{student ? ` · ${str(student['姓名'], '')}` : ''}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>当前测验</span>
          <strong className={styles.summaryValue}>{nodeId}{node ? ` · ${str(node['节点名称'], '')}` : ''}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>观察指标</span>
          <strong className={styles.summaryValue}>{objectiveName}</strong>
          <span className={styles.summarySub}>{indicatorId}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>诊断状态</span>
          <strong className={styles.summaryValue}>{stateLabel}</strong>
          <span className={styles.summarySub}>{draft?.rule_id ? `${draft.rule_id} · ` : ''}{draft?.evidence_kind ? EVIDENCE_KIND_LABELS[draft.evidence_kind] ?? draft.evidence_kind : '证据类型待确认'}</span>
        </div>
      </div>
      <p className={styles.summaryFoot}>
        本摘要只读取当前分析运行、范围选择与规则草稿；页面不展示没有数据支持的能力评分或掌握度推断。
      </p>
    </Panel>
  </div>;
}
