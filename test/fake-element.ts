// Minimal stand-in for the HTMLElement that Obsidian hands to rendering code.
//
// createEl, createDiv, and createSpan are Obsidian's own additions to
// HTMLElement, not standard DOM, so jsdom alone would not provide them. This
// records the tree instead of building one, which is enough to assert the
// structure a renderer produces.

export interface FakeElementOptions {
  cls?: string;
  text?: string;
}

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  open = false;

  constructor(
    readonly tag: string,
    readonly cls: string | undefined = undefined,
    public text: string | undefined = undefined,
  ) {}

  /** Obsidian's HTMLElement.empty(), used by every modal on open and close. */
  empty(): void {
    this.children.length = 0;
  }

  /** Obsidian's HTMLElement.setText(), used for modal titles. */
  setText(text: string): void {
    this.text = text;
  }

  createEl(tag: string, options: FakeElementOptions = {}): FakeElement {
    const child = new FakeElement(tag, options.cls, options.text);
    this.children.push(child);
    return child;
  }

  createDiv(options: FakeElementOptions = {}): FakeElement {
    return this.createEl("div", options);
  }

  createSpan(options: FakeElementOptions = {}): FakeElement {
    return this.createEl("span", options);
  }

  addEventListener(event: string, handler: () => void): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(handler);
    this.listeners.set(event, existing);
  }

  /** Fire the handlers registered for an event, the way the browser would. */
  dispatch(event: string): void {
    for (const handler of this.listeners.get(event) ?? []) {
      handler();
    }
  }

  /** Every descendant, depth first, for structural assertions. */
  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  textOf(tag: string): (string | undefined)[] {
    return this.descendants()
      .filter((node) => node.tag === tag)
      .map((node) => node.text);
  }
}

/**
 * Hand a fake to code typed against Obsidian's HTMLElement. The cast is
 * confined here so tests read cleanly and there is one place to look when the
 * fake needs to grow another method.
 */
export function asContainer(element: FakeElement): HTMLElement {
  return element as unknown as HTMLElement;
}
