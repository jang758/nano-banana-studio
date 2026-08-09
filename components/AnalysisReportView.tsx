import { Download, FileText } from 'lucide-react';
import type { AgenticVisionStatus, AnalysisReport } from '../types';
import { formatAnalysisReport, formatUsd } from '../utils/analysisReport';

const agenticLabels: Record<AgenticVisionStatus, string> = {
  DISABLED: '정밀검사 꺼짐',
  AVAILABLE_NOT_USED: '정밀검사 불필요',
  USED_OK: '정밀검사 사용 완료',
  USED_FAILED: '정밀검사 실행 실패',
  UNSUPPORTED: '모델 미지원',
};

export function agenticLabel(status: AgenticVisionStatus): string {
  return agenticLabels[status];
}

function downloadReport(report: AnalysisReport) {
  const url = URL.createObjectURL(new Blob([formatAnalysisReport(report)], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nano-banana-report-${new Date(report.createdAt).toISOString().replace(/[:.]/g, '-')}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AnalysisReportView({ report }: { report: AnalysisReport }) {
  return (
    <details className={`analysis-report ${report.outcome !== 'completed' ? 'report-failed' : ''}`}>
      <summary>
        <span><FileText size={16} /> 분석 실행 리포트</span>
        <span className="report-summary">
          <b>{report.requestedModel}</b>
          <i>{agenticLabel(report.agenticVisionStatus)}</i>
          <i>{report.inspections.length}회 정밀검사</i>
          <i>{formatUsd(report.cost.totalUsd)}</i>
          <i>{(report.totalDurationMs / 1000).toFixed(2)}s</i>
        </span>
      </summary>
      <div className="report-body">
        <div className="report-metrics">
          <span><small>실행 결과</small><b>{report.outcome}</b></span>
          <span><small>선택 / 실행 모델</small><b>{report.requestedModel}<br />{report.resolvedModels.join(', ') || '응답 없음'}</b></span>
          <span><small>Agentic Vision 직접 귀속 추정</small><b>{formatUsd(report.cost.agenticAttributedUsd)}</b></span>
          <span><small>토큰 / 시간</small><b>{report.usage.totalTokens.toLocaleString()} / {(report.totalDurationMs / 1000).toFixed(2)}s</b></span>
        </div>
        {report.failure && (
          <div className="report-failure">
            <b>{report.failure.stage} 단계에서 중단됨</b>
            <span>{report.failure.reason}</span>
          </div>
        )}
        {report.inspections.length > 0 && (
          <div className="inspection-grid">
            {report.inspections.map((inspection) => (
              <div key={`${inspection.index}-${inspection.area}`}>
                <b>검사 {inspection.index} · {inspection.area}</b>
                <span>{inspection.purpose}</span>
                <small>{inspection.resultExcerpt || '텍스트 결과 없음'}</small>
              </div>
            ))}
          </div>
        )}
        <button className="secondary-button report-download" onClick={() => downloadReport(report)}>
          <Download size={15} /> 리포트 .md 저장
        </button>
        <pre>{formatAnalysisReport(report)}</pre>
      </div>
    </details>
  );
}
