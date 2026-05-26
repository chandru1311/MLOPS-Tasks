const appData = window.APP_DATA || window.CIVIC_ISSUE_APP || {};

const fieldSections = appData.fieldSections || [
  {
    title: 'Incident',
    description: 'Basic civic issue details used by the model.',
    fields: [
      { name: 'Issue_Type', label: 'Issue Type', kind: 'select' },
      { name: 'Department', label: 'Department', kind: 'select' },
      { name: 'Zone', label: 'Zone', kind: 'select' },
    ],
  },
  {
    title: 'Evidence',
    description: 'Media signals that often change how fast a case moves.',
    fields: [
      { name: 'Has_Photo', label: 'Has Photo', kind: 'binary' },
      { name: 'Has_Voice_Note', label: 'Has Voice Note', kind: 'binary' },
    ],
  },
  {
    title: 'Context',
    description: 'Operational context the model uses to estimate severity.',
    fields: [
      { name: 'Hour_of_Day', label: 'Hour of Day', kind: 'number', step: 1 },
      { name: 'Num_Upvotes', label: 'Num Upvotes', kind: 'number', step: 1 },
      { name: 'Population_Density', label: 'Population Density', kind: 'number', step: 1 },
      { name: 'Dept_Current_Workload', label: 'Dept Current Workload', kind: 'number', step: 1 },
      { name: 'Weather_Severity_Index', label: 'Weather Severity Index', kind: 'number', step: 1 },
    ],
  },
];

const categoryLevels = appData.categoryLevels || {
  Issue_Type: ['Broken Sidewalk', 'Drainage', 'Graffiti', 'Pothole', 'Road Damage', 'Streetlight', 'Trash/Waste', 'Water Leak'],
  Department: ['Electrical', 'Maintenance', 'Public Works', 'Sanitation', 'Water Authority'],
  Zone: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
};

const defaults = appData.defaults || {
  Issue_Type: categoryLevels.Issue_Type[0],
  Department: categoryLevels.Department[0],
  Zone: categoryLevels.Zone[0],
  Has_Photo: 0,
  Has_Voice_Note: 0,
  Hour_of_Day: 12,
  Num_Upvotes: 5,
  Population_Density: 2500,
  Dept_Current_Workload: 30,
  Weather_Severity_Index: 3,
};

const modelName = appData.modelName || 'Civic issue severity model';

function ensureAppShell() {
  if (document.getElementById('prediction-form')) {
    return;
  }

  const shell = document.createElement('div');
  shell.className = 'page-shell';

  const fieldCount = fieldSections.reduce((total, section) => total + section.fields.length, 0);
  const categoryCount = Object.keys(categoryLevels).length;

  shell.innerHTML = `
    <header class="hero-card">
      <div class="hero-copy">
        <p class="eyebrow">Civic issue classifier</p>
        <h1>Predict the severity class for a reported issue.</h1>
        <p class="hero-text">
          Enter the incident details from your dataset and the model will estimate the most likely
          severity label with class probabilities.
        </p>
        <div class="hero-badges">
          <span>${modelName}</span>
          <span>${fieldCount} features</span>
          <span>${categoryCount} categorical groups</span>
        </div>
      </div>
      <aside class="hero-stats" aria-label="Dataset summary">
        <div class="stat-card">
          <span class="stat-label">Issue categories</span>
          <strong>${categoryLevels.Issue_Type.length}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Departments</span>
          <strong>${categoryLevels.Department.length}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Zones</span>
          <strong>${categoryLevels.Zone.length}</strong>
        </div>
      </aside>
    </header>

    <main class="content-grid">
      <section class="form-card">
        <div class="section-heading">
          <h2>Report details</h2>
          <p>These inputs match the feature columns the backend expects from the civic issue dataset.</p>
        </div>
        <form id="prediction-form" autocomplete="off"></form>
      </section>

      <aside class="result-card">
        <div class="result-header">
          <p class="eyebrow">Prediction result</p>
          <h2 id="prediction-label">Waiting for input</h2>
          <p id="prediction-note">Submit the form to see the predicted severity class.</p>
        </div>

        <section class="probability-panel">
          <h3>Class probabilities</h3>
          <div id="probability-list" class="probability-list"></div>
        </section>
      </aside>
    </main>
  `;

  document.body.prepend(shell);
}

function createField(field) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field-shell';
  wrapper.htmlFor = field.name;

  const title = document.createElement('span');
  title.textContent = field.label;
  wrapper.appendChild(title);

  let control;
  if (field.kind === 'select' || field.kind === 'binary') {
    control = document.createElement('select');
    control.name = field.name;
    control.id = field.name;

    const options = field.kind === 'binary'
      ? [
          { value: '0', label: 'No' },
          { value: '1', label: 'Yes' },
        ]
      : (categoryLevels[field.name] || []);

    if (field.kind === 'select') {
      options.forEach((option) => {
        const optionNode = document.createElement('option');
        optionNode.value = option;
        optionNode.textContent = option;
        control.appendChild(optionNode);
      });
    } else {
      options.forEach((option) => {
        const optionNode = document.createElement('option');
        optionNode.value = option.value;
        optionNode.textContent = option.label;
        control.appendChild(optionNode);
      });
    }

    control.value = String(defaults[field.name] ?? control.value ?? '');
  } else {
    control = document.createElement('input');
    control.type = field.kind || 'text';
    control.name = field.name;
    control.id = field.name;
    control.step = String(field.step || 'any');
    control.inputMode = 'decimal';
    control.value = defaults[field.name] ?? '';
    control.min = '0';
  }

  wrapper.appendChild(control);
  return wrapper;
}

function mountForm() {
  const form = document.getElementById('prediction-form');

  fieldSections.forEach((section) => {
    const sectionBlock = document.createElement('section');
    sectionBlock.className = 'input-section';

    const heading = document.createElement('div');
    heading.className = 'section-heading';
    heading.innerHTML = `
      <h3>${section.title}</h3>
      <p>${section.description}</p>
    `;

    const fieldGrid = document.createElement('div');
    fieldGrid.className = 'field-grid';
    section.fields.forEach((field) => fieldGrid.appendChild(createField(field)));

    sectionBlock.append(heading, fieldGrid);
    form.appendChild(sectionBlock);
  });

  const actions = document.createElement('div');
  actions.className = 'actions-row';
  actions.innerHTML = `
    <button class="primary-btn" type="submit">Predict severity</button>
    <button class="secondary-btn" type="reset">Reset form</button>
  `;
  form.appendChild(actions);
}

function renderProbabilities(probabilities, probabilityList) {
  probabilityList.innerHTML = '';

  const entries = Object.entries(probabilities || {});

  if (!entries.length) {
    probabilityList.innerHTML = '<p class="empty-state">No probabilities returned.</p>';
    return;
  }

  entries.forEach(([label, probability]) => {
    const percent = Math.round(probability * 1000) / 10;
    const item = document.createElement('div');
    item.className = 'probability-item';
    item.innerHTML = `
      <div class="probability-row">
        <strong>${label}</strong>
        <span>${percent}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${percent}%"></div>
      </div>
    `;
    probabilityList.appendChild(item);
  });
}

function initialize() {
  ensureAppShell();
  mountForm();

  const form = document.getElementById('prediction-form');
  const predictionLabel = document.getElementById('prediction-label');
  const predictionNote = document.getElementById('prediction-note');
  const probabilityList = document.getElementById('probability-list');

  function setIdleState() {
    predictionLabel.textContent = 'Waiting for input';
    predictionNote.textContent = 'Submit the form to see the predicted severity class.';
    probabilityList.innerHTML = '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    predictionLabel.textContent = 'Predicting...';
    predictionNote.textContent = 'The saved model is evaluating the submitted civic issue.';
    probabilityList.innerHTML = '<p class="empty-state">Loading probabilities...</p>';

    try {
      const response = await fetch('/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Prediction request failed.');
      }

      const data = await response.json();
      predictionLabel.textContent = data.prediction || 'Unknown';
      predictionNote.textContent = `Highest model confidence: ${Math.round((data.confidence || 0) * 1000) / 10}%`;
      renderProbabilities(data.probabilities, probabilityList);
    } catch (error) {
      predictionLabel.textContent = 'Prediction unavailable';
      predictionNote.textContent = error.message;
      probabilityList.innerHTML = '<p class="empty-state">Check the server and try again.</p>';
    }
  });

  form.addEventListener('reset', () => {
    window.setTimeout(setIdleState, 0);
  });

  setIdleState();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}