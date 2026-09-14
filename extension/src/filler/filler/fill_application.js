// content/filler.js — ynFillApplication itself. The single-file version
// wrote this as one 776-line function; here it is four phase functions
// (fa_setup.js, fa_plan_execute.js, fa_hold_check.js, fa_finish.js, parts
// 7 to 10 of this shipped file's split) sharing one plain state object S
// instead of closure variables, run in the same order the single-file
// version's numbered steps ran in. A phase that hits a hard stop before
// any field is written sets S.earlyReturn; this function checks that
// straight after calling the phase that might have set it and returns the
// same value the single-file version would have returned at that exact
// point — every other phase always runs to completion (the single-file
// version had no early return past step 3b either). fa_finish's own
// return value is this function's return value, matching the single-file
// version's tail exactly. See index.js for the file's full history.
import { ynFillApplicationSetup } from "./fa_setup.js";
import { ynFillApplicationPlanAndExecute } from "./fa_plan_execute.js";
import { ynFillApplicationHoldCheck } from "./fa_hold_check.js";
import { ynFillApplicationFinish } from "./fa_finish.js";

export async function ynFillApplication(jobId) {
  const S = {};
  await ynFillApplicationSetup(jobId, S);
  if (S.earlyReturn) return S.earlyReturn;
  await ynFillApplicationPlanAndExecute(jobId, S);
  await ynFillApplicationHoldCheck(jobId, S);
  return await ynFillApplicationFinish(jobId, S);
}
