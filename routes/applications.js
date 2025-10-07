// routes/applications.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

module.exports = (db) => {
    const applicationsCollection = db.collection("applications");
    const jobsCollection = db.collection("jobs");

    // Apply for a job
    router.post('/', async (req, res) => {
        try {
            const {
                jobId,
                userId,
                userEmail,
                userName,
                jobTitle,
                company,
                status = 'pending'
            } = req.body;

            console.log("📝 New job application received:", {
                jobId,
                userEmail,
                jobTitle
            });

            // Validate required fields
            if (!jobId || !userId || !userEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: jobId, userId, userEmail'
                });
            }

            // Check if user already applied for this job
            const existingApplication = await applicationsCollection.findOne({
                jobId: jobId,
                userId: userId
            });

            if (existingApplication) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already applied for this job'
                });
            }

            // Create application record
            const applicationData = {
                jobId,
                userId,
                userEmail,
                userName: userName || userEmail,
                jobTitle,
                company,
                status,
                appliedAt: new Date(),
                updatedAt: new Date()
            };

            // Insert application
            const result = await applicationsCollection.insertOne(applicationData);

            // Update job applications count
            await jobsCollection.updateOne(
                { _id: new ObjectId(jobId) },
                { 
                    $inc: { applications: 1 },
                    $set: { updatedAt: new Date() }
                }
            );

            console.log("✅ Job application saved successfully:", {
                applicationId: result.insertedId,
                jobId,
                userEmail
            });

            res.status(201).json({
                success: true,
                message: 'Application submitted successfully',
                data: {
                    _id: result.insertedId,
                    ...applicationData
                }
            });

        } catch (error) {
            console.error('❌ Error submitting application:', error);
            res.status(500).json({
                success: false,
                message: 'Error submitting application',
                error: error.message
            });
        }
    });

    // Get applications by job ID
    router.get('/job/:jobId', async (req, res) => {
        try {
            const { jobId } = req.params;

            const applications = await applicationsCollection
                .find({ jobId })
                .sort({ appliedAt: -1 })
                .toArray();

            res.json({
                success: true,
                data: applications,
                total: applications.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching applications',
                error: error.message
            });
        }
    });

    // Get applications by user ID
    router.get('/user/:userId', async (req, res) => {
        try {
            const { userId } = req.params;

            const applications = await applicationsCollection
                .find({ userId })
                .sort({ appliedAt: -1 })
                .toArray();

            res.json({
                success: true,
                data: applications,
                total: applications.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching user applications',
                error: error.message
            });
        }
    });

    // Update application status
    router.patch('/:id/status', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const result = await applicationsCollection.updateOne(
                { _id: new ObjectId(id) },
                { 
                    $set: { 
                        status,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found'
                });
            }

            res.json({
                success: true,
                message: 'Application status updated successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error updating application status',
                error: error.message
            });
        }
    });

    // Get all applications (admin)
    router.get('/', async (req, res) => {
        try {
            const applications = await applicationsCollection
                .find({})
                .sort({ appliedAt: -1 })
                .toArray();

            res.json({
                success: true,
                data: applications,
                total: applications.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching applications',
                error: error.message
            });
        }
    });

    // Delete an application (Admin)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await applicationsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        res.json({
            success: true,
            message: 'Application deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting application:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting application',
            error: error.message
        });
    }
});


    return router;
};