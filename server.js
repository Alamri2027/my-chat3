const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const bcrypt = require("bcryptjs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static("public"));

const adapter = new JSONFile("db.json");

const db = new Low(adapter, {
  users: [],
  messages: []
});

const onlineUsers = {};

async function initDB() {
  await db.read();

  db.data ||= {
    users: [],
    messages: []
  };

  await db.write();
}

initDB();

io.on("connection", (socket) => {

  console.log("User Connected:", socket.id);
  // تسجيل مستخدم جديد
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

  // تسجيل الدخول
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

  });  // الانضمام إلى غرفة
  socket.on("join-room", async ({ username, room }) => {

    socket.join(room);

    onlineUsers[socket.id] = {
      username,
      room
    };

    await db.read();

    const messages = db.data.messages.filter(
      m => m.room === room
    );

    messages.forEach(msg => {
      socket.emit("message", {
        user: msg.user,
        text: msg.text
      });
    });

    socket.to(room).emit("message", {
      user: "النظام",
      text: `${username} انضم إلى الغرفة`
    });

    updateUsers(room);

  });

  // إرسال رسالة
  socket.on("chat-message", async (text) => {

    const user = onlineUsers[socket.id];

    if (!user) return;

    const message = {
      room: user.room,
      user: user.username,
      text,
      time: Date.now()
    };

    db.data.messages.push(message);

    await db.write();

    io.to(user.room).emit("message", {
      user: user.username,
      text
    });

  });

  // عند خروج المستخدم
  socket.on("disconnect", () => {

    const user = onlineUsers[socket.id];

    if (!user) return;

    io.to(user.room).emit("message", {
      user: "النظام",
      text: `${user.username} غادر الغرفة`
    });

    delete onlineUsers[socket.id];

    updateUsers(user.room);

  });});

function updateUsers(room) {

  const users = Object.values(onlineUsers)
    .filter(user => user.room === room)
    .map(user => user.username);

  io.to(room).emit("room-users", users);

}

const PORT = process.env.PORT || 3004;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
