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

    // Create new job
    router.post('/', async (req, res) => {
        try {
            const { 
                title, 
                description, 
                salaryMin, 
                salaryMax, 
                image, 
                userId, 
                userName 
            } = req.body;

            const newJob = {
                title,
                description,
                salaryMin: parseInt(salaryMin),
                salaryMax: parseInt(salaryMax),
                image: image || '',
                userId,
                userName,
                status: 'active',
                applications: 0,
                views: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Validate salary range
            if (newJob.salaryMin > newJob.salaryMax) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum salary cannot be greater than maximum salary'
                });
            }

            const result = await jobsCollection.insertOne(newJob);

            res.status(201).json({
                success: true,
                message: 'Job posted successfully',
                data: { _id: result.insertedId, ...newJob }
            });
        } catch (error) {
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
                image 
            } = req.body;

            const updateData = {
                $set: {
                    title,
                    description,
                    salaryMin: parseInt(salaryMin),
                    salaryMax: parseInt(salaryMax),
                    image: image || '',
                    updatedAt: new Date()
                }
            };

            // Validate salary range
            if (updateData.$set.salaryMin > updateData.$set.salaryMax) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum salary cannot be greater than maximum salary'
                });
            }

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
                    { description: { $regex: search, $options: 'i' } }
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
            res.status(500).json({
                success: false,
                message: 'Error fetching jobs',
                error: error.message
            });
        }
    });

    return router;
};