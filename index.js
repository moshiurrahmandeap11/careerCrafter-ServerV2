// ===============================
// Career Crafter Backend Server
// ===============================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { createServer } = require("node:http");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

// Import routes
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
const notificationRoutes = require("./routes/notifications");
const aichatbotCollection = require("./routes/ai-chatbot")
const cvRoutes = require('./routes/cv');
const postForHired = require("./routes/postForHired");
const topSearch = require("./routes/topSearch");

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

    // Routes
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
    app.use("/v1/notifications", notificationRoutes(db));
    app.use("/v1/ai-chatbot", aichatbotCollection(db))
    app.use("/v1/cvs", cvRoutes(db));
    app.use("/v1/hired-post", postForHired(db))
    app.use("/v1/top-search", topSearch(db))

  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
  }
}

run().catch(console.dir);

// Socket.io real-time communication
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.on("joinRoom", async (userEmail) => {
    if (!userEmail) return;
    socket.join(userEmail);
    console.log(`${userEmail} joined their private room`);
  });

  // Call-related socket events (unchanged)
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

  // Message events with notifications
  socket.on("privateMessage", async ({ senderEmail, receiverEmail, text }) => {
    try {
      const db = client.db("careerCrafter");
      const messagesCollection = db.collection("messages");
      const notificationsCollection = db.collection("notifications");
      const usersCollection = db.collection("users");

      // Save message
      const chat = {
        fromEmail: senderEmail,
        toEmail: receiverEmail,
        message: text,
        timestamp: new Date(),
      };

      await messagesCollection.insertOne(chat);

      // Get sender info for notification
      const sender = await usersCollection.findOne(
        { email: senderEmail },
        { projection: { fullName: 1, profileImage: 1 } }
      );

      // Create notification for receiver
      const notification = {
        userEmail: receiverEmail,
        type: 'message',
        message: `New message from ${sender?.fullName || senderEmail}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
        senderName: sender?.fullName || senderEmail,
        senderImage: sender?.profileImage,
        relatedId: chat._id.toString(),
        isRead: false,
        timestamp: new Date()
      };

      const notificationResult = await notificationsCollection.insertOne(notification);

      // Emit notification to receiver
      socket.to(receiverEmail).emit("newNotification", {
        ...notification,
        _id: notificationResult.insertedId
      });

      // Emit messages to both users
      io.to(receiverEmail).emit("chatMessage", chat);
      io.to(senderEmail).emit("chatMessage", chat);

    } catch (err) {
      console.error("Socket message/notification error:", err);
    }
  });

  // Network notification events
  socket.on("sendConnectionRequest", async (data) => {
    try {
      const { senderEmail, receiverEmail } = data;
      const db = client.db("careerCrafter");
      const usersCollection = db.collection("users");
      const notificationsCollection = db.collection("notifications");

      // Get sender info
      const sender = await usersCollection.findOne(
        { email: senderEmail },
        { projection: { fullName: 1, profileImage: 1 } }
      );

      // Create connection request notification
      const notification = {
        userEmail: receiverEmail,
        type: 'connection_request',
        message: `${sender?.fullName || senderEmail} sent you a connection request`,
        senderName: sender?.fullName || senderEmail,
        senderImage: sender?.profileImage,
        isRead: false,
        timestamp: new Date()
      };

      const result = await notificationsCollection.insertOne(notification);

      // Emit notification to receiver
      socket.to(receiverEmail).emit("newNotification", {
        ...notification,
        _id: result.insertedId
      });

    } catch (err) {
      console.error("Socket connection request error:", err);
    }
  });

  socket.on("acceptConnectionRequest", async (data) => {
    try {
      const { senderEmail, receiverEmail } = data;
      const db = client.db("careerCrafter");
      const usersCollection = db.collection("users");
      const notificationsCollection = db.collection("notifications");

      // Get receiver info (the one who accepted)
      const receiver = await usersCollection.findOne(
        { email: receiverEmail },
        { projection: { fullName: 1, profileImage: 1 } }
      );

      // Create connection accepted notification for original sender
      const notification = {
        userEmail: senderEmail,
        type: 'connection_accepted',
        message: `${receiver?.fullName || receiverEmail} accepted your connection request`,
        senderName: receiver?.fullName || receiverEmail,
        senderImage: receiver?.profileImage,
        isRead: false,
        timestamp: new Date()
      };

      const result = await notificationsCollection.insertOne(notification);

      // Emit notification to original sender
      socket.to(senderEmail).emit("newNotification", {
        ...notification,
        _id: result.insertedId
      });

    } catch (err) {
      console.error("Socket connection accept error:", err);
    }
  });

  // Listen for notification read events
  socket.on("markNotificationRead", async (notificationId) => {
    try {
      const db = client.db("careerCrafter");
      const notificationsCollection = db.collection("notifications");

      await notificationsCollection.updateOne(
        { _id: new ObjectId(notificationId) },
        { $set: { isRead: true } }
      );
    } catch (err) {
      console.error("Error marking notification as read:", err);
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