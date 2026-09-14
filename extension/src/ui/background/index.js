// background.js — MV3 service worker: message hub between content scripts /
// popup and the YoungNug backend. LinkedIn/Glassdoor/Indeed are handled
// ONLY in the user's own session. No second account, no bypassed challenge.
//
// Split across this folder (extension/src/ui/background/) along the
// file's own seams: settings_sync.js (the server-settings cache refresh),
// resolve.js (the direct-link resolver's pure pairing decision),
// profile_fill_shape.js (the generic-fill profile shape + the
// SAVE_ANSWERS merge), capture_record.js (the app-tab broadcast + the
// durable last-capture record), fillable_jobs.js (the LIST_JOBS matcher's
// merge), storage_gc.js (the periodic key sweep) — plus eight msg_*.js
// files, one per related group of message types (dispatch.js's own header
// explains why the original single `switch (msg.type)` had to become
// eight smaller ones), dispatch.js (handle() itself, trying each group in
// turn) and worker_entry.js (install, the runtime message listener, the
// Capture keyboard shortcut) — plus this entry, which imports every module
// and re-exposes every one of the original file's top-level names onto
// globalThis exactly as the single-file version did. See
// extension/src/index.js for why that re-exposure is safe.
//
// Ordering note: esbuild evaluates an imported module's own top-level code
// before the code of the module that imports it, so in the built bundle
// every listener registration below (worker_entry.js's onInstalled/
// onMessage/onCommand) and storage_gc.js's fire-and-forget `ynStorageGc();`
// now run BEFORE this file's own `importScripts(...)` call, the reverse of
// the single-file version's textual order (there, importScripts was line 6,
// long before any listener was declared). This is safe because Chrome
// finishes executing the WHOLE classic script synchronously — registering a
// listener never invokes it — before any registered listener can fire or
// the event loop can run a queued microtask, so importScripts always
// completes before any real message, install, or command event is
// dispatched, whatever order the two appear in on the page. The one case
// this does not cover is importScripts itself throwing (a missing or
// broken common/*.js file): that aborts the worker's install outright
// regardless of how much of the script had already run, so no listener
// registered earlier survives to fire either. No module evaluated above
// this line reads a name importScripts defines (ynApi, ynInjectOnce,
// ynJitter, ynPingLiveness, ynSettings, ynStopReason, ynText, ynUnderCap,
// YN_CAPTURE_FILES, YN_LIVENESS_FILES, YN_LIVENESS_HOSTS) at its own
// top level — only inside functions that run later, once the whole script
// (and therefore importScripts) has already completed.
import { ynSyncServerSettings } from "./settings_sync.js";
import {
  YN_AGGREGATOR_HOSTS,
  YN_PENDING_RESOLVE_TTL_MS,
  YN_PENDING_RESOLVE_GC_MS,
  YN_RESOLVED_TTL_MS,
  YN_RESOLVED_MAX,
  ynSanitizeResolveUrl,
  ynHostIsAggregator,
  ynResolveDecision,
} from "./resolve.js";
import {
  YN_SAVABLE_SECTIONS,
  ynUsableText,
  ynRowHasConfirm,
  ynIsoMonth,
  ynSection,
  ynProfileFillShape,
  ynMergeSaveAnswers,
} from "./profile_fill_shape.js";
import { ynAnnounceToAppTabs, ynAnnounceImportStatus, ynCaptureHostOf, ynRecordLastCapture } from "./capture_record.js";
import { handle } from "./dispatch.js";
import { ynCaptureActiveTab } from "./worker_entry.js";
import { YN_FILLSTATE_TTL_MS, YN_FIELDMAP_MAX, ynStorageGc } from "./storage_gc.js";
import { YN_FILLABLE_STATUSES, ynMergeFillableJobs } from "./fillable_jobs.js";

importScripts("common/api.js", "common/inject_once.js", "common/user_scripts.js");

// Every name that was top-level in the single-file version, assigned onto
// globalThis exactly as every migrated entry does — see
// extension/src/index.js for why that is safe.
globalThis.ynSyncServerSettings = ynSyncServerSettings;
globalThis.YN_AGGREGATOR_HOSTS = YN_AGGREGATOR_HOSTS;
globalThis.YN_PENDING_RESOLVE_TTL_MS = YN_PENDING_RESOLVE_TTL_MS;
globalThis.YN_PENDING_RESOLVE_GC_MS = YN_PENDING_RESOLVE_GC_MS;
globalThis.YN_RESOLVED_TTL_MS = YN_RESOLVED_TTL_MS;
globalThis.YN_RESOLVED_MAX = YN_RESOLVED_MAX;
globalThis.ynSanitizeResolveUrl = ynSanitizeResolveUrl;
globalThis.ynHostIsAggregator = ynHostIsAggregator;
globalThis.ynResolveDecision = ynResolveDecision;
globalThis.YN_SAVABLE_SECTIONS = YN_SAVABLE_SECTIONS;
globalThis.ynUsableText = ynUsableText;
globalThis.ynRowHasConfirm = ynRowHasConfirm;
globalThis.ynIsoMonth = ynIsoMonth;
globalThis.ynSection = ynSection;
globalThis.ynProfileFillShape = ynProfileFillShape;
globalThis.ynMergeSaveAnswers = ynMergeSaveAnswers;
globalThis.ynAnnounceToAppTabs = ynAnnounceToAppTabs;
globalThis.ynAnnounceImportStatus = ynAnnounceImportStatus;
globalThis.ynCaptureHostOf = ynCaptureHostOf;
globalThis.ynRecordLastCapture = ynRecordLastCapture;
globalThis.handle = handle;
globalThis.ynCaptureActiveTab = ynCaptureActiveTab;
globalThis.YN_FILLSTATE_TTL_MS = YN_FILLSTATE_TTL_MS;
globalThis.YN_FIELDMAP_MAX = YN_FIELDMAP_MAX;
globalThis.ynStorageGc = ynStorageGc;
globalThis.YN_FILLABLE_STATUSES = YN_FILLABLE_STATUSES;
globalThis.ynMergeFillableJobs = ynMergeFillableJobs;
