# Mermaid Extension Implementation Guide

This document provides a comprehensive overview of how the Mermaid extension is implemented in the editor, including details on input handling, rendering, editing, and persistence.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Input Handling](#input-handling)
5. [Rendering Process](#rendering-process)
6. [Edit Operations](#edit-operations)
7. [Persistence](#persistence)
8. [User Interactions](#user-interactions)
9. [Styling](#styling)

## Overview

The Mermaid extension enables users to create diagrams using Mermaid syntax within code blocks. When a code block is set to the `mermaidjs` language, the extension:
- Renders the Mermaid diagram below the code block
- Hides the code block in read-only mode
- Allows editing by showing/focusing on the code block
- Supports theme switching (light/dark)
- Caches rendered diagrams for performance

**Files involved:**
- `/shared/editor/extensions/Mermaid.ts` - Main plugin implementation
- `/shared/editor/nodes/CodeFence.ts` - Code fence node that uses the plugin
- `/shared/editor/lib/code.ts` - Language configuration
- `/shared/editor/components/Styles.ts` - Styling for Mermaid diagrams

## Architecture

The Mermaid extension is built as a **ProseMirror Plugin** that works in conjunction with the **CodeFence node**. It uses ProseMirror's decoration system to render diagrams as widgets positioned after code blocks.

```
┌─────────────────────────────────────────────────────────────┐
│                      CodeFence Node                         │
│  (code_fence with language="mermaidjs")                     │
├─────────────────────────────────────────────────────────────┤
│  - Defines node schema                                      │
│  - Registers Mermaid plugin in plugins getter               │
│  - Handles markdown serialization/parsing                   │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ registers
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mermaid Plugin                           │
├─────────────────────────────────────────────────────────────┤
│  Plugin State:                                              │
│  - decorationSet: DecorationSet (widget decorations)        │
│  - isDark: boolean (theme tracking)                         │
│                                                              │
│  Key Functions:                                             │
│  - init: Create initial decorations                         │
│  - apply: Update decorations on changes                     │
│  - props.decorations: Return current decorations            │
│  - props.handleDOMEvents: Handle user interactions          │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ uses
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  MermaidRenderer Class                      │
├─────────────────────────────────────────────────────────────┤
│  Responsibilities:                                          │
│  - Lazy load mermaid library                                │
│  - Render diagrams (with debouncing)                        │
│  - Manage DOM element lifecycle                             │
│  - Handle rendering errors                                  │
│  - Cache rendered SVG output                                │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Cache Class

A simple LRU cache that stores rendered SVG diagrams to avoid re-rendering.

```typescript
class Cache {
  private static maxSize = 20;
  private static data: Map<string, string> = new Map();

  static get(key: string) {
    return this.data.get(key);
  }

  static set(key: string, value: string) {
    this.data.set(key, value);
    if (this.data.size > this.maxSize) {
      this.data.delete(this.data.keys().next().value);
    }
  }
}
```

**Key features:**
- Maximum 20 cached diagrams
- Key format: `{theme}-{diagramText}` (e.g., "dark-graph TD\n A-->B")
- FIFO eviction when full

### 2. MermaidRenderer Class

Manages individual diagram rendering and lifecycle.

```typescript
class MermaidRenderer {
  readonly diagramId: string;        // Unique UUID for this diagram
  readonly element: HTMLElement;     // Container div for rendered SVG
  readonly elementId: string;        // DOM ID for the element
  readonly editor: Editor;           // Reference to editor instance

  constructor(editor: Editor) {
    this.diagramId = crypto.randomUUID();
    this.elementId = `mermaid-diagram-wrapper-${this.diagramId}`;
    this.element = document.createElement("div");
    this.element.id = this.elementId;
    this.element.classList.add("mermaid-diagram-wrapper");
    this.editor = editor;
  }

  renderImmediately = async (block, isDark) => { /* ... */ }
  
  get render(): RendererFunc {
    // Returns debounced render function (250ms delay)
    if (this._rendererFunc) {
      return this._rendererFunc;
    }
    this._rendererFunc = debounce<RendererFunc>(this.renderImmediately, 250);
    return this.renderImmediately;
  }
}
```

**Key features:**
- Each diagram gets a unique ID
- Debounced rendering (250ms) to avoid excessive re-renders during typing
- Reuses DOM element across updates
- Tracks current text content to avoid unnecessary renders

### 3. Plugin State

```typescript
type MermaidState = {
  decorationSet: DecorationSet;  // All diagram decorations
  isDark: boolean;               // Current theme
};
```

The plugin maintains:
- **DecorationSet**: Contains widget decorations that render diagrams
- **isDark**: Tracks theme for re-rendering on theme changes

### 4. Decoration Strategy

For each Mermaid code block, the plugin creates **two decorations**:

1. **Widget Decoration** (renders the diagram):
   ```typescript
   Decoration.widget(
     block.pos + block.node.nodeSize,  // Position after code block
     () => {
       void renderer.render(block, pluginState.isDark);
       return renderer.element;
     },
     {
       diagramId: renderer.diagramId,
       renderer,
       side: -10,  // Render before cursor
     }
   )
   ```

2. **Node Decoration** (marks the code block):
   ```typescript
   Decoration.node(
     block.pos,
     block.pos + block.node.nodeSize,
     {},
     {
       diagramId: renderer.diagramId,
       renderer,
     }
   )
   ```

**Why two decorations?**
- Widget decoration: Renders the actual diagram below the code
- Node decoration: Associates the code block with its renderer for updates

## Input Handling

### Language Registration

The Mermaid language is registered in `/shared/editor/lib/code.ts`:

```typescript
export const codeLanguages: Record<string, CodeLanguage> = {
  // ... other languages
  mermaidjs: {
    lang: "mermaid",
    label: "Mermaid Diagram",
    loader: () => import("refractor/lang/mermaid").then((m) => m.default),
  },
  // ...
};
```

### User Creates a Mermaid Diagram

1. User types `` ``` `` or uses block menu to insert code block
2. User selects "Mermaid Diagram" language (internally: `mermaidjs`)
3. Code block node is created with `attrs.language = "mermaidjs"`
4. Mermaid plugin detects the code block in `getNewState()`

### Markdown Input

When parsing markdown:

```markdown
```mermaidjs
graph TD
  A-->B
```
```

The parser creates a `code_fence` node with:
- `language: "mermaidjs"`
- `textContent: "graph TD\n  A-->B"`

This is handled by `CodeFence.parseMarkdown()`:

```typescript
parseMarkdown() {
  return {
    block: "code_block",
    getAttrs: (tok: Token) => ({ language: tok.info }),
    noCloseToken: true,
  };
}
```

## Rendering Process

### Initial Render Flow

```
1. Plugin init() called
   └─> getNewState() finds mermaidjs code blocks
       └─> Creates MermaidRenderer for each block
           └─> Creates widget decoration
               └─> Decoration calls renderer.render()
                   └─> renderImmediately() executes
                       ├─> Check cache for existing SVG
                       ├─> Lazy load mermaid library
                       ├─> Call mermaid.render()
                       ├─> Insert SVG into element
                       └─> Cache the result
```

### Detailed Rendering Steps

**Step 1: Check Cache**
```typescript
const cacheKey = `${isDark ? "dark" : "light"}-${text}`;
const cache = Cache.get(cacheKey);
if (cache) {
  element.classList.remove("parse-error", "empty");
  element.innerHTML = cache;
  return;
}
```

**Step 2: Create Off-Screen Element**
```typescript
// Needed for collapsed headings where diagram isn't visible
const renderElement = document.createElement("div");
renderElement.style.position = "absolute";
renderElement.style.left = "-9999px";
renderElement.style.top = "-9999px";
document.body.appendChild(renderElement);
```

**Step 3: Initialize Mermaid**
```typescript
mermaid ??= (await import("mermaid")).default;
mermaid.initialize({
  startOnLoad: true,
  gantt: { useWidth: 700 },
  pie: { useWidth: 700 },
  fontFamily: getComputedStyle(this.element).fontFamily || "inherit",
  theme: isDark ? "dark" : "default",
  darkMode: isDark,
});
```

**Step 4: Render Diagram**
```typescript
const { svg, bindFunctions } = await mermaid.render(
  `mermaid-diagram-${this.diagramId}`,
  text,
  element.offsetParent === null ? renderElement : element
);
```

**Step 5: Update DOM and Cache**
```typescript
if (text) {
  Cache.set(cacheKey, svg);
}
element.classList.remove("parse-error", "empty");
element.innerHTML = svg;
bindFunctions?.(element);  // Enable interactivity
```

**Step 6: Error Handling**
```typescript
catch (error) {
  const isEmpty = block.node.textContent.trim().length === 0;
  if (isEmpty) {
    element.innerText = "Empty diagram";
    element.classList.add("empty");
  } else {
    element.innerText = error;
    element.classList.add("parse-error");
  }
}
finally {
  renderElement.remove();
}
```

### Re-render Triggers

The plugin re-renders diagrams when:

1. **Code block content changes**:
   ```typescript
   const codeBlockChanged =
     transaction.docChanged && [nodeName, previousNodeName].includes(name);
   ```

2. **Theme toggles**:
   ```typescript
   const themeMeta = transaction.getMeta("theme");
   const themeToggled = themeMeta?.isDark !== undefined;
   ```

3. **Remote changes** (collaborative editing):
   ```typescript
   isRemoteTransaction(transaction)
   ```

4. **Plugin loads**:
   ```typescript
   const mermaidMeta = transaction.getMeta("mermaid");
   ```

### Decoration Reuse Optimization

To avoid recreating renderers unnecessarily, the plugin finds the "best matching" decoration from the previous state:

```typescript
function findBestOverlapDecoration(
  decorations: Decoration[],
  block: NodeWithPos
): Decoration | undefined {
  if (decorations.length === 0) {
    return undefined;
  }
  return last(
    sortBy(decorations, (decoration) =>
      overlap(
        decoration.from,
        decoration.to,
        block.pos,
        block.pos + block.node.nodeSize
      )
    )
  );
}
```

This ensures:
- Renderers are reused when code blocks move (e.g., inserting text above)
- Cached SVGs are preserved
- No flickering during edits

## Edit Operations

### Showing/Hiding Code

The CSS handles visibility:

```css
.code-block[data-language=mermaidjs] {
  &:not(.code-active) {
    height: 0;
    overflow: hidden;
    margin: -0.75em 0;
    position: absolute;  /* Remove from flow */
  }
}
```

When the code block is focused, it gets `.code-active` class and becomes visible.

### Editing Flow

1. User clicks on diagram → Plugin's `mouseup` handler activates
2. Code block is selected:
   ```typescript
   view.dispatch(
     view.state.tr
       .setSelection(TextSelection.near(view.state.doc.resolve(pos)))
       .scrollIntoView()
   )
   ```
3. Code block becomes visible (gets `.code-active` class)
4. User edits text
5. `transaction.docChanged` triggers re-render (debounced 250ms)
6. New SVG is generated and cached

### Navigation Between Diagram and Code

**Arrow Down** (from above):
```typescript
const nextBlock = $pos.nodeAfter;
if (nextBlock?.attrs.language === "mermaidjs") {
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.near(view.state.doc.resolve(selection.to + 1))
    )
  );
  event.preventDefault();
}
```

**Arrow Up** (from below):
```typescript
const prevBlock = $pos.nodeBefore;
if (prevBlock?.attrs.language === "mermaidjs") {
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.near(view.state.doc.resolve(selection.from - 2))
    )
  );
  event.preventDefault();
}
```

### Lightbox View

Single-click on diagram in read-only or when selected:
```typescript
if (selected || editor.props.readOnly) {
  editor.updateActiveLightboxImage(
    LightboxImageFactory.createLightboxImage(view, $pos.before())
  );
  return true;
}
```

## Persistence

### Markdown Serialization

When saving to markdown, `CodeFence.toMarkdown()` is called:

```typescript
toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
  state.write("```" + (node.attrs.language || "") + "\n");
  state.text(node.textContent, false);
  state.ensureNewLine();
  state.write("```");
  state.closeBlock(node);
}
```

**Output example:**
```markdown
```mermaidjs
graph TD
  A-->B
```
```

### Document State

The ProseMirror document stores:
```json
{
  "type": "code_fence",
  "attrs": {
    "language": "mermaidjs"
  },
  "content": [
    {
      "type": "text",
      "text": "graph TD\n  A-->B"
    }
  ]
}
```

**No diagram SVG is persisted** - it's regenerated on load from the Mermaid source code.

### Loading Flow

```
1. Markdown parsed to ProseMirror doc
2. code_fence nodes with language="mermaidjs" created
3. Editor view initialized
4. Mermaid plugin's init() runs
5. getNewState() finds Mermaid blocks
6. Decorations created
7. Diagrams rendered
```

## User Interactions

### Click Behavior

**Edit Mode (not selected):**
- Click diagram → Select code block → Show code

**Edit Mode (selected):**
- Click diagram → Open lightbox

**Read-Only Mode:**
- Click diagram → Open lightbox (zoom view)

### Keyboard Shortcuts

Inherited from `CodeFence`:
- **Cmd/Ctrl + Shift + C**: Toggle code block
- **Tab**: Indent in code
- **Shift + Tab**: Outdent in code
- **Enter**: New line in code
- **Backspace** (empty block): Convert to paragraph
- **``` (three backticks)**: Split code block

### Copy to Clipboard

From `CodeFence.commands()`:
```typescript
copyToClipboard: (): Command => (state, dispatch) => {
  const codeBlock = findParentNode(isCode)(state.selection);
  if (codeBlock) {
    copy(codeBlock.node.textContent);
    toast.message(this.options.dictionary.codeCopied);
    return true;
  }
  return false;
}
```

## Styling

### Main Diagram Container

```css
.mermaid-diagram-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.75em 0;
  min-height: 1.6em;
  background: ${theme.codeBackground};
  border-radius: 4px;
  border: 1px solid ${theme.codeBorder};
  padding: 8px;
  user-select: none;
  cursor: default;
}
```

### States

**Empty Diagram:**
```css
.mermaid-diagram-wrapper.empty {
  font-family: ${theme.fontFamilyMono};
  font-size: 14px;
  color: ${theme.placeholder};
}
```

**Parse Error:**
```css
.mermaid-diagram-wrapper.parse-error {
  font-family: ${theme.fontFamilyMono};
  font-size: 14px;
  color: ${theme.brand.red};
}
```

**Code Block (Hidden):**
```css
.code-block[data-language=mermaidjs]:not(.code-active) {
  height: 0;
  margin: -0.75em 0;
  overflow: hidden;
  position: absolute;
}
```

**Code Block (Visible):**
```css
.code-block[data-language=mermaidjs]:is(.code-active) + .mermaid-diagram-wrapper {
  cursor: zoom-in;
}
```

### Read-Only Mode

```css
.ProseMirror[contenteditable="false"] .code-block[data-language=mermaidjs] {
  height: 0;
  overflow: hidden;
  margin: -0.5em 0 0 0;
  
  & + .mermaid-diagram-wrapper {
    cursor: zoom-in;
  }
}
```

### Collapsed Content

```css
.folded-content + .mermaid-diagram-wrapper {
  display: none;
}
```

## Performance Optimizations

1. **Lazy Loading**: Mermaid library loaded on first use
   ```typescript
   mermaid ??= (await import("mermaid")).default;
   ```

2. **Debounced Rendering**: 250ms delay prevents excessive renders during typing
   ```typescript
   this._rendererFunc = debounce<RendererFunc>(this.renderImmediately, 250);
   ```

3. **SVG Caching**: Rendered diagrams cached by theme + content
   ```typescript
   const cacheKey = `${isDark ? "dark" : "light"}-${text}`;
   ```

4. **Decoration Reuse**: Renderers reused when blocks move
   ```typescript
   const renderer: MermaidRenderer =
     bestDecoration?.spec?.renderer ?? new MermaidRenderer(editor);
   ```

5. **Off-Screen Rendering**: Invisible diagrams rendered off-screen
   ```typescript
   element.offsetParent === null ? renderElement : element
   ```

## Common Issues and Solutions

### Issue: Diagram Flickers During Typing

**Solution**: Debouncing (250ms) prevents re-renders on every keystroke.

### Issue: Diagram Doesn't Render in Collapsed Section

**Solution**: Off-screen rendering element allows Mermaid to render even when parent is hidden.

### Issue: Theme Change Doesn't Update Diagram

**Solution**: Plugin watches `transaction.getMeta("theme")` and forces re-render.

### Issue: Diagram Disappears After Undo

**Solution**: Decoration reuse finds the best overlapping decoration from previous state.

## Extension Points

To extend Mermaid functionality:

1. **Custom Themes**: Modify `mermaid.initialize()` theme config
2. **Custom Interactions**: Add handlers in `props.handleDOMEvents`
3. **Export Functionality**: Access `renderer.element.innerHTML` for SVG
4. **Custom Validation**: Add checks in `renderImmediately()` before rendering
5. **Loading States**: Add decorations or classes during async render

## References

- [Mermaid Documentation](https://mermaid.js.org/)
- [ProseMirror Plugin Guide](https://prosemirror.net/docs/guide/#state.plugins)
- [ProseMirror Decorations](https://prosemirror.net/docs/ref/#view.Decoration)
- [CodeFence Implementation](../shared/editor/nodes/CodeFence.ts)
- [Mermaid Plugin](../shared/editor/extensions/Mermaid.ts)
