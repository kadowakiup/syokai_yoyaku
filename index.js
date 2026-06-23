const GAS_URL = "https://script.google.com/macros/s/あなたのデプロイURL/exec";

let reservationData = []; // Anycrossから取得した空き枠データ
let introducerName = ""; // Anycrossから取得した紹介者名
let currentStartDate = new Date(); // カレンダー表示の起点（今日）
let selectedSlot = null; // 選択された予約枠

window.onload = async function () {
  showLoading("初期化中...");
  try {
    await liff.init({ liffId: "あなたのLIFF_ID" });
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

// ① Anycross経由で予約状況を取得
async function fetchReservationData(idToken) {
  showLoading("予約状況を取得中...");
  const profile = await liff.getProfile();
  
  const url = `${GAS_URL}?action=fetchSlots&userId=${encodeURIComponent(profile.userId)}&idToken=${encodeURIComponent(idToken)}&t=${Date.now()}`;
  
  const res = await fetch(url);
  const data = await res.json();

  if (!data.success) throw new Error(data.message || "データ取得失敗");

  // Anycrossからの戻り値想定: { introducer: "田中", slots: [{ date: "2026-06-25", time: "14:00", available: true }, ...] }
  introducerName = data.introducer || "不明";
  reservationData = data.slots || [];
  
  // 今日の日付で時間をリセット
  currentStartDate = new Date();
  currentStartDate.setHours(0, 0, 0, 0);
  
  renderCalendar();
}

// カレンダーの描画（7日間表示）
function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 表示期間のラベル更新
  const endDate = new Date(currentStartDate);
  endDate.setDate(endDate.getDate() + 6);
  document.getElementById("current-week-label").textContent = 
    `${currentStartDate.getMonth()+1}/${currentStartDate.getDate()} 〜 ${endDate.getMonth()+1}/${endDate.getDate()}`;

  // 「前の週」ボタンの制御（今日より前には戻れないようにする）
  document.getElementById("btn-prev-week").disabled = currentStartDate <= today;

  const weekNames = ["日", "月", "火", "水", "木", "金", "土"];

  // 7日分の列を作成
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(currentStartDate);
    targetDate.setDate(targetDate.getDate() + i);
    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,"0")}-${String(targetDate.getDate()).padStart(2,"0")}`;

    const col = document.createElement("div");
    col.className = "calendar-col";

    const header = document.createElement("div");
    header.className = "calendar-header";
    header.innerHTML = `${targetDate.getDate()}日<br>(${weekNames[targetDate.getDay()]})`;
    col.appendChild(header);

    // その日の予約枠をフィルタリングして表示
    const daySlots = reservationData.filter(slot => slot.date === dateStr);
    
    if (daySlots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "slot empty";
      empty.textContent = "枠なし";
      col.appendChild(empty);
    } else {
      daySlots.forEach(slot => {
        const slotBtn = document.createElement("button");
        slotBtn.className = `slot ${slot.available ? 'available' : 'full'}`;
        slotBtn.textContent = slot.time;
        slotBtn.disabled = !slot.available;
        
        if (slot.available) {
          slotBtn.onclick = () => openForm(slot);
        }
        col.appendChild(slotBtn);
      });
    }
    grid.appendChild(col);
  }
}

// フォームを開く
function openForm(slot) {
  selectedSlot = slot;
  document.getElementById("input-datetime").value = `${slot.date} ${slot.time}`;
  document.getElementById("input-introducer").value = introducerName;
  
  // 応募者入力欄を初期化（最低1名）
  const container = document.getElementById("applicants-container");
  container.innerHTML = "";
  addApplicantField();

  switchView("view-form");
}

// 応募者入力フィールドの追加
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

// 確認画面の生成
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

// Anycrossへ提出
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

// イベントリスナーの登録
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

// ユーティリティ
function switchView(viewId) {
  ["view-calendar", "view-form", "view-confirm"].forEach(id => {
    document.getElementById(id).style.display = (id === viewId) ? "block" : "none";
  });
}
function showLoading(text) {
  const el = document.getElementById("loading");
  el.textContent = text;
  el.style.display = "block";
}
function hideLoading() {
  document.getElementById("loading").style.display = "none";
}