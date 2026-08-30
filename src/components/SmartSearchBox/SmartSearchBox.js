/**
 * src/components/SmartSearchBox/SmartSearchBox.js
 *
 * The Groq-powered smart search box (spec addendum): natural language in ("I need a cleaner who
 * also cleans windows", "change my notification settings"), a real category match + relevant
 * providers out, or a real navigation jump - never a hardcoded/fake response. Always shown
 * alongside, never instead of, manual category browsing (spec section 43) - `onManualBrowseHint`
 * lets the parent nudge users toward that when AI is unavailable or the query is unclear.
 *
 * Saves and recommends search history (spec addendum: "let it save search history and recommend
 * it in the search box") - pulled from the signed-in user's real, persisted searchHistory
 * (server/models/AppUser.js), or from localStorage for a signed-out visitor.
 *
 * @param {(target: {type: 'category', categorySlug, keywords, data, searchedNear} | {type: 'navigation', target: string}) => void} props.onResult
 */
import React, { useEffect, useRef, useState } from 'react';
import { apiV2, apiV2Public, hasAppUserToken } from '../../util/apiV2';
import css from './SmartSearchBox.module.css';

const HISTORY_STORAGE_KEY = 'servio.searchHistory';
const MAX_LOCAL_HISTORY = 10;

const readLocalHistory = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const pushLocalHistory = query => {
  if (typeof window === 'undefined') return;
  try {
    const next = [query, ...readLocalHistory().filter(q => q.toLowerCase() !== query.toLowerCase())].slice(
      0,
      MAX_LOCAL_HISTORY
    );
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    // Not fatal - suggestions just won't persist this query for next time.
  }
};

const SmartSearchBox = ({ location, onResult, placeholder }) => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (hasAppUserToken()) {
      apiV2('/api/v2/auth/me')
        .then(data => {
          const entries = (data.user?.searchHistory || []).map(h => h.query);
          setHistory(entries);
        })
        .catch(() => setHistory(readLocalHistory()));
    } else {
      setHistory(readLocalHistory());
    }
  }, []);

  const runSearch = async q => {
    const trimmed = q.trim();
    if (trimmed.length < 3) {
      setMessage('Type at least 3 characters to search.');
      return;
    }
    setMessage(null);
    setLoading(true);
    setOpen(false);
    pushLocalHistory(trimmed);
    setHistory(prev => [trimmed, ...prev.filter(h => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_LOCAL_HISTORY));

    try {
      const call = hasAppUserToken() ? apiV2 : apiV2Public;
      const data = await call('/api/v2/search/smart', {
        method: 'POST',
        body: { query: trimmed, lat: location?.lat, lng: location?.lng, radiusMiles: location?.radiusMiles },
      });

      if (!data.aiAvailable) {
        setMessage(data.message || 'AI search is unavailable right now. Try browsing categories below.');
        return;
      }
      if (data.intent === 'navigation' && data.navigationTarget) {
        onResult({ type: 'navigation', target: data.navigationTarget });
        return;
      }
      if (data.intent === 'category_search' && data.category) {
        onResult({
          type: 'category',
          categorySlug: data.category.slug,
          categoryName: data.category.name,
          keywords: data.serviceKeywords,
          data: data.data,
          searchedNear: data.searchedNear,
        });
        return;
      }
      setMessage(data.message || "Couldn't match that to anything. Try browsing categories manually below.");
    } catch (err) {
      setMessage('Search is temporarily unavailable. Try browsing categories manually below.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    runSearch(query);
  };

  const handleHistoryClick = h => {
    setQuery(h);
    runSearch(h);
  };

  return (
    <div className={css.root}>
      <form className={css.form} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={css.input}
          type="text"
          value={query}
          placeholder={placeholder || 'Try "a cleaner who also does windows"'}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => history.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button type="submit" className={css.searchButton} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>

        {open && history.length > 0 && (
          <ul className={css.historyList}>
            {history.map((h, i) => (
              <li key={`${h}-${i}`} className={css.historyItem} onMouseDown={() => handleHistoryClick(h)}>
                {h}
              </li>
            ))}
          </ul>
        )}
      </form>
      {message && <p className={css.message}>{message}</p>}
      <p className={css.hint}>You can also browse categories manually below.</p>
    </div>
  );
};

export default SmartSearchBox;
