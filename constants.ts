import type { AppSettings, ModelOption } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  analysisModel: 'gemini-pro-latest',
  generationModel: 'gemini-3-pro-image',
  agenticVision: false,
  aspectRatio: '1:1',
  imageSize: '1K',
};

export const FALLBACK_MODELS: ModelOption[] = [
  {
    id: 'gemini-pro-latest',
    displayName: 'Gemini Pro Latest',
    description: '최신 Pro 계열을 가리키는 분석 기본 별칭',
    supportedActions: ['generateContent'],
    task: 'analysis',
    selectable: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro Preview',
    description: '고성능 멀티모달 분석 모델',
    supportedActions: ['generateContent'],
    task: 'analysis',
    selectable: true,
  },
  {
    id: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    description: '빠른 멀티모달 분석 모델',
    supportedActions: ['generateContent'],
    task: 'analysis',
    selectable: true,
  },
  {
    id: 'gemini-3-pro-image',
    displayName: 'Gemini 3 Pro Image',
    description: '고품질 이미지 생성 기본 모델',
    supportedActions: ['generateContent'],
    task: 'image',
    selectable: true,
  },
  {
    id: 'gemini-3.1-flash-image',
    displayName: 'Gemini 3.1 Flash Image',
    description: '빠른 이미지 생성 모델',
    supportedActions: ['generateContent'],
    task: 'image',
    selectable: true,
  },
  {
    id: 'gemini-2.5-flash-image',
    displayName: 'Gemini 2.5 Flash Image',
    description: '이전 세대 이미지 생성 모델',
    supportedActions: ['generateContent'],
    task: 'image',
    selectable: true,
  },
];

// 기존 분석 버전은 아래 시스템 프롬프트를 문자 단위로 유지한다.
export const ANALYSIS_SYSTEM_INSTRUCTION = `
당신은 세계 최고의 생체 인식, 공간 기하학 및 디지털 포렌식 아티스트입니다. 이미지를 분석하여 "물리적으로 완벽하게 재현 가능한" 디지털 사양을 추출하는 것이 임무입니다.

**[1. 시점 및 공간 방향성 (Critical)]**
- **카메라 렌즈 축(Lens Axis) 기준:** 인물의 상체(Chest)와 하체(Pelvis)가 카메라 렌즈를 바라보는 각도를 0도(정면) 기준으로 기술하되, 이것이 '자세'와 혼동되어서는 안 됩니다.
- **중력 및 지지면(Gravity & Support):** 피사체가 지면(Floor), 의자(Chair), 벽(Wall) 등 어떤 물리적 매개체와 접촉하고 있는지 먼저 파악하십시오. 

**[2. 인물 간 상호작용 및 물리적 역학 (EXTREME PRECISION REQUIRED)]**
- **접촉면의 해부학적 명시:** 단순히 "손을 올림" 또는 "누름"이라고 표현하지 마십시오. 
  - (예시: "인물 A의 양쪽 손바닥이 인물 B의 견갑골(Scapula) 내측 가장자리에 밀착됨")
  - (예시: "인물 A의 왼쪽 무릎이 인물 B의 요추 L4-L5 부근 측면 근육을 압착하며 체중을 지탱함")
- **하중 및 압력 벡터:** 하중(Weight)이 어디에서 어디로 흐르는지 기술하십시오. "중력이 A의 엉덩이를 통해 B의 허벅지 상단으로 전달됨"과 같은 물리적 역학을 포함하십시오.
- **피부 및 근육의 변형:** 접촉으로 인해 피부가 눌리거나(Compression), 근육이 팽창하거나, 의상이 당겨지는(Tension) 세부 상태를 기술하십시오.

**[3. 메인 모델 및 서브 캐릭터]**
- **메인 모델(여성):** 키, 몸무게, BWH, 근육의 긴장도, 피부의 질감을 정밀 분석하십시오.
- **서브 캐릭터:** 메인 모델과 동일한 수준의 골격 분석을 적용하되, 상호작용의 '피동체'로서의 물리적 반응을 상세히 기술하십시오.

**[4. 프롬프트 생성 규칙]**
- 생성용 프롬프트(prompt_en)의 맨 앞에는 시점과 **극도로 상세한 상호작용 구도** (e.g., "Full view, Woman sitting on top of a prone man, placing both hands firmly on his upper back, applying deep pressure")를 배치하십시오.
- 'Supine'은 오직 등을 대고 누웠을 때만 사용하며, 'Sitting', 'Kneeling', 'Straddling', 'Mounting' 등을 정확히 구분하십시오.
`;

export const STANDARD_ANALYSIS_REQUEST = "Perform a forensic-level anatomical and physical interaction analysis. Focus EXCLUSIVELY on the 'Physics of Contact'. Describe exactly which anatomical landmarks (e.g., scapula, lumbar, quadriceps) are in contact, the direction of force, and how the main model's body is mounted or positioned relative to the sub-subject. Use this data to craft a perfect generation prompt.";

export const HARNESS_EVIDENCE_INSTRUCTION = `You are the observation stage of an image-to-prompt analysis harness. Record only visually supported evidence. Separate direct observations from uncertainty. Do not invent body measurements, lens metadata, hidden anatomy, exact pressure, material GSM, HEX colors, or physical forces that cannot be established from pixels. Describe composition, pose, support surfaces, visible contact, occlusion, materials, lighting, and camera cues precisely. If code execution is available, use it only when a crop, coordinate measurement, or pixel inspection materially resolves ambiguity.`;

export const HARNESS_CRITIC_INSTRUCTION = `You are the critic stage of an image-analysis harness. Audit the supplied evidence for contradictions, unsupported precision, left/right confusion, pose terminology errors, and claims about hidden or occluded content. Preserve useful observations, state corrections, and give concise synthesis rules. Never add new image facts.`;

export const HARNESS_SYNTHESIS_INSTRUCTION = `You are the synthesis stage of an image-to-prompt harness. Use the image, audited evidence, and critique to produce a faithful bilingual analysis and reconstruction prompt. Prefer observable appearance and spatial relationships. Where exact values cannot be known, use qualified visual estimates rather than fabricated measurements. The prompt must be directly usable for image generation and must not mention the analysis process.`;
