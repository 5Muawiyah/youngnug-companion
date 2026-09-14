// popup.js — live connection status (a real /api/me ping, not token
// presence), capture / dry-run apply, kill switch, and the consent-gated
// LinkedIn profile import (only offered on linkedin.com/in/*).
//
// Split across this folder (extension/src/ui/popup/) along the file's
// own seams: status.js (connection status + the stop/restart handlers),
// capture_click.js (the Capture button), fill_report.js (the click-time
// fill file list + the fill-report renderer + the shared HTML-escaper),
// match_and_confirm.js (matching a tab to an approved job, the applied
// confirm strip), generic_fill.js (the any-page fallback), apply_click.js
// (the Apply button), undo_and_save.js (Undo + "Save to YoungNug"),
// imports.js (LinkedIn/GitHub profile import), posting.js (the employer
// Indeed-posting card), opts_and_resolver.js (the Options link, the
// direct-link resolver ping, the live-listing re-check ping),
// dev_selectors.js (the developer per-site capture selectors) — plus this
// entry, which imports each in the SAME relative order the single-file
// version declared them (so every side effect — a listener registration, an
// IIFE re-surfacing a pending confirm — still fires in that order) and
// re-exposes every one of the original file's top-level names onto
// globalThis exactly as the single-file version did. See
// extension/src/index.js for why that is safe.
import { el, activeTab, connectionHint, ynPaintKill, ynPaintContext, ynPaintWarning, refreshStatus } from "./status.js";
import { announceCapture, ynHostOfTab } from "./capture_click.js";
import { YN_FILL_SCRIPTS, ynRenderFillReport, escapeHtml } from "./fill_report.js";
import { ynRenderConfirmStrip, ynIndeedKeyOf, ynMatchJobByIndeedKey, ynMatchJobToTab, ynPickFrameResult } from "./match_and_confirm.js";
import { ynGenericFill } from "./generic_fill.js";
import "./apply_click.js";
import "./undo_and_save.js";
import { readSummary, importSummary, announceImport, setupLinkedInImport, setupGitHubImport } from "./imports.js";
import { YN_POSTING_SCRIPTS, ynRenderPostingReport, ynRenderPostConfirmStrip, setupIndeedPosting } from "./posting.js";
import { YN_RESOLVER_HOSTS, pingResolver, pingLiveness } from "./opts_and_resolver.js";
import {
  YN_DEV_RULES_KEY,
  YN_DEV_RULES_MAX,
  YN_DEV_HOST_RE,
  YN_DEV_SELECTOR_RE,
  ynValidHost,
  ynValidSelector,
  ynRenderDevRules,
  ynLoadDevRules,
  setupDevSection,
} from "./dev_selectors.js";

void refreshStatus();
void setupDevSection();
void setupLinkedInImport();
void setupGitHubImport();
void setupIndeedPosting();
void pingResolver();
void pingLiveness();

// Every name that was top-level in the single-file version, assigned onto
// globalThis exactly as every migrated entry does — see
// extension/src/index.js for why that is safe.
globalThis.el = el;
globalThis.activeTab = activeTab;
globalThis.connectionHint = connectionHint;
globalThis.ynPaintKill = ynPaintKill;
globalThis.ynPaintContext = ynPaintContext;
globalThis.ynPaintWarning = ynPaintWarning;
globalThis.refreshStatus = refreshStatus;
globalThis.announceCapture = announceCapture;
globalThis.ynHostOfTab = ynHostOfTab;
globalThis.YN_FILL_SCRIPTS = YN_FILL_SCRIPTS;
globalThis.ynRenderFillReport = ynRenderFillReport;
globalThis.escapeHtml = escapeHtml;
globalThis.ynRenderConfirmStrip = ynRenderConfirmStrip;
globalThis.ynIndeedKeyOf = ynIndeedKeyOf;
globalThis.ynMatchJobByIndeedKey = ynMatchJobByIndeedKey;
globalThis.ynMatchJobToTab = ynMatchJobToTab;
globalThis.ynPickFrameResult = ynPickFrameResult;
globalThis.ynGenericFill = ynGenericFill;
globalThis.readSummary = readSummary;
globalThis.importSummary = importSummary;
globalThis.announceImport = announceImport;
globalThis.setupLinkedInImport = setupLinkedInImport;
globalThis.setupGitHubImport = setupGitHubImport;
globalThis.YN_POSTING_SCRIPTS = YN_POSTING_SCRIPTS;
globalThis.ynRenderPostingReport = ynRenderPostingReport;
globalThis.ynRenderPostConfirmStrip = ynRenderPostConfirmStrip;
globalThis.setupIndeedPosting = setupIndeedPosting;
globalThis.YN_RESOLVER_HOSTS = YN_RESOLVER_HOSTS;
globalThis.pingResolver = pingResolver;
globalThis.pingLiveness = pingLiveness;
globalThis.YN_DEV_RULES_KEY = YN_DEV_RULES_KEY;
globalThis.YN_DEV_RULES_MAX = YN_DEV_RULES_MAX;
globalThis.YN_DEV_HOST_RE = YN_DEV_HOST_RE;
globalThis.YN_DEV_SELECTOR_RE = YN_DEV_SELECTOR_RE;
globalThis.ynValidHost = ynValidHost;
globalThis.ynValidSelector = ynValidSelector;
globalThis.ynRenderDevRules = ynRenderDevRules;
globalThis.ynLoadDevRules = ynLoadDevRules;
globalThis.setupDevSection = setupDevSection;
