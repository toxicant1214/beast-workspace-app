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
   * 優先順序：
   *
   * 1. 單日特殊設定
   * 2. 學生每週固定特殊設定
   * 3. 一般學校＋年級 pickup_rules
   *
   * pickupPeriod：
   * NOON       → 強制中午車
   * AFTERNOON  → 強制下午車
   * null       → 不覆蓋一般接車時間
   */


  const dateException =
    dateExceptions.find(
      (item) =>
        item.student_id === studentId &&
        item.pickup_date === dateKey &&
        item.is_active !== false
    );


  if (dateException) {
    const status =
      dateException.attendance_status ||
      (
        dateException.should_pickup
          ? "NORMAL"
          : "LEGACY_NO_PICKUP"
      );

    const shouldPickup =
      status === "NORMAL";

    return {
      shouldPickup,

      status,

      pickupPeriod:
        shouldPickup
          ? dateException.pickup_period ||
            null
          : null,

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
   * 星期六、日：
   * 沒有平日固定接車。
   */
  if (!weekdayKey) {
    return {
      shouldPickup:
        false,

      status:
        "WEEKEND",

      pickupPeriod:
        null,

      source:
        "WEEKEND",

      note:
        "",
    };
  }


  const weeklyRule =
    weeklyRules.find(
      (item) =>
        item.student_id === studentId &&
        item.is_active !== false
    );


  /*
   * 完全沒有個人特殊設定：
   * 交回一般 pickup_rules 決定。
   */
  if (!weeklyRule) {
    return {
      shouldPickup:
        true,

      status:
        "NORMAL",

      pickupPeriod:
        null,

      source:
        "DEFAULT",

      note:
        "",
    };
  }


  const pickupColumnName =
    `${weekdayKey}_pickup`;

  const statusColumnName =
    `${weekdayKey}_status`;

  const periodColumnName =
    `${weekdayKey}_period`;


  const status =
    weeklyRule[
      statusColumnName
    ] ||
    (
      weeklyRule[
        pickupColumnName
      ]
        ? "NORMAL"
        : "LEGACY_NO_PICKUP"
    );


  const shouldPickup =
    status === "NORMAL";


  return {
    /*
     * NORMAL
     * → 有接車。
     *
     * ABSENT
     * LATE_ARRIVAL
     * PARENT_DROP_OFF
     * LEGACY_NO_PICKUP
     * → 不列入接車。
     */

    shouldPickup,

    status,

    pickupPeriod:
      shouldPickup
        ? weeklyRule[
            periodColumnName
          ] || null
        : null,

    source:
      "WEEKLY_RULE",

    note:
      weeklyRule.note ||
      "",
  };
}