import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";


const WEEKDAYS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "日",
];


const CATEGORY_OPTIONS = [
  {
    value: "SCHOOL",
    label: "學校重要事務",
  },
  {
    value: "ADMIN",
    label: "行政表單與固定事務",
  },
  {
    value: "ACADEMIC",
    label: "學科事務安排",
  },
  {
    value: "CLASSROOM",
    label: "教室活動安排",
  },
  {
    value: "SOCIAL",
    label: "臉書發文排程",
  },
];


function parseLocalDate(dateString) {
  if (!dateString) {
    return null;
  }

  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}


function formatDateKey(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getMondayIndex(date) {
  const weekday =
    date.getDay();

  return weekday === 0
    ? 6
    : weekday - 1;
}


function addDays(date, amount) {
  const next =
    new Date(date);

  next.setDate(
    next.getDate() + amount
  );

  return next;
}


function clampDateToWeek(
  date,
  weekStart,
  weekEnd
) {
  if (date < weekStart) {
    return new Date(weekStart);
  }

  if (date > weekEnd) {
    return new Date(weekEnd);
  }

  return new Date(date);
}

function buildWeekEventSegments(
  weekDays,
  events
) {
  if (!weekDays?.length) {
    return [];
  }

  const weekStart =
    new Date(weekDays[0]);

  const weekEnd =
    new Date(
      weekDays[
        weekDays.length - 1
      ]
    );

  const segments = events
    .map((eventItem) => {
      const eventStart =
        parseLocalDate(
          eventItem.start_date
        );

      const eventEnd =
        parseLocalDate(
          eventItem.end_date ||
            eventItem.start_date
        );

      if (
        !eventStart ||
        !eventEnd ||
        eventEnd < weekStart ||
        eventStart > weekEnd
      ) {
        return null;
      }

      const visibleStart =
        clampDateToWeek(
          eventStart,
          weekStart,
          weekEnd
        );

      const visibleEnd =
        clampDateToWeek(
          eventEnd,
          weekStart,
          weekEnd
        );

      const startColumn =
        getMondayIndex(
          visibleStart
        ) + 1;

      const endColumn =
        getMondayIndex(
          visibleEnd
        ) + 1;

      const isSingleDay =
        formatDateKey(
          eventStart
        ) ===
        formatDateKey(
          eventEnd
        );

      return {
        eventItem,
        startColumn,
        endColumn,
        span:
          endColumn -
          startColumn +
          1,
        isSingleDay,
        segmentStartsHere:
          formatDateKey(
            visibleStart
          ) ===
          formatDateKey(
            eventStart
          ),
        segmentEndsHere:
          formatDateKey(
            visibleEnd
          ) ===
          formatDateKey(
            eventEnd
          ),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (
        a.startColumn !==
        b.startColumn
      ) {
        return (
          a.startColumn -
          b.startColumn
        );
      }

      return (
        b.span -
        a.span
      );
    });

  const laneEnds = [];

  return segments.map(
    (segment) => {
      let laneIndex =
        laneEnds.findIndex(
          (endColumn) =>
            endColumn <
            segment.startColumn
        );

      if (laneIndex === -1) {
        laneIndex =
          laneEnds.length;

        laneEnds.push(
          segment.endColumn
        );
      } else {
        laneEnds[
          laneIndex
        ] = segment.endColumn;
      }

      return {
        ...segment,
        laneIndex,
      };
    }
  );
}


function MonthCalendarView({
  semesterId,
  semesterStartDate,
  semesterEndDate,
  canEdit = false,
}) {
  const semesterStart =
    parseLocalDate(
      semesterStartDate
    );

  const semesterEnd =
    parseLocalDate(
      semesterEndDate
    );


  const [
    currentMonth,
    setCurrentMonth,
  ] = useState(() => {
    if (semesterStart) {
      return new Date(
        semesterStart.getFullYear(),
        semesterStart.getMonth(),
        1,
        12
      );
    }

    const now =
      new Date();

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      12
    );
  });


  const [events, setEvents] =
    useState([]);

  const [
    schoolNames,
    setSchoolNames,
  ] = useState({});

  const [
    semesterSchools,
    setSemesterSchools,
  ] = useState([]);

  const [loading, setLoading] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    expandedDates,
    setExpandedDates,
  ] = useState({});

  const [
    editingEvent,
    setEditingEvent,
  ] = useState(null);

  const [
    form,
    setForm,
  ] = useState(null);

  const [
    saving,
    setSaving,
  ] = useState(false);


  useEffect(() => {
    if (!semesterId) {
      setEvents([]);
      setSchoolNames({});
      setSemesterSchools([]);
      return;
    }

    loadEvents();
  }, [semesterId]);


  async function loadEvents() {
    try {
      setLoading(true);
      setErrorMessage("");


      const [
        eventResult,
        schoolResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "calendar_school_events"
            )
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
              notes,
              affects_pickup
              `
            )
            .eq(
              "semester_id",
              semesterId
            )
            .order(
              "start_date",
              {
                ascending: true,
              }
            ),

          supabase
            .from(
              "calendar_semester_schools"
            )
            .select(
              `
              school_id,
              calendar_schools (
                id,
                name
              )
              `
            )
            .eq(
              "semester_id",
              semesterId
            ),
        ]);


      if (eventResult.error) {
        throw eventResult.error;
      }


      if (schoolResult.error) {
        throw schoolResult.error;
      }


      setEvents(
        eventResult.data || []
      );


      const nextSemesterSchools =
        (
          schoolResult.data ||
          []
        )
          .map(
            (item) =>
              item.calendar_schools
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name,
                "zh-Hant"
              )
          );


      const nextSchoolNames =
        Object.fromEntries(
          nextSemesterSchools.map(
            (school) => [
              school.id,
              school.name,
            ]
          )
        );


      setSemesterSchools(
        nextSemesterSchools
      );

      setSchoolNames(
        nextSchoolNames
      );
    } catch (error) {
      console.error(
        "讀取月曆資料失敗：",
        error
      );

      setErrorMessage(
        error?.message
          ? `讀取月曆資料失敗：${error.message}`
          : "讀取月曆資料失敗。"
      );
    } finally {
      setLoading(false);
    }
  }


  const monthDays =
    useMemo(() => {
      const monthStart =
        new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth(),
          1,
          12
        );

      const monthEnd =
        new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() + 1,
          0,
          12
        );

      const calendarStart =
        addDays(
          monthStart,
          -getMondayIndex(
            monthStart
          )
        );

      const calendarEnd =
        addDays(
          monthEnd,
          6 -
            getMondayIndex(
              monthEnd
            )
        );

      const days = [];

      let cursor =
        new Date(
          calendarStart
        );

      while (
        cursor <=
        calendarEnd
      ) {
        days.push(
          new Date(cursor)
        );

        cursor =
          addDays(
            cursor,
            1
          );
      }

      return days;
    }, [currentMonth]);


  const monthWeeks =
    useMemo(() => {
      const result = [];

      for (
        let index = 0;
        index < monthDays.length;
        index += 7
      ) {
        result.push(
          monthDays.slice(
            index,
            index + 7
          )
        );
      }

      return result;
    }, [monthDays]);


  function getEventsForDate(
    date
  ) {
    const dateKey =
      formatDateKey(date);

    return events.filter(
      (eventItem) => {
        const start =
          eventItem.start_date;

        const end =
          eventItem.end_date ||
          eventItem.start_date;

        return (
          start <= dateKey &&
          end >= dateKey
        );
      }
    );
  }


  function goPreviousMonth() {
    setCurrentMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() - 1,
          1,
          12
        )
    );
  }


  function goNextMonth() {
    setCurrentMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          1,
          12
        )
    );
  }


  function toggleExpanded(
    dateKey
  ) {
    setExpandedDates(
      (current) => ({
        ...current,
        [dateKey]:
          !current[
            dateKey
          ],
      })
    );
  }


  function openCreate(date) {
    if (!canEdit) {
      return;
    }

    const dateKey =
      formatDateKey(date);

    setEditingEvent(null);

    setForm({
      title: "",
      startDate:
        dateKey,
      endDate: "",
      category:
        "ADMIN",
      schoolId: "ALL",
      notes: "",
    });

    setErrorMessage("");
  }


  function openEdit(eventItem) {
    if (!canEdit) {
      return;
    }

    setEditingEvent(
      eventItem
    );

    setForm({
      title:
        eventItem.title ||
        "",
      startDate:
        eventItem.start_date,
      endDate:
        eventItem.end_date ||
        "",
      category:
        eventItem.category ||
        "ADMIN",
      schoolId:
        eventItem.applies_to_all_schools
          ? "ALL"
          : eventItem.school_id ||
            "ALL",
      notes:
        eventItem.notes ||
        "",
    });

    setErrorMessage("");
  }


  function closeForm() {
    if (saving) {
      return;
    }

    setEditingEvent(null);
    setForm(null);
  }


  function handleFormChange(
    event
  ) {
    const {
      name,
      value,
    } = event.target;

    setForm(
      (current) => {
        const next = {
          ...current,
          [name]: value,
        };

        if (
          name === "category" &&
          value !== "SCHOOL"
        ) {
          next.schoolId = "ALL";
        }

        return next;
      }
    );
  }


  async function handleSave(
    event
  ) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }


    const title =
      form?.title
        ?.trim();


    if (!title) {
      setErrorMessage(
        "請輸入事項名稱。"
      );
      return;
    }


    if (!form.startDate) {
      setErrorMessage(
        "請選擇開始日期。"
      );
      return;
    }


    if (
      form.endDate &&
      form.endDate <
        form.startDate
    ) {
      setErrorMessage(
        "結束日期不能早於開始日期。"
      );
      return;
    }


    try {
      setSaving(true);
      setErrorMessage("");


      const isSchoolEvent =
        form.category ===
        "SCHOOL";

      const selectedSchoolId =
        isSchoolEvent
          ? form.schoolId ||
            "ALL"
          : "ALL";


      const payload = {
        semester_id:
          semesterId,

        school_id:
          selectedSchoolId ===
          "ALL"
            ? null
            : selectedSchoolId,

        applies_to_all_schools:
          selectedSchoolId ===
          "ALL",

        start_date:
          form.startDate,

        end_date:
          form.endDate ||
          null,

        title,

        event_type:
          "OTHER",

        category:
          form.category,

        notes:
          form.notes.trim() ||
          null,

        affects_pickup:
          false,

        updated_at:
          new Date()
            .toISOString(),
      };


      if (editingEvent) {
        const { error } =
          await supabase
            .from(
              "calendar_school_events"
            )
            .update(
              payload
            )
            .eq(
              "id",
              editingEvent.id
            );

        if (error) {
          throw error;
        }
      } else {
        const { error } =
          await supabase
            .from(
              "calendar_school_events"
            )
            .insert(
              payload
            );

        if (error) {
          throw error;
        }
      }


      closeForm();

      await loadEvents();
    } catch (error) {
      console.error(
        "儲存月曆事項失敗：",
        error
      );

      setErrorMessage(
        error?.message
          ? `儲存失敗：${error.message}`
          : "儲存失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }


  async function handleDelete() {
    if (
      !canEdit ||
      !editingEvent
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        `確定要刪除「${editingEvent.title}」嗎？\n\n刪除後無法復原。`
      );


    if (!confirmed) {
      return;
    }


    try {
      setSaving(true);
      setErrorMessage("");


      const { error } =
        await supabase
          .from(
            "calendar_school_events"
          )
          .delete()
          .eq(
            "id",
            editingEvent.id
          );


      if (error) {
        throw error;
      }


      closeForm();

      await loadEvents();
    } catch (error) {
      console.error(
        "刪除月曆事項失敗：",
        error
      );

      setErrorMessage(
        error?.message
          ? `刪除失敗：${error.message}`
          : "刪除失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }


  const canGoPrevious =
    !semesterStart ||
    currentMonth >
      new Date(
        semesterStart.getFullYear(),
        semesterStart.getMonth(),
        1,
        12
      );


  const canGoNext =
    !semesterEnd ||
    currentMonth <
      new Date(
        semesterEnd.getFullYear(),
        semesterEnd.getMonth(),
        1,
        12
      );


  return (
    <section className="month-calendar">
      <header className="month-calendar__header">
        <div>
          <p className="semester-table-view__eyebrow">
            MONTHLY VIEW
          </p>

          <h2>
            {currentMonth.getFullYear()}
            年
            {currentMonth.getMonth() + 1}
            月
          </h2>
        </div>


        <div className="month-calendar__nav">
          <button
            type="button"
            onClick={
              goPreviousMonth
            }
            disabled={
              !canGoPrevious
            }
          >
            ← 上個月
          </button>

          <button
            type="button"
            onClick={
              goNextMonth
            }
            disabled={
              !canGoNext
            }
          >
            下個月 →
          </button>
        </div>
      </header>


      {loading && (
        <div className="calendar-message">
          正在讀取月曆……
        </div>
      )}


      {errorMessage && (
        <div className="calendar-message calendar-message--error">
          {errorMessage}
        </div>
      )}


      <div className="month-calendar__grid">
        {WEEKDAYS.map(
          (weekday) => (
            <div
              key={
                weekday
              }
              className="month-calendar__weekday"
            >
              {weekday}
            </div>
          )
        )}


        {monthWeeks.map(
          (
            weekDays,
            weekIndex
          ) => {
            const weekSegments =
              buildWeekEventSegments(
                weekDays,
                events
              );

            const rangeSegments =
              weekSegments.filter(
                (segment) =>
                  !segment.isSingleDay
              );

            const maxLaneCount =
              rangeSegments.length
                ? Math.max(
                    ...rangeSegments.map(
                      (segment) =>
                        segment.laneIndex
                    )
                  ) + 1
                : 0;

            return (
              <div
                key={`month-week-${weekIndex}`}
                className="month-calendar__week-row"
                style={{
                  gridColumn:
                    "1 / -1",
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(7, minmax(0, 1fr))",
                  position: "relative",
                }}
              >
                {weekDays.map(
                  (date) => {
                    const dateKey =
                      formatDateKey(
                        date
                      );

                    const dateEvents =
                      getEventsForDate(
                        date
                      ).filter(
                        (eventItem) => {
                          const endDate =
                            eventItem.end_date ||
                            eventItem.start_date;

                          return (
                            endDate ===
                            eventItem.start_date
                          );
                        }
                      );

                    const isCurrentMonth =
                      date.getMonth() ===
                      currentMonth.getMonth();

                    const isOutsideSemester =
                      (
                        semesterStart &&
                        date <
                          semesterStart
                      ) ||
                      (
                        semesterEnd &&
                        date >
                          semesterEnd
                      );

                    return (
                      <div
                        key={dateKey}
                        className={[
                          "month-calendar__day",

                          !isCurrentMonth
                            ? "is-other-month"
                            : "",

                          isOutsideSemester
                            ? "is-outside-semester"
                            : "",
                        ]
                          .filter(
                            Boolean
                          )
                          .join(" ")}
                        style={{
                          minHeight:
                            maxLaneCount >
                            0
                              ? `${
                                  128 +
                                  maxLaneCount *
                                    34
                                }px`
                              : undefined,
                        }}
                      >
                        <div className="month-calendar__date">
                          {date.getDate()}
                        </div>

                        <div className="month-calendar__events">
                          {dateEvents.map(
                            (eventItem) => {
                              const schoolLabel =
                                eventItem.applies_to_all_schools
                                  ? "全部學校"
                                  : schoolNames[
                                      eventItem.school_id
                                    ] || "";

                              return (
                                <button
                                  key={
                                    eventItem.id
                                  }
                                  type="button"
                                  className="month-calendar-event"
                                  onClick={() =>
                                    openEdit(
                                      eventItem
                                    )
                                  }
                                  disabled={
                                    !canEdit
                                  }
                                >
                                  <strong>
                                    {eventItem.title ||
                                      "行事項目"}
                                  </strong>

                                  {schoolLabel && (
                                    <span>
                                      {
                                        schoolLabel
                                      }
                                    </span>
                                  )}
                                </button>
                              );
                            }
                          )}
                        </div>

                        {canEdit &&
                          !isOutsideSemester && (
                            <button
                              type="button"
                              className="month-calendar__add"
                              onClick={() =>
                                openCreate(
                                  date
                                )
                              }
                              title="新增行事"
                            >
                              ＋
                            </button>
                          )}
                      </div>
                    );
                  }
                )}

                {rangeSegments.map(
                  (segment) => {
                    const {
                      eventItem,
                      startColumn,
                      span,
                      laneIndex,
                      segmentStartsHere,
                      segmentEndsHere,
                    } = segment;

                    const schoolLabel =
                      eventItem.applies_to_all_schools
                        ? "全部學校"
                        : schoolNames[
                            eventItem.school_id
                          ] || "";

                    return (
                      <button
                        key={`${eventItem.id}-${weekIndex}`}
                        type="button"
                        className={[
                          "month-calendar-range-event",
                          segmentStartsHere
                            ? "is-start"
                            : "is-continued-start",
                          segmentEndsHere
                            ? "is-end"
                            : "is-continued-end",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          openEdit(
                            eventItem
                          )
                        }
                        disabled={
                          !canEdit
                        }
                        style={{
                          gridColumn: `${startColumn} / span ${span}`,
                          position:
                            "absolute",
                          left: `calc((${
                            startColumn - 1
                          }) * (100% / 7) + 8px)`,
                          width: `calc((${
                            span
                          }) * (100% / 7) - 16px)`,
                          top: `${
                            42 +
                            laneIndex *
                              34
                          }px`,
                          zIndex: 4,
                        }}
                      >
                        <strong>
                          {eventItem.title ||
                            "行事項目"}
                        </strong>

                        {schoolLabel && (
                          <span>
                            {
                              schoolLabel
                            }
                          </span>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            );
          }
        )}
      </div>


      {form && (
        <div
          className="calendar-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget &&
              !saving
            ) {
              closeForm();
            }
          }}
        >
          <section
            className="calendar-modal calendar-modal--small"
            role="dialog"
            aria-modal="true"
          >
            <header className="calendar-modal__header">
              <div>
                <p className="semester-card-kicker">
                  {editingEvent
                    ? "EDIT EVENT"
                    : "NEW EVENT"}
                </p>

                <h2>
                  {editingEvent
                    ? "編輯行事項目"
                    : "新增行事項目"}
                </h2>
              </div>

              <button
                type="button"
                className="calendar-modal__close"
                onClick={
                  closeForm
                }
                disabled={
                  saving
                }
              >
                ×
              </button>
            </header>


            <form
              className="month-event-form"
              onSubmit={
                handleSave
              }
            >
              <label className="calendar-field">
                <span>
                  事項名稱
                </span>

                <input
                  type="text"
                  name="title"
                  value={
                    form.title
                  }
                  onChange={
                    handleFormChange
                  }
                  autoFocus
                />
              </label>


              <div className="school-event-date-grid">
                <label className="calendar-field">
                  <span>
                    開始日期
                  </span>

                  <input
                    type="date"
                    name="startDate"
                    value={
                      form.startDate
                    }
                    min={
                      semesterStartDate
                    }
                    max={
                      semesterEndDate
                    }
                    onChange={
                      handleFormChange
                    }
                  />
                </label>

                <label className="calendar-field">
                  <span>
                    結束日期
                  </span>

                  <input
                    type="date"
                    name="endDate"
                    value={
                      form.endDate
                    }
                    min={
                      form.startDate ||
                      semesterStartDate
                    }
                    max={
                      semesterEndDate
                    }
                    onChange={
                      handleFormChange
                    }
                  />
                </label>
              </div>


              <label className="calendar-field">
                <span>
                  類別
                </span>

                <select
                  name="category"
                  value={
                    form.category
                  }
                  onChange={
                    handleFormChange
                  }
                >
                  {CATEGORY_OPTIONS.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    )
                  )}
                </select>
              </label>


              {form.category === "SCHOOL" && (
                <label className="calendar-field">
                  <span>
                    適用學校
                  </span>

                  <select
                    name="schoolId"
                    value={
                      form.schoolId
                    }
                    onChange={
                      handleFormChange
                    }
                    disabled={
                      saving
                    }
                  >
                    <option value="ALL">
                      全部學校
                    </option>

                    {semesterSchools.map(
                      (school) => (
                        <option
                          key={
                            school.id
                          }
                          value={
                            school.id
                          }
                        >
                          {
                            school.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>
              )}


              <label className="calendar-field">
                <span>
                  備註
                </span>

                <textarea
                  name="notes"
                  value={
                    form.notes
                  }
                  onChange={
                    handleFormChange
                  }
                  rows="4"
                />
              </label>


              <div className="month-event-form__actions">
                {editingEvent && (
                  <button
                    type="button"
                    className="month-event-form__delete"
                    onClick={
                      handleDelete
                    }
                    disabled={
                      saving
                    }
                  >
                    刪除
                  </button>
                )}


                <div>
                  <button
                    type="button"
                    className="calendar-secondary-button"
                    onClick={
                      closeForm
                    }
                    disabled={
                      saving
                    }
                  >
                    取消
                  </button>

                  <button
                    type="submit"
                    className="calendar-primary-button"
                    disabled={
                      saving
                    }
                  >
                    {saving
                      ? "儲存中…"
                      : "儲存"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}


export default MonthCalendarView;