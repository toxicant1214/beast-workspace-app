const OVERRIDE_TYPE_LABELS = {
  HOLIDAY: "國定假日",
  CLASSROOM_CLOSED: "教室休假",
  SPECIAL_WORKDAY: "特殊上班日",
};

const CLOSED_OVERRIDE_TYPES = new Set([
  "HOLIDAY",
  "CLASSROOM_CLOSED",
]);

const WORKING_OVERRIDE_TYPES = new Set([
  "SPECIAL_WORKDAY",
]);

/**
 * 將 Date 或 YYYY-MM-DD 字串統一轉成 YYYY-MM-DD。
 *
 * 不使用 toISOString()，避免台灣時區出現日期前後偏移。
 */
export function normalizeCalendarDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  if (typeof dateValue === "string") {
    const trimmedValue = dateValue.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      return trimmedValue;
    }

    const parsedDate = new Date(trimmedValue);

    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    return formatDateParts(parsedDate);
  }

  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) {
      return "";
    }

    return formatDateParts(dateValue);
  }

  return "";
}

/**
 * 將 Date 轉成 YYYY-MM-DD。
 */
function formatDateParts(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * 將 YYYY-MM-DD 轉為本地 Date。
 *
 * 直接 new Date("2026-09-01") 可能受到 UTC 解析影響，
 * 所以改成分開建立年月日。
 */
export function parseCalendarDate(dateValue) {
  const normalizedDate = normalizeCalendarDate(dateValue);

  if (!normalizedDate) {
    return null;
  }

  const [year, month, day] = normalizedDate
    .split("-")
    .map(Number);

  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

/**
 * 判斷日期是否為星期六或星期日。
 */
export function isWeekend(dateValue) {
  const parsedDate = parseCalendarDate(dateValue);

  if (!parsedDate) {
    return false;
  }

  const weekday = parsedDate.getDay();

  return weekday === 0 || weekday === 6;
}

/**
 * 判斷日期是否在指定學期範圍內。
 */
export function isDateWithinSemester(
  dateValue,
  semesterStartDate,
  semesterEndDate
) {
  const normalizedDate = normalizeCalendarDate(dateValue);
  const normalizedStartDate =
    normalizeCalendarDate(semesterStartDate);
  const normalizedEndDate =
    normalizeCalendarDate(semesterEndDate);

  if (
    !normalizedDate ||
    !normalizedStartDate ||
    !normalizedEndDate
  ) {
    return false;
  }

  return (
    normalizedDate >= normalizedStartDate &&
    normalizedDate <= normalizedEndDate
  );
}

/**
 * 找出指定日期的特殊設定。
 *
 * dayOverrides 預期格式：
 * {
 *   id,
 *   override_date,
 *   override_type,
 *   title,
 *   notes
 * }
 */
export function findDayOverride(dateValue, dayOverrides = []) {
  const normalizedDate = normalizeCalendarDate(dateValue);

  if (!normalizedDate || !Array.isArray(dayOverrides)) {
    return null;
  }

  return (
    dayOverrides.find(
      (item) =>
        normalizeCalendarDate(item?.override_date) ===
        normalizedDate
    ) || null
  );
}

/**
 * 取得單日的完整判斷結果。
 *
 * 判斷順序：
 * 1. 日期是否合法
 * 2. 日期是否在學期範圍內
 * 3. 是否存在特殊日期設定
 * 4. 若無特殊設定，星期一至星期五為正常上課日
 * 5. 星期六、星期日為一般休息日
 */
export function getCalendarDay({
  date,
  semesterStartDate,
  semesterEndDate,
  dayOverrides = [],
}) {
  const normalizedDate = normalizeCalendarDate(date);
  const parsedDate = parseCalendarDate(normalizedDate);

  if (!normalizedDate || !parsedDate) {
    return {
      date: normalizedDate,
      isValid: false,
      isWithinSemester: false,
      isWorkday: false,
      isClosed: true,
      isWeekend: false,
      source: "INVALID_DATE",
      type: "INVALID_DATE",
      typeLabel: "日期錯誤",
      title: "日期格式不正確",
      notes: null,
      override: null,
    };
  }

  const withinSemester = isDateWithinSemester(
    normalizedDate,
    semesterStartDate,
    semesterEndDate
  );

  const weekend = isWeekend(normalizedDate);

  if (!withinSemester) {
    return {
      date: normalizedDate,
      isValid: true,
      isWithinSemester: false,
      isWorkday: false,
      isClosed: true,
      isWeekend: weekend,
      source: "OUTSIDE_SEMESTER",
      type: "OUTSIDE_SEMESTER",
      typeLabel: "非本學期",
      title: "不在目前學期範圍內",
      notes: null,
      override: null,
    };
  }

  const dayOverride = findDayOverride(
    normalizedDate,
    dayOverrides
  );

  if (dayOverride) {
    const overrideType = dayOverride.override_type;

    if (WORKING_OVERRIDE_TYPES.has(overrideType)) {
      return {
        date: normalizedDate,
        isValid: true,
        isWithinSemester: true,
        isWorkday: true,
        isClosed: false,
        isWeekend: weekend,
        source: "OVERRIDE",
        type: overrideType,
        typeLabel:
          OVERRIDE_TYPE_LABELS[overrideType] ||
          overrideType,
        title:
          dayOverride.title ||
          OVERRIDE_TYPE_LABELS[overrideType] ||
          "特殊上班日",
        notes: dayOverride.notes || null,
        override: dayOverride,
      };
    }

    if (CLOSED_OVERRIDE_TYPES.has(overrideType)) {
      return {
        date: normalizedDate,
        isValid: true,
        isWithinSemester: true,
        isWorkday: false,
        isClosed: true,
        isWeekend: weekend,
        source: "OVERRIDE",
        type: overrideType,
        typeLabel:
          OVERRIDE_TYPE_LABELS[overrideType] ||
          overrideType,
        title:
          dayOverride.title ||
          OVERRIDE_TYPE_LABELS[overrideType] ||
          "休假日",
        notes: dayOverride.notes || null,
        override: dayOverride,
      };
    }

    return {
      date: normalizedDate,
      isValid: true,
      isWithinSemester: true,
      isWorkday: !weekend,
      isClosed: weekend,
      isWeekend: weekend,
      source: "UNKNOWN_OVERRIDE",
      type: overrideType || "UNKNOWN_OVERRIDE",
      typeLabel: overrideType || "未知類型",
      title: dayOverride.title || "未識別的日期設定",
      notes: dayOverride.notes || null,
      override: dayOverride,
    };
  }

  if (weekend) {
    return {
      date: normalizedDate,
      isValid: true,
      isWithinSemester: true,
      isWorkday: false,
      isClosed: true,
      isWeekend: true,
      source: "WEEKLY_RULE",
      type: "WEEKEND",
      typeLabel: "週末",
      title: "一般休息日",
      notes: null,
      override: null,
    };
  }

  return {
    date: normalizedDate,
    isValid: true,
    isWithinSemester: true,
    isWorkday: true,
    isClosed: false,
    isWeekend: false,
    source: "WEEKLY_RULE",
    type: "REGULAR_WORKDAY",
    typeLabel: "正常上課日",
    title: "正常上課",
    notes: null,
    override: null,
  };
}

/**
 * 只取得「這一天是否需要上班／上課」。
 */
export function isCalendarWorkday(options) {
  return getCalendarDay(options).isWorkday;
}

/**
 * 取得某段日期內的每日判斷結果。
 */
export function getCalendarDateRange({
  startDate,
  endDate,
  semesterStartDate,
  semesterEndDate,
  dayOverrides = [],
}) {
  const parsedStartDate = parseCalendarDate(startDate);
  const parsedEndDate = parseCalendarDate(endDate);

  if (!parsedStartDate || !parsedEndDate) {
    return [];
  }

  if (parsedEndDate < parsedStartDate) {
    return [];
  }

  const results = [];
  const currentDate = new Date(parsedStartDate);

  while (currentDate <= parsedEndDate) {
    results.push(
      getCalendarDay({
        date: currentDate,
        semesterStartDate,
        semesterEndDate,
        dayOverrides,
      })
    );

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return results;
}

/**
 * 找出指定日期之後的下一個上課日。
 */
export function getNextCalendarWorkday({
  date,
  semesterStartDate,
  semesterEndDate,
  dayOverrides = [],
  includeCurrentDate = false,
}) {
  const parsedDate = parseCalendarDate(date);
  const parsedSemesterEndDate =
    parseCalendarDate(semesterEndDate);

  if (!parsedDate || !parsedSemesterEndDate) {
    return null;
  }

  const currentDate = new Date(parsedDate);

  if (!includeCurrentDate) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  while (currentDate <= parsedSemesterEndDate) {
    const calendarDay = getCalendarDay({
      date: currentDate,
      semesterStartDate,
      semesterEndDate,
      dayOverrides,
    });

    if (calendarDay.isWorkday) {
      return calendarDay;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return null;
}

/**
 * 找出指定日期之前的上一個上課日。
 */
export function getPreviousCalendarWorkday({
  date,
  semesterStartDate,
  semesterEndDate,
  dayOverrides = [],
  includeCurrentDate = false,
}) {
  const parsedDate = parseCalendarDate(date);
  const parsedSemesterStartDate =
    parseCalendarDate(semesterStartDate);

  if (!parsedDate || !parsedSemesterStartDate) {
    return null;
  }

  const currentDate = new Date(parsedDate);

  if (!includeCurrentDate) {
    currentDate.setDate(currentDate.getDate() - 1);
  }

  while (currentDate >= parsedSemesterStartDate) {
    const calendarDay = getCalendarDay({
      date: currentDate,
      semesterStartDate,
      semesterEndDate,
      dayOverrides,
    });

    if (calendarDay.isWorkday) {
      return calendarDay;
    }

    currentDate.setDate(currentDate.getDate() - 1);
  }

  return null;
}

export { OVERRIDE_TYPE_LABELS };