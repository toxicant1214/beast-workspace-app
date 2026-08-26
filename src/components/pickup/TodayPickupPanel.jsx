import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { getStudentPickupDecision } from "./pickupStudentSchedule";

const WEEKDAYS = [
  { value: 1, label: "星期一", column: "monday_time" },
  { value: 2, label: "星期二", column: "tuesday_time" },
  { value: 3, label: "星期三", column: "wednesday_time" },
  { value: 4, label: "星期四", column: "thursday_time" },
  { value: 5, label: "星期五", column: "friday_time" },
];

const GRADE_GROUP_MAP = {
  一年級: "LOW",
  二年級: "LOW",
  三年級: "MIDDLE",
  四年級: "MIDDLE",
  五年級: "HIGH",
  六年級: "HIGH",
};

const SCHOOL_ORDER = ["麗園", "麗林", "頭湖", "新林", "南勢", "東湖"];

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function getTimePeriod(value) {
  const time = normalizeTime(value);

  if (!time) return "";

  return time < "14:00"
    ? "NOON"
    : "AFTERNOON";
}

function getFallbackTimeByPeriod(period) {
  if (period === "NOON") {
    return "12:20";
  }

  if (period === "AFTERNOON") {
    return "15:30";
  }

  return "";
}

function getStudentName(student) {
  return (
    student.chinese_name ||
    student.name ||
    student.student_name ||
    student.full_name ||
    student.english_name ||
    "未命名學生"
  );
}

function getSchoolOrder(school) {
  const index = SCHOOL_ORDER.indexOf(school);
  return index === -1 ? 999 : index;
}

function parseDateKey(dateKey) {
  if (!dateKey) {
    return null;
  }

  const [year, month, day] = String(dateKey)
    .split("-")
    .map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}

function formatSelectedDate(dateKey) {
  const date = parseDateKey(dateKey);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function getTodayDateKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(
    now.getTime() -
      offset * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
}

function TodayPickupPanel({
  selectedDate,
}) {
  const [students, setStudents] = useState([]);
  const [rules, setRules] = useState([]);
  const [staffRules, setStaffRules] = useState([]);
  const [closures, setClosures] = useState([]);
  const [dayOverrides, setDayOverrides] = useState([]);
  const [studentWeeklyRules, setStudentWeeklyRules] = useState([]);
  const [studentDateExceptions, setStudentDateExceptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const effectiveSelectedDate =
    selectedDate ||
    getTodayDateKey();

  const selectedDateObject =
    parseDateKey(
      effectiveSelectedDate
    );

  const selectedWeekday =
    selectedDateObject?.getDay();

  const selectedConfig =
    WEEKDAYS.find(
      (weekday) =>
        weekday.value ===
        selectedWeekday
    );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [
      studentsResult,
      rulesResult,
      staffResult,
      closuresResult,
      overridesResult,
      studentWeeklyResult,
      studentExceptionsResult,
    ] = await Promise.all([
      supabase
        .from("students")
        .select("*")
        .eq("student_status", "ACTIVE"),
      supabase
        .from("pickup_rules")
        .select("*")
        .eq("is_active", true),
      supabase
        .from("pickup_staff_rules")
        .select("*")
        .eq("is_active", true),
      supabase
        .from("pickup_closures")
        .select("*")
        .eq("is_active", true),
      supabase
        .from("calendar_day_overrides")
        .select(
          "id, semester_id, override_date, override_type, title, notes"
        ),
      supabase
        .from("pickup_student_weekly_rules")
        .select("*")
        .eq("is_active", true),
      supabase
        .from("pickup_student_date_exceptions")
        .select("*")
        .eq("is_active", true),
    ]);

    if (studentsResult.error) {
      setErrorMessage(
        `讀取學生資料失敗：${studentsResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (rulesResult.error) {
      setErrorMessage(
        `讀取接車規則失敗：${rulesResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (staffResult.error) {
      setErrorMessage(
        `讀取接車老師失敗：${staffResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (closuresResult.error) {
      setErrorMessage(
        `讀取臨時停接安排失敗：${closuresResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (overridesResult.error) {
      setErrorMessage(
        `讀取行事曆重要日期失敗：${overridesResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (studentWeeklyResult.error) {
      setErrorMessage(
        `讀取學生固定接送設定失敗：${studentWeeklyResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (studentExceptionsResult.error) {
      setErrorMessage(
        `讀取學生單日接送例外失敗：${studentExceptionsResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    setStudents(studentsResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setStaffRules(staffResult.data ?? []);
    setClosures(closuresResult.data ?? []);
    setDayOverrides(overridesResult.data ?? []);
    setStudentWeeklyRules(studentWeeklyResult.data ?? []);
    setStudentDateExceptions(studentExceptionsResult.data ?? []);
    setIsLoading(false);
  }


  const sharedDayOff = dayOverrides.find(
    (item) =>
      item.override_date === effectiveSelectedDate &&
      (
        item.override_type === "HOLIDAY" ||
        item.override_type === "CLASSROOM_CLOSED"
      )
  );

  const allClosure = closures.find(
    (closure) =>
      closure.closure_date === effectiveSelectedDate &&
      closure.closure_scope === "ALL"
  );

  function getSchoolClosure(school) {
    return closures.find(
      (closure) =>
        closure.closure_date === effectiveSelectedDate &&
        closure.closure_scope === "SCHOOL" &&
        closure.school === school
    );
  }

  const pickupGroups = useMemo(() => {
    if (!selectedConfig) return [];
    if (sharedDayOff || allClosure) return [];

    const groupMap = new Map();

    students.forEach((student) => {
      const school = student.school?.trim();
      const gradeGroup =
        GRADE_GROUP_MAP[student.current_grade];

      if (!school || !gradeGroup) return;
      if (getSchoolClosure(school)) return;

      const pickupDecision = getStudentPickupDecision({
        studentId: student.id,
        dateKey: effectiveSelectedDate,
        weeklyRules: studentWeeklyRules,
        dateExceptions: studentDateExceptions,
      });

      if (!pickupDecision.shouldPickup) return;

      const matchingRule = rules.find(
        (rule) =>
          rule.school === school &&
          rule.grade_group === gradeGroup
      );

      const defaultPickupTime = normalizeTime(
        matchingRule?.[selectedConfig.column]
      );

      const pickupPeriod =
        pickupDecision.pickupPeriod ||
        "";

      let pickupTime =
        defaultPickupTime;

      if (pickupPeriod) {
        const schoolPeriodTimes = rules
          .filter(
            (rule) =>
              rule.school === school
          )
          .map((rule) =>
            normalizeTime(
              rule[selectedConfig.column]
            )
          )
          .filter(
            (time) =>
              time &&
              getTimePeriod(time) ===
                pickupPeriod
          )
          .sort();

        pickupTime =
          schoolPeriodTimes[0] ||
          getFallbackTimeByPeriod(
            pickupPeriod
          );
      }

      if (!pickupTime) return;

      const key = `${pickupTime}|${school}`;

      if (!groupMap.has(key)) {
        const matchingStaffRule = staffRules.find(
          (staffRule) =>
            staffRule.school === school &&
            Number(staffRule.weekday) === selectedWeekday &&
            normalizeTime(staffRule.pickup_time) === pickupTime
        );

        groupMap.set(key, {
          key,
          school,
          pickupTime,
          teacherNames: Array.isArray(
            matchingStaffRule?.staff_names
          )
            ? matchingStaffRule.staff_names
            : [],
          students: [],
        });
      }

      groupMap.get(key).students.push({
        ...student,
        pickupDecisionSource:
          pickupDecision.source,
        pickupPeriodOverride:
          pickupDecision.pickupPeriod ||
          null,
      });
    });

    return Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        students: [...group.students].sort((a, b) =>
          getStudentName(a).localeCompare(
            getStudentName(b),
            "zh-Hant"
          )
        ),
      }))
      .sort((a, b) => {
        const timeCompare = a.pickupTime.localeCompare(
          b.pickupTime
        );

        if (timeCompare !== 0) return timeCompare;

        const schoolCompare =
          getSchoolOrder(a.school) -
          getSchoolOrder(b.school);

        if (schoolCompare !== 0) return schoolCompare;

        return a.school.localeCompare(b.school, "zh-Hant");
      });
  }, [
    students,
    rules,
    staffRules,
    selectedConfig,
    selectedWeekday,
    closures,
    dayOverrides,
    sharedDayOff,
    allClosure,
    studentWeeklyRules,
    studentDateExceptions,
    effectiveSelectedDate,
  ]);

  const totalStudents = useMemo(
    () =>
      pickupGroups.reduce(
        (sum, group) => sum + group.students.length,
        0
      ),
    [pickupGroups]
  );

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🚌</span>
          <h2>正在整理接車安排</h2>
          <p>請稍候一下。</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="pickupPanel"
      style={{
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "22px",
        }}
      >
        <div>
          <p className="eyebrow">PICKUP SCHEDULE</p>
          <h2 style={{ margin: "4px 0 8px" }}>
            接車安排
          </h2>
          <p
            style={{
              margin: 0,
              color: "#6f746f",
              lineHeight: 1.7,
            }}
          >
            {formatSelectedDate(effectiveSelectedDate)}
          </p>
        </div>

        <button
          type="button"
          className="pickupStaffRefreshButton"
          onClick={loadData}
        >
          重新整理
        </button>
      </div>

      {errorMessage && (
        <div className="pickupStaffError">
          {errorMessage}
        </div>
      )}

      {sharedDayOff || allClosure ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🌿</span>
          <h2>當日全體停接</h2>
          <p>
            {sharedDayOff?.title ||
              allClosure?.reason ||
              "當日沒有接車安排。"}
          </p>
        </div>
      ) : !selectedConfig ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🌿</span>
          <h2>當日沒有固定接車安排</h2>
          <p>週末不會顯示平日接車規則。</p>
        </div>
      ) : pickupGroups.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🚌</span>
          <h2>當日沒有接車資料</h2>
          <p>
            請確認學生學校、年級與接車規則是否已完整設定。
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                border: "1px solid #deded8",
                borderRadius: "14px",
                background: "#fafaf7",
              }}
            >
              <small style={{ color: "#777b76" }}>
                當日接車人數
              </small>
              <strong
                style={{
                  display: "block",
                  marginTop: "6px",
                  fontSize: "26px",
                }}
              >
                {totalStudents} 人
              </strong>
            </div>

            <div
              style={{
                padding: "16px 18px",
                border: "1px solid #deded8",
                borderRadius: "14px",
                background: "#fafaf7",
              }}
            >
              <small style={{ color: "#777b76" }}>
                接車趟次
              </small>
              <strong
                style={{
                  display: "block",
                  marginTop: "6px",
                  fontSize: "26px",
                }}
              >
                {pickupGroups.length} 趟
              </strong>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {pickupGroups.map((group) => (
              <article
                key={group.key}
                style={{
                  border: "1px solid #d9d9d4",
                  borderRadius: "16px",
                  overflow: "hidden",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "110px minmax(120px, 1fr) minmax(180px, 1.4fr)",
                    alignItems: "center",
                    gap: "14px",
                    padding: "16px 18px",
                    background: "#f5f5f1",
                    borderBottom: "1px solid #deded8",
                  }}
                >
                  <div>
                    <small style={{ color: "#747872" }}>
                      接車時間
                    </small>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "4px",
                        fontSize: "22px",
                      }}
                    >
                      {group.pickupTime}
                    </strong>
                  </div>

                  <div>
                    <small style={{ color: "#747872" }}>
                      學校
                    </small>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "4px",
                        fontSize: "18px",
                      }}
                    >
                      {group.school}
                    </strong>
                  </div>

                  <div>
                    <small style={{ color: "#747872" }}>
                      負責老師
                    </small>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "4px",
                        fontSize: "16px",
                      }}
                    >
                      {group.teacherNames.length > 0
                        ? group.teacherNames.join("、")
                        : "尚未安排"}
                    </strong>
                  </div>
                </div>

                <div style={{ padding: "16px 18px 18px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <strong>
                      接車學生（{group.students.length} 人）
                    </strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    {group.students.map((student) => (
                      <span
                        key={student.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: "32px",
                          padding: "5px 10px",
                          border: "1px solid #deded8",
                          borderRadius: "999px",
                          background: "#fbfbf8",
                          fontSize: "14px",
                        }}
                      >
                        {getStudentName(student)}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default TodayPickupPanel;