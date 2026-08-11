import { useMemo, useState } from "react";
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

function MakeupCalendarPage() {
  const [currentMonth, setCurrentMonth] =
    useState(() => {
      const today = new Date();

      return new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      );
    });

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
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
        new Date(year, month, day)
      );
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [currentMonth]);

  const monthLabel = `${currentMonth.getFullYear()} 年 ${
    currentMonth.getMonth() + 1
  } 月`;

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
    if (!date) return false;

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

  return (
    <div className="makeupCalendar">
      <header className="makeupCalendar__header">
        <div>
          <p className="makeupCalendar__eyebrow">
            MAKEUP CALENDAR
          </p>

          <h1>補課系統</h1>

          <p className="makeupCalendar__summary">
            管理學生補課安排、日期時間與安親老師提醒。
          </p>
        </div>

        <button
          type="button"
          className="makeupCalendar__primaryButton"
        >
          ＋ 新增補課
        </button>
      </header>

      <section className="makeupCalendar__toolbar">
        <div className="makeupCalendar__monthControl">
          <button
            type="button"
            onClick={goPreviousMonth}
            aria-label="上一個月"
          >
            ‹
          </button>

          <h2>{monthLabel}</h2>

          <button
            type="button"
            onClick={goNextMonth}
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

      <section className="makeupCalendar__calendar">
        <div className="makeupCalendar__weekdays">
          {WEEKDAY_LABELS.map(
            (weekday) => (
              <div key={weekday}>
                {weekday}
              </div>
            )
          )}
        </div>

        <div className="makeupCalendar__days">
          {calendarDays.map(
            (date, index) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="makeupCalendar__day makeupCalendar__day--empty"
                  />
                );
              }

              return (
                <button
                  key={date.toISOString()}
                  type="button"
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
                    {/* 下一步放補課資料 */}
                  </div>
                </button>
              );
            }
          )}
        </div>
      </section>
    </div>
  );
}

export default MakeupCalendarPage;