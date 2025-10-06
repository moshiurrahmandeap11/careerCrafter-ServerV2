const express = require("express");
const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");
  const messagesCollection = db.collection("messages");  


  const isHateSpeech = (message) => {

const badWords = [
  // English
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'piss', 'cunt', 'slut',
  'whore', 'fag', 'douche', 'idiot', 'stupid', 'moron', 'retard', 'damn', 'crap',
  'screw', 'bollocks', 'bugger', 'twat', 'prick', 'cock', 'nigger', 'nigga', 'arse',
  'pussy', 'faggot', 'slut', 'whore', 'motherfucker', 'son of a bitch', 'jerk',

  // Bangla (common abusive words)
  'হারামজাদা', 'শুয়োরের বাচ্চা', 'মাদারচোদ', 'ভোদা', 'গান্ডু',
  'চোদন', 'রাঙা', 'কুত্তা', 'কুত্তার বাচ্চা', 'মায়ের চোদন', 'বুক চোদা', 
  'লেজ চোদা', 'চুদি', 'চোদন করা', 'হিন্দু শুয়োর', 'শুয়োর', 'খাট্টা', 'কামুক',
  'চোদা', 'লাম্পট', 'লজ্জাহীন', 'বুদবুদ', 'কুপ্রকৃত', 'ধর্ষক', 'ধর্ষণ',
  
  // Mixed/general
  'হায়েনা', 'গাধা', 'পাগল', 'বোকা', 'বেশ্যা', 'চুতিয়াপনা', 'মুর্ক', 'কুত্তারপোনা'
];


    const lowerMessage = message.toLowerCase();
    return badWords.some(word => lowerMessage.includes(word.toLowerCase()));
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
          error: "Message contains inappropriate content and has been blocked." 
        });  
      }

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
      let allMessages = await messagesCollection.find({}).sort({ timestamp: 1 }).toArray();

      let removedCount = 0;
      for (let msg of allMessages) {
        if (isHateSpeech(msg.message)) {
          await messagesCollection.deleteOne({ _id: msg._id });
          console.log(`Removed old hate message from ${msg.fromEmail}: ${msg.message}`);
          allMessages = allMessages.filter(m => m._id.toString() !== msg._id.toString());
          removedCount++;
        }
      }
      
      res.status(200).json({ 
        messages: allMessages,  
        blockedCount: removedCount  
      });
    } catch (err) {
      console.error("Error fetching all messages:", err);
      res.status(500).json({ error: "Failed to fetch all messages" });
    }
  });

  return router;
};
