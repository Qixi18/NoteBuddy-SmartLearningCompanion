import { describe, expect, it } from 'vitest';
import { normalizeHash, routeFor } from './navigation';

describe('navigation', () => {
  it('normalizes an empty or unknown hash to the overview', () => {
    expect(normalizeHash('')).toBe('/home');
    expect(normalizeHash('#/made-up')).toBe('/home');
  });

  it('keeps known Chinese workbench views addressable', () => {
    expect(normalizeHash('#/insights/evidence')).toBe('/insights/evidence');
    expect(routeFor('/plan/reviews').title).toBe('建议复核');
    expect(normalizeHash('#/knowledge/sources')).toBe('/knowledge/indicators');
  });
});
