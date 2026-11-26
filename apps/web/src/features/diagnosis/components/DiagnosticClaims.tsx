import { ArrowRight, CircleHelp, FileSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Claim } from '../../shared/workbenchTypes';
import { EvidenceRefs } from './EvidenceRefs';
import styles from '../../shared/WorkbenchPages.module.css';

function ClaimList({ claims, evidencePath, params }: { claims: Claim[]; evidencePath: string; params: URLSearchParams }) {
  return <div className={styles.claimList}>{claims.map(claim => <article className={styles.claim} key={claim.claim_id}><div className={styles.claimHeading}><span className={claim.kind === 'rule_observation' ? styles.ruleClaim : ''}>{claim.kind === 'rule_observation' ? '已核验规则观察' : claim.kind === 'hypothesis' ? '待核实假设' : '证据事实'}</span><b>{claim.text}</b></div>
    {claim.evidence_refs.length ? <div className={styles.claimEvidenceLinks}>{claim.evidence_refs.map((ref, index) => <Link key={`${ref.record_id ?? ref.material_id}-${index}`} to={{ pathname: `${evidencePath}/${encodeURIComponent(ref.material_id)}`, search: params.toString() }}><FileSearch size={13}/><span>{ref.record_id ?? ref.material_id}</span><small>{ref.description}</small><ArrowRight size={13}/></Link>)}</div> : <EvidenceRefs ids={[]}/>}
    {claim.limitations.map((item, index) => <small className={styles.limitText} key={index}><CircleHelp size={13}/>{item}</small>)}
  </article>)}</div>;
}
export function StudentDiagnosticClaims({ claims, evidencePath, params }: { claims: Claim[]; evidencePath: string; params: URLSearchParams }) {
  const observations = claims.filter(claim => claim.kind !== 'fact');
  const facts = claims.filter(claim => claim.kind === 'fact');
  return <div className={styles.studentDiagnosticClaims}>
    {observations.length ? <ClaimList claims={observations} evidencePath={evidencePath} params={params}/> : <p className={styles.noCrossItemClaim}><CircleHelp size={15}/>当前没有跨题且有核验依据的规则观察；逐条事实和评分点记录见下方明细。</p>}
    {facts.length > 0 && <details className={styles.studentFactDisclosure}><summary>查看逐条证据事实（{facts.length}）</summary><ClaimList claims={facts} evidencePath={evidencePath} params={params}/></details>}
  </div>;
}
