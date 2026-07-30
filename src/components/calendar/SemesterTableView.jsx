import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const WORK_COLUMNS = [
  {
    key: "SCHOOL",
    label: "學校重要事務",
  },
  {
    key: "ADMIN",
    label: "行政表單與固定事務",
  },
  {
    key: "ACADEMIC",
    label: "學科事務安排",
  },
  {
    key: "CLASSROOM",
    label: "教室活動安排",
  },
  {
    key: "SOCIAL",
    label: "臉書發文排程",
  },
];

const EVENT_TYPE_LABELS = {
  OPENING_DAY: "開學日",
  EXAM: "考試",
  SPORTS_DAY: "運動會",
  SCHOOL_ANNIVERSARY: "校慶",
  PARENT_MEETING: "親師活動",
  GRADUATION: "畢業活動",
  OTHER: "其他",
};

function parseLocalDate(dateString) {
  if (!dateString) return null;

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function getMonday(date) {
  const result = new Date(date);
  const weekday = result.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;

  result.setDate(result.getDate() - daysFromMonday);
  return result;
}

function getSunday(date) {
  return addDays(getMonday(date), 6);
}

function formatMonth(date) {
  return `${date.getMonth() + 1}月`;
}

function formatDay(date) {
  return date.getDate();
}

function formatShortDate(dateString) {
  const date = parseLocalDate(dateString);

  if (!date) return "—";

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDate(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function buildSemesterWeeks(startDateString, endDateString) {
  const semesterStart = parseLocalDate(startDateString);
  const semesterEnd = parseLocalDate(endDateString);

  if (!semesterStart || !semesterEnd || semesterStart > semesterEnd) {
    return [];
  }

  const tableStart = getMonday(semesterStart);
  const tableEnd = getSunday(semesterEnd);

  const weeks = [];
  let currentMonday = new Date(tableStart);
  let weekNumber = 1;
  let previousMonthKey = null;

  while (currentMonday <= tableEnd) {
    const days = Array.from({ length: 7 }, (_, index) =>
      addDays(currentMonday, index)
    );

    const firstSemesterDay =
      days.find(
        (date) => date >= semesterStart && date <= semesterEnd
      ) ?? days[0];

    const monthKey = `${firstSemesterDay.getFullYear()}-${
      firstSemesterDay.getMonth() + 1
    }`;

    weeks.push({
      weekNumber,
      monthLabel:
        monthKey !== previousMonthKey
          ? formatMonth(firstSemesterDay)
          : "",
      days,
      startDate: formatDateKey(days[0]),
      endDate: formatDateKey(days[6]),
    });

    previousMonthKey = monthKey;
    currentMonday = addDays(currentMonday, 7);
    weekNumber += 1;
  }

  return weeks;
}

function getEventTitle(eventItem) {
  if (eventItem.event_type === "OTHER") {
    return eventItem.title || "其他行事";
  }

  return (
    EVENT_TYPE_LABELS[eventItem.event_type] ||
    eventItem.title ||
    "行事項目"
  );
}

function eventOverlapsWeek(eventItem, week) {
  const eventStart = eventItem.start_date;
  const eventEnd = eventItem.end_date || eventItem.start_date;

  return eventStart <= week.endDate && eventEnd >= week.startDate;
}

function SemesterTableView({
  semesterId,
  semesterName,
  startDate,
  endDate,
}) {
  const [events, setEvents] = useState([]);
  const [schoolNames, setSchoolNames] = useState({});
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventError, setEventError] = useState("");

  const semesterStart = parseLocalDate(startDate);
  const semesterEnd = parseLocalDate(endDate);

  const weeks = useMemo(
    () => buildSemesterWeeks(startDate, endDate),
    [startDate, endDate]
  );

  useEffect(() => {
    if (!semesterId) {
      setEvents([]);
      setSchoolNames({});
      return;
    }

    loadSemesterEvents();
  }, [semesterId]);

  async function loadSemesterEvents() {
    try {
      setLoadingEvents(true);
      setEventError("");

      const [eventResult, schoolResult] = await Promise.all([
        supabase
          .from("calendar_school_events")
          .select(
            `
              id,
              semester_id,
              school_id,
              applies_to_all_schools,
              start_date,
              end_date,
              title,
              event_type,
              category,
              display_order,
              notes,
              affects_pickup
            `
          )
          .eq("semester_id", semesterId)
          .order("start_date", { ascending: true })
          .order("display_order", { ascending: true }),

        supabase
          .from("calendar_semester_schools")
          .select(
            `
              school_id,
              calendar_schools (
                id,
                name
              )
            `
          )
          .eq("semester_id", semesterId),
      ]);

      if (eventResult.error) {
        throw eventResult.error;
      }

      if (schoolResult.error) {
        throw schoolResult.error;
      }

      const nextSchoolNames = Object.fromEntries(
        (schoolResult.data || [])
          .map((item) => item.calendar_schools)
          .filter(Boolean)
          .map((school) => [school.id, school.name])
      );

      setEvents(eventResult.data || []);
      setSchoolNames(nextSchoolNames);
    } catch (error) {
      console.error("讀取學期行事失敗：", error);

      setEventError(
        error?.message
          ? `讀取學期行事失敗：${error.message}`
          : "讀取學期行事失敗，請稍後再試。"
      );
    } finally {
      setLoadingEvents(false);
    }
  }

  function getWeekEvents(week, category) {
    return events.filter((eventItem) => {
      const eventCategory = eventItem.category || "SCHOOL";

      return (
        eventCategory === category &&
        eventOverlapsWeek(eventItem, week)
      );
    });
  }

  if (!semesterStart || !semesterEnd || weeks.length === 0) {
    return (
      <section className="semester-table-empty">
        <h2>尚未建立學期總表</h2>
        <p>請先到「管理」建立有效的學期起訖日期。</p>
      </section>
    );
  }

  return (
    <section className="semester-table-view">
      <header className="semester-table-view__header">
        <div>
          <p className="semester-table-view__eyebrow">
            SEMESTER OVERVIEW
          </p>

          <h2>{semesterName}</h2>

          <span>
            {formatShortDate(startDate)}－
            {formatShortDate(endDate)}
          </span>
        </div>

        <div className="semester-table-view__summary">
          共 {weeks.length} 週
        </div>
      </header>

      {loadingEvents && (
        <div className="calendar-message">
          正在讀取學期行事……
        </div>
      )}

      {eventError && (
        <div className="calendar-message calendar-message--error">
          {eventError}
        </div>
      )}

      <div className="semester-table-scroll">
        <table className="semester-table">
          <thead>
            <tr>
              <th
                className="semester-table__month-column"
                rowSpan="2"
              >
                月份
              </th>

              <th
                className="semester-table__week-column"
                rowSpan="2"
              >
                週次
              </th>

              <th colSpan="7">日期</th>

              {WORK_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className="semester-table__work-heading"
                  rowSpan="2"
                >
                  {column.label}
                </th>
              ))}
            </tr>

            <tr>
              {WEEKDAY_LABELS.map((weekday) => (
                <th
                  key={weekday}
                  className="semester-table__day-heading"
                >
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekNumber}>
                <td className="semester-table__month">
                  {week.monthLabel}
                </td>

                <td className="semester-table__week">
                  {week.weekNumber}
                </td>

                {week.days.map((date) => {
                  const outsideSemester =
                    date < semesterStart || date > semesterEnd;

                  const isSemesterStart = isSameDate(
                    date,
                    semesterStart
                  );

                  const isSemesterEnd = isSameDate(
                    date,
                    semesterEnd
                  );

                  return (
                    <td
                      key={date.toISOString()}
                      className={[
                        "semester-table__date",
                        outsideSemester
                          ? "semester-table__date--outside"
                          : "",
                        isSemesterStart
                          ? "semester-table__date--start"
                          : "",
                        isSemesterEnd
                          ? "semester-table__date--end"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span>{formatDay(date)}</span>

                      {isSemesterStart && <small>開始</small>}
                      {isSemesterEnd && <small>結束</small>}
                    </td>
                  );
                })}

                {WORK_COLUMNS.map((column) => {
                  const weekEvents = getWeekEvents(
                    week,
                    column.key
                  );

                  return (
                    <td
                      key={`${week.weekNumber}-${column.key}`}
                      className="semester-table__work-cell"
                    >
                      {weekEvents.map((eventItem) => {
                        const schoolLabel =
                          eventItem.applies_to_all_schools
                            ? "全部學校"
                            : schoolNames[eventItem.school_id] ||
                              "";

                        return (
                          <div
                            key={eventItem.id}
                            className="semester-table-event"
                          >
                            <strong>
                              {getEventTitle(eventItem)}
                            </strong>

                            {schoolLabel && (
                              <span>{schoolLabel}</span>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default SemesterTableView;