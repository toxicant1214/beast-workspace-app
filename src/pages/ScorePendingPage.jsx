import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";

const SUBJECT_NAMES = {
  CHINESE: "國語",
  MATH: "數學",
  ENGLISH: "英文",
  SOCIAL: "社會",
  SCIENCE: "自然",
};

const COMPLETED = new Set([
  "SCORED",
  "EXEMPT_APPROVED",
]);

const EXAM_TYPE = {
  MOCK: "模擬考",
  OFFICIAL: "學校正式考試",
};

const STATUS = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已退回",
  WITHDRAWN: "老師已撤回",
};

async function readAll(
  table,
  columns,
  configure = (query) => query
) {
  const output = [];

  for (let from = 0; ; from += 500) {
    const query = configure(
      supabase.from(table).select(columns)
    )
      .order("id", { ascending: true })
      .range(from, from + 499);

    const { data, error } = await query;

    if (error) throw error;

    output.push(...(data || []));

    if (!data || data.length < 500) {
      break;
    }
  }

  return output;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-TW", {
        hour12: false,
      });
}

export default function ScorePendingPage({
  onBack,
  currentTeacher,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);

  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("scores");

  const [busyId, setBusyId] = useState(null);

  const isAdmin = currentTeacher?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const exams = await readAll(
        "score_exams",
        "*"
      );

      const classes = await readAll(
        "score_exam_classes",
        "*"
      );

      const students = await readAll(
        "score_exam_students",
        "*",
        (query) => query.eq("is_active", true)
      );

      const subjects = await readAll(
        "score_exam_subjects",
        "*"
      );

      const applications = await readAll(
        "score_exemption_requests",
        "*"
      );

      const examMap = new Map(
        exams.map((item) => [item.id, item])
      );

      const classMap = new Map(
        classes.map((item) => [item.id, item])
      );

      const studentMap = new Map(
        students.map((item) => [item.id, item])
      );

      const enriched = subjects.flatMap(
        (subject) => {
          const student = studentMap.get(
            subject.exam_student_id
          );

          if (!student) return [];

          const examClass = classMap.get(
            student.exam_class_id
          );

          if (!examClass) return [];

          const exam = examMap.get(
            examClass.exam_id
          );

          if (!exam) return [];

          return [
            {
              ...subject,

              studentName:
                student.student_name_snapshot ||
                "未命名學生",

              className:
                examClass.class_name_snapshot ||
                "未命名班級",

              exam,

              examLabel: [
                exam.academic_year || "",
                exam.term || "",
                exam.exam_period || "",
                EXAM_TYPE[exam.exam_type] ||
                  exam.exam_type ||
                  "",
                exam.mock_number
                  ? `第${exam.mock_number}次`
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
            },
          ];
        }
      );

      const enrichedMap = new Map(
        enriched.map((item) => [
          item.id,
          item,
        ])
      );

      const applicationRows =
        applications.flatMap((request) => {
          const subject = enrichedMap.get(
            request.exam_subject_id
          );

          if (!subject) return [];

          return [
            {
              ...request,
              subject,
            },
          ];
        });

      applicationRows.sort(
        (a, b) =>
          new Date(b.requested_at || 0) -
          new Date(a.requested_at || 0)
      );

      setRows(enriched);
      setRequests(applicationRows);
    } catch (err) {
      console.error(
        "讀取待完成資料失敗：",
        err
      );

      setError(
        err.message ||
          "無法讀取資料，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(item, action) {
    if (!isAdmin || busyId) return;

    const title =
      action === "APPROVE"
        ? "核准免考"
        : action === "REJECT"
          ? "退回免考"
          : "撤銷核准";

    let note = "";

    if (action !== "APPROVE") {
      const answer = window.prompt(
        `${title}：請填寫原因（必填）`
      );

      if (answer === null) return;

      note = answer.trim();

      if (!note) {
        window.alert("請填寫原因。");
        return;
      }
    } else {
      const confirmed = window.confirm(
        `確定核准 ${item.subject.studentName} 的` +
          `${
            SUBJECT_NAMES[item.subject.subject] ||
            item.subject.subject
          }免考申請？`
      );

      if (!confirmed) return;
    }

    setBusyId(item.id);

    try {
      const { error: rpcError } =
        await supabase.rpc(
          "review_score_exemption",
          {
            p_request_id: item.id,
            p_action: action,
            p_note: note || null,
          }
        );

      if (rpcError) throw rpcError;

      await load();

      window.alert(`${title}成功。`);
    } catch (err) {
      console.error(
        `${title}失敗：`,
        err
      );

      window.alert(
        `${title}失敗：${
          err.message || "請稍後再試"
        }`
      );
    } finally {
      setBusyId(null);
    }
  }

  const incomplete = useMemo(
    () =>
      rows.filter(
        (row) => !COMPLETED.has(row.status)
      ),
    [rows]
  );

  const visibleScores = useMemo(() => {
    return incomplete.filter((row) => {
      const matchesType =
        filter === "ALL" ||
        row.exam.exam_type === filter;

      const text = [
        row.studentName,
        row.className,
        row.examLabel,
        SUBJECT_NAMES[row.subject] ||
          row.subject,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesType &&
        text.includes(
          search.trim().toLowerCase()
        )
      );
    });
  }, [incomplete, filter, search]);

  const visibleRequests = useMemo(() => {
    return requests.filter((item) => {
      const matchesType =
        filter === "ALL" ||
        item.subject.exam.exam_type ===
          filter;

      const text = [
        item.subject.studentName,
        item.subject.className,
        item.subject.examLabel,
        SUBJECT_NAMES[
          item.subject.subject
        ] || item.subject.subject,
        item.reason || "",
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesType &&
        text.includes(
          search.trim().toLowerCase()
        )
      );
    });
  }, [requests, filter, search]);

  const pendingCount = requests.filter(
    (item) => item.status === "PENDING"
  ).length;

  const grouped = useMemo(() => {
    const map = new Map();

    for (const row of rows) {
      const key =
        `${row.exam.id}:${row.className}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          examLabel: row.examLabel,
          className: row.className,
          total: 0,
          completed: 0,
        });
      }

      const entry = map.get(key);

      entry.total += 1;

      if (COMPLETED.has(row.status)) {
        entry.completed += 1;
      }
    }

    return [...map.values()].sort(
      (a, b) =>
        a.examLabel.localeCompare(
          b.examLabel,
          "zh-TW"
        ) ||
        a.className.localeCompare(
          b.className,
          "zh-TW"
        )
    );
  }, [rows]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            BEAST WORKSPACE
          </div>

          <h1 style={styles.title}>
            待完成
          </h1>

          <p style={styles.sub}>
            各班成績登記進度、待完成科目與免考申請追蹤
          </p>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.button}
            onClick={load}
            disabled={loading}
          >
            重新整理
          </button>

          <button
            type="button"
            style={styles.button}
            onClick={onBack}
          >
            ← 返回學生成績
          </button>
        </div>
      </div>

      <div style={styles.stats}>
        <Stat
          label="應登記科目"
          value={rows.length}
        />

        <Stat
          label="已完成"
          value={
            rows.filter((row) =>
              COMPLETED.has(row.status)
            ).length
          }
        />

        <Stat
          label="待完成"
          value={incomplete.length}
        />

        <Stat
          label="免考待審核"
          value={pendingCount}
        />
      </div>

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={styles.panel}>
          正在讀取各班成績資料…
        </div>
      ) : (
        <>
          <section style={styles.panel}>
            <h2 style={styles.h2}>
              班級登記進度
            </h2>

            <div style={styles.scroll}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>考試</Th>
                    <Th>班級</Th>
                    <Th>應登記</Th>
                    <Th>已完成</Th>
                    <Th>待完成</Th>
                    <Th>完成率</Th>
                  </tr>
                </thead>

                <tbody>
                  {grouped.map((item) => (
                    <tr key={item.key}>
                      <Td>{item.examLabel}</Td>
                      <Td>{item.className}</Td>
                      <Td>{item.total}</Td>
                      <Td>{item.completed}</Td>
                      <Td>
                        {item.total -
                          item.completed}
                      </Td>
                      <Td>
                        {item.total
                          ? Math.round(
                              (item.completed /
                                item.total) *
                                100
                            )
                          : 0}
                        %
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!grouped.length && (
                <div style={styles.empty}>
                  目前沒有考試資料。
                </div>
              )}
            </div>
          </section>

          <section style={styles.panel}>
            <div style={styles.toolbar}>
              <div style={styles.tabs}>
                <button
                  type="button"
                  style={
                    tab === "scores"
                      ? styles.activeTab
                      : styles.tab
                  }
                  onClick={() =>
                    setTab("scores")
                  }
                >
                  未完成科目（
                  {incomplete.length}）
                </button>

                <button
                  type="button"
                  style={
                    tab === "requests"
                      ? styles.activeTab
                      : styles.tab
                  }
                  onClick={() =>
                    setTab("requests")
                  }
                >
                  免考申請紀錄（
                  {requests.length}）
                </button>
              </div>

              <div style={styles.filters}>
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(
                      event.target.value
                    )
                  }
                  style={styles.input}
                >
                  <option value="ALL">
                    全部考試
                  </option>
                  <option value="MOCK">
                    模擬考
                  </option>
                  <option value="OFFICIAL">
                    正式考試
                  </option>
                </select>

                <input
                  style={styles.input}
                  placeholder="搜尋學生、班級、科目…"
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            {tab === "scores" ? (
              <div style={styles.scroll}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <Th>考試</Th>
                      <Th>班級</Th>
                      <Th>學生</Th>
                      <Th>科目</Th>
                      <Th>狀態</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleScores.map(
                      (row) => (
                        <tr key={row.id}>
                          <Td>
                            {row.examLabel}
                          </Td>

                          <Td>
                            {row.className}
                          </Td>

                          <Td>
                            {row.studentName}
                          </Td>

                          <Td>
                            {SUBJECT_NAMES[
                              row.subject
                            ] || row.subject}
                          </Td>

                          <Td>
                            {row.status ===
                            "EXEMPT_PENDING"
                              ? "免考審核中"
                              : row.status ===
                                  "EXEMPT_REJECTED"
                                ? "免考已退回／待登記"
                                : "待登記"}
                          </Td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                {!visibleScores.length && (
                  <div style={styles.empty}>
                    目前沒有符合條件的未完成科目。
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.scroll}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <Th>申請時間</Th>
                      <Th>考試／班級</Th>
                      <Th>學生／科目</Th>
                      <Th>申請原因</Th>
                      <Th>狀態</Th>
                      <Th>審核備註</Th>
                      {isAdmin && (
                        <Th>
                          管理員操作
                        </Th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {visibleRequests.map(
                      (item) => (
                        <tr key={item.id}>
                          <Td>
                            {formatDate(
                              item.requested_at
                            )}
                          </Td>

                          <Td>
                            {
                              item.subject
                                .examLabel
                            }

                            <div
                              style={
                                styles.muted
                              }
                            >
                              {
                                item.subject
                                  .className
                              }
                            </div>
                          </Td>

                          <Td>
                            {
                              item.subject
                                .studentName
                            }

                            <div
                              style={
                                styles.muted
                              }
                            >
                              {SUBJECT_NAMES[
                                item.subject
                                  .subject
                              ] ||
                                item.subject
                                  .subject}
                            </div>
                          </Td>

                          <Td>
                            {item.reason || "—"}
                          </Td>

                          <Td>
                            {item.status ===
                              "APPROVED" &&
                            item.subject.status !==
                              "EXEMPT_APPROVED"
                              ? "核准已撤銷"
                              : STATUS[
                                  item.status
                                ] ||
                                item.status}
                          </Td>

                          <Td>
                            {item.review_note ||
                              "—"}
                          </Td>

                          {isAdmin && (
                            <Td>
                              {item.subject.exam
                                .exam_type ===
                                "MOCK" &&
                              item.status ===
                                "PENDING" ? (
                                <div
                                  style={
                                    styles.actions
                                  }
                                >
                                  <button
                                    type="button"
                                    disabled={Boolean(
                                      busyId
                                    )}
                                    style={
                                      styles.button
                                    }
                                    onClick={() =>
                                      review(
                                        item,
                                        "APPROVE"
                                      )
                                    }
                                  >
                                    核准
                                  </button>

                                  <button
                                    type="button"
                                    disabled={Boolean(
                                      busyId
                                    )}
                                    style={
                                      styles.button
                                    }
                                    onClick={() =>
                                      review(
                                        item,
                                        "REJECT"
                                      )
                                    }
                                  >
                                    退回
                                  </button>
                                </div>
                              ) : item.subject.exam
                                  .exam_type ===
                                  "MOCK" &&
                                item.status ===
                                  "APPROVED" &&
                                item.subject.status ===
                                  "EXEMPT_APPROVED" ? (
                                <button
                                  type="button"
                                  disabled={Boolean(
                                    busyId
                                  )}
                                  style={
                                    styles.button
                                  }
                                  onClick={() =>
                                    review(
                                      item,
                                      "REVOKE"
                                    )
                                  }
                                >
                                  撤銷核准
                                </button>
                              ) : (
                                "—"
                              )}
                            </Td>
                          )}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                {!visibleRequests.length && (
                  <div style={styles.empty}>
                    目前沒有符合條件的免考申請。
                  </div>
                )}
              </div>
            )}

            <p style={styles.note}>
              只有管理員可以核准、退回或撤銷核准；
              退回與撤銷必須填寫原因。
              撤銷不刪除原本的核准紀錄。
              操作後請重新整理成績登記頁，
              查看最新完成數量。
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.muted}>
        {label}
      </div>

      <div style={styles.number}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={styles.th}>
      {children}
    </th>
  );
}

function Td({ children }) {
  return (
    <td style={styles.td}>
      {children}
    </td>
  );
}

const styles = {
  page: {
    maxWidth: 1350,
    margin: "0 auto",
    padding: 32,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },

  eyebrow: {
    color: "#888",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: ".14em",
    marginBottom: 8,
  },

  title: {
    fontSize: 30,
    margin: 0,
    color: "#222",
  },

  sub: {
    color: "#777",
    fontSize: 14,
    margin: "8px 0 0",
  },

  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  button: {
    border: "1px solid #ddd",
    background: "#fff",
    padding: "10px 14px",
    borderRadius: 9,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  stats: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(160px,1fr))",
    gap: 12,
    marginBottom: 18,
  },

  stat: {
    background: "#fff",
    border: "1px solid #e8e8e8",
    padding: 18,
    borderRadius: 14,
  },

  number: {
    fontSize: 26,
    fontWeight: 800,
    marginTop: 6,
  },

  muted: {
    color: "#888",
    fontSize: 12,
  },

  panel: {
    background: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: 15,
    padding: 20,
    marginBottom: 18,
  },

  h2: {
    fontSize: 18,
    margin: "0 0 15px",
  },

  scroll: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    minWidth: 780,
    borderCollapse: "collapse",
    fontSize: 13,
  },

  th: {
    textAlign: "left",
    background: "#f7f7f7",
    color: "#555",
    padding: "12px 10px",
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #eee",
    verticalAlign: "top",
  },

  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 15,
  },

  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  tab: {
    background: "#f4f4f4",
    border: 0,
    borderRadius: 9,
    padding: "9px 12px",
    cursor: "pointer",
    color: "#666",
    fontFamily: "inherit",
  },

  activeTab: {
    background: "#222",
    border: 0,
    borderRadius: 9,
    padding: "9px 12px",
    cursor: "pointer",
    color: "#fff",
    fontWeight: 700,
    fontFamily: "inherit",
  },

  filters: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  input: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "9px 10px",
    fontFamily: "inherit",
  },

  empty: {
    padding: 25,
    textAlign: "center",
    color: "#888",
  },

  note: {
    fontSize: 12,
    color: "#888",
    lineHeight: 1.7,
    margin: "18px 0 0",
  },

  error: {
    background: "#fff4f4",
    color: "#a33",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
};