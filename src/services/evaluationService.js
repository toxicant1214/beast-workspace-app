import { supabase } from "../lib/supabase";

// =========================================================
// BEAST Workspace｜教師考核 Phase 2
// 事件登記、異議處理、年終設定
// （LINE 通知一律交給後端，前端只傳事件 id）
// =========================================================

const EVENTS = "evaluation_events";
const TYPES = "evaluation_event_types";
const SETTINGS = "evaluation_settings";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const DEFAULT_YEAR_END = {
  base_score: 100,
  base_months: 1,
  leader_bonus: 0,
  auto_confirm_days: 3,
  overdue_since: "2026-01-01",
  overdue_per_day: 1,
  bands: [
    { min: 105, factor: 1.3 },
    { min: 100, factor: 1.1 },
    { min: 90, factor: 1.0 },
    { min: 80, factor: 0.8 },
    { min: -9999, factor: 0.6 },
  ],
  salaries: {},
  leaders: [],
};

// 計分時不算的狀態：撤銷、等主管處理的異議
export const NOT_COUNTED = ["void", "disputed"];

export const STATUS_LABELS = {
  pending: "待老師確認",
  confirmed: "已確認",
  disputing: "老師填寫原因中",
  disputed: "有異議・待處理",
  void: "已撤銷",
};

async function callApi(path) {
  if (!API_BASE_URL) {
    return { skipped: true, message: "沒有設定後端網址，略過 LINE 通知。" };
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
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

// ---------------------------------------------------------
// 類型
// ---------------------------------------------------------

export async function getEventTypes() {
  const { data, error } = await supabase
    .from(TYPES)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveEventType(type) {
  const values = {
    name: type.name.trim(),
    direction: type.direction,
    points: Number(type.points) || 0,
    is_active: type.is_active !== false,
    sort_order: Number(type.sort_order) || 0,
    updated_at: new Date().toISOString(),
  };
  if (type.id) {
    const { error } = await supabase.from(TYPES).update(values).eq("id", type.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(TYPES).insert(values);
    if (error) throw error;
  }
}

// ---------------------------------------------------------
// 事件
// ---------------------------------------------------------

export async function getEvents({ from, to } = {}) {
  let query = supabase
    .from(EVENTS)
    .select("*")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (from) query = query.gte("event_date", from);
  if (to) query = query.lte("event_date", to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** 主管登記一筆事件，存好後通知老師 */
export async function createEvent({ teacherId, eventDate, type, note, overdueDays }) {
  const days = type.per_day ? Math.max(1, Number(overdueDays) || 1) : null;
  const magnitude = Number(type.points || 0) * (days || 1);
  const isPlus = type.direction === "plus";
  // 逾期（每天計分的類型）：晨報已提醒，直接記分、不通知老師
  const silent = Boolean(type.per_day);
  const autoConfirmed = isPlus || silent;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(EVENTS)
    .insert({
      teacher_id: teacherId,
      event_date: eventDate,
      type_id: type.id,
      type_name: type.name,
      direction: type.direction,
      points: isPlus ? magnitude : -magnitude,
      overdue_days: days,
      note: note?.trim() || null,
      source: "manual",
      // 加分只通知不用確認；逾期直接確認
      status: autoConfirmed ? "confirmed" : "pending",
      confirmed_by: isPlus ? "notice" : silent ? "admin" : null,
      confirmed_at: autoConfirmed ? now : null,
    })
    .select()
    .single();
  if (error) throw error;

  const notify = silent
    ? { skipped: true, message: "逾期不通知老師。" }
    : await callApi(`/api/evaluation/events/${data.id}/notify`);
  return { event: data, notify };
}

export async function resendNotify(eventId) {
  return callApi(`/api/evaluation/events/${eventId}/notify`);
}

/**
 * 主管處理異議
 * decision: "keep" 維持｜"adjust" 改分數｜"void" 撤銷
 */
export async function resolveDispute(event, { decision, points, adminNote }) {
  const values = {
    admin_note: adminNote?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (decision === "void") {
    values.status = "void";
  } else {
    values.status = "confirmed";
    values.confirmed_by = "admin";
    values.confirmed_at = new Date().toISOString();
    if (decision === "adjust") {
      const magnitude = Math.abs(Number(points) || 0);
      values.points = event.direction === "plus" ? magnitude : -magnitude;
    }
  }
  const { error } = await supabase.from(EVENTS).update(values).eq("id", event.id);
  if (error) throw error;
  return callApi(`/api/evaluation/events/${event.id}/notify-decision`);
}

/** 主管撤銷（登記錯誤時用），不通知老師 */
export async function voidEvent(eventId, adminNote) {
  const { error } = await supabase
    .from(EVENTS)
    .update({
      status: "void",
      admin_note: adminNote || "主管撤銷",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);
  if (error) throw error;
}

/** 超過天數自動確認（後端處理） */
export async function syncEvaluation() {
  return callApi("/api/evaluation/sync");
}

// ---------------------------------------------------------
// 年終設定
// ---------------------------------------------------------

export async function getYearEndSettings() {
  const { data, error } = await supabase
    .from(SETTINGS)
    .select("value")
    .eq("key", "year_end")
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_YEAR_END, ...(data?.value || {}) };
}

export async function saveYearEndSettings(value) {
  const { error } = await supabase
    .from(SETTINGS)
    .upsert({ key: "year_end", value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------------------------------------------------------
// 計算
// ---------------------------------------------------------

export function isCounted(event) {
  return !NOT_COUNTED.includes(event.status);
}

export function factorForScore(score, bands = DEFAULT_YEAR_END.bands) {
  const sorted = [...bands].sort((a, b) => Number(b.min) - Number(a.min));
  const hit = sorted.find((band) => score >= Number(band.min));
  return hit ? Number(hit.factor) : 1;
}

export function summarizeTeacher(events, baseScore = 100) {
  let plus = 0;
  let minus = 0;
  let plusCount = 0;
  let minusCount = 0;
  let disputed = 0;
  for (const event of events) {
    if (event.status === "disputed" || event.status === "disputing") disputed += 1;
    if (!isCounted(event)) continue;
    const points = Number(event.points) || 0;
    if (points >= 0) {
      plus += points;
      plusCount += 1;
    } else {
      minus += points;
      minusCount += 1;
    }
  }
  return {
    plus,
    minus,
    plusCount,
    minusCount,
    disputed,
    net: plus + minus,
    score: Number(baseScore) + plus + minus,
  };
}

// ---------------------------------------------------------
// 行政配合：直接從老師任務計算（不寫成事件）
// ---------------------------------------------------------

function localDateText(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 10);
}

/** 以日期計算：截止日當天完成算準時，隔天才算逾期第 1 天 */
function lateDays(deadline, finishedAt) {
  const dueDay = new Date(`${localDateText(deadline)}T00:00:00`);
  const doneDay = new Date(`${localDateText(finishedAt)}T00:00:00`);
  return Math.max(0, Math.round((doneDay - dueDay) / 86400000));
}

/**
 * 某位老師在期間內的任務配合情形
 * 期間以任務截止日判斷；逾期每天扣 perDay 分（尚未回報的照目前天數算）
 */
export function computeAdminCooperation(assignments, teacherId, { from, to, since, perDay = 1, exclusions = {} } = {}) {
  const now = new Date();
  const start = [from, since].filter(Boolean).sort().pop();
  const items = [];

  for (const assignment of assignments || []) {
    if (assignment.status && assignment.status !== "active") continue;
    if (!assignment.deadline) continue;
    const deadline = new Date(assignment.deadline);
    const deadlineDay = localDateText(deadline);
    if (start && deadlineDay < start) continue;
    if (to && deadlineDay > to) continue;

    for (const member of assignment.teacher_assignment_members || []) {
      const memberTeacherId = member.teacher_id || member.teachers?.id;
      if (memberTeacherId !== teacherId) continue;

      const completedAt = member.teacher_completed_at
        ? new Date(member.teacher_completed_at)
        : null;

      let status;
      let days = 0;
      if (member.teacher_completed && completedAt) {
        days = lateDays(deadline, completedAt);
        status = days > 0 ? "late" : "ontime";
      } else if (deadline < now) {
        days = lateDays(deadline, now);
        status = "open";
      } else {
        status = "upcoming";
      }

      const exclusion = exclusions[member.id];
      items.push({
        id: member.id,
        title: assignment.title || "未命名任務",
        deadline: deadlineDay,
        completedDay: completedAt ? localDateText(completedAt) : null,
        status,
        days,
        excluded: Boolean(exclusion),
        excludeNote: exclusion?.note || "",
      });
    }
  }

  items.sort((a, b) => b.deadline.localeCompare(a.deadline));
  const due = items.filter((i) => i.status !== "upcoming" && !i.excluded);
  const onTime = due.filter((i) => i.status === "ontime").length;
  const late = due.filter((i) => i.status === "late").length;
  const open = due.filter((i) => i.status === "open").length;
  const overdueDays = due.reduce((sum, i) => sum + i.days, 0);

  return {
    items,
    excludedCount: items.filter((i) => i.excluded).length,
    total: due.length,
    onTime,
    late,
    open,
    overdueDays,
    score: -overdueDays * (Number(perDay) || 0),
  };
}

// ---------------------------------------------------------
// 行政配合：主管設定「不列入計算」的任務
// ---------------------------------------------------------

export async function getAdminExclusions() {
  const { data, error } = await supabase
    .from(SETTINGS)
    .select("value")
    .eq("key", "admin_exclusions")
    .maybeSingle();
  if (error) throw error;
  return data?.value || {};
}

export async function setAdminExclusion(memberId, excluded, note = "") {
  const current = await getAdminExclusions();
  const next = { ...current };
  if (excluded) {
    next[memberId] = { note: note.trim(), at: new Date().toISOString() };
  } else {
    delete next[memberId];
  }
  const { error } = await supabase
    .from(SETTINGS)
    .upsert({ key: "admin_exclusions", value: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}
