import { useEffect, useState } from "react";
import { getWeather } from "../services/weatherService";

function DashboardPage() {
  const [weather, setWeather] = useState(null);

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
    async function loadWeather() {
      try {
        const data = await getWeather();
        setWeather(data);
      } catch (error) {
        console.error(error);
      }
    }

    loadWeather();
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
          <p className="eyebrow">TODAY WORKSPACE</p>
          <h1>{greeting}，Lin</h1>
          <p className="summary">
            今天是 {dateText}，先看看今天需要注意的事情。
          </p>
        </div>

        <div className="weatherBox">
          {weather ? (
            <>
              <div className="weatherEmoji">
                {getWeatherEmoji(weather.condition)}
              </div>

              <div>
                <div className="weatherLocation">林口</div>
                <div className="weatherText">
                  {weather.condition}｜{weather.temperature}°C
                </div>
                <div className="weatherRain">
                  濕度 {weather.humidity}%
                </div>
              </div>
            </>
          ) : (
            <div className="weatherText">天氣讀取中...</div>
          )}
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHeader">
          <div>
            <p className="eyebrow">TODAY</p>
            <h2>今日概況</h2>
          </div>
        </div>

        <div className="dashboardOverviewGrid">
          <div className="dashboardMetricCard">
            <span className="dashboardMetricIcon">🚌</span>
            <div>
              <span className="dashboardMetricLabel">接送提醒</span>
              <strong className="dashboardMetricValue">—</strong>
            </div>
          </div>

          <div className="dashboardMetricCard">
            <span className="dashboardMetricIcon">🎂</span>
            <div>
              <span className="dashboardMetricLabel">今日生日</span>
              <strong className="dashboardMetricValue">—</strong>
            </div>
          </div>

          <div className="dashboardMetricCard">
            <span className="dashboardMetricIcon">🎒</span>
            <div>
              <span className="dashboardMetricLabel">今日補課</span>
              <strong className="dashboardMetricValue">—</strong>
            </div>
          </div>

          <div className="dashboardMetricCard">
            <span className="dashboardMetricIcon">📅</span>
            <div>
              <span className="dashboardMetricLabel">今日行程</span>
              <strong className="dashboardMetricValue">—</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHeader">
          <div>
            <p className="eyebrow">OPERATIONS</p>
            <h2>營運數據</h2>
          </div>
        </div>

        <div className="dashboardStatsGrid">
          <div className="dashboardStatCard">
            <span>在籍學生</span>
            <strong>—</strong>
          </div>

          <div className="dashboardStatCard">
            <span>安親人數</span>
            <strong>—</strong>
          </div>

          <div className="dashboardStatCard">
            <span>美語人數</span>
            <strong>—</strong>
          </div>

          <div className="dashboardStatCard">
            <span>才藝人次</span>
            <strong>—</strong>
          </div>
        </div>
      </section>

      <div className="dashboardBottomGrid">
        <section className="dashboardSection">
          <div className="dashboardSectionHeader">
            <div>
              <p className="eyebrow">THIS MONTH</p>
              <h2>本月動態</h2>
            </div>
          </div>

          <div className="dashboardPlaceholderList">
            <div>
              <span>本月新生</span>
              <strong>—</strong>
            </div>
            <div>
              <span>本月退班</span>
              <strong>—</strong>
            </div>
            <div>
              <span>待追蹤事項</span>
              <strong>—</strong>
            </div>
          </div>
        </section>

        <section className="dashboardSection">
          <div className="dashboardSectionHeader">
            <div>
              <p className="eyebrow">CLASSES</p>
              <h2>班級概況</h2>
            </div>
          </div>

          <div className="dashboardEmptyState">
            班級人數與容量將顯示於此
          </div>
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;