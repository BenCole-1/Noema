# Noema
A living information space that thinks with you.

Noema transforms raw ideas into structured knowledge in real time. Add any mix of concepts, and Claude instantly organizes them into meaningful groups, surfaces hidden relationships, and lets you explore the tension between ideas. It's not search — it's active sense-making.

## Features
Explore Mode — Drop in a list of concepts and watch them self-organize into a MECE structure with labels, relationships, and group definitions
Direct Tension — Select any two items to reveal their relationship, the tension between them, and what their synthesis would produce
Definitions + Term Chat — Click any term to get a contextual definition and chat with Claude about it within the structure
Map Mode — Enter any concept to generate a full hierarchical knowledge map with categories, terms, and definitions

## Tech Stack
React 18 + Vite
Anthropic Claude API (claude-sonnet-4-20250514, claude-opus-4-8)
Express (backend proxy — keeps API key server-side)
No external UI libraries

## Running Locally
npm install
Create a .env file:

ANTHROPIC_API_KEY=your_api_key_here
Then:

npm run dev     # development (Vite dev server with proxy)
npm run build   # production build
npm start       # serve production build via Express

## Deployment
Designed to deploy as a single Render Web Service:

Build command: npm install && npm run build
Start command: node server.js
Set ANTHROPIC_API_KEY as an environment variable in Render's dashboard
The Express server both serves the static frontend and proxies API calls to Anthropic, so the API key never touches the browser.

## What is Noema?
The name comes from phenomenology — in Husserl, the noema is the content of a thought as it reaches toward its object. This app is built on the idea that structure is not imposed on information, it is discovered within it.
