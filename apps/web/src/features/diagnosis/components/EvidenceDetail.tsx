import { Activity, ArrowRight, BookOpen, Check, CircleHelp, FileSearch, Layers3, Sparkles, Target, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import type { ClassInsights } from '../../../types/api';
import { finite, percent, str } from '../../shared/workbenchTypes';
import type { Bundle, Claim, Row } from '../../shared/workbenchTypes';
import { StudentDiagnosticClaims } from './DiagnosticClaims';
import styles from '../../shared/WorkbenchPages.module.css';

export function EvidenceDetail({ bundle, itemId, insights, studentClaims, studentClaimsPending, studentClaimsError, objectiveName, topicName, classId, search }: { bundle: Bundle; itemId?: string; insights?: ClassInsights; studentClaims: Claim[]; studentClaimsPending: boolean; studentClaimsError: Error | null; objectiveName: (id: string) => string; topicName: string; classId: string; search: URLSearchParams }) {
  const item = itemId ? bundle.items.find(row => row.material_id === itemId) : bundle.items[0];
  if (!item) return <EmptyState title="没有匹配题目" detail="当前证据包未返回这个题号。请从题目关联或学生诊断重新打开证据，避免查看其他题目的记录。"/>;
  const rows = bundle.responses.filter(row => row.material_id === item.material_id);
  const scoredRows = rows.filter(row => row.disposition === 'scored' && finite(row.score) !== null && finite(row.maximum) !== null);
  const scopeStudent = String(bundle.scope.student_id ?? '');
  const scopeNode = String(bundle.scope.node_id ?? '');
  const scopeIndicator = String(bundle.scope.indicator_id ?? '');
  const objective = objectiveName(scopeIndicator);
  const topicId = String(bundle.source_context?.topic_id ?? '');
  const comparison = insights?.comparisons.find(row => row.indicator_id === scopeIndicator);
  const studentPath = { pathname: routes.studentDiagnosis, search: search.toString() };
  const issueRows = bundle.issues.filter(issue => rows.some(row => row.record_id === issue.record_id && row.source_line === issue.source_line));
  const relatedClaims = studentClaims.filter(claim => claim.kind !== 'fact' && claim.evidence_refs.some(ref => ref.material_id === item.material_id));
  return <>
    <div className={styles.evidenceBreadcrumb}><Link to={{ pathname: routes.studentDiagnosis, search: search.toString() }}>学情诊断 / 学生个人诊断</Link><span>{scopeStudent}</span><b>{String(item.material_id)}</b></div>
    <div className={styles.evidenceContextBar} aria-label="题目证据范围"><span><FileSearch size={16}/><small>题目编号</small><b>{String(item.material_id)}</b></span><span><Layers3 size={16}/><small>关联主题</small><b>{topicName || topicId || '课程主题未提供'}</b></span><span><Target size={16}/><small>观察指标</small><b>{objective}</b></span><span><Users size={16}/><small>涉及学生</small><b>{scopeStudent}</b></span><span><BookOpen size={16}/><small>测验节点</small><b>{scopeNode}</b></span></div>
    <div className={styles.evidenceTopActions}><Link to={studentPath}><ArrowRight size={15}/>返回学生诊断</Link><Link to={{ pathname: routes.studentTeaching, search: search.toString() }}><Sparkles size={15}/>加入个性化建议</Link></div>
    <section className={styles.evidenceStatStrip} aria-label="当前题目证据概况"><div><span>当前学生作答记录</span><b>{rows.length}</b></div><div><span>有效评分记录</span><b>{scoredRows.length}</b></div><div><span>题目满分</span><b>{str(item.maximum, '未提供')}</b></div><div><span>评分点</span><b>{bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id).length || '未提供'}</b></div></section>
    <div className={styles.twoColumns}>
      <Panel title="题目信息" icon={<FileSearch size={18}/> }><div className={styles.evidenceItemPrompt}><span>题目</span><h2>{str(item.prompt, '当前材料没有题干文本')}</h2></div><div className={styles.evidenceMeta}><span><BookOpen size={14}/>主题：{topicName || topicId || '未关联主题'}</span><span><Target size={14}/>指标：{objective}</span></div><h3 className={styles.evidenceSubheading}>评分点定义</h3>{bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id).length ? <div className={styles.rubricDefinitionList}>{bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id).map(definition => <div key={String(definition.point_id)}><span>{String(definition.point_id)}</span><b>{String(definition.description)}</b><small>{String(definition.maximum)} 分</small></div>)}</div> : <p className={styles.muted}>当前数据没有可解析的评分点定义。</p>}<small className={styles.itemMaximumNote}>题目满分：{str(item.maximum, '未提供')}</small></Panel>
      <Panel title="学生作答与评分" icon={<Users size={18}/>}>{rows.length ? <div className={styles.answerStack}>{rows.map((row, index) => <article className={styles.answerCard} key={String(row.evidence_id ?? index)}><header><b>学生作答（{scopeStudent}）</b><span>{String(row.record_id ?? '记录编号未提供')}</span><strong>{str(row.score, '未评分')} / {str(row.maximum, str(item.maximum, '未知满分'))}</strong></header><div className={styles.studentAnswerText}><p>{str(row.raw_response, '学生最终作答未提供')}</p>{Boolean(row.solution_steps) && <small>解答过程：{String(row.solution_steps)}</small>}</div><ResponseRubricObservation response={row} definitions={bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id)}/></article>)}</div> : <EmptyState title="没有该题的学生作答记录" detail="没有记录不代表零分或未掌握。可以返回学生诊断切换学生或测验节点。"/>}</Panel>
    </div>
    <div className={styles.twoColumns}>
      <Panel title="评分数据核查" icon={<CircleHelp size={18}/>}>{issueRows.length ? issueRows.map((issue, index) => <Notice tone="warning" key={`${String(issue.record_id)}-${index}`}>{`${str(issue.code, '数据质量提示')} · ${str(issue.record_id)}：${str(issue.detail)}`}</Notice>) : <p className={styles.evidenceQualityClear}><Check size={15}/>当前题目范围没有关联数据质量提示。未评分、冲突和缺失状态仍按各自原始状态呈现。</p>}<p className={styles.coverage}>当前学生、指标和节点共 {rows.length} 条相关作答记录，其中 {scoredRows.length} 条通过质量口径作为有效评分。覆盖的其他题目：{Array.isArray(bundle.coverage.expected_material_ids) ? (bundle.coverage.expected_material_ids as string[]).filter(id => id !== item.material_id).join('、') || '无' : '未提供'}。</p></Panel>
      <Panel title="相似证据 / 班级表现" icon={<Activity size={18}/>}>{comparison?.status === 'available' ? <><p className={styles.evidenceComparisonNote}>以下为同一观察指标在该节点共同题目上的班级得分率，不代表本题单题正确率。</p><div className={styles.evidenceClassCompare}>{comparison.classes.map(row => <div key={row.class_id} className={row.class_id === classId ? styles.evidenceClassCurrent : ''}><span>{row.class_id}{row.class_id === classId ? '（当前班）' : ''}</span><b>{percent(row.common_ratio)}</b><small>{row.observed_student_count} 人 · {row.common_record_count} 条</small></div>)}</div></> : <EmptyState title="当前没有可比班级依据" detail="当前节点缺少共同作答题目时不展示班级比较，也不补零。"/>}</Panel>
    </div>
    <Panel title="本题关联的诊断观察" icon={<Target size={18}/>}>{studentClaimsPending ? <Loading label="正在核对有依据的跨题观察…"/> : studentClaimsError ? <Notice tone="warning">诊断观察暂时无法读取：{studentClaimsError.message}。题目作答和评分数据仍可查看。</Notice> : relatedClaims.length ? <><p className={styles.evidenceComparisonNote}>仅显示诊断接口返回且明确引用本题的跨题观察；请结合列出的证据和限制条件复核。</p><StudentDiagnosticClaims claims={relatedClaims} evidencePath={routes.itemEvidence} params={search}/></> : <p className={styles.noCrossItemClaim}><CircleHelp size={15}/>当前没有明确引用本题的跨题核验观察；这不代表题目不存在问题。单题表现和评分点事实见上方。</p>}</Panel>
    <Notice>本页只展示当前学生和所选题目的原始作答、评分点及数据质量事实，不从单题推断学生稳定能力或作答原因。<Link to={{ pathname: routes.studentTeaching, search: search.toString() }}>将已核验证据用于个性化建议 <ArrowRight size={14}/></Link></Notice>
  </>;
}
function ResponseRubricObservation({ response, definitions }: { response: Row; definitions: Row[] }) {
  const observation = response.rubric_observation as Row | undefined;
  if (!observation) return <p className={styles.rubricUnknown}>没有返回逐点评分观察；不将未知记为零分。</p>;
  if (observation.state !== 'valid' || !Array.isArray(observation.points)) return <p className={styles.rubricUnknown}>{observation.state === 'conflict' ? `评分点数据存在冲突：${Array.isArray(observation.conflicts) ? observation.conflicts.join('、') : '详见质量提示'}。` : String(observation.reason ?? '逐点评分状态未知。')} 不按零分处理。</p>;
  return <div className={styles.answerRubricList}><b>评分量表</b>{(observation.points as Row[]).map(point => { const definition = definitions.find(item => item.point_id === point.point_id); const earned = finite(point.earned); const maximum = finite(point.maximum); return <div key={String(point.point_id)}><span>{String(definition?.description ?? point.point_id)}</span><strong className={earned !== null && maximum !== null && earned < maximum ? styles.pointPartial : styles.pointComplete}>{earned === null || maximum === null ? '未知' : `${earned} / ${maximum}`}</strong></div>; })}</div>;
}
