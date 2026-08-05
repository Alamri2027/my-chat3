const socket = io();

const input = document.getElementById("message");
const messages = document.getElementById("messages");

function sendMessage() {
  const text = input.value.trim();

  if (text === "") return;

  socket.emit("chat message", text);
  input.value = "";
}

socket.on("chat message", (msg) => {
  const div = document.createElement("div");
  div.className = "message";
  div.textContent = msg;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
});

input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});
