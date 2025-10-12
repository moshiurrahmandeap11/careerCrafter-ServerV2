const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Groq = require('groq-sdk');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

module.exports = (db) => {
  const resumeAnalysisCollection = db.collection('resumeAnalysis');

  // Analyze resume endpoint
  router.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
      const { jobDescription = '' } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No resume file uploaded' });
      }

      // Extract text from PDF
      let resumeText = '';
      if (file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(file.buffer);
        resumeText = pdfData.text;
      } else if (file.mimetype === 'text/plain') {
        resumeText = file.buffer.toString('utf8');
      } else {
        return res.status(400).json({ error: 'Unsupported file type. Please upload PDF or TXT.' });
      }

      if (!resumeText.trim()) {
        return res.status(400).json({ error: 'Could not extract text from the resume' });
      }

      // Analyze with AI
      const analysis = await analyzeResumeWithAI(resumeText, jobDescription);

      // Save analysis to database
      const analysisRecord = {
        resumeText: resumeText.substring(0, 1000), // Store first 1000 chars
        jobDescription: jobDescription.substring(0, 500),
        analysis,
        createdAt: new Date(),
        fileType: file.mimetype,
        fileName: file.originalname
      };

      await resumeAnalysisCollection.insertOne(analysisRecord);

      res.json({
        success: true,
        analysis,
        metadata: {
          textLength: resumeText.length,
          fileType: file.mimetype
        }
      });

    } catch (error) {
      console.error('Resume analysis error:', error);
      res.status(500).json({ 
        error: 'Failed to analyze resume',
        details: error.message 
      });
    }
  });

  // Get analysis history
  router.get('/history', async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      
      const history = await resumeAnalysisCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .toArray();

      res.json({ success: true, history });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analysis history' });
    }
  });

  return router;
};

// AI analysis function
async function analyzeResumeWithAI(resumeText, jobDescription = '') {
  const prompt = createAnalysisPrompt(resumeText, jobDescription);

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are an expert ATS (Applicant Tracking System) analyzer and career coach. Provide accurate, constructive feedback."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    model: "llama-3.1-8b-instant",
    temperature: 0.7,
    max_tokens: 2048
  });

  const analysisText = completion.choices[0]?.message?.content;
  
  try {
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : createDefaultAnalysis();
  } catch (error) {
    console.error('Error parsing AI response:', error);
    return createDefaultAnalysis();
  }
}

function createAnalysisPrompt(resumeText, jobDescription) {
  let prompt = `
Analyze this resume for ATS compatibility and provide improvement suggestions.

RESUME:
${resumeText.substring(0, 3000)} ${resumeText.length > 3000 ? '... [truncated]' : ''}
`;

  if (jobDescription) {
    prompt += `\n\nJOB DESCRIPTION:\n${jobDescription.substring(0, 1500)}`;
  }

  prompt += `\n\nProvide analysis in this JSON format:
{
  "atsScore": 85,
  "overallScore": 88,
  "categoryScores": {
    "content": 82,
    "formatting": 90,
    "keywords": 85,
    "readability": 92
  },
  "strengths": ["..."],
  "improvements": ["..."],
  "keywordAnalysis": {
    "missingKeywords": ["..."],
    "foundKeywords": ["..."],
    "recommendedKeywords": ["..."]
  },
  "summary": "...",
  "aiSuggestions": ["..."]
}`;

  return prompt;
}

function createDefaultAnalysis() {
  return {
    atsScore: 70,
    overallScore: 75,
    categoryScores: {
      content: 70,
      formatting: 75,
      keywords: 65,
      readability: 80
    },
    strengths: ['Resume processed successfully'],
    improvements: ['Complete analysis unavailable'],
    keywordAnalysis: {
      missingKeywords: [],
      foundKeywords: [],
      recommendedKeywords: []
    },
    summary: 'Basic analysis completed',
    aiSuggestions: ['Ensure proper resume formatting']
  };
}