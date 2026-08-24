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

  const [classSnackSettings, setClassSnackSettings] = useState([]);
  const [dailySnackExceptions, setDailySnackExceptions] = useState([]);
  const [dailyAdjustments, setDailyAdjustments] = useState([]);

  const [selectedCell, setSelectedCell] = useState(null);
  const [savingCell, setSavingCell] = useState(false);

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
        classSnackSettingsResult,
        dailySnackExceptionsResult,
        dailyAdjustmentsResult,
      ] = await Promise.all([
        supabase
          .from("class_students")
          .select(`
            id,
            class_id,
            student_id,
            joined_at,
            left_at,
            status,
            students (
              id,
              chinese_name,
              english_name
            )
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

        supabase
          .from("snack_class_settings")
          .select("*")
          .eq("semester_id", selectedSemesterId),

        supabase
          .from("snack_daily_exceptions")
          .select("*")
          .eq("semester_id", selectedSemesterId)
          .eq("subject_type", "STUDENT")
          .gte("service_date", monthStart)
          .lte("service_date", monthEnd),

        supabase
          .from("snack_daily_adjustments")
          .select("*")
          .eq("semester_id", selectedSemesterId)
          .gte("service_date", monthStart)
          .lte("service_date", monthEnd),
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

      if (classSnackSettingsResult.error) {
        throw classSnackSettingsResult.error;
      }

      if (dailySnackExceptionsResult.error) {
        throw dailySnackExceptionsResult.error;
      }

      if (dailyAdjustmentsResult.error) {
        throw dailyAdjustmentsResult.error;
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

      setClassSnackSettings(
        classSnackSettingsResult.data || []
      );

      setDailySnackExceptions(
        dailySnackExceptionsResult.data || []
      );

      setDailyAdjustments(
        dailyAdjustmentsResult.data || []
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
      setClassSnackSettings([]);
      setDailySnackExceptions([]);
      setDailyAdjustments([]);
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


  function getClassTeacherEatsSnack(classId) {
    const row = classSnackSettings.find(
      (item) => item.class_id === classId
    );

    // 尚未設定時預設老師不計入，避免無意間多訂。
    return Boolean(row?.teacher_eats_snack);
  }

  function getDailyStudentExceptionIds(classId, dateString) {
    const validStudentIds = new Set(
      memberships
        .filter(
          (membership) =>
            membership.class_id === classId &&
            isMembershipActiveOnDate(
              membership,
              dateString
            )
        )
        .map((membership) => membership.student_id)
    );

    return new Set(
      dailySnackExceptions
        .filter(
          (item) =>
            item.service_date === dateString &&
            item.subject_type === "STUDENT" &&
            item.exclude_from_snack === true &&
            validStudentIds.has(item.subject_id)
        )
        .map((item) => item.subject_id)
    );
  }

  function getDailyAdjustment(classId, dateString) {
    return (
      dailyAdjustments.find(
        (item) =>
          item.class_id === classId &&
          item.service_date === dateString
      ) || null
    );
  }

  function getClassStudentsForDate(classId, dateString) {
    const map = new Map();

    memberships.forEach((membership) => {
      if (membership.class_id !== classId) return;
      if (!isMembershipActiveOnDate(membership, dateString)) return;

      const decision = getStudentPickupDecision({
        studentId: membership.student_id,
        dateKey: dateString,
        weeklyRules: studentWeeklyRules,
        dateExceptions: studentDateExceptions,
      });

      if (decision.status === "ABSENT") return;

      if (!map.has(membership.student_id)) {
        map.set(membership.student_id, {
          student_id: membership.student_id,
          name:
            membership.students?.chinese_name ||
            membership.students?.english_name ||
            "未命名學生",
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "zh-Hant")
    );
  }

  function getCellBreakdown(classId, dateString) {
    if (closedDateMap.has(dateString)) {
      return {
        isClosed: true,
        baseCount: 0,
        teacherCount: 0,
        excludedCount: 0,
        adjustment: 0,
        finalCount: 0,
      };
    }

    const baseCount = getClassBaseCount(
      classId,
      dateString
    );

    const teacherCount =
      getClassTeacherEatsSnack(classId)
        ? 1
        : 0;

    const excludedCount =
      getDailyStudentExceptionIds(
        classId,
        dateString
      ).size;

    const adjustmentRow =
      getDailyAdjustment(
        classId,
        dateString
      );

    const adjustment =
      Number(
        adjustmentRow?.quantity_delta ||
        0
      );

    return {
      isClosed: false,
      baseCount,
      teacherCount,
      excludedCount,
      adjustment,
      adjustmentNote:
        adjustmentRow?.reason || "",
      finalCount:
        baseCount +
        teacherCount -
        excludedCount +
        adjustment,
    };
  }

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
        counts: monthDays.map((day) => {
          const breakdown =
            getCellBreakdown(
              classItem.id,
              day.dateString
            );

          return {
            ...day,
            count:
              breakdown.isClosed
                ? null
                : breakdown.finalCount,
            breakdown,
          };
        }),
      })),
    [
      classes,
      memberships,
      studentWeeklyRules,
      studentDateExceptions,
      classSnackSettings,
      dailySnackExceptions,
      dailyAdjustments,
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


  async function saveTeacherSetting(
    classId,
    teacherEatsSnack
  ) {
    if (!selectedSemesterId) return;

    try {
      setSavingCell(true);
      setErrorMessage("");

      const { error } = await supabase
        .from("snack_class_settings")
        .upsert(
          {
            semester_id:
              selectedSemesterId,
            class_id: classId,
            teacher_eats_snack:
              teacherEatsSnack,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "semester_id,class_id",
          }
        );

      if (error) throw error;

      setClassSnackSettings(
        (current) => {
          const exists =
            current.some(
              (item) =>
                item.class_id ===
                classId
            );

          if (exists) {
            return current.map(
              (item) =>
                item.class_id ===
                classId
                  ? {
                      ...item,
                      teacher_eats_snack:
                        teacherEatsSnack,
                    }
                  : item
            );
          }

          return [
            ...current,
            {
              semester_id:
                selectedSemesterId,
              class_id:
                classId,
              teacher_eats_snack:
                teacherEatsSnack,
            },
          ];
        }
      );
    } catch (error) {
      console.error(
        "儲存老師點心設定失敗：",
        error
      );

      setErrorMessage(
        `儲存老師點心設定失敗：${error.message}`
      );
    } finally {
      setSavingCell(false);
    }
  }

  async function saveDailyCell() {
    if (!selectedCell) return;

    const {
      classItem,
      dateString,
      excludedStudentIds,
      adjustment,
      adjustmentNote,
      studentReasons,
    } = selectedCell;

    try {
      setSavingCell(true);
      setErrorMessage("");

      const studentsForDay =
        getClassStudentsForDate(
          classItem.id,
          dateString
        );

      const existingForDay =
        dailySnackExceptions.filter(
          (item) =>
            item.service_date ===
              dateString &&
            item.subject_type ===
              "STUDENT" &&
            studentsForDay.some(
              (student) =>
                student.student_id ===
                item.subject_id
            )
        );

      const desiredIds =
        new Set(
          excludedStudentIds
        );

      const rowsToUpsert =
        studentsForDay
          .filter((student) =>
            desiredIds.has(
              student.student_id
            )
          )
          .map((student) => ({
            semester_id:
              selectedSemesterId,
            service_date:
              dateString,
            subject_type:
              "STUDENT",
            subject_id:
              student.student_id,
            exclude_from_snack:
              true,
            reason:
              studentReasons[
                student.student_id
              ]?.trim() ||
              null,
            updated_at:
              new Date().toISOString(),
          }));

      if (rowsToUpsert.length > 0) {
        const { error } =
          await supabase
            .from(
              "snack_daily_exceptions"
            )
            .upsert(
              rowsToUpsert,
              {
                onConflict:
                  "semester_id,service_date,subject_type,subject_id",
              }
            );

        if (error) throw error;
      }

      const idsToDelete =
        existingForDay
          .filter(
            (item) =>
              !desiredIds.has(
                item.subject_id
              )
          )
          .map((item) => item.id)
          .filter(Boolean);

      if (idsToDelete.length > 0) {
        const { error } =
          await supabase
            .from(
              "snack_daily_exceptions"
            )
            .delete()
            .in(
              "id",
              idsToDelete
            );

        if (error) throw error;
      }

      const adjustmentNumber =
        Number(adjustment || 0);

      const hasAdjustment =
        adjustmentNumber !== 0 ||
        adjustmentNote.trim();

      if (hasAdjustment) {
        const { error } =
          await supabase
            .from(
              "snack_daily_adjustments"
            )
            .upsert(
              {
                semester_id:
                  selectedSemesterId,
                class_id:
                  classItem.id,
                service_date:
                  dateString,
                quantity_delta:
                  adjustmentNumber,
                reason:
                  adjustmentNote.trim() ||
                  null,
                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "semester_id,class_id,service_date",
              }
            );

        if (error) throw error;
      } else {
        const { error } =
          await supabase
            .from(
              "snack_daily_adjustments"
            )
            .delete()
            .eq(
              "semester_id",
              selectedSemesterId
            )
            .eq(
              "class_id",
              classItem.id
            )
            .eq(
              "service_date",
              dateString
            );

        if (error) throw error;
      }

      await loadMonthlyBaseData();
      setSelectedCell(null);
    } catch (error) {
      console.error(
        "儲存單日點心調整失敗：",
        error
      );

      setErrorMessage(
        `儲存單日點心調整失敗：${error.message}`
      );
    } finally {
      setSavingCell(false);
    }
  }

  function openDailyCell(
    classItem,
    dateString
  ) {
    const studentsForDay =
      getClassStudentsForDate(
        classItem.id,
        dateString
      );

    const excludedIds =
      getDailyStudentExceptionIds(
        classItem.id,
        dateString
      );

    const studentReasons = {};

    dailySnackExceptions
      .filter(
        (item) =>
          item.service_date ===
            dateString &&
          item.subject_type ===
            "STUDENT"
      )
      .forEach((item) => {
        studentReasons[
          item.subject_id
        ] = item.reason || "";
      });

    const adjustmentRow =
      getDailyAdjustment(
        classItem.id,
        dateString
      );

    setSelectedCell({
      classItem,
      dateString,
      studentsForDay,
      excludedStudentIds:
        Array.from(excludedIds),
      studentReasons,
      adjustment:
        Number(
          adjustmentRow?.quantity_delta ||
          0
        ),
      adjustmentNote:
        adjustmentRow?.reason ||
        "",
    });
  }

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
              基準人數已同步班級點名邏輯；老師可在左側設定整學期
              「要／不要」。點擊任一日期數字，可處理臨時不吃、原因與數量調整。
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
              overflowX: "hidden",
              width: "100%",
              border: "1px solid #e1e5df",
              borderRadius: "14px",
            }}
          >
            <table
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      width: "58px",
                      padding: "10px 4px",
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

                  <th
                    style={{
                      width: "70px",
                      padding: "8px 3px",
                      textAlign: "center",
                      background: "#f4f6f2",
                      borderBottom:
                        "1px solid #e1e5df",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    老師點心
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
                          width: "auto",
                          padding: "7px 1px",
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
                        width: "58px",
                        padding: "10px 4px",
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

                    <td
                      style={{
                        padding: "6px",
                        textAlign: "center",
                        background: "#fffdf9",
                        borderBottom:
                          "1px solid #ecefeb",
                        borderRight:
                          "1px solid #e1e5df",
                      }}
                    >
                      <select
                        value={
                          getClassTeacherEatsSnack(
                            classItem.id
                          )
                            ? "YES"
                            : "NO"
                        }
                        onChange={(event) =>
                          saveTeacherSetting(
                            classItem.id,
                            event.target.value ===
                              "YES"
                          )
                        }
                        disabled={savingCell}
                        style={{
                          width: "60px",
                          height: "30px",
                          border:
                            "1px solid #d9ded8",
                          borderRadius:
                            "8px",
                          background: "#fff",
                          font: "inherit",
                        }}
                      >
                        <option value="YES">
                          要
                        </option>
                        <option value="NO">
                          不要
                        </option>
                      </select>
                    </td>

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
                              : `${classItem.class_name}｜${cell.dateString}｜點擊調整`
                          }
                          onClick={() => {
                            if (!closed) {
                              openDailyCell(
                                classItem,
                                cell.dateString
                              );
                            }
                          }}
                          style={{
                            height: "44px",
                            padding: "4px 1px",
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
                            cursor: closed
                              ? "default"
                              : "pointer",
                            position: "relative",
                          }}
                        >
                          {closed ? (
                            "休"
                          ) : (
                            <>
                              <div>
                                {cell.count}
                              </div>
                              {(
                                cell.breakdown
                                  ?.excludedCount >
                                  0 ||
                                cell.breakdown
                                  ?.adjustment !==
                                  0
                              ) && (
                                <small
                                  style={{
                                    display:
                                      "block",
                                    marginTop:
                                      "2px",
                                    fontSize:
                                      "9px",
                                    fontWeight:
                                      500,
                                    color:
                                      "#9a765e",
                                  }}
                                >
                                  已調整
                                </small>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr>
                  <th
                    style={{
                      width: "58px",
                      padding: "10px 4px",
                      textAlign: "left",
                      background: "#f4f6f2",
                      color: "#34423a",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    當日總計
                  </th>

                  <td
                    style={{
                      padding: "8px 2px",
                      textAlign: "center",
                      fontWeight: 700,
                      background: "#f4f6f2",
                      color: "#6f786f",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    —
                  </td>

                  {dailyTotals.map((total, index) => (
                    <td
                      key={
                        monthDays[index]?.dateString ||
                        index
                      }
                      style={{
                        padding: "8px 2px",
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

      {selectedCell && (
        <div
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget &&
              !savingCell
            ) {
              setSelectedCell(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background:
              "rgba(30,35,32,.28)",
            display: "flex",
            justifyContent:
              "flex-end",
          }}
        >
          <aside
            style={{
              width: "min(520px, 92vw)",
              height: "100%",
              background: "#fffdf9",
              boxShadow:
                "-12px 0 32px rgba(30,35,32,.12)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              style={{
                padding: "22px 24px",
                borderBottom:
                  "1px solid #e7e2d9",
                display: "flex",
                justifyContent:
                  "space-between",
                gap: "16px",
                alignItems: "flex-start",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "11px",
                    letterSpacing:
                      ".14em",
                    color: "#9a9388",
                  }}
                >
                  DAILY SNACK
                </p>

                <h2
                  style={{
                    margin: "6px 0 2px",
                    fontSize: "22px",
                  }}
                >
                  {
                    selectedCell
                      .classItem
                      .class_name
                  }
                  {"｜"}
                  {
                    selectedCell
                      .dateString
                  }
                </h2>

                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    fontSize: "12px",
                    color: "#777168",
                  }}
                >
                  <span>
                    班級基準：
                    {
                      getClassBaseCount(
                        selectedCell
                          .classItem.id,
                        selectedCell
                          .dateString
                      )
                    }
                  </span>

                  <span>
                    老師：
                    {
                      getClassTeacherEatsSnack(
                        selectedCell
                          .classItem.id
                      )
                        ? "+1"
                        : "+0"
                    }
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedCell(null)
                }
                disabled={savingCell}
                style={{
                  border: "none",
                  background: "#f1eee8",
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "22px",
                }}
              >
                ×
              </button>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px",
                display: "grid",
                gap: "22px",
              }}
            >
              <section>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: "16px",
                  }}
                >
                  臨時不吃／請假
                </h3>

                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: "12px",
                    color: "#817b72",
                  }}
                >
                  ABSENT 已由班級點名基準排除，這裡只處理另外的臨時狀況。
                </p>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {selectedCell.studentsForDay.map(
                    (student) => {
                      const checked =
                        selectedCell
                          .excludedStudentIds
                          .includes(
                            student.student_id
                          );

                      return (
                        <div
                          key={
                            student.student_id
                          }
                          style={{
                            padding:
                              "10px 12px",
                            border:
                              "1px solid #e4dfd6",
                            borderRadius:
                              "10px",
                            background:
                              checked
                                ? "#fbf2ec"
                                : "#fff",
                            display: "grid",
                            gap: "8px",
                          }}
                        >
                          <label
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: "8px",
                              cursor:
                                "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                checked
                              }
                              onChange={(
                                event
                              ) => {
                                const nextChecked =
                                  event
                                    .target
                                    .checked;

                                setSelectedCell(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    excludedStudentIds:
                                      nextChecked
                                        ? [
                                            ...current
                                              .excludedStudentIds,
                                            student
                                              .student_id,
                                          ]
                                        : current
                                            .excludedStudentIds
                                            .filter(
                                              (
                                                id
                                              ) =>
                                                id !==
                                                student
                                                  .student_id
                                            ),
                                  })
                                );
                              }}
                            />

                            <strong>
                              {
                                student.name
                              }
                            </strong>

                            {checked && (
                              <span
                                style={{
                                  marginLeft:
                                    "auto",
                                  fontSize:
                                    "11px",
                                  color:
                                    "#9a6658",
                                }}
                              >
                                不計點心
                              </span>
                            )}
                          </label>

                          {checked && (
                            <input
                              type="text"
                              value={
                                selectedCell
                                  .studentReasons[
                                  student
                                    .student_id
                                ] || ""
                              }
                              onChange={(
                                event
                              ) =>
                                setSelectedCell(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    studentReasons:
                                      {
                                        ...current.studentReasons,
                                        [student.student_id]:
                                          event
                                            .target
                                            .value,
                                      },
                                  })
                                )
                              }
                              placeholder="原因，例如：臨時請假、家長交代不吃"
                              style={{
                                height:
                                  "36px",
                                padding:
                                  "0 10px",
                                border:
                                  "1px solid #ddd8cf",
                                borderRadius:
                                  "8px",
                                font:
                                  "inherit",
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </section>

              <section>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: "16px",
                  }}
                >
                  手動數量調整
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "120px 1fr",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <label>
                    增減數量
                  </label>

                  <input
                    type="number"
                    value={
                      selectedCell
                        .adjustment
                    }
                    onChange={(event) =>
                      setSelectedCell(
                        (current) => ({
                          ...current,
                          adjustment:
                            Number(
                              event
                                .target
                                .value
                            ),
                        })
                      )
                    }
                    style={{
                      height: "38px",
                      padding: "0 10px",
                      border:
                        "1px solid #ddd8cf",
                      borderRadius:
                        "8px",
                      font: "inherit",
                    }}
                  />

                  <label>
                    備註
                  </label>

                  <input
                    type="text"
                    value={
                      selectedCell
                        .adjustmentNote
                    }
                    onChange={(event) =>
                      setSelectedCell(
                        (current) => ({
                          ...current,
                          adjustmentNote:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="例如：臨時多一位、老師外出"
                    style={{
                      height: "38px",
                      padding: "0 10px",
                      border:
                        "1px solid #ddd8cf",
                      borderRadius:
                        "8px",
                      font: "inherit",
                    }}
                  />
                </div>
              </section>

              <section
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "#f4f6f2",
                  display: "grid",
                  gap: "6px",
                  fontSize: "13px",
                }}
              >
                <div>
                  預估實際份數：
                  <strong
                    style={{
                      marginLeft: "6px",
                      fontSize: "18px",
                    }}
                  >
                    {
                      getClassBaseCount(
                        selectedCell
                          .classItem.id,
                        selectedCell
                          .dateString
                      ) +
                      (
                        getClassTeacherEatsSnack(
                          selectedCell
                            .classItem.id
                        )
                          ? 1
                          : 0
                      ) -
                      selectedCell
                        .excludedStudentIds
                        .length +
                      Number(
                        selectedCell
                          .adjustment ||
                          0
                      )
                    }
                  </strong>
                </div>
              </section>
            </div>

            <footer
              style={{
                padding: "16px 24px",
                borderTop:
                  "1px solid #e7e2d9",
                display: "flex",
                justifyContent:
                  "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setSelectedCell(null)
                }
                disabled={savingCell}
                style={{
                  minWidth: "88px",
                  height: "40px",
                  border:
                    "1px solid #d9d4cb",
                  borderRadius:
                    "10px",
                  background: "#fff",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                取消
              </button>

              <button
                type="button"
                onClick={
                  saveDailyCell
                }
                disabled={savingCell}
                style={{
                  minWidth: "110px",
                  height: "40px",
                  border: "none",
                  borderRadius:
                    "10px",
                  background: "#88a993",
                  color: "#fff",
                  font: "inherit",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {savingCell
                  ? "儲存中…"
                  : "儲存調整"}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}

export default SnackManagementPage;