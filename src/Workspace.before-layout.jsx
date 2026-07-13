import { useState } from "react";
import StudentPage from "./pages/StudentPage";
import DashboardPage from "./pages/DashboardPage";
import "./App.css";

function Workspace() {
  const [activePage, setActivePage] = useState("首頁");

  return (
    <>
      {activePage === "首頁" ? (
        <DashboardPage
          activePage={activePage}
          setActivePage={setActivePage}
        />
      ) : (
        <StudentPage
          activePage={activePage}
          setActivePage={setActivePage}
        />
      )}
    </>
  );
}

export default Workspace;