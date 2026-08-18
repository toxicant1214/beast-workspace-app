import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
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

      const monthStudents =
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
          .sort(
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

  function printSheet() {
    window.print();
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
                printSheet
              }
              disabled={
                loading
              }
            >
              列印 A4
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
          <article className="attendanceSheet">
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

                          {day.isHoliday && (
                            <em
                              title={
                                day.holidayLabel
                              }
                            >
                              {day.holidayLabel}
                            </em>
                          )}
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
                            const joined =
                              !row.joined_at ||
                              row.joined_at <=
                                day.dateString;

                            const notLeft =
                              !row.left_at ||
                              row.left_at >=
                                day.dateString;

                            const activeOnDate =
                              joined &&
                              notLeft;

                            if (
                              day.isHoliday
                            ) {
                              return (
                                <td
                                  key={
                                    day.dateString
                                  }
                                  className="is-holiday"
                                >
                                  休
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
                                {activeOnDate
                                  ? ""
                                  : "—"}
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