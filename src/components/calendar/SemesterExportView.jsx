import { useState } from "react";
import { jsPDF } from "jspdf";

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

    if (weeks.length === 0) {
      window.alert(
        "目前沒有可匯出的學期資料。"
      );
      return;
    }

    try {
      setExporting(true);

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // 與前面點名表相同：嵌入芫荽體，讓中文保持真正向量文字。
      const fontResponse = await fetch(
        "https://cdn.jsdelivr.net/gh/ButTaiwan/iansui@main/fonts/ttf/Iansui-Regular.ttf"
      );

      if (!fontResponse.ok) {
        throw new Error(
          `芫荽體載入失敗（${fontResponse.status}）`
        );
      }

      const fontBytes = new Uint8Array(
        await fontResponse.arrayBuffer()
      );

      let binary = "";
      const chunkSize = 0x8000;

      for (
        let offset = 0;
        offset < fontBytes.length;
        offset += chunkSize
      ) {
        binary += String.fromCharCode(
          ...fontBytes.subarray(
            offset,
            Math.min(
              offset + chunkSize,
              fontBytes.length
            )
          )
        );
      }

      pdf.addFileToVFS(
        "Iansui-Regular.ttf",
        btoa(binary)
      );

      pdf.addFont(
        "Iansui-Regular.ttf",
        "Iansui",
        "normal"
      );

      pdf.setFont(
        "Iansui",
        "normal"
      );

      const pageWidth =
        pdf.internal.pageSize.getWidth();

      const pageHeight =
        pdf.internal.pageSize.getHeight();

      const marginX = 6;
      const marginTop = 6;
      const contentWidth =
        pageWidth - marginX * 2;

      // 每頁 6 週，避免把整學期硬壓在一頁。
      const WEEKS_PER_PAGE = 6;

      const pageGroups = [];

      for (
        let index = 0;
        index < weeks.length;
        index += WEEKS_PER_PAGE
      ) {
        pageGroups.push(
          weeks.slice(
            index,
            index + WEEKS_PER_PAGE
          )
        );
      }

      const fixedWidths = {
        month: 10,
        week: 10,
      };

      // 日期欄維持精簡，把主要空間留給五個事務欄。
      const dateWidth = 7.2;

      const remainingWidth =
        contentWidth -
        fixedWidths.month -
        fixedWidths.week -
        dateWidth * 7;

      const workWidth =
        remainingWidth /
        WORK_COLUMNS.length;

      const headerTop = 27;
      const headerHeight = 12;

      const headerFill = [
        246,
        244,
        238,
      ];

      const outsideFill = [
        245,
        245,
        243,
      ];

      const startFill = [
        235,
        243,
        235,
      ];

      const endFill = [
        245,
        237,
        232,
      ];

      function drawRect(
        x,
        y,
        width,
        height,
        fill = null,
        lineWidth = 0.16
      ) {
        if (fill) {
          pdf.setFillColor(
            fill[0],
            fill[1],
            fill[2]
          );
        }

        pdf.setDrawColor(
          112,
          112,
          108
        );

        pdf.setLineWidth(
          lineWidth
        );

        pdf.rect(
          x,
          y,
          width,
          height,
          fill ? "FD" : "S"
        );
      }

      function fitTextSize(
        value,
        maxWidth,
        startSize = 7.2,
        minSize = 4.8
      ) {
        let size = startSize;

        pdf.setFontSize(size);

        while (
          value &&
          pdf.getTextWidth(value) >
            maxWidth &&
          size > minSize
        ) {
          size -= 0.2;
          pdf.setFontSize(size);
        }

        return size;
      }

      function drawCenteredText(
        value,
        x,
        y,
        width,
        height,
        {
          fontSize = 7,
          minSize = 5,
          textColor = [
            55,
            55,
            52,
          ],
        } = {}
      ) {
        const textValue =
          String(value ?? "");

        const size =
          fitTextSize(
            textValue,
            width - 1.2,
            fontSize,
            minSize
          );

        pdf.setTextColor(
          textColor[0],
          textColor[1],
          textColor[2]
        );

        pdf.setFontSize(size);

        pdf.text(
          textValue,
          x + width / 2,
          y + height / 2,
          {
            align: "center",
            baseline: "middle",
          }
        );
      }

      function getEventLineText(
        eventItem
      ) {
        const eventCategory =
          eventItem.category ||
          "SCHOOL";

        const schoolLabel =
          eventCategory === "SCHOOL"
            ? (
                eventItem.applies_to_all_schools
                  ? "全部學校"
                  : schoolNames[
                      eventItem.school_id
                    ] || ""
              )
            : "";

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

        return `${dateText}｜${getEventTitle(
          eventItem
        )}${
          schoolLabel
            ? `／${schoolLabel}`
            : ""
        }`;
      }

      function getWeekRowHeight(
        week
      ) {
        let maxEventCount = 1;

        WORK_COLUMNS.forEach(
          (column) => {
            maxEventCount = Math.max(
              maxEventCount,
              getWeekEvents(
                week,
                column.key
              ).length
            );
          }
        );

        // 有多筆事件時增加列高，而不是把所有內容壓成一坨。
        return Math.max(
          18,
          8 +
            maxEventCount * 5.2
        );
      }

      pageGroups.forEach(
        (
          pageWeeks,
          pageIndex
        ) => {
          if (pageIndex > 0) {
            pdf.addPage(
              "a4",
              "landscape"
            );
          }

          // ===== 頁首 =====
          pdf.setFont(
            "Iansui",
            "normal"
          );

          pdf.setTextColor(
            116,
            116,
            110
          );

          pdf.setFontSize(7);

          pdf.text(
            "BEAST ACADEMY · SEMESTER OVERVIEW",
            marginX,
            marginTop + 3
          );

          pdf.setTextColor(
            42,
            42,
            39
          );

          pdf.setFontSize(16);

          pdf.text(
            `倍思學院｜${semesterName || "學期"}｜學期行事總表`,
            marginX,
            marginTop + 10
          );

          pdf.setFontSize(7.2);

          pdf.setTextColor(
            92,
            92,
            88
          );

          pdf.text(
            `${formatShortDate(
              startDate
            )}－${formatShortDate(
              endDate
            )}　｜　共 ${weeks.length} 週`,
            marginX,
            marginTop + 15
          );

          pdf.text(
            `第 ${pageIndex + 1}／${pageGroups.length} 頁　｜　第 ${pageWeeks[0]?.weekNumber || ""}–${pageWeeks[pageWeeks.length - 1]?.weekNumber || ""} 週`,
            pageWidth - marginX,
            marginTop + 15,
            {
              align: "right",
            }
          );

          // ===== 表頭 =====
          let x = marginX;

          const headerCells = [
            {
              label: "月份",
              width:
                fixedWidths.month,
            },
            {
              label: "週次",
              width:
                fixedWidths.week,
            },
            ...WEEKDAY_LABELS.map(
              (label) => ({
                label,
                width:
                  dateWidth,
              })
            ),
            ...WORK_COLUMNS.map(
              (column) => ({
                label:
                  column.label,
                width:
                  workWidth,
              })
            ),
          ];

          headerCells.forEach(
            (cell) => {
              drawRect(
                x,
                headerTop,
                cell.width,
                headerHeight,
                headerFill
              );

              drawCenteredText(
                cell.label,
                x,
                headerTop,
                cell.width,
                headerHeight,
                {
                  fontSize: 7.2,
                  minSize: 5.5,
                }
              );

              x += cell.width;
            }
          );

          // ===== 每週內容 =====
          let y =
            headerTop +
            headerHeight;

          pageWeeks.forEach(
            (week) => {
              const rowHeight =
                getWeekRowHeight(
                  week
                );

              x = marginX;

              drawRect(
                x,
                y,
                fixedWidths.month,
                rowHeight
              );

              drawCenteredText(
                week.monthLabel,
                x,
                y,
                fixedWidths.month,
                rowHeight,
                {
                  fontSize: 7,
                }
              );

              x +=
                fixedWidths.month;

              drawRect(
                x,
                y,
                fixedWidths.week,
                rowHeight
              );

              drawCenteredText(
                week.weekNumber,
                x,
                y,
                fixedWidths.week,
                rowHeight,
                {
                  fontSize: 7.5,
                }
              );

              x +=
                fixedWidths.week;

              week.days.forEach(
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

                  let fill = null;

                  if (
                    outsideSemester
                  ) {
                    fill =
                      outsideFill;
                  } else if (
                    isSemesterStart
                  ) {
                    fill =
                      startFill;
                  } else if (
                    isSemesterEnd
                  ) {
                    fill =
                      endFill;
                  }

                  drawRect(
                    x,
                    y,
                    dateWidth,
                    rowHeight,
                    fill
                  );

                  drawCenteredText(
                    formatDay(date),
                    x,
                    y,
                    dateWidth,
                    rowHeight,
                    {
                      fontSize: 7.4,
                      textColor:
                        outsideSemester
                          ? [
                              165,
                              165,
                              160,
                            ]
                          : [
                              55,
                              55,
                              52,
                            ],
                    }
                  );

                  x += dateWidth;
                }
              );

              WORK_COLUMNS.forEach(
                (column) => {
                  drawRect(
                    x,
                    y,
                    workWidth,
                    rowHeight
                  );

                  const weekEvents =
                    getWeekEvents(
                      week,
                      column.key
                    );

                  if (
                    weekEvents.length >
                    0
                  ) {
                    const innerX =
                      x + 1.4;

                    const innerWidth =
                      workWidth - 2.8;

                    const lineHeight =
                      Math.min(
                        5.2,
                        (rowHeight - 3) /
                          weekEvents.length
                      );

                    weekEvents.forEach(
                      (
                        eventItem,
                        eventIndex
                      ) => {
                        const lineText =
                          getEventLineText(
                            eventItem
                          );

                        const fontSize =
                          fitTextSize(
                            lineText,
                            innerWidth,
                            7,
                            4.8
                          );

                        pdf.setFontSize(
                          fontSize
                        );

                        pdf.setTextColor(
                          50,
                          50,
                          47
                        );

                        pdf.text(
                          lineText,
                          innerX,
                          y +
                            3.2 +
                            eventIndex *
                              lineHeight,
                          {
                            baseline:
                              "middle",
                          }
                        );
                      }
                    );
                  }

                  x += workWidth;
                }
              );

              y += rowHeight;
            }
          );

          // ===== 頁尾 =====
          const footerY =
            Math.min(
              pageHeight - 6,
              y + 5
            );

          pdf.setDrawColor(
            150,
            150,
            145
          );

          pdf.setLineWidth(
            0.16
          );

          pdf.line(
            marginX,
            footerY - 2,
            pageWidth - marginX,
            footerY - 2
          );

          pdf.setFontSize(6.5);

          pdf.setTextColor(
            105,
            105,
            100
          );

          pdf.text(
            `倍思學院｜${semesterName || "學期"}`,
            marginX,
            footerY + 1
          );

          pdf.text(
            `PDF 第 ${pageIndex + 1}／${pageGroups.length} 頁`,
            pageWidth - marginX,
            footerY + 1,
            {
              align: "right",
            }
          );
        }
      );

      pdf.save(
        `${semesterName || "學期"}_學期行事總表.pdf`
      );
    } catch (error) {
      console.error(
        "輸出完整學期總表 PDF 失敗：",
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
          : "輸出完整學期 PDF"}
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
                                    const eventCategory =
                                      eventItem.category ||
                                      "SCHOOL";

                                    const schoolLabel =
                                      eventCategory === "SCHOOL"
                                        ? (
                                            eventItem.applies_to_all_schools
                                              ? "全部學校"
                                              : schoolNames[
                                                  eventItem.school_id
                                                ] || ""
                                          )
                                        : "";

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