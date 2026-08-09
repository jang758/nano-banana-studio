import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analysisResultSchema } from '../services/geminiService';
import { ANALYSIS_JSON_SCHEMA, SAFETY_SETTINGS } from '../services/geminiService';
import { DEFAULT_SETTINGS } from '../constants';
import type { AnalysisResult } from '../types';
import { formatAnalysis } from '../utils/analysisFormat';

const result: AnalysisResult = {
  face: 'face', expression: 'expression', body: 'body', fashion: 'fashion', pose: 'pose', skin: 'skin',
  lighting: 'lighting', camera: 'camera', background: 'background', effects: 'effects', interaction: 'interaction',
  face_ko: '얼굴', expression_ko: '표정', body_ko: '신체', fashion_ko: '의상', pose_ko: '자세', skin_ko: '피부',
  lighting_ko: '조명', camera_ko: '카메라', background_ko: '배경', effects_ko: '효과', interaction_ko: '상호작용',
  prompt_en: 'English prompt', prompt_ko: '한국어 프롬프트',
};

describe('analysis contract', () => {
  it('accepts the complete legacy-compatible result shape', () => {
    expect(analysisResultSchema.parse(result)).toEqual(result);
  });

  it('fails closed when a required analysis field is missing', () => {
    const invalid = { ...result } as Partial<AnalysisResult>;
    delete invalid.interaction_ko;
    expect(analysisResultSchema.safeParse(invalid).success).toBe(false);
  });

  it('formats both languages without losing section data', () => {
    expect(formatAnalysis(result, 'en')).toContain('interaction');
    expect(formatAnalysis(result, 'ko')).toContain('상호작용');
    expect(formatAnalysis(result, 'ko')).toContain('[11. 디지털 후처리 데이터]');
  });

  it('keeps the requested defaults and original required-field order', () => {
    expect(DEFAULT_SETTINGS.analysisModel).toBe('gemini-pro-latest');
    expect(DEFAULT_SETTINGS.agenticVision).toBe(false);
    expect(ANALYSIS_JSON_SCHEMA.required.slice(0, 6)).toEqual([
      'face', 'face_ko', 'expression', 'expression_ko', 'body', 'body_ko',
    ]);
  });

  it('uses explicit OFF for all four adjustable generateContent safety categories', () => {
    expect(SAFETY_SETTINGS).toHaveLength(4);
    expect(SAFETY_SETTINGS.map((setting) => setting.threshold)).toEqual(['OFF', 'OFF', 'OFF', 'OFF']);
    expect(SAFETY_SETTINGS.map((setting) => setting.category)).toEqual([
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ]);
  });

  it('contains no Interactions calls or SDK type-check bypasses', () => {
    const serviceSource = readFileSync(new URL('../services/geminiService.ts', import.meta.url), 'utf8');
    expect(serviceSource).not.toContain('interactions.create');
    expect(serviceSource).not.toContain('as never');
    expect(serviceSource).toContain('ai.models.generateContent');
  });

  it('keeps API keys outside persisted settings and storage records', () => {
    const typesSource = readFileSync(new URL('../types.ts', import.meta.url), 'utf8');
    const storageSource = readFileSync(new URL('../services/storageService.ts', import.meta.url), 'utf8');
    const studioSource = readFileSync(new URL('../StudioApp.tsx', import.meta.url), 'utf8');
    const appSettings = typesSource.slice(typesSource.indexOf('export interface AppSettings'), typesSource.indexOf('export interface AnalysisResult'));
    expect(appSettings).not.toContain('apiKey');
    expect(storageSource).not.toContain('apiKey');
    expect(studioSource).toContain("const [apiKey, setApiKey] = useState('')");
  });
});
