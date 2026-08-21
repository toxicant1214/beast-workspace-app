import { useState } from "react";

import CampStudentsPanel from "../components/camp/CampStudentsPanel";
import CampPeriodsPanel from "../components/camp/CampPeriodsPanel";
import CampDailyRegistrationPanel from "../components/camp/CampDailyRegistrationPanel";
import CampClassesPanel from "../components/camp/CampClassesPanel";
import CampRollCallPanel from "../components/camp/CampRollCallPanel";
import CampFormModal from "../components/camp/CampFormModal";

const STATUS_LABELS = {
  PLANNING: "規劃中",
  ACTIVE: "進行中",
  ARCHIVED: "已封存",
};

const STUDENT_ITEMS = [
  ["students", "學生總名單", true],
  ["periods", "活動梯次", true],
  ["daily", "每日報名", true],
  ["classes", "營隊編班", true],
  ["rollcall", "點名表", true],
];

const TEACHER_ITEMS = [
  ["staff", "工作人員", false],
  ["schedule", "人員排班", false],
  ["leave", "請假登記", false],
  ["special", "特殊任務", false],
  ["cleaning", "清潔安排", false],
  ["teacherExport", "教師班表", false],
];

function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = String(dateString).split("-");
  return `${year}/${month}/${day}`;
}

function CampDetailPage({ camp, onBack, onUpdateCamp }) {
  const [workspace, setWorkspace] = useState("student");
  const [activeSection, setActiveSection] = useState("students");
  const [isEditCampOpen, setIsEditCampOpen] = useState(false);

  const items = workspace === "student" ? STUDENT_ITEMS : TEACHER_ITEMS;

  function switchWorkspace(next) {
    setWorkspace(next);
    setActiveSection(next === "student" ? "students" : "staff");
  }

  function renderContent() {
    if (workspace === "student") {
      if (activeSection === "students") {
        return <CampStudentsPanel camp={camp} onBack={() => {}} />;
      }

      if (activeSection === "periods") {
        return <CampPeriodsPanel camp={camp} onBack={() => {}} />;
      }

      if (activeSection === "daily") {
        return <CampDailyRegistrationPanel camp={camp} onBack={() => {}} />;
      }

      if (activeSection === "classes") {
        return <CampClassesPanel camp={camp} onBack={() => {}} />;
      }

      if (activeSection === "rollcall") {
        return <CampRollCallPanel camp={camp} onBack={() => {}} />;
      }
    }

    const current = items.find(([key]) => key === activeSection);

    return (
      <div
        style={{
          minHeight: 420,
          border: "1px dashed #ddd1c3",
          borderRadius: 18,
          background: "#fffdfa",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          padding: 32,
        }}
      >
        <div>
          <strong style={{ fontSize: 24 }}>
            {current?.[1] || "功能"}
          </strong>
          <p style={{ opacity: 0.62, marginTop: 10 }}>
            這個功能下一步建立。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fbf8f3",
        display: "grid",
        gridTemplateColumns: "250px minmax(0, 1fr)",
      }}
    >
      <aside
        style={{
          background: "#fffdfa",
          borderRight: "1px solid #e7dfd4",
          padding: "24px 18px",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          className="campBackButton"
          onClick={onBack}
          style={{ width: "100%", marginBottom: 22 }}
        >
          ← 返回營隊列表
        </button>

        <div style={{ padding: "0 8px 20px", borderBottom: "1px solid #eee7dd" }}>
          <p className="campEyebrow" style={{ marginBottom: 6 }}>
            CAMP FOLDER
          </p>

          <strong style={{ display: "block", fontSize: 22 }}>
            {camp.name}
          </strong>

          <small style={{ opacity: 0.6 }}>
            {formatDate(camp.start_date)} — {formatDate(camp.end_date)}
          </small>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            margin: "18px 0",
          }}
        >
          {[
            ["student", "學生作業"],
            ["teacher", "教師作業"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchWorkspace(key)}
              style={{
                border: "1px solid #dfd6ca",
                borderRadius: 12,
                padding: "10px 8px",
                cursor: "pointer",
                fontWeight: 700,
                background: workspace === key ? "#5b5147" : "#fffdfa",
                color: workspace === key ? "#fff" : "#5b5147",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <nav style={{ display: "grid", gap: 5 }}>
          {items.map(([key, label, ready], index) => {
            const active = activeSection === key;

            return (
              <button
                key={key}
                type="button"
                disabled={!ready}
                onClick={() => ready && setActiveSection(key)}
                style={{
                  border: 0,
                  borderRadius: 12,
                  padding: "13px 14px",
                  textAlign: "left",
                  background: active ? "#f0ebe4" : "transparent",
                  color: ready ? "#4f473f" : "#aaa098",
                  cursor: ready ? "pointer" : "default",
                  opacity: ready ? 1 : 0.72,
                }}
              >
                <strong>
                  {index + 1}. {label}
                </strong>
                {!ready && (
                  <small style={{ display: "block", marginTop: 4 }}>
                    即將建立
                  </small>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <main style={{ minWidth: 0, padding: "28px 34px 48px" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "flex-start",
            paddingBottom: 18,
            borderBottom: "1px solid #e7dfd4",
            marginBottom: 22,
          }}
        >
          <div>
            <p className="campEyebrow" style={{ marginBottom: 6 }}>
              {workspace === "student" ? "STUDENT WORKSPACE" : "TEACHER WORKSPACE"}
            </p>

            <h1 style={{ margin: 0 }}>
              {workspace === "student" ? "學生作業" : "教師作業"}
            </h1>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="campDetailHeader__status">
              {STATUS_LABELS[camp.status] || camp.status}
            </span>

            <button
              type="button"
              className="campSecondaryButton"
              onClick={() => setIsEditCampOpen(true)}
            >
              編輯營隊資料
            </button>
          </div>
        </header>

        {renderContent()}
      </main>

      <CampFormModal
        isOpen={isEditCampOpen}
        onClose={() => setIsEditCampOpen(false)}
        onSubmit={onUpdateCamp}
        camp={camp}
        mode="edit"
      />
    </div>
  );
}

export default CampDetailPage;