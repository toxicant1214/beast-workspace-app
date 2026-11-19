import { supabase } from "../lib/supabase";
import { createLeaveRecord } from "./leaveService";

/*
 * 請假流程：請假 → 排代理 → 交接 → 代理確認 → 完成
 * 只有全部格子都排好代理、交接、代理確認後，才能按「完成請假」，
 * 完成時才寫入既有的 teacher_leave_records（休假紀錄）。
 */

const REQUEST_TABLE = "leave_requests";
const ITEM_TABLE = "leave_request_items";

export const CATEGORY_LABELS = {
  slot: "班級時段",
  class: "班級照顧",
  pickup: "放學接送",
  english: "美語課",
  other: "其他",
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];


/* ---------- 小工具 ---------- */

export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDate(dateString) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateLabel(dateString) {
  if (!dateString) return "";
  const date = parseDate(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAY_LABELS[date.getDay()]}）`;
}

export function formatTime(time) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

export function listWorkDates(startDate, endDate) {
  const dates = [];
  if (!startDate || !endDate) return dates;
  const cursor = parseDate(startDate);
  const end = parseDate(endDate);
  let guard = 0;
  while (cursor <= end && guard < 62) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(toDateString(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function timesOverlap(a, b) {
  const aStart = timeToMinutes(a.start_time);
  const aEnd = timeToMinutes(a.end_time) ?? aStart;
  const bStart = timeToMinutes(b.start_time);
  const bEnd = timeToMinutes(b.end_time) ?? bStart;
  // 沒有設定時間的格子視為「整段」，一律算重疊
  if (aStart === null || bStart === null) return true;
  if (aStart === aEnd || bStart === bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
  }
  return aStart < bEnd && bStart < aEnd;
}

function nameMatches(names, teacher) {
  const list = Array.isArray(names)
    ? names
    : String(names || "").split(/[、,，/\s]+/);
  const candidates = [teacher?.chinese_name, teacher?.english_name]
    .filter(Boolean)
    .map((name) => String(name).trim().toLowerCase());
  return list.some((name) => {
    const clean = String(name || "").trim().toLowerCase();
    return clean && candidates.some((c) => clean === c || clean.includes(c) || c.includes(clean));
  });
}

function isClassActiveOn(classItem, dateString) {
  if (classItem?.is_active === false) return false;
  if (classItem?.start_date && dateString < classItem.start_date) return false;
  if (classItem?.end_date && dateString > classItem.end_date) return false;
  return true;
}


/* ---------- 讀取 ---------- */

export async function getCurrentTeacher() {
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("teachers")
    .select("id, chinese_name, english_name, role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("讀取目前老師失敗：", error);
    return null;
  }
  return data;
}

/** 請假流程用的老師名單：在職老師（含 role，主管帳號由畫面另外處理） */
export async function getWorkflowTeachers() {
  const directory = await getTeacherDirectory();
  return directory
    .filter((t) => t.status === "active")
    .sort((a, b) => String(a.chinese_name || "").localeCompare(String(b.chinese_name || ""), "zh-Hant"));
}

/**
 * 全體老師名字（只有 id、姓名、角色、狀態）。
 * 老師帳號讀不到 teachers 表的其他人，所以走資料庫函式 leave_teacher_directory。
 */
let directoryCache = null;
let directoryCacheAt = 0;
export async function getTeacherDirectory() {
  if (directoryCache && Date.now() - directoryCacheAt < 60_000) return directoryCache;
  const { data, error } = await supabase.rpc("leave_teacher_directory");
  if (error) throw error;
  directoryCache = data || [];
  directoryCacheAt = Date.now();
  return directoryCache;
}

/** 把請假單裡的老師名字補齊（老師帳號的關聯查詢拿不到別人的名字） */
async function fillTeacherNames(requests) {
  const directory = await getTeacherDirectory();
  const byId = new Map(directory.map((t) => [String(t.id), t]));
  const pick = (id) => {
    const t = byId.get(String(id));
    return t ? { id: t.id, chinese_name: t.chinese_name, english_name: t.english_name } : null;
  };
  return requests.map((request) => ({
    ...request,
    teachers: request.teachers || (request.teacher_id ? pick(request.teacher_id) : null),
    leave_request_items: (request.leave_request_items || []).map((item) => ({
      ...item,
      substitute_teacher:
        item.substitute_teacher || (item.substitute_teacher_id ? pick(item.substitute_teacher_id) : null),
    })),
  }));
}

export async function getWorkflowRequests() {
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const { data, error } = await supabase
    .from(REQUEST_TABLE)
    .select(`
      *,
      teachers:teacher_id ( id, chinese_name, english_name ),
      leave_types ( id, code, name ),
      leave_request_items (
        *,
        substitute_teacher:substitute_teacher_id ( id, chinese_name, english_name ),
        substitute_external:substitute_external_id ( id, name, department )
      )
    `)
    .or(`status.eq.in_progress,end_date.gte.${toDateString(since)}`)
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const filled = await fillTeacherNames(data || []);
  return filled.map((request) => ({
    ...request,
    leave_request_items: sortItems(request.leave_request_items || []),
  }));
}

export function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.item_date !== b.item_date) return a.item_date < b.item_date ? -1 : 1;
    const at = timeToMinutes(a.start_time) ?? -1;
    const bt = timeToMinutes(b.start_time) ?? -1;
    if (at !== bt) return at - bt;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
}

/** 期間內其他老師的請假（用來檢查代理人那天是不是也請假） */
export async function getLeavesInRange(startDate, endDate) {
  const [recordsResult, requestsResult] = await Promise.all([
    supabase.rpc("leave_busy_ranges", { p_start: startDate, p_end: endDate }),
    supabase
      .from(REQUEST_TABLE)
      .select("id, teacher_id, start_date, end_date, status")
      .eq("status", "in_progress")
      .gte("end_date", startDate)
      .lte("start_date", endDate),
  ]);
  if (recordsResult.error) throw recordsResult.error;
  if (requestsResult.error) throw requestsResult.error;
  return [...(recordsResult.data || []), ...(requestsResult.data || [])];
}

export async function getItemStudents(item) {
  if (!item?.source_id) return [];

  if (item.category === "class") {
    const { data, error } = await supabase
      .from("class_students")
      .select("id, students ( id, chinese_name, english_name )")
      .eq("class_id", item.source_id)
      .eq("status", "ACTIVE");
    if (error) throw error;
    return (data || []).map((row) => row.students).filter(Boolean);
  }

  if (item.category === "english") {
    const { data, error } = await supabase
      .from("english_class_students")
      .select("id, students ( id, chinese_name, english_name )")
      .eq("english_class_id", item.source_id)
      .eq("status", "ACTIVE");
    if (error) throw error;
    return (data || []).map((row) => row.students).filter(Boolean);
  }

  return [];
}


/* ---------- 每日時段與到班規則 ---------- */

export const DAY_SLOTS = [
  { key: "s1", start: "13:30", end: "14:00", label: "13:30–14:00" },
  { key: "s2", start: "14:00", end: "15:00", label: "14:00–15:00" },
  { key: "s3", start: "15:00", end: "16:30", label: "15:00–16:30" },
  { key: "s4", start: "16:30", end: "16:45", label: "16:30–16:45 點心" },
  { key: "s5", start: "16:45", end: "18:15", label: "16:45–18:15" },
  { key: "s6", start: "18:25", end: "19:55", label: "18:25–19:55" },
];

// 中午到班從 13:30 開始，下午到班從 16:30 開始
const ARRIVAL_FIRST_SLOT = { NOON: 0, AFTERNOON: 3 };

const GRADE_GROUP_MAP = {
  一年級: "LOW",
  二年級: "LOW",
  三年級: "MIDDLE",
  四年級: "MIDDLE",
  五年級: "HIGH",
  六年級: "HIGH",
};

const WEEKDAY_COLUMNS = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
};

export const STUDENT_STATUS_LABELS = {
  present: "在班",
  absent: "不到",
  english: "美語課",
  not_yet: "還沒到班",
  left: "已離班",
};

const SLOT_ORDER = ["s1", "s2", "s3", "s4", "s5", "s6"];

/**
 * 孩子當天請假：這一天所有時段都標成「不到（當日請假）」
 * undo = true 時還原（只還原用這個按鈕標的，接送系統原本就標不到的不動）
 */
export async function markStudentDayOff(request, dateString, studentId, undo = false) {
  const targets = (request.leave_request_items || []).filter(
    (i) =>
      i.category === "slot" &&
      i.item_date === dateString &&
      (i.students || []).some((s) => String(s.id) === String(studentId))
  );

  for (const target of targets) {
    const students = (target.students || []).map((s) => {
      if (String(s.id) !== String(studentId)) return s;
      if (undo) {
        if (!s.day_off) return s;
        const { previous_status, previous_note, day_off, ...rest } = s;
        return { ...rest, status: previous_status || "present", note: previous_note || "" };
      }
      if (s.status === "absent") return s;
      return {
        ...s,
        status: "absent",
        day_off: true,
        previous_status: s.previous_status || s.status,
        previous_note: s.previous_note ?? (s.note || ""),
        note: "當日請假",
      };
    });
    await updateLeaveItem(target.id, {
      students,
      student_count: students.filter((s) => s.status === "present").length,
    });
  }
}

/**
 * 孩子提早離開：從這個時段起，當天之後的時段都標成「已離班」
 * undo = true 時還原成原本的狀態
 */
export async function markStudentLeft(request, item, studentId, undo = false) {
  const fromIndex = SLOT_ORDER.indexOf(item.slot_key);
  if (fromIndex < 0) throw new Error("只有班級時段可以標記離班。");
  const label = DAY_SLOTS.find((x) => x.key === item.slot_key)?.start || "";

  const targets = (request.leave_request_items || []).filter(
    (i) =>
      i.category === "slot" &&
      i.item_date === item.item_date &&
      SLOT_ORDER.indexOf(i.slot_key) >= fromIndex &&
      (i.students || []).some((s) => String(s.id) === String(studentId))
  );

  for (const target of targets) {
    const students = (target.students || []).map((s) => {
      if (String(s.id) !== String(studentId)) return s;
      if (undo) {
        if (s.status !== "left") return s;
        const { previous_status, previous_note, ...rest } = s;
        return { ...rest, status: previous_status || "present", note: previous_note || "" };
      }
      if (s.status !== "present") return s;
      return {
        ...s,
        status: "left",
        previous_status: s.status,
        previous_note: s.note || "",
        note: `${label} 起已離班`,
      };
    });
    await updateLeaveItem(target.id, {
      students,
      student_count: students.filter((s) => s.status === "present").length,
    });
  }
}

/**
 * 接送系統沒有設定時的備用規則（主任提供）
 * 中年級：週一二四 下午、週三五 中午
 * 高年級：週一二四五 下午、週三 中午
 * 高年級（頭湖國小）：週一二三四 下午、週五 中午
 */
function fallbackArrivalPeriod(school, gradeGroup, weekday) {
  if (gradeGroup === "MIDDLE") {
    return weekday === 3 || weekday === 5 ? "NOON" : "AFTERNOON";
  }
  if (gradeGroup === "HIGH") {
    if (String(school || "").includes("頭湖")) {
      return weekday === 5 ? "NOON" : "AFTERNOON";
    }
    return weekday === 3 ? "NOON" : "AFTERNOON";
  }
  return null;
}

function periodFromTime(time) {
  if (!time) return null;
  return String(time).slice(0, 5) < "14:00" ? "NOON" : "AFTERNOON";
}

/** 跟接送系統同一套優先順序：單日例外 → 每週固定設定 → 一般規則 */
function getAttendance(student, dateString, weekday, ctx) {
  const exception = ctx.dateExceptions.find(
    (e) => e.student_id === student.id && e.pickup_date === dateString && e.is_active !== false
  );

  let status = "NORMAL";
  let period = null;
  let note = "";

  if (exception) {
    status =
      exception.attendance_status ||
      (exception.should_pickup ? "NORMAL" : "LEGACY_NO_PICKUP");
    period = exception.pickup_period || null;
    note = exception.note || "";
  } else {
    const weekly = ctx.weeklyRules.find(
      (w) => w.student_id === student.id && w.is_active !== false
    );
    const key = WEEKDAY_COLUMNS[weekday];
    if (weekly && key) {
      status =
        weekly[`${key}_status`] ||
        (weekly[`${key}_pickup`] ? "NORMAL" : "LEGACY_NO_PICKUP");
      period = weekly[`${key}_period`] || null;
      note = weekly.note || "";
    }
  }

  if (status === "ABSENT") {
    return { absent: true, period: null, note: note || "這天不到班" };
  }

  const gradeGroup = GRADE_GROUP_MAP[student.current_grade];
  const school = student.school?.trim();

  // 路亞、康橋：週一～週五都是下午到班（單日例外／每週設定指定的時段仍優先）
  if (!period && /路亞|康橋/.test(school || "")) {
    period = "AFTERNOON";
  }
  if (!period) {
    const rule = ctx.pickupRules.find(
      (r) => r.school === school && r.grade_group === gradeGroup
    );
    const key = WEEKDAY_COLUMNS[weekday];
    period = periodFromTime(rule?.[`${key}_time`]);
  }
  if (!period) {
    period = fallbackArrivalPeriod(school, gradeGroup, weekday);
  }

  const notes = [];
  if (status === "LATE_ARRIVAL") notes.push("晚到");
  if (status === "PARENT_DROP_OFF") notes.push("家長送");
  if (note) notes.push(note);

  const schoolClosure = ctx.closures.find(
    (c) => c.closure_date === dateString && c.closure_scope === "SCHOOL" && c.school === school
  );
  if (schoolClosure) notes.push("學校停接，請確認是否到班");

  return { absent: false, period: period || "AFTERNOON", note: notes.join("・") };
}

/** 某個孩子在某個時段的狀態：在班／不到／還沒到班／上美語 */
function slotStatus(a, slot, slotIndex) {
  if (a.absent) return { status: "absent", note: a.note };
  if (slotIndex < a.firstSlot) return { status: "not_yet", note: a.note };

  const lesson = a.english.find((e) =>
    timesOverlap(
      { start_time: e.start_time, end_time: e.end_time },
      { start_time: slot.start, end_time: slot.end }
    )
  );
  if (!lesson) return { status: "present", note: a.note };

  const lessonText = `${lesson.class_name} ${lesson.start_time}–${lesson.end_time}${
    lesson.teacher_name ? `・${lesson.teacher_name}` : ""
  }`;
  // 美語課蓋住這個時段一半以上 → 算上美語；只蓋到一小段 → 仍算在班，註明幾點去、幾點回
  const overlap =
    Math.min(timeToMinutes(lesson.end_time), timeToMinutes(slot.end)) -
    Math.max(timeToMinutes(lesson.start_time), timeToMinutes(slot.start));
  const slotLength = timeToMinutes(slot.end) - timeToMinutes(slot.start);
  if (overlap * 2 >= slotLength) return { status: "english", note: lessonText };

  const parts = [];
  if (lesson.start_time > slot.start) parts.push(`${lesson.start_time} 去上美語`);
  if (lesson.end_time < slot.end) parts.push(`${lesson.end_time} 美語下課回班`);
  return {
    status: "present",
    note: [a.note, `${parts.join("、")}（${lessonText}）`].filter(Boolean).join("・"),
  };
}

function studentName(student) {
  return student?.chinese_name || student?.english_name || "未命名學生";
}


/* ---------- 自動算出受影響的格子 ---------- */

export async function buildDutyItems(teacher, startDate, endDate, timeRange = null) {
  const dates = listWorkDates(startDate, endDate);
  if (!teacher || dates.length === 0) return { items: [], warnings: [], dayNotes: {} };

  const [
    classTeacherResult,
    pickupStaffResult,
    englishResult,
    pickupRulesResult,
    weeklyResult,
    exceptionResult,
    closureResult,
    overrideResult,
    schoolEventResult,
  ] = await Promise.all([
    supabase
      .from("class_teachers")
      .select("class_id, is_primary, classes ( id, class_name, is_active, start_date, end_date, course_type )")
      .eq("teacher_id", teacher.id),
    supabase.from("pickup_staff_rules").select("*").eq("is_active", true),
    supabase
      .from("english_classes")
      .select("id, class_name, teacher_name, is_active, start_date, end_date, english_class_schedules ( weekday, start_time, end_time )")
      .eq("is_active", true),
    supabase.from("pickup_rules").select("*").eq("is_active", true),
    supabase.from("pickup_student_weekly_rules").select("*").eq("is_active", true),
    supabase
      .from("pickup_student_date_exceptions")
      .select("*")
      .eq("is_active", true)
      .gte("pickup_date", startDate)
      .lte("pickup_date", endDate),
    supabase
      .from("pickup_closures")
      .select("*")
      .eq("is_active", true)
      .gte("closure_date", startDate)
      .lte("closure_date", endDate),
    supabase
      .from("calendar_day_overrides")
      .select("override_date, override_type, title")
      .gte("override_date", startDate)
      .lte("override_date", endDate),
    supabase
      .from("calendar_school_events")
      .select("start_date, end_date, title, affects_pickup, applies_to_all_schools, calendar_schools ( name )")
      .eq("affects_pickup", true)
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  const warnings = [];
  if (classTeacherResult.error) warnings.push("班級");
  if (pickupStaffResult.error) warnings.push("接送人員");
  if (englishResult.error) warnings.push("美語班");
  if (pickupRulesResult.error || weeklyResult.error || exceptionResult.error) warnings.push("學生到班設定");
  if (closureResult.error || overrideResult.error) warnings.push("行事曆");

  const ctx = {
    pickupRules: pickupRulesResult.data || [],
    weeklyRules: weeklyResult.data || [],
    dateExceptions: exceptionResult.data || [],
    closures: closureResult.data || [],
  };

  /* 這位老師的安親班級（排除一二年級學生） */
  const classes = (classTeacherResult.data || [])
    .map((row) => row.classes)
    .filter((c) => c && (!c.course_type || c.course_type === "AFTER_SCHOOL"));

  const classIds = classes.map((c) => c.id);
  let roster = [];
  if (classIds.length) {
    const { data, error } = await supabase
      .from("class_students")
      .select("class_id, students ( id, chinese_name, english_name, school, current_grade, student_status )")
      .in("class_id", classIds)
      .eq("status", "ACTIVE");
    if (error) warnings.push("班級學生");
    roster = (data || [])
      .filter((row) => row.students && (!row.students.student_status || row.students.student_status === "ACTIVE"))
      .filter((row) => GRADE_GROUP_MAP[row.students.current_grade] !== "LOW")
      .map((row) => ({
        ...row.students,
        class_id: row.class_id,
        class_name: classes.find((c) => c.id === row.class_id)?.class_name || "",
      }));
  }

  /* 學生的美語課 */
  const englishClasses = englishResult.data || [];
  const rosterIds = roster.map((s) => s.id);
  let englishMembership = [];
  if (rosterIds.length) {
    const { data } = await supabase
      .from("english_class_students")
      .select("student_id, english_class_id")
      .in("student_id", rosterIds)
      .eq("status", "ACTIVE");
    englishMembership = data || [];
  }

  function englishSessionsFor(studentId, dateString, weekday) {
    return englishMembership
      .filter((m) => m.student_id === studentId)
      .map((m) => englishClasses.find((c) => c.id === m.english_class_id))
      .filter((c) => c && isClassActiveOn(c, dateString))
      .flatMap((c) =>
        (c.english_class_schedules || [])
          .filter((s) => Number(s.weekday) === weekday)
          .map((s) => ({
            class_name: c.class_name,
            teacher_name: c.teacher_name,
            start_time: formatTime(s.start_time),
            end_time: formatTime(s.end_time),
          }))
      );
  }

  /* 這位老師自己負責的接送、美語課 */
  const myPickups = (pickupStaffResult.data || []).filter((rule) =>
    nameMatches(rule.staff_names, teacher)
  );
  const myEnglishClasses = englishClasses.filter((c) => nameMatches(c.teacher_name, teacher));

  const dayNotes = {};
  const items = [];
  let order = 0;

  dates.forEach((dateString) => {
    const weekday = parseDate(dateString).getDay();
    const notes = [];

    const override = (overrideResult.data || []).find((o) => o.override_date === dateString);
    if (override && ["HOLIDAY", "CLASSROOM_CLOSED"].includes(override.override_type)) {
      dayNotes[dateString] = [`${override.title || "公司休假"}：這天不用排代理`];
      return;
    }

    const allClosure = ctx.closures.find(
      (c) => c.closure_date === dateString && c.closure_scope === "ALL"
    );
    if (allClosure) notes.push(`全部停接${allClosure.note ? `（${allClosure.note}）` : ""}，請確認到班狀況`);

    (schoolEventResult.data || [])
      .filter((e) => e.start_date <= dateString && e.end_date >= dateString)
      .forEach((e) => {
        const where = e.applies_to_all_schools ? "全部學校" : e.calendar_schools?.name || "";
        notes.push(`${where}${e.title}（影響接送，請確認到班時間）`);
      });

    if (notes.length) dayNotes[dateString] = notes;

    /* 接送 */
    myPickups
      .filter((rule) => Number(rule.weekday) === weekday)
      .forEach((rule) => {
        items.push({
          item_date: dateString,
          start_time: rule.pickup_time || null,
          end_time: null,
          category: "pickup",
          slot_key: null,
          title: `${rule.school || ""}放學接送`.trim(),
          source_id: String(rule.id),
          students: [],
          student_count: 0,
          sort_order: order++,
        });
      });

    /* 班級：每個時段一格，列出每個孩子的狀態 */
    if (roster.length) {
      const attendance = roster.map((student) => {
        const a = getAttendance(student, dateString, weekday, ctx);
        return {
          student,
          ...a,
          firstSlot: a.absent ? 99 : ARRIVAL_FIRST_SLOT[a.period] ?? 3,
          english: englishSessionsFor(student.id, dateString, weekday),
        };
      });

      DAY_SLOTS.forEach((slot, slotIndex) => {
        const students = attendance
          .map((a) => {
            const { status, note } = slotStatus(a, slot, slotIndex);
            return {
              id: a.student.id,
              name: studentName(a.student),
              class_name: a.student.class_name,
              school: a.student.school || "",
              grade: a.student.current_grade || "",
              status,
              note,
            };
          })
          // 還沒到班的孩子不列進這個時段
          .filter((s) => s.status !== "not_yet")
          .sort((x, y) => x.name.localeCompare(y.name, "zh-Hant"));

        const presentCount = students.filter((s) => s.status === "present").length;
        if (!students.length) return;

        items.push({
          item_date: dateString,
          start_time: slot.start,
          end_time: slot.end,
          category: "slot",
          slot_key: slot.key,
          title: slot.label,
          source_id: null,
          // 16:30–16:45 是點心時間，預先勾好
          activity_tags: slot.key === "s4" ? ["點心"] : [],
          students,
          student_count: presentCount,
          sort_order: order++,
        });
      });
    }

    /* 老師自己教的美語課 */
    myEnglishClasses
      .filter((c) => isClassActiveOn(c, dateString))
      .forEach((c) => {
        (c.english_class_schedules || [])
          .filter((s) => Number(s.weekday) === weekday)
          .forEach((s) => {
            items.push({
              item_date: dateString,
              start_time: s.start_time || null,
              end_time: s.end_time || null,
              category: "english",
              slot_key: null,
              title: c.class_name,
              source_id: String(c.id),
              students: [],
              student_count: 0,
              sort_order: order++,
            });
          });
      });
  });

  // 只請部分時段：只留跟請假時間重疊的格子
  const rangeStart = timeRange?.start || null;
  const rangeEnd = timeRange?.end || null;
  const filtered =
    rangeStart && rangeEnd
      ? items.filter((item) => {
          const start = item.start_time ? formatTime(item.start_time) : null;
          const end = item.end_time ? formatTime(item.end_time) : start;
          if (!start) return true;
          if (start === end) return start >= rangeStart && start < rangeEnd;
          return start < rangeEnd && rangeStart < end;
        })
      : items;

  return { items: sortItems(filtered), warnings, dayNotes };
}

/**
 * 全部老師自己班上，每天每個時段在教室的孩子數（一次算好）
 * 回傳 { "老師id|2026-11-19|s1": 12, ... }
 */
const allLoadsCache = new Map();
export function getAllTeachersSlotLoads(dates) {
  const key = [...dates].sort().join(",");
  if (!allLoadsCache.has(key)) {
    allLoadsCache.set(key, computeAllTeachersSlotLoads([...dates].sort()).catch((error) => {
      console.error("計算各班人數失敗：", error);
      allLoadsCache.delete(key);
      return {};
    }));
  }
  return allLoadsCache.get(key);
}

async function computeAllTeachersSlotLoads(dates) {
  if (!dates.length) return {};
  const first = dates[0];
  const last = dates[dates.length - 1];

  const [ctResult, rulesResult, weeklyResult, exceptionResult, closureResult, englishResult] =
    await Promise.all([
      supabase
        .from("class_teachers")
        .select("class_id, teacher_id, classes ( id, is_active, start_date, end_date, course_type )"),
      supabase.from("pickup_rules").select("*").eq("is_active", true),
      supabase.from("pickup_student_weekly_rules").select("*").eq("is_active", true),
      supabase
        .from("pickup_student_date_exceptions")
        .select("*")
        .eq("is_active", true)
        .gte("pickup_date", first)
        .lte("pickup_date", last),
      supabase
        .from("pickup_closures")
        .select("*")
        .eq("is_active", true)
        .gte("closure_date", first)
        .lte("closure_date", last),
      supabase
        .from("english_classes")
        .select("id, class_name, teacher_name, is_active, start_date, end_date, english_class_schedules ( weekday, start_time, end_time )")
        .eq("is_active", true),
    ]);
  if (ctResult.error) throw ctResult.error;

  const ctx = {
    pickupRules: rulesResult.data || [],
    weeklyRules: weeklyResult.data || [],
    dateExceptions: exceptionResult.data || [],
    closures: closureResult.data || [],
  };

  const links = (ctResult.data || []).filter(
    (row) => row.classes && (!row.classes.course_type || row.classes.course_type === "AFTER_SCHOOL")
  );
  const classIds = [...new Set(links.map((row) => row.class_id))];
  if (!classIds.length) return {};

  const { data: rosterRows, error: rosterError } = await supabase
    .from("class_students")
    .select("class_id, students ( id, chinese_name, english_name, school, current_grade, student_status )")
    .in("class_id", classIds)
    .eq("status", "ACTIVE");
  if (rosterError) throw rosterError;

  const roster = (rosterRows || []).filter(
    (row) =>
      row.students &&
      (!row.students.student_status || row.students.student_status === "ACTIVE") &&
      GRADE_GROUP_MAP[row.students.current_grade] !== "LOW"
  );

  const studentIds = [...new Set(roster.map((row) => row.students.id))];
  let membership = [];
  if (studentIds.length) {
    const { data } = await supabase
      .from("english_class_students")
      .select("student_id, english_class_id")
      .in("student_id", studentIds)
      .eq("status", "ACTIVE");
    membership = data || [];
  }
  const englishClasses = englishResult.data || [];

  // 每班每天每時段在班人數
  const classCounts = {};
  dates.forEach((dateString) => {
    const weekday = parseDate(dateString).getDay();
    roster.forEach((row) => {
      const classItem = links.find((l) => l.class_id === row.class_id)?.classes;
      if (!isClassActiveOn(classItem, dateString)) return;
      const student = row.students;
      const att = getAttendance(student, dateString, weekday, ctx);
      const english = membership
        .filter((m) => m.student_id === student.id)
        .map((m) => englishClasses.find((c) => c.id === m.english_class_id))
        .filter((c) => c && isClassActiveOn(c, dateString))
        .flatMap((c) =>
          (c.english_class_schedules || [])
            .filter((sch) => Number(sch.weekday) === weekday)
            .map((sch) => ({
              class_name: c.class_name,
              teacher_name: c.teacher_name,
              start_time: formatTime(sch.start_time),
              end_time: formatTime(sch.end_time),
            }))
        );
      const a = { ...att, firstSlot: att.absent ? 99 : ARRIVAL_FIRST_SLOT[att.period] ?? 3, english };
      DAY_SLOTS.forEach((slot, slotIndex) => {
        if (slotStatus(a, slot, slotIndex).status !== "present") return;
        const k = `${row.class_id}|${dateString}|${slot.key}`;
        classCounts[k] = (classCounts[k] || 0) + 1;
      });
    });
  });

  // 加總到老師
  const result = {};
  links.forEach((link) => {
    dates.forEach((dateString) => {
      DAY_SLOTS.forEach((slot) => {
        const count = classCounts[`${link.class_id}|${dateString}|${slot.key}`];
        if (!count) return;
        const k = `${link.teacher_id}|${dateString}|${slot.key}`;
        result[k] = (result[k] || 0) + count;
      });
    });
  });
  return result;
}

/* ---------- 接送衝突：代理老師自己同時間也要接送 ---------- */

export async function getActivePickupStaffRules() {
  const { data, error } = await supabase
    .from("pickup_staff_rules")
    .select("id, school, weekday, pickup_time, staff_names, is_active")
    .eq("is_active", true);
  if (error) {
    console.error("讀取接送人員失敗：", error);
    return [];
  }
  return data || [];
}

/** 某位老師某天自己要負責的接送 */
export function pickupDutiesFor(rules, teacher, dateString) {
  if (!teacher || !dateString) return [];
  const weekday = parseDate(dateString).getDay();
  return (rules || [])
    .filter((rule) => Number(rule.weekday) === weekday && nameMatches(rule.staff_names, teacher))
    .map((rule) => ({
      school: rule.school || "",
      time: formatTime(rule.pickup_time),
      rule_id: String(rule.id),
    }));
}

/** 一位老師同時段建議最多顧幾個孩子（超過只提醒，不擋確認） */
export const MAX_KIDS_PER_TEACHER = 25;

/** 一格裡真正需要人顧的孩子數 */
export function presentStudents(item) {
  return (item.students || []).filter((s) => s.status === "present");
}


/* ---------- 寫入 ---------- */

export async function createLeaveRequest(form, items) {
  if (!form.teacherId) throw new Error("請選擇請假老師。");
  if (!form.leaveTypeId) throw new Error("請選擇假別。");
  if (!form.startDate || !form.endDate) throw new Error("請選擇請假日期。");
  if (form.endDate < form.startDate) throw new Error("結束日期不可早於開始日期。");
  if (!Number(form.inputValue) || Number(form.inputValue) <= 0) {
    throw new Error("請輸入正確的請假天數或時數。");
  }
  const workDays = listWorkDates(form.startDate, form.endDate).length;
  if (form.inputUnit === "DAY" && Number(form.inputValue) > workDays) {
    throw new Error(`請假 ${form.inputValue} 天，但選的日期只有 ${workDays} 個上班日，請把結束日期往後調。`);
  }
  if (!items.length) {
    throw new Error("至少要有一格職責。如果這位老師當天真的沒有負責任何孩子，請手動新增一格「其他」說明。");
  }

  const { data: request, error } = await supabase
    .from(REQUEST_TABLE)
    .insert({
      teacher_id: form.teacherId,
      leave_type_id: form.leaveTypeId,
      start_date: form.startDate,
      end_date: form.endDate,
      input_unit: form.inputUnit,
      input_value: Number(form.inputValue),
      is_last_minute: Boolean(form.isLastMinute),
      reason: form.reason?.trim() || null,
      day_notes: form.dayNotes || {},
      status: "in_progress",
    })
    .select()
    .single();

  if (error) throw error;

  const payload = items.map((item, index) => ({
    request_id: request.id,
    item_date: item.item_date,
    start_time: item.start_time || null,
    end_time: item.end_time || null,
    category: item.category || "other",
    slot_key: item.slot_key || null,
    students: item.students || [],
    activity_tags: item.activity_tags || [],
    title: item.title?.trim() || "未命名職責",
    source_id: item.source_id || null,
    student_count: Number(item.student_count) || 0,
    sort_order: index,
  }));

  const { error: itemError } = await supabase.from(ITEM_TABLE).insert(payload);

  if (itemError) {
    await supabase.from(REQUEST_TABLE).delete().eq("id", request.id);
    throw itemError;
  }

  return request;
}

export async function updateLeaveItem(id, patch) {
  const { data, error } = await supabase
    .from(ITEM_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addLeaveItem(requestId, item) {
  const { data, error } = await supabase
    .from(ITEM_TABLE)
    .insert({
      request_id: requestId,
      item_date: item.item_date,
      start_time: item.start_time || null,
      end_time: item.end_time || null,
      category: item.category || "other",
      slot_key: item.slot_key || null,
      students: item.students || [],
      activity_tags: item.activity_tags || [],
      title: item.title?.trim() || "未命名職責",
      source_id: item.source_id || null,
      student_count: Number(item.student_count) || 0,
      sort_order: Number(item.sort_order) || 999,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * 把一格裡選到的孩子拆到新的一格（同一時段、另一位代理人／另一間教室）
 * 不到班、上美語課的孩子留在原本那格當參考
 */
export async function splitLeaveItem(item, studentIds) {
  const moveIds = new Set(studentIds.map(String));
  const moving = (item.students || []).filter(
    (s) => s.status === "present" && moveIds.has(String(s.id))
  );
  const staying = (item.students || []).filter((s) => !moving.includes(s));

  if (!moving.length) throw new Error("請勾選要拆出去的孩子。");
  if (!staying.some((s) => s.status === "present")) {
    throw new Error("不能把全部孩子都拆走，直接換代理人就好。");
  }

  await addLeaveItem(item.request_id, {
    ...item,
    students: moving,
    student_count: moving.length,
    sort_order: (Number(item.sort_order) || 0) + 0.1,
  });

  await updateLeaveItem(item.id, {
    students: staying,
    student_count: staying.filter((s) => s.status === "present").length,
  });
}

/** 把同一時段拆出去的格子併回去 */
export async function mergeLeaveItem(item, target) {
  const students = [...(target.students || []), ...(item.students || [])];
  await updateLeaveItem(target.id, {
    students,
    student_count: students.filter((s) => s.status === "present").length,
  });
  await deleteLeaveItem(item.id);
}

/** 一次確認多格 */
export async function ackItems(itemIds, byAdmin) {
  if (!itemIds.length) return;
  const { data: { user } = {} } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(ITEM_TABLE)
    .update({
      ack_at: new Date().toISOString(),
      ack_by: user?.id || null,
      ack_by_admin: Boolean(byAdmin),
      updated_at: new Date().toISOString(),
    })
    .in("id", itemIds);
  if (error) throw error;
}

/** 交接單或代理人一次套用到多格 */
export async function updateManyItems(itemIds, patch) {
  if (!itemIds.length) return;
  const { error } = await supabase
    .from(ITEM_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .in("id", itemIds);
  if (error) throw error;
}

export async function deleteLeaveItem(id) {
  const { error } = await supabase.from(ITEM_TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function cancelLeaveRequest(id) {
  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function reopenLeaveRequest(id) {
  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}


/* ---------- 進度與完成 ---------- */

export function hasSubstitute(item) {
  return Boolean(
    item.substitute_teacher_id ||
      item.substitute_external_id ||
      (item.substitute_name && String(item.substitute_name).trim())
  );
}

/** 這格有沒有需要人顧的孩子（全部不到或都去上美語課就不用排代理） */
export function needsCoverage(item) {
  if (item.category !== "slot") return true;
  return (item.students || []).some((s) => s.status === "present");
}

export function getRequestProgress(request) {
  const items = (request?.leave_request_items || []).filter(needsCoverage);
  const total = items.length;
  const covered = items.filter(hasSubstitute).length;
  const handed = items.filter((i) => i.handover_done).length;
  const acked = items.filter((i) => i.ack_at).length;
  const submitted = Boolean(request?.submitted_at);
  const approved = Boolean(request?.approved_at);
  const canSubmit = total > 0 && covered === total && handed === total;
  const paperReturned = Boolean(request?.paper_returned_at);
  const ready = canSubmit && submitted && approved && acked === total && paperReturned;

  let step = "coverage";
  if (request?.status === "completed") step = "completed";
  else if (request?.status === "cancelled") step = "cancelled";
  else if (covered < total || total === 0) step = "coverage";
  else if (handed < total) step = "handover";
  else if (!submitted) step = "submit";
  else if (!approved) step = "approve";
  else if (acked < total) step = "ack";
  else if (!paperReturned) step = "paper";
  else step = "ready";

  return { total, covered, handed, acked, submitted, approved, canSubmit, paperReturned, ready, step };
}

/* ---------- 送出、主管確認、LINE 通知 ---------- */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function callLeaveApi(path, body) {
  if (!API_BASE_URL) {
    return { skipped: true, message: "測試環境沒有設定後端網址，略過 LINE 通知。" };
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { failed: true, message: data.message || `LINE 通知失敗（${response.status}）` };
    }
    return data;
  } catch (error) {
    return { failed: true, message: `LINE 通知失敗：${error.message}` };
  }
}

async function currentUserId() {
  const { data: { user } = {} } = await supabase.auth.getUser();
  return user?.id || null;
}

/** 老師送出 → 通知主管 */
export async function submitLeaveRequest(request) {
  const { canSubmit } = getRequestProgress(request);
  if (!canSubmit) throw new Error("每一格都要排好代理、填好交接單，才能送出。");

  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({
      submitted_at: new Date().toISOString(),
      submitted_by: await currentUserId(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (error) throw error;

  return callLeaveApi(`/api/leave-requests/${request.id}/notify-submitted`);
}

export async function setPaperReturned(request, returned) {
  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({
      paper_returned_at: returned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (error) throw error;
}

/** 主管確認後才換掉代理人或取消：通知被換掉的老師不用代班了 */
export async function notifyRemovedSubstitutes(request, teacherIds, itemIds, reason) {
  const ids = [...new Set((teacherIds || []).filter(Boolean).map(String))];
  if (!ids.length || !request.approved_at) return null;
  return callLeaveApi(`/api/leave-requests/${request.id}/notify-removed`, {
    teacher_ids: ids,
    item_ids: itemIds || [],
    reason,
  });
}

/** 只通知指定格子的代理老師（例如確認後新換上的人） */
export async function notifyItemsSubstitutes(request, itemIds) {
  if (!request.approved_at || !itemIds?.length) return null;
  await uploadSubstituteSheets(request.id, itemIds);
  return callLeaveApi(`/api/leave-requests/${request.id}/notify-substitutes`, { item_ids: itemIds });
}

/* ---------- 代班確認單 PDF（給 LINE 連結用） ---------- */

const SHEET_BUCKET = "leave-sheets";

async function fetchRequestForSheet(requestId) {
  const { data, error } = await supabase
    .from(REQUEST_TABLE)
    .select(`
      *,
      teachers:teacher_id ( id, chinese_name, english_name ),
      leave_types ( id, code, name ),
      leave_request_items (
        *,
        substitute_teacher:substitute_teacher_id ( id, chinese_name, english_name ),
        substitute_external:substitute_external_id ( id, name, department )
      )
    `)
    .eq("id", requestId)
    .single();
  if (error) throw error;
  const [filled] = await fillTeacherNames([data]);
  return filled;
}

/**
 * 幫每位代班老師各存一份「只有他自己那頁」的確認單到 Supabase 私人空間。
 * 失敗不擋流程（LINE 卡片就只是少一顆 PDF 按鈕）。
 */
export async function uploadSubstituteSheets(requestId, itemIds = null) {
  try {
    const request = await fetchRequestForSheet(requestId);
    const items = (request.leave_request_items || []).filter(
      (item) => needsCoverage(item) && item.substitute_teacher_id && (!itemIds || itemIds.includes(item.id))
    );
    const teacherIds = [...new Set(items.map((item) => String(item.substitute_teacher_id)))];
    if (!teacherIds.length) return;
    const { buildSignSheetPdf } = await import("../components/leave/leaveSignSheetPdf");
    for (const teacherId of teacherIds) {
      const pdf = await buildSignSheetPdf(request, { onlyTeacherId: teacherId });
      const { error } = await supabase.storage
        .from(SHEET_BUCKET)
        .upload(`${requestId}/${teacherId}.pdf`, pdf.output("blob"), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (error) console.warn("代班確認單上傳失敗", teacherId, error.message);
    }
  } catch (error) {
    console.warn("代班確認單產生失敗", error);
  }
}

/** 退回給老師修改 */
export async function returnLeaveRequest(request) {
  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({
      submitted_at: null,
      approved_at: null,
      approved_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (error) throw error;
}

/** 主管確認 → 通知每位代理老師 */
export async function approveLeaveRequest(request) {
  const { canSubmit, submitted } = getRequestProgress(request);
  if (!canSubmit) throw new Error("還有格子沒排代理或沒交接。");
  const userId = await currentUserId();

  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({
      // 主管自己幫老師建的請假，確認時一併視為已送出
      ...(submitted ? {} : { submitted_at: new Date().toISOString(), submitted_by: userId }),
      approved_at: new Date().toISOString(),
      approved_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (error) throw error;

  await uploadSubstituteSheets(request.id);
  return callLeaveApi(`/api/leave-requests/${request.id}/notify-substitutes`);
}

/** 再通知一次還沒確認的代理老師 */
export async function renotifySubstitutes(request) {
  await uploadSubstituteSheets(request.id);
  return callLeaveApi(`/api/leave-requests/${request.id}/notify-substitutes`, { only_unacked: true });
}

export function describeNotifyResult(result, label) {
  if (!result) return "";
  if (result.skipped) return result.message;
  if (result.failed) return result.message;
  const parts = [];
  if (result.sent?.length) parts.push(`已用 LINE 通知：${result.sent.join("、")}`);
  if (result.failed?.length) parts.push(`通知失敗：${result.failed.join("、")}`);
  if (result.no_line?.length) parts.push(`沒有綁 LINE，請另外告知：${result.no_line.join("、")}`);
  return parts.join("；") || `${label}已送出。`;
}

export async function completeLeaveRequest(request) {
  const { data: { user } = {} } = await supabase.auth.getUser();
  const currentUserId = user?.id || null;
  const { ready } = getRequestProgress(request);
  if (!ready) {
    throw new Error("還有格子沒排代理、沒交接、主管沒確認、代理人還沒確認，或紙本簽名單還沒收回，不能完成請假。");
  }
  if (request.leave_record_id) {
    throw new Error("這筆請假已經寫入休假紀錄了。");
  }

  const record = await createLeaveRecord({
    personType: "teacher",
    personId: request.teacher_id,
    leaveTypeId: request.leave_type_id,
    startDate: request.start_date,
    endDate: request.end_date,
    inputUnit: request.input_unit,
    inputValue: request.input_value,
    isLastMinute: request.is_last_minute,
    note: [request.reason, "（由請假流程完成）"].filter(Boolean).join(" "),
  });

  const { error } = await supabase
    .from(REQUEST_TABLE)
    .update({
      status: "completed",
      leave_record_id: record.id,
      completed_at: new Date().toISOString(),
      completed_by: currentUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  if (error) {
    // 休假紀錄已寫入但狀態沒更新：提示主任，不要再按一次造成重複
    throw new Error(
      `休假紀錄已寫入，但流程狀態更新失敗（${error.message}）。請不要再按一次完成，重新整理頁面確認。`
    );
  }

  return record;
}
