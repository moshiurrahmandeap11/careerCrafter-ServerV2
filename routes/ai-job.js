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
            const jobs = await jobsCollection.find({ status: 'active', aiCompatible: true }).toArray();
            console.log('Found jobs for matching:', jobs.length);

            // Prepare user data for AI matching
            const userData = {
                skills: user.skills || [],
                desiredJobTitle: user.desiredJobTitle,
                preferredJobType: user.preferredJobType,
                preferredLocation: user.preferredLocation,
                expectedSalary: user.expectedSalary,
                yearsOfExperience: user.yearsOfExperience,
                education: user.education,
                industry: user.industry,
                certifications: user.certifications || [],
                currentJobTitle: user.currentJobTitle,
                portfolio: user.portfolio
            };

            console.log('User data prepared for AI matching');

            // Call AI matching function with multiple model fallbacks
            const matchedJobs = await getAIMatchedJobsWithFallback(userData, jobs);
            console.log('AI matching completed. Matches found:', matchedJobs.length);

            // Save matched results to aiJobs collection
            const matchResult = {
                userId: userId,
                userProfile: userData,
                matchedJobs: matchedJobs,
                matchDate: new Date(),
                totalMatches: matchedJobs.length,
                matchAlgorithm: 'multi-model-enhanced'
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

// List of free models with their specifications
const FREE_MODELS = [
    {
        name: 'DeepSeek R1 0528',
        model: 'deepseek/deepseek-r1-0528',
        context: 164000,
        description: 'High performance reasoning model',
        priority: 1
    },
    {
        name: 'Mistral Small 3.2 24B',
        model: 'mistralai/mistral-small-3.2-24b-instruct-2506',
        context: 131000,
        description: 'Balanced performance and efficiency',
        priority: 2
    },
    {
        name: 'TNG DeepSeek R1T2 Chimera',
        model: 'tngtech/dolphin-r1t2-chimera',
        context: 164000,
        description: 'Fast reasoning model',
        priority: 3
    },
    {
        name: 'MoonshotAI Kimi Dev 72B',
        model: 'moonshotai/kimi-dev-72b',
        context: 131000,
        description: 'Excellent for software engineering tasks',
        priority: 4
    },
    {
        name: 'DeepSeek R1 0528 Qwen3 8B',
        model: 'deepseek/deepseek-r1-0528-qwen3-8b',
        context: 131000,
        description: 'Efficient distilled reasoning model',
        priority: 5
    },
    {
        name: 'Venice Uncensored',
        model: 'dphn/venice-uncensored-dolphin-mistral-24b-venice-edition',
        context: 33000,
        description: 'Uncensored model for creative tasks',
        priority: 6
    },
    {
        name: 'Tencent Hunyuan A13B',
        model: 'tencent/hunyuan-a13b-instruct',
        context: 33000,
        description: 'Efficient MoE model',
        priority: 7
    },
    {
        name: 'Google Gemma 3n 2B',
        model: 'google/gemma-3n-2b-it',
        context: 8000,
        description: 'Lightweight and fast',
        priority: 8
    }
];

// Enhanced AI Matching function with multiple model fallbacks
async function getAIMatchedJobsWithFallback(userData, jobs) {
    const openaiApiKey = process.env.OPENROUTER_API_KEY;
    
    if (!openaiApiKey) {
        console.error('OpenRouter API key not found in environment variables');
        return getEnhancedBasicMatchedJobs(userData, jobs);
    }

    // Sort models by priority
    const sortedModels = [...FREE_MODELS].sort((a, b) => a.priority - b.priority);

    for (const modelConfig of sortedModels) {
        try {
            console.log(`Trying model: ${modelConfig.name} (${modelConfig.model})`);
            
            const matchedJobs = await callOpenRouterAPI(userData, jobs, modelConfig, openaiApiKey);
            
            if (matchedJobs && matchedJobs.length > 0) {
                console.log(`✅ Success with model: ${modelConfig.name}. Found ${matchedJobs.length} matches`);
                return matchedJobs;
            } else {
                console.log(`❌ No matches from model: ${modelConfig.name}. Trying next model...`);
            }
        } catch (error) {
            console.error(`❌ Error with model ${modelConfig.name}:`, error.message);
            // Continue to next model
        }
    }

    console.log('All AI models failed. Using enhanced basic matching...');
    return getEnhancedBasicMatchedJobs(userData, jobs);
}

// Generic function to call OpenRouter API
async function callOpenRouterAPI(userData, jobs, modelConfig, apiKey) {
    const prompt = createEnhancedMatchingPrompt(userData, jobs);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://careercrafter.com',
            'X-Title': 'Career Crafter AI Job Matcher'
        },
        body: JSON.stringify({
            model: modelConfig.model,
            messages: [
                {
                    role: 'system',
                    content: `You are an expert job matching AI. Analyze the user profile and jobs, then return a JSON array of matched jobs with detailed match scores and reasons. Consider skills, experience, education, salary, location, company culture, and growth opportunities. Return only valid JSON format.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4000,
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${modelConfig.name}): ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Invalid response format from ${modelConfig.name}`);
    }

    try {
        const matches = JSON.parse(data.choices[0].message.content);
        return matches.matchedJobs || [];
    } catch (parseError) {
        console.error(`JSON parse error from ${modelConfig.name}:`, parseError);
        throw new Error(`Invalid JSON response from ${modelConfig.name}`);
    }
}

function createEnhancedMatchingPrompt(userData, jobs) {
    // Limit jobs to first 20 to avoid token limits
    const limitedJobs = jobs.slice(0, 20);
    
    return `
TASK: Analyze the user profile and match with suitable jobs. Return ONLY valid JSON.

USER PROFILE:
- Desired Job Title: ${userData.desiredJobTitle || 'Not specified'}
- Current Job Title: ${userData.currentJobTitle || 'Not specified'}
- Skills: ${(userData.skills || []).join(', ') || 'None listed'}
- Experience: ${userData.yearsOfExperience || 'Not specified'} years
- Education: ${userData.education || 'Not specified'}
- Industry: ${userData.industry || 'Not specified'}
- Preferred Job Type: ${userData.preferredJobType || 'Not specified'}
- Preferred Location: ${userData.preferredLocation || 'Not specified'}
- Expected Salary: $${userData.expectedSalary || '0'}/month
- Certifications: ${(userData.certifications || []).join(', ') || 'None'}

AVAILABLE JOBS (${limitedJobs.length} jobs):
${limitedJobs.map((job, index) => `
JOB ${index + 1}:
- ID: ${job._id}
- Title: ${job.title}
- Company: ${job.company}
- Industry: ${job.industry}
- Type: ${job.jobType}
- Work Mode: ${job.workMode}
- Location: ${job.location}
- Experience Required: ${job.experienceLevel}
- Education Required: ${job.educationLevel}
- Salary: $${job.salaryMin} - $${job.salaryMax}
- Required Skills: ${(job.requiredSkills || []).join(', ')}
- Preferred Skills: ${(job.preferredSkills || []).join(', ')}
- Description: ${job.description.substring(0, 200)}...
`).join('\n')}

MATCHING CRITERIA:
1. Skills Match (30%) - Alignment with required and preferred skills
2. Experience Fit (20%) - Match with experience level requirements
3. Education Alignment (10%) - Educational requirements compatibility
4. Salary Expectations (15%) - Salary range compatibility
5. Location & Work Mode (10%) - Remote/onsite preferences match
6. Job Type & Culture (10%) - Full-time/part-time and company culture fit
7. Career Growth (5%) - Alignment with career progression opportunities

RETURN ONLY THIS JSON FORMAT:
{
    "matchedJobs": [
        {
            "jobId": "job_id_string",
            "matchScore": 85,
            "reasons": ["Reason 1", "Reason 2", "Reason 3"],
            "strengths": ["Strength 1", "Strength 2"],
            "improvements": ["Improvement 1", "Improvement 2"],
            "fitAnalysis": {
                "skills": 90,
                "experience": 85,
                "education": 75,
                "salary": 80,
                "location": 95,
                "culture": 70
            },
            "recommendation": "Highly recommended - excellent overall match"
        }
    ]
}

RULES:
- Only include jobs with matchScore >= 60
- matchScore should be between 60-95
- Provide specific, actionable reasons
- Return only valid JSON, no other text
- Maximum 10 matched jobs
`;
}

// Enhanced fallback matching function (same as before)
function getEnhancedBasicMatchedJobs(userData, jobs) {
    console.log('Using enhanced basic matching algorithm');
    const matchedJobs = [];

    // Limit to first 50 jobs for performance
    const limitedJobs = jobs.slice(0, 50);

    limitedJobs.forEach(job => {
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
        const userSkills = (userData.skills || []).map(skill => skill.toLowerCase());
        const jobSkills = [...(job.requiredSkills || []), ...(job.preferredSkills || [])].map(skill => skill.toLowerCase());
        const jobText = (job.title + ' ' + job.description + ' ' + (job.tags || []).join(' ')).toLowerCase();
        
        let skillMatches = 0;
        userSkills.forEach(skill => {
            if (jobSkills.includes(skill) || jobText.includes(skill)) {
                skillMatches++;
            }
        });

        const skillScore = userSkills.length > 0 ? (skillMatches / userSkills.length) * 100 : 50;
        fitAnalysis.skills = Math.round(skillScore);
        totalScore += skillScore * 0.3;

        if (skillMatches > 0) {
            reasons.push(`${skillMatches} out of ${userSkills.length} skills matched`);
        }

        // 2. Experience Matching (20%)
        const experienceOrder = ['entry', 'mid', 'senior', 'executive'];
        const userExpIndex = experienceOrder.indexOf(userData.yearsOfExperience);
        const jobExpIndex = experienceOrder.indexOf(job.experienceLevel);
        
        let expScore = 0;
        if (userExpIndex >= jobExpIndex) {
            expScore = 100;
            reasons.push('Experience level meets requirements');
        } else if (userExpIndex >= jobExpIndex - 1) {
            expScore = 70;
            reasons.push('Experience level slightly below but acceptable');
        } else {
            expScore = 30;
            improvements.push('Gain more experience in this field');
        }
        fitAnalysis.experience = expScore;
        totalScore += expScore * 0.2;

        // 3. Education Matching (10%)
        const educationOrder = ['high-school', 'associate', 'bachelor', 'master', 'doctorate'];
        const userEduIndex = educationOrder.indexOf(userData.education);
        const jobEduIndex = educationOrder.indexOf(job.educationLevel);
        
        let eduScore = userEduIndex >= jobEduIndex ? 100 : 50;
        fitAnalysis.education = eduScore;
        totalScore += eduScore * 0.1;

        // 4. Salary Matching (15%)
        const userExpectedSalary = parseInt(userData.expectedSalary) || 0;
        const jobAvgSalary = (job.salaryMin + job.salaryMax) / 2;
        
        let salaryScore = 0;
        if (userExpectedSalary <= job.salaryMax && userExpectedSalary >= job.salaryMin) {
            salaryScore = 100;
            reasons.push('Salary expectations perfectly matched');
        } else if (userExpectedSalary <= job.salaryMax * 1.2) {
            salaryScore = 80;
            reasons.push('Salary slightly above but negotiable');
        } else if (userExpectedSalary >= job.salaryMin * 0.8) {
            salaryScore = 70;
            reasons.push('Salary below expectations but acceptable');
        } else {
            salaryScore = 40;
        }
        fitAnalysis.salary = salaryScore;
        totalScore += salaryScore * 0.15;

        // 5. Location & Work Mode (10%)
        let locationScore = 0;
        if (userData.preferredLocation === 'remote' && job.workMode === 'remote') {
            locationScore = 100;
            reasons.push('Remote work preference matched');
        } else if (job.workMode === 'remote' || job.workMode === 'hybrid') {
            locationScore = 80;
            reasons.push('Flexible work arrangement available');
        } else if (userData.preferredLocation && job.location.toLowerCase().includes(userData.preferredLocation.toLowerCase())) {
            locationScore = 90;
            reasons.push('Location preference matched');
        } else {
            locationScore = 50;
        }
        fitAnalysis.location = locationScore;
        totalScore += locationScore * 0.1;

        // 6. Job Type & Culture (10%)
        let cultureScore = 0;
        if (userData.preferredJobType === job.jobType) {
            cultureScore = 100;
            reasons.push('Job type preference matched');
        } else if (job.jobType.includes('full-time') && userData.preferredJobType.includes('full-time')) {
            cultureScore = 80;
        } else {
            cultureScore = 60;
        }
        fitAnalysis.culture = cultureScore;
        totalScore += cultureScore * 0.1;

        // 7. Career Growth (5%)
        const growthScore = 75;
        totalScore += growthScore * 0.05;

        const finalScore = Math.min(Math.round(totalScore), 95);

        if (finalScore >= 60) {
            // Generate strengths based on high scoring areas
            if (fitAnalysis.skills >= 80) {
                strengths.push('Strong technical skills alignment');
            }
            if (fitAnalysis.experience >= 80) {
                strengths.push('Relevant experience for this role');
            }
            if (fitAnalysis.salary >= 80) {
                strengths.push('Good salary compatibility');
            }

            matchedJobs.push({
                jobId: job._id.toString(),
                matchScore: finalScore,
                reasons,
                strengths: strengths.length > 0 ? strengths : ['Good overall profile match'],
                improvements: improvements.length > 0 ? improvements : ['Continue building relevant experience'],
                fitAnalysis,
                recommendation: finalScore >= 80 ? 'Highly recommended' : 
                              finalScore >= 70 ? 'Good match' : 'Moderate match'
            });
        }
    });

    // Sort by match score descending and limit to 10
    return matchedJobs.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
};