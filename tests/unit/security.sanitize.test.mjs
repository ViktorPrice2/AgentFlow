import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_ROOT,
  CONFIG_ROOT,
  sanitizeArtifactPath,
  sanitizeFileName,
  sanitizePath,
  resolveDataPath,
  resolveConfigPath,
  redactSensitive,
  isPathAllowed,
  maskSecrets
} from '../../app/core/utils/security.js';

describe('security utils', () => {
  it('sanitizes file name while preserving extension', () => {
    expect(sanitizeFileName('My File!.png')).toBe('My_File_.png');
  });

  it('normalizes artifact paths by removing unsafe characters', () => {
    expect(sanitizeArtifactPath('../foo/?bar')).toBe('__/foo/_bar');
  });

  it('rejects attempts to escape allowed roots via sanitizePath', () => {
    expect(() => sanitizePath('../etc/passwd')).toThrow(/outside allowed directories/i);
  });

  it('resolves allowed data and config paths within the sandbox', () => {
    const dataPath = resolveDataPath('logs', 'run.json');
    const configPath = resolveConfigPath('agents', 'writer.json');

    expect(dataPath.startsWith(DATA_ROOT)).toBe(true);
    expect(configPath.startsWith(CONFIG_ROOT)).toBe(true);
  });

  it('detects whether paths stay within allowed roots', () => {
    const allowedPath = path.join(DATA_ROOT, 'artifacts', 'x.txt');
    const disallowedPath = path.join(process.cwd(), 'tmp', 'x.txt');

    expect(isPathAllowed(allowedPath)).toBe(true);
    expect(isPathAllowed(disallowedPath)).toBe(false);
  });

  it('redacts secrets inside nested payloads', () => {
    const payload = {
      token: 'abcd',
      nested: {
        api_key: 'XYZ',
        keep: 'value'
      }
    };

    expect(redactSensitive(payload)).toEqual({
      token: '[redacted]',
      nested: {
        api_key: '[redacted]',
        keep: 'value'
      }
    });
  });

  it('masks high-entropy secrets within strings', () => {
    expect(maskSecrets('api_key=ABCD1234EFGH5678')).toBe('api_key=****');
  });
});
