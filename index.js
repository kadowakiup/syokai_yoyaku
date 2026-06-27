// const GAS_URL = "https://script.google.com/macros/s/AKfycbwW_-G99eipt0gSebUvimB7d6s1aHFYdcaK1ZHqrtq09Y9FnrokDSR83O2SKwFb9JvjHg/exec";
// await liff.init({ liffId: "2009827198-yS0bgjjH" });


const GAS_URL = "https://script.google.com/macros/s/AKfycbwW_-G99eipt0gSebUvimB7d6s1aHFYdcaK1ZHqrtq09Y9FnrokDSR83O2SKwFb9JvjHg/exec";

// 固定の予約枠ルール
const TIME_SLOTS = [
  "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "15:15", "15:30", "15:45", "16:00", "16:15", "16:30", "16:45",
  "17:15", "17:30", "17:45", "18:00", "18:15", "18:30", "18:45",
  "19:15", "19:30", "19:45", "20:00", "20:15", "20:30", "20:45"
];

let bookedSlots = {}; // 予約済みの枠
let introducerName = ""; // 紹介者名
let currentStartDate = new Date(); // カレンダー表示の起点
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
  bookedSlots = data.bookedSlots || {};
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay(); 
  const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  currentStartDate = new Date(today.setDate(diff));
  
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const today = new Date(); 

  const endDate = new Date(currentStartDate);
  endDate.setDate(endDate.getDate() + 6);
  document.getElementById("current-week-label").textContent = 
    `${currentStartDate.getMonth()+1}/${currentStartDate.getDate()} 〜 ${endDate.getMonth()+1}/${endDate.getDate()}分`;

  const todayObj = new Date();
  todayObj.setHours(0, 0, 0, 0);
  const currentDay = todayObj.getDay();
  const diff = todayObj.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const thisWeekMonday = new Date(todayObj.setDate(diff));
  
  document.getElementById("btn-prev-week").disabled = currentStartDate <= thisWeekMonday;

  const weekNames = ["日", "月", "火", "水", "木", "金", "土"];

  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(currentStartDate);
    targetDate.setDate(targetDate.getDate() + i);
    
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const dateNum = String(targetDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${dateNum}`;

    const col = document.createElement("div");
    col.className = "calendar-col";

    const header = document.createElement("div");
    header.className = "calendar-header";
    
    const dayNumSpan = document.createElement("span");
    dayNumSpan.className = "day-num";
    dayNumSpan.textContent = `${targetDate.getDate()}日`;

    const dayNameSpan = document.createElement("span");
    dayNameSpan.className = "day-name";
    dayNameSpan.textContent = `(${weekNames[targetDate.getDay()]})`;

    if (targetDate.getDay() === 0) {
      dayNameSpan.classList.add("sun");
    } else if (targetDate.getDay() === 6) {
      dayNameSpan.classList.add("sat");
    }

    header.appendChild(dayNumSpan);
    header.appendChild(dayNameSpan); 
    col.appendChild(header);

    TIME_SLOTS.forEach(time => {
      const [hours, minutes] = time.split(":");
      const slotDt = new Date(year, targetDate.getMonth(), targetDate.getDate(), Number(hours), Number(minutes), 0);
      
      const isPast = slotDt < today; 
      const isBooked = bookedSlots[`${dateStr}_${time}`] === true;
      const isAvailable = !isPast && !isBooked;

      // renderCalendar 内の TIME_SLOTS.forEach の中
      const slotBtn = document.createElement("button");
      slotBtn.className = `slot ${isAvailable ? 'available' : 'full'}`;
      
      if (isAvailable) {
        slotBtn.innerHTML = `<span>${time}</span><span class="mark" style="font-size: 12px;">〇</span>`;
        slotBtn.onclick = () => openForm({ date: dateStr, time: time });
      } else {
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
  applicantCount = 0; // カウントリセット
  addApplicantField();

  switchView("view-form");
}

// ★修正：応募者の入力欄を「姓・名・セイ・メイ」の4点項目に生成
let applicantCount = 0;
// ★修正：応募者の入力欄を生成（2人目以降には削除ボタンを設置）
function addApplicantField() {
  const container = document.getElementById("applicants-container");
  
  // 現在すでにある応募者ブロックの数を取得
  const existingBlocks = container.querySelectorAll(".applicant-block").length;
  const currentNum = existingBlocks + 1;
  
  const block = document.createElement("div");
  block.className = "applicant-block";
  block.style.borderBottom = "1px dashed #ccc";
  block.style.paddingBottom = "15px";
  block.style.marginBottom = "15px";
  block.style.position = "relative"; // 削除ボタンを右上絶対配置するための基準
  
  // 2人目以降の場合のみ右上に削除ボタンを表示するHTMLを作成
  let deleteBtnHtml = "";
  if (existingBlocks > 0) {
    deleteBtnHtml = `
      <button type="button" class="btn-delete-applicant" style="
        position: absolute;
        top: 0;
        right: 0;
        background: none;
        border: none;
        color: #ff4d8d;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        padding: 5px;
      ">削除</button>
    `;
  }
  
  block.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h3 class="applicant-title" style="font-size: 14px; margin: 0; color: #01b6ff;">応募者 ${currentNum}</h3>
    </div>
    ${deleteBtnHtml}
    <div style="display: flex; gap: 10px; margin-bottom: 8px;">
      <div style="flex: 1;">
        <label style="font-size: 12px;">姓</label>
        <input type="text" class="input-last-name" placeholder="山田" required style="padding: 8px; width: 100%; box-sizing: border-box;">
      </div>
      <div style="flex: 1;">
        <label style="font-size: 12px;">名</label>
        <input type="text" class="input-first-name" placeholder="太郎" required style="padding: 8px; width: 100%; box-sizing: border-box;">
      </div>
    </div>
    <div style="display: flex; gap: 10px;">
      <div style="flex: 1;">
        <label style="font-size: 12px;">セイ</label>
        <input type="text" class="input-last-kana" placeholder="ヤマダ" required style="padding: 8px; width: 100%; box-sizing: border-box;">
      </div>
      <div style="flex: 1;">
        <label style="font-size: 12px;">メイ</label>
        <input type="text" class="input-first-kana" placeholder="タロウ" required style="padding: 8px; width: 100%; box-sizing: border-box;">
      </div>
    </div>
  `;
  
  // 削除ボタンが生成された場合のみ、クリックイベントを設定
  if (existingBlocks > 0) {
    block.querySelector(".btn-delete-applicant").onclick = function() {
      block.remove();       // 自分自身の入力ブロックを削除
      reindexApplicants();  // 残った応募者の番号（タイトル）を詰め直す
    };
  }

  container.appendChild(block);
}

// ★新規追加：削除されたあとに「応募者 1」「応募者 2」のナンバリングを綺麗に整える関数
function reindexApplicants() {
  const blocks = document.querySelectorAll(".applicant-block");
  blocks.forEach((block, index) => {
    const title = block.querySelector(".applicant-title");
    if (title) {
      title.textContent = `応募者 ${index + 1}`;
    }
  });
}

// ★修正：確認画面の生成（4点セットのデータを取得・表示）
function showConfirm() {
  const blocks = document.querySelectorAll(".applicant-block");
  const applicants = [];
  let hasError = false;

  blocks.forEach((block) => {
    const lastName = block.querySelector(".input-last-name").value.trim();
    const firstName = block.querySelector(".input-first-name").value.trim();
    const lastKana = block.querySelector(".input-last-kana").value.trim();
    const firstKana = block.querySelector(".input-first-kana").value.trim();

    // 1つでも空欄があればエラー判定（ただし全員未入力は別途チェック）
    if (!lastName || !firstName || !lastKana || !firstKana) {
      hasError = true;
      return;
    }

    applicants.push({
      lastName: lastName,
      firstName: firstName,
      lastKana: lastKana,
      firstKana: firstKana
    });
  });

  if (hasError || applicants.length === 0) {
    alert("すべての応募者の「姓」「名」「セイ」「メイ」を入力してください。");
    return;
  }

  // 確認画面のHTML組み立て
  let html = `
    <p><strong>予約日時:</strong><br> ${selectedSlot.date} ${selectedSlot.time}</p>
    <p><strong>紹介者:</strong><br> ${introducerName}</p>
    <p><strong>応募者情報:</strong></p>
  `;
  
  applicants.forEach((app, index) => {
    html += `
      <div style="margin-bottom: 10px; padding-left: 10px; border-left: 2px solid #01b6ff;">
        <p style="margin: 0; font-size: 12px; color: #666;">応募者 ${index + 1}</p>
        <p style="margin: 2px 0 0 0;"><strong>氏名:</strong> ${app.lastName} ${app.firstName} （${app.lastKana} ${app.firstKana}）</p>
      </div>
    `;
  });

  document.getElementById("confirm-details").innerHTML = html;
  switchView("view-confirm");
}

// ★修正：Anycrossへ提出（4点セットを配列データとして送信）
async function submitReservation() {
  showLoading("予約を確定しています...");
  try {
    const idToken = liff.getIDToken();
    const profile = await liff.getProfile();
    
    const blocks = document.querySelectorAll(".applicant-block");
    const applicants = [];

    blocks.forEach((block) => {
      applicants.push({
        lastName: block.querySelector(".input-last-name").value.trim(),
        firstName: block.querySelector(".input-first-name").value.trim(),
        lastKana: block.querySelector(".input-last-kana").value.trim(),
        firstKana: block.querySelector(".input-first-kana").value.trim()
      });
    });

    const payload = {
      action: "submitReservation",
      userId: profile.userId,
      idToken: idToken,
      date: selectedSlot.date,
      time: selectedSlot.time,
      introducer: introducerName,
      applicants: applicants // { lastName, firstName, lastKana, firstKana } の配列
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
  el.style.display = "flex";
}
function hideLoading() {
  document.getElementById("loading").style.display = "none";
}