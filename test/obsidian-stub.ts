// Runtime stand-in for the `obsidian` module.
//
// The published package is types only: its `main` is an empty string and it
// ships nothing but .d.ts files. Anything that imports obsidian for values
// rather than types therefore cannot be loaded outside Obsidian itself, which
// is why vitest.config.ts aliases the module here. Type resolution is
// untouched, so tsc still checks src/ against the real typings.
//
// Only the surface src/settings.ts actually touches at runtime is stubbed.

import { FakeElement } from "./fake-element";

export const noticeMessages: string[] = [];

// ui.ts imports this for the expandable-stats chevron. Calls are recorded so
// tests can assert the chevron flips direction when a section is toggled.
export const setIconCalls: { icon: string }[] = [];

export function resetSetIconCalls(): void {
  setIconCalls.length = 0;
}

export function setIcon(_el: unknown, icon: string): void {
  setIconCalls.push({ icon });
}

export function resetNoticeMessages(): void {
  noticeMessages.length = 0;
}

export class Notice {
  constructor(message: string) {
    noticeMessages.push(message);
  }
}

export class PluginSettingTab {
  updateCount = 0;

  constructor(
    readonly app: unknown,
    plugin: unknown,
  ) {
    void plugin;
  }

  update(): void {
    this.updateCount += 1;
  }
}

/** A button inside a Setting row. Tests drive it with click(). */
export class ButtonComponent {
  text = "";
  isCta = false;
  private handler: (() => void) | undefined;

  setButtonText(text: string): this {
    this.text = text;
    return this;
  }

  setCta(): this {
    this.isCta = true;
    return this;
  }

  onClick(handler: () => void): this {
    this.handler = handler;
    return this;
  }

  click(): void {
    this.handler?.();
  }
}

/** A toggle inside a Setting row. Tests drive it with set(). */
export class ToggleComponent {
  value = false;
  private handler: ((value: boolean) => void) | undefined;

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  onChange(handler: (value: boolean) => void): this {
    this.handler = handler;
    return this;
  }

  set(value: boolean): void {
    this.value = value;
    this.handler?.(value);
  }
}

// Settings register themselves here in creation order so a test can reach the
// controls a modal built without threading references out of it.
export const createdSettings: Setting[] = [];

export function resetCreatedSettings(): void {
  createdSettings.length = 0;
}

export class Setting {
  name = "";
  desc = "";
  readonly buttons: ButtonComponent[] = [];
  readonly toggles: ToggleComponent[] = [];

  constructor(readonly containerEl: unknown) {
    createdSettings.push(this);
  }

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setDesc(desc: string): this {
    this.desc = desc;
    return this;
  }

  setHeading(): this {
    return this;
  }

  addButton(build: (button: ButtonComponent) => void): this {
    const button = new ButtonComponent();
    build(button);
    this.buttons.push(button);
    return this;
  }

  addToggle(build: (toggle: ToggleComponent) => void): this {
    const toggle = new ToggleComponent();
    build(toggle);
    this.toggles.push(toggle);
    return this;
  }

  /** Find a button by its label, so tests read as "click Cancel". */
  button(label: string): ButtonComponent | undefined {
    return this.buttons.find((candidate) => candidate.text === label);
  }
}

// Modals register themselves so a test can close one without a choice being
// made, which is how a user dismissing the dialog reaches onClose().
export const createdModals: Modal[] = [];

export function resetCreatedModals(): void {
  createdModals.length = 0;
}

export class Modal {
  readonly titleEl = new FakeElement("div");
  readonly contentEl = new FakeElement("div");
  isOpen = false;

  constructor(readonly app: unknown) {
    createdModals.push(this);
  }

  open(): void {
    this.isOpen = true;
    this.onOpen();
  }

  close(): void {
    this.isOpen = false;
    this.onClose();
  }

  onOpen(): void {
    // overridden by subclasses
  }

  onClose(): void {
    // overridden by subclasses
  }
}

export interface StubCommand {
  id: string;
  name: string;
  callback?: () => void;
}

export class Plugin {
  readonly commands: StubCommand[] = [];
  readonly settingTabs: unknown[] = [];
  savedData: unknown = null;

  constructor(
    readonly app: never,
    readonly manifest: unknown = {},
  ) {}

  addCommand(command: StubCommand): StubCommand {
    this.commands.push(command);
    return command;
  }

  addSettingTab(tab: unknown): void {
    this.settingTabs.push(tab);
  }

  loadData(): Promise<unknown> {
    return Promise.resolve(this.savedData);
  }

  saveData(data: unknown): Promise<void> {
    this.savedData = JSON.parse(JSON.stringify(data)) as unknown;
    return Promise.resolve();
  }
}
