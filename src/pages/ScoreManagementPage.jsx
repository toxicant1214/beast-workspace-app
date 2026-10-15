import { useState } from "react";
import ScoreEntryPage from "./ScoreEntryPage";
import ScorePendingPage from "./ScorePendingPage";

const TABS = [
  { key: "manage", label: "成績管理" },
  { key: "analysis", label: "查詢與分析" },
  { key: "resources", label: "報告與資源" },
];

const MANAGE_ITEMS = [
  {
    key: "entry",
    title: "成績登記",
    description: "建立考試、選擇班級，輸入模擬考與正式大考成績。",
    detail: "成績輸入・免考申請",
  },
  {
    key: "pending",
    title: "登記進度與免考審核",
    description: "只查看尚未完成的考試與班級，並處理免考申請。",
    detail: "待完成追蹤・主管審核",
  },
];

export default function ScoreManagementPage({ currentTeacher }) {
  const [activeTab, setActiveTab] = useState("manage");
  const [manageView, setManageView] = useState("overview");

  function changeTab(key) {
    setActiveTab(key);
    if (key === "manage") setManageView("overview");
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.eyebrow}>BEAST WORKSPACE</div>
        <h1 style={styles.title}>學生成績</h1>
        <p style={styles.subtitle}>成績登記、學習追蹤與教學成果管理</p>
      </header>

      <nav style={styles.tabs} aria-label="學生成績功能分類">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => changeTab(tab.key)}
            aria-current={activeTab === tab.key ? "page" : undefined}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.activeTab : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "manage" && (
        <section>
          {manageView === "overview" ? (
            <>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>成績管理</h2>
                <p style={styles.sectionDescription}>
                  登記成績、追蹤未完成科目，以及管理模擬考免考申請。
                </p>
              </div>
              <div style={styles.cardGrid}>
                {MANAGE_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setManageView(item.key)}
                    style={styles.card}
                  >
                    <div style={styles.cardTop}>
                      <span style={styles.cardTitle}>{item.title}</span>
                      <span style={styles.arrow}>→</span>
                    </div>
                    <p style={styles.cardDescription}>{item.description}</p>
                    <span style={styles.cardDetail}>{item.detail}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div>
              <div style={styles.breadcrumbRow}>
                <button
                  type="button"
                  style={styles.backButton}
                  onClick={() => setManageView("overview")}
                >
                  ← 成績管理
                </button>
                <span style={styles.breadcrumbLabel}>
                  {manageView === "entry" ? "成績登記" : "登記進度與免考審核"}
                </span>
              </div>
              {manageView === "entry" ? (
                <ScoreEntryPage
                  currentTeacher={currentTeacher}
                  onBack={() => setManageView("overview")}
                />
              ) : (
                <ScorePendingPage
                  currentTeacher={currentTeacher}
                  onBack={() => setManageView("overview")}
                />
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "analysis" && (
        <section>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>成績查詢與分析</h2>
            <p style={styles.sectionDescription}>
              未來可在同一頁查詢歷次成績、學生進退步及班級大考成果。
            </p>
          </div>
          <div style={styles.placeholderGrid}>
            <Feature title="成績紀錄" description="依學生、班級或考期查看歷次成績。" />
            <Feature title="成績分析" description="比較模擬考與正式大考的表現差異。" />
            <Feature title="班級大考成果" description="查看各班各科平均與整體成果。" />
          </div>
        </section>
      )}

      {activeTab === "resources" && (
        <section>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>報告與教學資源</h2>
            <p style={styles.sectionDescription}>
              集中管理學習報告書，以及可重複使用的試卷分析內容。
            </p>
          </div>
          <div style={styles.placeholderGrid}>
            <Feature title="學習報告書" description="結合成績與教學分析製作學習報告。" />
            <Feature title="試卷分析庫" description="建立、編輯及重複使用試卷分析內容。" />
          </div>
        </section>
      )}
    </div>
  );
}

function Feature({ title, description }) {
  return (
    <div style={styles.placeholderCard}>
      <div style={styles.cardTop}>
        <span style={styles.cardTitle}>{title}</span>
        <span style={styles.buildingTag}>建置中</span>
      </div>
      <p style={styles.cardDescription}>{description}</p>
    </div>
  );
}

const styles = {
  page: {
    padding: "32px",
    maxWidth: "1200px",
    margin: "0 auto",
    color: "#222",
    fontFamily: "inherit",
  },
  header: { marginBottom: "28px" },
  eyebrow: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: "#888",
    marginBottom: "8px",
  },
  title: { margin: 0, fontSize: "32px", fontWeight: 800 },
  subtitle: { margin: "10px 0 0", color: "#777", fontSize: "15px", lineHeight: 1.6 },
  tabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    borderBottom: "1px solid #e6e6e6",
    marginBottom: "28px",
    paddingBottom: "10px",
  },
  tab: {
    border: "1px solid transparent",
    borderRadius: "10px",
    background: "transparent",
    color: "#666",
    padding: "12px 20px",
    fontSize: "15px",
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  activeTab: { background: "#242424", color: "#fff" },
  sectionHeader: { marginBottom: "22px" },
  sectionTitle: { fontSize: "23px", fontWeight: 800, margin: "0 0 8px" },
  sectionDescription: { margin: 0, color: "#888", fontSize: "14px", lineHeight: 1.7 },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
    gap: "16px",
  },
  card: {
    padding: "24px",
    border: "1px solid #e7e7e7",
    borderRadius: "16px",
    background: "#fff",
    textAlign: "left",
    fontFamily: "inherit",
    cursor: "pointer",
    boxShadow: "0 3px 14px rgba(0,0,0,.035)",
    minHeight: "165px",
  },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  cardTitle: { fontSize: "19px", fontWeight: 800, color: "#222" },
  arrow: { color: "#aaa", fontSize: "22px" },
  cardDescription: { fontSize: "14px", lineHeight: 1.7, color: "#777", margin: "12px 0 16px" },
  cardDetail: { fontSize: "12px", color: "#999", fontWeight: 600 },
  breadcrumbRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "8px" },
  backButton: {
    background: "#fff",
    border: "1px solid #e2e2e2",
    borderRadius: "9px",
    padding: "9px 14px",
    fontFamily: "inherit",
    cursor: "pointer",
    color: "#555",
  },
  breadcrumbLabel: { fontSize: "13px", color: "#999" },
  placeholderGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "16px",
  },
  placeholderCard: {
    padding: "24px",
    border: "1px solid #e9e9e9",
    borderRadius: "16px",
    background: "#fff",
    opacity: 0.78,
  },
  buildingTag: {
    fontSize: "11px",
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#f3f3f3",
    color: "#999",
    whiteSpace: "nowrap",
  },
};
