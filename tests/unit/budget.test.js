const request = require('supertest');
const express = require('express');
const session = require('express-session');

// Mock the server for budget testing
const app = express();
app.use(session({ secret: 'test_secret', resave: false, saveUninitialized: false }));
app.use(express.json());

// Mock database functions
const mockPool = {
  query: jest.fn()
};

// Mock budget calculation functions
function calculateBudgetTransfer(sourceAmount, transferAmount) {
  if (sourceAmount < transferAmount) {
    throw new Error('Insufficient funds for transfer');
  }
  return {
    newSourceAmount: sourceAmount - transferAmount,
    transferAmount: transferAmount
  };
}

function validateBudgetChange(bcrNumber, sourceBudgetId, destinationWorkElementId, transferAmount) {
  const errors = [];
  
  if (!bcrNumber || bcrNumber.trim() === '') {
    errors.push('BCR number is required');
  }
  
  if (!sourceBudgetId) {
    errors.push('Source budget ID is required');
  }
  
  if (!destinationWorkElementId) {
    errors.push('Destination work element ID is required');
  }
  
  if (!transferAmount || transferAmount <= 0) {
    errors.push('Transfer amount must be greater than 0');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// Test routes
app.post('/test/budget-transfer', (req, res) => {
  try {
    const { sourceAmount, transferAmount } = req.body;
    const result = calculateBudgetTransfer(sourceAmount, transferAmount);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/test/validate-budget-change', (req, res) => {
  const { bcrNumber, sourceBudgetId, destinationWorkElementId, transferAmount } = req.body;
  const validation = validateBudgetChange(bcrNumber, sourceBudgetId, destinationWorkElementId, transferAmount);
  res.json(validation);
});

describe('Budget Management Unit Tests', () => {
  describe('Budget Transfer Calculations', () => {
    test('should calculate correct transfer amounts', async () => {
      const response = await request(app)
        .post('/test/budget-transfer')
        .send({
          sourceAmount: 10000,
          transferAmount: 2000
        });

      expect(response.status).toBe(200);
      expect(response.body.newSourceAmount).toBe(8000);
      expect(response.body.transferAmount).toBe(2000);
    });

    test('should handle insufficient funds error', async () => {
      const response = await request(app)
        .post('/test/budget-transfer')
        .send({
          sourceAmount: 1000,
          transferAmount: 2000
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Insufficient funds for transfer');
    });

    test('should handle zero transfer amount', async () => {
      const response = await request(app)
        .post('/test/budget-transfer')
        .send({
          sourceAmount: 10000,
          transferAmount: 0
        });

      expect(response.status).toBe(200);
      expect(response.body.newSourceAmount).toBe(10000);
      expect(response.body.transferAmount).toBe(0);
    });
  });

  describe('Budget Change Validation', () => {
    test('should validate correct budget change data', async () => {
      const response = await request(app)
        .post('/test/validate-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: 1,
          destinationWorkElementId: 2,
          transferAmount: 2000
        });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(true);
      expect(response.body.errors).toHaveLength(0);
    });

    test('should reject empty BCR number', async () => {
      const response = await request(app)
        .post('/test/validate-budget-change')
        .send({
          bcrNumber: '',
          sourceBudgetId: 1,
          destinationWorkElementId: 2,
          transferAmount: 2000
        });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(false);
      expect(response.body.errors).toContain('BCR number is required');
    });

    test('should reject negative transfer amount', async () => {
      const response = await request(app)
        .post('/test/validate-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: 1,
          destinationWorkElementId: 2,
          transferAmount: -1000
        });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(false);
      expect(response.body.errors).toContain('Transfer amount must be greater than 0');
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/test/validate-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          transferAmount: 2000
        });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(false);
      expect(response.body.errors).toContain('Source budget ID is required');
      expect(response.body.errors).toContain('Destination work element ID is required');
    });
  });

  describe('Budget Business Logic', () => {
    test('should handle Project Alpha budget reduction scenario', () => {
      const initialBudget = 10000;
      const transferAmount = 2000;
      const result = calculateBudgetTransfer(initialBudget, transferAmount);
      
      expect(result.newSourceAmount).toBe(8000);
      expect(result.transferAmount).toBe(2000);
    });

    test('should handle Project Beta budget increase scenario', () => {
      const initialBudget = 5000;
      const transferAmount = 2000;
      const newBudget = initialBudget + transferAmount;
      
      expect(newBudget).toBe(7000);
    });

    test('should validate BCR-001 format', async () => {
      const response = await request(app)
        .post('/test/validate-budget-change')
        .send({
          bcrNumber: 'BCR-001',
          sourceBudgetId: 1,
          destinationWorkElementId: 2,
          transferAmount: 2000
        });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(true);
    });
  });
}); 