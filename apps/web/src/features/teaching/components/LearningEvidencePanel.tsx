import { FileSearch, Info, ShieldAlert } from 'lucide-react';
import { EmptyState, Notice, Panel } from '../../../components/PageBits';
import { EvidenceRefs } from '../../diagnosis/components/EvidenceRefs';
import { EvidenceRows } from '../../diagnosis/components/EvidenceRows';
import { str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import type { Draft, StudentInsights } from '../types';
import styles from '../pages/StudentTeachingPage.module.css';

const UNKNOWN_REASON_LABELS: Record<string, string> = {
  scope_required: '尚未选择单一测验节点',
  no_response_records_in_scope: '当前范围没有作答记录',
  pending_scoring: '存在待评分记录',
  evidence_conflict: '证据之间存在冲突',
  out_of_scope: '当前节点未覆盖该主题',
};

/**
 * 学习证据面板：课程要求、已观察事实、原始作答、推断限制四块。
 * 原始作答直接复用诊断模块的 EvidenceRows，避免两个页面出现两套证据展示。
 */
export function LearningEvidencePanel({ draft, bundle, objective, insights }: {
  draft?: Draft;
  bundle?: Bundle;
  objective?: Row;
  insights?: StudentInsights;
}) {
  const coverage = (bundle?.coverage ?? {}) as Row;
  const responses = bundle?.responses ?? [];
  const scoredCount = responses.filter(row => row.disposition === 'scored').length;
  const points = draft?.score_points_to_review ?? [];
  const claims = insights?.claims ?? [];
  const unknownReason = draft?.unknown_reason ? UNKNOWN_REASON_LABELS[String(draft.unknown_reason)] ?? String(draft.unknown_reason) : '';
  return <Panel title="学习证据与推断限制" icon={<FileSearch size={18}/>}>
    <section className={styles.evidenceModule} aria-label="课程学习要求">
      <div className={styles.evidenceModuleHead}><Info size={15}/>课程学习要求</div>
      <div className={styles.evidenceModuleBody}>
        {objective ? <ul className={styles.requirementList}>
          <li><b>观察指标：</b>{str(objective['观察指标'])}</li>
          <li><b>学习要求：</b>{str(objective['学习要求'], '当前运行未提供学习要求')}</li>
          <li><b>课标定位：</b>{str(objective['课标定位'], '未提供')}</li>
          <li><b>教材定位：</b>{str(objective['教材定位'], '未提供')}</li>
        </ul> : <p>当前范围没有课程要求记录，不能据此推断学习要求。</p>}
      </div>
    </section>

    <section className={styles.evidenceModule} aria-label="已观察事实">
      <div className={styles.evidenceModuleHead}><FileSearch size={15}/>已观察事实</div>
      <div className={styles.evidenceModuleBody}>
        <p>{str(draft?.observed_fact ?? draft?.diagnosis, '规则草稿尚未返回观察事实。')}</p>
        <p>
          当前范围共 {responses.length} 条作答记录，其中有效评分 {scoredCount} 条；范围覆盖记录 {str(coverage.record_count, '0')} 条。
        </p>
        {points.length > 0 && <p><b>待核对评分点：</b>{points.join('、')}</p>}
        <div><EvidenceRefs ids={Array.isArray(draft?.evidence_record_ids) ? draft!.evidence_record_ids.map(String) : []}/></div>
        {claims.length > 0 && <ul className={styles.claimList}>{claims.slice(0, 4).map((claim, index) => <li key={String(claim.claim_id ?? index)}>
          {str(claim.text)}
          {claim.limitations?.length ? <small>限制：{claim.limitations.join('；')}</small> : null}
        </li>)}</ul>}
      </div>
    </section>

    <section className={styles.evidenceModule} aria-label="原始作答">
      <div className={styles.evidenceModuleHead}><FileSearch size={15}/>原始作答</div>
      <div className={styles.evidenceModuleBody}>
        {bundle ? <EvidenceRows bundle={bundle}/> : <EmptyState compact title="证据包读取中" detail="只使用接口返回的当前范围证据。"/>}
      </div>
    </section>

    <section className={styles.evidenceModule} aria-label="推断限制">
      <div className={styles.evidenceModuleHead}><ShieldAlert size={15}/>推断限制</div>
      <div className={`${styles.evidenceModuleBody} ${styles.evidenceLimits}`}>
        <p><strong>不能确定的结论：</strong>{str(draft?.inference_limit, '仅依据当前可核验记录，不补造学习事实。')}</p>
        {unknownReason && <p>当前证据状态：{unknownReason}。</p>}
        <p>覆盖证据只能支持教师安排进一步观察，不能被当作学生已完成的作答。</p>
      </div>
    </section>

    {!draft && <Notice>证据面板会在规则草稿返回后补全观察事实与推断限制。</Notice>}
  </Panel>;
}
