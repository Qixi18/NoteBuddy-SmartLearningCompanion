/**
 * 导入前的体积校验。
 *
 * 后端 HTTP 请求体上限为 20 MiB（见后端配置），前端把 CSV 作为文本、PDF 作为 Base64 放进同一个 JSON 请求，
 * 因此原始文件体积必须留出 Base64（+33%）与 JSON 包装的余量：
 * 单次导入原始文件总量限制为 12 MiB，并保证估算请求体不超过 18 MiB。
 */

export const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
export const MAX_SINGLE_BYTES = 10 * 1024 * 1024;
export const REQUEST_BUDGET_BYTES = 18 * 1024 * 1024;

export interface ImportSelection {
  csv: File[];
  pdf: File[];
  totalBytes: number;
  estimatedPayloadBytes: number;
}

export interface ImportValidationResult {
  ok: boolean;
  selection: ImportSelection;
  errors: string[];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Base64 体积按 4/3 估算，另加 64 KiB 的 JSON 字段开销余量。 */
export function estimatePayloadBytes(files: File[]): number {
  return Math.ceil(files.reduce((sum, file) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    return sum + (isPdf ? Math.ceil(file.size * 4 / 3) : file.size);
  }, 0) + 64 * 1024);
}

export function validateImportFiles(files: File[]): ImportValidationResult {
  const csv = files.filter(file => file.name.toLowerCase().endsWith('.csv'));
  const pdf = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
  const unknown = files.filter(file => !/\.(csv|pdf)$/i.test(file.name));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const estimatedPayloadBytes = estimatePayloadBytes(files);
  const errors: string[] = [];

  if (unknown.length) {
    errors.push(`不支持的文件类型：${unknown.map(file => file.name).join('、')}。请选择 CSV 或 PDF。`);
  }
  if (!csv.length) {
    errors.push('请至少选择一份 CSV 数据文件。');
  }
  const oversize = files.filter(file => file.size > MAX_SINGLE_BYTES);
  if (oversize.length) {
    errors.push(`单个文件不能超过 ${formatBytes(MAX_SINGLE_BYTES)}：${oversize.map(file => `${file.name}（${formatBytes(file.size)}）`).join('、')}。`);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    errors.push(`单次导入的原始文件总量为 ${formatBytes(totalBytes)}，超过上限 ${formatBytes(MAX_TOTAL_BYTES)}。请拆分数据包或压缩 PDF 后重试。`);
  } else if (estimatedPayloadBytes > REQUEST_BUDGET_BYTES) {
    errors.push(`按 Base64 转换后请求体约 ${formatBytes(estimatedPayloadBytes)}，接近后端 20 MiB 上限。请减少 PDF 或拆分导入。`);
  }

  return { ok: errors.length === 0, selection: { csv, pdf, totalBytes, estimatedPayloadBytes }, errors };
}
