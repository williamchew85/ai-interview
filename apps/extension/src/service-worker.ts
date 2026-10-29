/** Phase 11.1/11.4 + 18.1: MV3 background service worker. */

// Relay configurable keyboard commands to the active tab's content script.
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { cmd: command }).catch(() => {});
    }
  });
});

// Screenshot capture for coding mode (Phase 18.1): the content script asks the
// worker to grab the visible tab (captureVisibleTab is background-only).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture-screenshot") {
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl: chrome.runtime.lastError ? null : dataUrl });
    });
    return true; // async response
  }
  return undefined;
});
