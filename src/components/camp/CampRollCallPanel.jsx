import { useEffect, useMemo, useRef, useState } from "react";

import { toPng } from "html-to-image";

import { supabase } from "../../lib/supabase";

const GRADE\_OPTIONS = [

  { value: "K", label: "幼兒園" },

  { value: "G1", label: "一年級" },

  { value: "G2", label: "二年級" },

  { value: "G3", label: "三年級" },

  { value: "G4", label: "四年級" },

  { value: "G5", label: "五年級" },

  { value: "G6", label: "六年級" },

  { value: "GRADUATED", label: "畢業生" },

];

const GRADE\_ORDER = GRADE\_OPTIONS.reduce(

  (result, item, index) => ({ ...result, [item.value]: index }),

  {}

);

function getGradeLabel(value) {

  return GRADE\_OPTIONS.find((item) => item.value === value)?.label || value || "—";

}

function formatDate(dateString) {

  if (!dateString) return "—";

  const [year, month, day] = String(dateString).split("-");

  return \`${year}/${month}/${day}\`;

}

function formatShortDate(dateString) {

  if (!dateString) return "";

  const [, month, day] = String(dateString).split("-");

  return \`${month}/${day}\`;

}

function getWeekday(dateString) {

  if (!dateString) return "";

  const date = new Date(\`${dateString}T00:00:00\`);

  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()] || "";

}

function normalizeType(value) {

  return String(value || "").trim().toUpperCase();

}

function getAttendanceMark(record, dayMeta) {

  if (!record) return "/";

  const status = normalizeType(record.attendance\_status);

  if (status === "ABSENT") return "/";

  if (status === "LEAVE") return "假";

  const dayType = normalizeType(dayMeta?.day\_type);

  const overnightMode = normalizeType(record.overnight\_mode);

  if (

    overnightMode.includes("OVERNIGHT") ||

    overnightMode.includes("JOIN") ||

    overnightMode.includes("STAY")

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

  if (dayType.includes("OUTDOOR") || dayType.includes("FIELD")) {

    return "出";

  }

  return "✓";

}

function safeFileName(value) {

  return String(value || "點名表")

    .replace(/[**\\\\**/:\*?"<>|]/g, "\_")

    .replace(/\s+/g, "\_");

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

          .from("camp\_periods")

          .select("id, camp\_id, name, start\_date, end\_date, sort\_order")

          .eq("camp\_id", camp.id)

          .order("sort\_order", { ascending: true })

          .order("start\_date", { ascending: true }),

        supabase

          .from("camp\_students")

          .select("id, camp\_id, chinese\_name, english\_name, grade, parent\_phone")

          .eq("camp\_id", camp.id),

      ]);

      if (periodResult.error) throw periodResult.error;

      if (studentResult.error) throw studentResult.error;

      const nextPeriods = periodResult.data ?? [];

      setPeriods(nextPeriods);

      setStudents(studentResult.data ?? []);

      if (nextPeriods.length > 0) setSelectedPeriodId(nextPeriods[0].id);

    } catch (error) {

      console.error("讀取點名表基本資料失敗：", error);

      setErrorMessage(\`讀取點名表資料失敗：${error.message}\`);

    } finally {

      setIsLoading(false);

    }

  }

  async function loadPeriodData(periodId) {

    try {

      setIsLoadingPeriod(true);

      setErrorMessage("");

      const [classResult, assignmentResult, periodDateResult, dayMetaResult, recordResult] =

        await Promise.all([

          supabase

            .from("camp\_classes")

            .select("id, camp\_id, period\_id, name, sort\_order")

            .eq("camp\_id", camp.id)

            .eq("period\_id", periodId)

            .order("sort\_order", { ascending: true })

            .order("name", { ascending: true }),

          supabase

            .from("camp\_class\_students")

            .select("id, camp\_id, period\_id, class\_id, student\_id")

            .eq("camp\_id", camp.id)

            .eq("period\_id", periodId),

          supabase

            .from("camp\_period\_dates")

            .select("camp\_date")

            .eq("camp\_id", camp.id)

            .eq("period\_id", periodId)

            .order("camp\_date", { ascending: true }),

          supabase

            .from("camp\_dates")

            .select("id, camp\_id, camp\_date, day\_type, title, note")

            .eq("camp\_id", camp.id),

          supabase

            .from("camp\_student\_daily\_records")

            .select(\`

              id,

              camp\_id,

              camp\_date\_id,

              student\_id,

              attendance\_status,

              morning,

              afternoon,

              meal,

              talent,

              overnight\_mode,

              leave\_type,

              is\_late\_registration,

              note,

              camp\_dates (

                id,

                camp\_date,

                day\_type,

                title

              )

            \`)

            .eq("camp\_id", camp.id),

        ]);

      if (classResult.error) throw classResult.error;

      if (assignmentResult.error) throw assignmentResult.error;

      if (periodDateResult.error) throw periodDateResult.error;

      if (dayMetaResult.error) throw dayMetaResult.error;

      if (recordResult.error) throw recordResult.error;

      const nextClasses = classResult.data ?? [];

      const nextPeriodDates = (periodDateResult.data ?? [])

        .map((row) => row\.camp\_date)

        .filter(Boolean);

      const dateSet = new Set(nextPeriodDates);

      setClasses(nextClasses);

      setClassAssignments(assignmentResult.data ?? []);

      setPeriodDates(nextPeriodDates);

      setDayMetaRows((dayMetaResult.data ?? []).filter((row) => dateSet.has(row\.camp\_date)));

      setDailyRecords(

        (recordResult.data ?? []).filter((row) => {

          const dateKey = row\.camp\_dates?.camp\_date;

          return dateKey && dateSet.has(dateKey);

        })

      );

      setSelectedClassId((current) => {

        if (current && nextClasses.some((item) => item.id === current)) return current;

        return nextClasses[0]?.id || "";

      });

    } catch (error) {

      console.error("讀取梯次點名表資料失敗：", error);

      setErrorMessage(\`讀取梯次點名表資料失敗：${error.message}\`);

    } finally {

      setIsLoadingPeriod(false);

    }

  }

  const dayMetaByDate = useMemo(() => {

    const map = new Map();

    for (const row of dayMetaRows) map.set(row\.camp\_date, row);

    return map;

  }, [dayMetaRows]);

  const recordByStudentDate = useMemo(() => {

    const map = new Map();

    for (const row of dailyRecords) {

      const dateKey = row\.camp\_dates?.camp\_date;

      if (dateKey) map.set(\`${row\.student\_id}\_\_${dateKey}\`, row);

    }

    return map;

  }, [dailyRecords]);

  const classStudents = useMemo(() => {

    if (!selectedClassId) return [];

    const studentIds = new Set(

      classAssignments

        .filter((row) => row\.class\_id === selectedClassId)

        .map((row) => row\.student\_id)

    );

    return students

      .filter((student) => studentIds.has(student.id))

      .sort((a, b) => {

        const gradeDiff =

          (GRADE\_ORDER[a.grade] ?? 999) -

          (GRADE\_ORDER[b.grade] ?? 999);

        if (gradeDiff !== 0) return gradeDiff;

        return String(a.chinese\_name || "").localeCompare(

          String(b.chinese\_name || ""),

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

        \`${camp.name}\_${selectedPeriod.name}\_${selectedClass.name}\_點名表.png\`

      );

      link.href = dataUrl;

      link.click();

    } catch (error) {

      console.error("匯出點名表 PNG 失敗：", error);

      setErrorMessage(\`匯出圖檔失敗：${error.message}\`);

    } finally {

      setIsExporting(false);

    }

  }

  if (isLoading) {

    return (

      \<div className="campPage">

        \<div className="campEmptyState">正在讀取點名表資料……\</div>

      \</div>

    );

  }

  return (

    \<div className="campPage">

      \<button type="button" className="campBackButton" onClick={onBack}>

        ← 返回營隊資料夾

      \</button>

      \<header className="campPage\_\_header" style={{ marginTop: "24px", alignItems: "flex-end" }}>

        \<div>

          \<p className="campEyebrow">ROLL CALL\</p>

          \<h1>點名表\</h1>

          \<p className="campPage\_\_summary">一張圖為一個活動梯次 × 一個班級。\</p>

        \</div>

        \<button

          type="button"

          className="campPrimaryButton"

          onClick={exportPng}

          disabled={isExporting || !selectedPeriod || !selectedClass || classStudents.length === 0}

        \>

          {isExporting ? "產生圖檔中…" : "下載 PNG"}

        \</button>

      \</header>

      \<section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px", background: "#fffdf9", border: "1px solid #e5ddd1", borderRadius: "18px", padding: "18px" }}>

        \<label style={{ display: "grid", gap: "8px" }}>

          \<strong>活動梯次\</strong>

          \<select value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)}>

            {periods.map((period) => (

              \<option key={period.id} value={period.id}>

                {period.name}　{formatDate(period.start\_date)}～{formatDate(period.end\_date)}

              \</option>

            ))}

          \</select>

        \</label>

        \<label style={{ display: "grid", gap: "8px" }}>

          \<strong>班級\</strong>

          \<select

            value={selectedClassId}

            onChange={(event) => setSelectedClassId(event.target.value)}

            disabled={isLoadingPeriod || classes.length === 0}

          \>

            {classes.length === 0 ? (

              \<option value="">這一梯尚未建立班級\</option>

            ) : (

              classes.map((classItem) => (

                \<option key={classItem.id} value={classItem.id}>{classItem.name}\</option>

              ))

            )}

          \</select>

        \</label>

      \</section>

      {errorMessage && \<div className="campMessage campMessage--error">{errorMessage}\</div>}

      {!selectedClass ? (

        \<div className="campEmptyState">

          \<strong>這一梯尚未建立班級\</strong>

          \<p>請先到「營隊編班」建立班級並完成分班。\</p>

        \</div>

      ) : classStudents.length === 0 ? (

        \<div className="campEmptyState">\<strong>這個班級目前沒有學生\</strong>\</div>

      ) : (

        \<div style={{ overflowX: "auto", paddingBottom: "12px" }}>

          \<div

            ref={previewRef}

            style={{

              width: \`${Math.max(1600, 740 + periodDates.length \* 110)}px\`,

              minHeight: "900px",

              boxSizing: "border-box",

              padding: "58px 54px 48px",

              background: "#fbf8f1",

              color: "#4b463f",

              fontFamily: '"Iansui", "芫荽", cursive',

              border: "1px solid #e0d8cc",

            }}

          \>

            \<div style={{ display: "flex", justifyContent: "space-between", gap: "32px", alignItems: "flex-end", marginBottom: "28px" }}>

              \<div>

                \<div style={{ fontSize: "40px", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "7px" }}>倍思學院\</div>

                \<div style={{ fontSize: "18px", letterSpacing: "0.25em", opacity: 0.62 }}>BEAST ACADEMY\</div>

              \</div>

              \<div style={{ textAlign: "right" }}>

                \<div style={{ fontSize: "34px", fontWeight: 700, marginBottom: "9px" }}>{camp.name} 點名表\</div>

                \<div style={{ fontSize: "19px", opacity: 0.72 }}>

                  {selectedPeriod.name}　｜　{selectedClass.name}　｜　{classStudents.length} 人

                \</div>

              \</div>

            \</div>

            \<div style={{ height: "5px", borderRadius: "999px", background: "#9aa58f", opacity: 0.75, marginBottom: "22px" }} />

            \<table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", background: "rgba(255,255,255,0.42)", fontSize: "18px" }}>

              \<thead>

                \<tr>

                  \<th style={headerCellStyle(66)}>編號\</th>

                  \<th style={headerCellStyle(94)}>年級\</th>

                  \<th style={headerCellStyle(128)}>中文姓名\</th>

                  \<th style={headerCellStyle(120)}>英文姓名\</th>

                  \<th style={headerCellStyle(148)}>聯絡電話\</th>

                  {periodDates.map((dateKey) => {

                    const dayMeta = dayMetaByDate.get(dateKey);

                    return (

                      \<th key={dateKey} style={headerCellStyle(108)}>

                        \<div>{formatShortDate(dateKey)}\</div>

                        \<div style={{ fontSize: "14px", opacity: 0.66, marginTop: "3px" }}>

                          （{getWeekday(dateKey)}）{dayMeta?.title ? \` ${dayMeta.title}\` : ""}

                        \</div>

                      \</th>

                    );

                  })}

                \</tr>

              \</thead>

              \<tbody>

                {classStudents.map((student, index) => (

                  \<tr key={student.id}>

                    \<td style={bodyCellStyle}>{index + 1}\</td>

                    \<td style={bodyCellStyle}>{getGradeLabel(student.grade)}\</td>

                    \<td style={{ ...bodyCellStyle, fontWeight: 700 }}>{student.chinese\_name}\</td>

                    \<td style={bodyCellStyle}>{student.english\_name || ""}\</td>

                    \<td style={bodyCellStyle}>{student.parent\_phone || ""}\</td>

                    {periodDates.map((dateKey) => {

                      const record = recordByStudentDate.get(\`${student.id}\_\_${dateKey}\`);

                      const dayMeta = dayMetaByDate.get(dateKey);

                      const mark = getAttendanceMark(record, dayMeta);

                      return (

                        \<td

                          key={dateKey}

                          style={{

                            ...bodyCellStyle,

                            fontWeight: mark === "/" ? 400 : 700,

                            color: mark === "/" ? "#aaa39a" : "#4b463f",

                          }}

                        \>

                          {mark}

                        \</td>

                      );

                    })}

                  \</tr>

                ))}

              \</tbody>

            \</table>

            \<div style={{ display: "flex", justifyContent: "space-between", gap: "28px", marginTop: "26px", fontSize: "15px", opacity: 0.72 }}>

              \<div>✓ 有報名　／ 未報名　假 請假　出 戶外教學\</div>

              \<div>{formatDate(selectedPeriod.start\_date)} — {formatDate(selectedPeriod.end\_date)}\</div>

            \</div>

          \</div>

        \</div>

      )}

    \</div>

  );

}

function headerCellStyle(width) {

  return {

    width,

    border: "1px solid #bdb7ae",

    padding: "13px 8px",

    textAlign: "center",

    verticalAlign: "middle",

    background: "#e9e6dc",

    fontWeight: 700,

    lineHeight: 1.35,

  };

}

const bodyCellStyle = {

  border: "1px solid #c9c3ba",

  padding: "13px 8px",

  textAlign: "center",

  verticalAlign: "middle",

  height: "48px",

  lineHeight: 1.35,

};

export default CampRollCallPanel;