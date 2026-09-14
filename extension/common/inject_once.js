(() => {
  // extension/src/common/inject_once/index.js
  async function ynInjectOnce(tabId, files, sentinel, allFrames) {
    const target = { tabId, allFrames: allFrames === true };
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (name, wanted) => {
        globalThis.__ynInjected = globalThis.__ynInjected || [];
        return {
          hasSentinel: typeof globalThis[name] === "function",
          missing: wanted.filter((f) => !globalThis.__ynInjected.includes(f))
        };
      },
      args: [sentinel, files]
    });
    const result = probe && probe.result;
    if (result && result.hasSentinel && !(result.missing || []).length) return;
    const todo = result && result.missing ? result.missing : files;
    if (!todo.length) return;
    await chrome.scripting.executeScript({ target, files: todo });
    await chrome.scripting.executeScript({
      target,
      func: (done) => {
        globalThis.__ynInjected = globalThis.__ynInjected || [];
        for (const f of done) {
          if (!globalThis.__ynInjected.includes(f))
            globalThis.__ynInjected.push(f);
        }
      },
      args: [todo]
    });
  }
  var YN_CAPTURE_FILES = [
    "common/api.js",
    "common/challenge_detect.js",
    "content/capture.js"
  ];
  var YN_LIVENESS_HOSTS = /^https:\/\/(uk\.indeed\.com|www\.indeed\.com|www\.linkedin\.com)\//i;
  var YN_LIVENESS_FILES = [
    "common/api.js",
    "common/challenge_detect.js",
    "common/liveness_markers.js",
    "content/liveness_check.js"
  ];
  async function ynPingLiveness(tabId, url) {
    try {
      if (!tabId || !YN_LIVENESS_HOSTS.test(url || "")) return;
      await ynInjectOnce(tabId, YN_LIVENESS_FILES, "ynLivenessCheck");
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ynLivenessCheck()
      });
    } catch {
    }
  }
  globalThis.ynInjectOnce = ynInjectOnce;
  globalThis.YN_CAPTURE_FILES = YN_CAPTURE_FILES;
  globalThis.YN_LIVENESS_HOSTS = YN_LIVENESS_HOSTS;
  globalThis.YN_LIVENESS_FILES = YN_LIVENESS_FILES;
  globalThis.ynPingLiveness = ynPingLiveness;
})();
