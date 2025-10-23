// const express = require("express");
// const { ObjectId } = require("mongodb");

// module.exports = function notificationRoutes(db) {
//   const router = express.Router();
//   const notificationCollection = db.collection("notifications");

//   router.get('get-notifications',async(req,res)=>{
//     const result = await notificationCollection.find().toArray()
//     res.send(result)
//   })

//   router.post("send-notifications", async (req, res) => {
//     const {
//       userId,
//       type,
//       senderName,
//       senderEmail,
//       senderProfile,
//       message,
//       read,
//     } = req.body;
//     const notifications = {
//       userId,
//       type,
//       senderEmail,
//       senderName,
//       senderProfile,
//       message,
//       read,
//       createdAt: new Date(),
//     };
//     const result = await notificationCollection.insertOne(notifications);
//     res.send(result);
//   });

//   return router;
// };









const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function notificationRoutes(db) {
  const router = express.Router();
  const notificationCollection = db.collection("notifications");


  // POST a new notification
  router.post('/send-notifications', async (req, res) => {
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
        return res.status(400).send({ error: "userId and message are required" });
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
