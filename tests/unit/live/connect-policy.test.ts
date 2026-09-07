import { describe, expect, it } from 'vitest';
import { refuseRemoteConnection } from '../../../src/live/connect-policy.js';

const NO_HEADERS = undefined;
const AUTH = { Authorization: 'Bearer abc123' };

describe('refuseRemoteConnection', () => {
  it('allows an ordinary https endpoint', () => {
    expect(refuseRemoteConnection('https://api.example.com/mcp', NO_HEADERS, false)).toBeNull();
  });

  it('refuses a cloud-metadata endpoint', () => {
    // MCPG-403 warns that a config points here. Connecting would make
    // guardmcp itself perform the SSRF it exists to report.
    const refusal = refuseRemoteConnection('http://169.254.169.254/latest/', NO_HEADERS, false);
    expect(refusal?.reason).toMatch(/metadata|internal|private/i);
  });

  it.each(['http://10.0.0.5/mcp', 'https://192.168.1.4/mcp', 'https://svc.internal/mcp'])(
    'refuses the private address %s',
    (url) => {
      expect(refuseRemoteConnection(url, NO_HEADERS, false)).not.toBeNull();
    },
  );

  it('refuses cleartext http when credentials would be sent with it', () => {
    // Connecting here means guardmcp transmits the user's own token in the
    // clear. MCPG-401 exists to warn about exactly this.
    const refusal = refuseRemoteConnection('http://api.example.com/mcp', AUTH, false);
    expect(refusal?.reason).toMatch(/cleartext|unencrypted|http/i);
  });

  it('allows cleartext http when there is nothing secret to leak', () => {
    expect(refuseRemoteConnection('http://api.example.com/mcp', NO_HEADERS, false)).toBeNull();
    expect(
      refuseRemoteConnection('http://api.example.com/mcp', { Accept: '*/*' }, false),
    ).toBeNull();
  });

  it('treats any credential-shaped header as credentials, not just Authorization', () => {
    for (const headers of [
      { 'X-API-Key': 'k' },
      { 'x-api-token': 't' },
      { Cookie: 'session=1' },
      { 'Proxy-Authorization': 'Basic x' },
    ]) {
      expect(
        refuseRemoteConnection('http://api.example.com/mcp', headers, false),
        JSON.stringify(headers),
      ).not.toBeNull();
    }
  });

  it('lets the operator override, because scanning your own internal server is legitimate', () => {
    expect(refuseRemoteConnection('http://169.254.169.254/', AUTH, true)).toBeNull();
    expect(refuseRemoteConnection('https://10.0.0.5/mcp', NO_HEADERS, true)).toBeNull();
  });

  it('refuses a url it cannot parse rather than handing it to a transport', () => {
    expect(refuseRemoteConnection('not a url', NO_HEADERS, false)).not.toBeNull();
    expect(refuseRemoteConnection('', NO_HEADERS, false)).not.toBeNull();
  });

  it('refuses a non-http scheme outright', () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com', 'ws://example.com']) {
      expect(refuseRemoteConnection(url, NO_HEADERS, false), url).not.toBeNull();
    }
  });

  it('never refuses loopback — a local dev server is the common case', () => {
    expect(refuseRemoteConnection('http://localhost:3000/mcp', NO_HEADERS, false)).toBeNull();
    expect(refuseRemoteConnection('http://127.0.0.1:3000/mcp', NO_HEADERS, false)).toBeNull();
  });
});
