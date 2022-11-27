import {
  mathBackspaceCmd,
  insertMathCmd,
  makeInlineMathInputRule,
  REGEX_INLINE_MATH_DOLLARS,
  mathSchemaSpec,
} from "@benrbray/prosemirror-math";
import { PluginSimple } from "markdown-it";
import {
  chainCommands,
  deleteSelection,
  selectNodeBackward,
  joinBackward,
} from "prosemirror-commands";
import {
  NodeSpec,
  NodeType,
  Schema,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import MathPlugin from "../plugins/Math";
import mathRule from "../rules/math";
import { Dispatch } from "../types";
import Node from "./Node";

export default class Math extends Node {
  get name() {
    return "math_inline";
  }

  get schema(): NodeSpec {
    return mathSchemaSpec.nodes.math_inline;
  }

  commands({ type }: { type: NodeType }) {
    return () => (state: EditorState, dispatch: Dispatch) => {
      dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
      return true;
    };
  }

  inputRules({ schema }: { schema: Schema }) {
    return [
      makeInlineMathInputRule(
        REGEX_INLINE_MATH_DOLLARS,
        schema.nodes.math_inline
      ),
    ];
  }

  keys({ type }: { type: NodeType }) {
    return {
      "Mod-Space": insertMathCmd(type),
      Backspace: chainCommands(
        deleteSelection,
        mathBackspaceCmd,
        joinBackward,
        selectNodeBackward
      ),
    };
  }

  get plugins(): Plugin[] {
    return [MathPlugin];
  }

  get rulePlugins(): PluginSimple[] {
    return [mathRule];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("$");
    state.text(node.textContent, false);
    state.write("$");
  }

  parseMarkdown() {
    return {
      node: "math_inline",
      block: "math_inline",
      noCloseToken: true,
    };
  }
}
