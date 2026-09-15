(() => {
  const current = document.currentScript;
  const url = current?.src ? new URL(current.src, location.href) : null;
  const restore = url?.searchParams.get('restore') === '1';

  if (restore) {
    if (window.__rakuNativeMutationObserver) {
      window.MutationObserver = window.__rakuNativeMutationObserver;
      delete window.__rakuNativeMutationObserver;
    }
    return;
  }

  if (window.__rakuNativeMutationObserver) return;

  const NativeMutationObserver = window.MutationObserver;
  window.__rakuNativeMutationObserver = NativeMutationObserver;

  window.MutationObserver = class RakuGuardedMutationObserver {
    constructor(callback) {
      this._target = null;
      this._options = null;
      this._running = false;
      this._observer = new NativeMutationObserver((records) => {
        if (this._running) return;

        this._running = true;
        this._observer.disconnect();
        try {
          callback(records, this);
        } finally {
          this._running = false;
          if (this._target && this._options) {
            this._observer.observe(this._target, this._options);
          }
        }
      });
    }

    observe(target, options) {
      this._target = target;
      this._options = options;
      this._observer.observe(target, options);
    }

    disconnect() {
      this._target = null;
      this._options = null;
      this._observer.disconnect();
    }

    takeRecords() {
      return this._observer.takeRecords();
    }
  };
})();