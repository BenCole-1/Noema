import { useState, useCallback, useRef, useEffect } from 'react'
import { analyzeItems, getTension, getDefinition, getChatResponse, generateMap, getMapChatResponse } from './api.js'
import Logo from './Logo.jsx'
import './App.css'

const GROUP_COLORS = ['#4a9eff', '#a78bfa', '#34d399', '#fb923c']

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function computeDiff(currentItems, currentStructure, snapshot) {
  const curSet = new Set(currentItems)
  const snapSet = new Set(snapshot.items)
  const curLabels = new Set((currentStructure?.groups ?? []).map((g) => g.label))
  const snapLabels = new Set((snapshot.structure?.groups ?? []).map((g) => g.label))
  return {
    newItems: new Set([...curSet].filter((i) => !snapSet.has(i))),
    removedItems: new Set([...snapSet].filter((i) => !curSet.has(i))),
    titleChanged: currentStructure?.title !== snapshot.structure?.title,
    newGroupLabels: new Set([...curLabels].filter((l) => !snapLabels.has(l))),
    removedGroupLabels: new Set([...snapLabels].filter((l) => !curLabels.has(l))),
  }
}

// ── StructurePane: renders structure with optional diff highlighting ──────────
function StructurePane({
  structure,
  loading,
  titleFlash,
  hoveredItem,
  hoveredGroup,
  onHoverItem,
  onHoverGroup,
  onTermClick,    // ({ type, label, groupLabel }) => void — enables click-to-define
  diff,           // null = no diff; object = apply highlights
  snapshotMode,   // true = "then" side — muted, read-only
}) {
  const clickable = !snapshotMode && typeof onTermClick === 'function'
  if (!structure) return null

  const itemColorMap = {}
  structure.groups?.forEach((group, idx) => {
    const color = GROUP_COLORS[idx % GROUP_COLORS.length]
    group.items.forEach((item) => { itemColorMap[item] = color })
  })

  const itemColor = (item) => itemColorMap[item] ?? '#444'

  const itemHighlighted = (item) => {
    if (snapshotMode) return false
    if (hoveredItem === item) return true
    if (hoveredGroup !== null && structure.groups?.[hoveredGroup]?.items.includes(item)) return true
    return false
  }

  const groupHighlighted = (idx) => {
    if (snapshotMode) return false
    if (hoveredGroup === idx) return true
    if (hoveredItem && structure.groups?.[idx]?.items.includes(hoveredItem)) return true
    return false
  }

  return (
    <div className={`structure ${loading && !snapshotMode ? 'structure--dimmed' : ''} ${snapshotMode ? 'structure--snapshot' : ''}`}>
      {/* Title — with diff if title changed */}
      <div className="title-block">
        {/* "now" side: old title struck through above current */}
        {!snapshotMode && diff?.titleChanged && (
          <div className="title-old">{diff.oldTitle}</div>
        )}
        {/* "now" side: always show current title */}
        {!snapshotMode && (
          <div className={`collection-title ${titleFlash ? 'collection-title--flash' : ''}`}>
            {structure.title}
          </div>
        )}
        {/* "then" side: show snapshot title, struck through if changed */}
        {snapshotMode && (
          <div className={diff?.titleChanged ? 'title-old' : 'collection-title'}>
            {structure.title}
          </div>
        )}
      </div>

      {/* Groups */}
      {structure.groups?.length > 0 && (
        <div className="groups">
          {structure.groups.map((group, idx) => {
            const isNewLabel = diff?.newGroupLabels?.has(group.label)
            const isRemovedLabel = diff?.removedGroupLabels?.has(group.label)
            return (
              <div
                key={group.label}
                className={`group ${groupHighlighted(idx) ? 'group--lit' : ''} ${isNewLabel && !snapshotMode ? 'group--new' : ''} ${isRemovedLabel && snapshotMode ? 'group--removed' : ''}`}
                style={{ '--group-color': GROUP_COLORS[idx % GROUP_COLORS.length] }}
                onMouseEnter={() => !snapshotMode && onHoverGroup?.(idx)}
                onMouseLeave={() => !snapshotMode && onHoverGroup?.(null)}
              >
                <div
                  className={`group-label ${clickable ? 'clickable' : ''}`}
                  onClick={clickable ? () => onTermClick({ type: 'group', label: group.label, groupLabel: group.label }) : undefined}
                >
                  {group.label}
                </div>
                <div className="group-chips">
                  {group.items.map((item) => {
                    const isNew = diff?.newItems?.has(item)
                    const isRemoved = diff?.removedItems?.has(item)
                    return (
                      <span
                        key={item}
                        className={`group-chip ${isNew && !snapshotMode ? 'group-chip--new' : ''} ${isRemoved && snapshotMode ? 'group-chip--removed' : ''} ${clickable ? 'clickable' : ''}`}
                        onClick={clickable ? () => onTermClick({ type: 'term', label: item, groupLabel: group.label }) : undefined}
                      >
                        {item}
                      </span>
                    )
                  })}
                  {/* Show removed items that aren't in any current group */}
                  {snapshotMode && diff && [...diff.removedItems].filter(
                    ri => group.items.includes(ri)
                  ).length === 0 && null}
                </div>
              </div>
            )
          })}
          {/* In "then" side: surface removed items under their old group */}
          {snapshotMode && diff && [...diff.removedItems].some(
            ri => !structure.groups.some(g => g.items.includes(ri))
          ) && (
            <div className="group group--removed" style={{ '--group-color': '#f87171' }}>
              <div className="group-label">removed</div>
              <div className="group-chips">
                {[...diff.removedItems].filter(
                  ri => !structure.groups.some(g => g.items.includes(ri))
                ).map(item => (
                  <span key={item} className="group-chip group-chip--removed">{item}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Relationships */}
      {structure.relationships?.length > 0 && (
        <div className="relationships">
          <div className="relationships-heading">Emergent connections</div>
          {structure.relationships.map((rel, idx) => (
            <div key={idx} className="relationship">
              <span className="rel-mark">↔</span>
              {rel}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Existing state
  const [items, setItems] = useState([])
  const [input, setInput] = useState('')
  const [structure, setStructure] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [hoveredGroup, setHoveredGroup] = useState(null)
  const [titleFlash, setTitleFlash] = useState(false)

  // Tensioning state
  const [selectedItems, setSelectedItems] = useState([])
  const [tension, setTension] = useState(null)
  const [tensionPair, setTensionPair] = useState(null) // [itemA, itemB] being tensioned
  const [tensionLoading, setTensionLoading] = useState(false)

  // Snapshot state
  const [snapshots, setSnapshots] = useState([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [activeSnapshotIdx, setActiveSnapshotIdx] = useState(0)
  const [snapshotConfirm, setSnapshotConfirm] = useState(false)

  // Definition + chat state
  const [definitionCache, setDefinitionCache] = useState({})
  // key: `${term}::${collectionTitle}` → { definition: string }
  const [chatHistories, setChatHistories] = useState({})
  // key: term name → [{ role: 'user'|'assistant', content: string }]
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTarget, setDrawerTarget] = useState(null)
  // { type: 'term'|'group', label: string, groupLabel: string }

  // ── Mode toggle ──
  const [view, setView] = useState('explore') // 'explore' | 'map'

  // ── Map Mode state ──
  const [mapMode, setMapMode] = useState('entry') // 'entry' | 'map'
  const [mapData, setMapData] = useState(null)
  // { theme, overview, categories: [{ label, definition, terms: [{ label, definition }] }] }
  const [selectedCategory, setSelectedCategory] = useState(null) // category label
  const [selectedTerm, setSelectedTerm] = useState(null) // term label
  const [mapChatHistories, setMapChatHistories] = useState({})
  // key: `${theme}::${categoryLabel}::${termLabel}` → [{ role, content }]
  const [mapInput, setMapInput] = useState('')
  const [mapGenLoading, setMapGenLoading] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [mapPendingConcept, setMapPendingConcept] = useState('')

  const debounceTimer = useRef(null)
  const prevTitleRef = useRef(null)
  const abortRef = useRef(null)
  const deselectTimer = useRef(null)
  const tensionAbortRef = useRef(null)

  // ── Collection analysis ───────────────────────────────────────────────────
  const runAnalysis = useCallback(async (currentItems) => {
    if (abortRef.current) abortRef.current.aborted = true
    const token = { aborted: false }
    abortRef.current = token

    if (currentItems.length === 0) {
      setStructure(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await analyzeItems(currentItems)
      if (token.aborted) return
      if (prevTitleRef.current !== null && prevTitleRef.current !== result.title) {
        setTitleFlash(true)
        setTimeout(() => setTitleFlash(false), 900)
      }
      prevTitleRef.current = result.title
      setStructure(result)
    } catch (err) {
      if (!token.aborted) setError('Could not reach the structure engine. Check your API key.')
    } finally {
      if (!token.aborted) setLoading(false)
    }
  }, [])

  const scheduleAnalysis = useCallback((nextItems) => {
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => runAnalysis(nextItems), 300)
  }, [runAnalysis])

  const addItem = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    if (items.includes(trimmed)) { setInput(''); return }
    const next = [...items, trimmed]
    setItems(next)
    setInput('')
    scheduleAnalysis(next)
  }

  const removeItem = (item) => {
    const next = items.filter((i) => i !== item)
    setItems(next)
    setSelectedItems((s) => s.filter((i) => i !== item))
    scheduleAnalysis(next)
  }

  // ── Tensioning ────────────────────────────────────────────────────────────
  const toggleItemSelection = (item) => {
    // A click always takes effect immediately — cancel any pending auto-deselect
    // from a previous tension so it can't wipe out the new selection.
    clearTimeout(deselectTimer.current)
    setSelectedItems((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item)
      // Two items already selected (previous tension still showing):
      // start a fresh pair with this click instead of ignoring it.
      if (prev.length >= 2) return [item]
      return [...prev, item]
    })
  }

  useEffect(() => {
    if (selectedItems.length !== 2) return

    if (tensionAbortRef.current) tensionAbortRef.current.aborted = true
    const token = { aborted: false }
    tensionAbortRef.current = token

    setTensionLoading(true)
    setTensionPair([selectedItems[0], selectedItems[1]])
    getTension(selectedItems[0], selectedItems[1])
      .then((result) => {
        if (token.aborted) return
        setTension(result)
      })
      .catch(() => {})
      .finally(() => {
        if (token.aborted) return
        setTensionLoading(false)
        clearTimeout(deselectTimer.current)
        deselectTimer.current = setTimeout(() => setSelectedItems([]), 2000)
      })
  }, [selectedItems])

  // ── Snapshots ─────────────────────────────────────────────────────────────
  const saveSnapshot = () => {
    if (!structure) return
    const snap = {
      id: Date.now(),
      name: `${structure.title} — ${formatTime(new Date())}`,
      items: [...items],
      structure: {
        title: structure.title,
        groups: structure.groups ? JSON.parse(JSON.stringify(structure.groups)) : [],
        relationships: structure.relationships ? [...structure.relationships] : [],
      },
    }
    setSnapshots((prev) => [snap, ...prev].slice(0, 5))
    setActiveSnapshotIdx(0)
    setSnapshotConfirm(true)
    setTimeout(() => setSnapshotConfirm(false), 2000)
  }

  const activeSnapshot = showSnapshots && snapshots.length > 0
    ? snapshots[activeSnapshotIdx] ?? null
    : null

  const diff = activeSnapshot ? {
    ...computeDiff(items, structure, activeSnapshot),
    oldTitle: activeSnapshot.structure?.title,
  } : null

  // ── Definition drawer ──────────────────────────────────────────────────────
  const openDrawer = useCallback((target) => {
    setDrawerTarget(target)
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // ── Map generation ──────────────────────────────────────────────────────────
  const runMapGeneration = useCallback(async (concept) => {
    const trimmed = concept.trim()
    if (!trimmed) return
    setMapPendingConcept(trimmed)
    setMapGenLoading(true)
    setMapError(false)
    try {
      const result = await generateMap(trimmed)
      setMapData(result)
      setSelectedCategory(null)
      setSelectedTerm(null)
      setMapMode('map')
    } catch (err) {
      setMapError(true)
    } finally {
      setMapGenLoading(false)
    }
  }, [])

  const newMap = useCallback(() => {
    setMapMode('entry')
    setMapData(null)
    setSelectedCategory(null)
    setSelectedTerm(null)
    setMapError(false)
    setMapInput('')
  }, [])

  // ── Derived: item colors ──────────────────────────────────────────────────
  const itemColorMap = {}
  if (structure?.groups) {
    structure.groups.forEach((group, idx) => {
      GROUP_COLORS[idx % GROUP_COLORS.length]
      group.items.forEach((item) => { itemColorMap[item] = GROUP_COLORS[idx % GROUP_COLORS.length] })
    })
  }

  const itemColor = (item) => {
    if (selectedItems.includes(item)) return '#c9a84c'
    return itemColorMap[item] ?? '#444'
  }

  const itemHighlighted = (item) => {
    if (selectedItems.includes(item)) return false // selection overrides hover
    if (hoveredItem === item) return true
    if (hoveredGroup !== null && structure?.groups[hoveredGroup]?.items.includes(item)) return true
    return false
  }

  return (
    <div className="app-root">
      {/* ── Mode toggle ── */}
      <div className="mode-bar">
        <Logo />
        <div className="mode-toggle">
          <button
            className={`mode-tab ${view === 'explore' ? 'mode-tab--active' : ''}`}
            onClick={() => setView('explore')}
          >
            Explore
          </button>
          <button
            className={`mode-tab ${view === 'map' ? 'mode-tab--active' : ''}`}
            onClick={() => setView('map')}
          >
            Map
          </button>
        </div>
      </div>

      {view === 'map' ? (
        <MapMode
          mapMode={mapMode}
          mapData={mapData}
          mapInput={mapInput}
          setMapInput={setMapInput}
          mapGenLoading={mapGenLoading}
          mapError={mapError}
          mapPendingConcept={mapPendingConcept}
          onGenerate={runMapGeneration}
          onNewMap={newMap}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedTerm={selectedTerm}
          setSelectedTerm={setSelectedTerm}
          mapChatHistories={mapChatHistories}
          setMapChatHistories={setMapChatHistories}
        />
      ) : (
      <div className="app">
        {/* ── Left panel ── */}
        <div className="panel left-panel">
          <header className="panel-header">
            <h1 className="panel-title">Item Space</h1>
          <span className="badge">{items.length}</span>
          {selectedItems.length === 1 && (
            <span className="tension-hint">select one more</span>
          )}
          {selectedItems.length === 2 && (
            <span className="tension-hint tension-hint--active">
              {tensionLoading ? 'finding tension…' : 'tensioning…'}
            </span>
          )}
        </header>

        <div className="input-row">
          <input
            className="item-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Add anything — ideas, names, words…"
            autoFocus
          />
          <button className="add-btn" onClick={addItem}>Add</button>
        </div>

        <div className="items-grid">
          {items.map((item) => {
            const isSelected = selectedItems.includes(item)
            const isNew = diff?.newItems?.has(item)
            return (
              <div
                key={item}
                className={`item-card
                  ${itemHighlighted(item) ? 'item-card--lit' : ''}
                  ${isSelected ? 'item-card--selected' : ''}
                  ${isNew ? 'item-card--new' : ''}
                `}
                style={{ '--accent': itemColor(item) }}
                onClick={() => toggleItemSelection(item)}
                onMouseEnter={() => !isSelected && setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                {isSelected && <span className="select-check">✓</span>}
                <span className="item-label">{item}</span>
                <button
                  className="remove-btn"
                  onClick={(e) => { e.stopPropagation(); removeItem(item) }}
                  aria-label={`Remove ${item}`}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>

        {items.length === 0 && (
          <p className="hint">Start typing to build a collection.</p>
        )}
        {items.length >= 2 && selectedItems.length === 0 && (
          <p className="hint tension-tip">Click any two items to find their tension.</p>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="panel right-panel">
        <header className="panel-header">
          <h1 className="panel-title">Living Structure</h1>
          <div className={`thinking-dot ${loading ? 'thinking-dot--active' : ''}`} />
          <div className="header-actions">
            {structure && (
              <button
                className="hdr-btn"
                onClick={saveSnapshot}
                title="Save snapshot"
              >
                {snapshotConfirm ? <span className="snap-confirm">Saved ✓</span> : 'Save snapshot'}
              </button>
            )}
            {snapshots.length > 0 && (
              <button
                className={`hdr-btn ${showSnapshots ? 'hdr-btn--active' : ''}`}
                onClick={() => setShowSnapshots((v) => !v)}
              >
                Snapshots ({snapshots.length})
              </button>
            )}
          </div>
        </header>

        {/* ── Comparison layout ── */}
        {activeSnapshot ? (
          <div className="comparison-layout">
            {/* Now side */}
            <div className="comparison-half now-half">
              <div className="comparison-label">now</div>

              {loading && !structure && (
                <div className="skeleton-wrap">
                  <div className="skeleton skeleton--title" />
                  <div className="skeleton skeleton--group" />
                </div>
              )}

              {structure && (
                <StructurePane
                  structure={structure}
                  loading={loading}
                  titleFlash={titleFlash}
                  hoveredItem={hoveredItem}
                  hoveredGroup={hoveredGroup}
                  onHoverItem={setHoveredItem}
                  onHoverGroup={setHoveredGroup}
                  onTermClick={openDrawer}
                  diff={diff}
                  snapshotMode={false}
                />
              )}

              {structure && (tension || tensionLoading) && (
                <DirectTension tension={tension} pair={tensionPair} loading={tensionLoading} />
              )}
            </div>

            {/* Divider */}
            <div className="comparison-divider">
              <span className="comparison-divider-label">vs</span>
            </div>

            {/* Then side */}
            <div className="comparison-half then-half">
              <div className="then-header">
                <div className="comparison-label comparison-label--then">then</div>
                <select
                  className="snapshot-select"
                  value={activeSnapshotIdx}
                  onChange={(e) => setActiveSnapshotIdx(Number(e.target.value))}
                >
                  {snapshots.map((s, i) => (
                    <option key={s.id} value={i}>{s.name}</option>
                  ))}
                </select>
              </div>

              <StructurePane
                structure={activeSnapshot.structure}
                loading={false}
                titleFlash={false}
                hoveredItem={null}
                hoveredGroup={null}
                diff={diff}
                snapshotMode={true}
              />
            </div>
          </div>
        ) : (
          /* ── Normal (non-comparison) layout ── */
          <>
            {!loading && items.length === 0 && !structure && (
              <p className="hint">Structure emerges here as you add items.</p>
            )}

            {loading && !structure && (
              <div className="skeleton-wrap">
                <div className="skeleton skeleton--title" />
                <div className="skeleton skeleton--group" />
                <div className="skeleton skeleton--group short" />
              </div>
            )}

            {structure && (
              <StructurePane
                structure={structure}
                loading={loading}
                titleFlash={titleFlash}
                hoveredItem={hoveredItem}
                hoveredGroup={hoveredGroup}
                onHoverItem={setHoveredItem}
                onHoverGroup={setHoveredGroup}
                onTermClick={openDrawer}
                diff={null}
                snapshotMode={false}
              />
            )}

            {/* Snapshot list (no active snapshot selected yet) */}
            {showSnapshots && snapshots.length > 0 && (
              <div className="snapshot-list">
                <div className="relationships-heading" style={{ marginBottom: 10 }}>Snapshots</div>
                {snapshots.map((s, i) => (
                  <button
                    key={s.id}
                    className={`snapshot-row ${activeSnapshotIdx === i ? 'snapshot-row--active' : ''}`}
                    onClick={() => setActiveSnapshotIdx(i)}
                  >
                    <span className="snapshot-name">{s.name}</span>
                    <span className="snapshot-count">{s.items.length} items</span>
                  </button>
                ))}
              </div>
            )}

            {/* Direct Tension */}
            {(tension || tensionLoading) && (
              <DirectTension tension={tension} pair={tensionPair} loading={tensionLoading} />
            )}

            {loading && structure && <div className="shimmer-overlay" />}
            {error && <div className="error-msg">{error}</div>}
          </>
        )}
      </div>

        {/* ── Definition + Chat drawer ── */}
        <DefinitionDrawer
          open={drawerOpen}
          target={drawerTarget}
          structure={structure}
          allItems={items}
          definitionCache={definitionCache}
          setDefinitionCache={setDefinitionCache}
          chatHistories={chatHistories}
          setChatHistories={setChatHistories}
          onClose={closeDrawer}
        />
      </div>
      )}
    </div>
  )
}

// ── DirectTension component ───────────────────────────────────────────────────
function DirectTension({ tension, pair, loading }) {
  return (
    <div className={`direct-tension ${tension && !loading ? 'direct-tension--visible' : ''}`}>
      <div className="relationships-heading dt-heading">Direct Tension</div>
      {pair && (
        <div className="dt-pair">
          <span className="dt-pair-item">{pair[0]}</span>
          <span className="dt-pair-mark">↔</span>
          <span className="dt-pair-item">{pair[1]}</span>
        </div>
      )}
      {loading ? (
        <div className="dt-loading">
          <div className="skeleton skeleton--group" style={{ height: 90 }} />
        </div>
      ) : tension && (
        <div className="dt-card">
          <div className="dt-row">
            <span className="dt-label">Relationship</span>
            <span className="dt-text">{tension.relationship}</span>
          </div>
          <div className="dt-row">
            <span className="dt-label">Tension</span>
            <span className="dt-text">{tension.tension}</span>
          </div>
          <div className="dt-row">
            <span className="dt-label">Synthesis</span>
            <span className="dt-text">{tension.synthesis}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TermChat: reusable chat UI (Explore drawer + Map mode) ────────────────────
function TermChat({ termLabel, history, loading, onSend, emptyText, autoFocusKey }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const historyRef = useRef(null)

  // Auto-focus when the active term changes (mirrors drawer open timing)
  useEffect(() => {
    if (autoFocusKey) {
      const t = setTimeout(() => inputRef.current?.focus(), 220)
      return () => clearTimeout(t)
    }
  }, [autoFocusKey])

  // Keep scrolled to the latest message
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [history.length, loading])

  const submit = () => {
    const text = input.trim()
    if (!text || loading) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="chat-section">
      <div className="chat-label">Ask about <span className="ctx-em">{termLabel}</span></div>

      <div className="chat-history" ref={historyRef}>
        {history.length === 0 && !loading && (
          <div className="chat-empty">{emptyText}</div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--assistant chat-msg--thinking">thinking…</div>
        )}
      </div>

      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={`Ask about ${termLabel}…`}
        />
        <button className="chat-send" onClick={submit} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}

// ── DefinitionDrawer component ────────────────────────────────────────────────
function DefinitionDrawer({
  open,
  target,
  structure,
  allItems,
  definitionCache,
  setDefinitionCache,
  chatHistories,
  setChatHistories,
  onClose,
}) {
  const [defLoading, setDefLoading] = useState(false)
  const [defError, setDefError] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)

  const defTokenRef = useRef(null)

  const collectionTitle = structure?.title ?? ''
  const term = target?.label ?? ''
  const isGroup = target?.type === 'group'

  // Resolve context from the live structure
  let groupLabel = target?.groupLabel ?? ''
  let otherItems = []
  if (structure?.groups && target) {
    if (isGroup) {
      const g = structure.groups.find((g) => g.label === target.label)
      groupLabel = target.label
      otherItems = g ? [...g.items] : []
    } else {
      const g = structure.groups.find((g) => g.items.includes(term))
      groupLabel = g?.label ?? target.groupLabel ?? ''
      otherItems = g ? g.items.filter((i) => i !== term) : []
    }
  }

  const cacheKey = `${term}::${collectionTitle}`
  const cached = definitionCache[cacheKey]
  const chatKey = term
  const history = chatHistories[chatKey] ?? []

  // Fetch definition when drawer opens on a new target (respecting cache)
  useEffect(() => {
    if (!open || !target || !collectionTitle) return
    if (definitionCache[cacheKey]) { setDefError(false); return }

    if (defTokenRef.current) defTokenRef.current.aborted = true
    const token = { aborted: false }
    defTokenRef.current = token

    setDefLoading(true)
    setDefError(false)
    getDefinition({
      title: collectionTitle,
      groupLabel,
      otherItems,
      allItems,
      term,
    })
      .then((result) => {
        if (token.aborted) return
        setDefinitionCache((prev) => ({ ...prev, [cacheKey]: { definition: result.definition } }))
      })
      .catch(() => { if (!token.aborted) setDefError(true) })
      .finally(() => { if (!token.aborted) setDefLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cacheKey])

  const sendMessage = (text) => {
    if (!text || chatLoading) return

    const newHistory = [...history, { role: 'user', content: text }]
    setChatHistories((prev) => ({ ...prev, [chatKey]: newHistory }))
    setChatLoading(true)

    getChatResponse({
      title: collectionTitle,
      groupLabel,
      otherItems,
      allItems,
      term,
      definition: cached?.definition ?? '',
      history,
      message: text,
    })
      .then((result) => {
        setChatHistories((prev) => ({
          ...prev,
          [chatKey]: [...newHistory, { role: 'assistant', content: result.response }],
        }))
      })
      .catch(() => {
        setChatHistories((prev) => ({
          ...prev,
          [chatKey]: [...newHistory, { role: 'assistant', content: 'Something went wrong reaching the tutor. Try again.' }],
        }))
      })
      .finally(() => setChatLoading(false))
  }

  return (
    <>
      <div
        className={`drawer-scrim ${open ? 'drawer-scrim--visible' : ''}`}
        onClick={onClose}
      />
      <aside className={`def-drawer ${open ? 'def-drawer--open' : ''}`}>
        {target && (
          <>
            <div className="drawer-header">
              <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
              <div className="drawer-term">{term}</div>
              <div className={`drawer-context ${isGroup ? 'drawer-context--group' : ''}`}>
                {isGroup
                  ? <>Group in: <span className="ctx-em">{collectionTitle}</span></>
                  : <>Term in: <span className="ctx-em">{groupLabel}</span> → <span className="ctx-em">{collectionTitle}</span></>}
              </div>
            </div>

            <div className="drawer-definition">
              {defLoading && !cached && (
                <div className="def-loading">
                  <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: '60%' }} />
                </div>
              )}
              {!defLoading && cached && (
                <p className="def-text">{cached.definition}</p>
              )}
              {defError && !cached && (
                <p className="def-text def-text--error">Couldn't load a definition. Close and try again.</p>
              )}
            </div>

            <div className="drawer-divider" />

            <TermChat
              termLabel={term}
              history={history}
              loading={chatLoading}
              onSend={sendMessage}
              emptyText={`Ask anything about this ${isGroup ? 'grouping' : 'term'} in context.`}
              autoFocusKey={open ? term : null}
            />
          </>
        )}
      </aside>
    </>
  )
}

// ── MapMode component ─────────────────────────────────────────────────────────
const MAP_SEEDS = ['Macroeconomics', 'Stoicism', 'Machine Learning', 'The Renaissance', 'Thermodynamics']

function MapMode({
  mapMode,
  mapData,
  mapInput,
  setMapInput,
  mapGenLoading,
  mapError,
  mapPendingConcept,
  onGenerate,
  onNewMap,
  selectedCategory,
  setSelectedCategory,
  selectedTerm,
  setSelectedTerm,
  mapChatHistories,
  setMapChatHistories,
}) {
  const [chatLoading, setChatLoading] = useState(false)
  const entryInputRef = useRef(null)

  useEffect(() => {
    if (mapMode === 'entry' && !mapGenLoading && !mapError) {
      entryInputRef.current?.focus()
    }
  }, [mapMode, mapGenLoading, mapError])

  // ── Entry screen (form / loading / error) ──
  if (mapMode === 'entry' || !mapData) {
    return (
      <div className="app map-app">
        <div className="map-entry">
          {mapGenLoading ? (
            <div className="map-mapping">
              <div className="map-mapping-text">Mapping {mapPendingConcept}…</div>
              <div className="map-mapping-pulse" />
            </div>
          ) : mapError ? (
            <div className="map-entry-inner">
              <div className="map-error-text">Couldn't generate that map. Something went wrong.</div>
              <button
                className="map-generate-btn"
                onClick={() => onGenerate(mapInput.trim() || mapPendingConcept)}
              >
                Retry “{mapInput.trim() || mapPendingConcept}”
              </button>
            </div>
          ) : (
            <div className="map-entry-inner">
              <h2 className="map-entry-title">Map a concept</h2>
              <input
                ref={entryInputRef}
                className="map-entry-input"
                value={mapInput}
                onChange={(e) => setMapInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onGenerate(mapInput)}
                placeholder="Enter a concept, subject, or field..."
              />
              <button className="map-generate-btn" onClick={() => onGenerate(mapInput)}>
                Generate Map
              </button>
              <div className="map-seeds">
                {MAP_SEEDS.map((seed) => (
                  <button
                    key={seed}
                    className="map-seed-chip"
                    onClick={() => { setMapInput(seed); onGenerate(seed) }}
                  >
                    {seed}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Map layout ──
  const { theme, overview, categories } = mapData
  const catObj = categories.find((c) => c.label === selectedCategory) ?? null
  const termObj = catObj?.terms.find((t) => t.label === selectedTerm) ?? null

  const selectCategory = (label) => {
    if (selectedCategory === label && !selectedTerm) {
      // toggle collapse
      setSelectedCategory(null)
      setSelectedTerm(null)
    } else {
      setSelectedCategory(label)
      setSelectedTerm(null)
    }
  }

  const selectTerm = (catLabel, termLabel) => {
    setSelectedCategory(catLabel)
    setSelectedTerm(termLabel)
  }

  // Chat wiring (only meaningful when a term is selected)
  const chatKey = termObj ? `${theme}::${catObj.label}::${termObj.label}` : ''
  const chatHistory = mapChatHistories[chatKey] ?? []

  const sendMapMessage = (text) => {
    if (!text || chatLoading || !termObj) return
    const otherTerms = catObj.terms.filter((t) => t.label !== termObj.label).map((t) => t.label)
    const newHistory = [...chatHistory, { role: 'user', content: text }]
    setMapChatHistories((prev) => ({ ...prev, [chatKey]: newHistory }))
    setChatLoading(true)

    getMapChatResponse({
      theme,
      categoryLabel: catObj.label,
      categoryDefinition: catObj.definition,
      otherTerms,
      termLabel: termObj.label,
      termDefinition: termObj.definition,
      history: chatHistory,
      message: text,
    })
      .then((result) => {
        setMapChatHistories((prev) => ({
          ...prev,
          [chatKey]: [...newHistory, { role: 'assistant', content: result.response }],
        }))
      })
      .catch(() => {
        setMapChatHistories((prev) => ({
          ...prev,
          [chatKey]: [...newHistory, { role: 'assistant', content: 'Something went wrong reaching the tutor. Try again.' }],
        }))
      })
      .finally(() => setChatLoading(false))
  }

  return (
    <div className="app">
      {/* ── Left: Map Navigator ── */}
      <div className="panel left-panel map-nav">
        <header className="panel-header">
          <h1 className="panel-title">Map Navigator</h1>
        </header>

        <div className="map-theme-header">{theme}</div>

        <div className="map-categories">
          {categories.map((cat, idx) => {
            const expanded = selectedCategory === cat.label
            const color = GROUP_COLORS[idx % GROUP_COLORS.length]
            return (
              <div key={cat.label} className="map-cat-block">
                <button
                  className={`map-cat-row ${expanded ? 'map-cat-row--active' : ''}`}
                  style={{ '--group-color': color }}
                  onClick={() => selectCategory(cat.label)}
                >
                  <span className={`map-chevron ${expanded ? 'map-chevron--open' : ''}`}>▸</span>
                  <span className="map-cat-name">{cat.label}</span>
                </button>
                {expanded && (
                  <div className="map-terms-list">
                    {cat.terms.map((t) => (
                      <button
                        key={t.label}
                        className={`map-term-row ${selectedTerm === t.label ? 'map-term-row--active' : ''}`}
                        style={{ '--group-color': color }}
                        onClick={() => selectTerm(cat.label, t.label)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button className="map-newmap-btn" onClick={onNewMap}>New Map</button>
      </div>

      {/* ── Right: Content Area ── */}
      <div className="panel right-panel">
        <header className="panel-header">
          <h1 className="panel-title">{termObj ? 'Term' : catObj ? 'Category' : 'Overview'}</h1>
        </header>

        {/* Term selected */}
        {termObj ? (
          <div className="map-content">
            <div className="collection-title">{termObj.label}</div>
            <p className="def-text map-def">{termObj.definition}</p>
            <div className="drawer-divider map-inline-divider" />
            <TermChat
              termLabel={termObj.label}
              history={chatHistory}
              loading={chatLoading}
              onSend={sendMapMessage}
              emptyText="Ask anything about this term in context."
              autoFocusKey={chatKey}
            />
          </div>
        ) : catObj ? (
          /* Category selected, no term */
          <div className="map-content">
            <div className="collection-title">{catObj.label}</div>
            <p className="def-text map-def">{catObj.definition}</p>
            <div className="relationships-heading map-terms-heading">Terms</div>
            <div className="map-term-cards">
              {catObj.terms.map((t, idx) => (
                <button
                  key={t.label}
                  className="map-term-card"
                  style={{ '--group-color': GROUP_COLORS[categories.indexOf(catObj) % GROUP_COLORS.length] }}
                  onClick={() => selectTerm(catObj.label, t.label)}
                >
                  <span className="map-term-card-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Nothing selected — theme overview */
          <div className="map-content">
            <div className="collection-title map-theme-title">{theme}</div>
            <p className="def-text map-overview">{overview}</p>
          </div>
        )}
      </div>
    </div>
  )
}
