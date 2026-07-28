import { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { supabase } from "../../lib/supabase";

const WEEKDAYS = [
  { value: 1, label: "一", column: "monday_time" },
  { value: 2, label: "二", column: "tuesday_time" },
  { value: 3, label: "三", column: "wednesday_time" },
  { value: 4, label: "四", column: "thursday_time" },
  { value: 5, label: "五", column: "friday_time" },
];

const STUDENTS_PER_PDF_PAGE = 30;

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

const pdfDayHeaderStyle = {
  height: "34px",
  padding: "2px 0",
  textAlign: "center",
  verticalAlign: "middle",
  borderTop: "1px solid #8fa097",
  borderRight: "1px solid #aebbb5",
  borderBottom: "1px solid #8fa097",
  background: "#eef2ef",
};

function pdfFixedHeaderStyle(width) {
  return {
    ...pdfDayHeaderStyle,
    width: `${width}px`,
    padding: "2px 4px",
    borderLeft: "1px solid #8fa097",
  };
}

function pdfTextCellStyle(width, borderTop) {
  return {
    boxSizing: "border-box",
    width: `${width}px`,
    height: "19px",
    padding: "1px 4px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    verticalAlign: "middle",
    borderTop,
    borderRight: "1px solid #bdc7c2",
    borderBottom: "1px solid #bdc7c2",
    borderLeft: "1px solid #bdc7c2",
    background: "#ffffff",
  };
}

function getPdfCellBackground(className) {
  if (className.includes("pickup-noon")) return "#d7ddd9";
  if (className.includes("is-closed")) return "#f2d8d5";
  if (className.includes("is-missing")) return "#f6ead0";
  if (className.includes("is-none")) return "#f5f5f5";
  return "#ffffff";
}

function getPdfCellColor(className) {
  if (className.includes("is-closed")) return "#a3483f";
  if (className.includes("is-missing")) return "#8a6a24";
  if (className.includes("is-none")) return "#89918d";
  return "#26332d";
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

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [studentsResult, rulesResult, closuresResult] = await Promise.all([
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

    // 如果停接表尚未建立或欄位名稱不同，不阻擋月表第一版
    if (closuresResult.error) {
      console.warn("讀取停接安排失敗：", closuresResult.error);
    }

    setStudents(studentsResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setClosures(closuresResult.data ?? []);
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

    return Array.from(groups.entries());
  }, [visibleStudents]);

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

    if (pickupTime === "12:50") {
      return {
        text: "",
        className: "monthlyPickupCell pickup-noon",
        title: "12:50 接車",
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
    const pageElements = Array.from(
      document.querySelectorAll("[data-pickup-pdf-page]")
    );

    if (pageElements.length === 0) {
      setErrorMessage("目前沒有可匯出的接車資料。");
      return;
    }

    setIsExporting(true);
    setErrorMessage("");

    try {
      await document.fonts?.ready;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let index = 0; index < pageElements.length; index += 1) {
        const canvas = await html2canvas(pageElements[index], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          width: 1122,
          height: 794,
          windowWidth: 1122,
          windowHeight: 794,
        });

        if (index > 0) {
          pdf.addPage("a4", "landscape");
        }

        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.94),
          "JPEG",
          0,
          0,
          pageWidth,
          pageHeight,
          undefined,
          "FAST"
        );
      }

      const safeSchoolName =
        school === "ALL"
          ? "各校"
          : school.replace(/[\/:*?"<>|]/g, "");

      pdf.save(`${year}年${month}月_${safeSchoolName}_接車點名表.pdf`);
    } catch (error) {
      console.error("產生接車點名表 PDF 失敗：", error);
      setErrorMessage(
        `產生 PDF 失敗：${error?.message || "請稍後再試"}`
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
    灰色：12:50 接車　｜　白色：15:30 接車　｜　休：停接　｜　—：不接或尚未設定
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
      <h3>{visibleStudents.length}</h3>
      <p>位在學學生</p>
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
          12:50 接
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
              padding: "24px 28px 18px",
              overflow: "hidden",
              background: "#ffffff",
              color: "#26332d",
              fontFamily:
                '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "16px",
                paddingBottom: "10px",
                borderBottom: "2px solid #60776c",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    letterSpacing: "1.4px",
                    color: "#77877f",
                    marginBottom: "3px",
                  }}
                >
                  BEAST ACADEMY｜MONTHLY PICKUP ROSTER
                </div>
                <div
                  style={{
                    fontSize: "25px",
                    lineHeight: 1.15,
                    fontWeight: 800,
                  }}
                >
                  {page.schoolName}｜{year} 年 {month} 月接車點名表
                </div>
              </div>

              <div
                style={{
                  textAlign: "right",
                  fontSize: "12px",
                  lineHeight: 1.55,
                  color: "#637169",
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
                padding: "8px 0",
                fontSize: "11px",
                color: "#536159",
              }}
            >
              <div>
                灰色：12:50 接　｜　白色：15:30 接　｜　休：停接　｜　—：不接或尚未設定
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
                fontSize: "10px",
              }}
            >
              <thead>
                <tr>
                  <th style={pdfFixedHeaderStyle(58)}>年級</th>
                  <th style={pdfFixedHeaderStyle(70)}>姓名</th>
                  <th style={pdfFixedHeaderStyle(108)}>家長電話</th>
                  {monthDays.map((day) => (
                    <th
                      key={day.dateString}
                      style={{
                        ...pdfDayHeaderStyle,
                        borderLeft:
                          day.weekday === 1 && day.day !== 1
                            ? "2px solid #7f9188"
                            : "1px solid #aebbb5",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "10px" }}>
                        {day.day}
                      </div>
                      <div style={{ fontSize: "8px", color: "#66756d" }}>
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
                  const rowTopBorder = isNewGrade
                    ? "2px solid #7f9188"
                    : "1px solid #bdc7c2";

                  return (
                    <tr key={student.id} style={{ height: "19px" }}>
                      <td style={pdfTextCellStyle(58, rowTopBorder)}>
                        {student.current_grade}
                      </td>
                      <td
                        style={{
                          ...pdfTextCellStyle(70, rowTopBorder),
                          fontWeight: 700,
                        }}
                      >
                        {student.chinese_name}
                        {student.is_test ? "（測）" : ""}
                      </td>
                      <td style={pdfTextCellStyle(108, rowTopBorder)}>
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
                              height: "19px",
                              padding: 0,
                              textAlign: "center",
                              verticalAlign: "middle",
                              fontWeight: 700,
                              borderTop: rowTopBorder,
                              borderRight: "1px solid #bdc7c2",
                              borderBottom: "1px solid #bdc7c2",
                              borderLeft: isWeekStart
                                ? "2px solid #7f9188"
                                : "1px solid #bdc7c2",
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
                marginTop: "8px",
                paddingTop: "6px",
                borderTop: "1px solid #c8d0cc",
                fontSize: "10px",
                color: "#6c7972",
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