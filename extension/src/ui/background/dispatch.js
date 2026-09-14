// background.js — the message hub itself. The single-file version held
// every message type in one `switch (msg.type)` inside one `handle()`
// function; that switch alone ran to roughly a thousand lines, well over
// the 400-line module cap, so it is now eight smaller switches (msg_*.js,
// one per related group of message types — capture, fan-out, apply,
// jobs/listings, auth/status, imports, answer/field-map, save/click-
// tracking), each still under the cap. Every original `case "X": { ... }`
// body is unchanged — moved verbatim into its group's own switch, never
// rewritten — so a test that reads the SHIPPED bundle for a message type's
// own case body still finds the same code, just inside a smaller switch
// (see the killswitch/generic-fill/list-jobs/applied-confirmation test
// pins this migration updated for the +2-space indent a bundled file adds,
// documented in their own comments).
//
// handle() tries each group in turn and takes the first one whose own
// switch actually matched msg.type (a group's `default` returns undefined,
// which handle() reads as "not mine, try the next one" — every real case in
// every group always returns a genuine object, so undefined can never be
// mistaken for a real answer). This preserves the single switch's exact
// external behaviour: each message type is still handled by exactly one
// case body, in the same order handle() used to declare them, and an
// unrecognised type still falls all the way through to the same "unknown
// message type" refusal.
import { ynHandleCaptureMessages } from "./msg_capture.js";
import { ynHandleFanoutMessages } from "./msg_fanout.js";
import { ynHandleApplyMessages } from "./msg_apply.js";
import { ynHandleJobsMessages } from "./msg_jobs.js";
import { ynHandleAuthMessages } from "./msg_auth.js";
import { ynHandleImportMessages } from "./msg_imports.js";
import { ynHandleAnswerMessages } from "./msg_answer.js";
import { ynHandleSaveMessages } from "./msg_save.js";

const YN_MESSAGE_GROUPS = [
  ynHandleCaptureMessages,
  ynHandleFanoutMessages,
  ynHandleApplyMessages,
  ynHandleJobsMessages,
  ynHandleAuthMessages,
  ynHandleImportMessages,
  ynHandleAnswerMessages,
  ynHandleSaveMessages,
];

async function handle(msg, sender) {
  for (const group of YN_MESSAGE_GROUPS) {
    const r = await group(msg, sender);
    if (r !== undefined) return r;
  }
  return { ok: false, error: "unknown message type" };
}

export { handle };
