import { useState } from "react";

import CampStudentsPanel from "../components/camp/CampStudentsPanel";
import CampPeriodsPanel from "../components/camp/CampPeriodsPanel";
import CampPeriodStudentsPanel from "../components/camp/CampPeriodStudentsPanel";
import CampDailyRegistrationPanel from "../components/camp/CampDailyRegistrationPanel";

const STATUS_LABELS = {
  PLANNING: "規劃中",
  ACTIVE: "進行中",
  ARCHIVED: "已封存",
};

function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = String(dateString).split("-");
  return `${year}/${month}/${day}`;
}

function CampDetailPage({ camp, onBack }) {
  const [activeSection, setActiveSection] = useState("folder");

  if (activeSection === "students") {
    return (
      <CampStudentsPanel
        camp={camp}
        onBack={() => setActiveSection("folder")}
      />
    );
  }

  if (activeSection === "periods") {
    return (
      <CampPeriodsPanel
        camp={camp}
        onBack={() => setActiveSection("folder")}
      />
    );
  }

  if (activeSection === "periodStudents") {
    return (
      <CampPeriodStudentsPanel
        camp={camp}
        onBack={() => setActiveSection("folder")}
      />
    );
  }

  if (activeSection === "daily") {
    return (
      <CampDailyRegistrationPanel
        camp={camp}
        onBack={() => setActiveSection("folder")}
      />
    );
  }

  const sections = [
    {
      key: "students",
      title: "學生總名單",
      description: "管理這次營隊會使用的學生基本資料。",
      ready: true,
    },
    {
      key: "periods",
      title: "活動梯次",
      description: "建立梯次、起迄日期，並設定每天的課程類型。",
      ready: true,
    },
    {
      key: "periodStudents",
      title: "梯次學生",
      description: "先選梯次，再從學生總名單勾選這一梯有哪些學生。",
      ready: true,
    },
    {
      key: "daily",
      title: "每日報名",
      description: "選梯次與學生，再安排每天上午、下午、午餐、才藝與請假。",
      ready: true,
    },
    {
      key: "classes",
      title: "營隊編班",
      description: "建立編班區間並安排各班學生。",
      ready: false,
    },
    {
      key: "staff",
      title: "工作人員",
      description: "建立這次營隊自己的工作人員與請假資料。",
      ready: false,
    },
    {
      key: "schedule",
      title: "人員排班",
      description: "安排主帶、助教、特殊任務與每日班別。",
      ready: false,
    },
    {
      key: "cleaning",
      title: "清潔與工作安排",
      description: "設定這次營隊的清潔項目與每日輪值。",
      ready: false,
    },
    {
      key: "export",
      title: "輸出",
      description: "產出點名表、工作人員班表與營隊總表。",
      ready: false,
    },
  ];

  return (
    <div className="campPage">
      <button
        type="button"
        className="campBackButton"
        onClick={onBack}
      >
        ← 返回營隊列表
      </button>

      <header className="campDetailHeader">
        <div>
          <p className="campEyebrow">CAMP FOLDER</p>
          <h1>{camp.name}</h1>
          <p>
            {formatDate(camp.start_date)}
            {" — "}
            {formatDate(camp.end_date)}
          </p>
        </div>

        <span className="campDetailHeader__status">
          {STATUS_LABELS[camp.status] || camp.status}
        </span>
      </header>

      <section className="campDetailIntro">
        <strong>這是一個獨立營隊資料夾</strong>
        <p>
          學生、活動梯次、梯次名單、每日報名、編班、工作人員、
          排班與清潔資料都只屬於這次營隊。
        </p>
      </section>

      <section className="campSectionGrid">
        {sections.map((section) => (
          <article
            key={section.key}
            className={[
              "campSectionCard",
              section.ready ? "campSectionCard--ready" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="campSectionCard__dot" />
            <h2>{section.title}</h2>
            <p>{section.description}</p>

            {section.ready ? (
              <button
                type="button"
                className="campSectionCard__open"
                onClick={() => setActiveSection(section.key)}
              >
                進入管理 →
              </button>
            ) : (
              <button type="button" disabled>
                即將建立
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

export default CampDetailPage;