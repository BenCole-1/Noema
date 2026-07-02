const MODEL = 'claude-sonnet-4-20250514'

function buildPrompt(items) {
  return `You are an intelligent structure engine. Given a collection of items, your job is to find the shape of the information.

Return ONLY valid JSON in this exact format:
{
  "title": "short phrase capturing the whole collection",
  "groups": [
    { "label": "group name", "items": ["item1", "item2"] }
  ],
  "relationships": [
    "One sentence describing a non-obvious connection between two or more items"
  ]
}

Items: ${JSON.stringify(items)}

Rules:
- The title should change meaningfully as items are added or removed
- Group labels should be conceptual, not just descriptive (e.g. "manufactured urgency" not "fast things")
- Relationships should be surprising — things the user wouldn't have grouped themselves
- Never return more than 4 groups or 2 relationships
- If there are fewer than 2 items, return a title only with empty groups and relationships`
}

async function post(body) {
  const response = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  })
  if (!response.ok) throw new Error(`API responded ${response.status}`)
  const data = await response.json()
  return data.content[0].text
}

// Tolerant JSON parse: strips ```json fences / stray prose around the object.
function parseJSON(text) {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fence) t = fence[1].trim()
  try {
    return JSON.parse(t)
  } catch (e) {
    const first = t.indexOf('{')
    const last = t.lastIndexOf('}')
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(t.slice(first, last + 1))
    }
    throw e
  }
}

export async function analyzeItems(items) {
  let text
  try {
    text = await post({
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(items) }],
    })
    return JSON.parse(text)
  } catch (err) {
    if (text !== undefined) {
      const retry = await post({
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildPrompt(items) }],
      })
      return JSON.parse(retry)
    }
    throw err
  }
}

export async function getDefinition({ title, groupLabel, otherItems, allItems, term }) {
  const prompt = `You are defining a term within a specific knowledge context.

Collection title: ${title}
Group: ${groupLabel}
Other terms in this group: ${JSON.stringify(otherItems)}
All items in collection: ${JSON.stringify(allItems)}

Term to define: ${term}

Return ONLY valid JSON:
{
  "definition": "2-4 sentences defining this term specifically as it relates to the collection context and the group it belongs to. Not a generic dictionary definition — a contextual one."
}`

  const text = await post({
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  return JSON.parse(text)
}

export async function getChatResponse({
  title,
  groupLabel,
  otherItems,
  allItems,
  term,
  definition,
  history,
  message,
}) {
  const historyText = history
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const prompt = `You are a knowledgeable tutor helping a user understand a specific term within a structured knowledge context.

Collection title: ${title}
Group this term belongs to: ${groupLabel}
Other terms in this group: ${JSON.stringify(otherItems)}
Full collection: ${JSON.stringify(allItems)}
Term being discussed: ${term}
Term definition already shown to user: ${definition}

Your role: answer questions about this term as it relates to the broader collection context.
Be specific, substantive, and concise. Never exceed 4 sentences per response.
Do not restate the definition unless directly asked.

Conversation so far:
${historyText || '(none yet)'}

User's new message: ${message}

Return ONLY valid JSON:
{
  "response": "your reply here"
}`

  const text = await post({
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  return JSON.parse(text)
}

export async function getTension(itemA, itemB) {
  const prompt = `Given these two items: "${itemA}" and "${itemB}"

Return ONLY valid JSON in this format:
{
  "relationship": "One sentence describing the specific, non-obvious relationship between these two things",
  "tension": "One sentence describing how these two things are in conflict or pull in opposite directions",
  "synthesis": "One sentence describing what a combination or merger of these two things would produce"
}

Be specific and surprising. Avoid generic observations.`

  const text = await post({
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  return JSON.parse(text)
}

export async function generateMap(concept) {
  const prompt = `You are a knowledge mapping engine. Given a concept, produce a complete MECE breakdown.

Concept: ${concept}

Rules:
- Categories must be mutually exclusive (no overlap) and collectively exhaustive (full coverage)
- Terms within each category must also be mutually exclusive and collectively exhaustive for that category
- Number of categories: vary based on subject (min 3, max 7)
- Number of terms per category: vary based on subject (min 3, max 6)
- Category names should be conceptual and structural, not just descriptive
- Term names should be specific — a student encountering this subject should recognize these as the real vocabulary of the field
- Overview should orient the user to why the map is structured this way

Return ONLY valid JSON:
{
  "theme": "the concept as a clean title",
  "overview": "2-3 sentences describing what this map covers and how it is partitioned",
  "categories": [
    {
      "label": "Category Name",
      "definition": "2-4 sentences defining this category within the context of the theme",
      "terms": [
        {
          "label": "Term Name",
          "definition": "2-4 sentences defining this term within the context of its category and theme"
        }
      ]
    }
  ]
}`

  let text
  try {
    text = await post({ max_tokens: 8192, messages: [{ role: 'user', content: prompt }] })
    return parseJSON(text)
  } catch (err) {
    if (text !== undefined) {
      const retry = await post({ max_tokens: 8192, messages: [{ role: 'user', content: prompt }] })
      return parseJSON(retry)
    }
    throw err
  }
}

export async function getMapChatResponse({
  theme,
  categoryLabel,
  categoryDefinition,
  otherTerms,
  termLabel,
  termDefinition,
  history,
  message,
}) {
  const historyText = history.map((m) => `${m.role}: ${m.content}`).join('\n')

  const prompt = `You are a knowledgeable tutor helping a user understand a specific term within a structured knowledge map.

Theme: ${theme}
Category: ${categoryLabel}
Category definition: ${categoryDefinition}
Other terms in this category: ${JSON.stringify(otherTerms)}
Term being discussed: ${termLabel}
Term definition already shown to user: ${termDefinition}

Answer questions about this term as it relates to the broader theme and category structure.
Be specific, substantive, and concise. Never exceed 4 sentences per response.
Do not restate the definition unless directly asked.

Conversation so far:
${historyText || '(none yet)'}

User message: ${message}

Return ONLY valid JSON:
{ "response": "your reply here" }`

  const text = await post({
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  return parseJSON(text)
}
