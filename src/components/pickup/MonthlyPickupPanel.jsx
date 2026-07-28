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
  "一年級": "LOW",
  "二年級": "LOW",
  "三年級": "MIDDLE",
  "四年級": "MIDDLE",
  "五年級": "HIGH",
  "六年級": "HIGH",
};

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function getMonthDays(year, month) {
  const result = [];
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();

    if (weekday === 0 || weekday === 6) continue;

    result.push({
      day,
      weekday,
      weekdayLabel: WEEKDAYS.find((item) => item.value === weekday)?.label ?? "",
      dateString: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }

  return result;
}

function MonthlyPickupPanel() {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [school, setSchool] = useState("ALL");

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
        .eq("student_status", "ACTIVE")
        .order("school")
        .order("current_grade")
        .order("chinese_name"),

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
      setErrorMessage(`讀取學生資料失敗：${studentsResult.error.message}`);
      setIsLoading(false);
      return;
    }

    if (rulesResult.error) {
      setErrorMessage(`讀取接車規則失敗：${rulesResult.error.message}`);
      setIsLoading(false);
      return;
    }

    // 如果停接表尚未建立或欄位名稱不同，不阻擋月表第一版
    if (closuresResult.error) {
      console.warn("讀取停接安排失敗：", closuresResult.error);
    }

    setStudents(studentsResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setClosures(closuresResult.data ?? []);
    setIsLoading(false);
  }

  const schools = useMemo(() => {
    return Array.from(
      new Set(students.map((student) => student.school).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [students]);

  const monthDays = useMemo(
    () => getMonthDays(Number(year), Number(month)),
    [year, month]
  );

  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      if (school !== "ALL" && student.school !== school) return false;
      return true;
    });
  }, [students, school]);

  const groupedStudents = useMemo(() => {
    const groups = new Map();

    visibleStudents.forEach((student) => {
      if (!groups.has(student.school)) {
        groups.set(student.school, []);
      }

      groups.get(student.school).push(student);
    });

    return Array.from(groups.entries());
  }, [visibleStudents]);

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
        className: "monthlyPickupCell is-closed",
        title: closure.reason || "停接",
      };
    }

    const rule = getRule(student);

    if (!rule) {
      return {
        text: "—",
        className: "monthlyPickupCell is-missing",
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
        className: "monthlyPickupCell is-none",
        title: "當日不接",
      };
    }

    if (pickupTime === "12:50") {
      return {
        text: "",
        className: "monthlyPickupCell pickup-noon",
        title: "12:50 接車",
      };
    }

    if (pickupTime === "15:30") {
      return {
        text: "",
        className: "monthlyPickupCell pickup-afternoon",
        title: "15:30 接車",
      };
    }

    return {
      text: "",
      className: "monthlyPickupCell has-time",
      title: `${pickupTime} 接車`,
    };
  }

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🗓️</span>
          <h2>正在產生月接車表</h2>
          <p>系統正在讀取學生資料與接車規則。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="pickupPanel monthlyPickupPanel">
      <div className="monthlyPickupToolbar">
        <div>
          <p className="eyebrow">MONTHLY PICKUP ROSTER</p>
          <h2>月接車表</h2>
          <p>
            依學生學校、目前年級與固定接車規則，自動產生每個平日的接車時間。
          </p>
        </div>

        <div className="monthlyPickupFilters">
          <label>
            <span>年份</span>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
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
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map(
                (item) => (
                  <option key={item} value={item}>
                    {item} 月
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span>學校</span>
            <select
              value={school}
              onChange={(event) => setSchool(event.target.value)}
            >
              <option value="ALL">全部學校</option>
              {schools.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={loadData}>
            重新整理
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="pickupErrorMessage">{errorMessage}</div>
      )}

      <div className="monthlyPickupSummary">
        <span>
          <strong>{visibleStudents.length}</strong>
          位在學學生
        </span>
        <span>
          <strong>{groupedStudents.length}</strong>
          所學校
        </span>
        <span>
          <strong>{monthDays.length}</strong>
          個平日
        </span>
      </div>

      <div className="monthlyPickupLegend" aria-label="月接車表圖例">
        <span>
          <i className="legendBox legendBox--noon" aria-hidden="true" />
          12:50 接
        </span>

        <span>
          <i
            className="legendBox legendBox--afternoon"
            aria-hidden="true"
          />
          15:30 接
        </span>

        <span>
          <i className="legendBox legendBox--missing" aria-hidden="true">
            —
          </i>
          尚未設定規則
        </span>

        <span>
          <i className="legendBox legendBox--closed" aria-hidden="true">
            休
          </i>
          停接
        </span>
      </div>

      {groupedStudents.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">👧🏻</span>
          <h2>目前沒有符合條件的學生</h2>
          <p>請確認學生狀態、學校篩選或匯入資料。</p>
        </div>
      ) : (
        <div className="monthlyPickupSchoolGroups">
          {groupedStudents.map(([schoolName, schoolStudents]) => (
            <div key={schoolName} className="monthlyPickupSchoolGroup">
              <div className="monthlyPickupSchoolHeader">
                <div>
                  <p className="eyebrow">SCHOOL</p>
                  <h3>{schoolName}</h3>
                </div>
                <span>{schoolStudents.length} 位學生</span>
              </div>

              <div className="monthlyPickupTableWrap">
                <table className="monthlyPickupTable">
                  <thead>
                    <tr>
                      <th className="studentColumn">學生</th>
                      <th className="gradeColumn">年級</th>
                      <th className="phoneColumn">家長電話</th>

                      {monthDays.map((day) => (
                        <th key={day.dateString} title={day.dateString}>
                          <strong>{day.day}</strong>
                          <span>{day.weekdayLabel}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {schoolStudents.map((student) => (
                      <tr key={student.id}>
                        <td className="studentColumn">
                          <strong>{student.chinese_name}</strong>
                          {student.is_test && <small>測試</small>}
                        </td>

                        <td className="gradeColumn">
                          {student.current_grade}
                        </td>

                        <td className="phoneColumn">
                          {student.primary_parent_phone || "—"}
                        </td>

                        {monthDays.map((day) => {
                          const cell = getCell(student, day);

                          return (
                            <td
                              key={day.dateString}
                              className={cell.className}
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default MonthlyPickupPanel;