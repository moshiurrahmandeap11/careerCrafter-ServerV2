// routes/live-interview.js
const express = require('express');
const router = express.Router();
const { Groq } = require('groq-sdk');

// Groq client initialize
let groq;
try {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY 
  });
  console.log('✅ GROQ client initialized successfully');
} catch (error) {
  console.error('❌ GROQ client initialization failed:', error);
}

// Available GROQ models
const AVAILABLE_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile', 
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

const DEFAULT_MODEL = 'llama-3.1-8b-instant';

module.exports = (liveInterviewCollection) => {
  
  const activeSessions = new Map();

  // Start a new live interview session
  router.post('/start-session', async (req, res) => {
    console.log('📞 POST /start-session called with:', req.body);
    
    try {
      const { userId, interviewType, position } = req.body;
      
      if (!interviewType || !position) {
        return res.status(400).json({ 
          success: false, 
          error: 'interviewType and position are required' 
        });
      }

      if (!groq) {
        return res.status(500).json({
          success: false,
          error: 'AI service is currently unavailable'
        });
      }
      
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session = {
        sessionId,
        userId: userId || `user_${Date.now()}`,
        interviewType,
        position,
        startTime: new Date(),
        messages: [],
        status: 'active',
        modelUsed: DEFAULT_MODEL
      };
      
      console.log('🔄 Generating welcome message...');
      const welcomeMessage = await generateWelcomeMessage(interviewType, position);
      
      session.messages.push({
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date(),
        type: 'question'
      });
      
      activeSessions.set(sessionId, session);
      
      console.log('✅ Session created:', sessionId);
      
      res.json({
        success: true,
        sessionId,
        welcomeMessage,
        session,
        audioText: welcomeMessage // For text-to-speech
      });
      
    } catch (error) {
      console.error('❌ Error starting session:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start interview session. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Process user response and get next question
  router.post('/process-response', async (req, res) => {
    console.log('📞 POST /process-response called for session:', req.body.sessionId);
    
    try {
      const { sessionId, userResponse, audioDuration, userAudioUrl } = req.body;
      
      if (!sessionId || !userResponse) {
        return res.status(400).json({
          success: false,
          error: 'sessionId and userResponse are required'
        });
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ 
          success: false, 
          error: 'Interview session not found. Please start a new session.' 
        });
      }
      
      // Add user response to session history
      session.messages.push({
        role: 'user',
        content: userResponse,
        timestamp: new Date(),
        audioDuration,
        userAudioUrl,
        type: 'answer'
      });
      
      // Get AI response
      const aiResponse = await getAIResponse(session);
      
      session.messages.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        type: 'question'
      });
      
      // Check if interview should end
      const shouldEnd = checkInterviewCompletion(session);
      
      res.json({
        success: true,
        aiResponse,
        audioText: aiResponse, // For text-to-speech
        shouldEnd,
        sessionStatus: session.status,
        questionsAsked: session.messages.filter(m => m.type === 'question').length
      });
      
    } catch (error) {
      console.error('❌ Error processing response:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process your response. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // End interview session and save to database
  router.post('/end-session', async (req, res) => {
    console.log('📞 POST /end-session called for session:', req.body.sessionId);
    
    try {
      const { sessionId, feedback = true } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId is required'
        });
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ 
          success: false, 
          error: 'Session not found' 
        });
      }
      
      session.endTime = new Date();
      session.status = 'completed';
      session.duration = session.endTime - session.startTime;
      
      let finalFeedback = null;
      if (feedback) {
        try {
          finalFeedback = await generateFinalFeedback(session);
          session.finalFeedback = finalFeedback;
        } catch (feedbackError) {
          console.error('❌ Error generating feedback:', feedbackError);
          finalFeedback = 'Thank you for completing the interview. Your responses have been recorded.';
        }
      }
      
      // Save to MongoDB
      if (liveInterviewCollection) {
        try {
          await liveInterviewCollection.insertOne(session);
          console.log('✅ Session saved to database');
        } catch (dbError) {
          console.error('❌ Database save error:', dbError);
          // Continue even if DB save fails
        }
      }
      
      activeSessions.delete(sessionId);
      
      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          interviewType: session.interviewType,
          position: session.position,
          duration: session.duration,
          messageCount: session.messages.length
        },
        finalFeedback,
        message: 'Interview completed successfully'
      });
      
    } catch (error) {
      console.error('❌ Error ending session:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to end interview session',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Get session status
  router.get('/session/:sessionId', (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    res.json({ 
      success: true, 
      session: {
        sessionId: session.sessionId,
        status: session.status,
        interviewType: session.interviewType,
        position: session.position,
        startTime: session.startTime,
        messageCount: session.messages.length,
        questionsAsked: session.messages.filter(m => m.type === 'question').length
      }
    });
  });

  // Health check endpoint
  router.get('/health', async (req, res) => {
    try {
      // Test GROQ connection
      const testCompletion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Say "OK" if working.' }],
        model: DEFAULT_MODEL,
        max_tokens: 5
      });
      
      res.json({
        success: true,
        message: 'Live interview service is healthy',
        groqStatus: 'connected',
        availableModels: AVAILABLE_MODELS,
        activeSessions: activeSessions.size
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Live interview service has issues',
        groqStatus: 'disconnected',
        error: error.message
      });
    }
  });

  // Helper functions
  async function generateWelcomeMessage(interviewType, position) {
    try {
      const prompt = `
        You are a professional interviewer conducting a ${interviewType} interview for a ${position} position.
        Start with a warm, professional welcome and ask the first appropriate question.
        Keep it concise and conversational (max 2 sentences).
        Do not give multiple questions at once.
      `;
      
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'system', content: prompt }],
        model: DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 100
      });
      
      const response = completion.choices[0]?.message?.content;
      return response || 'Welcome! Please start by telling me about yourself and your background.';
      
    } catch (error) {
      console.error('❌ GROQ API Error:', error.message);
      return 'Welcome to your interview. Could you please introduce yourself and tell me about your experience?';
    }
  }

  async function getAIResponse(session) {
    try {
      const recentMessages = session.messages.slice(-6); // Last 3 exchanges
      
      const systemPrompt = `
        You are a professional ${session.interviewType} interviewer for ${session.position} position.
        Guidelines:
        - Ask ONE clear, relevant question based on the candidate's last response
        - Keep it conversational and natural (max 2 sentences)
        - Show you understood their previous answer
        - Progress the interview logically
        - End naturally after 5-6 questions with appropriate closing
        
        Current conversation context (most recent first):
        ${recentMessages.map(msg => 
          `${msg.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${msg.content}`
        ).join('\n')}
      `;
      
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Based on the conversation above, ask the next appropriate question.' }
      ];
      
      const completion = await groq.chat.completions.create({
        messages: messages,
        model: DEFAULT_MODEL,
        temperature: 0.8,
        max_tokens: 150
      });
      
      return completion.choices[0]?.message?.content || 'Thank you. Could you tell me more about that experience?';
      
    } catch (error) {
      console.error('❌ Error in getAIResponse:', error.message);
      return 'Thank you for that response. Could you please continue with your answer?';
    }
  }

  function checkInterviewCompletion(session) {
    const questionCount = session.messages.filter(m => m.type === 'question').length;
    
    // End after 5-6 questions
    if (questionCount >= 6) {
      return true;
    }
    
    // Check for natural ending cues
    const lastMessage = session.messages[session.messages.length - 1];
    if (lastMessage.role === 'assistant') {
      const content = lastMessage.content.toLowerCase();
      if (content.includes('final question') || 
          content.includes('last question') ||
          content.includes('thank you for your time') ||
          content.includes('end of interview') ||
          content.includes('conclude the interview')) {
        return true;
      }
    }
    
    return false;
  }

  async function generateFinalFeedback(session) {
    try {
      const conversationSummary = session.messages
        .map(msg => `${msg.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${msg.content}`)
        .join('\n\n');
      
      const prompt = `
        Provide constructive feedback for this job interview:
        
        Position: ${session.position}
        Type: ${session.interviewType}
        
        Conversation:
        ${conversationSummary}
        
        Provide brief, actionable feedback in this format:
        - Overall impression
        - Key strengths shown  
        - Areas for improvement
        - Specific suggestions
        
        Keep it professional and encouraging. Maximum 300 words.
      `;
      
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'system', content: prompt }],
        model: DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 400
      });
      
      return completion.choices[0]?.message?.content || 
        'Thank you for completing the interview. Your responses showed good preparation. We will review and provide detailed feedback soon.';
        
    } catch (error) {
      console.error('❌ Error generating final feedback:', error.message);
      return 'Thank you for completing the interview. Your responses have been recorded and will be reviewed by our team.';
    }
  }

  return router;
};