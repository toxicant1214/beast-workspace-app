import { Fragment, useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { supabase } from "../../lib/supabase";
import { getStudentPickupDecision } from "./pickupStudentSchedule";

const WEEKDAYS = [
  {
    value: 1,
    label: "星期一",
    column: "monday_time",
  },
  {
    value: 2,
    label: "星期二",
    column: "tuesday_time",
  },
  {
    value: 3,
    label: "星期三",
    column: "wednesday_time",
  },
  {
    value: 4,
    label: "星期四",
    column: "thursday_time",
  },
  {
    value: 5,
    label: "星期五",
    column: "friday_time",
  },
];

const GRADE_GROUP_MAP = {
  "一年級": "LOW",
  "二年級": "LOW",
  "三年級": "MIDDLE",
  "四年級": "MIDDLE",
  "五年級": "HIGH",
  "六年級": "HIGH",
};

const PREFERRED_SCHOOL_ORDER = [
  "麗園",
  "麗林",
  "頭湖",
  "新林",
  "南勢",
  "東湖",
];

function getSchoolOrder(school) {
  const index = PREFERRED_SCHOOL_ORDER.indexOf(school);
  return index === -1 ? 999 : index;
}

function getTimePeriod(value) {
  const time = normalizeTime(value);
  if (!time) return "";
  return time < "14:00" ? "NOON" : "AFTERNOON";
}

function getPeriodLabel(period) {
  return period === "NOON" ? "中午" : "下午";
}

function normalizeTime(value) {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 5);
}

function buildScheduleRows(rules) {
  const rowMap = new Map();

  rules.forEach((rule) => {
    WEEKDAYS.forEach((weekday) => {
      const pickupTime = normalizeTime(
        rule[weekday.column]
      );

      if (!pickupTime) {
        return;
      }

      const key = [
        rule.school,
        weekday.value,
        pickupTime,
      ].join("|");

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          key,
          school: rule.school,
          weekday: weekday.value,
          weekdayLabel: weekday.label,
          pickup_time: pickupTime,
        });
      }
    });
  });

  return Array.from(rowMap.values()).sort((a, b) => {
    const schoolCompare = a.school.localeCompare(
      b.school,
      "zh-Hant"
    );

    if (schoolCompare !== 0) {
      return schoolCompare;
    }

    if (a.weekday !== b.weekday) {
      return a.weekday - b.weekday;
    }

    return a.pickup_time.localeCompare(
      b.pickup_time
    );
  });
}

function TeacherTags({
  names,
  inputValue,
  disabled,
  onInputChange,
  onAdd,
  onRemove,
}) {
  function handleKeyDown(event) {
    if (
      event.key === "Enter" ||
      event.key === ","
    ) {
      event.preventDefault();
      onAdd();
    }
  }

  return (
    <div className="pickupStaffTagEditor">
      <div className="pickupStaffTags">
        {names.map((name) => (
          <span
            key={name}
            className="pickupStaffTag"
          >
            {name}

            <button
              type="button"
              aria-label={`移除 ${name}`}
              disabled={disabled}
              onClick={() => onRemove(name)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="pickupStaffInputRow">
        <input
          type="text"
          value={inputValue}
          disabled={disabled}
          placeholder={
            names.length === 0
              ? "輸入老師姓名"
              : "繼續新增老師"
          }
          onChange={(event) =>
            onInputChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        <button
          type="button"
          className="pickupStaffAddButton"
          disabled={
            disabled || !inputValue.trim()
          }
          onClick={onAdd}
        >
          新增
        </button>
      </div>

      <small>
        輸入姓名後按 Enter，也可以一次加入多位老師。
      </small>
    </div>
  );
}

function PickupStaffPanel() {
  const [students, setStudents] = useState([]);
  const [rules, setRules] = useState([]);
  const [staffRules, setStaffRules] =
    useState([]);
  const [studentWeeklyRules, setStudentWeeklyRules] =
    useState([]);

  const [selectedSchool, setSelectedSchool] =
    useState("");

  const [teacherInputs, setTeacherInputs] =
    useState({});

  const [isLoading, setIsLoading] =
    useState(true);

  const [savingKey, setSavingKey] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [isExporting, setIsExporting] =
    useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [
      studentsResult,
      pickupRulesResult,
      staffRulesResult,
      studentWeeklyRulesResult,
    ] = await Promise.all([
      supabase
        .from("students")
        .select(
          `
            id,
            school,
            current_grade,
            student_status
          `
        )
        .eq("student_status", "ACTIVE")
        .order("school")
        .order("current_grade"),

      supabase
        .from("pickup_rules")
        .select(
          `
            id,
            school,
            grade_group,
            monday_time,
            tuesday_time,
            wednesday_time,
            thursday_time,
            friday_time,
            is_active
          `
        )
        .eq("is_active", true)
        .order("school"),

      supabase
        .from("pickup_staff_rules")
        .select(
          `
            id,
            school,
            weekday,
            pickup_time,
            staff_names,
            note,
            is_active
          `
        )
        .eq("is_active", true)
        .order("school")
        .order("weekday")
        .order("pickup_time"),

      supabase
        .from("pickup_student_weekly_rules")
        .select("*")
        .eq("is_active", true),
    ]);

    if (studentsResult.error) {
      console.error(studentsResult.error);

      setErrorMessage(
        `讀取學生資料失敗：${studentsResult.error.message}`
      );

      setIsLoading(false);
      return;
    }

    if (pickupRulesResult.error) {
      console.error(
        pickupRulesResult.error
      );

      setErrorMessage(
        `讀取接車規則失敗：${pickupRulesResult.error.message}`
      );

      setIsLoading(false);
      return;
    }

    if (staffRulesResult.error) {
      console.error(
        staffRulesResult.error
      );

      setErrorMessage(
        `讀取接車老師失敗：${staffRulesResult.error.message}`
      );

      setIsLoading(false);
      return;
    }

    if (studentWeeklyRulesResult.error) {
      console.error(
        studentWeeklyRulesResult.error
      );

      setErrorMessage(
        `讀取學生特殊接送規則失敗：${studentWeeklyRulesResult.error.message}`
      );

      setIsLoading(false);
      return;
    }

    const nextRules =
      pickupRulesResult.data ?? [];

    setStudents(studentsResult.data ?? []);
    setRules(nextRules);

    setStaffRules(
      staffRulesResult.data ?? []
    );
    setStudentWeeklyRules(
      studentWeeklyRulesResult.data ?? []
    );

    const schools = Array.from(
      new Set(
        nextRules
          .map((rule) => rule.school)
          .filter(Boolean)
      )
    ).sort((a, b) => {
      const orderCompare =
        getSchoolOrder(a) - getSchoolOrder(b);

      if (orderCompare !== 0) {
        return orderCompare;
      }

      return a.localeCompare(b, "zh-Hant");
    });

    setSelectedSchool((current) => {
      if (
        current &&
        schools.includes(current)
      ) {
        return current;
      }

      return schools[0] ?? "";
    });

    setIsLoading(false);
  }

  const scheduleRows = useMemo(
    () => buildScheduleRows(rules),
    [rules]
  );

  const schools = useMemo(() => {
    return Array.from(
      new Set(
        scheduleRows.map(
          (row) => row.school
        )
      )
    ).sort((a, b) => {
      const orderCompare =
        getSchoolOrder(a) - getSchoolOrder(b);

      if (orderCompare !== 0) {
        return orderCompare;
      }

      return a.localeCompare(b, "zh-Hant");
    });
  }, [scheduleRows]);

  const selectedRows = useMemo(() => {
    return scheduleRows.filter(
      (row) =>
        row.school === selectedSchool
    );
  }, [scheduleRows, selectedSchool]);

  const rowsByWeekday = useMemo(() => {
    return WEEKDAYS.map((weekday) => ({
      ...weekday,
      rows: selectedRows.filter(
        (row) =>
          row.weekday === weekday.value
      ),
    }));
  }, [selectedRows]);

  function findStaffRule(row) {
    return staffRules.find(
      (item) =>
        item.school === row.school &&
        Number(item.weekday) ===
          Number(row.weekday) &&
        normalizeTime(item.pickup_time) ===
          normalizeTime(row.pickup_time)
    );
  }

  function getStaffNames(row) {
    const staffRule =
      findStaffRule(row);

    if (
      !Array.isArray(staffRule?.staff_names)
    ) {
      return [];
    }

    return staffRule.staff_names;
  }

  function updateTeacherInput(
    rowKey,
    value
  ) {
    setTeacherInputs((current) => ({
      ...current,
      [rowKey]: value,
    }));
  }

  async function saveStaffNames(
    row,
    nextNames
  ) {
    setSavingKey(row.key);
    setErrorMessage("");

    const cleanedNames = Array.from(
      new Set(
        nextNames
          .map((name) => name.trim())
          .filter(Boolean)
      )
    );

    const existingRule =
      findStaffRule(row);

    const payload = {
      school: row.school,
      weekday: row.weekday,
      pickup_time: row.pickup_time,
      staff_names: cleanedNames,
      is_active: true,
      updated_at:
        new Date().toISOString(),
    };

    let result;

    if (existingRule) {
      result = await supabase
        .from("pickup_staff_rules")
        .update(payload)
        .eq("id", existingRule.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("pickup_staff_rules")
        .insert({
          ...payload,
          created_at:
            new Date().toISOString(),
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error(result.error);

      setErrorMessage(
        `儲存失敗：${result.error.message}`
      );

      setSavingKey("");
      return;
    }

    setStaffRules((current) => {
      const exists = current.some(
        (item) =>
          item.id === result.data.id
      );

      if (exists) {
        return current.map((item) =>
          item.id === result.data.id
            ? result.data
            : item
        );
      }

      return [
        ...current,
        result.data,
      ];
    });

    setSavingKey("");
  }

  async function addTeacher(row) {
    const inputValue =
      teacherInputs[row.key] ?? "";

    const newNames = inputValue
      .split(/[,，、]/)
      .map((name) => name.trim())
      .filter(Boolean);

    if (newNames.length === 0) {
      return;
    }

    const currentNames =
      getStaffNames(row);

    const nextNames = [
      ...currentNames,
      ...newNames,
    ];

    updateTeacherInput(row.key, "");

    await saveStaffNames(
      row,
      nextNames
    );
  }

  async function removeTeacher(
    row,
    teacherName
  ) {
    const nextNames = getStaffNames(
      row
    ).filter(
      (name) => name !== teacherName
    );

    await saveStaffNames(
      row,
      nextNames
    );
  }


  function getRepresentativeDateForWeekday(weekdayValue) {
    // 2026/08/24 是星期一；只用來讓核心判斷取得星期欄位。
    const base = new Date(2026, 7, 24, 12, 0, 0);
    base.setDate(base.getDate() + Number(weekdayValue) - 1);

    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, "0");
    const day = String(base.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function getStudentFinalPeriod(student, weekday, matchingRule) {
    const decision = getStudentPickupDecision({
      studentId: student.id,
      dateKey: getRepresentativeDateForWeekday(weekday.value),
      weeklyRules: studentWeeklyRules,
      dateExceptions: [],
    });

    if (!decision.shouldPickup) {
      return "";
    }

    if (decision.pickupPeriod) {
      return decision.pickupPeriod;
    }

    return getTimePeriod(
      matchingRule?.[weekday.column]
    );
  }


  const summaryCells = useMemo(() => {
    const result = new Map();

    WEEKDAYS.forEach((weekday) => {
      ["NOON", "AFTERNOON"].forEach((period) => {
        schools.forEach((school) => {
          const matchingRules = rules.filter(
            (rule) =>
              rule.school === school &&
              getTimePeriod(rule[weekday.column]) === period
          );

          const studentCount = students.filter((student) => {
            if (student.school !== school) {
              return false;
            }

            const gradeGroup =
              GRADE_GROUP_MAP[student.current_grade];

            const matchingRule = rules.find(
              (rule) =>
                rule.school === school &&
                rule.grade_group === gradeGroup
            );

            if (!matchingRule) {
              return false;
            }

            return (
              getStudentFinalPeriod(
                student,
                weekday,
                matchingRule
              ) === period
            );
          }).length;

          const matchingRows = scheduleRows.filter(
            (row) =>
              row.school === school &&
              row.weekday === weekday.value &&
              getTimePeriod(row.pickup_time) === period
          );

          const teacherNames = Array.from(
            new Set(
              matchingRows.flatMap((row) =>
                getStaffNames(row)
              )
            )
          );

          const times = Array.from(
            new Set(
              matchingRows.map((row) =>
                normalizeTime(row.pickup_time)
              )
            )
          ).sort();

          result.set(
            `${weekday.value}|${period}|${school}`,
            {
              studentCount,
              teacherNames,
              times,
              hasSchedule: matchingRules.length > 0,
            }
          );
        });
      });
    });

    return result;
  }, [rules, students, scheduleRows, staffRules, schools, studentWeeklyRules]);

  function getSummaryCell(weekday, period, school) {
    return (
      summaryCells.get(
        `${weekday}|${period}|${school}`
      ) ?? {
        studentCount: 0,
        teacherNames: [],
        times: [],
        hasSchedule: false,
      }
    );
  }

  function getPeriodTimes(weekday, period) {
    return Array.from(
      new Set(
        schools.flatMap((school) =>
          getSummaryCell(
            weekday,
            period,
            school
          ).times
        )
      )
    ).sort();
  }

  async function exportStaffSchedulePdf() {
    const pageElement = document.querySelector(
      "[data-pickup-staff-summary-pdf]"
    );

    if (!pageElement) {
      setErrorMessage("找不到可輸出的接車老師週安排總表。");
      return;
    }

    setIsExporting(true);
    setErrorMessage("");

    try {
      await document.fonts?.ready;

      const canvas = await html2canvas(pageElement, {
        scale: 2.5,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width: 1122,
        height: 794,
        windowWidth: 1122,
        windowHeight: 794,
      });

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        pdf.internal.pageSize.getWidth(),
        pdf.internal.pageSize.getHeight(),
        undefined,
        "FAST"
      );

      pdf.save("接車老師週安排總表.pdf");
    } catch (error) {
      console.error("輸出接車老師週安排總表失敗：", error);

      setErrorMessage(
        `輸出 PDF 失敗：${error?.message || "請稍後再試"}`
      );
    } finally {
      setIsExporting(false);
    }
  }

  function renderPdfSummarySheet() {
    const periods = [
      {
        value: "NOON",
        label: "中午",
        time: "12:20",
      },
      {
        value: "AFTERNOON",
        label: "下午",
        time: "15:30",
      },
    ];

    return (
      <div
        data-pickup-staff-summary-pdf
        style={{
          boxSizing: "border-box",
          width: "1122px",
          height: "794px",
          padding: "28px 34px 24px",
          background: "#ffffff",
          color: "#2f2f2f",
          fontFamily:
            '"Iansui", "Noto Sans TC", sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "20px",
            paddingBottom: "12px",
            marginBottom: "16px",
            borderBottom: "1px solid #8d8d88",
          }}
        >
          <div>
            <div
              style={{
                marginBottom: "4px",
                color: "#77736c",
                fontSize: "10px",
                letterSpacing: "1.7px",
              }}
            >
              BEAST ACADEMY｜WEEKLY PICKUP STAFF
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                lineHeight: 1.15,
                fontWeight: 700,
              }}
            >
              接車老師週安排總表
            </h1>
          </div>

          <div
            style={{
              color: "#6f6c66",
              fontSize: "10px",
              lineHeight: 1.5,
              textAlign: "right",
            }}
          >
            週一至週五｜中午 12:20・下午 15:30
            <br />
            僅顯示學校與接車老師
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "16px",
          }}
        >
          {periods.map((period) => (
            <section
              key={period.value}
              style={{
                border: "1px solid #b9b7b1",
                borderRadius: "9px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "8px",
                  padding: "8px 12px",
                  background: "#f3f1ec",
                  borderBottom: "1px solid #c8c5be",
                }}
              >
                <strong
                  style={{
                    fontSize: "15px",
                  }}
                >
                  {period.label}
                </strong>

                <span
                  style={{
                    color: "#77736c",
                    fontSize: "11px",
                  }}
                >
                  {period.time}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                }}
              >
                {WEEKDAYS.map((weekday, weekdayIndex) => (
                  <div
                    key={`${period.value}-${weekday.value}`}
                    style={{
                      minWidth: 0,
                      borderLeft:
                        weekdayIndex === 0
                          ? "none"
                          : "1px solid #d2cfc8",
                    }}
                  >
                    <div
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid #d2cfc8",
                        background: "#faf9f6",
                        fontSize: "12px",
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      {weekday.label}
                    </div>

                    {schools.map((school, schoolIndex) => {
                      const cell = getSummaryCell(
                        weekday.value,
                        period.value,
                        school
                      );

                      const teacherText =
                        cell.hasSchedule
                          ? cell.teacherNames.length > 0
                            ? cell.teacherNames.join("、")
                            : "尚未安排"
                          : "—";

                      return (
                        <div
                          key={`${period.value}-${weekday.value}-${school}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "62px minmax(0, 1fr)",
                            alignItems: "center",
                            minHeight: "31px",
                            borderTop:
                              schoolIndex === 0
                                ? "none"
                                : "1px solid #e0ddd7",
                          }}
                        >
                          <div
                            style={{
                              padding: "5px 5px",
                              color: "#5f5b55",
                              fontSize: "9.5px",
                              fontWeight: 700,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {school}
                          </div>

                          <div
                            style={{
                              minWidth: 0,
                              padding: "5px 6px",
                              borderLeft:
                                "1px solid #e0ddd7",
                              color:
                                teacherText === "尚未安排" ||
                                teacherText === "—"
                                  ? "#9a9690"
                                  : "#2f2f2f",
                              fontSize: "9.5px",
                              lineHeight: 1.35,
                              textAlign: "center",
                              whiteSpace: "normal",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {teacherText}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "12px",
            paddingTop: "7px",
            borderTop: "1px solid #d0cdc7",
            color: "#817d76",
            fontSize: "9px",
          }}
        >
          <span>倍思學院｜接車老師週安排總表</span>

          <span>
            列印日期：
            {new Intl.DateTimeFormat("zh-TW").format(
              new Date()
            )}
          </span>
        </div>
      </div>
    );
  }

  function renderSummaryTable(isPdf = false) {
    const borderColor = isPdf ? "#9a9a9a" : "#555555";
    const thinBorder = isPdf ? `0.35px solid ${borderColor}` : `1px solid ${borderColor}`;
    const strongBorder = isPdf ? `0.55px solid ${borderColor}` : `2px solid ${borderColor}`;
    const labelWidth = isPdf ? 46 : 58;

    return (
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
          fontSize: isPdf ? "10px" : "12px",
          color: "#2f2f2f",
          background: "#ffffff",
        }}
      >
        <tbody>
          <tr>
            <th
              style={{
                width: `${labelWidth}px`,
                border: strongBorder,
                padding: "5px 2px",
                textAlign: "center",
                verticalAlign: "middle",
                whiteSpace: "nowrap",
                textAlign: "center",
                verticalAlign: "middle",
              }}
            >
              星期
            </th>

            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday.value}
                colSpan={schools.length}
                style={{
                  border: strongBorder,
                  padding: "5px 2px",
                  fontWeight: 700,
                  textAlign: "center",
                  verticalAlign: "middle",
                  textAlign: "center",
                  verticalAlign: "middle",
                }}
              >
                {weekday.label}
              </th>
            ))}
          </tr>

          {["NOON", "AFTERNOON"].map(
            (period, periodIndex) => (
              <Fragment key={period}>
                <tr>
                  <th
                    style={{
                      border: strongBorder,
                      padding: "4px 2px",
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    時間
                  </th>

                  {WEEKDAYS.map((weekday) => {
                    const times = getPeriodTimes(
                      weekday.value,
                      period
                    );

                    return (
                      <th
                        key={weekday.value}
                        colSpan={schools.length}
                        style={{
                          border: strongBorder,
                          padding: "4px 2px",
                          textAlign: "center",
                          verticalAlign: "middle",
                        }}
                      >
                        {times.length > 0
                          ? times.join("／")
                          : getPeriodLabel(period)}
                      </th>
                    );
                  })}
                </tr>

                <tr>
                  <th
                    style={{
                      border: strongBorder,
                      padding: "4px 2px",
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    學校
                  </th>

                  {WEEKDAYS.flatMap((weekday) =>
                    schools.map((school) => (
                      <th
                        key={`${weekday.value}-${period}-${school}`}
                        style={{
                          border: thinBorder,
                          padding: isPdf ? "3px 0" : "4px 1px",
                          fontWeight: 600,
                          textAlign: "center",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                          wordBreak: "keep-all",
                          overflow: "hidden",
                          fontSize: isPdf ? "7px" : "12px",
                          textAlign: "center",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {school}
                      </th>
                    ))
                  )}
                </tr>

                <tr>
                  <th
                    style={{
                      border: strongBorder,
                      padding: "5px 2px",
                      textAlign: "center",
                      verticalAlign: "middle",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                      }}
                    >
                      老師
                    </span>
                  </th>

                  {WEEKDAYS.flatMap((weekday) =>
                    schools.map((school) => {
                      const cell = getSummaryCell(
                        weekday.value,
                        period,
                        school
                      );

                      return (
                        <td
                          key={`${weekday.value}-${period}-${school}-teacher`}
                          style={{
                            border: thinBorder,
                            height: isPdf ? "68px" : "76px",
                            padding: "5px 2px",
                            textAlign: "center",
                            verticalAlign: "middle",
                            lineHeight: 1.25,
                            fontSize: isPdf ? "8px" : "10px",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            overflow: "visible",
                            background: cell.hasSchedule
                              ? "#ffffff"
                              : "#f3f3f1",
                          }}
                        >
                          {cell.hasSchedule
                            ? cell.teacherNames.length > 0
                              ? cell.teacherNames.map((name) => (
                                  <div
                                    key={name}
                                    style={{
                                      lineHeight: 1.45,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {name}
                                  </div>
                                ))
                              : "尚未安排"
                            : "—"}
                        </td>
                      );
                    })
                  )}
                </tr>

                <tr>
                  <th
                    style={{
                      border: strongBorder,
                      padding: "4px 2px",
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    人數
                  </th>

                  {WEEKDAYS.flatMap((weekday) =>
                    schools.map((school) => {
                      const cell = getSummaryCell(
                        weekday.value,
                        period,
                        school
                      );

                      return (
                        <td
                          key={`${weekday.value}-${period}-${school}-count`}
                          style={{
                            border: thinBorder,
                            padding: "4px 1px",
                            textAlign: "center",
                            background: cell.hasSchedule
                              ? "#ffffff"
                              : "#f3f3f1",
                          }}
                        >
                          {cell.hasSchedule
                            ? cell.studentCount
                            : "—"}
                        </td>
                      );
                    })
                  )}
                </tr>

                {periodIndex === 0 && (
                  <tr>
                    <td
                      colSpan={
                        1 +
                        WEEKDAYS.length *
                          schools.length
                      }
                      style={{
                        height: "8px",
                        padding: 0,
                        borderLeft: strongBorder,
                        borderRight: strongBorder,
                        borderTop: strongBorder,
                        borderBottom: strongBorder,
                        background: "#ffffff",
                      }}
                    />
                  </tr>
                )}
              </Fragment>
            )
          )}
        </tbody>
      </table>
    );
  }

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">
            👩🏻‍🏫
          </span>

          <h2>正在讀取接車老師安排</h2>

          <p>請稍候一下。</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="pickupPanel pickupStaffPanel"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div className="pickupStaffHeader">
        <div>
          <p className="eyebrow">
            SEMESTER STAFF SCHEDULE
          </p>

          <h2>學期固定接車老師</h2>

          <p>
            接車時間會自動沿用接車規則，
            老師姓名可直接手動輸入多人。
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="pickupStaffRefreshButton"
            onClick={loadData}
          >
            重新整理
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="pickupStaffError">
          {errorMessage}
        </div>
      )}

      {schools.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">
            ⚙️
          </span>

          <h2>尚未建立接車規則</h2>

          <p>
            請先到「接車規則」設定學校與星期時間，
            系統才會產生可安排老師的時段。
          </p>
        </div>
      ) : (
        <div
          className="pickupStaffLayout"
          style={{
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <aside className="pickupStaffSchoolList">
            <p className="pickupStaffSchoolList__title">
              選擇學校
            </p>

            {schools.map((school) => (
              <button
                key={school}
                type="button"
                className={
                  selectedSchool === school
                    ? "pickupStaffSchoolButton active"
                    : "pickupStaffSchoolButton"
                }
                onClick={() =>
                  setSelectedSchool(school)
                }
              >
                <span>{school}</span>

                <small>
                  {
                    scheduleRows.filter(
                      (row) =>
                        row.school === school
                    ).length
                  }{" "}
                  個時段
                </small>
              </button>
            ))}
          </aside>

          <div
            className="pickupStaffSchedule"
            style={{
              minWidth: 0,
              maxWidth: "100%",
            }}
          >
            <div className="pickupStaffScheduleHeader">
              <div>
                <p className="eyebrow">
                  SELECTED SCHOOL
                </p>

                <h3>{selectedSchool}</h3>
              </div>

              <span>
                整學期固定使用
              </span>
            </div>

            <div className="pickupStaffWeekList">
              {rowsByWeekday.map(
                (weekday) => (
                  <div
                    key={weekday.value}
                    className="pickupStaffWeekCard"
                  >
                    <div className="pickupStaffWeekCard__header">
                      <strong>
                        {weekday.label}
                      </strong>

                      <span>
                        {weekday.rows.length}
                        個接車時段
                      </span>
                    </div>

                    {weekday.rows.length ===
                    0 ? (
                      <div className="pickupStaffNoSchedule">
                        本日無接車安排
                      </div>
                    ) : (
                      <div className="pickupStaffTimeList">
                        {weekday.rows.map(
                          (row) => {
                            const names =
                              getStaffNames(
                                row
                              );

                            const isSaving =
                              savingKey ===
                              row.key;

                            return (
                              <div
                                key={row.key}
                                className="pickupStaffTimeRow"
                              >
                                <div className="pickupStaffTime">
                                  <small>
                                    接車時間
                                  </small>

                                  <strong>
                                    {
                                      row.pickup_time
                                    }
                                  </strong>
                                </div>

                                <TeacherTags
                                  names={names}
                                  inputValue={
                                    teacherInputs[
                                      row.key
                                    ] ?? ""
                                  }
                                  disabled={
                                    isSaving
                                  }
                                  onInputChange={(
                                    value
                                  ) =>
                                    updateTeacherInput(
                                      row.key,
                                      value
                                    )
                                  }
                                  onAdd={() =>
                                    addTeacher(
                                      row
                                    )
                                  }
                                  onRemove={(
                                    name
                                  ) =>
                                    removeTeacher(
                                      row,
                                      name
                                    )
                                  }
                                />

                                <div className="pickupStaffSaveStatus">
                                  {isSaving
                                    ? "儲存中…"
                                    : names.length >
                                        0
                                      ? "已儲存"
                                      : "尚未安排"}
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {schools.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            marginTop: "28px",
            paddingTop: "24px",
            borderTop: "1px solid #d9d9d4",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: "16px",
              marginBottom: "14px",
            }}
          >
            <div>
              <p className="eyebrow">
                WEEKLY OVERVIEW
              </p>
              <h3 style={{ margin: "4px 0 0" }}>
                接車老師週安排總表
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <small style={{ color: "#6f746f" }}>
                人數依學生年級與接車規則自動計算
              </small>

              <button
                type="button"
                className="primaryButton"
                onClick={exportStaffSchedulePdf}
                disabled={isExporting}
              >
                {isExporting
                  ? "正在產生 PDF…"
                  : "匯出 PDF"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "block",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              maxHeight: "58vh",
              overflowX: "auto",
              overflowY: "auto",
              paddingBottom: "8px",
              border: "1px solid #deded9",
              borderRadius: "10px",
              background: "#ffffff",
              scrollbarGutter: "stable",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div
              style={{
                width: `${Math.max(
                  1500,
                  58 + WEEKDAYS.length * schools.length * 84
                )}px`,
                minWidth: `${Math.max(
                  1500,
                  58 + WEEKDAYS.length * schools.length * 84
                )}px`,
              }}
            >
              {renderSummaryTable(false)}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          left: "-20000px",
          top: 0,
          width: "1122px",
          height: "794px",
          pointerEvents: "none",
        }}
      >
        {renderPdfSummarySheet()}
      </div>
    </section>
  );
}

export default PickupStaffPanel;