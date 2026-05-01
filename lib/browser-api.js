// Minimal WebExtension browser.* compatibility layer for Chromium.
// Firefox already provides Promise-based browser APIs, so this only wraps chrome.*.
(function initBrowserApi(global) {
  if (global.browser && global.browser.runtime) {
    return;
  }

  const chromeApi = global.chrome;
  if (!chromeApi) {
    return;
  }

  function lastErrorMessage() {
    return chromeApi.runtime && chromeApi.runtime.lastError
      ? chromeApi.runtime.lastError.message
      : '';
  }

  function promisify(target, method) {
    return (...args) => new Promise((resolve, reject) => {
      try {
        target[method](...args, (result) => {
          const message = lastErrorMessage();
          if (message) {
            reject(new Error(message));
            return;
          }
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function copyMethods(source, names) {
    const target = {};
    for (const name of names) {
      if (source && typeof source[name] === 'function') {
        target[name] = promisify(source, name);
      }
    }
    return target;
  }

  const actionApi = chromeApi.action || chromeApi.browserAction;

  const browserApi = {
    runtime: {
      connectNative: (...args) => chromeApi.runtime.connectNative(...args),
      getURL: (...args) => chromeApi.runtime.getURL(...args),
      sendMessage: promisify(chromeApi.runtime, 'sendMessage'),
      onInstalled: chromeApi.runtime.onInstalled,
      onMessage: chromeApi.runtime.onMessage,
      onStartup: chromeApi.runtime.onStartup
    },
    tabs: {
      ...copyMethods(chromeApi.tabs, ['query', 'sendMessage', 'get', 'create', 'update']),
      onRemoved: chromeApi.tabs && chromeApi.tabs.onRemoved,
      onUpdated: chromeApi.tabs && chromeApi.tabs.onUpdated
    },
    storage: {
      local: copyMethods(chromeApi.storage && chromeApi.storage.local, ['get', 'set', 'remove', 'clear'])
    },
    downloads: {
      ...copyMethods(chromeApi.downloads, ['download', 'cancel', 'search', 'erase']),
      onChanged: chromeApi.downloads && chromeApi.downloads.onChanged
    },
    notifications: copyMethods(chromeApi.notifications, ['create', 'clear']),
    webRequest: chromeApi.webRequest,
    browserAction: actionApi
      ? copyMethods(actionApi, ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle', 'setIcon'])
      : undefined,
    action: actionApi
      ? copyMethods(actionApi, ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle', 'setIcon'])
      : undefined
  };

  Object.defineProperty(browserApi.runtime, 'lastError', {
    get() {
      return chromeApi.runtime.lastError;
    }
  });

  global.browser = browserApi;
})(globalThis);
