import { describe, it, expect } from "@jest/globals";

/**
 * Test suite for transcript stripping functionality in AI Search and AI Ask.
 * Ensures that TranscriptCard markdown exports are properly stripped from
 * context sent to LLM to reduce token usage.
 */

/**
 * Removes transcript code blocks from markdown content to reduce token usage.
 * This is a copy of the function from ai.ts for testing purposes.
 */
const stripTranscriptCodeBlocks = (markdown: string): string => {
  // Match heading with "transcript" (case-insensitive) followed by a code block
  // Pattern: ## Transcript\n\n```\n<content>\n```
  const transcriptPattern =
    /^(#{1,6}\s+[^#\n]*transcript[^\n]*)\n+```[^\n]*\n[\s\S]*?```/gim;

  // Replace transcript code blocks with just the heading and a placeholder
  return markdown.replace(
    transcriptPattern,
    "$1\n\n[Transcript content omitted for brevity]"
  );
};

describe("stripTranscriptCodeBlocks", () => {
  describe("TranscriptCard format", () => {
    it("should strip transcript from TranscriptCard markdown export format", () => {
      const markdown = `# Meeting Summary

## Key Points
- Point 1
- Point 2

## Transcript

\`\`\`
Speaker 0: This is a very long transcript with lots of content.
Speaker 1: And more content here that should be removed.
Speaker 0: Even more content that takes up tokens.
Speaker 1: We don't want to send this to the LLM.
\`\`\`

## Next Steps
- Follow up items
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("# Meeting Summary");
      expect(result).toContain("## Key Points");
      expect(result).toContain("## Transcript");
      expect(result).toContain("[Transcript content omitted for brevity]");
      expect(result).toContain("## Next Steps");

      // Verify transcript content is removed
      expect(result).not.toContain("Speaker 0:");
      expect(result).not.toContain("Speaker 1:");
      expect(result).not.toContain("very long transcript");
      expect(result).not.toContain("more content here");
    });

    it("should handle multiple transcript sections", () => {
      const markdown = `# Document

## Transcript 1

\`\`\`
First transcript content here.
More lines.
\`\`\`

Some text between.

## Transcript 2

\`\`\`
Second transcript content here.
Different content.
\`\`\`

Final text.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("## Transcript 1");
      expect(result).toContain("## Transcript 2");
      expect(result).toContain("Some text between.");
      expect(result).toContain("Final text.");

      // Both transcripts should be stripped
      expect(result).not.toContain("First transcript content");
      expect(result).not.toContain("Second transcript content");
    });

    it("should handle different heading levels", () => {
      const testCases = [
        "# Transcript",
        "## Transcript",
        "### Transcript",
        "#### Transcript",
        "##### Transcript",
        "###### Transcript",
      ];

      testCases.forEach((heading) => {
        const markdown = `${heading}

\`\`\`
Transcript content to be removed.
\`\`\`
`;

        const result = stripTranscriptCodeBlocks(markdown);

        expect(result).toContain(heading);
        expect(result).toContain("[Transcript content omitted for brevity]");
        expect(result).not.toContain("Transcript content to be removed");
      });
    });

    it("should handle transcript with case variations", () => {
      const testCases = [
        "## Transcript",
        "## TRANSCRIPT",
        "## transcript",
        "## Meeting Transcript",
        "## Audio Transcript",
        "## Call Transcript",
      ];

      testCases.forEach((heading) => {
        const markdown = `${heading}

\`\`\`
Content to strip.
\`\`\`
`;

        const result = stripTranscriptCodeBlocks(markdown);

        expect(result).toContain(heading);
        expect(result).not.toContain("Content to strip");
      });
    });

    it("should handle code blocks with language specifiers", () => {
      const markdown = `## Transcript

\`\`\`plaintext
Speaker 0: Hello world
Speaker 1: Hi there
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("## Transcript");
      expect(result).not.toContain("Hello world");
      expect(result).not.toContain("Hi there");
    });

    it("should preserve non-transcript code blocks", () => {
      const markdown = `# Document

## Code Example

\`\`\`javascript
function test() {
  console.log("This should be preserved");
}
\`\`\`

## Transcript

\`\`\`
This should be stripped.
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      // Code block should be preserved
      expect(result).toContain("```javascript");
      expect(result).toContain('console.log("This should be preserved")');

      // Transcript should be stripped
      expect(result).not.toContain("This should be stripped");
    });

    it("should handle empty transcripts", () => {
      const markdown = `## Transcript

\`\`\`
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("## Transcript");
      expect(result).toContain("[Transcript content omitted for brevity]");
    });

    it("should handle transcripts with special characters", () => {
      const markdown = `## Transcript

\`\`\`
Speaker 0: This has special chars: $!@#%^&*()
Speaker 1: Unicode: 你好 こんにちは 안녕하세요
Speaker 0: Email: test@example.com
Speaker 1: URL: https://example.com/path?query=value
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("## Transcript");
      expect(result).not.toContain("$!@#%^&*()");
      expect(result).not.toContain("你好");
      expect(result).not.toContain("test@example.com");
    });

    it("should handle large transcripts efficiently", () => {
      const largeTranscript = Array(1000)
        .fill("Speaker 0: This is a long line of transcript content.")
        .join("\n");

      const markdown = `## Summary
Brief summary here.

## Transcript

\`\`\`
${largeTranscript}
\`\`\`

## Notes
Some notes.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      // Verify content is stripped
      expect(result.length).toBeLessThan(markdown.length / 10);
      expect(result).toContain("## Summary");
      expect(result).toContain("## Transcript");
      expect(result).toContain("## Notes");
      expect(result).not.toContain("long line of transcript content");
    });

    it("should handle transcript with markdown inside code block", () => {
      const markdown = `## Transcript

\`\`\`
Speaker 0: Here's a **bold** statement
Speaker 1: And a *italic* response
Speaker 0: Even a [link](https://example.com)
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).not.toContain("**bold**");
      expect(result).not.toContain("*italic*");
      expect(result).not.toContain("[link]");
    });

    it("should preserve content before and after transcript", () => {
      const markdown = `# Meeting Notes

## Attendees
- Alice
- Bob
- Charlie

## Transcript

\`\`\`
Very long transcript content here...
Multiple lines...
Many speakers...
\`\`\`

## Action Items
1. Follow up with team
2. Schedule next meeting
3. Review notes

## Conclusion
Great meeting!
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("# Meeting Notes");
      expect(result).toContain("## Attendees");
      expect(result).toContain("- Alice");
      expect(result).toContain("- Bob");
      expect(result).toContain("## Action Items");
      expect(result).toContain("1. Follow up with team");
      expect(result).toContain("## Conclusion");
      expect(result).toContain("Great meeting!");

      expect(result).not.toContain("Very long transcript");
      expect(result).not.toContain("Multiple lines");
    });

    it("should calculate significant token savings", () => {
      const transcriptContent = Array(500)
        .fill(
          "Speaker 0: This is a realistic length transcript line with actual content about the meeting discussion."
        )
        .join("\n");

      const markdown = `## Summary
Meeting about project updates.

## Transcript

\`\`\`
${transcriptContent}
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      const originalLength = markdown.length;
      const strippedLength = result.length;
      const reduction =
        ((originalLength - strippedLength) / originalLength) * 100;

      // Should save at least 90% of the characters
      expect(reduction).toBeGreaterThan(90);
      expect(strippedLength).toBeLessThan(500); // Much smaller result
    });
  });

  describe("Edge cases", () => {
    it("should handle markdown with no transcript", () => {
      const markdown = `# Regular Document

## Section 1
Content here.

## Section 2
More content.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      // Should return unchanged
      expect(result).toBe(markdown);
    });

    it("should handle empty string", () => {
      const result = stripTranscriptCodeBlocks("");
      expect(result).toBe("");
    });

    it("should handle markdown with only transcript heading (no code block)", () => {
      const markdown = `## Transcript

No code block here.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      // Should remain unchanged since no code block follows
      expect(result).toBe(markdown);
    });

    it("should handle transcript heading with extra whitespace", () => {
      const markdown = `##   Transcript

\`\`\`
Content to strip.
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("##   Transcript");
      expect(result).not.toContain("Content to strip");
    });

    it("should handle code blocks without preceding transcript heading", () => {
      const markdown = `\`\`\`
This is just a code block without a transcript heading.
It should be preserved.
\`\`\`
`;

      const result = stripTranscriptCodeBlocks(markdown);

      // Should be preserved
      expect(result).toBe(markdown);
    });

    it("should handle transcript at the start of document", () => {
      const markdown = `## Transcript

\`\`\`
Starting with transcript.
\`\`\`

Other content follows.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("## Transcript");
      expect(result).toContain("Other content follows.");
      expect(result).not.toContain("Starting with transcript");
    });

    it("should handle transcript at the end of document", () => {
      const markdown = `# Document

Content before.

## Transcript

\`\`\`
Ending with transcript.
\`\`\``;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("Content before.");
      expect(result).toContain("## Transcript");
      expect(result).not.toContain("Ending with transcript");
    });
  });

  describe("Integration with TranscriptCard", () => {
    it("should match the exact format exported by TranscriptCard.toMarkdown", () => {
      // This is the exact format from TranscriptCard.toMarkdown (lines 1665-1675)
      const summaryMarkdown = `# Meeting Summary

## Key Points
- Important point 1
- Important point 2

`;

      const transcript = `Speaker 0: This is the first line of the transcript.
Speaker 1: This is a response.
Speaker 0: More discussion here.
Speaker 1: Final thoughts.`;

      // Simulate TranscriptCard.toMarkdown output
      const cardMarkdown = `${summaryMarkdown}## Transcript

\`\`\`
${transcript}
\`\`\`

`;

      const result = stripTranscriptCodeBlocks(cardMarkdown);

      // Summary should be preserved
      expect(result).toContain("# Meeting Summary");
      expect(result).toContain("## Key Points");
      expect(result).toContain("- Important point 1");

      // Transcript heading should be preserved
      expect(result).toContain("## Transcript");

      // Transcript content should be stripped
      expect(result).not.toContain("Speaker 0:");
      expect(result).not.toContain("Speaker 1:");
      expect(result).not.toContain("first line of the transcript");
      expect(result).not.toContain("Final thoughts");
    });

    it("should handle TranscriptCard with only transcript (no summary)", () => {
      const cardMarkdown = `## Transcript

\`\`\`
Speaker 0: Quick note without summary.
\`\`\`

`;

      const result = stripTranscriptCodeBlocks(cardMarkdown);

      expect(result).toContain("## Transcript");
      expect(result).not.toContain("Quick note without summary");
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle a typical meeting transcript card", () => {
      const markdown = `# Team Standup - 2024-01-15

## Summary
Quick standup discussing current sprint progress and blockers.

## Key Topics
- Sprint progress review
- Blocker identification
- Next steps planning

## Transcript

\`\`\`
Speaker 0: Good morning everyone, let's start with sprint updates.
Speaker 1: I completed the authentication module yesterday.
Speaker 2: Working on the database migration, about 70% done.
Speaker 0: Any blockers?
Speaker 1: Need design review for the login flow.
Speaker 2: Waiting for staging environment access.
Speaker 0: I'll follow up on both items after this call.
Speaker 1: Thanks!
Speaker 2: Appreciated.
\`\`\`

## Action Items
1. Design review for login flow (Alice)
2. Grant staging access (Bob)
3. Follow up on blockers (Charlie)

## Next Meeting
Tomorrow, same time.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      // Verify all important content is preserved
      expect(result).toContain("# Team Standup - 2024-01-15");
      expect(result).toContain("## Summary");
      expect(result).toContain("Quick standup");
      expect(result).toContain("## Key Topics");
      expect(result).toContain("- Sprint progress review");
      expect(result).toContain("## Action Items");
      expect(result).toContain("1. Design review");
      expect(result).toContain("## Next Meeting");

      // Verify transcript is stripped
      expect(result).not.toContain("Good morning everyone");
      expect(result).not.toContain("authentication module");
      expect(result).not.toContain("database migration");

      // Verify significant size reduction
      const reduction =
        ((markdown.length - result.length) / markdown.length) * 100;
      expect(reduction).toBeGreaterThan(40); // Should save at least 40%
    });

    it("should handle a transcript-heavy document", () => {
      const longTranscript = Array(200)
        .fill(0)
        .map(
          (_, i) =>
            `Speaker ${i % 3}: Line ${i} of a very long transcript with detailed discussion.`
        )
        .join("\n");

      const markdown = `# Long Meeting

Brief intro.

## Transcript

\`\`\`
${longTranscript}
\`\`\`

Brief outro.
`;

      const result = stripTranscriptCodeBlocks(markdown);

      expect(result).toContain("Brief intro.");
      expect(result).toContain("Brief outro.");
      expect(result).not.toContain("very long transcript");

      // Should save >95% of content
      const reduction =
        ((markdown.length - result.length) / markdown.length) * 100;
      expect(reduction).toBeGreaterThan(95);
    });
  });
});
