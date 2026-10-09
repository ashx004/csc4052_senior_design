import { Extension, Mark, mergeAttributes, wrappingInputRule, type Editor } from "@tiptap/core";
import Italic from "@tiptap/extension-italic";
import { BulletList } from "@tiptap/extension-list";

/** Italic only from the toolbar / Ctrl+I. TipTap's default also italicizes
 *  anything typed between asterisks or underscores, which fires while typing
 *  ordinary text ("5 * 3", "snake_case_name"). */
export const ToolbarItalic = Italic.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
});

export type DashMarker = "dash" | "dot";

/** Bullet list with a `marker` attribute: "- " makes a dash list, "* " or
 *  "+ " a dotted bullet list. Nested levels get their own markers in CSS. */
export const NoteBulletList = BulletList.extend({
  addAttributes() {
    return {
      marker: {
        default: "dash" as DashMarker,
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-marker") === "dot" ? "dot" : "dash"),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-marker": attrs.marker === "dot" ? "dot" : "dash" }),
      },
    };
  },
  addInputRules() {
    return [
      wrappingInputRule({ find: /^\s*-\s$/, type: this.type, getAttributes: () => ({ marker: "dash" }) }),
      wrappingInputRule({ find: /^\s*[*+•]\s$/, type: this.type, getAttributes: () => ({ marker: "dot" }) }),
    ];
  },
});

/** Highlighted text, like a marker pen. The color is one of the highlighter
 *  palette names; the styles live in global.css so they follow the theme. */
export const TextHighlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-color") || "yellow",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-color": String(attrs.color || "yellow") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },
});

export const MAX_INDENT = 8;

const LIST_ITEMS = ["listItem", "taskItem"] as const;

/** Tab: nests a list item; indents a paragraph when the cursor is at its
 *  start (or text is selected); otherwise inserts a real tab. */
export function indentMore(editor: Editor): boolean {
  const list = LIST_ITEMS.find((name) => editor.isActive(name));
  if (list) {
    editor.commands.sinkListItem(list);
    return true;
  }
  const { selection } = editor.state;
  const parent = selection.$from.parent;
  if (parent.type.name === "codeBlock") return editor.commands.insertContent("  ");
  const atStart = selection.empty && selection.$from.parentOffset === 0;
  if ((atStart || !selection.empty) && (parent.type.name === "paragraph" || parent.type.name === "heading")) {
    const level = Math.min(MAX_INDENT, (Number(parent.attrs.indent) || 0) + 1);
    return editor.chain().updateAttributes(parent.type.name, { indent: level }).run();
  }
  return editor.commands.insertContent("\t");
}

/** Shift+Tab: the reverse - un-nest, un-indent, or remove a tab before the cursor. */
export function indentLess(editor: Editor): boolean {
  const list = LIST_ITEMS.find((name) => editor.isActive(name));
  if (list) {
    editor.commands.liftListItem(list);
    return true;
  }
  const { selection } = editor.state;
  const parent = selection.$from.parent;
  const level = Number(parent.attrs.indent) || 0;
  if (level > 0) return editor.chain().updateAttributes(parent.type.name, { indent: level - 1 }).run();
  const before = editor.state.doc.textBetween(Math.max(0, selection.from - 1), selection.from);
  if (selection.empty && (before === "\t" || (parent.type.name === "codeBlock" && before === " "))) {
    editor.view.dispatch(editor.state.tr.delete(selection.from - 1, selection.from));
  }
  return true;
}

/** Tab / Shift+Tab work on all text, not just lists. Escape leaves the
 *  editor so keyboard users are never trapped by the Tab key. */
export const TabIndent = Extension.create({
  name: "tabIndent",
  priority: 1000,

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el: HTMLElement) => Math.min(MAX_INDENT, Number(el.getAttribute("data-indent")) || 0),
            renderHTML: (attrs: Record<string, unknown>) => {
              const level = Number(attrs.indent) || 0;
              return level > 0 ? { "data-indent": String(level), style: `margin-left:${level * 32}px` } : {};
            },
          },
        },
      },
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        indentMore(this.editor);
        return true;
      },
      "Shift-Tab": () => {
        indentLess(this.editor);
        return true;
      },
      Escape: () => {
        this.editor.commands.blur();
        return true;
      },
    };
  },
});
