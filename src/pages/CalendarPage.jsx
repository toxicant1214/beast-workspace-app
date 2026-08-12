import { useEffect, useState } from "react";
import SemesterSetupPanel from "../components/calendar/SemesterSetupPanel";
import SemesterTableView from "../components/calendar/SemesterTableView";
import { usePagePermission } from "../hooks/usePagePermission";
import MonthCalendarView from "../components/calendar/MonthCalendarView";
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
    editOnly: true,
  },
];


const CURRENT_SEMESTER = {
  id: "cd88fd29-fb4c-41b0-8e69-6007f9c76db7",
  name: "115 學年度上學期",
  startDate: "2026-08-25",
  endDate: "2027-01-20",
  status: "DRAFT",
};


function CalendarPage({ currentTeacher }) {
  const [activeView, setActiveView] = useState("semester");

  const {
    canEdit,
    isViewOnly,
  } = usePagePermission(
    currentTeacher,
    "calendar"
  );


  const visibleViews = VIEW_OPTIONS.filter(
    (view) => !view.editOnly || canEdit
  );


  useEffect(() => {
    if (!canEdit && activeView === "manage") {
      setActiveView("semester");
    }
  }, [canEdit, activeView]);


  return (
    <section className="calendar-page">
      <header className="calendar-page__header calendar-page__header--workspace">
        <div>
          <p className="calendar-page__eyebrow">
            CALENDAR
          </p>

          <h1>學期行事曆</h1>

          <p className="calendar-page__description">
            查看整學期安排、月份行程
            {canEdit
              ? "，並管理學期與學校資料。"
              : "。"}
          </p>

          {isViewOnly && (
            <p className="calendar-page__description">
              目前為僅查看權限。
            </p>
          )}
        </div>
      </header>


      <section className="calendar-workspace">
        <div className="calendar-workspace__topbar">
          <div className="calendar-workspace__semester">
            <div>
              <span className="calendar-workspace__label">
                目前學期
              </span>

              <strong>
                {CURRENT_SEMESTER.name}
              </strong>

              <p>
                {CURRENT_SEMESTER.startDate.replaceAll("-", "/")}
                －
                {CURRENT_SEMESTER.endDate.replaceAll("-", "/")}
              </p>
            </div>

            <span className="semester-status semester-status--draft">
              草稿
            </span>
          </div>


          <nav
            className="calendar-view-tabs"
            aria-label="行事曆檢視方式"
          >
            {visibleViews.map((view) => (
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
            <SemesterTableView
              semesterId={CURRENT_SEMESTER.id}
              semesterName={CURRENT_SEMESTER.name}
              startDate={CURRENT_SEMESTER.startDate}
              endDate={CURRENT_SEMESTER.endDate}
              canEdit={canEdit}
            />
          )}


          {activeView === "month" && (
  <MonthCalendarView
    semesterId={
      CURRENT_SEMESTER.id
    }
    semesterStartDate={
      CURRENT_SEMESTER.startDate
    }
    semesterEndDate={
      CURRENT_SEMESTER.endDate
    }
    canEdit={canEdit}
  />
)}


          {activeView === "manage" && canEdit && (
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