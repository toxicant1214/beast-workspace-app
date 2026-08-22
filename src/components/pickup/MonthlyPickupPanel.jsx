import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "../../lib/supabase";
import { getStudentPickupDecision } from "./pickupStudentSchedule";

const WEEKDAYS = [
  { value: 1, label: "一", column: "monday_time" },
  { value: 2, label: "二", column: "tuesday_time" },
  { value: 3, label: "三", column: "wednesday_time" },
  { value: 4, label: "四", column: "thursday_time" },
  { value: 5, label: "五", column: "friday_time" },
];

const STUDENTS_PER_PDF_PAGE = 25;

const GRADE_ORDER = {
  "幼兒園": 0,
  "一年級": 1,
  "二年級": 2,
  "三年級": 3,
  "四年級": 4,
  "五年級": 5,
  "六年級": 6,
  "畢業生": 7,
};

const GRADE_GROUP_MAP = {
  "一年級": "LOW",
  "二年級": "LOW",
  "三年級": "MIDDLE",
  "四年級": "MIDDLE",
  "五年級": "HIGH",
  "六年級": "HIGH",
};

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function getMonthDays(year, month) {
  const result = [];
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();

    if (weekday === 0 || weekday === 6) continue;

    result.push({
      day,
      weekday,
      weekdayLabel: WEEKDAYS.find((item) => item.value === weekday)?.label ?? "",
      dateString: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }

  return result;
}

const PDF_GRID_COLOR = "#727272";
const PDF_STRONG_GRID_COLOR = "#4f4f4f";

const pdfDayHeaderStyle = {
  height: "32px",
  padding: "2px 0",
  textAlign: "center",
  verticalAlign: "middle",
  border: `1px solid ${PDF_GRID_COLOR}`,
  background: "#f7f7f5",
  color: "#333333",
};

function pdfFixedHeaderStyle(width) {
  return {
    ...pdfDayHeaderStyle,
    width: `${width}px`,
    padding: "2px 5px",
  };
}

function pdfTextCellStyle(width, borderTop) {
  return {
    boxSizing: "border-box",
    width: `${width}px`,
    height: "23px",
    padding: "1px 5px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "clip",
    verticalAlign: "middle",
    textAlign: "center",
    borderTop,
    borderRight: `1px solid ${PDF_GRID_COLOR}`,
    borderBottom: `1px solid ${PDF_GRID_COLOR}`,
    borderLeft: `1px solid ${PDF_GRID_COLOR}`,
    background: "#ffffff",
    color: "#2f2f2f",
  };
}

function getPdfCellBackground(className) {
  if (className.includes("pickup-noon")) return "#e4e4e2";
  if (className.includes("is-closed")) return "#f6dfdc";
  if (className.includes("is-missing")) return "#f2f2ef";
  if (className.includes("is-none")) return "#f8f8f6";
  return "#ffffff";
}

function getPdfCellColor(className) {
  if (className.includes("is-closed")) return "#a3483f";
  if (className.includes("is-missing")) return "#8a6a24";
  if (className.includes("is-none")) return "#89918d";
  return "#2f2f2f";
}

function MonthlyPickupPanel() {
  const now = new Date();

    const printDate = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [school, setSchool] = useState("ALL");

  const [students, setStudents] = useState([]);
  const [rules, setRules] = useState([]);
  const [closures, setClosures] = useState([]);
  const [dayOverrides, setDayOverrides] = useState([]);
  const [studentWeeklyRules, setStudentWeeklyRules] = useState([]);
  const [studentDateExceptions, setStudentDateExceptions] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [
      studentsResult,
      rulesResult,
      closuresResult,
      overridesResult,
      studentWeeklyResult,
      studentExceptionsResult,
    ] = await Promise.all([
      supabase
        .from("students")
        .select(
          `
            id,
            chinese_name,
            school,
            current_grade,
            primary_parent_phone,
            student_status,
            is_test
          `
        )
        .eq("student_status", "ACTIVE")
        .order("school")
        .order("current_grade")
        .order("chinese_name"),

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
        .eq("is_active", true),

      supabase
        .from("pickup_closures")
        .select(
          `
            id,
            closure_scope,
            school,
            closure_date,
            reason,
            is_active
          `
        )
        .eq("is_active", true),

      supabase
        .from("calendar_day_overrides")
        .select(
          `
            id,
            semester_id,
            override_date,
            override_type,
            title,
            notes
          `
        ),
      supabase
        .from("pickup_student_weekly_rules")
        .select("*")
        .eq("is_active", true),
      supabase
        .from("pickup_student_date_exceptions")
        .select("*")
        .eq("is_active", true),
    ]);

    if (studentsResult.error) {
      setErrorMessage(`讀取學生資料失敗：${studentsResult.error.message}`);
      setIsLoading(false);
      return;
    }

    if (rulesResult.error) {
      setErrorMessage(`讀取接車規則失敗：${rulesResult.error.message}`);
      setIsLoading(false);
      return;
    }

    if (closuresResult.error) {
      setErrorMessage(
        `讀取臨時停接安排失敗：${closuresResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (overridesResult.error) {
      setErrorMessage(
        `讀取行事曆重要日期失敗：${overridesResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (studentWeeklyResult.error) {
      setErrorMessage(
        `讀取學生固定接送設定失敗：${studentWeeklyResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (studentExceptionsResult.error) {
      setErrorMessage(
        `讀取學生單日接送例外失敗：${studentExceptionsResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    setStudents(studentsResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setClosures(closuresResult.data ?? []);
    setDayOverrides(overridesResult.data ?? []);
    setStudentWeeklyRules(studentWeeklyResult.data ?? []);
    setStudentDateExceptions(studentExceptionsResult.data ?? []);
    setIsLoading(false);
  }

  const schools = useMemo(() => {
    return Array.from(
      new Set(students.map((student) => student.school).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [students]);

  const monthDays = useMemo(
    () => getMonthDays(Number(year), Number(month)),
    [year, month]
  );

  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      if (school !== "ALL" && student.school !== school) return false;
      return true;
    });
  }, [students, school]);

  const groupedStudents = useMemo(() => {
    const groups = new Map();

    visibleStudents.forEach((student) => {
      if (!groups.has(student.school)) {
        groups.set(student.school, []);
      }

      groups.get(student.school).push(student);
    });

    return Array.from(groups.entries()).map(
      ([schoolName, schoolStudents]) => [
        schoolName,
        [...schoolStudents].sort((a, b) => {
          const gradeDifference =
            (GRADE_ORDER[a.current_grade] ?? 999) -
            (GRADE_ORDER[b.current_grade] ?? 999);

          if (gradeDifference !== 0) {
            return gradeDifference;
          }

          return (a.chinese_name || "").localeCompare(
            b.chinese_name || "",
            "zh-Hant"
          );
        }),
      ]
    );
  }, [visibleStudents]);

  const actualPickupStudents = useMemo(() => {
    return visibleStudents.filter((student) =>
      monthDays.some((day) => {
        const cell = getCell(student, day);

        return !(
          cell.className.includes("is-none") ||
          cell.className.includes("is-missing") ||
          cell.className.includes("is-closed")
        );
      })
    );
  }, [
    visibleStudents,
    monthDays,
    rules,
    closures,
    dayOverrides,
    studentWeeklyRules,
    studentDateExceptions,
  ]);

  const pdfPages = useMemo(() => {
    const pages = [];

    groupedStudents.forEach(([schoolName, schoolStudents]) => {
      for (
        let startIndex = 0;
        startIndex < schoolStudents.length;
        startIndex += STUDENTS_PER_PDF_PAGE
      ) {
        pages.push({
          schoolName,
          students: schoolStudents.slice(
            startIndex,
            startIndex + STUDENTS_PER_PDF_PAGE
          ),
          pageInSchool:
            Math.floor(startIndex / STUDENTS_PER_PDF_PAGE) + 1,
          totalPagesInSchool: Math.ceil(
            schoolStudents.length / STUDENTS_PER_PDF_PAGE
          ),
        });
      }
    });

    return pages;
  }, [groupedStudents]);

  function getRule(student) {
    const gradeGroup = GRADE_GROUP_MAP[student.current_grade];

    return rules.find(
      (rule) =>
        rule.school === student.school &&
        rule.grade_group === gradeGroup
    );
  }

  function getClosure(studentSchool, dateString) {
    const sharedDayOff = dayOverrides.find(
      (item) =>
        item.override_date === dateString &&
        (
          item.override_type === "HOLIDAY" ||
          item.override_type === "CLASSROOM_CLOSED"
        )
    );

    if (sharedDayOff) {
      return {
        reason: sharedDayOff.title || "行事曆休假",
        source: "CALENDAR",
      };
    }

    return closures.find((closure) => {
      if (closure.closure_date !== dateString) return false;

      if (closure.closure_scope === "ALL") {
        return true;
      }

      return (
        closure.closure_scope === "SCHOOL" &&
        closure.school === studentSchool
      );
    });
  }

  function getCell(student, day) {
    const closure = getClosure(student.school, day.dateString);

    if (closure) {
      return {
        text: "休",
        className: "monthlyPickupCell is-closed",
        title: closure.reason || "停接",
      };
    }

    const pickupDecision = getStudentPickupDecision({
      studentId: student.id,
      dateKey: day.dateString,
      weeklyRules: studentWeeklyRules,
      dateExceptions: studentDateExceptions,
    });

    if (!pickupDecision.shouldPickup) {
      return {
        text: "—",
        className: "monthlyPickupCell is-none",
        title:
          pickupDecision.source === "DATE_EXCEPTION"
            ? `單日例外：不接${pickupDecision.note ? `（${pickupDecision.note}）` : ""}`
            : `學生固定設定：當日不接${pickupDecision.note ? `（${pickupDecision.note}）` : ""}`,
      };
    }

    const rule = getRule(student);

    if (!rule) {
      return {
        text: "—",
        className: "monthlyPickupCell is-missing",
        title: "尚未建立接車規則",
      };
    }

    const weekday = WEEKDAYS.find(
      (item) => item.value === day.weekday
    );

    const pickupTime = normalizeTime(rule[weekday.column]);

    if (!pickupTime) {
      return {
        text: "—",
        className: "monthlyPickupCell is-none",
        title: "當日不接",
      };
    }

    if (pickupTime === "12:20") {
      return {
        text: "",
        className: "monthlyPickupCell pickup-noon",
        title: "12:20 接車",
      };
    }

    if (pickupTime === "15:30") {
      return {
        text: "",
        className: "monthlyPickupCell pickup-afternoon",
        title: "15:30 接車",
      };
    }

    return {
      text: "",
      className: "monthlyPickupCell has-time",
      title: `${pickupTime} 接車`,
    };
  }

  async function exportPickupPdf() {
    if (pdfPages.length === 0) {
      setErrorMessage("目前沒有可匯出的接車資料。");
      return;
    }

    setIsExporting(true);
    setErrorMessage("");

    try {
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // 嵌入芫荽體，讓 PDF 中文維持向量文字。
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

      // 保留原本 PDF 欄位：年級／姓名／家長電話／每個平日。
      const fixedWidths = {
        grade: 16,
        name: 23,
        phone: 31,
      };

      const fixedTotal =
        fixedWidths.grade +
        fixedWidths.name +
        fixedWidths.phone;

      const dateWidth =
        (
          contentWidth -
          fixedTotal
        ) /
        Math.max(
          monthDays.length,
          1
        );

      const tableHeaderHeight = 10;
      const rowHeight = 5.6;
      const tableTop = 30;

      const headerFill = [
        247,
        247,
        245,
      ];

      const noonFill = [
        228,
        228,
        226,
      ];

      const closedFill = [
        246,
        223,
        220,
      ];

      const missingFill = [
        242,
        242,
        239,
      ];

      const noneFill = [
        248,
        248,
        246,
      ];

      function drawCell({
        x,
        y,
        width,
        height,
        textValue = "",
        fontSize = 7.2,
        fill = null,
        textColor = [47, 47, 47],
        bold = false,
        lineWidth = 0.16,
      }) {
        if (fill) {
          pdf.setFillColor(
            fill[0],
            fill[1],
            fill[2]
          );
        }

        pdf.setDrawColor(
          114,
          114,
          114
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
          pdf.getTextWidth(
            value
          ) >
            width - 1.4 &&
          size > 5.3
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
            }
          );
        }
      }

      function getVectorCellStyle(cell) {
        const className =
          cell.className || "";

        if (
          className.includes(
            "pickup-noon"
          )
        ) {
          return {
            fill: noonFill,
            textColor: [
              47,
              47,
              47,
            ],
          };
        }

        if (
          className.includes(
            "is-closed"
          )
        ) {
          return {
            fill: closedFill,
            textColor: [
              163,
              72,
              63,
            ],
          };
        }

        if (
          className.includes(
            "is-missing"
          )
        ) {
          return {
            fill: missingFill,
            textColor: [
              138,
              106,
              36,
            ],
          };
        }

        if (
          className.includes(
            "is-none"
          )
        ) {
          return {
            fill: noneFill,
            textColor: [
              137,
              145,
              141,
            ],
          };
        }

        return {
          fill: null,
          textColor: [
            47,
            47,
            47,
          ],
        };
      }

      pdfPages.forEach(
        (
          page,
          pageIndex
        ) => {
          if (
            pageIndex > 0
          ) {
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
            119,
            119,
            119
          );

          pdf.setFontSize(
            7
          );

          pdf.text(
            "BEAST ACADEMY｜MONTHLY PICKUP ROSTER",
            marginX,
            topY + 3
          );

          pdf.setTextColor(
            47,
            47,
            47
          );

          pdf.setFontSize(
            17
          );

          pdf.text(
            `${page.schoolName}｜${year} 年 ${month} 月接車點名表`,
            marginX,
            topY + 10
          );

          pdf.setFontSize(
            7.5
          );

          pdf.setTextColor(
            85,
            85,
            85
          );

          pdf.text(
            `本頁 ${page.students.length} 位　｜　本校第 ${page.pageInSchool}／${page.totalPagesInSchool} 頁`,
            pageWidth - marginX,
            topY + 5,
            {
              align: "right",
            }
          );

          pdf.text(
            "灰色：12:20 接　｜　白色：15:30 接　｜　休：停接　｜　—：不接或尚未設定",
            pageWidth - marginX,
            topY + 10,
            {
              align: "right",
            }
          );

          pdf.setDrawColor(
            79,
            79,
            79
          );

          pdf.setLineWidth(
            0.3
          );

          pdf.line(
            marginX,
            topY + 14,
            pageWidth - marginX,
            topY + 14
          );

          // ===== 表頭 =====
          let x =
            marginX;

          drawCell({
            x,
            y: tableTop,
            width:
              fixedWidths.grade,
            height:
              tableHeaderHeight,
            textValue:
              "年級",
            fontSize: 7.4,
            fill:
              headerFill,
            bold: true,
          });

          x +=
            fixedWidths.grade;

          drawCell({
            x,
            y: tableTop,
            width:
              fixedWidths.name,
            height:
              tableHeaderHeight,
            textValue:
              "姓名",
            fontSize: 7.4,
            fill:
              headerFill,
            bold: true,
          });

          x +=
            fixedWidths.name;

          drawCell({
            x,
            y: tableTop,
            width:
              fixedWidths.phone,
            height:
              tableHeaderHeight,
            textValue:
              "家長電話",
            fontSize: 7.4,
            fill:
              headerFill,
            bold: true,
          });

          x +=
            fixedWidths.phone;

          monthDays.forEach(
            (day) => {
              drawCell({
                x,
                y: tableTop,
                width:
                  dateWidth,
                height:
                  tableHeaderHeight,
                textValue:
                  `${day.day}/${day.weekdayLabel}`,
                fontSize:
                  monthDays.length >=
                  22
                    ? 6.2
                    : 6.7,
                fill:
                  headerFill,
                bold: true,
              });

              x +=
                dateWidth;
            }
          );

          // ===== 學生列 =====
          page.students.forEach(
            (
              student,
              index
            ) => {
              const y =
                tableTop +
                tableHeaderHeight +
                index *
                  rowHeight;

              const previousStudent =
                page.students[
                  index - 1
                ];

              const isNewGrade =
                index > 0 &&
                previousStudent
                  ?.current_grade !==
                  student.current_grade;

              const borderWidth = 0.16;

              let cellX =
                marginX;

              drawCell({
                x: cellX,
                y,
                width:
                  fixedWidths.grade,
                height:
                  rowHeight,
                textValue:
                  student.current_grade,
                fontSize: 7.1,
                lineWidth:
                  borderWidth,
              });

              cellX +=
                fixedWidths.grade;

              drawCell({
                x: cellX,
                y,
                width:
                  fixedWidths.name,
                height:
                  rowHeight,
                textValue:
                  student.chinese_name,
                fontSize: 8.2,
                bold: true,
                lineWidth:
                  borderWidth,
              });

              cellX +=
                fixedWidths.name;

              drawCell({
                x: cellX,
                y,
                width:
                  fixedWidths.phone,
                height:
                  rowHeight,
                textValue:
                  student.primary_parent_phone ||
                  "—",
                fontSize: 7.2,
                lineWidth:
                  borderWidth,
              });

              cellX +=
                fixedWidths.phone;

              monthDays.forEach(
                (day) => {
                  const cell =
                    getCell(
                      student,
                      day
                    );

                  const style =
                    getVectorCellStyle(
                      cell
                    );

                  drawCell({
                    x: cellX,
                    y,
                    width:
                      dateWidth,
                    height:
                      rowHeight,
                    textValue:
                      cell.text,
                    fontSize: 7,
                    fill:
                      style.fill,
                    textColor:
                      style.textColor,
                    bold:
                      Boolean(
                        cell.text
                      ),
                    lineWidth:
                      borderWidth,
                  });

                  cellX +=
                    dateWidth;
                }
              );
            }
          );

          // ===== 頁尾 =====
          const tableBottom =
            tableTop +
            tableHeaderHeight +
            page.students.length *
              rowHeight;

          pdf.setDrawColor(
            114,
            114,
            114
          );

          pdf.setLineWidth(
            0.16
          );

          pdf.line(
            marginX,
            tableBottom + 3,
            pageWidth - marginX,
            tableBottom + 3
          );

          pdf.setFontSize(
            6.6
          );

          pdf.setTextColor(
            102,
            102,
            102
          );

          pdf.text(
            "倍思學院｜接車點名表",
            marginX,
            tableBottom + 7
          );

          pdf.text(
            `列印日期：${printDate}　｜　PDF 第 ${pageIndex + 1}／${pdfPages.length} 頁`,
            pageWidth - marginX,
            tableBottom + 7,
            {
              align: "right",
            }
          );
        }
      );

      const safeSchoolName =
        school === "ALL"
          ? "各校"
          : school.replace(
              /[\/:*?"<>|]/g,
              ""
            );

      pdf.save(
        `${year}年${month}月_${safeSchoolName}_接車點名表.pdf`
      );
    } catch (error) {
      console.error(
        "產生接車點名表 PDF 失敗：",
        error
      );

      setErrorMessage(
        `產生 PDF 失敗：${
          error?.message ||
          "請稍後再試"
        }`
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">🗓️</span>
          <h2>正在產生月接車表</h2>
          <p>系統正在讀取學生資料與接車規則。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="pickupPanel monthlyPickupPanel">
        <div className="monthlyPickupPrintHeader">
  <h1>
    {school === "ALL" ? "各校" : school}
    {year} 年 {month} 月接車點名表
  </h1>

  <p>
    灰色：12:20 接車　｜　白色：15:30 接車　｜　休：停接　｜　—：不接或尚未設定
  </p>
</div>
<div className="monthlyPickupPrintFooter">
  <span>倍思學院｜接車點名表</span>
  <span>列印日期：{printDate}</span>
</div>
      <div className="monthlyPickupToolbar">
        <div>
          <p className="eyebrow">MONTHLY PICKUP ROSTER</p>
          <h2>月接車表</h2>
          <p>
            依學生學校、目前年級與固定接車規則，自動產生每個平日的接車時間。
          </p>
        </div>

        <div className="monthlyPickupFilters">
          <label>
            <span>年份</span>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {[year - 1, year, year + 1].map((item) => (
                <option key={item} value={item}>
                  {item} 年
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>月份</span>
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map(
                (item) => (
                  <option key={item} value={item}>
                    {item} 月
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span>學校</span>
            <select
              value={school}
              onChange={(event) => setSchool(event.target.value)}
            >
              <option value="ALL">全部學校</option>
              {schools.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="monthlyPickupActions">
  <button
    type="button"
    className="secondaryButton"
    onClick={loadData}
  >
    重新整理
  </button>

  <button
    type="button"
    className="primaryButton"
    onClick={exportPickupPdf}
    disabled={isExporting}
  >
    {isExporting ? "正在產生 PDF…" : "下載接車點名表 PDF"}
  </button>
</div>
        </div>
      </div>

      {errorMessage && (
        <div className="pickupErrorMessage">{errorMessage}</div>
      )}

      <div className="monthlyPickupSummary">

  <div className="summaryCard">
    <div className="summaryCardIcon">👧🏻</div>

    <div>
      <h3>{actualPickupStudents.length}</h3>
      <p>位本月有接送學生</p>
    </div>
  </div>

  <div className="summaryCard">
    <div className="summaryCardIcon">🏫</div>

    <div>
      <h3>{groupedStudents.length}</h3>
      <p>所學校</p>
    </div>
  </div>

  <div className="summaryCard">
    <div className="summaryCardIcon">📅</div>

    <div>
      <h3>{monthDays.length}</h3>
      <p>個平日</p>
    </div>
  </div>

</div>

      <div className="monthlyPickupLegend" aria-label="月接車表圖例">
        <span>
          <i className="legendBox legendBox--noon" aria-hidden="true" />
          12:20 接
        </span>

        <span>
          <i
            className="legendBox legendBox--afternoon"
            aria-hidden="true"
          />
          15:30 接
        </span>

        <span>
          <i className="legendBox legendBox--missing" aria-hidden="true">
            —
          </i>
          尚未設定規則
        </span>

        <span>
          <i className="legendBox legendBox--closed" aria-hidden="true">
            休
          </i>
          停接
        </span>
      </div>

      {groupedStudents.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">👧🏻</span>
          <h2>目前沒有符合條件的學生</h2>
          <p>請確認學生狀態、學校篩選或匯入資料。</p>
        </div>
      ) : (
        <div className="monthlyPickupSchoolGroups">
          {groupedStudents.map(([schoolName, schoolStudents]) => (
            <div key={schoolName} className="monthlyPickupSchoolGroup">
              <div className="monthlyPickupSchoolHeader">
  <div className="monthlyPickupSchoolTitle">
    <span className="monthlyPickupSchoolIcon">🏫</span>

    <div>
      <h3>{schoolName}</h3>
      <p>{year} 年 {month} 月接車安排</p>
    </div>
  </div>

  <span className="monthlyPickupSchoolCount">
    {schoolStudents.length} 位學生
  </span>
</div>

              <div className="monthlyPickupTableWrap">
                <table className="monthlyPickupTable">
                  <thead>
                    <tr>
                      <th className="gradeColumn">年級</th>
<th className="studentColumn">姓名</th>
<th className="phoneColumn">家長電話</th>

                      {monthDays.map((day) => {
  const isWeekStart = day.weekday === 1 && day.day !== 1;

  return (
    <th
      key={day.dateString}
      title={day.dateString}
      className={isWeekStart ? "weekStartColumn" : ""}
    >
      <strong>{day.day}</strong>
      <span>{day.weekdayLabel}</span>
    </th>
  );
})}
                    </tr>
                  </thead>

                  <tbody>
                    {schoolStudents.map((student, index) => {
  const previousStudent = schoolStudents[index - 1];

  const isNewGrade =
    index > 0 &&
    previousStudent?.current_grade !== student.current_grade;

  return (
    <tr
      key={student.id}
      className={isNewGrade ? "gradeDividerRow" : ""}
    >
                        <td className="gradeColumn">
  {student.current_grade}
</td>

<td className="studentColumn">
  <strong>{student.chinese_name}</strong>
  {student.is_test && <small>測試</small>}
</td>

<td className="phoneColumn">
  {student.primary_parent_phone || "—"}
</td>

                        {monthDays.map((day) => {
  const cell = getCell(student, day);
  const isWeekStart = day.weekday === 1 && day.day !== 1;

  const cellClassName = [
    cell.className,
    isWeekStart ? "weekStartColumn" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td
      key={day.dateString}
      className={cellClassName}
      title={cell.title}
    >
      {cell.text}
    </td>
  );
})}
                      </tr>
    );
  })}
</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-20000px",
          top: 0,
          width: "1122px",
          pointerEvents: "none",
          opacity: 1,
        }}
      >
        {pdfPages.map((page, pageIndex) => (
          <div
            key={`${page.schoolName}-${page.pageInSchool}`}
            data-pickup-pdf-page
            style={{
              boxSizing: "border-box",
              width: "1122px",
              height: "794px",
              padding: "20px 24px 16px",
              overflow: "hidden",
              background: "#ffffff",
              color: "#2f2f2f",
              fontFamily:
                '"Iansui", "芫荽", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "16px",
                padding: "0 0 10px",
                borderBottom: `1px solid ${PDF_STRONG_GRID_COLOR}`,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    letterSpacing: "1.8px",
                    color: "#777777",
                    marginBottom: "4px",
                  }}
                >
                  BEAST ACADEMY｜MONTHLY PICKUP ROSTER
                </div>
                <div
                  style={{
                    fontSize: "25px",
                    lineHeight: 1.12,
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                  }}
                >
                  {page.schoolName}｜{year} 年 {month} 月接車點名表
                </div>
              </div>

              <div
                style={{
                  minWidth: "140px",
                  padding: "6px 10px",
                  border: `1px solid ${PDF_GRID_COLOR}`,
                  borderRadius: "8px",
                  background: "#ffffff",
                  textAlign: "right",
                  fontSize: "10px",
                  lineHeight: 1.5,
                  color: "#555555",
                  whiteSpace: "nowrap",
                }}
              >
                <div>每頁最多 {STUDENTS_PER_PDF_PAGE} 位學生</div>
                <div>
                  本校第 {page.pageInSchool}／{page.totalPagesInSchool} 頁
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                margin: "7px 0",
                padding: "4px 0",
                borderRadius: 0,
                background: "#ffffff",
                fontSize: "9px",
                color: "#555555",
              }}
            >
              <div>
                灰色：12:20 接　｜　白色：15:30 接　｜　休：停接　｜　—：不接或尚未設定
              </div>
              <div style={{ whiteSpace: "nowrap" }}>
                本頁 {page.students.length} 位
              </div>
            </div>

            <table
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "collapse",
                borderSpacing: 0,
                border: `1px solid ${PDF_GRID_COLOR}`,
                background: "#ffffff",
                fontSize: "10px",
              }}
            >
              <thead>
                <tr>
                  <th style={pdfFixedHeaderStyle(60)}>年級</th>
                  <th style={pdfFixedHeaderStyle(92)}>姓名</th>
                  <th style={pdfFixedHeaderStyle(122)}>家長電話</th>
                  {monthDays.map((day) => (
                    <th
                      key={day.dateString}
                      style={{
                        ...pdfDayHeaderStyle,
                        borderLeft: `1px solid ${PDF_GRID_COLOR}`,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "10px" }}>
                        {day.day}
                      </div>
                      <div style={{ fontSize: "8px", color: "#778078" }}>
                        {day.weekdayLabel}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {page.students.map((student, index) => {
                  const previousStudent = page.students[index - 1];
                  const isNewGrade =
                    index > 0 &&
                    previousStudent?.current_grade !== student.current_grade;
                  const rowTopBorder = `1px solid ${PDF_GRID_COLOR}`;

                  return (
                    <tr key={student.id} style={{ height: "23px" }}>
                      <td style={pdfTextCellStyle(60, rowTopBorder)}>
                        {student.current_grade}
                      </td>
                      <td
                        style={{
                          ...pdfTextCellStyle(92, rowTopBorder),
                          fontWeight: 700,
                        }}
                      >
                        {student.chinese_name}
                      </td>
                      <td
                        style={{
                          ...pdfTextCellStyle(122, rowTopBorder),
                          fontSize: "9px",
                          letterSpacing: "0.1px",
                        }}
                      >
                        {student.primary_parent_phone || "—"}
                      </td>

                      {monthDays.map((day) => {
                        const cell = getCell(student, day);
                        const isWeekStart =
                          day.weekday === 1 && day.day !== 1;

                        return (
                          <td
                            key={day.dateString}
                            style={{
                              height: "23px",
                              padding: 0,
                              textAlign: "center",
                              verticalAlign: "middle",
                              fontWeight: 700,
                              borderTop: rowTopBorder,
                              borderRight: `1px solid ${PDF_GRID_COLOR}`,
                              borderBottom: `1px solid ${PDF_GRID_COLOR}`,
                              borderLeft: `1px solid ${PDF_GRID_COLOR}`,
                              background: getPdfCellBackground(cell.className),
                              color: getPdfCellColor(cell.className),
                            }}
                          >
                            {cell.text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "6px",
                padding: "5px 0 0",
                borderTop: `1px solid ${PDF_GRID_COLOR}`,
                fontSize: "8px",
                letterSpacing: "0.2px",
                color: "#666666",
              }}
            >
              <span>倍思學院｜接車點名表</span>
              <span>
                列印日期：{printDate}　｜　PDF 第 {pageIndex + 1}／
                {pdfPages.length} 頁
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default MonthlyPickupPanel;