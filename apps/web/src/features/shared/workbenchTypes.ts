/**
 * 九个工作台页面共享的类型与通用小工具。
 * 只放置跨模块复用、与具体页面无关的内容；模块专属逻辑留在各自模块内。
 */
export type Row = Record<string, unknown>;

export type Claim = {
  claim_id: string;
  kind: string;
  text: string;
  evidence_refs: Array<{ record_id?: string; material_id: string; description: string }>;
  limitations: string[];
};

export type Bundle = {
  scope: Record<string, string>;
  responses: Row[];
  items: Row[];
  rubric_definitions: Row[];
  coverage: Record<string, unknown>;
  source_context?: Row;
  issues: Row[];
  source_versions?: Record<string, number>;
  fingerprint?: string;
};

export function str(value: unknown, empty = '—') { return value == null || value === '' ? empty : String(value); }

export function label(row: Row, choices: string[], fallback: string) { for (const key of choices) if (row[key]) return String(row[key]); return fallback; }

export function isSyntheticVerification(row: Row | undefined) { return Boolean(row && ['reason', 'curriculum_locator', 'textbook_locator'].some(key => /合成|模拟验收|synthetic|mock/i.test(String(row[key] ?? '')))); }

export function percent(value: number | null) { return value == null ? '无可比数据' : `${(value * 100).toFixed(1)}%`; }

export function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** 由当前运行的课程目标生成指标名称查询函数，缺失时回退到指标编号。 */
export function objectiveLabel(objectives: Row[], id: string) {
  return label(objectives.find(row => row['指标编号'] === id) ?? {}, ['观察指标', '指标名称', '名称'], id);
}

/** 把证据包中的作答记录转成复核/案例接口需要的证据引用。 */
export function responseEvidenceRefs(bundle: Bundle | undefined, recordIds: string[]) {
  if (!bundle || !recordIds.length) return [];
  const wanted = new Set(recordIds);
  return bundle.responses.filter(row => wanted.has(String(row.record_id))).map(row => ({
    kind: 'response',
    evidence_id: row.evidence_id,
    record_id: row.record_id,
    source_line: row.source_line,
    scope: bundle.scope,
  }));
}
