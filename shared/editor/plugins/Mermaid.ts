import { Node } from "prosemirror-model";
import { Plugin, PluginKey, Transaction } from "prosemirror-state";
import { findBlockNodes } from "prosemirror-utils";
import { Decoration, DecorationSet } from "prosemirror-view";
import { v4 as uuidv4 } from "uuid";

type MermaidState = {
  decorationSet: DecorationSet;
  diagramVisibility: Record<number, boolean>;
  isDark: boolean;
};

function getNewState({
  doc,
  name,
  pluginState,
}: {
  doc: Node;
  name: string;
  pluginState: MermaidState;
}) {
  const decorations: Decoration[] = [];

  // Find all blocks that represent Mermaid diagrams
  const blocks: { node: Node; pos: number }[] = findBlockNodes(doc).filter(
    (item) =>
      item.node.type.name === name && item.node.attrs.language === "mermaidjs"
  );

  blocks.forEach((block) => {
    const diagramDecorationPos = block.pos + block.node.nodeSize;
    const existingDecorations = pluginState.decorationSet.find(
      block.pos,
      diagramDecorationPos
    );

    // Attempt to find the existing diagramId from the decoration, or assign
    // a new one if none exists yet.
    let diagramId = existingDecorations[0]?.spec["diagramId"];
    if (diagramId === undefined) {
      diagramId = uuidv4();
    }

    // Make the diagram visible by default if it contains source code
    if (pluginState.diagramVisibility[diagramId] === undefined) {
      pluginState.diagramVisibility[diagramId] = !!block.node.textContent;
    }

    const diagramDecoration = Decoration.widget(
      block.pos + block.node.nodeSize,
      () => {
        const diagramWrapper = document.createElement("div");
        diagramWrapper.classList.add("mermaid-diagram-wrapper");

        if (pluginState.diagramVisibility[diagramId] === false) {
          diagramWrapper.classList.add("diagram-hidden");
          return diagramWrapper;
        }

        import(
          /* webpackChunkName: "mermaid" */
          "mermaid"
        ).then((module) => {
          module.default.initialize({
            startOnLoad: true,
            flowchart: {
              htmlLabels: false,
            },
            // TODO: Make dynamic based on the width of the editor or remove in
            // the future if Mermaid is able to handle this automatically.
            gantt: {
              // @ts-expect-error types do not include this property.
              useWidth: 700,
            },
            theme: pluginState.isDark ? "dark" : "default",
            fontFamily: "inherit",
          });
          try {
            module.default.render(
              "mermaid-diagram-" + diagramId,
              block.node.textContent,
              (svgCode) => {
                diagramWrapper.innerHTML = svgCode;
              }
            );
          } catch (error) {
            console.log(error);
            const errorNode = document.getElementById(
              "d" + "mermaid-diagram-" + diagramId
            );
            if (errorNode) {
              diagramWrapper.appendChild(errorNode);
            }
          }
        });

        return diagramWrapper;
      },
      {
        diagramId,
      }
    );

    const attributes = { "data-diagram-id": "" + diagramId };
    if (pluginState.diagramVisibility[diagramId] !== false) {
      attributes["class"] = "code-hidden";
    }

    const diagramIdDecoration = Decoration.node(
      block.pos,
      block.pos + block.node.nodeSize,
      attributes,
      {
        diagramId,
      }
    );

    decorations.push(diagramDecoration);
    decorations.push(diagramIdDecoration);
  });

  return {
    decorationSet: DecorationSet.create(doc, decorations),
    diagramVisibility: pluginState.diagramVisibility,
    isDark: pluginState.isDark,
  };
}

export default function Mermaid({
  name,
  isDark,
}: {
  name: string;
  isDark: boolean;
}) {
  let diagramShown = false;

  return new Plugin({
    key: new PluginKey("mermaid"),
    state: {
      init: (_: Plugin, { doc }) => {
        const pluginState: MermaidState = {
          decorationSet: DecorationSet.create(doc, []),
          diagramVisibility: {},
          isDark,
        };
        return pluginState;
      },
      apply: (
        transaction: Transaction,
        pluginState: MermaidState,
        oldState,
        state
      ) => {
        const nodeName = state.selection.$head.parent.type.name;
        const previousNodeName = oldState.selection.$head.parent.type.name;
        const codeBlockChanged =
          transaction.docChanged && [nodeName, previousNodeName].includes(name);
        const ySyncEdit = !!transaction.getMeta("y-sync$");
        const mermaidMeta = transaction.getMeta("mermaid");
        const themeMeta = transaction.getMeta("theme");
        const diagramToggled = mermaidMeta?.toggleDiagram !== undefined;
        const themeToggled = themeMeta?.isDark !== undefined;

        if (themeToggled) {
          pluginState.isDark = themeMeta.isDark;
        }

        if (diagramToggled) {
          pluginState.diagramVisibility[
            mermaidMeta.toggleDiagram
          ] = !pluginState.diagramVisibility[mermaidMeta.toggleDiagram];
        }

        if (
          !diagramShown ||
          themeToggled ||
          codeBlockChanged ||
          diagramToggled ||
          ySyncEdit
        ) {
          diagramShown = true;
          return getNewState({
            doc: transaction.doc,
            name,
            pluginState,
          });
        }

        return {
          decorationSet: pluginState.decorationSet.map(
            transaction.mapping,
            transaction.doc
          ),
          diagramVisibility: pluginState.diagramVisibility,
          isDark: pluginState.isDark,
        };
      },
    },
    view: (view) => {
      if (!diagramShown) {
        // we don't draw diagrams on code blocks on the first render as part of mounting
        // as it's expensive (relative to the rest of the document). Instead let
        // it render without a diagram and then trigger a defered render of Mermaid
        // by updating the plugins metadata
        setTimeout(() => {
          view.dispatch(view.state.tr.setMeta("mermaid", { loaded: true }));
        }, 10);
      }

      return {};
    },
    props: {
      decorations(state) {
        return this.getState(state).decorationSet;
      },
    },
  });
}
