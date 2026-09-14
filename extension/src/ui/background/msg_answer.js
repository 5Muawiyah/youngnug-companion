// background.js — the answer/field-map message group: FETCH_FILE (an authed
// file as a data URL, for the filler), GENERATE_ANSWER (free-text/multiple-
// choice drafting), FIELD_MAP_CACHE_GET/SET (per employer+ats selector
// cache), OLLAMA_RESOLVE (last-resort local field mapping, loopback only).
// See dispatch.js for how handle() tries each message group in turn.
async function ynHandleAnswerMessages(msg, sender) {
  switch (msg.type) {
    case "FETCH_FILE": {
      // fetch an authed file (the CV pdf) for the filler; returns a data URL
      const r = await ynApi(msg.path);
      const blob = await r.blob();
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      return { ok: true, dataUrl, contentType: blob.type };
    }
    case "GENERATE_ANSWER": {
      // Free-text (or multiple-choice) form answers via POST
      // /api/apply/answer. No storage, no cache — answers are per-fill.
      // the caller (filler.js) turns every result here, success OR
      // refusal, into a DRAFT row — never a silent write — so this reads
      // the response body even on a non-2xx status (a plain ynApi() call
      // throws away the structured verdict/refs a 422 carries), a direct
      // fetch, same auth/stop-reason gate ynApi applies.
      const jobId = Number(msg.jobId);
      const question = typeof msg.question === "string" ? msg.question : "";
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return { ok: false, error: "bad jobId" };
      }
      if (!question || question.length > 300) {
        return { ok: false, error: "bad question" };
      }
      const body = { job_id: jobId, question };
      if (msg.maxChars != null && msg.maxChars !== "") {
        const mc = Number(msg.maxChars);
        if (Number.isFinite(mc) && mc > 0) body.max_chars = mc;
      }
      if (Array.isArray(msg.options) && msg.options.length) {
        body.options = msg.options.slice(0, 20).map((o) => String(o).slice(0, 200));
      }
      const s = await ynSettings();
      const stop = await ynStopReason(s);
      if (stop) return { ok: false, error: stop };
      let resp;
      try {
        resp = await fetch(s.apiBase + "/api/apply/answer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${s.token}`,
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
      let data = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
      if (resp.ok && data && typeof data.text === "string" && data.text) {
        return {
          ok: true,
          text: data.text,
          verdict: data.verdict || "clean",
          refs: Array.isArray(data.refs) ? data.refs : [],
        };
      }
      const detail = (data && data.detail) || "";
      return {
        ok: false,
        error:
          (typeof detail === "string" && detail) ||
          `HTTP ${resp.status}`,
        verdict: (data && data.verdict) || ["unknown"],
        refs: (data && Array.isArray(data.refs) && data.refs) || [],
      };
    }
    case "FIELD_MAP_CACHE_GET": {
      // per employer+ats: {version:1, fields:{fieldKey:selectorPath}}
      // heuristic/LLM rungs only — adapters are already deterministic
      const employer = String(msg.employer || "")
        .trim()
        .toLowerCase();
      const ats = String(msg.ats || "unknown")
        .trim()
        .toLowerCase();
      if (!employer || !ats) {
        return { ok: false, error: "employer and ats required" };
      }
      const key = `fieldmap:${ats}:${employer}`;
      const bag = await chrome.storage.local.get({ [key]: null });
      const entry = bag[key];
      if (!entry || !entry.fields) return { ok: true, entry: null };
      return { ok: true, entry };
    }
    case "FIELD_MAP_CACHE_SET": {
      const employer = String(msg.employer || "")
        .trim()
        .toLowerCase();
      const ats = String(msg.ats || "unknown")
        .trim()
        .toLowerCase();
      if (!employer || !ats) {
        return { ok: false, error: "employer and ats required" };
      }
      const key = `fieldmap:${ats}:${employer}`;
      const fields =
        msg.fields && typeof msg.fields === "object" ? msg.fields : {};
      // touchedAt feeds the storage GC's newest-200 bound.
      const entry = { version: 1, fields, touchedAt: Date.now() };
      await chrome.storage.local.set({ [key]: entry });
      return { ok: true, entry };
    }
    case "OLLAMA_RESOLVE": {
      // LAST-resort field mapping. Hard no-op unless the user has enabled
      // ollamaEnabled. Never a paid API; loopback only.
      const s = await ynSettings();
      // Loopback is still egress: the kill switch means nothing runs, and
      // this fetch used to be gated on ollamaEnabled alone, so a stopped
      // Companion still spoke to the local model.
      const ollamaStop = await ynStopReason(s);
      if (ollamaStop) return { ok: false, error: ollamaStop };
      if (s.ollamaEnabled !== true) {
        return { ok: false, error: "ollama disabled" };
      }
      const model = s.ollamaModel || "qwen2.5:7b";
      const prompt =
        msg.prompt ||
        "Map form field labels to profile keys. Reply with one JSON object only.";
      try {
        const resp = await fetch("http://127.0.0.1:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: { temperature: 0 },
          }),
        });
        if (!resp.ok) {
          return {
            ok: false,
            error: `ollama HTTP ${resp.status}`,
          };
        }
        const body = await resp.json();
        const text = (body && body.response) || "";
        // pull a single JSON object out of the model text (honest fail if none)
        const m = /\{[\s\S]*\}/.exec(text);
        if (!m) {
          return { ok: false, error: "no JSON object in ollama response" };
        }
        try {
          const parsed = JSON.parse(m[0]);
          return { ok: true, mapping: parsed, raw: text.slice(0, 500) };
        } catch (e) {
          return {
            ok: false,
            error: "ollama JSON parse failed: " + String(e),
          };
        }
      } catch (e) {
        return { ok: false, error: "ollama request failed: " + String(e) };
      }
    }
    default:
      return undefined;
  }
}

export { ynHandleAnswerMessages };
