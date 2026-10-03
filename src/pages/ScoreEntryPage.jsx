import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";


const TERM_OPTIONS = [
  "上學期",
  "下學期",
];

const PERIOD_OPTIONS = [
  "期中",
  "期末",
];

const EXAM_TYPE_OPTIONS = [
  {
    value: "MOCK_1",
    label: "模擬考①",
    examType: "MOCK",
    mockNumber: 1,
  },
  {
    value: "MOCK_2",
    label: "模擬考②",
    examType: "MOCK",
    mockNumber: 2,
  },
  {
    value: "OFFICIAL",
    label: "學校正式大考",
    examType: "OFFICIAL",
    mockNumber: null,
  },
];


function getCurrentAcademicYear() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    now.getMonth() + 1;

  const rocYear =
    year - 1911;

  /*
   * 台灣學年度：
   * 8 月起算新學年度。
   */
  if (month >= 8) {
    return String(rocYear);
  }

  return String(
    rocYear - 1
  );
}


function getDefaultTerm() {
  const month =
    new Date().getMonth() + 1;

  /*
   * 8～1 月：上學期
   * 2～7 月：下學期
   */
  if (
    month >= 8 ||
    month === 1
  ) {
    return "上學期";
  }

  return "下學期";
}


export default function ScoreEntryPage({
  onBack,
}) {
  const [
    academicYear,
    setAcademicYear,
  ] = useState(
    getCurrentAcademicYear()
  );

  const [
    term,
    setTerm,
  ] = useState(
    getDefaultTerm()
  );

  const [
    examPeriod,
    setExamPeriod,
  ] = useState("期中");

  const [
    examTypeKey,
    setExamTypeKey,
  ] = useState("MOCK_1");

  const [
    classes,
    setClasses,
  ] = useState([]);

  const [
    selectedClassId,
    setSelectedClassId,
  ] = useState("");

  const [
    loadingClasses,
    setLoadingClasses,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");


  const selectedExamType =
    useMemo(() => {
      return (
        EXAM_TYPE_OPTIONS.find(
          (item) =>
            item.value ===
            examTypeKey
        ) || EXAM_TYPE_OPTIONS[0]
      );
    }, [examTypeKey]);


  useEffect(() => {
    let cancelled = false;


    async function loadClasses() {
      try {
        setLoadingClasses(
          true
        );

        setErrorMessage(
          ""
        );

        setSelectedClassId(
          ""
        );


        let query =
          supabase
            .from("classes")
            .select(
              `
              id,
              name,
              academic_year,
              term,
              course_type,
              is_active
              `
            )
            .eq(
              "academic_year",
              academicYear
            )
            .eq(
              "term",
              term
            );


        /*
         * 成績系統只抓安親班。
         */
        query =
          query.eq(
            "course_type",
            "AFTER_SCHOOL"
          );


        const {
          data,
          error,
        } =
          await query.order(
            "name",
            {
              ascending: true,
            }
          );


        if (error) {
          throw error;
        }


        if (cancelled) {
          return;
        }


        setClasses(
          data || []
        );
      } catch (error) {
        console.error(
          "讀取成績班級失敗：",
          error
        );


        if (!cancelled) {
          setClasses(
            []
          );

          setErrorMessage(
            "班級資料讀取失敗，請稍後再試。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingClasses(
            false
          );
        }
      }
    }


    if (
      academicYear &&
      term
    ) {
      loadClasses();
    }


    return () => {
      cancelled = true;
    };
  }, [
    academicYear,
    term,
  ]);


  const academicYearOptions =
    useMemo(() => {
      const current =
        Number(
          getCurrentAcademicYear()
        );

      return [
        current - 2,
        current - 1,
        current,
        current + 1,
      ].map(String);
    }, []);


  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <div style={styles.eyebrow}>
            BEAST WORKSPACE
          </div>

          <h1 style={styles.title}>
            成績登記
          </h1>

          <p style={styles.subtitle}>
            選擇考試與班級後，進入班級成績登記。
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          style={styles.backButton}
        >
          ← 返回學生成績
        </button>
      </div>


      <section style={styles.panel}>
        <div style={styles.sectionTitle}>
          選擇考試
        </div>


        <div style={styles.formGrid}>
          <label style={styles.field}>
            <span style={styles.label}>
              學年度
            </span>

            <select
              value={academicYear}
              onChange={(event) =>
                setAcademicYear(
                  event.target.value
                )
              }
              style={styles.select}
            >
              {academicYearOptions.map(
                (year) => (
                  <option
                    key={year}
                    value={year}
                  >
                    {year} 學年度
                  </option>
                )
              )}
            </select>
          </label>


          <label style={styles.field}>
            <span style={styles.label}>
              學期
            </span>

            <select
              value={term}
              onChange={(event) =>
                setTerm(
                  event.target.value
                )
              }
              style={styles.select}
            >
              {TERM_OPTIONS.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                )
              )}
            </select>
          </label>


          <label style={styles.field}>
            <span style={styles.label}>
              考試
            </span>

            <select
              value={examPeriod}
              onChange={(event) =>
                setExamPeriod(
                  event.target.value
                )
              }
              style={styles.select}
            >
              {PERIOD_OPTIONS.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                )
              )}
            </select>
          </label>


          <label style={styles.field}>
            <span style={styles.label}>
              考試類型
            </span>

            <select
              value={examTypeKey}
              onChange={(event) =>
                setExamTypeKey(
                  event.target.value
                )
              }
              style={styles.select}
            >
              {EXAM_TYPE_OPTIONS.map(
                (item) => (
                  <option
                    key={item.value}
                    value={item.value}
                  >
                    {item.label}
                  </option>
                )
              )}
            </select>
          </label>
        </div>


        <div style={styles.summary}>
          <span style={styles.summaryLabel}>
            目前選擇
          </span>

          <strong>
            {academicYear} 學年度・
            {term}・
            {examPeriod}・
            {selectedExamType.label}
          </strong>
        </div>
      </section>


      <section style={styles.panel}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.sectionTitle}>
              選擇班級
            </div>

            <div style={styles.sectionHint}>
              班級依目前選擇的學年度與學期載入。
            </div>
          </div>

          {!loadingClasses && (
            <div style={styles.classCount}>
              {classes.length} 班
            </div>
          )}
        </div>


        {loadingClasses && (
          <div style={styles.emptyState}>
            正在讀取班級…
          </div>
        )}


        {!loadingClasses &&
          errorMessage && (
            <div style={styles.errorState}>
              {errorMessage}
            </div>
          )}


        {!loadingClasses &&
          !errorMessage &&
          classes.length === 0 && (
            <div style={styles.emptyState}>
              這個學年度／學期目前沒有可用的安親班級。
            </div>
          )}


        {!loadingClasses &&
          !errorMessage &&
          classes.length > 0 && (
            <div style={styles.classGrid}>
              {classes.map(
                (classItem) => {
                  const selected =
                    selectedClassId ===
                    classItem.id;

                  return (
                    <button
                      key={
                        classItem.id
                      }
                      type="button"
                      onClick={() =>
                        setSelectedClassId(
                          classItem.id
                        )
                      }
                      style={{
                        ...styles.classCard,
                        ...(selected
                          ? styles.classCardSelected
                          : {}),
                      }}
                    >
                      <div
                        style={
                          styles.className
                        }
                      >
                        {
                          classItem.name
                        }
                      </div>

                      <div
                        style={
                          styles.classMeta
                        }
                      >
                        {classItem.is_active
                          ? "使用中"
                          : "歷史班級"}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}


        <div style={styles.actionRow}>
          <button
            type="button"
            disabled={
              !selectedClassId
            }
            style={{
              ...styles.primaryButton,
              ...(!selectedClassId
                ? styles.primaryButtonDisabled
                : {}),
            }}
          >
            進入成績登記 →
          </button>
        </div>
      </section>
    </div>
  );
}


const styles = {
  page: {
    padding: "32px",
    maxWidth: "1200px",
    margin: "0 auto",
  },

  topRow: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "28px",
  },

  eyebrow: {
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.14em",
    color: "#888",
    marginBottom: "8px",
  },

  title: {
    margin: 0,
    fontSize: "32px",
    fontWeight: "800",
    color: "#222",
  },

  subtitle: {
    margin: "10px 0 0",
    color: "#777",
    fontSize: "15px",
    lineHeight: 1.6,
  },

  backButton: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "#555",
  },

  panel: {
    background: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: "18px",
    padding: "24px",
    marginBottom: "18px",
    boxShadow:
      "0 3px 14px rgba(0, 0, 0, 0.035)",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent:
      "space-between",
    gap: "16px",
    marginBottom: "20px",
  },

  sectionTitle: {
    fontSize: "18px",
    fontWeight: "800",
    color: "#222",
    marginBottom: "18px",
  },

  sectionHint: {
    marginTop: "-10px",
    fontSize: "13px",
    color: "#888",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },

  label: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#555",
  },

  select: {
    width: "100%",
    minHeight: "44px",
    padding: "0 12px",
    border: "1px solid #ddd",
    borderRadius: "10px",
    background: "#fff",
    fontFamily: "inherit",
    fontSize: "14px",
    color: "#333",
  },

  summary: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: "20px",
    padding: "13px 15px",
    borderRadius: "10px",
    background: "#f7f7f7",
    color: "#333",
    fontSize: "14px",
  },

  summaryLabel: {
    color: "#888",
  },

  classCount: {
    fontSize: "13px",
    color: "#888",
  },

  classGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },

  classCard: {
    padding: "18px",
    border: "1px solid #e2e2e2",
    borderRadius: "12px",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },

  classCardSelected: {
    border: "2px solid #333",
    padding: "17px",
    background: "#fafafa",
  },

  className: {
    fontSize: "17px",
    fontWeight: "800",
    color: "#222",
  },

  classMeta: {
    marginTop: "7px",
    fontSize: "12px",
    color: "#999",
  },

  emptyState: {
    padding: "32px 16px",
    textAlign: "center",
    color: "#888",
    background: "#fafafa",
    borderRadius: "12px",
  },

  errorState: {
    padding: "16px",
    color: "#9c3b3b",
    background: "#fff5f5",
    borderRadius: "10px",
  },

  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "22px",
  },

  primaryButton: {
    minHeight: "44px",
    padding: "0 20px",
    border: 0,
    borderRadius: "10px",
    background: "#222",
    color: "#fff",
    fontWeight: "800",
    fontFamily: "inherit",
    cursor: "pointer",
  },

  primaryButtonDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
};