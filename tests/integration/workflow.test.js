const request = require('supertest');
const express = require('express');
const session = require('express-session');

// Mock the complete server for integration testing
const app = express();
app.use(session({ secret: 'test_secret', resave: false, saveUninitialized: false }));
app.use(express.json());

// Mock database state
let projects = [];
let tasks = [];
let workElements = [];
let budgets = [];
let budgetChanges = [];
let productionData = [];

// Mock database functions
const mockPool = {
  query: jest.fn()
};

// Helper functions
function createProject(name, description, submittedBy) {
  const project = {
    id: projects.length + 1,
    name,
    description,
    submitted_by: submittedBy,
    status: 'pending',
    submitted_at: new Date().toISOString()
  };
  projects.push(project);
  return project;
}

function createTask(projectId, name) {
  const task = {
    id: tasks.length + 1,
    project_id: projectId,
    name,
    created_at: new Date().toISOString()
  };
  tasks.push(task);
  return task;
}

function createWorkElement(taskId, name) {
  const workElement = {
    id: workElements.length + 1,
    task_id: taskId,
    name,
    created_at: new Date().toISOString()
  };
  workElements.push(workElement);
  return workElement;
}

function createBudget(workElementId, amount, submittedBy) {
  const budget = {
    id: budgets.length + 1,
    work_element_id: workElementId,
    amount,
    submitted_by: submittedBy,
    status: 'pending',
    submitted_at: new Date().toISOString()
  };
  budgets.push(budget);
  return budget;
}

function approveProject(projectId, approvedBy) {
  const project = projects.find(p => p.id === projectId);
  if (project) {
    project.status = 'approved';
    project.approved_by = approvedBy;
    project.approved_at = new Date().toISOString();
  }
}

function approveBudget(budgetId, approvedBy) {
  const budget = budgets.find(b => b.id === budgetId);
  if (budget) {
    budget.status = 'approved';
    budget.approved_by = approvedBy;
    budget.approved_at = new Date().toISOString();
  }
}

function createBudgetChange(bcrNumber, sourceBudgetId, destinationWorkElementId, transferAmount, submittedBy) {
  const budgetChange = {
    id: budgetChanges.length + 1,
    bcr_number: bcrNumber,
    source_budget_id: sourceBudgetId,
    destination_work_element_id: destinationWorkElementId,
    transfer_amount: transferAmount,
    submitted_by: submittedBy,
    status: 'pending',
    submitted_at: new Date().toISOString()
  };
  budgetChanges.push(budgetChange);
  return budgetChange;
}

function approveBudgetChange(changeId, approvedBy) {
  const change = budgetChanges.find(c => c.id === changeId);
  if (change) {
    change.status = 'approved';
    change.approved_by = approvedBy;
    change.approved_at = new Date().toISOString();
    
    // Update budgets
    const sourceBudget = budgets.find(b => b.id === change.source_budget_id);
    if (sourceBudget) {
      sourceBudget.amount -= change.transfer_amount;
    }
    
    const destBudget = budgets.find(b => b.work_element_id === change.destination_work_element_id);
    if (destBudget) {
      destBudget.amount += change.transfer_amount;
    }
  }
}

// Test routes
app.post('/test/login', (req, res) => {
  const { username, password } = req.body;
  let user = null;
  
  if (username === 'user1' && password === 'password123') {
    user = { username: 'user1', role: 'user' };
  } else if (username === 'manager1' && password === 'password123') {
    user = { username: 'manager1', role: 'manager' };
  } else if (username === 'adminuser' && password === 'admin123') {
    user = { username: 'adminuser', role: 'admin' };
  }
  
  if (user) {
    req.session.user = user;
    res.json({ success: true, user });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/test/create-project', (req, res) => {
  const { name, description } = req.body;
  const project = createProject(name, description, req.session.user.username);
  res.json(project);
});

app.post('/test/create-task', (req, res) => {
  const { projectId, name } = req.body;
  const task = createTask(projectId, name);
  res.json(task);
});

app.post('/test/create-work-element', (req, res) => {
  const { taskId, name } = req.body;
  const workElement = createWorkElement(taskId, name);
  res.json(workElement);
});

app.post('/test/create-budget', (req, res) => {
  const { workElementId, amount } = req.body;
  const budget = createBudget(workElementId, amount, req.session.user.username);
  res.json(budget);
});

app.get('/test/pending-projects', (req, res) => {
  const pending = projects.filter(p => p.status === 'pending');
  res.json(pending);
});

app.get('/test/pending-budgets', (req, res) => {
  const pending = budgets.filter(b => b.status === 'pending');
  res.json(pending);
});

app.post('/test/approve-project', (req, res) => {
  const { projectId } = req.body;
  approveProject(projectId, req.session.user.username);
  res.json({ success: true });
});

app.post('/test/approve-budget', (req, res) => {
  const { budgetId } = req.body;
  approveBudget(budgetId, req.session.user.username);
  res.json({ success: true });
});

app.post('/test/submit-budget-change', (req, res) => {
  const { bcrNumber, sourceBudgetId, destinationWorkElementId, transferAmount } = req.body;
  const budgetChange = createBudgetChange(bcrNumber, sourceBudgetId, destinationWorkElementId, transferAmount, req.session.user.username);
  res.json(budgetChange);
});

app.get('/test/pending-budget-changes', (req, res) => {
  const pending = budgetChanges.filter(c => c.status === 'pending');
  res.json(pending);
});

app.post('/test/approve-budget-change', (req, res) => {
  const { changeId } = req.body;
  approveBudgetChange(changeId, req.session.user.username);
  res.json({ success: true });
});

app.get('/test/approved-budgets', (req, res) => {
  const approved = budgets.filter(b => b.status === 'approved');
  res.json(approved);
});

describe('BER Project Integration Tests - Complete Workflow', () => {
  let userAgent, managerAgent, adminAgent;

  beforeEach(() => {
    // Reset all data
    projects = [];
    tasks = [];
    workElements = [];
    budgets = [];
    budgetChanges = [];
    productionData = [];
    
    userAgent = request.agent(app);
    managerAgent = request.agent(app);
    adminAgent = request.agent(app);
  });

  describe('Part 1: Standard User Workflow', () => {
    test('should allow user to login and create projects', async () => {
      // Login as user
      const loginResponse = await userAgent
        .post('/test/login')
        .send({ username: 'user1', password: 'password123' });
      
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user.role).toBe('user');

      // Create Project Alpha
      const projectAlphaResponse = await userAgent
        .post('/test/create-project')
        .send({ name: 'Project Alpha', description: 'Test project for Alpha' });
      
      expect(projectAlphaResponse.status).toBe(200);
      expect(projectAlphaResponse.body.name).toBe('Project Alpha');
      expect(projectAlphaResponse.body.status).toBe('pending');

      // Create Project Beta
      const projectBetaResponse = await userAgent
        .post('/test/create-project')
        .send({ name: 'Project Beta', description: 'Test project for Beta' });
      
      expect(projectBetaResponse.status).toBe(200);
      expect(projectBetaResponse.body.name).toBe('Project Beta');
    });

    test('should allow user to create tasks and work elements', async () => {
      // Setup: Login and create project
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const projectResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project' 
      });

      // Create Task A1
      const taskResponse = await userAgent
        .post('/test/create-task')
        .send({ projectId: projectResponse.body.id, name: 'Task A1' });
      
      expect(taskResponse.status).toBe(200);
      expect(taskResponse.body.name).toBe('Task A1');

      // Create Work Element WE-A1.1
      const workElementResponse = await userAgent
        .post('/test/create-work-element')
        .send({ taskId: taskResponse.body.id, name: 'WE-A1.1' });
      
      expect(workElementResponse.status).toBe(200);
      expect(workElementResponse.body.name).toBe('WE-A1.1');
    });

    test('should allow user to submit budgets', async () => {
      // Setup: Login, create project, task, and work element
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const projectResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project' 
      });
      const taskResponse = await userAgent.post('/test/create-task').send({ 
        projectId: projectResponse.body.id, 
        name: 'Task A1' 
      });
      const workElementResponse = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskResponse.body.id, 
        name: 'WE-A1.1' 
      });

      // Submit budget of $10,000
      const budgetResponse = await userAgent
        .post('/test/create-budget')
        .send({ workElementId: workElementResponse.body.id, amount: 10000 });
      
      expect(budgetResponse.status).toBe(200);
      expect(budgetResponse.body.amount).toBe(10000);
      expect(budgetResponse.body.status).toBe('pending');
    });
  });

  describe('Part 2: Manager Workflow', () => {
    test('should allow manager to view pending requests', async () => {
      // Setup: Create pending projects and budgets as user
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      await userAgent.post('/test/create-project').send({ name: 'Project Alpha', description: 'Test' });
      await userAgent.post('/test/create-project').send({ name: 'Project Beta', description: 'Test' });

      // Login as manager
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });

      // View pending projects
      const pendingProjectsResponse = await managerAgent.get('/test/pending-projects');
      expect(pendingProjectsResponse.status).toBe(200);
      expect(pendingProjectsResponse.body).toHaveLength(2);
    });

    test('should allow manager to approve projects and budgets', async () => {
      // Setup: Create project and budget as user
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const projectResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project' 
      });
      const taskResponse = await userAgent.post('/test/create-task').send({ 
        projectId: projectResponse.body.id, 
        name: 'Task A1' 
      });
      const workElementResponse = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskResponse.body.id, 
        name: 'WE-A1.1' 
      });
      const budgetResponse = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementResponse.body.id, 
        amount: 10000 
      });

      // Login as manager and approve
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      
      const approveProjectResponse = await managerAgent
        .post('/test/approve-project')
        .send({ projectId: projectResponse.body.id });
      expect(approveProjectResponse.status).toBe(200);

      const approveBudgetResponse = await managerAgent
        .post('/test/approve-budget')
        .send({ budgetId: budgetResponse.body.id });
      expect(approveBudgetResponse.status).toBe(200);
    });
  });

  describe('Part 3: Budget Change Request Workflow', () => {
    test('should allow user to submit budget change request', async () => {
      // Setup: Create approved projects and budgets
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      
      // Create Project Alpha with $10,000 budget
      const projectAlphaResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project' 
      });
      const taskA1Response = await userAgent.post('/test/create-task').send({ 
        projectId: projectAlphaResponse.body.id, 
        name: 'Task A1' 
      });
      const workElementA1Response = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskA1Response.body.id, 
        name: 'WE-A1.1' 
      });
      const budgetAlphaResponse = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementA1Response.body.id, 
        amount: 10000 
      });

      // Create Project Beta with $5,000 budget
      const projectBetaResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Beta', 
        description: 'Test project' 
      });
      const taskB1Response = await userAgent.post('/test/create-task').send({ 
        projectId: projectBetaResponse.body.id, 
        name: 'Task B1' 
      });
      const workElementB1Response = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskB1Response.body.id, 
        name: 'WE-B1.1' 
      });
      const budgetBetaResponse = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementB1Response.body.id, 
        amount: 5000 
      });

      // Approve projects and budgets as manager
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      await managerAgent.post('/test/approve-project').send({ projectId: projectAlphaResponse.body.id });
      await managerAgent.post('/test/approve-project').send({ projectId: projectBetaResponse.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetAlphaResponse.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetBetaResponse.body.id });

      // Submit BCR as user
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const bcrResponse = await userAgent
        .post('/test/submit-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: budgetAlphaResponse.body.id,
          destinationWorkElementId: workElementB1Response.body.id,
          transferAmount: 2000
        });

      expect(bcrResponse.status).toBe(200);
      expect(bcrResponse.body.bcr_number).toBe('BCR-001');
      expect(bcrResponse.body.transfer_amount).toBe(2000);
      expect(bcrResponse.body.status).toBe('pending');
    });

    test('should allow manager to approve budget change request', async () => {
      // Setup: Create and submit BCR
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const projectResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project' 
      });
      const taskResponse = await userAgent.post('/test/create-task').send({ 
        projectId: projectResponse.body.id, 
        name: 'Task A1' 
      });
      const workElementResponse = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskResponse.body.id, 
        name: 'WE-A1.1' 
      });
      const budgetResponse = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementResponse.body.id, 
        amount: 10000 
      });

      // Approve as manager
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      await managerAgent.post('/test/approve-project').send({ projectId: projectResponse.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetResponse.body.id });

      // Submit BCR as user
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const bcrResponse = await userAgent
        .post('/test/submit-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: budgetResponse.body.id,
          destinationWorkElementId: workElementResponse.body.id,
          transferAmount: 2000
        });

      // Approve BCR as manager
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      const approveBcrResponse = await managerAgent
        .post('/test/approve-budget-change')
        .send({ changeId: bcrResponse.body.id });

      expect(approveBcrResponse.status).toBe(200);
    });
  });

  describe('Part 4: Admin Reporting Workflow', () => {
    test('should allow admin to view approved budgets with correct amounts', async () => {
      // Setup: Complete the full workflow
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      
      // Create Project Alpha with $10,000 budget
      const projectAlphaResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project' 
      });
      const taskA1Response = await userAgent.post('/test/create-task').send({ 
        projectId: projectAlphaResponse.body.id, 
        name: 'Task A1' 
      });
      const workElementA1Response = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskA1Response.body.id, 
        name: 'WE-A1.1' 
      });
      const budgetAlphaResponse = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementA1Response.body.id, 
        amount: 10000 
      });

      // Create Project Beta with $5,000 budget
      const projectBetaResponse = await userAgent.post('/test/create-project').send({ 
        name: 'Project Beta', 
        description: 'Test project' 
      });
      const taskB1Response = await userAgent.post('/test/create-task').send({ 
        projectId: projectBetaResponse.body.id, 
        name: 'Task B1' 
      });
      const workElementB1Response = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskB1Response.body.id, 
        name: 'WE-B1.1' 
      });
      const budgetBetaResponse = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementB1Response.body.id, 
        amount: 5000 
      });

      // Approve projects and budgets as manager
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      await managerAgent.post('/test/approve-project').send({ projectId: projectAlphaResponse.body.id });
      await managerAgent.post('/test/approve-project').send({ projectId: projectBetaResponse.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetAlphaResponse.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetBetaResponse.body.id });

      // Submit and approve BCR
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const bcrResponse = await userAgent
        .post('/test/submit-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: budgetAlphaResponse.body.id,
          destinationWorkElementId: workElementB1Response.body.id,
          transferAmount: 2000
        });

      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      await managerAgent.post('/test/approve-budget-change').send({ changeId: bcrResponse.body.id });

      // Login as admin and view approved budgets
      await adminAgent.post('/test/login').send({ username: 'adminuser', password: 'admin123' });
      const approvedBudgetsResponse = await adminAgent.get('/test/approved-budgets');

      expect(approvedBudgetsResponse.status).toBe(200);
      
      // Verify the final amounts after BCR transfer
      const alphaBudget = approvedBudgetsResponse.body.find(b => b.work_element_id === workElementA1Response.body.id);
      const betaBudget = approvedBudgetsResponse.body.find(b => b.work_element_id === workElementB1Response.body.id);
      
      expect(alphaBudget.amount).toBe(8000); // $10,000 - $2,000
      expect(betaBudget.amount).toBe(7000);  // $5,000 + $2,000
    });
  });

  describe('Complete End-to-End Workflow Test', () => {
    test('should complete the full demo workflow successfully', async () => {
      // This test replicates the exact steps from the demo script
      
      // Step 1: User creates projects and submits budgets
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      
      // Create Project Alpha
      const projectAlpha = await userAgent.post('/test/create-project').send({ 
        name: 'Project Alpha', 
        description: 'Test project for Alpha' 
      });
      const taskA1 = await userAgent.post('/test/create-task').send({ 
        projectId: projectAlpha.body.id, 
        name: 'Task A1' 
      });
      const workElementA1 = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskA1.body.id, 
        name: 'WE-A1.1' 
      });
      const budgetAlpha = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementA1.body.id, 
        amount: 10000 
      });

      // Create Project Beta
      const projectBeta = await userAgent.post('/test/create-project').send({ 
        name: 'Project Beta', 
        description: 'Test project for Beta' 
      });
      const taskB1 = await userAgent.post('/test/create-task').send({ 
        projectId: projectBeta.body.id, 
        name: 'Task B1' 
      });
      const workElementB1 = await userAgent.post('/test/create-work-element').send({ 
        taskId: taskB1.body.id, 
        name: 'WE-B1.1' 
      });
      const budgetBeta = await userAgent.post('/test/create-budget').send({ 
        workElementId: workElementB1.body.id, 
        amount: 5000 
      });

      // Step 2: Manager approves projects and budgets
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      await managerAgent.post('/test/approve-project').send({ projectId: projectAlpha.body.id });
      await managerAgent.post('/test/approve-project').send({ projectId: projectBeta.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetAlpha.body.id });
      await managerAgent.post('/test/approve-budget').send({ budgetId: budgetBeta.body.id });

      // Step 3: User submits BCR
      await userAgent.post('/test/login').send({ username: 'user1', password: 'password123' });
      const bcr = await userAgent
        .post('/test/submit-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: budgetAlpha.body.id,
          destinationWorkElementId: workElementB1.body.id,
          transferAmount: 2000
        });

      // Step 4: Manager approves BCR
      await managerAgent.post('/test/login').send({ username: 'manager1', password: 'password123' });
      await managerAgent.post('/test/approve-budget-change').send({ changeId: bcr.body.id });

      // Step 5: Admin verifies final amounts
      await adminAgent.post('/test/login').send({ username: 'adminuser', password: 'admin123' });
      const finalBudgets = await adminAgent.get('/test/approved-budgets');

      // Verify the complete workflow results
      expect(finalBudgets.body).toHaveLength(2);
      
      const alphaFinalBudget = finalBudgets.body.find(b => b.work_element_id === workElementA1.body.id);
      const betaFinalBudget = finalBudgets.body.find(b => b.work_element_id === workElementB1.body.id);
      
      expect(alphaFinalBudget.amount).toBe(8000); // $10,000 - $2,000 transfer
      expect(betaFinalBudget.amount).toBe(7000);  // $5,000 + $2,000 transfer
      
      // Verify all statuses are correct
      expect(alphaFinalBudget.status).toBe('approved');
      expect(betaFinalBudget.status).toBe('approved');
    });
  });
}); 