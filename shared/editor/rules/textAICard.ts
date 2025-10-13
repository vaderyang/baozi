import MarkdownIt, { Token } from "markdown-it";
import customFence from "markdown-it-container";

export default function textAICard(md: MarkdownIt): void {
  return customFence(md, "text-ai", {
    marker: "`",
    validate: (params: string) => params.trim().match(/^text-ai\s+/),
    render(tokens: Token[], idx: number) {
      const { info } = tokens[idx];

      if (tokens[idx].nesting === 1) {
        // opening tag - extract JSON attrs from info string
        const attrsMatch = info.match(/text-ai\s+(\{.*\})/);
        const attrsJson = attrsMatch ? attrsMatch[1] : "{}";

        return `<div class="text-ai-card" data-attrs='${md.utils.escapeHtml(attrsJson)}'>
`;
      } else {
        // closing tag
        return "</div>\n";
      }
    },
  });
}
