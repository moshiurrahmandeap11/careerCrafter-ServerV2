const express = require("express");
const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");
  const messagesCollection = db.collection("messages");

  const isHateSpeech = (message) => {
    const badWords = [
      // English
      "fuck",
      "shit",
      "bitch",
      "bastard",
      "asshole",
      "dick",
      "piss",
      "cunt",
      "slut",
      "whore",
      "fag",
      "douche",
      "idiot",
      "stupid",
      "moron",
      "retard",
      "damn",
      "crap",
      "screw",
      "bollocks",
      "bugger",
      "twat",
      "prick",
      "cock",
      "nigger",
      "nigga",
      "arse",
      "pussy",
      "faggot",
      "slut",
      "whore",
      "motherfucker",
      "son of a bitch",
      "jerk",
      "bal",

      // Bangla (common abusive words)
      "হারামজাদা",
      "শুয়োরের বাচ্চা",
      "মাদারচোদ",
      "ভোদা",
      "গান্ডু",
      "চোদন",
      "রাঙা",
      "কুত্তা",
      "কুত্তার বাচ্চা",
      "মায়ের চোদন",
      "বুক চোদা",
      "লেজ চোদা",
      "চুদি",
      "চোদন করা",
      "হিন্দু শুয়োর",
      "শুয়োর",
      "খাট্টা",
      "কামুক",
      "চোদা",
      "লাম্পট",
      "লজ্জাহীন",
      "বুদবুদ",
      "কুপ্রকৃত",
      "ধর্ষক",
      "ধর্ষণ",

      // Mixed/general
      "হায়েনা",
      "গাধা",
      "পাগল",
      "বোকা",
      "বেশ্যা",
      "চুতিয়াপনা",
      "মুর্ক",
      "কুত্তারপোনা",
    ];

    const lowerMessage = message.toLowerCase();
    return badWords.some((word) => lowerMessage.includes(word.toLowerCase()));
  };

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

  router.post("/messages", async (req, res) => {
    try {
      const { fromEmail, toEmail, message } = req.body;

      if (!fromEmail || !toEmail || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }

      if (isHateSpeech(message)) {
        console.log(`Hate speech detected from ${fromEmail}: ${message}`);
        return res.status(403).json({
          error: "Message contains inappropriate content and has been blocked.",
        });
      }

      const chat = {
        fromEmail,
        toEmail,
        message,
        timestamp: new Date(),
        isRead: false, // New field added
      };

      const result = await messagesCollection.insertOne(chat);
      res.status(201).json({ message: "Message saved", data: result });
    } catch (err) {
      console.error("Error saving message:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.get("/messages", async (req, res) => {
    try {
      const { userEmail, friendEmail } = req.query;

      if (!userEmail || !friendEmail) {
        return res
          .status(400)
          .json({ error: "Both userEmail and friendEmail are required" });
      }

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

  router.get("/allMessages", async (req, res) => {
    try {
      let allMessages = await messagesCollection
        .find({})
        .sort({ timestamp: 1 })
        .toArray();

      let removedCount = 0;
      for (let msg of allMessages) {
        if (isHateSpeech(msg.message)) {
          await messagesCollection.deleteOne({ _id: msg._id });
          console.log(
            `Removed old hate message from ${msg.fromEmail}: ${msg.message}`
          );
          allMessages = allMessages.filter(
            (m) => m._id.toString() !== msg._id.toString()
          );
          removedCount++;
        }
      }

      res.status(200).json({
        messages: allMessages,
        blockedCount: removedCount,
      });
    } catch (err) {
      console.error("Error fetching all messages:", err);
      res.status(500).json({ error: "Failed to fetch all messages" });
    }
  });

  // NEW: Get unread messages count for a user
  router.get("/unread-count/:email", async (req, res) => {
    try {
      const userEmail = req.params.email;

      if (!userEmail) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Find unread messages for this user
      const unreadMessages = await messagesCollection
        .find({
          toEmail: userEmail,
          isRead: false,
        })
        .toArray();

      // Get recent messages for notifications (last 5 messages)
      const recentMessages = await messagesCollection
        .find({
          $or: [{ toEmail: userEmail }, { fromEmail: userEmail }],
        })
        .sort({ timestamp: -1 })
        .limit(5)
        .toArray();

      // Get sender information for recent messages
      const recentMessagesWithUserInfo = await Promise.all(
        recentMessages.map(async (msg) => {
          const sender = await usersCollection.findOne(
            { email: msg.fromEmail },
            { projection: { fullName: 1, profileImage: 1 } }
          );

          return {
            ...msg,
            senderName: sender?.fullName || msg.fromEmail,
            senderImage: sender?.profileImage || null,
          };
        })
      );

      res.json({
        unreadCount: unreadMessages.length,
        recentMessages: recentMessagesWithUserInfo,
      });
    } catch (error) {
      console.error("Error fetching unread messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // NEW: Mark messages as read
  router.post("/mark-read/:email", async (req, res) => {
    try {
      const userEmail = req.params.email;

      if (!userEmail) {
        return res.status(400).json({ error: "Email is required" });
      }

      const result = await messagesCollection.updateMany(
        {
          toEmail: userEmail,
          isRead: false,
        },
        {
          $set: { isRead: true },
        }
      );

      res.json({
        success: true,
        message: "Messages marked as read",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // NEW: Mark specific conversation as read
  router.post("/mark-conversation-read", async (req, res) => {
    try {
      const { userEmail, friendEmail } = req.body;

      if (!userEmail || !friendEmail) {
        return res
          .status(400)
          .json({ error: "Both userEmail and friendEmail are required" });
      }

      const result = await messagesCollection.updateMany(
        {
          fromEmail: friendEmail,
          toEmail: userEmail,
          isRead: false,
        },
        {
          $set: { isRead: true },
        }
      );

      res.json({
        success: true,
        message: "Conversation marked as read",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // get last message
  router.get("/last-message", async (req, res) => {
    try {
      const { userEmail, friendEmail } = req.query;

      if (!userEmail || !friendEmail) {
        return res
          .status(400)
          .json({ error: "Both userEmail and friendEmail are required" });
      }

      const messagesArray = await messagesCollection
        .find({
          $or: [
            { fromEmail: userEmail, toEmail: friendEmail },
            { fromEmail: friendEmail, toEmail: userEmail },
          ],
        })
        .toArray();

      messagesArray.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      const lastMessage = messagesArray[0];

      res.json(lastMessage ? [lastMessage] : []);
    } catch (err) {
      console.error("Error fetching last message:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};
