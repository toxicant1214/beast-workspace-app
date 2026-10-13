import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const SUBJECT_NAMES = {
  CHINESE: "國語", MATH: "數學", ENGLISH: "英文",
  SOCIAL: "社會", SCIENCE: "自然",
};
const COMPLETED = new Set(["SCORED", "EXEMPT_APPROVED"]);
const EXAM_TYPE = { MOCK: "模擬考", OFFICIAL: "學校正式考試" };
const STATUS = {
  PENDING: "待審核", APPROVED: "已核准", REJECTED: "已退回",
  WITHDRAWN: "老師已撤回",
};

// Supabase 每次查詢有筆數上限，分頁讀取，避免大型考試只顯示前 1000 筆。
async function readAll(table, columns, configure = (query) => query) {
  const output = [];
  for (let from = 0; ; from += 500) {
    const query = configure(supabase.from(table).select(columns)).order("id", { ascending: true }).range(from, from + 499);
    const { data, error } = await query;
    if (error) throw error;
    output.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return output;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-TW", { hour12: false });
}

export default function ScorePendingPage({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("scores");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const exams = await readAll("score_exams", "*");
      const classes = await readAll("score_exam_classes", "*");
      const students = await readAll("score_exam_students", "*", q => q.eq("is_active", true));
      const subjects = await readAll("score_exam_subjects", "*");
      const applications = await readAll("score_exemption_requests", "*");
      const examMap = new Map(exams.map(e => [e.id, e]));
      const classMap = new Map(classes.map(c => [c.id, c]));
      const studentMap = new Map(students.map(s => [s.id, s]));
      const subjectMap = new Map(subjects.map(s => [s.id, s]));

      const enriched = subjects.flatMap(subject => {
        const student = studentMap.get(subject.exam_student_id);
        if (!student) return [];
        const examClass = classMap.get(student.exam_class_id);
        if (!examClass) return [];
        const exam = examMap.get(examClass.exam_id);
        if (!exam) return [];
        return [{
          ...subject,
          studentName: student.student_name_snapshot || "未命名學生",
          className: examClass.class_name_snapshot || "未命名班級",
          exam,
          examLabel: `${exam.academic_year || ""} ${exam.term || ""} ${exam.exam_period || ""} ${EXAM_TYPE[exam.exam_type] || exam.exam_type || ""}${exam.mock_number ? ` 第${exam.mock_number}次` : ""}`.trim(),
        }];
      });
      const enrichedMap = new Map(enriched.map(row => [row.id, row]));
      const applicationRows = applications.flatMap(request => {
        const subject = enrichedMap.get(request.exam_subject_id);
        return subject ? [{ ...request, subject }] : [];
      });
      applicationRows.sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0));
      setRows(enriched);
      setRequests(applicationRows);
    } catch (e) {
      console.error("讀取待完成資料失敗：", e);
      setError(e.message || "無法讀取資料，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const incomplete = useMemo(() => rows.filter(row => !COMPLETED.has(row.status)), [rows]);
  const visibleScores = useMemo(() => incomplete.filter(row => {
    const matchesType = filter === "ALL" || row.exam.exam_type === filter;
    const text = `${row.studentName} ${row.className} ${row.examLabel} ${SUBJECT_NAMES[row.subject] || row.subject}`;
    return matchesType && text.toLowerCase().includes(search.trim().toLowerCase());
  }), [incomplete, filter, search]);
  const visibleRequests = useMemo(() => requests.filter(item => {
    const matchesType = filter === "ALL" || item.subject.exam.exam_type === filter;
    const text = `${item.subject.studentName} ${item.subject.className} ${item.subject.examLabel} ${SUBJECT_NAMES[item.subject.subject] || item.subject.subject} ${item.reason || ""}`;
    return matchesType && text.toLowerCase().includes(search.trim().toLowerCase());
  }), [requests, filter, search]);
  const pendingCount = requests.filter(item => item.status === "PENDING").length;
  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.exam.id}:${row.className}`;
      if (!map.has(key)) map.set(key, { key, examLabel: row.examLabel, className: row.className, total: 0, completed: 0 });
      const entry = map.get(key);
      entry.total++;
      if (COMPLETED.has(row.status)) entry.completed++;
    }
    return [...map.values()].sort((a, b) => a.examLabel.localeCompare(b.examLabel, "zh-TW") || a.className.localeCompare(b.className, "zh-TW"));
  }, [rows]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div><div style={styles.eyebrow}>BEAST WORKSPACE</div><h1 style={styles.title}>待完成</h1><p style={styles.sub}>各班成績登記進度、待完成科目與免考申請追蹤</p></div>
        <div style={styles.actions}><button style={styles.button} onClick={load} disabled={loading}>重新整理</button><button style={styles.button} onClick={onBack}>← 返回學生成績</button></div>
      </div>
      <div style={styles.stats}>
        <Stat label="應登記科目" value={rows.length} />
        <Stat label="已完成" value={rows.filter(r => COMPLETED.has(r.status)).length} />
        <Stat label="待完成" value={incomplete.length} />
        <Stat label="免考待審核" value={pendingCount} />
      </div>
      {error && <div style={styles.error}>{error}</div>}
      {loading ? <div style={styles.panel}>正在讀取各班成績資料…</div> : <>
        <section style={styles.panel}>
          <h2 style={styles.h2}>班級登記進度</h2>
          <div style={styles.scroll}><table style={styles.table}><thead><tr><Th>考試</Th><Th>班級</Th><Th>應登記</Th><Th>已完成</Th><Th>待完成</Th><Th>完成率</Th></tr></thead><tbody>
            {grouped.map(item => <tr key={item.key}><Td>{item.examLabel}</Td><Td>{item.className}</Td><Td>{item.total}</Td><Td>{item.completed}</Td><Td>{item.total - item.completed}</Td><Td>{item.total ? Math.round(item.completed / item.total * 100) : 0}%</Td></tr>)}
          </tbody></table>{!grouped.length && <div style={styles.empty}>目前沒有考試資料。</div>}</div>
        </section>
        <section style={styles.panel}>
          <div style={styles.toolbar}>
            <div style={styles.tabs}><button style={tab === "scores" ? styles.activeTab : styles.tab} onClick={() => setTab("scores")}>未完成科目（{incomplete.length}）</button><button style={tab === "requests" ? styles.activeTab : styles.tab} onClick={() => setTab("requests")}>免考申請紀錄（{requests.length}）</button></div>
            <div style={styles.filters}><select value={filter} onChange={e => setFilter(e.target.value)} style={styles.input}><option value="ALL">全部考試</option><option value="MOCK">模擬考</option><option value="OFFICIAL">正式考試</option></select><input style={styles.input} placeholder="搜尋學生、班級、科目…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          {tab === "scores" ? <div style={styles.scroll}><table style={styles.table}><thead><tr><Th>考試</Th><Th>班級</Th><Th>學生</Th><Th>科目</Th><Th>狀態</Th></tr></thead><tbody>{visibleScores.map(row => <tr key={row.id}><Td>{row.examLabel}</Td><Td>{row.className}</Td><Td>{row.studentName}</Td><Td>{SUBJECT_NAMES[row.subject] || row.subject}</Td><Td>{row.status === "EXEMPT_PENDING" ? "免考審核中" : row.status === "EXEMPT_REJECTED" ? "免考已退回／待登記" : "待登記"}</Td></tr>)}</tbody></table>{!visibleScores.length && <div style={styles.empty}>目前沒有符合條件的未完成科目。</div>}</div> : <div style={styles.scroll}><table style={styles.table}><thead><tr><Th>申請時間</Th><Th>考試／班級</Th><Th>學生／科目</Th><Th>申請原因</Th><Th>狀態</Th><Th>審核備註</Th></tr></thead><tbody>{visibleRequests.map(item => <tr key={item.id}><Td>{formatDate(item.requested_at)}</Td><Td>{item.subject.examLabel}<div style={styles.muted}>{item.subject.className}</div></Td><Td>{item.subject.studentName}<div style={styles.muted}>{SUBJECT_NAMES[item.subject.subject] || item.subject.subject}</div></Td><Td>{item.reason || "—"}</Td><Td>{STATUS[item.status] || item.status}</Td><Td>{item.review_note || "—"}</Td></tr>)}</tbody></table>{!visibleRequests.length && <div style={styles.empty}>目前沒有符合條件的免考申請。</div>}</div>}
          <p style={styles.note}>目前這一版提供進度與申請紀錄查詢。管理員核准、退回、撤銷核准，須完成資料庫權限與交易函式後才能開放，避免老師越權操作。</p>
        </section>
      </>}
    </div>
  );
}

function Stat({ label, value }) { return <div style={styles.stat}><div style={styles.muted}>{label}</div><div style={styles.number}>{value}</div></div>; }
function Th({ children }) { return <th style={styles.th}>{children}</th>; }
function Td({ children }) { return <td style={styles.td}>{children}</td>; }

const styles = {
  page: { maxWidth: 1350, margin: "0 auto", padding: 32 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 },
  eyebrow: { color: "#888", fontSize: 12, fontWeight: 700, letterSpacing: ".14em", marginBottom: 8 },
  title: { fontSize: 30, margin: 0, color: "#222" },
  sub: { color: "#777", fontSize: 14, margin: "8px 0 0" },
  actions: { display: "flex", gap: 8 },
  button: { border: "1px solid #ddd", background: "#fff", padding: "10px 14px", borderRadius: 9, cursor: "pointer" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 18 },
  stat: { background: "#fff", border: "1px solid #e8e8e8", padding: 18, borderRadius: 14 },
  number: { fontSize: 26, fontWeight: 800, marginTop: 6 },
  muted: { color: "#888", fontSize: 12 },
  panel: { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 15, padding: 20, marginBottom: 18 },
  h2: { fontSize: 18, margin: "0 0 15px" },
  scroll: { overflowX: "auto" },
  table: { width: "100%", minWidth: 780, borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", background: "#f7f7f7", color: "#555", padding: "12px 10px", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" },
  td: { padding: "12px 10px", borderBottom: "1px solid #eee", verticalAlign: "top" },
  toolbar: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 15 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: { background: "#f4f4f4", border: 0, borderRadius: 9, padding: "9px 12px", cursor: "pointer", color: "#666" },
  activeTab: { background: "#222", border: 0, borderRadius: 9, padding: "9px 12px", cursor: "pointer", color: "#fff", fontWeight: 700 },
  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: { border: "1px solid #ddd", borderRadius: 8, padding: "9px 10px", fontFamily: "inherit" },
  empty: { padding: 25, textAlign: "center", color: "#888" },
  note: { fontSize: 12, color: "#888", lineHeight: 1.7, margin: "18px 0 0" },
  error: { background: "#fff4f4", color: "#a33", padding: 15, borderRadius: 10, marginBottom: 15 },
};
