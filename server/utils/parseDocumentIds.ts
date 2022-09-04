import { Node } from "prosemirror-model";
import parseDocumentSlug from "@shared/utils/parseDocumentSlug";
import { parser } from "@server/editor";

/**
 * Parse a list of unique document identifiers contained in links in markdown
 * text.
 *
 * @param text The text to parse in Markdown format
 * @returns An array of document identifiers
 */
export default function parseDocumentIds(text: string): string[] {
  const value = parser.parse(text);
  const identifiers: string[] = [];

  function findLinks(node: Node) {
    // get text nodes
    if (node.type.name === "text") {
      // get marks for text nodes
      node.marks.forEach((mark) => {
        // any of the marks identifiers?
        if (mark.type.name === "link") {
          const slug = parseDocumentSlug(mark.attrs.href);

          // don't return the same link more than once
          if (slug && !identifiers.includes(slug)) {
            identifiers.push(slug);
          }
        }
      });
    }

    if (!node.content.size) {
      return;
    }

    node.content.descendants(findLinks);
  }

  findLinks(value);
  return identifiers;
}
