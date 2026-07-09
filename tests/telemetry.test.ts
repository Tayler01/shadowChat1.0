import { scrubTelemetryValue } from '../src/lib/telemetry';

describe('telemetry privacy scrubber', () => {
  it('removes chat, identity, and credential fields', () => {
    const scrubbed = scrubTelemetryValue({
      message: 'private DM',
      email: 'person@example.com',
      authorization: 'Bearer secret',
      nested: { deviceId: 'device-123', safe: 'render' },
    });
    expect(scrubbed).toEqual({
      message: '[redacted]',
      email: '[redacted]',
      authorization: '[redacted]',
      nested: { deviceId: '[redacted]', safe: 'render' },
    });
  });

  it('removes URL query strings and fragments', () => {
    expect(scrubTelemetryValue('https://example.com/path?token=secret#private')).toBe('[redacted]');
    expect(scrubTelemetryValue('https://example.com/path?view=compact#private')).toBe('https://example.com/path');
  });
});
