// content/dom_fill_kit.js, part 5 of 6 - CV/cover-letter file upload:
// the data-URL-to-File conversion, the native input.files write and
// drag-and-drop fallback, and the visible-attachment confirmation that
// decides which one actually took. See index.js for the file's full
// header and history.
import { ynQueryDeep } from "./core.js";
import { ynWaitFor } from "./combobox.js";

// ─── File attach (DataTransfer) + dropzone drop ─────────────────────────────
export function ynDataUrlToFile(dataUrl, name, type) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) return null;
  const mime = type || m[1] || "application/octet-stream";
  const b64 = m[2] != null;
  const data = m[3];
  let bytes;
  if (b64) {
    const bin = atob(data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return new File([bytes], name || "file", { type: mime });
}

/* Does this input say it will take our file? A form can carry more than one
 * upload — SmartRecruiters puts a profile-IMAGE picker above the resume
 * dropzone — and handing a PDF to an image-only input makes the employer's
 * own form shout "this file format is not supported" at the student, which
 * looks like our mistake because it is. An input with no accept attribute
 * takes anything, so absence means yes. */
export function ynFileInputAccepts(fileInput, file) {
  const accept = (fileInput.getAttribute("accept") || "").trim();
  if (!accept) return true;
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return accept.split(",").some((rawRule) => {
    const rule = rawRule.trim().toLowerCase();
    if (!rule) return false;
    if (rule === "*/*") return true;
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function ynAttachFile(fileInput, spec) {
  if (!fileInput || !spec) return false;
  try {
    let file = null;
    if (spec.dataUrl) {
      file = ynDataUrlToFile(spec.dataUrl, spec.name, spec.type);
    } else if (spec.file instanceof File) {
      file = spec.file;
    }
    if (!file) return false;
    if (!ynFileInputAccepts(fileInput, file)) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

export function ynDropFile(dropTarget, file) {
  if (!dropTarget || !file) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    // some dropzones require dragover/enter first.
    // composed:true so open-shadow listeners on ancestors still see the
    // event when we target an inner node (SmartRecruiters spl-dropzone).
    for (const type of ["dragenter", "dragover", "drop"]) {
      const ev = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: dt,
      });
      dropTarget.dispatchEvent(ev);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve intent.dropTarget (HTMLElement | CSS selector) relative to the file
 * input. Adapters set this — engine has no ATS-specific hardcoding.
 */
export function ynResolveDropTarget(fileEl, intent) {
  const hint = intent && intent.dropTarget;
  if (hint && hint.nodeType === 1) return hint;
  if (typeof hint === "string" && hint) {
    try {
      if (fileEl && fileEl.closest) {
        const near = fileEl.closest(hint);
        if (near) return near;
      }
      const deep =
        typeof ynQueryDeep === "function"
          ? ynQueryDeep(document, hint)
          : [...document.querySelectorAll(hint)];
      return deep[0] || null;
    } catch {
      return null;
    }
  }
  if (fileEl && fileEl.closest) {
    return (
      fileEl.closest("[class*='drop'], [data-testid*='drop'], .file-upload") ||
      fileEl.parentElement
    );
  }
  return null;
}

/**
 * True when the page visibly accepted the file (filename / Replace / Success /
 * Remove file / adapter confirmSelector). False when Greenhouse-style
 * uploadFile errors show, or nothing confirmed yet.
 */
export function ynFileAttachVisibleOk(fileEl, fileName, intent) {
  if (!fileEl) return false;
  // Prefer a still-connected confirm root. Pages (Greenhouse-like) may rewrite
  // the upload chrome and disconnect the original input — never treat a
  // detached FileList as confirmation.
  let root =
    (intent &&
    intent.confirmRoot &&
    intent.confirmRoot.nodeType === 1 &&
    intent.confirmRoot.isConnected
      ? intent.confirmRoot
      : null) ||
    (fileEl.isConnected &&
      fileEl.closest &&
      fileEl.closest(
        ".file-upload, [class*='upload'], [class*='drop'], [data-testid*='resume'], form, fieldset, div",
      )) ||
    null;
  if (!root) {
    try {
      root =
        document.querySelector(
          ".file-upload, [data-testid*='drop'], [data-testid*='resume']",
        ) || null;
    } catch {
      root = null;
    }
  }
  if (!root) root = fileEl.isConnected ? fileEl.parentElement || fileEl : null;
  if (!root) return false;

  const text = (root.innerText || root.textContent || "").trim();
  // Greenhouse live failure: page shows TypeError message under the Attach row
  if (
    /cannot read properties of undefined|reading ['"]?uploadFile['"]?/i.test(
      text,
    )
  ) {
    return false;
  }
  const want = (fileName || "").toLowerCase();
  const base = want.replace(/\.[^.]+$/, "");

  if (intent && intent.confirmSelector) {
    try {
      // Pierce open shadow (SmartRecruiters spl-dropzone chip lives inside).
      // Light-DOM query first (Greenhouse), then ynQueryDeep, then document.
      let hit =
        (root.querySelector && root.querySelector(intent.confirmSelector)) ||
        null;
      if (!hit && typeof ynQueryDeep === "function") {
        hit = ynQueryDeep(root, intent.confirmSelector)[0] || null;
      }
      if (!hit) {
        hit =
          (typeof ynQueryDeep === "function"
            ? ynQueryDeep(document, intent.confirmSelector)[0]
            : null) || document.querySelector(intent.confirmSelector);
      }
      if (!hit || hit.isConnected === false) return false;
      const ht = ((hit.textContent || hit.innerText || "") + "").toLowerCase();
      // Reject empty-state prompts mistaken for success chrome.
      if (
        /choose a file|drop it here|10\s*mb size limit|accepted file types/i.test(
          ht,
        )
      ) {
        return false;
      }
      if (!want) return true;
      if (ht.includes(want) || (base && ht.includes(base))) return true;
      // Greenhouse .file-upload__filename wraps a <p> with the name;
      // Remove buttons are reliable success markers even without the name text.
      if (/^[\s×x]*remove(\s+file)?[\s×x]*$/i.test(ht) || ht === "×") {
        return true;
      }
      return (
        ht.length > 0 &&
        !/attach|dropbox|google drive|enter manually|choose a file|drop it here/i.test(
          ht,
        )
      );
    } catch {
      return false;
    }
  }

  // Lever "Success!", Ashby "Replace", Greenhouse "Remove file" + filename
  // Also walk open shadow text (host.innerText does not include shadow).
  let deepText = text;
  if (typeof ynQueryDeep === "function") {
    try {
      const nodes = ynQueryDeep(root, "*");
      const bits = [];
      for (const n of nodes) {
        if (
          n.childNodes &&
          n.childNodes.length === 1 &&
          n.childNodes[0].nodeType === 3
        ) {
          bits.push((n.textContent || "").trim());
        }
      }
      if (bits.length) deepText = (text + " " + bits.join(" ")).trim();
    } catch {
      /* keep light text */
    }
  }
  if (/success!?|\breplace\b|remove file/i.test(deepText)) return true;
  if (want && deepText.toLowerCase().includes(want)) return true;
  if (
    (root.querySelector &&
      root.querySelector(
        ".file-upload__filename, [class*='filename'], [class*='file-name'], [class*='uploaded']",
      )) ||
    (typeof ynQueryDeep === "function" &&
      ynQueryDeep(
        root,
        ".file-upload__filename, [class*='filename'], [class*='file-name'], [class*='uploaded']",
      )[0])
  ) {
    return true;
  }
  // Plain <input type=file> with no fancy chrome (fixtures, some ATS): FileList
  // set is the only reliable signal — and only while the input is still live.
  if (fileEl.isConnected && fileEl.files && fileEl.files.length > 0) {
    if (!want) return true;
    const got = (fileEl.files[0].name || "").toLowerCase();
    if (got === want || (base && got.includes(base))) return true;
  }
  return false;
}

/**
 * Attach a file using adapter hints (uploadMode / dropTarget), then wait for
 * visible confirmation. Returns { attached, confirmed, fileName }.
 * uploadMode: "input" (default) | "drop" | "drop_then_input"
 * — Greenhouse uses input (React onChange → uploaders[y].uploadFile); drop is
 * optional fallback via intent.dropTarget, not hardcoded ATS logic.
 */
export async function ynAttachFileWithConfirm(fileEl, fileSpec, intent) {
  const empty = { attached: false, confirmed: false, fileName: "" };
  if (!fileEl || !fileSpec) return empty;
  let file = null;
  if (fileSpec.dataUrl) {
    file = ynDataUrlToFile(fileSpec.dataUrl, fileSpec.name, fileSpec.type);
  } else if (fileSpec.file instanceof File) {
    file = fileSpec.file;
  }
  if (!file) return empty;
  const fileName = file.name || fileSpec.name || "";
  const mode = (intent && intent.uploadMode) || "input";
  const dropTarget = ynResolveDropTarget(fileEl, intent);
  const isFileInput =
    fileEl.tagName &&
    fileEl.tagName.toUpperCase() === "INPUT" &&
    (fileEl.type || "").toLowerCase() === "file";

  // The refusal has to be decided ONCE, here, for BOTH paths. Checking it only
  // inside ynAttachFile made refusing the input the very thing that triggered
  // an unchecked drop onto that same input's dropzone — so a PDF still reached
  // a profile-image picker and the employer's form still showed the student
  // "this file format is not supported". The drop target is resolved FROM this
  // input, so if the input will not take the file, its widget will not either.
  if (isFileInput && !ynFileInputAccepts(fileEl, file)) return empty;

  const tryInput = () => (isFileInput ? ynAttachFile(fileEl, fileSpec) : false);
  const tryDrop = () =>
    dropTarget && file ? ynDropFile(dropTarget, file) : false;

  let attached = false;
  if (mode === "drop") {
    attached = tryDrop() || tryInput();
  } else if (mode === "drop_then_input") {
    attached = tryDrop();
    if (!attached) attached = tryInput();
    else if (isFileInput) tryInput(); // also seed the input when both exist
  } else {
    // "input" default — Lever/Ashby/Greenhouse primary path
    attached = tryInput();
    if (!attached) attached = tryDrop();
  }

  // Greenhouse race: uploaders[y] may be undefined before full hydration.
  // One short retry if the page shows the known error or no confirm yet.
  const waitMs =
    intent && intent.confirmTimeoutMs != null ? intent.confirmTimeoutMs : 2500;
  let confirmed = false;
  const waitConfirm = (ms) =>
    ynWaitFor(() => ynFileAttachVisibleOk(fileEl, fileName, intent) || null, {
      timeoutMs: ms,
      debounceMs: 50,
    });

  if (attached) {
    // Fast path: already visible. If the page immediately shows the known
    // Greenhouse uploadFile error, skip the long wait and go to retry/drop.
    if (ynFileAttachVisibleOk(fileEl, fileName, intent)) {
      confirmed = true;
    } else {
      const errFast =
        /cannot read properties of undefined|reading ['"]?uploadFile['"]?/i.test(
          (
            (dropTarget && (dropTarget.innerText || "")) ||
            (fileEl.closest &&
              fileEl.closest(".file-upload") &&
              fileEl.closest(".file-upload").innerText) ||
            document.querySelector(".file-upload")?.innerText ||
            ""
          ).toString(),
        );
      confirmed = Boolean(await waitConfirm(errFast ? 400 : waitMs));
    }
    if (!confirmed && isFileInput && fileEl.isConnected) {
      tryInput();
      confirmed = Boolean(await waitConfirm(Math.min(waitMs, 1500)));
    }
    // Drop fallback when input set a FileList but the page never confirmed
    // (true dropzones; Greenhouse adapter also supplies dropTarget as optional).
    if (!confirmed && dropTarget && file) {
      tryDrop();
      if (isFileInput && fileEl.isConnected) tryInput();
      confirmed = Boolean(await waitConfirm(Math.min(waitMs, 2000)));
    }
  }

  // Soft attach: FileList set but UI never confirmed (unverified → amber)
  if (!attached && isFileInput && fileEl.files && fileEl.files.length > 0) {
    attached = true;
  }
  if (attached || confirmed) attached = true;

  return { attached, confirmed, fileName };
}
