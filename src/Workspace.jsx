import { useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardPage from "./pages/DashboardPage";
import TaskPage from "./pages/TaskPage";
import StudentPage from "./pages/StudentPage";
import TeacherPage from "./pages/TeacherPage";
import ClassPage from "./pages/ClassPage";
import CoursePage from "./pages/CoursePage";
import CampPage from "./pages/CampPage";
import CalendarPage from "./pages/CalendarPage";
import PickupPage from "./pages/PickupPage";
import LearningReportPage from "./pages/LearningReportPage";
import CampSchedulePage from "./pages/CampSchedulePage";
import CleaningPage from "./pages/CleaningPage";
import LineReminderPage from "./pages/LineReminderPage";
import ScoreAnalysisPage from "./pages/ScoreAnalysisPage";
import "./App.css";

function Workspace() {
  const [activePage, setActivePage] = useState("首頁");

  const pages = [
    "首頁",
    "任務中心",
    "學生資料",
    "老師管理",
    "班級管理",
    "課程管理",
    "營隊管理",
    "行事曆",
    "接送管理",
    "學習報告書",
    "營隊排班",
    "清潔分配",
    "LINE 提醒",
    "成績分析",
  ];

  function renderPage() {
    if (activePage === "首頁") return <DashboardPage />;
    if (activePage === "任務中心") return <TaskPage />;
    if (activePage === "學生資料") return <StudentPage />;
    if (activePage === "老師管理") return <TeacherPage />;
    if (activePage === "班級管理") return <ClassPage />;
    if (activePage === "課程管理") return <CoursePage />;
    if (activePage === "營隊管理") return <CampPage />;
    if (activePage === "行事曆") return <CalendarPage />;
    if (activePage === "接送管理") return <PickupPage />;
    if (activePage === "學習報告書") return <LearningReportPage />;
    if (activePage === "營隊排班") return <CampSchedulePage />;
    if (activePage === "清潔分配") return <CleaningPage />;
    if (activePage === "LINE 提醒") return <LineReminderPage />;
    if (activePage === "成績分析") return <ScoreAnalysisPage />;

    return <DashboardPage />;
  }

  return (
    <div className="workspace">
      <Sidebar
        pages={pages}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main">{renderPage()}</main>
    </div>
  );
}

export default Workspace;