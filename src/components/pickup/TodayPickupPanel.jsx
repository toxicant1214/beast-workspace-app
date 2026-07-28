import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

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

function formatToday() {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function TodayPickupPanel() {
  const [students, setStudents] = useState([]);
  const [rules, setRules] = useState([]);
  const [staffRules, setStaffRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const todayWeekday = new Date().getDay();
  const todayConfig = WEEKDAYS.find(
    (weekday) => weekday.value === todayWeekday
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [studentsResult, rulesResult, staffResult] =
      await Promise.all([
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

    setStudents(studentsResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setStaffRules(staffResult.data ?? []);
    setIsLoading(false);
  }

  const pickupGroups = useMemo(() => {
    if (!todayConfig) return [];

    const groupMap = new Map();

    students.forEach((student) => {
      const school = student.school?.trim();
      const gradeGroup =
        GRADE_GROUP_MAP[student.current_grade];

      if (!school || !gradeGroup) return;

      const matchingRule = rules.find(
        (rule) =>
          rule.school === school &&
          rule.grade_group === gradeGroup
      );

      const pickupTime = normalizeTime(
        matchingRule?.[todayConfig.column]
      );

      if (!pickupTime) return;

      const key = `${pickupTime}|${school}`;

      if (!groupMap.has(key)) {
        const matchingStaffRule = staffRules.find(
          (staffRule) =>
            staffRule.school === school &&
            Number(staffRule.weekday) === todayWeekday &&
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

      groupMap.get(key).students.push(student);
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
    todayConfig,
    todayWeekday,
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
          <h2>正在整理今日接車安排</h2>
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
          <p className="eyebrow">TODAY PICKUP</p>
          <h2 style={{ margin: "4px 0 8px" }}>
            今日接車安排
          </h2>
          <p
            style={{
              margin: 0,
              color: "#6f746f",
              lineHeight: 1.7,
            }}
          >
            {formatToday()}
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

      {!todayConfig ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🌿</span>
          <h2>今天沒有固定接車安排</h2>
          <p>週末不會顯示平日接車規則。</p>
        </div>
      ) : pickupGroups.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🚌</span>
          <h2>今天沒有接車資料</h2>
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
                今日接車人數
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