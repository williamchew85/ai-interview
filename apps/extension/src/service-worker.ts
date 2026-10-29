/** Phase 11.1/11.4: MV3 background service worker — relays keyboard commands. */
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { cmd: command }).catch(() => {});
    }
  });
});
