const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function notificationRoutes(db) {
  const router = express.Router();
  const notificationCollection = db.collection("notifications");

  // GET all notifications
  router.get("/get-notifications", async (req, res) => {
    try {
      const result = await notificationCollection.find().toArray();
      res.send(result);
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: "Failed to fetch notifications" });
    }
  });

  // POST a new notification
  router.post("/send-notifications", async (req, res) => {
    try {
      const {
        userId,
        type,
        senderName,
        senderEmail,
        senderProfile,
        message,
        read,
      } = req.body;

      if (!userId || !message) {
        return res
          .status(400)
          .send({ error: "userId and message are required" });
      }

      const notification = {
        userId,
        type,
        senderEmail,
        senderName,
        senderProfile,
        message,
        read: read || false,
        createdAt: new Date(),
      };

      const result = await notificationCollection.insertOne(notification);
      res.send(result);
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: "Failed to send notification" });
    }
  });

  return router;
};
