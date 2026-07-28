import { useState } from "react";
import PickupRulesPanel from "../components/pickup/PickupRulesPanel";
import PickupClosuresPanel from "../components/pickup/PickupClosuresPanel";
import PickupStaffPanel from "../components/pickup/PickupStaffPanel";
import "../App.css";

const PICKUP_TABS = [
  {
    key: "today",
    label: "今日接車",
    description: "查看今天各學校的接車時間與負責老師",
  },
  {
    key: "monthly",
    label: "月接車表",
    description: "產生每月學生接車名單並列印或輸出",
  },
  {
    key: "rules",
    label: "接車規則",
    description: "設定各學校與年級群組的固定放學時間",
  },
  {
    key: "staff",
    label: "接車老師",
    description: "設定各學校與時段的學期固定接車老師",
  },
  {
    key: "exceptions",
    label: "停接安排",
    description: "管理全體停接與指定學校停接日期",
  },
];

function PickupPage() {
  const [activeTab, setActiveTab] = useState("today");

  const currentTab = PICKUP_TABS.find(
    (tab) => tab.key === activeTab
  );

  function renderTabContent() {
    if (activeTab === "today") {
      return (
        <section className="pickupPanel">
          <div className="pickupEmptyState">
            <span className="pickupEmptyState__icon">
              🚌
            </span>

            <h2>今日接車安排</h2>

            <p>
              系統將依照接車規則、固定接車老師與停接安排，
              整理今天各學校的接車時間與負責老師。
            </p>
          </div>
        </section>
      );
    }

    if (activeTab === "monthly") {
      return (
        <section className="pickupPanel">
          <div className="pickupEmptyState">
            <span className="pickupEmptyState__icon">
              🗓️
            </span>

            <h2>月接車表</h2>

            <p>
              這裡將產生 A4 橫式月接車表，並支援列印、
              儲存 PDF 與輸出高解析度圖片。
            </p>
          </div>
        </section>
      );
    }

    if (activeTab === "rules") {
      return <PickupRulesPanel />;
    }

    if (activeTab === "staff") {
      return <PickupStaffPanel />;
    }

    if (activeTab === "exceptions") {
      return <PickupClosuresPanel />;
    }

    return null;
  }

  return (
    <div className="pickupPage">
      <header className="pickupPageHeader">
        <div>
          <p className="eyebrow">
            PICKUP MANAGEMENT
          </p>

          <h1>接送管理</h1>

          <p className="summary">
            管理固定接車時間、接車老師、停接日期與每月接車表。
          </p>
        </div>
      </header>

      <nav
        className="pickupTabs"
        aria-label="接送管理功能"
      >
        {PICKUP_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={
              activeTab === tab.key
                ? "pickupTab active"
                : "pickupTab"
            }
            onClick={() => setActiveTab(tab.key)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.description}</span>
          </button>
        ))}
      </nav>

      <div className="pickupCurrentSection">
        <div>
          <p className="eyebrow">
            CURRENT SECTION
          </p>

          <h2>{currentTab?.label}</h2>
        </div>
      </div>

      {renderTabContent()}
    </div>
  );
}

export default PickupPage;