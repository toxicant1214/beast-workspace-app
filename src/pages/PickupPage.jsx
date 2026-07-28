import { useState } from "react";
import PickupRulesPanel from "../components/pickup/PickupRulesPanel";
import PickupClosuresPanel from "../components/pickup/PickupClosuresPanel";
import "../App.css";

const PICKUP_TABS = [
  {
    key: "today",
    label: "今日接車",
    description: "查看今天實際需要接送的學生名單",
  },
  {
    key: "monthly",
    label: "月接車表",
    description: "產生每月接車名單並列印或輸出",
  },
  {
    key: "rules",
    label: "接車規則",
    description: "設定各學校、年級與星期的固定接車時段",
  },
  {
    key: "exceptions",
    label: "停接與例外",
    description: "管理學生個別不接與學校停課安排",
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

            <h2>今日接車名單</h2>

            <p>
              完成接車規則設定後，系統會依照學生資料、學校、
              年級與例外紀錄，自動產生今天的實際接車名單。
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
            建立固定接車規則，並自動整理每日與每月接車名單。
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