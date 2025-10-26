const express = require("express");
const router = express.Router();

module.exports = (db) => {
  const notificationsCollection = db.collection("notifications");
  const usersCollection = db.collection("users");

  // Get all notifications for a user
  router.get("/user/:email", async (req, res) => {
    try {
      const userEmail = req.params.email;
      
      if (!userEmail) {
        return res.status(400).json({ error: "Email is required" });
      }

      const notifications = await notificationsCollection
        .find({ userEmail })
        .sort({ timestamp: -1 })
        .toArray();

      const unreadCount = await notificationsCollection.countDocuments({
        userEmail,
        isRead: false
      });

      res.json({
        notifications,
        unreadCount
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new notification
  router.post("/", async (req, res) => {
    try {
      const { userEmail, type, message, senderEmail, relatedId } = req.body;
      
      if (!userEmail || !type || !message) {
        return res.status(400).json({ error: "userEmail, type, and message are required" });
      }

      // Get sender info if provided
      let senderInfo = {};
      if (senderEmail) {
        const sender = await usersCollection.findOne(
          { email: senderEmail },
          { projection: { fullName: 1, profileImage: 1 } }
        );
        if (sender) {
          senderInfo = {
            senderName: sender.fullName,
            senderImage: sender.profileImage
          };
        }
      }

      const notification = {
        userEmail,
        type,
        message,
        ...senderInfo,
        relatedId,
        isRead: false,
        timestamp: new Date()
      };

      const result = await notificationsCollection.insertOne(notification);
      
      // Emit real-time notification via Socket.io if needed
      // This would require passing the socket instance to the route

      res.status(201).json({
        success: true,
        notification: { ...notification, _id: result.insertedId }
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mark notification as read
  router.patch("/:id/read", async (req, res) => {
    try {
      const notificationId = req.params.id;
      
      const result = await notificationsCollection.updateOne(
        { _id: new require('mongodb').ObjectId(notificationId) },
        { $set: { isRead: true } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      const updatedNotification = await notificationsCollection.findOne({
        _id: new require('mongodb').ObjectId(notificationId)
      });

      res.json({
        success: true,
        notification: updatedNotification
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mark all notifications as read for a user
  router.patch("/user/:email/read-all", async (req, res) => {
    try {
      const userEmail = req.params.email;
      
      const result = await notificationsCollection.updateMany(
        { userEmail, isRead: false },
        { $set: { isRead: true } }
      );

      res.json({
        success: true,
        message: 'All notifications marked as read',
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a notification
  router.delete("/:id", async (req, res) => {
    try {
      const notificationId = req.params.id;
      
      const result = await notificationsCollection.deleteOne({
        _id: new require('mongodb').ObjectId(notificationId)
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Clear all notifications for a user
  router.delete("/user/:email", async (req, res) => {
    try {
      const userEmail = req.params.email;
      
      const result = await notificationsCollection.deleteMany({ userEmail });

      res.json({
        success: true,
        message: 'All notifications cleared',
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Error clearing notifications:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};