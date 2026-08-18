import { useState } from "react";
import { toPng } from "html-to-image";

const CATEGORY_LABELS = {
  SCHOOL: "學校",
  ADMIN: "行政",
  ACADEMIC: "學科",
  CLASSROOM: "教室",
  SOCIAL: "發文",
};

function formatShortDate(dateString) {
  if (!dateString) return "";

  const [year, month, day] =
    String(dateString).split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function formatInlineDate(dateString) {
  if (!dateString) return "";

  const [, month, day] =
    String(dateString).split("-");

  if (!month || !day) {
    return dateString;
  }

  return `${Number(month)}/${Number(day)}`;
}

function formatEventDate(eventItem) {
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

  if (!end || end === start) {
    return start;
  }

  return `${start}–${end}`;
}

function getWeekDateRange(week) {
  const first =
    week?.days?.[0];

  const last =
    week?.days?.[
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

function eventOverlapsWeek(
  eventItem,
  week
) {
  const start =
    eventItem.start_date;

  const end =
    eventItem.end_date ||
    eventItem.start_date;

  return (
    start <= week.endDate &&
    end >= week.startDate
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

  async function handleExport() {
    if (exporting) {
      return;
    }

    const node =
      document.getElementById(
        `semester-export-sheet-${semesterId}`
      );

    if (!node) {
      window.alert(
        "找不到輸出版面，請重新整理後再試。"
      );
      return;
    }

    try {
      setExporting(true);

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const rawDataUrl =
        await toPng(
          node,
          {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor:
              "#fffdf9",
          }
        );

      const image = new Image();

      await new Promise(
        (resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = rawDataUrl;
        }
      );

      /*
       * A4 直式 300 DPI
       * 2480 × 3508 px
       *
       * 只做等比例縮放，不拉伸。
       */
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

      const maxWidth =
        canvas.width -
        safeMargin * 2;

      const maxHeight =
        canvas.height -
        safeMargin * 2;

      const scale =
        Math.min(
          maxWidth / image.width,
          maxHeight / image.height
        );

      const drawWidth =
        image.width * scale;

      const drawHeight =
        image.height * scale;

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

      const link =
        document.createElement(
          "a"
        );

      link.download =
        `${semesterName || "學期"}_行事總表_A4直式.png`;

      link.href =
        canvas.toDataURL(
          "image/png"
        );

      link.click();
    } catch (error) {
      console.error(
        "輸出學期行事總表失敗：",
        error
      );

      window.alert(
        `輸出失敗：${error.message}`
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="semester-export-trigger"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting
          ? "產出中…"
          : "輸出 A4 直式圖檔"}
      </button>

      <div
        className="semester-export-stage"
        aria-hidden="true"
      >
        <article
          id={`semester-export-sheet-${semesterId}`}
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
                const weekEvents =
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
                      (a, b) =>
                        String(
                          a.start_date ||
                            ""
                        ).localeCompare(
                          String(
                            b.start_date ||
                              ""
                          )
                        )
                    );

                return (
                  <section
                    key={
                      week.weekNumber
                    }
                    className="semester-export-week"
                  >
                    <div className="semester-export-week__heading">
                      <strong>
                        第{" "}
                        {
                          week.weekNumber
                        }{" "}
                        週
                      </strong>

                      <span>
                        {getWeekDateRange(
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
                      {weekEvents.length ===
                      0 ? (
                        <span className="semester-export-week__empty">
                          本週無安排
                        </span>
                      ) : (
                        weekEvents.map(
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
                                key={
                                  eventItem.id
                                }
                                className="semester-export-event"
                              >
                                <span className="semester-export-event__category">
                                  {CATEGORY_LABELS[
                                    category
                                  ] ||
                                    "事項"}
                                </span>

                                <strong>
                                  {eventItem.title ||
                                    "行事項目"}
                                </strong>

                                <small>
                                  {[
                                    formatEventDate(
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
    </>
  );
}

export default SemesterExportView;