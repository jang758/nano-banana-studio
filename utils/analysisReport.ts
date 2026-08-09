import type { AnalysisReport, AnalysisStageReport, CostEstimate, TokenUsageSummary } from '../types';

export const EMPTY_USAGE: TokenUsageSummary = {
  inputTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
  toolUseTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
};

type Price = {
  input: number;
  output: number;
  largeInput?: number;
  largeOutput?: number;
};

// Google Gemini Developer API Standard paid-tier price per 1M tokens.
// Snapshot date: https://ai.google.dev/gemini-api/docs/pricing (2026-08-09).
const PRICE_TABLE: Record<string, Price> = {
  'gemini-pro-latest': { input: 2, output: 12, largeInput: 4, largeOutput: 18 },
  'gemini-3-pro-preview': { input: 2, output: 12, largeInput: 4, largeOutput: 18 },
  'gemini-3.1-pro-preview': { input: 2, output: 12, largeInput: 4, largeOutput: 18 },
  'gemini-3.1-pro-preview-customtools': { input: 2, output: 12, largeInput: 4, largeOutput: 18 },
  'gemini-3.6-flash': { input: 1.5, output: 7.5 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3-flash-preview': { input: 0.5, output: 3 },
  'gemini-flash-latest': { input: 1.5, output: 9 },
  'gemini-flash-lite-latest': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10, largeInput: 2.5, largeOutput: 15 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
};

export function addUsage(items: TokenUsageSummary[]): TokenUsageSummary {
  return items.reduce((sum, item) => ({
    inputTokens: sum.inputTokens + item.inputTokens,
    outputTokens: sum.outputTokens + item.outputTokens,
    thoughtTokens: sum.thoughtTokens + item.thoughtTokens,
    toolUseTokens: sum.toolUseTokens + item.toolUseTokens,
    cachedTokens: sum.cachedTokens + item.cachedTokens,
    totalTokens: sum.totalTokens + item.totalTokens,
  }), { ...EMPTY_USAGE });
}

function modelId(value: string): string {
  return value.replace(/^models\//, '');
}

export function estimateCost(stages: AnalysisStageReport[]): CostEstimate {
  let total = 0;
  let agenticAttributed = 0;
  const pricingModels = new Set<string>();
  for (const stage of stages) {
    const resolved = modelId(stage.resolvedModel || stage.requestedModel);
    const price = PRICE_TABLE[resolved] || PRICE_TABLE[modelId(stage.requestedModel)];
    if (!price) {
      return {
        currency: 'USD',
        totalUsd: null,
        agenticAttributedUsd: null,
        pricingModel: null,
        pricingAsOf: '2026-08-09',
        note: '선택 모델의 공식 단가를 로컬 가격표에서 확인할 수 없어 비용을 산정하지 않았습니다. 토큰 사용량은 확정값입니다.',
      };
    }
    pricingModels.add(resolved);
    const large = stage.usage.inputTokens > 200_000;
    const inputRate = large && price.largeInput ? price.largeInput : price.input;
    const outputRate = large && price.largeOutput ? price.largeOutput : price.output;
    total += (stage.usage.inputTokens * inputRate
      + (stage.usage.outputTokens + stage.usage.thoughtTokens) * outputRate) / 1_000_000;
    if (stage.agenticVisionStatus === 'USED_OK' || stage.agenticVisionStatus === 'USED_FAILED') {
      agenticAttributed += stage.usage.toolUseTokens * inputRate / 1_000_000;
    }
  }
  return {
    currency: 'USD',
    totalUsd: total,
    agenticAttributedUsd: agenticAttributed,
    pricingModel: [...pricingModels].join(', '),
    pricingAsOf: '2026-08-09',
    note: 'Standard 유료 티어 기준 추정액입니다. 무료 티어·캐시·계정 계약은 반영하지 않습니다. Agentic Vision 금액은 API가 별도로 노출한 tool-use 입력 토큰의 직접 귀속분이며, 생성 코드/실행 결과 중 일반 출력과 분리되지 않는 토큰은 포함하지 않습니다.',
  };
}

export function formatUsd(value: number | null): string {
  if (value === null) return '산정 불가';
  if (value === 0) return '$0.000000';
  return value < 0.000001 ? '< $0.000001' : `$${value.toFixed(6)}`;
}

export function formatAnalysisReport(report: AnalysisReport): string {
  const lines = [
    '# Nano Banana Studio 분석 실행 리포트',
    '',
    `- 생성 시각: ${new Date(report.createdAt).toISOString()}`,
    `- 결과: ${report.outcome}`,
    `- 분석 방식: ${report.pipeline}`,
    `- API 호출 방식: ${report.apiMethod || '기록 없음'}`,
    `- Safety 설정: ${report.safetyMode || '기록 없음'}`,
    `- 선택 모델: ${report.requestedModel}`,
    `- API 응답 모델: ${report.resolvedModels.join(', ') || '확인 불가'}`,
    `- Agentic Vision 선택: ${report.agenticVisionRequested ? '예' : '아니오'}`,
    `- Agentic Vision 실제 상태: ${report.agenticVisionStatus}`,
    `- 정밀검사 횟수: ${report.inspections.length}`,
    `- 총 분석 시간: ${(report.totalDurationMs / 1000).toFixed(2)}초`,
    `- 총 추정 비용: ${formatUsd(report.cost.totalUsd)} USD`,
    `- Agentic Vision 직접 귀속 추정 비용: ${formatUsd(report.cost.agenticAttributedUsd)} USD`,
    `- 가격 기준: ${report.cost.pricingAsOf} / ${report.cost.pricingModel || '가격 미등록 모델'}`,
    `- 비용 메모: ${report.cost.note}`,
    '',
    '## 토큰 사용량',
    '',
    `- 입력: ${report.usage.inputTokens}`,
    `- 출력: ${report.usage.outputTokens}`,
    `- 생각: ${report.usage.thoughtTokens}`,
    `- 도구 사용: ${report.usage.toolUseTokens}`,
    `- 캐시: ${report.usage.cachedTokens}`,
    `- 합계: ${report.usage.totalTokens}`,
    '',
    '## 단계별 실행',
    '',
    ...report.stages.flatMap((stage, index) => [
      `### ${index + 1}. ${stage.name}`,
      `- 요청 모델: ${stage.requestedModel}`,
      `- API 응답 모델: ${stage.resolvedModel || '확인 불가'}`,
      `- 상태: ${stage.status}`,
      `- API 시도 횟수: ${stage.attemptCount ?? 1}`,
      `- 종료 사유: ${stage.finishReason || '없음'}`,
      `- 프롬프트 차단 사유: ${stage.promptBlockReason || '없음'}`,
      `- 시간: ${(stage.durationMs / 1000).toFixed(2)}초`,
      `- 토큰: 입력 ${stage.usage.inputTokens}, 출력 ${stage.usage.outputTokens}, 생각 ${stage.usage.thoughtTokens}, 도구 ${stage.usage.toolUseTokens}`,
      `- Agentic Vision: ${stage.agenticVisionStatus}`,
      ...(stage.retryReasons?.length ? stage.retryReasons.map((reason, retryIndex) => `- 자동 재시도 ${retryIndex + 1}: ${reason}`) : []),
      ...(stage.attempts?.length ? [
        '',
        '#### API 시도 기록',
        ...stage.attempts.flatMap((attempt) => [
          `- 시도 ${attempt.attempt}: ${attempt.status} / ${(attempt.durationMs / 1000).toFixed(2)}초 / 요청 ${attempt.requestedModel} / 응답 ${attempt.resolvedModel || '없음'}`,
          `  - 종료: ${attempt.finishReason || '없음'}, 차단: ${attempt.promptBlockReason || '없음'}, 토큰: ${attempt.usage.totalTokens}`,
          ...(attempt.error ? [`  - 오류: ${attempt.error}`] : []),
        ]),
      ] : []),
      '',
    ]),
  ];

  if (report.inspections.length) {
    lines.push('## Agentic Vision 정밀검사', '');
    for (const inspection of report.inspections) {
      lines.push(
        `### 검사 ${inspection.index}`,
        `- 본 부분: ${inspection.area}`,
        `- 목적: ${inspection.purpose}`,
        `- 상태: ${inspection.status}`,
        `- 결과: ${inspection.resultExcerpt || '텍스트 결과 없음'}`,
        '',
      );
    }
  }

  if (report.finalAnalysis) {
    lines.push(
      '## 분석 결과 요약',
      '',
      `- 자세: ${report.finalAnalysis.pose_ko}`,
      `- 상호작용: ${report.finalAnalysis.interaction_ko}`,
      `- 카메라: ${report.finalAnalysis.camera_ko}`,
      `- 최종 프롬프트: ${report.finalAnalysis.prompt_ko}`,
      '',
    );
  }

  if (report.failure) {
    lines.push(
      '## 중단 사유',
      '',
      `- 단계: ${report.failure.stage}`,
      `- 분류: ${report.failure.category}`,
      `- API 시도 횟수: ${report.failure.attemptCount ?? 0}`,
      `- 이유: ${report.failure.reason}`,
      ...(report.failure.retryReasons?.length
        ? report.failure.retryReasons.map((reason, retryIndex) => `- 자동 재시도 ${retryIndex + 1}: ${reason}`)
        : []),
      '',
    );
  }
  return lines.join('\n');
}
