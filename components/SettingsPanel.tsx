import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, Settings2, X } from 'lucide-react';
import type { AppSettings, AspectRatio, ImageSize, ModelOption } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  models: ModelOption[];
  modelRefreshState: 'idle' | 'loading' | 'error';
  modelRefreshError: string;
  onRefreshModels: () => void;
  onAddCustomModel: (value: string) => string;
}
const ratios: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];
const sizes: ImageSize[] = ['1K', '2K', '4K'];

export function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  apiKey,
  onApiKeyChange,
  models,
  modelRefreshState,
  modelRefreshError,
  onRefreshModels,
  onAddCustomModel,
}: Props) {
  const [showKey, setShowKey] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [customError, setCustomError] = useState('');
  const analysisModels = useMemo(() => models.filter((model) => model.task === 'analysis' && model.selectable), [models]);
  const imageModels = useMemo(() => models.filter((model) => model.task === 'image' && model.selectable), [models]);
  const specializedModels = useMemo(() => models.filter((model) => model.task === 'specialized' || !model.selectable), [models]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const addCustom = () => {
    try {
      const id = onAddCustomModel(customModel);
      update('analysisModel', id);
      setCustomModel('');
      setCustomError('');
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : 'Custom Model을 추가하지 못했습니다.');
    }
  };

  const optionLabel = (model: ModelOption) => {
    const source = model.source === 'api' ? '계정' : model.source === 'custom' ? 'Custom' : '기본';
    return `[${source}] ${model.displayName} · ${model.id}`;
  };

  return (
    <>
      {isOpen && <button className="drawer-backdrop" onClick={onClose} aria-label="설정 닫기" />}
      <aside className={`settings-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">RUNTIME CONFIG</p>
            <h2><Settings2 size={18} /> 분석 및 생성 설정</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="drawer-body">
          <section className="settings-section">
            <div className="settings-label"><KeyRound size={15} /> Gemini API 키</div>
            <div className="key-input-wrap">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
              />
              <button onClick={() => setShowKey((value) => !value)} aria-label="API 키 표시 전환">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="settings-help">키는 앱이 실행되는 동안 메모리에만 있으며 저장·히스토리·내보내기에 포함되지 않습니다.</p>
            <button className="secondary-button w-full" disabled={!apiKey.trim() || modelRefreshState === 'loading'} onClick={onRefreshModels}>
              {modelRefreshState === 'loading' ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />}
              API 모델 전체 새로고침
            </button>
            {modelRefreshState === 'error' && modelRefreshError && <p className="settings-error">{modelRefreshError}</p>}
          </section>

          <section className="settings-section">
            <label className="settings-label" htmlFor="analysis-model">분석 모델</label>
            <select id="analysis-model" value={settings.analysisModel} onChange={(event) => update('analysisModel', event.target.value)}>
              {analysisModels.map((model) => <option value={model.id} key={model.id}>{optionLabel(model)}</option>)}
            </select>
            <p className="settings-help">기본값은 요청하신 <code>gemini-pro-latest</code>입니다.</p>
            <div className="custom-model-row">
              <input
                value={customModel}
                onChange={(event) => { setCustomModel(event.target.value); setCustomError(''); }}
                onKeyDown={(event) => { if (event.key === 'Enter') addCustom(); }}
                placeholder="Custom Model ID"
                aria-label="Custom Model ID"
              />
              <button className="secondary-button" disabled={!customModel.trim()} onClick={addCustom}>추가·선택</button>
            </div>
            {customError && <p className="settings-error">{customError}</p>}
          </section>

          <section className="settings-section agentic-setting">
            <label className="toggle-row">
              <span>
                <strong>코드 기반 정밀검사 허용</strong>
                <small>필요할 때만 모델이 확대·좌표·픽셀 검사를 선택합니다.</small>
              </span>
              <input type="checkbox" checked={settings.agenticVision} onChange={(event) => update('agenticVision', event.target.checked)} />
              <i aria-hidden="true" />
            </label>
            <p className="settings-help">꺼져 있어도 기존 분석과 새 하네스 모두 정상 동작합니다. 비교 기본값은 꺼짐입니다.</p>
          </section>

          <section className="settings-section">
            <label className="settings-label" htmlFor="generation-model">이미지 생성 모델</label>
            <select id="generation-model" value={settings.generationModel} onChange={(event) => update('generationModel', event.target.value)}>
              {imageModels.map((model) => <option value={model.id} key={model.id}>{optionLabel(model)}</option>)}
            </select>
          </section>

          <section className="settings-section">
            <div className="settings-label">화면 비율</div>
            <div className="choice-grid ratio-grid">
              {ratios.map((ratio) => (
                <button className={settings.aspectRatio === ratio ? 'active' : ''} key={ratio} onClick={() => update('aspectRatio', ratio)}>{ratio}</button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-label">생성 해상도</div>
            <div className="choice-grid">
              {sizes.map((size) => (
                <button className={settings.imageSize === size ? 'active' : ''} key={size} onClick={() => update('imageSize', size)}>{size}</button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <button className="catalog-toggle" onClick={() => setCatalogOpen((value) => !value)}>
              <span>전체 모델 카탈로그</span><b>{models.length}</b>
            </button>
            {catalogOpen && (
              <div className="model-catalog">
                {(['analysis', 'image'] as const).map((task) => (
                  <div key={task}>
                    <h3>{task === 'analysis' ? '분석 선택 가능' : '이미지 생성 선택 가능'}</h3>
                    {models.filter((model) => model.task === task && model.selectable).map((model) => (
                      <div className="catalog-row" key={model.id}><CheckCircle2 size={13} /><span><b>{model.displayName}</b><small>{model.id} · {model.source}</small></span></div>
                    ))}
                  </div>
                ))}
                {specializedModels.length > 0 && (
                  <div>
                    <h3>전용 모델 · 현재 작업에는 비활성</h3>
                    {specializedModels.map((model) => (
                      <div className="catalog-row disabled" key={model.id}><span className="catalog-dot" /><span><b>{model.displayName}</b><small>{model.id}</small></span></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
