const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = (db) => {
    const aiJobsCollection = db.collection("aiJobs");
    const usersCollection = db.collection("users");
    const jobsCollection = db.collection("jobs");

    // AI Job Matching endpoint
    router.post('/match', async (req, res) => {
        try {
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            console.log('AI Job Match requested for user:', userId);

            // Get user profile
            const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            console.log('User found:', user.fullName);

            // Get all active jobs
            const jobs = await jobsCollection.find({ status: 'active' }).toArray();
            console.log('Found jobs for matching:', jobs.length);

            // Prepare user data for AI matching
            const userData = {
                skills: user.skills || user.tags || [],
                desiredJobTitle: user.desiredJobTitle || 'Job Seeker',
                preferredJobType: user.preferredJobType || 'full-time',
                preferredLocation: user.preferredLocation || 'remote',
                expectedSalary: user.expectedSalary || 0,
                yearsOfExperience: user.yearsOfExperience || 'entry',
                education: user.education || 'bachelor',
                industry: user.industry || 'technology',
                certifications: user.certifications || [],
                currentJobTitle: user.currentJobTitle || '',
                portfolio: user.portfolio || ''
            };

            console.log('User data prepared for AI matching');

            // Call AI matching function with Groq fallback
            const matchedJobs = await getAIMatchedJobsWithGroq(userData, jobs);
            console.log('AI matching completed. Matches found:', matchedJobs.length);

            // Save matched results to aiJobs collection
            const matchResult = {
                userId: userId,
                userProfile: userData,
                matchedJobs: matchedJobs,
                matchDate: new Date(),
                totalMatches: matchedJobs.length,
                matchAlgorithm: 'groq-enhanced'
            };

            const result = await aiJobsCollection.insertOne(matchResult);
            console.log('Match results saved to database');

            res.json({
                success: true,
                message: 'Job matching completed successfully',
                data: {
                    matches: matchedJobs,
                    totalMatches: matchedJobs.length,
                    matchId: result.insertedId
                }
            });

        } catch (error) {
            console.error('AI Job Matching Error:', error);
            res.status(500).json({
                success: false,
                message: 'Error in AI job matching',
                error: error.message
            });
        }
    });

    // Get AI matched jobs for a user
    router.get('/user/:userId/matches', async (req, res) => {
        try {
            const { userId } = req.params;
            const { limit = 10 } = req.query;

            const matches = await aiJobsCollection
                .find({ userId: userId })
                .sort({ matchDate: -1 })
                .limit(parseInt(limit))
                .toArray();

            res.json({
                success: true,
                data: matches
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching AI job matches',
                error: error.message
            });
        }
    });

    // Get specific match result
    router.get('/match/:matchId', async (req, res) => {
        try {
            const match = await aiJobsCollection.findOne({
                _id: new ObjectId(req.params.matchId)
            });

            if (!match) {
                return res.status(404).json({
                    success: false,
                    message: 'Match result not found'
                });
            }

            res.json({
                success: true,
                data: match
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching match result',
                error: error.message
            });
        }
    });

    return router;
};

// Free Groq models 
const GROQ_MODELS = [
    {
        name: 'Llama 3.3 70B',
        model: 'llama-3.3-70b-versatile',
        description: 'Best overall free model',
        priority: 1
    },
    {
        name: 'Mixtral 8x7B',
        model: 'mixtral-8x7b-32768',
        description: 'Fast and efficient',
        priority: 2
    },
    {
        name: 'Llama 3.1 8B',
        model: 'llama-3.1-8b-instant',
        description: 'Ultra fast responses',
        priority: 3
    }
];

// Enhanced AI Matching with Groq (100% Free)
async function getAIMatchedJobsWithGroq(userData, jobs) {
    const groqApiKey = process.env.GROQ_API_KEY;
    
    if (!groqApiKey) {
        console.error('⚠️ Groq API key not found. Using basic matching...');
        return getEnhancedBasicMatchedJobs(userData, jobs);
    }

    // Try Groq models
    for (const modelConfig of GROQ_MODELS) {
        try {
            console.log(`🤖 Trying Groq model: ${modelConfig.name}`);
            
            const matchedJobs = await callGroqAPI(userData, jobs, modelConfig, groqApiKey);
            
            if (matchedJobs && matchedJobs.length > 0) {
                console.log(`✅ Success with Groq ${modelConfig.name}. Found ${matchedJobs.length} matches`);
                return matchedJobs;
            }
        } catch (error) {
            console.error(`❌ Error with Groq ${modelConfig.name}:`, error.message);
        }
    }

    console.log('⚠️ All Groq models failed. Using enhanced basic matching...');
    return getEnhancedBasicMatchedJobs(userData, jobs);
}

// Call Groq API (Free and Fast)
async function callGroqAPI(userData, jobs, modelConfig, apiKey) {
    const prompt = createEnhancedMatchingPrompt(userData, jobs);
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelConfig.model,
            messages: [
                {
                    role: 'system',
                    content: `You are an expert job matching AI. Analyze user profiles and jobs, then return ONLY a valid JSON object with matched jobs. Include match scores (60-95), detailed reasons, strengths, and improvements.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 4000
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from Groq');
    }

    try {
        const matches = JSON.parse(data.choices[0].message.content);
        return matches.matchedJobs || [];
    } catch (parseError) {
        console.error('JSON parse error from Groq:', parseError);
        throw new Error('Invalid JSON response from Groq');
    }
}

function createEnhancedMatchingPrompt(userData, jobs) {
    const limitedJobs = jobs.slice(0, 20);
    
    return `
TASK: Match user with suitable jobs. Return ONLY valid JSON.

USER PROFILE:
- Desired Job: ${userData.desiredJobTitle || 'Not specified'}
- Current Job: ${userData.currentJobTitle || 'Not specified'}
- Skills: ${(userData.skills || []).join(', ') || 'None'}
- Experience: ${userData.yearsOfExperience || 'entry'}
- Education: ${userData.education || 'bachelor'}
- Industry: ${userData.industry || 'technology'}
- Job Type: ${userData.preferredJobType || 'full-time'}
- Location: ${userData.preferredLocation || 'remote'}
- Expected Salary: $${userData.expectedSalary || '0'}/month
- Certifications: ${(userData.certifications || []).join(', ') || 'None'}

AVAILABLE JOBS (${limitedJobs.length}):
${limitedJobs.map((job, index) => `
JOB ${index + 1}:
- ID: ${job._id}
- Title: ${job.title || 'Untitled'}
- Company: ${job.company || 'Unknown'}
- Industry: ${job.industry || 'General'}
- Type: ${job.jobType || 'full-time'}
- Work Mode: ${job.workMode || 'on-site'}
- Location: ${job.location || 'Not specified'}
- Experience: ${job.experienceLevel || 'mid'}
- Education: ${job.educationLevel || 'bachelor'}
- Salary: $${job.salaryMin || 0} - $${job.salaryMax || 0}
- Required Skills: ${(job.requiredSkills || []).join(', ') || 'None'}
- Preferred Skills: ${(job.preferredSkills || []).join(', ') || 'None'}
- Description: ${(job.description || '').substring(0, 200)}...
`).join('\n')}

RETURN THIS EXACT JSON FORMAT:
{
    "matchedJobs": [
        {
            "jobId": "job_id_here",
            "matchScore": 85,
            "reasons": ["Specific reason 1", "Specific reason 2"],
            "strengths": ["Strength 1", "Strength 2"],
            "improvements": ["Improvement 1"],
            "fitAnalysis": {
                "skills": 90,
                "experience": 85,
                "education": 75,
                "salary": 80,
                "location": 95,
                "culture": 70
            },
            "recommendation": "Highly recommended"
        }
    ]
}

RULES:
- Only include jobs with matchScore >= 60
- matchScore: 60-95
- Provide 2-4 specific reasons
- Maximum 10 jobs
- Return ONLY valid JSON
`;
}

// FIXED Enhanced Basic Matching (Fallback)
function getEnhancedBasicMatchedJobs(userData, jobs) {
    console.log('🔧 Using enhanced basic matching algorithm');
    const matchedJobs = [];

    const limitedJobs = jobs.slice(0, 50);

    limitedJobs.forEach(job => {
        try {
            let totalScore = 0;
            const reasons = [];
            const strengths = [];
            const improvements = [];
            const fitAnalysis = {
                skills: 0,
                experience: 0,
                education: 0,
                salary: 0,
                location: 0,
                culture: 0
            };

            // 1. Skills Matching (30%)
            const userSkills = (userData.skills || []).map(skill => 
                String(skill || '').toLowerCase()
            );
            const jobSkills = [
                ...(job.requiredSkills || []), 
                ...(job.preferredSkills || [])
            ].map(skill => String(skill || '').toLowerCase());
            
            const jobText = (
                String(job.title || '') + ' ' + 
                String(job.description || '') + ' ' + 
                (job.tags || []).join(' ')
            ).toLowerCase();
            
            let skillMatches = 0;
            userSkills.forEach(skill => {
                if (skill && (jobSkills.includes(skill) || jobText.includes(skill))) {
                    skillMatches++;
                }
            });

            const skillScore = userSkills.length > 0 ? (skillMatches / userSkills.length) * 100 : 50;
            fitAnalysis.skills = Math.round(skillScore);
            totalScore += skillScore * 0.3;

            if (skillMatches > 0) {
                reasons.push(`${skillMatches}/${userSkills.length} skills matched`);
            }

            // 2. Experience Matching (20%)
            const experienceOrder = ['entry', 'mid', 'senior', 'executive'];
            const userExp = String(userData.yearsOfExperience || 'entry').toLowerCase();
            const jobExp = String(job.experienceLevel || 'mid').toLowerCase();
            
            const userExpIndex = experienceOrder.findIndex(e => userExp.includes(e)) || 0;
            const jobExpIndex = experienceOrder.findIndex(e => jobExp.includes(e)) || 1;
            
            let expScore = 0;
            if (userExpIndex >= jobExpIndex) {
                expScore = 100;
                reasons.push('Experience level meets requirements');
            } else if (userExpIndex >= jobExpIndex - 1) {
                expScore = 70;
                improvements.push('Gain more experience');
            } else {
                expScore = 40;
                improvements.push('Build more experience in this field');
            }
            fitAnalysis.experience = expScore;
            totalScore += expScore * 0.2;

            // 3. Education Matching (10%)
            const educationOrder = ['high-school', 'associate', 'bachelor', 'master', 'doctorate'];
            const userEdu = String(userData.education || 'bachelor').toLowerCase();
            const jobEdu = String(job.educationLevel || 'bachelor').toLowerCase();
            
            const userEduIndex = educationOrder.findIndex(e => userEdu.includes(e)) || 2;
            const jobEduIndex = educationOrder.findIndex(e => jobEdu.includes(e)) || 2;
            
            const eduScore = userEduIndex >= jobEduIndex ? 100 : 60;
            fitAnalysis.education = eduScore;
            totalScore += eduScore * 0.1;

            // 4. Salary Matching (15%)
            const userExpectedSalary = parseInt(userData.expectedSalary) || 0;
            const jobMinSalary = parseInt(job.salaryMin) || 0;
            const jobMaxSalary = parseInt(job.salaryMax) || 0;
            
            let salaryScore = 50; // default
            if (userExpectedSalary > 0 && jobMaxSalary > 0) {
                if (userExpectedSalary <= jobMaxSalary && userExpectedSalary >= jobMinSalary) {
                    salaryScore = 100;
                    reasons.push('Salary perfectly matched');
                } else if (userExpectedSalary <= jobMaxSalary * 1.2) {
                    salaryScore = 80;
                    reasons.push('Salary negotiable');
                } else if (userExpectedSalary >= jobMinSalary * 0.8) {
                    salaryScore = 70;
                } else {
                    salaryScore = 50;
                }
            }
            fitAnalysis.salary = salaryScore;
            totalScore += salaryScore * 0.15;

            // 5. Location & Work Mode (10%)
            const userLocation = String(userData.preferredLocation || '').toLowerCase();
            const jobLocation = String(job.location || '').toLowerCase();
            const jobWorkMode = String(job.workMode || 'on-site').toLowerCase();
            
            let locationScore = 50; // default
            if (userLocation.includes('remote') && jobWorkMode.includes('remote')) {
                locationScore = 100;
                reasons.push('Remote work matched');
            } else if (jobWorkMode.includes('remote') || jobWorkMode.includes('hybrid')) {
                locationScore = 80;
                reasons.push('Flexible work available');
            } else if (userLocation && jobLocation.includes(userLocation)) {
                locationScore = 90;
                reasons.push('Location matched');
            }
            fitAnalysis.location = locationScore;
            totalScore += locationScore * 0.1;

            // 6. Job Type & Culture (10%)
            const userJobType = String(userData.preferredJobType || 'full-time').toLowerCase();
            const jobType = String(job.jobType || 'full-time').toLowerCase();
            
            const cultureScore = userJobType.includes(jobType) ? 100 : 70;
            fitAnalysis.culture = cultureScore;
            totalScore += cultureScore * 0.1;

            // 7. Career Growth (5%)
            totalScore += 75 * 0.05;

            const finalScore = Math.min(Math.round(totalScore), 95);

            if (finalScore >= 60) {
                // Generate strengths
                if (fitAnalysis.skills >= 80) strengths.push('Strong skills alignment');
                if (fitAnalysis.experience >= 80) strengths.push('Relevant experience');
                if (fitAnalysis.salary >= 80) strengths.push('Good salary fit');
                if (fitAnalysis.location >= 80) strengths.push('Location preference matched');

                // Ensure at least some feedback
                if (strengths.length === 0) strengths.push('Good overall profile match');
                if (improvements.length === 0) improvements.push('Continue building experience');
                if (reasons.length === 0) reasons.push('Profile matches job requirements');

                matchedJobs.push({
                    jobId: String(job._id),
                    matchScore: finalScore,
                    reasons: reasons.slice(0, 4),
                    strengths: strengths.slice(0, 3),
                    improvements: improvements.slice(0, 2),
                    fitAnalysis,
                    recommendation: finalScore >= 80 ? 'Highly recommended' : 
                                  finalScore >= 70 ? 'Good match' : 'Moderate match'
                });
            }
        } catch (error) {
            console.error(`Error processing job ${job._id}:`, error.message);
            // Skip this job and continue
        }
    });

    return matchedJobs.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
}