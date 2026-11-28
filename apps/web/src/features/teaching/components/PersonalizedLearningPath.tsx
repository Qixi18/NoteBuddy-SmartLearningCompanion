import { Route } from 'lucide-react';
import { Panel } from '../../../components/PageBits';
import type { Draft, PlanStatus, ResourceSelection, TeachingPlanV2 } from '../types';
import { HINT_LEVEL_LABELS, PLAN_STATUS_LABELS, PURPOSE_LABELS, isCoveragePlan } from '../types';
import { ResourceRecommendationList } from './ResourceRecommendationList';
import styles from '../pages/StudentTeachingPage.module.css';

const BLOCKED_GUIDANCE: Record<PlanStatus, string[]> = {
  requires_source_verification: [
    '在「课程知识 → 主题概览」完成当前指标的来源核验，并确认来源版本仍然有效。',
    '核验通过后回到本页；方案会按新的来源版本重新生成，不需要手工填写材料。',
  ],
  requires_scoring: [
    '先在工作台补齐当前范围的评分；待评分记录不能作为教学判断依据。',
    '评分完成后重新打开当前范围，再生成可审核的方案。',
  ],
  requires_scope_selection: [
    '在上方选择单一测验节点；系统不会合并不同节点的证据。',
  ],
  blocked: [
    '查看「推荐学习材料与练习」中的排除原因，核对材料范围、来源与核验状态。',
    '证据冲突或缺少有效评分时，先核对原始记录；页面不会用通用建议填补空缺。',
  ],
  ready: [],
};

/**
 * 页面核心展示组件：目标 → 材料与练习 → 步骤 → 三级提示 → 后续观察与调整。
 * 所有正式内容都来自 V2 方案与资源选择接口；没有方案时说明阻塞原因，不填充示例。
 */
export function PersonalizedLearningPath({ plan, selection, status, error, draft }: {
  plan?: TeachingPlanV2 | null;
  selection?: ResourceSelection | null;
  status: PlanStatus;
  error?: string | null;
  draft?: Draft;
}) {
  const coverage = isCoveragePlan(plan);
  return <Panel title="个性化学习方案" icon={<Route size={18}/>}>
    {plan ? <>
      <div className={styles.pathGoal}>
        <span className={styles.pathGoalLabel}>本次学习目标 · {PURPOSE_LABELS[plan.purpose]} · 待教师审核</span>
        <p className={styles.pathGoalText}>{plan.goal}</p>
      </div>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>1</span><h3>推荐学习材料与练习</h3></div>
        {coverage && <p className={styles.coverageNote}>
          本方案依据当前节点的范围覆盖证据生成：学生在该范围内没有有效作答记录，因此这是补充观察与诊断安排，不是补救结论。
        </p>}
        <ResourceRecommendationList selection={selection}/>
      </section>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>2</span><h3>学习步骤</h3></div>
        <ol className={styles.stepList}>{plan.steps.map((step, index) => <li key={index} className={styles.stepItem}>{step}</li>)}</ol>
      </section>

      <section className={styles.pathSection}>
        <div className={styles.pathSectionHead}><span className={styles.pathIndex}>3</span><h3>分步提示</h3></div>
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
    </> : <div className={styles.emptyPlan}>
      <strong>当前状态：{PLAN_STATUS_LABELS[status] ?? status}</strong>
      <span>{error || draft?.teaching_plan_preview_error || '当前证据或来源条件不足以生成可审核的 V2 方案。'}</span>
      <span>补齐来源核验、评分或节点范围后重新生成；页面不会用静态示例替代真实方案。</span>
      {BLOCKED_GUIDANCE[status]?.length ? <ul className={styles.emptyGuidance}>
        {BLOCKED_GUIDANCE[status].map(item => <li key={item}>{item}</li>)}
      </ul> : null}
    </div>}
  </Panel>;
}
