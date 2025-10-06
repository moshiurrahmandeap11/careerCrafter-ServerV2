const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

module.exports = (db) => {
    const learnCollection = db.collection("learn");
    const userProgressCollection = db.collection("user_progress");
    const chatHistoryCollection = db.collection("chat_history");

    // ==================== Learning Paths ====================
    
    // Get all learning paths
    router.get('/paths', async (req, res) => {
        try {
            const paths = await learnCollection.find({ type: 'path' }).toArray();
            res.json({
                success: true,
                data: paths
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching learning paths',
                error: error.message
            });
        }
    });

    // Get single learning path by ID
    router.get('/paths/:id', async (req, res) => {
        try {
            const path = await learnCollection.findOne({
                _id: new ObjectId(req.params.id),
                type: 'path'
            });
            
            if (!path) {
                return res.status(404).json({
                    success: false,
                    message: 'Learning path not found'
                });
            }

            res.json({
                success: true,
                data: path
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching learning path',
                error: error.message
            });
        }
    });

    // Create new learning path (Admin)
    router.post('/paths', async (req, res) => {
        try {
            const { title, description, courses, category, difficulty, estimatedTime } = req.body;

            const newPath = {
                type: 'path',
                title,
                description,
                courses: courses || [],
                category,
                difficulty: difficulty || 'beginner',
                estimatedTime: estimatedTime || '4 weeks',
                enrolled: 0,
                rating: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await learnCollection.insertOne(newPath);

            res.status(201).json({
                success: true,
                message: 'Learning path created successfully',
                data: { _id: result.insertedId, ...newPath }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error creating learning path',
                error: error.message
            });
        }
    });

    // ==================== Courses ====================

    // Get all courses
    router.get('/courses', async (req, res) => {
        try {
            const { category, difficulty, search } = req.query;
            const filter = { type: 'course' };

            if (category) filter.category = category;
            if (difficulty) filter.difficulty = difficulty;
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const courses = await learnCollection.find(filter).toArray();

            res.json({
                success: true,
                data: courses
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching courses',
                error: error.message
            });
        }
    });

    // Get single course by ID
    router.get('/courses/:id', async (req, res) => {
        try {
            const course = await learnCollection.findOne({
                _id: new ObjectId(req.params.id),
                type: 'course'
            });

            if (!course) {
                return res.status(404).json({
                    success: false,
                    message: 'Course not found'
                });
            }

            res.json({
                success: true,
                data: course
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching course',
                error: error.message
            });
        }
    });

    // Create new course
    router.post('/courses', async (req, res) => {
        try {
            const { 
                title, 
                description, 
                category, 
                difficulty, 
                duration, 
                modules,
                instructor 
            } = req.body;

            const newCourse = {
                type: 'course',
                title,
                description,
                category,
                difficulty: difficulty || 'beginner',
                duration: duration || '2 hours',
                modules: modules || [],
                instructor: instructor || 'AI Mentor',
                enrolled: 0,
                rating: 0,
                reviews: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await learnCollection.insertOne(newCourse);

            res.status(201).json({
                success: true,
                message: 'Course created successfully',
                data: { _id: result.insertedId, ...newCourse }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error creating course',
                error: error.message
            });
        }
    });

    // ==================== User Progress ====================

    // Get user's learning progress
    router.get('/progress/:userId', async (req, res) => {
        try {
            const progress = await userProgressCollection
                .find({ userId: req.params.userId })
                .toArray();

            res.json({
                success: true,
                data: progress
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching user progress',
                error: error.message
            });
        }
    });

    // Update user progress
    router.post('/progress', async (req, res) => {
        try {
            const { 
                userId, 
                courseId, 
                moduleId, 
                completed, 
                timeSpent, 
                score 
            } = req.body;

            const existingProgress = await userProgressCollection.findOne({
                userId,
                courseId
            });

            if (existingProgress) {
                // Update existing progress
                const updateData = {
                    $set: {
                        lastAccessedAt: new Date(),
                        updatedAt: new Date()
                    },
                    $inc: {
                        totalTimeSpent: timeSpent || 0
                    }
                };

                if (moduleId && completed) {
                    updateData.$addToSet = {
                        completedModules: moduleId
                    };
                }

                if (score !== undefined) {
                    updateData.$set.score = score;
                }

                await userProgressCollection.updateOne(
                    { userId, courseId },
                    updateData
                );

                const updated = await userProgressCollection.findOne({ userId, courseId });

                res.json({
                    success: true,
                    message: 'Progress updated successfully',
                    data: updated
                });
            } else {
                // Create new progress entry
                const newProgress = {
                    userId,
                    courseId,
                    completedModules: moduleId && completed ? [moduleId] : [],
                    totalTimeSpent: timeSpent || 0,
                    score: score || 0,
                    startedAt: new Date(),
                    lastAccessedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const result = await userProgressCollection.insertOne(newProgress);

                res.status(201).json({
                    success: true,
                    message: 'Progress created successfully',
                    data: { _id: result.insertedId, ...newProgress }
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error updating progress',
                error: error.message
            });
        }
    });

    // Enroll in a course/path
    router.post('/enroll', async (req, res) => {
        try {
            const { userId, itemId, itemType } = req.body;

            // Check if already enrolled
            const existing = await userProgressCollection.findOne({
                userId,
                courseId: itemId
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'Already enrolled in this course'
                });
            }

            // Create enrollment
            const enrollment = {
                userId,
                courseId: itemId,
                itemType: itemType || 'course',
                completedModules: [],
                totalTimeSpent: 0,
                score: 0,
                startedAt: new Date(),
                lastAccessedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await userProgressCollection.insertOne(enrollment);

            // Increment enrolled count
            await learnCollection.updateOne(
                { _id: new ObjectId(itemId) },
                { $inc: { enrolled: 1 } }
            );

            res.status(201).json({
                success: true,
                message: 'Enrolled successfully',
                data: enrollment
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error enrolling in course',
                error: error.message
            });
        }
    });

    // ==================== AI Chat History ====================

    // Get user's chat history
    router.get('/chat/:userId', async (req, res) => {
        try {
            const { limit = 50 } = req.query;

            const chatHistory = await chatHistoryCollection
                .find({ userId: req.params.userId })
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .toArray();

            res.json({
                success: true,
                data: chatHistory.reverse()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching chat history',
                error: error.message
            });
        }
    });

    // Save chat message
    router.post('/chat', async (req, res) => {
        try {
            const { userId, role, content, topic } = req.body;

            const message = {
                userId,
                role,
                content,
                topic: topic || null,
                createdAt: new Date()
            };

            const result = await chatHistoryCollection.insertOne(message);

            res.status(201).json({
                success: true,
                message: 'Chat saved successfully',
                data: { _id: result.insertedId, ...message }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error saving chat',
                error: error.message
            });
        }
    });

    // Delete chat history
    router.delete('/chat/:userId', async (req, res) => {
        try {
            await chatHistoryCollection.deleteMany({ 
                userId: req.params.userId 
            });

            res.json({
                success: true,
                message: 'Chat history cleared successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error deleting chat history',
                error: error.message
            });
        }
    });

    // ==================== Stats & Analytics ====================

    // Get learning statistics
    router.get('/stats/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;

            const totalEnrolled = await userProgressCollection.countDocuments({ userId });
            
            const progressData = await userProgressCollection
                .find({ userId })
                .toArray();

            const totalCompleted = progressData.filter(p => 
                p.completedModules && p.completedModules.length > 0
            ).length;

            const totalTimeSpent = progressData.reduce((sum, p) => 
                sum + (p.totalTimeSpent || 0), 0
            );

            const avgScore = progressData.length > 0
                ? progressData.reduce((sum, p) => sum + (p.score || 0), 0) / progressData.length
                : 0;

            res.json({
                success: true,
                data: {
                    totalEnrolled,
                    totalCompleted,
                    totalTimeSpent,
                    averageScore: Math.round(avgScore),
                    progressData
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching statistics',
                error: error.message
            });
        }
    });

    // Get platform-wide statistics
    router.get('/stats/platform/overview', async (req, res) => {
        try {
            const totalCourses = await learnCollection.countDocuments({ type: 'course' });
            const totalPaths = await learnCollection.countDocuments({ type: 'path' });
            const totalUsers = await userProgressCollection.distinct('userId');
            const totalEnrollments = await userProgressCollection.countDocuments();

            res.json({
                success: true,
                data: {
                    totalCourses,
                    totalPaths,
                    activeUsers: totalUsers.length,
                    totalEnrollments
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching platform statistics',
                error: error.message
            });
        }
    });

    // ==================== Recommendations ====================

    // Get personalized recommendations
    router.get('/recommendations/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;

            // Get user's progress
            const userProgress = await userProgressCollection
                .find({ userId })
                .toArray();

            const enrolledCourseIds = userProgress.map(p => p.courseId);

            // Get courses user hasn't enrolled in
            const recommendations = await learnCollection
                .find({
                    type: 'course',
                    _id: { $nin: enrolledCourseIds.map(id => new ObjectId(id)) }
                })
                .sort({ enrolled: -1, rating: -1 })
                .limit(6)
                .toArray();

            res.json({
                success: true,
                data: recommendations
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching recommendations',
                error: error.message
            });
        }
    });

    return router;
};