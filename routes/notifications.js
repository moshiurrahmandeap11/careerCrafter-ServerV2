const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function notificationRoutes(db, io = null) {
  const router = express.Router();
  const coll = db.collection("notifications");

  router.get("/", async (req, res) => {
    try {
      const { to, unreadOnly, limit = 50, skip = 0 } = req.query;
      const q = {};
      if (to) q.to = to;
      if (unreadOnly === "true" || unreadOnly === true) q.read = false;

      const docs = await coll
        .find(q)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .toArray();

      res.json(docs);
    } catch (err) {
      console.error("GET /notifications error:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  router.get("/unread-count", async (req, res) => {
    try {
      const { to } = req.query;
      if (!to) return res.status(400).json({ message: "'to' query required" });
      const count = await coll.countDocuments({ to, read: false });
      res.json({ unread: count });
    } catch (err) {
      console.error("GET /notifications/unread-count error:", err);
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });


  router.post("/", async (req, res) => {
    try {
      const { to, from = "system", title, body, type = "system", data = {}, meta = {} } = req.body;
      if (!to || !title) return res.status(400).json({ message: "'to' and 'title' are required" });

      const newNotif = {
        to,
        from,
        title,
        body,
        type,
        data,
        meta,
        read: false,
        createdAt: new Date()
      };

      const result = await coll.insertOne(newNotif);
      const saved = { ...newNotif, _id: result.insertedId };

      try {
        if (io) {
          io.to(to).emit("newNotification", saved);
        }
      } catch (emitErr) {
        console.error("Socket emit error (newNotification):", emitErr);
      }

      res.status(201).json(saved);
    } catch (err) {
      console.error("POST /notifications error:", err);
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  // PATCH /v1/notifications/:id/read  -> mark single as read
  router.patch("/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await coll.updateOne({ _id: new ObjectId(id) }, { $set: { read: true } });
      if (result.matchedCount === 0) return res.status(404).json({ message: "Not found" });

      try {
        const updated = await coll.findOne({ _id: new ObjectId(id) });
        if (io && updated?.to) io.to(updated.to).emit("notificationUpdated", updated);
      } catch (emitErr) {
        console.error("socket emit error (notificationUpdated):", emitErr);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("PATCH /notifications/:id/read error:", err);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // PATCH /v1/notifications/mark-all-read?to=user@example.com
  router.patch("/mark-all-read", async (req, res) => {
    try {
      const { to } = req.query;
      if (!to) return res.status(400).json({ message: "'to' query required" });

      const result = await coll.updateMany({ to, read: false }, { $set: { read: true } });

      if (io) io.to(to).emit("notificationsMarkedAllRead", { to });

      res.json({ modifiedCount: result.modifiedCount });
    } catch (err) {
      console.error("PATCH /notifications/mark-all-read error:", err);
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // DELETE /v1/notifications/:id
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await coll.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ message: "Not found" });

      try {
        if (io) io.emit("notificationDeleted", { id });
      } catch (emitErr) {
        console.error("socket emit error (notificationDeleted):", emitErr);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /notifications/:id error:", err);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  return router;
};
