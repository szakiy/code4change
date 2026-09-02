const { Pool } = require('pg');

let pool;
if (!pool) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
}

exports.handler = async (event) => {
    const httpMethod = event.httpMethod;
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // GET: Retrieve all ideas
        if (httpMethod === 'GET') {
            const queryText = 'SELECT id, name, idea, created_at FROM student_ideas ORDER BY created_at DESC;';
            const result = await pool.query(queryText);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result.rows)
            };
        }

        // POST: Create a new idea
        if (httpMethod === 'POST') {
            const { name, idea } = JSON.parse(event.body || '{}');

            if (!name || !idea) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Name and Idea fields are required.' })
                };
            }

            const queryText = 'INSERT INTO student_ideas (name, idea) VALUES ($1, $2) RETURNING *;';
            const values = [name, idea];
            const result = await pool.query(queryText, values);

            return {
                statusCode: 201,
                headers,
                body: JSON.stringify(result.rows[0])
            };
        }

        // PUT: Update existing idea
        if (httpMethod === 'PUT') {
            const id = event.queryStringParameters ? event.queryStringParameters.id : null;
            const { name, idea } = JSON.parse(event.body || '{}');

            if (!id || !name || !idea) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID, Name, and Idea fields are required.' })
                };
            }

            const queryText = 'UPDATE student_ideas SET name = $1, idea = $2 WHERE id = $3 RETURNING *;';
            const values = [name, idea, id];
            const result = await pool.query(queryText, values);

            if (result.rows.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Idea not found.' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result.rows[0])
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    } catch (error) {
        console.error('Database Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};