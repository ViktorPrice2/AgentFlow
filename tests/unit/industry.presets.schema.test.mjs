import { describe, expect, it } from 'vitest';
import {
  IndustryPresetValidationError,
  parseIndustryPreset
} from '../../app/core/presets/industryPresetSchema.js';

function createBasePreset(overrides = {}) {
  const base = {
    version: '1.0.0',
    meta: {
      id: 'base-preset',
      name: 'Base preset',
      industry: 'marketing'
    },
    survey: {
      sections: [
        {
          id: 'section-1',
          title: 'Section 1',
          questions: [
            {
              id: 'question-1',
              prompt: 'What is your primary marketing goal?'
            }
          ]
        }
      ]
    }
  };

  return { ...base, ...overrides };
}

describe('industryPresetSchema.parse', () => {
  it('parses a minimal preset and applies defaults', () => {
    const preset = createBasePreset();
    const parsed = parseIndustryPreset(preset);

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.meta).toEqual({ id: 'base-preset', name: 'Base preset', industry: 'marketing' });
    expect(parsed.agents).toEqual([]);
    expect(parsed.pipelines).toEqual([]);
    expect(parsed.survey.sections).toHaveLength(1);
    expect(parsed.survey.sections[0].questions[0].type).toBe('text');
    expect(preset.survey.sections[0].questions[0]).not.toHaveProperty('type');
  });

  it('throws when pipeline edges omit both target and to fields', () => {
    const preset = createBasePreset({
      pipelines: [
        {
          id: 'pipeline-1',
          name: 'Pipeline 1',
          edges: [
            {
              id: 'edge-1',
              source: 'node-a'
            }
          ]
        }
      ]
    });

    const parse = () => parseIndustryPreset(preset);

    expect(parse).toThrow(IndustryPresetValidationError);
    expect(parse).toThrow(/target|to/);
  });

  it('rejects presets with unsupported root properties', () => {
    const preset = createBasePreset({ foo: 'bar' });

    const parse = () => parseIndustryPreset(preset);

    expect(parse).toThrow(IndustryPresetValidationError);
    expect(parse).toThrow(/unsupported property/);
  });
});
