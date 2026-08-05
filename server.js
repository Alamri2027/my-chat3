const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const bcrypt = require("bcryptjs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const users = {};

const adapter = new JSONFile("db.json");
const db = new Low(adapter, {
  users: [],
  messages: []
});

async function initDB() {
  await db.read();

  if (!db.data) {
    db.data = {
      users: [],
      messages: []
    };
    await db.write();
  }
}

initDB();

io.on("connection", (socket) => {

  socket.on("register", async ({ username, password }, callback) => {

    await db.read();

    const exists = db.data.users.find(
      u => u.username === username
    );

    if (exists) {
      return callback({
        success: false,
        message: "اسم المستخدم موجود"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    db.data.users.push({
      username,
      password: hash
    });

    await db.write();

    callback({
      success: true
    });

  });

  socket.on("login", async ({ username, password }, callback) => {

    await db.read();

    const user = db.data.users.find(
      u => u.username === username
    );

    if (!user) {
      return callback({
        success: false,
        message: "اسم المستخدم غير موجود"
      });
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return callback({
        success: false,
        message: "كلمة المرور غير صحيحة"
      });
    }

    callback({
      success: true
    });

  });

  socket.on("join-room", async ({ username, room }) => {

    socket.join(room);

    users[socket.id] = {
      username,
      room
    };

    await db.read();

    const messages = db.data.messages.filter(
      m => m.room === room
    );

    messages.forEach(m => {
      socket.emit("message", {
        user: m.user,
        text: m.text
      });
    });

    socket.to(room).emit("message", {
      user: "النظام",
      text: `${username} انضم إلى الغرفة`
    });

    updateUsers(room);

  });

  socket.on("chat-message", async (msg) => {

    const user = users[socket.id];

    if (!user) return;

    db.data.messages.push({
      room: user.room,
      user: user.username,
      text: msg,
      time: Date.now()
    });

    await db.write();

    io.to(user.room).emit("message", {
      user: user.username,
      text: msg
    });

  });

  socket.on("disconnect", () => {

    const user = users[socket.id];

    if (user) {

      io.to(user.room).emit("message", {
        user: "النظام",
        text: `${user.username} غادر الغرفة`
      });

      delete users[socket.id];

      updateUsers(user.room);

    }

  });

});

function updateUsers(room) {

  const list = Object.values(users)
    .filter(u => u.room === room)
    .map(u => u.username);

  io.to(room).emit("room-users", list);

}

const PORT = 3004;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
