import { useEffect, useState } from "react";
import { getWeather } from "../services/weatherService";
import {
  getDashboardEnrollmentStats,
} from "../services/dashboardService";

function DashboardPage({ currentTeacher }) {
  const [weather, setWeather] = useState(null);

  const [enrollmentStats, setEnrollmentStats] = useState({
    afterSchoolCount: null,
    englishCount: null,
    talentCount: null,
    talentEnrollmentCount: null,
  });

  const displayName =
    currentTeacher?.display_name ||
    currentTeacher?.chinese_name ||
    currentTeacher?.english_name ||
    "使用者";

  const today = new Date();

  const dateText = today.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });

  const hour = today.getHours();

  let greeting = "早安";

  if (hour >= 11 && hour < 17) {
    greeting = "午安";
  } else if (hour >= 17 && hour < 24) {
    greeting = "晚安";
  } else if (hour >= 0 && hour < 5) {
    greeting = "夜深了";
  }

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [weatherData, enrollmentData] =
          await Promise.all([
            getWeather(),
            getDashboardEnrollmentStats(),
          ]);

        setWeather(weatherData);
        setEnrollmentStats(enrollmentData);
      } catch (error) {
        console.error(
          "首頁資料讀取失敗：",
          error
        );
      }
    }

    loadDashboardData();
  }, []);

  function getWeatherEmoji(condition) {
    if (!condition) return "🌤️";

    if (condition.includes("晴")) return "☀️";
    if (condition.includes("雲")) return "☁️";
    if (condition.includes("雨")) return "🌧️";
    if (condition.includes("雷")) return "⛈️";
    if (condition.includes("霧")) return "🌫️";

    return "🌤️";
  }

  return (
    <div className="dashboardPage">

      <section className="welcomeCard">
        <div>
          <p className="eyebrow">
            TODAY WORKSPACE
          </p>

          <h1>
            {greeting}，{displayName}
          </h1>

          <p className="summary">
            今天是 {dateText}，先看看今天需要注意的事情。
          </p>
        </div>

        <div className="weatherBox">
          {weather ? (
            <>
              <div className="weatherEmoji">
                {getWeatherEmoji(
                  weather.condition
                )}
              </div>

              <div>
                <div className="weatherLocation">
                  林口
                </div>

                <div className="weatherText">
                  {weather.condition}
                  ｜
                  {weather.temperature}°C
                </div>

                <div className="weatherRain">
                  濕度 {weather.humidity}%
                </div>
              </div>
            </>
          ) : (
            <div className="weatherText">
              天氣讀取中...
            </div>
          )}
        </div>
      </section>


      <section className="dashboardCard">
        <p className="eyebrow">
          OPERATIONS
        </p>

        <h2>
          營運概況
        </h2>

        <div className="dashboardStatsGrid">

          <div className="dashboardStatCard">
            <span>
              安親在籍
            </span>

            <strong>
              {enrollmentStats.afterSchoolCount ?? "—"}
            </strong>

            <small>
              人
            </small>
          </div>


          <div className="dashboardStatCard">
            <span>
              美語在籍
            </span>

            <strong>
              {enrollmentStats.englishCount ?? "—"}
            </strong>

            <small>
              人
            </small>
          </div>


          <div className="dashboardStatCard">
            <span>
              才藝在籍
            </span>

            <strong>
              {enrollmentStats.talentCount ?? "—"}
            </strong>

            <small>
              不重複學生數
            </small>
          </div>


          <div className="dashboardStatCard">
            <span>
              才藝人次
            </span>

            <strong>
              {enrollmentStats.talentEnrollmentCount ?? "—"}
            </strong>

            <small>
              修課人次
            </small>
          </div>

        </div>
      </section>


      {currentTeacher?.role !== "viewer" && (
        <section className="dashboardCard">
          <p className="eyebrow">
            TODAY
          </p>

          <h2>
            今日概況
          </h2>

          <div className="todoList">
            <div>
              🚌 接送提醒
            </div>

            <div>
              🎂 今日生日
            </div>

            <div>
              🎒 今日補課
            </div>

            <div>
              📅 今日行程
            </div>
          </div>
        </section>
      )}

    </div>
  );
}

export default DashboardPage;