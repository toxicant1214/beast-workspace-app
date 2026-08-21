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

  const status = normalizeType(record.attendance_status);

  if (status === "ABSENT") return "/";
  if (status === "LEAVE") return "假";

  const dayType = normalizeType(dayMeta?.day_type);
  const overnightMode = normalizeType(record.overnight_mode);

  // 兩天一夜：有參加才顯示文字；留在室內維持空白格。
  if (
    overnightMode.includes("OVERNIGHT") ||
    overnightMode.includes("JOIN") ||
    overnightMode.includes("STAY") ||
    dayType.includes("兩天一夜")
  ) {
    return "兩天一夜";
  }

  if (
    overnightMode.includes("INDOOR") ||
    overnightMode.includes("CLASSROOM") ||
    overnightMode.includes("ROOM")
  ) {
    return "";
  }

  // 戶外教學：有參加顯示「出」。
  if (
    dayType.includes("OUTDOOR") ||
    dayType.includes("FIELD") ||
    dayType.includes("戶外教學") ||
    dayType.includes("戶外")
  ) {
    return "出";
  }

  const parts = [];

  if (record.morning) parts.push("上");
  if (record.afternoon) parts.push("下");
  if (record.meal) parts.push("餐");
  if (record.talent) parts.push("才");

  // 一般營隊日若上午、下午、午餐都參加，視為正常整日，保持空白格。
  const isRegularFullDay =
    record.morning &&
    record.afternoon &&
    record.meal &&
    !record.talent;

  if (isRegularFullDay) return "";

  // 有才藝但其餘為完整一般營隊，顯示簡碼。
  if (parts.length > 0) {
    return parts.join("+");
  }

  // 有建立每日報名紀錄但沒有特殊文字時，保持空白。
  return "";
}

function safeFileName(value) {
  return String(value || "點名表")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function CampRollCallPanel({ camp, onBack }) {
  const previewRef = useRef(null);

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

  async function exportPng() {
    if (!previewRef.current || !selectedPeriod || !selectedClass) return;

    try {
      setIsExporting(true);
      setErrorMessage("");
      if (document.fonts?.ready) await document.fonts.ready;

      const dataUrl = await toPng(previewRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fbf8f1",
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
          disabled={isExporting || !selectedPeriod || !selectedClass || classStudents.length === 0}
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

      {errorMessage && <div className="campMessage campMessage--error">{errorMessage}</div>}

      {!selectedClass ? (
        <div className="campEmptyState">
          <strong>這一梯尚未建立班級</strong>
          <p>請先到「營隊編班」建立班級並完成分班。</p>
        </div>
      ) : classStudents.length === 0 ? (
        <div className="campEmptyState"><strong>這個班級目前沒有學生</strong></div>
      ) : (
        <div style={{ width: "100%", overflow: "hidden", paddingBottom: "12px" }}>
          <div
            ref={previewRef}
            style={{
              width: "100%",
              minHeight: "auto",
              boxSizing: "border-box",
              padding: "34px 30px 30px",
              background: "#fbf8f1",
              color: "#4b463f",
              fontFamily: '"Iansui", "芫荽", cursive',
              border: "1px solid #e0d8cc",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "32px", alignItems: "flex-end", marginBottom: "28px" }}>
              <div>
                <div style={{ fontSize: "30px", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "5px" }}>倍思學院</div>
                <div style={{ fontSize: "13px", letterSpacing: "0.22em", opacity: 0.62 }}>BEAST ACADEMY</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "6px" }}>{camp.name} 點名表</div>
                <div style={{ fontSize: "10px", opacity: 0.72 }}>
                  {selectedPeriod.name}　｜　{selectedClass.name}　｜　{classStudents.length} 人
                </div>
              </div>
            </div>

            <div style={{ height: "5px", borderRadius: "999px", background: "#9aa58f", opacity: 0.75, marginBottom: "22px" }} />

            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", background: "rgba(255,255,255,0.42)", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={headerCellStyle(46)}>編號</th>
                  <th style={headerCellStyle(68)}>年級</th>
                  <th style={headerCellStyle(92)}>中文姓名</th>
                  <th style={headerCellStyle(88)}>英文姓名</th>
                  <th style={headerCellStyle(112)}>聯絡電話</th>

                  {periodDates.map((dateKey) => {
                    const dayMeta = dayMetaByDate.get(dateKey);
                    return (
                      <th key={dateKey} style={headerCellStyle(undefined)}>
                        <div>{formatShortDate(dateKey)}</div>
                        <div style={{ fontSize: "14px", opacity: 0.66, marginTop: "3px" }}>
                          （{getWeekday(dateKey)}）{dayMeta?.title ? ` ${dayMeta.title}` : ""}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {classStudents.map((student, index) => (
                  <tr key={student.id}>
                    <td style={bodyCellStyle}>{index + 1}</td>
                    <td style={bodyCellStyle}>{getGradeLabel(student.grade)}</td>
                    <td style={{ ...bodyCellStyle, fontWeight: 700 }}>{student.chinese_name}</td>
                    <td style={bodyCellStyle}>{student.english_name || ""}</td>
                    <td style={bodyCellStyle}>{student.parent_phone || ""}</td>

                    {periodDates.map((dateKey) => {
                      const record = recordByStudentDate.get(`${student.id}__${dateKey}`);
                      const dayMeta = dayMetaByDate.get(dateKey);
                      const mark = getAttendanceMark(record, dayMeta);

                      return (
                        <td
                          key={dateKey}
                          style={{
                            ...bodyCellStyle,
                            fontWeight: mark === "/" ? 400 : 700,
                            color: mark === "/" ? "#aaa39a" : "#4b463f",
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

            <div style={{ display: "flex", justifyContent: "space-between", gap: "28px", marginTop: "26px", fontSize: "15px", opacity: 0.72 }}>
              <div>空白＝一般整日　／＝未報名　假＝請假　出＝戶外教學　其餘顯示實際報名內容</div>
              <div>{formatDate(selectedPeriod.start_date)} — {formatDate(selectedPeriod.end_date)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function headerCellStyle(width) {
  return {
    ...(width ? { width } : {}),
    border: "1px solid #bdb7ae",
    padding: "8px 4px",
    textAlign: "center",
    verticalAlign: "middle",
    background: "#e9e6dc",
    fontWeight: 700,
    lineHeight: 1.35,
  };
}

const bodyCellStyle = {
  border: "1px solid #c9c3ba",
  padding: "8px 4px",
  textAlign: "center",
  verticalAlign: "middle",
  height: "34px",
  lineHeight: 1.35,
};

export default CampRollCallPanel;