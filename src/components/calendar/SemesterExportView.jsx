import { useState } from "react";
import { toPng } from "html-to-image";

const WEEKDAY_LABELS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "日",
];

const WORK_COLUMNS = [
  { key: "SCHOOL", label: "學校重要事務" },
  { key: "ADMIN", label: "行政表單與固定事務" },
  { key: "ACADEMIC", label: "學科事務安排" },
  { key: "CLASSROOM", label: "教室活動安排" },
  { key: "SOCIAL", label: "臉書發文排程" },
];

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

  const [year, month, day] = String(dateString)
    .split("-")
    .map(Number);

  if (!year || !month || !day) return null;

  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}

function formatShortDate(dateString) {
  const date = parseLocalDate(dateString);

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

function formatInlineDate(dateString) {
  const date = parseLocalDate(dateString);

  if (!date) {
    return "";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDay(date) {
  return date.getDate();
}

function isSameDate(dateA, dateB) {
  if (!dateA || !dateB) {
    return false;
  }

  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function eventOverlapsWeek(
  eventItem,
  week
) {
  const eventStart = eventItem.start_date;
  const eventEnd =
    eventItem.end_date ||
    eventItem.start_date;

  return (
    eventStart <= week.endDate &&
    eventEnd >= week.startDate
  );
}

function getEventTitle(eventItem) {
  if (
    eventItem.event_type === "OTHER"
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

function SemesterExportView({
  semesterId,
  semesterName,
  startDate,
  endDate,
  weeks = [],
  events = [],
  schoolNames = {},
}) {
  const [
    exporting,
    setExporting,
  ] = useState(false);

  const semesterStart =
    parseLocalDate(startDate);

  const semesterEnd =
    parseLocalDate(endDate);

  function getWeekEvents(
    week,
    category
  ) {
    return events
      .filter((eventItem) => {
        const eventCategory =
          eventItem.category ||
          "SCHOOL";

        return (
          eventCategory === category &&
          eventOverlapsWeek(
            eventItem,
            week
          )
        );
      })
      .slice()
      .sort((a, b) => {
        const dateCompare =
          String(
            a.start_date || ""
          ).localeCompare(
            String(
              b.start_date || ""
            )
          );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return (
          Number(
            a.display_order || 0
          ) -
          Number(
            b.display_order || 0
          )
        );
      });
  }

  async function handleExport() {
    if (exporting) {
      return;
    }

    const node =
      document.getElementById(
        `semester-long-export-${semesterId}`
      );

    if (!node) {
      window.alert(
        "找不到完整總表輸出版面，請重新整理後再試。"
      );
      return;
    }

    try {
      setExporting(true);

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const dataUrl =
        await toPng(
          node,
          {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor:
              "#fffdf9",
          }
        );

      const link =
        document.createElement(
          "a"
        );

      link.download =
        `${semesterName || "學期"}_完整行事總表.png`;

      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error(
        "輸出完整學期總表失敗：",
        error
      );

      window.alert(
        error?.message
          ? `輸出失敗：${error.message}`
          : "輸出失敗，請稍後再試。"
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="semester-table-export-button"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting
          ? "產出中…"
          : "輸出完整學期圖檔"}
      </button>

      <div
        className="semester-long-export-stage"
        aria-hidden="true"
      >
        <article
          id={`semester-long-export-${semesterId}`}
          className="semester-long-export-sheet"
        >
          <header className="semester-long-export-header">
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

            <div className="semester-long-export-meta">
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

          <div className="semester-long-export-table-wrap">
            <table className="semester-long-export-table">
              <colgroup>
                <col className="semester-long-export-col--month" />
                <col className="semester-long-export-col--week" />

                {WEEKDAY_LABELS.map(
                  (weekday) => (
                    <col
                      key={`export-date-col-${weekday}`}
                      className="semester-long-export-col--date"
                    />
                  )
                )}

                {WORK_COLUMNS.map(
                  (column) => (
                    <col
                      key={`export-work-col-${column.key}`}
                      className="semester-long-export-col--work"
                    />
                  )
                )}
              </colgroup>

              <thead>
                <tr>
                  <th
                    className="semester-long-export-month-heading"
                    rowSpan="2"
                  >
                    月份
                  </th>

                  <th
                    className="semester-long-export-week-heading"
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
                        className="semester-long-export-work-heading"
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
                        key={weekday}
                        className="semester-long-export-day-heading"
                      >
                        {weekday}
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
                          className="semester-long-export-month"
                          rowSpan={
                            week.monthRowSpan
                          }
                        >
                          {
                            week.monthLabel
                          }
                        </td>
                      )}

                      <td className="semester-long-export-week">
                        {
                          week.weekNumber
                        }
                      </td>

                      {week.days.map(
                        (date) => {
                          const outsideSemester =
                            date < semesterStart ||
                            date > semesterEnd;

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
                                "semester-long-export-date",
                                outsideSemester
                                  ? "is-outside"
                                  : "",
                                isSemesterStart
                                  ? "is-start"
                                  : "",
                                isSemesterEnd
                                  ? "is-end"
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
                                {formatDay(
                                  date
                                )}
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

                          return (
                            <td
                              key={`${week.weekNumber}-${column.key}`}
                              className="semester-long-export-work-cell"
                            >
                              <div className="semester-long-export-work-content">
                                {weekEvents.map(
                                  (eventItem) => {
                                    const schoolLabel =
                                      eventItem.applies_to_all_schools
                                        ? "全部學校"
                                        : schoolNames[
                                            eventItem.school_id
                                          ] ||
                                          "";

                                    const startText =
                                      formatInlineDate(
                                        eventItem.start_date
                                      );

                                    const endText =
                                      eventItem.end_date
                                        ? formatInlineDate(
                                            eventItem.end_date
                                          )
                                        : "";

                                    const dateText =
                                      endText &&
                                      endText !== startText
                                        ? `${startText}–${endText}`
                                        : startText;

                                    return (
                                      <div
                                        key={
                                          eventItem.id
                                        }
                                        className="semester-long-export-event-line"
                                      >
                                        <span className="semester-long-export-event-line__date">
                                          {
                                            dateText
                                          }
                                        </span>

                                        <span className="semester-long-export-event-line__divider">
                                          ｜
                                        </span>

                                        <span className="semester-long-export-event-line__title">
                                          {getEventTitle(
                                            eventItem
                                          )}
                                        </span>

                                        {schoolLabel && (
                                          <>
                                            <span className="semester-long-export-event-line__slash">
                                              ／
                                            </span>

                                            <span className="semester-long-export-event-line__school">
                                              {
                                                schoolLabel
                                              }
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    );
                                  }
                                )}
                              </div>
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

          <footer className="semester-long-export-footer">
            倍思學院｜{semesterName}
          </footer>
        </article>
      </div>
    </>
  );
}

export default SemesterExportView;