import { buildVerificationEmailCopy } from './verification-email-template.js';

describe('buildVerificationEmailCopy', () => {
  it('includes the code and expiry in both the html and text bodies', () => {
    const { subject, html, text } = buildVerificationEmailCopy({ code: '482913', expiresInMinutes: 15 });

    expect(subject).toContain('verificación');
    expect(html).toContain('482913');
    expect(html).toContain('15 minutos');
    expect(text).toContain('482913');
    expect(text).toContain('15 minutos');
  });

  it('renders a self-contained HTML document (doctype, no external stylesheet)', () => {
    const { html } = buildVerificationEmailCopy({ code: '000000', expiresInMinutes: 10 });

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toContain('<link');
  });
});
