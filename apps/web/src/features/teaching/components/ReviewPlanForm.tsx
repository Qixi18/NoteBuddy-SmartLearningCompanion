import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function ReviewPlanForm({ materials, defaultActivity, defaultObservation, disabled, onAccept }: {
  materials: string[]; defaultActivity: string; defaultObservation: string; disabled: boolean;
  onAccept: (plan: Row, reviewer: string, reason: string) => void;
}) {
  const [activity, setActivity] = useState(defaultActivity);
  const [steps, setSteps] = useState('');
  const [practice, setPractice] = useState('');
  const [observations, setObservations] = useState(defaultObservation);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAccept({ material_ids: materialIds, activity: activity.trim(), steps: lines(steps), practice: lines(practice), observation_points: lines(observations) }, reviewer.trim(), reason.trim());
  };
  const planComplete = materials.length > 0 && materialIds.length > 0 && materialIds.every(id => materials.includes(id)) && activity.trim() && lines(steps).length && lines(practice).length && lines(observations).length && reviewer.trim() && reason.trim();
  return <form className={styles.reviewPlanForm} onSubmit={submit}>
    <div className={styles.reviewPlanHeading}><strong>教师复核与结构化教学方案</strong><span>每行填写一项步骤、练习或观察点</span></div>
    <label>教学活动<input required value={activity} onChange={event => setActivity(event.target.value)} maxLength={4000} placeholder="填写本次课堂活动"/></label>
    <div className={styles.reviewPlanColumns}><label>实施步骤<textarea required rows={3} value={steps} onChange={event => setSteps(event.target.value)} placeholder={'每行一项，例如：\n回顾关键概念\n完成示范题'}/></label><label>配套练习<textarea required rows={3} value={practice} onChange={event => setPractice(event.target.value)} placeholder={'每行一项练习\n从已学题目到迁移题'}/></label></div>
    <label>观察点<textarea required rows={2} value={observations} onChange={event => setObservations(event.target.value)} placeholder="每行填写一个可以观察或核验的表现"/></label>
    <fieldset className={styles.reviewMaterials}><legend>关联已核验教学材料</legend>{materials.length ? materials.map(id => <label key={id}><input type="checkbox" checked={materialIds.includes(id)} onChange={() => setMaterialIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}/>{id}</label>) : <small>当前指标没有有效的已核验材料。请先完成来源核验并关联材料，之后才能采纳方案。</small>}</fieldset>
    <div className={styles.reviewPlanColumns}><label>复核教师<input required value={reviewer} onChange={event => setReviewer(event.target.value)} maxLength={200}/></label><label>复核理由<input required value={reason} onChange={event => setReason(event.target.value)} maxLength={4000} placeholder="简述采纳理由与证据对应关系"/></label></div>
    <button className={styles.acceptButton} type="submit" disabled={disabled || !planComplete}><Check size={15}/>采纳建议并保存方案</button>
  </form>;
}
