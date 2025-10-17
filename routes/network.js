const express = require("express");
const { ObjectId } = require("mongodb");
const verifyFirebaseToken = require("../middleWare/verifyFirebaseToken");

const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");
  
  const pendingConnectionsCollection=db.collection('pendingConnectRequest')

  // Send a connection request 
  router.post('/send-connect-request', async (req, res) => {
  try {
    const { senderEmail, receiverEmail } = req.body;

    // 
    if (senderEmail === receiverEmail) {
      return res.status(400).send({ message: "You cannot connect with yourself!" });
    }

    // 
    const existing = await pendingConnectionsCollection.findOne({
      $or: [
        { senderEmail, receiverEmail },
        { senderEmail: receiverEmail, receiverEmail: senderEmail }
      ]
    });

    if (existing) {
      return res.status(400).send({ message: "Connection request already exists!" });
    }

    // 
    const result = await pendingConnectionsCollection.insertOne({
      senderEmail,
      receiverEmail,
      status: "pending",
      createdAt: new Date()
    });

    res.send({ success: true, message: "Connection request sent successfully!", result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to send connection request" });
  }
});

  



  // Get all pending requests for a user (pass email as query)
  
  router.get('/pending-requests', async (req, res) => {
  try {
    const email = req.query.email;

    
    const pendingRequests = await pendingConnectionsCollection
      .find({
        status: "pending",
        receiverEmail: email   
      })
      .toArray();

    const senderEmails = pendingRequests.map(req => req.senderEmail);

    
    const senders = await usersCollection
      .find({ email: { $in: senderEmails } })
      .project({ fullName: 1, email: 1, profileImage: 1, role: 1 })
      .toArray();

    res.send(senders);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch pending requests" });
  }
});





  // Accept connection request (pass senderId, receiverId in body)
  

      



  // Ignore connection request
 




  // Get all connections for a user (pass userId as query param)
  




  // 💡 Get suggested users to connect with (no pagination)

  router.get('/suggestion-connect',verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.query.email;

    
    const findUser = await usersCollection.findOne({ email });

    if (!findUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    
    const userPurpose = findUser.purpose;

    
    const suggestedUsers = await usersCollection
      .find({ purpose: userPurpose, email: { $ne: email } })
      .toArray();

   
    res.send(suggestedUsers);

  } catch (err) {
    console.error('getSuggestion error', err);
    res.status(500).json({ message: err.message });
  }
});

  

// get all catagory people
  router.get('/all-connect-users',verifyFirebaseToken, async(req,res)=>{
    try{
      const email=req.query.email
      const query = email ? { email: { $ne: email } } : {};
         const result=await usersCollection.find(query).toArray()
         res.send(result)
    }
    catch (err) {
    console.error('getSuggestion error', err);
    res.status(500).json({ message: err.message });
  }
  })

  return router;
};
