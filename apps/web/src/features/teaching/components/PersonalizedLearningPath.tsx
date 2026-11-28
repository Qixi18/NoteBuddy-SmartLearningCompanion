import { ArrowRight, ClipboardCheck, Route, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import type { Draft, PlanStatus, ResourceSelection, TeachingPlanV2 } from '../types';
import { HINT_LEVEL_LABELS, PURPOSE_LABELS, isCoveragePlan } from '../types';
import { ResourceRecommendationList } from './ResourceRecommendationList';
import styles from '../pages/StudentTeachingPage.module.css';

/**
 * 个性化学习方案：四种状态 + 完整方案展示。
 * 方案存在时按「目标 → 材料/练习 → 步骤 → 提示 → 观察/调整 → 证据范围」呈现；
 * 方案不存在时说明阻塞原因、下一步入口和仍可参考的候选材料，不用空白占位。
 */
export function PersonalizedLearningPath({ plan, planOrigin, planVersion, stateLabel, stateTone, stateDetail, selection, status, error, draft, search, onRetry }: {
  plan?: TeachingPlanV2 | null;
  planOrigin?: 'accepted' | 'draft' | null;
  planVersion?: unknown;
  stateLabel: string;
  stateTone: 'green' | 'amber';
  stateDetail: string;
  selection?: ResourceSelection | null;
  status: PlanStatus;
  error?: string | null;
  draft?: Draft;
  search: string;
  onRetry?: () => void;
}) {
  const coverage = isCoveragePlan(plan);
  const originLabel = planOrigin === 'accepted'
    ? `教师已采纳 · 第 ${String(planVersion ?? '—')} 版`
    : planOrigin === 'draft' ? '待教师审核的规则草稿' : stateLabel;
  return <Panel title="个性化学习方案" icon={<Route size={18}/>} action={plan ? (
    <span className={styles.planOriginBadge} data-tone={planOrigin === 'accepted' ? 'green' : 'amber'}>
      {planOrigin === 'accepted' ? <ShieldCheck size={13}/> : <ClipboardCheck size={13}/>}
      {originLabel}
    </span>
  ) : undefined}>
    {plan ? <>
      <div className={styles.pathGoal}>
        <span className={styles.pathGoalLabel}>本次学习目标 · {PURPOSE_LABELS[plan.purpose]}{planOrigin === 'accepted' ? ' · 已按教师审核版本执行' : ' · 待教师审核'}</span>
        <p className={styles.pathGoalText}>{plan.goal}</p>
      </div>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>1</span><h3>推荐学习材料与练习</h3></div>
        {coverage && <p className={styles.coverageNote}>
          本方案依据当前节点的范围覆盖证据生成：学生在该范围内没有有效作答记录，因此这是补充观察与诊断安排，不是补救结论。
        </p>}
        <ResourceRecommendationList selection={selection} showStatus={false}/>
      </section>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>2</span><h3>学习步骤</h3></div>
        <ol className={styles.stepList}>{plan.steps.map((step, index) => <li key={index} className={styles.stepItem}>{step}</li>)}</ol>
      </section>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>3</span><h3>三级提示</h3></div>
        <div className={styles.hintGrid}>{plan.hints.map(hint => <article key={hint.level} className={styles.hintCard}>
          <span className={styles.hintLevel}>{HINT_LEVEL_LABELS[hint.level] ?? hint.level}</span>
          <p className={styles.hintStudent}>{hint.student_prompt}</p>
          {hint.teacher_note ? <p className={styles.hintTeacher}>教师观察说明：{hint.teacher_note}</p> : null}
        </article>)}</div>
      </section>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>4</span><h3>后续观察与调整</h3></div>
        <div className={styles.followupGrid}>
          <article className={styles.followupBlock}><h4>观察点</h4><ul>{plan.observation_points.map((point, index) => <li key={index}>{point}</li>)}</ul></article>
          <article className={styles.followupBlock}><h4>调整条件</h4><ul>{plan.adjustment_conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul></article>
        </div>
        <div className={styles.planMeta}>
          <span>适用范围：{plan.scope.student_id} · {plan.scope.indicator_id} · {plan.scope.node_id}</span>
          <span>模板版本：{plan.template_version}</span>
          <span>证据来源：{coverage ? '当前范围覆盖证据' : `${plan.evidence_refs.filter(ref => ref.kind === 'response').length} 条有效评分记录`}</span>
          <span>来源签核版本：{Object.entries(plan.source_versions).map(([id, version]) => `${id} v${version}`).join('、') || '未记录'}</span>
          <span>证据指纹：<code>{plan.evidence_fingerprint.slice(0, 16)}…</code></span>
        </div>
      </section>
    </> : <div className={styles.planStatePanel} data-tone={stateTone}>
      <div className={styles.planStateHead}>
        <span className={styles.statePill} data-tone={stateTone}>{stateLabel}</span>
        <small>{stateDetail}</small>
      </div>
      <p className={styles.planStateReason}>{error || draft?.teaching_plan_preview_error || '当前证据或来源条件不足以生成可审核的 V2 方案。'}</p>
      <div className={styles.planStateActions}>
        {status === 'requires_source_verification' && <Link className={styles.stateActionLink} to={{ pathname: routes.topicOverview, search }}>前往课程知识核验 <ArrowRight size={14}/></Link>}
        {status === 'requires_scoring' && <Link className={styles.stateActionLink} to={{ pathname: routes.studentDiagnosis, search }}>查看待评分记录 <ArrowRight size={14}/></Link>}
        {(status === 'blocked' || status === 'requires_scope_selection') && <Link className={styles.stateActionLink} to={{ pathname: routes.studentDiagnosis, search }}>核对诊断证据 <ArrowRight size={14}/></Link>}
        {onRetry && <button type="button" className={styles.inlineButton} onClick={onRetry}>重新读取方案状态</button>}
      </div>
      <p className={styles.planStateFoot}>来源与评分补齐后回到本页即可重新生成；页面不会用示例方案替代真实数据。</p>
      {(selection?.practice_items.length || selection?.learning_resources.length) ? <div className={styles.planCandidates}>
        <h3>仍可参考的候选材料</h3>
        <p>以下材料只用于教师备课参考，尚未通过正式方案准入，不会被写成学生已完成的学习任务。</p>
        <ResourceRecommendationList selection={selection} showStatus={false}/>
      </div> : null}
    </div>}
  </Panel>;
}
