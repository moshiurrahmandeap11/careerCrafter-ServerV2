const admin = require("../utils/firebase");

const verifyFirebaseToken=async (req,res,next)=>{
    const authHeader= req.headers.authorization;
    if(!authHeader) return res.status(401).json({message:'Unauthorized'})

        const token = authHeader.split(" ")[1]

        try{
            const decoded = await admin.auth().verifyIdToken(token)

            req.user=decoded;
            next()
        } catch{
            return res.status(403).json({message:"Invalid or expired token"})
        }
}
module.exports= verifyFirebaseToken;


