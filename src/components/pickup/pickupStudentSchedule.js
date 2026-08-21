const WEEKDAY_KEYS = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
};


export function getDateWeekday(
  dateKey
) {
  if (!dateKey) {
    return null;
  }


  const [
    year,
    month,
    day,
  ] = String(dateKey)
    .split("-")
    .map(Number);


  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }


  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  ).getDay();
}


export function getStudentPickupDecision({
  studentId,
  dateKey,
  weeklyRules = [],
  dateExceptions = [],
}) {
  /*
   * 判斷優先順序：
   *
   * 1. 單日例外
   * 2. 學生每週固定接送設定
   * 3. 沒有特殊設定 → 沿用原本接車規則
   */


  const dateException =
    dateExceptions.find(
      (item) =>
        item.student_id ===
          studentId &&
        item.pickup_date ===
          dateKey &&
        item.is_active !==
          false
    );


  if (dateException) {
    return {
      shouldPickup:
        Boolean(
          dateException.should_pickup
        ),

      source:
        "DATE_EXCEPTION",

      note:
        dateException.note ||
        "",
    };
  }


  const weekday =
    getDateWeekday(
      dateKey
    );


  const weekdayKey =
    WEEKDAY_KEYS[
      weekday
    ];


  /*
   * 六、日沒有平日固定接車。
   */
  if (!weekdayKey) {
    return {
      shouldPickup:
        false,

      source:
        "WEEKEND",

      note:
        "",
    };
  }


  const weeklyRule =
    weeklyRules.find(
      (item) =>
        item.student_id ===
          studentId &&
        item.is_active !==
          false
    );


  /*
   * 沒有建立學生特殊規則：
   *
   * 不干涉原本的
   * pickup_rules。
   */
  if (!weeklyRule) {
    return {
      shouldPickup:
        true,

      source:
        "DEFAULT",

      note:
        "",
    };
  }


  const columnName =
    `${weekdayKey}_pickup`;


  return {
    shouldPickup:
      Boolean(
        weeklyRule[
          columnName
        ]
      ),

    source:
      "WEEKLY_RULE",

    note:
      weeklyRule.note ||
      "",
  };
}