import { useState } from "react";
import TalentCoursePage from "./TalentCoursePage";
import EnglishClassPage from "./EnglishClassPage";
import "./CourseHubPage.css";

const COURSE_SECTIONS = [
  {
    key: "TALENT",
    label: "才藝班",
    english: "TALENT CLASSES",
    description: "固定班級、學生名單、上課日期與點名管理",
  },
  {
    key: "SINGLE_DAY",
    label: "單日課程",
    english: "SINGLE-DAY COURSES",
    description: "一次性課程、活動或不需建立長期班級的課程",
  },
  {
    key: "ENGLISH",
    label: "美語班",
    english: "ENGLISH CLASSES",
    description: "管理美語班級與班級人員組成",
  },
  {
    key: "MAKEUP",
    label: "補課系統",
    english: "MAKEUP CALENDAR",
    description: "補課日曆、學生安排與安親老師 LINE 提醒",
  },
];

function CoursePage() {
  const [activeSection, setActiveSection] =
    useState("TALENT");

  const activeInfo = COURSE_SECTIONS.find(
    (section) => section.key === activeSection
  );

  return (
    <div className="courseHub">
      <header className="courseHub__header">
        <div>
          <p className="courseHub__eyebrow">
            COURSE MANAGEMENT
          </p>

          <h1>課程管理</h1>

          <p className="courseHub__summary">
            依照不同課程型態進行管理。
          </p>
        </div>
      </header>

      <nav
        className="courseHub__tabs"
        aria-label="課程管理分類"
      >
        {COURSE_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={
              activeSection === section.key
                ? "courseHub__tab courseHub__tab--active"
                : "courseHub__tab"
            }
            onClick={() =>
              setActiveSection(section.key)
            }
          >
            <span>{section.english}</span>
            <strong>{section.label}</strong>
            <small>{section.description}</small>
          </button>
        ))}
      </nav>

      <section className="courseHub__content">
        {activeSection === "TALENT" && (
          <TalentCoursePage />
        )}

        {activeSection === "ENGLISH" && (
          <EnglishClassPage />
        )}

        {activeSection !== "TALENT" &&
          activeSection !== "ENGLISH" && (
            <div className="courseHub__comingSoon">
              <p>{activeInfo?.english}</p>

              <h2>{activeInfo?.label}</h2>

              <span>
                {activeInfo?.description}
              </span>

              <div>
                這個區域下一步開始建立。
              </div>
            </div>
          )}
      </section>
    </div>
  );
}

export default CoursePage;