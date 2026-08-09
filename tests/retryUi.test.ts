import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manual retry controls', () => {
  it('keeps a manual retry action in ordinary workspaces', () => {
    const source = readFileSync(new URL('../components/WorkspaceSlot.tsx', import.meta.url), 'utf8');
    expect(source).toContain('수동 재시도');
    expect(source).toContain("runAnalysis(slot.originalImage!");
  });

  it('can retry either failed comparison side independently', () => {
    const source = readFileSync(new URL('../CompareApp.tsx', import.meta.url), 'utf8');
    expect(source).toContain('이 분석만 재시도');
    expect(source).toContain("run(['standard'])");
    expect(source).toContain("run(['harness'])");
  });
});
