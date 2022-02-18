import { GapCursor } from "prosemirror-gapcursor";
import {
  Plugin,
  Selection,
  AllSelection,
  TextSelection,
  EditorState,
} from "prosemirror-state";
import Extension, { Command } from "../lib/Extension";
import isInCode from "../queries/isInCode";

export default class Keys extends Extension {
  get name() {
    return "keys";
  }

  keys(): Record<string, Command> {
    const onCancel = () => {
      if (this.options.onCancel) {
        this.options.onCancel();
        return true;
      }
      return false;
    };

    return {
      // No-ops prevent Tab escaping the editor bounds
      Tab: () => true,
      "Shift-Tab": () => true,

      // Shortcuts for when editor has separate edit mode
      "Mod-Escape": onCancel,
      "Shift-Escape": onCancel,
      "Mod-s": () => {
        if (this.options.onSave) {
          this.options.onSave();
          return true;
        }
        return false;
      },
      "Mod-Enter": (state: EditorState) => {
        if (!isInCode(state) && this.options.onSaveAndExit) {
          this.options.onSaveAndExit();
          return true;
        }
        return false;
      },
    };
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            blur: this.options.onBlur,
            focus: this.options.onFocus,
          },
          // we can't use the keys bindings for this as we want to preventDefault
          // on the original keyboard event when handled
          handleKeyDown: (view, event) => {
            if (view.state.selection instanceof AllSelection) {
              if (event.key === "ArrowUp") {
                const selection = Selection.atStart(view.state.doc);
                view.dispatch(view.state.tr.setSelection(selection));
                return true;
              }
              if (event.key === "ArrowDown") {
                const selection = Selection.atEnd(view.state.doc);
                view.dispatch(view.state.tr.setSelection(selection));
                return true;
              }
            }

            // edge case where horizontal gap cursor does nothing if Enter key
            // is pressed. Insert a newline and then move the cursor into it.
            if (view.state.selection instanceof GapCursor) {
              if (event.key === "Enter") {
                view.dispatch(
                  view.state.tr.insert(
                    view.state.selection.from,
                    view.state.schema.nodes.paragraph.create({})
                  )
                );
                view.dispatch(
                  view.state.tr.setSelection(
                    TextSelection.near(
                      view.state.doc.resolve(view.state.selection.from),
                      -1
                    )
                  )
                );
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  }
}
