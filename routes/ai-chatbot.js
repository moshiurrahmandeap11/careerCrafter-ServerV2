const express = require('express');
const { ObjectId } = require('mongodb');
const Groq = require('groq-sdk');

const router = express.Router();

module.exports = (db) => {
    const aichatbotCollection = db.collection("aichatbot");
    const jobsCollection = db.collection("jobs");
    const usersCollection = db.collection("users");

    // Groq client
    let groq;
    try {
        groq = new Groq({ 
            apiKey: process.env.GROQ_API_KEY 
        });
        console.log('🤖 Groq AI initialized');
    } catch (error) {
        console.error('❌ Groq init failed:', error);
    }

    // Premium configuration
    const PREMIUM_CONFIG = {
        FREE_MESSAGES: 2,
        CREDITS_PER_CHARACTER: 0.1,
        MIN_CREDITS_REQUIRED: 10
    };

    // Check user premium status
    const checkUserAccess = async (userEmail) => {
        try {
            const user = await usersCollection.findOne({ email: userEmail });
            if (!user) {
                return { allowed: false, reason: 'User not found' };
            }

            // Count ONLY user messages from DB
            const chat = await aichatbotCollection.findOne({ userEmail });
            const userMessageCount = chat ? chat.messages.filter(m => m.role === 'user').length : 0;

            console.log(`📊 User ${userEmail} has sent ${userMessageCount} messages`);

            // Free tier: first 2 messages are free
            if (userMessageCount < PREMIUM_CONFIG.FREE_MESSAGES) {
                return { 
                    allowed: true, 
                    tier: 'free',
                    remainingFree: PREMIUM_CONFIG.FREE_MESSAGES - userMessageCount,
                    messageCount: userMessageCount 
                };
            }

            // Premium users have unlimited access
            if (user.isPremium) {
                return { 
                    allowed: true, 
                    tier: 'premium',
                    credits: user.aiCredits || 0,
                    messageCount: userMessageCount 
                };
            }

            // Check if user has enough credits
            if (user.aiCredits >= PREMIUM_CONFIG.MIN_CREDITS_REQUIRED) {
                return { 
                    allowed: true, 
                    tier: 'credits',
                    credits: user.aiCredits,
                    messageCount: userMessageCount 
                };
            }

            return { 
                allowed: false, 
                tier: 'blocked',
                reason: 'Insufficient credits',
                messageCount: userMessageCount,
                required: PREMIUM_CONFIG.MIN_CREDITS_REQUIRED
            };

        } catch (error) {
            console.error('❌ Error checking user access:', error);
            return { allowed: false, reason: 'System error' };
        }
    };

    // Deduct credits
    const deductCredits = async (userEmail, messageLength) => {
        try {
            const creditsUsed = Math.ceil(messageLength * PREMIUM_CONFIG.CREDITS_PER_CHARACTER);
            
            await usersCollection.updateOne(
                { email: userEmail },
                { 
                    $inc: { aiCredits: -creditsUsed },
                    $set: { lastAIChat: new Date() }
                }
            );

            console.log(`💰 Deducted ${creditsUsed} credits from ${userEmail}`);
            return { success: true, creditsUsed };
        } catch (error) {
            console.error('❌ Error deducting credits:', error);
            return { success: false, error: error.message };
        }
    };

    // IMPROVED: Detect user intent from message
    const detectIntent = (message) => {
        const lower = message.toLowerCase();
        
        // Job search patterns
        if (lower.match(/find|search|looking for|need|want|show me|get me|tell me about.*job/i) ||
            lower.match(/react.*job|developer.*job|frontend.*job|backend.*job/i) ||
            lower.match(/job.*react|job.*developer|job.*frontend/i) ||
            lower.includes('career opportunities') ||
            lower.includes('work opportunities')) {
            return 'job_search';
        }
        
        // Hiring patterns
        if (lower.includes('hire') || lower.includes('recruit') || lower.includes('candidate')) {
            return 'hiring';
        }
        
        // Premium/subscription
        if (lower.includes('premium') || lower.includes('upgrade') || 
            lower.includes('subscription') || lower.includes('plan')) {
            return 'premium';
        }
        
        // Greeting
        if (lower.match(/^(hi|hello|hey|sup|what's up|howdy)$/i)) {
            return 'greeting';
        }
        
        return 'general';
    };

    // IMPROVED: Search jobs with better matching
    const searchJobs = async (message) => {
        try {
            console.log('🔍 Searching jobs for query:', message);
            
            const lower = message.toLowerCase();
            let skills = [];
            
            // Extract skills from message
            const skillPatterns = {
                'react': ['react', 'reactjs', 'react.js'],
                'javascript': ['javascript', 'js', 'es6'],
                'node': ['node', 'nodejs', 'node.js'],
                'python': ['python'],
                'java': ['java'],
                'frontend': ['frontend', 'front-end', 'front end'],
                'backend': ['backend', 'back-end', 'back end'],
                'fullstack': ['fullstack', 'full-stack', 'full stack']
            };
            
            for (const [skill, patterns] of Object.entries(skillPatterns)) {
                if (patterns.some(pattern => lower.includes(pattern))) {
                    skills.push(skill);
                }
            }
            
            // Default to React if no specific skills mentioned
            if (skills.length === 0) {
                skills = ['react', 'javascript', 'developer'];
            }
            
            console.log('🎯 Searching with skills:', skills);
            
            const jobs = await jobsCollection.find({
                status: 'active',
                $or: [
                    { requiredSkills: { $in: skills } },
                    { preferredSkills: { $in: skills } },
                    { title: { $regex: skills.join('|'), $options: 'i' } },
                    { description: { $regex: skills.join('|'), $options: 'i' } }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();

            console.log(`✅ Found ${jobs.length} jobs`);
            
            return jobs.map(job => ({
                id: job._id,
                title: job.title,
                company: job.company,
                salary: job.salaryMin ? `$${job.salaryMin}-${job.salaryMax}` : 'Competitive',
                location: job.location || 'Remote',
                type: job.jobType || 'Full-time',
                skills: job.requiredSkills?.slice(0, 3).join(', ') || 'React, JavaScript',
                link: `/job/${job._id}`,
                applyLink: `/job/${job._id}/apply`
            }));
        } catch (error) {
            console.error('❌ Job search error:', error);
            return [];
        }
    };

    // IMPROVED: Generate smart AI response
    const generateAIResponse = async (userMessage, userEmail, userAccess, chatHistory) => {
        try {
            // Block if no access
            if (!userAccess.allowed) {
                return {
                    content: `🚀 **You've used your ${PREMIUM_CONFIG.FREE_MESSAGES} free messages!**

To keep chatting with me, you'll need to upgrade:

💎 **Premium Benefits:**
✅ Unlimited AI conversations
✅ Priority job matching  
✅ Advanced career insights
✅ Direct employer connections

**Get Started:**
🔗 [Upgrade to Premium](/premium)
💰 [Buy AI Credits](/buy-credits)

I'll be here when you're ready! 😊`,
                    isBlocked: true
                };
            }

            const intent = detectIntent(userMessage);
            console.log('🎯 Detected intent:', intent);

            // Handle job search with ACTUAL search
            if (intent === 'job_search') {
                const jobs = await searchJobs(userMessage);
                
                if (jobs.length > 0) {
                    const topJobs = jobs.slice(0, 3);
                    const jobList = topJobs.map(job => 
                        `**${job.title}** at ${job.company}
  💰 ${job.salary} | 📍 ${job.location}
  🔧 Skills: ${job.skills}
  🔗 [View Job](${job.link}) | [Apply](${job.applyLink})`
                    ).join('\n\n');
                    
                    let response = `Great! 🎯 I found **${jobs.length} matching position${jobs.length > 1 ? 's' : ''}** for you:\n\n${jobList}`;
                    
                    if (jobs.length > 3) {
                        response += `\n\n...and ${jobs.length - 3} more! [View All Jobs](/jobs)`;
                    }
                    
                    response += `\n\nWant help with your application or need to refine the search?`;
                    
                    // Add free message counter
                    if (userAccess.tier === 'free') {
                        response += `\n\n💡 Free messages: ${userAccess.remainingFree} remaining`;
                    }
                    
                    return { content: response, jobs: jobs };
                } else {
                    let response = `I searched our database for React developer positions! 🔍

Right now we have limited openings matching your exact criteria, but here's what you can do:

🔔 **[Set Job Alerts](/profile/alerts)** - Get instant notifications
🌐 **[Browse All Jobs](/jobs)** - Explore current opportunities  
💼 **[Expand Search](/jobs?search=javascript)** - Similar roles

Would you like me to help you set up job alerts?`;
                    
                    if (userAccess.tier === 'free') {
                        response += `\n\n💡 Free messages: ${userAccess.remainingFree} remaining`;
                    }
                    
                    return { content: response };
                }
            }

            // For other intents, use AI with proper context
            const recentMessages = chatHistory.slice(-6).map(m => 
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
            ).join('\n');

            const systemPrompt = `You are a friendly CareerCrafter AI assistant helping with job search and career advice.

IMPORTANT RULES:
1. Keep responses SHORT (2-3 sentences max) and natural like a real human
2. Be enthusiastic but professional
3. If asked about jobs, acknowledge that you're searching (even though search already happened)
4. Don't repeat yourself - vary your responses
5. Ask follow-up questions to keep conversation going

USER STATUS: ${userAccess.tier} tier | ${userAccess.remainingFree || 'unlimited'} free messages left

CONVERSATION HISTORY:
${recentMessages || 'New conversation'}

USER MESSAGE: "${userMessage}"

Respond naturally and helpfully:`;

            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                model: "llama3-8b-8192",
                temperature: 0.8,
                max_tokens: 250
            });

            let aiResponse = completion.choices[0]?.message?.content || "I'm here to help! What would you like to know?";
            
            // Add free message counter naturally
            if (userAccess.tier === 'free' && userAccess.remainingFree !== undefined) {
                aiResponse += `\n\n💡 Free messages: ${userAccess.remainingFree} remaining`;
            }
            
            // Deduct credits if not free
            if (userAccess.tier !== 'free') {
                await deductCredits(userEmail, aiResponse.length);
            }

            return { content: aiResponse };

        } catch (error) {
            console.error('❌ AI generation error:', error);
            
            // Simple fallback
            let fallback = "I'm here to help! You can ask me to find jobs, give career advice, or help with your profile.";
            
            if (userAccess.tier === 'free') {
                fallback += `\n\n💡 Free messages: ${userAccess.remainingFree} remaining`;
            }
            
            return { content: fallback };
        }
    };

    // Get or create chat
    router.get('/chat/:userEmail', async (req, res) => {
        try {
            const { userEmail } = req.params;
            let chat = await aichatbotCollection.findOne({ userEmail });
            
            if (!chat) {
                const newChat = {
                    userId: userEmail,
                    userEmail,
                    messages: [
                        {
                            role: 'assistant',
                            content: "Hey! 👋 I'm your CareerCrafter AI. I can help you find jobs, give career advice, or connect you with employers. What brings you here today?",
                            timestamp: new Date()
                        }
                    ],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                const result = await aichatbotCollection.insertOne(newChat);
                chat = { ...newChat, _id: result.insertedId };
            }

            res.json({ success: true, data: chat });
        } catch (error) {
            console.error('Error getting chat:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching chat',
                error: error.message
            });
        }
    });

    // Send message
    router.post('/chat/:userEmail/message', async (req, res) => {
        try {
            const { userEmail } = req.params;
            const { message } = req.body;

            if (!message || message.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Message is required'
                });
            }

            console.log(`\n━━━ NEW MESSAGE ━━━`);
            console.log(`📩 From: ${userEmail}`);
            console.log(`💬 Message: ${message}`);

            // Get chat
            let chat = await aichatbotCollection.findOne({ userEmail });
            if (!chat) {
                const newChat = {
                    userId: userEmail,
                    userEmail,
                    messages: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const result = await aichatbotCollection.insertOne(newChat);
                chat = { ...newChat, _id: result.insertedId };
            }

            // Check access BEFORE adding message
            const userAccess = await checkUserAccess(userEmail);
            console.log('✅ Access check:', userAccess);

            // Create user message
            const userMessage = {
                role: 'user',
                content: message.trim(),
                timestamp: new Date()
            };

            // Generate AI response with chat history
            const aiResult = await generateAIResponse(
                message, 
                userEmail, 
                userAccess,
                chat.messages || []
            );

            const assistantMessage = {
                role: 'assistant',
                content: aiResult.content,
                timestamp: new Date()
            };

            // Save both messages
            await aichatbotCollection.updateOne(
                { userEmail },
                {
                    $push: {
                        messages: { $each: [userMessage, assistantMessage] }
                    },
                    $set: { updatedAt: new Date() }
                }
            );

            // Get updated access
            const updatedAccess = await checkUserAccess(userEmail);

            console.log(`✅ Response sent | Messages: ${updatedAccess.messageCount}/${PREMIUM_CONFIG.FREE_MESSAGES}`);
            console.log(`━━━━━━━━━━━━━━━━━\n`);

            res.json({
                success: true,
                data: {
                    userMessage,
                    assistantMessage,
                    userAccess: updatedAccess,
                    jobs: aiResult.jobs || []
                }
            });

        } catch (error) {
            console.error('❌ Chat error:', error);
            res.status(500).json({
                success: false,
                message: 'Error processing message',
                error: error.message
            });
        }
    });

    // Get user status
    router.get('/user-status/:userEmail', async (req, res) => {
        try {
            const { userEmail } = req.params;
            const userAccess = await checkUserAccess(userEmail);
            const user = await usersCollection.findOne({ email: userEmail });
            
            res.json({
                success: true,
                data: {
                    userAccess,
                    user: {
                        email: user?.email,
                        isPremium: user?.isPremium,
                        aiCredits: user?.aiCredits,
                        currentPlan: user?.currentPlan,
                        role: user?.role
                    }
                }
            });
        } catch (error) {
            console.error('Error getting user status:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching user status',
                error: error.message
            });
        }
    });

    // Clear chat
    router.delete('/chat/:userEmail', async (req, res) => {
        try {
            const { userEmail } = req.params;
            
            await aichatbotCollection.updateOne(
                { userEmail },
                {
                    $set: {
                        messages: [
                            {
                                role: 'assistant',
                                content: "Hey! 👋 Fresh start! I'm your CareerCrafter AI. What can I help you with today?",
                                timestamp: new Date()
                            }
                        ],
                        updatedAt: new Date()
                    }
                }
            );

            res.json({
                success: true,
                message: 'Chat cleared successfully'
            });
        } catch (error) {
            console.error('Error clearing chat:', error);
            res.status(500).json({
                success: false,
                message: 'Error clearing chat',
                error: error.message
            });
        }
    });

    return router;
};