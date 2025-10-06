const express = require("express");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");
  const connectsCollection = db.collection("connects");

  // Send a connection request (no JWT, so senderId must be passed in body)
  router.post('/connectReq', async (req, res) => {
    try {
      const { receiverId, senderId } = req.body; // pass senderId from frontend

      // Check if request already exists
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

  // Get all pending requests for a user (pass userId as query param)
  router.get('/pendingReq', async (req, res) => {
    try {
      const userId = req.query.userId;
      const pending = await connectsCollection
        .find({ receiverId: userId, status: "pending" })
        .toArray();
      res.json(pending);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Accept connection request (pass senderId, receiverId in body)
  router.patch('/accept/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const updatedConnect = await connectsCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status: "accepted" } },
        { returnDocument: "after" }
      );

      if (!updatedConnect.value) {
        return res.status(404).json({ message: "Connection request not found" });
      }

      const { senderId, receiverId } = updatedConnect.value;

      // Add to friends array
      await usersCollection.updateOne(
        { _id: new ObjectId(receiverId) },
        { $addToSet: { friends: new ObjectId(senderId) } }
      );
      await usersCollection.updateOne(
        { _id: new ObjectId(senderId) },
        { $addToSet: { friends: new ObjectId(receiverId) } }
      );

      res.json(updatedConnect.value);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Ignore connection request
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

  // Get all connections for a user (pass userId as query param)
  router.get("/myConnections", async (req, res) => {
    try {
      const userId = req.query.userId;
      const connections = await connectsCollection.aggregate([
        {
          $match: {
            status: "accepted",
            $or: [{ senderId: userId }, { receiverId: userId }]
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "senderId",
            foreignField: "_id",
            as: "sender"
          }
        },
        {
          $unwind: { path: "$sender", preserveNullAndEmptyArrays: true }
        },
        {
          $lookup: {
            from: "users",
            localField: "receiverId",
            foreignField: "_id",
            as: "receiver"
          }
        },
        {
          $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true }
        },
        {
          $project: {
            _id: 1,
            status: 1,
            createdAt: 1,
            sender: { $arrayElemAt: ["$sender", 0] },
            receiver: { $arrayElemAt: ["$receiver", 0] }
          }
        }
      ]).toArray();

      const formattedConnections = connections.map(conn => ({
        id: conn._id,
        user: userId == conn.sender._id.toString() ? conn.receiver : conn.sender,
        connectedAt: conn.createdAt
      }));

      res.json(formattedConnections);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get suggested users to connect with (no JWT)
  router.get('/getSuggestion', async (req, res) => {
    try {
      const userId = req.query.userId;

      const blocked = await connectsCollection.find({
        $or: [{ senderId: userId }, { receiverId: userId }]
      }).toArray();

      const blockedIds = blocked.map(conn =>
        conn.senderId == userId ? conn.receiverId : conn.senderId
      );

      const users = await usersCollection.find({
        _id: { $nin: [...blockedIds, userId] }
      })
        .project({ fullName: 1, email: 1, profileImage: 1, tags: 1 })
        .toArray();

      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get all users (no JWT)
router.get("/allUsers", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("🔍 Received userId:", userId);

    // Convert userId to ObjectId properly
    const users = await usersCollection
      .find({ _id: { $ne: new ObjectId(userId) } })
      .project({ fullName: 1, email: 1, profileImage: 1, tags: 1 })
      .toArray();

    console.log("👥 Total users found:", users.length);

    res.status(200).json(users);
  } catch (error) {
    console.error("❌ Failed to fetch users:", error);
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
});


  // Remove connection
  router.delete("/connect/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const connect = await connectsCollection.findOne({ _id: new ObjectId(id) });
      if (!connect) {
        return res.status(404).json({ message: "Connection not found" });
      }

      const { senderId, receiverId } = connect;

      await connectsCollection.deleteOne({ _id: new ObjectId(id) });

      await usersCollection.updateOne(
        { _id: new ObjectId(senderId) },
        { $pull: { friends: new ObjectId(receiverId) } }
      );
      await usersCollection.updateOne(
        { _id: new ObjectId(receiverId) },
        { $pull: { friends: new ObjectId(senderId) } }
      );

      res.status(200).json({ message: "Connection removed successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  return router;
};
