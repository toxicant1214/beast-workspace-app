import { useState } from "react";
import SemesterSetupPanel from "../components/calendar/SemesterSetupPanel";
import "../components/calendar/calendar.css";

const VIEW_OPTIONS = [
  {
    id: "semester",
    label: "學期總表",
  },
  {
    id: "month",
    label: "月曆",
  },
  {
    id: "manage",
    label: "管理",
  },
];

function CalendarPage() {
  const [activeView, setActiveView] = useState("semester");

  return (
    <section className="calendar-page">
      <header className="calendar-page__header calendar-page__header--workspace">
        <div>
          <p className="calendar-page__eyebrow">CALENDAR</p>
          <h1>學期行事曆</h1>
          <p className="calendar-page__description">
            查看整學期安排、月份行程，並管理學期與學校資料。
          </p>
        </div>
      </header>

      <section className="calendar-workspace">
        <div className="calendar-workspace__topbar">
          <div className="calendar-workspace__semester">
            <div>
              <span className="calendar-workspace__label">目前學期</span>
              <strong>115 學年度上學期</strong>
              <p>2026/08/25－2027/01/20</p>
            </div>

            <span className="semester-status semester-status--draft">
              草稿
            </span>
          </div>

          <nav
            className="calendar-view-tabs"
            aria-label="行事曆檢視方式"
          >
            {VIEW_OPTIONS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`calendar-view-tabs__button ${
                  activeView === view.id
                    ? "calendar-view-tabs__button--active"
                    : ""
                }`}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="calendar-workspace__content">
          {activeView === "semester" && (
            <section className="calendar-view-panel">
              <div className="calendar-placeholder">
                <div className="calendar-placeholder__symbol">▦</div>

                <div>
                  <h2>學期總表</h2>
                  <p>
                    下一步會在這裡建立一學期一張的橫向行事表。
                  </p>
                </div>
              </div>
            </section>
          )}

          {activeView === "month" && (
            <section className="calendar-view-panel">
              <div className="calendar-placeholder">
                <div className="calendar-placeholder__symbol">□</div>

                <div>
                  <h2>月曆檢視</h2>
                  <p>
                    後續會在這裡顯示一般月份月曆與每日行事項目。
                  </p>
                </div>
              </div>
            </section>
          )}

          {activeView === "manage" && (
            <section className="calendar-view-panel calendar-view-panel--manage">
              <SemesterSetupPanel />
            </section>
          )}
        </div>
      </section>
    </section>
  );
}

export default CalendarPage;