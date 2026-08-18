import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { toPng } from "html-to-image";


const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];


const WORK_COLUMNS = [
  {
    key: "SCHOOL",
    label: "學校重要事務",
    allowQuickAdd: true,
  },
  {
    key: "ADMIN",
    label: "行政表單與固定事務",
    allowQuickAdd: true,
  },
  {
    key: "ACADEMIC",
    label: "學科事務安排",
    allowQuickAdd: true,
  },
  {
    key: "CLASSROOM",
    label: "教室活動安排",
    allowQuickAdd: true,
  },
  {
    key: "SOCIAL",
    label: "臉書發文排程",
    allowQuickAdd: true,
  },
];

const EXPORT_CATEGORY_LABELS = {
  SCHOOL: "學校",
  ADMIN: "行政",
  ACADEMIC: "學科",
  CLASSROOM: "教室",
  SOCIAL: "發文",
};


const EVENT_TYPE_LABELS = {
  OPENING_DAY: "開學日",
  MIDTERM_EXAM: "期中考",
  FINAL_EXAM: "期末考",
  EXAM: "考試",
  SPORTS_DAY: "運動會",
  SCHOOL_ANNIVERSARY: "校慶",
  PARENT_MEETING: "親師活動",
  GRADUATION: "畢業活動",
  MOCK_EXAM: "模擬考",
  EXAM_REVIEW: "考前複習",
  REVIEW_WEEK: "複習週",
  OTHER: "其他",
};


function parseLocalDate(dateString) {
  if (!dateString) return null;

  const [year, month, day] = dateString
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
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function addDays(date, amount) {
  const result = new Date(date);

  result.setDate(
    result.getDate() + amount
  );

  return result;
}


function getMonday(date) {
  const result = new Date(date);

  const weekday =
    result.getDay();

  const daysFromMonday =
    weekday === 0
      ? 6
      : weekday - 1;

  result.setDate(
    result.getDate() -
      daysFromMonday
  );

  return result;
}


function getSunday(date) {
  return addDays(
    getMonday(date),
    6
  );
}


function formatMonth(date) {
  return `${date.getMonth() + 1}月`;
}


function formatDay(date) {
  return date.getDate();
}


function formatShortDate(
  dateString
) {
  const date =
    parseLocalDate(
      dateString
    );

  if (!date) {
    return "—";
  }

  return `${date.getFullYear()}/${String(
    date.getMonth() + 1
  ).padStart(
    2,
    "0"
  )}/${String(
    date.getDate()
  ).padStart(
    2,
    "0"
  )}`;
}


function formatInlineDate(
  dateString
) {
  const date =
    parseLocalDate(
      dateString
    );

  if (!date) {
    return "";
  }

  return `${
    date.getMonth() + 1
  }/${date.getDate()}`;
}


function formatExportDateRange(
  eventItem
) {
  const start =
    formatInlineDate(
      eventItem.start_date
    );

  const end =
    eventItem.end_date
      ? formatInlineDate(
          eventItem.end_date
        )
      : "";

  if (
    !end ||
    end === start
  ) {
    return start;
  }

  return `${start}–${end}`;
}


function getExportWeekDateRange(
  week
) {
  const first =
    week.days?.[0];

  const last =
    week.days?.[
      week.days.length - 1
    ];

  if (!first || !last) {
    return "";
  }

  return `${
    first.getMonth() + 1
  }/${first.getDate()}–${
    last.getMonth() + 1
  }/${last.getDate()}`;
}


function isSameDate(
  dateA,
  dateB
) {
  return (
    dateA.getFullYear() ===
      dateB.getFullYear() &&
    dateA.getMonth() ===
      dateB.getMonth() &&
    dateA.getDate() ===
      dateB.getDate()
  );
}


function buildSemesterWeeks(
  startDateString,
  endDateString
) {
  const semesterStart =
    parseLocalDate(
      startDateString
    );

  const semesterEnd =
    parseLocalDate(
      endDateString
    );


  async function exportSemesterOverviewPng() {
    if (exportingImage) {
      return;
    }

    const exportNode =
      document.getElementById(
        `semester-export-${semesterId}`
      );

    if (!exportNode) {
      setEventError(
        "找不到學期總表輸出版面，請重新整理後再試。"
      );
      return;
    }

    try {
      setExportingImage(true);
      setEventError("");

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const rawDataUrl =
        await toPng(
          exportNode,
          {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor:
              "#fffdf9",
          }
        );

      const image =
        new Image();

      await new Promise(
        (
          resolve,
          reject
        ) => {
          image.onload =
            resolve;
          image.onerror =
            reject;
          image.src =
            rawDataUrl;
        }
      );

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width = 2480;
      canvas.height = 3508;

      const context =
        canvas.getContext(
          "2d"
        );

      context.fillStyle =
        "#fffdf9";

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const safeMargin = 42;

      const availableWidth =
        canvas.width -
        safeMargin * 2;

      const availableHeight =
        canvas.height -
        safeMargin * 2;

      const scale =
        Math.min(
          availableWidth /
            image.width,
          availableHeight /
            image.height
        );

      const drawWidth =
        image.width *
        scale;

      const drawHeight =
        image.height *
        scale;

      const drawX =
        (
          canvas.width -
          drawWidth
        ) / 2;

      const drawY =
        (
          canvas.height -
          drawHeight
        ) / 2;

      context.drawImage(
        image,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );

      const downloadLink =
        document.createElement(
          "a"
        );

      downloadLink.download =
        `${semesterName || "學期"}_行事總表_A4直式.png`;

      downloadLink.href =
        canvas.toDataURL(
          "image/png"
        );

      downloadLink.click();
    } catch (error) {
      console.error(
        "輸出學期總表圖檔失敗：",
        error
      );

      setEventError(
        error?.message
          ? `輸出圖檔失敗：${error.message}`
          : "輸出圖檔失敗，請稍後再試。"
      );
    } finally {
      setExportingImage(false);
    }
  }


  if (
    !semesterStart ||
    !semesterEnd ||
    semesterStart >
      semesterEnd
  ) {
    return [];
  }


  const tableStart =
    getMonday(
      semesterStart
    );

  const tableEnd =
    getSunday(
      semesterEnd
    );

  const weeks = [];

  let currentMonday =
    new Date(
      tableStart
    );

  let weekNumber = 1;


  while (
    currentMonday <=
    tableEnd
  ) {
    const days =
      Array.from(
        { length: 7 },
        (_, index) =>
          addDays(
            currentMonday,
            index
          )
      );


    const firstSemesterDay =
      days.find(
        (date) =>
          date >= semesterStart &&
          date <= semesterEnd
      ) ?? days[0];


    const monthKey =
      `${firstSemesterDay.getFullYear()}-${
        firstSemesterDay.getMonth() + 1
      }`;


    weeks.push({
      weekNumber,
      monthKey,
      monthLabel:
        formatMonth(
          firstSemesterDay
        ),
      days,
      startDate:
        formatDateKey(
          days[0]
        ),
      endDate:
        formatDateKey(
          days[6]
        ),
      firstAvailableDate:
        formatDateKey(
          firstSemesterDay
        ),
    });


    currentMonday =
      addDays(
        currentMonday,
        7
      );

    weekNumber += 1;
  }


  weeks.forEach(
    (week, index) => {
      const isFirstWeekOfMonth =
        index === 0 ||
        weeks[index - 1]
          .monthKey !==
          week.monthKey;


      if (
        !isFirstWeekOfMonth
      ) {
        week.monthRowSpan = 0;

        return;
      }


      let rowSpan = 1;


      while (
        index + rowSpan <
          weeks.length &&
        weeks[
          index + rowSpan
        ].monthKey ===
          week.monthKey
      ) {
        rowSpan += 1;
      }


      week.monthRowSpan =
        rowSpan;
    }
  );


  return weeks;
}


function getEventTitle(
  eventItem
) {
  if (
    eventItem.event_type ===
    "OTHER"
  ) {
    return (
      eventItem.title ||
      "其他行事"
    );
  }

  return (
    EVENT_TYPE_LABELS[
      eventItem.event_type
    ] ||
    eventItem.title ||
    "行事項目"
  );
}


function eventOverlapsWeek(
  eventItem,
  week
) {
  const eventStart =
    eventItem.start_date;

  const eventEnd =
    eventItem.end_date ||
    eventItem.start_date;

  return (
    eventStart <=
      week.endDate &&
    eventEnd >=
      week.startDate
  );
}


function SemesterTableView({
  semesterId,
  semesterName,
  startDate,
  endDate,
  canEdit = false,
}) {
  const [
    events,
    setEvents,
  ] = useState([]);

  const [
    schoolNames,
    setSchoolNames,
  ] = useState({});

  const [
    semesterSchools,
    setSemesterSchools,
  ] = useState([]);

  const [
    loadingEvents,
    setLoadingEvents,
  ] = useState(false);

  const [
    eventError,
    setEventError,
  ] = useState("");

  const [
    quickAdd,
    setQuickAdd,
  ] = useState(null);

  const [
    quickAddSaving,
    setQuickAddSaving,
  ] = useState(false);


  const [
    deletingEventId,
    setDeletingEventId,
  ] = useState(null);

  const [
    expandedCells,
    setExpandedCells,
  ] = useState({});


  const [
    exportingImage,
    setExportingImage,
  ] = useState(false);


  const semesterStart =
    parseLocalDate(
      startDate
    );

  const semesterEnd =
    parseLocalDate(
      endDate
    );


  const weeks =
    useMemo(
      () =>
        buildSemesterWeeks(
          startDate,
          endDate
        ),
      [
        startDate,
        endDate,
      ]
    );


  useEffect(() => {
    if (!semesterId) {
      setEvents([]);
      setSchoolNames({});
      setSemesterSchools([]);

      return;
    }

    loadSemesterEvents();
  }, [semesterId]);


  async function loadSemesterEvents() {
    try {
      setLoadingEvents(true);
      setEventError("");


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
              display_order,
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
                ascending:
                  true,
              }
            )
            .order(
              "display_order",
              {
                ascending:
                  true,
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


      if (
        eventResult.error
      ) {
        throw (
          eventResult.error
        );
      }


      if (
        schoolResult.error
      ) {
        throw (
          schoolResult.error
        );
      }


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


      setEvents(
        eventResult.data ||
          []
      );

      setSemesterSchools(
        nextSemesterSchools
      );

      setSchoolNames(
        nextSchoolNames
      );
    } catch (error) {
      console.error(
        "讀取學期行事失敗：",
        error
      );


      setEventError(
        error?.message
          ? `讀取學期行事失敗：${error.message}`
          : "讀取學期行事失敗，請稍後再試。"
      );
    } finally {
      setLoadingEvents(
        false
      );
    }
  }


  function getWeekEvents(
    week,
    category
  ) {
    return events.filter(
      (eventItem) => {
        const eventCategory =
          eventItem.category ||
          "SCHOOL";

        return (
          eventCategory ===
            category &&
          eventOverlapsWeek(
            eventItem,
            week
          )
        );
      }
    );
  }


  function openQuickAdd(
    week,
    category
  ) {
    if (!canEdit) {
      return;
    }


    setQuickAdd({
      weekNumber:
        week.weekNumber,
      category,
      title: "",
      date:
        week.firstAvailableDate,
      schoolId: "ALL",
    });


    setEventError("");
  }


  function closeQuickAdd() {
    if (
      quickAddSaving
    ) {
      return;
    }

    setQuickAdd(null);
  }


  function handleQuickAddChange(
    event
  ) {
    const {
      name,
      value,
    } = event.target;


    setQuickAdd(
      (current) => ({
        ...current,
        [name]: value,
      })
    );
  }


  async function handleQuickAddSubmit(
    event
  ) {
    event.preventDefault();


    if (!canEdit) {
      setEventError(
        "目前權限為僅查看，無法新增行事項目。"
      );

      return;
    }


    const title =
      quickAdd?.title
        ?.trim();


    if (!title) {
      setEventError(
        "請先輸入事項名稱。"
      );

      return;
    }


    if (
      !quickAdd.date
    ) {
      setEventError(
        "請選擇日期。"
      );

      return;
    }


    try {
      setQuickAddSaving(
        true
      );

      setEventError("");


      const isSchoolEvent =
        quickAdd.category ===
        "SCHOOL";

      const selectedSchoolId =
        isSchoolEvent
          ? quickAdd.schoolId ||
            "ALL"
          : "ALL";


      const payload = {
        semester_id: semesterId,

        school_id:
          selectedSchoolId ===
          "ALL"
            ? null
            : selectedSchoolId,

        applies_to_all_schools:
          selectedSchoolId ===
          "ALL",

        start_date:
          quickAdd.date,

        end_date:
          null,

        title,

        event_type:
          "OTHER",

        category:
          quickAdd.category,

        display_order:
          0,

        notes:
          null,

        affects_pickup:
          false,

        updated_at:
          new Date()
            .toISOString(),
      };


      const {
        error,
      } = await supabase
        .from(
          "calendar_school_events"
        )
        .insert(
          payload
        );


      if (error) {
        throw error;
      }


      setQuickAdd(null);

      await loadSemesterEvents();
    } catch (error) {
      console.error(
        "快速新增行事失敗：",
        error
      );


      setEventError(
        error?.message
          ? `新增失敗：${error.message}`
          : "新增失敗，請稍後再試。"
      );
    } finally {
      setQuickAddSaving(
        false
      );
    }
  }


  function toggleCellExpanded(
    cellKey
  ) {
    setExpandedCells(
      (current) => ({
        ...current,
        [cellKey]:
          !current[cellKey],
      })
    );
  }


  async function handleDeleteEvent(
    eventItem
  ) {
    if (!canEdit) {
      setEventError(
        "目前權限為僅查看，無法刪除行事項目。"
      );

      return;
    }

    const eventTitle =
      getEventTitle(eventItem);

    const confirmed =
      window.confirm(
        `確定要刪除「${eventTitle}」嗎？\n\n刪除後無法復原。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingEventId(
        eventItem.id
      );

      setEventError("");

      const { error } =
        await supabase
          .from(
            "calendar_school_events"
          )
          .delete()
          .eq(
            "id",
            eventItem.id
          );

      if (error) {
        throw error;
      }

      setEvents(
        (currentEvents) =>
          currentEvents.filter(
            (item) =>
              item.id !==
              eventItem.id
          )
      );
    } catch (error) {
      console.error(
        "刪除學期行事失敗：",
        error
      );

      setEventError(
        error?.message
          ? `刪除失敗：${error.message}`
          : "刪除失敗，請稍後再試。"
      );
    } finally {
      setDeletingEventId(null);
    }
  }


  if (
    !semesterStart ||
    !semesterEnd ||
    weeks.length === 0
  ) {
    return (
      <section className="semester-table-empty">
        <h2>
          尚未建立學期總表
        </h2>

        <p>
          請先到「管理」建立有效的學期起訖日期。
        </p>
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

          <h2>
            {semesterName}
          </h2>

          <span>
            {formatShortDate(
              startDate
            )}
            －
            {formatShortDate(
              endDate
            )}
          </span>
        </div>


        <div className="semester-table-view__headerActions">
          <div className="semester-table-view__summary">
            共 {weeks.length} 週
          </div>

          <button
            type="button"
            className="semester-table-export-button"
            onClick={
              exportSemesterOverviewPng
            }
            disabled={
              exportingImage ||
              loadingEvents
            }
          >
            {exportingImage
              ? "產出中…"
              : "輸出 A4 直式圖檔"}
          </button>
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
          <colgroup>
            <col className="semester-col semester-col--month" />
            <col className="semester-col semester-col--week" />

            {WEEKDAY_LABELS.map((weekday) => (
              <col
                key={`date-col-${weekday}`}
                className="semester-col semester-col--date"
              />
            ))}

            {WORK_COLUMNS.map((column) => (
              <col
                key={`work-col-${column.key}`}
                className="semester-col semester-col--work"
              />
            ))}
          </colgroup>

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

              <th colSpan="7">
                日期
              </th>


              {WORK_COLUMNS.map(
                (column) => (
                  <th
                    key={
                      column.key
                    }
                    className="semester-table__work-heading"
                    rowSpan="2"
                  >
                    {
                      column.label
                    }
                  </th>
                )
              )}
            </tr>


            <tr>
              {WEEKDAY_LABELS.map(
                (weekday) => (
                  <th
                    key={
                      weekday
                    }
                    className="semester-table__day-heading"
                  >
                    {
                      weekday
                    }
                  </th>
                )
              )}
            </tr>
          </thead>


          <tbody>
            {weeks.map(
              (week) => (
                <tr
                  key={
                    week.weekNumber
                  }
                >
                  {week.monthRowSpan >
                    0 && (
                    <td
  className="semester-table__month"
  rowSpan={week.monthRowSpan}
>
  <div className="semester-table__center">
    {week.monthLabel}
  </div>
</td>
                  )}


                  <td className="semester-table__week">
  <div className="semester-table__center">
    {week.weekNumber}
  </div>
</td>


                  {week.days.map(
                    (date) => {
                      const outsideSemester =
                        date <
                          semesterStart ||
                        date >
                          semesterEnd;


                      const isSemesterStart =
                        isSameDate(
                          date,
                          semesterStart
                        );


                      const isSemesterEnd =
                        isSameDate(
                          date,
                          semesterEnd
                        );


                      return (
                        <td
                          key={
                            date.toISOString()
                          }
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
                            .filter(
                              Boolean
                            )
                            .join(
                              " "
                            )}
                        >
                          <span>
                            {
                              formatDay(
                                date
                              )
                            }
                          </span>


                          {isSemesterStart && (
                            <small>
                              開始
                            </small>
                          )}


                          {isSemesterEnd && (
                            <small>
                              結束
                            </small>
                          )}
                        </td>
                      );
                    }
                  )}


                  {WORK_COLUMNS.map(
                    (column) => {
                      const weekEvents =
                        getWeekEvents(
                          week,
                          column.key
                        );


                      const isQuickAdding =
                        quickAdd?.weekNumber ===
                          week.weekNumber &&
                        quickAdd?.category ===
                          column.key;

                      const cellKey =
                        `${week.weekNumber}-${column.key}`;

                      const isExpanded =
                        Boolean(
                          expandedCells[cellKey]
                        );

                      const visibleEvents =
                        isExpanded
                          ? weekEvents
                          : weekEvents.slice(0, 2);

                      const hiddenEventCount =
                        Math.max(
                          weekEvents.length - 2,
                          0
                        );


                      return (
                        <td
                          key={`${week.weekNumber}-${column.key}`}
                          className="semester-table__work-cell"
                        >
                          <div className="semester-table__work-content">
                            {visibleEvents.map(
                              (
                                eventItem
                              ) => {
                                const schoolLabel =
                                  eventItem.applies_to_all_schools
                                    ? "全部學校"
                                    : schoolNames[
                                        eventItem.school_id
                                      ] ||
                                      "";


                                return (
                                  <div
                                    key={eventItem.id}
                                    className="semester-table-event"
                                  >
                                    <div className="semester-table-event__heading">
                                      <strong>
                                        {getEventTitle(
                                          eventItem
                                        )}
                                      </strong>

                                      <div className="semester-table-event__tools">
                                        <small>
                                          {formatInlineDate(
                                            eventItem.start_date
                                          )}
                                        </small>
                                      </div>
                                    </div>

                                    {schoolLabel && (
                                      <span>
                                        {schoolLabel}
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                            )}

                            {hiddenEventCount > 0 && (
                              <button
                                type="button"
                                className="semester-table-event-toggle"
                                onClick={() =>
                                  toggleCellExpanded(
                                    cellKey
                                  )
                                }
                              >
                                {isExpanded
                                  ? "收合"
                                  : `＋${hiddenEventCount} 項`}
                              </button>
                            )}                          </div>
                        </td>
                      );
                    }
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <div
        className="semester-export-stage"
        aria-hidden="true"
      >
        <article
          id={`semester-export-${semesterId}`}
          className="semester-export-sheet"
        >
          <header className="semester-export-header">
            <p>
              BEAST ACADEMY · SEMESTER OVERVIEW
            </p>

            <h1>
              倍思學院
            </h1>

            <h2>
              {semesterName}
              ｜學期行事總表
            </h2>

            <div className="semester-export-meta">
              <span>
                {formatShortDate(
                  startDate
                )}
                －
                {formatShortDate(
                  endDate
                )}
              </span>

              <span>
                共 {weeks.length} 週
              </span>
            </div>
          </header>

          <div className="semester-export-weeks">
            {weeks.map(
              (week) => {
                const exportWeekEvents =
                  events
                    .filter(
                      (eventItem) =>
                        eventOverlapsWeek(
                          eventItem,
                          week
                        )
                    )
                    .slice()
                    .sort(
                      (a, b) => {
                        const dateCompare =
                          String(
                            a.start_date ||
                              ""
                          ).localeCompare(
                            String(
                              b.start_date ||
                                ""
                            )
                          );

                        if (
                          dateCompare !==
                          0
                        ) {
                          return dateCompare;
                        }

                        return (
                          WORK_COLUMNS.findIndex(
                            (column) =>
                              column.key ===
                              (
                                a.category ||
                                "SCHOOL"
                              )
                          ) -
                          WORK_COLUMNS.findIndex(
                            (column) =>
                              column.key ===
                              (
                                b.category ||
                                "SCHOOL"
                              )
                          )
                        );
                      }
                    );

                return (
                  <section
                    key={`export-${week.weekNumber}`}
                    className="semester-export-week"
                  >
                    <div className="semester-export-week__heading">
                      <strong>
                        第 {week.weekNumber} 週
                      </strong>

                      <span>
                        {getExportWeekDateRange(
                          week
                        )}
                      </span>

                      {week.monthRowSpan >
                        0 && (
                        <em>
                          {
                            week.monthLabel
                          }
                        </em>
                      )}
                    </div>

                    <div className="semester-export-week__events">
                      {exportWeekEvents.length ===
                      0 ? (
                        <span className="semester-export-week__empty">
                          本週無安排
                        </span>
                      ) : (
                        exportWeekEvents.map(
                          (
                            eventItem
                          ) => {
                            const category =
                              eventItem.category ||
                              "SCHOOL";

                            const schoolLabel =
                              eventItem.applies_to_all_schools
                                ? "全部學校"
                                : schoolNames[
                                    eventItem.school_id
                                  ] ||
                                  "";

                            return (
                              <div
                                key={`export-event-${eventItem.id}`}
                                className="semester-export-event"
                              >
                                <span className="semester-export-event__category">
                                  {EXPORT_CATEGORY_LABELS[
                                    category
                                  ] ||
                                    "事項"}
                                </span>

                                <strong>
                                  {getEventTitle(
                                    eventItem
                                  )}
                                </strong>

                                <small>
                                  {[
                                    formatExportDateRange(
                                      eventItem
                                    ),
                                    schoolLabel,
                                  ]
                                    .filter(
                                      Boolean
                                    )
                                    .join(
                                      "・"
                                    )}
                                </small>
                              </div>
                            );
                          }
                        )
                      )}
                    </div>
                  </section>
                );
              }
            )}
          </div>

          <footer className="semester-export-footer">
            倍思學院｜{semesterName}
          </footer>
        </article>
      </div>
    </section>
  );
}


export default SemesterTableView;