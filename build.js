#!/usr/bin/env node
/**
 * Renso Foundation — Static Site Builder
 * Reads _data/ JSON/Markdown files and injects them into index.html
 * Runs automatically on every Vercel deploy triggered by Decap CMS commits.
 */

const fs   = require('fs');
const path = require('path');

// ─── Helpers ───────────────────────────────────────────────────────────────

function readDataFiles(folder) {
  const dir = path.join(__dirname, '_data', folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') || f.endsWith('.md'))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      return f.endsWith('.json') ? JSON.parse(raw) : parseFrontmatter(raw);
    });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) data[key.trim()] = rest.join(':').trim();
  });
  // body = everything after closing ---
  data._body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
  return data;
}

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return { day: '', month: '', year: '' };
  const d = new Date(dateStr + 'T12:00:00');
  return {
    day:   d.getDate(),
    month: d.toLocaleString('en-CA', { month: 'long' }),
    year:  d.getFullYear(),
  };
}

const THUMB_ICONS = {
  'Education & Scholarships': { icon: 'fa-graduation-cap', cls: 'nt-1' },
  'Healthcare Initiative':    { icon: 'fa-hospital',        cls: 'nt-2' },
  'Economic Empowerment':     { icon: 'fa-rocket',          cls: 'nt-3' },
  'Press Release':            { icon: 'fa-newspaper',       cls: 'nt-1' },
  'Blog':                     { icon: 'fa-pen-nib',         cls: 'nt-2' },
  'Community Story':          { icon: 'fa-people-group',    cls: 'nt-3' },
  'Impact Report':            { icon: 'fa-chart-line',      cls: 'nt-1' },
};

const AVATAR_COLORS = ['ba-1', 'ba-2', 'ba-3', 'ba-4', 'ba-5'];

// ─── Section Renderers ──────────────────────────────────────────────────────

function renderEvents(events) {
  const upcoming = events
    .filter(e => e.status !== 'Cancelled')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!upcoming.length) return '<p style="text-align:center;opacity:.6;">No upcoming events at this time. Check back soon!</p>';

  return upcoming.map(ev => {
    const { day, month, year } = formatDate(ev.date);
    const url = ev.register_url && ev.register_url !== '#' ? esc(ev.register_url) : '#contact';
    const isPast = ev.status === 'Past';
    return `
      <div class="event-card fade-in">
        <div class="event-date-band"${isPast ? ' style="opacity:.6"' : ''}>
          <div class="event-date-num">${day}</div>
          <div class="event-date-info">
            <span class="event-date-month">${esc(month)}</span>
            <span class="event-date-year">${year}</span>
          </div>
        </div>
        <div class="event-card-body">
          <div class="event-type">${esc(ev.category)}${isPast ? ' &nbsp;·&nbsp; <span style="color:#F4A623">Past Event</span>' : ''}</div>
          <h3 class="event-title">${esc(ev.title)}</h3>
          <p class="event-desc">${esc(ev.description)}</p>
          <div class="event-meta">
            <span><i class="fa-solid fa-location-dot"></i> ${esc(ev.location)}</span>
            <span><i class="fa-solid fa-clock"></i> ${esc(ev.time)}</span>
          </div>
          <a href="${url}" class="btn btn-primary" style="width:100%;justify-content:center;">
            ${isPast ? 'View Recap' : 'Register Now'} <i class="fa-solid fa-arrow-right"></i>
          </a>
        </div>
      </div>`.trim();
  }).join('\n');
}

function renderNews(articles) {
  const published = articles
    .filter(a => a.published !== false && a.published !== 'false')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  if (!published.length) return '<p style="text-align:center;opacity:.6;">No news articles yet.</p>';

  return published.map(article => {
    const d = new Date(article.date + 'T12:00:00');
    const dateStr = d.toLocaleString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    const thumb = THUMB_ICONS[article.category] || { icon: 'fa-newspaper', cls: 'nt-1' };
    return `
      <div class="news-card fade-in">
        <div class="news-thumb ${thumb.cls}"><i class="fa-solid ${thumb.icon}"></i></div>
        <div class="news-card-body">
          <div class="news-cat">${esc(article.category)}</div>
          <h3 class="news-title">${esc(article.title)}</h3>
          <p class="news-excerpt">${esc(article.summary || article._body || '')}</p>
          <div class="news-footer">
            <span class="news-date"><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
            <a href="#" class="news-read">Read More <i class="fa-solid fa-arrow-right"></i></a>
          </div>
        </div>
      </div>`.trim();
  }).join('\n');
}

function renderBoard(members) {
  if (!members.length) return '';
  return members
    .sort((a, b) => (a.order || 99) - (b.order || 99))
    .map((m, i) => {
      const initials = (m.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const colorCls = AVATAR_COLORS[i % AVATAR_COLORS.length];
      return `
        <div class="board-card fade-in">
          <div class="board-avatar ${colorCls}">${initials}</div>
          <div class="board-name">${esc(m.name)}</div>
          <div class="board-role">${esc(m.role)}</div>
          <p class="board-bio">${esc(m.bio)}</p>
          <div class="board-socials">
            ${m.linkedin && m.linkedin !== '#' ? `<a href="${esc(m.linkedin)}" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>` : ''}
            <a href="#contact" aria-label="Email"><i class="fa-solid fa-envelope"></i></a>
          </div>
        </div>`.trim();
    }).join('\n');
}

function renderSettings(settings) {
  return {
    tagline:     settings.tagline     || 'Connecting Communities. Creating Impact.',
    mission:     settings.mission     || '',
    vision:      settings.vision      || '',
    livesCount:  parseFloat((settings.impact?.lives     || '5000').replace(/[^0-9.]/g, '')) || 5000,
    programsCount: parseFloat((settings.impact?.programs  || '12').replace(/[^0-9.]/g, '')) || 12,
    volunteersCount: parseFloat((settings.impact?.volunteers || '200').replace(/[^0-9.]/g, '')) || 200,
    raisedCount: parseFloat((settings.impact?.raised    || '500').replace(/[^0-9.]/g, '')) || 500,
    livesLabel:     settings.impact?.lives     || '5,000+',
    programsLabel:  settings.impact?.programs  || '12+',
    volunteersLabel:settings.impact?.volunteers|| '200+',
    raisedLabel:    settings.impact?.raised    || '500K+',
    address:  settings.contact?.address  || '123 Community Drive, Suite 200',
    city:     settings.contact?.city     || 'Mississauga, Ontario L5B 3M9',
    phone:    settings.contact?.phone    || '+1 (905) 555-0182',
    emailGeneral:   settings.contact?.email_general   || 'hello@rensofoundation.ca',
    emailDonations: settings.contact?.email_donations || 'donate@rensofoundation.ca',
    emailMedia:     settings.contact?.email_media     || 'media@rensofoundation.ca',
  };
}

// ─── Main Build ─────────────────────────────────────────────────────────────

function build() {
  console.log('🏗  Building Renso Foundation site...');

  // Read all data
  const events   = readDataFiles('events');
  const news     = readDataFiles('news');
  const board    = readDataFiles('board');
  const settingsArr = readDataFiles('settings');
  const settings = settingsArr.length ? renderSettings(settingsArr[0]) : renderSettings({});

  console.log(`   📅 Events: ${events.length}`);
  console.log(`   📰 News:   ${news.length}`);
  console.log(`   🏛  Board:  ${board.length}`);

  // Read template
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  // ── Inject Events ────────────────────────────────────────────────
  html = html.replace(
    /<!-- CMS:EVENTS:START -->[\s\S]*?<!-- CMS:EVENTS:END -->/,
    `<!-- CMS:EVENTS:START -->\n${renderEvents(events)}\n<!-- CMS:EVENTS:END -->`
  );

  // ── Inject News ──────────────────────────────────────────────────
  html = html.replace(
    /<!-- CMS:NEWS:START -->[\s\S]*?<!-- CMS:NEWS:END -->/,
    `<!-- CMS:NEWS:START -->\n${renderNews(news)}\n<!-- CMS:NEWS:END -->`
  );

  // ── Inject Board ─────────────────────────────────────────────────
  if (board.length) {
    html = html.replace(
      /<!-- CMS:BOARD:START -->[\s\S]*?<!-- CMS:BOARD:END -->/,
      `<!-- CMS:BOARD:START -->\n${renderBoard(board)}\n<!-- CMS:BOARD:END -->`
    );
  }

  // ── Inject Settings ──────────────────────────────────────────────
  // Tagline in hero
  html = html.replace(/<!-- CMS:TAGLINE -->.*?<!-- \/CMS:TAGLINE -->/s,
    `<!-- CMS:TAGLINE -->${esc(settings.tagline)}<!-- /CMS:TAGLINE -->`);

  // Impact counters
  html = html.replace(/data-count="5000"/, `data-count="${settings.livesCount}"`);
  html = html.replace(/data-count="12">/,  `data-count="${settings.programsCount}">`);
  html = html.replace(/data-count="200"/, `data-count="${settings.volunteersCount}"`);
  html = html.replace(/data-count="500"/, `data-count="${settings.raisedCount}"`);

  // Contact info
  html = html.replace(/<!-- CMS:ADDRESS -->[\s\S]*?<!-- \/CMS:ADDRESS -->/,
    `<!-- CMS:ADDRESS -->${esc(settings.address)}<br>${esc(settings.city)}, Canada<!-- /CMS:ADDRESS -->`);
  html = html.replace(/<!-- CMS:PHONE -->[\s\S]*?<!-- \/CMS:PHONE -->/,
    `<!-- CMS:PHONE -->${esc(settings.phone)}<!-- /CMS:PHONE -->`);
  html = html.replace(/<!-- CMS:EMAIL_GENERAL -->[\s\S]*?<!-- \/CMS:EMAIL_GENERAL -->/,
    `<!-- CMS:EMAIL_GENERAL --><a href="mailto:${esc(settings.emailGeneral)}">${esc(settings.emailGeneral)}</a><!-- /CMS:EMAIL_GENERAL -->`);
  html = html.replace(/<!-- CMS:EMAIL_DONATIONS -->[\s\S]*?<!-- \/CMS:EMAIL_DONATIONS -->/,
    `<!-- CMS:EMAIL_DONATIONS --><a href="mailto:${esc(settings.emailDonations)}">${esc(settings.emailDonations)}</a><!-- /CMS:EMAIL_DONATIONS -->`);
  html = html.replace(/<!-- CMS:EMAIL_MEDIA -->[\s\S]*?<!-- \/CMS:EMAIL_MEDIA -->/,
    `<!-- CMS:EMAIL_MEDIA --><a href="mailto:${esc(settings.emailMedia)}">${esc(settings.emailMedia)}</a><!-- /CMS:EMAIL_MEDIA -->`);

  // Write output
  fs.writeFileSync(path.join(__dirname, 'index.html'), html);
  console.log('✅ Build complete → index.html updated');
}

build();
