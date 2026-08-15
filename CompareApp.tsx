import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { CheckCircle2, Columns2, Download, Eye, EyeOff, ImagePlus, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import { runComparisonSide } from './services/comparisonService';
import type {
  AnalysisPipeline,
  AppSettings,
  CompareSession,
  CompareSideState,
  ModelOption,
  StudioView,
} from './types';
import { formatAnalysis } from './utils/analysisFormat';
import { formatAnalysisReport, formatUsd } from './utils/analysisReport';
import { getClipboardImage, readImageFile, takeSelectedFile } from './utils/imageInput';
import { createCompareSideState } from './utils/studioState';
import { AnalysisReportView } from './components/AnalysisReportView';

interface Props {
  view: StudioView;
  onNavigate: (view: StudioView) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  models: ModelOption[];
  modelRefreshState: 'idle' | 'loading' | 'error';
  onRefreshModels: () => Promise<number>;
  onAddCustomModel: (value: string) => string;
  session: CompareSession;
  onSessionChange: Dispatch<SetStateAction<CompareSession>>;
}

function ResultCard({
  title,
  subtitle,
  state,
  onRetry,
  language,
}: {
  title: string;
  subtitle: string;
  state: CompareSideState;
  onRetry: () => void;
  language: 'en' | 'ko';
}) {
  const { output, report, error, historyId, saveError, autoSavePath, autoSaveError } = state;
  return (
    <section className="compare-result">
      <div className="compare-result-head">
        <div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div>
        {report && <b>{(report.totalDurationMs / 1000).toFixed(1)}s</b>}
      </div>

      {output ? (
        <>
          <div className="compare-trace">
            <span>{output.trace.agenticVisionStatus}</span>
            <span>{output.report.inspections.length}회 정밀검사</span>
            <span>{output.report.usage.totalTokens.toLocaleString()} tokens</span>
            <span>{formatUsd(output.report.cost.totalUsd)}</span>
            {output.trace.stages.map((stage) => <span key={stage.name}>{stage.name} {(stage.durationMs / 1000).toFixed(1)}s</span>)}
          </div>
          {historyId && <div className="compare-save-state"><CheckCircle2 size={15} /> 히스토리에 저장됨</div>}
          {saveError && <div className="compare-side-error">분석은 완료됐지만 히스토리 저장 실패: {saveError}</div>}
          {autoSavePath && <div className="compare-save-state"><CheckCircle2 size={15} /> 자동 저장됨: {autoSavePath}</div>}
          {autoSaveError && <div className="compare-side-error">분석은 완료됐지만 결과 파일 자동 저장 실패: {autoSaveError}</div>}
          <h3>생성 프롬프트</h3>
          <textarea className="compare-prompt" readOnly value={language === 'en' ? output.result.prompt_en : output.result.prompt_ko} />
          <h3>분석 사양</h3>
          <textarea className="compare-analysis" readOnly value={formatAnalysis(output.result, language)} />
        </>
      ) : error ? (
        <div className="compare-side-error">
          <span>{error}</span>
          <button className="secondary-button" onClick={onRetry}><RefreshCw size={14} /> {state.resumeState ? '실패 단계부터 재시도' : '이 분석만 재시도'}</button>
        </div>
      ) : (
        <div className="compare-empty">비교 분석을 실행하면 결과가 표시됩니다.</div>
      )}

      {report && <AnalysisReportView report={report} />}
    </section>
  );
}

export default function CompareApp({
  view,
  onNavigate,
  apiKey,
  onApiKeyChange,
  settings,
  onSettingsChange,
  models,
  modelRefreshState,
  onRefreshModels,
  onAddCustomModel,
  session,
  onSessionChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [resultLanguage, setResultLanguage] = useState<'en' | 'ko'>('en');
  const analysisModels = useMemo(
    () => models.filter((model) => model.task === 'analysis' && model.selectable),
    [models],
  );
  const modelLabel = analysisModels.find((item) => item.id === settings.analysisModel)?.displayName || settings.analysisModel;

  const changeAnalysisSettings = (nextSettings: AppSettings) => {
    const agenticChanged = nextSettings.agenticVision !== settings.agenticVision;
    const modelChanged = nextSettings.analysisModel !== settings.analysisModel;
    onSettingsChange(nextSettings);
    if (agenticChanged) {
      onSessionChange((current) => ({
        ...current,
        standard: createCompareSideState(),
        harness: createCompareSideState(),
        error: null,
      }));
    } else if (modelChanged) {
      onSessionChange((current) => ({
        ...current,
        standard: current.standard.error && current.standard.resumeState ? current.standard : createCompareSideState(),
        harness: current.harness.error && current.harness.resumeState ? current.harness : createCompareSideState(),
        error: null,
      }));
    }
  };

  const useFile = async (file: File) => {
    try {
      const image = await readImageFile(file);
      onSessionChange({
        image,
        standard: createCompareSideState(),
        harness: createCompareSideState(),
        error: null,
      });
    } catch (error) {
      onSessionChange((current) => ({
        ...current,
        error: error instanceof Error ? error.message : '이미지를 읽지 못했습니다.',
      }));
    }
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busy || !event.clipboardData) return;
      const file = getClipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void useFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const run = async (pipelines: AnalysisPipeline[] = ['standard', 'harness'], resumeFailed = false) => {
    if (!session.image || busy) return;
    setBusy(true);
    onSessionChange((current) => ({
      ...current,
      ...(pipelines.includes('standard') ? { standard: createCompareSideState() } : {}),
      ...(pipelines.includes('harness') ? { harness: createCompareSideState() } : {}),
      error: null,
    }));
    const common = {
      apiKey,
      base64: session.image.base64,
      mimeType: session.image.mimeType,
      fileName: session.image.fileName,
      settings,
    };
    const results = await Promise.all(pipelines.map(async (pipeline) => ({
      pipeline,
      result: await runComparisonSide({
        ...common,
        pipeline,
        resumeState: resumeFailed ? session[pipeline].resumeState : null,
      }),
    })));
    onSessionChange((current) => {
      const next = { ...current };
      for (const { pipeline, result } of results) next[pipeline] = result;
      return next;
    });
    setBusy(false);
  };

  const downloadComparisonReport = () => {
    const sections = [
      session.standard.report ? `# 기존 분석 유지\n\n${formatAnalysisReport(session.standard.report)}` : '',
      session.harness.report ? `# 새 분석 하네스\n\n${formatAnalysisReport(session.harness.report)}` : '',
    ].filter(Boolean);
    if (!sections.length) return;
    const url = URL.createObjectURL(new Blob([
      `# Nano Banana Studio A/B 비교 리포트\n\n- 분석 모델: ${settings.analysisModel}\n- Agentic Vision 선택: ${settings.agenticVision ? '예' : '아니오'}\n\n${sections.join('\n\n---\n\n')}`,
    ], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nano-banana-comparison-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="compare-page">
      <header className="compare-header">
        <button className="brand-button flex items-center gap-3" disabled={busy} onClick={() => onNavigate('standard')}>
          <span className="brand-mark"><Sparkles size={18} /></span><b>Nano Banana Studio</b>
        </button>
        <nav className="compare-nav-desktop">
          <button disabled={busy} onClick={() => onNavigate('standard')}>기존 분석</button>
          <button disabled={busy} onClick={() => onNavigate('harness')}>새 하네스</button>
          <button disabled={busy} className="active" onClick={() => onNavigate('compare')}><Columns2 size={15} /> 비교</button>
        </nav>
        <select
          className="compare-view-switch"
          aria-label="분석 화면 선택"
          value={view}
          disabled={busy}
          onChange={(event) => onNavigate(event.target.value as StudioView)}
        >
          <option value="standard">기존 분석</option>
          <option value="harness">새 하네스</option>
          <option value="compare">비교</option>
        </select>
      </header>

      <main className="compare-main">
        <section className="compare-intro">
          <p className="eyebrow">CONTROLLED A/B ANALYSIS</p>
          <h1>같은 이미지, 같은 모델, 다른 분석 방식</h1>
          <p>Agentic Vision은 기본적으로 꺼져 있습니다. 켠 비교가 필요할 때만 두 버전에 같은 조건으로 적용됩니다.</p>
        </section>

        <section className="compare-controls">
          <div className="key-input-wrap">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder="Gemini API 키 · 앱을 닫을 때까지 유지" autoComplete="off" spellCheck={false} />
            <button aria-label="API 키 표시 전환" onClick={() => setShowKey((value) => !value)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <select value={settings.analysisModel} onChange={(event) => changeAnalysisSettings({ ...settings, analysisModel: event.target.value })} title={modelLabel} aria-label="비교 분석 모델">
            {analysisModels.map((item) => <option key={item.id} value={item.id}>[{item.source === 'api' ? '계정' : item.source === 'custom' ? 'Custom' : '기본'}] {item.displayName} · {item.id}</option>)}
          </select>
          <button className="secondary-button" disabled={!apiKey.trim() || modelRefreshState === 'loading' || busy} onClick={() => {
            onSessionChange((current) => ({ ...current, error: null }));
            void onRefreshModels().catch((error) => onSessionChange((current) => ({
              ...current,
              error: error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.',
            })));
          }}>
            {modelRefreshState === 'loading' ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} 모델 갱신
          </button>
          <label className="compare-check"><input type="checkbox" checked={settings.agenticVision} onChange={(event) => changeAnalysisSettings({ ...settings, agenticVision: event.target.checked })} /> 코드 기반 정밀검사 허용</label>
          <div className="compare-custom-model">
            <input value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="Custom Model ID" aria-label="비교 Custom Model ID" />
            <button className="secondary-button" disabled={!customModel.trim() || busy} onClick={() => {
              try {
                const id = onAddCustomModel(customModel);
                changeAnalysisSettings({ ...settings, analysisModel: id });
                setCustomModel('');
              } catch (error) {
                onSessionChange((current) => ({ ...current, error: error instanceof Error ? error.message : 'Custom Model을 추가하지 못했습니다.' }));
              }
            }}>추가·선택</button>
          </div>
        </section>

        <section
          className={`compare-source ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (busy) return;
            const file = event.dataTransfer.files[0];
            if (file) void useFile(file);
          }}
        >
          <div className="compare-upload-wrap">
            <button className="compare-upload" disabled={busy} onClick={() => inputRef.current?.click()}>
              {session.image
                ? <img src={`data:${session.image.mimeType};base64,${session.image.base64}`} alt="비교 원본" />
                : <><ImagePlus size={28} /><b>이미지 선택</b><small>클릭 · 붙여넣기 · 드래그</small></>}
            </button>
            {session.image && (
              <button
                className="compare-remove"
                disabled={busy}
                aria-label="비교 이미지 제거"
                title="비교 이미지 제거"
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = '';
                  onSessionChange({ ...session, image: null, standard: createCompareSideState(), harness: createCompareSideState(), error: null });
                }}
              ><X size={16} /></button>
            )}
          </div>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              const file = takeSelectedFile(event.currentTarget);
              if (file) void useFile(file);
            }}
          />
          <button className="primary-button compare-run" disabled={!session.image || !apiKey.trim() || busy} onClick={() => void run()}>
            {busy ? <LoaderCircle className="animate-spin" size={18} /> : <Columns2 size={18} />}
            {busy ? '두 분석을 실행 중' : '동일 조건 A/B 분석 실행'}
          </button>
        </section>

        {session.error && (
          <div className="error-banner static-error">
            <span>{session.error}</span>
            <button aria-label="오류 닫기" onClick={() => onSessionChange((current) => ({ ...current, error: null }))}><X size={15} /></button>
          </div>
        )}

        <div className="compare-result-toolbar">
          {(session.standard.report || session.harness.report) && (
            <button className="secondary-button compare-report-download" onClick={downloadComparisonReport}>
              <Download size={15} /> 비교 리포트 .md 저장
            </button>
          )}
          <div className="compare-language-control">
            <span>결과 언어</span>
            <div className="segmented" role="group" aria-label="비교 결과 언어">
              <button className={resultLanguage === 'en' ? 'active' : ''} aria-pressed={resultLanguage === 'en'} onClick={() => setResultLanguage('en')}>EN</button>
              <button className={resultLanguage === 'ko' ? 'active' : ''} aria-pressed={resultLanguage === 'ko'} onClick={() => setResultLanguage('ko')}>KO</button>
            </div>
          </div>
        </div>

        <div className="compare-grid">
          <ResultCard title="기존 분석 유지" subtitle="ONE-PASS BASELINE" state={session.standard} language={resultLanguage} onRetry={() => void run(['standard'], true)} />
          <ResultCard title="새 분석 하네스" subtitle="EVIDENCE → CRITIC → SYNTHESIS" state={session.harness} language={resultLanguage} onRetry={() => void run(['harness'], true)} />
        </div>
      </main>
    </div>
  );
}
