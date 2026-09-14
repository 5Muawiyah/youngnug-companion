(() => {
  // extension/src/kit/dom_fill_kit/core.js
  var ynKitGuards = { clickGuard: null };
  function ynMakeEvent(ctorName, type, init) {
    const Ctor = typeof globalThis[ctorName] === "function" ? globalThis[ctorName] : null;
    try {
      if (Ctor) return new Ctor(type, init);
    } catch {
    }
    return new Event(type, { bubbles: !!(init && init.bubbles), cancelable: !!(init && init.cancelable) });
  }
  function ynKitInit(guards) {
    Object.assign(ynKitGuards, guards || {});
  }
  function ynSetNativeValue(el, value) {
    if (!el) return;
    const tag = (el.tagName || "").toUpperCase();
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      const desired = Boolean(value);
      if (el.checked !== desired) {
        el.click();
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    let proto;
    if (tag === "TEXTAREA") proto = window.HTMLTextAreaElement.prototype;
    else if (tag === "SELECT") proto = window.HTMLSelectElement.prototype;
    else proto = window.HTMLInputElement.prototype;
    const strValue = value == null ? "" : String(value);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (tag !== "SELECT") {
      try {
        el.focus({ preventScroll: true });
      } catch {
      }
    }
    if (desc && desc.set) desc.set.call(el, strValue);
    else el.value = strValue;
    if (tag === "SELECT") {
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.dispatchEvent(
        ynMakeEvent("InputEvent", "input", {
          bubbles: true,
          inputType: "insertText",
          data: strValue
        })
      );
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(ynMakeEvent("FocusEvent", "blur", { bubbles: true }));
    }
  }
  function ynQueryDeep(root, selector) {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      try {
        if (node.querySelectorAll) {
          out.push(...node.querySelectorAll(selector));
        }
      } catch {
      }
      if (node.shadowRoot) walk(node.shadowRoot);
      const all = node.querySelectorAll ? node.querySelectorAll("*") : [];
      for (const el of all) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root || document);
    return out;
  }
  function ynAdaFind(doc, selector) {
    if (typeof ynQueryDeep === "function") {
      const hits = ynQueryDeep(doc || document, selector);
      return hits[0] || null;
    }
    try {
      return (doc || document).querySelector(selector);
    } catch {
      return null;
    }
  }
  function ynAdaFindAll(doc, selector) {
    if (typeof ynQueryDeep === "function") {
      return ynQueryDeep(doc || document, selector);
    }
    try {
      return [...(doc || document).querySelectorAll(selector)];
    } catch {
      return [];
    }
  }

  // extension/src/kit/dom_fill_kit/combobox.js
  function ynWaitFor(predicateOrSelector, opts) {
    const options = opts || {};
    const timeoutMs = options.timeoutMs != null ? options.timeoutMs : 8e3;
    const root = options.root || document;
    const debounceMs = options.debounceMs != null ? options.debounceMs : 80;
    const check = () => {
      try {
        if (typeof predicateOrSelector === "function") {
          return predicateOrSelector(root) || null;
        }
        const hits = ynQueryDeep(root, predicateOrSelector);
        return hits[0] || null;
      } catch {
        return null;
      }
    };
    return new Promise((resolve) => {
      const existing = check();
      if (existing) {
        resolve(existing);
        return;
      }
      let debounceTimer = null;
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        try {
          observer.disconnect();
        } catch {
        }
        clearTimeout(timer);
        clearTimeout(debounceTimer);
        resolve(val);
      };
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const found = check();
          if (found) finish(found);
        }, debounceMs);
      });
      const observeTarget = root === document || root === document.documentElement ? document.documentElement : root;
      try {
        observer.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true
        });
      } catch {
        finish(null);
        return;
      }
      const timer = setTimeout(() => finish(null), timeoutMs);
    });
  }
  function ynBestOptionMatch(options, targetLabel) {
    const target = String(targetLabel || "").trim().toLowerCase();
    if (!target || !options.length) return null;
    const texts = options.map((o) => ({
      el: o,
      t: (o.textContent || o.innerText || "").trim().toLowerCase()
    }));
    const exact = texts.filter((x) => x.t === target);
    if (exact.length === 1) return exact[0].el;
    if (exact.length > 1) return null;
    const starts = texts.filter(
      (x) => x.t.startsWith(target) || target.startsWith(x.t)
    );
    if (starts.length === 1) return starts[0].el;
    if (starts.length > 1) {
      const strict = texts.filter((x) => x.t.startsWith(target));
      if (strict.length === 1) return strict[0].el;
      return null;
    }
    const includes = texts.filter(
      (x) => x.t.includes(target) || target.includes(x.t)
    );
    if (includes.length === 1) return includes[0].el;
    return null;
  }
  async function ynDriveCombobox(inputEl, targetLabel) {
    if (!inputEl) return { ok: false, matched: null };
    try {
      if (typeof ynAriaIsPopupControl === "function" && ynAriaIsPopupControl(inputEl)) {
        const r = await ynAriaFillPopup(inputEl, targetLabel);
        return {
          ok: Boolean(r && r.ok),
          matched: r && r.matched || null,
          error: r && !r.ok ? r.reason : void 0
        };
      }
      inputEl.focus();
      ynSetNativeValue(inputEl, targetLabel);
      const found = await ynWaitFor(
        () => {
          const opts = [
            ...document.querySelectorAll('[role="option"]'),
            ...document.querySelectorAll("[class*='option']"),
            ...document.querySelectorAll("li[data-value], li[role='option']")
          ];
          return [...new Set(opts)].length ? true : null;
        },
        { timeoutMs: 3e3, root: document }
      );
      if (!found) return { ok: false, matched: null };
      const options = [
        .../* @__PURE__ */ new Set([
          ...document.querySelectorAll('[role="option"]'),
          ...document.querySelectorAll("[class*='option']"),
          ...document.querySelectorAll("li[data-value], li[role='option']")
        ])
      ].filter((o) => (o.textContent || "").trim());
      const match = ynBestOptionMatch(options, targetLabel);
      if (!match) return { ok: false, matched: null };
      const ynClickGuard = ynKitGuards.clickGuard;
      if (!ynClickGuard || ynClickGuard(match))
        return { ok: false, matched: null };
      match.dispatchEvent(ynMakeEvent("PointerEvent", "pointerdown", { bubbles: true }));
      match.dispatchEvent(ynMakeEvent("MouseEvent", "mouseup", { bubbles: true }));
      match.click();
      const after = (inputEl.value || "").trim().toLowerCase();
      const want = String(targetLabel).trim().toLowerCase();
      const hidden = inputEl.closest("form, [role='group'], div")?.querySelector?.('input[type="hidden"]');
      const hiddenOk = hidden && String(hidden.value || "").toLowerCase().includes(want.slice(0, 12));
      const ok = after === want || after.includes(want) || want.includes(after) || Boolean(hiddenOk) || match.getAttribute("aria-selected") === "true";
      return { ok: Boolean(ok), matched: match };
    } catch (e) {
      return { ok: false, matched: null, error: String(e) };
    }
  }
  async function ynDriveCascade(levelEls, parts) {
    const levels = Array.isArray(levelEls) ? levelEls : [];
    const values = Array.isArray(parts) ? parts : [];
    for (let i = 0; i < levels.length && i < values.length; i++) {
      const el = levels[i];
      const part = values[i];
      if (!el || (el.tagName || "").toUpperCase() !== "SELECT") {
        return { ok: false, stoppedAtLevel: i, reason: "missing_level" };
      }
      const opts = [...el.options];
      const target = String(part || "").trim().toLowerCase();
      const texts = opts.map((o) => ({
        o,
        t: (o.textContent || "").trim().toLowerCase()
      }));
      const exact = texts.filter((x) => x.t === target);
      let hit = null;
      if (exact.length === 1) {
        hit = exact[0].o;
      } else if (exact.length > 1) {
        return { ok: false, stoppedAtLevel: i, reason: "ambiguous" };
      } else {
        const sub = target ? texts.filter((x) => x.t.includes(target)) : [];
        if (sub.length === 1) hit = sub[0].o;
        else if (sub.length > 1) {
          return { ok: false, stoppedAtLevel: i, reason: "ambiguous" };
        }
      }
      if (!hit) return { ok: false, stoppedAtLevel: i, reason: "no_match" };
      ynSetNativeValue(el, hit.value);
      const next = levels[i + 1];
      if (next) {
        const before = [...next.options].map((o) => o.value + "|" + o.textContent).join(",");
        await ynWaitFor(
          () => {
            const now = [...next.options].map((o) => o.value + "|" + o.textContent).join(",");
            return now !== before ? true : null;
          },
          { timeoutMs: 1500, root: next }
        );
      }
    }
    return { ok: true, stoppedAtLevel: -1 };
  }

  // extension/src/kit/dom_fill_kit/typing.js
  var YN_TYPE_PACE_MS = 4;
  async function ynTypeValuePerChar(el, value) {
    if (!el) return false;
    const type = (el.type || "").toLowerCase();
    if (type === "password") return false;
    const tag = (el.tagName || "").toUpperCase();
    if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
    try {
      el.focus({ preventScroll: true });
    } catch {
    }
    const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const setVal = (v) => {
      if (desc && desc.set) desc.set.call(el, v);
      else el.value = v;
    };
    setVal("");
    const target = value == null ? "" : String(value);
    let acc = "";
    for (const ch of target) {
      if (ch === "\n" || ch === "	" || ch === "\x1B") continue;
      acc += ch;
      const isSpace = ch === " ";
      if (!isSpace) {
        el.dispatchEvent(
          new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true })
        );
      }
      setVal(acc);
      el.dispatchEvent(
        ynMakeEvent("InputEvent", "input", { bubbles: true, inputType: "insertText", data: ch })
      );
      if (!isSpace) {
        el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, YN_TYPE_PACE_MS));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(ynMakeEvent("FocusEvent", "blur", { bubbles: true }));
    return String(el.value || "") === target;
  }
  var YN_RICH_TEXT_MARKERS = [
    "ql-editor",
    // Quill
    "ProseMirror",
    "public-DraftEditor-content",
    // Draft.js
    "tox-edit-area",
    // TinyMCE
    "mce-content-body"
  ];
  function ynIsPlainContentEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable !== true) return false;
    let node = el;
    let depth = 0;
    while (node && depth < 6) {
      const cls = String(node.className || "");
      if (YN_RICH_TEXT_MARKERS.some((m) => cls.includes(m))) return false;
      node = node.parentElement;
      depth += 1;
    }
    const blockTags = /* @__PURE__ */ new Set([
      "DIV",
      "P",
      "UL",
      "OL",
      "LI",
      "H1",
      "H2",
      "H3",
      "BLOCKQUOTE",
      "TABLE"
    ]);
    for (const child of el.children || []) {
      if (blockTags.has((child.tagName || "").toUpperCase())) return false;
    }
    return true;
  }
  function ynWriteContentEditablePlain(el, value) {
    if (!ynIsPlainContentEditable(el)) return false;
    try {
      el.focus();
      const strValue = value == null ? "" : String(value);
      el.textContent = strValue;
      el.dispatchEvent(
        ynMakeEvent("InputEvent", "input", {
          bubbles: true,
          inputType: "insertText",
          data: strValue
        })
      );
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(ynMakeEvent("FocusEvent", "blur", { bubbles: true }));
      return String(el.textContent || "") === strValue;
    } catch {
      return false;
    }
  }

  // extension/src/kit/dom_fill_kit/undo.js
  var ynUndoSession = [];
  function ynResetUndoSession() {
    ynUndoSession = [];
  }
  function ynStashForUndo(entry) {
    if (!entry || !entry.el) return;
    ynUndoSession.push(entry);
  }
  function ynClearElementHighlight(el) {
    if (!el) return;
    try {
      el.classList.remove("yn-fill-ok", "yn-fill-check", "yn-fill-missed");
      el.style.outline = "";
      el.style.outlineOffset = "";
      el.style.backgroundColor = "";
    } catch {
    }
  }
  function ynUndoFill() {
    const stash = ynUndoSession;
    ynUndoSession = [];
    let reverted = 0;
    const restoreOnce = (entry) => {
      const el = entry.el;
      if (!el || !el.isConnected) return;
      try {
        if (entry.kind === "checkbox" || entry.kind === "radio") {
          if (el.checked !== Boolean(entry.prior)) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "checked"
            ).set;
            if (setter) setter.call(el, Boolean(entry.prior));
            else el.checked = Boolean(entry.prior);
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } else if (entry.kind === "file") {
          try {
            el.files = new DataTransfer().files;
          } catch {
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (entry.kind === "contenteditable") {
          el.textContent = entry.prior || "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          if ("value" in el) {
            ynSetNativeValue(el, entry.prior || "");
          } else {
            el.textContent = entry.prior || "";
          }
        }
      } catch {
      }
    };
    for (const entry of stash) {
      restoreOnce(entry);
      ynClearElementHighlight(entry.el);
      reverted += 1;
      queueMicrotask(() => restoreOnce(entry));
    }
    try {
      const badge = document.getElementById("yn-fill-badge");
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    } catch {
    }
    return { reverted, total: stash.length };
  }

  // extension/src/kit/dom_fill_kit/file_attach.js
  function ynDataUrlToFile(dataUrl, name, type) {
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
  function ynFileInputAccepts(fileInput, file) {
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
  function ynAttachFile(fileInput, spec) {
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
  function ynDropFile(dropTarget, file) {
    if (!dropTarget || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      for (const type of ["dragenter", "dragover", "drop"]) {
        const ev = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: dt
        });
        dropTarget.dispatchEvent(ev);
      }
      return true;
    } catch {
      return false;
    }
  }
  function ynResolveDropTarget(fileEl, intent) {
    const hint = intent && intent.dropTarget;
    if (hint && hint.nodeType === 1) return hint;
    if (typeof hint === "string" && hint) {
      try {
        if (fileEl && fileEl.closest) {
          const near = fileEl.closest(hint);
          if (near) return near;
        }
        const deep = typeof ynQueryDeep === "function" ? ynQueryDeep(document, hint) : [...document.querySelectorAll(hint)];
        return deep[0] || null;
      } catch {
        return null;
      }
    }
    if (fileEl && fileEl.closest) {
      return fileEl.closest("[class*='drop'], [data-testid*='drop'], .file-upload") || fileEl.parentElement;
    }
    return null;
  }
  function ynFileAttachVisibleOk(fileEl, fileName, intent) {
    if (!fileEl) return false;
    let root = (intent && intent.confirmRoot && intent.confirmRoot.nodeType === 1 && intent.confirmRoot.isConnected ? intent.confirmRoot : null) || fileEl.isConnected && fileEl.closest && fileEl.closest(
      ".file-upload, [class*='upload'], [class*='drop'], [data-testid*='resume'], form, fieldset, div"
    ) || null;
    if (!root) {
      try {
        root = document.querySelector(
          ".file-upload, [data-testid*='drop'], [data-testid*='resume']"
        ) || null;
      } catch {
        root = null;
      }
    }
    if (!root) root = fileEl.isConnected ? fileEl.parentElement || fileEl : null;
    if (!root) return false;
    const text = (root.innerText || root.textContent || "").trim();
    if (/cannot read properties of undefined|reading ['"]?uploadFile['"]?/i.test(
      text
    )) {
      return false;
    }
    const want = (fileName || "").toLowerCase();
    const base = want.replace(/\.[^.]+$/, "");
    if (intent && intent.confirmSelector) {
      try {
        let hit = root.querySelector && root.querySelector(intent.confirmSelector) || null;
        if (!hit && typeof ynQueryDeep === "function") {
          hit = ynQueryDeep(root, intent.confirmSelector)[0] || null;
        }
        if (!hit) {
          hit = (typeof ynQueryDeep === "function" ? ynQueryDeep(document, intent.confirmSelector)[0] : null) || document.querySelector(intent.confirmSelector);
        }
        if (!hit || hit.isConnected === false) return false;
        const ht = ((hit.textContent || hit.innerText || "") + "").toLowerCase();
        if (/choose a file|drop it here|10\s*mb size limit|accepted file types/i.test(
          ht
        )) {
          return false;
        }
        if (!want) return true;
        if (ht.includes(want) || base && ht.includes(base)) return true;
        if (/^[\s×x]*remove(\s+file)?[\s×x]*$/i.test(ht) || ht === "×") {
          return true;
        }
        return ht.length > 0 && !/attach|dropbox|google drive|enter manually|choose a file|drop it here/i.test(
          ht
        );
      } catch {
        return false;
      }
    }
    let deepText = text;
    if (typeof ynQueryDeep === "function") {
      try {
        const nodes = ynQueryDeep(root, "*");
        const bits = [];
        for (const n of nodes) {
          if (n.childNodes && n.childNodes.length === 1 && n.childNodes[0].nodeType === 3) {
            bits.push((n.textContent || "").trim());
          }
        }
        if (bits.length) deepText = (text + " " + bits.join(" ")).trim();
      } catch {
      }
    }
    if (/success!?|\breplace\b|remove file/i.test(deepText)) return true;
    if (want && deepText.toLowerCase().includes(want)) return true;
    if (root.querySelector && root.querySelector(
      ".file-upload__filename, [class*='filename'], [class*='file-name'], [class*='uploaded']"
    ) || typeof ynQueryDeep === "function" && ynQueryDeep(
      root,
      ".file-upload__filename, [class*='filename'], [class*='file-name'], [class*='uploaded']"
    )[0]) {
      return true;
    }
    if (fileEl.isConnected && fileEl.files && fileEl.files.length > 0) {
      if (!want) return true;
      const got = (fileEl.files[0].name || "").toLowerCase();
      if (got === want || base && got.includes(base)) return true;
    }
    return false;
  }
  async function ynAttachFileWithConfirm(fileEl, fileSpec, intent) {
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
    const mode = intent && intent.uploadMode || "input";
    const dropTarget = ynResolveDropTarget(fileEl, intent);
    const isFileInput = fileEl.tagName && fileEl.tagName.toUpperCase() === "INPUT" && (fileEl.type || "").toLowerCase() === "file";
    if (isFileInput && !ynFileInputAccepts(fileEl, file)) return empty;
    const tryInput = () => isFileInput ? ynAttachFile(fileEl, fileSpec) : false;
    const tryDrop = () => dropTarget && file ? ynDropFile(dropTarget, file) : false;
    let attached = false;
    if (mode === "drop") {
      attached = tryDrop() || tryInput();
    } else if (mode === "drop_then_input") {
      attached = tryDrop();
      if (!attached) attached = tryInput();
      else if (isFileInput) tryInput();
    } else {
      attached = tryInput();
      if (!attached) attached = tryDrop();
    }
    const waitMs = intent && intent.confirmTimeoutMs != null ? intent.confirmTimeoutMs : 2500;
    let confirmed = false;
    const waitConfirm = (ms) => ynWaitFor(() => ynFileAttachVisibleOk(fileEl, fileName, intent) || null, {
      timeoutMs: ms,
      debounceMs: 50
    });
    if (attached) {
      if (ynFileAttachVisibleOk(fileEl, fileName, intent)) {
        confirmed = true;
      } else {
        const errFast = /cannot read properties of undefined|reading ['"]?uploadFile['"]?/i.test(
          (dropTarget && (dropTarget.innerText || "") || fileEl.closest && fileEl.closest(".file-upload") && fileEl.closest(".file-upload").innerText || document.querySelector(".file-upload")?.innerText || "").toString()
        );
        confirmed = Boolean(await waitConfirm(errFast ? 400 : waitMs));
      }
      if (!confirmed && isFileInput && fileEl.isConnected) {
        tryInput();
        confirmed = Boolean(await waitConfirm(Math.min(waitMs, 1500)));
      }
      if (!confirmed && dropTarget && file) {
        tryDrop();
        if (isFileInput && fileEl.isConnected) tryInput();
        confirmed = Boolean(await waitConfirm(Math.min(waitMs, 2e3)));
      }
    }
    if (!attached && isFileInput && fileEl.files && fileEl.files.length > 0) {
      attached = true;
    }
    if (attached || confirmed) attached = true;
    return { attached, confirmed, fileName };
  }

  // extension/src/kit/dom_fill_kit/highlight.js
  var YN_HIGHLIGHT_COLORS = typeof YN_THEME !== "undefined" ? YN_THEME : {
    primary: "#0b8160",
    // --primary
    warning: "#8a5a12",
    // --warning
    borderStrong: "#cbd8d0"
    // --border-strong
  };
  function ynHexAlpha(hex, alpha) {
    const n = Number.parseInt(String(hex).replace("#", ""), 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
  }
  var YN_HIGHLIGHT = {
    filled: {
      cls: "yn-fill-ok",
      outline: `2px solid ${YN_HIGHLIGHT_COLORS.primary}`,
      outlineOffset: "1px",
      backgroundColor: ynHexAlpha(YN_HIGHLIGHT_COLORS.primary, 0.08)
    },
    check: {
      cls: "yn-fill-check",
      outline: `2px solid ${YN_HIGHLIGHT_COLORS.warning}`,
      outlineOffset: "1px",
      backgroundColor: ynHexAlpha(YN_HIGHLIGHT_COLORS.warning, 0.1)
    },
    missed: {
      cls: "yn-fill-missed",
      outline: `2px solid ${YN_HIGHLIGHT_COLORS.borderStrong}`,
      outlineOffset: "1px",
      backgroundColor: ynHexAlpha(YN_HIGHLIGHT_COLORS.borderStrong, 0.2)
    }
  };
  function ynEnsureHighlightStyles() {
    if (document.getElementById("yn-fill-styles")) return;
    const style = document.createElement("style");
    style.id = "yn-fill-styles";
    const paint = (state) => `outline:${YN_HIGHLIGHT[state].outline}!important;outline-offset:1px;background-color:${YN_HIGHLIGHT[state].backgroundColor}!important`;
    style.textContent = `.yn-fill-ok{${paint("filled")}}.yn-fill-check{${paint("check")}}.yn-fill-missed{${paint("missed")}}.yn-badge{position:fixed;top:12px;right:12px;z-index:2147483646;min-width:2.5rem;padding:4px 10px;border-radius:999px;background:` + YN_HIGHLIGHT_COLORS.primary + ";color:#fff;font:600 12px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none}";
    (document.head || document.documentElement).appendChild(style);
  }
  function ynHighlight(el, state) {
    if (!el || !el.classList) return;
    ynEnsureHighlightStyles();
    el.classList.remove("yn-fill-ok", "yn-fill-check", "yn-fill-missed");
    const paint = YN_HIGHLIGHT[state];
    if (!paint) return;
    el.classList.add(paint.cls);
    try {
      el.style.outline = paint.outline;
      el.style.outlineOffset = paint.outlineOffset;
      el.style.backgroundColor = paint.backgroundColor;
    } catch {
    }
  }
  function ynUpdateFillBadge(filled, total) {
    ynEnsureHighlightStyles();
    let badge = document.getElementById("yn-fill-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "yn-fill-badge";
      badge.className = "yn-badge";
      badge.setAttribute("aria-live", "polite");
      document.documentElement.appendChild(badge);
    }
    badge.textContent = `${filled}/${total}`;
  }
  function ynSelectorPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      if (cur.name) part += `[name="${CSS.escape(cur.name)}"]`;
      else {
        const parent = cur.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(
            (c) => c.tagName === cur.tagName
          );
          if (siblings.length > 1) {
            const idx = siblings.indexOf(cur) + 1;
            part += `:nth-of-type(${idx})`;
          }
        }
      }
      parts.unshift(part);
      if (cur.id) {
        parts[0] = `#${CSS.escape(cur.id)}`;
        break;
      }
      cur = cur.parentElement;
      if (parts.length > 8) break;
    }
    return parts.join(" > ");
  }

  // extension/src/kit/dom_fill_kit/index.js
  globalThis.ynKitGuards = ynKitGuards;
  globalThis.ynMakeEvent = ynMakeEvent;
  globalThis.ynKitInit = ynKitInit;
  globalThis.ynSetNativeValue = ynSetNativeValue;
  globalThis.ynQueryDeep = ynQueryDeep;
  globalThis.ynAdaFind = ynAdaFind;
  globalThis.ynAdaFindAll = ynAdaFindAll;
  globalThis.ynWaitFor = ynWaitFor;
  globalThis.ynBestOptionMatch = ynBestOptionMatch;
  globalThis.ynDriveCombobox = ynDriveCombobox;
  globalThis.ynDriveCascade = ynDriveCascade;
  globalThis.YN_TYPE_PACE_MS = YN_TYPE_PACE_MS;
  globalThis.ynTypeValuePerChar = ynTypeValuePerChar;
  globalThis.YN_RICH_TEXT_MARKERS = YN_RICH_TEXT_MARKERS;
  globalThis.ynIsPlainContentEditable = ynIsPlainContentEditable;
  globalThis.ynWriteContentEditablePlain = ynWriteContentEditablePlain;
  globalThis.ynUndoSession = ynUndoSession;
  globalThis.ynResetUndoSession = ynResetUndoSession;
  globalThis.ynStashForUndo = ynStashForUndo;
  globalThis.ynClearElementHighlight = ynClearElementHighlight;
  globalThis.ynUndoFill = ynUndoFill;
  globalThis.ynDataUrlToFile = ynDataUrlToFile;
  globalThis.ynFileInputAccepts = ynFileInputAccepts;
  globalThis.ynAttachFile = ynAttachFile;
  globalThis.ynDropFile = ynDropFile;
  globalThis.ynResolveDropTarget = ynResolveDropTarget;
  globalThis.ynFileAttachVisibleOk = ynFileAttachVisibleOk;
  globalThis.ynAttachFileWithConfirm = ynAttachFileWithConfirm;
  globalThis.YN_HIGHLIGHT_COLORS = YN_HIGHLIGHT_COLORS;
  globalThis.ynHexAlpha = ynHexAlpha;
  globalThis.YN_HIGHLIGHT = YN_HIGHLIGHT;
  globalThis.ynEnsureHighlightStyles = ynEnsureHighlightStyles;
  globalThis.ynHighlight = ynHighlight;
  globalThis.ynUpdateFillBadge = ynUpdateFillBadge;
  globalThis.ynSelectorPath = ynSelectorPath;
})();
