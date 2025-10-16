const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

module.exports = (db) => {
    const jobsCollection = db.collection("jobs");

    // Get all jobs for a user
    router.get('/user/:userId', async (req, res) => {
        try {
            const jobs = await jobsCollection
                .find({ userId: req.params.userId })
                .sort({ createdAt: -1 })
                .toArray();

            res.json({
                success: true,
                data: jobs
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching jobs',
                error: error.message
            });
        }
    });

    // Get single job by ID
    router.get('/:id', async (req, res) => {
        try {
            const job = await jobsCollection.findOne({
                _id: new ObjectId(req.params.id)
            });

            if (!job) {
                return res.status(404).json({
                    success: false,
                    message: 'Job not found'
                });
            }

            res.json({
                success: true,
                data: job
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching job',
                error: error.message
            });
        }
    });

    // Create new job with AI-friendly fields
    router.post('/', async (req, res) => {
        try {
            const { 
                title, 
                description, 
                salaryMin, 
                salaryMax,
                company,
                image,
                userId, 
                userName,
                // AI matching fields
                jobType = 'full-time',
                location = '',
                workMode = 'remote',
                experienceLevel = 'mid',
                educationLevel = 'bachelor',
                requiredSkills = [],
                preferredSkills = [],
                responsibilities = '',
                benefits = '',
                industry = 'technology',
                tags = []
            } = req.body;

            // Validation
            if (!company || !title || !description) {
                return res.status(400).json({
                    success: false,
                    message: 'Company, title, and description are required'
                });
            }

            if (parseInt(salaryMin) > parseInt(salaryMax)) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum salary cannot be greater than maximum salary'
                });
            }

            const newJob = {
                title: title.trim(),
                description: description.trim(),
                salaryMin: parseInt(salaryMin),
                salaryMax: parseInt(salaryMax),
                image: image || '',
                company: company.trim(),
                userId,
                userName: userName || 'Unknown User',
                // AI matching fields
                jobType,
                location,
                workMode,
                experienceLevel,
                educationLevel,
                requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [requiredSkills],
                preferredSkills: Array.isArray(preferredSkills) ? preferredSkills : [preferredSkills],
                responsibilities,
                benefits,
                industry,
                tags: Array.isArray(tags) ? tags : [tags],
                // AI metadata
                aiCompatible: true,
                lastMatched: null,
                matchScore: 0,
                // Original fields
                status: 'active',
                applications: 0,
                views: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await jobsCollection.insertOne(newJob);

            // Get the inserted job with ID
            const insertedJob = await jobsCollection.findOne({ _id: result.insertedId });

            res.status(201).json({
                success: true,
                message: 'Job posted successfully',
                data: insertedJob
            });
        } catch (error) {
            console.error('Error creating job:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating job',
                error: error.message
            });
        }
    });

    // Update job
    router.put('/:id', async (req, res) => {
        try {
            const { 
                title, 
                description, 
                salaryMin, 
                salaryMax,
                company,
                image,
                jobType,
                location,
                workMode,
                experienceLevel,
                educationLevel,
                requiredSkills,
                preferredSkills,
                responsibilities,
                benefits,
                industry,
                tags
            } = req.body;

            // Validate salary range
            if (parseInt(salaryMin) > parseInt(salaryMax)) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum salary cannot be greater than maximum salary'
                });
            }

            const updateData = {
                $set: {
                    title: title.trim(),
                    description: description.trim(),
                    salaryMin: parseInt(salaryMin),
                    salaryMax: parseInt(salaryMax),
                    company: company.trim(),
                    image: image || '',
                    // AI matching fields
                    jobType,
                    location,
                    workMode,
                    experienceLevel,
                    educationLevel,
                    requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [requiredSkills],
                    preferredSkills: Array.isArray(preferredSkills) ? preferredSkills : [preferredSkills],
                    responsibilities,
                    benefits,
                    industry,
                    tags: Array.isArray(tags) ? tags : [tags],
                    // Update timestamp
                    updatedAt: new Date()
                }
            };

            const result = await jobsCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                updateData
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Job not found'
                });
            }

            const updatedJob = await jobsCollection.findOne({
                _id: new ObjectId(req.params.id)
            });

            res.json({
                success: true,
                message: 'Job updated successfully',
                data: updatedJob
            });
        } catch (error) {
            console.error('Error updating job:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating job',
                error: error.message
            });
        }
    });

    // Delete job
    router.delete('/:id', async (req, res) => {
        try {
            const result = await jobsCollection.deleteOne({
                _id: new ObjectId(req.params.id)
            });

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Job not found'
                });
            }

            res.json({
                success: true,
                message: 'Job deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting job:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting job',
                error: error.message
            });
        }
    });

    // Get all jobs (public endpoint)
    router.get('/', async (req, res) => {
        try {
            const { page = 1, limit = 10, search } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const filter = { status: 'active' };
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { company: { $regex: search, $options: 'i' } }
                ];
            }

            const jobs = await jobsCollection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .toArray();

            const total = await jobsCollection.countDocuments(filter);

            res.json({
                success: true,
                data: jobs,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(total / parseInt(limit)),
                    totalJobs: total
                }
            });
        } catch (error) {
            console.error('Error fetching jobs:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching jobs',
                error: error.message
            });
        }
    });

    return router;
};