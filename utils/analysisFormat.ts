import type { AnalysisResult } from '../types';

const LABELS = {
  en: [
    ['FACE GEOMETRY & SUBDERMAL', 'face'],
    ['EXPRESSION PHYSICS', 'expression'],
    ['BODY METRICS', 'body'],
    ['SKELETON MAPPING', 'pose'],
    ['INTERACTION PHYSICS & DYNAMICS', 'interaction'],
    ['FASHION PHYSICS & MATERIAL', 'fashion'],
    ['ELASTICITY & SKIN', 'skin'],
    ['PHOTOMETRIC & LUMINANCE DATA', 'lighting'],
    ['CAMERA OPTICS', 'camera'],
    ['ENVIRONMENT GEOMETRY', 'background'],
    ['DIGITAL LUT / FX', 'effects'],
  ],
  ko: [
    ['안면 기하학 및 피하 분석', 'face_ko'],
    ['안면 근육 긴장 및 표정', 'expression_ko'],
    ['신체 수치와 비율', 'body_ko'],
    ['골격 매핑 및 중심축', 'pose_ko'],
    ['인물 상호작용 및 물리 역학', 'interaction_ko'],
    ['의상 물리 특성 및 소재', 'fashion_ko'],
    ['피부 질감 및 탄력', 'skin_ko'],
    ['광학 측정 및 조도 데이터', 'lighting_ko'],
    ['카메라 광학 지표', 'camera_ko'],
    ['공간 기하학', 'background_ko'],
    ['디지털 후처리 데이터', 'effects_ko'],
  ],
} as const;

export function formatAnalysis(result: AnalysisResult, language: 'en' | 'ko'): string {
  return LABELS[language]
    .map(([label, key], index) => `[${index + 1}. ${label}]\n${result[key]}`)
    .join('\n\n');
}

