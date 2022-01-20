import { toggleMark } from "prosemirror-commands";
import { InputRule } from "prosemirror-inputrules";
import { MarkSpec, MarkType } from "prosemirror-model";
import { Command } from "../lib/Extension";
import markInputRule from "../lib/markInputRule";
import Mark from "./Mark";

export default class Italic extends Mark {
  get name() {
    return "em";
  }

  get schema(): MarkSpec {
    return {
      parseDOM: [{ tag: "i" }, { tag: "em" }],
      toDOM: () => ["em"],
    };
  }

  inputRules({ type }: { type: MarkType }): InputRule[] {
    return [
      markInputRule(/(?:^|[\s])(_([^_]+)_)$/, type),
      markInputRule(/(?:^|[^*])(\*([^*]+)\*)$/, type),
    ];
  }

  keys({ type }: { type: MarkType }): Record<string, Command> {
    return {
      "Mod-i": toggleMark(type),
      "Mod-I": toggleMark(type),
    };
  }

  toMarkdown() {
    return {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return { mark: "em" };
  }
}
