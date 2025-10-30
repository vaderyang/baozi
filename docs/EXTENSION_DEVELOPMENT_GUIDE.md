# Extension Development Guide

This guide provides best practices and patterns for developing custom editor extensions similar to the Mermaid diagram extension. Use this as a reference when implementing new content types, interactive widgets, or language-specific features.

## Table of Contents

1. [Extension Types](#extension-types)
2. [When to Create Each Type](#when-to-create-each-type)
3. [Architecture Patterns](#architecture-patterns)
4. [Implementation Checklist](#implementation-checklist)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)
7. [Testing Guidelines](#testing-guidelines)
8. [Performance Considerations](#performance-considerations)

## Extension Types

The editor supports three main extension types:

### 1. Node Extensions

Nodes represent block-level or inline content with a defined structure.

**Base Class**: `Node` (extends `Extension`)

**Location**: `/shared/editor/nodes/YourNode.ts`

**Examples**:
- `CodeFence` - Block code with language selection
- `Image` - Inline/block images
- `Table` - Structured table content
- `Emoji` - Inline emoji elements

**When to use**:
- Content needs its own document structure
- Requires custom serialization to markdown
- Has specific parsing requirements
- Needs custom rendering or widgets

### 2. Mark Extensions

Marks represent inline formatting that can span across nodes.

**Base Class**: `Mark` (extends `Extension`)

**Location**: `/shared/editor/marks/YourMark.ts`

**Examples**:
- `Bold` - Text emphasis
- `Link` - Hyperlinks
- `Comment` - Inline comments
- `Highlight` - Text highlighting with colors

**When to use**:
- Formatting applies to text ranges
- Can overlap with other marks
- Doesn't break document structure
- Represents metadata or styling

### 3. Plugin Extensions

Pure extensions that add behavior without defining new content types.

**Base Class**: `Extension`

**Location**: `/shared/editor/extensions/YourExtension.ts`

**Examples**:
- `Mermaid` - Renders diagrams from code blocks
- `CodeHighlighting` - Syntax highlighting
- `TrailingNode` - Ensures document ends with paragraph
- `History` - Undo/redo functionality

**When to use**:
- Enhancing existing nodes/marks
- Adding editor-wide behavior
- Managing state or decorations
- Implementing custom interactions

## When to Create Each Type

### Create a Node when:
- ✅ You need a new content block (e.g., custom embed, callout)
- ✅ Content has specific attributes (e.g., language, URL, size)
- ✅ Requires custom rendering beyond text
- ✅ Has unique editing behavior
- ✅ Needs markdown representation

**Example**: A YouTube embed node
```typescript
export default class YouTubeEmbed extends Node {
  get name() { return "youtube_embed"; }
  
  get schema(): NodeSpec {
    return {
      attrs: { videoId: { default: "" } },
      group: "block",
      // ...
    };
  }
}
```

### Create a Mark when:
- ✅ Formatting applies to text selections
- ✅ Can span multiple text nodes
- ✅ Doesn't need to break inline content
- ✅ Represents styling or metadata

**Example**: A text color mark
```typescript
export default class TextColor extends Mark {
  get name() { return "text_color"; }
  
  get schema(): MarkSpec {
    return {
      attrs: { color: { default: "#000000" } },
      // ...
    };
  }
}
```

### Create a Plugin Extension when:
- ✅ Enhancing existing content types
- ✅ Adding decorations or widgets
- ✅ Managing global editor state
- ✅ Handling custom events or interactions

**Example**: A diagram renderer plugin (like Mermaid)
```typescript
export default function DiagramRenderer({ name, editor }) {
  return new Plugin({
    key: new PluginKey("diagram-renderer"),
    state: { /* ... */ },
    props: { /* ... */ },
  });
}
```

## Architecture Patterns

### Pattern 1: Plugin + Node Combination (Mermaid Pattern)

**Use case**: Rendering interactive content from text-based source

**Structure**:
```
Node (CodeFence)
├── Defines schema
├── Handles markdown I/O
└── Registers plugin

Plugin (Mermaid)
├── Finds relevant nodes
├── Creates decorations
├── Renders widgets
└── Handles interactions
```

**Example**:
```typescript
// In CodeFence.ts
class CodeFence extends Node {
  get plugins() {
    return [
      Mermaid({
        name: this.name,
        isDark: this.editor.props.theme.isDark,
        editor: this.editor,
      }),
    ];
  }
}

// In Mermaid.ts
export default function Mermaid({ name, isDark, editor }) {
  return new Plugin({
    state: {
      init: (_, { doc }) => {
        // Find and decorate nodes
      },
      apply: (tr, state) => {
        // Update on changes
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorationSet;
      },
    },
  });
}
```

**When to use**:
- Visual rendering from text source
- Complex interactive elements
- Async rendering required
- Need to hide source in read-only mode

### Pattern 2: Standalone Node

**Use case**: Self-contained content blocks

**Structure**:
```
Node
├── Schema definition
├── Commands
├── Keyboard shortcuts
├── Input rules
└── Markdown serialization
```

**Example**:
```typescript
export default class Callout extends Node {
  get name() { return "callout"; }
  
  get schema(): NodeSpec {
    return {
      attrs: {
        style: { default: "info" },
      },
      content: "block+",
      group: "block",
      parseDOM: [/* ... */],
      toDOM: (node) => [/* ... */],
    };
  }
  
  commands({ type, schema }) {
    return {
      createCallout: (attrs) => toggleBlockType(type, schema.nodes.paragraph, attrs),
    };
  }
  
  toMarkdown(state, node) {
    // Serialize to markdown
  }
  
  parseMarkdown() {
    return { block: "callout", getAttrs: (tok) => ({ /* ... */ }) };
  }
}
```

### Pattern 3: Decoration-Based Widget

**Use case**: Adding UI elements without changing document structure

**Structure**:
```
Plugin
├── Plugin state
├── Widget creation
├── Decoration management
└── Event handling
```

**Example** (inspired by Mermaid):
```typescript
class WidgetRenderer {
  readonly element: HTMLElement;
  
  constructor() {
    this.element = document.createElement("div");
    this.element.classList.add("custom-widget");
  }
  
  async render(content: string) {
    // Render widget content
    this.element.innerHTML = await renderContent(content);
  }
}

export default function CustomWidget({ name }) {
  return new Plugin({
    state: {
      init: (_, { doc }) => {
        const decorations = [];
        // Find nodes and create widgets
        const blocks = findBlockNodes(doc).filter(/* ... */);
        
        blocks.forEach((block) => {
          const renderer = new WidgetRenderer();
          const decoration = Decoration.widget(
            block.pos + block.node.nodeSize,
            () => {
              void renderer.render(block.node.textContent);
              return renderer.element;
            }
          );
          decorations.push(decoration);
        });
        
        return DecorationSet.create(doc, decorations);
      },
      apply: (tr, decorationSet) => {
        // Update decorations
        return decorationSet.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
```

## Implementation Checklist

### For Node Extensions

- [ ] **Schema Definition**
  - [ ] Define attributes with defaults
  - [ ] Specify content model
  - [ ] Set group (block/inline)
  - [ ] Add parseDOM rules
  - [ ] Add toDOM function

- [ ] **Commands**
  - [ ] Create/toggle command
  - [ ] Update attributes command
  - [ ] Delete command (if needed)

- [ ] **Keyboard Shortcuts**
  - [ ] Add to `keys()` method
  - [ ] Document in user guide

- [ ] **Input Rules**
  - [ ] Markdown-style shortcuts
  - [ ] Auto-formatting rules

- [ ] **Markdown I/O**
  - [ ] Implement `toMarkdown()`
  - [ ] Implement `parseMarkdown()`
  - [ ] Test round-trip conversion

- [ ] **Styling**
  - [ ] Add CSS to `Styles.ts`
  - [ ] Support light/dark themes
  - [ ] Responsive design

- [ ] **Testing**
  - [ ] Unit tests for commands
  - [ ] Integration tests for editing
  - [ ] Markdown parsing tests

### For Mark Extensions

- [ ] **Schema Definition**
  - [ ] Define attributes
  - [ ] Set inclusive/exclusive behavior
  - [ ] Add parseDOM rules
  - [ ] Add toDOM function
  - [ ] Configure excludes (if needed)

- [ ] **Toggle Command**
  - [ ] Implement in `commands()`
  - [ ] Handle nested marks

- [ ] **Input Rules**
  - [ ] Markdown shortcuts (e.g., `**bold**`)

- [ ] **Markdown I/O**
  - [ ] Define open/close tokens
  - [ ] Set mixable property
  - [ ] Handle whitespace

- [ ] **Styling**
  - [ ] CSS for mark appearance
  - [ ] Hover/active states

### For Plugin Extensions

- [ ] **Plugin State**
  - [ ] Define state type
  - [ ] Implement `init()`
  - [ ] Implement `apply()`

- [ ] **Props**
  - [ ] Decorations (if needed)
  - [ ] DOM event handlers
  - [ ] Node views (if needed)

- [ ] **Event Handling**
  - [ ] Mouse events
  - [ ] Keyboard events
  - [ ] Custom interactions

- [ ] **Performance**
  - [ ] Debouncing/throttling
  - [ ] Caching
  - [ ] Lazy loading

- [ ] **Testing**
  - [ ] State transitions
  - [ ] Event handling
  - [ ] Edge cases

## Best Practices

### 1. State Management

**✅ DO: Use plugin state for decorations**
```typescript
state: {
  init: (_, { doc }) => ({
    decorationSet: DecorationSet.create(doc, []),
    customData: {},
  }),
  apply: (tr, state) => {
    if (tr.docChanged) {
      // Update decorations
    }
    return state;
  },
}
```

**❌ DON'T: Store state in closures**
```typescript
// Bad: State lost on hot reload
let globalState = {};

return new Plugin({
  view: () => {
    globalState = {}; // Anti-pattern
  },
});
```

### 2. Decoration Reuse (Mermaid Pattern)

**✅ DO: Reuse decorations across updates**
```typescript
// Find best matching decoration from previous state
const existingDecorations = pluginState.decorationSet.find(
  block.pos,
  block.pos + block.node.nodeSize,
  (spec) => !!spec.id
);

const renderer = existingDecorations[0]?.spec?.renderer 
  ?? new Renderer();
```

**Why**: Prevents flickering, preserves cached data, maintains widget state

### 3. Async Operations

**✅ DO: Handle async rendering safely**
```typescript
class Renderer {
  private currentContent = "";
  
  async render(content: string) {
    // Avoid rendering same content twice
    if (this.currentContent === content) {
      return;
    }
    
    try {
      const result = await externalLibrary.render(content);
      this.element.innerHTML = result;
      this.currentContent = content;
    } catch (error) {
      this.element.classList.add("error");
      this.element.textContent = error.message;
    }
  }
}
```

**✅ DO: Debounce expensive operations**
```typescript
get render() {
  if (!this._renderFunc) {
    this._renderFunc = debounce(this.renderImmediately, 250);
  }
  return this._renderFunc;
}
```

### 4. Performance Optimization

**✅ DO: Cache computed results**
```typescript
class Cache {
  private static data = new Map<string, string>();
  private static maxSize = 20;
  
  static get(key: string) {
    return this.data.get(key);
  }
  
  static set(key: string, value: string) {
    this.data.set(key, value);
    if (this.data.size > this.maxSize) {
      // LRU eviction
      this.data.delete(this.data.keys().next().value);
    }
  }
}
```

**✅ DO: Lazy load heavy dependencies**
```typescript
let library;

async function getLibrary() {
  if (!library) {
    library = (await import("heavy-library")).default;
  }
  return library;
}
```

### 5. Theme Support

**✅ DO: Watch theme changes**
```typescript
apply: (tr, state) => {
  const themeMeta = tr.getMeta("theme");
  if (themeMeta?.isDark !== undefined) {
    // Re-render with new theme
    return getNewState({ ...state, isDark: themeMeta.isDark });
  }
  return state;
}
```

**✅ DO: Use theme-aware styling**
```typescript
const element = document.createElement("div");
element.style.color = isDark ? "#ffffff" : "#000000";

// Or use CSS variables
element.style.color = "var(--theme-text)";
```

### 6. Error Handling

**✅ DO: Provide user-friendly error messages**
```typescript
try {
  await render(content);
} catch (error) {
  if (content.trim().length === 0) {
    element.textContent = "Empty content";
    element.classList.add("empty");
  } else {
    element.textContent = `Error: ${error.message}`;
    element.classList.add("error");
  }
}
```

**✅ DO: Handle edge cases gracefully**
```typescript
// Check if element is visible before rendering
if (element.offsetParent === null) {
  // Render off-screen for hidden elements
  const offScreenElement = createOffScreenElement();
  await renderTo(offScreenElement);
}
```

### 7. Accessibility

**✅ DO: Add ARIA labels**
```typescript
toDOM: (node) => [
  "div",
  {
    role: "img",
    "aria-label": node.attrs.alt || "Diagram",
    class: "diagram-wrapper",
  },
  // ...
]
```

**✅ DO: Support keyboard navigation**
```typescript
props: {
  handleDOMEvents: {
    keydown(view, event) {
      if (event.key === "Enter") {
        // Activate/edit
        return true;
      }
      if (event.key === "Escape") {
        // Deactivate
        return true;
      }
      return false;
    },
  },
}
```

### 8. Collaborative Editing

**✅ DO: Handle remote transactions**
```typescript
apply: (tr, state) => {
  const isRemote = tr.getMeta("y-sync$");
  
  if (isRemote || tr.docChanged) {
    // Rebuild decorations for remote changes
    return getNewState(tr.doc, state);
  }
  
  // Just map decorations for local changes
  return {
    ...state,
    decorationSet: state.decorationSet.map(tr.mapping, tr.doc),
  };
}
```

### 9. Testing

**✅ DO: Test document transformations**
```typescript
test("creates code fence from input rule", () => {
  const { state, dispatch } = createEditor();
  
  // Type the trigger
  dispatch(state.tr.insertText("```"));
  
  // Verify code fence created
  expect(state.doc.firstChild.type.name).toBe("code_fence");
});
```

**✅ DO: Test markdown round-trip**
```typescript
test("serializes and parses correctly", () => {
  const markdown = "```mermaidjs\ngraph TD\n  A-->B\n```";
  const doc = parseMarkdown(markdown);
  const output = serializeMarkdown(doc);
  
  expect(output).toBe(markdown);
});
```

## Common Patterns

### Pattern: Conditional Decoration

Only show decorations when certain conditions are met:

```typescript
function getNewState(doc, pluginState) {
  const decorations = [];
  
  findBlockNodes(doc).forEach((block) => {
    // Only decorate if condition is met
    if (block.node.attrs.language === "special") {
      decorations.push(
        Decoration.widget(/* ... */)
      );
    }
  });
  
  return {
    ...pluginState,
    decorationSet: DecorationSet.create(doc, decorations),
  };
}
```

### Pattern: Multi-Decoration

Create multiple decorations for a single node:

```typescript
const decorations = [];

// Widget decoration (renders content)
decorations.push(
  Decoration.widget(pos + nodeSize, () => widget.element, {
    id: widget.id,
    widget,
  })
);

// Node decoration (marks the node)
decorations.push(
  Decoration.node(pos, pos + nodeSize, {}, {
    id: widget.id,
    widget,
  })
);

return DecorationSet.create(doc, decorations);
```

### Pattern: Off-Screen Rendering

Render content that may not be visible:

```typescript
async render(content: string) {
  const offScreen = document.createElement("div");
  offScreen.style.position = "absolute";
  offScreen.style.left = "-9999px";
  offScreen.style.top = "-9999px";
  document.body.appendChild(offScreen);
  
  try {
    const result = await library.render(content, offScreen);
    this.element.innerHTML = result;
  } finally {
    offScreen.remove();
  }
}
```

### Pattern: Language/Type Registration

Register custom languages or types:

```typescript
// In lib/code.ts or similar
export const customTypes: Record<string, CustomType> = {
  mytype: {
    name: "mytype",
    label: "My Custom Type",
    loader: () => import("./my-loader").then((m) => m.default),
  },
};
```

### Pattern: Widget Factory

Create widgets dynamically:

```typescript
class WidgetFactory {
  static create(type: string, props: any): HTMLElement {
    const element = document.createElement("div");
    element.classList.add(`widget-${type}`);
    
    switch (type) {
      case "diagram":
        return this.createDiagram(element, props);
      case "chart":
        return this.createChart(element, props);
      default:
        return element;
    }
  }
  
  private static createDiagram(element: HTMLElement, props: any) {
    // Setup diagram
    return element;
  }
}
```

### Pattern: Debounced State Updates

```typescript
class StateManager {
  private pendingUpdate: NodeJS.Timeout | null = null;
  
  scheduleUpdate(view: EditorView, update: () => void) {
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
    }
    
    this.pendingUpdate = setTimeout(() => {
      update();
      this.pendingUpdate = null;
    }, 250);
  }
}
```

## Testing Guidelines

### 1. Unit Tests

Test individual components:

```typescript
describe("Renderer", () => {
  it("caches rendered output", async () => {
    const renderer = new Renderer();
    await renderer.render("content");
    
    // Second render should use cache
    const spy = jest.spyOn(library, "render");
    await renderer.render("content");
    
    expect(spy).not.toHaveBeenCalled();
  });
  
  it("handles errors gracefully", async () => {
    const renderer = new Renderer();
    library.render.mockRejectedValue(new Error("Failed"));
    
    await renderer.render("bad content");
    
    expect(renderer.element.classList.contains("error")).toBe(true);
  });
});
```

### 2. Integration Tests

Test editor behavior:

```typescript
describe("Diagram Extension", () => {
  it("renders diagram below code block", () => {
    const editor = createEditor({
      content: "```diagram\ngraph TD\n  A-->B\n```",
    });
    
    const diagram = editor.element.querySelector(".diagram-wrapper");
    expect(diagram).toBeTruthy();
  });
  
  it("updates diagram when code changes", async () => {
    const editor = createEditor();
    editor.insertText("```diagram\ngraph TD\n");
    
    // Wait for debounced render
    await waitFor(() => {
      const diagram = editor.element.querySelector(".diagram-wrapper");
      expect(diagram).toBeTruthy();
    });
  });
});
```

### 3. Markdown Tests

Test serialization:

```typescript
describe("Markdown", () => {
  it("parses from markdown", () => {
    const doc = parseMarkdown("```diagram\ncontent\n```");
    expect(doc.firstChild.type.name).toBe("code_fence");
    expect(doc.firstChild.attrs.language).toBe("diagram");
  });
  
  it("serializes to markdown", () => {
    const doc = createDoc(/* ... */);
    const markdown = serializeMarkdown(doc);
    expect(markdown).toBe("```diagram\ncontent\n```");
  });
});
```

## Performance Considerations

### 1. Lazy Loading

**Load heavy libraries only when needed:**
```typescript
let library;

async function getLibrary() {
  if (!library) {
    library = await import("heavy-library");
    library.default.initialize(/* ... */);
  }
  return library.default;
}
```

### 2. Debouncing

**Prevent excessive updates:**
```typescript
// Good for: Rendering, API calls, expensive computations
const debouncedRender = debounce(render, 250);

// Good for: Scroll handlers, resize handlers
const throttledUpdate = throttle(update, 100);
```

### 3. Caching

**Cache expensive operations:**
```typescript
class SmartCache {
  private cache = new Map<string, { value: any; timestamp: number }>();
  private ttl = 60000; // 1 minute
  
  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  set(key: string, value: any) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }
}
```

### 4. Virtual Rendering

**Only render visible elements:**
```typescript
function shouldRender(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const viewHeight = window.innerHeight;
  
  // Add buffer for smooth scrolling
  const buffer = viewHeight * 0.5;
  
  return (
    rect.top < viewHeight + buffer &&
    rect.bottom > -buffer
  );
}
```

### 5. Decoration Efficiency

**Minimize decoration updates:**
```typescript
apply: (tr, state) => {
  // Only rebuild if necessary
  if (!tr.docChanged && !tr.getMeta("force-update")) {
    return {
      ...state,
      decorationSet: state.decorationSet.map(tr.mapping, tr.doc),
    };
  }
  
  // Full rebuild
  return getNewState(tr.doc, state);
}
```

## Common Pitfalls

### ❌ Pitfall 1: Not Handling Null States

```typescript
// Bad
const node = state.selection.$head.parent;
const pos = view.posAtDOM(element);  // May return null

// Good
const node = state.selection.$head.parent;
if (!node) return;

const pos = view.posAtDOM(element);
if (pos === null) return;
```

### ❌ Pitfall 2: Memory Leaks

```typescript
// Bad: Event listeners not cleaned up
view: (view) => ({
  update: (view) => {
    window.addEventListener("resize", handler);  // Leak!
  },
});

// Good: Cleanup in destroy
view: (view) => {
  const handler = () => { /* ... */ };
  window.addEventListener("resize", handler);
  
  return {
    destroy: () => {
      window.removeEventListener("resize", handler);
    },
  };
};
```

### ❌ Pitfall 3: Mutating Plugin State

```typescript
// Bad: Mutating state
apply: (tr, state) => {
  state.decorationSet = DecorationSet.create(/* ... */);  // Don't mutate!
  return state;
}

// Good: Return new state
apply: (tr, state) => {
  return {
    ...state,
    decorationSet: DecorationSet.create(/* ... */),
  };
}
```

### ❌ Pitfall 4: Synchronous Heavy Operations

```typescript
// Bad: Blocking render
Decoration.widget(pos, () => {
  const result = heavyComputation();  // Blocks UI!
  element.innerHTML = result;
  return element;
});

// Good: Async render
Decoration.widget(pos, () => {
  void (async () => {
    const result = await heavyComputation();
    element.innerHTML = result;
  })();
  return element;
});
```

## Resources

- **Mermaid Extension**: `/shared/editor/extensions/Mermaid.ts`
- **CodeFence Node**: `/shared/editor/nodes/CodeFence.ts`
- **Extension Base**: `/shared/editor/lib/Extension.ts`
- **Node Base**: `/shared/editor/nodes/Node.ts`
- **Mark Base**: `/shared/editor/marks/Mark.ts`
- **ProseMirror Docs**: https://prosemirror.net/docs/
- **Decoration Guide**: https://prosemirror.net/docs/ref/#view.Decoration

## Next Steps

1. **Plan Your Extension**
   - Define requirements
   - Choose extension type
   - Sketch architecture

2. **Implement Core Functionality**
   - Create base class
   - Define schema
   - Implement commands

3. **Add Interactivity**
   - Event handlers
   - Keyboard shortcuts
   - Visual feedback

4. **Polish**
   - Styling
   - Error handling
   - Performance optimization

5. **Test**
   - Unit tests
   - Integration tests
   - User testing

6. **Document**
   - Inline comments
   - User guide
   - API documentation

## Conclusion

Building editor extensions requires understanding ProseMirror's architecture and following established patterns. The Mermaid extension demonstrates many best practices:

- Clean separation of concerns (Node + Plugin)
- Efficient decoration management
- Performance optimization (caching, debouncing, lazy loading)
- Theme support
- Error handling
- Accessibility

Use this guide as a reference when building your own extensions, and don't hesitate to study existing implementations for inspiration!
