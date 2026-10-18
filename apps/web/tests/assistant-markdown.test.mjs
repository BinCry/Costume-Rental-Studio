const { describe, expect, it } = globalThis;
const { normalizeAssistantMarkdown } = await import('../src/utils/assistantMarkdown.ts');
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { AssistantMarkdown } = await import('../src/components/AssistantMarkdown.tsx');

describe('Ops Agent Markdown normalization', () => {
  it('converts literal HTML line breaks and flattened table row boundaries', () => {
    const response =
      'Cách kiểm tra:<br>| Bước | Nội dung | Lý do || |------|------------|------|| 1. **Đối chiếu** | So lịch | Tránh trùng<br>2. Kiểm tra | Tình trạng | Xác nhận';

    expect(normalizeAssistantMarkdown(response)).toBe(
      'Cách kiểm tra:\n\n| Bước | Nội dung | Lý do\n|------|------------|------\n1. **Đối chiếu** | So lịch | Tránh trùng\n2. Kiểm tra | Tình trạng | Xác nhận',
    );
  });

  it('preserves normal Markdown and trims surrounding whitespace', () => {
    expect(normalizeAssistantMarkdown('  **Lưu ý**\n\n- Bước một  ')).toBe(
      '**Lưu ý**\n\n- Bước một',
    );
  });

  it('renders assistant formatting as semantic Markdown elements', () => {
    const html = renderToStaticMarkup(
      React.createElement(AssistantMarkdown, {
        content: '## Kiểm tra\n\n| Bước | Trạng thái |\n|---|---|\n| **Một** | Sẵn sàng |',
      }),
    );

    expect(html).toContain('<h2>Kiểm tra</h2>');
    expect(html).toContain('<div class="ops-chat-markdown-table-wrap"><table>');
    expect(html).toContain('<strong>Một</strong>');
  });
});
