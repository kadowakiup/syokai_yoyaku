// const GAS_URL = "https://script.google.com/macros/s/AKfycbwW_-G99eipt0gSebUvimB7d6s1aHFYdcaK1ZHqrtq09Y9FnrokDSR83O2SKwFb9JvjHg/exec";
// await liff.init({ liffId: "2009827198-yS0bgjjH" });


const GAS_URL = "https://script.google.com/macros/s/AKfycbwW_-G99eipt0gSebUvimB7d6s1aHFYdcaK1ZHqrtq09Y9FnrokDSR83O2SKwFb9JvjHg/exec";

// 固定の予約枠ルール
const TIME_SLOTS = [
  "13:00", "13:15", "13:30", "13:45",
  "15:15", "15:30", "15:45", "16:00", "16:15", "16:30", "16:45",
  "17:15", "17:30", "17:45", "18:00", "18:15", "18:30", "18:45",
  "19:15", "19:30", "19:45", "20:00", "20:15", "20:30", "20:45"
];

let bookedSlots = {}; // 予約済みの枠（GASから取得）
let introducerName = ""; // 紹介者名（GASから取得）
let currentStartDate = new Date(); // カレンダー表示の起点（今日）
let selectedSlot = null; // 選択された予約枠

window.onload = async function () {
  showLoading("初期化中...");
  try {
    await liff.init({ liffId: "2009827198-yS0bgjjH" });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }
    const idToken = liff.getIDToken();
    await fetchReservationData(idToken);
  } catch (err) {
    alert("エラーが発生しました: " + err.message);
  } finally {
    hideLoading();
  }

  setupEventListeners();
};

async function fetchReservationData(idToken) {
  showLoading("予約状況を取得中...");
  const profile = await liff.getProfile();
  
  const url = `${GAS_URL}?action=fetchSlots&userId=${encodeURIComponent(profile.userId)}&idToken=${encodeURIComponent(idToken)}&t=${Date.now()}`;
  
  const res = await fetch(url);
  const data = await res.json();

  if (!data.success) throw new Error(data.message || "データ取得失敗");

  introducerName = data.introducer || "不明";
  bookedSlots = data.bookedSlots || {}; // { "2026-06-25_17:15": true } のような形式
  
  currentStartDate = new Date();
  currentStartDate.setHours(0, 0, 0, 0);
  
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const today = new Date(); // 現在時刻（過去の時間を予約不可にするため）

  const endDate = new Date(currentStartDate);
  endDate.setDate(endDate.getDate() + 6);
  document.getElementById("current-week-label").textContent = 
    `${currentStartDate.getMonth()+1}/${currentStartDate.getDate()} 〜 ${endDate.getMonth()+1}/${endDate.getDate()}`;

  // 今日より前の週には戻れないようにする
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  document.getElementById("btn-prev-week").disabled = currentStartDate <= todayZero;

  const weekNames = ["日", "月", "火", "水", "木", "金", "土"];

  // 7日分の列を作成
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(currentStartDate);
    targetDate.setDate(targetDate.getDate() + i);
    
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const dateNum = String(targetDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${dateNum}`; // 例: 2026-06-23

    const col = document.createElement("div");
    col.className = "calendar-col";

    const header = document.createElement("div");
    header.className = "calendar-header";
    header.innerHTML = `${targetDate.getDate()}日<br>(${weekNames[targetDate.getDay()]})`;
    col.appendChild(header);

    // TIME_SLOTS に基づいて全ての枠を生成
    TIME_SLOTS.forEach(time => {
      // iOSのブラウザバグを防ぐため、文字列ではなく数値でDateを生成
      const [hours, minutes] = time.split(":");
      const slotDt = new Date(year, targetDate.getMonth(), targetDate.getDate(), Number(hours), Number(minutes), 0);
      
      const isPast = slotDt < today; 
      
      // GAS側から送られてきたデータとキー（2026-06-23_18:00）が一致するかチェック
      const isBooked = bookedSlots[`${dateStr}_${time}`] === true;
      
      // 過去でもなく、予約もされていなければ空き枠
      const isAvailable = !isPast && !isBooked;

      const slotBtn = document.createElement("button");
      slotBtn.className = `slot ${isAvailable ? 'available' : 'full'}`;
      
      if (isAvailable) {
        slotBtn.innerHTML = `<span>${time}</span><span class="mark">〇</span>`;
        slotBtn.onclick = () => openForm({ date: dateStr, time: time });
      } else {
        // 埋まっている、または過去の枠
        slotBtn.innerHTML = `<span>${time}</span><span class="mark">✕</span>`;
        slotBtn.disabled = true;
      }
      
      col.appendChild(slotBtn);
    });

    grid.appendChild(col);
  }
}

// フォームを開く
function openForm(slot) {
  selectedSlot = slot;
  document.getElementById("input-datetime").value = `${slot.date} ${slot.time}`;
  document.getElementById("input-introducer").value = introducerName;
  
  const container = document.getElementById("applicants-container");
  container.innerHTML = "";
  addApplicantField();

  switchView("view-form");
}

let applicantCount = 0;
function addApplicantField() {
  applicantCount++;
  const container = document.getElementById("applicants-container");
  const div = document.createElement("div");
  div.className = "applicant-group";
  div.innerHTML = `
    <label>応募者 ${applicantCount} 氏名</label>
    <input type="text" class="input-applicant" placeholder="山田 太郎" required>
  `;
  container.appendChild(div);
}

function showConfirm() {
  const applicants = Array.from(document.querySelectorAll(".input-applicant"))
                          .map(input => input.value.trim())
                          .filter(val => val !== "");

  if (applicants.length === 0) {
    alert("応募者の氏名を入力してください。");
    return;
  }

  let html = `
    <p><strong>予約日時:</strong><br> ${selectedSlot.date} ${selectedSlot.time}</p>
    <p><strong>紹介者:</strong><br> ${introducerName}</p>
    <p><strong>応募者:</strong></p>
    <ul>
  `;
  applicants.forEach(name => {
    html += `<li>${name}</li>`;
  });
  html += `</ul>`;

  document.getElementById("confirm-details").innerHTML = html;
  switchView("view-confirm");
}

async function submitReservation() {
  showLoading("予約を確定しています...");
  try {
    const idToken = liff.getIDToken();
    const profile = await liff.getProfile();
    const applicants = Array.from(document.querySelectorAll(".input-applicant"))
                            .map(input => input.value.trim())
                            .filter(val => val !== "");

    const payload = {
      action: "submitReservation",
      userId: profile.userId,
      idToken: idToken,
      date: selectedSlot.date,
      time: selectedSlot.time,
      introducer: introducerName,
      applicants: applicants
    };

    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ payload: JSON.stringify(payload) })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    alert("予約が完了しました！");
    liff.closeWindow();

  } catch (err) {
    alert("エラー: " + err.message);
  } finally {
    hideLoading();
  }
}

function setupEventListeners() {
  document.getElementById("btn-next-week").onclick = () => {
    currentStartDate.setDate(currentStartDate.getDate() + 7);
    renderCalendar();
  };
  document.getElementById("btn-prev-week").onclick = () => {
    currentStartDate.setDate(currentStartDate.getDate() - 7);
    renderCalendar();
  };
  document.getElementById("btn-add-applicant").onclick = addApplicantField;
  document.getElementById("btn-back-to-calendar").onclick = () => switchView("view-calendar");
  document.getElementById("btn-go-confirm").onclick = showConfirm;
  document.getElementById("btn-back-to-form").onclick = () => switchView("view-form");
  document.getElementById("btn-submit").onclick = submitReservation;
}

function switchView(viewId) {
  ["view-calendar", "view-form", "view-confirm"].forEach(id => {
    document.getElementById(id).style.display = (id === viewId) ? "block" : "none";
  });
}
function showLoading(text) {
  const el = document.getElementById("loading");
  el.textContent = text;
  el.style.display = "flex"; // flexで中央寄せを維持
}
function hideLoading() {
  document.getElementById("loading").style.display = "none";
}