// ===============================
// Career Crafter Backend Server
// ===============================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { createServer } = require("node:http");
const { MongoClient, ServerApiVersion } = require("mongodb");

const admin = require("firebase-admin");
// decode base64 key from .env
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, "base64").toString("utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
const messageRoutes = require("./routes/messageRoute")
const networkRoutes = require("./routes/network");
const faviconRoutes = require("./routes/favicon")
const logoRoutes = require("./routes/logo")
const sitemapRoutes = require("./routes/sitemap")
const settingsRoute = require("./routes/settings")
const paymentRoutes = require("./routes/payments");
const learnRoutes = require("./routes/learn")
const jobsRoutes = require("./routes/job")
const applicationRoutes = require("./routes/applications")
const aiJobRoutes = require("./routes/ai-job")
const resumeRoutes = require("./routes/resume")
const resumeCheckRoutes = require('./routes/resumeCheck');
const aichatbotCollection = require("./routes/ai-chatbot")



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
        console.log("Groq API Key:", process.env.GROQ_API_KEY ? "Loaded" : "Not found"); 

    const db = client.db("careerCrafter");

    // routes
    app.use("/v1/users", userRoutes(db));
    app.use("/v1/messageUsers", messageRoutes(db));
    app.use("/v1/network", networkRoutes(db))
    app.use("/v1/favicon", faviconRoutes(db))
    app.use("/v1/logo", logoRoutes(db))
    app.use("/v1/sitemap", sitemapRoutes(db))
    app.use("/v1/settings", settingsRoute(db))
    app.use("/v1/payments", paymentRoutes(db));
    app.use("/v1/learn", learnRoutes(db))
    app.use("/v1/jobs", jobsRoutes(db))
    app.use("/v1/applications", applicationRoutes(db))
    app.use("/v1/ai-jobs", aiJobRoutes(db))
    app.use("/v1/resumes", resumeRoutes(db))
    app.use("/v1/resume-check", resumeCheckRoutes(db));
    app.use("/v1/ai-chatbot", aichatbotCollection(db))

  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
  }
}

run().catch(console.dir);
// index.js (updated socket events)
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.on("joinRoom", async (userEmail) => {
    if (!userEmail) return;
    socket.join(userEmail);
    console.log(`${userEmail} joined their private room`);
  });

  // Call-related socket events
  socket.on("start-call", (data) => {
    const { to, from, callType, offer } = data;
    socket.to(to).emit("incoming-call", {
      callerInfo: from,
      callType,
      offer
    });
  });

  socket.on("accept-call", (data) => {
    const { to, answer } = data;
    socket.to(to).emit("call-accepted", {
      answer
    });
  });

  socket.on("reject-call", (data) => {
    const { to } = data;
    socket.to(to).emit("call-rejected");
  });

  socket.on("end-call", (data) => {
    const { to } = data;
    socket.to(to).emit("call-ended");
  });

  socket.on("ice-candidate", (data) => {
    const { target, candidate } = data;
    socket.to(target).emit("ice-candidate", {
      candidate
    });
  });

  // Existing message events
  socket.on("privateMessage", async ({ senderEmail, receiverEmail, text }) => {
    try {
      const db = client.db("careerCrafter");
      const messagesCollection = db.collection("messages");

      const chat = {
        fromEmail: senderEmail,
        toEmail: receiverEmail,
        message: text,
        timestamp: new Date(),
      };

      await messagesCollection.insertOne(chat);

      io.to(receiverEmail).emit("chatMessage", chat);
      io.to(senderEmail).emit("chatMessage", chat);
    } catch (err) {
      console.error("Socket message save error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id);
  });
});


app.get("/", (req, res) => {
  res.send("Career Crafter running now");
});

server.listen(port, () => {
  console.log(`career Crafter running on port ${port}`);
});
