# Adding a New Editor Node Tutorial

This tutorial walks through adding a new editor node to Outline, including both frontend and backend implementation. We'll use the audio transcription feature as a practical example.

## Overview

Editor nodes in Outline are ProseMirror nodes that provide rich content editing capabilities. Adding a new node involves:

1. **Backend**: API endpoints, data models, and processing logic
2. **Frontend**: React components, ProseMirror extensions, and UI integration
3. **Integration**: Connecting frontend and backend with proper data flow

## Prerequisites

- Familiarity with TypeScript, React, and Node.js
- Understanding of ProseMirror editor concepts
- Basic knowledge of Sequelize ORM and Koa.js

## Step 1: Define the Feature Requirements

Before coding, clearly define:

- **Purpose**: What does the node do? (e.g., audio transcription displays transcribed text with audio playback)
- **Data Structure**: What data needs to be stored? (e.g., transcription text, status, audio attachment)
- **User Interaction**: How do users create/use it? (e.g., slash command, modal dialog)
- **Backend Processing**: Any async processing needed? (e.g., transcription via OpenAI Whisper)

## Step 2: Backend Implementation

### 2.1 Create the Data Model

Create a new model file in `server/models/YourNode.ts`:

```typescript
import {
  Column,
  Table,
  ForeignKey,
  BelongsTo,
  DataType,
} from "sequelize-typescript";
import IdModel from "./base/IdModel";
import Document from "./Document";
import User from "./User";

@Table({ tableName: "your_nodes", modelName: "yourNode" })
export default class YourNode extends IdModel {
  @Column
  content: string;

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId: string;

  @BelongsTo(() => Document, "documentId")
  document: Document;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => User, "userId")
  user: User;
}
```

**Key Points:**

- Extend `IdModel` for standard ID/timestamp fields
- Define relationships to Document and User
- Use appropriate data types and constraints

### 2.2 Create Database Migration

Create migration file in `server/migrations/`:

```bash
sequelize migration:create --name add-your-nodes
```

Edit the migration:

```javascript
"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("your_nodes", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "documents",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("your_nodes");
  },
};
```

### 2.3 Export Model

Add to `server/models/index.ts`:

```typescript
export { default as YourNode } from "./YourNode";
```

### 2.4 Create API Routes

Create directory `server/routes/api/yourNodes/` with `index.ts` and `yourNodes.ts`.

**index.ts:**

```typescript
import Router from "koa-router";
import yourNodes from "./yourNodes";

const router = new Router();

router.use("/", yourNodes.routes());

export default router;
```

**yourNodes.ts:**

```typescript
import Router from "koa-router";
import { ValidationError, NotFoundError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { YourNode, Document } from "@server/models";
import { authorize } from "@server/policies";
import { presentYourNode } from "@server/presenters";
import { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

router.post(
  "yourNodes.create",
  auth(),
  validate(T.YourNodesCreateSchema),
  transaction(),
  async (ctx: APIContext<T.YourNodesCreateReq>) => {
    const { user } = ctx.state.auth;
    const { documentId, content } = ctx.input.body;

    const document = await Document.findByPk(documentId);
    if (!document) {
      throw NotFoundError("Document not found");
    }
    authorize(user, "update", document);

    const yourNode = await YourNode.create({
      content,
      documentId,
      userId: user.id,
    });

    ctx.body = {
      data: presentYourNode(yourNode),
      policies: [],
    };
  }
);

// Add other CRUD endpoints as needed...

export default router;
```

**Key Points:**

- Use standard Koa-Router patterns
- Include authentication and validation
- Handle authorization checks
- Return data via presenters

### 2.5 Create Schema Validation

Create `server/routes/api/yourNodes/schema.ts`:

```typescript
import { z } from "zod";

export const YourNodesCreateSchema = z.object({
  body: z.object({
    documentId: z.string().uuid(),
    content: z.string(),
  }),
});

export type YourNodesCreateReq = z.infer<typeof YourNodesCreateSchema>;
```

### 2.6 Create Presenter

Add to `server/presenters/index.ts`:

```typescript
export function presentYourNode(yourNode: YourNode): PublicYourNode {
  return {
    id: yourNode.id,
    content: yourNode.content,
    documentId: yourNode.documentId,
    createdAt: yourNode.createdAt,
    updatedAt: yourNode.updatedAt,
  };
}
```

Add types to `server/types.ts` or relevant type files.

### 2.7 Register API Routes

Add to `server/routes/api/index.ts`:

```typescript
import yourNodes from "./yourNodes";

// ... other imports

router.use("/", yourNodes.routes());
```

### 2.8 Add Queue (if async processing needed)

Create `server/queues/YourNodeQueue.ts`:

```typescript
import { createQueue } from "@server/queues/queue";

export const yourNodeQueue = createQueue("your_nodes", {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  timeout: 30000,
});

export default yourNodeQueue;
```

## Step 3: Frontend Implementation

### 3.1 Create Store

Create `app/stores/YourNodesStore.ts`:

```typescript
import { action } from "mobx";
import { client } from "~/utils/ApiClient";
import RootStore from "./RootStore";
import Store, { RPCAction } from "./base/Store";
import YourNode from "~/models/YourNode";

export default class YourNodesStore extends Store<YourNode> {
  actions = [RPCAction.Create, RPCAction.List, RPCAction.Delete];

  constructor(rootStore: RootStore) {
    super(rootStore, YourNode);
  }

  @action
  async createNode(documentId: string, content: string): Promise<YourNode> {
    const node = await this.create({
      documentId,
      content,
    });
    return node;
  }
}
```

**Key Points:**

- Extend base Store class for CRUD operations
- Define available actions
- Add custom methods as needed

### 3.2 Register Store

Add to `app/stores/index.ts`:

```typescript
export { default as yourNodes } from "./YourNodesStore";
```

Add to RootStore and hook up in `app/index.tsx`.

### 3.3 Create Model

Create `app/models/YourNode.ts`:

```typescript
import { attr, belongsTo } from "spraypaint";
import Document from "./Document";
import User from "./User";
import BaseModel from "./base/BaseModel";

export default class YourNode extends BaseModel {
  static jsonapiType = "your_nodes";

  @attr() content: string;
  @attr() documentId: string;
  @attr() userId: string;

  @belongsTo() document: Document;
  @belongsTo() user: User;
}
```

### 3.4 Create React Component

Create `app/components/YourNode.tsx`:

```typescript
import * as React from "react";
import { observer } from "mobx-react";
import YourNode from "~/models/YourNode";

type Props = {
  node: YourNode;
  isSelected: boolean;
  isEditable: boolean;
};

function YourNodeComponent({ node, isSelected, isEditable }: Props) {
  return (
    <div
      className={`your-node ${isSelected ? "selected" : ""}`}
      contentEditable={isEditable}
    >
      <div className="content">{node.content}</div>
    </div>
  );
}

export default observer(YourNodeComponent);
```

### 3.5 Create ProseMirror Node

Create `app/editor/extensions/YourNode.ts`:

```typescript
import { Node } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import YourNodeComponent from "~/components/YourNode";
import { YourNode } from "~/models";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    yourNode: {
      insertYourNode: (attributes: { id: string }) => ReturnType;
    };
  }
}

export const YourNodeExtension = Node.create({
  name: "yourNode",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='your-node']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "your-node", ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YourNodeComponent);
  },

  addCommands() {
    return {
      insertYourNode:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            // Add decorations as needed
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
```

### 3.6 Add to Editor

Add to `app/editor/index.tsx`:

```typescript
import { YourNodeExtension } from "./extensions/YourNode";

// ... in extensions array
YourNodeExtension,
```

### 3.7 Add Slash Command

Slash commands allow users to quickly insert nodes by typing `/` followed by keywords. Here's how to add a slash command for your node:

#### Step 1: Add to Block Menu

Add to `app/editor/menus/block.tsx`:

```typescript
{
  name: "your_node",
  title: dictionary.yourNode, // Add to translations
  keywords: "your node custom block",
  icon: <YourNodeIcon />, // Add icon component
  attrs: {}, // Any default attributes for the node
},
```

**Key Points:**

- `name`: Unique identifier, used in BlockMenu.tsx to handle selection
- `title`: Display name from translations
- `keywords`: Search terms users can type after `/`
- `icon`: React component for the menu icon
- `attrs`: Default attributes passed to the node

#### Step 2: Handle Command Selection

In `app/editor/components/BlockMenu.tsx`, add handling for your command:

```typescript
import YourNodeModal from "~/scenes/YourNodeModal"; // If using modal

// In BlockMenu component
const [showYourNodeModal, setShowYourNodeModal] = React.useState(false);

const handleSelect = React.useCallback(
  (item: MenuItem) => {
    if (item.name === "your_node") {
      // Option 1: Direct insertion (for simple nodes)
      editor.commands.insertYourNode({
        id: "temp-id", // Generate or use placeholder
        // other attrs...
      });
    }

    // Option 2: Open modal for complex nodes
    if (item.name === "your_node") {
      setShowYourNodeModal(true);
    }

    // Close menu
    setBlockMenuOpen(false);
  },
  [editor]
);

// Render modal
{showYourNodeModal && (
  <YourNodeModal
    onRequestClose={() => setShowYourNodeModal(false)}
    onCreate={handleNodeCreate}
  />
)}
```

#### Step 3: Implement Node Creation Handler

```typescript
const handleNodeCreate = React.useCallback(
  async (content: string) => {
    try {
      // Create node via API
      const node = await rootStore.yourNodes.createNode(documentId, content);

      // Insert into editor
      editor.commands.insertYourNode({
        id: node.id,
        // other attributes...
      });

      // Update placeholder if needed
      // editor.commands.updateAttributes("yourNode", { id: node.id });
    } catch (error) {
      // Handle error
      toast.error("Failed to create node");
    }
  },
  [editor, documentId, rootStore.yourNodes]
);
```

#### Step 4: Add Icon Component

Create `app/components/icons/YourNodeIcon.tsx`:

```typescript
import * as React from "react";
import { IconProps } from "~/components/Icon";

function YourNodeIcon({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Your SVG path */}
      <path d="..." fill={color} />
    </svg>
  );
}

export default YourNodeIcon;
```

#### Advanced: Dynamic Slash Commands

For commands that need document context or user permissions:

```typescript
// In block.tsx, make commands dynamic
export default function blockMenuItems(
  dictionary: ReturnType<typeof useDictionary>,
  documentId?: string,
  userCanCreate?: boolean
): MenuItem[] {
  const items: MenuItem[] = [
    // ... other items
  ];

  if (userCanCreate && documentId) {
    items.push({
      name: "your_node",
      title: dictionary.yourNode,
      keywords: "your node custom",
      icon: <YourNodeIcon />,
      attrs: { documentId }, // Pass context
    });
  }

  return items;
}
```

#### Testing Slash Commands

1. Open a document in edit mode
2. Type `/` to open the slash menu
3. Type your keywords (e.g., "your", "node")
4. Select your command
5. Verify the node is inserted correctly

**Common Issues:**

- Command not appearing: Check keywords match user input
- Modal not opening: Verify `handleSelect` handles your `name`
- Node not inserting: Ensure `insertYourNode` command is defined in your extension

### 3.8 Add Translation

Add to `shared/i18n/locales/en_US/translation.json`:

```json
{
  "Your Node": "Your Node"
}
```

And in `app/hooks/useDictionary.ts`:

```typescript
yourNode: t("Your Node"),
```

### 3.9 Create Modal/Scene (if needed)

Create `app/scenes/YourNodeModal.tsx` for node creation/editing:

```typescript
import * as React from "react";
import { observer } from "mobx-react";
import Modal from "~/components/Modal";
import Button from "~/components/Button";

type Props = {
  onRequestClose: () => void;
  onCreate: (content: string) => void;
};

function YourNodeModal({ onRequestClose, onCreate }: Props) {
  const [content, setContent] = React.useState("");

  const handleSubmit = () => {
    onCreate(content);
    onRequestClose();
  };

  return (
    <Modal title="Create Your Node" onRequestClose={onRequestClose}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter content..."
      />
      <Button onClick={handleSubmit}>Create</Button>
    </Modal>
  );
}

export default observer(YourNodeModal);
```

## Step 4: Integration & Testing

### 4.1 Connect Slash Command to Modal

In `app/editor/components/BlockMenu.tsx`, handle the command:

```typescript
if (item.name === "your_node") {
  setShowYourNodeModal(true);
}
```

### 4.2 Handle Node Creation

In the modal's onCreate callback:

```typescript
const handleCreate = async (content: string) => {
  const node = await rootStore.yourNodes.createNode(documentId, content);
  // Insert into editor
  editor.commands.insertYourNode({ id: node.id });
};
```

### 4.3 Add Tests

Create tests for:

- API endpoints (`server/routes/api/yourNodes/yourNodes.test.ts`)
- Store methods (`app/stores/__tests__/YourNodesStore.test.ts`)
- Component rendering (`app/components/__tests__/YourNode.test.tsx`)

### 4.4 Run Migrations

```bash
yarn db:migrate
```

### 4.5 Test End-to-End

1. Start development server: `yarn dev:watch`
2. Navigate to a document
3. Use slash command `/your` to create node
4. Verify data is saved and displayed correctly

## Step 5: Best Practices

- **Error Handling**: Always handle API errors gracefully
- **Loading States**: Show loading indicators for async operations
- **Authorization**: Check permissions on both frontend and backend
- **Validation**: Validate data on both client and server
- **Accessibility**: Ensure components are keyboard navigable
- **Performance**: Lazy load heavy components
- **Documentation**: Document API endpoints and component props

## Common Pitfalls

1. **Route Registration**: Ensure routes are properly registered in `api/index.ts`
2. **Model Relationships**: Set up foreign keys and relationships correctly
3. **Editor Integration**: Make sure extensions are added to the editor config
4. **Store Registration**: Register stores in RootStore and provide via context
5. **Migration Order**: Run migrations before testing

## Example: Audio Transcription Feature

The audio transcription feature follows this pattern:

- **Backend**: Transcription model, API routes, OpenAI processing queue
- **Frontend**: AudioRecorder component, AudioTranscription ProseMirror node, slash command
- **Integration**: Modal for recording, automatic transcription insertion

This tutorial provides a comprehensive guide for adding new editor nodes. Adapt the specifics based on your feature requirements.
