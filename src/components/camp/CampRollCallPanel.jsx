import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { supabase } from "../../lib/supabase";

const GRADE_OPTIONS = [
  { value: "K", label: "幼兒園" },
  { value: "G1", label: "一年級" },
  { value: "G2", label: "二年級" },
  { value: "G3", label: "三年級" },
  { value: "G4", label: "四年級" },
  { value: "G5", label: "五年級" },
  { value: "G6", label: "六年級" },
  { value: "GRADUATED", label: "畢業生" },
];

const GRADE_ORDER = GRADE_OPTIONS.reduce(
  (result, item, index) => ({ ...result, [item.value]: index }),
  {}
);


const A4_WIDTH = 1684;
const A4_HEIGHT = 1191;
const A4_HORIZONTAL_PADDING = 52;
const A4_TABLE_WIDTH =
  A4_WIDTH - A4_HORIZONTAL_PADDING * 2;

const MAX_A4_STUDENTS = 26;

const FIXED_COLUMN_WIDTHS = {
  number: 48,
  grade: 68,
  chineseName: 104,
  englishName: 98,
  phone: 138,
};

const FIXED_COLUMNS_TOTAL =
  FIXED_COLUMN_WIDTHS.number +
  FIXED_COLUMN_WIDTHS.grade +
  FIXED_COLUMN_WIDTHS.chineseName +
  FIXED_COLUMN_WIDTHS.englishName +
  FIXED_COLUMN_WIDTHS.phone;

function getGradeLabel(value) {
  return GRADE_OPTIONS.find((item) => item.value === value)?.label || value || "—";
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = String(dateString).split("-");
  return `${year}/${month}/${day}`;
}

function formatShortDate(dateString) {
  if (!dateString) return "";
  const [, month, day] = String(dateString).split("-");
  return `${month}/${day}`;
}

function getWeekday(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()] || "";
}

function isWeekday(dateString) {
  if (!dateString) return false;
  const date = new Date(`${dateString}T00:00:00`);
  const weekday = date.getDay();
  return weekday >= 1 && weekday <= 5;
}

function normalizeType(value) {
  return String(value || "").trim().toUpperCase();
}

function getAttendanceMark(record, dayMeta) {
  if (!record) return "/";

  const status = normalizeType(
    record.attendance_status
  );

  if (status === "ABSENT") return "/";
  if (status === "LEAVE") return "假";

  if (
    status === "OUTDOOR" ||
    status === "FIELD_TRIP"
  ) {
    return "出";
  }

  const overnightMode =
    normalizeType(
      record.overnight_mode
    );

  if (
    overnightMode === "JOIN" ||
    overnightMode.includes("OVERNIGHT") ||
    overnightMode.includes("STAY")
  ) {
    return "兩天一夜";
  }

  const parts = [];

  if (record.morning) parts.push("上");
  if (record.afternoon) parts.push("下");
  if (record.meal) parts.push("餐");
  if (record.talent) parts.push("才");

  const isRegularFullDay =
    record.morning &&
    record.afternoon &&
    record.meal &&
    !record.talent;

  if (isRegularFullDay) return "";

  if (parts.length > 0) {
    return parts.join("+");
  }

  return "";
}

function safeFileName(value) {
  return String(value || "點名表")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function CampRollCallPanel({ camp, onBack }) {
  const previewRef = useRef(null);
  const previewViewportRef = useRef(null);

  const [previewScale, setPreviewScale] = useState(1);

  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [classAssignments, setClassAssignments] = useState([]);
  const [periodDates, setPeriodDates] = useState([]);
  const [dayMetaRows, setDayMetaRows] = useState([]);
  const [dailyRecords, setDailyRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedPeriod = useMemo(
    () => periods.find((item) => item.id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  useEffect(() => {
    loadInitialData();
  }, [camp.id]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setClasses([]);
      setSelectedClassId("");
      setPeriodDates([]);
      setDayMetaRows([]);
      setDailyRecords([]);
      return;
    }

    loadPeriodData(selectedPeriodId);
  }, [selectedPeriodId]);


  useEffect(() => {
    const element =
      previewViewportRef.current;

    if (!element) return undefined;

    function updateScale() {
      const availableWidth =
        element.clientWidth;

      if (!availableWidth) return;

      setPreviewScale(
        Math.min(
          1,
          availableWidth /
            A4_WIDTH
        )
      );
    }

    updateScale();

    const observer =
      new ResizeObserver(
        updateScale
      );

    observer.observe(
      element
    );

    return () => {
      observer.disconnect();
    };
  }, [
    selectedPeriodId,
    selectedClassId,
    periodDates.length,
  ]);

  async function loadInitialData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [periodResult, studentResult] = await Promise.all([
        supabase
          .from("camp_periods")
          .select("id, camp_id, name, start_date, end_date, sort_order")
          .eq("camp_id", camp.id)
          .order("sort_order", { ascending: true })
          .order("start_date", { ascending: true }),

        supabase
          .from("camp_students")
          .select("id, camp_id, chinese_name, english_name, grade, parent_phone")
          .eq("camp_id", camp.id),
      ]);

      if (periodResult.error) throw periodResult.error;
      if (studentResult.error) throw studentResult.error;

      const nextPeriods = periodResult.data ?? [];
      setPeriods(nextPeriods);
      setStudents(studentResult.data ?? []);

      if (nextPeriods.length > 0) setSelectedPeriodId(nextPeriods[0].id);
    } catch (error) {
      console.error("讀取點名表基本資料失敗：", error);
      setErrorMessage(`讀取點名表資料失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPeriodData(periodId) {
    try {
      setIsLoadingPeriod(true);
      setErrorMessage("");

      const [
        classResult,
        assignmentResult,
        periodDateResult,
        recordResult,
      ] = await Promise.all([
        supabase
          .from("camp_classes")
          .select("id, camp_id, period_id, name, sort_order")
          .eq("camp_id", camp.id)
          .eq("period_id", periodId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),

        supabase
          .from("camp_class_students")
          .select("id, camp_id, period_id, class_id, student_id")
          .eq("camp_id", camp.id)
          .eq("period_id", periodId),

        supabase
          .from("camp_period_dates")
          .select("id, camp_date, day_type, note")
          .eq("camp_id", camp.id)
          .eq("period_id", periodId)
          .order("camp_date", { ascending: true }),

        supabase
          .from("camp_student_daily_records")
          .select(`
            id,
            camp_id,
            camp_date_id,
            student_id,
            attendance_status,
            morning,
            afternoon,
            meal,
            talent,
            overnight_mode,
            leave_type,
            is_late_registration,
            note,
            camp_dates (
              id,
              camp_date
            )
          `)
          .eq("camp_id", camp.id),
      ]);

      if (classResult.error) throw classResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      if (periodDateResult.error) throw periodDateResult.error;
      if (recordResult.error) throw recordResult.error;

      const nextClasses = classResult.data ?? [];

      const nextDayMetaRows =
        (periodDateResult.data ?? [])
          .filter((row) => row.camp_date)
          .filter((row) => isWeekday(row.camp_date));

      const nextPeriodDates =
        nextDayMetaRows.map(
          (row) => row.camp_date
        );

      const dateSet =
        new Set(nextPeriodDates);

      setClasses(nextClasses);
      setClassAssignments(assignmentResult.data ?? []);
      setPeriodDates(nextPeriodDates);
      setDayMetaRows(nextDayMetaRows);
      setDailyRecords(
        (recordResult.data ?? []).filter((row) => {
          const dateKey = row.camp_dates?.camp_date;
          return dateKey && dateSet.has(dateKey);
        })
      );

      setSelectedClassId((current) => {
        if (current && nextClasses.some((item) => item.id === current)) return current;
        return nextClasses[0]?.id || "";
      });
    } catch (error) {
      console.error("讀取梯次點名表資料失敗：", error);
      setErrorMessage(`讀取梯次點名表資料失敗：${error.message}`);
    } finally {
      setIsLoadingPeriod(false);
    }
  }

  const dayMetaByDate = useMemo(() => {
    const map = new Map();
    for (const row of dayMetaRows) map.set(row.camp_date, row);
    return map;
  }, [dayMetaRows]);

  const recordByStudentDate = useMemo(() => {
    const map = new Map();
    for (const row of dailyRecords) {
      const dateKey = row.camp_dates?.camp_date;
      if (dateKey) map.set(`${row.student_id}__${dateKey}`, row);
    }
    return map;
  }, [dailyRecords]);

  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];

    const studentIds = new Set(
      classAssignments
        .filter((row) => row.class_id === selectedClassId)
        .map((row) => row.student_id)
    );

    return students
      .filter((student) => studentIds.has(student.id))
      .sort((a, b) => {
        const gradeDiff =
          (GRADE_ORDER[a.grade] ?? 999) -
          (GRADE_ORDER[b.grade] ?? 999);
        if (gradeDiff !== 0) return gradeDiff;
        return String(a.chinese_name || "").localeCompare(
          String(b.chinese_name || ""),
          "zh-Hant"
        );
      });
  }, [students, classAssignments, selectedClassId]);

  const dateColumnWidth =
    useMemo(() => {
      const dateCount =
        Math.max(
          periodDates.length,
          1
        );

      return Math.floor(
        (
          A4_TABLE_WIDTH -
          FIXED_COLUMNS_TOTAL
        ) /
          dateCount
      );
    }, [
      periodDates.length,
    ]);

  const studentRowHeight =
    useMemo(() => {
      if (
        classStudents.length >=
        24
      ) {
        return 27;
      }

      if (
        classStudents.length >=
        20
      ) {
        return 29;
      }

      return 32;
    }, [
      classStudents.length,
    ]);

  const hasTooManyStudents =
    classStudents.length >
    MAX_A4_STUDENTS;

  async function exportPng() {
    if (!previewRef.current || !selectedPeriod || !selectedClass) return;

    try {
      setIsExporting(true);
      setErrorMessage("");
      if (document.fonts?.ready) await document.fonts.ready;

      const dataUrl = await toPng(previewRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        width: A4_WIDTH,
        height: A4_HEIGHT,
        backgroundColor: "#fffdf8",
      });

      const link = document.createElement("a");
      link.download = safeFileName(
        `${camp.name}_${selectedPeriod.name}_${selectedClass.name}_點名表.png`
      );
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("匯出點名表 PNG 失敗：", error);
      setErrorMessage(`匯出圖檔失敗：${error.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="campPage">
        <div className="campEmptyState">正在讀取點名表資料……</div>
      </div>
    );
  }

  return (
    <div className="campPage">
      <button type="button" className="campBackButton" onClick={onBack}>
        ← 返回營隊資料夾
      </button>

      <header className="campPage__header" style={{ marginTop: "24px", alignItems: "flex-end" }}>
        <div>
          <p className="campEyebrow">ROLL CALL</p>
          <h1>點名表</h1>
          <p className="campPage__summary">一張圖為一個活動梯次 × 一個班級。</p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={exportPng}
          disabled={
            isExporting ||
            !selectedPeriod ||
            !selectedClass ||
            classStudents.length === 0 ||
            hasTooManyStudents
          }
        >
          {isExporting ? "產生圖檔中…" : "下載 PNG"}
        </button>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px", background: "#fffdf9", border: "1px solid #e5ddd1", borderRadius: "18px", padding: "18px" }}>
        <label style={{ display: "grid", gap: "8px" }}>
          <strong>活動梯次</strong>
          <select value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)}>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}　{formatDate(period.start_date)}～{formatDate(period.end_date)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: "8px" }}>
          <strong>班級</strong>
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            disabled={isLoadingPeriod || classes.length === 0}
          >
            {classes.length === 0 ? (
              <option value="">這一梯尚未建立班級</option>
            ) : (
              classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
              ))
            )}
          </select>
        </label>
      </section>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      {hasTooManyStudents && (
        <div className="campMessage campMessage--error">
          此班共有 {classStudents.length} 人；A4 單張點名表目前鎖定最多 26 人，請先分班後再匯出。
        </div>
      )}

      {!selectedClass ? (
        <div className="campEmptyState">
          <strong>這一梯尚未建立班級</strong>
          <p>請先到「營隊編班」建立班級並完成分班。</p>
        </div>
      ) : classStudents.length === 0 ? (
        <div className="campEmptyState"><strong>這個班級目前沒有學生</strong></div>
      ) : (
        <div
          ref={previewViewportRef}
          style={{
            width: "100%",
            height: `${A4_HEIGHT * previewScale}px`,
            overflow: "hidden",
            paddingBottom: "12px",
            boxSizing: "content-box",
          }}
        >
          <div
            style={{
              width: `${A4_WIDTH}px`,
              height: `${A4_HEIGHT}px`,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          >
            <div
              ref={previewRef}
              style={{
                width: `${A4_WIDTH}px`,
                height: `${A4_HEIGHT}px`,
                boxSizing: "border-box",
                padding: `38px ${A4_HORIZONTAL_PADDING}px 30px`,
                background: "#fffdf8",
                color: "#4b463f",
                fontFamily: '"Iansui", "芫荽", cursive',
                border: "1px solid #d8d1c6",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "32px",
                  alignItems: "flex-end",
                  marginBottom: "14px",
                  flexShrink: 0,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "31px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      marginBottom: "2px",
                    }}
                  >
                    倍思學院
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      letterSpacing: "0.22em",
                      opacity: 0.58,
                    }}
                  >
                    BEAST ACADEMY
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: "25px",
                      fontWeight: 700,
                      marginBottom: "3px",
                    }}
                  >
                    {camp.name} 點名表
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      opacity: 0.68,
                    }}
                  >
                    {selectedPeriod.name}
                    {"　｜　"}
                    {selectedClass.name}
                    {"　｜　"}
                    {classStudents.length} 人
                  </div>
                </div>
              </div>

              <div
                style={{
                  height: "4px",
                  borderRadius: "999px",
                  background: "#a5ae9a",
                  opacity: 0.78,
                  marginBottom: "14px",
                  flexShrink: 0,
                }}
              />

              <table
                style={{
                  width: `${A4_TABLE_WIDTH}px`,
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  background: "#fff",
                  fontSize: "13px",
                  flexShrink: 0,
                }}
              >
                <colgroup>
                  <col style={{ width: `${FIXED_COLUMN_WIDTHS.number}px` }} />
                  <col style={{ width: `${FIXED_COLUMN_WIDTHS.grade}px` }} />
                  <col style={{ width: `${FIXED_COLUMN_WIDTHS.chineseName}px` }} />
                  <col style={{ width: `${FIXED_COLUMN_WIDTHS.englishName}px` }} />
                  <col style={{ width: `${FIXED_COLUMN_WIDTHS.phone}px` }} />

                  {periodDates.map((dateKey) => (
                    <col
                      key={`col-${dateKey}`}
                      style={{
                        width: `${dateColumnWidth}px`,
                      }}
                    />
                  ))}
                </colgroup>

                <thead>
                  <tr>
                    <th style={headerCellStyle()}>編號</th>
                    <th style={headerCellStyle()}>年級</th>
                    <th style={headerCellStyle()}>中文姓名</th>
                    <th style={headerCellStyle()}>英文姓名</th>
                    <th style={headerCellStyle()}>聯絡電話</th>

                    {periodDates.map((dateKey) => {
                      const dayMeta =
                        dayMetaByDate.get(dateKey);

                      return (
                        <th
                          key={dateKey}
                          style={headerCellStyle()}
                        >
                          <div
                            style={{
                              fontSize:
                                periodDates.length >= 14
                                  ? "11px"
                                  : "12px",
                              letterSpacing: "0.04em",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatShortDate(dateKey)}
                          </div>

                          <div
                            style={{
                              fontSize:
                                periodDates.length >= 14
                                  ? "9px"
                                  : "10px",
                              opacity: 0.62,
                              marginTop: "2px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            （{getWeekday(dateKey)}）
                            {dayMeta?.title
                              ? ` ${dayMeta.title}`
                              : ""}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {classStudents.map((student, index) => (
                    <tr key={student.id}>
                      <td
                        style={{
                          ...bodyCellStyle,
                          height: `${studentRowHeight}px`,
                        }}
                      >
                        {index + 1}
                      </td>

                      <td
                        style={{
                          ...bodyCellStyle,
                          height: `${studentRowHeight}px`,
                        }}
                      >
                        {getGradeLabel(student.grade)}
                      </td>

                      <td
                        style={{
                          ...bodyCellStyle,
                          height: `${studentRowHeight}px`,
                          fontWeight: 700,
                        }}
                      >
                        {student.chinese_name}
                      </td>

                      <td
                        style={{
                          ...bodyCellStyle,
                          height: `${studentRowHeight}px`,
                        }}
                      >
                        {student.english_name || ""}
                      </td>

                      <td
                        style={{
                          ...bodyCellStyle,
                          height: `${studentRowHeight}px`,
                          fontSize: "12px",
                        }}
                      >
                        {student.parent_phone || ""}
                      </td>

                      {periodDates.map((dateKey) => {
                        const record =
                          recordByStudentDate.get(
                            `${student.id}__${dateKey}`
                          );

                        const dayMeta =
                          dayMetaByDate.get(dateKey);

                        const mark =
                          getAttendanceMark(
                            record,
                            dayMeta
                          );

                        return (
                          <td
                            key={dateKey}
                            style={{
                              ...bodyCellStyle,
                              height: `${studentRowHeight}px`,
                              fontWeight:
                                mark === "/"
                                  ? 400
                                  : 700,
                              color:
                                mark === "/"
                                  ? "#aaa39a"
                                  : "#4b463f",
                              whiteSpace: "nowrap",
                              fontSize:
                                mark === "兩天一夜"
                                  ? "10px"
                                  : mark.length >= 5
                                  ? "10px"
                                  : "12px",
                            }}
                          >
                            {mark}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "18px",
                  marginTop: "auto",
                  paddingTop: "12px",
                  fontSize: "11px",
                  opacity: 0.68,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <div>
                  空白＝一般整日　／＝未報名　假＝請假　出＝戶外教學　其餘顯示實際報名內容
                </div>

                <div>
                  {formatDate(selectedPeriod.start_date)}
                  {" — "}
                  {formatDate(selectedPeriod.end_date)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function headerCellStyle() {
  return {
    border: "1px solid #aaa59d",
    padding: "7px 3px",
    textAlign: "center",
    verticalAlign: "middle",
    background: "#f1efe9",
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
  };
}

const bodyCellStyle = {
  border: "1px solid #b8b3aa",
  padding: "4px 3px",
  textAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.15,
  whiteSpace: "nowrap",
  overflow: "hidden",
};

export default CampRollCallPanel;