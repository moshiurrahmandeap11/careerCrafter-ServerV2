const express = require('express');
const { ObjectId } = require('mongodb');
const Groq = require('groq-sdk');

const router = express.Router();

module.exports = (db) => {
    const aichatbotCollection = db.collection("aichatbot");
    const jobsCollection = db.collection("jobs");
    const usersCollection = db.collection("users");
    const paymentsCollection = db.collection("payments");

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

    // Conversation memory
    let conversationMemory = new Map();

    // Premium configuration
    const PREMIUM_CONFIG = {
        FREE_MESSAGES: 2,
        CREDITS_PER_CHARACTER: 0.1,
        MIN_CREDITS_REQUIRED: 10
    };

    // Check user premium status and credits
    const checkUserAccess = async (userEmail) => {
        try {
            const user = await usersCollection.findOne({ email: userEmail });
            if (!user) {
                return { allowed: false, reason: 'User not found' };
            }

            // Get user's message count for this session
            const context = getConversationContext(userEmail);
            const messageCount = context.messageCount || 0;

            // Free tier: first 2 messages are free
            if (messageCount <= PREMIUM_CONFIG.FREE_MESSAGES) {
                return { 
                    allowed: true, 
                    tier: 'free',
                    remainingFree: PREMIUM_CONFIG.FREE_MESSAGES - messageCount,
                    messageCount 
                };
            }

            // Premium users have unlimited access
            if (user.isPremium && user.aiCredits > 0) {
                return { 
                    allowed: true, 
                    tier: 'premium',
                    credits: user.aiCredits,
                    messageCount 
                };
            }

            // Check if user has enough credits
            if (user.aiCredits >= PREMIUM_CONFIG.MIN_CREDITS_REQUIRED) {
                return { 
                    allowed: true, 
                    tier: 'credits',
                    credits: user.aiCredits,
                    messageCount 
                };
            }

            return { 
                allowed: false, 
                tier: 'blocked',
                reason: 'Insufficient credits',
                messageCount,
                required: PREMIUM_CONFIG.MIN_CREDITS_REQUIRED
            };

        } catch (error) {
            console.error('❌ Error checking user access:', error);
            return { allowed: false, reason: 'System error' };
        }
    };

    // Deduct credits for AI response
    const deductCredits = async (userEmail, messageLength) => {
        try {
            const creditsUsed = Math.ceil(messageLength * PREMIUM_CONFIG.CREDITS_PER_CHARACTER);
            
            const result = await usersCollection.updateOne(
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

    // FIXED Conversation Memory System
    const getConversationContext = (userEmail) => {
        if (!conversationMemory.has(userEmail)) {
            conversationMemory.set(userEmail, {
                userName: userEmail.split('@')[0],
                phase: 'greeting',
                mentionedSkills: [],
                jobPreferences: {},
                lastIntent: '',
                messageCount: 0,
                lastSearchTime: null,
                searchResults: null,
                conversationHistory: [],
                freeMessagesUsed: 0,
                sessionStart: new Date(),
                lastActivity: new Date()
            });
        }
        return conversationMemory.get(userEmail);
    };

    const updateConversationContext = (userEmail, userMessage, aiResponse, searchData = null) => {
        const context = getConversationContext(userEmail);
        const lowerMessage = userMessage.toLowerCase();
        
        // Track message count - ONLY for user messages
        if (userMessage.trim().length > 0) {
            context.messageCount += 1;
            context.lastActivity = new Date();
        }
        
        // Detect intent and phase - IMPROVED LOGIC
        if (context.messageCount === 1 || 
            lowerMessage.includes('hi') || 
            lowerMessage.includes('hello') || 
            lowerMessage.includes('hey') ||
            lowerMessage.includes('start')) {
            
            context.phase = 'greeting';
            context.lastIntent = 'greeting';
            
        } else if (lowerMessage.includes('job') || 
                   lowerMessage.includes('career') || 
                   lowerMessage.includes('work') || 
                   lowerMessage.includes('developer') || 
                   lowerMessage.includes('seek') || 
                   lowerMessage.includes('looking for') ||
                   lowerMessage.includes('find job') ||
                   lowerMessage.includes('position') ||
                   lowerMessage.includes('role')) {
            
            context.phase = 'job_search';
            context.lastIntent = 'job_search';
            
        } else if (lowerMessage.includes('hire') || 
                   lowerMessage.includes('candidate') ||
                   lowerMessage.includes('recruit') ||
                   lowerMessage.includes('employee')) {
            
            context.phase = 'hiring';
            context.lastIntent = 'hiring';
            
        } else if (lowerMessage.includes('premium') || 
                   lowerMessage.includes('credit') || 
                   lowerMessage.includes('upgrade') || 
                   lowerMessage.includes('plan') ||
                   lowerMessage.includes('subscribe')) {
            
            context.phase = 'premium';
            context.lastIntent = 'premium';
            
        } else {
            // Continue with last intent for follow-up messages
            context.phase = context.lastIntent || 'general';
        }
        
        // Extract and track skills
        const skillKeywords = ['react', 'javascript', 'node', 'python', 'java', 'developer', 'frontend', 'backend', 'fullstack'];
        const foundSkills = skillKeywords.filter(skill => lowerMessage.includes(skill));
        if (foundSkills.length > 0) {
            context.mentionedSkills = [...new Set([...context.mentionedSkills, ...foundSkills])];
        }
        
        // Store search results
        if (searchData) {
            context.searchResults = searchData;
            context.lastSearchTime = new Date();
        }
        
        // Track conversation history - ONLY meaningful messages
        if (userMessage.trim().length > 1 && !['ok', 'okay', 'thanks', 'thank you', 'hello', 'hi', 'hey'].includes(userMessage.trim().toLowerCase())) {
            context.conversationHistory.push({
                user: userMessage,
                assistant: aiResponse,
                timestamp: new Date(),
                intent: context.lastIntent
            });
        }
        
        // Keep only last 8 messages
        if (context.conversationHistory.length > 8) {
            context.conversationHistory = context.conversationHistory.slice(-8);
        }
        
        console.log('🧠 Updated Context:', {
            phase: context.phase,
            intent: context.lastIntent,
            skills: context.mentionedSkills,
            messageCount: context.messageCount,
            hasSearchResults: !!context.searchResults,
            historyLength: context.conversationHistory.length
        });
        
        conversationMemory.set(userEmail, context);
        return context;
    };

    // Job search function with enhanced results
    const findJobsBySkills = async (skills, context) => {
        try {
            console.log('🔍 Searching jobs in database...');
            
            let skillsArray = Array.isArray(skills) ? skills : [skills];
            skillsArray = skillsArray.map(s => s.trim().toLowerCase()).filter(s => s.length > 2);

            // Smart skill mapping for better search
            if (skillsArray.includes('react')) {
                skillsArray.push('react.js', 'reactjs', 'frontend', 'javascript');
            }
            if (skillsArray.includes('developer')) {
                skillsArray.push('engineer', 'programmer');
            }

            skillsArray = [...new Set(skillsArray)];
            console.log('🔍 Final search terms:', skillsArray);

            const jobs = await jobsCollection.find({
                status: 'active',
                $or: [
                    { 
                        $or: [
                            { requiredSkills: { $in: skillsArray } },
                            { preferredSkills: { $in: skillsArray } },
                            { tags: { $in: skillsArray } }
                        ]
                    },
                    { title: { $regex: skillsArray.join('|'), $options: 'i' } },
                    { description: { $regex: skillsArray.join('|'), $options: 'i' } },
                    { company: { $regex: skillsArray.join('|'), $options: 'i' } }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();

            console.log(`✅ Database returned ${jobs.length} jobs`);
            
            // Generate job links
            const jobsWithLinks = jobs.map(job => ({
                ...job,
                jobLink: `/jobs/${job._id}`,
                applyLink: `/jobs/${job._id}/apply`,
                companyLink: `/companies/${job.company.toLowerCase().replace(/\s+/g, '-')}`
            }));

            return { 
                jobs: jobsWithLinks, 
                formattedJobs: jobsWithLinks.map(job => ({
                    title: job.title,
                    company: job.company,
                    salary: job.salaryMin ? `$${job.salaryMin}-$${job.salaryMax}` : 'Competitive salary',
                    location: job.location || 'Remote',
                    skills: job.requiredSkills?.join(', ') || 'React, JavaScript',
                    type: job.jobType || 'Full-time',
                    jobLink: job.jobLink,
                    applyLink: job.applyLink
                }))
            };
        } catch (error) {
            console.error('❌ Job search error:', error);
            return { jobs: [], formattedJobs: [] };
        }
    };

    // IMPROVED Guaranteed Response Generator with Conversation Flow
    const generateGuaranteedResponse = (jobData, userMessage, context, userAccess) => {
        const lowerMessage = userMessage.toLowerCase();
        
        console.log('🛡️ Using guaranteed response with:', {
            jobs: jobData.jobs.length,
            userTier: userAccess.tier,
            messageCount: context.messageCount,
            phase: context.phase,
            intent: context.lastIntent
        });
        
        // Premium upgrade prompt for free users after 2 messages
        if (!userAccess.allowed && userAccess.tier === 'blocked') {
            return `🚀 **Upgrade to Premium Required**\n\nYou've used your ${PREMIUM_CONFIG.FREE_MESSAGES} free messages! To continue chatting with me:\n\n💎 **Premium Benefits:**\n• Unlimited AI conversations\n• Priority job matching\n• Advanced career insights\n• Direct employer connections\n\n🔗 **Upgrade Now:** \`/premium\`\n\nOr purchase credits to continue: \`/buy-credits\``;
        }
        
        // Handle conversation flow based on context
        switch(context.phase) {
            case 'greeting':
                if (context.messageCount === 1) {
                    return `Hey there! 👋 I'm your CareerCrafter AI assistant. I can help you with:\n\n• Finding React developer jobs\n• Connecting with employers  \n• Career advice and tips\n• Profile optimization\n\nWhat would you like to start with today?\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                } else {
                    return `I'm still here! 😊 You mentioned you're looking for opportunities. Would you like me to:\n\n1. Search for React developer jobs\n2. Help with your career strategy\n3. Connect you with employers\n\nWhat sounds most helpful right now?\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                }
                
            case 'job_search':
                // If jobs found - PROVIDE ACTUAL JOB INFO WITH LINKS
                if (jobData.jobs.length > 0) {
                    const jobs = jobData.formattedJobs.slice(0, 3);
                    const jobList = jobs.map(job => 
                        `**[${job.title}](${job.jobLink})** at ${job.company} (${job.salary}) - ${job.location}`
                    ).join('\n• ');
                    
                    let response = `Excellent! 🎯 I found ${jobData.jobs.length} React developer position${jobData.jobs.length > 1 ? 's' : ''} for you:\n\n• ${jobList}\n\n**Quick Actions:**\n1. **[View Details](${jobs[0].jobLink})** - See full job description\n2. **[Apply Now](${jobs[0].applyLink})** - Start application\n3. **[Browse More Jobs](/jobs)** - Explore all opportunities\n\nWould you like me to help with the application process or search for different roles?`;
                    
                    // Add free message counter for free users
                    if (userAccess.tier === 'free') {
                        response += `\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                    }
                    
                    return response;
                } else {
                    let response = `I searched our database for React developer positions! 🔍\n\n**Current Status:** While we have many opportunities, specific React roles are limited right now.\n\n**Recommended Actions:**\n1. **[Browse Job Board](/jobs)** - All current openings\n2. **[Set Up Alerts](/profile/alerts)** - Get notified for new React jobs\n3. **[Expand Search](/jobs?search=javascript)** - Consider JavaScript/Frontend roles\n\nWould you like me to help you set up job alerts or explore other career options?`;
                    
                    if (userAccess.tier === 'free') {
                        response += `\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                    }
                    
                    return response;
                }
                
            case 'hiring':
                return `I'd be happy to help you find talented candidates! 👥\n\nPlease tell me:\n1. What specific skills are you looking for?\n2. What type of position is this?\n3. Any experience level preferences?\n\nI'll search our database for the perfect matches!\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                
            case 'premium':
                return `💎 **CareerCrafter Premium**\n\n**Free Tier:**\n• ${PREMIUM_CONFIG.FREE_MESSAGES} AI messages per session\n• Basic job matching\n• Standard career advice\n\n**Premium Benefits:**\n• **Unlimited** AI conversations\n• **Priority** job matching\n• **Advanced** career insights\n• **Direct** employer connections\n• **Personalized** career coaching\n\n🔗 **Upgrade Now:** \`/premium\`\n💰 **Buy Credits:** \`/buy-credits\`\n\nYour current status: ${userAccess.tier === 'premium' ? '🎉 Premium Member' : 'Free Tier'}`;
                
            default:
                // Follow-up conversation based on last intent
                if (context.lastIntent === 'job_search') {
                    return `Continuing our job search conversation! 🚀\n\nWould you like me to:\n1. Search for more specific roles?\n2. Help with application tips?\n3. Review your profile for employers?\n\nI'm here to help you land that perfect React role!\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                }
                
                // Default engaging response
                let response = `I'm here to help! 🎯\n\nBased on our conversation, I can assist with:\n\n`;
                
                if (context.mentionedSkills.length > 0) {
                    response += `• Finding ${context.mentionedSkills.join('/')} developer jobs\n`;
                }
                response += `• Career advice and strategy\n• Profile optimization tips\n• Interview preparation\n\nWhat would you like to focus on?\n\n💡 **Free Messages:** ${userAccess.remainingFree} of ${PREMIUM_CONFIG.FREE_MESSAGES} remaining`;
                
                return response;
        }
    };

    // IMPROVED AI Response Generator with Better Context
    const generateAIResponse = async (userMessage, userEmail) => {
        try {
            // Check user access first
            const userAccess = await checkUserAccess(userEmail);
            
            if (!userAccess.allowed) {
                return generateGuaranteedResponse({ jobs: [] }, userMessage, getConversationContext(userEmail), userAccess);
            }

            const context = getConversationContext(userEmail);
            const lowerMessage = userMessage.toLowerCase();
            
            console.log('💬 Processing:', userMessage);
            console.log('🎯 Context Analysis:', {
                phase: context.phase,
                intent: context.lastIntent, 
                skills: context.mentionedSkills,
                messageCount: context.messageCount,
                userTier: userAccess.tier,
                historyLength: context.conversationHistory.length
            });

            // Skip AI for very short follow-up messages to save credits
            const shortMessages = ['ok', 'okay', 'thanks', 'thank you', 'hello', 'hi', 'hey'];
            if (shortMessages.includes(lowerMessage.trim()) && context.messageCount > 1) {
                console.log('⏩ Using guaranteed response for short follow-up');
                const jobData = { jobs: [], formattedJobs: [] };
                return generateGuaranteedResponse(jobData, userMessage, context, userAccess);
            }

            // IMMEDIATE ACTION: Search for jobs when relevant
            let jobData = { jobs: [], formattedJobs: [] };
            
            if (context.phase === 'job_search' || 
                lowerMessage.includes('job') || 
                lowerMessage.includes('career') ||
                lowerMessage.includes('work') ||
                lowerMessage.includes('react') ||
                lowerMessage.includes('developer') ||
                context.lastIntent === 'job_search' ||
                lowerMessage.includes('seek') ||
                lowerMessage.includes('looking for') ||
                lowerMessage.includes('find job') ||
                lowerMessage.includes('position') ||
                lowerMessage.includes('role')
            ) {
                
                const searchSkills = context.mentionedSkills.length > 0 ? context.mentionedSkills : ['react', 'developer', 'javascript'];
                console.log('🚀 Immediate job search triggered with skills:', searchSkills);
                
                jobData = await findJobsBySkills(searchSkills, context);
                console.log('📊 Job search results:', jobData.jobs.length);
            }

            // Build intelligent context for AI
            const recentHistory = context.conversationHistory.slice(-3).map(msg => 
                `User: ${msg.user}\nAssistant: ${msg.assistant}`
            ).join('\n\n');

            // Enhanced System Prompt with Conversation Flow
            const systemPrompt = `
# CareerCrafter AI - Real Career Assistant

## CONVERSATION FLOW:
- Current Phase: ${context.phase}
- Previous Intent: ${context.lastIntent}
- Message Count: ${context.messageCount}
- User Tier: ${userAccess.tier}
- User Skills: ${context.mentionedSkills.join(', ') || 'React developer'}

## SEARCH RESULTS:
${jobData.jobs.length > 0 ? 
`Found ${jobData.jobs.length} jobs:
${jobData.formattedJobs.map(j => `• ${j.title} at ${j.company} (${j.salary}) - [View](${j.jobLink})`).join('\n')}`
: 'No specific jobs found in current search'}

## RECENT CONVERSATION:
${recentHistory || 'Just starting conversation'}

## CURRENT USER MESSAGE:
"${userMessage}"

## YOUR ROLE:
Continue the natural conversation flow. You've already searched the database when relevant.

## RESPONSE GUIDELINES:

### CONVERSATION CONTINUITY:
- Acknowledge previous context naturally
- Continue the discussion flow
- Ask relevant follow-up questions
- Maintain helpful, enthusiastic tone

### FOR JOB SEARCH:
${jobData.jobs.length > 0 ? 
`- Mention the specific jobs found
- Provide clickable links
- Offer application help
- Suggest next steps` 
: `- Suggest alternative actions
- Provide helpful resources
- Offer to refine search`}

### FOR FREE USERS:
- Mention remaining free messages naturally
- Don't be pushy about premium
- Focus on providing value

## CRITICAL: Never restart conversation or ignore context!

Respond naturally and continue the discussion:`;

            console.log('🤖 Calling AI with conversation context...');
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                model: "llama3-8b-8192",
                temperature: 0.7,
                max_tokens: 600
            });

            let aiResponse = completion.choices[0]?.message?.content;
            
            console.log('🤖 AI Response:', aiResponse);
            
            // Deduct credits if not free tier
            if (userAccess.tier !== 'free' && userAccess.tier !== 'blocked') {
                await deductCredits(userEmail, aiResponse.length);
            }
            
            // Update context with search data
            updateConversationContext(userEmail, userMessage, aiResponse, jobData);

            return aiResponse;

        } catch (error) {
            console.error('❌ AI Error:', error);
            
            // FALLBACK: Generate response with actual search data
            const context = getConversationContext(userEmail);
            const userAccess = await checkUserAccess(userEmail);
            const lowerMessage = userMessage.toLowerCase();
            
            // Search for jobs in fallback too
            let jobData = { jobs: [], formattedJobs: [] };
            if (lowerMessage.includes('job') || lowerMessage.includes('react') || context.lastIntent === 'job_search') {
                const searchSkills = context.mentionedSkills.length > 0 ? context.mentionedSkills : ['react', 'developer'];
                jobData = await findJobsBySkills(searchSkills, context);
            }
            
            return generateGuaranteedResponse(jobData, userMessage, context, userAccess);
        }
    };

    // Get or create chat for user
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
                            content: "Hey there! 👋 I'm your CareerCrafter AI assistant. I can help you find React jobs, connect with employers, or get career advice. What can I do for you today?",
                            timestamp: new Date()
                        }
                    ],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                const result = await aichatbotCollection.insertOne(newChat);
                chat = { ...newChat, _id: result.insertedId };
            }

            res.json({
                success: true,
                data: chat
            });
        } catch (error) {
            console.error('Error getting chat:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching chat',
                error: error.message
            });
        }
    });

    // Send message and get AI response with premium checks
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

            console.log(`\n=== NEW MESSAGE ===`);
            console.log(`📩 From: ${userEmail}`);
            console.log(`💬 Message: ${message}`);

            // Check user access
            const userAccess = await checkUserAccess(userEmail);
            console.log('👤 User Access:', userAccess);

            // Get or create chat
            let chat = await aichatbotCollection.findOne({ userEmail });
            if (!chat) {
                const newChat = {
                    userId: userEmail,
                    userEmail,
                    messages: [{
                        role: 'assistant',
                        content: "Hey there! 👋 I'm your CareerCrafter AI assistant. I can help you find React jobs, connect with employers, or get career advice. What can I do for you today?",
                        timestamp: new Date()
                    }],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const result = await aichatbotCollection.insertOne(newChat);
                chat = { ...newChat, _id: result.insertedId };
            }

            // Add user message
            const userMessage = {
                role: 'user',
                content: message.trim(),
                timestamp: new Date()
            };

            // Generate AI response
            const aiResponse = await generateAIResponse(message, userEmail);

            const assistantMessage = {
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date()
            };

            // Update chat
            await aichatbotCollection.updateOne(
                { userEmail },
                {
                    $push: {
                        messages: { $each: [userMessage, assistantMessage] }
                    },
                    $set: { updatedAt: new Date() }
                }
            );

            console.log(`✅ Response sent successfully`);
            console.log(`💰 User Tier: ${userAccess.tier}, Messages: ${getConversationContext(userEmail).messageCount}`);
            console.log(`=====================\n`);

            res.json({
                success: true,
                data: {
                    userMessage,
                    assistantMessage,
                    userAccess
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

    // Get user AI credits and status
    router.get('/user-status/:userEmail', async (req, res) => {
        try {
            const { userEmail } = req.params;
            const userAccess = await checkUserAccess(userEmail);
            const user = await usersCollection.findOne({ email: userEmail });
            const context = getConversationContext(userEmail);
            
            res.json({
                success: true,
                data: {
                    userAccess,
                    context: {
                        messageCount: context.messageCount,
                        phase: context.phase,
                        lastIntent: context.lastIntent,
                        skills: context.mentionedSkills
                    },
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

    // Clear chat history
    router.delete('/chat/:userEmail', async (req, res) => {
        try {
            const { userEmail } = req.params;
            conversationMemory.delete(userEmail);
            
            await aichatbotCollection.updateOne(
                { userEmail },
                {
                    $set: {
                        messages: [
                            {
                                role: 'assistant',
                                content: "Hey there! 👋 Fresh start! I'm your CareerCrafter AI assistant. What can I help you with today?",
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