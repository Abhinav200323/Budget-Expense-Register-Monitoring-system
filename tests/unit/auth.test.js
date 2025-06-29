const request = require('supertest');
const express = require('express');
const session = require('express-session');

// Mock the server functions for unit testing
const app = express();
app.use(session({ secret: 'test_secret', resave: false, saveUninitialized: false }));
app.use(express.json());

// Mock middleware functions
function checkAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Authentication required' });
}

function isAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'Admins only' });
}

function isManager(req, res, next) {
  if (['manager', 'admin'].includes(req.session.user?.role)) return next();
  return res.status(403).json({ error: 'Managers only' });
}

// Test routes
app.get('/protected', checkAuth, (req, res) => {
  res.json({ message: 'Protected route accessed' });
});

app.get('/admin-only', isAdmin, (req, res) => {
  res.json({ message: 'Admin route accessed' });
});

app.get('/manager-only', isManager, (req, res) => {
  res.json({ message: 'Manager route accessed' });
});

describe('Authentication Middleware Unit Tests', () => {
  let agent;

  beforeEach(() => {
    agent = request.agent(app);
  });

  describe('checkAuth middleware', () => {
    test('should allow access when user is authenticated', async () => {
      // Set up session with user
      await agent
        .post('/session')
        .send({ user: { username: 'testuser', role: 'user' } });

      const response = await agent.get('/protected');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Protected route accessed');
    });

    test('should deny access when user is not authenticated', async () => {
      const response = await agent.get('/protected');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('isAdmin middleware', () => {
    test('should allow access for admin users', async () => {
      await agent
        .post('/session')
        .send({ user: { username: 'adminuser', role: 'admin' } });

      const response = await agent.get('/admin-only');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Admin route accessed');
    });

    test('should deny access for non-admin users', async () => {
      await agent
        .post('/session')
        .send({ user: { username: 'user1', role: 'user' } });

      const response = await agent.get('/admin-only');
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Admins only');
    });
  });

  describe('isManager middleware', () => {
    test('should allow access for manager users', async () => {
      await agent
        .post('/session')
        .send({ user: { username: 'manager1', role: 'manager' } });

      const response = await agent.get('/manager-only');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Manager route accessed');
    });

    test('should allow access for admin users (managers can access manager routes)', async () => {
      await agent
        .post('/session')
        .send({ user: { username: 'adminuser', role: 'admin' } });

      const response = await agent.get('/manager-only');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Manager route accessed');
    });

    test('should deny access for regular users', async () => {
      await agent
        .post('/session')
        .send({ user: { username: 'user1', role: 'user' } });

      const response = await agent.get('/manager-only');
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Managers only');
    });
  });
});

// Helper route to set session for testing
app.post('/session', (req, res) => {
  req.session.user = req.body.user;
  res.json({ success: true });
}); 