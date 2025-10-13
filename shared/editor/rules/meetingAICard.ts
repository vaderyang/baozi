import MarkdownIt, { Token } from "markdown-it";
import customFence from "markdown-it-container";

export default function meetingAICard(md: MarkdownIt): void {
  return customFence(md, "meeting-ai", {
    marker: "`",
    validate: (params: string) => params.trim().match(/^meeting-ai\s+/),
    render(tokens: Token[], idx: number) {
      const { info } = tokens[idx];

      if (tokens[idx].nesting === 1) {
        // opening tag - extract JSON attrs from info string
        const attrsMatch = info.match(/meeting-ai\s+(\{.*\})/);
        const attrsJson = attrsMatch ? attrsMatch[1] : "{}";

        return `<div class="meeting-ai-card" data-attrs='${md.utils.escapeHtml(attrsJson)}'>
`;
      } else {
        // closing tag
        return "</div>\n";
      }
    },
  });
}
