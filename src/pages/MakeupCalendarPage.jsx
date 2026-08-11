import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import MakeupDrawer from "../components/MakeupDrawer";
import MakeupDetailDrawer from "../components/MakeupDetailDrawer";
import MakeupDayDrawer from "../components/MakeupDayDrawer";
import "./MakeupCalendarPage.css";

const WEEKDAY_LABELS = [
  "日",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
];

function formatDateKey(date) {
  if (!date) return "";

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(timeString) {
  if (!timeString) return "";

  return timeString.slice(0, 5);
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "";

  const [year, month, day] =
    dateKey.split("-");

  return `${year}/${month}/${day}`;
}

function getAutoCompleteCutoffDate() {
  const cutoffDate = new Date();

  cutoffDate.setHours(
    0,
    0,
    0,
    0
  );

  cutoffDate.setDate(
    cutoffDate.getDate() - 3
  );

  return formatDateKey(
    cutoffDate
  );
}

function MakeupCalendarPage() {
  const [
    currentMonth,
    setCurrentMonth,
  ] = useState(() => {
    const today = new Date();

    return new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );
  });

  const [
    makeups,
    setMakeups,
  ] = useState([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isDrawerOpen,
    setIsDrawerOpen,
  ] = useState(false);

  const [
    selectedMakeup,
    setSelectedMakeup,
  ] = useState(null);

  const [
    selectedDay,
    setSelectedDay,
  ] = useState(null);

  useEffect(() => {
    loadMakeups();
  }, [currentMonth]);

  const calendarDays = useMemo(() => {
    const year =
      currentMonth.getFullYear();

    const month =
      currentMonth.getMonth();

    const firstDay = new Date(
      year,
      month,
      1
    );

    const lastDay = new Date(
      year,
      month + 1,
      0
    );

    const days = [];

    for (
      let index = 0;
      index < firstDay.getDay();
      index += 1
    ) {
      days.push(null);
    }

    for (
      let day = 1;
      day <= lastDay.getDate();
      day += 1
    ) {
      days.push(
        new Date(
          year,
          month,
          day
        )
      );
    }

    while (
      days.length % 7 !== 0
    ) {
      days.push(null);
    }

    return days;
  }, [currentMonth]);

  const makeupsByDate = useMemo(() => {
    const grouped = {};

    makeups.forEach((item) => {
      if (!item.makeup_date) {
        return;
      }

      if (!grouped[item.makeup_date]) {
        grouped[item.makeup_date] = [];
      }

      grouped[item.makeup_date].push(
        item
      );
    });

    Object.values(grouped).forEach(
      (items) => {
        items.sort((a, b) =>
          String(
            a.start_time || ""
          ).localeCompare(
            String(
              b.start_time || ""
            )
          )
        );
      }
    );

    return grouped;
  }, [makeups]);

  const monthLabel =
    `${currentMonth.getFullYear()} 年 ${
      currentMonth.getMonth() + 1
    } 月`;

  async function autoCompleteOldMakeups() {
    const cutoffDate =
      getAutoCompleteCutoffDate();

    const {
      error,
    } = await supabase
      .from("makeup_classes")
      .update({
        status: "COMPLETED",
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "status",
        "PENDING"
      )
      .lte(
        "makeup_date",
        cutoffDate
      );

    if (error) {
      throw error;
    }
  }

  async function loadMakeups() {
    const year =
      currentMonth.getFullYear();

    const month =
      currentMonth.getMonth();

    const monthStart =
      formatDateKey(
        new Date(
          year,
          month,
          1
        )
      );

    const monthEnd =
      formatDateKey(
        new Date(
          year,
          month + 1,
          0
        )
      );

    try {
      setIsLoading(true);

      await autoCompleteOldMakeups();

      const {
        data,
        error,
      } = await supabase
        .from("makeup_classes")
        .select(`
          id,
          student_id,
          makeup_type,
          english_class_id,
          course_class_id,
          makeup_date,
          original_makeup_date,
          start_time,
          original_start_time,
          end_time,
          notify_teacher_id,
          status,
          note,
          reschedule_count,
          last_rescheduled_at,
          created_at,
          updated_at,
          students (
            id,
            chinese_name,
            english_name,
            current_grade,
            school
          ),
          teachers (
            id,
            chinese_name,
            english_name
          ),
          english_classes (
            id,
            class_name,
            academic_year,
            term
          ),
          course_classes (
            id,
            class_name,
            course_id,
            courses (
              id,
              course_name
            )
          )
        `)
        .gte(
          "makeup_date",
          monthStart
        )
        .lte(
          "makeup_date",
          monthEnd
        )
        .order(
          "makeup_date",
          {
            ascending: true,
          }
        )
        .order(
          "start_time",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      setMakeups(
        data || []
      );
    } catch (error) {
      console.error(
        "讀取補課資料失敗：",
        error
      );

      window.alert(
        `讀取補課資料失敗：${error.message}`
      );

      setMakeups([]);
    } finally {
      setIsLoading(false);
    }
  }

  function goPreviousMonth() {
    setCurrentMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() - 1,
          1
        )
    );
  }

  function goNextMonth() {
    setCurrentMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          1
        )
    );
  }

  function goToday() {
    const today = new Date();

    setCurrentMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );
  }

  function isToday(date) {
    if (!date) {
      return false;
    }

    const today = new Date();

    return (
      date.getFullYear() ===
        today.getFullYear() &&
      date.getMonth() ===
        today.getMonth() &&
      date.getDate() ===
        today.getDate()
    );
  }

  function openDrawer() {
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function openMakeupDetail(item) {
    setSelectedDay(null);
    setSelectedMakeup(item);
  }

  function closeMakeupDetail() {
    setSelectedMakeup(null);
  }

  function openDayDrawer(
    dateKey,
    items
  ) {
    setSelectedDay({
      dateKey,
      items,
    });
  }

  function closeDayDrawer() {
    setSelectedDay(null);
  }

  async function handleSaved() {
    await loadMakeups();
  }

  async function handleChanged() {
    await loadMakeups();
  }

  return (
    <div className="makeupCalendar">
      <header className="makeupCalendar__header">
        <div>
          <p className="makeupCalendar__eyebrow">
            MAKEUP CALENDAR
          </p>

          <h1>
            補課系統
          </h1>

          <p className="makeupCalendar__summary">
            管理學生補課安排、日期時間與安親老師提醒。
          </p>
        </div>

        <button
          type="button"
          className="makeupCalendar__primaryButton"
          onClick={openDrawer}
        >
          ＋ 新增補課
        </button>
      </header>

      <section className="makeupCalendar__toolbar">
        <div className="makeupCalendar__monthControl">
          <button
            type="button"
            onClick={
              goPreviousMonth
            }
            aria-label="上一個月"
          >
            ‹
          </button>

          <h2>
            {monthLabel}
          </h2>

          <button
            type="button"
            onClick={
              goNextMonth
            }
            aria-label="下一個月"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          className="makeupCalendar__todayButton"
          onClick={goToday}
        >
          今天
        </button>
      </section>

      {isLoading && (
        <div className="makeupCalendar__loading">
          正在讀取補課資料……
        </div>
      )}

      <section className="makeupCalendar__calendar">
        <div className="makeupCalendar__weekdays">
          {WEEKDAY_LABELS.map(
            (weekday) => (
              <div
                key={weekday}
              >
                {weekday}
              </div>
            )
          )}
        </div>

        <div className="makeupCalendar__days">
          {calendarDays.map(
            (
              date,
              index
            ) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="makeupCalendar__day makeupCalendar__day--empty"
                  />
                );
              }

              const dateKey =
                formatDateKey(
                  date
                );

              const dayMakeups =
                makeupsByDate[
                  dateKey
                ] || [];

              const visibleMakeups =
                dayMakeups.slice(
                  0,
                  3
                );

              const hiddenCount =
                Math.max(
                  dayMakeups.length -
                    visibleMakeups.length,
                  0
                );

              return (
                <div
                  key={dateKey}
                  className={
                    isToday(date)
                      ? "makeupCalendar__day makeupCalendar__day--today"
                      : "makeupCalendar__day"
                  }
                >
                  <span className="makeupCalendar__date">
                    {date.getDate()}
                  </span>

                  <div className="makeupCalendar__events">
                    {visibleMakeups.map(
                      (item) => {
                        const student =
                          item.students;

                        const hasRescheduled =
                          Number(
                            item.reschedule_count ||
                              0
                          ) > 0;

                        return (
                          <button
                            key={
                              item.id
                            }
                            type="button"
                            className={`makeupCalendar__event makeupCalendar__event--${
                              item.status?.toLowerCase() ||
                              "pending"
                            }`}
                            onClick={() =>
                              openMakeupDetail(
                                item
                              )
                            }
                          >
                            <div className="makeupCalendar__eventLine">
                              <strong>
                                {hasRescheduled && (
                                  <span className="makeupCalendar__rescheduledMark">
                                    ↻
                                  </span>
                                )}

                                {formatTime(
                                  item.start_time
                                )}
                              </strong>

                              <span>
                                {student?.chinese_name ||
                                  "未命名學生"}
                              </span>
                            </div>
                          </button>
                        );
                      }
                    )}

                    {hiddenCount >
                      0 && (
                      <button
                        type="button"
                        className="makeupCalendar__more"
                        onClick={() =>
                          openDayDrawer(
                            dateKey,
                            dayMakeups
                          )
                        }
                      >
                        ＋
                        {hiddenCount}
                        {" "}
                        筆
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </section>

      {isDrawerOpen && (
        <MakeupDrawer
          onClose={
            closeDrawer
          }
          onSaved={
            handleSaved
          }
        />
      )}

      {selectedDay && (
        <MakeupDayDrawer
          dateLabel={
            formatDateLabel(
              selectedDay.dateKey
            )
          }
          items={
            selectedDay.items
          }
          onClose={
            closeDayDrawer
          }
          onOpenMakeup={
            openMakeupDetail
          }
        />
      )}

      {selectedMakeup && (
        <MakeupDetailDrawer
          makeupItem={
            selectedMakeup
          }
          onClose={
            closeMakeupDetail
          }
          onChanged={
            handleChanged
          }
        />
      )}
    </div>
  );
}

export default MakeupCalendarPage;