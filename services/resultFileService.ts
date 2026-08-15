import type { AnalysisOutput, AnalysisPipeline } from '../types';
import { formatAnalysis } from '../utils/analysisFormat';
import { formatAnalysisReport } from '../utils/analysisReport';

interface ResultReference {
  base64: string;
  mimeType: string;
  fileName?: string | null;
}

interface SaveAnalysisResultOptions {
  pipeline: AnalysisPipeline;
  output: AnalysisOutput;
  references: ResultReference[];
}

interface SaveResponse {
  textPath?: string;
  error?: string;
}

export function buildAnalysisResultText(output: AnalysisOutput): string {
  return [
    'Nano Banana Studio 분석 결과',
    '',
    '===== 분석 실행 리포트 =====',
    formatAnalysisReport(output.report),
    '',
    '===== 전체 분석 결과 =====',
    formatAnalysis(output.result, 'en'),
    '',
    '===== 추출 프롬프트 원문 - EN =====',
    output.result.prompt_en,
    '',
    '===== 추출 프롬프트 원문 - KO =====',
    output.result.prompt_ko,
    '',
  ].join('\n');
}

export async function saveAnalysisResultFiles(options: SaveAnalysisResultOptions): Promise<string> {
  const response = await fetch('/api/save-analysis-result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pipeline: options.pipeline,
      text: buildAnalysisResultText(options.output),
      references: options.references,
    }),
  });
  const payload = await response.json().catch(() => ({})) as SaveResponse;
  if (!response.ok || !payload.textPath) {
    throw new Error(payload.error || `자동 결과 저장에 실패했습니다. (HTTP ${response.status})`);
  }
  return payload.textPath;
}
