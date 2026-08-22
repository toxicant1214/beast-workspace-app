import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { jsPDF } from "jspdf";
import "./AttendanceSheetModal.css";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateString(date) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}

function getMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDate: `${year}-${pad2(month)}-01`,
    endDate: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

function getMonthDays(year, month) {
  const lastDay = new Date(year, month, 0).getDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);

    return {
      dateString: toDateString(date),
      day: index + 1,
      weekday: date.getDay(),
    };
  });
}

function getWeekdayLabel(weekday) {
  return ["日", "一", "二", "三", "四", "五", "六"][weekday];
}

function getStudentChineseName(row) {
  return (
    row.students?.chinese_name ||
    row.students?.english_name ||
    "未命名學生"
  );
}

function getStudentEnglishName(row) {
  return row.students?.english_name || "—";
}

function getParentPhone(student) {
  return (
    student?.parent_phone_1 ||
    student?.parent_phone1 ||
    student?.primary_parent_phone ||
    student?.guardian_phone_1 ||
    student?.guardian_phone ||
    student?.parent_phone ||
    student?.phone ||
    student?.mobile ||
    "—"
  );
}

function AttendanceSheetModal({ classItem, onClose }) {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [students, setStudents] = useState([]);
  const [englishClassMap, setEnglishClassMap] = useState(new Map());
  const [overrides, setOverrides] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadAttendanceData();
  }, [classItem?.id, year, month]);

  async function loadAttendanceData() {
    if (!classItem?.id) return;

    try {
      setLoading(true);
      setErrorMessage("");

      const {
        startDate,
        endDate,
      } = getMonthRange(
        year,
        month
      );

      const [
        studentsResult,
        overridesResult,
      ] = await Promise.all([
        supabase
          .from("class_students")
          .select(`
            id,
            student_id,
            joined_at,
            left_at,
            status,
            students (*)
          `)
          .eq(
            "class_id",
            classItem.id
          )
          .lte(
            "joined_at",
            endDate
          )
          .order(
            "joined_at",
            {
              ascending: true,
            }
          ),

        supabase
          .from(
            "calendar_day_overrides"
          )
          .select(
            "override_date, override_type, title"
          )
          .gte(
            "override_date",
            startDate
          )
          .lte(
            "override_date",
            endDate
          ),
      ]);

      if (studentsResult.error) {
        throw studentsResult.error;
      }

      if (overridesResult.error) {
        throw overridesResult.error;
      }

      /*
       * 同一位學生在同一班可能有多筆歷程
       * （例如退出後重新加入）。
       * 點名表先依 student_id 合併，
       * 並保留所有加入／退出期間。
       */
      const membershipMap =
        new Map();

      (
        studentsResult.data ||
        []
      )
        .filter(
          (row) =>
            !row.left_at ||
            row.left_at >=
              startDate
        )
        .forEach((row) => {
          const studentId =
            row.student_id;

          if (!studentId) {
            return;
          }

          if (
            !membershipMap.has(
              studentId
            )
          ) {
            membershipMap.set(
              studentId,
              {
                ...row,
                membershipPeriods:
                  [],
              }
            );
          }

          const grouped =
            membershipMap.get(
              studentId
            );

          grouped.membershipPeriods.push(
            {
              joined_at:
                row.joined_at ||
                null,
              left_at:
                row.left_at ||
                null,
              status:
                row.status ||
                null,
            }
          );

          if (row.students) {
            grouped.students =
              row.students;
          }
        });

      const monthStudents =
        Array.from(
          membershipMap.values()
        ).sort(
          (a, b) =>
            getStudentChineseName(
              a
            ).localeCompare(
              getStudentChineseName(
                b
              ),
              "zh-Hant"
            )
        );

      const studentIds =
        monthStudents
          .map(
            (row) =>
              row.student_id
          )
          .filter(Boolean);

      const nextEnglishClassMap =
        new Map();

      if (
        studentIds.length >
        0
      ) {
        const {
          data: englishRows,
          error: englishError,
        } = await supabase
          .from(
            "english_class_students"
          )
          .select(`
            student_id,
            joined_at,
            left_at,
            status,
            english_classes (
              id,
              class_name
            )
          `)
          .in(
            "student_id",
            studentIds
          )
          .lte(
            "joined_at",
            endDate
          )
          .order(
            "joined_at",
            {
              ascending: false,
            }
          );

        if (englishError) {
          throw englishError;
        }

        (
          englishRows ||
          []
        )
          .filter(
            (row) =>
              !row.left_at ||
              row.left_at >=
                startDate
          )
          .forEach(
            (row) => {
              const className =
                row
                  .english_classes
                  ?.class_name;

              if (!className) {
                return;
              }

              const current =
                nextEnglishClassMap.get(
                  row.student_id
                ) || [];

              if (
                !current.includes(
                  className
                )
              ) {
                current.push(
                  className
                );
              }

              nextEnglishClassMap.set(
                row.student_id,
                current
              );
            }
          );
      }

      setStudents(
        monthStudents
      );

      setEnglishClassMap(
        nextEnglishClassMap
      );

      setOverrides(
        overridesResult.data ||
        []
      );
    } catch (error) {
      console.error(
        "讀取點名表資料失敗：",
        error
      );

      setErrorMessage(
        `讀取點名表資料失敗：${error.message}`
      );

      setStudents([]);
      setEnglishClassMap(
        new Map()
      );
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  }

  const overrideMap =
    useMemo(
      () =>
        new Map(
          overrides.map(
            (item) => [
              item.override_date,
              item,
            ]
          )
        ),
      [overrides]
    );

  /*
   * 點名表日期規則：
   * 1. 平日都保留。
   * 2. 行事曆 HOLIDAY / CLASSROOM_CLOSED
   *    仍保留欄位，但標示為休假。
   * 3. SPECIAL_WORKDAY 即使落在六日也列入。
   * 4. 一般週六日不列。
   */
  const calendarColumns =
    useMemo(() => {
      return getMonthDays(
        year,
        month
      )
        .filter((day) => {
          const override =
            overrideMap.get(
              day.dateString
            );

          if (
            override
              ?.override_type ===
            "SPECIAL_WORKDAY"
          ) {
            return true;
          }

          if (
            override &&
            [
              "HOLIDAY",
              "CLASSROOM_CLOSED",
            ].includes(
              override
                .override_type
            )
          ) {
            return (
              day.weekday >= 1 &&
              day.weekday <= 5
            );
          }

          return (
            day.weekday >= 1 &&
            day.weekday <= 5
          );
        })
        .map((day) => {
          const override =
            overrideMap.get(
              day.dateString
            );

          const isHoliday =
            [
              "HOLIDAY",
              "CLASSROOM_CLOSED",
            ].includes(
              override
                ?.override_type
            );

          return {
            ...day,
            override,
            isHoliday,
            holidayLabel:
              isHoliday
                ? override?.title ||
                  "休假"
                : "",
          };
        });
    }, [
      year,
      month,
      overrideMap,
    ]);

  const classStart =
    classItem?.start_date ||
    null;

  const classEnd =
    classItem?.end_date ||
    null;

  const visibleColumns =
    useMemo(
      () =>
        calendarColumns.filter(
          (day) => {
            if (
              classStart &&
              day.dateString <
                classStart
            ) {
              return false;
            }

            if (
              classEnd &&
              day.dateString >
                classEnd
            ) {
              return false;
            }

            return true;
          }
        ),
      [
        calendarColumns,
        classStart,
        classEnd,
      ]
    );

  const workdayCount =
    visibleColumns.filter(
      (day) =>
        !day.isHoliday
    ).length;

  function getEnglishClassName(
    studentId
  ) {
    const names =
      englishClassMap.get(
        studentId
      ) || [];

    return (
      names.join("／") ||
      "—"
    );
  }

  async function exportAttendancePdf() {
    if (loading || students.length === 0) {
      return;
    }

    try {
      setErrorMessage("");

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

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

      const marginX = 7;
      const topY = 7;
      const contentWidth =
        pageWidth - marginX * 2;

      const fixedWidths = {
        number: 8,
        chineseName: 18,
        englishName: 22,
        phone: 28,
        englishClass: 22,
      };

      const fixedTotal =
        fixedWidths.number +
        fixedWidths.chineseName +
        fixedWidths.englishName +
        fixedWidths.phone +
        fixedWidths.englishClass;

      const dateWidth =
        (
          contentWidth -
          fixedTotal
        ) /
        Math.max(
          visibleColumns.length,
          1
        );

      const headerHeight = 10;

      const headerTop =
        topY + 20;

      const footerReserve = 10;

      const availableBodyHeight =
        pageHeight -
        headerTop -
        headerHeight -
        footerReserve -
        7;

      const rowHeight = Math.min(
        7.6,
        Math.max(
          4.6,
          availableBodyHeight /
            Math.max(
              students.length,
              1
            )
        )
      );

      function drawCell({
        x,
        y,
        width,
        height,
        textValue = "",
        fontSize = 7,
        fill = null,
        textColor = [31, 42, 36],
        bold = false,
        rotate = 0,
      }) {
        if (fill) {
          pdf.setFillColor(
            fill[0],
            fill[1],
            fill[2]
          );
        }

        pdf.setDrawColor(
          70,
          83,
          75
        );

        pdf.setLineWidth(
          0.16
        );

        pdf.rect(
          x,
          y,
          width,
          height,
          fill ? "FD" : "S"
        );

        let value =
          String(
            textValue ?? ""
          );

        let size =
          fontSize;

        pdf.setFont(
          "Iansui",
          "normal"
        );

        pdf.setFontSize(
          size
        );

        pdf.setTextColor(
          textColor[0],
          textColor[1],
          textColor[2]
        );

        while (
          value &&
          rotate === 0 &&
          pdf.getTextWidth(
            value
          ) >
            width - 1.2 &&
          size > 5
        ) {
          size -= 0.2;
          pdf.setFontSize(
            size
          );
        }

        const textX =
          x + width / 2;

        const textY =
          y +
          height / 2 +
          size * 0.11;

        pdf.text(
          value,
          textX,
          textY,
          {
            align: "center",
            baseline: "middle",
            angle: rotate,
          }
        );

        if (
          bold &&
          value
        ) {
          pdf.text(
            value,
            textX + 0.05,
            textY,
            {
              align: "center",
              baseline: "middle",
              angle: rotate,
            }
          );
        }
      }

      // Header
      pdf.setTextColor(
        31,
        42,
        36
      );

      pdf.setFont(
        "Iansui",
        "normal"
      );

      pdf.setFontSize(10);
      pdf.text(
        "倍思學院",
        marginX,
        topY + 4
      );

      pdf.setFontSize(17);
      pdf.text(
        `${classItem.class_name}｜點名表`,
        marginX,
        topY + 11
      );

      pdf.setFontSize(7.5);
      pdf.setTextColor(
        104,
        118,
        110
      );

      const classMeta = [
        classItem.academic_year || "",
        classItem.term || "",
      ]
        .filter(Boolean)
        .join(" ・ ");

      if (classMeta) {
        pdf.text(
          classMeta,
          marginX,
          topY + 15
        );
      }

      pdf.setTextColor(
        31,
        42,
        36
      );

      pdf.setFontSize(12);
      pdf.text(
        `${year} 年 ${month} 月`,
        pageWidth - marginX,
        topY + 11,
        {
          align: "right",
        }
      );

      pdf.setFontSize(7.5);
      pdf.setTextColor(
        104,
        118,
        110
      );

      pdf.text(
        `學生 ${students.length} 人　｜　上班日 ${workdayCount} 天`,
        pageWidth - marginX,
        topY + 15,
        {
          align: "right",
        }
      );

      let x =
        marginX;

      const headerFill =
        [242, 244, 240];

      const fixedHeaders = [
        [
          "序",
          fixedWidths.number,
        ],
        [
          "中文姓名",
          fixedWidths.chineseName,
        ],
        [
          "英文姓名",
          fixedWidths.englishName,
        ],
        [
          "家長電話",
          fixedWidths.phone,
        ],
        [
          "英文班級",
          fixedWidths.englishClass,
        ],
      ];

      fixedHeaders.forEach(
        ([
          label,
          width,
        ]) => {
          drawCell({
            x,
            y: headerTop,
            width,
            height:
              headerHeight,
            textValue:
              label,
            fontSize: 7,
            fill:
              headerFill,
            bold: true,
          });

          x += width;
        }
      );

      visibleColumns.forEach(
        (day) => {
          drawCell({
            x,
            y: headerTop,
            width:
              dateWidth,
            height:
              headerHeight,
            textValue:
              `${day.day}/${getWeekdayLabel(
                day.weekday
              )}`,
            fontSize:
              visibleColumns.length >=
              22
                ? 5.8
                : 6.4,
            fill:
              day.isHoliday
                ? [
                    243,
                    232,
                    229,
                  ]
                : headerFill,
            textColor:
              day.isHoliday
                ? [
                    141,
                    81,
                    73,
                  ]
                : [
                    31,
                    42,
                    36,
                  ],
            bold: true,
          });

          x +=
            dateWidth;
        }
      );

      // Student rows
      students.forEach(
        (
          row,
          index
        ) => {
          const y =
            headerTop +
            headerHeight +
            index *
              rowHeight;

          let cellX =
            marginX;

          const studentId =
            row.student_id;

          const fixedCells = [
            [
              index + 1,
              fixedWidths.number,
              6.8,
              false,
            ],
            [
              getStudentChineseName(
                row
              ),
              fixedWidths.chineseName,
              7.2,
              true,
            ],
            [
              getStudentEnglishName(
                row
              ),
              fixedWidths.englishName,
              6.5,
              false,
            ],
            [
              getParentPhone(
                row.students
              ),
              fixedWidths.phone,
              6.5,
              false,
            ],
            [
              getEnglishClassName(
                studentId
              ),
              fixedWidths.englishClass,
              6.3,
              false,
            ],
          ];

          fixedCells.forEach(
            ([
              value,
              width,
              fontSize,
              bold,
            ]) => {
              drawCell({
                x: cellX,
                y,
                width,
                height:
                  rowHeight,
                textValue:
                  value,
                fontSize,
                bold,
              });

              cellX +=
                width;
            }
          );

          visibleColumns.forEach(
            (day) => {
              const periods =
                Array.isArray(
                  row.membershipPeriods
                ) &&
                row.membershipPeriods
                  .length > 0
                  ? row.membershipPeriods
                  : [
                      {
                        joined_at:
                          row.joined_at ||
                          null,
                        left_at:
                          row.left_at ||
                          null,
                      },
                    ];

              const activeOnDate =
                periods.some(
                  (period) => {
                    const joined =
                      !period.joined_at ||
                      period.joined_at <=
                        day.dateString;

                    const notLeft =
                      !period.left_at ||
                      period.left_at >=
                        day.dateString;

                    return (
                      joined &&
                      notLeft
                    );
                  }
                );

              if (
                day.isHoliday
              ) {
                drawCell({
                  x: cellX,
                  y,
                  width:
                    dateWidth,
                  height:
                    rowHeight,
                  textValue:
                    index === 0
                      ? "休"
                      : "",
                  fontSize:
                    7,
                  fill: [
                    243,
                    232,
                    229,
                  ],
                  textColor: [
                    141,
                    81,
                    73,
                  ],
                  bold:
                    index === 0,
                });
              } else {
                drawCell({
                  x: cellX,
                  y,
                  width:
                    dateWidth,
                  height:
                    rowHeight,
                  textValue: "",
                  fill:
                    activeOnDate
                      ? null
                      : [
                          240,
                          241,
                          239,
                        ],
                });
              }

              cellX +=
                dateWidth;
            }
          );
        }
      );

      const tableBottom =
        headerTop +
        headerHeight +
        students.length *
          rowHeight;

      pdf.setFontSize(
        7
      );

      pdf.setTextColor(
        90,
        102,
        95
      );

      pdf.text(
        `學生人數：${students.length}`,
        marginX,
        tableBottom + 5
      );

      pdf.text(
        `上班日：${workdayCount} 天`,
        pageWidth / 2,
        tableBottom + 5,
        {
          align: "center",
        }
      );

      pdf.text(
        "導師簽名：______________",
        pageWidth - marginX,
        tableBottom + 5,
        {
          align: "right",
        }
      );

      const safeClassName =
        String(
          classItem.class_name ||
          "班級"
        ).replace(
          /[\/:*?"<>|]/g,
          "_"
        );

      pdf.save(
        `${safeClassName}_${year}年${month}月_點名表.pdf`
      );
    } catch (error) {
      console.error(
        "產出點名表 PDF 失敗：",
        error
      );

      window.alert(
        `產出點名表 PDF 失敗：${error.message}`
      );
    }
  }

  return (
    <div
      className="attendanceModal__backdrop"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="attendanceModal"
        role="dialog"
        aria-modal="true"
      >
        <header className="attendanceModal__toolbar">
          <div>
            <p>
              ATTENDANCE SHEET
            </p>

            <h2>
              班級點名表
            </h2>
          </div>

          <div className="attendanceModal__controls">
            <label>
              <span>
                年份
              </span>

              <input
                type="number"
                min="2020"
                max="2100"
                value={year}
                onChange={(
                  event
                ) =>
                  setYear(
                    Number(
                      event.target
                        .value
                    )
                  )
                }
              />
            </label>

            <label>
              <span>
                月份
              </span>

              <select
                value={month}
                onChange={(
                  event
                ) =>
                  setMonth(
                    Number(
                      event.target
                        .value
                    )
                  )
                }
              >
                {Array.from(
                  {
                    length: 12,
                  },
                  (
                    _,
                    index
                  ) =>
                    index + 1
                ).map(
                  (value) => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {value} 月
                    </option>
                  )
                )}
              </select>
            </label>

            <button
              type="button"
              onClick={
                exportAttendancePdf
              }
              disabled={
                loading
              }
            >
              下載列印 PDF
            </button>

            <button
              type="button"
              onClick={
                onClose
              }
            >
              關閉
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="attendanceModal__error">
            {errorMessage}
          </div>
        )}

        <div className="attendanceModal__previewWrap">
          <article className="attendanceSheet" id="attendance-print-sheet">
            <div className="attendanceSheet__brand">
              倍思學院
            </div>

            <div className="attendanceSheet__title">
              <div>
                <h1>
                  {classItem.class_name}
                  ｜點名表
                </h1>

                <p>
                  {classItem.academic_year ||
                    ""}
                  {classItem.term
                    ? ` ・ ${classItem.term}`
                    : ""}
                </p>
              </div>

              <strong>
                {year} 年{" "}
                {month} 月
              </strong>
            </div>

            {loading ? (
              <div className="attendanceSheet__loading">
                正在產生點名表……
              </div>
            ) : (
              <table className="attendanceSheet__table">
                <thead>
                  <tr>
                    <th className="attendanceSheet__number">
                      序
                    </th>

                    <th className="attendanceSheet__chineseName">
                      中文姓名
                    </th>

                    <th className="attendanceSheet__englishName">
                      英文姓名
                    </th>

                    <th className="attendanceSheet__phone">
                      家長電話
                    </th>

                    <th className="attendanceSheet__englishClass">
                      英文班級
                    </th>

                    {visibleColumns.map(
                      (day) => (
                        <th
                          key={
                            day.dateString
                          }
                          className={
                            day.isHoliday
                              ? "is-holiday"
                              : ""
                          }
                        >
                          <span>
                            {day.day}
                          </span>

                          <small>
                            {getWeekdayLabel(
                              day.weekday
                            )}
                          </small>


                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {students.map(
                    (
                      row,
                      index
                    ) => (
                      <tr
                        key={
                          row.id
                        }
                      >
                        <td>
                          {index +
                            1}
                        </td>

                        <td className="attendanceSheet__studentChineseName">
                          {getStudentChineseName(
                            row
                          )}
                        </td>

                        <td className="attendanceSheet__studentEnglishName">
                          {getStudentEnglishName(
                            row
                          )}
                        </td>

                        <td className="attendanceSheet__studentPhone">
                          {getParentPhone(
                            row.students
                          )}
                        </td>

                        <td className="attendanceSheet__studentEnglishClass">
                          {getEnglishClassName(
                            row.student_id
                          )}
                        </td>

                        {visibleColumns.map(
                          (
                            day
                          ) => {
                            const periods =
                              Array.isArray(
                                row.membershipPeriods
                              ) &&
                              row.membershipPeriods
                                .length >
                                0
                                ? row.membershipPeriods
                                : [
                                    {
                                      joined_at:
                                        row.joined_at ||
                                        null,
                                      left_at:
                                        row.left_at ||
                                        null,
                                    },
                                  ];

                            const activeOnDate =
                              periods.some(
                                (
                                  period
                                ) => {
                                  const joined =
                                    !period.joined_at ||
                                    period.joined_at <=
                                      day.dateString;

                                  const notLeft =
                                    !period.left_at ||
                                    period.left_at >=
                                      day.dateString;

                                  return (
                                    joined &&
                                    notLeft
                                  );
                                }
                              );

                            if (
                              day.isHoliday
                            ) {
                              if (
                                index !== 0
                              ) {
                                return null;
                              }

                              const verticalHolidayName =
                                String(
                                  day.holidayLabel ||
                                    "休假"
                                )
                                  .split("")
                                  .join("\n");

                              return (
                                <td
                                  key={
                                    day.dateString
                                  }
                                  rowSpan={
                                    students.length
                                  }
                                  className="attendanceSheet__holidayMerged"
                                  title={
                                    day.holidayLabel
                                  }
                                >
                                  <span>
                                    {
                                      verticalHolidayName
                                    }
                                  </span>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={
                                  day.dateString
                                }
                                className={
                                  activeOnDate
                                    ? ""
                                    : "is-inactive"
                                }
                              >
                                {""}
                              </td>
                            );
                          }
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}

            <div className="attendanceSheet__footer">
              <span>
                學生人數：
                {students.length}
              </span>

              <span>
                上班日：
                {workdayCount} 天
              </span>

              <span>
                導師簽名：
                ________________
              </span>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

export default AttendanceSheetModal;