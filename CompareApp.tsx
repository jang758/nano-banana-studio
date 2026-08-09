import { useMemo, useRef, useState } from 'react';
import { Columns2, Eye, EyeOff, ImagePlus, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { FALLBACK_MODELS } from './constants';
import { analyzeImage, listAvailableModels } from './services/geminiService';
import type { AnalysisOutput, ModelOption } from './types';
import { formatAnalysis } from './utils/analysisFormat';
import { formatUsd } from './utils/analysisReport';

function mergeModels(live: ModelOption[]) {
  const merged = new Map(FALLBACK_MODELS.map((model) => [model.id, model]));
  live.forEach((model) => merged.set(model.id, model));
  return [...merged.values()].filter((model) => model.task === 'analysis' && model.selectable);
}

function ResultCard({ title, subtitle, output }: { title: string; subtitle: string; output: AnalysisOutput | null }) {
  return (
    <section className="compare-result">
      <div className="compare-result-head"><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div>{output && <b>{(output.trace.totalDurationMs / 1000).toFixed(1)}s</b>}</div>
      {output ? (
        <>
          <div className="compare-trace">
            <span>{output.trace.agenticVisionStatus}</span>
            <span>{output.report.inspections.length}회 정밀검사</span>
            <span>{output.report.usage.totalTokens.toLocaleString()} tokens</span>
            <span>{formatUsd(output.report.cost.totalUsd)}</span>
            {output.trace.stages.map((stage) => <span key={stage.name}>{stage.name} {(stage.durationMs / 1000).toFixed(1)}s</span>)}
          </div>
          <h3>생성 프롬프트</h3>
          <textarea className="compare-prompt" readOnly value={output.result.prompt_en} />
          <h3>분석 사양</h3>
          <textarea className="compare-analysis" readOnly value={formatAnalysis(output.result, 'ko')} />
        </>
      ) : <div className="compare-empty">비교 분석을 실행하면 결과가 표시됩니다.</div>}
    </section>
  );
}

export default function CompareApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gemini-pro-latest');
  const [models, setModels] = useState<ModelOption[]>(mergeModels([]));
  const [agenticVision, setAgenticVision] = useState(false);
  const [image, setImage] = useState<{ base64: string; mimeType: string; url: string } | null>(null);
  const [standard, setStandard] = useState<AnalysisOutput | null>(null);
  const [harness, setHarness] = useState<AnalysisOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modelLabel = useMemo(() => models.find((item) => item.id === model)?.displayName || model, [model, models]);

  const useFile = async (file: File) => {
    if (image) URL.revokeObjectURL(image.url);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setImage({ base64, mimeType: file.type || 'image/png', url: URL.createObjectURL(file) });
    setStandard(null);
    setHarness(null);
  };

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError('');
    setStandard(null);
    setHarness(null);
    try {
      // 동일 이미지·모델·Agentic 설정으로 실행해 분석 방식만 비교한다.
      const common = { apiKey, base64: image.base64, mimeType: image.mimeType, model, agenticVision };
      const [standardOutput, harnessOutput] = await Promise.all([
        analyzeImage({ ...common, pipeline: 'standard' }),
        analyzeImage({ ...common, pipeline: 'harness' }),
      ]);
      setStandard(standardOutput);
      setHarness(harnessOutput);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '비교 분석에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="compare-page">
      <header className="compare-header">
        <a href="/" className="flex items-center gap-3"><span className="brand-mark"><Sparkles size={18} /></span><b>Nano Banana Studio</b></a>
        <nav><a href="/">기존 분석</a><a href="/harness.html">새 하네스</a><a className="active" href="/compare.html"><Columns2 size={14} /> 비교</a></nav>
      </header>

      <main className="compare-main">
        <section className="compare-intro">
          <p className="eyebrow">CONTROLLED A/B ANALYSIS</p>
          <h1>같은 이미지, 같은 모델, 다른 분석 방식</h1>
          <p>Agentic Vision은 기본적으로 꺼져 있습니다. 켠 비교가 필요할 때만 두 버전에 같은 조건으로 적용됩니다.</p>
        </section>

        <section className="compare-controls">
          <div className="key-input-wrap">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Gemini API 키 · 메모리에만 유지" autoComplete="off" />
            <button onClick={() => setShowKey((value) => !value)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <select value={model} onChange={(event) => setModel(event.target.value)} title={modelLabel}>
            {models.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.id}</option>)}
          </select>
          <button className="secondary-button" disabled={!apiKey.trim()} onClick={async () => {
            try { setModels(mergeModels(await listAvailableModels(apiKey))); } catch (caught) { setError(caught instanceof Error ? caught.message : '모델 목록 오류'); }
          }}><RefreshCw size={14} /> 모델 갱신</button>
          <label className="compare-check"><input type="checkbox" checked={agenticVision} onChange={(event) => setAgenticVision(event.target.checked)} /> 코드 기반 정밀검사 허용</label>
        </section>

        <section className="compare-source">
          <button className="compare-upload" onClick={() => inputRef.current?.click()}>
            {image ? <img src={image.url} alt="비교 원본" /> : <><ImagePlus size={25} /><b>비교할 이미지 선택</b></>}
          </button>
          <input ref={inputRef} hidden type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void useFile(event.target.files[0])} />
          <button className="primary-button compare-run" disabled={!image || !apiKey.trim() || busy} onClick={() => void run()}>
            {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Columns2 size={17} />}
            {busy ? '두 분석을 실행 중' : '동일 조건 A/B 분석 실행'}
          </button>
        </section>
        {error && <div className="error-banner static-error">{error}</div>}
        <div className="compare-grid">
          <ResultCard title="기존 분석 유지" subtitle="ONE-PASS BASELINE" output={standard} />
          <ResultCard title="새 분석 하네스" subtitle="EVIDENCE → CRITIC → SYNTHESIS" output={harness} />
        </div>
      </main>
    </div>
  );
}
