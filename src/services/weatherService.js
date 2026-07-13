const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

const LAT = 25.0669;
const LON = 121.3683;

export async function getWeather() {
  const url =
    `https://api.openweathermap.org/data/2.5/weather?` +
    `lat=${LAT}&lon=${LON}` +
    `&appid=${API_KEY}` +
    `&units=metric` +
    `&lang=zh_tw`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("取得天氣失敗");
  }

  const data = await response.json();

  return {
    temperature: Math.round(data.main.temp),
    humidity: data.main.humidity,
    condition: data.weather[0].description,
    icon: data.weather[0].icon,
    wind: data.wind.speed,
  };
}