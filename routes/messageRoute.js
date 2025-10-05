const express = require("express");
const router = express.Router();
module.exports = (db) => {
  const usersCollection = db.collection("users");
  router.get("/usersEmail", async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }
      const usersEmail = await usersCollection
        .find({ email: { $ne: email } })
        .toArray();
      res.status(200).json(usersEmail);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  // --- CHAT ROUTES ---
// Save a message
router.post("/messages", async (req, res) => {
  try {
    const { fromEmail, toEmail, message } = req.body;

    if (!fromEmail || !toEmail || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const client = await connectDB();
    const db = client.db(dbName);
    const messagesCollection = db.collection("messages");

    const chat = {
      fromEmail,
      toEmail,
      message,
      timestamp: new Date(),
    };

    const result = await messagesCollection.insertOne(chat);
    res.status(201).json({ message: "Message saved", data: result });
  } catch (err) {
    console.error("Error saving message:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get chat history between two users
router.get("/messages", async (req, res) => {
  try {
    const { userEmail, friendEmail } = req.query;

    if (!userEmail || !friendEmail) {
      return res
        .status(400)
        .json({ error: "Both userEmail and friendEmail are required" });
    }

    const messagesCollection = db.collection("messages");

    const chats = await messagesCollection
      .find({
        $or: [
          { fromEmail: userEmail, toEmail: friendEmail },
          { fromEmail: friendEmail, toEmail: userEmail },
        ],
      })
      .sort({ timestamp: 1 })
      .toArray();

    res.json(chats);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Server error" });
  }
});
  return router;
};
