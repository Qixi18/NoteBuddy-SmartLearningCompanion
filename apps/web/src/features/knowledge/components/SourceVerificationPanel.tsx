import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BrainCircuit, Check, ChevronDown, ChevronRight, FileText, Minus, ScanSearch, ShieldCheck } from 'lucide-react';
import { ErrorBox, Notice, Panel } from '../../../components/PageBits';
import { invalidateAfterSourceVerification } from '../../../api/queries';
import type {
  MachineVerificationResponse,
  MachineVerificationResult,
  SourceMappingPreview,
  VerificationCheck,
  VerificationStatus,
} from '../../../types/api';
import { runMachineVerification, previewSourceMappings, generateSourceMappings } from '../api';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from './SourceVerificationPanel.module.css';

type DisplayStatus = VerificationStatus | 'stale' | 'pending';

const STATUS_LABEL: Record<DisplayStatus, string> = {
  verified: '已核验',
  needs_review: '待核验',
  skipped: '已跳过',
  stale: '核验已过期',
  pending: '未核验',
};

const STATUS_CLASS: Record<DisplayStatus, string> = {
  verified: styles.statusVerified,
  needs_review: styles.statusReview,
  skipped: styles.statusSkipped,
  stale: styles.statusStale,
  pending: styles.statusSkipped,
};

const CHECK_MARK: Record<VerificationCheck['status'], string> = {
  passed: '✓',
  failed: '!',
  skipped: '–',
};

const CHECK_CLASS: Record<VerificationCheck['status'], string> = {
  passed: styles.checkPassed,
  failed: styles.checkFailed,
  skipped: styles.checkSkipped,
};

type DisplayItem = {
  indicatorId: string;
  indicatorText: string;
  status: DisplayStatus;
  reasonCode: string | null;
  reason: string;
  confidence: number | null;
  version: number | null;
  checks: VerificationCheck[];
  evidence: Record<string, unknown>;
};

function toChecks(value: unknown): VerificationCheck[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      id: str(item.id, ''),
      label: str(item.label, str(item.id, '检查')),
      status: (['passed', 'failed', 'skipped'].includes(String(item.status)) ? String(item.status) : 'skipped') as VerificationCheck['status'],
      detail: str(item.detail, ''),
    }))
    .filter(item => Boolean(item.label));
}

function statusOfRecord(record: Row | undefined): DisplayStatus {
  if (!record) return 'pending';
  const status = str(record.status, 'pending');
  if (record.stale && status === 'verified') return 'stale';
  if (status === 'verified') return 'verified';
  if (status === 'rejected') return 'needs_review';
  return 'needs_review';
}

function fromHistory(latest: Row | undefined, indicatorId: string, indicatorText: string): DisplayItem {
  return {
    indicatorId,
    indicatorText,
    status: statusOfRecord(latest),
    reasonCode: latest ? (str(latest.reason_code, '') || null) : null,
    reason: latest ? str(latest.reason, '') : '尚未执行机器核验。',
    confidence: typeof latest?.confidence === 'number' ? latest.confidence : null,
    version: typeof latest?.version === 'number' ? latest.version : null,
    checks: toChecks(latest?.checks),
    evidence: {},
  };
}

function fromResult(item: MachineVerificationResult, indicatorText: string): DisplayItem {
  return {
    indicatorId: item.indicator_id,
    indicatorText,
    status: item.status,
    reasonCode: item.reason_code,
    reason: item.reason,
    confidence: item.confidence,
    version: item.version,
    checks: toChecks(item.checks),
    evidence: item.evidence ?? {},
  };
}

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || bytes <= 0) return '大小未知';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function SourceVerificationPanel({ runId, objectives, histories, onDone }: {
  runId: string;
  objectives: Row[];
  histories: Record<string, Row[]>;
  onDone?: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<MachineVerificationResponse | null>(null);
  const [force, setForce] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mappingPreview, setMappingPreview] = useState<SourceMappingPreview | null>(null);
  const [mappingDone, setMappingDone] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);

  const refresh = async () => {
    await invalidateAfterSourceVerification(queryClient);
    await onDone?.();
  };

  const verify = useMutation({
    mutationFn: (indicatorId?: string) => runMachineVerification({ run_id: runId, indicator_id: indicatorId ?? null, force: indicatorId ? true : force }),
    onSuccess: async (data) => {
      setLastRun(data);
      await refresh();
    },
  });

  const mapping = useMutation({
    mutationFn: () => generateSourceMappings({ transmission_confirmed: true, preview_fingerprint: mappingPreview?.fingerprint ?? '' }),
    onSuccess: async (data) => {
      const failed = data.results.filter(item => item.status === 'failed').length;
      setMappingDone(
        `已生成 ${data.results.length - failed} 项 AI 映射候选${failed ? `，${failed} 项失败` : ''}。候选关系仍需核验或教师签核后才生效。`,
      );
      setMappingPreview(null);
      await refresh();
    },
  });

  const previewMapping = useMutation({
    mutationFn: () => previewSourceMappings(),
    onSuccess: setMappingPreview,
  });

  const items: DisplayItem[] = objectives.map(objective => {
    const indicatorId = str(objective['指标编号'], '');
    const indicatorText = str(objective['观察指标'], str(objective['指标名称'], '未命名观察指标'));
    const resultItem = lastRun?.results.find(row => row.indicator_id === indicatorId);
    if (resultItem) return fromResult(resultItem, indicatorText);
    return fromHistory((histories[indicatorId] ?? []).at(-1), indicatorId, indicatorText);
  });
  const total = items.length;
  const verifiedCount = items.filter(item => item.status === 'verified').length;
  const reviewCount = items.filter(item => item.status !== 'verified').length;
  const progress = total ? Math.round((verifiedCount / total) * 100) : 0;

  return <Panel title="课程来源记录" icon={<ShieldCheck size={18}/>} action={
    <div className={styles.toolbar}>
      <label className={styles.checkbox} title="已有结论也重新判定；结论未变化时不写新版本">
        <input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} disabled={verify.isPending}/>
        强制重核验
      </label>
      <button type="button" className={styles.primaryButton} onClick={() => verify.mutate(undefined)} disabled={verify.isPending || !runId}>
        <ScanSearch size={16}/>{verify.isPending ? '正在核验…' : '自动核验全部指标'}
      </button>
    </div>
  }>
    <div className={styles.panel}>
      <p className={styles.lede}>
        这里保留历史来源记录与可选的课程材料映射。课程 PDF 解析已在导入时自动完成；无需在此逐页核对原文。
      </p>

      <div className={styles.summary}>
        <span className={styles.summaryItem}><strong>{total}</strong>观察指标</span>
        <span className={styles.summaryItem}><strong className={styles.ok}>{verifiedCount}</strong>机器核验通过</span>
        <span className={styles.summaryItem}><strong className={styles.warn}>{reviewCount}</strong>待处理</span>
        <span className={styles.summaryItem}><strong>{progress}%</strong>核验进度</span>
        <span className={styles.summaryNote}>
          {lastRun
            ? `本次执行：通过 ${lastRun.summary.verified} · 待核验 ${lastRun.summary.needs_review} · 跳过 ${lastRun.summary.skipped}`
            : '进度按当前运行的有效核验记录计算，未执行核验时显示历史状态。'}
        </span>
      </div>

      {verify.isError && <ErrorBox message={(verify.error as Error).message}/>}

      <div className={styles.results}>
        {items.map(item => {
          const expandedRow = expanded === item.indicatorId;
          const evidence = item.evidence as { curriculum?: Record<string, unknown>; textbook?: Record<string, unknown> };
          return <article key={item.indicatorId} className={styles.resultRow} data-state={item.status}>
            <button type="button" className={styles.resultHead} aria-expanded={expandedRow} onClick={() => setExpanded(current => current === item.indicatorId ? null : item.indicatorId)}>
              <span className={styles.indicatorId}>{item.indicatorId}</span>
              <span className={styles.indicatorCell}>
                <span className={styles.indicatorText} title={item.indicatorText}>{item.indicatorText}</span>
                {(item.status !== 'verified' && (item.reasonCode || item.reason)) && <span className={item.status === 'skipped' ? `${styles.indicatorReason} ${styles.indicatorReasonOk}` : styles.indicatorReason} title={item.reason}>
                  {item.reasonCode ? `${item.reasonCode} · ` : ''}{item.reason}
                </span>}
              </span>
              <span className={`${styles.statusChip} ${STATUS_CLASS[item.status]}`}>
                {item.status === 'verified' ? <Check size={13}/> : item.status === 'stale' ? <AlertTriangle size={13}/> : <Minus size={13}/>}
                {STATUS_LABEL[item.status]}
              </span>
            </button>
            {expandedRow && <div className={styles.resultBody}>
              <p className={item.status === 'verified' ? `${styles.reason} ${styles.reasonVerified}` : styles.reason}>
                {item.reasonCode && <span className={styles.reasonCode}>{item.reasonCode}</span>}
                {item.reason || '没有记录核验说明。'}
                {item.confidence !== null && item.status === 'verified' && <span className={styles.muted}>（置信度 {item.confidence}）</span>}
                {item.version !== null && <span className={styles.muted}>（记录版本 v{item.version}）</span>}
              </p>
              {item.checks.length > 0 && <ul className={styles.checks}>
                {item.checks.map(check => <li key={check.id} className={`${styles.checkRow} ${CHECK_CLASS[check.status]}`}>
                  <span className={styles.checkMark} aria-hidden>{CHECK_MARK[check.status]}</span>
                  <span className={styles.checkLabel}>{check.label}</span>
                  <span>{check.detail || '—'}</span>
                </li>)}
              </ul>}
              {(evidence.curriculum || evidence.textbook) && <div className={styles.evidence}>
                {evidence.curriculum && <div className={styles.evidenceLine}>
                  <b><FileText size={14}/> 课标证据</b>
                  <span>{str(evidence.curriculum.file, '课程标准')} 第 {str(evidence.curriculum.page, '—')} 页</span>
                  <span>{str(evidence.curriculum.text_source, '') === 'ocr' ? 'OCR 文本' : '原生文本'}</span>
                  <span>命中 {Array.isArray(evidence.curriculum.keywords_matched) ? evidence.curriculum.keywords_matched.length : 0}/{str(evidence.curriculum.keywords_total, '—')} 个关键词</span>
                </div>}
                {evidence.textbook && <div className={styles.evidenceLine}>
                  <b><FileText size={14}/> 教材证据</b>
                  <span>{str(evidence.textbook.slice, '教材切片')} 第 {str(evidence.textbook.page, '—')} 页</span>
                  <span>命中 {Array.isArray(evidence.textbook.keywords_matched) ? evidence.textbook.keywords_matched.length : 0}/{str(evidence.textbook.keywords_total, '—')} 个关键词</span>
                </div>}
                {Boolean(evidence.curriculum?.excerpt) && <p className={styles.excerpt}>课标原文：{str(evidence.curriculum?.excerpt, '')}</p>}
                {Boolean(evidence.textbook?.excerpt) && <p className={styles.excerpt}>教材原文：{str(evidence.textbook?.excerpt, '')}</p>}
              </div>}
              <div className={styles.consentActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => verify.mutate(item.indicatorId)} disabled={verify.isPending}>
                  <ScanSearch size={15}/>{verify.isPending ? '正在核验…' : '重新核验这一项'}
                </button>
                <a className={styles.ghostButton} href={`/api/source?file=${encodeURIComponent(str((item.evidence as { textbook?: { slice?: string } }).textbook?.slice, '课程标准_2022.pdf'))}`} target="_blank" rel="noreferrer">
                  打开来源文件
                </a>
              </div>
            </div>}
          </article>;
        })}
      </div>


      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span><BrainCircuit size={16}/> AI 来源映射（可选，需确认传输范围）</span>
          <button type="button" className={styles.ghostButton} onClick={() => setShowMapping(current => !current)} aria-expanded={showMapping}>
            {showMapping ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}{showMapping ? '收起' : '展开'}
          </button>
        </div>
        {showMapping && <>
          <p className={styles.sectionText}>
            模型只提出带来源引用的候选关系，不会直接决定核验状态；页码或原文对不上的引用会被后端拒绝。
          </p>
          <div className={styles.consentActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => previewMapping.mutate()} disabled={previewMapping.isPending}>
              {previewMapping.isPending ? '正在计算发送范围…' : '预览将发送的内容'}
            </button>
            {mappingPreview && <button type="button" className={styles.primaryButton} onClick={() => mapping.mutate()} disabled={mapping.isPending}>
              <BrainCircuit size={16}/>{mapping.isPending ? '正在生成…' : '确认并生成映射'}
            </button>}
          </div>
          {previewMapping.isError && <ErrorBox message={(previewMapping.error as Error).message}/>}
          {mapping.isError && <ErrorBox message={(mapping.error as Error).message}/>}
          {mappingDone && <Notice>{mappingDone}</Notice>}
          {mappingPreview && <div className={styles.evidence}>
            <div className={styles.inlineMeta}>
              <span>模型：{mappingPreview.provider} / {mappingPreview.model}</span>
              <span>涉及 {mappingPreview.source_count} 份来源</span>
              <span>输入约 {formatBytes(mappingPreview.input_bytes)}</span>
              <span>计费单位：{mappingPreview.billing_unit ?? '—'}</span>
            </div>
            <ul className={styles.consentList}>
              {mappingPreview.source_files.map(file => <li key={file.name}>
                <strong>{file.name}</strong>
                {file.pages && <span>页：{file.pages.join('、')}</span>}
                {file.lines && <span>CSV 行：{file.lines.join('、')}</span>}
              </li>)}
            </ul>
            <span className={styles.muted}>预览指纹 {mappingPreview.fingerprint.slice(0, 12)}…</span>
          </div>}
        </>}
      </section>
    </div>
  </Panel>;
}
