import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import App from './App';
import CompareApp from './CompareApp';
import { FALLBACK_MODELS } from './constants';
import { listAvailableModels } from './services/geminiService';
import type {
  AppSettings,
  CompareSession,
  ModelOption,
  PipelineWorkspaceSession,
  StudioView,
} from './types';
import {
  createCompareSession,
  createPipelineSession,
  createSettings,
  mergeModels,
  pathForStudioView,
  studioViewFromPath,
} from './utils/studioState';

export default function StudioApp() {
  const [view, setView] = useState<StudioView>(() => studioViewFromPath(window.location.pathname));
  const [apiKey, setApiKey] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => createSettings());
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [modelRefreshState, setModelRefreshState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [workspaceSessions, setWorkspaceSessions] = useState<Record<'standard' | 'harness', PipelineWorkspaceSession>>(() => ({
    standard: createPipelineSession(),
    harness: createPipelineSession(),
  }));
  const [compareSession, setCompareSession] = useState<CompareSession>(() => createCompareSession());

  useEffect(() => {
    const onPopState = () => setView(studioViewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    document.title = view === 'standard'
      ? 'Nano Banana Studio · 기존 분석'
      : view === 'harness'
        ? 'Nano Banana Studio · 새 분석 하네스'
        : 'Nano Banana Studio · 분석 비교';
  }, [view]);

  const navigate = useCallback((nextView: StudioView) => {
    const path = pathForStudioView(nextView);
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
  }, []);

  const refreshModels = useCallback(async (): Promise<number> => {
    setModelRefreshState('loading');
    try {
      const live = await listAvailableModels(apiKey);
      setModels(mergeModels(live));
      setModelRefreshState('idle');
      return live.length;
    } catch (error) {
      setModelRefreshState('error');
      throw error;
    }
  }, [apiKey]);

  const updateWorkspaceSession = useCallback((updater: SetStateAction<PipelineWorkspaceSession>) => {
    if (view === 'compare') return;
    setWorkspaceSessions((current) => ({
      ...current,
      [view]: typeof updater === 'function' ? updater(current[view]) : updater,
    }));
  }, [view]);

  if (view === 'compare') {
    return (
      <CompareApp
        view={view}
        onNavigate={navigate}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        settings={settings}
        onSettingsChange={setSettings}
        models={models}
        modelRefreshState={modelRefreshState}
        onRefreshModels={refreshModels}
        session={compareSession}
        onSessionChange={setCompareSession}
      />
    );
  }

  return (
    <App
      pipeline={view}
      view={view}
      onNavigate={navigate}
      apiKey={apiKey}
      onApiKeyChange={setApiKey}
      settings={settings}
      onSettingsChange={setSettings}
      models={models}
      modelRefreshState={modelRefreshState}
      onRefreshModels={refreshModels}
      session={workspaceSessions[view]}
      onSessionChange={updateWorkspaceSession}
    />
  );
}
