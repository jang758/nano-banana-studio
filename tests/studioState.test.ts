import { describe, expect, it } from 'vitest';
import { FALLBACK_MODELS } from '../constants';
import {
  createCompareSession,
  createPipelineSession,
  mergeModels,
  pathForStudioView,
  studioViewFromPath,
} from '../utils/studioState';

describe('studio routes', () => {
  it('maps all three entry paths without a document reload contract', () => {
    expect(studioViewFromPath('/')).toBe('standard');
    expect(studioViewFromPath('/harness.html')).toBe('harness');
    expect(studioViewFromPath('/compare.html')).toBe('compare');
    expect(pathForStudioView('standard')).toBe('/');
    expect(pathForStudioView('harness')).toBe('/harness.html');
    expect(pathForStudioView('compare')).toBe('/compare.html');
  });
});

describe('studio session factories', () => {
  it('creates independent standard and harness workspaces', () => {
    const standard = createPipelineSession();
    const harness = createPipelineSession();
    standard.slots[0].currentPrompt = 'standard draft';
    expect(harness.slots[0].currentPrompt).toBe('');
    expect(standard.slots[0].id).not.toBe(harness.slots[0].id);
  });

  it('creates independent comparison sides', () => {
    const comparison = createCompareSession();
    comparison.standard.error = 'standard failed';
    expect(comparison.harness.error).toBeNull();
  });
});

describe('mergeModels', () => {
  it('keeps fallbacks and replaces duplicate ids with live metadata', () => {
    const live = {
      ...FALLBACK_MODELS[0],
      displayName: 'Live Pro Alias',
      description: 'live',
    };
    const merged = mergeModels([live]);
    expect(merged.find((model) => model.id === live.id)?.displayName).toBe('Live Pro Alias');
    expect(merged).toHaveLength(FALLBACK_MODELS.length);
  });
});
