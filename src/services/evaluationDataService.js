import { supabase } from "../lib/supabase";
import { computeAdminCooperation } from "./evaluationService";

// =========================================================
// BEAST Workspace｜教師考核 v2
// 考核年度 = 下學期 + 上學期（例：2026 = 114 下 + 115 上）
// 每個年度一份設定（evaluation_settings key = "year:2026"），可結算封存
// =========================================================

const SETTINGS = "evaluation_settings";

// ---------------------------------------------------------
// 年度與學期
// ---------------------------------------------------------

export function currentEvaluationYear(now = new Date()) {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

export function evaluationYearInfo(year) {
  const roc = year - 1911;
  return {
    year,
    label: `${year} 考核年度`,
    semesters: `${roc - 1} 下＋${roc} 上`,
    range: { from: `${year}-02-01`, to: `${year + 1}-01-31` },
    spring: { label: `${roc - 1} 下`, from: `${year}-02-01`, to: `${year}-07-31` },
    fall: { label: `${roc} 上`, from: `${year}-08-01`, to: `${year + 1}-01-31` },
  };
}

/** 系統從 2026 年度（115 上）開始；之後每年 2/1 自動多一個年度 */
export const FIRST_EVALUATION_YEAR = 2026;

export function availableEvaluationYears(now = new Date()) {
  const last = Math.max(FIRST_EVALUATION_YEAR, currentEvaluationYear(now));
  const years = [];
  for (let y = last; y >= FIRST_EVALUATION_YEAR; y -= 1) years.push(y);
  return years;
}

// ---------------------------------------------------------
// 年度設定
// ---------------------------------------------------------

export function defaultYearSettings(year) {
  return {
    w: { A: 25, B: 30, C: 30, D: 15 },
    springWeight: 50,
    // 2026 年度的 114 下系統還沒上線 → 手動輸入每月考核與暑假營隊
    springMode: year <= FIRST_EVALUATION_YEAR ? "manual" : "system",
    perDay: 1,
    attendancePenalty: 10,
    baseline: { 1: 90, 2: 90, 3: 90, 4: 85, 5: 80, 6: 80 },
    campTarget: 70,
    courseTarget: 50,
    courseIds: [],
    countScore: [100, 70, 40],
    bonusCap: 10,
    base_months: 1,
    leader_bonus: 0,
    bands: [
      { min: 95, factor: 1.3 },
      { min: 90, factor: 1.2 },
      { min: 80, factor: 1.0 },
      { min: 70, factor: 0.8 },
      { min: 60, factor: 0.6 },
      { min: -9999, factor: 0.4 },
    ],
    salaries: {},
    leaders: [],
    manual: {},
    locked: false,
    lockedAt: null,
    snapshot: null,
  };
}

export async function getYearSettings(year) {
  const { data, error } = await supabase
    .from(SETTINGS)
    .select("key, value")
    .in("key", [`year:${year}`, "year_end"]);
  if (error) throw error;
  const own = data?.find((r) => r.key === `year:${year}`)?.value;
  const base = defaultYearSettings(year);
  if (own) return { ...base, ...own, w: { ...base.w, ...(own.w || {}) }, baseline: { ...base.baseline, ...(own.baseline || {}) } };
  // 第一次打開：沿用舊版設定裡的月薪、組長、月數
  const legacy = data?.find((r) => r.key === "year_end")?.value || {};
  return {
    ...base,
    salaries: legacy.salaries || {},
    leaders: legacy.leaders || [],
    base_months: legacy.base_months ?? base.base_months,
    leader_bonus: legacy.leader_bonus ?? base.leader_bonus,
  };
}

export async function saveYearSettings(year, value) {
  const { error } = await supabase
    .from(SETTINGS)
    .upsert({ key: `year:${year}`, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------------------------------------------------------
// 抓資料（Supabase 一次最多 1000 筆，分頁抓完）
// ---------------------------------------------------------

async function fetchAll(table, select) {
  const rows = [];
  const size = 1000;
  for (let from = 0; from < 50000; from += size) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return rows;
}

const SOURCES = {
  classTeachers: ["class_teachers", "class_id, teacher_id"],
  classes: ["classes", "id, class_name, course_type, start_date, end_date"],
  classStudents: ["class_students", "id, class_id, student_id, joined_at, left_at, status"],
  students: ["students", "id, chinese_name, current_grade, is_test"],
  exams: ["score_exams", "id, title, exam_date, exam_type, exam_period, is_active"],
  examClasses: ["score_exam_classes", "id, exam_id, class_id"],
  examStudents: ["score_exam_students", "id, exam_class_id, student_id, grade_snapshot, is_active"],
  examSubjects: ["score_exam_subjects", "exam_student_id, score, status"],
  camps: ["camps", "id, name, camp_type, start_date, end_date"],
  campRegs: ["camp_period_students", "camp_id, student_id"],
  campStudents: ["camp_students", "id, chinese_name"],
  courses: ["courses", "id, course_name"],
  courseClasses: ["course_classes", "id, course_id"],
  courseStudents: ["course_class_students", "course_class_id, student_id, joined_at, left_at, is_active"],
  leaves: ["teacher_leave_records", "id, teacher_id, start_date, is_last_minute"],
  withdrawals: ["evaluation_withdrawals", "class_student_id, reason, deduct"],
};

export async function loadEvaluationSources() {
  const entries = Object.entries(SOURCES);
  const errors = [];
  const results = await Promise.all(
    entries.map(([key, [table, select]]) =>
      fetchAll(table, select).catch((error) => {
        console.error(`讀取 ${table} 失敗：`, error);
        errors.push(table);
        return [];
      })
    )
  );
  const out = Object.fromEntries(entries.map(([key], i) => [key, results[i]]));
  out.errors = errors;
  return out;
}

export async function saveWithdrawal(classStudentId, { reason, deduct }) {
  const { error } = await supabase.from("evaluation_withdrawals").upsert({
    class_student_id: classStudentId,
    reason: reason?.trim() || null,
    deduct: Boolean(deduct),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------
// 計算
// ---------------------------------------------------------

const GRADE_WORDS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

export function parseGrade(text) {
  if (text === null || text === undefined) return null;
  const s = String(text);
  const digit = s.match(/[1-6]/);
  if (digit) return Number(digit[0]);
  const word = s.match(/[一二三四五六]/);
  return word ? GRADE_WORDS[word[0]] : null;
}

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const clamp = (x) => Math.max(0, Math.min(100, x));
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const inRange = (day, r) => Boolean(day) && day >= r.from && day <= r.to;
const todayText = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function countScore(n, s) {
  const [zero, one, more] = s.countScore || [100, 70, 40];
  return n <= 0 ? zero : n === 1 ? one : more;
}

function factorFor(total, bands) {
  const sorted = [...(bands || [])].sort((a, b) => Number(b.min) - Number(a.min));
  const hit = sorted.find((b) => total >= Number(b.min));
  return hit ? Number(hit.factor) : 1;
}

/** 依名單、學期與各來源算出某位老師某學期的 A/B/C/D */
export function computeSystemSemester({ teacherId, range, sources, events, assignments, exclusions, settings, typeMap }) {
  const classIds = new Set(sources.classTeachers.filter((r) => r.teacher_id === teacherId).map((r) => r.class_id));
  const studentMap = new Map(sources.students.map((s) => [s.id, s]));

  const roster = sources.classStudents.filter(
    (r) =>
      classIds.has(r.class_id) &&
      (!r.joined_at || r.joined_at <= range.to) &&
      (!r.left_at || r.left_at >= range.from) &&
      !studentMap.get(r.student_id)?.is_test
  );
  const enrolledIds = new Set(roster.map((r) => r.student_id));
  const activeOn = (day) =>
    new Set(roster.filter((r) => (!r.joined_at || r.joined_at <= day) && (!r.left_at || r.left_at >= day)).map((r) => r.student_id));

  // ---- B 留班率 ----
  const withdrawalMap = new Map(sources.withdrawals.map((w) => [w.class_student_id, w]));
  const leftList = roster
    .filter((r) => r.left_at && inRange(r.left_at, range))
    .map((r) => {
      const w = withdrawalMap.get(r.id);
      return {
        id: r.id,
        studentName: studentMap.get(r.student_id)?.chinese_name || "學生",
        leftAt: r.left_at,
        reason: w?.reason || "",
        deduct: w ? w.deduct : true,
        recorded: Boolean(w),
      };
    })
    .sort((a, b) => b.leftAt.localeCompare(a.leftAt));
  const deducted = leftList.filter((l) => l.deduct).length;
  const retention = enrolledIds.size ? clamp((1 - deducted / enrolledIds.size) * 100) : null;

  // ---- A 成績達標率 ----
  const examIds = new Set(sources.exams.filter((e) => e.is_active !== false && inRange(e.exam_date, range)).map((e) => e.id));
  const examClassIds = new Set(sources.examClasses.filter((c) => examIds.has(c.exam_id) && classIds.has(c.class_id)).map((c) => c.id));
  const examStudents = sources.examStudents.filter((s) => examClassIds.has(s.exam_class_id) && s.is_active !== false);
  const scoreMap = new Map();
  for (const sub of sources.examSubjects) {
    if (sub.status !== "SCORED" || sub.score === null || sub.score === undefined) continue;
    if (!scoreMap.has(sub.exam_student_id)) scoreMap.set(sub.exam_student_id, []);
    scoreMap.get(sub.exam_student_id).push(Number(sub.score));
  }
  let examPass = 0;
  let examTotal = 0;
  for (const es of examStudents) {
    const scores = scoreMap.get(es.id);
    if (!scores?.length) continue;
    const grade = parseGrade(es.grade_snapshot) || parseGrade(studentMap.get(es.student_id)?.current_grade);
    const line = Number(settings.baseline?.[grade] ?? 85);
    examTotal += 1;
    if (avg(scores) >= line) examPass += 1;
  }
  const examRate = examTotal ? clamp((examPass / examTotal) * 100) : null;

  // ---- D 營隊報名率（營隊開始日落在學期內）----
  const campStudentName = new Map(sources.campStudents.map((c) => [c.id, (c.chinese_name || "").trim()]));
  const camps = sources.camps.filter((c) => inRange(c.start_date, range));
  let campSigned = 0;
  let campBase = 0;
  for (const camp of camps) {
    const names = new Set(sources.campRegs.filter((r) => r.camp_id === camp.id).map((r) => campStudentName.get(r.student_id)).filter(Boolean));
    const day = camp.start_date < todayText() ? camp.start_date : [range.to, todayText()].sort()[0];
    const active = [...activeOn(day)];
    campBase += active.length;
    campSigned += active.filter((id) => names.has((studentMap.get(id)?.chinese_name || "").trim())).length;
  }
  const campRate = camps.length && campBase ? (campSigned / campBase) * 100 : null;

  // ---- D 平日課程報名率 ----
  const courseFilter = new Set(settings.courseIds || []);
  const courseClassIds = new Set(
    sources.courseClasses.filter((c) => !courseFilter.size || courseFilter.has(c.course_id)).map((c) => c.id)
  );
  const courseStudentIds = new Set(
    sources.courseStudents
      .filter(
        (c) =>
          courseClassIds.has(c.course_class_id) &&
          (!c.joined_at || c.joined_at <= range.to) &&
          (!c.left_at || c.left_at >= range.from)
      )
      .map((c) => c.student_id)
  );
  const courseDay = [range.to, todayText()].sort()[0];
  const courseActive = [...activeOn(courseDay)];
  const courseSigned = courseActive.filter((id) => courseStudentIds.has(id)).length;
  const courseRate = courseActive.length ? (courseSigned / courseActive.length) * 100 : null;

  // ---- 事件 ----
  const own = events.filter(
    (e) => e.teacher_id === teacherId && inRange(e.event_date, range) && !["void", "disputed", "disputing"].includes(e.status)
  );
  const countOf = (...names) => own.filter((e) => names.includes(e.type_name)).length;
  const safety = countOf("安全問題");
  const complaint = countOf("家長客訴");
  const mistakes = countOf("工作疏失", "沒交接");
  const lateEvents = countOf("遲到", "臨時請假");
  const lastMinuteLeaves = sources.leaves.filter((l) => l.teacher_id === teacherId && l.is_last_minute && inRange(l.start_date, range)).length;
  const bonusEvents = own.filter((e) => Number(e.points) > 0 && typeMap?.[e.type_name]?.direction !== "minus");

  // ---- C 任務 ----
  const admin = computeAdminCooperation(assignments, teacherId, {
    from: range.from,
    to: range.to,
    perDay: settings.perDay,
    exclusions,
  });

  const ind = (key, name, detail, score, source) => ({ key, name, detail, score: score === null ? null : Math.round(score * 10) / 10, source });
  const baselineText = [3, 4, 5, 6].map((g) => `${g}年級${settings.baseline?.[g]}`).join("／");

  const categories = {
    A: [
      ind("exam", "成績達標率", examTotal ? `${examPass}/${examTotal} 人次達基準線（${baselineText}）` : "這學期還沒有成績資料", examRate, "系統"),
      ind("inspect_hw", "作業／訂正／評量抽查", "2027 起實施", null, "抽查"),
    ],
    B: [
      ind("retention", "留班率", `在班 ${enrolledIds.size} 人・退班 ${leftList.length} 人・列入扣分 ${deducted} 人`, retention, "系統"),
      ind("safety", "安全事件", `${safety} 次`, countScore(safety, settings), "事件"),
      ind("complaint", "家長客訴", `${complaint} 次`, countScore(complaint, settings), "事件"),
    ],
    C: [
      ind("tasks", "任務準時率", `準時 ${admin.onTime}/${admin.total}・逾期 ${admin.overdueDays} 天`, admin.total ? clamp(100 - admin.overdueDays * Number(settings.perDay || 0)) : null, "系統"),
      ind("attendance", "出勤", `臨時請假 ${lastMinuteLeaves + countOf("臨時請假")}・遲到 ${countOf("遲到")}`, clamp(100 - (lastMinuteLeaves + lateEvents) * Number(settings.attendancePenalty || 0)), "系統"),
      ind("mistakes", "工作疏失／沒交接", `${mistakes} 次`, countScore(mistakes, settings), "事件"),
      ind("inspect_env", "教室環境抽查", "2027 起實施", null, "抽查"),
    ],
    D: [
      ind("camp", "營隊報名率", camps.length ? `${campSigned}/${campBase}（${pct(campSigned, campBase)}%）・目標 ${settings.campTarget}%` : "這學期沒有營隊", campRate === null ? null : clamp((campRate / Number(settings.campTarget || 100)) * 100), "系統"),
      ind("course", "平日課程報名率", courseActive.length ? `${courseSigned}/${courseActive.length}（${pct(courseSigned, courseActive.length)}%）・目標 ${settings.courseTarget}%` : "沒有在班學生", courseRate === null ? null : clamp((courseRate / Number(settings.courseTarget || 100)) * 100), "系統"),
    ],
  };

  const catScores = Object.fromEntries(
    Object.entries(categories).map(([k, list]) => [k, avg(list.filter((i) => i.score !== null).map((i) => i.score))])
  );

  return { mode: "system", categories, catScores, score: weighted(catScores, settings.w), leftList, admin, bonusEvents };
}

function weighted(catScores, w) {
  let sum = 0;
  let weight = 0;
  for (const k of ["A", "B", "C", "D"]) {
    if (catScores[k] === null || catScores[k] === undefined) continue;
    sum += catScores[k] * Number(w[k] || 0);
    weight += Number(w[k] || 0);
  }
  return weight ? sum / weight : null;
}

/** 手動學期（2026 年度的 114 下）：每月考核平均代替 A＋B＋C，營隊報名率當 D */
export function computeManualSemester(teacherId, settings) {
  const m = settings.manual?.[teacherId] || {};
  const monthly = (m.monthly || []).map(Number).filter((x) => !Number.isNaN(x) && x > 0);
  const monthlyAvg = avg(monthly);
  const campTotal = Number(m.campTotal) || 0;
  const campRate = campTotal ? (Number(m.campSigned || 0) / campTotal) * 100 : null;
  const campScore = campRate === null ? null : clamp((campRate / Number(settings.campTarget || 100)) * 100);
  const wD = Number(settings.w.D || 0);
  const wABC = Number(settings.w.A || 0) + Number(settings.w.B || 0) + Number(settings.w.C || 0);
  let score = null;
  if (monthlyAvg !== null && campScore !== null) score = (monthlyAvg * wABC + campScore * wD) / (wABC + wD);
  else if (monthlyAvg !== null) score = monthlyAvg;
  return { mode: "manual", monthly: m.monthly || [], monthlyAvg, campSigned: m.campSigned, campTotal: m.campTotal, campRate, campScore, score };
}

/** 一位老師的年度結果 */
export function computeTeacherYear({ teacher, info, sources, events, assignments, exclusions, settings, typeMap }) {
  const common = { sources, events, assignments, exclusions, settings, typeMap, teacherId: teacher.id };
  const spring =
    settings.springMode === "manual"
      ? computeManualSemester(teacher.id, settings)
      : computeSystemSemester({ ...common, range: info.spring });
  const fall = computeSystemSemester({ ...common, range: info.fall });

  const sw = Number(settings.springWeight ?? 50);
  let base = null;
  if (spring.score !== null && fall.score !== null) base = (spring.score * sw + fall.score * (100 - sw)) / 100;
  else base = spring.score ?? fall.score;

  // 額外加分：整個考核年度內的加分事件（含 114 下補登）
  const bonusList = events.filter(
    (e) =>
      e.teacher_id === teacher.id &&
      inRange(e.event_date, info.range) &&
      Number(e.points) > 0 &&
      !["void", "disputed", "disputing"].includes(e.status)
  );
  const bonusRaw = bonusList.reduce((a, e) => a + Number(e.points || 0), 0);
  const bonus = Math.min(Number(settings.bonusCap ?? 10), bonusRaw);
  const total = base === null ? null : Math.round((base + bonus) * 10) / 10;
  const factor = total === null ? null : factorFor(total, settings.bands);
  const salary = Number(settings.salaries?.[teacher.id]) || 0;
  const isLeader = (settings.leaders || []).includes(teacher.id);
  const pay = factor === null ? 0 : salary * Number(settings.base_months || 0) * factor + (isLeader ? Number(settings.leader_bonus || 0) : 0);

  return { teacher, spring, fall, bonus, bonusRaw, bonusList, base, total, factor, salary, isLeader, pay };
}
