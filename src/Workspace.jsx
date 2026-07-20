import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardPage from "./pages/DashboardPage";
import TaskPage from "./pages/TaskPage";
import StudentPage from "./pages/StudentPage";
import TeacherPage from "./pages/TeacherPage";
import TeacherAssignmentPage from "./pages/TeacherAssignmentPage";
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
import LoginPage from "./pages/LoginPage";
import { supabase } from "./lib/supabase";
import { hasPagePermission } from "./services/permissionService";
import "./App.css";

function Workspace() {
  const [activePage, setActivePage] = useState("首頁");
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [currentTeacher, setCurrentTeacher] = useState(null);
  const [loadingCurrentTeacher, setLoadingCurrentTeacher] = useState(false);
  const [currentTeacherError, setCurrentTeacherError] = useState("");

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const pageOptions = [
    { label: "首頁", key: "dashboard" },
    { label: "任務中心", key: "personal_tasks", adminOnly: true },
    { label: "學生資料", key: "students" },
    { label: "老師管理", key: "teachers", adminOnly: true },
    { label: "老師任務", key: "teacher_assignments" },
    { label: "班級管理", key: "classes" },
    { label: "課程管理", key: "courses" },
    { label: "營隊管理", key: "camps" },
    { label: "行事曆", key: "calendar" },
    { label: "接送管理", key: "pickup" },
    { label: "學習報告書", key: "learning_reports" },
    { label: "營隊排班", key: "camp_schedule" },
    { label: "清潔分配", key: "cleaning" },
    { label: "LINE 提醒", key: "line_reminders", adminOnly: true },
    { label: "成績分析", key: "score_analysis" },
  ];

  const pages = useMemo(() => {
    return pageOptions
      .filter((page) => {
        if (currentTeacher?.role === "admin") {
          return true;
        }

        if (page.adminOnly) {
          return false;
        }

        return hasPagePermission(currentTeacher, page.key);
      })
      .map((page) => page.label);
  }, [currentTeacher]);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("讀取登入狀態失敗：", error);
      }

      if (isMounted) {
        setSession(currentSession);
        setCheckingSession(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);

      if (!nextSession) {
        setActivePage("首頁");
        setCurrentTeacher(null);
        setCurrentTeacherError("");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setCurrentTeacher(null);
      return;
    }

    let isMounted = true;

    async function loadCurrentTeacher() {
      try {
        setLoadingCurrentTeacher(true);
        setCurrentTeacherError("");

        const { data, error } = await supabase
          .from("teachers")
          .select(
            "id, chinese_name, english_name, role, auth_user_id, permissions"
          )
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        if (!data) {
          setCurrentTeacher(null);
          setCurrentTeacherError("找不到這個登入帳號對應的老師資料。");
          return;
        }

        setCurrentTeacher(data);
      } catch (error) {
        console.error("讀取登入者資料失敗：", error);

        if (isMounted) {
          setCurrentTeacher(null);
          setCurrentTeacherError("登入者資料讀取失敗。");
        }
      } finally {
        if (isMounted) {
          setLoadingCurrentTeacher(false);
        }
      }
    }

    loadCurrentTeacher();

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!currentTeacher || pages.length === 0) {
      return;
    }

    if (!pages.includes(activePage)) {
      setActivePage(pages[0]);
    }
  }, [currentTeacher, pages, activePage]);

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      setSignOutError("");

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("登出失敗：", error);
      setSignOutError("登出失敗，請稍後再試。");
      setIsSigningOut(false);
    }
  }

  function getRoleLabel(role) {
    if (role === "admin") {
      return "管理員";
    }

    if (role === "teacher") {
      return "老師";
    }

    return "使用者";
  }

  function getDisplayName() {
    if (loadingCurrentTeacher) {
      return "讀取中…";
    }

    if (currentTeacher?.chinese_name) {
      return currentTeacher.chinese_name;
    }

    if (currentTeacher?.english_name) {
      return currentTeacher.english_name;
    }

    return session?.user?.email || "使用者";
  }

  function renderPage() {
    if (activePage === "首頁") return <DashboardPage />;
    if (activePage === "任務中心") return <TaskPage />;
    if (activePage === "學生資料") return <StudentPage />;
    if (activePage === "老師管理") return <TeacherPage />;
    if (activePage === "老師任務") return <TeacherAssignmentPage currentTeacher={currentTeacher} />;
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

  if (checkingSession) {
    return (
      <main className="workspace-auth-loading">
        <p>正在確認登入狀態…</p>
      </main>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="workspace">
      <Sidebar
        pages={pages}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main">
        <header className="workspace-topbar">
          <div className="workspace-user">
            <div className="workspace-user__text">
              <span className="workspace-user__name">
                {getDisplayName()}
              </span>

              <span className="workspace-user__role">
                {getRoleLabel(currentTeacher?.role)}
              </span>
            </div>

            <button
              type="button"
              className="workspace-signout"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? "登出中…" : "登出"}
            </button>
          </div>

          {(currentTeacherError || signOutError) && (
            <p className="workspace-signout-error">
              {currentTeacherError || signOutError}
            </p>
          )}
        </header>

        {renderPage()}
      </main>
    </div>
  );
}

export default Workspace;