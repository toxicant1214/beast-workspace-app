import { supabase } from "../lib/supabase";
import { computeAdminCooperation } from "./evaluationService";

// =========================================================
// BEAST Workspace｜教師考核 v3
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
    spring: { key: "spring", label: `${roc - 1} 下`, from: `${year}-02-01`, to: `${year}-07-31`, academicYear: String(roc - 1), term: "下" },
    fall: { key: "fall", label: `${roc} 上`, from: `${year}-08-01`, to: `${year + 1}-01-31`, academicYear: String(roc), term: "上" },
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

export const DEFAULT_INSPECTION_ITEMS = {
  hw: [
    { id: "hw1", name: "進度未達標", points: 10 },
    { id: "hw2", name: "過多未批閱", points: 15 },
    { id: "hw3", name: "批改有錯誤", points: 10 },
    { id: "hw4", name: "批改不仔細（沒標出錯處）", points: 5 },
    { id: "hw5", name: "訂正未完成／未追訂正", points: 10 },
    { id: "hw6", name: "評量未訂正", points: 10 },
    { id: "hw7", name: "缺交未追蹤、未登記", points: 10 },
    { id: "hw8", name: "聯絡簿未簽閱、未填寫", points: 5 },
  ],
  env: [
    { id: "env1", name: "地面髒亂、有垃圾", points: 10 },
    { id: "env2", name: "垃圾桶滿了沒倒", points: 5 },
    { id: "env3", name: "桌椅未歸位", points: 5 },
    { id: "env4", name: "書櫃、物品凌亂", points: 5 },
    { id: "env5", name: "白板沒擦", points: 5 },
    { id: "env6", name: "布置或公告過期", points: 5 },
    { id: "env7", name: "電器未關", points: 10 },
    { id: "env8", name: "安全隱患（延長線、尖銳物、地面濕滑）", points: 15 },
  ],
};

export function defaultYearSettings(year) {
  return {
    w: { A: 25, B: 30, C: 30, D: 15 },
    springWeight: 50,
    // 2026 年度的 114 下系統還沒上線 → 手動輸入每月考核與暑假營隊
    springMode: year <= FIRST_EVALUATION_YEAR ? "manual" : "system",
    perDay: 1,
    attendancePenalty: 10,
    baseline: { 1: 90, 2: 90, 3: 90, 4: 88, 5: 85, 6: 85 },
    subjectPenalty: 3,
    campTarget: 70,
    // 營隊（寒假算上學期、暑假算下學期）依年級設報名率目標，達標 100 分
    campTargets: { 1: 70, 2: 70, 3: 70, 4: 70, 5: 65, 6: 65 },
    courseTarget: 50,
    courseIds: [],
    disabledIndicators: [],
    disabledBySem: { spring: [], fall: [] },
    inspectionItems: JSON.parse(JSON.stringify(DEFAULT_INSPECTION_ITEMS)),
    inspections: [],
    // 成績記在教室系統：預設由主管每學期手動填「達標人數／應考人數」
    examMode: "manual",
    manualExam: {},
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
  if (own)
    return {
      ...base,
      ...own,
      w: { ...base.w, ...(own.w || {}) },
      baseline: { ...base.baseline, ...(own.baseline || {}) },
      campTargets: { ...base.campTargets, ...(own.campTargets || {}) },
    };
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
  exams: ["score_exams", "id, title, exam_date, exam_type, exam_period, academic_year, term, is_active"],
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
  singleDay: ["single_day_courses", "id, course_name, course_date, status"],
  singleDayStudents: ["single_day_course_students", "single_day_course_id, student_id"],
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

// ---------------------------------------------------------
// 學期資料（主管在「學期資料」分頁一位一位填）
// settings.semData[spring|fall][teacherId] =
//   { taught, grade, start, moves:[{date,name,type,reason,deduct}], midP, midT, finP, finT, camp, monthly:[] }
// ---------------------------------------------------------

/** 開學基準日：上學期 9/1、下學期 2/15（之後的進出班才算學期中異動） */
export function semesterStartDay(range) {
  const y = range.from.slice(0, 4);
  return range.key === "fall" ? `${y}-09-01` : `${y}-02-15`;
}

/** 讀學期資料，沿用舊版欄位（manual / manualCamp / manualExam）當預設 */
export function semEntry(settings, key, teacherId) {
  const own = settings.semData?.[key]?.[teacherId];
  if (own) return own;
  const legacy = {};
  if (key === "spring") {
    const m = settings.manual?.[teacherId] || {};
    if (m.monthly) legacy.monthly = m.monthly;
    if (m.campSigned !== undefined && m.campSigned !== "") legacy.camp = m.campSigned;
    if (m.campTotal !== undefined && m.campTotal !== "") legacy.start = m.campTotal;
    if (m.grade) legacy.grade = m.grade;
  }
  const c = settings.manualCamp?.[key]?.[teacherId] || {};
  if (c.signed !== undefined && c.signed !== "") legacy.camp = c.signed;
  if (c.total !== undefined && c.total !== "") legacy.start = c.total;
  if (c.grade) legacy.grade = c.grade;
  const e = settings.manualExam?.[key]?.[teacherId] || {};
  if (e.total) {
    legacy.midP = e.pass;
    legacy.midT = e.total;
  }
  return legacy;
}

const has = (v) => v !== undefined && v !== null && v !== "";

export const SUBJECTS = ["國語", "數學", "社會", "自然"];

// ---------------------------------------------------------
// 抽查：全校一次做完，每位老師勾問題扣分，可手動調整
// settings.inspections = [{ id, type:"hw"|"env", date, results:{ [tid]: { issues:[itemId], custom:[{name,points}], override, note, skip } } }]
// ---------------------------------------------------------
export const INSPECTION_TYPES = { hw: "作業／評量／訂正抽查", env: "教室環境抽查" };

/** 一位老師在一次抽查的分數（不計或沒資料回傳 null） */
export function inspectionScore(insp, teacherId, settings) {
  const res = insp.results?.[teacherId];
  if (!res || res.skip) return null;
  if (has(res.override)) return clamp(Number(res.override));
  const items = settings.inspectionItems?.[insp.type] || [];
  const lost =
    (res.issues || []).reduce((sum, id) => sum + (Number(items.find((i) => i.id === id)?.points) || 0), 0) +
    (res.custom || []).reduce((sum, c) => sum + (Number(c.points) || 0), 0);
  return clamp(100 - lost);
}

function inspectionIndicator(type, teacherId, range, settings) {
  const list = (settings.inspections || []).filter((i) => i.type === type && inRange(i.date, range) && i.results?.[teacherId]);
  const scores = list.map((i) => ({ date: i.date, score: inspectionScore(i, teacherId, settings) })).filter((x) => x.score !== null);
  if (!scores.length) return { score: null, detail: "這學期還沒有抽查" };
  return {
    score: avg(scores.map((x) => x.score)),
    detail: `${scores.length} 次：${scores.map((x) => `${x.date.slice(5).replace("-", "/")} ${Math.round(x.score)}`).join("・")}`,
  };
}

/** 畢業班（下學期帶六年級）預設不計暑假營隊；可手動改 */
export function campExcluded(entry, key, grade) {
  if (entry.noCamp !== undefined) return Boolean(entry.noCamp);
  return key === "spring" && Number(grade) === 6;
}

/** 營隊報名率（%）：直接填的報名率優先；舊資料用報名人數 ÷ 人數換算 */
export function campRateOf(entry, size) {
  if (has(entry.campRate)) return Number(entry.campRate);
  if (has(entry.camp) && size) return (Number(entry.camp) / size) * 100;
  return null;
}

/** 系統名單：開學人數與學期中的進出班（只有系統上線後的學期才有） */
export function systemRoster(teacherId, range, sources) {
  const classIds = new Set(sources.classTeachers.filter((r) => r.teacher_id === teacherId).map((r) => r.class_id));
  const studentMap = new Map(sources.students.map((s) => [s.id, s]));
  const startDay = semesterStartDay(range);
  const roster = sources.classStudents.filter(
    (r) =>
      classIds.has(r.class_id) &&
      (!r.joined_at || r.joined_at <= range.to) &&
      (!r.left_at || r.left_at >= range.from) &&
      !studentMap.get(r.student_id)?.is_test
  );
  const startCount = new Set(
    roster.filter((r) => (!r.joined_at || r.joined_at <= startDay) && (!r.left_at || r.left_at >= startDay)).map((r) => r.student_id)
  ).size;
  const withdrawalMap = new Map(sources.withdrawals.map((w) => [w.class_student_id, w]));
  const moves = [];
  for (const r of roster) {
    const name = studentMap.get(r.student_id)?.chinese_name || "學生";
    if (r.joined_at && r.joined_at > startDay && r.joined_at <= range.to) {
      moves.push({ id: `in-${r.id}`, classStudentId: r.id, date: r.joined_at, name, type: "進班", auto: true });
    }
    if (r.left_at && r.left_at >= startDay && r.left_at <= range.to) {
      const w = withdrawalMap.get(r.id);
      moves.push({ id: `out-${r.id}`, classStudentId: r.id, date: r.left_at, name, type: "退班", reason: w?.reason || "", deduct: w ? w.deduct : true, auto: true });
    }
  }
  moves.sort((a, b) => a.date.localeCompare(b.date));
  return { startCount, moves, studentIds: new Set(roster.map((r) => r.student_id)) };
}

/** 整理一位老師一學期的基本資料（任教、年級、人數、進退班） */
export function semesterBasics({ teacherId, range, sources, settings, systemData = true }) {
  const entry = semEntry(settings, range.key, teacherId);
  const sys = systemData ? systemRoster(teacherId, range, sources) : { startCount: 0, moves: [], studentIds: new Set() };
  const taught = entry.taught !== false;
  const grade = Number(entry.grade) || (range.key === "fall" ? teacherClassGrade(teacherId, sources) : null) || null;
  const start = has(entry.start) ? Number(entry.start) : sys.startCount || null;
  const manualMoves = (entry.moves || []).map((m, i) => ({ ...m, id: `m-${i}`, manualIndex: i }));
  const moves = [...sys.moves, ...manualMoves];
  const joins = moves.filter((m) => m.type === "進班").length;
  const leaves = moves.filter((m) => m.type === "退班");
  const size = start === null ? null : Math.max(0, start + joins - leaves.length);
  const deducted = leaves.filter((m) => m.deduct).length;
  // 某一天的班上人數：開學人數＋那天以前的進班－那天以前的退班
  const sizeAt = (day) => {
    if (start === null) return null;
    const before = moves.filter((m) => m.date && m.date <= day);
    return Math.max(0, start + before.filter((m) => m.type === "進班").length - before.filter((m) => m.type === "退班").length);
  };
  return { entry, taught, grade, start, startFromSystem: !has(entry.start) && Boolean(sys.startCount), moves, joins, leaves, size, deducted, studentIds: sys.studentIds, sizeAt };
}

/** 單日課程：老師班上學生這學期報名的人次（同一人報兩堂算 2） */
/**
 * 單日課程手填總表：settings.singleDay[spring|fall] =
 *   { courses:[{ id, name, date, schoolTotal, enrolled }], counts:{ [classId]: { [courseId]: n } } }
 * date＝上課日（抓當天班上人數）、schoolTotal＝當時全校安親人數、enrolled＝全校報名人數（不含美語，貼上時自動加總）
 */
export function singleDayBlock(settings, key) {
  return settings.singleDay?.[key] || { courses: [], counts: {} };
}

/** 一堂課的全校報名人數：有填用填的，沒填就加總總表上各班 */
export function courseEnrolled(block, course) {
  if (has(course.enrolled)) return Number(course.enrolled);
  return Object.values(block.counts || {}).reduce((sum, row) => sum + (Number(row?.[course.id]) || 0), 0);
}

/** 單日課程：老師的人次、每堂課當天班上人數的加總、全校平均 */
function courseStats(teacherId, b, range, sources, settings, teacherIds) {
  const block = singleDayBlock(settings, range.key);
  if (block.courses?.length) {
    const classIds = sources.classTeachers.filter((r) => r.teacher_id === teacherId).map((r) => r.class_id);
    let count = 0;
    let sizeSum = 0;
    let enrolledSum = 0;
    let totalSum = 0;
    for (const c of block.courses) {
      if (has(c.schoolTotal) && Number(c.schoolTotal) > 0) {
        enrolledSum += courseEnrolled(block, c);
        totalSum += Number(c.schoolTotal);
      }
      const size = b.sizeAt(c.date || range.to);
      if (!size) continue;
      count += classIds.reduce((sum, cid) => sum + (Number(block.counts?.[cid]?.[c.id]) || 0), 0);
      sizeSum += size;
    }
    return { count, sizeSum, avg: totalSum ? enrolledSum / totalSum : 0, manual: true };
  }
  return {
    count: singleDayCount(b.studentIds, range, sources),
    sizeSum: b.size || 0,
    avg: singleDayAverage({ teacherIds: teacherIds || [teacherId], range, sources, settings }),
    manual: false,
  };
}

function singleDayCount(studentIds, range, sources) {
  const courseIds = new Set(
    sources.singleDay
      .filter((c) => inRange(c.course_date, range) && !["cancelled", "CANCELLED", "canceled"].includes(c.status))
      .map((c) => c.id)
  );
  return sources.singleDayStudents.filter((s) => courseIds.has(s.single_day_course_id) && studentIds.has(s.student_id)).length;
}

/** 全校平均：所有有帶班老師的人次加總 ÷ 所有班上人數 */
export function singleDayAverage({ teacherIds, range, sources, settings }) {
  let count = 0;
  let size = 0;
  for (const tid of teacherIds) {
    const b = semesterBasics({ teacherId: tid, range, sources, settings });
    if (!b.taught || !b.size) continue;
    count += singleDayCount(b.studentIds, range, sources);
    size += b.size;
  }
  return size ? count / size : 0;
}

/** 系統計算的學期（115 上起） */
export function computeSystemSemester({ teacherId, range, sources, events, assignments, exclusions, settings, typeMap, teacherIds }) {
  const b = semesterBasics({ teacherId, range, sources, settings });
  if (!b.taught) return { mode: "system", taught: false, score: null, categories: {}, catScores: {}, basics: b, admin: { items: [] } };
  const e = b.entry;

  // ---- A 成績：期中、期末各四科班平均；每次從 100 起扣，每科低於年級基準線 1 分扣 subjectPenalty，高分科不補 ----
  const gradeBaseline = Number(settings.baseline?.[b.grade] ?? 80);
  const adjusted = has(e.baselineOverride);
  const baseline = adjusted ? Number(e.baselineOverride) : gradeBaseline;
  const penalty = Number(settings.subjectPenalty ?? 3);
  const examPart = (key, avgKey, pKey, tKey, label) => {
    const subj = e[key] || {};
    const filled = SUBJECTS.filter((n) => has(subj[n]));
    if (filled.length) {
      const lows = filled.filter((n) => Number(subj[n]) < baseline);
      const lost = lows.reduce((sum, n) => sum + (baseline - Number(subj[n])) * penalty, 0);
      const lowText = lows.length ? lows.map((n) => `${n} ${subj[n]}`).join("、") : "四科都達標";
      return { score: clamp(100 - lost), text: `${label}：${lowText}${filled.length < SUBJECTS.length ? `（只填 ${filled.length} 科）` : ""}` };
    }
    if (has(e[avgKey])) {
      const v = Number(e[avgKey]);
      return { score: clamp(100 - Math.max(0, baseline - v) * penalty), text: `${label} 平均 ${v}` };
    }
    if (has(e[tKey]) && Number(e[tKey]) > 0) {
      return { score: clamp((Math.min(Number(e[pKey]) || 0, Number(e[tKey])) / Number(e[tKey])) * 100), text: `${label} ${e[pKey] || 0}/${e[tKey]}` };
    }
    return { score: null, text: `${label}未填` };
  };
  const mid = examPart("mid", "midAvg", "midP", "midT", "期中");
  const fin = examPart("fin", "finAvg", "finP", "finT", "期末");
  const examScores = [mid.score, fin.score].filter((x) => x !== null);
  const examRate = examScores.length ? avg(examScores) : null;
  const examDetail = `${mid.text}・${fin.text}・${
    adjusted ? `本學期調整基準 ${baseline}（年級 ${gradeBaseline}；${e.baselineReason || "未填原因"}）` : `${b.grade || "?"} 年級基準 ${baseline}`
  }`;

  // ---- B 留班率：開學人數＋進班 為分母，列入扣分的退班為分子 ----
  const base = (b.start || 0) + b.joins;
  const retention = base ? clamp((1 - b.deducted / base) * 100) : null;

  // ---- D 營隊：報名人數 ÷ 目前人數，目標看帶班年級 ----
  const campTarget = Number(settings.campTargets?.[b.grade] ?? settings.campTarget ?? 70);
  const noCamp = campExcluded(e, range.key, b.grade);
  const campRate = noCamp ? null : campRateOf(e, b.size);
  const campScore = campRate === null ? null : clamp((campRate / campTarget) * 100);

  // ---- D 單日課程：班上人次 ÷ 每堂課當天班上人數，跟全校平均（全校報名 ÷ 全校人數）比 ----
  const cs = courseStats(teacherId, b, range, sources, settings, teacherIds);
  const courseCount = cs.count;
  const courseSize = cs.sizeSum;
  const courseAvg = cs.avg;
  let courseScore = null;
  if (courseSize && courseAvg) {
    const ratio = courseCount / courseSize / courseAvg;
    courseScore = ratio >= 1.25 ? 100 : ratio >= 1 ? 80 + ((ratio - 1) / 0.25) * 20 : ratio * 80;
  }

  // ---- 抽查 ----
  const hwInsp = inspectionIndicator("hw", teacherId, range, settings);
  const envInsp = inspectionIndicator("env", teacherId, range, settings);

  // ---- 事件 ----
  const own = events.filter(
    (ev) => ev.teacher_id === teacherId && inRange(ev.event_date, range) && !["void", "disputed", "disputing"].includes(ev.status)
  );
  const countOf = (...names) => own.filter((ev) => names.includes(ev.type_name)).length;
  const safety = countOf("安全問題");
  const complaint = countOf("家長客訴");
  const mistakes = countOf("工作疏失", "沒交接");
  const lateEvents = countOf("遲到", "臨時請假");
  const lastMinuteLeaves = sources.leaves.filter((l) => l.teacher_id === teacherId && l.is_last_minute && inRange(l.start_date, range)).length;

  // ---- C 任務 ----
  const admin = computeAdminCooperation(assignments, teacherId, { from: range.from, to: range.to, perDay: settings.perDay, exclusions });

  const ind = (key, name, detail, score, source) => ({ key, name, detail, score: score === null ? null : Math.round(score * 10) / 10, source });
  const campName = range.key === "fall" ? "寒假營隊報名率" : "暑假營隊報名率";

  const categories = {
    A: [
      ind("exam", "班級平均成績", examDetail, examRate, "手動"),
      ind("inspect_hw", "作業／訂正／評量抽查", hwInsp.detail, hwInsp.score, "抽查"),
    ],
    B: [
      ind("retention", "留班率", `開學 ${b.start ?? "?"} 人＋進班 ${b.joins}・退班 ${b.leaves.length} 人（列入扣分 ${b.deducted}）`, retention, "系統"),
      ind("complaint", "家長客訴", `${complaint} 次`, countScore(complaint, settings), "事件"),
    ],
    C: [
      ind("tasks", "任務準時率", `準時 ${admin.onTime}/${admin.total}・逾期 ${admin.overdueDays} 天`, admin.total ? clamp(100 - admin.overdueDays * Number(settings.perDay || 0)) : null, "系統"),
      ind("attendance", "出勤", `臨時請假 ${lastMinuteLeaves + countOf("臨時請假")}・遲到 ${countOf("遲到")}`, clamp(100 - (lastMinuteLeaves + lateEvents) * Number(settings.attendancePenalty || 0)), "系統"),
      ind("mistakes", "工作疏失／沒交接", `${mistakes} 次`, countScore(mistakes, settings), "事件"),
      ind("inspect_env", "教室環境抽查", envInsp.detail, envInsp.score, "抽查"),
    ],
    D: [
      ind("camp", campName, noCamp ? "畢業班，不計暑假營隊" : campRate !== null ? `報名率 ${Math.round(campRate * 10) / 10}%・${b.grade || "?"} 年級目標 ${campTarget}%` : "尚未填寫（學期資料）", campScore, "手動"),
      ind("course", "單日課程報名率", courseSize ? `${courseCount} 人次／${courseSize} 人（${pct(courseCount, courseSize)}%）・全校平均 ${Math.round(courseAvg * 1000) / 10}%` : "需要班上人數", courseAvg ? courseScore : null, cs.manual ? "手動" : "系統"),
    ],
  };

  const disabled = new Set(settings.disabledIndicators || []);
  const semOff = new Set(settings.disabledBySem?.[range.key] || []);
  for (const list of Object.values(categories)) {
    for (const item of list) {
      if ((disabled.has(item.key) || semOff.has(item.key)) && item.score !== null) {
        item.score = null;
        item.detail = `${item.detail}・${semOff.has(item.key) ? "本學期" : "本年度"}不列入計分`;
      }
      if (semOff.has(item.key)) item.off = true;
    }
  }

  const catScores = Object.fromEntries(
    Object.entries(categories).map(([k, list]) => [k, avg(list.filter((i) => i.score !== null).map((i) => i.score))])
  );

  return { mode: "system", taught: true, categories, catScores, score: weighted(catScores, settings.w), basics: b, admin, campScore, courseScore, courseCount, courseSize, courseAvg, examRate, baseline, adjusted };
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

/** 手動學期（2026 年度的 114 下）：每月考核平均代替 A＋B＋C，暑假營隊報名率當 D */
export function computeManualSemester({ teacherId, range, sources, settings }) {
  const b = semesterBasics({ teacherId, range, sources, settings, systemData: false });
  if (!b.taught) return { mode: "manual", taught: false, score: null, basics: b };
  const e = b.entry;
  const monthly = (e.monthly || []).map(Number).filter((x) => !Number.isNaN(x) && x > 0);
  const monthlyAvg = avg(monthly);
  const target = Number(settings.campTargets?.[b.grade] ?? settings.campTarget ?? 70);
  const noCamp = campExcluded(e, range.key, b.grade);
  const campRate = noCamp ? null : campRateOf(e, b.size);
  const campScore = campRate === null ? null : clamp((campRate / target) * 100);
  const wD = Number(settings.w.D || 0);
  const wABC = Number(settings.w.A || 0) + Number(settings.w.B || 0) + Number(settings.w.C || 0);
  let score = null;
  if (monthlyAvg !== null && campScore !== null) score = (monthlyAvg * wABC + campScore * wD) / (wABC + wD);
  else if (monthlyAvg !== null) score = monthlyAvg;
  return { mode: "manual", taught: true, noCamp, monthly: e.monthly || [], monthlyAvg, campSigned: e.camp, campTotal: b.size, campRate, campScore, campTarget: target, campGrade: b.grade, score, basics: b };
}

/** 一位老師的年度結果 */
/** 直接從年度總分扣的事件：安全問題、自訂事件（沒有對應類型） */
export const DIRECT_DEDUCT_TYPES = ["安全問題"];
export function isDirectDeduct(ev, typeMap = {}) {
  if (ev.direction !== "minus") return false;
  if (DIRECT_DEDUCT_TYPES.includes(ev.type_name)) return true;
  // 自訂事件：沒有對應的事件類型
  return !ev.type_id && ev.source !== "overdue" && !typeMap[ev.type_name];
}

export function computeTeacherYear({ teacher, info, sources, events, assignments, exclusions, settings, typeMap, teacherIds }) {
  const common = { sources, events, assignments, exclusions, settings, typeMap, teacherId: teacher.id, teacherIds };
  const spring =
    settings.springMode === "manual"
      ? computeManualSemester({ teacherId: teacher.id, range: info.spring, sources, settings })
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

  // 直接扣總分：安全問題、自訂扣分事件（不設上限）
  const deductList = events.filter(
    (e) =>
      e.teacher_id === teacher.id &&
      inRange(e.event_date, info.range) &&
      Number(e.points) < 0 &&
      isDirectDeduct(e, typeMap) &&
      !["void", "disputed", "disputing"].includes(e.status)
  );
  const deduct = deductList.reduce((a, e) => a + Math.abs(Number(e.points || 0)), 0);
  const total = base === null ? null : Math.round((base + bonus - deduct) * 10) / 10;
  const factor = total === null ? null : factorFor(total, settings.bands);
  const salary = Number(settings.salaries?.[teacher.id]) || 0;
  const isLeader = (settings.leaders || []).includes(teacher.id);
  const pay = factor === null ? 0 : salary * Number(settings.base_months || 0) * factor + (isLeader ? Number(settings.leader_bonus || 0) : 0);

  return { teacher, spring, fall, bonus, bonusRaw, bonusList, deduct, deductList, base, total, factor, salary, isLeader, pay };
}

/** 可以在年度設定關掉的系統指標 */
export const TOGGLEABLE_INDICATORS = [
  { key: "exam", name: "A 班級平均成績" },
  { key: "inspect_hw", name: "A 作業／評量／訂正抽查" },
  { key: "retention", name: "B 留班率" },
  { key: "complaint", name: "B 家長客訴" },
  { key: "tasks", name: "C 任務準時率" },
  { key: "attendance", name: "C 出勤" },
  { key: "mistakes", name: "C 工作疏失／沒交接" },
  { key: "inspect_env", name: "C 教室環境抽查" },
  { key: "camp", name: "D 營隊報名率" },
  { key: "course", name: "D 單日課程報名率" },
];

/** 老師帶的班級年級：看班級名稱（G5A → 5）；帶多班取人數最多的班 */
export function teacherClassGrade(teacherId, sources) {
  const classIds = sources.classTeachers.filter((r) => r.teacher_id === teacherId).map((r) => r.class_id);
  const size = (id) => sources.classStudents.filter((r) => r.class_id === id && !r.left_at).length;
  const ordered = [...classIds].sort((a, b) => size(b) - size(a));
  for (const id of ordered) {
    const cls = sources.classes.find((c) => c.id === id);
    const g = parseGrade(cls?.class_name);
    if (g) return g;
  }
  return null;
}

