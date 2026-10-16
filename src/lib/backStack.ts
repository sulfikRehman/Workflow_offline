// Makes the phone's Back button close the window or menu on top, instead of leaving the app.
//
// While at least one window is open, ONE extra history entry sits on top of the page. Pressing Back
// removes it, and the top window is closed instead of the app being left. When the last window
// closes in any other way (the X button, Escape, tapping outside), that extra entry is removed
// again, so Back behaves normally once nothing is open.

type Layer = { id: number; close: () => boolean | void };

const stack: Layer[] = [];
let nextId = 1;
let entryPushed = false; // our extra history entry is (believed to be) on top
let waitingForOwnBack = false; // we called history.back() ourselves and its popstate has not arrived
let listening = false;

function canUseHistory(): boolean {
  return typeof window !== 'undefined' && typeof window.history?.pushState === 'function';
}

function sync(): void {
  if (!canUseHistory() || waitingForOwnBack) return;
  const want = stack.length > 0;
  try {
    if (want && !entryPushed) {
      window.history.pushState({ hfBack: true }, '');
      entryPushed = true;
    } else if (!want && entryPushed) {
      waitingForOwnBack = true;
      entryPushed = false;
      window.history.back();
    }
  } catch {
    waitingForOwnBack = false; // history is not available here (some embedded views): Back just behaves as before
  }
}

function onPop(): void {
  if (waitingForOwnBack) {
    // That was our own history.back(): finish, then see whether a window opened in the meantime.
    waitingForOwnBack = false;
    sync();
    return;
  }
  // The person pressed Back: the extra entry is gone, so close the top window.
  entryPushed = false;
  const top = stack.pop();
  if (top) {
    let closed: boolean | void = true;
    try {
      closed = top.close();
    } catch {
      closed = true;
    }
    if (closed === false) stack.push(top); // it stayed open (for example, "Stop the timer?" was answered No)
  }
  sync();
}

/** Registers an open window. Returns a function that unregisters it when it closes some other way. */
export function addBackLayer(close: () => boolean | void): () => void {
  if (!canUseHistory()) return () => {};
  if (!listening) {
    window.addEventListener('popstate', onPop);
    listening = true;
  }
  const layer: Layer = { id: nextId++, close };
  stack.push(layer);
  sync();
  return () => {
    const i = stack.findIndex((l) => l.id === layer.id);
    if (i >= 0) stack.splice(i, 1);
    sync();
  };
}

/** For tests: how many windows are registered. */
export function backLayerCount(): number {
  return stack.length;
}
