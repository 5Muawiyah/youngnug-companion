// background.js — the generic any-page fill: the profile, in the fill-plan
// shape. The fill-plan endpoint is gated on an Approved job and that gate
// stays — it is the product's one human gate. But an arbitrary web form has
// no job to approve, so the generic filler is fed from the profile the
// student already owns (GET /api/profile, the read the extension already
// makes for "Save my answers"). No new backend route, and nothing here is
// invented: every rule below mirrors the server's own fill plan so the two shapes cannot drift apart in meaning. Also
// carries the "Save to YoungNug" (answers half) merge: PURE merge for
// SAVE_ANSWERS (node-tested). ADD-only: only the confirmed, allowlisted
// keys are set; everything else in the user's existing section data is
// carried through untouched. Server-side profile_schema re-validates.
const YN_SAVABLE_SECTIONS = {
  answers: ["notice_period", "salary_expectation", "earliest_start"],
  eligibility: [
    "uk_right_to_work",
    "needs_sponsorship",
    "willing_to_relocate",
    "uk_driving_licence",
  ],
};

/** A usable string: present, non-blank, and not a [CONFIRM…] placeholder.
 * The CV strips those and so does the server's fill plan — a
 * "[CONFIRM - add your LinkedIn]" must never be typed into a form. */
function ynUsableText(value) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (!s || /\[CONFIRM/i.test(s)) return "";
  return s;
}

function ynRowHasConfirm(row) {
  for (const v of Object.values(row || {})) {
    if (typeof v === "string" && /\[CONFIRM/i.test(v)) return true;
  }
  return false;
}

/** "YYYY-MM" from a month/year pair, or "" when either is missing. Never
 * invents a month for a bare year — a made-up date is a made-up fact. */
function ynIsoMonth(month, year) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 1900 || y > 2200) return "";
  if (!Number.isInteger(m) || m < 1 || m > 12) return "";
  return `${y}-${String(m).padStart(2, "0")}`;
}

function ynSection(sections, name) {
  const v = sections && typeof sections === "object" ? sections[name] : null;
  return v && typeof v === "object" ? v : null;
}

function ynProfileFillShape(sections) {
  const src = sections && typeof sections === "object" ? sections : {};
  const contactRaw = ynSection(src, "contact") || {};
  const linksRaw = ynSection(src, "links") || {};
  const eligibility = ynSection(src, "eligibility") || {};
  const answersRaw = ynSection(src, "answers") || {};

  const contact = {};
  for (const key of [
    "first_name",
    "last_name",
    "middle_name",
    "email",
    "phone",
  ]) {
    const v = ynUsableText(contactRaw[key]);
    if (v) contact[key] = v;
  }

  // The links SECTION is canonical; the contact fallbacks only fill a gap.
  const links = {};
  for (const key of ["linkedin", "github", "portfolio"]) {
    const v = ynUsableText(linksRaw[key]) || ynUsableText(contactRaw[key]);
    if (v) links[key] = v;
  }

  // Only claim a country once there IS an address to attach it to — this
  // product collects UK addresses only, and a bare "United Kingdom" in an
  // otherwise empty address block is noise, not data.
  const address = {};
  const line1 = ynUsableText(contactRaw.address_line1);
  const city = ynUsableText(contactRaw.city);
  const postcode = ynUsableText(contactRaw.postcode);
  if (line1) address.line1 = line1;
  if (city) address.city = city;
  if (postcode) address.postcode = postcode;
  if (Object.keys(address).length) address.country = "United Kingdom";

  const education = [];
  for (const row of Array.isArray(src.education) ? src.education : []) {
    if (!row || typeof row !== "object" || ynRowHasConfirm(row)) continue;
    const institution = ynUsableText(row.name);
    if (!institution) continue;
    education.push({
      institution,
      qualification: ynUsableText(row.degree) || null,
      subject: ynUsableText(row.field_of_study) || null,
      grade:
        ynUsableText(row.grade_achieved) ||
        ynUsableText(row.grade_predicted) ||
        null,
      start: ynIsoMonth(row.start_month, row.start_year) || null,
      end: ynIsoMonth(row.end_month, row.end_year) || null,
      current: row.current === true,
    });
  }

  // Experience and volunteering share a row shape and both ARE work history
  // to a student with no paid job yet — pooled exactly as the server pools
  // them, so a school leaver is not shown as having done nothing.
  const work = [];
  for (const name of ["experience", "volunteering"]) {
    for (const row of Array.isArray(src[name]) ? src[name] : []) {
      if (!row || typeof row !== "object" || ynRowHasConfirm(row)) continue;
      const employer = ynUsableText(row.company);
      const title = ynUsableText(row.role);
      if (!employer && !title) continue;
      const bullets = (Array.isArray(row.bullets) ? row.bullets : [])
        .map((b) => ynUsableText(b))
        .filter(Boolean);
      work.push({
        employer: employer || null,
        title: title || null,
        start:
          ynUsableText(row.start) ||
          ynIsoMonth(row.start_month, row.start_year) ||
          null,
        end:
          ynUsableText(row.end) ||
          ynIsoMonth(row.end_month, row.end_year) ||
          null,
        current: row.current === true,
        description: bullets.join("; ") || null,
      });
    }
  }

  // SAFETY LINE, mirrored from the server: right to work and sponsorship
  // come ONLY from what the student stored. Never guessed, never derived,
  // never defaulted to true or false — an absent answer stays null and is
  // listed as unconfirmed so the filler leaves it for the student.
  const bool = (v) => (v === true || v === false ? v : null);
  const right_to_work = {
    uk_rtw: bool(eligibility.uk_right_to_work),
    needs_sponsorship: bool(eligibility.needs_sponsorship),
  };
  const eligibility_extra = {
    willing_to_relocate: bool(eligibility.willing_to_relocate),
    uk_driving_licence: bool(eligibility.uk_driving_licence),
  };
  const answers = {
    notice_period: ynUsableText(answersRaw.notice_period) || null,
    salary_expectation: ynUsableText(answersRaw.salary_expectation) || null,
    earliest_start: ynUsableText(answersRaw.earliest_start) || null,
  };
  const unconfirmed_answers = Object.entries({
    ...right_to_work,
    ...answers,
    ...eligibility_extra,
  })
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  return {
    // This is NOT an application: there is no job, no CV version and no
    // letter, so the shape carries none of them and the filler reports a CV
    // upload field as one it could not fill rather than attaching something
    // that does not exist. `auto_submit` is absent here for the same reason
    // it is absent from the server's plan: there is no such code path.
    generic: true,
    contact,
    address,
    links,
    education,
    work,
    right_to_work,
    eligibility_extra,
    answers,
    unconfirmed_answers,
    dry_run: true,
  };
}

function ynMergeSaveAnswers(items, sections) {
  const bySection = {};
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object") continue;
    const section = String(it.section || "");
    const key = String(it.key || "");
    const allowed = YN_SAVABLE_SECTIONS[section];
    if (!allowed || !allowed.includes(key)) continue;
    let value;
    if (section === "eligibility") {
      if (it.value !== true && it.value !== false) continue;
      value = it.value;
    } else {
      if (typeof it.value !== "string" || !it.value.trim()) continue;
      value = it.value.trim().slice(0, 100);
    }
    (bySection[section] = bySection[section] || {})[key] = value;
  }
  const puts = [];
  for (const [section, patch] of Object.entries(bySection)) {
    const current =
      sections && sections[section] && typeof sections[section] === "object"
        ? sections[section]
        : {};
    puts.push({
      section,
      data: { ...current, ...patch },
      savedKeys: Object.keys(patch),
    });
  }
  return puts;
}

export {
  YN_SAVABLE_SECTIONS,
  ynUsableText,
  ynRowHasConfirm,
  ynIsoMonth,
  ynSection,
  ynProfileFillShape,
  ynMergeSaveAnswers,
};
