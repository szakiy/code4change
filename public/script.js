const API_URL = '/api/ideas';

// DOM Elements
const mobileToggle = document.getElementById('mobileToggle');
const navMenu = document.getElementById('navMenu');
const subOptions = document.querySelectorAll('.sub-option');
const contentHeading = document.getElementById('contentHeading');
const contentBody = document.getElementById('contentBody');
const ideasAppView = document.getElementById('ideasAppView');

const ideaForm = document.getElementById('idea-form');
const ideaIdInput = document.getElementById('idea-id');
const studentNameInput = document.getElementById('student-name');
const studentIdeaInput = document.getElementById('student-idea');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const ideasList = document.getElementById('ideas-list');

document.addEventListener('DOMContentLoaded', () => {
    fetchIdeas();
});

// Navigation Toggle
mobileToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

// View Switcher Logic
subOptions.forEach(option => {
    option.addEventListener('click', (e) => {
        e.preventDefault();
        const view = option.getAttribute('data-view');
        const title = option.getAttribute('data-title') || 'Student Ideas Board';

        if (view === 'ideas') {
            contentHeading.textContent = 'Student Ideas Board';
            contentBody.textContent = 'Share, view, and update innovative project concepts below.';
            ideasAppView.classList.remove('hidden');
            fetchIdeas();
        } else {
            contentHeading.textContent = title;
            contentBody.textContent = `This is the dynamically loaded view section for "${title}". Select any other menu sub-option to change this content.`;
            ideasAppView.classList.add('hidden');
        }

        navMenu.classList.remove('active');
    });
});

// Retrieve Ideas
async function fetchIdeas() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch ideas');
        const ideas = await response.json();
        renderIdeas(ideas);
    } catch (error) {
        console.error('Error fetching ideas:', error);
        ideasList.innerHTML = '<p class="no-ideas">Error loading ideas. Please verify serverless deployment logs.</p>';
    }
}

// Render Ideas into Grid DOM
function renderIdeas(ideas) {
    ideasList.innerHTML = '';

    if (ideas.length === 0) {
        ideasList.innerHTML = '<p class="no-ideas">No ideas submitted yet. Be the first!</p>';
        return;
    }

    ideas.forEach(idea => {
        const card = document.createElement('div');
        card.className = 'idea-card';

        const formattedDate = new Date(idea.created_at).toLocaleString();

        card.innerHTML = `
      <h3>${escapeHTML(idea.name)}</h3>
      <div class="timestamp">Submitted on: ${formattedDate}</div>
      <p>${escapeHTML(idea.idea)}</p>
      <button class="btn btn-edit" onclick="startEdit(${idea.id}, '${escapeQuote(idea.name)}', '${escapeQuote(idea.idea)}')">Edit Idea</button>
    `;

        ideasList.appendChild(card);
    });
}

// Form Submit (POST & PUT)
ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = ideaIdInput.value;
    const name = studentNameInput.value.trim();
    const idea = studentIdeaInput.value.trim();

    if (!name || !idea) return;

    const payload = { name, idea };

    try {
        if (id) {
            const response = await fetch(`${API_URL}?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to update idea');
        } else {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to submit idea');
        }

        resetForm();
        await fetchIdeas();
    } catch (error) {
        console.error('Error saving idea:', error);
        alert('An error occurred while saving the entry.');
    }
});

function startEdit(id, name, idea) {
    ideaIdInput.value = id;
    studentNameInput.value = name;
    studentIdeaInput.value = idea;

    formTitle.textContent = 'Edit Idea';
    submitBtn.textContent = 'Update Idea';
    cancelBtn.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
    ideaIdInput.value = '';
    studentNameInput.value = '';
    studentIdeaInput.value = '';

    formTitle.textContent = 'Submit a New Idea';
    submitBtn.textContent = 'Submit Idea';
    cancelBtn.classList.add('hidden');
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function escapeQuote(str) {
    return str.replace(/'/g, "\\'").replace(/\n/g, ' ');
}