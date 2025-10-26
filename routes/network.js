const express = require("express");
const { ObjectId } = require("mongodb");
const verifyFirebaseToken = require("../middleWare/verifyFirebaseToken");

const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");
  const pendingConnectionsCollection = db.collection('pendingConnectRequest');
  const connectionsCollection = db.collection('connections');
  const notificationsCollection = db.collection('notifications');

  // Send a connection request - UPDATED WITH NOTIFICATIONS
  router.post('/send-connect-request', verifyFirebaseToken, async (req, res) => {
    try {
      const { senderEmail, receiverEmail } = req.body;

      if (senderEmail === receiverEmail) {
        return res.status(400).send({ 
          success: false,
          message: "You cannot connect with yourself!" 
        });
      }

      // Check if users exist
      const sender = await usersCollection.findOne({ email: senderEmail });
      const receiver = await usersCollection.findOne({ email: receiverEmail });
      
      if (!sender || !receiver) {
        return res.status(404).send({ 
          success: false,
          message: "User not found!" 
        });
      }

      // Check if connection already exists
      const existingConnection = await connectionsCollection.findOne({
        $or: [
          { user1: senderEmail, user2: receiverEmail },
          { user1: receiverEmail, user2: senderEmail }
        ]
      });

      if (existingConnection) {
        return res.status(400).send({ 
          success: false,
          message: "You are already connected with this user!" 
        });
      }

      // Check if pending request already exists (any status)
      const existingPending = await pendingConnectionsCollection.findOne({
        $or: [
          { senderEmail, receiverEmail },
          { senderEmail: receiverEmail, receiverEmail: senderEmail }
        ]
      });

      if (existingPending) {
        let message = "Connection request already exists!";
        
        if (existingPending.status === "pending") {
          message = "You already have a pending connection request with this user!";
        } else if (existingPending.status === "ignored") {
          // Allow sending new request if previous was ignored
          await pendingConnectionsCollection.deleteOne({ _id: existingPending._id });
        } else {
          return res.status(400).send({ 
            success: false,
            message: message 
          });
        }
      }

      // Create pending connection request
      const result = await pendingConnectionsCollection.insertOne({
        senderEmail,
        receiverEmail,
        status: "pending",
        createdAt: new Date()
      });

      // Create notification for receiver
      const notification = {
        userEmail: receiverEmail,
        type: 'connection_request',
        message: `${sender.fullName || senderEmail} sent you a connection request`,
        senderName: sender.fullName || senderEmail,
        senderImage: sender.profileImage,
        relatedId: result.insertedId.toString(),
        isRead: false,
        timestamp: new Date()
      };

      await notificationsCollection.insertOne(notification);

      res.send({ 
        success: true, 
        message: "Connection request sent successfully!", 
        result,
        notification
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({ 
        success: false,
        message: "Failed to send connection request" 
      });
    }
  });

  // Accept connection request - UPDATED WITH NOTIFICATIONS
  router.post('/accept-request', verifyFirebaseToken, async (req, res) => {
    try {
      const { requestId, senderEmail, receiverEmail } = req.body;

      // Validate request exists
      const request = await pendingConnectionsCollection.findOne({
        _id: new ObjectId(requestId),
        senderEmail,
        receiverEmail,
        status: "pending"
      });

      if (!request) {
        return res.status(404).send({ message: "Connection request not found!" });
      }

      // Get receiver details for notification
      const receiver = await usersCollection.findOne({ email: receiverEmail });

      // Update request status to accepted
      await pendingConnectionsCollection.updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { status: "accepted", acceptedAt: new Date() } }
      );

      // Create connection in connections collection
      const connectionResult = await connectionsCollection.insertOne({
        user1: senderEmail,
        user2: receiverEmail,
        connectedAt: new Date(),
        connectionId: new ObjectId()
      });

      // Update both users' connections count
      await usersCollection.updateOne(
        { email: senderEmail },
        { $inc: { connectionsCount: 1 } }
      );

      await usersCollection.updateOne(
        { email: receiverEmail },
        { $inc: { connectionsCount: 1 } }
      );

      // Create notification for the original sender
      const notification = {
        userEmail: senderEmail,
        type: 'connection_accepted',
        message: `${receiver.fullName || receiverEmail} accepted your connection request`,
        senderName: receiver.fullName || receiverEmail,
        senderImage: receiver.profileImage,
        relatedId: connectionResult.insertedId.toString(),
        isRead: false,
        timestamp: new Date()
      };

      await notificationsCollection.insertOne(notification);

      res.send({ 
        success: true, 
        message: "Connection request accepted successfully!" 
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to accept connection request" });
    }
  });

  // Ignore connection request - UPDATED WITH NOTIFICATIONS
  router.post('/ignore-request', verifyFirebaseToken, async (req, res) => {
    try {
      const { requestId, senderEmail, receiverEmail } = req.body;

      const request = await pendingConnectionsCollection.findOne({
        _id: new ObjectId(requestId),
        senderEmail,
        receiverEmail,
        status: "pending"
      });

      if (!request) {
        return res.status(404).send({ message: "Connection request not found!" });
      }

      // Get receiver details for potential future notification if needed
      const receiver = await usersCollection.findOne({ email: receiverEmail });

      // Update request status to ignored
      await pendingConnectionsCollection.updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { status: "ignored", ignoredAt: new Date() } }
      );

      res.send({ 
        success: true, 
        message: "Connection request ignored successfully!" 
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to ignore connection request" });
    }
  });

  // Remove connection - UPDATED WITH NOTIFICATIONS
  router.delete('/connections/:connectionId', verifyFirebaseToken, async (req, res) => {
    try {
      const { connectionId } = req.params;
      const { userEmail } = req.body;

      if (!userEmail) {
        return res.status(400).send({ message: "User email is required" });
      }

      // Find the connection
      const connection = await connectionsCollection.findOne({
        _id: new ObjectId(connectionId),
        $or: [
          { user1: userEmail },
          { user2: userEmail }
        ]
      });

      if (!connection) {
        return res.status(404).send({ message: "Connection not found!" });
      }

      // Get the other user's email
      const otherUserEmail = connection.user1 === userEmail ? connection.user2 : connection.user1;
      
      // Get user details for notification
      const user = await usersCollection.findOne({ email: userEmail });

      // Delete the connection
      const result = await connectionsCollection.deleteOne({
        _id: new ObjectId(connectionId)
      });

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Connection not found or already deleted!" });
      }

      // Also delete any pending connection requests between these users
      await pendingConnectionsCollection.deleteMany({
        $or: [
          { senderEmail: userEmail, receiverEmail: otherUserEmail },
          { senderEmail: otherUserEmail, receiverEmail: userEmail }
        ]
      });

      // Update both users' connections count (ensure it doesn't go below 0)
      await usersCollection.updateOne(
        { email: connection.user1 },
        { $inc: { connectionsCount: -1 } }
      );

      await usersCollection.updateOne(
        { email: connection.user2 },
        { $inc: { connectionsCount: -1 } }
      );

      // Create notification for the other user
      const notification = {
        userEmail: otherUserEmail,
        type: 'connection_removed',
        message: `${user.fullName || userEmail} removed the connection`,
        senderName: user.fullName || userEmail,
        senderImage: user.profileImage,
        relatedId: connectionId,
        isRead: false,
        timestamp: new Date()
      };

      await notificationsCollection.insertOne(notification);

      res.send({ 
        success: true, 
        message: "Connection removed successfully!",
        deletedConnectionId: connectionId
      });
    } catch (error) {
      console.error('Remove connection error:', error);
      res.status(500).send({ message: "Failed to remove connection" });
    }
  });

  // ... (Keep all other existing routes unchanged - they don't need notification updates)
  // Get all pending requests for a user
  router.get('/pending-requests', verifyFirebaseToken, async (req, res) => {
    try {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const pendingRequests = await pendingConnectionsCollection
        .find({ 
          receiverEmail: email, 
          status: "pending" 
        })
        .sort({ createdAt: -1 })
        .toArray();

      // Populate sender details
      const requestsWithDetails = await Promise.all(
        pendingRequests.map(async (request) => {
          const sender = await usersCollection.findOne(
            { email: request.senderEmail },
            { projection: { name: 1, photo: 1, purpose: 1, profession: 1 } }
          );
          return {
            ...request,
            senderDetails: sender
          };
        })
      );

      res.send(requestsWithDetails);
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to fetch pending requests" });
    }
  });

  // Get all connections for a user
  router.get('/connections', verifyFirebaseToken, async (req, res) => {
    try {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const connections = await connectionsCollection
        .find({
          $or: [
            { user1: email },
            { user2: email }
          ]
        })
        .sort({ connectedAt: -1 })
        .toArray();

      // Get connection users' details
      const connectionsWithDetails = await Promise.all(
        connections.map(async (connection) => {
          const otherUserEmail = connection.user1 === email ? connection.user2 : connection.user1;
          const userDetails = await usersCollection.findOne(
            { email: otherUserEmail },
            { 
              projection: { 
                name: 1, 
                photo: 1, 
                purpose: 1, 
                profession: 1,
                email: 1
              } 
            }
          );
          return {
            ...connection,
            connectedUser: userDetails
          };
        })
      );

      res.send(connectionsWithDetails);
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to fetch connections" });
    }
  });

  // Get sent connection requests
  router.get('/sent-requests', verifyFirebaseToken, async (req, res) => {
    try {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const sentRequests = await pendingConnectionsCollection
        .find({ 
          senderEmail: email, 
          status: "pending" 
        })
        .sort({ createdAt: -1 })
        .toArray();

      // Populate receiver details
      const requestsWithDetails = await Promise.all(
        sentRequests.map(async (request) => {
          const receiver = await usersCollection.findOne(
            { email: request.receiverEmail },
            { projection: { name: 1, photo: 1, purpose: 1, profession: 1 } }
          );
          return {
            ...request,
            receiverDetails: receiver
          };
        })
      );

      res.send(requestsWithDetails);
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to fetch sent requests" });
    }
  });

  // Get suggested users to connect with
  router.get('/suggestion-connect', verifyFirebaseToken, async (req, res) => {
    try {
      const email = req.query.email;

      const findUser = await usersCollection.findOne({ email });

      if (!findUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const userPurpose = findUser.purpose;

      // Get existing connections to exclude
      const existingConnections = await connectionsCollection
        .find({
          $or: [
            { user1: email },
            { user2: email }
          ]
        })
        .toArray();

      const connectedEmails = existingConnections.map(conn => 
        conn.user1 === email ? conn.user2 : conn.user1
      );

      // Get pending requests to exclude
      const pendingRequests = await pendingConnectionsCollection
        .find({
          $or: [
            { senderEmail: email },
            { receiverEmail: email }
          ],
          status: "pending"
        })
        .toArray();

      const pendingEmails = pendingRequests.map(request => 
        request.senderEmail === email ? request.receiverEmail : request.senderEmail
      );

      const excludedEmails = [...connectedEmails, ...pendingEmails, email];

      const suggestedUsers = await usersCollection
        .find({ 
          purpose: userPurpose, 
          email: { $nin: excludedEmails } 
        })
        .limit(20)
        .toArray();

      res.send(suggestedUsers);

    } catch (err) {
      console.error('getSuggestion error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // get all category people
  router.get('/all-connect-users', verifyFirebaseToken, async (req, res) => {
    try {
      const email = req.query.email;
      
      // Get existing connections to exclude
      const existingConnections = await connectionsCollection
        .find({
          $or: [
            { user1: email },
            { user2: email }
          ]
        })
        .toArray();

      const connectedEmails = existingConnections.map(conn => 
        conn.user1 === email ? conn.user2 : conn.user1
      );

      // Get pending requests to exclude
      const pendingRequests = await pendingConnectionsCollection
        .find({
          $or: [
            { senderEmail: email },
            { receiverEmail: email }
          ],
          status: "pending"
        })
        .toArray();

      const pendingEmails = pendingRequests.map(request => 
        request.senderEmail === email ? request.receiverEmail : request.senderEmail
      );

      const excludedEmails = [...connectedEmails, ...pendingEmails, email];

      const query = { 
        email: { $nin: excludedEmails } 
      };
      
      const result = await usersCollection.find(query).limit(50).toArray();
      res.send(result);
    } catch (err) {
      console.error('getAllUsers error', err);
      res.status(500).json({ message: err.message });
    }
  });

  return router;
};