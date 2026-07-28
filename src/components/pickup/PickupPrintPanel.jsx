import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const WEEKDAYS = [
  { value: 1, label: "一", column: "monday_time" },
  { value: 2, label: "二", column: "tuesday_time" },
  { value: 3, label: "三", column: "wednesday_time" },
  { value: 4, label: "四", column: "thursday_time" },
  { value: 5, label: "五", column: "friday_time" },
];

const GRADE_GROUP_MAP = {
  一年級: "LOW",
  二年級: "LOW",
  三年級: "MIDDLE",
  四年級: "MIDDLE",
  五年級: "HIGH",
  六年級: "HIGH",
};

const GRADE_ORDER = {
  一年級: 1,
  二年級: 2,
  三年級: 3,
  四年級: 4,
  五年級: 5,
  六年級: 6,
};

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function getMonthDays(year, month) {
  const days = [];
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();

    if (weekday === 0 || weekday === 6) continue;

    days.push({
      day,
      weekday,
      weekdayLabel:
        WEEKDAYS.find((item) => item.value === weekday)?.label ?? "",
      dateString: `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`,
      isMonday: weekday === 1,
    });
  }

  return days;
}

function PickupPrintPanel() {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [school, setSchool] = useState("");

  const [students, setStudents] = useState([]);
  const [rules, setRules] = useState([]);
  const [closures, setClosures] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [studentsResult, rulesResult, closuresResult] = await Promise.all([
      supabase
        .from("students")
        .select(
          `
            id,
            chinese_name,
            school,
            current_grade,
            primary_parent_phone,
            student_status,
            is_test
          `
        )
        .eq("student_status", "ACTIVE"),

      supabase
        .from("pickup_rules")
        .select(
          `
            id,
            school,
            grade_group,
            monday_time,
            tuesday_time,
            wednesday_time,
            thursday_time,
            friday_time,
            is_active
          `
        )
        .eq("is_active", true),

      supabase
        .from("pickup_closures")
        .select(
          `
            id,
            closure_scope,
            school,
            closure_date,
            reason,
            is_active
          `
        )
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

    if (closuresResult.error) {
      console.warn("讀取停接安排失敗：", closuresResult.error);
    }

    const studentData = studentsResult.data ?? [];

    setStudents(studentData);
    setRules(rulesResult.data ?? []);
    setClosures(closuresResult.data ?? []);

    const firstSchool = studentData
      .map((student) => student.school)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "zh-Hant"))[0];

    setSchool((currentSchool) => currentSchool || firstSchool || "");
    setIsLoading(false);
  }

  const schools = useMemo(() => {
    return Array.from(
      new Set(students.map((student) => student.school).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [students]);

  const monthDays = useMemo(() => {
    return getMonthDays(Number(year), Number(month));
  }, [year, month]);

  const visibleStudents = useMemo(() => {
    return students
      .filter((student) => student.school === school)
      .sort((studentA, studentB) => {
        const gradeDifference =
          (GRADE_ORDER[studentA.current_grade] ?? 99) -
          (GRADE_ORDER[studentB.current_grade] ?? 99);

        if (gradeDifference !== 0) {
          return gradeDifference;
        }

        return studentA.chinese_name.localeCompare(
          studentB.chinese_name,
          "zh-Hant"
        );
      });
  }, [students, school]);

  function getRule(student) {
    const gradeGroup = GRADE_GROUP_MAP[student.current_grade];

    return rules.find(
      (rule) =>
        rule.school === student.school &&
        rule.grade_group === gradeGroup
    );
  }

  function getClosure(studentSchool, dateString) {
    return closures.find((closure) => {
      if (closure.closure_date !== dateString) return false;

      if (closure.closure_scope === "ALL") {
        return true;
      }

      return (
        closure.closure_scope === "SCHOOL" &&
        closure.school === studentSchool
      );
    });
  }

  function getCell(student, day) {
    const closure = getClosure(student.school, day.dateString);

    if (closure) {
      return {
        text: "休",
        className: "pickupPrintCell is-closed",
        title: closure.reason || "停接",
      };
    }

    const rule = getRule(student);

    if (!rule) {
      return {
        text: "—",
        className: "pickupPrintCell is-missing",
        title: "尚未建立接車規則",
      };
    }

    const weekday = WEEKDAYS.find(
      (item) => item.value === day.weekday
    );

    const pickupTime = normalizeTime(rule[weekday.column]);

    if (!pickupTime) {
      return {
        text: "—",
        className: "pickupPrintCell is-none",
        title: "當日不接",
      };
    }

    if (pickupTime === "12:50") {
      return {
        text: "",
        className: "pickupPrintCell pickup-noon",
        title: "12:50 接車",
      };
    }

    if (pickupTime === "15:30") {
      return {
        text: "",
        className: "pickupPrintCell pickup-afternoon",
        title: "15:30 接車",
      };
    }

    return {
      text: "",
      className: "pickupPrintCell has-time",
      title: `${pickupTime} 接車`,
    };
  }

  function isFirstStudentOfGrade(studentIndex) {
    if (studentIndex === 0) return false;

    return (
      visibleStudents[studentIndex - 1]?.current_grade !==
      visibleStudents[studentIndex]?.current_grade
    );
  }

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🖨️</span>
          <h2>正在產生接車點名表</h2>
          <p>系統正在讀取學生資料與接車規則。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="pickupPrintPanel">
      <div className="pickupPrintToolbar">
        <div>
          <p className="eyebrow">PICKUP ATTENDANCE SHEET</p>
          <h2>接車點名表</h2>
          <p>選擇學校與月份後，產生 A4 橫式列印表。</p>
        </div>

        <div className="pickupPrintFilters">
          <label>
            <span>年份</span>
            <select
              value={year}
              onChange={(event) =>
                setYear(Number(event.target.value))
              }
            >
              {[year - 1, year, year + 1].map((item) => (
                <option key={item} value={item}>
                  {item} 年
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>月份</span>
            <select
              value={month}
              onChange={(event) =>
                setMonth(Number(event.target.value))
              }
            >
              {Array.from(
                { length: 12 },
                (_, index) => index + 1
              ).map((item) => (
                <option key={item} value={item}>
                  {item} 月
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>國小</span>
            <select
              value={school}
              onChange={(event) => setSchool(event.target.value)}
            >
              {schools.map((schoolName) => (
                <option key={schoolName} value={schoolName}>
                  {schoolName}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => window.print()}>
            列印點名表
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="pickupErrorMessage">{errorMessage}</div>
      )}

      {!school || visibleStudents.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">👧🏻</span>
          <h2>目前沒有可列印的學生資料</h2>
          <p>請確認學生的學校、狀態與篩選條件。</p>
        </div>
      ) : (
        <div className="pickupPrintPage">
          <header className="pickupPrintHeader">
            <div>
              <h1>{school} 接車點名表</h1>
              <p>
                {year} 年 {month} 月
              </p>
            </div>

            <div className="pickupPrintLegend">
              <span>
                <i className="legendBox legendBox--noon" />
                灰底＝12:50
              </span>

              <span>
                <i className="legendBox legendBox--afternoon" />
                白底＝15:30
              </span>

              <span>
                <i className="legendBox legendBox--closed">休</i>
                停接
              </span>

              <span>
                <i className="legendBox legendBox--missing">—</i>
                不接／無規則
              </span>
            </div>
          </header>

          <div className="pickupPrintTableWrap">
            <table className="pickupPrintTable">
              <thead>
                <tr>
                  <th className="gradeColumn">年級</th>
                  <th className="studentColumn">姓名</th>
                  <th className="phoneColumn">家長電話</th>

                  {monthDays.map((day) => (
                    <th
                      key={day.dateString}
                      className={
                        day.isMonday ? "is-week-start" : ""
                      }
                    >
                      <strong>{day.day}</strong>
                      <span>{day.weekdayLabel}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleStudents.map((student, studentIndex) => (
                  <tr
                    key={student.id}
                    className={
                      isFirstStudentOfGrade(studentIndex)
                        ? "is-new-grade"
                        : ""
                    }
                  >
                    <td className="gradeColumn">
                      {student.current_grade}
                    </td>

                    <td className="studentColumn">
                      <strong>{student.chinese_name}</strong>
                    </td>

                    <td className="phoneColumn">
                      {student.primary_parent_phone || "—"}
                    </td>

                    {monthDays.map((day) => {
                      const cell = getCell(student, day);

                      return (
                        <td
                          key={day.dateString}
                          className={`${cell.className}${
                            day.isMonday ? " is-week-start" : ""
                          }`}
                          title={cell.title}
                        >
                          {cell.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="pickupPrintFooter">
            <span>共 {visibleStudents.length} 位學生</span>
            <span>
              列印日期：{now.toLocaleDateString("zh-TW")}
            </span>
          </footer>
        </div>
      )}
    </section>
  );
}

export default PickupPrintPanel;