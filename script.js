const form = document.querySelector("#location-form");
const latitudeInput = document.querySelector("#latitude");
const longitudeInput = document.querySelector("#longitude");
const statusEl = document.querySelector("#form-status");
const widgetsContainer = document.querySelector("#widgets-container");
const template = document.querySelector("#widget-template");

let widgetsState = {};
const STORAGE_KEY = "weather-widgets";

// Коды погоды
const weatherCodes = [
  { codes: [0], label: "Ясно", icon: "clear" },
  { codes: [1, 2], label: "Переменная облачность", icon: "partly" },
  { codes: [3], label: "Пасмурно", icon: "cloudy" },
  { codes: [45, 48], label: "Туман", icon: "fog" },
  { codes: [51, 53, 55], label: "Морось", icon: "rain" },
  { codes: [56, 57], label: "Переохлажд. морось", icon: "rain" },
  { codes: [61, 63, 65], label: "Дождь", icon: "rain" },
  { codes: [66, 67], label: "Ледяной дождь", icon: "storm" },
  { codes: [71, 73, 75], label: "Снег", icon: "snow" },
  { codes: [77], label: "Снежная крупа", icon: "snow" },
  { codes: [80, 81, 82], label: "Ливни", icon: "storm" },
  { codes: [85, 86], label: "Снегопад", icon: "snow" },
  { codes: [95], label: "Гроза", icon: "storm" },
  { codes: [96, 99], label: "Гроза с градом", icon: "storm" }
];

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const latValue = latitudeInput.value.trim(); // Широта
  const lonValue = longitudeInput.value.trim(); // Долгота

  try {
    const latitude = parseCoordinate(latValue, "latitude");
    const longitude = parseCoordinate(lonValue, "longitude");

    addWidget(latitude, longitude);

  } catch (error) {
    showFormStatus(error.message, "error");
  }
});

widgetsContainer.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-btn")) return;
  
  const card = event.target.closest(".weather-card");
  if (!card || !card.dataset.widgetId) return;
  
  const widgetId = card.dataset.widgetId;
  delete widgetsState[widgetId];
  card.remove();
  persistState();
});

function parseCoordinate(value, type) {
  if (!value) throw new Error("Заполните оба поля.");
  
  const parsed = parseFloat(value.replace(",", "."));
  if (isNaN(parsed)) throw new Error("Введите число.");
  
  if (type === "latitude" && Math.abs(parsed) > 90) {
    throw new Error("Широта должна быть в диапазоне -90…90.");
  }
  if (type === "longitude" && Math.abs(parsed) > 180) {
    throw new Error("Долгота должна быть в диапазоне -180…180.");
  }
  return parsed;
}

function showFormStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "form-status";
  if (type === "error") {
    statusEl.classList.add("form-status--error");
  }
  if (type === "success") {
    statusEl.classList.add("form-status--success");
  }
}

function addWidget(lat, lon, shouldPersist = true) {
  const { element, id } = createWidgetShell(lat, lon);
  widgetsState[id] = { lat, lon, element };
  widgetsContainer.insertBefore(element, widgetsContainer.firstChild);
  updateWidget(id);
  
  if (shouldPersist) persistState();
}

// Пустой виджет с заглушками
function createWidgetShell(lat, lon) {
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector(".weather-card");
  
  const id = "widget_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
  
  card.dataset.widgetId = id;
  card.classList.add("weather-card--loading");
  
  card.querySelector(".weather-card__coords").textContent = 
    lat.toFixed(4) + "°, " + lon.toFixed(4) + "°";
  card.querySelector(".weather-card__time").textContent = "Подготавливаем данные…";
  card.querySelector(".weather-card__temp-value").textContent = "—";
  card.querySelector(".weather-card__description").textContent = "…";
  
  const fields = card.querySelectorAll("[data-field]");
  for (let i = 0; i < fields.length; i++) {
    fields[i].textContent = "—";
  }
  
  return { id, element: card };
}

async function updateWidget(id) {
  const widget = widgetsState[id];
  if (!widget) return;
  
  try {
    const weather = await fetchWeather(widget.lat, widget.lon);
    paintWidget(widget.element, weather);
  } catch (error) {
    handleWidgetError(widget.element, error);
  }
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}&` +
    `current=temperature_2m,apparent_temperature,relative_humidity_2m,weathercode,wind_speed_10m&` +
    `timezone=auto`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось получить данные. Попробуйте позже.");
  
  const data = await response.json();
  const current = data.current;
  
  if (!current) throw new Error("API вернуло пустой ответ.");
  
  return {
    lat: lat,
    lon: lon,
    timezone: data.timezone,
    time: current.time,
    temp: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    wind: current.wind_speed_10m,
    code: current.weathercode
  };
}

function paintWidget(card, weather) {
  const meta = pickWeatherMeta(weather.code);
  
  card.classList.remove("weather-card--loading", "weather-card--error");
  
  const date = new Date(weather.time);
  const timeStr = formatTimeSimple(date);
  card.querySelector(".weather-card__time").textContent = timeStr;
  
  card.querySelector(".weather-card__temp-value").textContent = 
    Math.round(weather.temp) + "°";
  card.querySelector(".weather-card__description").textContent = meta.label;
  card.querySelector("[data-field='feelsLike']").textContent = 
    Math.round(weather.feelsLike) + "°";
  card.querySelector("[data-field='wind']").textContent = weather.wind + " м/с";
  card.querySelector("[data-field='humidity']").textContent = weather.humidity + "%";
  
  // Иконка погоды
  const icon = card.querySelector(".weather-card__icon");
  icon.src = "assets/icons/" + meta.icon + ".svg";
  icon.alt = meta.label;
  
  // Карта
  card.querySelector(".weather-card__map").src = 
    `https://static-maps.yandex.ru/1.x/?` +
    `lang=ru_RU&ll=${weather.lon},${weather.lat}&z=8&size=450,200&l=map`;
    
  persistState();
}

// Форматирование времени
function formatTimeSimple(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const dayName = days[date.getDay()];
  return dayName + ", " + hours + ":" + minutes;
}

// Выбор метаданных погоды
function pickWeatherMeta(code) {
  for (let i = 0; i < weatherCodes.length; i++) {
    const item = weatherCodes[i];
    if (item.codes.includes(code)) {
      return item;
    }
  }
  return { label: "Неизвестно", icon: "cloudy" };
}

// обработка ошибок
function handleWidgetError(card, error) {
  card.classList.remove("weather-card--loading");
  card.classList.add("weather-card--error");
  card.querySelector(".weather-card__time").textContent = "Ошибка загрузки";
  card.querySelector(".weather-card__temp-value").textContent = "—";
  card.querySelector(".weather-card__description").textContent = error.message;
}

// Сохранение состояние
function persistState() {
  const snapshot = [];
  
  for (const id in widgetsState) {
    if (widgetsState.hasOwnProperty(id)) {
      const widget = widgetsState[id];
      snapshot.push({ lat: widget.lat, lon: widget.lon });
    }
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

// Восстановление состояния
function restoreWidgets() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  
  try {
    const entries = JSON.parse(stored);
    for (let i = 0; i < entries.length; i++) {
      addWidget(entries[i].lat, entries[i].lon, false);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

restoreWidgets();