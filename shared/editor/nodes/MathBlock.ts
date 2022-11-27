import {
  makeBlockMathInputRule,
  REGEX_BLOCK_MATH_DOLLARS,
  mathSchemaSpec,
} from "@benrbray/prosemirror-math";
import { PluginSimple } from "markdown-it";
import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import mathRule from "../rules/math";
import { Dispatch } from "../types";
import Node from "./Node";

export default class MathBlock extends Node {
  get name() {
    return "math_block";
  }

  get schema(): NodeSpec {
    return mathSchemaSpec.nodes.math_display;
  }

  get rulePlugins(): PluginSimple[] {
    return [mathRule];
  }

  commands({ type }: { type: NodeType }) {
    return () => (state: EditorState, dispatch: Dispatch) => {
      dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
      return true;
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, type)];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("$$\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("$$");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      node: "math_block",
      block: "math_block",
      noCloseToken: true,
    };
  }
}
