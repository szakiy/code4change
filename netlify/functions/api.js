const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { GoogleGenAI } = require('@google/genai');

// Initialize PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize Gemini AI Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Standard CORS Headers for Netlify Serverless Functions
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * AI Categorization Helper Function
 */
async function categorizeDescription(description) {
  if (!process.env.GEMINI_API_KEY || !description) return 1;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Categorize this societal challenge into EXACTLY one of these categories: ["General Tech", "Environment & Sustainability", "Healthcare", "Education"]. Output ONLY the exact category name and nothing else.\n\nDescription: ${description}`
    });

    const categoryName = response.text ? response.text.trim() : '';
    const categoryMap = {
      'General Tech': 1,
      'Environment & Sustainability': 2,
      'Healthcare': 3,
      'Education': 4
    };

    return categoryMap[categoryName] || 1;
  } catch (err) {
    console.warn('AI Categorization fallback triggered:', err.message);
    return 1;
  }
}

exports.handler = async (event) => {
  // 1. Handle CORS Preflight OPTIONS Request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { httpMethod } = event;
  // Normalize path: remove trailing slashes for reliable route matching
  const cleanPath = event.path ? event.path.replace(/\/+$/, '') : '';

  // Safely parse JSON request body
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON payload in request body." })
      };
    }
  }

  try {
    // ----------------------------------------------------
    // POST: Register New Collaborator
    // ----------------------------------------------------
    if (httpMethod === 'POST' && cleanPath.endsWith('/register')) {
      const { full_name, email, password, primary_skill } = body;

      if (!full_name || !email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Full name, email, and password are required." })
        };
      }

      const userCheck = await pool.query('SELECT id FROM collaborators WHERE email = $1', [email]);
      if (userCheck.rows.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "An account with this email already exists." })
        };
      }

      const password_hash = await bcrypt.hash(password, 10);
      const query = `
        INSERT INTO collaborators (full_name, email, password_hash, primary_skill)
        VALUES ($1, $2, $3, $4)
        RETURNING id, full_name, email, primary_skill, created_at;
      `;
      const values = [full_name, email, password_hash, primary_skill || null];
      const result = await pool.query(query, values);

      return { statusCode: 201, headers, body: JSON.stringify(result.rows[0]) };
    }

    // ----------------------------------------------------
    // POST: Authenticate / Login Collaborator
    // ----------------------------------------------------
    if (httpMethod === 'POST' && cleanPath.endsWith('/login')) {
      const { email, password } = body;

      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Email and password are required." })
        };
      }

      const userQuery = 'SELECT * FROM collaborators WHERE email = $1;';
      const result = await pool.query(userQuery, [email]);

      if (result.rows.length === 0) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: "Invalid email or password." })
        };
      }

      const user = result.rows[0];
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: "Invalid email or password." })
        };
      }

      delete user.password_hash;
      return { statusCode: 200, headers, body: JSON.stringify(user) };
    }

    // ----------------------------------------------------
    // GET: Dashboard Stats Metric Cards
    // ----------------------------------------------------
    if (httpMethod === 'GET' && cleanPath.endsWith('/stats')) {
      try {
        const result = await pool.query('SELECT * FROM get_dashboard_stats();');
        return { statusCode: 200, headers, body: JSON.stringify(result.rows[0] || {}) };
      } catch (err) {
        return { 
          statusCode: 200, 
          headers, 
          body: JSON.stringify({ total_challenges: 0, resolved_challenges: 0 }) 
        };
      }
    }

    // ----------------------------------------------------
    // GET: Full Challenge Feed (With Fallback Query)
    // ----------------------------------------------------
    if (httpMethod === 'GET' && cleanPath.endsWith('/challenges')) {
      let challenges = [];
      try {
        const result = await pool.query('SELECT * FROM get_challenge_feed();');
        challenges = result.rows;
      } catch (procError) {
        console.warn('get_challenge_feed() failed, executing SQL fallback query.');
        const fallbackResult = await pool.query(`
          SELECT sc.id, sc.title, sc.description, sc.reporter_name, sc.status, sc.created_at,
                 COALESCE(c.name, 'General Tech') AS category_name
          FROM societal_challenges sc
          LEFT JOIN categories c ON sc.category_id = c.id
          ORDER BY sc.created_at DESC;
        `);
        challenges = fallbackResult.rows;
      }

      return { statusCode: 200, headers, body: JSON.stringify(challenges) };
    }

    // ----------------------------------------------------
    // POST: Submit a Challenge (with AI Categorization)
    // ----------------------------------------------------
    if (httpMethod === 'POST' && cleanPath.endsWith('/challenges')) {
      const { title, description, category_id, reporter_name, reporter_org_id } = body;

      if (!title || !description) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Title and description are required." })
        };
      }

      let finalCategoryId = category_id;
      if (!finalCategoryId) {
        finalCategoryId = await categorizeDescription(description);
      }

      const query = `
        INSERT INTO societal_challenges (title, description, category_id, reporter_name, reporter_org_id)
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *;
      `;
      const values = [title, description, finalCategoryId, reporter_name || 'Anonymous', reporter_org_id || null];
      const result = await pool.query(query, values);

      return { statusCode: 201, headers, body: JSON.stringify(result.rows[0]) };
    }

    return { 
      statusCode: 404, 
      headers, 
      body: JSON.stringify({ error: `Route not found: ${httpMethod} ${cleanPath}` }) 
    };

  } catch (error) {
    console.error('Database/Server Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal Server Error", details: error.message })
    };
  }
};
