import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveAnalysisResultToDisk } from '../server/resultStorage';
import { buildAnalysisResultText } from '../services/resultFileService';
import type { AnalysisOutput, AnalysisReport, AnalysisResult } from '../types';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const result: AnalysisResult = {
  face: 'face', expression: 'expression', body: 'body', fashion: 'fashion', pose: 'pose', skin: 'skin',
  lighting: 'lighting', camera: 'camera', background: 'background', effects: 'effects', interaction: 'interaction',
  face_ko: '얼굴', expression_ko: '표정', body_ko: '신체', fashion_ko: '의상', pose_ko: '자세', skin_ko: '피부',
  lighting_ko: '조명', camera_ko: '카메라', background_ko: '배경', effects_ko: '효과', interaction_ko: '상호작용',
  prompt_en: 'Original English prompt', prompt_ko: '원본 한국어 프롬프트',
};

const report: AnalysisReport = {
  reportVersion: 1,
  createdAt: 1,
  outcome: 'completed',
  pipeline: 'standard',
  requestedModel: 'gemini-pro-latest',
  resolvedModels: ['gemini-pro-latest'],
  agenticVisionRequested: false,
  agenticVisionStatus: 'DISABLED',
  inspections: [],
  stages: [],
  usage: { inputTokens: 1, outputTokens: 2, thoughtTokens: 0, toolUseTokens: 0, cachedTokens: 0, totalTokens: 3 },
  cost: { currency: 'USD', totalUsd: null, agenticAttributedUsd: null, pricingModel: null, pricingAsOf: '2026-08-15', note: 'test' },
  totalDurationMs: 100,
  finalAnalysis: result,
};

const output: AnalysisOutput = {
  result,
  report,
  trace: { pipeline: 'standard', agenticVisionStatus: 'DISABLED', stages: [], totalDurationMs: 100 },
};

describe('flat automatic result storage', () => {
  it('writes one UTF-8 TXT and byte-identical references with one shared base name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nano-banana-result-'));
    temporaryRoots.push(root);
    const firstBytes = Buffer.from([0, 1, 2, 127, 128, 255]);
    const secondBytes = Buffer.from([9, 8, 7, 6]);
    const text = buildAnalysisResultText(output);

    const saved = await saveAnalysisResultToDisk(root, {
      pipeline: 'standard',
      text,
      references: [
        { base64: firstBytes.toString('base64'), mimeType: 'image/jpeg', fileName: 'SOURCE.JPG' },
        { base64: secondBytes.toString('base64'), mimeType: 'image/webp', fileName: null },
      ],
    }, new Date(2026, 7, 15, 14, 30, 12, 123), 'a1b2c3d4');

    expect(saved.baseName).toBe('20260815_143012_123_standard_a1b2c3d4');
    expect(saved.textPath).toBe(`analysis_results/${saved.baseName}.txt`);
    expect(saved.referencePaths).toEqual([
      `analysis_results/${saved.baseName}_ref1.JPG`,
      `analysis_results/${saved.baseName}_ref2.webp`,
    ]);
    expect(await readFile(join(root, saved.referencePaths[0]))).toEqual(firstBytes);
    expect(await readFile(join(root, saved.referencePaths[1]))).toEqual(secondBytes);
    expect(await readFile(join(root, saved.textPath), 'utf8')).toBe(text);
    const entries = await readdir(join(root, 'analysis_results'), { withFileTypes: true });
    expect(entries.every((entry) => entry.isFile())).toBe(true);
  });

  it('creates a distinct common name for every result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nano-banana-result-'));
    temporaryRoots.push(root);
    const payload = { pipeline: 'harness' as const, text: 'result', references: [] };
    const first = await saveAnalysisResultToDisk(root, payload);
    const second = await saveAnalysisResultToDisk(root, payload);
    expect(first.baseName).not.toBe(second.baseName);
    expect((await readdir(join(root, 'analysis_results'))).filter((name) => name.endsWith('.txt'))).toHaveLength(2);
  });

  it('combines the report, full analysis, and both original prompts in one TXT', () => {
    const text = buildAnalysisResultText(output);
    expect(text).toContain('===== 분석 실행 리포트 =====');
    expect(text).toContain('===== 전체 분석 결과 =====');
    expect(text).toContain('Original English prompt');
    expect(text).toContain('원본 한국어 프롬프트');
  });
});
