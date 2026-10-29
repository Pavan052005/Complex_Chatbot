const sports = [
  {
    id: "cricket",
    name: "Cricket",
    emoji: "🏏",
    venue: "Outdoor pitch",
    hours: "7:00 AM – 8:00 PM",
    slots: ["7:00 AM", "9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM", "6:00 PM"],
  },
  {
    id: "football",
    name: "Football",
    emoji: "⚽",
    venue: "Football field",
    hours: "6:00 AM – 9:00 PM",
    slots: ["6:00 AM", "8:00 AM", "10:00 AM", "1:00 PM", "4:00 PM", "7:00 PM"],
  },
  {
    id: "swimming",
    name: "Swimming",
    emoji: "🏊",
    venue: "Indoor pool",
    hours: "6:00 AM – 10:00 PM",
    slots: ["6:00 AM", "8:00 AM", "10:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"],
  },
];

const bookingStorageKey = "sports-complex-bookings";
const messages = document.querySelector("#chat-messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const sportList = document.querySelector("#sport-list");
const upcomingList = document.querySelector("#upcoming-list");
const bookingCount = document.querySelector("#booking-count");

let bookings = loadBookings();
let activeBooking = null;
let conversationHistory = [];

function loadBookings() {
  try {
    const saved = localStorage.getItem(bookingStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new TypeError("Saved bookings are not a list.");
    return parsed.filter(
      (booking) =>
        booking &&
        typeof booking.id === "string" &&
        sports.some((sport) => sport.id === booking.sportId) &&
        typeof booking.date === "string" &&
        typeof booking.time === "string",
    );
  } catch (error) {
    console.error("Could not load saved Sports Complex bookings.", error);
    return [];
  }
}

function saveBookings() {
  try {
    localStorage.setItem(bookingStorageKey, JSON.stringify(bookings));
    return true;
  } catch (error) {
    console.error("Could not save Sports Complex bookings.", error);
    addMessage("I couldn't save that booking in this browser. Please check your browser storage settings and try again.");
    return false;
  }
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(key, options = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(dateFromKey(key));
}

function getNextDates(count = 7) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index);
    return { key: localDate(date), date };
  });
}

function timeHasPassed(dateKey, timeLabel) {
  if (dateKey !== localDate(new Date())) return false;
  const match = timeLabel.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
  if (!match) return false;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  const slotMinutes = hour * 60 + Number(match[2]);
  const now = new Date();
  return slotMinutes <= now.getHours() * 60 + now.getMinutes();
}

function setTodayLabels() {
  const today = new Date();
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(today);
  document.querySelector("#current-year").textContent = today.getFullYear();
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSports() {
  sportList.replaceChildren();
  for (const sport of sports) {
    const card = createElement("article", "sport-card");
    const icon = createElement("span", "sport-card-icon", sport.emoji);
    icon.setAttribute("aria-hidden", "true");

    const detail = createElement("div", "sport-card-main");
    detail.append(createElement("h3", "", sport.name), createElement("p", "", sport.venue));

    const timing = createElement("div", "sport-slots");
    timing.append(
      createElement("span", "", sport.slots.length + " sessions"),
      createElement("small", "", sport.hours),
    );

    card.append(icon, detail, timing);
    sportList.append(card);
  }
}

function renderBookings() {
  const sorted = [...bookings].sort((a, b) => {
    const aDate = `${a.date} ${a.time}`;
    const bDate = `${b.date} ${b.time}`;
    return aDate.localeCompare(bDate);
  });

  bookingCount.textContent = String(sorted.length);
  upcomingList.replaceChildren();
  if (!sorted.length) {
    const empty = createElement("div", "empty-bookings");
    empty.append(createElement("span", "", "◷"), document.createTextNode("No sessions booked yet. Your next game starts here."));
    upcomingList.append(empty);
    return;
  }

  for (const booking of sorted) {
    const sport = sports.find((item) => item.id === booking.sportId);
    if (!sport) continue;

    const card = createElement("article", "booking-card");
    const date = createElement("div", "booking-date");
    date.append(
      createElement("span", "", formatDate(booking.date, { weekday: "short" })),
      createElement("strong", "", String(dateFromKey(booking.date).getDate())),
    );
    const detail = createElement("div", "booking-detail");
    detail.append(
      createElement("strong", "", `${sport.emoji} ${sport.name}`),
      createElement("span", "", `${booking.time} · ${formatDate(booking.date, { month: "short" })}`),
    );
    const cancel = createElement("button", "cancel-booking", "Cancel");
    cancel.type = "button";
    cancel.setAttribute("aria-label", `Cancel ${sport.name} session on ${formatDate(booking.date)}`);
    cancel.addEventListener("click", () => cancelBooking(booking.id));
    card.append(date, detail, cancel);
    upcomingList.append(card);
  }
}

function addMessage(text, sender = "assistant") {
  const row = createElement("div", `message-row ${sender === "user" ? "user-row" : "assistant-row"}`);
  const avatar = createElement("div", "message-avatar", sender === "user" ? "Y" : "S");
  avatar.setAttribute("aria-hidden", "true");
  const content = createElement("div", "message-content");
  const bubble = createElement("div", "message-bubble");
  for (const [index, paragraph] of text.split("\n").entries()) {
    const p = createElement("p", "", paragraph);
    if (index > 0) p.style.marginTop = "7px";
    bubble.append(p);
  }
  const time = createElement("span", "message-time", new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date()));
  content.append(bubble, time);
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

function showChoices(items, onSelect) {
  const list = createElement("div", "choice-list");
  for (const item of items) {
    const button = createElement("button", "choice-button");
    button.type = "button";
    button.disabled = Boolean(item.disabled);
    button.setAttribute("aria-label", item.ariaLabel || item.label);

    if (item.emoji) {
      const emoji = createElement("span", "sport-emoji", item.emoji);
      emoji.setAttribute("aria-hidden", "true");
      button.append(emoji);
    }
    const label = createElement("strong", "", item.label);
    button.append(label);
    if (item.detail) button.append(createElement("small", "", item.detail));

    if (!item.disabled) {
      button.addEventListener("click", () => {
        list.remove();
        addMessage(item.label, "user");
        onSelect(item.value);
      });
    }
    list.append(button);
  }
  messages.append(list);
  messages.scrollTop = messages.scrollHeight;
}

function chooseSport() {
  activeBooking = null;
  addMessage("Which sport would you like to play?");
  showChoices(
    sports.map((sport) => ({ label: sport.name, emoji: sport.emoji, value: sport.id })),
    chooseDate,
  );
}

function chooseDate(sportId) {
  activeBooking = { sportId };
  const options = getNextDates().map(({ key, date }, index) => ({
    label: index === 0 ? "Today" : index === 1 ? "Tomorrow" : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
    detail: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date),
    value: key,
  }));
  addMessage(`Great choice! Pick a day for ${getSport(sportId).name}.`);
  showChoices(options, (date) => chooseTime(sportId, date));
}

function chooseTime(sportId, date) {
  activeBooking = { sportId, date };
  const sport = getSport(sportId);
  addMessage(`Here are the ${sport.name} session times for ${formatDate(date)}. Choose an available slot:`);
  const options = sport.slots.map((time) => {
    const taken = bookings.some(
      (booking) => booking.sportId === sportId && booking.date === date && booking.time === time,
    );
    const passed = timeHasPassed(date, time);
    return {
      label: time,
      detail: taken ? "Booked" : passed ? "Passed" : "Available",
      value: time,
      disabled: taken || passed,
      ariaLabel: `${time}, ${taken ? "booked" : passed ? "session time has passed" : "available"}`,
    };
  });
  showChoices(options, (time) => confirmBooking(sportId, date, time));
}

function confirmBooking(sportId, date, time) {
  const sport = getSport(sportId);
  const alreadyBooked = bookings.some(
    (booking) => booking.sportId === sportId && booking.date === date && booking.time === time,
  );
  if (alreadyBooked) {
    addMessage("That slot was just booked. Please choose another available time.");
    chooseTime(sportId, date);
    return;
  }

  const booking = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sportId,
    date,
    time,
  };
  bookings.push(booking);
  if (!saveBookings()) {
    bookings = bookings.filter((item) => item.id !== booking.id);
    return;
  }

  activeBooking = null;
  renderBookings();
  addMessage(`You're booked! 🎉 Your ${sport.name} session is on ${formatDate(date)} at ${time}. See you there!`);
  showChoices(
    [
      { label: "Book another session", value: "book" },
      { label: "See schedule", value: "schedule" },
    ],
    handleAction,
  );
}

function cancelBooking(id) {
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  bookings = bookings.filter((item) => item.id !== id);
  if (!saveBookings()) {
    bookings.push(booking);
    return;
  }
  renderBookings();
  const sport = getSport(booking.sportId);
  addMessage(`Your ${sport.name} session on ${formatDate(booking.date)} at ${booking.time} has been cancelled.`);
}

function getSport(id) {
  return sports.find((sport) => sport.id === id);
}

function showSchedule() {
  const lines = sports.map((sport) => `${sport.emoji} ${sport.name}: ${sport.slots.join(", ")}`);
  addMessage(`Here's today's schedule:\n${lines.join("\n")}\nChoose a sport and day to check live availability.`);
  chooseSport();
}

function handleAction(action) {
  if (action === "book" || action === "sports") {
    chooseSport();
    return;
  }
  if (action === "schedule") {
    handleText("Show today's schedule");
    return;
  }
}

async function handleText(text) {
  const message = text.trim();
  if (!message) return;
  addMessage(message, "user");
  const normalized = message.toLowerCase();
  const sendButton = form.querySelector(".send-button");
  input.disabled = true;
  sendButton.disabled = true;
  sendButton.setAttribute("aria-label", "Sending message");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: conversationHistory,
        bookings: bookings.map(({ sportId, date, time }) => ({ sportId, date, time })),
      }),
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`The server returned an unreadable response (${response.status}).`);
    }
    if (!response.ok) throw new Error(result.error || `Gemini request failed (${response.status}).`);
    if (typeof result.reply !== "string" || !result.reply.trim()) {
      throw new Error("Gemini returned an empty response. Please try again.");
    }

    conversationHistory.push(
      { role: "user", parts: [{ text: message }] },
      { role: "model", parts: [{ text: result.reply }] },
    );
    conversationHistory = conversationHistory.slice(-12);
    addMessage(result.reply);

    const sport = sports.find((item) => normalized.includes(item.id) || (item.id === "swimming" && /\bswim\b/.test(normalized)));
    if (/\b(book|booking|reserve|session)\b/.test(normalized)) {
      if (sport) {
        showChoices([{ label: `Choose ${sport.name}`, value: sport.id }], chooseDate);
      } else {
        showChoices([{ label: "Choose a sport", value: "book" }], handleAction);
      }
    } else if (/\b(schedule|times?|when|available|availability|hours?)\b/.test(normalized)) {
      showChoices(
        sports.map((item) => ({ label: `Book ${item.name}`, emoji: item.emoji, value: item.id })),
        chooseDate,
      );
    }
  } catch (error) {
    console.error("Sports Complex Gemini chat request failed.", error);
    const messageText = error instanceof Error ? error.message : "An unexpected error occurred.";
    addMessage(`I couldn't get a reply: ${messageText}`);
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    sendButton.setAttribute("aria-label", "Send message");
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleText(input.value);
  input.value = "";
  input.focus();
});

document.querySelector("#restart-chat").addEventListener("click", () => {
  messages.replaceChildren();
  conversationHistory = [];
  activeBooking = null;
  addMessage("Hey there! 👋 Ask me about cricket, football, swimming, rules, or game and pool measurements.\nI can also help you find and book a session.");
});

setTodayLabels();
renderSports();
renderBookings();
