/**
 * File-accept pin — the fill kit never hands a file to an upload that says it
 * will not take it.
 *
 * Live evidence for why: a real SmartRecruiters application carries a profile
 * IMAGE picker above the resume dropzone. Attaching the CV to it made the
 * employer's own form show "this file format is not supported" to the
 * student, which reads as our mistake. ynFileInputAccepts reads the accept
 * attribute; an input with no accept still takes anything, so absence means
 * yes and no existing form loses its attach.
 *
 * Run: node tests/ext_fixtures/run_file_accept.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const KIT_PATH = path.join(ROOT, "extension", "content", "dom_fill_kit.js");

/** Minimal file input: only what the attach path actually touches.
 *  `dropped` collects any DragEvent the widget receives, because the drop
 *  path is where an adversarial review found the guard could be walked around. */
function makeFileInput(accept) {
  const widget = {
    tagName: "DIV",
    className: "dropzone",
    dropped: [],
    dispatchEvent(ev) {
      if (ev && ev.type === "drop") this.dropped.push(ev);
      return true;
    },
    querySelector: () => null,
    closest: () => null,
  };
  const el = {
    type: "file",
    tagName: "INPUT",
    files: null,
    isConnected: true,
    parentElement: widget,
    getAttribute(n) {
      return n === "accept" ? accept : null;
    },
    hasAttribute(n) {
      return this.getAttribute(n) != null;
    },
    closest() {
      return widget;
    },
    dispatchEvent() {
      return true;
    },
  };
  el.widget = widget;
  return el;
}

class FakeFile {
  constructor(parts, name, opts) {
    this.name = name;
    this.type = (opts && opts.type) || "";
  }
}

const sandbox = {
  console,
  File: FakeFile,
  DataTransfer: class {
    constructor() {
      this._files = [];
      this.items = { add: (f) => this._files.push(f) };
    }
    get files() {
      return this._files;
    }
  },
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  DragEvent: class {
    constructor(type) {
      this.type = type;
    }
  },
  TextEncoder,
  // The confirm wait is real: without timers the wrapper throws on its way to
  // ynWaitFor, and the pin would go red for a missing global rather than for
  // the thing it is meant to catch.
  setTimeout,
  clearTimeout,
  atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
  document: { querySelectorAll: () => [], querySelector: () => null },
  window: {},
  navigator: { userAgent: "node" },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(KIT_PATH, "utf8"), sandbox, { filename: KIT_PATH });

const CV = {
  dataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
  name: "cv.pdf",
  type: "application/pdf",
};

const cases = [
  // [what the input says it takes, should the CV attach?, why]
  ["image/*", false, "profile-image picker must refuse a PDF"],
  [".png,.jpg,.jpeg", false, "image extensions only"],
  [".pdf,.doc,.docx", true, "resume input naming the pdf extension"],
  ["application/pdf", true, "resume input naming the pdf mime type"],
  ["", true, "no accept attribute takes anything"],
  [null, true, "missing accept attribute takes anything"],
  ["*/*", true, "explicit anything"],
  [" .PDF , .DOCX ", true, "case and whitespace in the rule list"],
];

let failed = 0;
for (const [accept, want, why] of cases) {
  const el = makeFileInput(accept);
  const got = sandbox.ynAttachFile(el, CV);
  if (got !== want) {
    console.error(
      `FAIL: accept=${JSON.stringify(accept)} expected attach=${want}, got ${got} — ${why}`,
    );
    failed++;
    continue;
  }
  // an accepted attach must actually land the file, or the pin proves nothing
  if (want && (!el.files || el.files.length !== 1 || el.files[0].name !== "cv.pdf")) {
    console.error(
      `FAIL: accept=${JSON.stringify(accept)} returned true but no file landed`,
    );
    failed++;
  }
  if (!want && el.files && el.files.length) {
    console.error(
      `FAIL: accept=${JSON.stringify(accept)} refused but still wrote files`,
    );
    failed++;
  }
}

/* THE PRODUCTION ENTRY POINT, and the path an adversarial review walked around.
 *
 * engine.js calls ynAttachFileWithConfirm, not ynAttachFile. That wrapper used
 * to do `attached = tryInput(); if (!attached) attached = tryDrop();` — so
 * refusing the input was exactly what triggered an UNCHECKED drop onto that
 * same input's own dropzone, and the PDF reached the image-only widget anyway.
 * The earlier version of this pin never called the wrapper, so it could not
 * see the hole. It does now, and it watches the widget for drop events. */
async function checkWrapper() {
  let bad = 0;
  for (const [accept, want, why] of cases) {
    const el = makeFileInput(accept);
    const res = await sandbox.ynAttachFileWithConfirm(el, CV, null);
    if (Boolean(res && res.attached) !== want) {
      console.error(
        `FAIL: ynAttachFileWithConfirm accept=${JSON.stringify(accept)} ` +
          `expected attached=${want}, got ${JSON.stringify(res)} — ${why}`,
      );
      bad++;
    }
    if (!want && el.widget.dropped.length) {
      console.error(
        `FAIL: accept=${JSON.stringify(accept)} refused the input but ` +
          `${el.widget.dropped.length} drop event(s) still carried the file to ` +
          "its dropzone — the guard is bypassable via the drop path",
      );
      bad++;
    }
    if (!want && el.files && el.files.length) {
      console.error(
        `FAIL: accept=${JSON.stringify(accept)} refused but files still landed`,
      );
      bad++;
    }
  }
  // and the raw drop primitive must not be a way in either
  const img = makeFileInput("image/*");
  const file = sandbox.ynDataUrlToFile(CV.dataUrl, CV.name, CV.type);
  sandbox.ynDropFile(img.widget, file);
  if (img.widget.dropped.length) {
    console.error(
      "NOTE: ynDropFile drops onto an arbitrary target by design — the refusal " +
        "belongs at ynAttachFileWithConfirm, which is the only production caller",
    );
  }
  return bad;
}

const wrapperFailures = await checkWrapper();
if (failed || wrapperFailures) process.exit(1);
console.log(
  `file-accept PASS: ${cases.length} accept rules honoured on both the direct ` +
    "input and the production wrapper (no drop-path bypass)",
);
