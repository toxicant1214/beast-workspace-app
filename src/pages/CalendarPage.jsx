import SemesterSetupPanel from "../components/calendar/SemesterSetupPanel";
import "../components/calendar/calendar.css";

function CalendarPage() {
  return (
    <section className="calendar-page">
      <header className="calendar-page__header">
        <div>
          <p className="calendar-page__eyebrow">SEMESTER PLANNER</p>
          <h1>學期規劃</h1>
          <p className="calendar-page__description">
            先建立學期，後續再逐步補上放假日、各校日程與固定事項。
          </p>
        </div>
      </header>

      <SemesterSetupPanel />
    </section>
  );
}

export default CalendarPage;