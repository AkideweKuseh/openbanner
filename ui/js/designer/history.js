/* ═══════════════════════════════════════════════════════════
   OpenBanner — History (Undo/Redo)
   ═══════════════════════════════════════════════════════════ */

const MAX_HISTORY = 50;

class History {
  constructor() {
    this.stack = [];
    this.index = -1;
    this.listeners = [];
  }

  /** Save a snapshot of the current state */
  push(state) {
    // Discard any future states (we're branching)
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(JSON.parse(JSON.stringify(state)));
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift();
    } else {
      this.index++;
    }
    this._notify();
  }

  /** Go back one step, returns the previous state or null */
  undo() {
    if (this.index <= 0) return null;
    this.index--;
    this._notify();
    return JSON.parse(JSON.stringify(this.stack[this.index]));
  }

  /** Go forward one step, returns the next state or null */
  redo() {
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    this._notify();
    return JSON.parse(JSON.stringify(this.stack[this.index]));
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }

  onChange(fn) {
    this.listeners.push(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn(this.canUndo, this.canRedo);
  }

  clear() {
    this.stack = [];
    this.index = -1;
    this._notify();
  }
}

export const history = new History();
