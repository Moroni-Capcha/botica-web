import { describe, expect, it } from "vitest";
import { searchEscapeAction, shouldHandleShortcut, type ShortcutEventLike, type ShortcutState } from "./use-pos-shortcuts";

const ev = (over: Partial<ShortcutEventLike> = {}): ShortcutEventLike => ({ key: "F2", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...over });
const st = (over: Partial<ShortcutState> = {}): ShortcutState => ({ dialogOpen: false, canCharge: true, inEditable: false, inSearch: false, ...over });

describe("shouldHandleShortcut", () => {
  it("F2 enfoca el buscador desde cualquier parte, también desde el propio buscador", () => {
    expect(shouldHandleShortcut(ev(), st())).toBe("focus-search");
    expect(shouldHandleShortcut(ev(), st({ inEditable: true, inSearch: true }))).toBe("focus-search");
  });
  it("no actúa mientras se escribe en otro campo", () => {
    expect(shouldHandleShortcut(ev(), st({ inEditable: true }))).toBeNull();
    expect(shouldHandleShortcut(ev({ key: "Enter", ctrlKey: true }), st({ inEditable: true }))).toBeNull();
  });
  it("no actúa con un diálogo abierto", () => {
    expect(shouldHandleShortcut(ev(), st({ dialogOpen: true }))).toBeNull();
    expect(shouldHandleShortcut(ev({ key: "Enter", ctrlKey: true }), st({ dialogOpen: true }))).toBeNull();
  });
  it("ignora la composición de texto (IME)", () => {
    expect(shouldHandleShortcut(ev({ isComposing: true }), st())).toBeNull();
  });
  it("Ctrl+Enter (o Cmd+Enter) cobra solo si se puede cobrar", () => {
    expect(shouldHandleShortcut(ev({ key: "Enter", ctrlKey: true }), st({ inEditable: true, inSearch: true }))).toBe("pay");
    expect(shouldHandleShortcut(ev({ key: "Enter", metaKey: true }), st())).toBe("pay");
    expect(shouldHandleShortcut(ev({ key: "Enter", ctrlKey: true }), st({ canCharge: false }))).toBeNull();
  });
  it("Enter solo, F2 con modificadores y otras teclas se dejan pasar", () => {
    expect(shouldHandleShortcut(ev({ key: "Enter" }), st())).toBeNull();
    expect(shouldHandleShortcut(ev({ ctrlKey: true }), st())).toBeNull();
    expect(shouldHandleShortcut(ev({ key: "a" }), st())).toBeNull();
  });
});

describe("searchEscapeAction", () => {
  it("borra primero y suelta el foco después", () => {
    expect(searchEscapeAction("para")).toBe("clear");
    expect(searchEscapeAction("")).toBe("blur");
  });
});
