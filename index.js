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
const userRoutes = require("./routes/user")



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
