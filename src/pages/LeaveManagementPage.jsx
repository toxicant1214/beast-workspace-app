import { useState } from "react";
import "./LeaveManagementPage.css";

const TABS = [
  {
    key: "overview",
    label: "休假總覽",
  },
  {
    key: "records",
    label: "休假登記",
  },
  {
    key: "monthly",
    label: "月報表",
  },
  {
    key: "settings",
    label: "假別／額度設定",
  },
];

function LeaveManagementPage() {
  const [activeTab, setActiveTab] =
    useState("overview");

  function renderOverview() {
    return (
      <section className="leave-section">
        <div>
          <h2>休假總覽</h2>
          <p>
            查看本月與本學期的休假狀況。
          </p>
        </div>

        <div className="leave-summary-grid">
          <div className="leave-summary-card">
            <span>本月休假人數</span>
            <strong>—</strong>
          </div>

          <div className="leave-summary-card">
            <span>本月休假次數</span>
            <strong>—</strong>
          </div>

          <div className="leave-summary-card">
            <span>本月休假時數</span>
            <strong>—</strong>
          </div>

          <div className="leave-summary-card">
            <span>本學期休假時數</span>
            <strong>—</strong>
          </div>
        </div>

        <div className="leave-placeholder">
          <strong>近期休假紀錄</strong>
          <p>
            下一步接上資料後，這裡會顯示最近的休假登記。
          </p>
        </div>
      </section>
    );
  }

  function renderRecords() {
    return (
      <section className="leave-section">
        <div>
          <h2>休假登記</h2>
          <p>
            登記老師或額外人員的休假紀錄。
          </p>
        </div>

        <div className="leave-placeholder">
          <strong>休假紀錄</strong>
          <p>
            之後會在這裡新增、修改及查看每一筆休假。
          </p>
        </div>
      </section>
    );
  }

  function renderMonthlyReport() {
    return (
      <section className="leave-section">
        <div>
          <h2>月報表</h2>
          <p>
            每月統計休假狀況，整理後提供給主管。
          </p>
        </div>

        <div className="leave-placeholder">
          <strong>每月休假統計</strong>
          <p>
            之後可以選擇月份、查看統計、下載 Excel，
            並封存正式送出的版本。
          </p>
        </div>
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className="leave-section">
        <div>
          <h2>假別／額度設定</h2>
          <p>
            管理休假假別與額外統計人員。
          </p>
        </div>

        <div className="leave-placeholder">
          <strong>目前假別</strong>

          <div className="leave-type-list">
            <span>事假</span>
            <span>病假</span>
            <span>特休</span>
            <span>其他</span>
          </div>
        </div>
      </section>
    );
  }

  function renderContent() {
    if (activeTab === "records") {
      return renderRecords();
    }

    if (activeTab === "monthly") {
      return renderMonthlyReport();
    }

    if (activeTab === "settings") {
      return renderSettings();
    }

    return renderOverview();
  }

  return (
    <div className="leave-management-page">
      <div className="leave-page-header">
        <div>
          <p className="leave-page-eyebrow">
            STAFF MANAGEMENT
          </p>

          <h1>休假管理</h1>

          <p>
            統一管理老師休假、月度統計與正式報表。
          </p>
        </div>
      </div>

      <div className="leave-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={
              activeTab === tab.key
                ? "leave-tab leave-tab--active"
                : "leave-tab"
            }
            onClick={() =>
              setActiveTab(tab.key)
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {renderContent()}
    </div>
  );
}

export default LeaveManagementPage;