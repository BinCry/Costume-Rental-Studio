function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;

  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.length >= 2 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

/** Normalize common formatting artifacts returned by the Ops Agent before Markdown parsing. */
export function normalizeAssistantMarkdown(markdown: string): string {
  let normalized = markdown.replace(/\r\n?/g, '\n').replace(/<br\s*\/?\s*>/gi, '\n');

  // Some model responses flatten Markdown table rows together as `||`. Only
  // split those row boundaries when the response actually contains a table.
  if (/\|\s*:?-{3,}/.test(normalized)) {
    normalized = normalized.replace(/[ \t]*\|\|[ \t]*/g, '\n');
    const lines = normalized.split('\n');

    for (let index = 1; index < lines.length; index += 1) {
      if (!isTableSeparator(lines[index])) continue;

      const headerIndex = index - 1;
      const headerLine = lines[headerIndex];
      const headerStart = headerLine.indexOf('|');
      if (headerStart < 0) continue;

      const introduction = headerLine.slice(0, headerStart).trimEnd();
      const header = headerLine.slice(headerStart).trim();
      if (introduction && header) {
        lines.splice(headerIndex, 1, introduction, '', header);
        index += 2;
        continue;
      }

      if (header && headerIndex > 0 && lines[headerIndex - 1].trim()) {
        lines.splice(headerIndex, 0, '');
        index += 1;
      }
    }

    normalized = lines.join('\n');
  }

  return normalized.trim();
}
