const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/admin');
const { getTask, listAvailableTasks } = require('../services/aiTaskRegistry');
const { generateAnalysis } = require('../services/geminiService');
const AITaskLog = require('../models/AITaskLog');

/**
 * @route   GET /api/admin/ai/tasks
 * @desc    Get all available AI assistant roles & tasks
 * @access  Private/Admin
 */
router.get('/tasks', protect, admin, (req, res) => {
  try {
    const tasks = listAvailableTasks();
    res.json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    console.error('❌ [AI Admin] Error listing tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách tác vụ AI',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/admin/ai/tasks/:taskId/run
 * @desc    Execute an AI Operations task
 * @access  Private/Admin
 */
router.post('/tasks/:taskId/run', protect, admin, async (req, res) => {
  const startTime = Date.now();
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    return res.status(400).json({
      success: false,
      message: `Tác vụ '${taskId}' không tồn tại trong danh mục cho phép.`
    });
  }

  const params = req.body || {};
  let computedData = null;

  try {
    console.log(`🤖 [AI Operations Center] Admin '${req.user?.name || req.user?._id}' triggered task '${taskId}'`);

    // 1. Fetch & compute exact ground truth metrics in Node.js
    computedData = await task.fetchAndComputeData(params);

    // 2. Format grounded prompt
    const prompt = task.formatPrompt(computedData);

    // 3. Call Gemini AI with system instruction and timeout protection
    const analysis = await generateAnalysis({
      systemInstruction: task.systemInstruction,
      prompt
    });

    const executionTimeMs = Date.now() - startTime;

    // 4. Save audit log to database
    let logDoc = null;
    try {
      logDoc = await AITaskLog.create({
        taskId,
        taskName: task.title,
        adminUser: req.user?._id,
        adminName: req.user?.name || 'Administrator',
        params,
        status: 'success',
        executionTimeMs,
        metrics: computedData.metrics,
        analysis
      });
    } catch (logErr) {
      console.warn('⚠️ [AI Operations] Failed to write task log:', logErr.message);
    }

    // 5. Return structured, verified response
    return res.json({
      success: true,
      taskId,
      title: task.title,
      role: task.role,
      period: computedData.period || null,
      executionTimeMs,
      executedAt: new Date().toISOString(),
      metrics: computedData.metrics,
      analysis,
      logId: logDoc?._id || null
    });
  } catch (err) {
    const executionTimeMs = Date.now() - startTime;
    console.error(`❌ [AI Operations] Error executing task '${taskId}':`, err.message);

    // Save failure log if possible
    try {
      await AITaskLog.create({
        taskId,
        taskName: task.title,
        adminUser: req.user?._id,
        adminName: req.user?.name || 'Administrator',
        params,
        status: 'failed',
        executionTimeMs,
        metrics: computedData?.metrics || {},
        errorMessage: err.message
      });
    } catch (saveErr) {}

    // Return safe user error, providing computed metrics if they were already computed before AI call failed
    return res.status(500).json({
      success: false,
      message: err.message || 'Lỗi khi thực thi tác vụ AI',
      metrics: computedData?.metrics || null,
      executionTimeMs
    });
  }
});

/**
 * @route   GET /api/admin/ai/history
 * @desc    Get execution history of AI tasks
 * @access  Private/Admin
 */
router.get('/history', protect, admin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 15, 50);
    const logs = await AITaskLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v')
      .lean();

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('❌ [AI Admin] Error fetching history:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy lịch sử tác vụ AI',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/admin/ai/history/:id
 * @desc    Get a single AI task result by ID
 * @access  Private/Admin
 */
router.get('/history/:id', protect, admin, async (req, res) => {
  try {
    const log = await AITaskLog.findById(req.params.id).lean();
    if (!log) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi lịch sử' });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
});

module.exports = router;

