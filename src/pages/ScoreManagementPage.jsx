import {
  useState,
} from "react";

import ScoreEntryPage from "./ScoreEntryPage";


const MENU_ITEMS = [
  {
    key: "entry",
    title: "成績登記",
    description:
      "登記模擬考與學校正式大考成績",
  },
  {
    key: "pending",
    title: "待完成",
    description:
      "查看各班、各科尚未完成的成績與免考申請",
  },
  {
    key: "records",
    title: "成績紀錄",
    description:
      "依學生或考試查詢歷史成績",
  },
  {
    key: "analysis",
    title: "成績分析",
    description:
      "比較模擬考與正式大考的成績差異",
  },
  {
    key: "class-results",
    title: "班級大考成果",
    description:
      "查看各班正式大考的科目平均與完成狀況",
  },
  {
    key: "reports",
    title: "學習報告書",
    description:
      "製作正式期中、期末考學習報告",
  },
  {
    key: "library",
    title: "試卷分析庫",
    description:
      "管理可重複套用的試卷分析內容",
  },
];


export default function ScoreManagementPage({
  currentTeacher,
}) {
  const [
    activeSection,
    setActiveSection,
  ] = useState("home");


  if (
    activeSection === "entry"
  ) {
    return (
      <ScoreEntryPage
        currentTeacher={
          currentTeacher
        }
        onBack={() =>
          setActiveSection(
            "home"
          )
        }
      />
    );
  }


  function handleMenuClick(
    key
  ) {
    if (
      key === "entry"
    ) {
      setActiveSection(
        "entry"
      );

      return;
    }

    /*
     * 其他功能會依序接上。
     * 目前先保留入口，
     * 不讓尚未完成的功能誤跳頁。
     */
  }


  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            BEAST WORKSPACE
          </div>

          <h1 style={styles.title}>
            學生成績
          </h1>

          <p style={styles.subtitle}>
            從成績登記、完成追蹤到正式大考成果與學習報告。
          </p>
        </div>
      </div>


      <div style={styles.grid}>
        {MENU_ITEMS.map(
          (item) => {
            const isAvailable =
              item.key === "entry";

            return (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  handleMenuClick(
                    item.key
                  )
                }
                style={{
                  ...styles.card,
                  ...(!isAvailable
                    ? styles.cardPending
                    : {}),
                }}
              >
                <div
                  style={
                    styles.cardTop
                  }
                >
                  <div
                    style={
                      styles.cardTitle
                    }
                  >
                    {item.title}
                  </div>

                  {!isAvailable && (
                    <span
                      style={
                        styles.pendingTag
                      }
                    >
                      建置中
                    </span>
                  )}
                </div>


                <div
                  style={
                    styles.cardDescription
                  }
                >
                  {
                    item.description
                  }
                </div>


                <div
                  style={
                    styles.arrow
                  }
                >
                  {isAvailable
                    ? "→"
                    : "·"}
                </div>
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}


const styles = {
  page: {
    padding: "32px",
    maxWidth: "1200px",
    margin: "0 auto",
  },

  header: {
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

  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "16px",
  },

  card: {
    position: "relative",
    minHeight: "150px",
    padding: "22px",
    border: "1px solid #e8e8e8",
    borderRadius: "16px",
    background: "#fff",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow:
      "0 3px 14px rgba(0, 0, 0, 0.04)",
  },

  cardPending: {
    cursor: "default",
    opacity: 0.62,
  },

  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: "12px",
  },

  cardTitle: {
    fontSize: "19px",
    fontWeight: "800",
    color: "#222",
  },

  pendingTag: {
    flexShrink: 0,
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f1f1f1",
    color: "#999",
    fontSize: "11px",
    fontWeight: "700",
  },

  cardDescription: {
    maxWidth: "90%",
    marginTop: "10px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#777",
  },

  arrow: {
    position: "absolute",
    right: "20px",
    bottom: "18px",
    fontSize: "20px",
    color: "#aaa",
  },
};