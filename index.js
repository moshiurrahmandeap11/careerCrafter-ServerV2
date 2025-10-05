// ===============================
// Career Crafter Backend Server
// ===============================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { createServer } = require("node:http");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
// Middleware
app.use(cors());
app.use(express.json());

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

const uri = `mongodb+srv://${user}:${pass}@mdb.26vlivz.mongodb.net/?retryWrites=true&w=majority&appName=MDB`;

// import routes

const userRoutes = require("./routes/user");
const messageRoutes = require("./routes/messageRoute");

const userRoutes = require("./routes/user")
const logoRoutes = require("./routes/logo")
const faviconRoutes = require("./routes/favicon")
const sitemapRoutes = require("./routes/sitemap")
const settingsRoutes = require("./routes/settings")


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected To MongoDB");

    const db = client.db("careerCrafter");

    // routes
    app.use("/v1/users", userRoutes(db));
    app.use("/v1/messageUsers", messageRoutes(db));
    app.use("/v1/users", userRoutes(db))
    app.use("/v1/logo", logoRoutes(db))
    app.use("/v1/favicon", faviconRoutes(db))
    app.use("/v1/sitemap", sitemapRoutes(db))
    app.use("/v1/settings", settingsRoutes(db))

  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
  }
}

run().catch(console.dir);
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.on("joinRoom", async (userEmail) => {
    if (!userEmail) return;
    socket.join(userEmail); 
    console.log(`${userEmail} joined their private room`);
  });

  socket.on("privateMessage", async ({ senderEmail, receiverEmail, text }) => {
    const db = client.db("careerCrafter");
    const messagesCollection = db.collection("messages");

    const msg = {
      senderEmail,
      receiverEmail,
      text,
      createdAt: new Date(),
    };

    // Save message to DB
    await messagesCollection.insertOne(msg);

    io.to(receiverEmail).emit("chatMessage", msg);

    io.to(senderEmail).emit("chatMessage", msg);
  });
});

app.get("/", (req, res) => {
  res.send("Career Crafter running now");
});

server.listen(port, () => {
  console.log(`career Crafter running on port ${port}`);
});
