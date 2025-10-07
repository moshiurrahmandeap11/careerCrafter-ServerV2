const express = require("express");
const { ObjectId } = require("mongodb");
const verifyFirebaseToken = require("../middleWare/verifyFirebaseToken");

const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");
  const connectsCollection = db.collection("connects");

  // ✅ Send a connection request
  router.post('/connectReq', async (req, res) => {
    try {
      const { receiverId } = req.body;
      const senderId = req.user.id;

      // 🔍 Check if request already exists (either direction)
      const exist = await connectsCollection.findOne({
        $or: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId }
        ]
      });

      if (exist) return res.status(400).json({ message: "Request already exists!" });

      const newRequest = {
        senderId,
        receiverId,
        status: "pending",
        createdAt: new Date()
      };

      await connectsCollection.insertOne(newRequest);
      res.status(201).json(newRequest);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });



  // 📥 Get all pending requests for the logged-in user
  router.get('/pendingReq', async (req, res) => {
    try {
      const userId = req.user.id;
      const pending = await connectsCollection
        .find({ receiverId: userId, status: "pending" })
        .toArray();
      res.json(pending);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });



  // ✅ Accept a connection request
  router.patch('/accept/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const updated = await connectsCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status: "accepted" } },
        { returnDocument: "after" }
      );
      res.json(updated.value);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });



  // ❌ Ignore a connection request
  router.patch("/ignore/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const updated = await connectsCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status: "ignored" } },
        { returnDocument: "after" }
      );
      res.json(updated.value);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });




  // 🔗 Get all accepted connections for the logged-in user
  router.get("/myConnections", async (req, res) => {
    try {
      const userId = req.user.id;
      const connections = await connectsCollection.find({
        status: "accepted",
        $or: [{ senderId: userId }, { receiverId: userId }]
      }).toArray();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });




  // 💡 Get suggested users to connect with (no pagination)
  router.get('/getSuggestion',verifyFirebaseToken, async (req, res) => {
    try {
    const userId = req.user && (req.user.uid || req.user.id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // fetch connects involving this user
    const blockedDocs = await connectsCollection.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    }).toArray();

    // build deduplicated blocked id set (strings)
    const blockedSet = new Set();
    for (const c of blockedDocs) {
      if (c.senderId) blockedSet.add(c.senderId);
      if (c.receiverId) blockedSet.add(c.receiverId);
    }
    blockedSet.delete(userId); // exclude self

    const blockedArr = Array.from(blockedSet);
    // filter users by string _id field (no ObjectId conversion)
    const filter = blockedArr.length
      ? { _id: { $nin: blockedArr.concat([userId]) } }
      : { _id: { $ne: userId } };

    // project fields you want to return
    const users = await usersCollection.find(filter)
      .project({ _id: 1, fullName: 1, email: 1, profileImage: 1 })
      .toArray();

    res.json(users);
  } catch (err) {
    console.error('getSuggestion error', err);
    res.status(500).json({ message: err.message });
  }

  });

 

  return router;
};