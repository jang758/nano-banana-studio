import { describe, expect, it } from 'vitest';
import type { AnalysisReport, AnalysisStageReport } from '../types';
import { estimateCost, formatAnalysisReport } from '../utils/analysisReport';
import { AnalysisRunError, analyzeImage, publicApiError } from '../services/geminiService';

const stage: AnalysisStageReport = {
  name: '증거 수집',
  requestedModel: 'gemini-pro-latest',
  resolvedModel: 'gemini-pro-latest',
  durationMs: 1250,
  status: 'completed',
  usage: {
    inputTokens: 1_000,
    outputTokens: 100,
    thoughtTokens: 50,
    toolUseTokens: 200,
    cachedTokens: 0,
    totalTokens: 1_150,
  },
  agenticVisionStatus: 'USED_OK',
  inspections: [{
    index: 1,
    area: '이미지 좌표 (10, 20)–(100, 120)',
    purpose: '손 접촉 확인',
    codeExcerpt: 'crop(10, 20, 100, 120)',
    resultExcerpt: '손가락 경계 확인',
    status: 'ok',
  }],
  attempts: [{
    attempt: 1,
    requestedModel: 'gemini-pro-latest',
    resolvedModel: 'gemini-3.1-pro-preview',
    durationMs: 1250,
    status: 'completed',
    usage: {
      inputTokens: 1_000,
      outputTokens: 100,
      thoughtTokens: 50,
      toolUseTokens: 200,
      cachedTokens: 0,
      totalTokens: 1_150,
    },
    finishReason: 'STOP',
    inspections: [],
  }],
};

describe('analysis report', () => {
  it('estimates paid-tier total and tool-use attributable cost separately', () => {
    const cost = estimateCost([stage]);
    expect(cost.totalUsd).toBeCloseTo(0.0038, 8);
    expect(cost.agenticAttributedUsd).toBeCloseTo(0.0004, 8);
  });

  it('leaves cost unknown for a model without a local official price mapping', () => {
    const cost = estimateCost([{ ...stage, requestedModel: 'gemini-unknown', resolvedModel: 'gemini-unknown' }]);
    expect(cost.totalUsd).toBeNull();
    expect(cost.agenticAttributedUsd).toBeNull();
  });

  it('prints model, Agentic inspection, timing, cost, and failure reason', () => {
    const report: AnalysisReport = {
      reportVersion: 1,
      createdAt: 0,
      outcome: 'rejected',
      pipeline: 'harness',
      requestedModel: 'gemini-pro-latest',
      resolvedModels: ['gemini-pro-latest'],
      agenticVisionRequested: true,
      agenticVisionStatus: 'USED_OK',
      inspections: stage.inspections,
      stages: [stage],
      usage: stage.usage,
      cost: estimateCost([stage]),
      totalDurationMs: 1250,
      failure: { stage: '최종 합성', category: 'safety', reason: '안전 정책으로 거절됨' },
    };
    const text = formatAnalysisReport(report);
    expect(text).toContain('gemini-pro-latest');
    expect(text).toContain('정밀검사 횟수: 1');
    expect(text).toContain('이미지 좌표 (10, 20)–(100, 120)');
    expect(text).toContain('안전 정책으로 거절됨');
    expect(text).toContain('API 시도 기록');
    expect(text).toContain('응답 gemini-3.1-pro-preview');
  });

  it('returns a structured in-app report when analysis cannot start', async () => {
    try {
      await analyzeImage({
        apiKey: '',
        base64: 'unused',
        mimeType: 'image/png',
        model: 'gemini-pro-latest',
        pipeline: 'harness',
        agenticVision: true,
      });
      throw new Error('요청이 실패해야 합니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisRunError);
      const runError = error as AnalysisRunError;
      expect(runError.report.outcome).toBe('failed');
      expect(runError.report.failure?.category).toBe('authentication');
      expect(runError.report.failure?.stage).toBe('초기화');
      expect(runError.report.requestedModel).toBe('gemini-pro-latest');
      expect(runError.report.agenticVisionRequested).toBe(true);
    }
  });

  it('shows the real nested Gemini error while redacting API keys', () => {
    const error = publicApiError({
      status: 400,
      message: '400 API error occurred',
      error: { error: { message: 'Invalid value at response_format for key=AIzaSECRET123' } },
    });
    expect(error.message).toContain('Invalid value at response_format');
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain('AIzaSECRET123');
  });
});
