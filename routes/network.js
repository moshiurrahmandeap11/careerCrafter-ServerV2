const express = require("express");
const { ObjectId } = require("mongodb");

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
  router.get('/getSuggestion', async (req, res) => {
    try {
      const userId = req.user.id;

      // 🛑 Find all users already connected or requested
      const blocked = await connectsCollection.find({
        $or: [{ senderId: userId }, { receiverId: userId }]
      }).toArray();

      const blockedIds = blocked.map(conn =>
        conn.senderId === userId ? conn.receiverId : conn.senderId
      );

      // 🧠 Suggest users excluding blocked and self
      const users = await usersCollection.find({
        _id: { $nin: [...blockedIds.map(id => new ObjectId(id)), new ObjectId(userId)] }
      })
        .project({ name: 1, email: 1 })
        .toArray();

      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  return router;
};