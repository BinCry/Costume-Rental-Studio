import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeAssistantMarkdown } from '../utils/assistantMarkdown';

interface AssistantMarkdownProps {
  content: string;
}

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="ops-chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="ops-chat-markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {normalizeAssistantMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
