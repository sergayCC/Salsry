const DATA_FILE = "./data/tw-holidays-2026-2030.json";
const STORAGE_KEY = "salary-calculator-settings-v1";
const TZ = "Asia/Taipei";

const elements = {
  monthlySalary: document.getElementById("monthlySalary"),
  hoursPerDay: document.getElementById("hoursPerDay"),
  startTime: document.getElementById("startTime"),
  endTime: document.getElementById("endTime"),
  saveBtn: document.getElementById("saveBtn"),
  statusMsg: document.getElementById("statusMsg"),
  errorMsg: document.getElementById("errorMsg"),
  dayProgressBar: document.getElementById("dayProgressBar"),
  dayProgressText: document.getElementById("dayProgressText"),
  perSecond: document.getElementById("perSecond"),
  perMinute: document.getElementById("perMinute"),
  perHour: document.getElementById("perHour"),
  perDay: document.getElementById("perDay"),
  earnedToday: document.getElementById("earnedToday"),
  earnedMonth: document.getElementById("earnedMonth"),
  earnedYear: document.getElementById("earnedYear"),
  workdayInfo: document.getElementById("workdayInfo"),
  clockInfo: document.getElementById("clockInfo"),
};

const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 2,
});

const fineCurrency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

const clockFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

let holidayData = null;

init().catch((error) => {
  showError(`初始化失敗：${error.message}`);
});

async function init() {
  const response = await fetch(DATA_FILE, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("無法載入假日資料檔。請確認 data 資料夾與 JSON 檔案存在。");
  }

  const parsed = await response.json();
  validateHolidayData(parsed);
  holidayData = mapHolidaySets(parsed);

  loadSettings();
  bindEvents();
  calculateAndRender();
  setInterval(calculateAndRender, 1000);
}

function bindEvents() {
  [
    elements.monthlySalary,
    elements.hoursPerDay,
    elements.startTime,
    elements.endTime,
  ].forEach((node) => {
    node.addEventListener("input", () => {
      elements.statusMsg.textContent = "";
      calculateAndRender();
    });
  });

  elements.saveBtn.addEventListener("click", () => {
    const settings = getSettings();
    if (!settings.ok) {
      showError(settings.message);
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    elements.statusMsg.textContent = "已儲存設定";
    clearError();
    calculateAndRender();
  });
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed.monthlySalary) {
      elements.monthlySalary.value = parsed.monthlySalary;
    }
    if (parsed.hoursPerDay) {
      elements.hoursPerDay.value = parsed.hoursPerDay;
    }
    if (parsed.startTime) {
      elements.startTime.value = parsed.startTime;
    }
    if (parsed.endTime) {
      elements.endTime.value = parsed.endTime;
    }
  } catch (_error) {
    elements.statusMsg.textContent = "設定讀取失敗，已使用預設值";
  }
}

function validateHolidayData(data) {
  if (!data || typeof data !== "object") {
    throw new Error(
      "假日資料格式錯誤：根節點必須是物件。請參考 README 的 schema。",
    );
  }

  const years = Object.keys(data)
    .filter((key) => /^\d{4}$/.test(key))
    .sort();
  if (years.length === 0) {
    throw new Error("假日資料至少要有一個年份鍵，例如 2026。 ");
  }

  if (!years.includes("2026")) {
    throw new Error("假日資料至少需包含 2026 年。 ");
  }

  for (const year of years) {
    if (!Array.isArray(data[year])) {
      throw new Error(`年份 ${year} 的值必須是陣列。`);
    }

    const seen = new Set();
    for (const date of data[year]) {
      if (typeof date !== "string") {
        throw new Error(`年份 ${year} 包含非字串日期。`);
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`日期格式錯誤：${date}。請使用 YYYY-MM-DD。`);
      }

      if (!date.startsWith(`${year}-`)) {
        throw new Error(`日期年份不一致：${date} 應屬於 ${year}。`);
      }

      if (!isValidIsoDate(date)) {
        throw new Error(`無效日期：${date}`);
      }

      if (seen.has(date)) {
        throw new Error(`重複日期：${date}`);
      }
      seen.add(date);
    }
  }
}

function mapHolidaySets(data) {
  const mapped = {};
  for (const [year, dates] of Object.entries(data)) {
    mapped[year] = new Set(dates);
  }
  return mapped;
}

function getSettings() {
  const monthlySalary = Number(elements.monthlySalary.value);
  const hoursPerDay = Number(elements.hoursPerDay.value);
  const startTime = elements.startTime.value;
  const endTime = elements.endTime.value;

  if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) {
    return { ok: false, message: "月薪需為大於 0 的數字" };
  }

  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
    return { ok: false, message: "每日工時需介於 0 到 24 小時" };
  }

  if (!startTime || !endTime) {
    return { ok: false, message: "請完整填寫上班開始與結束時間" };
  }

  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (endMinutes <= startMinutes) {
    return { ok: false, message: "上班結束時間必須晚於開始時間" };
  }

  return {
    ok: true,
    value: {
      monthlySalary,
      hoursPerDay,
      startTime,
      endTime,
    },
  };
}

function calculateAndRender() {
  try {
    clearError();
    const settings = getSettings();
    if (!settings.ok) {
      showError(settings.message);
      renderEmpty();
      return;
    }

    const now = getNowInTaipei();
    const data = calculateEarnings(settings.value, now);
    const workProgress = getWorkProgressRatio(
      settings.value.startTime,
      settings.value.endTime,
      now,
    );

    elements.perSecond.textContent = fineCurrency.format(data.perSecond);
    elements.perMinute.textContent = fineCurrency.format(data.perMinute);
    elements.perHour.textContent = currency.format(data.perHour);
    elements.perDay.textContent = currency.format(data.perDay);

    elements.earnedToday.textContent = currency.format(data.earnedToday);
    elements.earnedMonth.textContent = currency.format(data.earnedMonth);
    elements.earnedYear.textContent = currency.format(data.earnedYear);

    elements.workdayInfo.textContent = `本月工作日 ${data.monthWorkdays} 天，已完成 ${data.completedWorkdaysInMonth} 天`;
    elements.clockInfo.textContent = `台灣時間：${clockFormatter.format(now)}`;
    elements.dayProgressBar.style.width = `${(workProgress * 100).toFixed(2)}%`;
    elements.dayProgressBar.parentElement.setAttribute(
      "aria-valuenow",
      String(Math.round(workProgress * 100)),
    );
    elements.dayProgressText.textContent = `${(workProgress * 100).toFixed(2)}%`;
  } catch (error) {
    showError(error.message || "計算失敗，請檢查設定與假日資料");
    renderEmpty();
  }
}

function calculateEarnings(settings, now) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const yearKey = String(year);

  if (!holidayData[yearKey]) {
    throw new Error(`假日資料未涵蓋 ${year} 年。請更新資料檔。`);
  }

  const monthWorkdays = getWorkdaysInMonth(year, month);
  const perDay = settings.monthlySalary / monthWorkdays;
  const perHour = perDay / settings.hoursPerDay;
  const perMinute = perHour / 60;
  const perSecond = perMinute / 60;

  const todayIso = formatIsoDate(now);
  const isTodayWorkday = isWorkday(todayIso);

  const completedWorkdaysInMonth = countCompletedWorkdaysInMonth(
    year,
    month,
    now.getDate(),
  );

  const todayProgress = isTodayWorkday
    ? getWorkProgressRatio(settings.startTime, settings.endTime, now)
    : 0;

  const earnedToday = perDay * todayProgress;
  const earnedMonth = perDay * completedWorkdaysInMonth + earnedToday;

  let earnedYear = earnedMonth;
  for (let m = 1; m < month; m += 1) {
    const workdays = getWorkdaysInMonth(year, m);
    earnedYear += settings.monthlySalary;
    if (workdays === 0) {
      earnedYear -= settings.monthlySalary;
    }
  }

  return {
    perDay,
    perHour,
    perMinute,
    perSecond,
    earnedToday,
    earnedMonth,
    earnedYear,
    monthWorkdays,
    completedWorkdaysInMonth,
  };
}

function getWorkdaysInMonth(year, month) {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    if (isWorkday(date)) {
      count += 1;
    }
  }
  return count;
}

function countCompletedWorkdaysInMonth(year, month, date) {
  let count = 0;
  for (let day = 1; day < date; day += 1) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    if (isWorkday(iso)) {
      count += 1;
    }
  }

  return count;
}

function getWorkProgressRatio(startTime, endTime, now) {
  const startMins = toMinutes(startTime);
  const endMins = toMinutes(endTime);
  const currentMins =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  if (currentMins <= startMins) {
    return 0;
  }
  if (currentMins >= endMins) {
    return 1;
  }

  return (currentMins - startMins) / (endMins - startMins);
}

function isWorkday(isoDate) {
  const d = toDate(isoDate);
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  const year = isoDate.slice(0, 4);
  return !holidayData[year].has(isoDate);
}

function toDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getNowInTaipei() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toMinutes(timeText) {
  const [h, m] = timeText.split(":").map(Number);
  return h * 60 + m;
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function isValidIsoDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() + 1 === m &&
    date.getDate() === d
  );
}

function showError(message) {
  elements.errorMsg.textContent = message;
}

function clearError() {
  elements.errorMsg.textContent = "";
}

function renderEmpty() {
  [
    elements.perSecond,
    elements.perMinute,
    elements.perHour,
    elements.perDay,
    elements.earnedToday,
    elements.earnedMonth,
    elements.earnedYear,
  ].forEach((el) => {
    el.textContent = "-";
  });
  elements.workdayInfo.textContent = "-";
  elements.dayProgressBar.style.width = "0%";
  elements.dayProgressBar.parentElement.setAttribute("aria-valuenow", "0");
  elements.dayProgressText.textContent = "-";
}
