import {
  useEffect,
  useMemo,
  useState,
} from "react";

import PickupRulesPanel from "../components/pickup/PickupRulesPanel";
import PickupClosuresPanel from "../components/pickup/PickupClosuresPanel";
import PickupStaffPanel from "../components/pickup/PickupStaffPanel";
import PickupStudentRulesPanel from "../components/pickup/PickupStudentRulesPanel";
import MonthlyPickupPanel from "../components/pickup/MonthlyPickupPanel";
import TodayPickupPanel from "../components/pickup/TodayPickupPanel";
import { usePagePermission } from "../hooks/usePagePermission";
import "../App.css";

const PICKUP_TABS = [
  {
    key: "today",
    label: "接車查詢",
    description: "查看指定日期各學校的接車時間與負責老師",
  },
  {
    key: "monthly",
    label: "月接車表",
    description: "查看每月各校學生的接車安排與列印點名表",
    editOnly: true,
  },
  {
    key: "studentRules",
    label: "學生接送設定",
    description: "設定學生每週固定接送日與單日臨時例外",
    editOnly: true,
  },
  {
    key: "rules",
    label: "接車規則",
    description: "設定各學校與年級群組的固定放學時間",
    adminOnly: true,
  },
  {
    key: "staff",
    label: "接車老師",
    description: "設定各學校與時段的學期固定接車老師",
    adminOnly: true,
  },
  {
    key: "exceptions",
    label: "停接安排",
    description: "管理全體停接與指定學校停接日期",
    editOnly: true,
  },
];

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey, amount) {
  const [year, month, day] = dateKey
    .split("-")
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );

  date.setDate(
    date.getDate() + amount
  );

  return getLocalDateKey(date);
}

function formatDisplayDate(dateKey) {
  if (!dateKey) return "";

  const [year, month, day] = dateKey
    .split("-")
    .map(Number);

  return `${year}/${String(month).padStart(
    2,
    "0"
  )}/${String(day).padStart(2, "0")}`;
}

function PickupPage({
  currentTeacher,
}) {
  const [activeTab, setActiveTab] =
    useState("today");

  const [selectedDate, setSelectedDate] =
    useState(() => getLocalDateKey());

  const {
    canEdit,
    isViewOnly,
    isAdmin,
  } = usePagePermission(
    currentTeacher,
    "pickup"
  );

  const visibleTabs = useMemo(() => {
    return PICKUP_TABS.filter((tab) => {
      if (tab.adminOnly) {
        return isAdmin;
      }

      if (tab.editOnly) {
        return canEdit;
      }

      return true;
    });
  }, [canEdit, isAdmin]);

  useEffect(() => {
    const canAccessActiveTab =
      visibleTabs.some(
        (tab) => tab.key === activeTab
      );

    if (!canAccessActiveTab) {
      setActiveTab("today");
    }
  }, [visibleTabs, activeTab]);

  const currentTab =
    visibleTabs.find(
      (tab) => tab.key === activeTab
    ) || visibleTabs[0];

  function goPreviousDay() {
    setSelectedDate((current) =>
      shiftDateKey(current, -1)
    );
  }

  function goNextDay() {
    setSelectedDate((current) =>
      shiftDateKey(current, 1)
    );
  }

  function goToday() {
    setSelectedDate(
      getLocalDateKey()
    );
  }

  function renderTabContent() {
    if (activeTab === "today") {
      return (
        <TodayPickupPanel
          selectedDate={selectedDate}
        />
      );
    }

    if (
      activeTab === "monthly" &&
      canEdit
    ) {
      return <MonthlyPickupPanel />;
    }

    if (
      activeTab === "studentRules" &&
      canEdit
    ) {
      return <PickupStudentRulesPanel />;
    }

    if (
      activeTab === "rules" &&
      isAdmin
    ) {
      return <PickupRulesPanel />;
    }

    if (
      activeTab === "staff" &&
      isAdmin
    ) {
      return <PickupStaffPanel />;
    }

    if (
      activeTab === "exceptions" &&
      canEdit
    ) {
      return <PickupClosuresPanel />;
    }

    return (
      <TodayPickupPanel
        selectedDate={selectedDate}
      />
    );
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
            {isViewOnly
              ? "查看指定日期各學校的接車時間與負責老師。"
              : isAdmin
              ? "管理固定接車時間、學生特殊接送、接車老師、停接日期與每月接車安排。"
              : "查看指定日期接車、月接車表，並管理學生特殊接送與停接安排。"}
          </p>
        </div>
      </header>

      <nav
        className="pickupTabs"
        aria-label="接送管理功能"
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={
              activeTab === tab.key
                ? "pickupTab active"
                : "pickupTab"
            }
            onClick={() =>
              setActiveTab(tab.key)
            }
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

        {activeTab === "today" && (
          <div className="pickupDateNavigator">
            <button
              type="button"
              className="pickupDateNavigator__arrow"
              onClick={goPreviousDay}
            >
              ← 前一天
            </button>

            <label className="pickupDateNavigator__picker">
              <span>查詢日期</span>

              <input
                type="date"
                value={selectedDate}
                onChange={(event) =>
                  setSelectedDate(
                    event.target.value
                  )
                }
              />
            </label>

            <button
              type="button"
              className="pickupDateNavigator__today"
              onClick={goToday}
            >
              今天
            </button>

            <button
              type="button"
              className="pickupDateNavigator__arrow"
              onClick={goNextDay}
            >
              後一天 →
            </button>
          </div>
        )}
      </div>

      {activeTab === "today" && (
        <div className="pickupSelectedDate">
          目前查看：
          <strong>
            {formatDisplayDate(
              selectedDate
            )}
          </strong>
        </div>
      )}

      {renderTabContent()}
    </div>
  );
}

export default PickupPage;