import { FileSearch, Info, Layers, ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
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
 * 学习证据面板：三层信息结构。
 * 第一层诊断摘要，第二层三类证据卡片，第三层按需展开的原始作答与评分记录。
 * 请求失败、加载中与"确实没有记录"必须分开，不能把未返回的数据显示成零。
 */
export function LearningEvidencePanel({ draft, bundle, objective, insights, isPending = false, isError = false, error = '', onRetry }: {
  draft?: Draft;
  bundle?: Bundle;
  objective?: Row;
  insights?: StudentInsights;
  isPending?: boolean;
  isError?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const coverage = (bundle?.coverage ?? {}) as Row;
  const responses = bundle?.responses ?? [];
  const scoredCount = responses.filter(row => row.disposition === 'scored').length;
  const points = draft?.score_points_to_review ?? [];
  const claims = insights?.claims ?? [];
  const unknownReason = draft?.unknown_reason ? UNKNOWN_REASON_LABELS[String(draft.unknown_reason)] ?? String(draft.unknown_reason) : '';
  const coverageCount = typeof coverage.record_count === 'number' ? coverage.record_count : null;
  const observedFact = str(draft?.observed_fact ?? draft?.diagnosis, '规则草稿尚未返回观察事实。');
  const limitation = str(draft?.inference_limit, unknownReason ? `当前证据状态：${unknownReason}。` : '仅依据当前可核验记录，不补造学习事实。');
  return <Panel title="学习证据与推断限制" icon={<FileSearch size={18}/>} action={<span className={styles.evidenceLayerHint}><Layers size={13}/>摘要 → 详情 → 原始作答</span>}>
    {isError ? <ErrorBox message={error || '证据包读取失败。'} onRetry={onRetry}/> : isPending ? <Loading compact label="正在读取当前范围证据…"/> : !bundle ? <EmptyState title="尚未获取证据包" detail="接口没有返回当前范围的证据；这不代表学生没有作答，也不代表零分。" action={onRetry ? <button type="button" className={styles.inlineButton} onClick={onRetry}>重新读取证据</button> : undefined}/> : <>
      <section className={styles.evidenceSummary} aria-label="诊断摘要">
        <div className={styles.evidenceStats}>
          <div className={styles.evidenceStat}><strong>{coverageCount ?? responses.length}</strong><span>作答记录</span></div>
          <div className={styles.evidenceStat}><strong>{scoredCount}</strong><span>有效评分记录</span></div>
          <div className={styles.evidenceStat}><strong>{points.length}</strong><span>待核对评分点</span></div>
        </div>
        <div className={styles.evidenceSummaryText}>
          <p><b>已观察事实</b>{observedFact}</p>
          <p><b>当前限制</b>{limitation}</p>
        </div>
      </section>

      <div className={styles.evidenceCardGrid}>
        <article className={styles.evidenceCard}>
          <div className={styles.evidenceCardHead}><Info size={15}/>课程学习要求</div>
          {objective ? <ul className={styles.requirementList}>
            <li><b>观察指标：</b>{str(objective['观察指标'])}</li>
            <li><b>学习要求：</b>{str(objective['学习要求'], '当前运行未提供学习要求')}</li>
            <li><b>课标定位：</b>{str(objective['课标定位'], '未提供')}</li>
            <li><b>教材定位：</b>{str(objective['教材定位'], '未提供')}</li>
          </ul> : <p className={styles.evidenceCardEmpty}>当前范围没有课程要求记录，不能据此推断学习要求。</p>}
        </article>
        <article className={styles.evidenceCard}>
          <div className={styles.evidenceCardHead}><FileSearch size={15}/>已观察事实</div>
          <p>{observedFact}</p>
          {points.length > 0 && <p><b>待核对评分点：</b>{points.join('、')}</p>}
          <div><EvidenceRefs ids={Array.isArray(draft?.evidence_record_ids) ? draft!.evidence_record_ids.map(String) : []}/></div>
        </article>
        <article className={styles.evidenceCard}>
          <div className={styles.evidenceCardHead}><ShieldAlert size={15}/>推断限制</div>
          <p><strong>不能确定的结论：</strong>{limitation}</p>
          {unknownReason && <p>当前证据状态：{unknownReason}。</p>}
          <p>覆盖证据只能支持教师安排进一步观察，不能被当作学生已完成的作答。</p>
        </article>
      </div>

      <details className={styles.answerDetails}>
        <summary>
          <span>原始作答与评分详情</span>
          <small>{responses.length} 条记录</small>
          <em>默认折叠</em>
        </summary>
        <div className={styles.answerBody}>
          <p className={styles.answerHint}>评分点尚未核验时，题目得分事实可以展示，但不能直接推断对应的稳定能力问题。</p>
          {claims.length > 0 && <ul className={styles.claimList}>{claims.slice(0, 3).map((claim, index) => <li key={String(claim.claim_id ?? index)}>
            {str(claim.text)}
            {claim.limitations?.length ? <small>限制：{claim.limitations.join('；')}</small> : null}
          </li>)}</ul>}
          <EvidenceRows bundle={bundle}/>
          <div className={styles.answerRefs}><span>证据引用</span><EvidenceRefs ids={Array.isArray(draft?.evidence_record_ids) ? draft!.evidence_record_ids.map(String) : []}/></div>
        </div>
      </details>
    </>}

    {!draft && !isPending && !isError && <Notice>证据面板会在规则草稿返回后补全观察事实与推断限制。</Notice>}
  </Panel>;
}
