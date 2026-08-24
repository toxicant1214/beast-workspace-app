import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";
import { getStudentPickupDecision } from "../components/pickup/pickupStudentSchedule";

const TABS = [
  {
    key: "MONTHLY",
    label: "月點心表",
    description: "查看各班每日點心基準人數",
  },
  {
    key: "PREFERENCES",
    label: "點心選擇",
    description: "設定學生與班外學生的口味",
  },
  {
    key: "SUMMARY",
    label: "訂購統計",
    description: "查看各班與全校訂購總計",
  },
  {
    key: "SETTINGS",
    label: "點心設定",
    description: "管理點心品項與口味",
  },
];

const CLOSED_EVENT_TYPES = new Set([
  "HOLIDAY",
  "CLASSROOM_CLOSED",
]);

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function formatDate(dateValue) {
  if (!dateValue) return "—";

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parseLocalDate(dateValue));
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function getMonthValue(dateValue) {
  if (!dateValue) return "";
  return dateValue.slice(0, 7);
}

function getMonthDays(monthValue, semester) {
  if (!monthValue || !semester) return [];

  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateString = toDateString(date);

    if (
      dateString < semester.start_date ||
      dateString > semester.end_date
    ) {
      continue;
    }

    days.push({
      date,
      dateString,
      day,
      weekday: date.getDay(),
    });
  }

  return days;
}

function isMembershipActiveOnDate(membership, dateString) {
  if (!membership?.joined_at) return false;

  if (membership.joined_at > dateString) {
    return false;
  }

  if (membership.left_at && membership.left_at < dateString) {
    return false;
  }

  return true;
}

function SnackManagementPage() {
  const [semesters, setSemesters] = useState([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [activeTab, setActiveTab] = useState("MONTHLY");

  const [selectedMonth, setSelectedMonth] = useState("");

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [studentWeeklyRules, setStudentWeeklyRules] = useState([]);
  const [studentDateExceptions, setStudentDateExceptions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadSemesters();
  }, []);

  async function loadSemesters() {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("calendar_semesters")
        .select(`
          id,
          name,
          start_date,
          end_date,
          status,
          created_at
        `)
        .order("start_date", { ascending: false });

      if (error) throw error;

      const rows = data || [];
      setSemesters(rows);

      if (rows.length > 0) {
        const confirmed = rows.find(
          (item) => item.status === "CONFIRMED"
        );

        setSelectedSemesterId(
          confirmed?.id || rows[0].id
        );
      }
    } catch (error) {
      console.error("讀取點心學期失敗：", error);
      setErrorMessage(`讀取學期失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  const selectedSemester = useMemo(
    () =>
      semesters.find(
        (semester) => semester.id === selectedSemesterId
      ) || null,
    [semesters, selectedSemesterId]
  );

  useEffect(() => {
    if (!selectedSemester) {
      setSelectedMonth("");
      return;
    }

    const today = toDateString(new Date());

    if (
      today >= selectedSemester.start_date &&
      today <= selectedSemester.end_date
    ) {
      setSelectedMonth(getMonthValue(today));
      return;
    }

    setSelectedMonth(
      getMonthValue(selectedSemester.start_date)
    );
  }, [selectedSemester]);

  const monthDays = useMemo(
    () => getMonthDays(selectedMonth, selectedSemester),
    [selectedMonth, selectedSemester]
  );

  const monthStart = monthDays[0]?.dateString || "";
  const monthEnd =
    monthDays[monthDays.length - 1]?.dateString || "";

  useEffect(() => {
    if (
      activeTab !== "MONTHLY" ||
      !selectedSemesterId ||
      !monthStart ||
      !monthEnd
    ) {
      return;
    }

    loadMonthlyBaseData();
  }, [
    activeTab,
    selectedSemesterId,
    monthStart,
    monthEnd,
  ]);

  async function loadMonthlyBaseData() {
    try {
      setMonthlyLoading(true);
      setErrorMessage("");

      const {
        data: classRows,
        error: classError,
      } = await supabase
        .from("classes")
        .select(`
          id,
          class_name,
          start_date,
          end_date,
          is_active,
          course_type
        `)
        .eq("course_type", "AFTER_SCHOOL")
        .order("class_name", { ascending: true });

      if (classError) throw classError;

      const relevantClasses = (classRows || []).filter(
        (classItem) => {
          if (
            classItem.start_date &&
            classItem.start_date > monthEnd
          ) {
            return false;
          }

          if (
            classItem.end_date &&
            classItem.end_date < monthStart
          ) {
            return false;
          }

          return true;
        }
      );

      setClasses(relevantClasses);

      const classIds = relevantClasses.map(
        (classItem) => classItem.id
      );

      if (classIds.length === 0) {
        setMemberships([]);
        setCalendarEvents([]);
        setStudentWeeklyRules([]);
        setStudentDateExceptions([]);
        return;
      }

      const [
        membershipResult,
        calendarResult,
        studentWeeklyResult,
        studentExceptionsResult,
      ] = await Promise.all([
        supabase
          .from("class_students")
          .select(`
            id,
            class_id,
            student_id,
            joined_at,
            left_at,
            status
          `)
          .in("class_id", classIds)
          .lte("joined_at", monthEnd),

        supabase
          .from("calendar_school_events")
          .select("*")
          .eq("semester_id", selectedSemesterId),

        supabase
          .from("pickup_student_weekly_rules")
          .select("*")
          .eq("is_active", true),

        supabase
          .from("pickup_student_date_exceptions")
          .select("*")
          .eq("is_active", true)
          .gte("pickup_date", monthStart)
          .lte("pickup_date", monthEnd),
      ]);

      if (membershipResult.error) {
        throw membershipResult.error;
      }

      if (calendarResult.error) {
        throw calendarResult.error;
      }

      if (studentWeeklyResult.error) {
        throw studentWeeklyResult.error;
      }

      if (studentExceptionsResult.error) {
        throw studentExceptionsResult.error;
      }

      setMemberships(
        (membershipResult.data || []).filter(
          (item) =>
            !item.left_at ||
            item.left_at >= monthStart
        )
      );

      setCalendarEvents(calendarResult.data || []);

      setStudentWeeklyRules(
        studentWeeklyResult.data || []
      );

      setStudentDateExceptions(
        studentExceptionsResult.data || []
      );
    } catch (error) {
      console.error("讀取月點心表資料失敗：", error);
      setErrorMessage(
        `讀取月點心表失敗：${error.message}`
      );
      setClasses([]);
      setMemberships([]);
      setCalendarEvents([]);
      setStudentWeeklyRules([]);
      setStudentDateExceptions([]);
    } finally {
      setMonthlyLoading(false);
    }
  }

  const closedDateMap = useMemo(() => {
    const map = new Map();

    for (const event of calendarEvents) {
      const eventType =
        event.event_type ||
        event.type ||
        event.event_kind ||
        event.kind ||
        "";

      if (!CLOSED_EVENT_TYPES.has(eventType)) {
        continue;
      }

      const start =
        event.start_date ||
        event.event_date ||
        event.date;

      const end =
        event.end_date ||
        event.event_date ||
        event.date ||
        start;

      if (!start) continue;

      let cursor = parseLocalDate(start);
      const endDate = parseLocalDate(end);

      while (cursor && endDate && cursor <= endDate) {
        const dateString = toDateString(cursor);

        map.set(dateString, {
          title:
            event.title ||
            event.name ||
            eventType,
          eventType,
        });

        cursor = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 1
        );
      }
    }

    return map;
  }, [calendarEvents]);

  function getClassBaseCount(classId, dateString) {
    if (closedDateMap.has(dateString)) {
      return null;
    }

    const studentIds = new Set();

    for (const membership of memberships) {
      if (membership.class_id !== classId) {
        continue;
      }

      if (!isMembershipActiveOnDate(membership, dateString)) {
        continue;
      }

      const decision =
        getStudentPickupDecision({
          studentId: membership.student_id,
          dateKey: dateString,
          weeklyRules: studentWeeklyRules,
          dateExceptions: studentDateExceptions,
        });

      // 點心基準與班級點名表一致：
      // 只有「當天不進班 ABSENT」不計入。
      if (decision.status === "ABSENT") {
        continue;
      }

      studentIds.add(membership.student_id);
    }

    return studentIds.size;
  }

  const classRows = useMemo(
    () =>
      classes.map((classItem) => ({
        ...classItem,
        counts: monthDays.map((day) => ({
          ...day,
          count: getClassBaseCount(
            classItem.id,
            day.dateString
          ),
        })),
      })),
    [
      classes,
      memberships,
      studentWeeklyRules,
      studentDateExceptions,
      monthDays,
      closedDateMap,
    ]
  );

  const dailyTotals = useMemo(
    () =>
      monthDays.map((day) => {
        if (closedDateMap.has(day.dateString)) {
          return null;
        }

        return classRows.reduce(
          (sum, classItem) => {
            const cell = classItem.counts.find(
              (item) =>
                item.dateString === day.dateString
            );

            return sum + (cell?.count || 0);
          },
          0
        );
      }),
    [monthDays, classRows, closedDateMap]
  );

  const availableMonths = useMemo(() => {
    if (!selectedSemester) return [];

    const result = [];
    const start = parseLocalDate(
      `${selectedSemester.start_date.slice(0, 7)}-01`
    );
    const end = parseLocalDate(
      `${selectedSemester.end_date.slice(0, 7)}-01`
    );

    let cursor = start;

    while (cursor <= end) {
      const value = `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}`;

      result.push(value);

      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        1
      );
    }

    return result;
  }, [selectedSemester]);

  const activeTabItem = TABS.find(
    (tab) => tab.key === activeTab
  );

  function renderMonthlyTable() {
    return (
      <div
        style={{
          marginTop: "22px",
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong
              style={{
                display: "block",
                color: "#34423a",
              }}
            >
              {formatMonthLabel(selectedMonth)}
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "4px",
                fontSize: "12px",
                color: "#879088",
              }}
            >
              基準人數已同步班級點名邏輯：當日在班且不是
              ABSENT；老師、班外學生、當日不吃與素食會在下一層加入。
            </span>
          </div>

          <select
            value={selectedMonth}
            onChange={(event) =>
              setSelectedMonth(event.target.value)
            }
            style={{
              height: "38px",
              padding: "0 12px",
              border: "1px solid #d9ded8",
              borderRadius: "10px",
              background: "#fff",
              font: "inherit",
            }}
          >
            {availableMonths.map((monthValue) => (
              <option
                key={monthValue}
                value={monthValue}
              >
                {formatMonthLabel(monthValue)}
              </option>
            ))}
          </select>
        </div>

        {monthlyLoading ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              color: "#879088",
            }}
          >
            正在讀取班級點心基準人數…
          </div>
        ) : classRows.length === 0 ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              border: "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            這個月份沒有安親班級資料
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #e1e5df",
              borderRadius: "14px",
            }}
          >
            <table
              style={{
                width: "max-content",
                minWidth: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "13px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      minWidth: "130px",
                      padding: "12px",
                      textAlign: "left",
                      background: "#f4f6f2",
                      borderBottom:
                        "1px solid #e1e5df",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    班級
                  </th>

                  {monthDays.map((day) => {
                    const closed = closedDateMap.get(
                      day.dateString
                    );

                    return (
                      <th
                        key={day.dateString}
                        title={
                          closed?.title ||
                          day.dateString
                        }
                        style={{
                          minWidth: "52px",
                          padding: "9px 6px",
                          textAlign: "center",
                          background: closed
                            ? "#f1f1ee"
                            : "#f8f9f6",
                          color: closed
                            ? "#a0a49f"
                            : "#566159",
                          borderBottom:
                            "1px solid #e1e5df",
                          borderRight:
                            "1px solid #ecefeb",
                        }}
                      >
                        <div>{day.day}</div>
                        <div
                          style={{
                            marginTop: "2px",
                            fontSize: "10px",
                            fontWeight: 400,
                          }}
                        >
                          {
                            [
                              "日",
                              "一",
                              "二",
                              "三",
                              "四",
                              "五",
                              "六",
                            ][day.weekday]
                          }
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {classRows.map((classItem) => (
                  <tr key={classItem.id}>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        minWidth: "130px",
                        padding: "12px",
                        textAlign: "left",
                        background: "#fff",
                        color: "#34423a",
                        borderBottom:
                          "1px solid #ecefeb",
                        borderRight:
                          "1px solid #e1e5df",
                      }}
                    >
                      {classItem.class_name}
                    </th>

                    {classItem.counts.map((cell) => {
                      const closed =
                        closedDateMap.get(
                          cell.dateString
                        );

                      return (
                        <td
                          key={cell.dateString}
                          title={
                            closed
                              ? `${closed.title}｜不需點心`
                              : `${classItem.class_name}｜${cell.dateString}`
                          }
                          style={{
                            height: "46px",
                            padding: "6px",
                            textAlign: "center",
                            fontWeight: 700,
                            background: closed
                              ? "#f4f4f1"
                              : "#fff",
                            color: closed
                              ? "#a8aca7"
                              : "#37443c",
                            borderBottom:
                              "1px solid #ecefeb",
                            borderRight:
                              "1px solid #ecefeb",
                          }}
                        >
                          {closed ? "休" : cell.count}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr>
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      padding: "12px",
                      textAlign: "left",
                      background: "#f4f6f2",
                      color: "#34423a",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    當日總計
                  </th>

                  {dailyTotals.map((total, index) => (
                    <td
                      key={
                        monthDays[index]?.dateString ||
                        index
                      }
                      style={{
                        padding: "10px 6px",
                        textAlign: "center",
                        fontWeight: 800,
                        background:
                          total === null
                            ? "#f1f1ee"
                            : "#f4f6f2",
                        color:
                          total === null
                            ? "#a8aca7"
                            : "#34423a",
                        borderRight:
                          "1px solid #e1e5df",
                      }}
                    >
                      {total === null ? "—" : total}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            padding: "11px 13px",
            borderRadius: "10px",
            background: "#fff8e8",
            color: "#806b38",
            fontSize: "12px",
            lineHeight: 1.7,
          }}
        >
          這一版已把特殊接送 ABSENT 正式接入。
          「社團後進班／晚到」與「家長自行送」仍會保留在點心基準人數，
          與班級點名表邏輯一致。
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        padding: "26px",
        display: "grid",
        gap: "22px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.16em",
              color: "#8b928d",
            }}
          >
            SNACK MANAGEMENT
          </p>

          <h1
            style={{
              margin: "5px 0 0",
              fontSize: "28px",
              color: "#29332d",
            }}
          >
            點心管理
          </h1>
        </div>

        <label
          style={{
            display: "grid",
            gap: "5px",
            minWidth: "250px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "#7b857e",
            }}
          >
            學期
          </span>

          <select
            value={selectedSemesterId}
            onChange={(event) =>
              setSelectedSemesterId(
                event.target.value
              )
            }
            disabled={loading}
            style={{
              height: "40px",
              padding: "0 12px",
              border: "1px solid #d9ded8",
              borderRadius: "10px",
              background: "#fff",
              font: "inherit",
            }}
          >
            {semesters.map((semester) => (
              <option
                key={semester.id}
                value={semester.id}
              >
                {semester.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {errorMessage && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "10px",
            background: "#fff1ef",
            color: "#9b493f",
          }}
        >
          {errorMessage}
        </div>
      )}

      {selectedSemester && (
        <section
          style={{
            padding: "14px 18px",
            border: "1px solid #e0e4de",
            borderRadius: "14px",
            background: "#fafbf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <strong>{selectedSemester.name}</strong>

          <span
            style={{
              fontSize: "13px",
              color: "#778078",
            }}
          >
            {formatDate(selectedSemester.start_date)}
            {" － "}
            {formatDate(selectedSemester.end_date)}
          </span>
        </section>
      )}

      <nav
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          padding: "6px",
          borderRadius: "14px",
          background: "#eef0eb",
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: "1 1 180px",
                minHeight: "44px",
                border: "none",
                borderRadius: "10px",
                background: active
                  ? "#fff"
                  : "transparent",
                boxShadow: active
                  ? "0 2px 10px rgba(40,50,44,.08)"
                  : "none",
                cursor: "pointer",
                font: "inherit",
                fontWeight: active ? 700 : 500,
                color: active
                  ? "#34423a"
                  : "#768078",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        style={{
          minHeight: "420px",
          padding: "24px",
          border: "1px solid #e1e5df",
          borderRadius: "16px",
          background: "#fff",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            color: "#8c958f",
            letterSpacing: "0.12em",
          }}
        >
          {activeTabItem?.label}
        </p>

        <h2
          style={{
            margin: "6px 0 8px",
            fontSize: "20px",
          }}
        >
          {activeTabItem?.label}
        </h2>

        <p
          style={{
            margin: 0,
            color: "#778078",
          }}
        >
          {activeTabItem?.description}
        </p>

        {activeTab === "MONTHLY" ? (
          renderMonthlyTable()
        ) : (
          <div
            style={{
              marginTop: "40px",
              padding: "36px 20px",
              textAlign: "center",
              border: "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            這個區塊下一步開始製作
          </div>
        )}
      </section>
    </main>
  );
}

export default SnackManagementPage;