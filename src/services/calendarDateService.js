import { supabase } from "../lib/supabase";


export const DAY_OVERRIDE_TYPES = {
  HOLIDAY: "HOLIDAY",
  CLASSROOM_CLOSED: "CLASSROOM_CLOSED",
  SPECIAL_WORKDAY: "SPECIAL_WORKDAY",
};


function normalizeDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  if (typeof dateValue === "string") {
    return dateValue.slice(0, 10);
  }

  const year = dateValue.getFullYear();
  const month = String(
    dateValue.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    dateValue.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getLocalDayOfWeek(dateString) {
  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day
  ).getDay();
}


/**
 * 找出某日期所屬的學期。
 *
 * 有找到：
 * → 學期間
 *
 * 沒找到：
 * → 非學期間（寒暑假）
 */
export async function getSemesterForDate(
  dateValue
) {
  const date =
    normalizeDate(dateValue);

  if (!date) {
    return null;
  }

  const { data, error } =
    await supabase
      .from("calendar_semesters")
      .select(
        "id, name, start_date, end_date, status"
      )
      .lte("start_date", date)
      .gte("end_date", date)
      .neq("status", "ARCHIVED")
      .order("start_date", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}


/**
 * 判斷某日期是否位於學期間。
 */
export async function isSemesterDate(
  dateValue
) {
  const semester =
    await getSemesterForDate(
      dateValue
    );

  return Boolean(semester);
}


/**
 * 取得某一天的學期重要日期設定。
 */
export async function getDayOverride(
  dateValue
) {
  const date =
    normalizeDate(dateValue);

  if (!date) {
    return null;
  }

  const semester =
    await getSemesterForDate(date);

  if (!semester) {
    return null;
  }

  const { data, error } =
    await supabase
      .from("calendar_day_overrides")
      .select(
        `
          id,
          semester_id,
          override_date,
          override_type,
          title,
          notes
        `
      )
      .eq(
        "semester_id",
        semester.id
      )
      .eq(
        "override_date",
        date
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}


/**
 * 判斷某一天是不是共用休假。
 *
 * 國定假日 → true
 * 教室休假 → true
 * 特殊上班日 → false
 */
export async function isSharedDayOff(
  dateValue
) {
  const override =
    await getDayOverride(
      dateValue
    );

  if (!override) {
    return false;
  }

  return (
    override.override_type ===
      DAY_OVERRIDE_TYPES.HOLIDAY ||
    override.override_type ===
      DAY_OVERRIDE_TYPES.CLASSROOM_CLOSED
  );
}


/**
 * 判斷某一天是不是特殊上班日。
 */
export async function isSpecialWorkday(
  dateValue
) {
  const override =
    await getDayOverride(
      dateValue
    );

  return (
    override?.override_type ===
    DAY_OVERRIDE_TYPES.SPECIAL_WORKDAY
  );
}


/**
 * 判斷是否為工作日。
 *
 * 基本：
 * 週一～週五 → 工作日
 * 週六、週日 → 非工作日
 *
 * 例外：
 * HOLIDAY / CLASSROOM_CLOSED
 * → 非工作日
 *
 * SPECIAL_WORKDAY
 * → 工作日
 *
 * 注意：
 * 這個判斷不管是不是寒暑假。
 * 所以晨報可以全年使用。
 */
export async function isWorkingDay(
  dateValue
) {
  const date =
    normalizeDate(dateValue);

  if (!date) {
    return false;
  }

  const override =
    await getDayOverride(date);

  if (
    override?.override_type ===
    DAY_OVERRIDE_TYPES.SPECIAL_WORKDAY
  ) {
    return true;
  }

  if (
    override?.override_type ===
      DAY_OVERRIDE_TYPES.HOLIDAY ||
    override?.override_type ===
      DAY_OVERRIDE_TYPES.CLASSROOM_CLOSED
  ) {
    return false;
  }

  const dayOfWeek =
    getLocalDayOfWeek(date);

  return (
    dayOfWeek >= 1 &&
    dayOfWeek <= 5
  );
}


/**
 * 學期常態功能是否應該在這一天運作。
 *
 * 例如：
 * - 學期清潔表
 * - 常態課程
 * - 學期點名
 * - 學期接送
 */
export async function isSemesterWorkingDay(
  dateValue
) {
  const semester =
    await isSemesterDate(
      dateValue
    );

  if (!semester) {
    return false;
  }

  return isWorkingDay(
    dateValue
  );
}